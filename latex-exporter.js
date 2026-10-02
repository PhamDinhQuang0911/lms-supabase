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

    // 2.5 Làm sạch HTML sang LaTeX khi xuất câu hỏi
    function cleanHtmlToLatex(text) {
        if (!text) return "";
        let s = String(text);
        // Thay thẻ img thành \begin{center}\includegraphics[width=0.7\linewidth]{url}\end{center}
        s = s.replace(/<div[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>\s*<\/div>/gi, '\n\\begin{center}\n\\includegraphics[width=0.7\\linewidth]{$1}\n\\end{center}\n');
        s = s.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\n\\begin{center}\n\\includegraphics[width=0.7\\linewidth]{$1}\n\\end{center}\n');
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<p>([\s\S]*?)<\/p>/gi, '$1\n\n');
        s = s.replace(/<b>(.*?)<\/b>/gi, '\\textbf{$1}');
        s = s.replace(/<strong>(.*?)<\/strong>/gi, '\\textbf{$1}');
        s = s.replace(/<i>(.*?)<\/i>/gi, '\\textit{$1}');
        s = s.replace(/<em>(.*?)<\/em>/gi, '\\textit{$1}');
        s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        // Xóa các tag div, span, script thừa nếu có
        s = s.replace(/<\/?(?:div|span|script)[^>]*>/gi, '');
        return s.trim();
    }

    // 3. Format câu hỏi thành khối LaTeX chuẩn nếu câu đó chưa có trong rawText
    function formatQuestionToLatex(q) {
        if (!q) return "";
        const env = q.env || (q.type === 'essay' || q.type === 'tl' ? 'bt' : 'ex');
        const cccd = q.cccd || q.bankId || q.id || '';
        const source = q.source || '';
        const mapId = q.mapId || '';

        let out = `\\begin{${env}}[${cccd}]%[${source}]%[${mapId}]\n`;
        out += cleanHtmlToLatex(q.content) + '\n';

        const detectType = () => {
            if (q.type) return q.type;
            if (Array.isArray(q.statements) && q.statements.length > 0) return 'tf';
            if (Array.isArray(q.options) && q.options.length > 0) return 'mc';
            if (q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== '') return 'short';
            return 'essay';
        };
        const qType = detectType();

        if (qType === 'mc' && Array.isArray(q.options) && q.options.length > 0) {
            const correctIdx = typeof q.correct === 'number' ? q.correct : (q.correctAnswer ? ['A','B','C','D'].indexOf(String(q.correctAnswer).trim().toUpperCase()) : -1);
            const choiceItems = q.options.map((opt, i) => {
                const isCorrect = (i === correctIdx);
                return `\t{${isCorrect ? '\\True ' : ''}${cleanHtmlToLatex(opt)}}`;
            }).join('\n');
            out += `\\choice\n${choiceItems}\n`;
        } else if (qType === 'tf') {
            const stmts = (Array.isArray(q.statements) && q.statements.length > 0) ? q.statements : (Array.isArray(q.options) ? q.options.map((t, idx) => ({ text: t, isTrue: (q.correctAnswer || '').split(',')[idx] === 'D' || (q.correctAnswer || '').split(',')[idx] === 'Đ' })) : []);
            if (stmts.length > 0) {
                const tfItems = stmts.map(stmt => {
                    const isTrue = stmt.isTrue === true || stmt.correct === true || stmt.isCorrect === true || stmt.isTrue === 'true';
                    return `\t{${isTrue ? '\\True ' : ''}${cleanHtmlToLatex(stmt.text || stmt.content || '')}}`;
                }).join('\n');
                out += `\\choiceTF\n${tfItems}\n`;
            }
        } else if (qType === 'short') {
            const ans = String(q.answer !== undefined && q.answer !== null ? q.answer : (q.correctAnswer || '')).trim();
            if (ans) {
                out += `\\shortans{${cleanHtmlToLatex(ans)}}\n`;
            }
        }

        const solText = cleanHtmlToLatex(q.solution);
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

    // 5. Cập nhật mã nguồn TeX gốc với CCCD và bảo toàn 100% hình ảnh, cấu trúc (\immini, \begin{center}, TikZ)
    function updateOriginalLatexWithCccd(rawText, questions) {
        if (!rawText || !Array.isArray(questions) || questions.length === 0) return rawText;

        const isCRLF = rawText.includes('\r\n');

        // Hàm trích xuất text thuần Việt chuẩn để so khớp snippet, loại bỏ triệt để mọi môi trường hình ảnh/lệnh TeX/HTML
        function getCleanSnippet(text) {
            if (!text) return '';
            return text
                .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, '')
                .replace(/\\immini\b(?:\s*\[[^\]]*\])?/g, '')
                .replace(/\\(choice|choiceTF|shortans|loigiai)[\s\S]*/g, '')
                .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, '')
                .replace(/<[^>]*>/g, '')
                .replace(/(?<!\\)%.*/g, '')
                .replace(/\\[a-zA-Z]+/g, '')
                .replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '')
                .toLowerCase()
                .substring(0, 35);
        }

        // 1. Tách rawText thành các khối câu hỏi (\begin{ex|bt|vd|vidu} ... \end{...})
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

        // 2. So khớp questions với rawBlocks theo 4 cấp độ ưu tiên
        // Reset trạng thái matching tạm thời
        questions.forEach(q => { delete q._matchedBlock; });

        // BƯỚC 2.1: So khớp ưu tiên 1: Theo CCCD trùng khớp chính xác
        questions.forEach(q => {
            const targetCccd = String(q.cccd || q.bankId || '').trim();
            if (targetCccd) {
                const b = rawBlocks.find(rb => !rb.used && rb.cccd === targetCccd);
                if (b) {
                    b.used = true;
                    q._matchedBlock = b;
                }
            }
        });

        // BƯỚC 2.2: So khớp ưu tiên 2: Theo MapID (nếu có và duy nhất trong các block chưa dùng)
        questions.forEach(q => {
            if (q._matchedBlock) return;
            const targetMapId = String(q.mapId || '').trim();
            if (targetMapId) {
                const matchingBlocks = rawBlocks.filter(rb => !rb.used && rb.mapId === targetMapId);
                if (matchingBlocks.length === 1) {
                    matchingBlocks[0].used = true;
                    q._matchedBlock = matchingBlocks[0];
                }
            }
        });

        // BƯỚC 2.3: So khớp ưu tiên 3: Theo nội dung văn bản (clean Vietnamese snippet)
        questions.forEach(q => {
            if (q._matchedBlock) return;
            const qSnip = getCleanSnippet(q.content);
            if (qSnip && qSnip.length >= 8) {
                const b = rawBlocks.find(rb => {
                    if (rb.used || !rb.snippet || rb.snippet.length < 8) return false;
                    const matchLen = Math.min(15, Math.min(qSnip.length, rb.snippet.length));
                    return qSnip.substring(0, matchLen) === rb.snippet.substring(0, matchLen);
                });
                if (b) {
                    b.used = true;
                    q._matchedBlock = b;
                }
            }
        });

        // BƯỚC 2.4: So khớp ưu tiên 4: Khớp tuần tự theo vị trí (TUYỆT ĐỐI BẢO ĐẢM KHÔNG BỎ RƠI BẤT KỲ BLOCK GỐC NÀO)
        questions.forEach((q, qIdx) => {
            if (q._matchedBlock) return;
            if (rawBlocks[qIdx] && !rawBlocks[qIdx].used) {
                rawBlocks[qIdx].used = true;
                q._matchedBlock = rawBlocks[qIdx];
            } else {
                const firstUnused = rawBlocks.find(rb => !rb.used);
                if (firstUnused) {
                    firstUnused.used = true;
                    q._matchedBlock = firstUnused;
                }
            }
        });

        // 3. Cập nhật header cho từng question block
        // [QUY TẮC CỐT LÕI]: GIỮ NGUYÊN 100% THÂN CÂU HỎI (immini, center, tikz, includegraphics, loigiai...)
        // CHỈ THAY ĐỔI DÒNG HEADER MỞ ĐẦU \begin{env}[CCCD]%[Nguồn]%[MapID]
        const slotBlocks = questions.map((q, qIdx) => {
            const targetCccd = String(q.cccd || q.bankId || '').trim();
            const targetMapId = String(q.mapId || '').trim();
            const targetSource = String(q.source || '').trim();
            const matched = q._matchedBlock;

            if (matched) {
                // Bảo lưu đúng môi trường gốc của block (ex, bt, vd, vidu)
                const targetEnv = matched.env || q.env || 'ex';
                let blockCode = matched.blockContent;

                const headerRegex = /^[ \t]*\\begin\{(?:ex|bt|vd|vidu)\}(?:[ \t]*\[[^\]]*\])*(?:[ \t]*(?:%%|%)\[[^\]]*\])*(?:[ \t]*(?:%%|%)[^\r\n]*)?/m;
                const hMatch = blockCode.match(headerRegex);

                if (hMatch) {
                    let restOfBlock = blockCode.substring(hMatch[0].length);
                    if (restOfBlock.startsWith('\r\n')) {
                        restOfBlock = restOfBlock.substring(2);
                    } else if (restOfBlock.startsWith('\n')) {
                        restOfBlock = restOfBlock.substring(1);
                    }
                    return `\\begin{${targetEnv}}[${targetCccd}]%[${targetSource}]%[${targetMapId}]\n${restOfBlock}`;
                } else {
                    return `\\begin{${targetEnv}}[${targetCccd}]%[${targetSource}]%[${targetMapId}]\n` + blockCode.replace(/^[ \t]*\\begin\{(?:ex|bt|vd|vidu)\}[^\r\n]*(?:\r?\n)?/m, '');
                }
            } else {
                // Chỉ câu hỏi tạo mới từ web chưa từng có trong file TeX gốc mới định dạng lại
                return formatQuestionToLatex(q);
            }
        });

        // 4. Ghép nối lại tài liệu bảo toàn 100% cấu trúc interTexts (Preamble, Sections, Comments, Footers)
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
            // Khi số câu thay đổi: bảo toàn Preamble (interTexts[0]) và Footer (interTexts[last])
            fullResult += interTexts[0];
            for (let i = 0; i < questions.length; i++) {
                if (i > 0) fullResult += '\n\n';
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
        const rawTex = examObj.rawTex || examObj.latexContent || "";
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
