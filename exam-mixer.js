/**
 * exam-mixer.js - Module Trộn Đề Thi Chuyên Nghiệp (LaTeX & Word DOCX)
 * Hỗ trợ đảo câu hỏi, đảo phương án, phân nhóm mức độ ID6, đồng bộ lời giải Đúng/Sai \itemch
 * Xuất trọn bộ đề thi (Word / LaTeX) kèm bảng ma trận đáp án Excel và đóng gói ZIP.
 * Logic tham chiếu chuẩn từ MixerEngine (1.9.0.5)
 */

(function(global) {
    'use strict';
    const window = global;

    // =======================================================
    // 1. CÁC HÀM TIỆN ÍCH LÀM SẠCH VÀ PHÂN TÍCH TEXT
    // =======================================================
    function parseOptionsSafely(text, maxOpts = 4) {
        const blocks = [];
        let cur = text.trimStart();
        let lastMatchEndInOriginal = 0;

        while (cur.startsWith('{') && blocks.length < maxOpts) {
            let count = 0;
            let endIdx = -1;
            for (let i = 0; i < cur.length; i++) {
                if (cur[i] === '{') count++;
                else if (cur[i] === '}') {
                    count--;
                    if (count === 0) {
                        endIdx = i;
                        break;
                    }
                }
            }
            if (endIdx !== -1) {
                blocks.push(cur.substring(0, endIdx + 1));
                const consumed = endIdx + 1;
                const textAfter = cur.substring(consumed);
                const spacesLen = textAfter.length - textAfter.trimStart().length;
                cur = textAfter.trimStart();
                lastMatchEndInOriginal += consumed + spacesLen;
            } else {
                break;
            }
        }
        return { blocks, lastIdx: lastMatchEndInOriginal };
    }

    function shuffleArray(arr) {
        const res = [...arr];
        for (let i = res.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [res[i], res[j]] = [res[j], res[i]];
        }
        return res;
    }

    // =======================================================
    // 2. BỘ PHÂN TÍCH VÀ ĐẢO PHƯƠNG ÁN (PORT TỪ MIXER_CORE.PY)
    // =======================================================
    const REGEX_ID6 = /\[\d[A-Z0-9][A-Z0-9][YBKGTNHVC][A-Z0-9]-[A-Z0-9]\]/i;

    function getAnswerChoice(exText) {
        const m = exText.match(/\\choice\s*(?:\[[^\]]*\])?\s*(\{[\s\S]*)/);
        if (!m) return "A";
        const { blocks } = parseOptionsSafely(m[1], 4);
        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i].includes('\\True')) return String.fromCharCode(65 + i);
        }
        return "A";
    }

    function getAnswerChoiceTF(exText) {
        const m = exText.match(/\\choiceTF\s*(\{[\s\S]*)/);
        if (!m) return "SSSS";
        const { blocks } = parseOptionsSafely(m[1], 4);
        return blocks.map(b => (b.includes('\\True') ? 'Đ' : 'S')).join('');
    }

    function getAnswerShortRaw(exText) {
        const m = exText.match(/\\(?:shortans|SA)\s*(?:\[[^\]]*\])?\s*(\{[\s\S]*)/);
        if (m) {
            const { blocks } = parseOptionsSafely(m[1], 1);
            if (blocks && blocks.length > 0) {
                return blocks[0].trim().slice(1, -1);
            }
        }
        return "";
    }

    function cleanShortAnswer(rawAns) {
        if (!rawAns) return "";
        let s = String(rawAns).trim();
        s = s.replace(/<\/?(?:b|strong|i|em|span|p|div)\b[^>]*>/gi, '');
        s = s.replace(/\\(?:textbf|mathbf|text|mathrm|textrm|textit)\s*\{([^}]*)\}/gi, '$1');
        s = s.replace(/\\(?:textbf|mathbf|text|mathrm|textrm|textit)\b/gi, '');
        s = s.replace(/^\$+|\$+$/g, '').trim();
        s = s.replace(/\{([.,])\}/g, '$1');
        s = s.replace(/[\$\s\~]|\\,|\\;/g, '').replace(/\{,\}/g, ',').replace(/\./g, ',').trim();
        return s;
    }

    /**
     * Đảo phương án bên trong từng câu hỏi:
     * 1. \choiceTF: Đảo 4 mệnh đề và ĐỒNG BỘ đảo \itemch trong \begin{itemchoice}...\end{itemchoice}
     * 2. \choice: Đảo 4 phương án trắc nghiệm nhiều lựa chọn
     * Tôn trọng ký hiệu khóa ##
     */
    function shuffleOptionsInQuestion(exText) {
        // 1. Xử lý \choiceTF (Trắc nghiệm Đúng / Sai)
        const matchTf = exText.match(/(\\choiceTF\s*(?:\[[^\]]*\])?\s*)(\{[\s\S]*)/);
        if (matchTf) {
            const prefix = matchTf[1];
            const rest = matchTf[2];
            const { blocks: mainOps, lastIdx } = parseOptionsSafely(rest, 4);

            if (mainOps.length === 4) {
                const unlockedIdx = [0, 1, 2, 3].filter(i => !mainOps[i].includes("##"));
                const shuffledIdx = shuffleArray(unlockedIdx);

                const perm = [0, 1, 2, 3];
                for (let k = 0; k < unlockedIdx.length; k++) {
                    perm[unlockedIdx[k]] = shuffledIdx[k];
                }

                const newOps = [0, 1, 2, 3].map(i => mainOps[perm[i]].replace(/##/g, ""));
                const suffix = rest.substring(lastIdx);
                const tfReplaced = exText.substring(0, matchTf.index) + prefix + newOps.join('') + suffix;

                // Đồng bộ đảo \itemch trong lời giải \begin{itemchoice}...\end{itemchoice}
                const icMatch = tfReplaced.match(/(\\begin\{itemchoice\}(?:\[.*?\])?)([\s\S]*?)(\\end\{itemchoice\})/);
                if (icMatch) {
                    const icStart = icMatch[1];
                    const icInner = icMatch[2];
                    const icEnd = icMatch[3];

                    // Tách các mục theo \itemch
                    const parts = icInner.split(/(\\itemch(?![a-zA-Z]))/);
                    const header = parts[0] || '';
                    const items = [];
                    for (let k = 1; k < parts.length; k += 2) {
                        const cmd = parts[k];
                        const body = (k + 1 < parts.length) ? parts[k + 1] : '';
                        items.push(cmd + body);
                    }

                    if (items.length === 4) {
                        const newItems = [];
                        for (let i = 0; i < 4; i++) {
                            let itemContent = items[perm[i]];
                            const newLetter = String.fromCharCode(97 + i); // 'a', 'b', 'c', 'd'
                            itemContent = itemContent.replace(
                                /(\\itemch\s*(?:\\textbf\{)?)([a-d])([\)\.\}])/i,
                                (m, p1, p2, p3) => `${p1}${newLetter}${p3}`
                            );
                            newItems.push(itemContent);
                        }
                        const newIc = icStart + header + newItems.join('') + icEnd;
                        return tfReplaced.substring(0, icMatch.index) + newIc + tfReplaced.substring(icMatch.index + icMatch[0].length);
                    }
                }
                return tfReplaced;
            }
            return exText;
        }

        // 2. Xử lý \choice (Trắc nghiệm nhiều phương án)
        const matchCh = exText.match(/(\\choice\s*(?:\[[^\]]*\])?\s*)(\{[\s\S]*)/);
        if (!matchCh) return exText;

        const prefix = matchCh[1];
        const rest = matchCh[2];
        const { blocks: mainOps, lastIdx } = parseOptionsSafely(rest, 4);
        if (mainOps.length < 4) return exText;

        const suffix = rest.substring(lastIdx);
        const unlockedIdx = [0, 1, 2, 3].filter(i => !mainOps[i].includes("##"));
        const unlockedOps = unlockedIdx.map(i => mainOps[i]);
        const shuffledOps = shuffleArray(unlockedOps);

        const newOps = [...mainOps];
        for (let k = 0; k < unlockedIdx.length; k++) {
            newOps[unlockedIdx[k]] = shuffledOps[k];
        }
        const cleanedOps = newOps.map(op => op.replace(/##/g, ""));
        return exText.substring(0, matchCh.index) + prefix + cleanedOps.join('') + suffix;
    }

    /**
     * Đảo thứ tự câu hỏi thông minh theo phân nhóm mức độ nhận thức ID6
     */
    function smartShuffleQuestions(questionList, phanNhomMode = "Không phân nhóm") {
        if (!Array.isArray(questionList) || questionList.length <= 1) return questionList;

        const unlockedIndices = [];
        const unlockedItems = [];

        for (let i = 0; i < questionList.length; i++) {
            const item = questionList[i];
            const itemText = typeof item === 'object' ? (item.rawLatex || item.content || '') : String(item);
            if (!itemText.includes("##")) {
                unlockedIndices.push(i);
                unlockedItems.push(item);
            }
        }

        let shuffledItems = [];

        if (phanNhomMode === "Không phân nhóm") {
            shuffledItems = shuffleArray(unlockedItems);
        } else {
            // Phân 4 cấp độ: Biết (1), Hiểu (2), Vận dụng (3), Vận dụng cao (4)
            let groups = { 1: [], 2: [], 3: [], 4: [], 99: [] };

            for (const item of unlockedItems) {
                const itemText = typeof item === 'object' ? (item.rawLatex || item.content || '') : String(item);
                const match = itemText.match(REGEX_ID6);
                if (match) {
                    const tag = match[0];
                    const mucDo = tag[4] ? tag[4].toUpperCase() : '';
                    if (['N', 'Y', 'B'].includes(mucDo)) groups[1].push(item);
                    else if (['H', 'K'].includes(mucDo)) groups[2].push(item);
                    else if (['V', 'G'].includes(mucDo)) groups[3].push(item);
                    else if (['C', 'T'].includes(mucDo)) groups[4].push(item);
                    else groups[99].push(item);
                } else if (typeof item === 'object' && item.level) {
                    const lvl = String(item.level).toLowerCase();
                    if (lvl.includes('nhận biết') || lvl.includes('nb')) groups[1].push(item);
                    else if (lvl.includes('thông hiểu') || lvl.includes('th')) groups[2].push(item);
                    else if (lvl.includes('vận dụng cao') || lvl.includes('vdc')) groups[4].push(item);
                    else if (lvl.includes('vận dụng') || lvl.includes('vd')) groups[3].push(item);
                    else groups[99].push(item);
                } else {
                    const tagMatch = itemText.match(/(?:\[|\()(?:\s*)(NB|TH|VDC|VD|B|H|C|V|Nhận\s*biết|Thông\s*hiểu|Vận\s*dụng\s*cao|Vận\s*dụng|Mức\s*độ\s*[1-4]|MĐ\s*[1-4])(?:\s*)(?:\]|\))/i);
                    if (tagMatch) {
                        const tag = tagMatch[1].toUpperCase().replace(/\s+/g, '');
                        if (['NB', 'B', 'NHẬNBIẾT', 'MỨCĐỘ1', 'MĐ1'].includes(tag)) groups[1].push(item);
                        else if (['TH', 'H', 'THÔNGHIỂU', 'MỨCĐỘ2', 'MĐ2'].includes(tag)) groups[2].push(item);
                        else if (['VDC', 'C', 'VẬNDỤNGCAO', 'MỨCĐỘ4', 'MĐ4'].includes(tag)) groups[4].push(item);
                        else if (['VD', 'V', 'VẬNDỤNG', 'MỨCĐỘ3', 'MĐ3'].includes(tag)) groups[3].push(item);
                        else groups[99].push(item);
                    } else {
                        groups[99].push(item);
                    }
                }
            }

            // Nếu câu hỏi trong đề gốc không có tag mức độ, phân nhóm tuần tự từ dễ đến khó theo cấu hình
            const taggedCount = groups[1].length + groups[2].length + groups[3].length + groups[4].length;
            if (taggedCount === 0 && groups[99].length > 1) {
                const allItems = [...groups[99]];
                groups = { 1: [], 2: [], 3: [], 4: [], 99: [] };
                const N = allItems.length;

                if (phanNhomMode.includes("2 nhóm")) {
                    const mid = Math.ceil(N / 2);
                    groups[1] = allItems.slice(0, mid);
                    groups[3] = allItems.slice(mid);
                } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu < VD, VDC")) {
                    const p1 = Math.round(N * 0.35);
                    const p2 = Math.round(N * 0.35);
                    groups[1] = allItems.slice(0, p1);
                    groups[2] = allItems.slice(p1, p1 + p2);
                    groups[3] = allItems.slice(p1 + p2);
                } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu, VD < VDC")) {
                    const p1 = Math.round(N * 0.30);
                    const p2 = Math.round(N * 0.50);
                    groups[1] = allItems.slice(0, p1);
                    groups[2] = allItems.slice(p1, p1 + p2);
                    groups[4] = allItems.slice(p1 + p2);
                } else {
                    const q1 = Math.round(N * 0.25);
                    const q2 = Math.round(N * 0.25);
                    const q3 = Math.round(N * 0.25);
                    groups[1] = allItems.slice(0, q1);
                    groups[2] = allItems.slice(q1, q1 + q2);
                    groups[3] = allItems.slice(q1 + q2, q1 + q2 + q3);
                    groups[4] = allItems.slice(q1 + q2 + q3);
                }
            }

            // Trộn ngẫu nhiên câu hỏi bên trong từng nhóm
            for (const k in groups) {
                if (groups[k].length > 1) {
                    groups[k] = shuffleArray(groups[k]);
                }
            }

            // Lắp ráp thứ tự theo cấu hình
            if (phanNhomMode.includes("2 nhóm")) {
                const de = shuffleArray([...groups[1], ...groups[2]]);
                const kho = shuffleArray([...groups[3], ...groups[4]]);
                shuffledItems = [...de, ...kho, ...groups[99]];
            } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu < VD, VDC")) {
                const kho = shuffleArray([...groups[3], ...groups[4]]);
                shuffledItems = [...groups[1], ...groups[2], ...kho, ...groups[99]];
            } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu, VD < VDC")) {
                const tb = shuffleArray([...groups[2], ...groups[3]]);
                shuffledItems = [...groups[1], ...tb, ...groups[4], ...groups[99]];
            } else {
                // 4 nhóm mặc định
                shuffledItems = [...groups[1], ...groups[2], ...groups[3], ...groups[4], ...groups[99]];
            }
        }

        const result = [...questionList];
        for (let k = 0; k < unlockedIndices.length; k++) {
            result[unlockedIndices[k]] = shuffledItems[k];
        }

        // Xóa dấu khóa ## khi xuất ra đề thi
        return result.map(item => {
            if (typeof item === 'string') return item.replace(/##/g, "");
            return item;
        });
    }

    // =======================================================
    // 2.5. ĐỘNG CƠ TRỘN FILE WORD TRỰC TIẾP (DOCX DIRECT MIXER)
    // BẢO TOÀN 100% TOÀN BỘ CÔNG THỨC MATHTYPE OLE VÀ OMML
    // KHÔNG CHUYỂN QUA LATEX ĐỂ TRÁNH MẤT/HỎNG CÔNG THỨC
    // =======================================================
    class DocxDirectMixer {
        constructor(docxBuffer, config = {}) {
            this.docxBuffer = docxBuffer;
            this.config = {
                so_de: config.so_de || 4,
                ma_de_list: config.ma_de_list || ['1001', '1002', '1003', '1004'],
                dao_cau: config.dao_cau !== false,
                dao_pa: config.dao_pa !== false,
                dao_y_tf: config.dao_y_tf !== false,
                phannhom: config.phannhom || 'Không phân nhóm',
                header: config.header || {},
                ...config
            };
            this.relsMap = {};
            this.oleDataMap = {};
        }

        static extractTextFromMtef(binBuf) {
            if (!binBuf) return '';
            let idx = -1;
            for (let i = 0; i < binBuf.length - 4; i++) {
                if (binBuf[i] === 0x05 && binBuf[i+1] === 0x01) {
                    idx = i;
                    break;
                }
            }
            if (idx === -1) return '';

            let lineIdx = -1;
            for (let j = idx; j < binBuf.length - 2; j++) {
                if (binBuf[j] === 0x0a && (binBuf[j+1] === 0x01 || binBuf[j+1] === 0x00)) {
                    lineIdx = j;
                    break;
                }
            }
            const startPos = lineIdx !== -1 ? lineIdx : idx + 30;

            let str = '';
            let p = startPos;
            while (p < binBuf.length - 1) {
                const tag = binBuf[p];
                if (tag === 0x02) { // CHAR
                    p++;
                    const opts = binBuf[p++];
                    let typeface = binBuf[p++];
                    if (p + 1 < binBuf.length) {
                        const code = binBuf[p] | (binBuf[p+1] << 8);
                        p += 2;
                        if (code === 0x2212 || code === 0x002d) {
                            str += '-';
                        } else if (code >= 32 && code <= 126) {
                            str += String.fromCharCode(code);
                        } else if (code === 0x00a0) {
                            str += ' ';
                        }
                        if (opts & 0x04) {
                            p++;
                        }
                    }
                } else if (tag === 0x00) {
                    p++;
                } else if (tag === 0x0a) {
                    p += 3;
                } else if (tag === 0x09) {
                    p += 3;
                } else {
                    p++;
                }
            }
            return str.trim();
        }

        extractTextFromOleRId(rId) {
            if (!rId || !this.relsMap) return '';
            const target = this.relsMap[rId];
            if (!target) return '';
            const binBuf = this.oleDataMap[target] || this.oleDataMap[`word/${target}`];
            if (!binBuf) return '';
            return DocxDirectMixer.extractTextFromMtef(binBuf);
        }

        parseSummaryAnswersFromTables(footerElements) {
            const summary = { p1: [], p2: [], p3: [] };
            if (!footerElements || footerElements.length === 0) return summary;

            const extractOle = (cellXml) => {
                const m = cellXml.match(/<o:OLEObject\b[^>]*r:id="([^"]+)"/i);
                if (!m) return '';
                return this.extractTextFromOleRId(m[1]);
            };

            footerElements.forEach(el => {
                if (el.tag !== 'w:tbl') return;
                const tblXml = el.xml;
                const rows = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
                if (rows.length < 2) return;

                const row0Cells = rows[0].match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
                const row0Texts = row0Cells.map(c => (c.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('').trim());

                const row1Cells = rows[1].match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
                const row1Texts = row1Cells.map(c => (c.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('').trim());

                // Part I check
                if (row0Texts.some(t => /^Câu\s*\d+$/i.test(t)) && row1Texts.some(t => /^[A-D]$/i.test(t))) {
                    row0Texts.forEach((t, cIdx) => {
                        const m = t.match(/^Câu\s*(\d+)$/i);
                        if (m && cIdx < row1Texts.length) {
                            const qNum = parseInt(m[1], 10);
                            const ans = row1Texts[cIdx].toUpperCase();
                            if (/^[A-D]$/.test(ans)) {
                                summary.p1[qNum - 1] = ans;
                            }
                        }
                    });
                }

                // Part II check: Header has 'Ý a)', 'Ý b)', 'Ý c)', 'Ý d)'
                if (row0Texts.some(t => /Ý\s*a\)/i.test(t)) && rows.length >= 2) {
                    for (let r = 1; r < rows.length; r++) {
                        const rCells = rows[r].match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
                        const rTexts = rCells.map(c => (c.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('').trim());
                        if (rTexts.length >= 5) {
                            const qNumMatch = rTexts[0].match(/(\d+)/);
                            if (qNumMatch) {
                                const qNum = parseInt(qNumMatch[1], 10);
                                const tfStr = rTexts.slice(1, 5).map(s => s.toUpperCase().startsWith('Đ') ? 'Đ' : 'S').join('');
                                summary.p2[qNum - 1] = tfStr;
                            }
                        }
                    }
                }

                // Part III check: Row 0 has 'Câu 1'..'Câu 6', Row 1 has OLE or numbers
                if (row0Texts.some(t => /^Câu\s*\d+$/i.test(t)) && !row1Texts.some(t => /^[A-D]$/i.test(t))) {
                    row0Texts.forEach((t, cIdx) => {
                        const m = t.match(/^Câu\s*(\d+)$/i);
                        if (m && cIdx < row1Cells.length) {
                            const qNum = parseInt(m[1], 10);
                            let ans = extractOle(row1Cells[cIdx]);
                            if (!ans && cIdx < row1Texts.length) {
                                ans = row1Texts[cIdx];
                            }
                            if (ans) {
                                summary.p3[qNum - 1] = cleanShortAnswer(ans);
                            }
                        }
                    });
                }
            });

            return summary;
        }

        async mix(onProgress = () => {}) {
            onProgress(10, "Đang mở cấu trúc tệp Word DOCX gốc...");
            const srcZip = await JSZip.loadAsync(this.docxBuffer);
            const docXml = await srcZip.file('word/document.xml').async('text');

            // Nạp bảng quan hệ rels để liên kết OLE object rId
            this.relsMap = {};
            if (srcZip.file('word/_rels/document.xml.rels')) {
                const relsXml = await srcZip.file('word/_rels/document.xml.rels').async('text');
                const relRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
                let rm;
                while ((rm = relRegex.exec(relsXml)) !== null) {
                    this.relsMap[rm[1]] = rm[2];
                }
            }

            // Nạp dữ liệu nhị phân của các file OLE MathType
            this.oleDataMap = {};
            for (const path of Object.keys(srcZip.files)) {
                if (path.startsWith('word/embeddings/')) {
                    const binBuf = await srcZip.file(path).async('uint8array');
                    this.oleDataMap[path] = binBuf;
                    this.oleDataMap[path.replace('word/', '')] = binBuf;
                }
            }

            onProgress(15, "Đang phân tích cấu trúc các câu hỏi và công thức MathType...");
            const parsed = this.parseDocx(docXml);

            const maDeList = this.config.ma_de_list;
            const totalExams = maDeList.length;
            const outExams = {};
            const matrixData = [];

            // 1. Phân tích đáp án đề gốc
            const gocAnswers = this.extractExamAnswers(parsed.sections);
            matrixData.push({
                made: "GỐC",
                isGoc: true,
                p1: gocAnswers.p1,
                p2: gocAnswers.p2,
                p3: gocAnswers.p3,
                p3_raw: gocAnswers.p3
            });

            // 2. Tạo đề gốc De_Goc.docx (chuẩn hóa mã đề, gỡ gạch chân đáp án để phát cho học sinh)
            onProgress(22, "Đang tạo file Word Đề Gốc...");
            const gocDocXml = this.buildExamXml(parsed, {
                examCode: "GỐC",
                shuffleQuestions: false,
                shuffleOptions: false,
                keepUnderlines: false
            });
            const gocZip = await JSZip.loadAsync(this.docxBuffer);
            gocZip.file('word/document.xml', gocDocXml);
            outExams["De_Goc.docx"] = await gocZip.generateAsync({ type: 'uint8array' });

            // 3. Tạo file HuongDanGiai.docx (giữ nguyên vị trí đề gốc, giữ lại lời giải và gạch chân đáp án đúng)
            onProgress(26, "Đang tạo file Lời giải chi tiết Đề Gốc...");
            const hdgDocXml = this.buildExamXml(parsed, {
                examCode: "GỐC",
                shuffleQuestions: false,
                shuffleOptions: false,
                keepUnderlines: true,
                titleSuffix: " - HƯỚNG DẪN GIẢI"
            });
            const hdgZip = await JSZip.loadAsync(this.docxBuffer);
            hdgZip.file('word/document.xml', hdgDocXml);
            const huongDanGiai = await hdgZip.generateAsync({ type: 'uint8array' });

            // 4. Trộn từng mã đề thi con
            for (let idx = 0; idx < totalExams; idx++) {
                const maDe = maDeList[idx];
                const pct = 30 + Math.floor((idx / totalExams) * 45);
                onProgress(pct, `Đang trộn đề Word mã ${maDe} (${idx + 1}/${totalExams})...`);

                const mixed = this.buildMixedExam(parsed, maDe);
                const childZip = await JSZip.loadAsync(this.docxBuffer);
                childZip.file('word/document.xml', mixed.docXml);
                outExams[`De_${maDe}.docx`] = await childZip.generateAsync({ type: 'uint8array' });

                matrixData.push({
                    made: maDe,
                    isGoc: false,
                    p1: mixed.answers.p1,
                    p2: mixed.answers.p2,
                    p3: mixed.answers.p3,
                    p3_raw: mixed.answers.p3
                });
            }

            return {
                exams: outExams,
                huongDanGiai,
                matrixData,
                maDeList,
                totalQuestions: parsed.totalQuestions
            };
        }

        hasUnderlineOrHighlight(xml) {
            if (!xml) return false;
            const hasU = /<w:u\b(?![^>]*w:val="none")[^>]*\/>|<w:u\b(?![^>]*w:val="none")[^>]*>[\s\S]*?<\/w:u>/i.test(xml);
            const hasH = /<w:highlight\b(?![^>]*w:val="none")[^>]*\/>|<w:highlight\b(?![^>]*w:val="none")[^>]*>[\s\S]*?<\/w:highlight>/i.test(xml);
            return hasU || hasH;
        }

        buildExamHeaderXml(examCode, titleSuffix = '') {
            const h = this.config.header || {};
            const meta = this.detectedHeaderMeta || {};
            const agency = (h.agency || meta.agency || 'SỞ GD&ĐT HÀ NỘI').trim();
            const school = (h.school || meta.school || 'TRƯỜNG THPT TRẦN QUANG KHẢI').trim();
            let title = (h.title || meta.title || 'KIỂM TRA HỌC KỲ I').trim();
            if (titleSuffix) title += titleSuffix;
            const examType = (h.examType || '(ĐỀ CHÍNH THỨC)').trim();
            const subject = (h.subject || meta.subject || 'TOÁN HỌC').trim();
            const grade = h.grade ? String(h.grade).trim() : (meta.grade || '');
            const duration = h.duration || meta.duration || 90;
            const cleanCode = String(examCode || '1001').trim();

            const escapeXml = (str) => {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            };

            const gradeText = grade ? ` - KHỐI ${escapeXml(grade)}` : '';

            return `
            <w:tbl>
                <w:tblPr>
                    <w:tblW w:w="10773" w:type="dxa"/>
                    <w:tblBorders>
                        <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
                        <w:insideH w:val="none"/><w:insideV w:val="none"/>
                    </w:tblBorders>
                </w:tblPr>
                <w:tblGrid>
                    <w:gridCol w:w="4400"/>
                    <w:gridCol w:w="6373"/>
                </w:tblGrid>
                <w:tr>
                    <!-- CỘT 1 (BÊN TRÁI: SỞ / TRƯỜNG / LOẠI ĐỀ) -->
                    <w:tc>
                        <w:tcPr><w:tcW w:w="4400" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(agency.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:u w:val="single"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(school.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(examType.toUpperCase())}</w:t></w:r>
                        </w:p>
                    </w:tc>
                    <!-- CỘT 2 (BÊN PHẢI: TÊN ĐỀ / MÔN / THỜI GIAN) -->
                    <w:tc>
                        <w:tcPr><w:tcW w:w="6373" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(title.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>MÔN THI: ${escapeXml(subject.toUpperCase())}${gradeText}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:u w:val="single"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>Thời gian làm bài: ${duration} phút, không kể thời gian phát đề</w:t></w:r>
                        </w:p>
                    </w:tc>
                </w:tr>
            </w:tbl>
            <!-- BẢNG KHUNG HỌ TÊN VÀ Ô MÃ ĐỀ ĐÓNG KHUNG -->
            <w:tbl>
                <w:tblPr>
                    <w:tblW w:w="10773" w:type="dxa"/>
                    <w:tblBorders>
                        <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
                        <w:insideH w:val="none"/><w:insideV w:val="none"/>
                    </w:tblBorders>
                </w:tblPr>
                <w:tblGrid>
                    <w:gridCol w:w="8173"/>
                    <w:gridCol w:w="2600"/>
                </w:tblGrid>
                <w:tr>
                    <w:tc>
                        <w:tcPr><w:tcW w:w="8173" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
                                <w:t xml:space="preserve">Họ và tên thí sinh: .................................................... Số báo danh: ................</w:t>
                            </w:r>
                        </w:p>
                    </w:tc>
                    <w:tc>
                        <w:tcPr>
                            <w:tcW w:w="2600" w:type="dxa"/>
                            <w:tcBorders>
                                <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                                <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                                <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                                <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                            </w:tcBorders>
                            <w:vAlign w:val="center"/>
                        </w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                                <w:t>Mã đề ${escapeXml(cleanCode)}</w:t>
                            </w:r>
                        </w:p>
                    </w:tc>
                </w:tr>
            </w:tbl>
            <w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>`;
        }

        buildExamFooterXml() {
            return `
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="80"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
                    <w:t xml:space="preserve">------------------- HẾT -------------------</w:t>
                </w:r>
            </w:p>
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="160"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
                    <w:t>Thí sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm.</w:t>
                </w:r>
            </w:p>`;
        }

        parseDocx(docXml) {
            const bodyMatch = docXml.match(/([\s\S]*?<w:body>)([\s\S]*?)(<w:sectPr\b[\s\S]*?<\/w:body>[\s\S]*)/);
            if (!bodyMatch) throw new Error("Cấu trúc file Word không đúng chuẩn (không tìm thấy <w:body>)");

            const preBody = bodyMatch[1];
            const bodyContent = bodyMatch[2];
            const postBody = bodyMatch[3];

            const elementRegex = /<(w:p|w:tbl)\b[^>]*>[\s\S]*?<\/\1>/g;
            let match;
            const elements = [];
            while ((match = elementRegex.exec(bodyContent)) !== null) {
                const xml = match[0];
                const text = (xml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [])
                    .map(t => t.replace(/<[^>]+>/g, ''))
                    .join('');
                elements.push({ tag: match[1], xml, text });
            }

            const qStartRegex = /^(?:\[(?:NB|TH|VD|VDC|\w+)\]\s*)?(?:##\s*)?(?:Câu|Bài|Question)\s*(\d+)[:.\s]/i;
            const secStartRegex = /^\s*(?:PHẦN|Phần)\s+(I{1,3}|IV|[1-4])[:.\s]/i;

            const isEndOfExam = (text) => {
                const t = text.trim();
                if (!t) return false;
                if (/^[-_\s*~—–]*H(?:Ế|ế|E|e)T[-_\s*~—–]*$/i.test(t)) return true;
                if (/^(?:-{2,}|_{2,}|\*{2,})\s*H(?:Ế|ế|E|e)T\s*(?:-{2,}|_{2,}|\*{2,})$/i.test(t)) return true;
                if (/^\(?\s*H(?:Ế|ế|E|e)T\s*\)?$/i.test(t)) return true;
                if (/^\s*(?:HẾT|Hết)\s*[\.\-—–]*\s*(?:Thí\s*sinh|Cán\s*bộ|Giám\s*thị)/i.test(t)) return true;
                return false;
            };

            let firstContentIdx = elements.findIndex(e => qStartRegex.test(e.text.trim()) || secStartRegex.test(e.text.trim()));
            if (firstContentIdx === -1) firstContentIdx = 0;

            const headerElements = elements.slice(0, firstContentIdx);
            const rawMainElements = elements.slice(firstContentIdx);

            // Trích xuất metadata từ header cũ nếu có để làm giá trị mặc định cho tiêu đề mới
            const meta = {};
            headerElements.forEach(e => {
                const t = e.text.trim();
                if (/SỞ\s+GD|PHÒNG\s+GD|BỘ\s+GD/i.test(t)) {
                    const m = t.match(/((?:SỞ|PHÒNG|BỘ)\s+GD[^\n\r]+)/i);
                    if (m && !meta.agency) meta.agency = m[1].trim();
                }
                if (/TRƯỜNG\s+THPT|TRƯỜNG\s+THCS|TRƯỜNG\s+TIỂU\s+HỌC/i.test(t)) {
                    const m = t.match(/(TRƯỜNG\s+(?:THPT|THCS|TIỂU\s+HỌC)[^\n\r]+)/i);
                    if (m && !meta.school) meta.school = m[1].trim();
                }
                if (/MÔN(?:\s+THI)?\s*[:\s]*([^\n\r\-–]+)/i.test(t)) {
                    const m = t.match(/MÔN(?:\s+THI)?\s*[:\s]*([^\n\r\-–]+)/i);
                    if (m && !meta.subject) meta.subject = m[1].trim();
                }
                if (/Thời\s*gian\s*(?:làm\s*bài)?\s*[:\s]*(\d+)\s*phút/i.test(t)) {
                    const m = t.match(/Thời\s*gian\s*(?:làm\s*bài)?\s*[:\s]*(\d+)\s*phút/i);
                    if (m && !meta.duration) meta.duration = parseInt(m[1], 10);
                }
            });
            this.detectedHeaderMeta = meta;

            // Tách các phần tử sau chữ HẾT vào footerElements (không trộn vào câu hỏi)
            const mainElements = [];
            const footerElements = [];
            let examEnded = false;

            for (const el of rawMainElements) {
                const trimmed = el.text.trim();
                if (examEnded) {
                    footerElements.push(el);
                    continue;
                }
                if (isEndOfExam(trimmed)) {
                    examEnded = true;
                    footerElements.push(el);
                    continue;
                }
                mainElements.push(el);
            }

            const sections = [];
            let currentSec = { titleEl: null, questions: [] };
            sections.push(currentSec);

            let currentQ = null;
            let qCounter = 0;

            for (const el of mainElements) {
                const trimmed = el.text.trim();

                if (secStartRegex.test(trimmed)) {
                    if (currentQ) {
                        currentSec.questions.push(currentQ);
                        currentQ = null;
                    }
                    currentSec = { titleEl: el, questions: [] };
                    if (/PHẦN\s+(?:I\b|1\b)/i.test(trimmed)) currentSec.part = 'choice';
                    else if (/PHẦN\s+(?:II\b|2\b)/i.test(trimmed)) currentSec.part = 'tf';
                    else if (/PHẦN\s+(?:III\b|3\b)/i.test(trimmed)) currentSec.part = 'short';
                    else if (/PHẦN\s+(?:IV\b|4\b)/i.test(trimmed)) currentSec.part = 'essay';
                    sections.push(currentSec);
                    continue;
                }

                if (qStartRegex.test(trimmed)) {
                    if (currentQ) {
                        currentSec.questions.push(currentQ);
                    }
                    qCounter++;
                    currentQ = {
                        id: qCounter,
                        originalNum: parseInt((trimmed.match(qStartRegex) || [])[1] || qCounter, 10),
                        elements: [el],
                        type: 'choice',
                        isLocked: trimmed.includes('##')
                    };
                } else if (currentQ) {
                    currentQ.elements.push(el);
                } else {
                    if (!currentSec.introElements) currentSec.introElements = [];
                    currentSec.introElements.push(el);
                }
            }
            if (currentQ) currentSec.questions.push(currentQ);

            if (!sections[0].part && sections.length > 1 && sections[1].part === 'tf') {
                sections[0].part = 'choice';
            }

            // Trích xuất đáp án từ Bảng Đáp Án Tổng Hợp ở cuối tài liệu (nếu có)
            const summaryAnswers = this.parseSummaryAnswersFromTables(footerElements);

            // Chuẩn hóa tiêu đề các Phần theo chuẩn Bộ GD&ĐT 2025 (Chữ màu đen, 1 dòng, in đậm toàn bộ)
            const hasMultipleSections = sections.length > 1;
            if (hasMultipleSections) {
                if (!sections[0].titleEl && sections[1] && sections[1].titleEl && /PHẦN\s+(?:II|2)/i.test(sections[1].titleEl.text)) {
                    const p1Count = sections[0].questions.length;
                    const p1Text = `PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu ${p1Count}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`;
                    const p1Xml = `<w:p><w:pPr><w:spacing w:before="240" w:after="80" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${p1Text}</w:t></w:r></w:p>`;
                    sections[0].titleEl = { tag: 'w:p', xml: p1Xml, text: p1Text };
                }

                sections.forEach((sec) => {
                    if (!sec.titleEl) return;
                    const tText = sec.titleEl.text.trim();
                    const qCount = sec.questions.length;
                    let normText = '';
                    if (/PHẦN\s+(?:I\b|1\b)/i.test(tText)) {
                        normText = `PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu ${qCount}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`;
                    } else if (/PHẦN\s+(?:II\b|2\b)/i.test(tText)) {
                        normText = `PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu ${qCount}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`;
                    } else if (/PHẦN\s+(?:III\b|3\b)/i.test(tText)) {
                        normText = `PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu ${qCount}.`;
                    } else if (/PHẦN\s+(?:IV\b|4\b)/i.test(tText)) {
                        normText = `PHẦN IV. Tự luận. Thí sinh trình bày chi tiết lời giải từ câu 1 đến câu ${qCount}.`;
                    }

                    if (normText) {
                        sec.titleEl.xml = `<w:p><w:pPr><w:spacing w:before="240" w:after="80" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${normText}</w:t></w:r></w:p>`;
                        sec.titleEl.text = normText;
                    } else {
                        sec.titleEl.xml = sec.titleEl.xml.replace(/<w:color\b[^>]*\/>/g, '').replace(/<w:color\b[^>]*>[\s\S]*?<\/w:color>/g, '');
                    }
                });
            }

            let totalQ = 0;
            sections.forEach(sec => {
                sec.questions.forEach(q => {
                    totalQ++;
                    this.analyzeQuestion(q, sec, summaryAnswers);
                });
            });

            return { preBody, headerElements, sections, footerElements, postBody, totalQuestions: totalQ };
        }

        detectQuestionLevel(q) {
            const fullText = (q.elements || []).map(e => e.text || '').join(' ');
            
            // 1. Kiểm tra mã ID6: [9H4N1-1], [2D1B1-1], %[9H4N1-1], etc.
            const id6Match = fullText.match(/(?:\[|%\[)\d[A-Z0-9][A-Z0-9]([YBKGTNHVC])[A-Z0-9]-[A-Z0-9]\]/i);
            if (id6Match) {
                const code = id6Match[1].toUpperCase();
                if (['N', 'Y', 'B'].includes(code)) return 1; // Biết / Nhận biết
                if (['H', 'K'].includes(code)) return 2;      // Hiểu / Thông hiểu
                if (['V', 'G'].includes(code)) return 3;      // Vận dụng
                if (['C', 'T'].includes(code)) return 4;      // Vận dụng cao
            }

            // 2. Kiểm tra tag mức độ: [NB], [TH], [VD], [VDC], [B], [H], [V], [C]
            const tagMatch = fullText.match(/(?:\[|\()(?:\s*)(NB|TH|VDC|VD|B|H|C|V|Nhận\s*biết|Thông\s*hiểu|Vận\s*dụng\s*cao|Vận\s*dụng|Mức\s*độ\s*[1-4]|MĐ\s*[1-4])(?:\s*)(?:\]|\))/i);
            if (tagMatch) {
                const tag = tagMatch[1].toUpperCase().replace(/\s+/g, '');
                if (['NB', 'B', 'NHẬNBIẾT', 'MỨCĐỘ1', 'MĐ1'].includes(tag)) return 1;
                if (['TH', 'H', 'THÔNGHIỂU', 'MỨCĐỘ2', 'MĐ2'].includes(tag)) return 2;
                if (['VDC', 'C', 'VẬNDỤNGCAO', 'MỨCĐỘ4', 'MĐ4'].includes(tag)) return 4;
                if (['VD', 'V', 'VẬNDỤNG', 'MỨCĐỘ3', 'MĐ3'].includes(tag)) return 3;
            }

            return 99; // Không xác định mức độ
        }

        analyzeQuestion(q, sec, summaryAnswers = { p1: [], p2: [], p3: [] }) {
            const fullText = q.elements.map(e => e.text).join('\n');
            const qNum = q.originalNum || q.id;
            q.level = this.detectQuestionLevel(q);

            // 1. Kiểm tra câu trắc nghiệm Đúng / Sai (Part II)
            const hasTfStatements = q.elements.filter(el => /^\s*([a-d])[.)]\s*/i.test(el.text.trim())).length >= 2;
            const isTf = sec?.part === 'tf' || hasTfStatements;

            if (isTf) {
                q.type = 'tf';
                q.tfStatements = [];
                q.correctTf = {};
                const sumAns = summaryAnswers?.p2 && summaryAnswers.p2[qNum - 1]; // e.g. 'SSĐS'

                q.elements.forEach((el, idx) => {
                    const tr = el.text.trim();
                    const m = tr.match(/^([a-d])[.)]\s*(.*)/i);
                    if (m) {
                        const letter = m[1].toLowerCase();
                        q.tfStatements.push({ elIdx: idx, letter });
                        const lIdx = ['a', 'b', 'c', 'd'].indexOf(letter);
                        if (sumAns && lIdx !== -1 && lIdx < sumAns.length) {
                            q.correctTf[letter] = sumAns[lIdx];
                        } else {
                            const content = m[2];
                            const valMatch = content.match(/\b(ĐÚNG|SAI|Đ|S)\b/i) || content.match(/\((Đ|S|Đúng|Sai)\)/i);
                            if (valMatch) {
                                q.correctTf[letter] = valMatch[1].toUpperCase().startsWith('Đ') ? 'Đ' : 'S';
                            } else if (this.hasUnderlineOrHighlight(el.xml)) {
                                q.correctTf[letter] = 'Đ';
                            } else {
                                q.correctTf[letter] = 'S';
                            }
                        }
                    }
                });
                return;
            }

            // 2. Kiểm tra câu trả lời ngắn (Part III)
            if (sec?.part === 'short') {
                q.type = 'short';
                const sumAns = summaryAnswers?.p3 && summaryAnswers.p3[qNum - 1];
                if (sumAns) {
                    q.correctAnswer = sumAns;
                    return;
                }
                let rawAns = '';
                for (const el of q.elements) {
                    const tr = el.text.trim();
                    if (/^\s*(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=]/i.test(tr)) {
                        const oleMatch = el.xml.match(/<o:OLEObject\b[^>]*r:id="([^"]+)"/i);
                        if (oleMatch) {
                            rawAns = this.extractTextFromOleRId(oleMatch[1]);
                            if (rawAns) break;
                        }
                        const textAfter = tr.replace(/^\s*(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=]\s*/i, '').trim();
                        if (textAfter && !/^(?:Lời\s*giải|HDG)/i.test(textAfter)) {
                            rawAns = textAfter;
                            break;
                        }
                    }
                }
                if (!rawAns) {
                    for (const el of q.elements) {
                        const oleMatch = el.xml.match(/<o:OLEObject\b[^>]*r:id="([^"]+)"/i);
                        if (oleMatch && /Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả/i.test(el.text)) {
                            rawAns = this.extractTextFromOleRId(oleMatch[1]);
                            if (rawAns) break;
                        }
                    }
                }
                q.correctAnswer = cleanShortAnswer(rawAns);
                return;
            }

            // 3. Kiểm tra câu trắc nghiệm 4 phương án A, B, C, D (Part I)
            let optType = null;
            let optElIdx = -1;

            q.elements.forEach((el, idx) => {
                if (el.tag === 'w:tbl') {
                    const cells = el.xml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
                    const cellTexts = cells.map(c => (c.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
                    if (cellTexts.some(t => /^\s*A\./.test(t)) && cellTexts.some(t => /^\s*B\./.test(t))) {
                        optType = 'table';
                        optElIdx = idx;
                    }
                } else if (el.tag === 'w:p') {
                    const t = el.text;
                    if (/A\..*?B\..*?C\..*?D\./.test(t)) {
                        optType = 'single_para';
                        optElIdx = idx;
                    }
                }
            });

            if (!optType) {
                for (let i = 0; i <= q.elements.length - 4; i++) {
                    const t0 = q.elements[i].text.trim();
                    const t1 = q.elements[i+1].text.trim();
                    const t2 = q.elements[i+2].text.trim();
                    const t3 = q.elements[i+3].text.trim();
                    if (/^A\./.test(t0) && /^B\./.test(t1) && /^C\./.test(t2) && /^D\./.test(t3)) {
                        optType = '4_paras';
                        optElIdx = i;
                        break;
                    }
                }
            }

            q.type = 'choice';
            q.optType = optType;
            q.optElIdx = optElIdx;

            const sumAns = summaryAnswers?.p1 && summaryAnswers.p1[qNum - 1];
            if (sumAns) {
                q.correctAnswer = sumAns;
            } else {
                q.correctAnswer = this.detectOriginalAnswer(q);
            }
        }

        detectOriginalAnswer(q) {
            if (q.optType === 'table') {
                const tblXml = q.elements[q.optElIdx].xml;
                const cells = tblXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
                for (let i = 0; i < cells.length; i++) {
                    if (this.hasUnderlineOrHighlight(cells[i])) {
                        return ['A', 'B', 'C', 'D'][i] || 'A';
                    }
                }
            } else if (q.optType === 'single_para') {
                const pXml = q.elements[q.optElIdx].xml;
                const runRegex = /<w:r\b[\s\S]*?<\/w:r>/g;
                const runs = pXml.match(runRegex) || [];
                let currentBucket = -1;
                for (const r of runs) {
                    const text = (r.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
                    const optMatch = text.match(/^([A-D])\s*[.:]/) || (r.includes('<w:b/>') && text.match(/^([A-D])$/));
                    if (optMatch) {
                        currentBucket = optMatch[1].toUpperCase().charCodeAt(0) - 65;
                    }
                    if (currentBucket >= 0 && currentBucket <= 3 && this.hasUnderlineOrHighlight(r)) {
                        return ['A', 'B', 'C', 'D'][currentBucket];
                    }
                }
            } else if (q.optType === '4_paras') {
                for (let i = 0; i < 4; i++) {
                    const pXml = q.elements[q.optElIdx + i].xml;
                    if (this.hasUnderlineOrHighlight(pXml)) {
                        return ['A', 'B', 'C', 'D'][i];
                    }
                }
            }

            const fullText = q.elements.map(e => e.text).join(' ');
            const chonMatch = fullText.match(/Chọn\s+([A-D])/i);
            if (chonMatch) return chonMatch[1].toUpperCase();

            return 'A';
        }

        extractExamAnswers(sections) {
            const p1 = [];
            const p2 = [];
            const p3 = [];
            sections.forEach(sec => {
                sec.questions.forEach(q => {
                    if (q.type === 'choice') {
                        p1.push(q.correctAnswer || 'A');
                    } else if (q.type === 'tf') {
                        const tfStr = ['a', 'b', 'c', 'd'].map(k => (q.correctTf && q.correctTf[k]) || 'Đ').join('');
                        p2.push(tfStr);
                    } else {
                        p3.push(q.correctAnswer || '');
                    }
                });
            });
            return { p1, p2, p3 };
        }

        smartShuffleDocxQuestions(questions, phanNhomMode = "Không phân nhóm") {
            if (!Array.isArray(questions) || questions.length <= 1) return questions;
            if (!this.config.dao_cau) return questions;

            const unlockedIndices = [];
            const unlockedItems = [];

            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                if (!q.isLocked) {
                    unlockedIndices.push(i);
                    unlockedItems.push(q);
                }
            }

            if (unlockedItems.length <= 1) return questions;

            let shuffledItems = [];

            if (!phanNhomMode || phanNhomMode === "Không phân nhóm") {
                shuffledItems = this.shuffleArray(unlockedItems);
            } else {
                // Phân 4 cấp độ: Biết (1), Hiểu (2), Vận dụng (3), Vận dụng cao (4), Khác (99)
                let groups = { 1: [], 2: [], 3: [], 4: [], 99: [] };

                for (const q of unlockedItems) {
                    const lvl = q.level || this.detectQuestionLevel(q);
                    q.level = lvl;
                    if (groups[lvl]) groups[lvl].push(q);
                    else groups[99].push(q);
                }

                // Nếu đa số câu hỏi không có tag (level 99) nhưng người dùng chọn phân nhóm,
                // ta phân nhóm tuần tự theo tỷ lệ độ khó từ dễ đến khó của đề thi gốc:
                const taggedCount = groups[1].length + groups[2].length + groups[3].length + groups[4].length;
                if (taggedCount === 0 && groups[99].length > 1) {
                    const allItems = [...groups[99]];
                    groups = { 1: [], 2: [], 3: [], 4: [], 99: [] };
                    const N = allItems.length;

                    if (phanNhomMode.includes("2 nhóm")) {
                        const mid = Math.ceil(N / 2);
                        groups[1] = allItems.slice(0, mid);
                        groups[3] = allItems.slice(mid);
                    } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu < VD, VDC")) {
                        const p1 = Math.round(N * 0.35);
                        const p2 = Math.round(N * 0.35);
                        groups[1] = allItems.slice(0, p1);
                        groups[2] = allItems.slice(p1, p1 + p2);
                        groups[3] = allItems.slice(p1 + p2);
                    } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu, VD < VDC")) {
                        const p1 = Math.round(N * 0.30);
                        const p2 = Math.round(N * 0.50);
                        groups[1] = allItems.slice(0, p1);
                        groups[2] = allItems.slice(p1, p1 + p2);
                        groups[4] = allItems.slice(p1 + p2);
                    } else {
                        // 4 nhóm mặc định
                        const q1 = Math.round(N * 0.25);
                        const q2 = Math.round(N * 0.25);
                        const q3 = Math.round(N * 0.25);
                        groups[1] = allItems.slice(0, q1);
                        groups[2] = allItems.slice(q1, q1 + q2);
                        groups[3] = allItems.slice(q1 + q2, q1 + q2 + q3);
                        groups[4] = allItems.slice(q1 + q2 + q3);
                    }
                }

                // Trộn ngẫu nhiên câu hỏi bên trong từng nhóm
                for (const k in groups) {
                    if (groups[k].length > 1) {
                        groups[k] = this.shuffleArray(groups[k]);
                    }
                }

                // Lắp ráp thứ tự theo cấu hình phân nhóm
                if (phanNhomMode.includes("2 nhóm")) {
                    const de = this.shuffleArray([...groups[1], ...groups[2]]);
                    const kho = this.shuffleArray([...groups[3], ...groups[4]]);
                    shuffledItems = [...de, ...kho, ...groups[99]];
                } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu < VD, VDC")) {
                    const kho = this.shuffleArray([...groups[3], ...groups[4]]);
                    shuffledItems = [...groups[1], ...groups[2], ...kho, ...groups[99]];
                } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu, VD < VDC")) {
                    const tb = this.shuffleArray([...groups[2], ...groups[3]]);
                    shuffledItems = [...groups[1], ...tb, ...groups[4], ...groups[99]];
                } else {
                    // 4 nhóm mặc định: Biết < Hiểu < VD < VDC
                    shuffledItems = [...groups[1], ...groups[2], ...groups[3], ...groups[4], ...groups[99]];
                }
            }

            const result = [...questions];
            for (let k = 0; k < unlockedIndices.length; k++) {
                result[unlockedIndices[k]] = shuffledItems[k];
            }
            return result;
        }

        buildMixedExam(parsed, maDe) {
            let globalQIndex = 0;
            const answers = { p1: [], p2: [], p3: [] };
            const mixedSectionsXml = [];
            const hasMultipleSections = parsed.sections.length > 1;

            for (const sec of parsed.sections) {
                if (sec.titleEl) mixedSectionsXml.push(sec.titleEl.xml);
                if (sec.introElements) sec.introElements.forEach(e => mixedSectionsXml.push(e.xml));

                const questionsToProcess = this.smartShuffleDocxQuestions(sec.questions, this.config.phannhom);

                let secQIndex = 0;
                for (const q of questionsToProcess) {
                    secQIndex++;
                    globalQIndex++;
                    const newQNum = hasMultipleSections ? secQIndex : globalQIndex;
                    const mixedQXml = this.renderMixedQuestion(q, newQNum, answers, false, true);
                    mixedSectionsXml.push(mixedQXml);
                }
            }

            // Tạo khung tiêu đề mới hoàn toàn, loại bỏ khung tiêu đề cũ để không bao giờ bị lặp mã đề
            const headerXml = this.buildExamHeaderXml(maDe);
            const footerXml = this.buildExamFooterXml();

            let fullMixedDocXml = parsed.preBody + headerXml + mixedSectionsXml.join('') + footerXml + parsed.postBody;
            // Xóa triệt để mọi thẻ gạch chân và highlight còn sót lại trong đề thi của học sinh
            fullMixedDocXml = fullMixedDocXml.replace(/<w:u\b[^>]*\/>/gi, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/gi, '');
            fullMixedDocXml = fullMixedDocXml.replace(/<w:highlight\b[^>]*\/>/gi, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/gi, '');

            return {
                docXml: fullMixedDocXml,
                answers
            };
        }

        renderMixedQuestion(q, newQNum, answersAccumulator, keepUnderlines = false, shuffleOpts = true) {
            let qElements = q.elements.map(e => ({ ...e }));

            // Khi xuất đề thi cho học sinh (!keepUnderlines):
            // 1. Cắt bỏ hoàn toàn từ phần Lời giải trở đi (cho mọi câu hỏi kể cả câu trả lời ngắn)
            // 2. Cắt bỏ hoàn toàn các paragraph/element chứa Đáp án / Đáp số / ĐS / Kết quả
            // 3. Nếu cụm Đáp án/Đáp số nằm ở cuối một paragraph câu hỏi, cắt bỏ khỏi XML
            if (!keepUnderlines) {
                let solStartIdx = -1;
                for (let i = 0; i < qElements.length; i++) {
                    const tr = qElements[i].text.trim();
                    if (/^(?:Lời\s*giải|Hướng\s*dẫn\s*giải|HDG)[:.\s]/i.test(tr) || /^Lời\s*giải\b/i.test(tr)) {
                        solStartIdx = i;
                        break;
                    }
                }

                if (solStartIdx !== -1) {
                    qElements = qElements.slice(0, solStartIdx);
                }

                // Lọc bỏ triệt để các phần tử/paragraph chứa đáp án/đáp số trong đề học sinh
                qElements = qElements.filter(e => {
                    const tr = (e.text || '').trim();
                    return !/^\s*(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=.]/i.test(tr) &&
                           !/^\s*(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\b/i.test(tr);
                });

                // Cắt bỏ cụm đáp án nếu vô tình nằm ở cuối paragraph câu hỏi
                qElements.forEach(e => {
                    if (/(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=.]/i.test(e.text || '')) {
                        e.xml = e.xml.replace(/(<w:t\b[^>]*>)([\s\S]*?)(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=.][\s\S]*?(<\/w:t>)/gi, '$1$2$3');
                    }
                });
            }

            let firstXml = qElements[0].xml;
            if (/(<w:t\b[^>]*>)(?:\[(?:NB|TH|VD|VDC|\w+)\]\s*)?(?:##\s*)?(?:Câu|Bài|Question)\s*\d+([:.\s(])/i.test(firstXml)) {
                firstXml = firstXml.replace(
                    /(<w:t\b[^>]*>)(?:\[(?:NB|TH|VD|VDC|\w+)\]\s*)?(?:##\s*)?(?:Câu|Bài|Question)\s*\d+([:.\s(])/i,
                    `$1Câu ${newQNum}: `
                );
            } else {
                firstXml = firstXml.replace(/(<w:t\b[^>]*>)\s*\d+([:.\s(])/, `$1${newQNum}: `);
            }
            firstXml = firstXml.replace(/(<w:t\b[^>]*>)##\s*/i, '$1');
            if (!keepUnderlines) {
                firstXml = firstXml.replace(/(<w:t\b[^>]*>)\s*(?:\[\d[A-Z0-9]{4,5}-[A-Z0-9]\]|\[(?:NB|TH|VD|VDC|B|H|V|C|Nhận\s*biết|Thông\s*hiểu|Vận\s*dụng\s*cao|Vận\s*dụng)\])\s*/gi, '$1');
            }
            qElements[0].xml = firstXml;

            if (q.type === 'choice') {
                let perm = [0, 1, 2, 3];
                if (shuffleOpts && this.config.dao_pa) {
                    perm = this.shuffleArray([0, 1, 2, 3]);
                }

                const origLetter = q.correctAnswer || 'A';
                const origIdx = origLetter.charCodeAt(0) - 65;
                const newAnsIdx = perm.indexOf(origIdx);
                const newLetter = ['A', 'B', 'C', 'D'][newAnsIdx !== -1 ? newAnsIdx : 0];
                if (answersAccumulator && answersAccumulator.p1) {
                    answersAccumulator.p1.push(newLetter);
                }

                if (q.optType === 'table') {
                    const targetEl = qElements[q.optElIdx];
                    if (targetEl) targetEl.xml = this.permuteTableCells(targetEl.xml, perm, keepUnderlines);
                } else if (q.optType === 'single_para') {
                    const targetEl = qElements[q.optElIdx];
                    if (targetEl) targetEl.xml = this.permuteSingleParaRuns(targetEl.xml, perm, keepUnderlines);
                } else if (q.optType === '4_paras') {
                    const paras = [
                        qElements[q.optElIdx],
                        qElements[q.optElIdx + 1],
                        qElements[q.optElIdx + 2],
                        qElements[q.optElIdx + 3]
                    ].filter(Boolean);
                    if (paras.length === 4) {
                        const labels = ['A', 'B', 'C', 'D'];
                        const reordered = [];
                        for (let i = 0; i < 4; i++) {
                            const oldP = paras[perm[i]];
                            let pXml = oldP.xml;
                            if (!keepUnderlines) {
                                pXml = pXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                                pXml = pXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                            }
                            pXml = pXml.replace(/(<w:t\b[^>]*>)\s*([A-D])\s*([.:])/, `$1${labels[i]}$3`);
                            reordered.push({ ...oldP, xml: pXml });
                        }
                        for (let i = 0; i < 4; i++) {
                            qElements[q.optElIdx + i] = reordered[i];
                        }
                    }
                }

                qElements.forEach(e => {
                    if (e.text.includes('Chọn ')) {
                        e.xml = e.xml.replace(/(Chọn\s+)[A-D]/g, `$1${newLetter}`);
                    }
                });

            } else if (q.type === 'tf') {
                let perm = [0, 1, 2, 3];
                if (shuffleOpts && this.config.dao_y_tf && q.tfStatements && q.tfStatements.length === 4) {
                    perm = this.shuffleArray([0, 1, 2, 3]);
                    const oldStatements = q.tfStatements.map(s => qElements[s.elIdx]).filter(Boolean);
                    if (oldStatements.length === 4) {
                        const tfLabels = ['a', 'b', 'c', 'd'];
                        const newTfAnswers = {};
                        for (let i = 0; i < 4; i++) {
                            const srcStmtIdx = perm[i];
                            const origLetter = q.tfStatements[srcStmtIdx].letter;
                            const origAns = (q.correctTf && q.correctTf[origLetter]) || 'Đ';
                            const targetLetter = tfLabels[i];
                            newTfAnswers[targetLetter] = origAns;

                            const origEl = oldStatements[srcStmtIdx];
                            let elXml = origEl.xml;
                            if (!keepUnderlines) {
                                elXml = elXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                                elXml = elXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                            }
                            elXml = elXml.replace(/(<w:t\b[^>]*>)\s*([a-d])\s*([.)])/i, `$1${targetLetter}$3`);
                            qElements[q.tfStatements[i].elIdx] = { ...origEl, xml: elXml };
                        }
                        const tfStr = ['a', 'b', 'c', 'd'].map(k => newTfAnswers[k] || 'Đ').join('');
                        if (answersAccumulator && answersAccumulator.p2) {
                            answersAccumulator.p2.push(tfStr);
                        }
                    } else {
                        const tfStr = ['a', 'b', 'c', 'd'].map(k => (q.correctTf && q.correctTf[k]) || 'Đ').join('');
                        if (answersAccumulator && answersAccumulator.p2) {
                            answersAccumulator.p2.push(tfStr);
                        }
                    }
                } else {
                    const tfStr = ['a', 'b', 'c', 'd'].map(k => (q.correctTf && q.correctTf[k]) || 'Đ').join('');
                    if (answersAccumulator && answersAccumulator.p2) {
                        answersAccumulator.p2.push(tfStr);
                    }
                    if (!keepUnderlines && q.tfStatements) {
                        q.tfStatements.forEach(s => {
                            if (qElements[s.elIdx]) {
                                let x = qElements[s.elIdx].xml;
                                x = x.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                                x = x.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                                qElements[s.elIdx].xml = x;
                            }
                        });
                    }
                }
            } else {
                if (answersAccumulator && answersAccumulator.p3) {
                    answersAccumulator.p3.push(q.correctAnswer || '');
                }
            }

            return qElements.map(e => e.xml).join('');
        }

        permuteTableCells(tblXml, perm, keepUnderlines = false) {
            const tcRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
            const cells = tblXml.match(tcRegex) || [];
            if (cells.length !== 4) return tblXml;

            const labels = ['A', 'B', 'C', 'D'];
            const newCells = [];
            for (let i = 0; i < 4; i++) {
                let cXml = cells[perm[i]];
                if (!keepUnderlines) {
                    cXml = cXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                    cXml = cXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                }
                cXml = cXml.replace(/(<w:t\b[^>]*>)\s*([A-D])\s*([.:])/, `$1${labels[i]}$3`);
                newCells.push(cXml);
            }
            let cIdx = 0;
            return tblXml.replace(tcRegex, () => newCells[cIdx++]);
        }

        permuteSingleParaRuns(pXml, perm, keepUnderlines = false) {
            const pPrMatch = pXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/);
            const pPr = pPrMatch ? pPrMatch[0] : '';
            const insideP = pXml.replace(/<w:p\b[^>]*>/, '').replace(/<\/w:p>$/, '').replace(pPr, '');

            const runRegex = /<w:r\b[\s\S]*?<\/w:r>/g;
            const runs = insideP.match(runRegex) || [];
            if (runs.length === 0) return pXml;

            const buckets = [[], [], [], []];
            let currentBucket = -1;

            runs.forEach(r => {
                const text = (r.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
                const optMatch = text.match(/^([A-D])\s*[.:]/) || (r.includes('<w:b/>') && text.match(/^([A-D])$/));
                if (optMatch) {
                    currentBucket = optMatch[1].toUpperCase().charCodeAt(0) - 65;
                }
                if (currentBucket >= 0 && currentBucket <= 3) {
                    buckets[currentBucket].push(r);
                }
            });

            if (buckets.some(b => b.length === 0)) return pXml;

            const labels = ['A', 'B', 'C', 'D'];
            const newRuns = [];

            for (let i = 0; i < 4; i++) {
                const bucketRuns = [...buckets[perm[i]]];
                let labelUpdated = false;
                const processed = bucketRuns.map(r => {
                    let rXml = r;
                    if (!keepUnderlines) {
                        rXml = rXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                        rXml = rXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                    }
                    if (!labelUpdated && /<w:t\b[^>]*>[\s\S]*?[A-D][.:\s]/.test(rXml)) {
                        rXml = rXml.replace(/(<w:t\b[^>]*>)\s*([A-D])\s*([.:])/, `$1${labels[i]}$3`);
                        labelUpdated = true;
                    } else if (!labelUpdated && /<w:t\b[^>]*>[A-D]<\/w:t>/.test(rXml)) {
                        rXml = rXml.replace(/(<w:t\b[^>]*>)[A-D](<\/w:t>)/, `$1${labels[i]}$2`);
                        labelUpdated = true;
                    }
                    return rXml;
                });

                const clean = processed.filter(r => !r.includes('<w:tab/>') && !r.includes('<w:tab '));
                newRuns.push(...clean);
                if (i < 3) {
                    newRuns.push('<w:r><w:tab/></w:r>');
                }
            }

            const pTagMatch = pXml.match(/<w:p\b[^>]*>/);
            const pTag = pTagMatch ? pTagMatch[0] : '<w:p>';
            return `${pTag}${pPr}${newRuns.join('')}</w:p>`;
        }

        buildExamXml(parsed, options = {}) {
            let globalQIndex = 0;
            const sectionsXml = [];
            const hasMultipleSections = parsed.sections.length > 1;

            for (const sec of parsed.sections) {
                if (sec.titleEl) sectionsXml.push(sec.titleEl.xml);
                if (sec.introElements) sec.introElements.forEach(e => sectionsXml.push(e.xml));

                let secQIndex = 0;
                for (const q of sec.questions) {
                    secQIndex++;
                    globalQIndex++;
                    const newQNum = hasMultipleSections ? secQIndex : globalQIndex;
                    sectionsXml.push(this.renderMixedQuestion(q, newQNum, null, options.keepUnderlines, options.shuffleOptions));
                }
            }

            // Tạo khung tiêu đề mới hoàn toàn, loại bỏ khung tiêu đề cũ
            const headerXml = this.buildExamHeaderXml(options.examCode || 'GỐC', options.titleSuffix || '');
            const footerXml = (options.keepUnderlines && parsed.footerElements && parsed.footerElements.length > 0)
                ? parsed.footerElements.map(e => e.xml).join('')
                : this.buildExamFooterXml();

            let docXml = parsed.preBody + headerXml + sectionsXml.join('') + footerXml + parsed.postBody;
            if (!options.keepUnderlines) {
                docXml = docXml.replace(/<w:u\b[^>]*\/>/gi, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/gi, '');
                docXml = docXml.replace(/<w:highlight\b[^>]*\/>/gi, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/gi, '');
            }
            return docXml;
        }

        shuffleArray(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }
    }

    // =======================================================
    // 3. ĐỘNG CƠ TRỘN ĐỀ HOÀN CHỈNH (EXAM MIXER ENGINE)
    // =======================================================
    class ExamMixerEngine {
        constructor(inputData, config = {}) {
            this.inputData = inputData; // raw tex string, docx buffer, or questions array
            this.isDocxInput = (inputData instanceof ArrayBuffer) || 
                               (inputData instanceof Blob) || 
                               (typeof Uint8Array !== 'undefined' && inputData instanceof Uint8Array) ||
                               (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(inputData));
            this.config = {
                so_de: 4,
                ma_de_list: ['1001', '1002', '1003', '1004'],
                ma_de_digits: 4,
                ma_de_style: 'consecutive', // 'consecutive', 'random', 'even', 'odd', 'manual'
                dao_cau: true,
                dao_pa: true,
                dao_y_tf: true,
                phannhom: 'Không phân nhóm',
                header: {
                    style: 'standard_gov',
                    agency: 'SỞ GD&ĐT HÀ NỘI',
                    school: 'TRƯỜNG THPT TRẦN QUANG KHẢI',
                    title: 'KIỂM TRA HỌC KỲ I',
                    examType: '(ĐỀ CHÍNH THỨC)',
                    subject: 'TOÁN HỌC',
                    grade: '9',
                    duration: 90,
                    candidateInfo: true
                },
                output_format: 'both', // 'word', 'tex', 'both'
                ...config
            };
        }

        /**
         * Sinh danh sách mã đề theo cấu hình
         */
        static generateExamCodes(count, digits = 4, style = 'consecutive', startCode = null) {
            const codes = [];
            let start = startCode ? parseInt(startCode, 10) : (digits === 4 ? 1001 : 101);
            if (isNaN(start)) start = digits === 4 ? 1001 : 101;

            if (style === 'consecutive') {
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i).padStart(digits, '0'));
                }
            } else if (style === 'even') {
                if (start % 2 !== 0) start += 1;
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i * 2).padStart(digits, '0'));
                }
            } else if (style === 'odd') {
                if (start % 2 === 0) start += 1;
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i * 2).padStart(digits, '0'));
                }
            } else if (style === 'random') {
                const used = new Set();
                const min = Math.pow(10, digits - 1);
                const max = Math.pow(10, digits) - 1;
                while (used.size < count) {
                    const r = Math.floor(min + Math.random() * (max - min + 1));
                    used.add(String(r).padStart(digits, '0'));
                }
                codes.push(...Array.from(used));
            } else {
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i).padStart(digits, '0'));
                }
            }
            return codes;
        }

        /**
         * Bộ phân tích file Word DOCX siêu tốc độc lập qua JSZip (30ms)
         */
        async parseDocxInput(arrayBuffer, report) {
            report(8, "Đang mở cấu trúc tệp Word DOCX...");
            if (typeof JSZip === 'undefined') {
                throw new Error("Thư viện JSZip chưa được tải trên trang.");
            }

            let zip;
            try {
                zip = await JSZip.loadAsync(arrayBuffer);
            } catch (zErr) {
                throw new Error("Không thể mở tệp Word DOCX: " + (zErr.message || zErr.toString()));
            }

            const docFile = zip.file("word/document.xml");
            if (!docFile) {
                throw new Error("Tệp DOCX không hợp lệ (không tìm thấy word/document.xml).");
            }

            report(12, "Đang trích xuất nội dung văn bản và công thức...");
            const docXml = await docFile.async("text");

            // Phân tích các đoạn paragraph <w:p>
            const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
            const lines = [];
            let pMatch;

            while ((pMatch = pRegex.exec(docXml)) !== null) {
                const pXml = pMatch[1];
                const rRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
                let line = '';
                let rMatch;

                while ((rMatch = rRegex.exec(pXml)) !== null) {
                    const rXml = rMatch[1];
                    const isUnderlined = /<w:u\b[^>]*\/>|<w:u\b[^>]*val=[\"'](?!none)[^\"']+[\"']/i.test(rXml);

                    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
                    let tMatch;
                    while ((tMatch = tRegex.exec(rXml)) !== null) {
                        const text = tMatch[1];
                        if (isUnderlined) {
                            const labelM = text.trim().match(/^([A-Da-d])\s*[\.\)]?$/);
                            if (labelM) {
                                line += ` [[WORD_UNDERLINE_${labelM[1].toUpperCase()}]] `;
                            }
                        }
                        line += text;
                    }
                }

                // Trích xuất công thức OpenXML Math <m:t> nếu có
                const mtRegex = /<m:t\b[^>]*>([\s\S]*?)<\/m:t>/g;
                let mtMatch;
                while ((mtMatch = mtRegex.exec(pXml)) !== null) {
                    line += mtMatch[1];
                }

                line = line
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&apos;/g, "'");

                if (line.trim()) lines.push(line.trim());
            }

            const rawDocText = lines.join('\n');
            report(15, `Đã trích xuất ${lines.length} dòng dữ liệu từ Word.`);

            // 1. Nếu văn bản Word đã chứa sẵn mã LaTeX \begin{ex} hoặc \begin{bt}
            if (rawDocText.includes('\\begin{ex}') || rawDocText.includes('\\begin{bt}')) {
                report(18, "Phát hiện mã nguồn LaTeX trực tiếp trong file Word!");
                return { texContent: rawDocText, parsedQuestions: [] };
            }

            // 2. Nhận diện các câu hỏi trắc nghiệm (Câu 1. / Bài 1.)
            const parseFn = window.parseWordQuestions || (window.QuestionImporter && window.QuestionImporter.parseWordQuestions);
            if (typeof parseFn === 'function') {
                const questions = parseFn(rawDocText);
                if (questions && questions.length > 0) {
                    report(18, `Nhận diện thành công ${questions.length} câu hỏi từ file Word!`);
                    const tex = this.convertQuestionsArrayToTex(questions);
                    return { texContent: tex, parsedQuestions: questions };
                }
            }

            // 3. Dự phòng Mammoth nhẹ nhàng nếu JSZip chưa tách đủ cấu trúc
            if (window.mammoth) {
                report(16, "Đang phân tích cấu trúc bổ sung qua Mammoth...");
                try {
                    const mRes = await window.mammoth.convertToHtml({ arrayBuffer }, {
                        styleMap: ['u => u'],
                        ignoreEmptyParagraphs: true
                    });
                    const htmlText = window.wordHtmlToImportText ? window.wordHtmlToImportText(mRes.value) : mRes.value.replace(/<[^>]+>/g, '\n');
                    if (typeof parseFn === 'function') {
                        const mQuestions = parseFn(htmlText);
                        if (mQuestions && mQuestions.length > 0) {
                            report(18, `Nhận diện thành công ${mQuestions.length} câu hỏi qua Mammoth!`);
                            return { texContent: this.convertQuestionsArrayToTex(mQuestions), parsedQuestions: mQuestions };
                        }
                    }
                } catch (mErr) {
                    console.warn("[Mixer] Fallback Mammoth:", mErr);
                }
            }

            throw new Error("Không thể trích xuất câu hỏi từ file Word. Đảm bảo file Word có cấu trúc 'Câu 1.' hoặc chứa mã nguồn '\\begin{ex}'.");
        }

        /**
         * Trộn trực tiếp file Word (.docx) ở tầng OpenXML
         * Bảo toàn 100% công thức MathType OLE, bảng biểu, hình vẽ và định dạng
         */
        async mixDocxDirect(report) {
            report(8, "Bắt đầu trộn đề Word trực tiếp từ file gốc (Bảo toàn 100% công thức MathType)...");
            let buf = this.inputData;
            if (buf instanceof Blob) {
                buf = await buf.arrayBuffer();
            } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(buf)) {
                buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            }

            const mixer = new DocxDirectMixer(buf, this.config);
            const directResult = await mixer.mix(report);

            report(75, "Đang tạo bảng đáp án Excel và Mã QR...");
            const zip = new JSZip();
            const deThiFolder = zip.folder("de_thi");
            const dapAnFolder = zip.folder("dap_an");
            const qrFolder = zip.folder("qr_code");

            // 1. Thêm các file Word đề thi vào de_thi/
            for (const [filename, fileData] of Object.entries(directResult.exams)) {
                deThiFolder.file(filename, fileData);
            }

            // 2. Thêm file HuongDanGiai.docx vào dap_an/
            if (directResult.huongDanGiai) {
                dapAnFolder.file("HuongDanGiai.docx", directResult.huongDanGiai);
            }

            // 3. Tạo bảng đáp án Excel SmartTest & YoungMix
            const matrixData = directResult.matrixData;
            const smartTestBlob = await ExamMixerEngine.buildSmartTestXlsx(matrixData);
            dapAnFolder.file("DapAn_SmartTest.xlsx", smartTestBlob);

            const youngMixBlob = await ExamMixerEngine.buildYoungMixXlsx(matrixData);
            dapAnFolder.file("DapAn_YoungMix.xlsx", youngMixBlob);

            // 4. Tạo mã QR
            const qrData = ExamMixerEngine.buildQrData(matrixData);
            qrFolder.file("QR_TNMaker.txt", qrData.tnmChunks.map(c => `// Mã đề: ${c.madeList.join(', ')}\n${c.qrString}`).join('\n\n'));
            qrFolder.file("QR_QM_ChamThi.json", JSON.stringify(qrData.qmList, null, 2));
            qrFolder.file("QR_UnT.txt", qrData.untList.join('\n---\n'));

            const shouldExportTex = this.config.output_format === 'tex' || this.config.output_format === 'both';
            if (shouldExportTex) {
                qrFolder.file("MaQR_ChamThi.tex", ExamMixerEngine.buildMaQrTex(qrData));
            }

            const qrViewerHtml = ExamMixerEngine.buildQrViewerHtml(this.config.header?.title || "Đề thi", matrixData, qrData);
            qrFolder.file("Xem_Ma_QR.html", qrViewerHtml);

            try {
                if (typeof fetch === 'function') {
                    const qrJsRes = await fetch('qrcode.min.js');
                    if (qrJsRes.ok) qrFolder.file("qrcode.min.js", await qrJsRes.text());
                }
            } catch (e) {}

            const QR = typeof QRCode !== 'undefined' ? QRCode : (typeof window !== 'undefined' ? window.QRCode : null);
            if (QR) {
                for (const chunk of qrData.tnmChunks) {
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(chunk.qrString, 350, 350);
                    if (blobPng) qrFolder.file(`TNMaker_De_${chunk.madeList.join('_')}.png`, blobPng);
                }
                for (const chunk of qrData.qmChunks) {
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(chunk.qrString, 350, 350);
                    if (blobPng) qrFolder.file(`QM_De_${chunk.madeList.join('_')}.png`, blobPng);
                }
                for (let i = 0; i < qrData.untList.length; i++) {
                    const untStr = qrData.untList[i];
                    const made = untStr.split('\n')[0] || (i + 1);
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(untStr, 350, 350);
                    if (blobPng) qrFolder.file(`UnT_De_${made}.png`, blobPng);
                }
            }

            report(97, "Đang đóng gói file ZIP hoàn chỉnh...");
            const zipType = typeof Blob !== 'undefined' ? "blob" : "nodebuffer";
            const finalZipBlob = await zip.generateAsync({ type: zipType });
            report(100, "Hoàn tất trộn đề thi Word!");

            return {
                zipBlob: finalZipBlob,
                matrixData,
                maDeList: directResult.maDeList,
                totalQuestions: directResult.totalQuestions
            };
        }

        /**
         * Chạy tiến trình trộn đề hoàn chỉnh
         */
        async mix(progressCallback = null) {
            const report = (pct, msg) => {
                if (typeof progressCallback === 'function') progressCallback(pct, msg);
            };

            report(5, "Đang khởi tạo dữ liệu đề thi...");

            // NẾU ĐẦU VÀO LÀ FILE WORD DOCX -> TRỘN TRỰC TIẾP OPENXML (BẢO TOÀN 100% MATHTYPE)
            if (this.isDocxInput) {
                return await this.mixDocxDirect(report);
            }

            let texContent = "";
            let parsedQuestions = [];

            if (typeof this.inputData === 'string') {
                texContent = this.inputData;
            } else if (Array.isArray(this.inputData)) {
                parsedQuestions = this.inputData;
                texContent = this.convertQuestionsArrayToTex(parsedQuestions);
            }

            // Chuẩn hóa và trích xuất các khối câu hỏi {ex} và {bt}
            texContent = texContent.replace(/\\%/g, 'DPSpercent');
            const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
            const btRegex = /\\begin\{bt\}([\s\S]*?)\\end\{bt\}/g;

            const exRaw = [];
            let m;
            while ((m = exRegex.exec(texContent)) !== null) exRaw.push(m[1]);

            const btBlocks = [];
            while ((m = btRegex.exec(texContent)) !== null) btBlocks.push(m[1]);

            if (exRaw.length === 0 && btBlocks.length === 0) {
                throw new Error("Không tìm thấy câu hỏi \\begin{ex} hoặc \\begin{bt} nào trong nội dung đầu vào!");
            }

            // Phân nhóm câu hỏi gốc
            const degocCh = [];
            const degocTF = [];
            const degocSh = [];

            for (const ex of exRaw) {
                if (ex.includes('\\choiceTF')) degocTF.push(ex);
                else if (ex.includes('\\shortans') || ex.includes('\\SA')) degocSh.push(ex);
                else if (ex.includes('\\choice')) degocCh.push(ex);
                else degocCh.push(ex);
            }

            // 1. Chuẩn bị Đề Gốc (mã đề GỐC tham chiếu)
            const deGocBlocks = [];
            if (degocCh.length > 0) {
                deGocBlocks.push(`\\subsection{Câu trắc nghiệm nhiều phương án lựa chọn}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${degocCh.length}. Mỗi câu hỏi, thí sinh chỉ chọn một phương án trả lời.}\n\n\\setcounter{ex}{0}\n` +
                    degocCh.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
            }
            if (degocTF.length > 0) {
                deGocBlocks.push(`\\subsection{Câu trắc nghiệm Đúng/Sai}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${degocTF.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.}\n\n\\setcounter{ex}{0}\n` +
                    degocTF.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
            }
            if (degocSh.length > 0) {
                deGocBlocks.push(`\\subsection{Câu trắc nghiệm trả lời ngắn}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${degocSh.length}.}\n\n\\setcounter{ex}{0}\n` +
                    degocSh.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
            }
            if (btBlocks.length > 0) {
                deGocBlocks.push(`\\subsection{Bài tập tự luận}\n\\setcounter{bt}{0}\n` +
                    btBlocks.map(bt => `\\begin{bt}${bt}\\end{bt}`).join('\n\n'));
            }

            const ansP1Goc = degocCh.map(ex => getAnswerChoice(ex));
            const ansP2Goc = degocTF.map(ex => getAnswerChoiceTF(ex));
            const ansP3RawGoc = degocSh.map(ex => getAnswerShortRaw(ex));

            const gocMatrixItem = {
                made: 'GOC',
                isGoc: true,
                p1: ansP1Goc,
                p2: ansP2Goc,
                p3_raw: ansP3RawGoc,
                p3: ansP3RawGoc.map(r => cleanShortAnswer(r))
            };

            const maDeList = this.config.ma_de_list || ['1001', '1002', '1003', '1004'];
            const cacDeDaTron = {};
            const matrixData = [gocMatrixItem];
            const totalExams = maDeList.length;

            report(20, `Bắt đầu trộn ${totalExams} mã đề thi...`);

            for (let idx = 0; idx < totalExams; idx++) {
                const maDe = maDeList[idx];
                const pct = 20 + Math.floor((idx / totalExams) * 45);
                report(pct, `Đang trộn đề mã ${maDe} (${idx + 1}/${totalExams})...`);

                let currCh = [...degocCh];
                let currTf = [...degocTF];
                let currSh = [...degocSh];

                // 1. Đảo câu hỏi nếu bật
                if (this.config.dao_cau) {
                    currCh = smartShuffleQuestions(currCh, this.config.phannhom);
                    currTf = smartShuffleQuestions(currTf, this.config.phannhom);
                    currSh = smartShuffleQuestions(currSh, this.config.phannhom);
                }

                // 2. Đảo phương án trắc nghiệm
                if (this.config.dao_pa) {
                    currCh = currCh.map(ex => shuffleOptionsInQuestion(ex));
                }

                // 3. Đảo ý Đúng / Sai kèm đồng bộ lời giải \itemch
                if (this.config.dao_y_tf) {
                    currTf = currTf.map(ex => shuffleOptionsInQuestion(ex));
                }

                // 4. Thu thập đáp án mã đề
                const ansP1 = currCh.map(ex => getAnswerChoice(ex));
                const ansP2 = currTf.map(ex => getAnswerChoiceTF(ex));
                const ansP3Raw = currSh.map(ex => getAnswerShortRaw(ex));

                matrixData.push({
                    made: maDe,
                    isGoc: false,
                    p1: ansP1,
                    p2: ansP2,
                    p3_raw: ansP3Raw,
                    p3: ansP3Raw.map(r => cleanShortAnswer(r))
                });

                // 5. Gom các phần đề thi hoàn chỉnh
                const orderedBlocks = [];
                if (currCh.length > 0) {
                    orderedBlocks.push(`\\subsection{Câu trắc nghiệm nhiều phương án lựa chọn}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${currCh.length}. Mỗi câu hỏi, thí sinh chỉ chọn một phương án trả lời.}\n\n\\setcounter{ex}{0}\n` +
                        currCh.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
                }
                if (currTf.length > 0) {
                    orderedBlocks.push(`\\subsection{Câu trắc nghiệm Đúng/Sai}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${currTf.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.}\n\n\\setcounter{ex}{0}\n` +
                        currTf.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
                }
                if (currSh.length > 0) {
                    orderedBlocks.push(`\\subsection{Câu trắc nghiệm trả lời ngắn}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${currSh.length}.}\n\n\\setcounter{ex}{0}\n` +
                        currSh.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
                }
                if (btBlocks.length > 0) {
                    orderedBlocks.push(`\\subsection{Bài tập tự luận}\n\\setcounter{bt}{0}\n` +
                        btBlocks.map(bt => `\\begin{bt}${bt}\\end{bt}`).join('\n\n'));
                }

                cacDeDaTron[maDe] = orderedBlocks;
            }

            report(68, "Đang tạo bảng đáp án Excel SmartTest & YoungMix...");

            // Khởi tạo ZIP đóng gói
            const zip = new JSZip();
            const deThiFolder = zip.folder("de_thi");
            const dapAnFolder = zip.folder("dap_an");
            const qrFolder = zip.folder("qr_code");

            // =======================================================
            // 1. XUẤT CÁC BẢNG ĐÁP ÁN EXCEL CHUẨN LIVETEXX
            // =======================================================
            const smartTestBlob = await ExamMixerEngine.buildSmartTestXlsx(matrixData);
            dapAnFolder.file("DapAn_SmartTest.xlsx", smartTestBlob);

            const youngMixBlob = await ExamMixerEngine.buildYoungMixXlsx(matrixData);
            dapAnFolder.file("DapAn_YoungMix.xlsx", youngMixBlob);

            const shouldExportTex = this.config.output_format === 'tex' || this.config.output_format === 'both';
            const shouldExportWord = this.config.output_format === 'word' || this.config.output_format === 'both';
            const headerCfg = this.config.header || {};

            // =======================================================
            // 2. XUẤT MÃ QR ĐÁP ÁN (TNMaker, QM Chấm Thi, UnT)
            // =======================================================
            report(74, "Đang tạo mã QR cho TNMaker & app QM Chấm thi...");
            const qrData = ExamMixerEngine.buildQrData(matrixData);

            // File chuỗi text / JSON
            qrFolder.file("QR_TNMaker.txt", qrData.tnmChunks.map(c => `// Mã đề: ${c.madeList.join(', ')}\n${c.qrString}`).join('\n\n'));
            qrFolder.file("QR_QM_ChamThi.json", JSON.stringify(qrData.qmList, null, 2));
            qrFolder.file("QR_UnT.txt", qrData.untList.join('\n---\n'));

            // File LaTeX sinh lệnh \qrcode (chỉ xuất nếu chọn TeX hoặc Both)
            if (shouldExportTex) {
                qrFolder.file("MaQR_ChamThi.tex", ExamMixerEngine.buildMaQrTex(qrData));
            }

            // Trang HTML xem & in mã QR trực quan cực đẹp (100% offline)
            const qrViewerHtml = ExamMixerEngine.buildQrViewerHtml(this.config.header?.title || "Đề thi", matrixData, qrData);
            qrFolder.file("Xem_Ma_QR.html", qrViewerHtml);

            try {
                if (typeof fetch === 'function') {
                    const qrJsRes = await fetch('qrcode.min.js');
                    if (qrJsRes.ok) qrFolder.file("qrcode.min.js", await qrJsRes.text());
                }
            } catch (e) {}

            // Sinh ảnh PNG mã QR cho từng mã đề nếu có thư viện QRCode
            const QR_tex = typeof QRCode !== 'undefined' ? QRCode : (typeof window !== 'undefined' ? window.QRCode : null);
            if (QR_tex) {
                for (const chunk of qrData.tnmChunks) {
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(chunk.qrString, 350, 350);
                    if (blobPng) qrFolder.file(`TNMaker_De_${chunk.madeList.join('_')}.png`, blobPng);
                }
                for (const chunk of qrData.qmChunks) {
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(chunk.qrString, 350, 350);
                    if (blobPng) qrFolder.file(`QM_De_${chunk.madeList.join('_')}.png`, blobPng);
                }
                for (let i = 0; i < qrData.untList.length; i++) {
                    const untStr = qrData.untList[i];
                    const made = untStr.split('\n')[0] || (i + 1);
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(untStr, 350, 350);
                    if (blobPng) qrFolder.file(`UnT_De_${made}.png`, blobPng);
                }
            }

            // =======================================================
            // 3. XUẤT HƯỚNG DẪN GIẢI & FILE MAIN TEX (KHI CHỌN TEX HOẶC BOTH)
            // =======================================================
            if (shouldExportTex) {
                dapAnFolder.file("HuongDanGiai.tex", ExamMixerEngine.buildHuongDanGiaiTex(matrixData, cacDeDaTron, deGocBlocks));
                zip.file("Main_de_bai.tex", this.buildMainTex(maDeList, this.config.header, false));
                zip.file("Main_dap_an.tex", this.buildMainTex(maDeList, this.config.header, true));

                let deGocTex = `\\newpage\n\\setcounter{page}{1}\n\\madethi{GỐC}\n\\setcounter{ex}{0}\\setcounter{bt}{0}\n\n`;
                deGocTex += deGocBlocks.join('\n\n') + `\n\n\\begin{center}\\bf\n----- HẾT -----\n\\end{center}\n\\label{GOC}\n`;
                deThiFolder.file("De_Goc.tex", deGocTex.replace(/DPSpercent/g, '\\%'));

                for (const maDe of maDeList) {
                    const blocks = cacDeDaTron[maDe];
                    let texFile = `\\newpage\n\\setcounter{page}{1}\n\\madethi{${maDe}}\n\\setcounter{ex}{0}\\setcounter{bt}{0}\n\n`;
                    texFile += blocks.join('\n\n') + `\n\n\\begin{center}\\bf\n----- HẾT -----\n\\end{center}\n\\label{${maDe}}\n`;
                    deThiFolder.file(`De_${maDe}.tex`, texFile.replace(/DPSpercent/g, '\\%'));
                }
            }

            // =======================================================
            // 4. XUẤT CÁC FILE WORD (.DOCX) NẾU ĐƯỢC CHỌN
            // =======================================================
            const createDocx = window.createDocxBlob || (window.WordMathTypeExporter && window.WordMathTypeExporter.createDocxBlob);
            const parseLatex = (window.QuestionImporter && window.QuestionImporter.parseLatexExamString) || window.parseLatexExamString;

            const toDocxBuffer = async (data) => {
                if (!data) return null;
                if (data instanceof Uint8Array || data instanceof ArrayBuffer) return data;
                if (typeof data.arrayBuffer === 'function') {
                    try {
                        return await data.arrayBuffer();
                    } catch (e) {
                        return data;
                    }
                }
                return data;
            };

            if (shouldExportWord) {
                if (typeof createDocx !== 'function') {
                    console.warn("[Mixer] Không tìm thấy hàm createDocxBlob để tạo file Word!");
                } else {
                    report(80, "Đang xuất file Word (.docx) Đề Gốc...");

                    const makeHeaderConfig = (code) => ({
                        style: headerCfg.style || 'standard_gov',
                        agency: headerCfg.agency || 'SỞ GD&ĐT HÀ NỘI',
                        school: headerCfg.school || 'TRƯỜNG THPT TRẦN QUANG KHẢI',
                        exam_type: headerCfg.examType || '(ĐỀ CHÍNH THỨC)',
                        title: headerCfg.title || 'ĐỀ THI',
                        subject: headerCfg.subject || 'TOÁN HỌC',
                        grade: headerCfg.grade || '9',
                        duration: headerCfg.duration || 90,
                        exam_code: code,
                        candidate_info: headerCfg.candidateInfo !== false
                    });

                    // 4.1. Xuất file Word Đề Gốc
                    let parsedGocQuestions = null;
                    try {
                        const gocCfg = makeHeaderConfig("GỐC");
                        const fullGocTex = deGocBlocks.join('\n\n').replace(/DPSpercent/g, '\\%');
                        parsedGocQuestions = (typeof parseLatex === 'function') ? parseLatex(fullGocTex) : fullGocTex;

                        const blobGoc = await createDocx({
                            title: `${headerCfg.title || 'De_Thi'}_Goc`,
                            questions: parsedGocQuestions,
                            mode: 'questions',
                            options: {
                                headerStyle: gocCfg.style,
                                agencyName: gocCfg.agency,
                                schoolName: gocCfg.school,
                                examType: gocCfg.exam_type,
                                examTitle: gocCfg.title,
                                subject: gocCfg.subject,
                                grade: gocCfg.grade,
                                duration: gocCfg.duration,
                                examCode: "GỐC",
                                includeCandidateInfo: gocCfg.candidate_info,
                                returnType: 'uint8array'
                            }
                        });
                        const docxDataGoc = await toDocxBuffer(blobGoc);
                        if (docxDataGoc) {
                            deThiFolder.file("De_Goc.docx", docxDataGoc);
                        }
                    } catch (gErr) {
                        console.error("[Mixer] Lỗi xuất Word Đề Gốc:", gErr);
                    }

                    // 4.2. Xuất Lời giải chi tiết Đề Gốc dạng Word (.docx) vào dap_an/
                    try {
                        if (parsedGocQuestions) {
                            const gocCfg = makeHeaderConfig("GỐC");
                            const blobHDG = await createDocx({
                                title: `${headerCfg.title || 'Huong_Dan_Giai'}_De_Goc`,
                                questions: parsedGocQuestions,
                                mode: 'full',
                                options: {
                                    headerStyle: gocCfg.style,
                                    agencyName: gocCfg.agency,
                                    schoolName: gocCfg.school,
                                    examType: gocCfg.exam_type,
                                    examTitle: `${gocCfg.exam_title || gocCfg.title || 'ĐỀ THI'} - HƯỚNG DẪN GIẢI`,
                                    subject: gocCfg.subject,
                                    grade: gocCfg.grade,
                                    duration: gocCfg.duration,
                                    examCode: "GỐC",
                                    includeCandidateInfo: false,
                                    returnType: 'uint8array'
                                }
                            });
                            const docxDataHDG = await toDocxBuffer(blobHDG);
                            if (docxDataHDG) {
                                dapAnFolder.file("HuongDanGiai.docx", docxDataHDG);
                            }
                        }
                    } catch (hdgErr) {
                        console.warn("[Mixer] Không thể tạo HuongDanGiai.docx:", hdgErr);
                    }

                    // 4.3. Xuất file Word cho từng mã đề thi con
                    for (let i = 0; i < maDeList.length; i++) {
                        const maDe = maDeList[i];
                        report(82 + Math.floor((i / maDeList.length) * 14), `Đang tạo file Word mã ${maDe}...`);
                        const examBlocks = cacDeDaTron[maDe];
                        const fullLatexExam = examBlocks.join('\n\n').replace(/DPSpercent/g, '\\%');
                        const parsedExamQuestions = (typeof parseLatex === 'function') ? parseLatex(fullLatexExam) : fullLatexExam;
                        const hConfig = makeHeaderConfig(maDe);

                        try {
                            const blobDocx = await createDocx({
                                title: `${headerCfg.title || 'De_Thi'}_${maDe}`,
                                questions: parsedExamQuestions,
                                mode: 'questions',
                                options: {
                                    headerStyle: hConfig.style,
                                    agencyName: hConfig.agency,
                                    schoolName: hConfig.school,
                                    examType: hConfig.exam_type,
                                    examTitle: hConfig.title,
                                    subject: hConfig.subject,
                                    grade: hConfig.grade,
                                    duration: hConfig.duration,
                                    examCode: maDe,
                                    includeCandidateInfo: hConfig.candidate_info,
                                    returnType: 'uint8array'
                                }
                            });
                            const docxData = await toDocxBuffer(blobDocx);
                            if (docxData) {
                                deThiFolder.file(`De_${maDe}.docx`, docxData);
                            }
                        } catch (wErr) {
                            console.error(`[Mixer] Lỗi tạo Word mã ${maDe}:`, wErr);
                        }
                    }
                }
            }

            report(97, "Đang đóng gói file ZIP hoàn chỉnh...");
            const zipType = typeof Blob !== 'undefined' ? "blob" : "nodebuffer";
            const finalZipBlob = await zip.generateAsync({ type: zipType });
            report(100, "Hoàn tất trộn đề thi!");

            return {
                zipBlob: finalZipBlob,
                matrixData,
                maDeList,
                totalQuestions: degocCh.length + degocTF.length + degocSh.length + btBlocks.length
            };
        }

        convertQuestionsArrayToTex(questions) {
            if (!Array.isArray(questions)) return "";
            return questions.map(q => {
                const env = q.type === 'essay' ? 'bt' : 'ex';
                let res = `\\begin{${env}}\n${q.content || ''}\n`;
                if (q.type === 'tf' && Array.isArray(q.statements)) {
                    res += '\\choiceTF\n' + q.statements.map(st => `\t{${st.isTrue ? '\\True ' : ''}${st.text || ''}}`).join('\n') + '\n';
                } else if (Array.isArray(q.options) && q.options.length > 0) {
                    res += '\\choice\n' + q.options.map((opt, i) => `\t{${i === q.correct ? '\\True ' : ''}${opt}}`).join('\n') + '\n';
                } else if (q.type === 'short' && q.answer) {
                    res += `\\shortans{${q.answer}}\n`;
                }
                if (q.solution) {
                    res += `\\loigiai{\n${q.solution}\n}\n`;
                }
                res += `\\end{${env}}`;
                return res;
            }).join('\n\n');
        }

        // =======================================================
        // CÁC HÀM XUẤT EXCEL THUẦN OPENXML (PORT TỪ MIXER_CORE.PY)
        // =======================================================
        static async buildNativeXlsx(rows) {
            if (typeof XLSX !== 'undefined') {
                const cleanRows = rows.map(r => r.map(c => {
                    if (typeof c === 'string' && c.startsWith("'")) {
                        return c.substring(1);
                    }
                    return c;
                }));
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(cleanRows);
                XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
                const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                return new Uint8Array(outBuf);
            }

            const zip = new JSZip();
            const ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
            const rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
            const wb = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
            const wb_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');

            const sd = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
            for (let rIdx = 0; rIdx < rows.length; rIdx++) {
                const row = rows[rIdx];
                sd.push(`<row r="${rIdx + 1}">`);
                for (let cIdx = 0; cIdx < row.length; cIdx++) {
                    let colLetter = "";
                    let temp = cIdx;
                    while (temp >= 0) {
                        colLetter = String.fromCharCode(65 + (temp % 26)) + colLetter;
                        temp = Math.floor(temp / 26) - 1;
                    }
                    let rawVal = row[cIdx];
                    if (rawVal === null || rawVal === undefined) rawVal = "";
                    let vS = String(rawVal).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                    // Chuẩn 100% LiveTeX mixer_core.py line 100-103
                    if (vS !== "" && !isNaN(vS) && !vS.startsWith("=") && (!vS.startsWith("0") || vS === "0")) {
                        sd.push(`<c r="${colLetter}${rIdx + 1}" t="n"><v>${vS}</v></c>`);
                    } else {
                        sd.push(`<c r="${colLetter}${rIdx + 1}" t="inlineStr"><is><t>${vS}</t></is></c>`);
                    }
                }
                sd.push('</row>');
            }
            sd.push('</sheetData></worksheet>');

            zip.file('[Content_Types].xml', ct);
            zip.file('_rels/.rels', rels);
            zip.file('xl/workbook.xml', wb);
            zip.file('xl/_rels/workbook.xml.rels', wb_rels);
            zip.file('xl/worksheets/sheet1.xml', sd.join(''));

            return await zip.generateAsync({
                type: 'uint8array',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
        }

        static async buildSmartTestXlsx(matrixData) {
            const stRows = [["Câu\\Mã đề", ...matrixData.map(d => `'${d.made}`)]];
            const maxP1 = Math.max(40, ...matrixData.map(d => d.p1.length));
            for (let q = 0; q < maxP1; q++) {
                stRows.push([q + 1, ...matrixData.map(d => (q < d.p1.length ? d.p1[q] : ""))]);
            }
            const maxP2 = Math.max(8, ...matrixData.map(d => d.p2.length));
            for (let q = 0; q < maxP2; q++) {
                stRows.push([q + 1, ...matrixData.map(d => (q < d.p2.length ? d.p2[q].replace(/D/g, 'Đ') : ""))]);
            }
            const maxP3 = Math.max(8, ...matrixData.map(d => d.p3.length));
            for (let q = 0; q < maxP3; q++) {
                stRows.push([q + 1, ...matrixData.map(d => (q < d.p3.length ? d.p3[q] : ""))]);
            }
            return await ExamMixerEngine.buildNativeXlsx(stRows);
        }

        static async buildYoungMixXlsx(matrixData) {
            const maxP1 = Math.max(40, ...matrixData.map(d => d.p1.length));
            const maxP2 = Math.max(8, ...matrixData.map(d => d.p2.length));
            const maxP3 = Math.max(8, ...matrixData.map(d => d.p3.length));

            const ymHeader = ["Đề\\câu"];
            for (let q = 1; q <= maxP1; q++) ymHeader.push(q);
            for (let q = 1; q <= maxP2; q++) {
                ymHeader.push(`${q}a`, `${q}b`, `${q}c`, `${q}d`);
            }
            for (let q = 1; q <= maxP3; q++) ymHeader.push(q);

            const ymRows = [ymHeader];
            for (const d of matrixData) {
                const row = [`'${d.made}`];
                for (let i = 0; i < maxP1; i++) {
                    row.push(i < d.p1.length ? d.p1[i] : "");
                }
                for (let q = 0; q < maxP2; q++) {
                    if (q < d.p2.length) {
                        const tf = d.p2[q].replace(/D/g, 'Đ');
                        for (let c = 0; c < 4; c++) {
                            row.push(c < tf.length ? tf[c] : "");
                        }
                    } else {
                        row.push("", "", "", "");
                    }
                }
                for (let i = 0; i < maxP3; i++) {
                    row.push(i < d.p3.length ? d.p3[i] : "");
                }
                ymRows.append ? ymRows.append(row) : ymRows.push(row);
            }
            return await ExamMixerEngine.buildNativeXlsx(ymRows);
        }

        // =======================================================
        // CÁC HÀM TẠO DỮ LIỆU VÀ GIAO DIỆN MÃ QR
        // =======================================================
        static buildQrData(matrixData) {
            const untList = [];
            const tnmList = [];
            const qmList = [];

            // Lấy các mã đề thi con (hoặc cả đề gốc nếu chỉ có 1 đề)
            const targetCodes = matrixData.filter(d => !d.isGoc || matrixData.length === 1);

            for (const d of targetCodes) {
                // 1. Chuẩn UnT
                let unt = `${d.made}\n`;
                if (d.p1 && d.p1.length > 0) unt += d.p1.join('');
                if (d.p2 && d.p2.length > 0) unt += '\n' + d.p2.map(s => s.replace(/D/g, 'Đ')).join('');
                if (d.p3_raw && d.p3_raw.length > 0) {
                    const cleanSh = d.p3_raw.map(ans => cleanShortAnswer(ans));
                    unt += '\n' + cleanSh.join('|');
                }
                untList.push(unt);

                // 2. Chuẩn TNMaker: "made":"p1#p2_with_Đ#p3_clean"
                let tnm = `"${d.made}":"`;
                if (d.p1 && d.p1.length > 0) tnm += d.p1.join('');
                if (d.p2 && d.p2.length > 0) tnm += '#' + d.p2.map(s => s.replace(/D/g, 'Đ')).join('_');
                if (d.p3_raw && d.p3_raw.length > 0) {
                    const cleanSh = d.p3_raw.map(ans => cleanShortAnswer(ans));
                    tnm += '#' + cleanSh.join('_');
                }
                tnm += '"';
                tnmList.push({ made: d.made, pair: tnm });

                // 3. Chuẩn QM Chấm Thi: [made, ans1, ans2...]
                const qm = [String(d.made)];
                if (d.p1) qm.push(...d.p1);
                if (d.p2) {
                    for (const tf of d.p2) {
                        const normTf = tf.replace(/Đ/g, 'D');
                        for (let c = 0; c < normTf.length; c++) qm.push(normTf[c]);
                    }
                }
                if (d.p3_raw) {
                    for (const ans of d.p3_raw) {
                        const cleanAns = cleanShortAnswer(ans);
                        const num = parseFloat(cleanAns.replace(',', '.'));
                        if (!isNaN(num) && Number.isFinite(num)) {
                            qm.push(Number.isInteger(num) ? parseInt(num, 10) : num);
                        } else {
                            qm.push(cleanAns);
                        }
                    }
                }
                qmList.push(qm);
            }

            // Chia khối TNMaker (tối đa 8 mã đề / mã QR)
            const tnmChunks = [];
            for (let i = 0; i < tnmList.length; i += 8) {
                const chunk = tnmList.slice(i, i + 8);
                const jsonStr = '{' + chunk.map(c => c.pair).join(',') + ',"success":true,"type":6}';
                tnmChunks.push({
                    madeList: chunk.map(c => c.made),
                    qrString: jsonStr
                });
            }

            // Chia khối QM (tối đa 8 mã đề / mã QR theo yêu cầu Thầy Phạm Đình Quang)
            const qmChunks = [];
            for (let i = 0; i < qmList.length; i += 8) {
                const chunk = qmList.slice(i, i + 8);
                const jsonStr = JSON.stringify(chunk);
                qmChunks.push({
                    madeList: chunk.map(c => c[0]),
                    qrString: jsonStr
                });
            }

            return { untList, tnmList, tnmChunks, qmList, qmChunks };
        }

        static buildMaQrTex(qrData) {
            let tex = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{geometry}
\\usepackage{qrcode}
\\geometry{top=1.5cm, bottom=1.8cm, left=1.5cm, right=1.5cm}
\\begin{document}

\\begin{center}
{\\Large\\bfseries MÃ QR CODE CHẤM THI TỰ ĐỘNG}
\\end{center}
\\vspace{0.5cm}
`;

            // TNMaker QR
            if (qrData.tnmChunks && qrData.tnmChunks.length > 0) {
                tex += `\\section*{1. Mã QR dành cho ứng dụng chấm trắc nghiệm TNMaker}\n\\begin{center}\n`;
                for (const chunk of qrData.tnmChunks) {
                    const escaped = chunk.qrString.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
                    tex += `{\\bf Mã đề: ${chunk.madeList.join(', ')}}\\\\[2mm]\n`;
                    tex += `\\qrcode[height=1.8in]{${escaped}}\\vspace{6mm}\\\\\n`;
                }
                tex += `\\end{center}\n\\newpage\n`;
            }

            // QM Chấm thi QR
            if (qrData.qmChunks && qrData.qmChunks.length > 0) {
                tex += `\\section*{2. Mã QR dành cho ứng dụng chấm thi QM}\n\\begin{center}\n`;
                for (const chunk of qrData.qmChunks) {
                    const escaped = chunk.qrString.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
                    tex += `{\\bf Mã đề: ${chunk.madeList.join(', ')}}\\\\[2mm]\n`;
                    tex += `\\qrcode[height=1.6in]{${escaped}}\\vspace{6mm}\\\\\n`;
                }
                tex += `\\end{center}\n\\newpage\n`;
            }

            // UnT QR
            if (qrData.untList && qrData.untList.length > 0) {
                tex += `\\section*{3. Mã QR dành cho ứng dụng chấm thi UnT}\n\\begin{center}\n`;
                for (let i = 0; i < qrData.untList.length; i += 4) {
                    const chunk = qrData.untList.slice(i, i + 4);
                    tex += `\\qrcode[height=1.8in]{${chunk.join('\n')}}\\vspace{6mm}\\\\\n`;
                }
                tex += `\\end{center}\n`;
            }

            tex += `\\end{document}`;
            return tex;
        }

        static buildHuongDanGiaiTex(matrixData, cacDeDaTron, deGocBlocks) {
            let tex = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{amsmath,amssymb,geometry}
\\usepackage[book]{ex_test}
\\geometry{top=1.5cm, bottom=1.8cm, left=1.5cm, right=1.5cm}
\\begin{document}
`;
            for (const d of matrixData) {
                const made = d.made;
                const isGoc = d.isGoc;
                tex += `\\newpage\n\\setcounter{page}{1}\n\\begin{center}\\bfseries\\large\n\\fbox{HƯỚNG DẪN GIẢI CHI TIẾT - ${isGoc ? 'ĐỀ GỐC' : `MÃ ĐỀ ${made}`}}\n\\end{center}\n`;
                tex += `\\setcounter{section}{0}\\setcounter{subsection}{0}\\setcounter{subsubsection}{0}\\setcounter{ex}{0}\\setcounter{bt}{0}\n\n`;

                const blocks = isGoc ? deGocBlocks : (cacDeDaTron[made] || []);
                tex += blocks.join('\n\n') + `\n\n\\begin{center}\\bf\n----- HẾT -----\n\\end{center}\n`;
            }
            tex += `\\end{document}`;
            return tex.replace(/DPSpercent/g, '\\%');
        }

        static buildQrViewerHtml(title, matrixData, qrData) {
            const tnmJson = JSON.stringify(qrData.tnmChunks);
            const qmJson = JSON.stringify(qrData.qmChunks);
            const untJson = JSON.stringify(qrData.untList);

            return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mã QR Chấm Thi - ${title}</title>
    <script src="qrcode.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        :root { --primary: #ea580c; --primary-hover: #c2410c; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; --border: #e2e8f0; }
        @media (prefers-color-scheme: dark) {
            :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --border: #334155; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 24px; min-height: 100vh; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--border); }
        .title { font-size: 22px; font-weight: 800; color: var(--primary); }
        .sub { font-size: 13px; opacity: 0.7; margin-top: 4px; }
        .btn-print { background: var(--primary); color: #fff; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
        .btn-print:hover { background: var(--primary-hover); }
        .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .tab-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text); font-weight: 700; font-size: 13px; cursor: pointer; transition: 0.2s; }
        .tab-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .qr-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .qr-code-box { display: inline-flex; justify-content: center; align-items: center; padding: 14px; background: #ffffff; border-radius: 12px; margin: 12px 0; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .qr-label { font-size: 16px; font-weight: 800; margin-bottom: 6px; }
        .qr-desc { font-size: 11px; opacity: 0.7; word-break: break-all; max-height: 48px; overflow: hidden; margin-bottom: 12px; font-family: monospace; }
        .btn-dl { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .btn-dl:hover { background: #e2e8f0; }
        @media print {
            body { background: #fff !important; color: #000 !important; padding: 0 !important; }
            .header, .tabs, .btn-print, .btn-dl { display: none !important; }
            .grid { grid-template-columns: repeat(2, 1fr) !important; gap: 30px !important; }
            .qr-card { border: 1px solid #000 !important; box-shadow: none !important; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1 class="title">MÃ QR CODE CHẤM THI TỰ ĐỘNG</h1>
                <p class="sub">${title} | Hỗ trợ TNMaker, QM Chấm Thi &amp; UnT</p>
            </div>
            <button class="btn-print" onclick="window.print()">🖨️ In Mã QR Ra Giấy</button>
        </div>

        <div class="tabs">
            <button class="tab-btn active" id="btnTabTnm" onclick="switchTab('tnm')">📱 App TNMaker</button>
            <button class="tab-btn" id="btnTabQm" onclick="switchTab('qm')">📱 App QM Chấm Thi</button>
            <button class="tab-btn" id="btnTabUnt" onclick="switchTab('unt')">📱 App UnT</button>
        </div>

        <div id="tabContentTnm" class="grid"></div>
        <div id="tabContentQm" class="grid" style="display:none;"></div>
        <div id="tabContentUnt" class="grid" style="display:none;"></div>
    </div>

    <script>
        const tnmData = ${tnmJson};
        const qmData = ${qmJson};
        const untData = ${untJson};

        function switchTab(tab) {
            document.getElementById('btnTabTnm').className = tab === 'tnm' ? 'tab-btn active' : 'tab-btn';
            document.getElementById('btnTabQm').className = tab === 'qm' ? 'tab-btn active' : 'tab-btn';
            document.getElementById('btnTabUnt').className = tab === 'unt' ? 'tab-btn active' : 'tab-btn';

            document.getElementById('tabContentTnm').style.display = tab === 'tnm' ? 'grid' : 'none';
            document.getElementById('tabContentQm').style.display = tab === 'qm' ? 'grid' : 'none';
            document.getElementById('tabContentUnt').style.display = tab === 'unt' ? 'grid' : 'none';
        }

        function renderQrItem(container, title, text) {
            const card = document.createElement('div');
            card.className = 'qr-card';

            const h3 = document.createElement('div');
            h3.className = 'qr-label';
            h3.textContent = title;
            card.appendChild(h3);

            const desc = document.createElement('div');
            desc.className = 'qr-desc';
            desc.textContent = text;
            card.appendChild(desc);

            const qrBox = document.createElement('div');
            qrBox.className = 'qr-code-box';
            card.appendChild(qrBox);

            const dlBtn = document.createElement('button');
            dlBtn.className = 'btn-dl';
            dlBtn.textContent = '📥 Tải ảnh PNG';
            dlBtn.onclick = () => {
                const img = qrBox.querySelector('img');
                const canvas = qrBox.querySelector('canvas');
                const a = document.createElement('a');
                a.download = title.replace(/[^a-zA-Z0-9_]/g, '_') + '.png';
                if (img && img.src && img.src.startsWith('data:image/')) {
                    a.href = img.src;
                    a.click();
                } else if (canvas && typeof canvas.toDataURL === 'function') {
                    a.href = canvas.toDataURL('image/png');
                    a.click();
                }
            };
            card.appendChild(dlBtn);
            container.appendChild(card);

            try {
                new QRCode(qrBox, {
                    text: text,
                    width: 220,
                    height: 220,
                    correctLevel: QRCode.CorrectLevel.L
                });
            } catch (err) {
                console.error("Lỗi vẽ QR:", err);
            }
        }

        window.onload = function() {
            // 1. TNMaker
            const cTnm = document.getElementById('tabContentTnm');
            tnmData.forEach((chunk, idx) => {
                renderQrItem(cTnm, 'TNMaker: Mã đề ' + chunk.madeList.join(', '), chunk.qrString);
            });

            // 2. QM Chấm thi
            const cQm = document.getElementById('tabContentQm');
            qmData.forEach((chunk, idx) => {
                renderQrItem(cQm, 'App QM: Mã đề ' + chunk.madeList.join(', '), chunk.qrString);
            });

            // 3. UnT
            const cUnt = document.getElementById('tabContentUnt');
            untData.forEach((untStr, idx) => {
                const lines = untStr.split('\\n');
                renderQrItem(cUnt, 'App UnT: Mã đề ' + (lines[0] || (idx+1)), untStr);
            });
        };
    </script>
</body>
</html>`;
        }

        static async generateQrPngBlob(text, width = 350, height = 350) {
            const QR = typeof QRCode !== 'undefined' ? QRCode : (typeof window !== 'undefined' ? window.QRCode : null);
            if (!QR) return null;
            if (typeof document === 'undefined') return null;

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'fixed';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            try {
                new QR(tempDiv, {
                    text: text,
                    width: width,
                    height: height,
                    correctLevel: QR.CorrectLevel.L
                });

                await new Promise(r => setTimeout(r, 60));

                const canvas = tempDiv.querySelector('canvas');
                const img = tempDiv.querySelector('img');
                let dataUrl = '';
                if (canvas && typeof canvas.toDataURL === 'function') {
                    dataUrl = canvas.toDataURL('image/png');
                } else if (img && img.src && img.src.startsWith('data:image/')) {
                    dataUrl = img.src;
                }

                if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
                    const base64 = dataUrl.split(',')[1];
                    const binStr = atob(base64);
                    const bytes = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                    return bytes;
                }

                if (canvas && typeof canvas.toBlob === 'function') {
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    if (blob && blob.size > 0) return blob;
                }
            } catch (e) {
                console.warn("[Mixer] Lỗi tạo ảnh QR PNG:", e);
            } finally {
                if (tempDiv.parentNode) tempDiv.parentNode.removeChild(tempDiv);
            }
            return null;
        }

        buildMainTex(maDeList, headerCfg, isDapAn = false) {
            const inputs = maDeList.map(md => `\\input{de_thi/De_${md}}`).join('\n');
            const daInputs = isDapAn ? "\n\\newpage\n\\input{dap_an/HuongDanGiai}\n" : "";
            return `\\documentclass[12pt,a4paper]{article}
\\usepackage{amsmath,amssymb,geometry}
\\usepackage[book]{ex_test}
\\geometry{top=1.5cm, bottom=1.8cm, left=1.5cm, right=1.5cm}
\\begin{document}
${inputs}
\\end{document}`;
        }
    }

    // =======================================================
    // 4. GIAO DIỆN MODAL TRỘN ĐỀ THI (HTML / UI)
    // =======================================================
    function openExamMixerModal(defaultData = null) {
        let modal = document.getElementById('examMixerModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'examMixerModal';
            modal.className = 'fixed inset-0 z-[170] bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 transition-opacity';
            modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 flex flex-col" style="width: 95vw; max-width: 1100px; max-height: 90vh;">
                <!-- Header Modal -->
                <div class="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
                    <div class="flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg">
                            <i class="fa-solid fa-shuffle"></i>
                        </span>
                        <div>
                            <h3 class="font-bold text-gray-800 dark:text-gray-100 text-sm sm:text-base">Trộn Đề Thi Chuyên Nghiệp (TeX &amp; Word)</h3>
                            <p class="text-[11px] text-gray-500 dark:text-gray-400">Đảo câu hỏi, đảo phương án, phân nhóm ID6, xuất Đề gốc &amp; Đề con, Excel SmartTest/YoungMix &amp; Mã QR chấm thi</p>
                        </div>
                    </div>
                    <button type="button" onclick="window.closeExamMixerModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg text-lg">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Tabs chọn nguồn đầu vào -->
                <div class="flex items-center gap-2 pt-3 pb-1 border-b border-gray-100 dark:border-gray-800 shrink-0 text-xs">
                    <button type="button" onclick="window.switchMixerInputTab('file')" id="btnMixerTabFile" class="px-3 py-1.5 font-bold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors">
                        📁 Tải File (.tex / .docx)
                    </button>
                    <button type="button" onclick="window.switchMixerInputTab('paste')" id="btnMixerTabPaste" class="px-3 py-1.5 font-medium rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                        📋 Dán mã LaTeX
                    </button>
                    <button type="button" onclick="window.switchMixerInputTab('bank')" id="btnMixerTabBank" class="px-3 py-1.5 font-medium rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                        🏛️ Chọn từ Kho đề
                    </button>
                </div>

                <!-- Body Modal (Scrollable 2 Cột) -->
                <div class="py-3.5 overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-4">
                    
                    <!-- 1. Vùng chọn nguồn đầu vào -->
                    <div id="mixerInputAreaFile" class="p-3 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                        <input type="file" id="mixerFileInput" accept=".tex,.docx" class="hidden" onchange="window.handleMixerFileSelected(this)">
                        <div onclick="document.getElementById('mixerFileInput').click()" class="cursor-pointer py-4">
                            <i class="fa-solid fa-cloud-arrow-up text-3xl text-gray-400 mb-2"></i>
                            <p class="text-xs font-bold text-gray-700 dark:text-gray-200">Nhấp để chọn file hoặc kéo thả file .tex / .docx vào đây</p>
                            <p class="text-[11px] text-gray-400 mt-0.5">Hỗ trợ đầy đủ định dạng LaTeX (.tex) và Word DOCX (.docx)</p>
                        </div>
                        <div id="mixerFileStatus" class="hidden text-xs font-bold text-primary-600 dark:text-primary-400 pt-2 border-t border-gray-200 dark:border-gray-700"></div>
                    </div>

                    <div id="mixerInputAreaPaste" class="hidden">
                        <textarea id="mixerPasteInput" rows="6" placeholder="Dán nội dung mã nguồn LaTeX (\begin{ex}...\end{ex}) vào đây..." class="w-full p-2.5 text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                    </div>

                    <div id="mixerInputAreaBank" class="hidden">
                        <select id="mixerBankSelect" class="w-full p-2.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            <option value="">-- Chọn đề thi từ Ngân hàng của bạn --</option>
                        </select>
                    </div>

                    <!-- Nút Tải File mẫu chuẩn & Nút Mở Hướng dẫn định dạng -->
                    <div class="flex items-center justify-between flex-wrap gap-2 px-1">
                        <div class="flex items-center gap-2">
                            <a href="mau_de_tron_chuan.docx" download="De_Thi_Mau_Tron_De_QMath.docx" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-bold transition shadow-2xs">
                                <i class="fa-solid fa-file-arrow-down text-blue-600 dark:text-blue-400"></i> Tải file Word mẫu chuẩn (.docx)
                            </a>
                            <span class="text-[11px] text-gray-400 hidden sm:inline">|</span>
                            <span class="text-[11px] text-gray-500 dark:text-gray-400 hidden sm:inline">Chuẩn 3 Phần Bộ GD&ĐT 2025 kèm MathType</span>
                        </div>
                        <button type="button" onclick="window.toggleMixerGuide()" class="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 cursor-pointer">
                            <i class="fa-solid fa-circle-question"></i> <span id="textToggleMixerGuide">Hướng dẫn định dạng &amp; quy tắc file</span>
                            <i id="iconToggleMixerGuide" class="fa-solid fa-chevron-down text-[10px] transition-transform duration-200"></i>
                        </button>
                    </div>

                    <!-- Khung Hướng dẫn định dạng chi tiết (Collapsible) -->
                    <div id="mixerGuideBox" class="hidden p-3.5 bg-sky-50/70 dark:bg-sky-950/20 rounded-xl border border-sky-200 dark:border-sky-800/60 text-xs space-y-3 transition-all">
                        <div class="flex items-center justify-between border-b border-sky-200 dark:border-sky-800/80 pb-2">
                            <span class="font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                                <i class="fa-solid fa-book-open"></i> Hướng dẫn định dạng file Word (.docx) &amp; Quy tắc trộn đề thi
                            </span>
                            <span class="text-[11px] text-sky-600 dark:text-sky-400 font-medium">Bảo toàn 100% công thức MathType OLE &amp; OMML</span>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-gray-700 dark:text-gray-300">
                            <!-- Cột 1: Các cách đặt phương án đúng -->
                            <div class="space-y-2 bg-white dark:bg-gray-800/80 p-2.5 rounded-lg border border-sky-100 dark:border-gray-700">
                                <p class="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                                    <i class="fa-solid fa-check-double text-emerald-500"></i> 1. Các cách đặt phương án đúng (Hỗ trợ cả 3 cách):
                                </p>
                                <ul class="list-disc pl-4 space-y-1 text-gray-600 dark:text-gray-300">
                                    <li><b>Cách 1 (Gạch chân / Tô màu):</b> <u class="text-emerald-600 dark:text-emerald-400">Gạch chân</u> hoặc <span class="bg-yellow-200 dark:bg-yellow-800/60 px-1 rounded">Highlight</span> phương án đúng (VD: <u>A.</u> hoặc <u>A. $x = 2$</u>). Hệ thống sẽ tự động gỡ gạch chân/tô màu trên đề thi của học sinh.</li>
                                    <li><b>Cách 2 (Trong Lời giải):</b> Ghi rõ <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-bold">Chọn A</code> / <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-bold">Chọn B</code>... trong phần lời giải.</li>
                                    <li><b>Cách 3 (Bảng đáp án tổng hợp):</b> Đặt bảng đáp án tổng hợp ở cuối tài liệu (như trong file mẫu). Hệ thống tự động quét và trích xuất chuẩn xác 100%.</li>
                                    <li><b>Phần II (Đúng / Sai):</b> Gạch chân ý Đúng (các ý không gạch chân là Sai), hoặc ghi <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-bold">(Đúng)</code>, <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-bold">(Sai)</code> ở cuối mỗi ý a, b, c, d.</li>
                                    <li><b>Phần III (Trả lời ngắn):</b> Ghi sau từ khóa: <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-bold">Đáp án: 0,5</code> hoặc <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded font-bold">Đáp số: -6</code> (hoặc gạch chân số).</li>
                                </ul>
                            </div>

                            <!-- Cột 2: Cấu trúc 3 Phần & Kết thúc file -->
                            <div class="space-y-2 bg-white dark:bg-gray-800/80 p-2.5 rounded-lg border border-sky-100 dark:border-gray-700">
                                <p class="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                                    <i class="fa-solid fa-flag-checkered text-rose-500"></i> 2. Khi nào thì kết thúc 1 file (Đề thi)?
                                </p>
                                <ul class="list-disc pl-4 space-y-1 text-gray-600 dark:text-gray-300">
                                    <li>Đặt chữ <b class="text-rose-600 dark:text-rose-400">HẾT</b> hoặc <b class="text-rose-600 dark:text-rose-400">--- HẾT ---</b> hoặc <b class="text-rose-600 dark:text-rose-400">(HẾT)</b> ở một dòng riêng biệt.</li>
                                    <li><b>Quy tắc quan trọng:</b> Mọi nội dung đặt sau chữ <b>HẾT</b> (như Bảng đáp án tổng hợp, Lời giải chi tiết, Ma trận đề, Thông tin giám thị) sẽ <b>KHÔNG bị trộn lẫn vào đề thi</b> của học sinh.</li>
                                    <li>Đề thi con học sinh tải về sẽ tự động cắt phần sau chữ HẾT và thay bằng chân trang chuẩn Bộ GD&ĐT: <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">------------------- HẾT -------------------</code>.</li>
                                </ul>

                                <p class="font-bold text-gray-800 dark:text-gray-200 pt-1 flex items-center gap-1">
                                    <i class="fa-solid fa-lock text-amber-500"></i> 3. Khóa câu hỏi / phương án không đảo:
                                </p>
                                <p class="text-gray-600 dark:text-gray-300">
                                    Thêm ký hiệu <code class="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-1 rounded font-bold">##</code> trước câu hỏi (VD: <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">## Câu 5:</code>) hoặc trước phương án để giữ nguyên vị trí ban đầu, không bị đảo xáo.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Bố cục 2 Cột: Cấu hình Trộn đề & Khung Tiêu Đề -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px;">
                        
                        <!-- CỘT TRÁI: Cấu hình Trộn -->
                        <div class="space-y-3.5" style="min-width: 0;">
                            <div class="p-3.5 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/80 space-y-3">
                                <label class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <i class="fa-solid fa-sliders text-gray-600 dark:text-gray-300"></i> Cấu hình khi trộn
                                </label>

                                <!-- Số lượng đề & Chế độ mã đề -->
                                <div class="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                                    <div>
                                        <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">Số lượng mã đề</label>
                                        <input type="number" id="mixerExamCount" value="4" min="1" max="24" onchange="window.updateMixerPreviewCodes()" class="w-full px-2.5 py-1.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-center outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">Độ dài mã đề</label>
                                        <div class="inline-flex w-full rounded-lg border border-gray-300 dark:border-gray-600 p-0.5 bg-gray-100 dark:bg-gray-800 text-[11px]">
                                            <button type="button" id="btnMixerDigits3" onclick="window.setMixerDigits(3)" class="flex-1 py-1 font-medium rounded-md text-gray-600 dark:text-gray-400 cursor-pointer">3 số</button>
                                            <button type="button" id="btnMixerDigits4" onclick="window.setMixerDigits(4)" class="flex-1 py-1 font-bold rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-xs cursor-pointer">4 số</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Quy tắc sinh mã đề & Xem trước -->
                                <div>
                                    <div class="flex items-center justify-between mb-1">
                                        <label class="text-[11px] font-bold text-gray-600 dark:text-gray-400">Quy tắc sinh mã đề</label>
                                        <select id="mixerCodeStyle" onchange="window.updateMixerPreviewCodes()" class="text-[11px] font-medium px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none">
                                            <option value="consecutive" selected>Liên tiếp (1001, 1002...)</option>
                                            <option value="random">Ngẫu nhiên</option>
                                            <option value="even">Số chẵn</option>
                                            <option value="odd">Số lẻ</option>
                                        </select>
                                    </div>
                                    <input type="text" id="mixerCodesPreview" value="1001, 1002, 1003, 1004" title="Danh sách mã đề phân cách bằng dấu phẩy" class="w-full px-2.5 py-1.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>

                                <!-- Các tùy chọn đảo -->
                                <div class="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs">
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" id="mixerShuffleQuestions" checked class="rounded text-primary-600 focus:ring-primary-500">
                                        <span class="text-gray-700 dark:text-gray-300 font-bold">Đảo câu hỏi (Hỗ trợ khóa ##)</span>
                                    </label>
                                    <div class="pl-5">
                                        <label class="block text-[11px] text-gray-500 mb-0.5">Phân nhóm mức độ ID6:</label>
                                        <select id="mixerPhanNhom" class="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none">
                                            <option value="Không phân nhóm" selected>Không phân nhóm (Đảo tự do toàn bộ)</option>
                                            <option value="2 nhóm">2 nhóm: Dễ (NB, TH) &lt; Khó (VD, VDC)</option>
                                            <option value="3 nhóm: Biết < Hiểu < VD, VDC">3 nhóm: Biết &lt; Hiểu &lt; VD, VDC</option>
                                            <option value="3 nhóm: Biết < Hiểu, VD < VDC">3 nhóm: Biết &lt; Hiểu, VD &lt; VDC</option>
                                            <option value="4 nhóm">4 nhóm: Biết &lt; Hiểu &lt; VD &lt; VDC</option>
                                        </select>
                                    </div>
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" id="mixerShuffleOptions" checked class="rounded text-primary-600 focus:ring-primary-500">
                                        <span class="text-gray-700 dark:text-gray-300 font-bold">Đảo 4 phương án trắc nghiệm A, B, C, D</span>
                                    </label>
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" id="mixerShuffleTf" checked class="rounded text-primary-600 focus:ring-primary-500">
                                        <span class="text-gray-700 dark:text-gray-300 font-bold">Đảo mệnh đề Đúng/Sai (Đồng bộ lời giải \\itemch)</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- CỘT PHẢI: Cấu hình Tiêu đề đề thi -->
                        <div class="space-y-3.5" style="min-width: 0;">
                            <div class="p-3.5 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/80 space-y-3">
                                <div class="flex items-center justify-between">
                                    <label class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                        <i class="fa-solid fa-heading text-gray-600 dark:text-gray-300"></i> Tiêu đề đề thi (Header)
                                    </label>
                                    <select id="mixerHeaderStyle" class="text-xs font-bold px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none">
                                        <option value="standard_gov" selected>🏛️ Mẫu 1: Chuẩn Sở / Bộ GD</option>
                                        <option value="brand_center">⭐ Mẫu 2: Trung tâm / QMath</option>
                                        <option value="compact">📄 Mẫu 3: Tiêu đề Rút gọn</option>
                                    </select>
                                </div>

                                <div class="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                                    <div class="grid grid-cols-2 gap-2">
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Sở GD / Cơ quan</label>
                                            <input type="text" id="mixerAgencyName" value="SỞ GD&ĐT HÀ NỘI" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Trường / Đơn vị</label>
                                            <input type="text" id="mixerSchoolName" value="TRƯỜNG THPT TRẦN QUANG KHẢI" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-2 gap-2">
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Tên đề thi / Bài KT</label>
                                            <input type="text" id="mixerTitleInput" value="KIỂM TRA HỌC KỲ I" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Loại đề</label>
                                            <input type="text" id="mixerExamType" value="(ĐỀ CHÍNH THỨC)" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-3 gap-2">
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Môn thi</label>
                                            <input type="text" id="mixerSubject" value="TOÁN HỌC" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Khối</label>
                                            <input type="text" id="mixerGrade" value="9" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Thời gian</label>
                                            <div class="flex items-center gap-1">
                                                <input type="number" id="mixerDuration" value="90" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-center font-bold outline-none">
                                                <span class="text-[11px] text-gray-400">ph</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Định dạng đầu ra -->
                                    <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                                        <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">Định dạng file xuất trong gói ZIP</label>
                                        <select id="mixerOutputFormat" class="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none">
                                            <option value="both" selected>📦 Đầy đủ: Word (.docx) + TeX + Excel SmartTest/YoungMix + Mã QR</option>
                                            <option value="word">📄 File Word (.docx) + Excel SmartTest/YoungMix + Mã QR</option>
                                            <option value="tex">📐 File LaTeX (.tex) + Excel SmartTest/YoungMix + Mã QR</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Thanh thông báo tiến trình -->
                    <div id="mixerProgressBox" class="hidden p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-1.5">
                        <div class="flex items-center justify-between text-xs font-bold">
                            <span id="mixerProgressText" class="text-gray-700 dark:text-gray-300">Đang tiến hành trộn đề...</span>
                            <span id="mixerProgressPercent" class="text-primary-600">0%</span>
                        </div>
                        <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div id="mixerProgressBar" class="h-full bg-primary-600 transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>

                </div>

                <!-- Footer Modal -->
                <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
                    <button type="button" onclick="window.closeExamMixerModal()" class="px-4 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer">Đóng</button>
                    <button type="button" id="btnStartMixingExams" onclick="window.startMixingExamsAction()" class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer" style="background-color: var(--primary-color, #ea580c); color: #ffffff;">
                        <i class="fa-solid fa-shuffle"></i> Bắt đầu Trộn &amp; Tải ZIP
                    </button>
                </div>
            </div>`;
            document.body.appendChild(modal);
        }

        // Khởi tạo danh sách đề thi từ Bank nếu có
        const bankSelect = document.getElementById('mixerBankSelect');
        if (bankSelect && Array.isArray(window.examData)) {
            bankSelect.innerHTML = '<option value="">-- Chọn đề thi từ Ngân hàng của bạn --</option>';
            window.examData.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = `${e.title || 'Đề thi'} (${e.subject || 'Toán'} - ${e.grade || ''})`;
                bankSelect.appendChild(opt);
            });
        }

        modal.classList.remove('hidden');
    }

    function closeExamMixerModal() {
        const modal = document.getElementById('examMixerModal');
        if (modal) modal.classList.add('hidden');
    }

    window.toggleMixerGuide = function() {
        const box = document.getElementById('mixerGuideBox');
        const icon = document.getElementById('iconToggleMixerGuide');
        const text = document.getElementById('textToggleMixerGuide');
        if (!box) return;
        const isHidden = box.classList.contains('hidden');
        if (isHidden) {
            box.classList.remove('hidden');
            if (icon) icon.className = "fa-solid fa-chevron-up text-[10px] transition-transform duration-200";
            if (text) text.textContent = "Thu gọn hướng dẫn";
        } else {
            box.classList.add('hidden');
            if (icon) icon.className = "fa-solid fa-chevron-down text-[10px] transition-transform duration-200";
            if (text) text.textContent = "Hướng dẫn định dạng & quy tắc file";
        }
    };

    window.switchMixerInputTab = function(tab) {
        window._activeMixerTab = tab;
        const bFile = document.getElementById('btnMixerTabFile');
        const bPaste = document.getElementById('btnMixerTabPaste');
        const bBank = document.getElementById('btnMixerTabBank');
        const aFile = document.getElementById('mixerInputAreaFile');
        const aPaste = document.getElementById('mixerInputAreaPaste');
        const aBank = document.getElementById('mixerInputAreaBank');

        const activeCls = "px-3 py-1.5 font-bold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors";
        const inactiveCls = "px-3 py-1.5 font-medium rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors";

        if (bFile) bFile.className = tab === 'file' ? activeCls : inactiveCls;
        if (bPaste) bPaste.className = tab === 'paste' ? activeCls : inactiveCls;
        if (bBank) bBank.className = tab === 'bank' ? activeCls : inactiveCls;

        if (aFile) aFile.className = tab === 'file' ? 'p-3 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center' : 'hidden';
        if (aPaste) aPaste.className = tab === 'paste' ? '' : 'hidden';
        if (aBank) aBank.className = tab === 'bank' ? '' : 'hidden';
    };

    window._mixerDigits = 4;
    window.setMixerDigits = function(digits) {
        window._mixerDigits = digits;
        const b3 = document.getElementById('btnMixerDigits3');
        const b4 = document.getElementById('btnMixerDigits4');
        if (b3 && b4) {
            if (digits === 3) {
                b3.className = "flex-1 py-1 font-bold rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-xs cursor-pointer";
                b4.className = "flex-1 py-1 font-medium rounded-md text-gray-600 dark:text-gray-400 cursor-pointer";
            } else {
                b4.className = "flex-1 py-1 font-bold rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-xs cursor-pointer";
                b3.className = "flex-1 py-1 font-medium rounded-md text-gray-600 dark:text-gray-400 cursor-pointer";
            }
        }
        window.updateMixerPreviewCodes();
    };

    window.updateMixerPreviewCodes = function() {
        const count = parseInt(document.getElementById('mixerExamCount')?.value || 4, 10);
        const digits = window._mixerDigits || 4;
        const style = document.getElementById('mixerCodeStyle')?.value || 'consecutive';
        const codes = ExamMixerEngine.generateExamCodes(count, digits, style);
        const previewInput = document.getElementById('mixerCodesPreview');
        if (previewInput) {
            previewInput.value = codes.join(', ');
        }
    };

    window._mixerUploadedFile = null;
    window.handleMixerFileSelected = function(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        window._mixerUploadedFile = file;
        const statusBox = document.getElementById('mixerFileStatus');
        if (statusBox) {
            statusBox.textContent = `Đã chọn file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            statusBox.classList.remove('hidden');
        }
        const ext = file.name.split('.').pop().toLowerCase();
        const outputFmt = document.getElementById('mixerOutputFormat');
        if (outputFmt) {
            if (ext === 'docx') {
                outputFmt.value = 'word';
            } else if (ext === 'tex') {
                outputFmt.value = 'tex';
            }
        }
    };

    window.startMixingExamsAction = async function() {
        const btn = document.getElementById('btnStartMixingExams');
        const pBox = document.getElementById('mixerProgressBox');
        const pBar = document.getElementById('mixerProgressBar');
        const pText = document.getElementById('mixerProgressText');
        const pPct = document.getElementById('mixerProgressPercent');

        const activeTab = window._activeMixerTab || 'file';
        let inputData = null;

        try {
            if (activeTab === 'file') {
                if (!window._mixerUploadedFile) {
                    alert("Vui lòng chọn file .tex hoặc .docx để trộn!");
                    return;
                }
                const ext = window._mixerUploadedFile.name.split('.').pop().toLowerCase();
                if (ext === 'tex') {
                    inputData = await window._mixerUploadedFile.text();
                } else if (ext === 'docx') {
                    inputData = await window._mixerUploadedFile.arrayBuffer();
                } else {
                    alert("Định dạng file không được hỗ trợ. Vui lòng chọn file .tex hoặc .docx!");
                    return;
                }
            } else if (activeTab === 'paste') {
                const text = document.getElementById('mixerPasteInput')?.value || '';
                if (!text.trim()) {
                    alert("Vui lòng dán nội dung mã nguồn LaTeX!");
                    return;
                }
                inputData = text;
            } else if (activeTab === 'bank') {
                const examId = document.getElementById('mixerBankSelect')?.value;
                if (!examId) {
                    alert("Vui lòng chọn một đề thi từ ngân hàng!");
                    return;
                }
                const examObj = (window.examData || []).find(e => e.id === examId);
                if (!examObj) {
                    alert("Không tìm thấy dữ liệu đề thi đã chọn!");
                    return;
                }
                inputData = examObj.questions || [];
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang trộn đề thi...';
            if (pBox) pBox.classList.remove('hidden');

            const count = parseInt(document.getElementById('mixerExamCount')?.value || 4, 10);
            const codesStr = document.getElementById('mixerCodesPreview')?.value || '1001, 1002, 1003, 1004';
            const maDeList = codesStr.split(',').map(s => s.trim()).filter(Boolean);

            const engine = new ExamMixerEngine(inputData, {
                so_de: count,
                ma_de_list: maDeList,
                ma_de_digits: window._mixerDigits || 4,
                dao_cau: document.getElementById('mixerShuffleQuestions')?.checked !== false,
                dao_pa: document.getElementById('mixerShuffleOptions')?.checked !== false,
                dao_y_tf: document.getElementById('mixerShuffleTf')?.checked !== false,
                phannhom: document.getElementById('mixerPhanNhom')?.value || 'Không phân nhóm',
                output_format: document.getElementById('mixerOutputFormat')?.value || 'both',
                header: {
                    style: document.getElementById('mixerHeaderStyle')?.value || 'standard_gov',
                    agency: document.getElementById('mixerAgencyName')?.value || 'SỞ GD&ĐT HÀ NỘI',
                    school: document.getElementById('mixerSchoolName')?.value || 'TRƯỜNG THPT TRẦN QUANG KHẢI',
                    title: document.getElementById('mixerTitleInput')?.value || 'KIỂM TRA HỌC KỲ I',
                    examType: document.getElementById('mixerExamType')?.value || '(ĐỀ CHÍNH THỨC)',
                    subject: document.getElementById('mixerSubject')?.value || 'TOÁN HỌC',
                    grade: document.getElementById('mixerGrade')?.value || '9',
                    duration: parseInt(document.getElementById('mixerDuration')?.value || 90, 10),
                    candidateInfo: true
                }
            });

            const result = await engine.mix((pct, msg) => {
                if (pBar) pBar.style.width = pct + '%';
                if (pPct) pPct.textContent = pct + '%';
                if (pText) pText.textContent = msg;
            });

            // Tự động tải file ZIP
            const safeTitle = (document.getElementById('mixerTitleInput')?.value || 'De_Thi').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
            const zipName = `Bo_De_Tron_${safeTitle}_${maDeList.length}_MaDe.zip`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(result.zipBlob);
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            if (window.showToast) window.showToast(`Trộn thành công ${maDeList.length} mã đề thi! Đang tải file ZIP...`, 'success');
            else if (window.showNotification) window.showNotification(`Trộn thành công ${maDeList.length} mã đề thi!`, 'success');

            setTimeout(() => {
                window.closeExamMixerModal();
            }, 1200);

        } catch (err) {
            console.error("[ExamMixer] Lỗi:", err);
            alert("Lỗi trộn đề: " + (err.message || err.toString()));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-shuffle"></i> Bắt đầu Trộn &amp; Tải ZIP';
        }
    };

    // Exports
    window.DocxDirectMixer = DocxDirectMixer;
    window.ExamMixerEngine = ExamMixerEngine;
    window.openExamMixerModal = openExamMixerModal;
    window.closeExamMixerModal = closeExamMixerModal;

})(typeof window !== 'undefined' ? window : this);
