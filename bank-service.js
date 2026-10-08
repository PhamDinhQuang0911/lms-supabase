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
         * Kiểm tra xem MapID có thực sự tồn tại trong Cây MapID hay không
         */
        isMapIdInTree(mapId, tree = null) {
            if (!mapId || !String(mapId).trim()) return false;
            const targetTree = (Array.isArray(tree) && tree.length > 0) ? tree : (window.globalIdTree || []);
            const clean = String(mapId).trim().toUpperCase();

            // Format chuẩn: [Grade][Subject][Chapter][Level][Lesson]-[Type]
            // Hỗ trợ cả 2 hệ ký hiệu: NHVC và YBKGC
            const m = clean.match(/^(\d+)([A-Z]+)(\d+)([NHVCYBKGC])(\d*)(?:-([A-Za-z0-9]+))?$/i);
            if (!m) return false;

            const gradeCode = m[1];
            const subCode = m[2];
            const chapCode = m[3];

            if (targetTree && targetTree.length > 0) {
                // Tìm Khối lớp
                const gNode = targetTree.find(g => g.id === gradeCode || 
                    (gradeCode === '10' && g.id === '0') || 
                    (gradeCode === '11' && g.id === '1') || 
                    (gradeCode === '12' && g.id === '2'));
                if (!gNode || !Array.isArray(gNode.children)) return false;

                // Tìm Phân môn (D/DS, H/HH, X/XS, G, C...)
                const sNode = gNode.children.find(s => s.id === subCode || 
                    (subCode === 'DS' && s.id === 'D') || 
                    (subCode === 'HH' && s.id === 'H') || 
                    (subCode === 'XS' && s.id === 'X'));
                if (!sNode || !Array.isArray(sNode.children)) return false;

                // Tìm Chương
                const cNode = sNode.children.find(c => String(c.id) === String(chapCode));
                if (!cNode) return false;

                return true;
            }

            // Fallback nếu chưa tải xong cây MapID: kiểm tra bảng chương hợp lệ cơ bản
            // Khối 9 Hình học chỉ có các chương 4, 5, 9, 0, 7
            if (gradeCode === '9' && (subCode === 'H' || subCode === 'HH')) {
                return ['4', '5', '9', '0', '7'].includes(chapCode);
            }
            if (gradeCode === '9' && (subCode === 'D' || subCode === 'DS')) {
                return ['1', '2', '3', '4', '5', '6', '7'].includes(chapCode);
            }

            return true;
        },

        /**
         * Phân tích môn học, mức độ, màu sắc từ MapID
         */
        analyzeMapId(mapId, tree = null) {
            let subject = "Toán";
            let level = null; // Mặc định null, chỉ gán khi tìm thấy hợp lệ
            let levelColor = "gray";
            let inMapId = false;

            if (!mapId || !String(mapId).trim()) {
                return { subject, level: null, levelColor: "gray", inMapId: false };
            }
            const clean = String(mapId).toUpperCase().trim();

            // 1. Phân tích theo cấu trúc chuẩn MapID (Hỗ trợ cả NHVC và YBKGC)
            const m = clean.match(/^(\d+)([A-Z]+)(\d+)([NHVCYBKGC])(\d*)(?:-([A-Za-z0-9]+))?$/i);
            if (m) {
                const subCode = m[2];
                const lvCode = m[4];

                if (subCode === 'D' || subCode === 'DS') subject = "Đại số";
                else if (subCode === 'H' || subCode === 'HH') subject = "Hình học";
                else if (subCode === 'X' || subCode === 'XS') subject = "Xác suất";
                else if (subCode === 'G') subject = "Giải tích";

                if (lvCode === 'N' || lvCode === 'Y') { level = "Nhận biết"; levelColor = "green"; }
                else if (lvCode === 'H' || lvCode === 'B') { level = "Thông hiểu"; levelColor = "blue"; }
                else if (lvCode === 'V' || lvCode === 'K') { level = "Vận dụng"; levelColor = "orange"; }
                else if (lvCode === 'C' || lvCode === 'G') { level = "Vận dụng cao"; levelColor = "red"; }

                inMapId = this.isMapIdInTree(mapId, tree);
                // Nếu gán ID nhưng không có trong map ID -> Không có
                if (!inMapId) {
                    level = null;
                    levelColor = "gray";
                }

                return { subject, level, levelColor, inMapId };
            }

            // 2. Fallback cho các định dạng MapID linh hoạt khác
            if (clean.includes('DS') || clean.startsWith('9D') || clean.includes('ĐẠI')) subject = "Đại số";
            else if (clean.includes('HH') || clean.startsWith('9H') || clean.includes('HÌNH')) subject = "Hình học";
            else if (clean.includes('XS') || clean.startsWith('9X') || clean.includes('THỐNG')) subject = "Xác suất";

            if (clean.includes('VDC') || clean.includes('C1') || clean.includes('C2') || clean.includes('CAO')) {
                level = "Vận dụng cao"; levelColor = "red"; inMapId = true;
            } else if (clean.includes('VD') || clean.includes('V1') || clean.includes('V2') || clean.includes('VẬN DỤNG')) {
                level = "Vận dụng"; levelColor = "orange"; inMapId = true;
            } else if (clean.includes('NB') || clean.includes('N1') || clean.includes('N2') || clean.includes('NHẬN BIẾT')) {
                level = "Nhận biết"; levelColor = "green"; inMapId = true;
            } else if (clean.includes('TH') || clean.includes('H1') || clean.includes('H2') || clean.includes('THÔNG HIỂU')) {
                level = "Thông hiểu"; levelColor = "blue"; inMapId = true;
            }

            return { subject, level, levelColor, inMapId };
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
                isMaster: !!rawQ.isMaster,                   // True nếu là câu hỏi gốc đại diện
                isDuplicate: !!rawQ.isDuplicate,             // True nếu là câu trùng/alias
                masterId: rawQ.masterId || null,             // ID câu gốc nếu đây là câu trùng
                aliases: Array.isArray(rawQ.aliases) ? rawQ.aliases : [], // Danh sách mã trùng đã gộp vào câu này
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

            // Cập nhật bộ nhớ đệm Bank cục bộ và đồng bộ catalog R2
            try {
                this.updateLocalBankCache(questions);
                await this.syncQuestionsToCatalog(questions);
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
                list.forEach(q => {
                    const k = String(q.id || q.cccd || '');
                    if (k) map.set(k, q);
                });
                newQuestions.forEach(q => {
                    const k = String(q.id || q.cccd || '');
                    if (k) {
                        const cur = map.get(k) || {};
                        map.set(k, Object.assign({}, cur, q));
                    }
                });

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

            let target = null;

            // 1. Kiểm tra trong window.globalBankQuestions (nếu có)
            if (!forceRemote && typeof window !== 'undefined' && Array.isArray(window.globalBankQuestions)) {
                const found = window.globalBankQuestions.find(q => String(q.id) === queryId || String(q.cccd) === queryId);
                if (found && found.content) target = found;
            }

            // 2. Kiểm tra trong cache cục bộ
            if (!target && !forceRemote) {
                try {
                    const cached = localStorage.getItem(LOCAL_BANK_CACHE_KEY);
                    if (cached) {
                        const list = JSON.parse(cached);
                        if (Array.isArray(list)) {
                            const found = list.find(q => String(q.id) === queryId || String(q.cccd) === queryId);
                            if (found && found.content) target = found;
                        }
                    }
                } catch(e) {}
            }

            // 3. Fetch trực tiếp từ Cloudflare R2 (tốc độ cao ~50ms)
            if (!target) {
                try {
                    const res = await fetch(`https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev/bank/${encodeURIComponent(queryId)}.json?t=${Date.now()}`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && (data.id || data.content)) {
                            this.updateLocalBankCache([data]);
                            target = data;
                        }
                    }
                } catch(e) {}
            }

            // 4. Fetch từ Cloudflare R2 qua Worker nếu chưa có
            if (!target) {
                try {
                    const res = await fetch(`${WORKER_BANK_URL}?id=${encodeURIComponent(queryId)}&t=${Date.now()}`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && (data.id || data.content)) {
                            this.updateLocalBankCache([data]);
                            target = data;
                        }
                    }
                } catch(e) {
                    console.warn(`Lỗi fetch câu hỏi ${queryId} từ R2:`, e);
                }
            }

            if (!target) return null;

            // 5. Nếu câu này là câu trùng (Duplicate/Alias) trỏ về câu gốc (Master)
            // Tra cứu trong sách giấy hoặc tra cứu CCCD vẫn hoạt động 100%, tự động trả về nội dung câu gốc
            if (target.isDuplicate && target.masterId && String(target.masterId) !== queryId) {
                try {
                    const masterQ = await this.getQuestionById(target.masterId, forceRemote);
                    if (masterQ) {
                        return {
                            ...masterQ,
                            displayCccd: queryId,
                            requestedId: queryId,
                            masterCccd: target.masterId,
                            isMergedAlias: true,
                            originalSource: target.source || masterQ.source
                        };
                    }
                } catch(err) {
                    console.warn(`Không thể nạp câu gốc ${target.masterId} cho alias ${queryId}:`, err);
                }
            }

            return target;
        },

        /**
         * Lưu một câu hỏi lên Cloudflare R2, đồng bộ cache và tự động đồng bộ vào các đề thi chứa CCCD này
         */
        async saveSingleQuestion(questionData, options = {}) {
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
                    await this.syncQuestionsToCatalog([normalized]);
                    
                    // Tự động đồng bộ câu hỏi vào tất cả các đề thi trong Supabase
                    if (!options.skipExamSync) {
                        try {
                            await this.syncQuestionToExams(normalized.id, normalized, options);
                        } catch(syncExErr) {
                            console.warn('[BankService.saveSingleQuestion] Lỗi đồng bộ đề thi ngầm:', syncExErr);
                        }
                    }

                    return true;
                }
                return false;
            } catch(e) {
                console.error("Lỗi lưu câu hỏi lên R2:", e);
                return false;
            }
        },

        /**
         * Đồng bộ danh sách câu hỏi vào catalog toàn cục và tải lên R2
         */
        async syncQuestionsToCatalog(newQuestions) {
            if (!newQuestions || newQuestions.length === 0) return;
            try {
                // 1. Cập nhật window.globalBankQuestions nếu đang ở trang dashboard
                if (typeof window !== 'undefined' && Array.isArray(window.globalBankQuestions)) {
                    newQuestions.forEach(nq => {
                        const nqId = String(nq.id || nq.cccd);
                        const idx = window.globalBankQuestions.findIndex(q => String(q.id) === nqId || String(q.cccd) === nqId);
                        const cur = idx !== -1 ? window.globalBankQuestions[idx] : {};
                        const catItem = {
                            ...cur,
                            ...nq,
                            id: nqId,
                            cccd: String(nq.cccd || nqId),
                            mapId: String(nq.mapId || cur.mapId || ''),
                            level: nq.level || cur.level || null,
                            levelColor: nq.levelColor || cur.levelColor || 'gray',
                            subject: nq.subject || cur.subject || 'Khác',
                            type: nq.type || cur.type || 'mc',
                            content: nq.content !== undefined ? nq.content : (cur.content || ''),
                            solution: nq.solution !== undefined ? nq.solution : (cur.solution || ''),
                            options: Array.isArray(nq.options) ? nq.options : (cur.options || []),
                            correct: nq.correct !== undefined ? nq.correct : (cur.correct !== undefined ? cur.correct : -1),
                            statements: Array.isArray(nq.statements) ? nq.statements : (cur.statements || []),
                            answer: nq.answer !== undefined ? String(nq.answer) : (cur.answer || ''),
                            point: typeof nq.point === 'number' ? nq.point : (typeof cur.point === 'number' ? cur.point : 0.25),
                            source: nq.source !== undefined ? nq.source : (cur.source || ''),
                            isMaster: nq.isMaster !== undefined ? !!nq.isMaster : (cur.isMaster || false),
                            isDuplicate: nq.isDuplicate !== undefined ? !!nq.isDuplicate : (cur.isDuplicate || false),
                            masterId: nq.masterId !== undefined ? nq.masterId : (cur.masterId || null),
                            aliases: Array.isArray(nq.aliases) ? nq.aliases : (cur.aliases || []),
                            aliasCount: Array.isArray(nq.aliases) ? nq.aliases.length : (cur.aliasCount || 0),
                            bookMapId: nq.bookMapId || cur.bookMapId || '',
                            topicId: nq.topicId || cur.topicId || '',
                            examId: nq.examId || cur.examId || '',
                            updatedAt: nq.updatedAt || new Date().toISOString(),
                            uploadedAt: nq.updatedAt || new Date().toISOString()
                        };
                        if (idx !== -1) {
                            window.globalBankQuestions[idx] = catItem;
                        } else {
                            window.globalBankQuestions.unshift(catItem);
                        }
                    });
                    try {
                        localStorage.setItem(LOCAL_BANK_CACHE_KEY, JSON.stringify(window.globalBankQuestions));
                    } catch(e) {}
                    if (typeof window.applyBankFilters === 'function') {
                        window.applyBankFilters();
                    }
                }

                // 2. Tải catalog hiện tại từ RAM, LocalStorage hoặc R2, ghép đầy đủ nội dung và đẩy lên R2
                let catalogList = [];
                if (typeof window !== 'undefined' && Array.isArray(window.globalBankQuestions) && window.globalBankQuestions.length > 0) {
                    catalogList = window.globalBankQuestions;
                } else {
                    const cachedBank = localStorage.getItem(LOCAL_BANK_CACHE_KEY);
                    if (cachedBank) {
                        try { catalogList = JSON.parse(cachedBank); } catch(e) {}
                    }
                }

                if (!Array.isArray(catalogList) || catalogList.length === 0) {
                    try {
                        const r = await fetch("https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev/bank_catalog.json?t=" + Date.now(), { cache: 'no-store' });
                        if (r.ok) catalogList = await r.json();
                    } catch(e) {}
                }

                if (Array.isArray(catalogList) && catalogList.length > 0) {
                    const map = new Map();
                    catalogList.forEach(item => {
                        const k = String(item.id || item.cccd || '');
                        if (k) map.set(k, item);
                    });
                    newQuestions.forEach(nq => {
                        const k = String(nq.id || nq.cccd || '');
                        if (!k) return;
                        const cur = map.get(k) || {};
                        map.set(k, {
                            ...cur,
                            ...nq,
                            id: k,
                            cccd: String(nq.cccd || k),
                            mapId: String(nq.mapId || cur.mapId || ''),
                            level: nq.level || cur.level || null,
                            levelColor: nq.levelColor || cur.levelColor || 'gray',
                            subject: nq.subject || cur.subject || 'Khác',
                            type: nq.type || cur.type || 'mc',
                            content: nq.content !== undefined ? nq.content : (cur.content || ''),
                            solution: nq.solution !== undefined ? nq.solution : (cur.solution || ''),
                            options: Array.isArray(nq.options) ? nq.options : (cur.options || []),
                            correct: nq.correct !== undefined ? nq.correct : (cur.correct !== undefined ? cur.correct : -1),
                            statements: Array.isArray(nq.statements) ? nq.statements : (cur.statements || []),
                            answer: nq.answer !== undefined ? String(nq.answer) : (cur.answer !== undefined ? cur.answer : ''),
                            point: typeof nq.point === 'number' ? nq.point : (typeof cur.point === 'number' ? cur.point : 0.25),
                            source: nq.source !== undefined ? nq.source : (cur.source || ''),
                            isMaster: nq.isMaster !== undefined ? !!nq.isMaster : (cur.isMaster || false),
                            isDuplicate: nq.isDuplicate !== undefined ? !!nq.isDuplicate : (cur.isDuplicate || false),
                            masterId: nq.masterId !== undefined ? nq.masterId : (cur.masterId || null),
                            aliases: Array.isArray(nq.aliases) ? nq.aliases : (cur.aliases || []),
                            aliasCount: Array.isArray(nq.aliases) ? nq.aliases.length : (cur.aliasCount || 0),
                            bookMapId: nq.bookMapId || cur.bookMapId || '',
                            topicId: nq.topicId || cur.topicId || '',
                            examId: nq.examId || cur.examId || '',
                            updatedAt: nq.updatedAt || new Date().toISOString(),
                            uploadedAt: nq.updatedAt || new Date().toISOString()
                        });
                    });
                    const updatedCatalog = Array.from(map.values());
                    const blob = new Blob([JSON.stringify(updatedCatalog, null, 2)], { type: 'application/json' });
                    
                    const fd = new FormData();
                    fd.append('file', blob, 'bank_catalog.json');
                    await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: fd }).catch(() => {});

                    const fd2 = new FormData();
                    fd2.append('file', blob, 'full_bank_catalog.json');
                    await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: fd2 }).catch(() => {});
                }
            } catch(err) {
                console.warn('Lỗi syncQuestionsToCatalog:', err);
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
        },

        /**
         * ĐỒNG BỘ CÂU HỎI THEO MÃ CCCD VÀO TẤT CẢ CÁC ĐỀ THI TRONG SUPABASE
         * Khi một câu hỏi được chỉnh sửa/ghi đè trong Ngân hàng, cập nhật ngay lập tức
         * vào tất cả các đề thi đang chứa CCCD này để link thi online và trang soạn đề luôn mới nhất.
         */
        async syncQuestionToExams(targetCccd, updatedQ, options = {}) {
            if (!targetCccd) return 0;
            const cccdStr = String(targetCccd).trim();
            if (!cccdStr) return 0;

            const sb = (typeof window !== 'undefined' && window.supabase) ? window.supabase : (typeof supabase !== 'undefined' ? supabase : null);
            if (!sb) {
                console.warn('[BankService.syncQuestionToExams] Supabase client không khả dụng');
                return 0;
            }

            let count = 0;
            try {
                // 1. Tìm tất cả đề thi có chứa câu hỏi này (kiểm tra cccd và bankId bằng JSONB contains)
                let matchedExams = [];
                try {
                    const [resCccd, resBankId] = await Promise.all([
                        sb.from('exams').select('id,title,questions,raw_data').contains('questions', JSON.stringify([{ cccd: cccdStr }])),
                        sb.from('exams').select('id,title,questions,raw_data').contains('questions', JSON.stringify([{ bankId: cccdStr }]))
                    ]);
                    const examMap = new Map();
                    (resCccd.data || []).forEach(e => examMap.set(e.id, e));
                    (resBankId.data || []).forEach(e => examMap.set(e.id, e));
                    matchedExams = Array.from(examMap.values());
                } catch(e) {
                    console.warn('[BankService.syncQuestionToExams] Lỗi truy vấn contains:', e);
                }

                // Fallback: Nếu query contains trả về rỗng, quét danh sách exams để không bao giờ bỏ sót
                if (matchedExams.length === 0) {
                    try {
                        const { data: allExams } = await sb.from('exams').select('id,title,questions,raw_data');
                        if (Array.isArray(allExams)) {
                            matchedExams = allExams.filter(ex => {
                                if (!Array.isArray(ex.questions)) return false;
                                return ex.questions.some(q => String(q.cccd || q.bankId || q.id || '').trim() === cccdStr);
                            });
                        }
                    } catch(scanErr) {
                        console.warn('[BankService.syncQuestionToExams] Lỗi scan bảng exams:', scanErr);
                    }
                }

                // 2. Cập nhật từng đề thi có chứa CCCD này
                for (const ex of matchedExams) {
                    if (options.excludeExamId && ex.id === options.excludeExamId) continue;
                    if (!Array.isArray(ex.questions) || ex.questions.length === 0) continue;

                    let hasMatch = false;
                    const newQuestions = ex.questions.map(q => {
                        const qCccd = String(q.cccd || q.bankId || q.id || '').trim();
                        if (qCccd === cccdStr) {
                            hasMatch = true;
                            return {
                                ...q,
                                content: updatedQ.content !== undefined ? updatedQ.content : q.content,
                                solution: updatedQ.solution !== undefined ? updatedQ.solution : q.solution,
                                options: Array.isArray(updatedQ.options) ? updatedQ.options : (q.options || []),
                                statements: Array.isArray(updatedQ.statements) ? updatedQ.statements : (q.statements || []),
                                answer: updatedQ.answer !== undefined ? updatedQ.answer : (q.answer !== undefined ? q.answer : ''),
                                correct: updatedQ.correct !== undefined ? updatedQ.correct : q.correct,
                                type: updatedQ.type || q.type,
                                mapId: updatedQ.mapId || q.mapId,
                                level: updatedQ.level || q.level,
                                levelColor: updatedQ.levelColor || q.levelColor,
                                subject: updatedQ.subject || q.subject,
                                point: (q.point !== undefined) ? q.point : (updatedQ.point !== undefined ? updatedQ.point : 0.25),
                                updatedAt: new Date().toISOString()
                            };
                        }
                        return q;
                    });

                    if (hasMatch) {
                        const updatePayload = {
                            questions: newQuestions,
                            updated_at: new Date().toISOString()
                        };
                        if (ex.raw_data && typeof ex.raw_data === 'object') {
                            updatePayload.raw_data = {
                                ...ex.raw_data,
                                questions: newQuestions,
                                updatedAt: new Date().toISOString()
                            };
                        }
                        await sb.from('exams').update(updatePayload).eq('id', ex.id);
                        count++;

                        // Xóa cache sessionStorage nếu có để tránh stale data khi mở lại
                        try { sessionStorage.removeItem(`qmath:exam:${ex.id}`); } catch(e) {}

                        // Nếu đề này đang mở trong tab hiện tại của exam-editor
                        if (typeof window !== 'undefined' && window.examData && (window.examData.id === ex.id || window.currentExamId === ex.id)) {
                            window.examData.questions = newQuestions;
                            window.questions = newQuestions;
                            window.originalQuestionsData = JSON.parse(JSON.stringify(newQuestions));
                            if (typeof window.renderPreviewList === 'function') window.renderPreviewList();
                            if (window.currentQIndex !== -1 && typeof window.loadQuestionToEditor === 'function') {
                                window.loadQuestionToEditor(window.currentQIndex);
                            }
                        }
                    }
                }

                if (count > 0) {
                    console.log(`[BankService.syncQuestionToExams] Đã đồng bộ câu CCCD #${cccdStr} vào ${count} đề thi trong Supabase.`);
                }
            } catch(err) {
                console.error('[BankService.syncQuestionToExams] Lỗi đồng bộ câu hỏi vào đề thi:', err);
            }
            return count;
        },

        /**
         * LÀM MỚI NỘI DUNG MẢNG CÂU HỎI TRONG ĐỀ THI TỪ NGÂN HÀNG CÂU HỎI (ENRICHMENT)
         * Đối chiếu tất cả câu có mã CCCD trong mảng questions với Ngân hàng câu hỏi R2 / Cache
         * Cập nhật nội dung câu mới nhất từ Ngân hàng vào câu hỏi của đề thi.
         */
        async enrichExamQuestions(questions) {
            if (!Array.isArray(questions) || questions.length === 0) return 0;
            let changedCount = 0;

            // Xây dựng map tra cứu từ cache ngân hàng
            let catalogMap = new Map();
            try {
                const cached = localStorage.getItem(LOCAL_BANK_CACHE_KEY);
                if (cached) {
                    const list = JSON.parse(cached);
                    if (Array.isArray(list)) {
                        list.forEach(item => {
                            const k = String(item.id || item.cccd || '').trim();
                            if (k) catalogMap.set(k, item);
                        });
                    }
                }
            } catch(e) {}

            if (typeof window !== 'undefined' && Array.isArray(window.globalBankQuestions)) {
                window.globalBankQuestions.forEach(item => {
                    const k = String(item.id || item.cccd || '').trim();
                    if (k) catalogMap.set(k, item);
                });
            }

            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const cccd = String(q.cccd || q.bankId || q.id || '').trim();
                if (!cccd || !/^\d{8}$/.test(cccd)) continue;

                let bankQ = catalogMap.get(cccd);
                if (!bankQ) {
                    bankQ = await this.getQuestionById(cccd, false);
                    if (bankQ) catalogMap.set(cccd, bankQ);
                }

                if (bankQ && bankQ.content) {
                    const isDifferent = (q.content !== bankQ.content) ||
                        (q.solution !== bankQ.solution && bankQ.solution) ||
                        (JSON.stringify(q.options || []) !== JSON.stringify(bankQ.options || [])) ||
                        (JSON.stringify(q.statements || []) !== JSON.stringify(bankQ.statements || [])) ||
                        (bankQ.answer !== undefined && q.answer !== undefined && String(q.answer) !== String(bankQ.answer));

                    if (isDifferent) {
                        q.content = bankQ.content;
                        if (bankQ.solution !== undefined) q.solution = bankQ.solution;
                        if (Array.isArray(bankQ.options) && bankQ.options.length > 0) q.options = bankQ.options;
                        if (Array.isArray(bankQ.statements) && bankQ.statements.length > 0) q.statements = bankQ.statements;
                        if (bankQ.answer !== undefined) q.answer = bankQ.answer;
                        if (bankQ.correct !== undefined) q.correct = bankQ.correct;
                        if (bankQ.type) q.type = bankQ.type;
                        if (bankQ.mapId) q.mapId = bankQ.mapId;
                        if (bankQ.level) q.level = bankQ.level;
                        if (bankQ.levelColor) q.levelColor = bankQ.levelColor;
                        if (bankQ.subject) q.subject = bankQ.subject;
                        q.updatedAt = bankQ.updatedAt || new Date().toISOString();
                        changedCount++;
                    }
                }
            }
            return changedCount;
        },

        /**
         * QUÉT VÀ ĐỒNG BỘ TOÀN BỘ CÁC ĐỀ THI TRONG HỆ THỐNG VỚI NGÂN HÀNG CÂU HỎI
         */
        async syncAllExamsFromBank() {
            const sb = (typeof window !== 'undefined' && window.supabase) ? window.supabase : (typeof supabase !== 'undefined' ? supabase : null);
            if (!sb) return { syncedExams: 0, updatedQuestions: 0 };

            try {
                // 1. Tải catalog ngân hàng đầy đủ
                const catRes = await fetch("https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev/bank_catalog.json?t=" + Date.now());
                if (!catRes.ok) return { syncedExams: 0, updatedQuestions: 0 };
                const catalog = await catRes.json();
                const bankMap = new Map();
                catalog.forEach(item => {
                    const k = String(item.id || item.cccd || '').trim();
                    if (k) bankMap.set(k, item);
                });

                // 2. Tải tất cả đề thi
                const { data: exams, error } = await sb.from('exams').select('id,title,questions,raw_data');
                if (error || !Array.isArray(exams)) return { syncedExams: 0, updatedQuestions: 0 };

                let syncedExams = 0;
                let updatedQuestions = 0;

                for (const ex of exams) {
                    if (!Array.isArray(ex.questions) || ex.questions.length === 0) continue;
                    let examChanged = false;

                    const newQuestions = ex.questions.map(q => {
                        const cccd = String(q.cccd || q.bankId || q.id || '').trim();
                        if (cccd && bankMap.has(cccd)) {
                            const bankQ = bankMap.get(cccd);
                            const isDifferent = (q.content !== bankQ.content) ||
                                (q.solution !== bankQ.solution && bankQ.solution) ||
                                (JSON.stringify(q.options || []) !== JSON.stringify(bankQ.options || [])) ||
                                (JSON.stringify(q.statements || []) !== JSON.stringify(bankQ.statements || [])) ||
                                (bankQ.answer !== undefined && q.answer !== undefined && String(q.answer) !== String(bankQ.answer));

                            if (isDifferent) {
                                examChanged = true;
                                updatedQuestions++;
                                return {
                                    ...q,
                                    content: bankQ.content,
                                    solution: bankQ.solution !== undefined ? bankQ.solution : q.solution,
                                    options: Array.isArray(bankQ.options) ? bankQ.options : (q.options || []),
                                    statements: Array.isArray(bankQ.statements) ? bankQ.statements : (q.statements || []),
                                    answer: bankQ.answer !== undefined ? bankQ.answer : (q.answer !== undefined ? q.answer : ''),
                                    correct: bankQ.correct !== undefined ? bankQ.correct : q.correct,
                                    type: bankQ.type || q.type,
                                    mapId: bankQ.mapId || q.mapId,
                                    level: bankQ.level || q.level,
                                    levelColor: bankQ.levelColor || q.levelColor,
                                    subject: bankQ.subject || q.subject,
                                    point: (q.point !== undefined) ? q.point : (bankQ.point !== undefined ? bankQ.point : 0.25),
                                    updatedAt: bankQ.updatedAt || new Date().toISOString()
                                };
                            }
                        }
                        return q;
                    });

                    if (examChanged) {
                        const updatePayload = {
                            questions: newQuestions,
                            updated_at: new Date().toISOString()
                        };
                        if (ex.raw_data && typeof ex.raw_data === 'object') {
                            updatePayload.raw_data = {
                                ...ex.raw_data,
                                questions: newQuestions,
                                updatedAt: new Date().toISOString()
                            };
                        }
                        await sb.from('exams').update(updatePayload).eq('id', ex.id);
                        syncedExams++;
                        try { sessionStorage.removeItem(`qmath:exam:${ex.id}`); } catch(e) {}
                    }
                }

                console.log(`[BankService.syncAllExamsFromBank] Đã đồng bộ ${updatedQuestions} câu hỏi trên ${syncedExams} đề thi.`);
                return { syncedExams, updatedQuestions };
            } catch(e) {
                console.error('[BankService.syncAllExamsFromBank] Lỗi đồng bộ toàn hệ thống:', e);
                return { syncedExams: 0, updatedQuestions: 0 };
            }
        }
    };

    global.BankService = BankService;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BankService;
    }
})(typeof window !== 'undefined' ? window : globalThis);
