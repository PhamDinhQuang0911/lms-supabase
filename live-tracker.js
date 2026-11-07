/**
 * live-tracker.js
 * Hệ thống đồng bộ Trạng thái Phòng thi Trực tiếp (Live Exam Monitor & Parent Watch)
 * Hoạt động song song qua Supabase Realtime (Presence + Broadcast) và bảng exam_attempts.
 * Thiết kế Fail-Safe: Mọi lỗi mạng đều được bắt gọn, tuyệt đối không làm gián đoạn bài thi của học sinh.
 */
(function (global) {
    'use strict';

    const HEARTBEAT_INTERVAL_MS = 15000;
    const DB_DEBOUNCE_MS = 3500;
    const BROADCAST_THROTTLE_MS = 1200;

    function detectDeviceLabel() {
        try {
            const ua = navigator.userAgent || '';
            const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
            let os = 'Web';
            if (/Windows/i.test(ua)) os = 'Windows';
            else if (/Mac OS/i.test(ua)) os = 'macOS';
            else if (/Android/i.test(ua)) os = 'Android';
            else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
            return (isMobile ? '📱 ' : '💻 ') + os;
        } catch (e) {
            return '💻 Web';
        }
    }

    function playWarningSound() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            [0, 0.22, 0.44].forEach((offset) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.value = 880;
                gain.gain.setValueAtTime(0.18, ctx.currentTime + offset);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + offset);
                osc.stop(ctx.currentTime + offset + 0.18);
            });
        } catch (e) {}
    }

    function showTeacherWarningBanner(message, teacherName) {
        try {
            playWarningSound();
            let modal = document.getElementById('qmath-live-teacher-warn-modal');
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = 'qmath-live-teacher-warn-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .2s ease-out;';
            modal.innerHTML = `
                <div style="background:#fff;max-width:440px;width:100%;border-radius:20px;padding:24px;box-shadow:0 25px 50px -12px rgba(220,38,38,0.45);border:2px solid #ef4444;text-align:center;font-family:Inter,sans-serif;">
                    <div style="width:60px;height:60px;border-radius:50%;background:#fee2e2;color:#dc2626;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:28px;">
                        ⚠️
                    </div>
                    <h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:0.03em;">
                        Nhắc nhở từ Giáo viên coi thi
                    </h3>
                    <p style="margin:0 0 12px;font-size:12px;color:#64748b;font-weight:600;">
                        ${teacherName ? ('Giáo viên: ' + teacherName) : 'Hệ thống giám sát phòng thi trực tiếp'}
                    </p>
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:15px;font-weight:700;color:#7f1d1d;line-height:1.5;">
                        ${String(message || 'Vui lòng tập trung làm bài nghiêm túc, không rời khỏi màn hình thi!').replace(/</g, '&lt;')}
                    </div>
                    <button id="qmath-live-warn-ack-btn" style="width:100%;padding:12px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 8px 20px -4px rgba(220,38,38,0.5);">
                        Em đã hiểu và tiếp tục làm bài
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
            const btn = document.getElementById('qmath-live-warn-ack-btn');
            if (btn) btn.onclick = () => modal.remove();
        } catch (e) {}
    }

    function showExtraTimeToast(addedMinutes) {
        try {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:12px 22px;border-radius:999px;font-weight:800;font-size:14px;box-shadow:0 12px 28px rgba(16,185,129,0.4);display:flex;align-items:center;gap:10px;font-family:Inter,sans-serif;';
            toast.innerHTML = `<span>⏱️</span><span>Giáo viên vừa cộng thêm <b>+${addedMinutes} phút</b> làm bài cho bạn!</span>`;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.4s';
                setTimeout(() => toast.remove(), 450);
            }, 4500);
        } catch (e) {}
    }

    const LiveTracker = {
        active: false,
        attemptId: null,
        examId: null,
        examTitle: '',
        studentId: null,
        studentName: '',
        sbd: '',
        classId: '',
        className: '',
        parentWatchToken: '',
        watchUrl: '',
        channel: null,
        heartbeatTimer: null,
        debounceTimer: null,
        lastBroadcastAt: 0,
        lastExecutedCmdId: null,
        callbacks: {
            onWarn: null,
            onExtendTime: null,
            onForceSubmit: null,
            getTimeLeftSec: null
        },
        state: {
            status: 'doing',
            startedAt: null,
            submittedAt: null,
            lastHeartbeat: null,
            currentIndex: 0,
            answeredCount: 0,
            totalQuestions: 0,
            flaggedCount: 0,
            cheatCount: 0,
            timeLeftSec: 0,
            extraTimeSec: 0,
            device: detectDeviceLabel(),
            answers: {},
            briefNotes: {},
            answeredMap: {},
            events: []
        },

        async resolveStudentClass({ studentId, studentEmail = '', allowedClassIds = [] }) {
            if (!studentId || !window.getDocs || !window.collection) return { classId: '', className: '' };
            try {
                const snap = await window.getDocs(window.collection(window.db, 'classes'));
                let matchedClass = null;
                snap.forEach((docSnap) => {
                    if (matchedClass) return;
                    const c = docSnap.data() || {};
                    const cid = docSnap.id;
                    if (Array.isArray(allowedClassIds) && allowedClassIds.length > 0 && !allowedClassIds.includes(cid)) {
                        return;
                    }
                    const sIds = Array.isArray(c.studentIds) ? c.studentIds : [];
                    const stArr = Array.isArray(c.students) ? c.students : [];
                    const inIds = sIds.includes(studentId);
                    const inArr = stArr.some((s) => s && (s.uid === studentId || (studentEmail && s.email && s.email.toLowerCase() === studentEmail.toLowerCase())));
                    if (inIds || inArr) {
                        matchedClass = { classId: cid, className: c.name || 'Lớp học' };
                    }
                });
                if (!matchedClass && Array.isArray(allowedClassIds) && allowedClassIds.length === 1) {
                    const cSnap = await window.getDoc(window.doc(window.db, 'classes', allowedClassIds[0]));
                    if (cSnap && cSnap.exists()) {
                        matchedClass = { classId: cSnap.id, className: cSnap.data().name || 'Lớp học' };
                    }
                }
                return matchedClass || { classId: (allowedClassIds && allowedClassIds[0]) || '', className: '' };
            } catch (e) {
                return { classId: (allowedClassIds && allowedClassIds[0]) || '', className: '' };
            }
        },

        async start(opts = {}) {
            try {
                this.stop();
                this.examId = opts.examId || '';
                this.examTitle = opts.examTitle || 'Bài kiểm tra';
                this.studentId = opts.studentId || '';
                this.studentName = opts.studentName || 'Học sinh';
                this.sbd = opts.sbd || '';
                if (!this.examId || !this.studentId) return;

                this.attemptId = opts.attemptId || `${this.studentId}_${this.examId}`;
                this.callbacks.onWarn = opts.onWarn || null;
                this.callbacks.onExtendTime = opts.onExtendTime || null;
                this.callbacks.onForceSubmit = opts.onForceSubmit || null;
                this.callbacks.getTimeLeftSec = opts.getTimeLeftSec || null;

                // Xác định lớp của học sinh
                if (opts.classId) {
                    this.classId = opts.classId;
                    this.className = opts.className || '';
                } else {
                    const resolved = await this.resolveStudentClass({
                        studentId: this.studentId,
                        studentEmail: opts.studentEmail || '',
                        allowedClassIds: opts.allowedClassIds || []
                    });
                    this.classId = resolved.classId || '';
                    this.className = resolved.className || '';
                }

                // Khởi tạo trạng thái
                const nowIso = new Date().toISOString();
                this.state = {
                    status: 'doing',
                    startedAt: opts.startedAt || nowIso,
                    submittedAt: null,
                    lastHeartbeat: nowIso,
                    currentIndex: Number(opts.currentIndex) || 0,
                    answeredCount: Number(opts.answeredCount) || 0,
                    totalQuestions: Number(opts.totalQuestions) || 0,
                    flaggedCount: Number(opts.flaggedCount) || 0,
                    cheatCount: Number(opts.cheatCount) || 0,
                    timeLeftSec: Number(opts.timeLeftSec) || 0,
                    extraTimeSec: Number(opts.extraTimeSec) || 0,
                    device: detectDeviceLabel(),
                    answers: opts.answers || {},
                    briefNotes: opts.briefNotes || {},
                    answeredMap: opts.answeredMap || {},
                    events: Array.isArray(opts.events) && opts.events.length > 0
                        ? opts.events
                        : [{ type: 'join', at: nowIso, detail: 'Bắt đầu vào phòng thi (' + detectDeviceLabel() + ')' }]
                };

                // Khởi tạo Parent Watch Token cho phụ huynh
                if (typeof window.getOrCreateParentWatchToken === 'function') {
                    this.parentWatchToken = await window.getOrCreateParentWatchToken({
                        studentId: this.studentId,
                        studentName: this.studentName,
                        classId: this.classId,
                        className: this.className,
                        examId: this.examId,
                        examTitle: this.examTitle
                    }) || '';
                }
                if (this.parentWatchToken) {
                    const origin = (window.location && window.location.origin && window.location.origin !== 'null')
                        ? window.location.origin
                        : 'https://qmath.io.vn';
                    this.watchUrl = `${origin}/parent-watch.html?t=${encodeURIComponent(this.parentWatchToken)}&exam=${encodeURIComponent(this.examId)}`;
                }

                this.active = true;

                // Ghi trạng thái khởi tạo vào exam_attempts
                await this.flushToDb(true);

                // Kết nối kênh Realtime của phòng thi
                this.connectRealtimeChannel();

                // Bắt đầu vòng lặp Heartbeat 15s
                this.heartbeatTimer = setInterval(() => {
                    if (!this.active) return;
                    if (typeof this.callbacks.getTimeLeftSec === 'function') {
                        const tl = Number(this.callbacks.getTimeLeftSec());
                        if (!isNaN(tl)) this.state.timeLeftSec = tl;
                    }
                    this.flushToDb(false);
                    this.broadcastProgress(true);
                }, HEARTBEAT_INTERVAL_MS);

            } catch (e) {
                console.warn('[LiveTracker.start] Ignored non-critical error:', e);
            }
        },

        connectRealtimeChannel() {
            try {
                const sb = window.supabase;
                if (!sb || typeof sb.channel !== 'function' || !this.examId) return;

                if (this.channel) {
                    try { sb.removeChannel(this.channel); } catch (e) {}
                }

                const channelName = `exam-live:${this.examId}`;
                this.channel = sb.channel(channelName, {
                    config: {
                        presence: { key: this.studentId },
                        broadcast: { ack: false }
                    }
                });

                this.channel
                    .on('broadcast', { event: 'teacher_cmd' }, (payload) => {
                        const data = payload && payload.payload ? payload.payload : payload;
                        this.handleTeacherCommand(data);
                    })
                    .subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            try {
                                await this.channel.track({
                                    studentId: this.studentId,
                                    studentName: this.studentName,
                                    classId: this.classId,
                                    status: this.state.status,
                                    onlineAt: new Date().toISOString()
                                });
                                this.broadcastProgress(true);
                            } catch (e) {}
                        }
                    });
            } catch (e) {
                console.warn('[LiveTracker.connectRealtimeChannel] Error:', e);
            }
        },

        handleTeacherCommand(cmd) {
            try {
                if (!cmd || !this.active) return;
                const target = cmd.targetStudentId || cmd.studentId || 'ALL';
                if (target !== 'ALL' && target !== this.studentId) return;

                const cmdId = cmd.cmdId || `${cmd.action}_${cmd.issuedAt || ''}`;
                if (cmdId && this.lastExecutedCmdId === cmdId) return;
                this.lastExecutedCmdId = cmdId;

                const action = cmd.action || cmd.type;
                if (action === 'warn') {
                    const msg = cmd.message || 'Vui lòng tập trung làm bài nghiêm túc!';
                    showTeacherWarningBanner(msg, cmd.teacherName || 'Giáo viên');
                    if (typeof this.callbacks.onWarn === 'function') {
                        this.callbacks.onWarn(msg, cmd);
                    }
                    this.recordEvent('teacher_warn', `GV nhắc nhở: ${msg}`);
                } else if (action === 'extend') {
                    const addSec = Number(cmd.extraSeconds) || (Number(cmd.extraMinutes || 5) * 60);
                    if (addSec > 0) {
                        this.state.extraTimeSec = (Number(this.state.extraTimeSec) || 0) + addSec;
                        if (typeof this.callbacks.onExtendTime === 'function') {
                            this.callbacks.onExtendTime(addSec, cmd);
                        }
                        showExtraTimeToast(Math.round(addSec / 60));
                        this.recordEvent('teacher_extend', `GV cộng thêm +${Math.round(addSec / 60)} phút`);
                        this.flushToDb(false);
                    }
                } else if (action === 'force_submit') {
                    this.recordEvent('teacher_force_submit', 'Giáo viên thu bài từ xa');
                    if (typeof this.callbacks.onForceSubmit === 'function') {
                        this.callbacks.onForceSubmit(cmd);
                    }
                }
            } catch (e) {
                console.warn('[LiveTracker.handleTeacherCommand] Error:', e);
            }
        },

        progress(patch = {}) {
            if (!this.active) return;
            try {
                if (patch.currentIndex !== undefined) this.state.currentIndex = Number(patch.currentIndex) || 0;
                if (patch.answeredCount !== undefined) this.state.answeredCount = Number(patch.answeredCount) || 0;
                if (patch.totalQuestions !== undefined) this.state.totalQuestions = Number(patch.totalQuestions) || this.state.totalQuestions;
                if (patch.flaggedCount !== undefined) this.state.flaggedCount = Number(patch.flaggedCount) || 0;
                if (patch.cheatCount !== undefined) this.state.cheatCount = Number(patch.cheatCount) || 0;
                if (patch.timeLeftSec !== undefined) this.state.timeLeftSec = Number(patch.timeLeftSec) || 0;
                if (patch.answers !== undefined) this.state.answers = patch.answers;
                if (patch.briefNotes !== undefined) this.state.briefNotes = patch.briefNotes;
                if (patch.answeredMap !== undefined) this.state.answeredMap = patch.answeredMap;

                this.broadcastProgress(false);
                this.scheduleDbFlush();
            } catch (e) {}
        },

        violation(eventType = 'tab_blur', detailText = 'Rời màn hình làm bài', cheatCountVal = null) {
            if (!this.active) return;
            try {
                if (cheatCountVal !== null && cheatCountVal !== undefined) {
                    this.state.cheatCount = Number(cheatCountVal) || 0;
                } else {
                    this.state.cheatCount = (Number(this.state.cheatCount) || 0) + 1;
                }
                const ev = this.recordEvent(eventType, detailText);
                // Gửi Broadcast ngay lập tức cho Giáo viên
                if (this.channel) {
                    try {
                        this.channel.send({
                            type: 'broadcast',
                            event: 'student_violation',
                            payload: {
                                examId: this.examId,
                                studentId: this.studentId,
                                studentName: this.studentName,
                                classId: this.classId,
                                cheatCount: this.state.cheatCount,
                                event: ev
                            }
                        });
                    } catch (e) {}
                }
                this.flushToDb(false);
            } catch (e) {}
        },

        recordEvent(type, detail) {
            const ev = {
                type: type || 'info',
                at: new Date().toISOString(),
                detail: detail || ''
            };
            if (!Array.isArray(this.state.events)) this.state.events = [];
            this.state.events.push(ev);
            if (this.state.events.length > 60) {
                this.state.events = this.state.events.slice(-60);
            }
            return ev;
        },

        broadcastProgress(force = false) {
            if (!this.active || !this.channel) return;
            const now = Date.now();
            if (!force && (now - this.lastBroadcastAt < BROADCAST_THROTTLE_MS)) return;
            this.lastBroadcastAt = now;

            try {
                if (typeof this.callbacks.getTimeLeftSec === 'function') {
                    const tl = Number(this.callbacks.getTimeLeftSec());
                    if (!isNaN(tl)) this.state.timeLeftSec = tl;
                }
                this.channel.send({
                    type: 'broadcast',
                    event: 'student_progress',
                    payload: {
                        attemptId: this.attemptId,
                        examId: this.examId,
                        studentId: this.studentId,
                        studentName: this.studentName,
                        sbd: this.sbd,
                        classId: this.classId,
                        className: this.className,
                        status: this.state.status,
                        currentIndex: this.state.currentIndex,
                        answeredCount: this.state.answeredCount,
                        totalQuestions: this.state.totalQuestions,
                        flaggedCount: this.state.flaggedCount,
                        cheatCount: this.state.cheatCount,
                        timeLeftSec: this.state.timeLeftSec,
                        extraTimeSec: this.state.extraTimeSec,
                        device: this.state.device,
                        answeredMap: this.state.answeredMap,
                        lastHeartbeat: new Date().toISOString(),
                        parentWatchToken: this.parentWatchToken
                    }
                });
            } catch (e) {}
        },

        scheduleDbFlush() {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.flushToDb(false);
            }, DB_DEBOUNCE_MS);
        },

        async flushToDb(isInitial = false) {
            if (!this.examId || !this.studentId || !window.setDoc || !window.doc) return;
            try {
                const nowIso = new Date().toISOString();
                this.state.lastHeartbeat = nowIso;
                if (typeof this.callbacks.getTimeLeftSec === 'function' && this.state.status === 'doing') {
                    const tl = Number(this.callbacks.getTimeLeftSec());
                    if (!isNaN(tl)) this.state.timeLeftSec = tl;
                }

                const ref = window.doc(window.db, 'exam_attempts', this.attemptId);

                // Kiểm tra xem có lệnh mới từ GV lưu trong DB không (dự phòng khi rớt gói Broadcast)
                if (!isInitial && this.active && window.getDoc) {
                    try {
                        const snap = await window.getDoc(ref);
                        if (snap && snap.exists()) {
                            const existing = snap.data();
                            if (existing && existing.teacherCommand && existing.teacherCommand.cmdId !== this.lastExecutedCmdId) {
                                this.handleTeacherCommand(existing.teacherCommand);
                            }
                        }
                    } catch (e) {}
                }

                const payload = {
                    examId: this.examId,
                    examTitle: this.examTitle,
                    studentId: this.studentId,
                    studentName: this.studentName,
                    sbd: this.sbd,
                    classId: this.classId,
                    className: this.className,
                    status: this.state.status,
                    startedAt: this.state.startedAt,
                    submittedAt: this.state.submittedAt,
                    lastHeartbeat: nowIso,
                    lastUpdated: nowIso,
                    currentIndex: this.state.currentIndex,
                    answeredCount: this.state.answeredCount,
                    totalQuestions: this.state.totalQuestions,
                    flaggedCount: this.state.flaggedCount,
                    cheatCount: this.state.cheatCount,
                    timeLeftSec: this.state.timeLeftSec,
                    extraTimeSec: this.state.extraTimeSec,
                    device: this.state.device,
                    answeredMap: this.state.answeredMap,
                    parentWatchToken: this.parentWatchToken,
                    watchUrl: this.watchUrl,
                    events: this.state.events,
                    answers: this.state.answers,
                    briefNotes: this.state.briefNotes
                };

                await window.setDoc(ref, payload, { merge: true });
            } catch (e) {
                console.warn('[LiveTracker.flushToDb] Non-critical error:', e);
            }
        },

        async submit(summary = {}) {
            try {
                const nowIso = new Date().toISOString();
                this.state.status = 'submitted';
                this.state.submittedAt = nowIso;
                this.state.lastHeartbeat = nowIso;
                this.state.timeLeftSec = 0;
                if (summary.answeredCount !== undefined) this.state.answeredCount = summary.answeredCount;
                if (summary.totalQuestions !== undefined) this.state.totalQuestions = summary.totalQuestions;
                if (summary.cheatCount !== undefined) this.state.cheatCount = summary.cheatCount;

                const scoreText = (summary.score !== undefined && summary.score !== null)
                    ? `Điểm: ${summary.score}`
                    : 'Đã hoàn thành';
                this.recordEvent('submit', `Nộp bài thành công (${scoreText})`);

                if (this.channel) {
                    try {
                        await this.channel.send({
                            type: 'broadcast',
                            event: 'student_submit',
                            payload: {
                                attemptId: this.attemptId,
                                examId: this.examId,
                                studentId: this.studentId,
                                studentName: this.studentName,
                                classId: this.classId,
                                status: 'submitted',
                                submittedAt: nowIso,
                                score: summary.score,
                                correctCount: summary.correctCount,
                                totalQuestions: this.state.totalQuestions,
                                answeredCount: this.state.answeredCount,
                                cheatCount: this.state.cheatCount
                            }
                        });
                    } catch (e) {}
                }

                if (this.examId && this.studentId && window.setDoc && window.doc) {
                    const ref = window.doc(window.db, 'exam_attempts', this.attemptId);
                    await window.setDoc(ref, {
                        examId: this.examId,
                        examTitle: this.examTitle,
                        studentId: this.studentId,
                        studentName: this.studentName,
                        sbd: this.sbd,
                        classId: this.classId,
                        className: this.className,
                        status: 'submitted',
                        submittedAt: nowIso,
                        lastHeartbeat: nowIso,
                        lastUpdated: nowIso,
                        score: summary.score ?? null,
                        correctCount: summary.correctCount ?? null,
                        totalQuestions: this.state.totalQuestions,
                        answeredCount: this.state.answeredCount,
                        cheatCount: this.state.cheatCount,
                        timeLeftSec: 0,
                        resultId: summary.resultId || null,
                        parentWatchToken: this.parentWatchToken,
                        watchUrl: this.watchUrl,
                        events: this.state.events
                    }, { merge: true });
                }
            } catch (e) {
                console.warn('[LiveTracker.submit] Non-critical error:', e);
            } finally {
                this.stop();
            }
        },

        stop() {
            this.active = false;
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
            }
            if (this.channel && window.supabase) {
                try { window.supabase.removeChannel(this.channel); } catch (e) {}
                this.channel = null;
            }
        }
    };

    global.LiveTracker = LiveTracker;
})(typeof window !== 'undefined' ? window : this);
