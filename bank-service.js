/**
 * ==============================================================================
 * BANK SERVICE - HỆ THỐNG QUẢN LÝ CCCD SỐ & NẠP NGÂN HÀNG CÂU HỎI TOÀN HỆ THỐNG
 * ==============================================================================
 * Dùng chung cho:
 * 1. Soạn thảo đề thi (exam-editor.html)
 * 2. Số hóa sách in & Sách ID (book-manager.js / book-manager.html)
 * 3. Xưởng chuyên đề & Cây ma trận (mapid-manager.js / dashboard-mapid.html)
 * 4. Ngân hàng câu hỏi R2 (dashboard.html)
 */

(function(global) {
    'use strict';
    const window = global;

    const WORKER_UPLOAD_URL = "https://upload-helper.phamngockhanh-942001.workers.dev/";
    const WORKER_BANK_URL = "https://upload-helper.phamngockhanh-942001.workers.dev/bank";
    const R2_CONFIG_URL = "https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev/cccd_config.json";
    const LOCAL_LAST_CCCD_KEY = 'last_generated_cccd';
    const LOCAL_BANK_CACHE_KEY = 'lms_cached_bank';
    const DEFAULT_START_CCCD = 10000001;

    let isAllocating = false;

    const BankService = {
        /**
         * Lấy mã CCCD lớn nhất hiện tại từ mọi nguồn (LocalStorage, Bank Cache, Cloudflare R2, Firestore)
         * Chuẩn hóa 8 chữ số (Bắt đầu từ 10000001, sức chứa 90 triệu câu hỏi)
         */
        async getMaxExistingCccd() {
            let maxFound = 10000000;

            // 1. Quét từ LocalStorage (0ms latency)
            try {
                const localLast = localStorage.getItem(LOCAL_LAST_CCCD_KEY);
                if (localLast) {
                    const parsed = parseInt(localLast, 10);
                    if (!isNaN(parsed) && parsed > maxFound) maxFound = parsed;
                }
            } catch(e) {}

            // 2. Quét từ Cache Ngân hàng cục bộ
            try {
                const cachedBank = localStorage.getItem(LOCAL_BANK_CACHE_KEY);
                if (cachedBank) {
                    const list = JSON.parse(cachedBank);
                    if (Array.isArray(list)) {
                        list.forEach(item => {
                            const num = parseInt(item.cccd || item.id, 10);
                            if (!isNaN(num) && num > maxFound && num < 999999999) {
                                maxFound = num;
                            }
                        });
                    }
                }
            } catch(e) {}

            // 3. Quét từ Cloudflare R2 config toàn cục
            try {
                const res = await Promise.race([
                    fetch(R2_CONFIG_URL + '?t=' + Date.now()),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
                ]);
                if (res && res.ok) {
                    const data = await res.json();
                    const r2Last = parseInt(data?.lastCccd, 10);
                    if (!isNaN(r2Last) && r2Last > maxFound) maxFound = r2Last;
                }
            } catch(e) {}

            // 4. Đồng bộ dự phòng từ Firestore (nếu có SDK và online)
            try {
                if ((window.firebaseDb || window.db) && (window.firestoreDoc || window.doc) && (window.firestoreGetDoc || window.getDoc) && navigator.onLine) {
                    const snap = await Promise.race([
                        (window.firestoreGetDoc || window.getDoc)((window.firestoreDoc || window.doc)((window.firebaseDb || window.db), "configurations", "cccd_generator")),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('fs_timeout')), 1500))
                    ]);
                    if (snap && snap.exists && snap.exists()) {
                        const fsLast = parseInt(snap.data()?.lastCccd, 10);
                        if (!isNaN(fsLast) && fsLast > maxFound) maxFound = fsLast;
                    }
                }
            } catch(e) {}

            return maxFound;
        },

        /**
         * Lấy mã CCCD tiếp theo có thể sử dụng (không tự động tăng bộ đếm)
         */
        async getNextAvailableCccd() {
            const maxVal = await this.getMaxExistingCccd();
            return maxVal + 1;
        },

        /**
         * CẤP PHÁT KHỐI MÃ CCCD DUY NHẤT (ĐẢM BẢO KHÔNG TRÙNG NHAU)
         * Cấp ra một dải gồm count số nguyên liên tiếp bắt đầu từ nextCccd
         * Cập nhật ngay bộ đếm lên LocalStorage, Cloudflare R2, Firestore.
         */
        async allocateCccdBatch(count, customStart = null) {
            if (!count || count <= 0) return { start: 0, end: 0, list: [] };

            while (isAllocating) {
                await new Promise(r => setTimeout(r, 50));
            }
            isAllocating = true;

            try {
                let startNum;
                if (customStart && typeof customStart === 'number' && customStart >= 10000000) {
                    startNum = customStart;
                } else {
                    const maxVal = await this.getMaxExistingCccd();
                    startNum = maxVal + 1;
                }

                const endNum = startNum + count - 1;
                const list = [];
                for (let i = startNum; i <= endNum; i++) {
                    list.push(String(i));
                }

                // Cập nhật bộ đếm mới nhất ngay lập tức
                await this.updateLatestCccdCounter(endNum);

                return {
                    start: startNum,
                    end: endNum,
                    list: list
                };
            } finally {
                isAllocating = false;
            }
        },

        /**
         * Cập nhật con số CCCD lớn nhất vào mọi bộ nhớ (LocalStorage + R2 Worker + Firestore)
         */
        async updateLatestCccdCounter(lastCccdNum) {
            if (!lastCccdNum || isNaN(lastCccdNum)) return;
            const strVal = String(lastCccdNum);

            // 1. LocalStorage
            try {
                localStorage.setItem(LOCAL_LAST_CCCD_KEY, strVal);
            } catch(e) {}

            // 2. Cloudflare R2 (Đa máy, Toàn cầu)
            try {
                const payload = { lastCccd: lastCccdNum, updatedAt: new Date().toISOString() };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const formData = new FormData();
                formData.append('file', blob, 'cccd_config.json');
                fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: formData }).catch(() => {});
            } catch(e) {}

            // 3. Firestore dự phòng
            try {
                if (window.firebaseDb && window.firestoreDoc && window.firestoreSetDoc && navigator.onLine) {
                    (window.firestoreSetDoc || window.setDoc)((window.firestoreDoc || window.doc)((window.firebaseDb || window.db), "configurations", "cccd_generator"), {
                        lastCccd: lastCccdNum,
                        lastUpdated: new Date().toISOString()
                    }, { merge: true }).catch(() => {});
                }
            } catch(e) {}
        },

        /**
         * Kiểm tra xem một chuỗi có phải là mã CCCD số chuẩn hay không (toàn số, 6 đến 10 chữ số)
         */
        isNumericCccd(val) {
            if (!val) return false;
            const str = String(val).trim();
            return /^\d{6,10}$/.test(str);
        },

        /**
         * Phân tích môn học, mức độ, màu sắc từ MapID
         */
        analyzeMapId(mapId) {
            let subject = "Toán";
            let level = "Thông hiểu";
            let levelColor = "blue";

            if (!mapId) return { subject, level, levelColor };
            const clean = String(mapId).toUpperCase().trim();

            if (clean.includes('D') || clean.includes('DS') || clean.includes('ĐẠI')) subject = "Đại số";
            else if (clean.includes('H') || clean.includes('HH') || clean.includes('HÌNH')) subject = "Hình học";
            else if (clean.includes('X') || clean.includes('XS') || clean.includes('THỐNG')) subject = "Xác suất";

            if (clean.includes('NB') || clean.includes('N1') || clean.includes('N2') || clean.includes('NHẬN BIẾT')) {
                level = "Nhận biết"; levelColor = "green";
            } else if (clean.includes('TH') || clean.includes('H1') || clean.includes('H2') || clean.includes('THÔNG HIỂU')) {
                level = "Thông hiểu"; levelColor = "blue";
            } else if (clean.includes('VDC') || clean.includes('C1') || clean.includes('C2') || clean.includes('CAO')) {
                level = "Vận dụng cao"; levelColor = "red";
            } else if (clean.includes('VD') || clean.includes('V1') || clean.includes('V2') || clean.includes('VẬN DỤNG')) {
                level = "Vận dụng"; levelColor = "orange";
            }

            return { subject, level, levelColor };
        },

        /**
         * CHUẨN HÓA CẤU TRÚC CÂU HỎI NẠP BANK
         * Mọi câu hỏi vào ngân hàng đều tuân thủ 100% định dạng này.
         */
        createBankQuestion(rawQ, assignedCccd = null) {
            const cccd = String(assignedCccd || rawQ.cccd || rawQ.bankId || rawQ.id || "").trim();
            const mapId = String(rawQ.mapId || "").trim();
            const source = String(rawQ.source || "").trim();
            const analysis = this.analyzeMapId(mapId);

            let options = Array.isArray(rawQ.options) ? rawQ.options : [];
            let statements = Array.isArray(rawQ.statements) ? rawQ.statements : [];
            let answer = rawQ.answer !== undefined ? String(rawQ.answer).trim() : "";
            let correct = rawQ.correct !== undefined ? rawQ.correct : (rawQ.correctAnswer !== undefined ? rawQ.correctAnswer : -1);

            return {
                id: cccd,                                      // ID duy nhất trong R2 (trùng mã CCCD)
                cccd: cccd,                                  // Mã CCCD số duy nhất
                mapId: mapId,                                // Mã đơn vị kiến thức (ví dụ 9D1H2-4)
                source: source,                              // Nguồn gốc đề/sách
                type: rawQ.type || 'mc',                     // 'mc' (trắc nghiệm), 'tf' (đúng sai), 'short' (điền khuyết), 'essay' / 'tl'
                content: rawQ.content || "",                 // Đề bài (hỗ trợ MathJax, LaTeX)
                solution: rawQ.solution || "",               // Lời giải chi tiết
                options: options,                            // 4 phương án [A, B, C, D]
                correct: correct,                            // Vị trí đáp án đúng
                statements: statements,                      // Câu Đúng / Sai
                answer: answer,                              // Đáp án điền khuyết
                subject: rawQ.subject || analysis.subject,
                level: rawQ.level || analysis.level,
                levelColor: rawQ.levelColor || analysis.levelColor,
                point: typeof rawQ.point === 'number' ? rawQ.point : 0.25,
                bookMapId: rawQ.bookMapId || "",             // Mã sách (nếu nạp từ sách)
                topicId: rawQ.topicId || "",                 // Mã chuyên đề (nếu từ xưởng chuyên đề)
                examId: rawQ.examId || "",                   // Mã đề thi (nếu từ đề thi)
                updatedAt: new Date().toISOString()
            };
        },

        /**
         * NẠP CÂU HỎI LÊN CLOUDFLARE R2
         * Dùng chung cho: exam-editor, book-manager, mapid-manager, dashboard.
         */
        async uploadQuestionsToBank(questions, options = {}) {
            const concurrency = options.concurrency || 5;
            const onProgress = options.onProgress || null;

            let completed = 0;
            let successCount = 0;
            let failCount = 0;
            let nextIdx = 0;

            const total = questions.length;
            if (total === 0) return { successCount: 0, failCount: 0, total: 0 };

            const worker = async () => {
                while (nextIdx < total) {
                    const cur = nextIdx++;
                    const q = questions[cur];
                    try {
                        const jsonStr = JSON.stringify(q);
                        const blob = new Blob([jsonStr], { type: 'application/json' });
                        const formData = new FormData();
                        formData.append('file', blob, `bank/${q.id}.json`);

                        const res = await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: formData });
                        if (res.ok) {
                            successCount++;
                        } else {
                            failCount++;
                            console.error(`Upload câu ${q.id} thất bại (HTTP ${res.status})`);
                        }
                    } catch(e) {
                        failCount++;
                        console.error(`Lỗi mạng upload câu ${q.id}:`, e);
                    }
                    completed++;
                    if (onProgress) onProgress(completed, total, successCount, failCount);
                }
            };

            const workers = [];
            for (let i = 0; i < Math.min(concurrency, total); i++) {
                workers.push(worker());
            }
            await Promise.all(workers);

            // Cập nhật bộ nhớ đệm Bank cục bộ
            try {
                this.updateLocalBankCache(questions);
            } catch(e) {}

            return { successCount, failCount, total };
        },

        /**
         * Cập nhật danh sách câu hỏi vào localStorage cache
         */
        updateLocalBankCache(newQuestions) {
            try {
                const cachedBank = localStorage.getItem(LOCAL_BANK_CACHE_KEY);
                let list = cachedBank ? JSON.parse(cachedBank) : [];
                if (!Array.isArray(list)) list = [];

                const map = new Map();
                list.forEach(q => map.set(q.id, q));
                newQuestions.forEach(q => map.set(q.id, q));

                const updated = Array.from(map.values());
                localStorage.setItem(LOCAL_BANK_CACHE_KEY, JSON.stringify(updated));
            } catch(e) {}
        },

        /**
         * Xóa câu hỏi khỏi Cloudflare R2 và xóa khỏi cache cục bộ
         */
        async deleteQuestion(id) {
            if (!id) return false;
            try {
                const res = await fetch(`${WORKER_BANK_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (res.ok) {
                    this.removeQuestionFromLocalCache(id);
                    return true;
                }
                return false;
            } catch(e) {
                console.error("Lỗi xóa câu hỏi khỏi R2:", e);
                return false;
            }
        },

        /**
         * Lấy thông tin chi tiết một câu hỏi theo ID hoặc CCCD
         * Ưu tiên tìm trong cache, nếu không có hoặc muốn lấy mới thì fetch từ Cloudflare R2
         */
        async getQuestionById(id, forceRemote = false) {
            if (!id) return null;
            const queryId = String(id).trim();

            // 1. Kiểm tra trong cache cục bộ
            if (!forceRemote) {
                try {
                    const cached = localStorage.getItem(LOCAL_BANK_CACHE_KEY);
                    if (cached) {
                        const list = JSON.parse(cached);
                        if (Array.isArray(list)) {
                            const found = list.find(q => String(q.id) === queryId || String(q.cccd) === queryId);
                            if (found && found.content) return found;
                        }
                    }
                } catch(e) {}
            }

            // 2. Fetch từ Cloudflare R2 qua Worker
            try {
                const res = await fetch(`${WORKER_BANK_URL}?id=${encodeURIComponent(queryId)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && (data.id || data.content)) {
                        this.updateLocalBankCache([data]);
                        return data;
                    }
                }
            } catch(e) {
                console.warn(`Lỗi fetch câu hỏi ${queryId} từ R2:`, e);
            }

            return null;
        },

        /**
         * Lưu một câu hỏi lên Cloudflare R2 và đồng bộ cache
         */
        async saveSingleQuestion(questionData) {
            if (!questionData || (!questionData.id && !questionData.cccd)) return false;
            const normalized = this.createBankQuestion(questionData, questionData.id || questionData.cccd);
            try {
                const jsonStr = JSON.stringify(normalized, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const formData = new FormData();
                formData.append('file', blob, `bank/${normalized.id}.json`);

                const res = await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: formData });
                if (res.ok) {
                    this.updateLocalBankCache([normalized]);
                    return true;
                }
                return false;
            } catch(e) {
                console.error("Lỗi lưu câu hỏi lên R2:", e);
                return false;
            }
        },

        /**
         * Xóa câu hỏi khỏi cache localStorage
         */
        removeQuestionFromLocalCache(id) {
            try {
                const cachedBank = localStorage.getItem(LOCAL_BANK_CACHE_KEY);
                if (cachedBank) {
                    let list = JSON.parse(cachedBank);
                    if (Array.isArray(list)) {
                        list = list.filter(q => q.id !== id && q.cccd !== id);
                        localStorage.setItem(LOCAL_BANK_CACHE_KEY, JSON.stringify(list));
                    }
                }
            } catch(e) {}
        }
    };

    global.BankService = BankService;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BankService;
    }
})(typeof window !== 'undefined' ? window : globalThis);
