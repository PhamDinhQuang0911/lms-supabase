/**
 * QMath Security Shield v4 (Cơ chế Chặn Chụp Màn Hình & Cảnh Báo Vi Phạm Bản Quyền Nâng Cao)
 * - Tùy chọn Bật/Tắt theo từng Khu vực (Bảng xếp hạng, Tra cứu ID, Lời giải, Phòng thi, Khóa học).
 * - Phân quyền Bật/Tắt theo Đề thi (exams), Lớp học (classes) và Khóa học (public_courses).
 * - Nhận diện Context thời gian thực: chỉ chặn khi khu vực/đề/lớp đang BẬT cấm chụp.
 * - Chặn trực tiếp phím tắt chụp màn hình (PrintScreen, Win+Shift+S, Mac Cmd+Shift+3/4/5, Ctrl+P).
 * - Chặn cử chỉ vuốt 3 ngón tay trên màn hình điện thoại (thao tác chụp màn hình Android/iOS).
 * - Tự động hiển thị Modal Cảnh Báo Vi Phạm Bản Quyền khi phát hiện hành vi chụp.
 * - Xóa sạch clipboard, ngăn chặn bôi đen và sao chép nội dung.
 * - Tuyệt đối KHÔNG dùng màn hình đen, KHÔNG làm ảnh hưởng đến thao tác vuốt chạm thông thường.
 */
(function() {
    'use strict';

    // 1. CẤU HÌNH BẢO MẬT & API TOÀN CỤC
    const DEFAULT_CONFIG = {
        globalEnabled: true,
        zones: {
            leaderboard: true,   // Bảng xếp hạng
            lookup: true,        // Tra cứu câu hỏi theo ID
            solution: true,      // Xem lời giải chi tiết
            examRoom: true,      // Phòng làm bài thi
            coursePlayer: true   // Bài giảng & tài liệu khóa học
        }
    };

    // Đọc cache cấu hình từ localStorage
    let currentConfig = { ...DEFAULT_CONFIG };
    try {
        const cached = localStorage.getItem('qmath_security_config');
        if (cached) {
            const parsed = JSON.parse(cached);
            currentConfig.globalEnabled = parsed.globalEnabled !== false;
            currentConfig.zones = { ...DEFAULT_CONFIG.zones, ...(parsed.zones || {}) };
        }
    } catch (_) {}

    const securityContext = {
        examId: null,
        antiScreenshot: null, // true | false | null
        classId: null,
        courseId: null,
        zone: null,
        studentClasses: []
    };

    window.QMathSecurity = {
        config: currentConfig,
        currentContext: securityContext,

        // Cập nhật cấu hình động
        updateConfig(newConfig) {
            if (!newConfig) return;
            if (typeof newConfig.globalEnabled === 'boolean') {
                this.config.globalEnabled = newConfig.globalEnabled;
            }
            if (newConfig.zones && typeof newConfig.zones === 'object') {
                this.config.zones = { ...this.config.zones, ...newConfig.zones };
            }
            try {
                localStorage.setItem('qmath_security_config', JSON.stringify(this.config));
            } catch (_) {}
        },

        // Gán ngữ cảnh hiện tại (Đề thi, Khóa học, Lớp học, Khu vực)
        setContext(ctx) {
            if (!ctx || typeof ctx !== 'object') return;
            Object.assign(this.currentContext, ctx);
        },

        // Lưu danh sách lớp của học sinh
        setStudentClasses(classes) {
            if (Array.isArray(classes)) {
                this.currentContext.studentClasses = classes;
            }
        },

        // Kiểm tra xem hiện tại có đang bị CẤM chụp hay không
        isAntiScreenshotActive() {
            // 1. Kiểm tra công tắc toàn cục
            if (this.config.globalEnabled === false) return false;

            // 2. Miễn trừ cho Giáo viên / Super Admin khi đang thao tác ở các trang quản trị
            try {
                const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
                if (userStr) {
                    const u = JSON.parse(userStr);
                    if (u && (u.role === 'teacher' || u.role === 'admin' || u.role === 'super_admin')) {
                        const path = window.location.pathname.toLowerCase();
                        if (path.includes('dashboard') || path.includes('exam-editor') || path.includes('course-manager')) {
                            return false;
                        }
                    }
                }
            } catch (_) {}

            // 3. Kiểm tra theo từng Khu vực (Zones)
            // A. Bảng xếp hạng
            const lbModal = document.getElementById('examLeaderboardModal');
            const isLbVisible = lbModal && !lbModal.classList.contains('hidden') && !lbModal.classList.contains('opacity-0');
            if (isLbVisible) {
                return this.config.zones.leaderboard !== false;
            }

            // B. Tra cứu câu hỏi theo ID
            const lookupModal = document.getElementById('studentQuestionLookupModal');
            const isLookupVisible = lookupModal && !lookupModal.classList.contains('pointer-events-none') && !lookupModal.classList.contains('opacity-0');
            if (isLookupVisible) {
                return this.config.zones.lookup !== false;
            }

            // C. Lời giải chi tiết
            const solView = document.getElementById('solutionView');
            const isSolVisible = solView && !solView.classList.contains('hidden');
            if (isSolVisible) {
                if (this.config.zones.solution === false) return false;
                // Nếu đề thi cụ thể cho phép chụp ảnh -> Không chặn
                if (this.currentContext.antiScreenshot === false) return false;
                return true;
            }

            // D. Bài giảng khóa học (course-player.html)
            const isCoursePlayerPage = window.location.pathname.toLowerCase().includes('course-player') || this.currentContext.zone === 'coursePlayer';
            if (isCoursePlayerPage) {
                if (this.config.zones.coursePlayer === false) return false;
                if (this.currentContext.antiScreenshot === false) return false;
                return true;
            }

            // E. Phòng thi / Làm bài trực tuyến (exam.html / practice.html)
            const isExamPage = window.location.pathname.toLowerCase().includes('exam') || window.location.pathname.toLowerCase().includes('practice') || this.currentContext.zone === 'examRoom';
            if (isExamPage) {
                if (this.config.zones.examRoom === false) return false;
                // Nếu đề thi cụ thể cho phép chụp ảnh -> Không chặn
                if (this.currentContext.antiScreenshot === false) return false;

                // Nếu học sinh thuộc lớp cấm chụp -> Chặn
                if (this.currentContext.studentClasses && this.currentContext.studentClasses.length > 0) {
                    const matchedClass = this.currentContext.classId 
                        ? this.currentContext.studentClasses.find(c => c && c.id === this.currentContext.classId)
                        : null;
                    if (matchedClass && matchedClass.antiScreenshot === false) return false;
                }
                return true;
            }

            // F. Kiểm tra theo Lớp học cụ thể
            if (this.currentContext.classId && this.currentContext.studentClasses) {
                const cl = this.currentContext.studentClasses.find(c => c && c.id === this.currentContext.classId);
                if (cl && cl.antiScreenshot === false) return false;
                if (cl && cl.antiScreenshot === true) return true;
            }

            // G. Đề thi hoặc Khóa học cụ thể đặt cấm/cho phép
            if (this.currentContext.antiScreenshot === false) return false;
            if (this.currentContext.antiScreenshot === true) return true;

            // Mặc định ở các vùng khác
            return true;
        },

        triggerViolationAlert(reason) {
            triggerViolationAlert(reason);
        }
    };

    // Tự động lắng nghe cấu hình site_settings/security_config từ Supabase / Firestore nếu có kết nối
    function trySyncFirestoreConfig() {
        if (typeof window.supabase !== 'undefined') {
            try {
                window.supabase.from('site_settings').select('value').eq('key', 'security_config').maybeSingle().then(({ data }) => {
                    if (data && data.value) {
                        window.QMathSecurity.updateConfig(data.value);
                    }
                }).catch(() => {});
            } catch(e) {}
        }
        if (typeof window.firebaseDb !== 'undefined' || typeof window.db !== 'undefined') {
            const dbInstance = window.firebaseDb || window.db;
            const docFn = window.firestoreDoc || window.doc;
            const getDocFn = window.firestoreGetDoc || window.getDoc;
            if (dbInstance && typeof getDocFn === 'function' && typeof docFn === 'function') {
                getDocFn(docFn(dbInstance, "site_settings", "security_config")).then(snap => {
                    if (snap && snap.exists && snap.exists()) {
                        window.QMathSecurity.updateConfig(snap.data());
                    }
                }).catch(() => {});
            }
        }
    }
    setTimeout(trySyncFirestoreConfig, 1200);

    // 2. TỰ ĐỘNG CHÈN CSS VÀ MODAL CẢNH BÁO VI PHẠM
    function initSecurityShieldUI() {
        if (document.getElementById('qmath-security-shield-style')) return;

        const style = document.createElement('style');
        style.id = 'qmath-security-shield-style';
        style.textContent = `
            #examLeaderboardBox, #lookupModalBody, #solutionView {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
            @media print {
                body { display: none !important; }
            }
            #copyrightViolationModal {
                transition: opacity 0.25s ease-out;
            }
            #copyrightViolationModal .violation-box {
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
        `;
        document.head.appendChild(style);

        if (!document.getElementById('copyrightViolationModal')) {
            const modalHtml = `
            <div id="copyrightViolationModal" class="fixed inset-0 z-[2147483647] flex items-center justify-center bg-gray-950/80 backdrop-blur-md hidden opacity-0 p-4 select-none pointer-events-auto">
                <div class="violation-box bg-white dark:bg-[#1e1b2e] rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl transform scale-90 border-2 border-red-500/80 relative">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl sm:text-4xl border border-red-200 dark:border-red-800 animate-pulse">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h3 class="text-lg sm:text-xl font-black text-red-600 dark:text-red-400 uppercase tracking-tight mb-2">Cảnh báo vi phạm bản quyền!</h3>
                    <p class="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium mb-5" id="copyrightViolationMsg">
                        Hệ thống phát hiện hành vi chụp màn hình hoặc sao chép nội dung được bảo vệ. Hành vi này đã bị chặn và ghi nhận vi phạm!
                    </p>
                    <button id="btnDismissCopyrightViolation" type="button" class="w-full py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-lg shadow-red-500/25 transition-all transform active:scale-95 cursor-pointer">
                        Tôi đã hiểu & Cam kết tuân thủ
                    </button>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const btnClose = document.getElementById('btnDismissCopyrightViolation');
            if (btnClose) {
                btnClose.addEventListener('click', closeViolationModal);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSecurityShieldUI);
    } else {
        initSecurityShieldUI();
    }

    let isModalOpen = false;
    let lastViolationTime = 0;

    // 3. HIỂN THỊ MODAL CẢNH BÁO VI PHẠM
    function triggerViolationAlert(reason) {
        const now = Date.now();
        if (now - lastViolationTime < 1500) return; // Debounce 1.5s
        lastViolationTime = now;

        // Xóa clipboard ngay lập tức
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('');
            }
        } catch (_) {}

        const modal = document.getElementById('copyrightViolationModal');
        if (!modal) return;

        const msgEl = document.getElementById('copyrightViolationMsg');
        if (msgEl && reason) {
            msgEl.textContent = reason;
        }

        isModalOpen = true;
        modal.classList.remove('hidden');
        setTimeout(function() {
            modal.classList.remove('opacity-0');
            const box = modal.querySelector('.violation-box');
            if (box) box.classList.remove('scale-90');
        }, 10);
    }

    function closeViolationModal() {
        const modal = document.getElementById('copyrightViolationModal');
        if (!modal) return;
        modal.classList.add('opacity-0');
        const box = modal.querySelector('.violation-box');
        if (box) box.classList.add('scale-90');
        setTimeout(function() {
            modal.classList.add('hidden');
            isModalOpen = false;
        }, 250);
    }

    // 4. CHẶN PHÍM TẮT CHỤP MÀN HÌNH (PrintScreen, Win+Shift+S, Mac Cmd+Shift+3/4/5, Ctrl+P)
    document.addEventListener('keydown', function(e) {
        const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
        const isPrint = (e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P');
        const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5', 's'].indexOf(e.key.toLowerCase()) !== -1;

        if (isPrintScreen || isPrint || isMacScreenshot) {
            // Kiểm tra xem hiện tại có đang bị cấm chụp hay không
            if (!window.QMathSecurity.isAntiScreenshotActive()) {
                return true; // Cho phép chụp ảnh bình thường!
            }

            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống đã chặn thao tác phím chụp màn hình. Nội dung được bảo vệ bản quyền!');
            return false;
        }
    }, true);

    document.addEventListener('keyup', function(e) {
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            if (!window.QMathSecurity.isAntiScreenshotActive()) {
                return true;
            }
            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống đã chặn thao tác chụp màn hình (PrintScreen). Nội dung được bảo vệ bản quyền!');
        }
    }, true);

    // 5. CHẶN CỬ CHỈ VUỐT 3 NGÓN TAY CHỤP MÀN HÌNH TRÊN ĐIỆN THOẠI
    window.addEventListener('touchstart', function(e) {
        if (e.touches && e.touches.length >= 3) {
            if (!window.QMathSecurity.isAntiScreenshotActive()) {
                return; // Cho phép cử chỉ
            }
            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống phát hiện cử chỉ vuốt 3 ngón tay để chụp màn hình. Thao tác đã bị chặn!');
        }
    }, { capture: true, passive: false });

    window.addEventListener('touchmove', function(e) {
        if (e.touches && e.touches.length >= 3) {
            if (!window.QMathSecurity.isAntiScreenshotActive()) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống phát hiện cử chỉ vuốt 3 ngón tay để chụp màn hình. Thao tác đã bị chặn!');
        }
    }, { capture: true, passive: false });

    // 6. THEO DÕI HÀNH VI RỜI KHỎI TRÌNH DUYỆT KHI ĐANG MỞ VÙNG BẢO VỆ
    function isInsideProtectedZoneDOM() {
        const lbModal = document.getElementById('examLeaderboardModal');
        if (lbModal && !lbModal.classList.contains('hidden') && !lbModal.classList.contains('opacity-0')) return true;

        const lookupModal = document.getElementById('studentQuestionLookupModal');
        if (lookupModal && !lookupModal.classList.contains('pointer-events-none') && !lookupModal.classList.contains('opacity-0')) return true;

        const solView = document.getElementById('solutionView');
        if (solView && !solView.classList.contains('hidden')) return true;

        return false;
    }

    let leaveTimestamp = 0;
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            if (window.QMathSecurity.isAntiScreenshotActive() && isInsideProtectedZoneDOM()) {
                leaveTimestamp = Date.now();
            }
        } else if (document.visibilityState === 'visible') {
            if (leaveTimestamp > 0) {
                const elapsed = Date.now() - leaveTimestamp;
                leaveTimestamp = 0;
                if (elapsed >= 250 && elapsed <= 4000) {
                    if (window.QMathSecurity.isAntiScreenshotActive()) {
                        triggerViolationAlert('Hệ thống phát hiện hành vi rời màn hình hoặc chụp ảnh phím cứng trong khu vực được bảo vệ!');
                    }
                }
            }
        }
    });

    // 7. CHỐNG CHUỘT PHẢI VÀ CHỐNG COPY TRONG VÙNG BẢO MẬT
    document.addEventListener('contextmenu', function(e) {
        const tag = e.target ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;

        if (window.QMathSecurity.isAntiScreenshotActive() && isInsideProtectedZoneDOM()) {
            e.preventDefault();
            return false;
        }
    });

    document.addEventListener('copy', function(e) {
        const tag = e.target ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;

        if (window.QMathSecurity.isAntiScreenshotActive() && isInsideProtectedZoneDOM()) {
            e.preventDefault();
            if (e.clipboardData) {
                e.clipboardData.setData('text/plain', '');
            }
            triggerViolationAlert('Hành vi sao chép nội dung bài thi / lời giải đã bị chặn!');
            return false;
        }
    });
})();
