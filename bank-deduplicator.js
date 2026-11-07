/**
 * ==============================================================================
 * BANK DEDUPLICATOR - HỆ THỐNG LỌC CÂU TRÙNG TOÁN HỌC & BẢO TOÀN CCCD SÁCH GIẤY
 * ==============================================================================
 * Giải pháp xử lý bài toán: 2 hoặc nhiều đề thi/sách in dùng chung câu hỏi nhưng
 * được cấp các mã CCCD khác nhau. Khi lọc trùng:
 * - Gom nhóm và chỉ định 1 câu làm "Câu Gốc" (Master).
 * - Các câu còn lại đánh dấu là "Bí danh liên kết" (Alias Pointer).
 * - Các tính năng tạo đề / sinh đề ngẫu nhiên chỉ lấy câu gốc (không bị trùng câu).
 * - Tính năng tra cứu CCCD sách giấy của học sinh vẫn hoạt động 100% không đổi.
 */

(function(global) {
    'use strict';

    // Bảng từ điển chuẩn hóa các cụm từ tương đương trong đề thi Toán
    const VIETNAMESE_MATH_SYNONYMS = [
        { regex: /(mệnh đề|khẳng định) nào (sau đây )?(đúng|chính xác)/gi, replace: " khang_dinh_dung " },
        { regex: /(mệnh đề|khẳng định) nào (sau đây )?(sai|không đúng)/gi, replace: " khang_dinh_sai " },
        { regex: /trong các (mệnh đề|khẳng định) sau[,:]?\s*(mệnh đề|khẳng định) nào đúng/gi, replace: " khang_dinh_dung " },
        { regex: /trong các (mệnh đề|khẳng định) sau[,:]?\s*(mệnh đề|khẳng định) nào sai/gi, replace: " khang_dinh_sai " },
        { regex: /giá trị lớn nhất/gi, replace: " gtln " },
        { regex: /giá trị nhỏ nhất/gi, replace: " gtnn " },
        { regex: /tập xác định của hàm số/gi, replace: " txd " },
        { regex: /hàm số.*có tập xác định là/gi, replace: " txd " },
        { regex: /số điểm cực trị( của hàm số)?/gi, replace: " diem_cuc_tri " },
        { regex: /có bao nhiêu điểm cực trị/gi, replace: " diem_cuc_tri " },
        { regex: /hàm số đã cho đạt cực trị tại/gi, replace: " diem_cuc_tri " },
        { regex: /nghiệm của phương trình/gi, replace: " nghiem_pt " },
        { regex: /tập nghiệm của phương trình/gi, replace: " nghiem_pt " },
        { regex: /phương trình.*có nghiệm là/gi, replace: " nghiem_pt " },
        { regex: /nghiệm của bất phương trình/gi, replace: " nghiem_bpt " },
        { regex: /tập nghiệm của bất phương trình/gi, replace: " nghiem_bpt " },
        { regex: /bất phương trình.*có nghiệm là/gi, replace: " nghiem_bpt " },
        { regex: /trong không gian\s*(với hệ tọa độ)?\s*oxyz/gi, replace: " " },
        { regex: /trong mặt phẳng\s*(với hệ tọa độ)?\s*oxy/gi, replace: " " },
        { regex: /có đồ thị như hình vẽ( bên)?/gi, replace: " do_thi_hinh_ve " }
    ];

    const BankDeduplicator = {
        /**
         * 1. CHUẨN HÓA CÔNG THỨC TOÁN HỌC (LATEX CANONICALIZATION)
         */
        canonicalizeLatex(str) {
            if (!str) return '';
            let s = String(str);

            // Bỏ dấu bao math delimiters: $...$, $$...$$, \(...\), \[...\]
            s = s.replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '');

            // Chuẩn hóa phân số \dfrac, \tfrac -> \frac
            s = s.replace(/\\(dfrac|tfrac)/g, '\\frac');

            // Bỏ các lệnh co giãn ngoặc không ảnh hưởng ngữ nghĩa
            s = s.replace(/\\left\s*([(\[{|])/g, '$1').replace(/\\right\s*([)\]}|])/g, '$1');

            // Chuẩn hóa dấu so sánh và dấu nhân (từ dài trước)
            s = s.replace(/\\(geq|ge)/g, '>=').replace(/\\(leq|le)/g, '<=');
            s = s.replace(/\\(cdot|times)/g, '*');
            s = s.replace(/\\(neq|ne)/g, '!=');

            // Chuẩn hóa vector
            s = s.replace(/\\overrightarrow\{([^}]+)\}/g, '\\vec{$1}');
            s = s.replace(/\\mathbf\{([^}]+)\}/g, '$1');

            // Chuẩn hóa khoảng đoạn: [0, 1] hoặc [0 ; 1] -> [0;1]
            s = s.replace(/\[\s*([^\],;]+)\s*,\s*([^\],;]+)\s*\]/g, '[$1;$2]');
            s = s.replace(/\(\s*([^\),;]+)\s*,\s*([^\),;]+)\s*\)/g, '($1;$2)');
            s = s.replace(/\[\s*([^\],;]+)\s*;\s*([^\],;]+)\s*\]/g, '[$1;$2]');
            s = s.replace(/\(\s*([^\),;]+)\s*;\s*([^\),;]+)\s*\)/g, '($1;$2)');

            // Chuẩn hóa tập rỗng
            s = s.replace(/\\(varnothing|emptyset)/g, '\\empty');

            // Chuẩn hóa tích phân / giới hạn
            s = s.replace(/\\limits/g, '');
            s = s.replace(/\\mathrm\{d\}([a-z])/g, 'd$1');

            // Chuẩn hóa chỉ số dưới và trên dạng _{2} -> _2, ^{2} -> ^2
            s = s.replace(/_\{([0-9a-zA-Z]+)\}/g, '_$1');
            s = s.replace(/\^\{([0-9a-zA-Z]+)\}/g, '^$1');

            // Xóa toàn bộ khoảng trắng bên trong công thức
            s = s.replace(/\s+/g, '');
            return s;
        },

        /**
         * 2. TRÍCH XUẤT TẤT CẢ CÁC BIỂU THỨC TOÁN HỌC TRONG ĐỀ
         */
        extractMathExpressions(str) {
            if (!str) return [];
            const matches = [];
            // Tìm các khối $...$, $$...$$, \(...\), \[...\]
            const regex = /\$\$([\s\S]*?)\$\$|\$([^\$]+)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
            let m;
            while ((m = regex.exec(str)) !== null) {
                const expr = m[1] || m[2] || m[3] || m[4];
                if (expr && expr.trim()) {
                    const c = this.canonicalizeLatex(expr);
                    // Bỏ các số nguyên đơn thuần như 7, 20, 1 vì không phải công thức toán đặc thù
                    if (c && !/^\d+$/.test(c)) {
                        matches.push(c);
                    }
                }
            }
            return matches.filter(Boolean);
        },

        /**
         * 3. CHUẨN HÓA VĂN BẢN VÀ TỪ ĐỒNG NGHĨA TIẾNG VIỆT (LOẠI BỎ TOÁN ĐỂ SO SÁNH CHỮ)
         */
        normalizeText(str) {
            if (!str) return '';
            let s = String(str).toLowerCase();

            // Lột bỏ toàn bộ thẻ HTML
            s = s.replace(/<[^>]*>/g, ' ');

            // Lột bỏ các khối toán học để so sánh riêng phần văn bản dẫn
            s = s.replace(/\$\$[\s\S]*?\$\$/g, ' ');
            s = s.replace(/\$[^\$]+\$/g, ' ');
            s = s.replace(/\\\(.*?\\\)/g, ' ');
            s = s.replace(/\\\[.*?\\\]/g, ' ');

            // Lột bỏ tiền tố đánh số câu: "Câu 1.", "Câu 12:", "Bài 5:", "Ví dụ 2."
            s = s.replace(/^(câu|bài|ví dụ)\s*\d+[\.:]?\s*/gi, '');

            // Lột bỏ thang điểm "(1,0 điểm)", "[1.5 điểm]"
            s = s.replace(/[\(\[]\s*\d+([.,]\d+)?\s*(điểm|đ)[\)\]]/gi, '');

            // Thay thế từ đồng nghĩa trong toán học
            for (const item of VIETNAMESE_MATH_SYNONYMS) {
                s = s.replace(item.regex, item.replace);
            }

            // Loại bỏ dấu câu phụ
            s = s.replace(/[\.,:;!?'"()]/g, ' ');

            // Thu gọn khoảng trắng thừa
            s = s.replace(/\s+/g, ' ').trim();
            return s;
        },

        /**
         * 4. BÓC TÁCH VÀ CHUẨN HÓA TẬP HỢP ĐÁP ÁN (INVARIANT OPTIONS SET)
         */
        getCanonicalOptions(options) {
            if (!Array.isArray(options) || options.length === 0) return [];
            return options
                .map(opt => {
                    if (!opt) return '';
                    let clean = String(opt).trim();
                    // Bỏ tiền tố A., B., C., D.
                    clean = clean.replace(/^[A-Da-d]\s*[\.\)]\s*/, '');
                    // Chuẩn hóa toán học & văn bản
                    const mathCanonical = this.canonicalizeLatex(clean);
                    const textCanonical = this.normalizeText(clean);
                    return mathCanonical || textCanonical;
                })
                .filter(Boolean)
                .sort(); // Sắp xếp theo bảng chữ cái để độc lập với thứ tự xuất hiện A, B, C, D
        },

        /**
         * 5. THUẬT TOÁN ĐO TƯƠNG ĐỒNG CHUỖI (DICE COEFFICIENT N-GRAM)
         */
        stringSimilarity(str1, str2) {
            if (!str1 && !str2) return 1.0;
            if (!str1 || !str2) return 0.0;
            if (str1 === str2) return 1.0;
            if (str1.length < 2 || str2.length < 2) return str1 === str2 ? 1.0 : 0.0;

            const getBigrams = s => {
                const bg = new Map();
                for (let i = 0; i < s.length - 1; i++) {
                    const sub = s.substr(i, 2);
                    bg.set(sub, (bg.get(sub) || 0) + 1);
                }
                return bg;
            };

            const bg1 = getBigrams(str1);
            const bg2 = getBigrams(str2);
            let intersection = 0;
            for (const [k, v] of bg1) {
                if (bg2.has(k)) intersection += Math.min(v, bg2.get(k));
            }
            return (2.0 * intersection) / (str1.length + str2.length - 2);
        },

        /**
         * 6. THUẬT TOÁN ĐO TƯƠNG ĐỒNG TẬP HỢP ĐÁP ÁN (JACCARD SIMILARITY)
         */
        optionsSimilarity(opts1, opts2) {
            if (!opts1.length && !opts2.length) return 1.0;
            if (!opts1.length || !opts2.length) return 0.0;

            let matches = 0;
            const set2 = [...opts2];
            for (const o1 of opts1) {
                const idx = set2.findIndex(o2 => {
                    if (o1 === o2) return true;
                    return this.stringSimilarity(o1, o2) >= 0.90;
                });
                if (idx !== -1) {
                    matches++;
                    set2.splice(idx, 1);
                }
            }
            const total = Math.max(opts1.length, opts2.length);
            return total > 0 ? (matches / total) : 0;
        },

        /**
         * 7. ĐO ĐỘ TƯƠNG ĐỒNG CÁC BIỂU THỨC TOÁN HỌC (MATH SIMILARITY)
         */
        mathSimilarity(exprs1, exprs2) {
            if (!exprs1.length && !exprs2.length) return 1.0;
            if (!exprs1.length || !exprs2.length) return 0.0;

            let matches = 0;
            const list2 = [...exprs2];
            for (const e1 of exprs1) {
                const idx = list2.findIndex(e2 => {
                    if (e1 === e2) return true;
                    return this.stringSimilarity(e1, e2) >= 0.85;
                });
                if (idx !== -1) {
                    matches++;
                    list2.splice(idx, 1);
                }
            }
            return (2.0 * matches) / (exprs1.length + exprs2.length);
        },

        /**
         * 8. CHẤM ĐIỂM TƯƠNG ĐỒNG TOÀN DIỆN GIỮA 2 CÂU HỎI (COMPOSITE SCORING)
         */
        compareQuestions(q1, q2) {
            if (!q1 || !q2) return { score: 0, isMatch: false };
            // Hai câu cùng một mã ID hoặc CCCD là cùng 1 câu hỏi trong hệ thống, không phải câu trùng cần gộp
            if (q1.id && q2.id && String(q1.id) === String(q2.id)) return { score: 0, isMatch: false, reason: "Cùng một mã câu hỏi" };
            if (q1.cccd && q2.cccd && String(q1.cccd) === String(q2.cccd)) return { score: 0, isMatch: false, reason: "Cùng một mã CCCD" };

            const c1 = (q1.content || '').trim();
            const c2 = (q2.content || '').trim();
            if (!c1 || !c2 || c1.length < 5 || c2.length < 5) {
                return { score: 0, isMatch: false, reason: "Thiếu nội dung câu hỏi" };
            }

            // Nếu khác loại câu hỏi (ví dụ trắc nghiệm vs tự luận) -> Không trùng
            if (q1.type && q2.type && q1.type !== q2.type) {
                return { score: 0, isMatch: false, reason: "Khác loại câu hỏi" };
            }

            // 0. Kiểm tra trùng khớp hoàn toàn nội dung và các phương án (100% tuyệt đối)
            const normC1 = c1.replace(/\s+/g, ' ');
            const normC2 = c2.replace(/\s+/g, ' ');
            const rawOpts1 = (q1.options || []).map(o => String(o).trim()).filter(Boolean).sort().join('||');
            const rawOpts2 = (q2.options || []).map(o => String(o).trim()).filter(Boolean).sort().join('||');
            if (normC1 === normC2 && rawOpts1 === rawOpts2) {
                return {
                    score: 100,
                    details: { options: 100, math: 100, text: 100 },
                    isMatch: true,
                    isPotential: true
                };
            }

            // 1. So khớp 4 phương án trắc nghiệm
            const opts1 = this.getCanonicalOptions(q1.options || []);
            const opts2 = this.getCanonicalOptions(q2.options || []);
            const scoreOptions = this.optionsSimilarity(opts1, opts2);

            // 2. So khớp các biểu thức Toán học trích xuất trong đề
            const math1 = this.extractMathExpressions(c1);
            const math2 = this.extractMathExpressions(c2);
            let scoreMath = 0;
            const hasMathBlocks = math1.length > 0 && math2.length > 0;
            if (hasMathBlocks) {
                scoreMath = this.mathSimilarity(math1, math2);
            } else {
                // Fallback nếu không dùng dấu $ mà viết thẳng công thức
                const cMath1 = this.canonicalizeLatex(c1);
                const cMath2 = this.canonicalizeLatex(c2);
                scoreMath = this.stringSimilarity(cMath1, cMath2);
            }

            // 3. So khớp phần chữ dẫn dắt
            const text1 = this.normalizeText(c1);
            const text2 = this.normalizeText(c2);
            const scoreText = this.stringSimilarity(text1, text2);

            // Kiểm tra xem phương án có phải tập số đơn giản/ngắn (ví dụ: '1', '2', '3', '4')
            const isGenericOptions = opts1.length >= 2 && opts1.every(o => o.length <= 3 && /^[-+]?\d+$/.test(o));

            // Tính điểm tổng hợp
            let totalScore = 0;
            const hasOptions = opts1.length >= 2 && opts2.length >= 2;

            if (hasOptions) {
                if (isGenericOptions) {
                    // Nếu đáp án chỉ là các số đếm đơn giản (1, 2, 3, 4), không thể dựa vào đáp án
                    // Trọng số chính phải nằm ở công thức Toán và đề bài
                    totalScore = (scoreMath * 0.55) + (scoreText * 0.35) + (scoreOptions * 0.10);
                } else if (hasMathBlocks && scoreMath < 0.30) {
                    // Hai câu có công thức hoàn toàn khác nhau thì không thể là một
                    totalScore = (scoreMath * 0.50) + (scoreText * 0.30) + (scoreOptions * 0.20);
                } else if (scoreOptions >= 0.98) {
                    // Đáp án đặc thù và khớp 100%
                    if (scoreMath >= 0.98 && scoreText >= 0.98) {
                        totalScore = 1.0; // Trùng khớp 100% tuyệt đối
                    } else if (scoreMath >= 0.92 && scoreText >= 0.90) {
                        totalScore = 0.98; // Trùng khớp rất cao >= 98%
                    } else if (scoreMath >= 0.50 || scoreText >= 0.40) {
                        const weighted = (scoreOptions * 0.50) + (scoreMath * 0.30) + (scoreText * 0.20);
                        totalScore = Math.max(weighted, 0.96);
                    } else {
                        totalScore = (scoreOptions * 0.50) + (scoreMath * 0.30) + (scoreText * 0.20);
                    }
                } else if (scoreOptions >= 0.75) {
                    totalScore = (scoreOptions * 0.45) + (scoreMath * 0.35) + (scoreText * 0.20);
                } else {
                    totalScore = (scoreOptions * 0.35) + (scoreMath * 0.40) + (scoreText * 0.25);
                }
            } else {
                // Câu tự luận hoặc điền khuyết (không có 4 phương án)
                if (scoreMath >= 0.98 && scoreText >= 0.98) {
                    totalScore = 1.0;
                } else if (scoreMath >= 0.92 && scoreText >= 0.90) {
                    totalScore = 0.98;
                } else {
                    totalScore = (scoreMath * 0.60) + (scoreText * 0.40);
                }
            }

            // Nếu cả hai câu đều có khối toán học mà độ tương đồng toán quá thấp (< 0.25)
            // thì dứt khoát không phải câu trùng
            if (hasMathBlocks && scoreMath < 0.25) {
                totalScore = Math.min(totalScore, 0.45);
            }

            const pct = Math.round(totalScore * 100);
            return {
                score: pct,
                details: {
                    options: Math.round(scoreOptions * 100),
                    math: Math.round(scoreMath * 100),
                    text: Math.round(scoreText * 100)
                },
                isMatch: pct >= 82,       // >= 82%: Trùng khớp cao
                isPotential: pct >= 65     // 65% - 81%: Nghi vấn trùng lặp
            };
        },

        /**
         * 9. QUÉT TOÀN BỘ NGÂN HÀNG VỚI CƠ CHẾ GOM NHÓM XÔ ỨNG VIÊN (BUCKETING)
         */
        findDuplicatesInBank(questionList, options = {}) {
            const threshold = options.threshold || 82;
            const onProgress = options.onProgress || null;
            const clusters = [];
            const visited = new Set();

            // 0. Khử trùng lặp bản ghi theo ID/CCCD (đảm bảo mỗi câu hỏi chỉ xuất hiện đúng 1 lần trong danh sách quét)
            const uniqueMap = new Map();
            (Array.isArray(questionList) ? questionList : []).forEach(q => {
                if (!q) return;
                const k = String(q.id || q.cccd || '').trim();
                if (k && !uniqueMap.has(k)) {
                    uniqueMap.set(k, q);
                } else if (!k) {
                    uniqueMap.set(`temp_${uniqueMap.size}`, q);
                }
            });
            const list = Array.from(uniqueMap.values()).filter(q => q && q.content && q.content.trim().length >= 5);
            const n = list.length;

            if (n < 2) return [];

            // 1. Phân chia xô ứng viên (Bucketing) theo môn/lớp và loại câu hỏi
            const buckets = new Map();
            list.forEach((q, idx) => {
                const mapPrefix = String(q.mapId || '').substring(0, 4) || 'OTHER';
                const key = `${q.type || 'mc'}_${q.subject || 'Toan'}_${mapPrefix}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push({ q, originalIdx: idx });
            });

            const totalBuckets = buckets.size;
            let currentBucketIdx = 0;

            // 2. Quét từng xô ứng viên
            for (const [bucketKey, bucketItems] of buckets.entries()) {
                currentBucketIdx++;
                const bLen = bucketItems.length;
                if (bLen < 2) continue;

                for (let i = 0; i < bLen; i++) {
                    const itemA = bucketItems[i].q;
                    const idA = String(itemA.id || itemA.cccd || '');
                    if (!idA || visited.has(idA)) continue;

                    const currentCluster = [itemA];

                    for (let j = i + 1; j < bLen; j++) {
                        const itemB = bucketItems[j].q;
                        const idB = String(itemB.id || itemB.cccd || '');
                        if (!idB || idB === idA || visited.has(idB)) continue;

                        const res = this.compareQuestions(itemA, itemB);

                        if (res.score >= threshold) {
                            currentCluster.push(itemB);
                            visited.add(idB);
                        }
                    }

                    if (currentCluster.length > 1) {
                        visited.add(idA);
                        // Ưu tiên câu làm Master:
                        // 1. Câu chưa bị đánh dấu duplicate
                        // 2. Câu có lời giải chi tiết hơn
                        // 3. Câu có mã CCCD nhỏ hơn (cấp sớm hơn)
                        currentCluster.sort((a, b) => {
                            if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? 1 : -1;
                            const lenA = (a.solution || '').length;
                            const lenB = (b.solution || '').length;
                            if (Math.abs(lenA - lenB) > 50) return lenB - lenA;
                            return parseInt(a.cccd || a.id || 0) - parseInt(b.cccd || b.id || 0);
                        });

                        const master = currentCluster[0];
                        const duplicates = currentCluster.slice(1).map(d => {
                            const cmp = this.compareQuestions(master, d);
                            return {
                                ...d,
                                matchScore: cmp.score,
                                matchDetails: cmp.details
                            };
                        });

                        clusters.push({
                            clusterId: `cluster_${clusters.length + 1}`,
                            master: master,
                            duplicates: duplicates,
                            maxScore: Math.max(...duplicates.map(d => d.matchScore || threshold))
                        });
                    }
                }

                if (onProgress && totalBuckets > 0) {
                    onProgress(Math.round((currentBucketIdx / totalBuckets) * 100));
                }
            }

            return clusters;
        },

        /**
         * 10. HÀM THỰC HIỆN GỘP CÂU TRÙNG (MERGE CLUSTER) TRÊN BỘ NHỚ
         */
        mergeCluster(masterId, duplicateIds, bankList) {
            if (!masterId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) return false;
            const mIdStr = String(masterId);
            const dupeIdSet = new Set(duplicateIds.map(String));

            // Tìm câu Master trong danh sách
            const masterItem = bankList.find(q => String(q.id) === mIdStr || String(q.cccd) === mIdStr);
            if (!masterItem) return false;

            masterItem.isMaster = true;
            masterItem.isDuplicate = false;
            masterItem.aliases = Array.from(new Set([
                ...(masterItem.aliases || []),
                ...dupeIdSet
            ]));
            masterItem.aliasCount = masterItem.aliases.length;

            // Đánh dấu các câu Duplicate
            bankList.forEach(q => {
                const qIdStr = String(q.id || q.cccd);
                if (dupeIdSet.has(qIdStr) && qIdStr !== mIdStr) {
                    q.isDuplicate = true;
                    q.isMaster = false;
                    q.masterId = mIdStr;
                }
            });

            return true;
        },

        /**
         * 11. HÀM HỦY GỘP (UNMERGE ALIAS) TRÊN BỘ NHỚ
         */
        unmergeQuestion(aliasId, masterId, bankList) {
            const aIdStr = String(aliasId);
            const mIdStr = String(masterId);

            // 1. Phục hồi câu Alias
            const aliasItem = bankList.find(q => String(q.id) === aIdStr || String(q.cccd) === aIdStr);
            if (aliasItem) {
                aliasItem.isDuplicate = false;
                aliasItem.isMaster = false;
                delete aliasItem.masterId;
            }

            // 2. Xóa alias khỏi câu Master
            const masterItem = bankList.find(q => String(q.id) === mIdStr || String(q.cccd) === mIdStr);
            if (masterItem && Array.isArray(masterItem.aliases)) {
                masterItem.aliases = masterItem.aliases.filter(id => String(id) !== aIdStr);
                masterItem.aliasCount = masterItem.aliases.length;
                if (masterItem.aliasCount === 0) {
                    delete masterItem.aliases;
                    delete masterItem.aliasCount;
                }
            }

            return true;
        },

        /**
         * 12. LƯU KẾT QUẢ GỘP LÊN CLOUDFLARE R2 VÀ ĐỒNG BỘ CATALOG TOÀN DIỆN
         */
        async persistMergeToR2(masterId, duplicateIds, bankList, bankService) {
            if (!masterId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
                return { success: false, message: 'Dữ liệu gộp không hợp lệ' };
            }

            const mIdStr = String(masterId);
            const dupeIdList = duplicateIds.map(String).filter(id => id !== mIdStr);

            // 1. Thực hiện gộp trên memory
            const ok = this.mergeCluster(mIdStr, dupeIdList, bankList);
            if (!ok) return { success: false, message: 'Không tìm thấy câu hỏi trong ngân hàng' };

            const masterItem = bankList.find(q => String(q.id) === mIdStr || String(q.cccd) === mIdStr);
            const dupeItems = bankList.filter(q => dupeIdList.includes(String(q.id || q.cccd)));

            const itemsToSave = [masterItem, ...dupeItems];

            // 2. Tải và đẩy lên R2 qua bankService hoặc fetch
            try {
                if (bankService && typeof bankService.uploadQuestionsToBank === 'function') {
                    await bankService.uploadQuestionsToBank(itemsToSave);
                } else {
                    const WORKER_UPLOAD_URL = "https://upload-helper.phamngockhanh-942001.workers.dev/";
                    for (const item of itemsToSave) {
                        const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' });
                        const fd = new FormData();
                        fd.append('file', blob, `bank/${item.id}.json`);
                        await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: fd });
                    }
                    if (bankService && typeof bankService.syncQuestionsToCatalog === 'function') {
                        await bankService.syncQuestionsToCatalog(itemsToSave);
                    }
                }

                // Cập nhật localStorage
                try {
                    localStorage.setItem('lms_cached_bank', JSON.stringify(bankList));
                } catch(e) {}

                return { success: true, count: dupeIdList.length, masterId: mIdStr };
            } catch (err) {
                console.error("Lỗi lưu gộp lên R2:", err);
                return { success: false, message: err.message };
            }
        },

        /**
         * 13. HỦY GỘP VÀ LƯU LÊN R2
         */
        async persistUnmergeToR2(aliasId, masterId, bankList, bankService) {
            const aIdStr = String(aliasId);
            const mIdStr = String(masterId);

            const ok = this.unmergeQuestion(aIdStr, mIdStr, bankList);
            if (!ok) return { success: false, message: 'Thao tác hủy gộp thất bại' };

            const aliasItem = bankList.find(q => String(q.id) === aIdStr || String(q.cccd) === aIdStr);
            const masterItem = bankList.find(q => String(q.id) === mIdStr || String(q.cccd) === mIdStr);

            const itemsToSave = [aliasItem, masterItem].filter(Boolean);

            try {
                if (bankService && typeof bankService.uploadQuestionsToBank === 'function') {
                    await bankService.uploadQuestionsToBank(itemsToSave);
                }
                try {
                    localStorage.setItem('lms_cached_bank', JSON.stringify(bankList));
                } catch(e) {}
                return { success: true };
            } catch(err) {
                console.error("Lỗi lưu hủy gộp lên R2:", err);
                return { success: false, message: err.message };
            }
        }
    };

    global.BankDeduplicator = BankDeduplicator;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BankDeduplicator;
    }

})(typeof window !== 'undefined' ? window : this);
