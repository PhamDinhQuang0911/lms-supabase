// topic-parser.js - Parser cấu trúc LaTeX cho Kho Chuyên Đề
import { compileTikZToImage, cleanTikzCode } from './utils.js';

// Cloudflare Upload Endpoint (Từ exam-editor.html)
const CLOUDFLARE_UPLOAD_API = "https://upload-helper.phamngockhanh-942001.workers.dev/";

/**
 * Upload một file ảnh lên Cloudflare
 */
async function uploadImageToCloudflare(fileOrBlob, fileName) {
    const formData = new FormData();
    formData.append('file', fileOrBlob, fileName);
    const response = await fetch(CLOUDFLARE_UPLOAD_API, {
        method: 'PUT',
        body: formData
    });
    if (!response.ok) throw new Error("Upload failed");
    const data = await response.json();
    return data.url; // Trả về link ảnh
}

/**
 * Hàm phân tích file LaTeX gốc thành Cây Cấu trúc
 */
export async function parseTopicFromTex(texFiles, imgFiles, updateProgressCallback, options = {}) {
    const optSection = options.section || 'Bài';
    const optSubsection = options.subsection || 'Mục';
    const optSubsubsection = options.subsubsection || 'Phần';

    updateProgressCallback("Đang ghép nối nội dung...", 5);
    
    // Ghép tất cả các file .tex lại với nhau
    let fullContent = "";
    for(const f of texFiles) {
        let text = await f.text();
        if (f.name.toLowerCase().includes('main')) {
            const docMatch = text.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
            fullContent += (docMatch ? docMatch[1] : text) + "\n";
        } else {
            fullContent += `\\section{${f.name.replace('.tex', '')}}\n` + text + "\n";
        }
    }

    // Nối các file \input{...}
    updateProgressCallback("Đang nối các file input...", 10);
    const inputRegex = /\\input\{([^}]+)\}/g;
    let match;
    while ((match = inputRegex.exec(fullContent)) !== null) {
        let inputName = match[1];
        if (!inputName.endsWith('.tex')) inputName += '.tex';
        const baseName = inputName.split('/').pop();
        const subFile = texFiles.find(f => f.name === baseName);
        if (subFile) {
            const subContent = await subFile.text();
            fullContent = fullContent.replace(match[0], subContent);
        }
    }

    updateProgressCallback("Đang bóc tách cấu trúc...", 20);

    let topicData = { title: "Chưa đặt tên", chapters: [] };
    let currentChapter = null;
    let currentSection = null;
    let currentDang = null;

    function extractBraceContent(str, startIndex) {
        let count = 0;
        let start = -1;
        for (let i = startIndex; i < str.length; i++) {
            if (str[i] === '{') {
                if (count === 0) start = i + 1;
                count++;
            } else if (str[i] === '}') {
                count--;
                if (count === 0 && start !== -1) return { content: str.substring(start, i), endIdx: i };
            }
        }
        return { content: "", endIdx: startIndex };
    }

    function ensureChapter() {
        if (!currentChapter) {
            currentChapter = { title: "Chương Mặc định", sections: [] };
            topicData.chapters.push(currentChapter);
        }
    }
    function ensureSection() {
        ensureChapter();
        if (!currentSection) {
            currentSection = { title: `${optSection} Mặc định`, dangs: [] };
            currentChapter.sections.push(currentSection);
        }
    }
    function ensureDang() {
        ensureSection();
        if (!currentDang) {
            currentDang = { title: `${optSubsection} Mặc định`, items: [] };
            currentSection.dangs.push(currentDang);
        }
    }

    const tokenRegex = /\\(chapter|section|subsection|subsubsection)\{([^}]+)\}|\\begin\{(dang|ex|bt|vidu|dn|dl|note|luuy|boxdn|boxdl)\}([\s\S]*?)\\end\{\3\}/g;
    
    let pointer = 0;
    let tokenMatch;

    while ((tokenMatch = tokenRegex.exec(fullContent)) !== null) {
        const textBefore = fullContent.substring(pointer, tokenMatch.index).trim();
        if (textBefore.length > 20) {
            ensureDang();
            currentDang.items.push({ type: 'theory', content: textBefore });
        }
        pointer = tokenRegex.lastIndex;

        const cmd = tokenMatch[1]; 
        const cmdTitle = tokenMatch[2];
        const env = tokenMatch[3]; 
        const envBody = tokenMatch[4];

        if (cmd === 'chapter') {
            currentChapter = { title: cmdTitle, sections: [] };
            topicData.chapters.push(currentChapter);
            currentSection = null;
            currentDang = null;
        } 
        else if (cmd === 'section') {
            ensureChapter();
            currentSection = { title: cmdTitle, dangs: [] };
            currentChapter.sections.push(currentSection);
            currentDang = null;
        } 
        else if (cmd === 'subsection') {
            ensureSection();
            currentDang = { title: cmdTitle, items: [] };
            currentSection.dangs.push(currentDang);
        }
        else if (cmd === 'subsubsection') {
            ensureDang();
            currentDang.items.push({ type: 'subsubsection', content: `${optSubsubsection}: ${cmdTitle}` });
        }
        else if (env) {
            ensureDang();
            
            if (env === 'dang') {
                let dangTitle = `${optSubsection} Mặc định`;
                let body = envBody;
                if (envBody.trim().startsWith('{')) {
                    const b = extractBraceContent(envBody, envBody.indexOf('{'));
                    dangTitle = b.content;
                    body = envBody.substring(b.endIdx + 1);
                }
                currentDang = { title: dangTitle, items: [] };
                currentSection.dangs.push(currentDang);
                
                const innerRegex = /\\(subsubsection)\{([^}]+)\}|\\begin\{(ex|bt|vidu|dn|dl|note|luuy|boxdn|boxdl)\}([\s\S]*?)\\end\{\3\}/g;
                let innerMatch;
                let innerPointer = 0;
                while((innerMatch = innerRegex.exec(body)) !== null) {
                    const theoryBefore = body.substring(innerPointer, innerMatch.index).trim();
                    if(theoryBefore.length > 20) currentDang.items.push({ type: 'theory', content: theoryBefore });
                    innerPointer = innerRegex.lastIndex;

                    const iCmd = innerMatch[1];
                    const iCmdTitle = innerMatch[2];
                    const iEnv = innerMatch[3];
                    const iEnvBody = innerMatch[4];

                    if (iCmd === 'subsubsection') {
                        currentDang.items.push({ type: 'subsubsection', content: `${optSubsubsection}: ${iCmdTitle}` });
                    } else if (iEnv) {
                        if (['ex', 'bt'].includes(iEnv)) {
                            let qType = iEnv === 'ex' ? 'multiple_choice' : 'essay';
                            currentDang.items.push(parseQuestionBlock(iEnvBody, qType));
                        } else if (iEnv === 'vidu') {
                            currentDang.items.push(parseQuestionBlock(iEnvBody, 'essay'));
                        } else {
                            currentDang.items.push({ type: 'theory', content: `\\begin{${iEnv}}${iEnvBody}\\end{${iEnv}}` });
                        }
                    }
                }
                const theoryAfter = body.substring(innerPointer).trim();
                if(theoryAfter.length > 20) currentDang.items.push({ type: 'theory', content: theoryAfter });

            } 
            else if (['ex', 'bt'].includes(env)) {
                let qType = env === 'ex' ? 'multiple_choice' : 'essay';
                currentDang.items.push(parseQuestionBlock(envBody, qType));
            } 
            else if (env === 'vidu') {
                currentDang.items.push(parseQuestionBlock(envBody, 'essay'));
            }
            else {
                currentDang.items.push({ type: 'theory', content: `\\begin{${env}}${envBody}\\end{${env}}` });
            }
        }
    }

    // --- HÀM BĂM MÃ (HASH) ĐỂ CACHING ---
    async function hashString(str) {
        const msgBuffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Lấy Cache từ LocalStorage
    const tikzCache = JSON.parse(localStorage.getItem('tikzCache') || '{}');

    // 4. Thu thập ảnh cần xử lý (TikZ và includegraphics)
    updateProgressCallback("Đang trích xuất hình ảnh...", 40);
    
    let imageTasks = [];
    let imgCounter = 0;

    const collectImages = (str) => {
        let resultStr = str;

        const parseImmini = (text) => {
            let result = text;
            let pointer = 0;
            while(true) {
                const idx = result.indexOf('\\immini', pointer);
                if (idx === -1) break;
                let before = result.substring(0, idx);
                let remainder = result.substring(idx + 7).trim();
                if (remainder.startsWith('[')) { 
                    const cb = remainder.indexOf(']'); 
                    if (cb > -1) remainder = remainder.substring(cb + 1).trim(); 
                }
                const firstBraceIdx = remainder.indexOf('{');
                if (firstBraceIdx === -1) { pointer = idx + 7; continue; }
                
                const arg1 = extractBraceContent(remainder, firstBraceIdx);
                if (arg1.endIdx === -1) { pointer = idx + 7; continue; }
                
                let rem2 = remainder.substring(arg1.endIdx + 1);
                const secondBraceIdx = rem2.indexOf('{');
                if (secondBraceIdx === -1) { pointer = idx + 7; continue; }
                
                const arg2 = extractBraceContent(rem2, secondBraceIdx);
                if (arg2.endIdx === -1) { pointer = idx + 7; continue; }
                
                let newContent = arg1.content + '\n\n' + arg2.content;
                result = before + newContent + rem2.substring(arg2.endIdx + 1);
                pointer = before.length + newContent.length;
            }
            return result;
        };
        
        resultStr = parseImmini(resultStr);
        
        // 4.1. TikZ
        // 4.1. TikZ
        const tikzRegex = /\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g;
        resultStr = resultStr.replace(tikzRegex, (match) => {
            // Kiểm tra xem có chứa tkz-euclide không
            if (match.includes('tkz') || match.includes('tkzDefPoint') || match.includes('tkzDraw')) {
                // Chứa tkz -> Bắt buộc dùng VPS
                let marker = `___IMG_MARKER_${imgCounter++}___`;
                imageTasks.push({ id: marker, type: 'tikz_vps', content: match });
                return marker;
            } else {
                // Không chứa tkz -> Dùng thẳng TikZJax
                // TikZJax yêu cầu nằm trong thẻ <script type="text/tikz">
                // Tránh escape bị lỗi khi render HTML
                return `\n<script type="text/tikz">\n${match}\n</script>\n`;
            }
        });

        // 4.2. Includegraphics
        const includeRegex = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
        resultStr = resultStr.replace(includeRegex, (match, fileName) => {
            let marker = `___IMG_MARKER_${imgCounter++}___`;
            const baseName = fileName.split('/').pop();
            const fileObj = imgFiles.find(f => f.name === baseName || f.name.includes(baseName));
            if(fileObj) {
                imageTasks.push({ id: marker, type: 'file', fileObj: fileObj });
            } else {
                console.warn("Không tìm thấy ảnh đính kèm: " + fileName);
            }
            return marker;
        });

        return resultStr;
    };

    // Áp dụng collectImages cho tất cả item
    topicData.chapters.forEach(ch => {
        ch.sections.forEach(sec => {
            sec.dangs.forEach(d => {
                d.items.forEach(item => {
                    if (item.content) item.content = collectImages(item.content);
                    if (item.solution) item.solution = collectImages(item.solution);
                    if (item.options) {
                        item.options = item.options.map(opt => collectImages(opt));
                    }
                });
            });
        });
    });

    // 5. XỬ LÝ ẢNH (Upload Cloudflare & Render TikZ bằng VPS)
    if (imageTasks.length > 0) {
        let doneImages = 0;
        updateProgressCallback(`Đang biên dịch & upload ảnh (0/${imageTasks.length})...`, 50, { showTikZ: true, total: imageTasks.length, done: 0 });

        const MAX_CONCURRENT = 1; // Xử lý tuần tự từng hình 1 để chống sập VPS
        let index = 0;

        const worker = async () => {
            while (index < imageTasks.length) {
                let currentIdx = index++;
                let task = imageTasks[currentIdx];
                let retries = 0;
                let success = false;
                
                while (retries < 3 && !success) {
                    try {
                        let url = "";
                        if (task.type === 'tikz_vps') {
                            const hash = await hashString(task.content);
                            if (tikzCache[hash]) {
                                url = tikzCache[hash];
                            } else {
                                let cleaned = cleanTikzCode(task.content);
                                url = await compileTikZToImage(cleaned);
                                if (url && !url.includes('Image+Error')) {
                                    tikzCache[hash] = url;
                                }
                                // Nghỉ 500ms sau mỗi lần gọi VPS thành công để nó kịp xả RAM
                                await new Promise(r => setTimeout(r, 500));
                            }
                        } else if (task.type === 'file') {
                            let fName = `topic_${Date.now()}_${task.fileObj.name}`;
                            url = await uploadImageToCloudflare(task.fileObj, fName);
                        }
                        task.url = url;
                        success = true;
                    } catch (e) {
                        console.warn(`Lỗi xử lý ảnh (Lần ${retries+1}):`, e.message);
                        retries++;
                        if (retries < 3) await new Promise(r => setTimeout(r, 3000));
                        else task.url = "https://placehold.co/400x200?text=Image+Error";
                    }
                }
                doneImages++;
                updateProgressCallback(`Đang biên dịch & upload ảnh (${doneImages}/${imageTasks.length})...`, 50 + (doneImages/imageTasks.length)*40, { showTikZ: true, total: imageTasks.length, done: doneImages });
            }
        };

        const workers = [];
        for (let i = 0; i < MAX_CONCURRENT; i++) workers.push(worker());
        await Promise.all(workers);
        
        // Lưu cache mới xuống LocalStorage
        localStorage.setItem('tikzCache', JSON.stringify(tikzCache));

        // 6. Gắn URL ảnh vào lại Cây Cấu trúc
        updateProgressCallback("Đang hoàn thiện dữ liệu...", 95);
        const replaceMarkers = (str) => {
            if(!str) return str;
            let s = str;
            imageTasks.forEach(task => {
                if (task.url) {
                    let imgTag = `<div class="flex justify-center my-2"><img src="${task.url}" class="max-w-full h-auto rounded-lg shadow-sm" style="max-height:350px;"></div>`;
                    s = s.split(task.id).join(imgTag);
                }
            });
            return s;
        };

        topicData.chapters.forEach(ch => {
            ch.sections.forEach(sec => {
                sec.dangs.forEach(d => {
                    d.items.forEach(item => {
                        if (item.content) item.content = replaceMarkers(item.content);
                        if (item.solution) item.solution = replaceMarkers(item.solution);
                        if (item.options) {
                            item.options = item.options.map(opt => replaceMarkers(opt));
                        }
                    });
                });
            });
        });
    }

    updateProgressCallback("Hoàn tất!", 100);

    // Làm sạch các mảng rỗng do khởi tạo mặc định
    topicData.chapters = topicData.chapters.filter(ch => ch.sections.length > 0);
    topicData.chapters.forEach(ch => {
        ch.sections = ch.sections.filter(sec => sec.dangs.length > 0);
    });

    return topicData;
}

/**
 * Hàm phụ trợ: Bóc tách một block \begin{ex} hoặc \begin{bt}
 */
function parseQuestionBlock(blockContent, type) {
    let item = { type: type, content: "", solution: "" };
    
    // Tách lời giải
    const lgRegex = /\\loigiai\{([\s\S]*)\}/;
    const lgMatch = lgRegex.exec(blockContent);
    if (lgMatch) {
        item.solution = lgMatch[1].trim();
        blockContent = blockContent.replace(lgMatch[0], '');
    }

    if (type === 'multiple_choice') {
        // Tách các \choice
        const choiceRegex = /\\choice\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}/;
        const choiceMatch = choiceRegex.exec(blockContent);
        if (choiceMatch) {
            item.options = [choiceMatch[1].trim(), choiceMatch[2].trim(), choiceMatch[3].trim(), choiceMatch[4].trim()];
            
            // Xác định đáp án đúng (\True)
            let correctIdx = 0;
            item.options.forEach((opt, idx) => {
                if (opt.includes('\\True')) {
                    correctIdx = idx;
                    item.options[idx] = opt.replace(/\\True\s*/g, '').trim();
                }
            });
            item.correctAnswer = ['A','B','C','D'][correctIdx];
            
            blockContent = blockContent.replace(choiceMatch[0], '');
        } else {
            // Thử bắt theo kiểu từng dòng (fallback)
            item.options = ['A', 'B', 'C', 'D'];
            item.correctAnswer = 'A';
        }
    }

    item.content = blockContent.trim();
    return item;
}
