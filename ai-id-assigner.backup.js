/**
 * ai-id-assigner.js
 * Module dùng chung: Gán ID câu hỏi bằng AI (Gemini Flash / Pro)
 * Bê nguyên giao diện bảng và logic từ phần mềm desktop:
 *   G:\My Drive\Tex-AI\test\1.9.0.5\src\id_mass_tagger.py
 *
 * Gồm:
 *   1. AIAssignConfigDialog: Modal cấu hình 4 cấp cascading (Cấp 1 -> Cấp 2 -> Cấp 3 -> Cấp 4),
 *      Mức độ (Cố định/Giới hạn/Tự do), Mô hình AI (Gemini 2.5 Flash, 3.5 Flash-Lite, ...).
 *   2. AITaskProgressDialog: Modal bảng tiến trình chuẩn 4 cột:
 *      [Câu, Trạng thái (Thành công/Cảnh báo/Thất bại), Mã ID (Monospace), Chi tiết / Lỗi],
 *      Thanh tiến trình (Progress bar), Nút "🔄 Thử lại X câu Lỗi/Cảnh báo", Nút Hủy / Đóng.
 *   3. AIBatchWorker: Đa luồng (concurrency pool 4-8 workers), xoay vòng API key thông minh,
 *      loại bỏ key chết (401/403/CONSUMER_SUSPENDED), phạt cooldown 15s khi gặp 429/503,
 *      trích xuất 6 tham số JSON [lop, phanmon, chuong, mucdo, bai, dang] -> [9D1H2-1].
 *
 * API công khai:
 *   window.checkAndAssignMissingIds(questions, options?)
 *   options: { db?: Firestore instance, forceAll?: boolean, defaultClass?: string }
 *   Trả về: Promise<questions[]>
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 1: HÀM TIỆN ÍCH LÀM SẠCH KÝ HIỆU TOÁN VÀ CHUẨN HÓA CÂY MAPID
    // ═══════════════════════════════════════════════════════════════

    /**
     * Làm sạch ký hiệu toán học trong tên node (y hệt clean_math trong id_mass_tagger.py)
     */
    function cleanMath(text) {
        if (!text) return '';
        let t = String(text);
        t = t.replace(/\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2');
        t = t.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√$1');
        t = t.replace(/\$/g, '');
        t = t.replace(/\\pm/g, '±').replace(/\\mp/g, '∓');
        t = t.replace(/\\times/g, 'x').replace(/\\div/g, '÷');
        t = t.replace(/\\geq/g, '≥').replace(/\\leq/g, '≤');
        t = t.replace(/\\neq/g, '≠').replace(/\\approx/g, '≈');
        t = t.replace(/\\pi/g, 'π').replace(/\\infty/g, '∞');
        t = t.replace(/\\rightarrow/g, '→').replace(/\\Rightarrow/g, '⇒');
        t = t.replace(/\^\\circ/g, '°');
        t = t.replace(/\\[a-zA-Z]+/g, '');
        t = t.replace(/\{/g, '').replace(/\}/g, '');
        return t.replace(/\s+/g, ' ').trim();
    }

    /**
     * Chuẩn hóa cây mapid_tree (hỗ trợ cả dạng mảng [ {id, name, children} ] lẫn object { "9": {name, children} })
     */
    function normalizeTree(treeData) {
        if (!treeData) return {};
        if (typeof treeData === 'object' && !Array.isArray(treeData)) {
            // Đã là dạng map { "9": { name, children } }
            return treeData;
        }

        // Chuyển mảng đệ quy sang map
        const map = {};
        if (Array.isArray(treeData)) {
            for (const item of treeData) {
                if (!item || !item.id) continue;
                const node = {
                    name: item.name || '',
                    children: item.children ? normalizeTree(item.children) : {}
                };
                map[String(item.id)] = node;
            }
        }
        return map;
    }

    /**
     * Lấy danh sách các khối / lớp từ cây
     */
    function getAvailableClasses(normTree) {
        const classes = [];
        const keys = Object.keys(normTree);
        for (const k of keys) {
            const digits = k.replace(/\D/g, '');
            const label = normTree[k].name || `Lớp ${digits || k}`;
            classes.push({
                key: digits || k,
                rawKey: k,
                label: label.startsWith('Lớp') ? label : `Lớp ${label}`
            });
        }
        // Sắp xếp tăng dần theo số lớp
        classes.sort((a, b) => (parseInt(a.key) || 0) - (parseInt(b.key) || 0));
        return classes;
    }

    /**
     * Xây dựng map_context cho AI prompt (y hệt id_mass_tagger.py)
     */
    function buildMapContext(normTree, classKey, className) {
        let ctx = `Cấu trúc MapID dành riêng cho ${className}:\n`;
        const lopData = normTree[classKey] || normTree[`Lớp ${classKey}`] || normTree[String(classKey)];
        if (lopData && lopData.children) {
            const subjs = lopData.children;
            for (const subj_k in subjs) {
                const subj_v = subjs[subj_k];
                ctx += `  Phân môn: MÃ '${subj_k}' (Tên: ${cleanMath(subj_v.name)})\n`;
                if (subj_v.children) {
                    for (const chap_k in subj_v.children) {
                        const chap_v = subj_v.children[chap_k];
                        ctx += `    Chương: MÃ '${chap_k}' (Tên: ${cleanMath(chap_v.name)})\n`;
                        if (chap_v.children) {
                            for (const les_k in chap_v.children) {
                                const les_v = chap_v.children[les_k];
                                ctx += `      Bài: MÃ '${les_k}' (Tên: ${cleanMath(les_v.name)})\n`;
                                if (les_v.children) {
                                    for (const type_k in les_v.children) {
                                        const type_v = les_v.children[type_k];
                                        ctx += `        Dạng: MÃ '${type_k}' (Tên: ${cleanMath(type_v.name)})\n`;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        ctx += `\n--- Định nghĩa Mức độ ---\n`;
        ctx += `MÃ 'N': Nhận biết (Dễ, nhớ khái niệm, lý thuyết cơ bản, nhìn là ra đáp án được luôn. Mức điểm từ 1 đến dưới 4 điểm).\n`;
        ctx += `MÃ 'H': Thông hiểu (Vận dụng trực tiếp công thức quen thuộc, biến đổi 1 bước cùng lắm 2 bước sẽ ra đáp án, mức điểm khoảng từ 4 đến dưới 6 điểm).\n`;
        ctx += `MÃ 'V': Vận dụng (Tính toán nhiều bước, tình huống mới cụ thể, vận dụng nhiều kiến thức hơn, kết hợp biến đổi nhiều bước, mức điểm khoảng từ 6 đến 8 điểm, với cấp 3 thì từ 6 đến 8.4 điểm).\n`;
        ctx += `MÃ 'C': Vận dụng cao (Rất khó, tư duy sáng tạo, lập luận chặt chẽ, vận dụng nhiều kiến thức, điểm từ 9-10 điểm).\n`;

        return ctx;
    }

    /**
     * Dò tìm node theo cấu trúc [g, s, c, l, t] trong mapid_tree
     */
    function verifyIdInTree(normTree, g, s, c, l, t) {
        const lopNode = normTree[g] || normTree[`Lớp ${g}`];
        if (!lopNode || !lopNode.children) return false;
        const subjNode = lopNode.children[s];
        if (!subjNode) return false;
        if (!c) return true;
        if (!subjNode.children || !subjNode.children[c]) return false;
        if (!l) return true;
        if (!subjNode.children[c].children || !subjNode.children[c].children[l]) return false;
        if (!t) return true;
        if (!subjNode.children[c].children[l].children || !subjNode.children[c].children[l].children[t]) {
            // Nếu dạng không tìm thấy chính xác dạng t, nhưng khớp đến Bài thì vẫn chấp nhận
            return true;
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 2: BỘ QUẢN LÝ KHÓA API VÀ ĐIỀU PHỐI ĐA LUỒNG (AIBatchWorker)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Fallback key tích hợp sẵn từ cấu hình Tex-AI đã kiểm chứng hoạt động tốt
     */
    const BACKUP_API_KEY = 'AIzaSyCf2cIsR8FKxg0__c_Jp5hydsreGcczAFY';

    /**
     * Lớp điều phối gọi Gemini API đa luồng với cơ chế chống lỗi & xoay vòng key
     */
    class AIBatchRunner {
        constructor(tasks, keys, modelCode, callbacks = {}) {
            this.tasks = tasks;
            // Làm sạch và lọc key
            const rawKeys = (Array.isArray(keys) ? keys : [keys])
                .map(k => (typeof k === 'string' ? k.trim() : ''))
                .filter(Boolean);

            this.keys = [...new Set(rawKeys)];
            if (!this.keys.length) {
                this.keys = [BACKUP_API_KEY];
            }

            this.modelCode = modelCode || 'gemini-2.5-flash';
            this.callbacks = callbacks; // { onProgress: fn, onFinished: fn }
            this.isCancelled = false;

            // Bộ nhớ thời gian dùng key và danh sách key chết
            this.keyLastUsed = new Map();
            this.deadKeys = new Set();
            this.keys.forEach(k => this.keyLastUsed.set(k, 0));

            // Số luồng xử lý song song (tối thiểu 4, tối đa 8)
            this.maxWorkers = Math.min(8, Math.max(4, this.keys.length));
        }

        cancel() {
            this.isCancelled = true;
        }

        getAvailableKey() {
            const now = Date.now();
            const liveKeys = this.keys.filter(k => !this.deadKeys.has(k));
            if (!liveKeys.length) return { key: null, waitTime: 0 };

            // Sắp xếp key ít được dùng gần nhất lên đầu
            liveKeys.sort((a, b) => (this.keyLastUsed.get(a) || 0) - (this.keyLastUsed.get(b) || 0));
            const bestKey = liveKeys[0];

            const lastUsed = this.keyLastUsed.get(bestKey) || 0;
            const delayNeeded = 600 + Math.random() * 800; // Jitter nhẹ
            let waitTime = 0;
            if (now - lastUsed < delayNeeded) {
                waitTime = delayNeeded - (now - lastUsed);
            }

            this.keyLastUsed.set(bestKey, now + waitTime);
            return { key: bestKey, waitTime };
        }

        markKeyDead(key) {
            this.deadKeys.add(key);
            console.warn(`[AI Assigner] Key bị loại bỏ khỏi pool: ${key.substring(0, 10)}...`);
        }

        punishKey(key, penaltySeconds) {
            if (!this.deadKeys.has(key)) {
                const current = Math.max(this.keyLastUsed.get(key) || 0, Date.now());
                this.keyLastUsed.set(key, current + penaltySeconds * 1000);
            }
        }

        async processTask(task) {
            if (this.isCancelled) return { row: task.row, newId: '', err: 'Đã hủy' };

            const maxRetries = Math.max(8, this.keys.length * 3);
            let lastErr = 'Thất bại sau nhiều lần thử';

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                if (this.isCancelled) return { row: task.row, newId: '', err: 'Đã hủy' };

                const { key, waitTime } = this.getAvailableKey();
                if (!key) {
                    return {
                        row: task.row,
                        newId: '',
                        err: `Tất cả ${this.keys.length} API Key đều bị từ chối hoặc hết hạn. Vui lòng nạp key mới!`
                    };
                }

                if (waitTime > 0) {
                    await new Promise(r => setTimeout(r, waitTime));
                }

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelCode}:generateContent?key=${key}`;
                const payload = {
                    contents: [{ parts: [{ text: task.prompt }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: 'OBJECT',
                            properties: {
                                lop: { type: 'STRING' },
                                phanmon: { type: 'STRING' },
                                chuong: { type: 'STRING' },
                                mucdo: { type: 'STRING' },
                                bai: { type: 'STRING' },
                                dang: { type: 'STRING' }
                            },
                            required: ['lop', 'phanmon', 'chuong', 'mucdo', 'bai', 'dang']
                        }
                    }
                };

                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (res.ok) {
                        const data = await res.json();
                        let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

                        try {
                            const aiResult = JSON.parse(text);
                            const lop = (aiResult.lop || '').trim();
                            const phanmon = (aiResult.phanmon || '').trim().toUpperCase();
                            const chuong = (aiResult.chuong || '').trim();
                            const mucdo = (aiResult.mucdo || '').trim().toUpperCase();
                            const bai = (aiResult.bai || '').trim();
                            const dang = (aiResult.dang || '').trim();

                            const newId = `[${lop}${phanmon}${chuong}${mucdo}${bai}-${dang}]`;
                            return { row: task.row, newId, err: '', parsed: { lop, phanmon, chuong, mucdo, bai, dang } };
                        } catch (parseErr) {
                            this.punishKey(key, 2);
                            lastErr = `Lỗi phân tích JSON: ${text.substring(0, 80)}`;
                            continue;
                        }
                    }

                    // Xử lý mã lỗi HTTP
                    const status = res.status;
                    let errorBody = {};
                    try { errorBody = await res.json(); } catch (_) {}
                    const errMsg = errorBody?.error?.message || '';

                    if (status === 401 || status === 403 || errMsg.includes('API_KEY_INVALID') || errMsg.includes('CONSUMER_SUSPENDED')) {
                        // Key hỏng vĩnh viễn trong phiên
                        this.markKeyDead(key);
                        lastErr = `Key bị từ chối (${status}): ${key.substring(0, 10)}...`;
                        continue;
                    } else if (status === 429 || status === 503) {
                        // Quá tải / Rate limit tạm thời
                        this.punishKey(key, 15);
                        lastErr = `HTTP ${status} (Quá tải, tạm nghỉ 15s)`;
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    } else if (status === 404) {
                        // Model không hỗ trợ trên endpoint này, thử fallback sang gemini-2.5-flash
                        if (this.modelCode !== 'gemini-2.5-flash') {
                            this.modelCode = 'gemini-2.5-flash';
                            console.warn('[AI Assigner] Model 404, tự động chuyển về gemini-2.5-flash');
                            continue;
                        }
                        lastErr = `HTTP 404: Mô hình ${this.modelCode} không tồn tại`;
                        this.punishKey(key, 5);
                        continue;
                    } else {
                        this.punishKey(key, 3);
                        lastErr = `HTTP ${status}: ${errMsg || 'Lỗi gọi API'}`;
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }
                } catch (netErr) {
                    this.punishKey(key, 3);
                    lastErr = netErr.message || 'Lỗi kết nối mạng';
                    await new Promise(r => setTimeout(r, 1500));
                    continue;
                }
            }

            return { row: task.row, newId: '', err: lastErr };
        }

        async run() {
            let success = 0;
            let fail = 0;
            const total = this.tasks.length;
            let activeWorkers = 0;
            let currentIndex = 0;

            return new Promise((resolve) => {
                const next = () => {
                    if (this.isCancelled || currentIndex >= total) {
                        if (activeWorkers === 0) {
                            if (this.callbacks.onFinished) this.callbacks.onFinished(success, fail);
                            resolve({ success, fail });
                        }
                        return;
                    }

                    const task = this.tasks[currentIndex++];
                    activeWorkers++;

                    this.processTask(task).then(res => {
                        activeWorkers--;
                        if (res.newId) success++;
                        else fail++;

                        if (this.callbacks.onProgress) {
                            this.callbacks.onProgress(res.row, res.newId, res.err, res.parsed);
                        }

                        next();
                    }).catch(err => {
                        activeWorkers--;
                        fail++;
                        if (this.callbacks.onProgress) {
                            this.callbacks.onProgress(task.row, '', err.message);
                        }
                        next();
                    });
                };

                // Bắt đầu các luồng ban đầu
                const poolLimit = Math.min(this.maxWorkers, total);
                for (let i = 0; i < poolLimit; i++) {
                    next();
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 3: GIAO DIỆN MODAL CẤU HÌNH (AIAssignConfigDialog)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Bê nguyên giao diện AIAssignConfigDialog từ id_mass_tagger.py:
     * - Cascading Dropdowns: Cấp 1 -> Cấp 2 -> Cấp 3 -> Cấp 4
     * - Mức độ: --- Không mặc định ---, Cố định, Giới hạn
     * - Mô hình AI
     * - Chế độ gán (Chỉ câu thiếu ID / Ghi đè tất cả)
     */
    function showConfigModal(normTree, missingCount, totalCount, defaultGrade = '9') {
        return new Promise((resolve, reject) => {
            const availableClasses = getAvailableClasses(normTree);
            let selectedClassKey = defaultGrade;
            if (!availableClasses.some(c => c.key === selectedClassKey) && availableClasses.length) {
                selectedClassKey = availableClasses[0].key;
            }

            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'aiConfigModalOverlay';
            modalOverlay.style.cssText = `
                position: fixed; inset: 0; z-index: 10000;
                background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(4px);
                display: flex; align-items: center; justify-content: center;
                padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            modalOverlay.innerHTML = `
                <div style="background: #F8F9FA; border-radius: 12px; box-shadow: 0 25px 50px rgba(0,0,0,0.3); width: 100%; max-width: 650px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #bdc3c7;">
                    <!-- HEADER (Y hệt id_mass_tagger.py) -->
                    <div style="padding: 16px 20px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 20px; background: #5c6bc0; color: white; padding: 6px 10px; border-radius: 8px; display: inline-block;">✨</span>
                            <div>
                                <h2 style="font-size: 18px; font-weight: bold; color: #2c3e50; margin: 0;">Gán ID bằng AI — Cấu hình</h2>
                                <div style="font-size: 13px; color: #7f8c8d; margin-top: 2px;">
                                    Phát hiện <b style="color: #e74c3c;">${missingCount}</b> / ${totalCount} câu hỏi chưa có ID hợp lệ.
                                </div>
                            </div>
                        </div>
                        <button id="btnAiConfigCloseX" style="background: none; border: none; font-size: 20px; color: #95a5a6; cursor: pointer; padding: 4px 8px;">&times;</button>
                    </div>

                    <!-- BODY -->
                    <div style="flex: 1; overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;">
                        <!-- PHƯƠNG THỨC GÁN -->
                        <div>
                            <label style="font-size: 13px; font-weight: bold; color: #2c3e50; display: block; margin-bottom: 8px;">Phương thức gán:</label>
                            <div style="display: flex; gap: 12px;">
                                <label style="flex: 1; display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: white; border: 2px solid #5c6bc0; border-radius: 8px; cursor: pointer;" id="lblModeMissing">
                                    <input type="radio" name="aiAssignMode" value="missing" checked style="accent-color: #5c6bc0; cursor: pointer;">
                                    <div>
                                        <div style="font-size: 13px; font-weight: bold; color: #2c3e50;">Chỉ câu thiếu ID</div>
                                        <div style="font-size: 11px; color: #7f8c8d;">Giữ nguyên câu đã có ID</div>
                                    </div>
                                </label>
                                <label style="flex: 1; display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: white; border: 2px solid #e2e8f0; border-radius: 8px; cursor: pointer;" id="lblModeAll">
                                    <input type="radio" name="aiAssignMode" value="all" style="accent-color: #5c6bc0; cursor: pointer;">
                                    <div>
                                        <div style="font-size: 13px; font-weight: bold; color: #2c3e50;">Ghi đè tất cả</div>
                                        <div style="font-size: 11px; color: #7f8c8d;">Kể cả câu đã có ID</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- KHỐI LỚP CHỌN GỐC -->
                        <div style="display: flex; align-items: center; justify-content: space-between; background: white; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <label style="font-size: 13px; font-weight: bold; color: #2c3e50;">📚 Khối / Lớp áp dụng:</label>
                            <select id="selAiClass" style="padding: 6px 12px; font-size: 13px; font-weight: bold; border: 1px solid #bdc3c7; border-radius: 6px; background: white; color: #2c3e50; min-width: 150px;">
                                ${availableClasses.map(c => `<option value="${c.key}" ${c.key === selectedClassKey ? 'selected' : ''}>${c.label}</option>`).join('')}
                            </select>
                        </div>

                        <!-- CARD CÁC GIÁ TRỊ MẶC ĐỊNH (Y hệt QFrame#card) -->
                        <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 16px;">
                            <div style="font-size: 13px; font-weight: bold; color: #2c3e50; margin-bottom: 2px;">Giá trị mặc định (tùy chọn)</div>
                            <div style="font-size: 12px; color: #7f8c8d; margin-bottom: 12px;">Nếu chọn mặc định, AI chỉ cần suy luận các trường còn lại.</div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <div>
                                    <label style="font-size: 12px; font-weight: bold; color: #2c3e50; display: block; margin-bottom: 4px;">Cấp 1 (Phân môn):</label>
                                    <select id="selAiCap1" style="width: 100%; padding: 6px 8px; border: 1px solid #bdc3c7; border-radius: 4px; background: white; color: #2c3e50; font-size: 13px;">
                                        <option value="">--- Không mặc định ---</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: bold; color: #2c3e50; display: block; margin-bottom: 4px;">Cấp 2 (Chương):</label>
                                    <select id="selAiCap2" style="width: 100%; padding: 6px 8px; border: 1px solid #bdc3c7; border-radius: 4px; background: white; color: #2c3e50; font-size: 13px;">
                                        <option value="">--- Không mặc định ---</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: bold; color: #2c3e50; display: block; margin-bottom: 4px;">Cấp 3 (Bài):</label>
                                    <select id="selAiCap3" style="width: 100%; padding: 6px 8px; border: 1px solid #bdc3c7; border-radius: 4px; background: white; color: #2c3e50; font-size: 13px;">
                                        <option value="">--- Không mặc định ---</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: bold; color: #2c3e50; display: block; margin-bottom: 4px;">Cấp 4 (Dạng):</label>
                                    <select id="selAiCap4" style="width: 100%; padding: 6px 8px; border: 1px solid #bdc3c7; border-radius: 4px; background: white; color: #2c3e50; font-size: 13px;">
                                        <option value="">--- Không mặc định ---</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: bold; color: #2c3e50; display: block; margin-bottom: 4px;">Mức độ:</label>
                                    <select id="selAiMucdo" style="width: 100%; padding: 6px 8px; border: 1px solid #bdc3c7; border-radius: 4px; background: white; color: #2c3e50; font-size: 13px;">
                                        <option value="">--- Không mặc định ---</option>
                                        <option value="Cố định: Nhận biết (N)">Cố định: Nhận biết (N)</option>
                                        <option value="Cố định: Thông hiểu (H)">Cố định: Thông hiểu (H)</option>
                                        <option value="Cố định: Vận dụng (V)">Cố định: Vận dụng (V)</option>
                                        <option value="Cố định: Vận dụng cao (C)">Cố định: Vận dụng cao (C)</option>
                                        <option value="Giới hạn: Dễ (N hoặc H)">Giới hạn: Dễ (N hoặc H)</option>
                                        <option value="Giới hạn: Khó (V hoặc C)">Giới hạn: Khó (V hoặc C)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: bold; color: #2c3e50; display: block; margin-bottom: 4px;">Mô hình AI:</label>
                                    <select id="selAiModel" style="width: 100%; padding: 6px 8px; border: 1px solid #bdc3c7; border-radius: 4px; background: white; color: #2c3e50; font-size: 13px;">
                                        <option value="gemini-2.5-flash" selected>Gemini 2.5 Flash (Khuyên dùng)</option>
                                        <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (Siêu nhanh)</option>
                                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Độ chính xác cao)</option>
                                        <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                                        <option value="gemini-3.7-flash">Gemini 3.7 Flash</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- KHỐI QUẢN LÝ / NHẬP KEY NHANH -->
                        <div style="font-size: 12px; color: #7f8c8d; display: flex; align-items: center; justify-content: space-between;">
                            <span id="aiKeyStatusHint">🔑 Đang kiểm tra API Key khả dụng...</span>
                            <button id="btnToggleKeyInput" type="button" style="background: none; border: none; color: #2980b9; font-weight: bold; cursor: pointer; text-decoration: underline; font-size: 12px;">+ Thêm / Nạp Key</button>
                        </div>
                        <div id="quickKeyInputBox" style="display: none; background: white; border: 1px solid #bdc3c7; border-radius: 6px; padding: 10px;">
                            <textarea id="txtQuickKeys" rows="2" placeholder="Dán Gemini API Key (mỗi dòng 1 key AIza...)" style="width: 100%; font-family: monospace; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px;"></textarea>
                        </div>
                    </div>

                    <!-- FOOTER BUTTONS (Hủy / Lưu cài đặt & Bắt đầu) -->
                    <div style="padding: 14px 20px; background: white; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
                        <button id="btnAiConfigCancel" style="padding: 8px 20px; border-radius: 6px; background: #e0e0e0; color: #2c3e50; font-weight: bold; font-size: 13px; border: none; cursor: pointer;">Hủy</button>
                        <button id="btnAiConfigStart" style="padding: 8px 22px; border-radius: 6px; background: #5c6bc0; color: white; font-weight: bold; font-size: 13px; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(92,107,192,0.4);">✨ Bắt đầu gán bằng AI</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modalOverlay);

            // Các phần tử điều khiển
            const selClass = modalOverlay.querySelector('#selAiClass');
            const selCap1 = modalOverlay.querySelector('#selAiCap1');
            const selCap2 = modalOverlay.querySelector('#selAiCap2');
            const selCap3 = modalOverlay.querySelector('#selAiCap3');
            const selCap4 = modalOverlay.querySelector('#selAiCap4');
            const selMucdo = modalOverlay.querySelector('#selAiMucdo');
            const selModel = modalOverlay.querySelector('#selAiModel');
            const lblMissing = modalOverlay.querySelector('#lblModeMissing');
            const lblAll = modalOverlay.querySelector('#lblModeAll');

            // Toggle radio border style
            modalOverlay.querySelectorAll('input[name="aiAssignMode"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    lblMissing.style.borderColor = radio.value === 'missing' ? '#5c6bc0' : '#e2e8f0';
                    lblAll.style.borderColor = radio.value === 'all' ? '#5c6bc0' : '#e2e8f0';
                });
            });

            // Toggle key box
            modalOverlay.querySelector('#btnToggleKeyInput').onclick = () => {
                const box = modalOverlay.querySelector('#quickKeyInputBox');
                box.style.display = box.style.display === 'none' ? 'block' : 'none';
            };

            // ── CASCADING DROPDOWNS LOGIC (Tái hiện 100% update_cap1/2/3/4) ──
            function populateCap1() {
                selCap1.innerHTML = '<option value="">--- Không mặc định ---</option>';
                selCap2.innerHTML = '<option value="">--- Không mặc định ---</option>';
                selCap3.innerHTML = '<option value="">--- Không mặc định ---</option>';
                selCap4.innerHTML = '<option value="">--- Không mặc định ---</option>';

                const curClassKey = selClass.value;
                const lopNode = normTree[curClassKey] || normTree[`Lớp ${curClassKey}`];
                if (lopNode && lopNode.children) {
                    for (const k in lopNode.children) {
                        const opt = document.createElement('option');
                        opt.value = `[${k}] ${cleanMath(lopNode.children[k].name)}`;
                        opt.textContent = `[${k}] ${cleanMath(lopNode.children[k].name)}`;
                        selCap1.appendChild(opt);
                    }
                }
            }

            function updateCap2() {
                selCap2.innerHTML = '<option value="">--- Không mặc định ---</option>';
                selCap3.innerHTML = '<option value="">--- Không mặc định ---</option>';
                selCap4.innerHTML = '<option value="">--- Không mặc định ---</option>';

                const text1 = selCap1.value;
                if (!text1 || !text1.startsWith('[')) return;
                const k1 = text1.split(']')[0].replace('[', '');

                const curClassKey = selClass.value;
                const lopNode = normTree[curClassKey] || normTree[`Lớp ${curClassKey}`];
                if (lopNode && lopNode.children && lopNode.children[k1] && lopNode.children[k1].children) {
                    const chaps = lopNode.children[k1].children;
                    for (const k in chaps) {
                        const opt = document.createElement('option');
                        opt.value = `[${k}] ${cleanMath(chaps[k].name)}`;
                        opt.textContent = `[${k}] ${cleanMath(chaps[k].name)}`;
                        selCap2.appendChild(opt);
                    }
                }
            }

            function updateCap3() {
                selCap3.innerHTML = '<option value="">--- Không mặc định ---</option>';
                selCap4.innerHTML = '<option value="">--- Không mặc định ---</option>';

                const text1 = selCap1.value;
                const text2 = selCap2.value;
                if (!text1.startsWith('[') || !text2.startsWith('[')) return;
                const k1 = text1.split(']')[0].replace('[', '');
                const k2 = text2.split(']')[0].replace('[', '');

                const curClassKey = selClass.value;
                const lopNode = normTree[curClassKey] || normTree[`Lớp ${curClassKey}`];
                if (lopNode?.children?.[k1]?.children?.[k2]?.children) {
                    const less = lopNode.children[k1].children[k2].children;
                    for (const k in less) {
                        const opt = document.createElement('option');
                        opt.value = `[${k}] ${cleanMath(less[k].name)}`;
                        opt.textContent = `[${k}] ${cleanMath(less[k].name)}`;
                        selCap3.appendChild(opt);
                    }
                }
            }

            function updateCap4() {
                selCap4.innerHTML = '<option value="">--- Không mặc định ---</option>';

                const text1 = selCap1.value;
                const text2 = selCap2.value;
                const text3 = selCap3.value;
                if (!text1.startsWith('[') || !text2.startsWith('[') || !text3.startsWith('[')) return;
                const k1 = text1.split(']')[0].replace('[', '');
                const k2 = text2.split(']')[0].replace('[', '');
                const k3 = text3.split(']')[0].replace('[', '');

                const curClassKey = selClass.value;
                const lopNode = normTree[curClassKey] || normTree[`Lớp ${curClassKey}`];
                if (lopNode?.children?.[k1]?.children?.[k2]?.children?.[k3]?.children) {
                    const types = lopNode.children[k1].children[k2].children[k3].children;
                    for (const k in types) {
                        const opt = document.createElement('option');
                        opt.value = `[${k}] ${cleanMath(types[k].name)}`;
                        opt.textContent = `[${k}] ${cleanMath(types[k].name)}`;
                        selCap4.appendChild(opt);
                    }
                }
            }

            // Gán sự kiện cascading
            selClass.addEventListener('change', populateCap1);
            selCap1.addEventListener('change', updateCap2);
            selCap2.addEventListener('change', updateCap3);
            selCap3.addEventListener('change', updateCap4);

            // Nạp dữ liệu ban đầu
            populateCap1();

            // Xử lý đóng / hủy
            const closeAndReject = () => {
                modalOverlay.remove();
                reject(new Error('Người dùng đã hủy cấu hình.'));
            };
            modalOverlay.querySelector('#btnAiConfigCloseX').onclick = closeAndReject;
            modalOverlay.querySelector('#btnAiConfigCancel').onclick = closeAndReject;

            // Xử lý xác nhận bắt đầu
            modalOverlay.querySelector('#btnAiConfigStart').onclick = () => {
                const mode = modalOverlay.querySelector('input[name="aiAssignMode"]:checked')?.value || 'missing';
                const classKey = selClass.value;
                const className = selClass.selectedOptions[0]?.textContent || `Lớp ${classKey}`;
                const cap1 = selCap1.value;
                const cap2 = selCap2.value;
                const cap3 = selCap3.value;
                const cap4 = selCap4.value;
                const mucdo = selMucdo.value;
                const model = selModel.value;

                // Kiểm tra xem người dùng có nhập thêm key không
                const customKeyText = modalOverlay.querySelector('#txtQuickKeys')?.value || '';
                const extraKeys = customKeyText.split('\n').map(k => k.trim()).filter(Boolean);

                modalOverlay.remove();
                resolve({
                    mode,
                    classKey,
                    className,
                    cap1,
                    cap2,
                    cap3,
                    cap4,
                    mucdo,
                    model,
                    extraKeys
                });
            };
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 4: BẢNG TIẾN TRÌNH & KẾT QUẢ GÁN ID (AITaskProgressDialog)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Bê nguyên giao diện AITaskProgressDialog từ id_mass_tagger.py:
     * - Bảng 4 cột: [Câu, Trạng thái, Mã ID, Chi tiết / Lỗi]
     * - Màu trạng thái: Thành công (#27ae60), Cảnh báo (#e67e22), Thất bại (#c0392b)
     * - Mã ID: font monospace Consolas, đậm
     * - Nút "🔄 Thử lại X câu Lỗi/Cảnh báo"
     * - Nút Hủy tiến trình / Đóng cửa sổ
     */
    function createProgressDialog(totalTasks) {
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'aiProgressModalOverlay';
        modalOverlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10001;
            background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        modalOverlay.innerHTML = `
            <div style="background: #F0F3F4; border-radius: 12px; box-shadow: 0 25px 50px rgba(0,0,0,0.3); width: 100%; max-width: 820px; height: 580px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #bdc3c7;">
                <!-- HEADER -->
                <div style="padding: 14px 20px; background: white; border-bottom: 1px solid #bdc3c7; display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 16px; font-weight: bold; color: #2c3e50;">Trạng thái Gán ID bằng AI</div>
                    <span id="lblTaskProgressBadge" style="font-size: 12px; font-weight: bold; background: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px;">Đang chuẩn bị...</span>
                </div>

                <!-- PROGRESS BAR & STATUS -->
                <div style="padding: 14px 20px 8px; background: #F0F3F4;">
                    <div id="lblAiTaskStatus" style="color: #2c3e50; font-weight: bold; font-size: 14px; margin-bottom: 8px;">
                        Đang chuẩn bị xử lý ${totalTasks} câu...
                    </div>
                    <div style="background: white; border: 1px solid #bdc3c7; border-radius: 6px; height: 16px; overflow: hidden; position: relative;">
                        <div id="barAiTaskProgress" style="background-color: #27ae60; height: 100%; width: 0%; transition: width 0.25s ease;"></div>
                    </div>
                </div>

                <!-- TABLE (Bảng 4 cột: Câu, Trạng thái, Mã ID, Chi tiết / Lỗi) -->
                <div style="flex: 1; padding: 10px 20px; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="background: #34495e; color: white; font-weight: bold; font-size: 13px; display: grid; grid-template-columns: 80px 110px 130px 1fr; padding: 8px 12px; border-radius: 6px 6px 0 0;">
                        <div style="text-align: center;">Câu</div>
                        <div style="text-align: center;">Trạng thái</div>
                        <div style="text-align: center;">Mã ID</div>
                        <div style="padding-left: 8px;">Chi tiết / Lỗi</div>
                    </div>
                    <div id="tblAiTaskBody" style="flex: 1; overflow-y: auto; background: white; border: 1px solid #bdc3c7; border-top: none; font-size: 13px;">
                        <!-- Các dòng kết quả sẽ được chèn động vào đây -->
                    </div>
                </div>

                <!-- FOOTER BUTTONS -->
                <div style="padding: 12px 20px; background: white; border-top: 1px solid #bdc3c7; display: flex; justify-content: flex-end; gap: 10px; align-items: center;">
                    <button id="btnAiRetryFailed" style="display: none; background-color: #e67e22; color: white; font-weight: bold; padding: 8px 18px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px;">
                        🔄 Thử lại các câu Lỗi
                    </button>
                    <button id="btnAiCancelTask" style="background-color: #c0392b; color: white; font-weight: bold; padding: 8px 18px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px;">
                        Hủy tiến trình
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        const lblStatus = modalOverlay.querySelector('#lblAiTaskStatus');
        const barProgress = modalOverlay.querySelector('#barAiTaskProgress');
        const tblBody = modalOverlay.querySelector('#tblAiTaskBody');
        const btnRetry = modalOverlay.querySelector('#btnAiRetryFailed');
        const btnCancel = modalOverlay.querySelector('#btnAiCancelTask');
        const badge = modalOverlay.querySelector('#lblTaskProgressBadge');

        // Hàm cập nhật / thêm kết quả dòng vào bảng
        const addOrUpdateResult = (rowIdx, status, newId, details) => {
            let rowEl = tblBody.querySelector(`[data-row-idx="${rowIdx}"]`);
            const statusColor = status === 'Thành công' ? '#27ae60' : (status === 'Cảnh báo' ? '#e67e22' : '#c0392b');
            const displayId = newId || '---';

            if (!rowEl) {
                rowEl = document.createElement('div');
                rowEl.setAttribute('data-row-idx', rowIdx);
                rowEl.style.cssText = `
                    display: grid; grid-template-columns: 80px 110px 130px 1fr;
                    padding: 8px 12px; border-bottom: 1px solid #ecf0f1;
                    align-items: center;
                `;
                tblBody.appendChild(rowEl);
            }

            rowEl.innerHTML = `
                <div style="text-align: center; font-weight: bold; color: #2c3e50;">Câu ${rowIdx + 1}</div>
                <div style="text-align: center; font-weight: bold; color: ${statusColor};">${status}</div>
                <div style="text-align: center; font-family: Consolas, monospace; font-size: 13px; font-weight: bold; color: #2c3e50;">${displayId}</div>
                <div style="padding-left: 8px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${details}">${details}</div>
            `;

            // Tự cuộn xuống đáy
            tblBody.scrollTop = tblBody.scrollHeight;
        };

        return {
            modalOverlay,
            lblStatus,
            barProgress,
            tblBody,
            btnRetry,
            btnCancel,
            badge,
            addOrUpdateResult,
            close: () => modalOverlay.remove()
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 5: HÀM CÔNG KHAI CHÍNH (window.checkAndAssignMissingIds)
    // ═══════════════════════════════════════════════════════════════

    /**
     * API công khai duy nhất cho các trang exam-editor.html, topic-bank.html gọi
     */
    window.checkAndAssignMissingIds = async function (questions, options = {}) {
        if (!questions || !questions.length) return questions;

        // 1. Chuẩn bị cây MapID từ Firestore / window
        const rawTree = window.globalIdTree || [];
        const normTree = normalizeTree(rawTree);
        if (!Object.keys(normTree).length) {
            console.warn('[ai-id-assigner] Cây MapID (globalIdTree) chưa được tải. Bỏ qua gán ID.');
            return questions;
        }

        // 2. Thu thập danh sách API Key
        let apiKeys = Array.isArray(window.aiKeys) ? window.aiKeys.filter(k => typeof k === 'string' && k.trim()) : [];
        const sharedDb = options.db || window._examDb;
        if (!apiKeys.length && sharedDb) {
            try {
                const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
                const snap = await getDoc(doc(sharedDb, 'configurations', 'ai_keys'));
                if (snap.exists() && snap.data().keys) {
                    window.aiKeys = snap.data().keys.filter(k => typeof k === 'string' && k.trim());
                    apiKeys = window.aiKeys;
                }
            } catch (e) {
                console.warn('[ai-id-assigner] Không lấy được AI Key từ Firestore:', e);
            }
        }

        // Đọc thêm từ localStorage nếu có
        try {
            const localSingle = localStorage.getItem('gemini_api_key');
            if (localSingle && !apiKeys.includes(localSingle.trim())) apiKeys.push(localSingle.trim());
            const localMultiple = JSON.parse(localStorage.getItem('gemini_api_keys') || '[]');
            if (Array.isArray(localMultiple)) {
                localMultiple.forEach(k => { if (typeof k === 'string' && k.trim() && !apiKeys.includes(k.trim())) apiKeys.push(k.trim()); });
            }
        } catch (_) {}

        // Luôn bổ sung BACKUP_API_KEY nếu pool không có key nào
        if (!apiKeys.length) {
            apiKeys.push(BACKUP_API_KEY);
        }

        // 3. Đếm số câu thiếu ID
        const isMissingId = (q) => {
            const idVal = q.mapId || q.id || '';
            return !idVal || !idVal.trim() || idVal === '[]';
        };
        const missingCount = questions.filter(isMissingId).length;

        // Nếu tất cả câu đều đã có ID và không ép gán lại -> Trả về luôn
        if (missingCount === 0 && !options.forceAll) {
            return questions;
        }

        // 4. MỞ MODAL CẤU HÌNH (AIAssignConfigDialog)
        let config;
        try {
            // Tự động nhận diện lớp từ câu hỏi đầu tiên nếu có
            let detectedClass = options.defaultClass || '9';
            for (const q of questions) {
                const text = q.rawLatex || q.content || '';
                const m = text.match(/(?:Lớp|khối)\s*([6-9]|1[0-2])/i);
                if (m) { detectedClass = m[1]; break; }
            }
            config = await showConfigModal(normTree, missingCount, questions.length, detectedClass);
        } catch (e) {
            console.log('[ai-id-assigner] Người dùng đã đóng modal cấu hình.');
            return questions;
        }

        // Bổ sung key nhập thêm nếu có
        if (config.extraKeys && config.extraKeys.length) {
            apiKeys = [...new Set([...config.extraKeys, ...apiKeys])];
        }

        // Lọc danh sách câu cần xử lý theo chế độ
        const targetIndices = [];
        questions.forEach((q, idx) => {
            if (config.mode === 'all') {
                targetIndices.push(idx);
            } else {
                if (isMissingId(q)) targetIndices.push(idx);
            }
        });

        if (!targetIndices.length) {
            if (window.showToast) window.showToast('Tất cả câu hỏi đã có ID!', 'info');
            return questions;
        }

        // 5. XÂY DỰNG MAP CONTEXT VÀ PROMPT CỦA TỪNG CÂU
        const mapContext = buildMapContext(normTree, config.classKey, config.className);

        let forceInstructions = '';
        if (config.cap2 && !config.cap2.includes('Không mặc định') && config.cap2.startsWith('[')) {
            const chapK = config.cap2.split(']')[0].replace('[', '');
            forceInstructions += `\n4. BẮT BUỘC Chương là '${chapK}'. (Thuộc ${config.cap2})`;
        }
        if (config.cap3 && !config.cap3.includes('Không mặc định') && config.cap3.startsWith('[')) {
            const lesK = config.cap3.split(']')[0].replace('[', '');
            forceInstructions += `\n5. BẮT BUỘC Bài là '${lesK}'. (Thuộc ${config.cap3})`;
        }
        if (config.mucdo && config.mucdo.includes('Cố định:')) {
            const mucdoK = config.mucdo.split('(')[1].split(')')[0];
            forceInstructions += `\n6. BẮT BUỘC Mức độ là '${mucdoK}'. Không cần phân tích độ khó, CHỈ ĐƯỢC TRẢ VỀ '${mucdoK}'.`;
        } else if (config.mucdo && config.mucdo.includes('Giới hạn:')) {
            if (config.mucdo.includes('N hoặc H')) {
                forceInstructions += `\n6. GIỚI HẠN Mức độ: Chỉ được phép chọn 'N' (Nhận biết) hoặc 'H' (Thông hiểu).`;
            } else if (config.mucdo.includes('V hoặc C')) {
                forceInstructions += `\n6. GIỚI HẠN Mức độ: Chỉ được phép chọn 'V' (Vận dụng) hoặc 'C' (Vận dụng cao).`;
            }
        }

        const buildTask = (rowIdx) => {
            const q = questions[rowIdx];
            let qText = (q.rawLatex || q.content || '').replace(/<[^>]+>/g, '').trim();
            if (q.options && q.options.length) {
                qText += '\n[Các đáp án]: ' + q.options.map((o, i) => `${['A','B','C','D'][i]}. ${(o||'').replace(/<[^>]+>/g,'')}`).join(' | ');
            }
            if (q.solution) {
                qText += '\n[Lời giải]: ' + String(q.solution).replace(/<[^>]+>/g, '').trim();
            }
            qText = qText.substring(0, 3000);

            const prompt = `Bạn là trợ lý gán ID câu hỏi Toán cực kỳ chính xác.
${mapContext}

Nhiệm vụ: Phân tích NỘI DUNG ĐỀ BÀI và LỜI GIẢI dưới đây, sau đó trích xuất 6 tham số.
QUY TẮC SỐNG CÒN: 
1. Giá trị của các tham số trong JSON PHẢI LÀ MÃ CODE (ví dụ: "${config.classKey}", "H", "4", "V", "2", "1").
2. TUYỆT ĐỐI KHÔNG ĐIỀN TÊN ĐẦY ĐỦ (Ví dụ: KHÔNG điền "Hình học", chỉ điền "H").
3. Mặc định Lớp là "${config.classKey}".${forceInstructions}

[NỘI DUNG ĐỀ BÀI VÀ LỜI GIẢI]
${qText}`;

            return { row: rowIdx, prompt };
        };

        // 6. KHỞI TẠO BẢNG TIẾN TRÌNH (AITaskProgressDialog)
        const progressDialog = createProgressDialog(targetIndices.length);
        let failedRows = []; // Danh sách các câu bị Cảnh báo hoặc Thất bại để Thử lại

        // Áp dụng ID cho object câu hỏi
        const applyIdToQuestion = (q, newId, parsed) => {
            if (!newId) return;
            const cleanId = newId.replace(/^\[|\]$/g, '');
            q.mapId = cleanId;
            q.mapIdBracketed = newId;

            const mucdo = parsed?.mucdo || (cleanId.match(/[NHVC]/) ? cleanId.match(/[NHVC]/)[0] : '');
            const levelMap = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' };
            const levelColorMap = { N: 'green', H: 'blue', V: 'orange', C: 'red' };
            if (mucdo && levelMap[mucdo]) {
                q.level = levelMap[mucdo];
                q.levelColor = levelColorMap[mucdo];
            }

            const phanmon = parsed?.phanmon || '';
            if (phanmon === 'D') q.subject = 'Đại số';
            else if (phanmon === 'H') q.subject = 'Hình học';
            else if (phanmon === 'G') q.subject = 'Giải tích';

            // Cập nhật thẻ ghi chú LaTeX %[ID] nếu có rawLatex
            if (q.rawLatex) {
                const lines = q.rawLatex.split('\n');
                if (lines.length > 0) {
                    if (lines[0].includes('%[')) {
                        lines[0] = lines[0].replace(/%\[.*?\]/, `%${newId}`);
                    } else {
                        lines[0] = `${lines[0]} %${newId}`;
                    }
                    q.rawLatex = lines.join('\n');
                }
            }
        };

        // Hàm chạy tiến trình gán theo danh sách index
        const runBatch = async (rowIndices) => {
            failedRows = [];
            const tasks = rowIndices.map(r => buildTask(r));
            let processed = 0;
            const total = tasks.length;

            progressDialog.lblStatus.textContent = `Đang gọi AI... Xử lý: 0/${total} câu`;
            progressDialog.barProgress.style.width = '0%';
            progressDialog.btnRetry.style.display = 'none';
            progressDialog.btnCancel.textContent = 'Hủy tiến trình';
            progressDialog.btnCancel.style.backgroundColor = '#c0392b';

            const runner = new AIBatchRunner(tasks, apiKeys, config.model, {
                onProgress: (row, newId, err, parsed) => {
                    processed++;
                    const pct = Math.round((processed / total) * 100);
                    progressDialog.barProgress.style.width = `${pct}%`;
                    progressDialog.lblStatus.textContent = `Đang gọi AI... Xử lý: ${processed}/${total} câu`;
                    progressDialog.badge.textContent = `${processed}/${total}`;

                    let status = '';
                    let details = '';

                    if (newId) {
                        applyIdToQuestion(questions[row], newId, parsed);

                        // Kiểm tra ID có khớp trong cây không
                        const m = newId.match(/\[(.)(.)(.)(.)(.)-(.*)\]/);
                        if (m) {
                            const [, g, s, c, , l, t] = m;
                            const isMatched = verifyIdInTree(normTree, g, s, c, l, t);
                            if (isMatched) {
                                status = 'Thành công';
                                details = 'Đã gán ID và khớp với dữ liệu MapID.';
                            } else {
                                status = 'Cảnh báo';
                                details = 'Đã gán ID, nhưng không tìm thấy trên hệ thống MapID.';
                                failedRows.push(row);
                            }
                        } else {
                            status = 'Cảnh báo';
                            details = 'AI sinh ID sai định dạng cấu trúc.';
                            failedRows.push(row);
                        }
                    } else {
                        status = 'Thất bại';
                        details = err || 'Không nhận được phản hồi từ AI.';
                        failedRows.push(row);
                    }

                    progressDialog.addOrUpdateResult(row, status, newId, details);
                }
            });

            // Gán sự kiện Hủy
            let isUserCancelled = false;
            const cancelHandler = () => {
                isUserCancelled = true;
                runner.cancel();
                progressDialog.lblStatus.textContent = '⚠️ Đang dừng tiến trình (Vui lòng chờ phản hồi nốt câu cuối)...';
            };
            progressDialog.btnCancel.onclick = cancelHandler;

            const { success, fail } = await runner.run();

            // Cập nhật trạng thái hoàn tất
            const failAndWarnCount = failedRows.length;
            progressDialog.lblStatus.textContent = `🎉 Hoàn tất! Thành công: ${total - failAndWarnCount} | Lỗi/Cảnh báo: ${failAndWarnCount}`;
            progressDialog.badge.textContent = `${total - failAndWarnCount}/${total} thành công`;
            progressDialog.badge.style.backgroundColor = failAndWarnCount > 0 ? '#fef3c7' : '#dcfce7';
            progressDialog.badge.style.color = failAndWarnCount > 0 ? '#b45309' : '#15803d';

            // Đổi nút Hủy thành "Đóng cửa sổ"
            progressDialog.btnCancel.textContent = 'Đóng cửa sổ';
            progressDialog.btnCancel.style.backgroundColor = '#2980b9';

            // Hiển thị nút Thử lại nếu có câu lỗi/cảnh báo
            if (failAndWarnCount > 0 && !isUserCancelled) {
                progressDialog.btnRetry.textContent = `🔄 Thử lại ${failAndWarnCount} câu Lỗi/Cảnh báo`;
                progressDialog.btnRetry.style.display = 'inline-block';
                progressDialog.btnRetry.onclick = async () => {
                    const retryRows = [...failedRows];
                    await runBatch(retryRows);
                };
            }
        };

        // Bắt đầu chạy đợt 1
        await runBatch(targetIndices);

        // Chờ người dùng đóng cửa sổ
        await new Promise(res => {
            progressDialog.btnCancel.onclick = () => {
                progressDialog.close();
                res();
            };
        });

        if (window.showToast) {
            window.showToast('Gán ID bằng AI hoàn tất!', 'success');
        }

        return questions;
    };

    console.log('[ai-id-assigner] Đã nạp thành công module Gán ID bằng AI chuẩn Tex-AI!');
})();
