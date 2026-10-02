/**
 * latex-exporter.js
 * Module trích xuất và tái tạo mã nguồn LaTeX (.tex) chuẩn hóa cho Đề thi LMS
 * Tích hợp mã CCCD, MapID, Nguồn và chèn tự động mã QR làm bài online
 */
(function(window) {
    'use strict';

    // 1. Kiểm tra placeholder mã QR trong nội dung TeX
    function hasExamQrPlaceholder(content) {
        if (!content) return false;
        if (/(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online[\s\S]{0,600}?\\qrcode/i.test(content)) return true;
        if (/\\qrcode(?:\[[^\]]*\])?\{[\s\S]{0,600}?(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online/i.test(content)) return true;
        if (/\\qrcode(?:\[[^\]]*\])?\{\\detokenize\{\s*\}\}/i.test(content)) return true;
        if (/\\qrcode(?:\[[^\]]*\])?\{\s*\}/i.test(content)) return true;
        return false;
    }

    // 2. Chèn link làm bài trực tuyến vào vị trí \qrcode trong TeX
    function insertExamLinkToQr(content, link) {
        if (!content || !link) return content;

        // Trường hợp 1: 'Làm bài Online' ở trước \qrcode (phạm vi 600 ký tự)
        if (/(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online[\s\S]{0,600}?\\qrcode/i.test(content)) {
            if (/(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online[\s\S]{0,600}?\\qrcode(?:\[[^\]]*\])?\{\\detokenize\{/i.test(content)) {
                return content.replace(
                    /((?:Làm\s*bài|Lam\s*bai|Thi)\s*Online[\s\S]{0,600}?\\qrcode(?:\[[^\]]*\])?\{\\detokenize\{)[^}]*(\}\})/i,
                    (match, p1, p2) => p1 + link + p2
                );
            } else {
                return content.replace(
                    /((?:Làm\s*bài|Lam\s*bai|Thi)\s*Online[\s\S]{0,600}?\\qrcode(?:\[[^\]]*\])?\{)[^}]*(\})/i,
                    (match, p1, p2) => p1 + '\\detokenize{' + link + '}' + p2
                );
            }
        }

        // Trường hợp 2: \qrcode ở trước 'Làm bài Online' (phạm vi 600 ký tự)
        if (/\\qrcode(?:\[[^\]]*\])?\{[\s\S]{0,600}?(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online/i.test(content)) {
            if (/\\qrcode(?:\[[^\]]*\])?\{\\detokenize\{[^}]*\}\}[\s\S]{0,600}?(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online/i.test(content)) {
                return content.replace(
                    /(\\qrcode(?:\[[^\]]*\])?\{\\detokenize\{)[^}]*(\}\}[\s\S]{0,600}?(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online)/i,
                    (match, p1, p2) => p1 + link + p2
                );
            } else {
                return content.replace(
                    /(\\qrcode(?:\[[^\]]*\])?\{)[^}]*(\}[\s\S]{0,600}?(?:Làm\s*bài|Lam\s*bai|Thi)\s*Online)/i,
                    (match, p1, p2) => p1 + '\\detokenize{' + link + '}' + p2
                );
            }
        }

        // Trường hợp 3: \qrcode có detokenize rỗng: \qrcode[...]{\detokenize{}}
        if (/\\qrcode(?:\[[^\]]*\])?\{\\detokenize\{\s*\}\}/i.test(content)) {
            return content.replace(/(\\qrcode(?:\[[^\]]*\])?\{\\detokenize\{)\s*(\}\})/i, `$1${link}$2`);
        }

        // Trường hợp 4: \qrcode rỗng hoàn toàn: \qrcode[...]{}
        if (/\\qrcode(\[[^\]]*\])?\{\s*\}/i.test(content)) {
            return content.replace(/\\qrcode(\[[^\]]*\])?\{\s*\}/i, (m, opt) => `\\qrcode${opt || ''}{\\detokenize{${link}}}`);
        }

        return content;
    }

    // 3. Format câu hỏi thành khối LaTeX chuẩn nếu câu đó chưa có trong rawText
    function formatQuestionToLatex(q) {
        const env = q.env || (q.type === 'essay' || q.type === 'tl' ? 'bt' : 'ex');
        const cccd = q.cccd || q.bankId || '';
        const source = q.source || '';
        const mapId = q.mapId || '';

        let out = `\\begin{${env}}[${cccd}]%[${source}]%[${mapId}]\n`;
        out += (q.content || '').trim() + '\n';

        if (q.type === 'mc' && Array.isArray(q.options) && q.options.length > 0) {
            const choiceItems = q.options.map((opt, i) => {
                const isCorrect = (i === q.correct);
                return `\t{${isCorrect ? '\\True ' : ''}${(opt || '').trim()}}`;
            }).join('\n');
            out += `\\choice\n${choiceItems}\n`;
        } else if (q.type === 'tf' && Array.isArray(q.statements) && q.statements.length > 0) {
            const tfItems = q.statements.map(stmt => {
                const isTrue = stmt.isTrue || stmt.correct === true;
                return `\t{${isTrue ? '\\True ' : ''}${(stmt.text || stmt.content || '').trim()}}`;
            }).join('\n');
            out += `\\choiceTF\n${tfItems}\n`;
        } else if (q.type === 'short' && (q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== '')) {
            out += `\\shortans{${String(q.answer).trim()}}\n`;
        }

        const solText = (q.solution || '').trim();
        out += `\\loigiai{\n${solText}\n}\n`;
        out += `\\end{${env}}`;
        return out;
    }

    // 4. Tạo tài liệu TeX đầy đủ khi không có rawText gốc
    function generateFullLatexDocument(questions, title = "Đề thi", includePreamble = true) {
        const qBlocks = (questions || []).map(q => formatQuestionToLatex(q)).join('\n\n');

        if (!includePreamble) {
            return qBlocks;
        }

        return `% ==============================================================================
% FILE ĐỀ THI / SÁCH ID ĐƯỢC XUẤT TỰ ĐỘNG TỪ HỆ THỐNG
% TIÊU ĐỀ: ${title}
% TỔNG SỐ CÂU: ${questions.length} CÂU HỎI ĐÃ GẮN MÃ CCCD / ID
% ==============================================================================
\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{vietnam}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{tikz,tkz-euclide}
\\usepackage{geometry}
\\geometry{a4paper,left=2cm,right=2cm,top=2cm,bottom=2cm}

% Định nghĩa môi trường nếu chưa có gói ex_test
\\usepackage{environ}
\\providecommand{\\True}{}
\\NewEnviron{ex}[1][]{\\par\\noindent\\textbf{Câu:} \\BODY\\par}
\\NewEnviron{bt}[1][]{\\par\\noindent\\textbf{Bài tập:} \\BODY\\par}
\\NewEnviron{vd}[1][]{\\par\\noindent\\textbf{Ví dụ:} \\BODY\\par}
\\NewEnviron{vidu}[1][]{\\par\\noindent\\textbf{Ví dụ:} \\BODY\\par}
\\providecommand{\\choice}[4]{\\par\\begin{tabular}{llll} A. #1 & B. #2 & C. #3 & D. #4 \\end{tabular}\\par}
\\providecommand{\\choiceTF}[4]{\\par (1) #1 \\par (2) #2 \\par (3) #3 \\par (4) #4\\par}
\\providecommand{\\shortans}[1]{\\par\\textbf{Đáp số:} #1\\par}
\\providecommand{\\loigiai}[1]{\\par\\noindent\\textit{Lời giải:}\\par #1}

\\begin{document}

\\begin{center}
    {\\Large\\bfseries ${title.toUpperCase()}}\\par\\vspace{3mm}
    \\textit{(Tài liệu số hóa kèm mã CCCD tra cứu)}
\\end{center}
\\vspace{5mm}

${qBlocks}

\\end{document}
`;
    }

    // 5. Cập nhật mã nguồn TeX gốc với CCCD và bảo toàn 100% cấu trúc liên kết
    function updateOriginalLatexWithCccd(rawText, questions) {
        if (!rawText || !Array.isArray(questions) || questions.length === 0) return rawText;

        const isCRLF = rawText.includes('\r\n');

        function getCleanSnippet(text) {
            if (!text) return '';
            return text
                .replace(/\\begin\{(?:ex|bt|vd|vidu)\}(?:\[.*?\])*(?:%\[.*?\])*/g, '')
                .replace(/\\(choice|choiceTF|shortans|loigiai)[\s\S]*/g, '')
                .replace(/<[^>]*>/g, '')
                .replace(/(?<!\\)%.*/g, '')
                .replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '')
                .toLowerCase()
                .substring(0, 40);
        }

        const blockRegex = /([ \t]*\\begin\{(ex|bt|vd|vidu)\}[\s\S]*?\\end\{\2\})/g;
        const rawBlocks = [];
        const interTexts = [];
        let match;
        let lastIndex = 0;

        while ((match = blockRegex.exec(rawText)) !== null) {
            interTexts.push(rawText.substring(lastIndex, match.index));
            const blockContent = match[1];
            const env = match[2];

            let cccd = null;
            const cccdM = blockContent.match(/\\begin\{(?:ex|bt|vd|vidu)\}\s*\[(\d{5,10})\]/);
            if (cccdM) cccd = cccdM[1];

            let mapId = null;
            const mapM = blockContent.match(/\\begin\{(?:ex|bt|vd|vidu)\}\s*\[.*?\](?:%\[.*?\])*%\[([a-zA-Z0-9\-_.]+)\]/)
                || blockContent.match(/(?:%%|%)\s*\[([a-zA-Z0-9\-_.]+)\]/);
            if (mapM) mapId = mapM[1];

            rawBlocks.push({
                blockContent,
                env,
                cccd,
                mapId,
                snippet: getCleanSnippet(blockContent),
                used: false,
                origIndex: rawBlocks.length
            });
            lastIndex = match.index + match[0].length;
        }
        interTexts.push(rawText.substring(lastIndex));

        if (rawBlocks.length === 0) {
            return generateFullLatexDocument(questions, "Đề thi", true);
        }

        const slotBlocks = [];
        for (let qIdx = 0; qIdx < questions.length; qIdx++) {
            const q = questions[qIdx];
            const targetCccd = String(q.cccd || q.bankId || '').trim();
            const targetMapId = String(q.mapId || '').trim();
            const targetSource = String(q.source || '').trim();
            const targetEnv = q.env || 'ex';
            const qSnip = getCleanSnippet(q.content);

            let matchedBlock = null;

            if (targetCccd) {
                matchedBlock = rawBlocks.find(b => !b.used && b.cccd === targetCccd);
            }
            if (!matchedBlock && qSnip && qSnip.length >= 8) {
                matchedBlock = rawBlocks.find(b => {
                    if (b.used || !b.snippet || b.snippet.length < 8) return false;
                    const matchLen = Math.min(15, Math.min(qSnip.length, b.snippet.length));
                    return qSnip.substring(0, matchLen) === b.snippet.substring(0, matchLen);
                });
            }
            if (!matchedBlock && targetMapId) {
                matchedBlock = rawBlocks.find(b => !b.used && b.mapId === targetMapId);
            }
            if (!matchedBlock) {
                if (rawBlocks[qIdx] && !rawBlocks[qIdx].used && !rawBlocks[qIdx].cccd) {
                    matchedBlock = rawBlocks[qIdx];
                } else {
                    matchedBlock = rawBlocks.find(b => !b.used && !b.cccd);
                }
            }

            let finalBlockText = "";
            if (matchedBlock) {
                matchedBlock.used = true;
                let blockCode = matchedBlock.blockContent;

                // Thay thế dòng mở đầu \begin{...} và luôn ngắt dòng để tránh đề bài bị dính vào comment %
                const headerRegex = /^[ \t]*\\begin\{(?:ex|bt|vd|vidu)\}(?:[ \t]*\[.*?\])*(?:[ \t]*(?:%%|%)\[.*?\])*[ \t]*/m;
                const hMatch = blockCode.match(headerRegex);
                if (hMatch) {
                    let restOfBlock = blockCode.substring(hMatch[0].length);
                    if (restOfBlock.startsWith('\r\n')) {
                        restOfBlock = restOfBlock.substring(2);
                    } else if (restOfBlock.startsWith('\n')) {
                        restOfBlock = restOfBlock.substring(1);
                    }
                    blockCode = `\\begin{${targetEnv}}[${targetCccd}]%[${targetSource}]%[${targetMapId}]\n${restOfBlock}`;
                } else {
                    blockCode = `\\begin{${targetEnv}}[${targetCccd}]%[${targetSource}]%[${targetMapId}]\n` + blockCode.replace(/^[ \t]*\\begin\{(?:ex|bt|vd|vidu)\}[^\r\n]*(?:\r?\n)?/m, '');
                }

                finalBlockText = blockCode;
            } else {
                finalBlockText = formatQuestionToLatex(q);
            }

            slotBlocks.push(finalBlockText);
        }

        let fullResult = "";

        if (questions.length === rawBlocks.length) {
            for (let i = 0; i < questions.length; i++) {
                let inter = interTexts[i];
                if (/%%[= -]*Câu\s*\d+/i.test(inter)) {
                    inter = inter.replace(/(%%[= -]*Câu\s*)\d+/i, `$1${i + 1}`);
                }
                fullResult += inter + slotBlocks[i];
            }
            fullResult += interTexts[interTexts.length - 1];
        } else {
            function hasStructure(txt) {
                return /\\(subsubsection|subsection|section|part|Opensolutionfile|Closesolutionfile)\b/i.test(txt);
            }

            const sectionHeaders = [];
            for (let k = 1; k < interTexts.length - 1; k++) {
                if (hasStructure(interTexts[k])) {
                    sectionHeaders.push({ origSlot: k, text: interTexts[k] });
                }
            }

            const firstTfIdx = questions.findIndex(q => q.type === 'tf');
            const firstShortIdx = questions.findIndex(q => q.type === 'short');
            const firstEssayIdx = questions.findIndex(q => q.type === 'essay' || q.type === 'tl');

            const headerPlacementMap = new Map();

            sectionHeaders.forEach(sh => {
                const t = sh.text;
                let targetIdx = -1;
                if (/đúng\s*sai|choiceTF/i.test(t) && firstTfIdx !== -1) {
                    targetIdx = firstTfIdx;
                } else if (/trả\s*lời\s*ngắn|điền\s*khuyết|shortans/i.test(t) && firstShortIdx !== -1) {
                    targetIdx = firstShortIdx;
                } else if (/tự\s*luận/i.test(t) && firstEssayIdx !== -1) {
                    targetIdx = firstEssayIdx;
                } else {
                    targetIdx = Math.min(questions.length - 1, Math.round((sh.origSlot / rawBlocks.length) * questions.length));
                }

                if (targetIdx !== -1) {
                    const existing = headerPlacementMap.get(targetIdx) || '';
                    headerPlacementMap.set(targetIdx, existing ? existing + '\n' + t : t);
                }
            });

            fullResult += interTexts[0];
            for (let i = 0; i < questions.length; i++) {
                if (i > 0) {
                    if (headerPlacementMap.has(i)) {
                        fullResult += headerPlacementMap.get(i);
                    } else {
                        fullResult += '\n\n';
                    }
                }
                fullResult += slotBlocks[i];
            }
            fullResult += interTexts[interTexts.length - 1];
        }

        if (isCRLF) {
            fullResult = fullResult.replace(/\r?\n/g, '\r\n');
        }

        return fullResult;
    }

    // 6. Tạo nội dung file TeX hoàn chỉnh cho 1 đối tượng exam (kèm tự động gắn link vào QR nếu có)
    function generateLatexForExam(examObj) {
        if (!examObj) return "";
        const title = (examObj.title || "De_Thi").trim();
        const questions = Array.isArray(examObj.questions) ? examObj.questions : [];
        const rawTex = examObj.rawTex || "";
        const origin = window.location.origin || "https://qmath.io.vn";
        const examLink = `${origin}/exam.html?id=${examObj.id}`;

        let code = "";
        if (rawTex && rawTex.trim().length > 0) {
            code = updateOriginalLatexWithCccd(rawTex, questions);
        } else {
            code = generateFullLatexDocument(questions, title, true);
        }

        if (examLink && hasExamQrPlaceholder(code)) {
            code = insertExamLinkToQr(code, examLink);
        }

        return code;
    }

    // Export ra window
    window.hasExamQrPlaceholder = hasExamQrPlaceholder;
    window.insertExamLinkToQr = insertExamLinkToQr;
    window.formatQuestionToLatex = formatQuestionToLatex;
    window.generateFullLatexDocument = generateFullLatexDocument;
    window.updateOriginalLatexWithCccd = updateOriginalLatexWithCccd;
    window.generateLatexForExam = generateLatexForExam;

})(typeof window !== 'undefined' ? window : this);
