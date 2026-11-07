const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'file main latex chuyên đề');

// --- CÁC HÀM TIỆN ÍCH ---

// Hàm trích xuất phần \loigiai{} một cách an toàn (cân bằng dấu ngoặc nhọn)
function extractLoigiai(text) {
    const startIndex = text.indexOf('\\loigiai{');
    if (startIndex === -1) return { content: text, solution: '' };

    let braceCount = 0;
    let endIndex = -1;
    let inLoigiai = false;
    
    for (let i = startIndex + 8; i < text.length; i++) {
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
        const solution = text.substring(startIndex + 9, endIndex).trim();
        const content = (text.substring(0, startIndex) + text.substring(endIndex + 1)).trim();
        return { content, solution };
    }
    return { content: text, solution: '' };
}

// --- 1. XỬ LÝ LÝ THUYẾT (LT) ---
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
            blocks.push({ type, content, solution });
        } else {
            blocks.push({ type, content: rawContent });
        }
    }
    return blocks;
}

// --- 2. XỬ LÝ TỰ LUẬN (TL) ---
function parseEssay(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const questions = [];
    const regex = /\\begin\{bt\}([\s\S]*?)\\end\{bt\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const { content, solution } = extractLoigiai(match[1].trim());
        questions.push({ type: 'tuluan', content, solution });
    }
    return questions;
}

// --- 3. XỬ LÝ TRẮC NGHIỆM (TN) ---
function parseMCQ(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    const modules = [];
    
    const parts = text.split(/\\begin\{dang\}/);
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
            let choiceRegex = /\\choice\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/;
            let options = [];
            let correct = -1;
            let exContent = exRaw;
            
            const choiceMatch = choiceRegex.exec(exRaw);
            if (choiceMatch) {
                for (let j = 1; j <= 4; j++) {
                    let optText = choiceMatch[j].trim();
                    if (optText.includes('\\True')) {
                        correct = j - 1;
                        optText = optText.replace('\\True', '').trim();
                    }
                    options.push(optText);
                }
                exContent = exContent.replace(choiceMatch[0], '');
            }
            
            const { content, solution } = extractLoigiai(exContent);
            exercises.push({
                type: 'tracnghiem',
                content: content.trim(),
                options,
                correct,
                solution
            });
        }
        
        modules.push({
            title: dangTitle.trim(),
            exercises
        });
    }
    return modules;
}

// --- THỰC THI GỘP CHUNG ---
function main() {
    console.log("Đang đọc và bóc tách dữ liệu...");
    
    const theoryData = parseTheory(path.join(DIR, 'LT-9K1-11.tex'));
    console.log(`- Lý thuyết: Đã bóc tách ${theoryData.length} block.`);
    
    const essayData = parseEssay(path.join(DIR, 'TL-9K1-11.tex'));
    console.log(`- Tự luận: Đã bóc tách ${essayData.length} bài.`);
    
    const mcqData = parseMCQ(path.join(DIR, 'TN-9K1-11.tex'));
    console.log(`- Trắc nghiệm: Đã bóc tách ${mcqData.length} dạng.`);

    const finalOutput = {
        mapId: "TOAN9-CHUYENDE-11",
        title: "TỈ SỐ LƯỢNG GIÁC CỦA GÓC NHỌN",
        theory: theoryData,
        exercises_TL: essayData,
        exercises_TN_Modules: mcqData
    };

    const outPath = path.join(__dirname, 'output-book.json');
    fs.writeFileSync(outPath, JSON.stringify(finalOutput, null, 2), 'utf8');
    
    console.log(`\n=> THÀNH CÔNG! Đã lưu file kết quả tại: ${outPath}`);
}

main();
