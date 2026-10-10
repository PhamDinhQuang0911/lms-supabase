/**
 * question-importer.js - Module phân tích và nhập câu hỏi từ LaTeX (.tex) và Word (.docx)
 * Dùng chung cho: exam-editor.html, dashboard.html (Nạp câu hỏi vào ngân hàng), book-manager.html...
 */
(function(global) {
    'use strict';
    const window = global;

    // --- HÀM TIỆN ÍCH LÀM SẠCH VÀ CHUẨN HÓA TOÁN ---
    function cleanTikzCode(code) {
        if (!code) return "";
        return code.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g, (match) => {
            return match.replace(/&/g, 'AMP_PLACEHOLDER');
        });
    }

    function extractNextBrace(str) {
        let depth = 0, start = -1;
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '{') {
                if (depth === 0) start = i + 1;
                depth++;
            } else if (str[i] === '}') {
                depth--;
                if (depth === 0 && start !== -1) {
                    return { content: str.substring(start, i), remaining: str.substring(i + 1) };
                }
            }
        }
        return null;
    }

    function parseQuestionID(rawId) {
        if (!rawId) return { subject: 'Chưa phân loại', level: '', levelColor: 'gray' };
        let clean = rawId.replace(/[\[\]%]/g, '').trim().toUpperCase();
        let subject = 'Chưa phân loại';
        let level = '';
        let levelColor = 'gray';

        if (clean.includes('D') || clean.includes('DS') || clean.includes('ĐẠI')) subject = 'Đại số';
        else if (clean.includes('H') || clean.includes('HH') || clean.includes('HÌNH')) subject = 'Hình học';
        else if (clean.includes('X') || clean.includes('XS') || clean.includes('THỐNG')) subject = 'Xác suất';

        if (clean.includes('NB') || clean.includes('N1') || clean.includes('N2') || clean.includes('NHẬN BIẾT')) {
            level = 'Nhận biết'; levelColor = 'green';
        } else if (clean.includes('TH') || clean.includes('H1') || clean.includes('H2') || clean.includes('THÔNG HIỂU')) {
            level = 'Thông hiểu'; levelColor = 'blue';
        } else if (clean.includes('VDC') || clean.includes('C1') || clean.includes('C2') || clean.includes('CAO')) {
            level = 'Vận dụng cao'; levelColor = 'red';
        } else if (clean.includes('VD') || clean.includes('V1') || clean.includes('V2') || clean.includes('VẬN DỤNG')) {
            level = 'Vận dụng'; levelColor = 'orange';
        }

        return { subject, level, levelColor };
    }

    function cleanWordMathLatex(str) {
        if (!str || typeof str !== 'string') return str;
        // 1. Chuẩn hóa hệ phương trình MathType bị vỡ cấu trúc array
        const regexMangledSystem = /\\left\s*([^\\]*(?:\\(?!(?:begin\{array\}|right))[^\\]*)*?)\s*\\begin\{array\}\s*\{[^{}]*\}\s*\\end\{array\}\s*\\right(?:\\\.|\.|\{|\})?\s*([\s\S]*?)\s*(?:\\\{|\\\}|\\\.|(?=\$))/g;
        str = str.replace(regexMangledSystem, (match, eq1, eq2) => {
            const clean1 = (eq1 || '').trim().replace(/^\\left\s*/, '');
            let clean2 = (eq2 || '').trim().replace(/^[.\s]+/, '').replace(/^\\\./, '').replace(/\\\{$/, '').trim();
            return `\\begin{cases} ${clean1} \\\\ ${clean2} \\end{cases}`;
        });
        str = str.replace(/\\left\{\s*\\begin\{array\}/g, '\\begin{cases}').replace(/\\end\{array\}\s*\\right\./g, '\\end{cases}');
        str = str.replace(/\\left\[\s*\\begin\{array\}/g, '\\begin{bmatrix}').replace(/\\end\{array\}\s*\\right\]/g, '\\end{bmatrix}');
        return str;
    }

    function wordHtmlToImportText(html) {
        const source = new DOMParser().parseFromString(html || '', 'text/html');

        source.querySelectorAll('u').forEach(underlined => {
            const label = (underlined.textContent || '').trim().match(/^([A-Da-d])\s*[\.\)]?$/);
            if (label) {
                underlined.before(document.createTextNode(` [[WORD_UNDERLINE_${label[1].toUpperCase()}]] `));
            }
        });

        // Bóc tách bảng
        source.querySelectorAll('table').forEach((table) => {
            let tableText = '\n';
            table.querySelectorAll('tr').forEach(row => {
                const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim());
                if (cells.length > 0) tableText += cells.join(' | ') + '\n';
            });
            table.replaceWith(document.createTextNode(tableText));
        });

        // Đổi các thẻ xuống dòng
        source.querySelectorAll('p, div, br, h1, h2, h3, h4, h5, h6').forEach(el => {
            if (el.tagName === 'BR') el.replaceWith(document.createTextNode('\n'));
            else el.appendChild(document.createTextNode('\n'));
        });

        return source.body.textContent || '';
    }

    // --- PARSER LATEX HOÀN CHỈNH ---
    function parseLatexExamString(rawFileContent) {
        let content = rawFileContent;

        // 1. Làm sạch LaTeX rác
        content = content.replace(/\\begin\{multicols\}\{.*?\}/g, "").replace(/\\end\{multicols\}/g, "");
        content = content.replace(/\\begin\{align\*\}([\s\S]*?)\\end\{align\*\}/g, (m, p1) => `$$ \\begin{aligned}${p1}\\end{aligned} $$`);
        
        // Không xóa dòng comment chứa ID [...]
        content = content.replace(/^[ \t]*(?<!\\)%.*\r?\n?/gm, (match) => {
            if (match.includes('[') && match.includes(']')) return match;
            return '';
        });

        content = content.replace(/\\begin\{array\}\s*\{[^{}]*?\}/g, '\\begin{matrix}').replace(/\\end\{array\}/g, '\\end{matrix}');

        const parsedList = [];
        const blockRegex = /\\begin\{(ex|bt|vd|vidu)\}([\s\S]*?)\\end\{\1\}/g;
        let match, count = 0;
        
        while ((match = blockRegex.exec(content)) !== null) {
            const currentEnv = match[1];
            let fullBody = match[2];

            // Header: [CCCD]%[Nguồn]%[MapID]
            let questionID = "";
            let assignedCccd = "";
            let source = "";
            let tags = { subject: 'Chưa phân loại', level: '', levelColor: 'gray' };

            const trimmedBody = fullBody.trimStart();
            const firstNewline = trimmedBody.indexOf('\n');
            const firstLine = firstNewline !== -1 ? trimmedBody.substring(0, firstNewline) : trimmedBody;
            const bracketMatches = Array.from(firstLine.matchAll(/\[(.*?)\]/g)).map(m => m[1].trim());

            if (bracketMatches.length >= 3) {
                assignedCccd = bracketMatches[0];
                source = bracketMatches[1];
                questionID = bracketMatches[2];
            } else if (bracketMatches.length === 2) {
                if (/^\d{5,10}$/.test(bracketMatches[0])) {
                    assignedCccd = bracketMatches[0];
                    if (/^[0-2]?[0-9][A-Z][0-9]/i.test(bracketMatches[1])) {
                        questionID = bracketMatches[1];
                    } else {
                        source = bracketMatches[1];
                    }
                } else {
                    source = bracketMatches[0];
                    questionID = bracketMatches[1];
                }
            } else if (bracketMatches.length === 1) {
                const val = bracketMatches[0];
                if (/^\d{5,10}$/.test(val)) {
                    assignedCccd = val;
                } else if (/^[0-2]?[0-9][A-Z][0-9]/i.test(val)) {
                    questionID = val;
                } else {
                    source = val;
                }
            }

            if (!questionID) {
                const idMatch = fullBody.match(/(?:%%|%)\s*\[([a-zA-Z0-9\-_.]+)\]/);
                if (idMatch) questionID = idMatch[1];
            }

            if (questionID) tags = parseQuestionID(questionID);

            let testLine = firstLine.trim();
            testLine = testLine.replace(/^(\s*\[[^\]]*\]|\s*(?:%%|%)\[[^\]]*\])+/, '').trim();
            if (testLine === '' || testLine.startsWith('%')) {
                if (firstNewline !== -1) {
                    fullBody = trimmedBody.substring(firstNewline + 1);
                } else {
                    fullBody = '';
                }
            } else {
                fullBody = trimmedBody.replace(/^(\s*\[[^\]]*\]|\s*(?:%%|%)\[[^\]]*\])+\s*/, '');
            }
            fullBody = fullBody.replace(/(?:%%|%)\s*\[[a-zA-Z0-9\-_.]+\]/g, '');
            fullBody = fullBody.replace(/(?<!\\)%.*/g, '');
            fullBody = fullBody.replace(/^\s*\[.*?\]/, '');
            
            let qType = 'essay';
            let qData = { 
                content: '', solution: '', options: [], statements: [], answer: '', point: 0.25,
                mapId: questionID, subject: tags.subject, level: tags.level, levelColor: tags.levelColor 
            };
            
            // Tách lời giải
            let mainContent = fullBody;
            const loigiaiIndex = fullBody.lastIndexOf('\\loigiai');
            if (loigiaiIndex !== -1) {
                mainContent = fullBody.substring(0, loigiaiIndex);
                const solPart = fullBody.substring(loigiaiIndex);
                const solMatch = solPart.match(/\\loigiai\s*\{([\s\S]*)\}/);
                if (solMatch) {
                    let depth = 0, start = solPart.indexOf('{'), end = -1;
                    for (let i = start; i < solPart.length; i++) {
                        if (solPart[i] == '{') depth++; else if (solPart[i] == '}') depth--;
                        if (depth === 0 && start !== -1) { end = i; break; }
                    }
                    if (end !== -1) {
                        qData.solution = cleanTikzCode(solPart.substring(start + 1, end)).replace(/(?<!\\)%.*/g, '');
                    }
                }
            }
            
            let procBody = cleanTikzCode(mainContent);
            
            // Nhận diện loại câu hỏi
            if (procBody.includes('\\choiceTF')) {
                qType = 'tf';
                const parts = procBody.split('\\choiceTF');
                qData.content = parts[0].trim();
                const stmtsRaw = parts[1];
                let tempStmts = [], cursor = 0;
                const getNextArg = (str) => {
                    const s = str.indexOf('{', cursor); if (s === -1) return null;
                    let d = 1, e = -1; for (let i = s + 1; i < str.length; i++) { if (str[i] == '{') d++; else if (str[i] == '}') d--; if (d === 0) { e = i; break; } }
                    if (e !== -1) { cursor = e + 1; return str.substring(s + 1, e); } return null;
                };
                cursor = 0; 
                while (cursor < stmtsRaw.length) {
                    let txt = getNextArg(stmtsRaw); if (txt === null) break;
                    tempStmts.push({ text: txt.replace(/\\(True|False)/g, '').trim(), isTrue: txt.includes('\\True') });
                }
                qData.statements = tempStmts;
                if (cursor < stmtsRaw.length) {
                    const leftover = stmtsRaw.substring(cursor).trim();
                    if (leftover) qData.content += '\n\n' + leftover;
                }
            } else if (procBody.includes('\\choice')) {
                qType = 'mc';
                const parts = procBody.split('\\choice');
                qData.content = parts[0].trim();
                let cursor = 0, optsRaw = parts[1], optCount = 0;
                const getNextArg = (str) => { 
                    const s = str.indexOf('{', cursor); if (s === -1) return null;
                    let d = 1, e = -1; for (let i = s + 1; i < str.length; i++) { if (str[i] == '{') d++; else if (str[i] == '}') d--; if (d === 0) { e = i; break; } }
                    if (e !== -1) { cursor = e + 1; return str.substring(s + 1, e); } return null;
                };
                while (optCount < 4) {
                    let txt = getNextArg(optsRaw); if (txt === null) break;
                    if (txt.includes('\\True')) qData.correct = optCount;
                    qData.options.push(txt.replace('\\True', '').trim());
                    optCount++;
                }
                if (cursor < optsRaw.length) {
                    const leftover = optsRaw.substring(cursor).trim();
                    if (leftover) qData.content += '\n\n' + leftover;
                }
            } else if (procBody.includes('\\shortans')) {
                qType = 'short';
                const parts = procBody.split('\\shortans');
                qData.content = parts[0].trim();
                let start = procBody.indexOf('\\shortans') + 9, depth = 0, end = -1;
                if (procBody[start] !== '{') start = procBody.indexOf('{', start);
                for (let i = start; i < procBody.length; i++) { if (procBody[i] == '{') depth++; else if (procBody[i] == '}') depth--; if (depth === 0 && depth !== -1) { end = i; break; } }
                if (end !== -1) {
                    qData.answer = procBody.substring(start + 1, end).trim().replace(/^\$+|\$+$/g, '').replace(/\{([.,])\}/g, '$1').trim();
                    const leftover = procBody.substring(end + 1).trim();
                    if (leftover) qData.content += '\n\n' + leftover;
                }
            } else {
                qType = 'essay';
                qData.content = procBody;
            }
            
            parsedList.push({ 
                type: qType,
                env: currentEnv,
                cccd: assignedCccd,
                bankId: assignedCccd,
                source: source,
                ...qData, 
                mapId: questionID,
                subject: tags.subject,
                level: tags.level
            });
            count++;
        }

        return parsedList;
    }

    // --- PARSER WORD HOÀN CHỈNH ---
    function parseWordQuestions(rawText) {
        let text = rawText || '';
        const hetMatch = /(?:^|\n)\s*[-–—_*\s#]*\b(?:HẾT|Hết)\b[-–—_*\s#.]*\s*(?:\n|$)/i.exec(text);
        if (hetMatch) text = text.slice(0, hetMatch.index).trim();

        const questionStarts = [...text.matchAll(/(?:^|\n)\s*(?:Câu|Bài)\s*(\d+)\s*[\.:]/gi)];
        if (!questionStarts.length) return [];

        function stripTrailingSectionHeaders(str) {
            if (!str) return '';
            return str
                .replace(/(?:^|\n)\s*(?:PHẦN\s*[I|V|X\d]+|Phần\s*tự\s*luận)[\s\S]*$/i, '')
                .replace(/(?:^|\n)\s*(?:Trả\s*lời|Thí\s*sinh)[^\n]*(?:từ\s*câu|đến\s*câu)[\s\S]*$/i, '')
                .trim();
        }

        return questionStarts.map((match, index) => {
            const start = match.index + match[0].length;
            const end = index + 1 < questionStarts.length ? questionStarts[index + 1].index : text.length;
            let body = text.slice(start, end).trim();
            body = body.replace(/^(?:PHẦN\s*[I|V|X\d]+|Phần\s*tự\s*luận)[^\n]*\n+/i, '').trim();

            const underlinedLabels = [...body.matchAll(/\[\[WORD_UNDERLINE_([A-D])\]\]/g)].map(m => m[1]);
            body = body.replace(/\[\[WORD_UNDERLINE_[A-D]\]\]/g, '');

            let solution = '';
            const solutionMatch = /(?:^|\n)\s*(?:Lời\s*giải|Hướng\s*dẫn\s*giải)\s*[:.]?/im.exec(body);
            if (solutionMatch) {
                solution = body.slice(solutionMatch.index + solutionMatch[0].length).trim();
                body = body.slice(0, solutionMatch.index).trim();
            }

            if (solution) solution = stripTrailingSectionHeaders(solution);
            else body = stripTrailingSectionHeaders(body);

            const levelMatch = /^\s*\[(NB|TH|VD|VDC)\]/i.exec(body);
            let level = 'Thông hiểu';
            if (levelMatch) {
                const lvl = levelMatch[1].toUpperCase();
                if (lvl === 'NB') level = 'Nhận biết';
                else if (lvl === 'TH') level = 'Thông hiểu';
                else if (lvl === 'VD') level = 'Vận dụng';
                else if (lvl === 'VDC') level = 'Vận dụng cao';
            }

            const optionMatches = [...body.matchAll(/(?:^|\n|\s)([ABCD])\s*[\.\)\:]\s*/g)];
            const tfMatches = [...body.matchAll(/(?:^|\n)\s*([a-d])\s*[\.\)]\s*/gi)];
            const isTrueFalse = tfMatches.length >= 4 && (
                optionMatches.length < 4 ||
                /(?:\[\s*(?:ĐS|Đ\/S|Đúng\s*[\/,-]?\s*Sai)\s*\]|\(\s*Đúng\s*[\/,-]?\s*Sai\s*\)|tính\s*đúng[\s,/-]*sai|khẳng\s*định\s*sau)/i.test(body)
            );

            const shortAnsRegex = /(?:^|\n|\b)(?:Đáp\s*án|Đáp\s*số)\s*[:=]\s*([^\n\r]+)/i;
            const shortMatch = shortAnsRegex.exec(solution) || shortAnsRegex.exec(body);

            const question = {
                type: 'essay',
                level: level,
                content: cleanWordMathLatex(body),
                solution: cleanWordMathLatex(solution),
                options: [],
                statements: [],
                answer: '',
                point: 0.25,
                correct: -1,
                mapId: '',
                source: 'word'
            };

            if (isTrueFalse) {
                question.type = 'tf';
                question.content = cleanWordMathLatex(body.slice(0, tfMatches[0].index)
                    .replace(/\[\s*(?:ĐS|Đ\/S|Đúng\s*[\/,-]?\s*Sai)\s*\]|\(\s*Đúng\s*[\/,-]?\s*Sai\s*\)/ig, '')
                    .trim());
                question.statements = tfMatches.slice(0, 4).map((statement, sIdx) => {
                    const sStart = statement.index + statement[0].length;
                    const sEnd = sIdx < 3 ? tfMatches[sIdx + 1].index : body.length;
                    let rawT = body.slice(sStart, sEnd).trim();
                    rawT = stripTrailingSectionHeaders(rawT);
                    const ansM = /(?:\[\s*(Đúng|Sai)\s*\]|\(\s*(Đúng|Sai)\s*\)|[-–—:]\s*(Đúng|Sai))\s*$/i.exec(rawT);
                    const sLabel = statement[1].toUpperCase();
                    let isTrue = underlinedLabels.includes(sLabel) || Boolean(ansM && (ansM[1] || ansM[2] || ansM[3]).toLowerCase() === 'đúng');

                    if (!isTrue && solution) {
                        const solM = new RegExp('(?:^|\\n|\\b)(?:mệnh\\s*đề\\s*|khẳng\\s*định\\s*)?' + sLabel.toLowerCase() + '\\s*[:.)-–—]?\\s*(?:là\\s*)?(đúng|sai)\\b', 'i').exec(solution);
                        if (solM && solM[1].toLowerCase() === 'đúng') isTrue = true;
                    }

                    return {
                        text: cleanWordMathLatex(rawT.replace(/(?:\[\s*(?:Đúng|Sai)\s*\]|\(\s*(?:Đúng|Sai)\s*\)|[-–—:]\s*(?:Đúng|Sai))\s*$/i, '').trim()),
                        isTrue
                    };
                });
            } else if (optionMatches.length >= 4) {
                question.type = 'mc';
                question.content = cleanWordMathLatex(body.slice(0, optionMatches[0].index).trim());
                question.options = optionMatches.slice(0, 4).map((option, optIdx) => {
                    const optStart = option.index + option[0].length;
                    const optEnd = optIdx < 3 ? optionMatches[optIdx + 1].index : body.length;
                    return cleanWordMathLatex(body.slice(optStart, optEnd).trim());
                });
                const correctMatch = /(?:chọn|đáp\s*án)\s*[:\-]?\s*([ABCD])\b/i.exec(solution);
                if (underlinedLabels.length) {
                    question.correct = underlinedLabels[0].charCodeAt(0) - 65;
                } else if (correctMatch) {
                    question.correct = correctMatch[1].toUpperCase().charCodeAt(0) - 65;
                }
            } else if (shortMatch) {
                question.type = 'short';
                let rawAns = shortMatch[1].trim().replace(/^\$+|\$+$/g, '').replace(/\{([.,])\}/g, '$1').trim().replace(/\.$/, '').trim();
                question.answer = cleanWordMathLatex(rawAns);
                if (shortAnsRegex.exec(body)) {
                    question.content = cleanWordMathLatex(body.replace(/(?:^|\n)\s*(?:Đáp\s*án|Đáp\s*số)\s*[:=]\s*[^\n\r]+/i, '').trim());
                }
            }

            return question;
        }).filter(q => q.content || q.options.some(Boolean) || q.statements.length);
    }

    function extractEmbeddedRaster(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        if (!bytes || bytes.length < 16) return null;
        for (let i = 0; i <= bytes.length - 16; i++) {
            if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x47 &&
                bytes[i + 4] === 0x0d && bytes[i + 5] === 0x0a && bytes[i + 6] === 0x1a && bytes[i + 7] === 0x0a) {
                for (let k = i + 8; k <= bytes.length - 8; k++) {
                    if (bytes[k] === 0x49 && bytes[k + 1] === 0x45 && bytes[k + 2] === 0x42 && bytes[k + 3] === 0x44) {
                        return { mime: 'image/png', data: bytes.subarray(i, k + 8) };
                    }
                }
            }
        }
        for (let i = 0; i <= bytes.length - 4; i++) {
            if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
                for (let k = i + 3; k <= bytes.length - 2; k++) {
                    if (bytes[k] === 0xff && bytes[k + 1] === 0xd9) {
                        return { mime: 'image/jpeg', data: bytes.subarray(i, k + 2) };
                    }
                }
            }
        }
        return null;
    }

    function uint8ArrayToBase64(bytes) {
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 16384;
        for (let i = 0; i < len; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    // --- PARSER TỆP WORD THÔNG QUA MAMMOTH ---
    async function parseWordFile(fileOrArrayBuffer) {
        if (!window.mammoth) {
            throw new Error('Thư viện Mammoth chưa được nạp. Vui lòng kiểm tra kết nối mạng!');
        }

        let arrayBuffer;
        if (fileOrArrayBuffer instanceof ArrayBuffer) {
            arrayBuffer = fileOrArrayBuffer;
        } else if (fileOrArrayBuffer instanceof Blob) {
            arrayBuffer = await fileOrArrayBuffer.arrayBuffer();
        } else {
            throw new Error('Định dạng tệp không hợp lệ.');
        }

        // Nạp thư viện giải mã ảnh vector EMF/WMF theo nhu cầu
        if (typeof window.convertMetafileToDataUrl !== 'function') {
            try {
                const emfMod = await import('./emf-converter.js?v=20260925');
                window.convertMetafileToDataUrl = emfMod.convertMetafileToDataUrl;
            } catch (emfErr) {
                console.warn('[Word import] Không thể nạp mô-đun emf-converter:', emfErr);
            }
        }

        const mammothOptions = {
            styleMap: ['u => u'],
            convertImage: window.mammoth.images.imgElement(element => {
                const contentType = element.contentType || '';
                if (contentType === 'image/x-emf' || contentType === 'image/x-wmf') {
                    return element.readAsArrayBuffer().then(async (buf) => {
                        try {
                            const arrayBuf = (buf instanceof ArrayBuffer) ? buf : (buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : new Uint8Array(buf).buffer);
                            
                            // 1. Ưu tiên trích xuất ảnh raster (PNG/JPEG) nhúng trực tiếp trong EMF/WMF (ảnh gốc chất lượng cao từ Word)
                            const embedded = extractEmbeddedRaster(arrayBuf);
                            if (embedded) {
                                const b64 = uint8ArrayToBase64(embedded.data);
                                return { src: `data:${embedded.mime};base64,${b64}`, alt: 'Hình minh họa' };
                            }

                            // 2. Dự phòng: giải mã vector bằng canvas nếu không có raster nhúng
                            if (typeof window.convertMetafileToDataUrl === 'function') {
                                const pngUrl = await window.convertMetafileToDataUrl(arrayBuf, { dpiScale: 2 });
                                if (pngUrl) return { src: pngUrl, alt: 'Hình minh họa' };
                            }
                        } catch (e) {
                            console.warn('[Word import] Lỗi chuyển EMF sang PNG:', e);
                        }
                        const b64 = await element.readAsBase64String();
                        return { src: `data:${contentType};base64,${b64}`, alt: 'Hình minh họa' };
                    });
                }
                return element.readAsArrayBuffer().then(buf => {
                    const blob = new Blob([buf], { type: element.contentType || 'image/png' });
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve({ src: reader.result });
                        reader.readAsDataURL(blob);
                    });
                });
            })
        };

        const result = await window.mammoth.convertToHtml({ arrayBuffer }, mammothOptions);
        const rawText = wordHtmlToImportText(result.value);
        return parseWordQuestions(rawText);
    }

    // Export module
    const QuestionImporter = {
        parseLatexExamString,
        parseWordQuestions,
        parseWordFile,
        wordHtmlToImportText,
        cleanWordMathLatex,
        cleanTikzCode,
        parseQuestionID
    };

    window.QuestionImporter = QuestionImporter;
    if (!window.parseLatexExamString) window.parseLatexExamString = parseLatexExamString;
    if (!window.parseWordQuestions) window.parseWordQuestions = parseWordQuestions;

})(typeof window !== 'undefined' ? window : this);
