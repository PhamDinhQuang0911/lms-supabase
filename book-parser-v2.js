const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'file main latex chuyên đề');

// --- CÁC HÀM TIỆN ÍCH ---

function extractLoigiai(text) {
    const loigiaiMatch = text.match(/\\loigiai\s*\{/);
    if (!loigiaiMatch) return { content: text, solution: '' };

    const startIndex = loigiaiMatch.index;
    const braceStartIndex = startIndex + loigiaiMatch[0].length - 1;

    let braceCount = 0;
    let endIndex = -1;
    let inLoigiai = false;
    
    for (let i = braceStartIndex; i < text.length; i++) {
        if (text[i] === '{') {
            braceCount++;
            inLoigiai = true;
        } else if (text[i] === '}') {
            braceCount--;
        }
        
        if (inLoigiai && braceCount === 0) {
            endIndex = i;
            break;
        }
    }
    
    if (endIndex !== -1) {
        const solution = text.substring(braceStartIndex + 1, endIndex).trim();
        const content = (text.substring(0, startIndex) + text.substring(endIndex + 1)).trim();
        return { content, solution };
    }
    return { content: text, solution: '' };
}

// Lấy tham số lệnh theo dạng chuỗi ngoặc nhọn
function extractBracesAfterCommand(text, command, numBraces) {
    const startIndex = text.indexOf(command);
    if (startIndex === -1) return { found: false };
    
    let currentIdx = startIndex + command.length;
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
    
    return { 
        found: true, 
        contents: results, 
        startIndex: startIndex, 
        endIndex: currentIdx 
    };
}

function postProcess(text) {
    if(!text) return "";
    let processed = text;

    // Xóa comment dư thừa (ẩn)
    processed = processed.replace(/(?<!\\)%.*/g, '');

    // 1. Handle \immini
    let imminiData;
    while ((imminiData = extractBracesAfterCommand(processed, '\\immini', 2)).found && imminiData.contents.length === 2) {
        let replacement = `<div class="flex flex-col md:flex-row gap-6 items-center"><div class="flex-1 w-full text-justify">\n${imminiData.contents[0]}\n</div><div class="flex-none max-w-full overflow-x-auto">\n${imminiData.contents[1]}\n</div></div>`;
        processed = processed.substring(0, imminiData.startIndex) + replacement + processed.substring(imminiData.endIndex);
    }
    
    // 2. Handle tikzpicture
    processed = processed.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g, `<div class="flex justify-center my-4 overflow-x-auto"><script type="text/tikz">\\begin{tikzpicture}$1\\end{tikzpicture}<\/script></div>`);

    // 3. Handle list environments
    processed = processed.replace(/\\begin\{itemize\}/g, '<ul class="list-disc pl-8 my-3 space-y-2">');
    processed = processed.replace(/\\end\{itemize\}/g, '</ul>');
    processed = processed.replace(/\\begin\{enumerate\}(\[[^\]]*\])?/g, '<ol class="list-decimal pl-8 my-3 space-y-2">');
    processed = processed.replace(/\\end\{enumerate\}/g, '</ol>');
    processed = processed.replace(/\\begin\{enumEX\}(\[[^\]]*\])?\{[^}]*\}/g, '<ul class="list-[circle] pl-8 my-3 space-y-2">');
    processed = processed.replace(/\\end\{enumEX\}/g, '</ul>');
    processed = processed.replace(/\\begin\{listEX\}(\[[^\]]*\])?/g, '<ul class="list-[circle] pl-8 my-3 space-y-2">');
    processed = processed.replace(/\\end\{listEX\}/g, '</ul>');
    processed = processed.replace(/\\begin\{itemchoice\}/g, '<ul class="list-[circle] pl-8 my-3 space-y-2">');
    processed = processed.replace(/\\end\{itemchoice\}/g, '</ul>');
    
    processed = processed.replace(/\\itemch/g, '<li class="mb-1">');
    processed = processed.replace(/\\item/g, '<li class="mb-1">');

    // 4. Handle Text Formatting
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

    // 5. Handle Spacing
    processed = processed.replace(/\\hspace\*?\{[^}]*\}/g, '');
    processed = processed.replace(/\\vspace\*?\{[^}]*\}/g, '');
    processed = processed.replace(/\\noindent/g, '');
    processed = processed.replace(/\\medskip/g, '');
    processed = processed.replace(/\\strut/g, '');

    // 6. Handle Multicols & Center
    processed = processed.replace(/\\begin\{multicols\}\{[0-9]+\}/g, '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">');
    processed = processed.replace(/\\end\{multicols\}/g, '</div>');
    processed = processed.replace(/\\begin\{center\}/g, '<div class="text-center w-full flex justify-center flex-col items-center">');
    processed = processed.replace(/\\end\{center\}/g, '</div>');

    // 7. Handle inline note environment
    processed = processed.replace(/\\begin\{note\}/g, '<div class="box-theory note p-4 my-4 rounded-lg border-l-4 border-yellow-500 bg-yellow-50"><div class="font-bold text-sm text-yellow-700 mb-1 uppercase tracking-wider">Chú ý / Nhận xét</div><div class="latex-container text-slate-800 font-medium">');
    processed = processed.replace(/\\end\{note\}/g, '</div></div>');

    // 8. Handle Question IDs like %[9H4H1-1] (nếu còn sót)
    processed = processed.replace(/%\[[\w-]+\]/g, '');

    // 9. Convert text-mode \\ to <br>
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

            // Check \\ outside math
            if (checkStart(i, '\\\\')) {
                let jump = 1;
                let addHtml = '<br>';
                if (processed[i+2] === '[') {
                    let endBracket = processed.indexOf(']', i+2);
                    if (endBracket !== -1 && endBracket - (i+2) < 15) {
                        jump = endBracket - i;
                        addHtml = '<br><br>'; 
                    }
                }
                processedText += addHtml;
                i += jump;
                continue;
            }
            processedText += processed[i];
        } else {
            // inside math
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
    processed = processedText;

    return processed.trim();
}

function parseTheory(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const blocks = [];
    const regex = /\\begin\{(boxdn|boxdl|note|vidu)\}([\s\S]*?)\\end\{\1\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        let type = match[1];
        let rawContent = match[2].trim();
        
        if (type === 'vidu') {
            const { content, solution } = extractLoigiai(rawContent);
            blocks.push({ type, content: postProcess(content), solution: postProcess(solution) });
        } else {
            blocks.push({ type, content: postProcess(rawContent) });
        }
    }
    return blocks;
}

function parseEssay(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const questions = [];
    const regex = /\\begin\{bt\}([\s\S]*?)\\end\{bt\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const { content, solution } = extractLoigiai(match[1].trim());
        questions.push({ type: 'tuluan', content: postProcess(content), solution: postProcess(solution) });
    }
    return questions;
}

function parseMCQ(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const modules = [];
    
    // Tách theo \subsubsection để phân loại trắc nghiệm
    const sections = text.split(/\\subsubsection\{([\s\S]*?)\}/);
    let currentSectionTitle = "";
    
    for (let s = 0; s < sections.length; s++) {
        if (s % 2 === 1) {
            currentSectionTitle = sections[s].trim();
            continue;
        }
        
        let sectionText = sections[s];
        const parts = sectionText.split(/\\begin\{dang\}/);
        for (let i = 1; i < parts.length; i++) { 
            const part = parts[i];
            const endDangIndex = part.indexOf('\\end{dang}');
            if (endDangIndex === -1) continue;

            let dangTitle = part.substring(0, endDangIndex).trim();
            if (dangTitle.startsWith('{')) dangTitle = dangTitle.substring(1);
            const titleEndBrace = dangTitle.lastIndexOf('}');
            if (titleEndBrace !== -1) dangTitle = dangTitle.substring(0, titleEndBrace);
            
            const contentAfterDang = part.substring(endDangIndex + 10);
            const exercises = [];
            const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
            let exMatch;
            while ((exMatch = exRegex.exec(contentAfterDang)) !== null) {
                let exRaw = exMatch[1].trim();
                const { content, solution } = extractLoigiai(exRaw);
                let exContent = content;
                
                // Xử lý loại \choice
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
            
            modules.push({
                sectionTitle: currentSectionTitle,
                title: postProcess(dangTitle.trim()),
                exercises
            });
        }
    }
    return modules;
}

function main() {
    const theoryData = parseTheory(path.join(DIR, 'LT-9K1-11.tex'));
    const essayData = parseEssay(path.join(DIR, 'TL-9K1-11.tex'));
    const mcqData = parseMCQ(path.join(DIR, 'TN-9K1-11.tex'));

    const finalOutput = {
        mapId: "TOAN9-CHUYENDE-11",
        title: "TỈ SỐ LƯỢNG GIÁC CỦA GÓC NHỌN",
        theory: theoryData,
        exercises_TL: essayData,
        exercises_TN_Modules: mcqData
    };

    const outPath = path.join(__dirname, 'output-book.json');
    fs.writeFileSync(outPath, JSON.stringify(finalOutput, null, 2), 'utf8');
    console.log("Xong!");
}

main();
