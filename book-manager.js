import { compileTikZToImage, compileTikZBatch, cleanTikzCode } from "./utils.js";

export const CLOUDFLARE_UPLOAD_API = "https://upload-helper.phamngockhanh-942001.workers.dev/";

window.toggleTreeNode = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
};

// ==============================================
// 1. TÍNH NĂNG TIỆN ÍCH CHO TEXT & LATEX PARSING
// ==============================================
function extractBracesAfterCommand(text, command, numBraces, startIndex = 0) {
    let originalCommandIdx = text.indexOf(command, startIndex);
    if (originalCommandIdx === -1) return { found: false };
    
    let currentIdx = originalCommandIdx + command.length;
    let results = [];
    
    for (let count = 0; count < numBraces; count++) {
        while (currentIdx < text.length && (text[currentIdx] === ' ' || text[currentIdx] === '\n' || text[currentIdx] === '\t' || text[currentIdx] === '\r' || text[currentIdx] === '%')) {
            if(text[currentIdx] === '%') {
                while(currentIdx < text.length && text[currentIdx] !== '\n') currentIdx++;
            } else {
                currentIdx++;
            }
        }
        
        if (text[currentIdx] !== '{') {
            if (count === 0 && text[currentIdx] === '[') {
                while(currentIdx < text.length && text[currentIdx] !== ']') currentIdx++;
                currentIdx++;
                while (currentIdx < text.length && (text[currentIdx] === ' ' || text[currentIdx] === '\n' || text[currentIdx] === '\t' || text[currentIdx] === '\r' || text[currentIdx] === '%')) {
                    if(text[currentIdx] === '%') {
                        while(currentIdx < text.length && text[currentIdx] !== '\n') currentIdx++;
                    } else {
                        currentIdx++;
                    }
                }
            }
            if (text[currentIdx] !== '{') break;
        }
        
        let braceCount = 0;
        let inBrace = false;
        let contentStart = currentIdx + 1;
        let contentEnd = -1;
        
        for (let i = currentIdx; i < text.length; i++) {
            if (text[i] === '\\' && (text[i+1] === '{' || text[i+1] === '}')) {
                i++;
                continue;
            }
            if (text[i] === '{') {
                braceCount++;
                inBrace = true;
            } else if (text[i] === '}') {
                braceCount--;
            }
            
            if (inBrace && braceCount === 0) {
                contentEnd = i;
                break;
            }
        }
        
        if (contentEnd !== -1) {
            results.push(text.substring(contentStart, contentEnd));
            currentIdx = contentEnd + 1;
        } else {
            break;
        }
    }
    
    return { found: true, contents: results, startIndex: originalCommandIdx, endIndex: currentIdx };
}

function extractLoigiai(exContent) {
    let content = exContent;
    let solution = "";
    
    const loigiaiIndex = content.lastIndexOf('\\loigiai');
    if (loigiaiIndex !== -1) {
        const pre = content.substring(0, loigiaiIndex);
        const post = content.substring(loigiaiIndex);
        
        const solMatch = post.match(/\\loigiai\s*\{/);
        if (solMatch) {
            let depth = 0;
            let start = post.indexOf('{', solMatch.index);
            let end = -1;
            for(let i=start; i<post.length; i++){
                if (post[i] === '\\' && (post[i+1] === '{' || post[i+1] === '}')) {
                    i++;
                    continue;
                }
                if (post[i] === '{') depth++;
                else if (post[i] === '}') {
                    depth--;
                    if (depth === 0) { end = i; break; }
                }
            }
            if (end !== -1) {
                solution = post.substring(start + 1, end).trim();
                content = pre + post.substring(end + 1);
            }
        }
    }
    return { content: content.trim(), solution };
}

function postProcess(text) {
    if(!text) return "";
    let processed = text;

    processed = processed.replace(/(?<!\\)%.*/g, '');

    // Dọn dẹp \displaystyle và \allowdisplaybreaks
    processed = processed.replace(/\\displaystyle\s*/g, '');
    processed = processed.replace(/\\allowdisplaybreaks\s*/g, '');

    // Thay thế \ldots và \hfill
    processed = processed.replace(/\\ldots/g, '...');
    processed = processed.replace(/\\hfill/g, '<span style="display:inline-block; width: 1cm;"></span>');

    // Dọn dẹp \parbox bọc quanh ảnh (vì lúc này đã biến thành placeholder)
    processed = processed.replace(/\\parbox(?:\[.*?\])?\{[^}]*\}\s*\{\s*(<div\s+id="placeholder-[^>]+>[\s\S]*?<\/div>)\s*\}/g, '$1');
    processed = processed.replace(/\{\s*(<div\s+id="placeholder-[^>]+>[\s\S]*?<\/div>)\s*\}/g, '$1');
    
    // Chuyển đổi tabular thành HTML Table
    processed = processed.replace(/\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\s*\}/g, (match, align, content) => {
        let html = '<div class="overflow-x-auto my-4"><table class="mx-auto border-collapse border border-slate-600 bg-white shadow-sm">';
        let rows = content.split(/\\\\/);
        for (let row of rows) {
            row = row.replace(/\\hline/g, '').trim();
            if (!row) continue;
            
            html += '<tr>';
            let cells = row.split('&');
            for (let cell of cells) {
                html += `<td class="border border-slate-300 px-4 py-2 text-center align-middle latex-container">${cell.trim()}</td>`;
            }
            html += '</tr>';
        }
        html += '</table></div>';
        return html;
    });

    let tcData;
    while ((tcData = extractBracesAfterCommand(processed, '\\textcolor', 2)).found && tcData.contents.length === 2) {
        processed = processed.substring(0, tcData.startIndex) + tcData.contents[1] + processed.substring(tcData.endIndex);
    }
    
    let imminiData;
    // Dọn "\\immini": văn bản bên trái, ảnh bên phải
    while ((imminiData = extractBracesAfterCommand(processed, '\\immini', 2)).found && imminiData.contents.length === 2) {
        const textPart = imminiData.contents[0];
        const imgPart = imminiData.contents[1];
        // loại bỏ } "thừa" nếu ảnh có bao bời ngoặc nhọn
        let cleanImgPart = imgPart.replace(/^\s*\{([\s\S]*?)\}\s*$/, '$1').trim();
        let replacement = `<div class="flex flex-col md:flex-row gap-6 items-start my-4">`
            + `<div class="flex-1 w-full text-justify">${textPart}</div>`
            + `<div class="flex-none flex justify-center items-center">${cleanImgPart}</div>`
            + `</div>`;
        processed = processed.substring(0, imminiData.startIndex) + replacement + processed.substring(imminiData.endIndex);
    }
    
    processed = processed.replace(/\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g, (match, path) => {
        const uid = 'img_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        if(!window.currentPendingImages) window.currentPendingImages = [];
        window.currentPendingImages.push({
            id: uid,
            originalPath: path,
            type: 'normal',
            contentCode: null,
            _done: false
        });
        return `<div data-id="${uid}" tabindex="0" class="pending-image-placeholder text-center p-4 bg-gray-100 border border-dashed border-gray-300 my-4 rounded text-gray-500 font-semibold cursor-pointer hover:bg-gray-200 transition" ondblclick="document.getElementById('upload-inline-${uid}')?.click()" onkeydown="if(event.key==='Enter') document.getElementById('upload-inline-${uid}')?.click()" onclick="this.focus()" title="Bấm đúp để tải ảnh lên, hoặc chọn khung rồi dán [Ctrl+V]">
            <i class="fa-solid fa-image mr-2 text-2xl mb-2"></i><br>Đang chờ xử lý ảnh: ${path}<br>
            <span class="text-xs font-normal text-gray-400">(Click CHỌN khung này rồi bấm Ctrl+V để dán, hoặc CLICK ĐÚP để chọn ảnh từ máy)</span>
            <input type="file" accept="image/*" class="hidden" id="upload-inline-${uid}" onchange="window.uploadNormalImage('${uid}', this)">
        </div>`;
    });

    processed = processed.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g, (match) => {
        const uid = 'img_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        if(!window.currentPendingImages) window.currentPendingImages = [];
        window.currentPendingImages.push({
            id: uid,
            originalPath: `TikZ Code ${uid.substr(-5)}`,
            type: 'tikz',
            contentCode: match,
            _done: false
        });
        return `<div data-id="${uid}" tabindex="0" class="pending-image-placeholder text-center p-4 bg-gray-100 border border-dashed border-gray-300 my-4 rounded text-gray-500 font-semibold cursor-pointer hover:bg-gray-200 transition" ondblclick="document.getElementById('upload-inline-${uid}')?.click()" onkeydown="if(event.key==='Enter') document.getElementById('upload-inline-${uid}')?.click()" onclick="this.focus()" title="Bấm đúp để tải ảnh thủ công nếu TikZ bị lỗi, hoặc chọn khung rồi dán [Ctrl+V]">
            <i class="fa-solid fa-shapes mr-2 text-2xl mb-2"></i><br>Đang chờ xử lý mã TikZ<br>
            <span class="text-xs font-normal text-gray-400">(Nếu lỗi: Click CHỌN khung này rồi bấm Ctrl+V để dán ảnh chữa cháy)</span>
            <input type="file" accept="image/*" class="hidden" id="upload-inline-${uid}" onchange="window.uploadNormalImage('${uid}', this)">
        </div>`;
    });

    function getListStyle(opt) {
        if (!opt) return "list-decimal";
        if (opt.includes("a") || opt.includes("a)") || opt.includes("a.")) return "list-[lower-alpha]";
        if (opt.includes("A") || opt.includes("A)") || opt.includes("A.")) return "list-[upper-alpha]";
        if (opt.includes("i") || opt.includes("i)") || opt.includes("i.")) return "list-[lower-roman]";
        if (opt.includes("I") || opt.includes("I)") || opt.includes("I.")) return "list-[upper-roman]";
        return "list-decimal";
    }

    function getCols(cols) {
        if (!cols || cols === "1") return "";
        if (cols === "2") return "columns-1 sm:columns-2 gap-8";
        if (cols === "3") return "columns-1 sm:columns-3 gap-8";
        if (cols === "4") return "columns-2 sm:columns-4 gap-8";
        return `columns-1 sm:columns-${cols} gap-8`;
    }

    processed = processed.replace(/\\begin\{itemize\}/g, '<ul class="list-disc pl-8 my-3 space-y-2">');
    processed = processed.replace(/\\end\{itemize\s*\}/g, '</ul>');
    
    processed = processed.replace(/\\begin\{enumerate\}(?:\[([^\]]*)\])?/g, (match, opt) => {
        return `<ol class="${getListStyle(opt)} pl-8 my-3 space-y-2">`;
    });
    processed = processed.replace(/\\end\{enumerate\s*\}/g, '</ol>');

    processed = processed.replace(/\\begin\{enumEX\}(?:\[([^\]]*)\])?(?:\{([^}]*)\})?/g, (match, opt, cols) => {
        return `<ol class="${getListStyle(opt)} pl-8 my-3 space-y-2 ${getCols(cols)}">`;
    });
    processed = processed.replace(/\\end\{enumEX\s*\}/g, '</ol>');

    processed = processed.replace(/\\begin\{listEX\}(?:\[([^\]]*)\])?/g, (match, opt) => {
        return `<ol class="${getListStyle(opt)} pl-8 my-3 space-y-2">`;
    });
    processed = processed.replace(/\\end\{listEX\s*\}/g, '</ol>');

    processed = processed.replace(/\\begin\{itemchoice\}/g, '<ul class="list-[lower-alpha] pl-8 my-3 space-y-2">');
    processed = processed.replace(/\\end\{itemchoice\s*\}/g, '</ul>');
    
    // Nhận xét (nx) environment
    processed = processed.replace(/\\begin\{nx\}/g, '<div class="my-4 p-4 border-l-4 border-teal-500 bg-teal-50 text-teal-900 rounded-r-lg shadow-sm"><strong class="block mb-1 text-teal-800"><i class="fa-solid fa-lightbulb mr-2 text-teal-500"></i>Nhận xét:</strong>');
    processed = processed.replace(/\\end\{nx\s*\}/g, '</div>');
    processed = processed.replace(/\\itemch/g, '<li class="mb-1">');
    processed = processed.replace(/\\item/g, '<li class="mb-1">');

    function replaceBfIt(text) {
        let res = text;
        let regex = /\{\\(bf|it)(?:\s+|(?=\{))/;
        let match;
        while ((match = regex.exec(res)) !== null) {
            let start = match.index;
            let contentStart = start + match[0].length;
            let depth = 1;
            let end = -1;
            for (let i = contentStart; i < res.length; i++) {
                if (res[i] === '\\' && (res[i+1] === '{' || res[i+1] === '}')) {
                    i++;
                    continue;
                }
                if (res[i] === '{') depth++;
                else if (res[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        end = i;
                        break;
                    }
                }
            }
            if (end !== -1) {
                let tag = match[1] === 'bf' ? 'strong' : 'em';
                let innerContent = res.substring(contentStart, end);
                res = res.substring(0, start) + `<${tag}>${innerContent}</${tag}>` + res.substring(end + 1);
            } else {
                res = res.substring(0, start) + res.substring(contentStart); // broken, just strip
            }
        }
        return res;
    }
    processed = replaceBfIt(processed);

    let textbfData;
    while ((textbfData = extractBracesAfterCommand(processed, '\\textbf', 1)).found && textbfData.contents.length === 1) {
        processed = processed.substring(0, textbfData.startIndex) + `<strong>${textbfData.contents[0]}</strong>` + processed.substring(textbfData.endIndex);
    }
    let textitData;
    while ((textitData = extractBracesAfterCommand(processed, '\\textit', 1)).found && textitData.contents.length === 1) {
        processed = processed.substring(0, textitData.startIndex) + `<em>${textitData.contents[0]}</em>` + processed.substring(textitData.endIndex);
    }
    processed = processed.replace(/\\lq\\lq\s*/g, '“');
    processed = processed.replace(/\\rq\\rq\s*/g, '”');

    processed = processed.replace(/\\hspace\*?\{[^}]*\}/g, '');
    processed = processed.replace(/\\vspace\*?\{[^}]*\}/g, '');
    processed = processed.replace(/\\noindent/g, '');
    processed = processed.replace(/\\medskip/g, '');
    processed = processed.replace(/\\strut/g, '');
    // Xóa \quad \qquad \, \; \: ngoài môi trường toán học
    processed = processed.replace(/\\qquad\s*/g, '\u00a0\u00a0\u00a0\u00a0');
    processed = processed.replace(/\\quad\s*/g, '\u00a0\u00a0');
    processed = processed.replace(/\\,/g, '\u00a0');
    processed = processed.replace(/\\;/g, '\u00a0\u00a0');

    processed = processed.replace(/\\begin\{multicols\}\{[0-9]+\}/g, '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">');
    processed = processed.replace(/\\end\{multicols\}/g, '</div>');
    processed = processed.replace(/\\begin\{center\}/g, '<div class="text-center w-full flex justify-center flex-col items-center">');
    processed = processed.replace(/\\end\{center\}/g, '</div>');

    processed = processed.replace(/%\[[\w-]+\]/g, '');

    let processedText = "";
    let inMath = false;
    let mathEnv = "";
    
    const checkStart = (idx, str) => processed.substring(idx, idx + str.length) === str;

    for (let i = 0; i < processed.length; i++) {
        if (!inMath) {
            if (checkStart(i, '$$')) { inMath = true; mathEnv = '$$'; processedText += '$$'; i++; continue; }
            if (checkStart(i, '$')) { inMath = true; mathEnv = '$'; processedText += '$'; continue; }
            if (checkStart(i, '\\(')) { inMath = true; mathEnv = '\\('; processedText += '\\('; i++; continue; }
            if (checkStart(i, '\\[')) { inMath = true; mathEnv = '\\['; processedText += '\\['; i++; continue; }
            if (checkStart(i, '\\begin{align}')) { inMath = true; mathEnv = '\\begin{align}'; processedText += '\\begin{align}'; i += 13; continue; }
            if (checkStart(i, '\\begin{align*}')) { inMath = true; mathEnv = '\\begin{align*}'; processedText += '\\begin{align*}'; i += 14; continue; }
            if (checkStart(i, '\\begin{equation}')) { inMath = true; mathEnv = '\\begin{equation}'; processedText += '\\begin{equation}'; i += 15; continue; }
            if (checkStart(i, '\\begin{eqnarray}')) { inMath = true; mathEnv = '\\begin{eqnarray}'; processedText += '\\begin{eqnarray}'; i += 15; continue; }
            if (checkStart(i, '<script type="text/tikz">')) { inMath = true; mathEnv = 'tikz'; processedText += '<script type="text/tikz">'; i += 24; continue; }

            if (checkStart(i, '\\\\')) {
                let jump = 1;
                let addHtml = '<br>';
                if (processed[i+2] === '[') {
                    let endBracket = processed.indexOf(']', i+2);
                    if (endBracket !== -1 && endBracket - (i+2) < 15) {
                        jump = endBracket - i;
                    }
                }
                processedText += addHtml;
                i += jump;
                continue;
            }
            processedText += processed[i];
        } else {
            if (mathEnv === '$$' && checkStart(i, '$$')) { inMath = false; processedText += '$$'; i++; continue; }
            if (mathEnv === '$' && checkStart(i, '$')) { inMath = false; processedText += '$'; continue; }
            if (mathEnv === '\\(' && checkStart(i, '\\)')) { inMath = false; processedText += '\\)'; i++; continue; }
            if (mathEnv === '\\[' && checkStart(i, '\\]')) { inMath = false; processedText += '\\]'; i++; continue; }
            if (mathEnv === '\\begin{align}' && checkStart(i, '\\end{align}')) { inMath = false; processedText += '\\end{align}'; i += 11; continue; }
            if (mathEnv === '\\begin{align*}' && checkStart(i, '\\end{align*}')) { inMath = false; processedText += '\\end{align*}'; i += 12; continue; }
            if (mathEnv === '\\begin{equation}' && checkStart(i, '\\end{equation}')) { inMath = false; processedText += '\\end{equation}'; i += 13; continue; }
            if (mathEnv === '\\begin{eqnarray}' && checkStart(i, '\\end{eqnarray}')) { inMath = false; processedText += '\\end{eqnarray}'; i += 13; continue; }
            if (mathEnv === 'tikz' && checkStart(i, '</script>')) { inMath = false; processedText += '</script>'; i += 8; continue; }
            
            processedText += processed[i];
        }
    }
    
    // Process environments AFTER escaping to avoid any conflict
    processedText = processedText.replace(/\\begin\{vidu\}([\s\S]*?)\\end\{vidu\}/g, (match, rawContent) => {
        const { content, solution } = extractLoigiai(rawContent);
        let viduHtml = `<div class="box-theory vidu bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative vidu-container mb-4">
            <div class="font-bold text-slate-700 mb-2 vidu-title"></div>
            <div class="latex-container mb-3 text-slate-800">${content}</div>`;
        if (solution) {
            viduHtml += `<div class="mt-4 pt-4 border-t border-slate-100">
                <div class="font-semibold text-blue-800 mb-2">Lời giải:</div>
                <div class="latex-container text-slate-800">${solution}</div>
            </div>`;
        }
        viduHtml += `</div>`;
        return viduHtml;
    });

    processedText = processedText.replace(/\\begin\{(boxdn|boxdl)\}([\s\S]*?)\\end\{\1\}/g, (match, type, content) => {
        const title = type === 'boxdn' ? 'Định nghĩa / Khái niệm' : 'Định lý / Tính chất';
        return `<div class="box-theory ${type} bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative mb-4">
            <div class="font-bold text-blue-700 mb-3 uppercase text-sm tracking-wide bg-blue-50 inline-block px-3 py-1 rounded-md">${title}</div>
            <div class="latex-container text-slate-800 font-medium">${content}</div>
        </div>`;
    });

    processedText = processedText.replace(/\\begin\{note\}([\s\S]*?)\\end\{note\}/g, (match, content) => {
        return `<div class="note-env flex items-start gap-2 my-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200"><i class="fa-solid fa-triangle-exclamation text-yellow-600 mt-1 text-lg"></i><div class="italic text-gray-800 flex-1 latex-container note-content">${content}</div></div>`;
    });

    processedText = processedText.replace(/\\begin\{luuy\}([\s\S]*?)\\end\{luuy\}/g, (match, content) => {
        return `<div class="note-env flex items-start gap-2 my-4 p-4 bg-red-50 rounded-lg border border-red-200"><i class="fa-solid fa-circle-exclamation text-red-600 mt-1 text-lg"></i><div class="italic text-gray-800 flex-1 latex-container note-content"><b>Lưu ý: </b>${content}</div></div>`;
    });

    processedText = processedText.replace(/\\subsubsection\{([\s\S]*?)\}/g, '<div class="mt-4 mb-2 subsubsection-header text-lg font-bold text-slate-800"><span class="mr-1 subsubsection-number"></span>$1</div>');

    return processedText.trim();
}

function parseTheory(text) { return postProcess(text); }

function parseEssay(text) {
    const questions = [];
    const regex = /\\begin\{bt\}([\s\S]*?)\\end\{bt\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const { content, solution } = extractLoigiai(match[1].trim());
        questions.push({ type: 'tuluan', content: postProcess(content), solution: postProcess(solution) });
    }
    return questions;
}

function parseMCQ(text) {
    const modules = [];
    const sections = text.split(/\\subsubsection\{([\s\S]*?)\}/);
    let currentSectionTitle = "";
    
    if (sections.length === 1) {
        sections.unshift("");
        sections.unshift("Trắc Nghiệm");
    }

    for (let s = 0; s < sections.length; s++) {
        if (s % 2 === 1) {
            currentSectionTitle = sections[s].trim();
            continue;
        }
        
        let sectionText = sections[s];
        const parts = sectionText.split(/\\begin\{dang\}/);
        
        if (parts.length === 1) {
            parts.unshift("");
            parts[1] = "{Dạng Bài Mặc định}\n" + parts[1];
        }

        for (let i = 1; i < parts.length; i++) { 
            const part = parts[i];
            let contentAfterDang = part;
            let dangTitle = "Dạng Bài";

            let trimmedPart = part.trimStart();
            if (trimmedPart.startsWith('{')) {
                let depth = 0;
                let endTitleIdx = -1;
                for(let j=0; j<trimmedPart.length; j++){
                    if (trimmedPart[j] === '\\' && (trimmedPart[j+1] === '{' || trimmedPart[j+1] === '}')) {
                        j++;
                        continue;
                    }
                    if (trimmedPart[j] === '{') depth++;
                    else if (trimmedPart[j] === '}') {
                        depth--;
                        if (depth === 0) { endTitleIdx = j; break; }
                    }
                }
                if (endTitleIdx !== -1) {
                    dangTitle = trimmedPart.substring(1, endTitleIdx).trim();
                    contentAfterDang = trimmedPart.substring(endTitleIdx + 1);
                }
            } else {
                let firstLineBreak = part.indexOf('\n');
                if (firstLineBreak !== -1) {
                    dangTitle = part.substring(0, firstLineBreak).trim();
                    contentAfterDang = part.substring(firstLineBreak);
                }
            }
            
            contentAfterDang = contentAfterDang.replace(/\\end\{dang\}/g, '');
            
            const exercises = [];
            const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
            let exMatch;
            while ((exMatch = exRegex.exec(contentAfterDang)) !== null) {
                let exRaw = exMatch[1].trim();
                const { content, solution } = extractLoigiai(exRaw);
                let exContent = content;
                
                let options = [];
                let correct = -1;
                let type = 'tracnghiem';
                
                let choiceData = extractBracesAfterCommand(exContent, '\\choice', 4);
                if(choiceData.found && choiceData.contents.length === 4) {
                    choiceData.contents.forEach((opt, idx) => {
                        if (opt.includes('\\True')) {
                            correct = idx;
                            opt = opt.replace('\\True', '').trim();
                        }
                        options.push(postProcess(opt));
                    });
                    exContent = exContent.substring(0, choiceData.startIndex) + exContent.substring(choiceData.endIndex);
                } else {
                    let choiceTFData = extractBracesAfterCommand(exContent, '\\choiceTF', 4);
                    if(choiceTFData.found && choiceTFData.contents.length === 4) {
                        type = 'dung_sai';
                        let corrects = [];
                        choiceTFData.contents.forEach((opt, idx) => {
                            if (opt.includes('\\True')) {
                                corrects.push(idx);
                                opt = opt.replace('\\True', '').trim();
                            }
                            options.push(postProcess(opt));
                        });
                        correct = corrects;
                        exContent = exContent.substring(0, choiceTFData.startIndex) + exContent.substring(choiceTFData.endIndex);
                    } else {
                        let shortansData = extractBracesAfterCommand(exContent, '\\shortans', 1);
                        if(shortansData.found && shortansData.contents.length === 1) {
                            type = 'dien_khuyet';
                            options = [postProcess(shortansData.contents[0])];
                            exContent = exContent.substring(0, shortansData.startIndex) + exContent.substring(shortansData.endIndex);
                        }
                    }
                }
                
                exercises.push({
                    type: type,
                    content: postProcess(exContent),
                    options: options,
                    correct: correct,
                    solution: postProcess(solution)
                });
            }
            
            if (exercises.length > 0) {
                modules.push({
                    sectionTitle: currentSectionTitle,
                    title: postProcess(dangTitle.trim()),
                    exercises
                });
            }
        }
    }
    return modules;
}

function parseTreeStructure(text) {
    text = text.replace(/(?<!\\)%.*/g, '');
    const sections = [];
    const sectionSplits = text.split(/\\section\{([\s\S]*?)\}/);
    
    if (sectionSplits.length === 1) {
        sectionSplits.unshift("Bài Mặc Định");
        sectionSplits.unshift("");
    }

    for (let i = 1; i < sectionSplits.length; i += 2) {
        let secTitle = sectionSplits[i].trim();
        let secContent = sectionSplits[i + 1] || "";
        
        let subsections = [];
        const subSplits = secContent.split(/\\subsection\{([\s\S]*?)\}/);
        
        if (subSplits.length === 1) {
            subSplits.unshift("Phần Mặc Định");
            subSplits.unshift("");
        }

        for (let j = 1; j < subSplits.length; j += 2) {
            let subTitle = subSplits[j].trim();
            let subContent = subSplits[j + 1] || "";
            
            let theoryText = subContent;
            
            // Find where Essay or MCQ starts
            const btIndex = theoryText.indexOf('\\begin{bt}');
            const dangIndex = theoryText.indexOf('\\begin{dang}');
            const openSolIndex = theoryText.indexOf('\\Opensolutionfile');
            
            // Cut off Theory before Essay or MCQ
            let cutIndex = theoryText.length;
            if (btIndex !== -1) cutIndex = Math.min(cutIndex, btIndex);
            if (dangIndex !== -1) cutIndex = Math.min(cutIndex, dangIndex);
            if (openSolIndex !== -1) cutIndex = Math.min(cutIndex, openSolIndex);
            
            // If MCQ uses subsubsection for its headers, and there's an \Opensolutionfile or \begin{ex} nearby
            const exIndex = theoryText.indexOf('\\begin{ex}');
            if (exIndex !== -1) cutIndex = Math.min(cutIndex, exIndex);
            
            const mcqHeaderMatch = theoryText.match(/\\subsubsection\{.*?(?:Câu hỏi|Trắc nghiệm|Tự luận|Bài tập).*?\}/i);
            if (mcqHeaderMatch) {
                cutIndex = Math.min(cutIndex, mcqHeaderMatch.index);
            }

            theoryText = theoryText.substring(0, cutIndex).trim();

            subsections.push({
                title: subTitle,
                theory: parseTheory(theoryText),
                exercises_TL: parseEssay(subContent),
                exercises_TN_Modules: parseMCQ(subContent)
            });
        }
        
        sections.push({
            title: secTitle,
            subsections: subsections
        });
    }
    
    return sections;
}


// ==============================================
// 2. LOGIC GIAO DIỆN & TẢI LÊN CLOUDFLARE
// ==============================================
window.currentBookData = null;
window.currentNodeIndex = null; // {cIdx, lIdx} or null for overview

function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-xl font-bold text-white transform transition-all duration-300 ${type === "error" ? "bg-red-500" : type === "success" ? "bg-green-500" : "bg-blue-500"}`;
    toast.classList.remove("translate-x-full", "opacity-0");
    setTimeout(() => toast.classList.add("translate-x-full", "opacity-0"), 3000);
}

// Khởi tạo một cuốn sách mới hoàn toàn
window.createNewBook = function() {
    window.currentBookData = {
        mapId: "",
        title: "Sách Số Hóa Mới",
        chapters: []
    };
    window.currentNodeIndex = null;
    
    document.getElementById("emptyState").classList.add("hidden");
    document.getElementById("bookEditor").classList.remove("hidden");
    document.getElementById("headerActions").classList.remove("hidden");
    
    document.getElementById('bookMapId').value = "";
    document.getElementById('bookTitle').value = window.currentBookData.title;
    
    enterEditorMode();
    renderTreeSidebar();
    showEditorPane();
};

window.addChapter = function() {
    if(!window.currentBookData) return;
    const chapNum = window.currentBookData.chapters.length + 1;
    window.currentBookData.chapters.push({
        title: `Chương ${chapNum}`,
        lessons: []
    });
    renderTreeSidebar();
};

window.renameChapter = function(cIdx) {
    if(!window.currentBookData) return;
    const newName = prompt("Nhập tên mới cho Chương:", window.currentBookData.chapters[cIdx].title);
    if(newName !== null && newName.trim() !== "") {
        window.currentBookData.chapters[cIdx].title = newName.trim();
        renderTreeSidebar();
        showEditorPane();
    }
};

window.renameLesson = function(cIdx, lIdx) {
    if(!window.currentBookData) return;
    const newName = prompt("Nhập tên mới cho Bài:", window.currentBookData.chapters[cIdx].lessons[lIdx].title);
    if(newName !== null && newName.trim() !== "") {
        window.currentBookData.chapters[cIdx].lessons[lIdx].title = newName.trim();
        renderTreeSidebar();
        if(window.currentNodeIndex && window.currentNodeIndex.cIdx === cIdx && window.currentNodeIndex.lIdx === lIdx) {
            document.getElementById('previewNodeTitle').textContent = newName.trim();
        }
    }
};

window.addLesson = function(cIdx) {
    if(!window.currentBookData) return;
    const lessonNum = window.currentBookData.chapters[cIdx].lessons.length + 1;
    window.currentBookData.chapters[cIdx].lessons.push({
        title: `Bài ${lessonNum}`,
        subsections: []
    });
    // Select it automatically
    window.selectNode(cIdx, window.currentBookData.chapters[cIdx].lessons.length - 1);
};

window.appendLessonUpload = async function(input) {
    if (!input.files || input.files.length === 0 || !window.currentNodeIndex) return;
    
    const { cIdx, lIdx } = window.currentNodeIndex;
    
    const filesArray = Array.from(input.files).sort((a, b) => {
        let aName = a.name.toLowerCase();
        let bName = b.name.toLowerCase();
        const score = (name) => {
            if (name.includes('lt') || name.includes('lythuyet')) return 1;
            if (name.includes('tl') || name.includes('tuluan')) return 2;
            if (name.includes('tn') || name.includes('tracnghiem')) return 3;
            return 4;
        };
        return score(aName) - score(bName);
    });

    let combinedText = "";
    for (let f of filesArray) {
        combinedText += await f.text() + "\n\n";
    }
    
    const parsedSections = parseTreeStructure(combinedText);
    
    if (parsedSections.length > 0) {
        const firstSection = parsedSections[0];
        let targetLesson = window.currentBookData.chapters[cIdx].lessons[lIdx];
        if(!targetLesson.subsections) targetLesson.subsections = [];
        targetLesson.subsections.push(...firstSection.subsections);
        
        showToast("Nạp thêm nội dung thành công!", "success");
        renderTreeSidebar();
        showEditorPane();
    } else {
        showToast("Không tìm thấy nội dung hợp lệ", "error");
    }
    input.value = "";
};

window.handleLessonUpload = async function(input) {
    if (!input.files || input.files.length === 0 || !window.currentNodeIndex) return;
    
    const { cIdx, lIdx } = window.currentNodeIndex;
    
    // Tự sắp xếp file LT -> TL -> TN
    const filesArray = Array.from(input.files).sort((a, b) => {
        let aName = a.name.toLowerCase();
        let bName = b.name.toLowerCase();
        const score = (name) => {
            if (name.includes('lt') || name.includes('lythuyet')) return 1;
            if (name.includes('tl') || name.includes('tuluan')) return 2;
            if (name.includes('tn') || name.includes('tracnghiem')) return 3;
            return 4;
        };
        return score(aName) - score(bName);
    });

    let combinedText = "";
    for (let f of filesArray) {
        combinedText += await f.text() + "\n\n";
    }
    
    const parsedSections = parseTreeStructure(combinedText);
    
    // Ghi đè vào Lesson hiện tại
    if (parsedSections.length > 0) {
        const firstSection = parsedSections[0];
        let targetLesson = window.currentBookData.chapters[cIdx].lessons[lIdx];
        targetLesson.title = firstSection.title;
        targetLesson.subsections = firstSection.subsections;

        // Lưu mảng ảnh chờ xử lý vào lesson
        if(window.currentPendingImages && window.currentPendingImages.length > 0) {
            targetLesson.pendingImages = window.currentPendingImages;
        } else {
            targetLesson.pendingImages = [];
        }
        
        // Nếu file có nhiều \section, tạo thêm Bài mới trong cùng Chương!
        for (let i = 1; i < parsedSections.length; i++) {
            window.currentBookData.chapters[cIdx].lessons.push({
                title: parsedSections[i].title,
                subsections: parsedSections[i].subsections
            });
        }
    }
    
    // Thử trích xuất MapID từ text nếu mapId chung chưa có
    if (!window.currentBookData.mapId) {
        let mapMatch = combinedText.match(/mapId\s*=\s*(.+)/i);
        if (mapMatch) {
            window.currentBookData.mapId = mapMatch[1].trim();
            document.getElementById('bookMapId').value = window.currentBookData.mapId;
        }
    }
    
    renderTreeSidebar();
    showEditorPane();
    showToast("Nạp LaTeX thành công!", "success");
    input.value = ""; 
};

function enterEditorMode() {
    document.getElementById('sidebarListMode').classList.add('hidden');
    document.getElementById('sidebarTreeMode').classList.remove('hidden');
    document.getElementById('btnBackDashboard').classList.add('hidden');
    document.getElementById('btnDeleteBook').classList.remove('hidden');
}

window.exitEditorMode = function() {
    document.getElementById('sidebarListMode').classList.remove('hidden');
    document.getElementById('sidebarTreeMode').classList.add('hidden');
    document.getElementById('btnBackDashboard').classList.remove('hidden');
    
    document.getElementById("bookEditor").classList.add("hidden");
    document.getElementById("headerActions").classList.add("hidden");
    document.getElementById("emptyState").classList.remove("hidden");
    
    window.currentBookData = null;
    window.currentNodeIndex = null;
}

function renderTreeSidebar() {
    if (!window.currentBookData) return;
    const container = document.getElementById('treeContainer');
    let html = "";
    
    // Mục Tổng Quan Sách
    const isOverview = window.currentNodeIndex === null;
    html += `
        <div class="mb-3 px-3 py-2 rounded-lg cursor-pointer transition-colors border ${isOverview ? 'bg-teal-600 text-white border-teal-700 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'}" onclick="window.selectOverview()">
            <i class="fa-solid fa-book-open-reader mr-2"></i> <strong>Tổng Quan Sách</strong>
        </div>
    `;

    html += `<div id="chaptersList">`;
    window.currentBookData.chapters.forEach((chap, cIdx) => {
        html += `
            <div class="mb-3 chapter-item" data-cidx="${cIdx}">
                <div class="font-bold text-gray-800 text-base px-2 py-1.5 bg-gray-100 rounded-md mb-1 flex items-center justify-between group">
                    <span class="chapter-handle cursor-move px-1 hover:text-teal-700 transition"><i class="fa-solid fa-grip-vertical text-gray-400 mr-2"></i><i class="fa-solid fa-layer-group text-teal-600 mr-1 text-sm"></i> ${chap.title}</span>
                    <div>
                        <button onclick="window.renameChapter(${cIdx})" class="text-gray-400 hover:text-teal-600 p-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Đổi tên Chương">
                            <i class="fa-solid fa-pencil text-xs"></i>
                        </button>
                        <button onclick="window.addLesson(${cIdx})" class="text-teal-600 hover:text-teal-800 p-1" title="Thêm Bài">
                            <i class="fa-solid fa-plus text-xs"></i>
                        </button>
                    </div>
                </div>
                <div class="pl-4 border-l-2 border-gray-100 ml-2 mt-2">
        `;
        if (chap.lessons.length === 0) {
            html += `<div class="text-sm text-gray-400 italic py-1">Chưa có bài nào</div>`;
        }
        
        html += `<div class="lessonsList min-h-[20px] space-y-1" data-cidx="${cIdx}">`;
        chap.lessons.forEach((lesson, lIdx) => {
            const isActive = window.currentNodeIndex && window.currentNodeIndex.cIdx === cIdx && window.currentNodeIndex.lIdx === lIdx;
            html += `
                <div class="lesson-item" data-lidx="${lIdx}">
                    <div class="text-[15px] px-2 py-2 rounded-md transition-colors ${isActive ? 'bg-teal-50 text-teal-700 font-bold border border-teal-200 shadow-sm' : 'text-gray-600 hover:bg-gray-50'} flex items-center justify-between group" onclick="window.selectNode(${cIdx}, ${lIdx})">
                        <div class="flex items-center overflow-hidden">
                            <span class="lesson-handle cursor-move px-1 mr-1 text-gray-300 hover:text-teal-600 transition" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical"></i></span>
                            <i class="fa-solid fa-file-lines mr-2 flex-shrink-0 ${isActive ? 'text-teal-500' : 'text-gray-400'}"></i> <span class="truncate block cursor-pointer">${lesson.title}</span>
                        </div>
                        <div class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2 flex items-center">
                            <button onclick="event.stopPropagation(); window.renameLesson(${cIdx}, ${lIdx})" class="text-blue-400 hover:text-blue-600 p-1" title="Đổi tên Bài">
                                <i class="fa-solid fa-pencil text-[11px]"></i>
                            </button>
                            <button onclick="event.stopPropagation(); window.deleteLesson(${cIdx}, ${lIdx})" class="text-red-400 hover:text-red-600 p-1" title="Xóa bài này">
                                <i class="fa-solid fa-trash text-[11px]"></i>
                            </button>
                        </div>
                    </div>
            `;
            if (isActive) {
                html += `<div class="pl-6 border-l border-teal-200 ml-3 py-1 space-y-1 cursor-default">`;
                let thCount = 0, tlCount = 0, tnCount = 0;
                lesson.subsections.forEach(s => {
                    if(s.theory) thCount += s.theory.length;
                    if(s.exercises_TL) tlCount += s.exercises_TL.length;
                    if(s.exercises_TN_Modules) s.exercises_TN_Modules.forEach(m => tnCount += m.exercises.length);
                });
                
                if(thCount > 0) html += `<div class="text-xs text-blue-600 font-medium py-1 cursor-pointer hover:bg-blue-50 px-1 rounded transition" onclick="document.getElementById('sec-th-0')?.scrollIntoView({behavior: 'smooth'})"><i class="fa-solid fa-book-open mr-1"></i> Lý thuyết (${thCount})</div>`;
                if(tlCount > 0) html += `<div class="text-xs text-green-600 font-medium py-1 cursor-pointer hover:bg-green-50 px-1 rounded transition" onclick="document.getElementById('sec-tl-0')?.scrollIntoView({behavior: 'smooth'})"><i class="fa-solid fa-pen-nib mr-1"></i> Tự luận (${tlCount})</div>`;
                if(tnCount > 0) {
                    const treeNodeId = `tree-node-tn-${lIdx}`;
                    html += `<div class="text-xs text-purple-600 font-medium py-1 flex items-center justify-between cursor-pointer hover:bg-purple-50 px-1 rounded transition" onclick="window.toggleTreeNode(event, '${treeNodeId}')">
                        <span><i class="fa-solid fa-list-check mr-1"></i> Trắc nghiệm (${tnCount})</span>
                        <i id="icon-${treeNodeId}" class="fa-solid fa-chevron-right text-[10px]"></i>
                    </div>`;
                    
                    html += `<div id="${treeNodeId}" class="hidden">`; // Mặc định thu gọn
                    let tnGroups = {};
                    lesson.subsections.forEach(s => {
                        if(s.exercises_TN_Modules) {
                            s.exercises_TN_Modules.forEach(m => {
                                let title = m.sectionTitle || "Trắc nghiệm khác";
                                if(!tnGroups[title]) tnGroups[title] = [];
                                tnGroups[title].push(m);
                            });
                        }
                    });
                    
                    Object.keys(tnGroups).forEach((groupTitle, groupIdx) => {
                        html += `<div class="pl-3 text-[10px] text-purple-500 py-0.5 truncate border-l border-purple-100 ml-2 font-bold cursor-pointer hover:text-purple-700 hover:bg-purple-50 rounded" onclick="document.getElementById('sec-tn-${groupIdx}')?.scrollIntoView({behavior:'smooth'})">- ${groupTitle}</div>`;
                        let dangCount = 0;
                        tnGroups[groupTitle].forEach(m => {
                            if(m.title) {
                                dangCount++;
                                html += `<div class="pl-5 text-[10px] text-gray-500 truncate cursor-pointer hover:text-purple-600 hover:bg-gray-100 rounded py-0.5" onclick="document.getElementById('dang-tn-${groupIdx}-${dangCount}')?.scrollIntoView({behavior:'smooth'})">- Dạng ${dangCount}: ${m.title}</div>`;
                            }
                        });
                    });
                    html += `</div>`;
                }
                html += `</div>`;
            }
            html += `</div>`; // Đóng lesson-item
        });
        html += `</div></div></div>`; // Đóng lessonsList, pl-4, chapter-item
    });
    html += `</div>`; // Đóng chaptersList
    
    container.innerHTML = html;
    
    // Khởi tạo SortableJS cho Kéo thả Chương
    if (window.Sortable) {
        const chaptersList = document.getElementById('chaptersList');
        if (chaptersList) {
            new Sortable(chaptersList, {
                animation: 150,
                handle: '.chapter-handle',
                onEnd: function (evt) {
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    if (oldIndex !== newIndex && oldIndex !== undefined && newIndex !== undefined) {
                        const movedChap = window.currentBookData.chapters.splice(oldIndex, 1)[0];
                        window.currentBookData.chapters.splice(newIndex, 0, movedChap);
                        // Cập nhật lại Index của bài đang chọn
                        window.currentNodeIndex = null;
                        renderTreeSidebar();
                        showEditorPane();
                    }
                }
            });
        }

        // Khởi tạo SortableJS cho Kéo thả Bài học (có thể kéo xuyên chương)
        const lessonLists = document.querySelectorAll('.lessonsList');
        lessonLists.forEach(list => {
            new Sortable(list, {
                group: 'shared-lessons',
                animation: 150,
                handle: '.lesson-handle',
                onEnd: function (evt) {
                    const fromCidx = parseInt(evt.from.getAttribute('data-cidx'));
                    const toCidx = parseInt(evt.to.getAttribute('data-cidx'));
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    
                    if (oldIndex !== undefined && newIndex !== undefined) {
                        if (fromCidx === toCidx && oldIndex === newIndex) return; // Không thay đổi vị trí
                        
                        const movedLesson = window.currentBookData.chapters[fromCidx].lessons.splice(oldIndex, 1)[0];
                        window.currentBookData.chapters[toCidx].lessons.splice(newIndex, 0, movedLesson);
                        
                        window.currentNodeIndex = null;
                        renderTreeSidebar();
                        showEditorPane();
                    }
                }
            });
        });
    }
}

window.selectOverview = function() {
    window.currentNodeIndex = null;
    renderTreeSidebar();
    showEditorPane();
};

window.replaceSection = async function(sectionType, subIdx) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tex,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);
    
    input.onchange = async (e) => {
        try {
            if (!e.target.files || e.target.files.length === 0) {
                document.body.removeChild(input);
                return;
            }
            const file = e.target.files[0];
            const text = await file.text();
            const parsedSections = parseTreeStructure(text);
            if(!parsedSections || parsedSections.length === 0) {
                showToast("Không tìm thấy dữ liệu hợp lệ trong file", "error");
                document.body.removeChild(input);
                return;
            }
            
            const newLesson = parsedSections[0];
            const { cIdx, lIdx } = window.currentNodeIndex;
            let targetLesson = window.currentBookData.chapters[cIdx].lessons[lIdx];
            
            if(!targetLesson.subsections) targetLesson.subsections = [];
            if(!targetLesson.subsections[subIdx]) targetLesson.subsections[subIdx] = {};
            const newSub = (newLesson.subsections && newLesson.subsections[0]) ? newLesson.subsections[0] : {};
            
            if (sectionType === 'theory') {
                targetLesson.subsections[subIdx].theory = newSub.theory || [];
            } else if (sectionType === 'TL') {
                targetLesson.subsections[subIdx].exercises_TL = newSub.exercises_TL || [];
            } else if (sectionType === 'TN') {
                targetLesson.subsections[subIdx].exercises_TN_Modules = newSub.exercises_TN_Modules || [];
            }
            
            if (!targetLesson.pendingImages) targetLesson.pendingImages = [];
            if (newLesson.pendingImages) {
                targetLesson.pendingImages.push(...newLesson.pendingImages);
            }
            if(window.currentPendingImages && window.currentPendingImages.length > 0) {
                targetLesson.pendingImages = targetLesson.pendingImages.concat(window.currentPendingImages);
                window.currentPendingImages = [];
            }
            
            showToast("Đã thay thế mục " + (sectionType === 'theory' ? 'Lý thuyết' : (sectionType === 'TL' ? 'Tự luận' : 'Trắc nghiệm')), "success");
            window.refreshCurrentPane();
        } catch (error) {
            console.error("Lỗi khi thay thế:", error);
            showToast("Lỗi khi xử lý file: " + error.message, "error");
        } finally {
            if (document.body.contains(input)) {
                document.body.removeChild(input);
            }
        }
    };
    
    // Fallback for canceling file dialog (some browsers)
    window.addEventListener('focus', () => {
        setTimeout(() => {
            if (document.body.contains(input)) {
                document.body.removeChild(input);
            }
        }, 1000);
    }, { once: true });

    input.click();
};

// Buộc render lại panel hiện tại mà không qua guard của selectNode
window.refreshCurrentPane = function() {
    renderTreeSidebar();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            showEditorPane();
            // Khởi động MathJax nếu có
            if (window.MathJax) {
                const preview = document.getElementById('previewArea');
                if (preview) MathJax.typesetPromise([preview]).catch(console.error);
            }
        });
    });
};

window.selectNode = function(cIdx, lIdx) {
    if (window.currentNodeIndex && window.currentNodeIndex.cIdx === cIdx && window.currentNodeIndex.lIdx === lIdx) return;
    window.currentNodeIndex = { cIdx, lIdx };
    renderTreeSidebar(); // Cập nhật giao diện thanh trái ngay lập tức để phản hồi nhanh
    
    // Sử dụng requestAnimationFrame kép để đảm bảo trình duyệt CHẮC CHẮN ĐÃ VẼ (paint) thanh mục lục trước khi gọi showEditorPane (MathJax rất nặng)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            showEditorPane();
        });
    });
};

window.deleteLesson = function(cIdx, lIdx) {
    if(confirm('Bạn có chắc chắn muốn xóa bài học này? Toàn bộ nội dung của bài sẽ bị mất!')) {
        window.currentBookData.chapters[cIdx].lessons.splice(lIdx, 1);
        if (window.currentNodeIndex && window.currentNodeIndex.cIdx === cIdx && window.currentNodeIndex.lIdx === lIdx) {
            window.currentNodeIndex = null;
        } else if (window.currentNodeIndex && window.currentNodeIndex.cIdx === cIdx && window.currentNodeIndex.lIdx > lIdx) {
            window.currentNodeIndex.lIdx--;
        }
        renderTreeSidebar();
        showEditorPane();
    }
};

window.toggleSolution = function(id) {
    const el = document.getElementById('sol-' + id);
    const icon = document.getElementById('icon-' + id);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        el.classList.add('hidden');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-down');
    }
};

function showEditorPane() {
    if (!window.currentBookData) return;
    
    const overviewPane = document.getElementById('bookOverviewPane');
    const lessonPane = document.getElementById('lessonEditorPane');
    
    if (window.currentNodeIndex === null) {
        // Show Overview
        overviewPane.classList.remove('hidden');
        lessonPane.classList.add('hidden');
    } else {
        // Show Lesson Editor
        overviewPane.classList.add('hidden');
        lessonPane.classList.remove('hidden');
        
        const { cIdx, lIdx } = window.currentNodeIndex;
        const chapter = window.currentBookData.chapters[cIdx];
        const lesson = chapter.lessons[lIdx];
        
        document.getElementById("previewParentTitle").innerText = chapter.title;
        document.getElementById("previewNodeTitle").innerText = lesson.title;
        
        // Count stats
        let th = 0, tl = 0, tn = 0;
        lesson.subsections.forEach(s => {
            th += s.theory ? s.theory.length : 0;
            tl += s.exercises_TL ? s.exercises_TL.length : 0;
            s.exercises_TN_Modules && s.exercises_TN_Modules.forEach(m => tn += m.exercises.length);
        });
        document.getElementById("statsText").innerText = `${th} Lý thuyết | ${tl} Tự luận | ${tn} Trắc nghiệm`;
        
        // Render Preview
        let html = '';
        
        // Missing Images Panel
        if (lesson.pendingImages && lesson.pendingImages.some(i => !i._done)) {
            const pendingList = lesson.pendingImages.filter(i => !i._done);
            html += `
                <div id="pending-images-banner" class="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl p-5 shadow-sm relative">
                    <h3 id="pending-images-title" class="text-lg font-bold text-yellow-800 mb-2"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Phát hiện <span id="pending-images-count">${pendingList.length}</span> hình ảnh/TikZ cần xử lý</h3>
                    <div class="text-sm text-yellow-700 mb-4">Mã LaTeX vừa nạp có chứa hình vẽ. Hãy biên dịch qua VPS hoặc tải ảnh tay lên để thay thế khung chờ (placeholder).</div>
                    <div class="space-y-3 max-h-60 overflow-y-auto pr-2" id="pending-images-list">
                        ${pendingList.map(item => `
                            <div id="pending-item-${item.id}" class="bg-white p-3 rounded-lg border border-yellow-100 flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="text-2xl text-yellow-500">${item.type === 'tikz' ? '<i class="fa-solid fa-shapes"></i>' : '<i class="fa-solid fa-image"></i>'}</div>
                                    <div>
                                        <div class="font-semibold text-gray-700 text-sm">${item.type === 'tikz' ? 'Mã TikZ cần biên dịch' : 'File Ảnh: ' + item.originalPath}</div>
                                        <div class="text-xs text-gray-500">ID: ${item.id}</div>
                                    </div>
                                </div>
                                <div>
                                    ${item.type === 'tikz' ? 
                                        `<button onclick="window.processAllTikz()" class="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition">Biên dịch qua VPS</button>`
                                        :
                                        `<input type="file" id="upload-${item.id}" class="hidden" accept="image/*" onchange="window.uploadNormalImage('${item.id}')"><label for="upload-${item.id}" class="cursor-pointer px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition">Tải ảnh lên</label>`
                                    }
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-5 pt-4 border-t border-yellow-200/60 flex flex-wrap gap-2 justify-between">
                        ${pendingList.some(i => i.type === 'normal') ? `<label class="cursor-pointer px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-lg hover:bg-teal-700 shadow-md transition"><i class="fa-solid fa-folder-open mr-2"></i> Tải lên Thư mục Ảnh (Tự nhận diện)<input type="file" webkitdirectory directory multiple class="hidden" onchange="window.uploadImageFolder(event)"></label>` : '<div></div>'}
                        ${pendingList.some(i => i.type === 'tikz') ? `<button onclick="window.processAllTikz()" class="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 shadow-md transition"><i class="fa-solid fa-microchip mr-2"></i>Biên dịch tất cả TikZ</button>` : ''}
                    </div>
                </div>
            `;
        }

        if (lesson.subsections.length === 0) {
            html = `<div class="text-center py-10 text-gray-400 italic">Bài này đang trống. Hãy bấm "Nạp file LaTeX".</div>`;
        } else {
            const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            lesson.subsections.forEach((sub, subIdx) => {
                let subTitleStr = roman[subIdx] ? `${roman[subIdx]}. ${sub.title}` : sub.title;
                html += `<h3 class="text-2xl font-bold text-teal-700 mt-8 mb-6 bg-teal-50 inline-block px-4 py-2 rounded-lg">${subTitleStr}</h3>`;
                
                // Lý Thuyết
                if (sub.theory && sub.theory.length > 0) {
                    html += `<div class="mb-10" id="sec-th-${subIdx}"><h4 class="text-xl font-bold text-slate-700 mb-4 flex items-center justify-between gap-2"><span><i class="fa-solid fa-book-open text-blue-500"></i> Lý Thuyết</span> <button onclick="window.replaceSection('theory', ${subIdx})" class="text-sm font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors"><i class="fa-solid fa-upload"></i> Thay thế</button></h4><div class="space-y-4">`;
                    if (Array.isArray(sub.theory)) {
                        sub.theory.forEach((item, index) => {
                            if (item.rawType === 'text') {
                                html += `<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative latex-container text-slate-800 font-medium">${item.content}</div>`;
                            } else if (item.rawType === 'vidu') {
                                html += `<div class="box-theory vidu bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative"><div class="font-bold text-slate-700 mb-2">Ví dụ ${index + 1}:</div><div class="latex-container mb-3 text-slate-800">${item.content}</div>${item.solution ? `<div class="mt-4 pt-4 border-t border-slate-100"><div class="font-semibold text-blue-800 mb-2">Lời giải:</div><div class="latex-container text-slate-800">${item.solution}</div></div>` : ''}</div>`;
                            } else {
                                html += `<div class="box-theory ${item.rawType} bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative"><div class="font-bold text-blue-700 mb-3 uppercase text-sm tracking-wide bg-blue-50 inline-block px-3 py-1 rounded-md">${item.type}</div><div class="latex-container text-slate-800 font-medium">${item.content}</div></div>`;
                            }
                        });
                    } else {
                        html += `<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm latex-container text-slate-800 leading-relaxed max-w-none prose prose-slate theory-content relative">${sub.theory}</div>`;
                    }
                    html += `</div></div>`;
                }
                
                // Tự Luận
                if (sub.exercises_TL && sub.exercises_TL.length > 0) {
                    html += `<div class="mb-10" id="sec-tl-${subIdx}"><h4 class="text-xl font-bold text-slate-700 mb-4 flex items-center justify-between gap-2"><span><i class="fa-solid fa-pen-nib text-green-500"></i> Tự Luận</span> <button onclick="window.replaceSection('TL', ${subIdx})" class="text-sm font-normal text-green-600 bg-green-50 px-2 py-1 rounded hover:bg-green-100 transition-colors"><i class="fa-solid fa-upload"></i> Thay thế</button></h4><div class="space-y-4">`;
                    sub.exercises_TL.forEach((item, index) => {
                        html += `
                            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div class="flex items-start gap-3 mb-4">
                                    <div class="font-bold text-slate-800 text-lg whitespace-nowrap">Bài ${index + 1}.</div>
                                    <div class="latex-container flex-1 text-slate-800">${item.content}</div>
                                </div>
                                <div class="mt-4 pt-4 border-t border-dashed border-slate-200">
                                    ${item.solution ? `
                                        <div class="mb-4">
                                            <div class="font-semibold text-green-800 mb-2">Lời giải:</div>
                                            <div class="latex-container text-slate-800">${item.solution}</div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    });
                    html += `</div></div>`;
                }
                
                // Trắc Nghiệm
                if (sub.exercises_TN_Modules && sub.exercises_TN_Modules.length > 0) {
                    html += `<div class="mb-10"><h4 class="text-xl font-bold text-slate-700 mb-4 flex items-center justify-between gap-2"><span><i class="fa-solid fa-list-check text-purple-500"></i> Trắc Nghiệm</span> <button onclick="window.replaceSection('TN', ${subIdx})" class="text-sm font-normal text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100 transition-colors"><i class="fa-solid fa-upload"></i> Thay thế</button></h4><div class="space-y-6">`;
                    
                    let subsubCounter = 1;
                    let dangCounter = 1;
                    let currentSecTitle = null;
                    let groupIdxCounter = -1;
                    
                    sub.exercises_TN_Modules.forEach((mod, modIdx) => {
                        html += `<div class="bg-purple-50 p-4 rounded-xl border border-purple-100 mt-6">`;
                        
                        if (mod.sectionTitle && currentSecTitle !== mod.sectionTitle) {
                            currentSecTitle = mod.sectionTitle;
                            dangCounter = 1; 
                            groupIdxCounter++;
                            html += `<h5 id="sec-tn-${groupIdxCounter}" class="font-bold text-purple-800 mb-2 uppercase text-sm tracking-wide">${subsubCounter}. ${mod.sectionTitle}</h5>`;
                            subsubCounter++;
                        }
                        
                        if (mod.title) {
                            html += `<h5 id="dang-tn-${groupIdxCounter}-${dangCounter}" class="font-bold text-purple-700 mb-4 text-lg border-b border-purple-200 pb-2">Dạng ${dangCounter}: ${mod.title}</h5>`;
                            dangCounter++;
                        }
                        
                        html += `<div class="space-y-4">`;
                        mod.exercises.forEach((ex, exIdx) => {
                            let optionsHtml = '';
                            if (ex.type === 'dien_khuyet') {
                                optionsHtml = `<div class="mt-3"><input type="text" class="w-full max-w-sm px-4 py-2 border border-purple-200 rounded-lg bg-gray-50 cursor-not-allowed" disabled placeholder="Vùng học sinh nhập đáp án"></div>`;
                            } else if (ex.type === 'dung_sai') {
                                optionsHtml = `<div class="mt-4 grid grid-cols-1 gap-2 border-t border-dashed border-purple-200 pt-3">
                                    ${ex.options.map((opt, i) => `
                                        <div class="flex items-center justify-between p-3 bg-white rounded-lg border ${ex.correct.includes(i) ? 'border-green-400 bg-green-50' : 'border-purple-100'}">
                                            <div class="flex-1 latex-container mr-4">${opt}</div>
                                            <div class="text-sm font-bold ${ex.correct.includes(i) ? 'text-green-600' : 'text-gray-400'}">
                                                ${ex.correct.includes(i) ? 'ĐÚNG' : 'SAI'}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>`;
                            } else {
                                optionsHtml = `<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-dashed border-purple-200 pt-3">
                                    ${ex.options.map((opt, i) => `
                                        <div class="flex items-start p-3 bg-white rounded-lg border ${ex.correct === i ? 'border-green-400 bg-green-50' : 'border-purple-100'}">
                                            <div class="text-sm font-medium text-gray-800 latex-container"><span class="font-bold ${ex.correct === i ? 'text-green-700' : 'text-purple-700'} mr-1">${String.fromCharCode(65 + i)}.</span> ${opt}</div>
                                        </div>
                                    `).join('')}
                                </div>`;
                            }
                            
                            html += `
                                <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
                                    <div class="absolute top-0 right-0 bg-purple-100 text-purple-700 font-bold px-3 py-1 rounded-bl-lg rounded-tr-xl text-xs uppercase">Câu ${exIdx + 1}</div>
                                    <div class="latex-container pr-12 text-slate-800">${ex.content}</div>
                                    ${optionsHtml}
                                    ${ex.solution ? `
                                        <div class="mt-4 pt-4 border-t border-slate-100">
                                            <div class="font-semibold text-blue-800 mb-2">Lời giải chi tiết:</div>
                                            <div class="latex-container text-slate-800">${ex.solution}</div>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        });
                        html += `</div></div>`;
                    });
                    html += `</div></div>`;
                }
            });
        }
        document.getElementById("previewArea").innerHTML = html;
        
        if (window.MathJax) {
            MathJax.typesetPromise([document.getElementById("previewArea")]).catch((err) => console.log('MathJax error:', err));
        }
    }
}

// --- HÀM THAY THẾ PLACEHOLDER THEO DOM (CLONE TỪ EXAM-EDITOR) ---
function replacePlaceholderById(itemId, imgHtml, lesson) {
    // Duyệt đệ quyện tìm placeholder trong mọi trường string của object
    function traverse(obj) {
        if (!obj) return;
        for (let key in obj) {
            if (typeof obj[key] === 'string' && obj[key].includes(`data-id="${itemId}"`)) {
                // Dùng DOM parser giống hệt exam-editor
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = obj[key];
                const ph = tempDiv.querySelector(`div[data-id="${itemId}"]`);
                if (ph) {
                    ph.outerHTML = '___IMG_MARKER___';
                    let newHtml = tempDiv.innerHTML.replace(/___IMG_MARKER___\s*\}/g, imgHtml);
                    newHtml = newHtml.replace(/___IMG_MARKER___/g, imgHtml); // fallback
                    obj[key] = newHtml;
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                traverse(obj[key]);
            }
        }
    }
    traverse(lesson);
}

// --- HÀM XỬ LÝ TẤT CẢ TikZ (SMART RETRY + BẢNG KẾT QUẢ) ---
window.processAllTikz = async function() {
    if(!window.currentNodeIndex || !window.currentBookData) return;
    const {cIdx, lIdx} = window.currentNodeIndex;
    const lesson = window.currentBookData.chapters[cIdx].lessons[lIdx];
    if(!lesson.pendingImages) return;
    
    let rawQueue = lesson.pendingImages.filter(i => i.type === 'tikz' && !i._done).map(item => ({ ...item, retries: 0 }));
    if(rawQueue.length === 0) {
        showToast('Không có hình TikZ nào cần biên dịch!', 'info');
        return;
    }
    
    const total = rawQueue.length;
    let finishedCount = 0;
    
    // ---- Bảng kết quả nổi (góc phải dưới) ----
    const resultLog = []; // { id, label, success, url }
    
    const ensureResultPanel = () => {
        let panel = document.getElementById('bm-tikz-result-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'bm-tikz-result-panel';
            panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;width:260px;max-height:360px;background:white;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.18);border:1px solid #e5e7eb;overflow:hidden;font-size:12px;';
            panel.innerHTML = `
                <div style="background:#1e293b;color:white;padding:8px 12px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
                    <span>📊 Kết quả biên dịch TikZ</span>
                    <button onclick="this.closest('#bm-tikz-result-panel').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;color:white;border-radius:4px;padding:2px 6px;cursor:pointer;">✕</button>
                </div>
                <div id="bm-tikz-result-stats" style="padding:6px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;font-size:11px;color:#64748b;"></div>
                <div id="bm-tikz-result-list" style="max-height:280px;overflow-y:auto;padding:6px 8px;"></div>`;
            document.body.appendChild(panel);
        }
        return panel;
    };
    
    const updateResultPanel = () => {
        const panel = ensureResultPanel();
        panel.style.display = 'block';
        const ok = resultLog.filter(r => r.success).length;
        const fail = resultLog.filter(r => !r.success).length;
        document.getElementById('bm-tikz-result-stats').innerHTML = 
            `<span style="color:#16a34a;font-weight:700;">✅ ${ok} thành công</span> &nbsp;|&nbsp; <span style="color:#dc2626;font-weight:700;">❌ ${fail} lỗi</span> &nbsp;|&nbsp; Tổng: ${resultLog.length}/${total}`;
        
        const list = document.getElementById('bm-tikz-result-list');
        list.innerHTML = resultLog.slice().reverse().map(r => `
            <div onclick="document.getElementById('img-${r.id}')?.scrollIntoView({behavior:'smooth',block:'center'}) || document.querySelector('[data-id=\\'${r.id}\\']')?.scrollIntoView({behavior:'smooth',block:'center'})"
                style="cursor:pointer;padding:4px 6px;margin-bottom:3px;border-radius:6px;background:${r.success ? '#f0fdf4' : '#fef2f2'};border:1px solid ${r.success ? '#bbf7d0' : '#fecaca'};display:flex;align-items:center;gap:6px;" 
                title="Bấm để nhảy đến hình">
                <span>${r.success ? '✅' : '❌'}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${r.success ? '#15803d' : '#dc2626'};">${r.label}</span>
            </div>`).join('');
    };
    
    // ---- Modal tiến trình ----
    const pm = document.getElementById('bm-progressModal');
    const showProgress = (text) => {
        if(pm) {
            pm.classList.remove('hidden');
            const pct = total > 0 ? Math.round((finishedCount / total) * 100) : 0;
            document.getElementById('bm-compileProgressBar').style.width = `${pct}%`;
            document.getElementById('bm-compileProgressText').innerText = text || `${finishedCount}/${total}`;
            document.getElementById('bm-compilePercent').innerText = `${pct}%`;
        }
    };
    showProgress(`0/${total}`);
    
    // ---- Hàm xử lý kết quả ----
    const processSuccessItem = (item, url) => {
        const originalItem = lesson.pendingImages.find(i => i.id === item.id);
        if(originalItem) originalItem._done = true;
        const imgHtml = `<div class="flex justify-center my-2 image-zoom-container group relative inline-block w-fit mx-auto"><img id="img-${item.id}" src="${url}" class="rounded-lg shadow-sm object-contain w-auto transition-all duration-200" style="max-height: 180px;" loading="lazy"><div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 p-1 rounded shadow border border-gray-200 z-10"><button onclick="window.zoomImg(this, 1.25)" class="text-gray-700 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100" title="Phóng to"><i class="fa-solid fa-search-plus"></i></button><button onclick="window.zoomImg(this, 0.8)" class="text-gray-700 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100" title="Thu nhỏ"><i class="fa-solid fa-search-minus"></i></button></div></div>`;
        replacePlaceholderById(item.id, imgHtml, lesson);
        
        // Cập nhật DOM trực tiếp để tránh gọi showEditorPane liên tục gây lỗi Out of Memory (OOM) do MathJax
        const domPlaceholder = document.querySelector(`div[data-id="${item.id}"]`);
        if (domPlaceholder) {
            domPlaceholder.outerHTML = imgHtml;
        }
        
        // Ẩn khung chờ bên trong thẻ vàng
        const bannerItem = document.getElementById(`pending-item-${item.id}`);
        if (bannerItem) bannerItem.remove();
        
        const remaining = lesson.pendingImages.filter(i => !i._done).length;
        const bannerCount = document.getElementById('pending-images-count');
        if (bannerCount) bannerCount.innerText = remaining;
        if (remaining === 0) {
            const banner = document.getElementById('pending-images-banner');
            if (banner) banner.remove();
        }

        finishedCount++;
        resultLog.push({ id: item.id, label: `Hình #${resultLog.length + 1} (${item.id.slice(-6)})`, success: true, url });
        updateResultPanel();
        showProgress(`${finishedCount}/${total}`);
    };
    
    const processFailItem = (item, reason = '') => {
        finishedCount++;
        resultLog.push({ id: item.id, label: `Lỗi #${resultLog.length + 1} (${item.id.slice(-6)}) ${reason}`, success: false });
        updateResultPanel();
        showProgress(`${finishedCount}/${total}`);
    };
    
    // ---- Worker đơn lẻ (cấp 3: hình thực sự lỗi) ----
    const runSingleWorker = async (workerId, queue) => {
        while (queue.length > 0) {
            const item = queue.shift();
            let succeeded = false;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    console.log(`[Single-${workerId}] Thử ${attempt+1}/3 hình ${item.id}...`);
                    // Nếu code quá dài (>8KB), nén bằng cleanTikzCode tích cực
                    let code = cleanTikzCode(item.contentCode);
                    const url = await compileTikZToImage(code);
                    processSuccessItem(item, url);
                    succeeded = true;
                    break;
                } catch(e) {
                    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
                }
            }
            if (!succeeded) processFailItem(item, '(vẫn lỗi sau 3 lần thử)');
            await new Promise(r => setTimeout(r, 300));
        }
    };
    
    // ---- Gửi batch với retry thông minh ----
    // Cấp 1: Batch 20 hình → nếu lỗi → Cấp 2: Chia 4 sub-batch nhỏ → nếu vẫn lỗi → Cấp 3: single
    const singleFallbackQueue = [];
    
    const sendBatch = async (items) => {
        const codes = items.map(c => cleanTikzCode(c.contentCode));
        const urls = await compileTikZBatch(codes);
        for (let i = 0; i < items.length; i++) {
            if (urls[i]) processSuccessItem(items[i], urls[i]);
            else singleFallbackQueue.push(items[i]); // url rỗng → đẩy xuống single
        }
    };
    
    const sendBatchWithSubRetry = async (items, workerId) => {
        try {
            console.log(`[Batch-${workerId}] Gửi ${items.length} hình...`);
            await sendBatch(items);
        } catch(e) {
            console.warn(`[Batch-${workerId}] Lỗi lần 1, chia 4 sub-batch...`);
            // Cấp 2: Chia thành 4 sub-batch nhỏ hơn
            const subSize = Math.ceil(items.length / 4);
            const subBatches = [];
            for (let s = 0; s < items.length; s += subSize) {
                subBatches.push(items.slice(s, s + subSize));
            }
            
            for (const sub of subBatches) {
                try {
                    console.log(`  [Sub-Batch-${workerId}] Gửi ${sub.length} hình...`);
                    await sendBatch(sub);
                } catch(e2) {
                    console.warn(`  [Sub-Batch-${workerId}] Vẫn lỗi, đẩy ${sub.length} hình sang single...`);
                    singleFallbackQueue.push(...sub);
                }
            }
        }
    };
    
    // Chia thành các chunk 20 hình, chạy 4 batch workers song song
    const CHUNK_SIZE = 20;
    const chunks = [];
    for (let i = 0; i < rawQueue.length; i += CHUNK_SIZE) {
        chunks.push(rawQueue.slice(i, i + CHUNK_SIZE));
    }
    
    let chunkIndex = 0;
    const batchWorkerPromises = [];
    for (let w = 1; w <= 4; w++) {
        batchWorkerPromises.push((async () => {
            while (chunkIndex < chunks.length) {
                const idx = chunkIndex++;
                if (chunks[idx]) await sendBatchWithSubRetry(chunks[idx], w);
            }
        })());
    }
    await Promise.all(batchWorkerPromises);
    
    // Cấp 3: Single workers cho những hình không qua được cả 2 cấp trên
    if (singleFallbackQueue.length > 0) {
        console.log(`[Single Fallback] Cứu ${singleFallbackQueue.length} hình cuối...`);
        showProgress(`Single fallback: 0/${singleFallbackQueue.length}`);
        await Promise.all([
            runSingleWorker('F1', singleFallbackQueue),
            runSingleWorker('F2', singleFallbackQueue),
            runSingleWorker('F3', singleFallbackQueue),
            runSingleWorker('F4', singleFallbackQueue)
        ]);
    }
    
    // Kết thúc
    if(pm) pm.classList.add('hidden');
    window.currentBookData.chapters[cIdx].lessons[lIdx] = lesson;
    showEditorPane();
    
    const failCount = resultLog.filter(r => !r.success).length;
    if (failCount === 0) {
        showToast('Xuất sắc! Đã biên dịch xong 100% hình TikZ.', 'success');
    } else {
        showToast(`Hoàn tất. ${resultLog.filter(r=>r.success).length} thành công, ${failCount} lỗi. Xem bảng góc phải.`, 'warning');
    }
};

window.uploadNormalImage = async function(uid, inputElem) {
    const fileInput = inputElem || document.getElementById(`upload-${uid}`) || document.getElementById(`upload-inline-${uid}`);
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];
    
    // Hiển thị trạng thái đang tải lên ngay lập tức để không bị "khựng"
    const domPlaceholder = document.querySelector(`div[data-id="${uid}"]`);
    if (domPlaceholder) {
        domPlaceholder.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2 text-2xl mb-2 text-teal-500"></i><br>Đang tải ảnh lên...`;
        domPlaceholder.style.pointerEvents = 'none'; // Khóa click trong lúc upload
    }

    const reader = new FileReader();
    reader.onload = async function() {
        if(!window.currentNodeIndex || !window.currentBookData) return;
        const {cIdx, lIdx} = window.currentNodeIndex;
        let lesson = window.currentBookData.chapters[cIdx].lessons[lIdx];
        
        // Upload lên Cloudflare
        const formData = new FormData();
        const newName = `images/bk_${Date.now()}.jpg`;
        formData.append('file', file, newName);
        try {
            const resp = await fetch('https://upload-helper.phamngockhanh-942001.workers.dev/', { method: 'PUT', body: formData });
            const data = await resp.json();
            const url = data.url;
            
            const item = lesson.pendingImages.find(i => i.id === uid);
            if(item) item._done = true;
            
            let cleanUrl = url;
            const imgHtml = `<div class="flex justify-center my-2 image-zoom-container group relative inline-block w-fit mx-auto"><img id="img-${uid}" src="${cleanUrl}" class="rounded-lg shadow-sm object-contain w-auto transition-all duration-200" style="max-height: 180px;" loading="lazy"><div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 p-1 rounded shadow border border-gray-200 z-10"><button onclick="window.zoomImg(this, 1.25)" class="text-gray-700 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100" title="Phóng to"><i class="fa-solid fa-search-plus"></i></button><button onclick="window.zoomImg(this, 0.8)" class="text-gray-700 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100" title="Thu nhỏ"><i class="fa-solid fa-search-minus"></i></button></div></div>`;
            replacePlaceholderById(uid, imgHtml, lesson);
            
            window.currentBookData.chapters[cIdx].lessons[lIdx] = lesson;
            
            // Cập nhật trực tiếp DOM để tránh khựng do gọi showEditorPane
            const domPlaceholder2 = document.querySelector(`div[data-id="${uid}"]`);
            if (domPlaceholder2) {
                domPlaceholder2.outerHTML = imgHtml;
                
                // Ẩn khung chờ bên trong thẻ vàng
                const bannerItem = document.getElementById(`pending-item-${uid}`);
                if (bannerItem) bannerItem.remove();
                
                const remaining = lesson.pendingImages.filter(i => !i._done).length;
                const bannerCount = document.getElementById('pending-images-count');
                if (bannerCount) bannerCount.innerText = remaining;
                if (remaining === 0) {
                    const banner = document.getElementById('pending-images-banner');
                    if (banner) banner.remove();
                }
            } else {
                showEditorPane(); // Fallback nếu không tìm thấy DOM
            }
            
            showToast('Tải ảnh thành công!', 'success');
        } catch(e) {
            showToast('Lỗi tải ảnh: ' + e.message, 'error');
            if (domPlaceholder) {
                domPlaceholder.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2 text-2xl mb-2 text-red-500"></i><br>Lỗi tải ảnh<br><span class="text-xs">Vui lòng thử lại</span>`;
                domPlaceholder.style.pointerEvents = 'auto'; // Mở lại cho click
            }
        }
    };
    reader.readAsArrayBuffer(file);
};

window.uploadImageFolder = async function(e) {
    const files = Array.from(e.target.files);
    if(files.length === 0) return;
    
    const validImages = files.filter(f => f.type.startsWith('image/'));
    if(validImages.length === 0) {
        showToast('Không có file ảnh nào!', 'error');
        return;
    }
    
    if(!window.currentNodeIndex || !window.currentBookData) return;
    const {cIdx, lIdx} = window.currentNodeIndex;
    let lesson = window.currentBookData.chapters[cIdx].lessons[lIdx];
    if(!lesson.pendingImages) return;
    
    const normalItems = lesson.pendingImages.filter(i => i.type === 'normal' && !i._done);
    if(normalItems.length === 0) return;
    
    const pm = document.getElementById('bm-progressModal');
    const total = normalItems.length;
    let done = 0;
    if(pm) {
        pm.classList.remove('hidden');
        document.getElementById('bm-compileProgressBar').style.width = '0%';
        document.getElementById('bm-compileProgressText').innerText = `0/${total}`;
        document.getElementById('bm-compilePercent').innerText = '0%';
    }
    
    let successList = [];
    let errorList = [];
    
    for (const item of normalItems) {
        const rawName = item.originalPath.split('/').pop().split('\\').pop();
        const targetName = rawName.split('.')[0].toLowerCase().trim();
        const matchFile = validImages.find(f => f.name.toLowerCase().includes(targetName));
        
        if (matchFile) {
            try {
                const formData = new FormData();
                const newName = `images/auto_${Date.now()}_${Math.random().toString(36).substr(2,5)}.jpg`;
                formData.append('file', matchFile, newName);
                
                const response = await fetch('https://upload-helper.phamngockhanh-942001.workers.dev/', { method: 'PUT', body: formData });
                
                if (response.ok) {
                    const data = await response.json();
                    const url = data.url;
                    item._done = true;
                    successList.push({ name: item.originalPath, id: item.id });
                    
                    // Regex khử sạch } dư sau khi tạo ảnh
                    let cleanUrl = url;
                    
                    const imgHtml = `<div class="flex justify-center my-2 image-zoom-container group relative inline-block w-fit mx-auto"><img id="img-${item.id}" src="${cleanUrl}" class="rounded-lg shadow-sm object-contain w-auto transition-all duration-200" style="max-height: 180px;" loading="lazy"><div class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 p-1 rounded shadow border border-gray-200 z-10"><button onclick="window.zoomImg(this, 1.25)" class="text-gray-700 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100" title="Phóng to"><i class="fa-solid fa-search-plus"></i></button><button onclick="window.zoomImg(this, 0.8)" class="text-gray-700 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-gray-100" title="Thu nhỏ"><i class="fa-solid fa-search-minus"></i></button></div></div>`;
                    
                    // Xóa hoàn toàn dấu } bị kẹt lại trong html do immini
                    replacePlaceholderById(item.id, imgHtml, lesson);
                    
                    // Quét toàn bộ content để xóa } thừa nếu có
                    const traverseStripBrace = (obj) => {
                        for (let key in obj) {
                            if (typeof obj[key] === 'string') {
                                // Xóa } sau </div> của container ảnh
                                obj[key] = obj[key].replace(/(<div class="flex justify-center[^>]*>[\s\S]*?<\/div>\s*)\}/g, '$1');
                            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                                traverseStripBrace(obj[key]);
                            }
                        }
                    };
                    traverseStripBrace(lesson);
                } else {
                    errorList.push(item.originalPath);
                }
            } catch(err) {
                console.error(err);
                errorList.push(item.originalPath);
            }
        }
        
        done++;
        const pct = Math.round((done / total) * 100);
        if(pm) {
            document.getElementById('bm-compileProgressBar').style.width = `${pct}%`;
            document.getElementById('bm-compileProgressText').innerText = `${done}/${total}`;
            document.getElementById('bm-compilePercent').innerText = `${pct}%`;
        }
    }
    
    if(pm) pm.classList.add('hidden');
    window.currentBookData.chapters[cIdx].lessons[lIdx] = lesson;
    showEditorPane();
    
    // ---- Bảng kết quả nổi (góc TRÁI dưới) ----
    const ensureResultPanelFolder = () => {
        let panel = document.getElementById('bm-folder-result-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'bm-folder-result-panel';
            panel.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9999;width:260px;max-height:360px;background:white;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.18);border:1px solid #e5e7eb;overflow:hidden;font-size:12px;';
            panel.innerHTML = `
                <div style="background:#0f766e;color:white;padding:8px 12px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
                    <span>📁 Kết quả tải ảnh</span>
                    <button onclick="this.closest('#bm-folder-result-panel').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;color:white;border-radius:4px;padding:2px 6px;cursor:pointer;">✕</button>
                </div>
                <div id="bm-folder-result-stats" style="padding:6px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;font-size:11px;color:#64748b;"></div>
                <div id="bm-folder-result-list" style="max-height:280px;overflow-y:auto;padding:6px 8px;"></div>`;
            document.body.appendChild(panel);
        }
        return panel;
    };
    
    const panel = ensureResultPanelFolder();
    panel.style.display = 'block';
    
    document.getElementById('bm-folder-result-stats').innerHTML = 
        `<span style="color:#16a34a;font-weight:700;">✅ ${successList.length} thành công</span> &nbsp;|&nbsp; <span style="color:#dc2626;font-weight:700;">❌ ${errorList.length} lỗi</span> &nbsp;|&nbsp; Tổng: ${normalItems.length}`;
        
    const list = document.getElementById('bm-folder-result-list');
    let htmlContent = '';
    
    successList.forEach(obj => {
        htmlContent += `
            <div onclick="document.getElementById('img-${obj.id}')?.scrollIntoView({behavior:'smooth',block:'center'}) || document.querySelector('[data-id=\\'${obj.id}\\']')?.scrollIntoView({behavior:'smooth',block:'center'})"
                style="cursor:pointer;padding:4px 6px;margin-bottom:3px;border-radius:6px;background:#f0fdf4;border:1px solid #bbf7d0;display:flex;align-items:center;gap:6px;" title="Bấm để nhảy đến hình">
                <span>✅</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#15803d;">${obj.name}</span>
            </div>`;
    });
    
    errorList.forEach(name => {
        htmlContent += `
            <div style="padding:4px 6px;margin-bottom:3px;border-radius:6px;background:#fef2f2;border:1px solid #fecaca;display:flex;align-items:center;gap:6px;">
                <span>❌</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dc2626;">${name}</span>
            </div>`;
    });
    
    list.innerHTML = htmlContent;
    
    if (errorList.length === 0) {
        showToast('Hoàn tất tải ảnh! Bảng chi tiết ở góc trái.', 'success');
    } else {
        showToast('Tải ảnh xong nhưng có hình bị bỏ qua, xem bảng góc trái.', 'warning');
    }
};

window.toggleTreeNode = function(e, id) {
    e.stopPropagation();
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
    } else {
        el.classList.add('hidden');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
    }
};

window.saveBookToCloudflare = async function() {
    if (!window.currentBookData) return;
    
    // Auto-update mapId and title from inputs if in Overview pane
    const mapId = document.getElementById('bookMapId').value.trim();
    const title = document.getElementById('bookTitle').value.trim();
    if (!mapId || !title) {
        showToast("Vui lòng nhập Mã Sách và Tiêu đề!", "error");
        window.selectOverview();
        return;
    }
    
    window.currentBookData.mapId = mapId;
    window.currentBookData.title = title;
    
    try {
        document.getElementById('headerActions').innerHTML = `<span class="text-sm font-bold text-gray-500"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên Cloudflare...</span>`;
        
        let fName = `book_${mapId}_${Date.now()}.json`;
        let blob = new Blob([JSON.stringify(window.currentBookData)], { type: "application/json" });
        let formData = new FormData();
        formData.append('file', blob, fName);
        
        const uploadRes = await fetch(CLOUDFLARE_UPLOAD_API, { method: 'PUT', body: formData });
        if (!uploadRes.ok) throw new Error("Upload thất bại!");
        const data = await uploadRes.json();
        
        // Save to local book list
        let books = JSON.parse(localStorage.getItem('digitized_books') || '[]');
        const existingIdx = books.findIndex(b => b.mapId === mapId);
        if (existingIdx !== -1) {
            books[existingIdx].title = title;
            books[existingIdx].url = data.url;
            books[existingIdx].date = new Date().toISOString();
        } else {
            books.push({
                mapId: mapId,
                title: title,
                url: data.url,
                date: new Date().toISOString()
            });
        }
        localStorage.setItem('digitized_books', JSON.stringify(books));
        
        // Cập nhật lên Cloudflare
        try {
            let blob = new Blob([JSON.stringify(books)], { type: "application/json" });
            let formData = new FormData();
            formData.append('file', blob, 'book_index_global.json');
            await fetch(CLOUDFLARE_UPLOAD_API, { method: 'PUT', body: formData });
            console.log("Synced book index to Cloudflare");
        } catch (e) {
            console.error("Failed to sync book index", e);
        }
        
        showToast("Lưu sách lên Cloudflare thành công!", "success");
        loadBookList(true);
        
        setTimeout(() => {
            document.getElementById('headerActions').innerHTML = `
                <button onclick="window.saveBookToCloudflare()" class="px-5 py-2 bg-orange-500 text-white font-bold rounded-xl shadow-lg hover:bg-orange-600 transition-all flex items-center gap-2">
                    <i class="fa-solid fa-cloud-arrow-up"></i> Cập nhật Cloudflare
                </button>
            `;
        }, 1000);
        
    } catch (e) {
        console.error(e);
        showToast("Có lỗi xảy ra: " + e.message, "error");
        document.getElementById('headerActions').innerHTML = `
            <button onclick="window.saveBookToCloudflare()" class="px-5 py-2 bg-orange-500 text-white font-bold rounded-xl shadow-lg hover:bg-orange-600 transition-all flex items-center gap-2">
                <i class="fa-solid fa-cloud-arrow-up"></i> Thử lại
            </button>
        `;
    }
}

window.deleteCurrentBook = async function() {
    if(!window.currentBookData || !window.currentBookData.mapId) return;
    if(!confirm("Bạn có chắc chắn muốn xóa tài liệu này? Hành động này sẽ xóa file trên Cloudflare.")) return;
    
    const mapId = window.currentBookData.mapId;
    let books = JSON.parse(localStorage.getItem('digitized_books') || '[]');
    const book = books.find(b => b.mapId === mapId);
    
    if (book && book.url) {
        try {
            const fileName = book.url.split('/').pop();
            await fetch(CLOUDFLARE_UPLOAD_API + `?file=${fileName}`, { method: 'DELETE' });
        } catch(e) {
            console.warn("Could not delete from CF", e);
        }
    }
    
    books = books.filter(b => b.mapId !== mapId);
    localStorage.setItem('digitized_books', JSON.stringify(books));
    
    // Cập nhật lên Cloudflare
    try {
        let blob = new Blob([JSON.stringify(books)], { type: "application/json" });
        let formData = new FormData();
        formData.append('file', blob, 'book_index_global.json');
        await fetch(CLOUDFLARE_UPLOAD_API, { method: 'PUT', body: formData });
    } catch (e) {
        console.error("Failed to sync book index", e);
    }
    
    showToast("Đã xóa tài liệu!", "success");
    loadBookList(true);
    window.exitEditorMode();
}

window.loadBookToEditor = async function(mapId) {
    let books = JSON.parse(localStorage.getItem('digitized_books') || '[]');
    const book = books.find(b => b.mapId === mapId);
    if (!book) return;
    
    showToast("Đang tải tài liệu...", "info");
    try {
        const res = await fetch(book.url);
        if (!res.ok) throw new Error("Fetch failed");
        let data = await res.json();
        
        // Cập nhật chuẩn cấu trúc nếu là version cũ (không có chapters)
        if (!data.chapters) {
            if (data.sections) {
                // Version 2
                data = {
                    mapId: data.mapId,
                    title: data.title,
                    chapters: [{
                        title: "Chương Mặc Định",
                        lessons: data.sections
                    }]
                };
            } else {
                // Version 1
                data = {
                    mapId: data.mapId,
                    title: data.title,
                    chapters: [{
                        title: "Chương Mặc Định",
                        lessons: [{
                            title: "Bài Mặc Định",
                            subsections: [{
                                title: "Phần Mặc định",
                                theory: data.theory || [],
                                exercises_TL: data.exercises_TL || [],
                                exercises_TN_Modules: data.exercises_TN_Modules || []
                            }]
                        }]
                    }]
                };
            }
        }
        
        window.currentBookData = data;
        
        document.getElementById("emptyState").classList.add("hidden");
        document.getElementById("bookEditor").classList.remove("hidden");
        document.getElementById("headerActions").classList.remove("hidden");
        
        document.getElementById('bookMapId').value = data.mapId;
        document.getElementById('bookTitle').value = data.title;
        
        window.currentNodeIndex = null;
        enterEditorMode();
        renderTreeSidebar();
        showEditorPane();
        showToast("Tải tài liệu hoàn tất!", "success");
        
    } catch(e) {
        showToast("Lỗi khi tải tài liệu!", "error");
    }
}

async function loadBookList(skipFetch = false) {
    const list = document.getElementById('bookList');
    
    if (!skipFetch) {
        // Thử đồng bộ từ Cloudflare
        try {
            const res = await fetch('https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev/book_index_global.json?t=' + Date.now());
            if (res.ok) {
                const cloudBooks = await res.json();
                if (cloudBooks && Array.isArray(cloudBooks) && cloudBooks.length > 0) {
                    localStorage.setItem('digitized_books', JSON.stringify(cloudBooks));
                }
            }
        } catch (e) {
            console.warn("Failed to fetch cloud book index", e);
        }
    }
    
    let books = JSON.parse(localStorage.getItem('digitized_books') || '[]');
    if (books.length === 0) {
        list.innerHTML = `<div class="text-center text-sm text-gray-400 py-4">Chưa có bài nào</div>`;
        return;
    }
    
    list.innerHTML = books.map((b, i) => `
        <div class="p-3 bg-white rounded-lg border border-gray-200 shadow-sm hover:border-teal-500 cursor-pointer transition-colors" onclick="window.loadBookToEditor('${b.mapId}')">
            <h4 class="font-bold text-gray-800 text-sm truncate">${b.title}</h4>
            <div class="flex items-center justify-between mt-1 text-xs text-gray-500">
                <span>${b.mapId}</span>
                <a href="${b.url}" target="_blank" onclick="event.stopPropagation()" class="hover:text-teal-700" title="Xem JSON nguồn"><i class="fa-solid fa-code"></i></a>
            </div>
        </div>
    `).reverse().join('');
}

document.addEventListener('DOMContentLoaded', () => {
    loadBookList();
});

// Sự kiện cho phép người dùng ấn Ctrl+V trực tiếp vào placeholder để tải ảnh lên
document.addEventListener('paste', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('pending-image-placeholder')) {
        const uid = e.target.getAttribute('data-id');
        if (!uid) return;
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file') {
                const blob = item.getAsFile();
                const fileInput = document.getElementById(`upload-inline-${uid}`) || document.getElementById(`upload-${uid}`);
                if (fileInput) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(blob);
                    fileInput.files = dataTransfer.files;
                    window.uploadNormalImage(uid, fileInput);
                }
                e.preventDefault();
                return;
            }
        }
    }
});

// Hàm thu phóng ảnh cho người dùng
// ============================================================
// --- TÍNH NĂNG SỐ HÓA SÁCH & GÁN MÃ CCCD (CHỈ GỒM SỐ) ---
// ============================================================

window.selectedDigitizeFiles = [];

function analyzeMapIdDetails(mapId) {
    let subject = "Toán";
    let level = "Thông hiểu";
    let levelColor = "blue";
    let grade = "9";

    if (!mapId) return { subject, level, levelColor, grade };

    const clean = mapId.trim().toUpperCase();
    const gradeMatch = clean.match(/^([0-2]?[0-9])/);
    if (gradeMatch) grade = gradeMatch[1];

    if (clean.includes('D')) subject = "Đại số";
    else if (clean.includes('H')) subject = "Hình học";
    else if (clean.includes('X')) subject = "Xác suất";

    if (clean.includes('N') || clean.includes('NB')) {
        level = "Nhận biết"; levelColor = "green";
    } else if (clean.includes('H') || clean.includes('TH')) {
        level = "Thông hiểu"; levelColor = "blue";
    } else if (clean.includes('V') || clean.includes('VD')) {
        if (clean.includes('C') || clean.includes('VDC')) {
            level = "Vận dụng cao"; levelColor = "red";
        } else {
            level = "Vận dụng"; levelColor = "amber";
        }
    } else if (clean.includes('C')) {
        level = "Vận dụng cao"; levelColor = "red";
    }

    return { subject, level, levelColor, grade };
}

function parseTexBeginLine(line, env) {
    const trimmed = line.trimEnd();
    const regex = new RegExp(`^(\\s*)\\\\begin\\{${env}\\}(.*)$`);
    const m = trimmed.match(regex);
    if (!m) return null;

    const indent = m[1] || '';
    let rest = m[2];
    let rawArg = '';
    let commentPart = '';

    // Lấy tham số tùy chọn [...]
    const argMatch = rest.match(/^\s*\[(.*?)\]/);
    if (argMatch) {
        rawArg = argMatch[1].trim();
        rest = rest.substring(argMatch[0].length);
    }

    // Lấy phần chú thích %...
    const commentIdx = rest.indexOf('%');
    if (commentIdx !== -1) {
        commentPart = rest.substring(commentIdx);
    }

    let source = '';
    let mapId = '';

    if (commentPart) {
        const bracketMatches = Array.from(commentPart.matchAll(/\[(.*?)\]/g)).map(x => x[1].trim());
        if (bracketMatches.length >= 2) {
            source = bracketMatches[0];
            mapId = bracketMatches[1];
        } else if (bracketMatches.length === 1) {
            const single = bracketMatches[0];
            if (/^[0-2]?[0-9][A-Z][0-9]/i.test(single)) {
                mapId = single;
            } else {
                source = single;
            }
        } else {
            const textComment = commentPart.replace(/^%+/, '').trim();
            if (textComment) source = textComment;
        }
    }

    let existingCccd = null;
    if (/^\d{4,9}$/.test(rawArg)) {
        existingCccd = rawArg;
    } else if (rawArg) {
        if (!mapId && /^[0-2]?[0-9][A-Z][0-9]/i.test(rawArg)) {
            mapId = rawArg;
        } else if (!source) {
            source = rawArg;
        }
    }

    return { indent, rawArg, source, mapId, existingCccd };
}

function parseQuestionBodyForBank(rawBody, env) {
    const { content, solution } = extractLoigiai(rawBody);
    let bodyText = content.replace(/^%[^\n\r]*[\r\n]*/, ''); // Bỏ comment đầu dòng nếu có
    let type = 'tracnghiem';
    let options = [];
    let correct = -1;
    let statements = [];
    let answer = '';

    // 1. Trắc nghiệm 4 phương án (\choice)
    const choiceData = extractBracesAfterCommand(bodyText, '\\choice', 4);
    if (choiceData.found && choiceData.contents.length === 4) {
        type = 'tracnghiem';
        choiceData.contents.forEach((opt, idx) => {
            let cleanOpt = opt.trim();
            if (cleanOpt.includes('\\True')) {
                correct = idx;
                cleanOpt = cleanOpt.replace('\\True', '').trim();
            }
            options.push(cleanOpt);
        });
        bodyText = bodyText.substring(0, choiceData.startIndex) + bodyText.substring(choiceData.endIndex);
    } else {
        // 2. Đúng / Sai (\choiceTF)
        const choiceTFData = extractBracesAfterCommand(bodyText, '\\choiceTF', 4);
        if (choiceTFData.found && choiceTFData.contents.length === 4) {
            type = 'dung_sai';
            let corrects = [];
            choiceTFData.contents.forEach((opt, idx) => {
                let cleanOpt = opt.trim();
                const isTrue = cleanOpt.includes('\\True');
                cleanOpt = cleanOpt.replace('\\True', '').trim();
                statements.push({ text: cleanOpt, correct: isTrue });
                if (isTrue) corrects.push(idx);
            });
            correct = corrects;
            bodyText = bodyText.substring(0, choiceTFData.startIndex) + bodyText.substring(choiceTFData.endIndex);
        } else {
            // 3. Điền khuyết / Trả lời ngắn (\shortans)
            const shortansData = extractBracesAfterCommand(bodyText, '\\shortans', 1);
            if (shortansData.found && shortansData.contents.length === 1) {
                type = 'dien_khuyet';
                answer = shortansData.contents[0].trim();
                options = [answer];
                bodyText = bodyText.substring(0, shortansData.startIndex) + bodyText.substring(shortansData.endIndex);
            } else {
                if (env === 'bt' || env === 'vd' || env === 'vidu') {
                    type = 'tuluan';
                }
            }
        }
    }

    return {
        content: bodyText.trim(),
        solution: solution.trim(),
        type,
        options,
        correct,
        statements,
        answer
    };
}

// Lấy mã CCCD kế tiếp qua BankService
async function fetchNextAvailableCccd() {
    if (window.BankService) {
        return await window.BankService.getNextAvailableCccd();
    }
    return 10000001;
}

window.openDigitizeBookModal = async function(options = {}) {
    const modal = document.getElementById('digitizeBookModal');
    if (!modal) return;

    // Reset giao diện
    window.selectedDigitizeFiles = [];
    const fileList = document.getElementById('digitizeFileList');
    if (fileList) { fileList.innerHTML = ''; fileList.classList.add('hidden'); }
    const progressArea = document.getElementById('digitizeProgressArea');
    if (progressArea) progressArea.classList.add('hidden');
    const resultArea = document.getElementById('digitizeResultArea');
    if (resultArea) resultArea.classList.add('hidden');
    const logBox = document.getElementById('digitizeLogBox');
    if (logBox) logBox.innerHTML = '';

    const btnStart = document.getElementById('btnStartDigitize');
    if (btnStart) { btnStart.disabled = false; btnStart.innerHTML = '<i class="fa-solid fa-bolt"></i> Bắt đầu Số Hóa & Xuất TeX'; }

    // Gợi ý mã sách
    const bookMapIdInput = document.getElementById('digitizeBookMapId');
    if (bookMapIdInput) {
        bookMapIdInput.value = window.currentBookData?.mapId || document.getElementById('bookMapId')?.value || '';
    }

    // Lấy số CCCD tiếp theo
    const startInput = document.getElementById('digitizeStartCccd');
    const hintEl = document.getElementById('lblNextCccdHint');
    if (startInput) {
        startInput.value = '';
        if (hintEl) hintEl.textContent = 'Đang kiểm tra...';
        const nextCccd = await fetchNextAvailableCccd();
        startInput.value = nextCccd;
        if (hintEl) hintEl.textContent = `Gợi ý: ${nextCccd}`;
    }

    modal.classList.remove('hidden');
};

window.closeDigitizeBookModal = function() {
    const modal = document.getElementById('digitizeBookModal');
    if (modal) modal.classList.add('hidden');
};

window.digitizeCurrentLessonTeX = function() {
    window.openDigitizeBookModal({ fromCurrentLesson: true });
};

window.handleDigitizeFileSelect = function(input) {
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    window.selectedDigitizeFiles = files;
    const listEl = document.getElementById('digitizeFileList');
    if (!listEl) return;

    listEl.innerHTML = '';
    listEl.classList.remove('hidden');

    files.forEach((f, idx) => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-xs";
        item.innerHTML = `
            <span class="font-bold text-gray-700 truncate"><i class="fa-regular fa-file-code text-teal-600 mr-2"></i>${f.name}</span>
            <span class="text-gray-400 font-mono">${(f.size / 1024).toFixed(1)} KB</span>
        `;
        listEl.appendChild(item);
    });
};

function downloadTextAsFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Chạy hàng đợi upload Cloudflare R2 với giới hạn đồng thời (concurrency)
async function uploadQuestionsConcurrency(qList, concurrency, onProgress) {
    const BASE_URL = "https://upload-helper.phamngockhanh-942001.workers.dev/";
    let completed = 0;
    let failed = 0;
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < qList.length) {
            const currentIndex = nextIndex++;
            const q = qList[currentIndex];
            try {
                const blob = new Blob([JSON.stringify(q)], { type: 'application/json' });
                const formData = new FormData();
                formData.append('file', blob, `bank/${q.id}.json`);
                const res = await fetch(BASE_URL, { method: 'PUT', body: formData });
                if (res.ok) completed++;
                else failed++;
            } catch(e) {
                console.error("Lỗi upload R2 câu:", q.id, e);
                failed++;
            }
            if (onProgress) onProgress(completed + failed, qList.length, completed, failed);
        }
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, qList.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return { completed, failed };
}

window.startDigitizeProcess = async function() {
    const files = window.selectedDigitizeFiles;
    if (!files || files.length === 0) {
        alert("Vui lòng chọn ít nhất 1 file .tex để số hóa!");
        return;
    }

    const startInputVal = parseInt(document.getElementById('digitizeStartCccd')?.value);
    let currentCccd = (!isNaN(startInputVal) && startInputVal >= 10000000) ? startInputVal : await fetchNextAvailableCccd();

    const bookMapIdVal = (document.getElementById('digitizeBookMapId')?.value || '').trim();
    const keepExisting = document.getElementById('digitizeKeepExistingCccd')?.checked ?? true;
    const uploadToBank = document.getElementById('digitizeUploadToBank')?.checked ?? true;
    const importToActiveLesson = document.getElementById('digitizeImportToActiveLesson')?.checked ?? true;

    // Giao diện bắt đầu
    const btnStart = document.getElementById('btnStartDigitize');
    if (btnStart) {
        btnStart.disabled = true;
        btnStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    }

    const progressArea = document.getElementById('digitizeProgressArea');
    const progressBar = document.getElementById('digitizeProgressBar');
    const progressStatus = document.getElementById('digitizeProgressStatus');
    const progressPercent = document.getElementById('digitizeProgressPercent');
    const logBox = document.getElementById('digitizeLogBox');
    const downloadContainer = document.getElementById('digitizeDownloadButtons');

    if (progressArea) progressArea.classList.remove('hidden');
    if (logBox) logBox.innerHTML = '';
    if (downloadContainer) downloadContainer.innerHTML = '';

    const appendLog = (msg, color = 'text-gray-300') => {
        if (!logBox) return;
        const p = document.createElement('p');
        p.className = `${color} leading-tight`;
        p.innerHTML = msg;
        logBox.appendChild(p);
        logBox.scrollTop = logBox.scrollHeight;
    };

    appendLog(`🚀 Bắt đầu quá trình số hóa ${files.length} file .tex...`, 'text-teal-400 font-bold');
    appendLog(`🔢 Mã CCCD khởi tạo: <span class="text-yellow-300">${currentCccd}</span>`, 'text-teal-300');

    let totalQuestionsCount = 0;
    const allProcessedFiles = [];
    const allQuestionsToUpload = [];

    // BƯỚC 1: XỬ LÝ TEXT TỪNG FILE LATEX
    for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        appendLog(`\n📄 [File ${fIdx + 1}/${files.length}] Đang phân tích: <b>${file.name}</b>...`, 'text-blue-300');

        const rawText = await file.text();
        const isCRLF = rawText.includes('\r\n');
        const lineEnding = isCRLF ? '\r\n' : '\n';
        const lines = rawText.split(/\r?\n/);

        const updatedLines = [];
        let fileQCount = 0;
        let inQuestion = false;
        let currentEnv = '';
        let currentQuestionInfo = null;
        let currentBodyLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Bắt đầu một câu hỏi
            const beginMatch = line.match(/^\s*\\begin\{(ex|bt|vd|vidu)\}/);
            if (beginMatch) {
                currentEnv = beginMatch[1];
                inQuestion = true;
                currentBodyLines = [];

                const parsed = parseTexBeginLine(line, currentEnv);
                let assignedCccd;

                if (keepExisting && parsed.existingCccd) {
                    assignedCccd = parsed.existingCccd;
                } else {
                    assignedCccd = currentCccd++;
                }

                // Xuất lại câu hỏi dạng chuẩn: \begin{ex}[CCCD]%[nguồn]%[mã ID nếu có]
                const newLine = `${parsed.indent}\\begin{${currentEnv}}[${assignedCccd}]%[${parsed.source}]%[${parsed.mapId}]`;
                updatedLines.push(newLine);

                currentQuestionInfo = {
                    cccd: assignedCccd,
                    env: currentEnv,
                    source: parsed.source,
                    mapId: parsed.mapId
                };

                fileQCount++;
                totalQuestionsCount++;
                continue;
            }

            // Kết thúc câu hỏi
            if (inQuestion) {
                const endMatch = line.match(new RegExp(`^\\s*\\\\end\\{${currentEnv}\\}`));
                if (endMatch) {
                    inQuestion = false;
                    updatedLines.push(line);

                    // Đóng gói dữ liệu câu hỏi để lưu vào Ngân hàng
                    const rawBody = currentBodyLines.join('\n');
                    const parsedBody = parseQuestionBodyForBank(rawBody, currentQuestionInfo.env);
                    const mapAnalysis = analyzeMapIdDetails(currentQuestionInfo.mapId);

                    const qData = window.BankService ? window.BankService.createBankQuestion({
                        mapId: currentQuestionInfo.mapId || "",
                        source: currentQuestionInfo.source || "",
                        type: parsedBody.type,
                        content: parsedBody.content,
                        solution: parsedBody.solution,
                        options: parsedBody.options,
                        correct: parsedBody.correct,
                        statements: parsedBody.statements,
                        answer: parsedBody.answer,
                        subject: mapAnalysis.subject,
                        level: mapAnalysis.level,
                        levelColor: mapAnalysis.levelColor,
                        point: 0.25,
                        bookMapId: bookMapIdVal || "",
                        fileName: file.name
                    }, String(currentQuestionInfo.cccd)) : {
                        id: String(currentQuestionInfo.cccd),
                        cccd: String(currentQuestionInfo.cccd),
                        mapId: currentQuestionInfo.mapId || "",
                        source: currentQuestionInfo.source || "",
                        type: parsedBody.type,
                        content: parsedBody.content,
                        solution: parsedBody.solution,
                        options: parsedBody.options,
                        correct: parsedBody.correct,
                        statements: parsedBody.statements,
                        answer: parsedBody.answer,
                        subject: mapAnalysis.subject,
                        level: mapAnalysis.level,
                        levelColor: mapAnalysis.levelColor,
                        point: 0.25,
                        bookMapId: bookMapIdVal || "",
                        fileName: file.name,
                        updatedAt: new Date().toISOString()
                    };

                    allQuestionsToUpload.push(qData);
                    appendLog(`  ✓ [${qData.cccd}] \\begin{${currentQuestionInfo.env}}[${qData.cccd}]%[${qData.source}]%[${qData.mapId}] (${qData.type})`);
                    currentQuestionInfo = null;
                    continue;
                } else {
                    currentBodyLines.push(line);
                    updatedLines.push(line);
                    continue;
                }
            }

            // Dòng thông thường ngoài câu hỏi: Giữ nguyên 100% không suy suyển
            updatedLines.push(line);
        }

        const updatedContent = updatedLines.join(lineEnding);
        const exportFileName = file.name.replace(/\.(tex|txt)$/i, '') + '_ID.tex';
        allProcessedFiles.push({
            name: exportFileName,
            content: updatedContent,
            count: fileQCount
        });

        appendLog(`  ↳ Hoàn tất: <b>${fileQCount} câu hỏi</b> đã gán mã CCCD.`, 'text-green-400');
    }

    // BƯỚC 2: TỰ ĐỘNG TẢI FILE TEX VỀ MÁY & TẠO NÚT TẢI
    allProcessedFiles.forEach(f => {
        downloadTextAsFile(f.name, f.content);
        if (downloadContainer) {
            const btn = document.createElement('button');
            btn.className = "px-3 py-1.5 bg-white border border-teal-300 text-teal-700 font-bold rounded-lg hover:bg-teal-50 text-xs flex items-center gap-1.5 shadow-xs";
            btn.innerHTML = `<i class="fa-solid fa-download"></i> Tải lại: ${f.name} (${f.count} câu)`;
            btn.onclick = () => downloadTextAsFile(f.name, f.content);
            downloadContainer.appendChild(btn);
        }
    });

    // BƯỚC 3: NẠP LÊN NGÂN HÀNG CÂU HỎI CLOUDFLARE R2
    if (uploadToBank && allQuestionsToUpload.length > 0) {
        appendLog(`\n☁️ Đang nạp ${allQuestionsToUpload.length} câu hỏi lên Ngân hàng câu hỏi R2 qua BankService...`, 'text-yellow-400 font-bold');
        if (progressStatus) progressStatus.innerHTML = '<i class="fa-solid fa-cloud-arrow-up fa-spin"></i> Đang nạp lên Ngân hàng câu hỏi R2...';

        let uploadResult;
        if (window.BankService) {
            uploadResult = await window.BankService.uploadQuestionsToBank(allQuestionsToUpload, {
                concurrency: 6,
                onProgress: (done, total, success, fail) => {
                    const percent = Math.round((done / total) * 100);
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressPercent) progressPercent.textContent = `${done}/${total} (${percent}%)`;
                }
            });
            appendLog(`✅ Hoàn tất tải lên R2! Thành công: ${uploadResult.successCount} câu | Lỗi: ${uploadResult.failCount} câu`, 'text-green-400 font-bold');
        } else {
            uploadResult = await uploadQuestionsConcurrency(allQuestionsToUpload, 6, (done, total, success, fail) => {
                const percent = Math.round((done / total) * 100);
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (progressPercent) progressPercent.textContent = `${done}/${total} (${percent}%)`;
            });
            appendLog(`✅ Hoàn tất tải lên R2! Thành công: ${uploadResult.completed} câu | Lỗi: ${uploadResult.failed} câu`, 'text-green-400 font-bold');
        }
    }

    // BƯỚC 4: LƯU MÃ CCCD KẾ TIẾP VÀO BỘ ĐẾM TRUNG TÂM
    const lastAssignedCccd = currentCccd - 1;
    if (window.BankService) {
        await window.BankService.updateLatestCccdCounter(lastAssignedCccd);
    } else {
        localStorage.setItem('last_generated_cccd', String(lastAssignedCccd));
    }

    // BƯỚC 5: NẠP VÀO BÀI HỌC HIỆN TẠI (NẾU CÓ CHỌN)
    if (importToActiveLesson && allProcessedFiles.length > 0 && window.currentNodeIndex && window.currentBookData) {
        try {
            const firstContent = allProcessedFiles[0].content;
            const parsedSections = parseTreeStructure(firstContent);
            if (parsedSections.length > 0) {
                const { cIdx, lIdx } = window.currentNodeIndex;
                let targetLesson = window.currentBookData.chapters[cIdx].lessons[lIdx];
                targetLesson.title = parsedSections[0].title;
                targetLesson.subsections = parsedSections[0].subsections;
                renderTreeSidebar();
                showEditorPane();
                appendLog(`📖 Đã nạp thành công nội dung đã gán CCCD vào Bài học trên Mục lục sách!`, 'text-indigo-300');
            }
        } catch(e) {
            console.warn("Lỗi nạp bài học hiện tại:", e);
        }
    }

    // HOÀN TẤT
    if (progressBar) progressBar.style.width = `100%`;
    if (progressPercent) progressPercent.textContent = `100%`;
    if (progressStatus) progressStatus.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> Hoàn tất toàn bộ!';

    const resultArea = document.getElementById('digitizeResultArea');
    const resultTitle = document.getElementById('digitizeResultTitle');
    const resultDesc = document.getElementById('digitizeResultDesc');

    if (resultArea) resultArea.classList.remove('hidden');
    if (resultTitle) resultTitle.textContent = `Số hóa thành công ${totalQuestionsCount} câu hỏi!`;
    if (resultDesc) resultDesc.textContent = `Tất cả file .tex đã được gán mã CCCD [${startInputVal || 10000001} ➔ ${lastAssignedCccd}], nạp vào Ngân hàng và tự động tải về máy.`;

    if (btnStart) {
        btnStart.disabled = false;
        btnStart.innerHTML = '<i class="fa-solid fa-check"></i> Đã Hoàn Tất';
    }

    showToast(`Đã số hóa thành công ${totalQuestionsCount} câu hỏi!`, 'success');
};







