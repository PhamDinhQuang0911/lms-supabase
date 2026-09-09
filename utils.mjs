/**
 * utils.js - Thư viện dùng chung (Đã tích hợp đầy đủ xử lý Ảnh & TikZ)
 */

/**
 * utils.js - Phiên bản "Strict Timeout"
 */
const getTikzApiUrl = () => {
    const mode = localStorage.getItem('tikzVpsMode') || 'personal';
    const customUrl = localStorage.getItem('tikzVpsUrl') || 'http://42.96.4.216:3000';
    
    if (mode === 'personal' && customUrl) {
        // Xóa dấu / ở cuối nếu có để chuẩn hóa URL
        const baseUrl = customUrl.replace(/\/+$/, '');
        // Nếu người dùng đã gõ sẵn /compile thì không nối thêm
        if (baseUrl.endsWith('/compile')) return baseUrl;
        return `${baseUrl}/compile`;
    }
    return "https://compile.qmath.io.vn/compile"; // Free tier
};

export const compileTikZToImage = async (tikzCode) => {
    // THỜI GIAN TỐI ĐA CHO PHÉP: 60 Giây
    // Nếu VPS làm xong mà Cloudflare không trả về trong 60s -> CẮT
    const TIMEOUT_MS = 60000;

    const controller = new AbortController();
    
    // 1. Lệnh ngắt kết nối (Bom hẹn giờ)
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            controller.abort(); // Ngắt kết nối vật lý
            reject(new Error("TIMEOUT_FORCE")); // Báo lỗi logic
        }, TIMEOUT_MS);
    });

    // 2. Lệnh gửi đi thực tế
    const requestPromise = async () => {
        try {
            const apiUrl = getTikzApiUrl();
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: tikzCode }),
                signal: controller.signal
            });

            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            
            const text = await response.text();
            if (!text || text.trim() === "") throw new Error("Empty Response");

            return JSON.parse(text).url;
        } catch (err) {
            throw err;
        }
    };

    // 3. Cuộc đua: Ai xong trước thì lấy kết quả người đó
    return Promise.race([requestPromise(), timeoutPromise]);
};

// --- HÀM MỚI: BIÊN DỊCH BATCH (Nhiều hình 1 lúc) ---
export const compileTikZBatch = async (codesArray) => {
    const TIMEOUT_MS = 60000;
    const controller = new AbortController();
    
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            controller.abort();
            reject(new Error("TIMEOUT_FORCE"));
        }, TIMEOUT_MS);
    });

    const requestPromise = async () => {
        try {
            const baseUrl = getTikzApiUrl().replace(/\/compile$/, '');
            const apiUrl = `${baseUrl}/compile-batch`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codes: codesArray }),
                signal: controller.signal
            });

            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            
            const text = await response.text();
            if (!text || text.trim() === "") throw new Error("Empty Response");

            return JSON.parse(text).urls;
        } catch (err) {
            throw err;
        }
    };

    return Promise.race([requestPromise(), timeoutPromise]);
};

// --- HÀM BIÊN DỊCH BẰNG TIKZJAX (SỬ DỤNG IFRAME CÁCH LY ĐỂ TRÁNH XUNG ĐỘT MATHJAX) ---
let _tikzIframe = null;
let _tikzQueue = [];
let _tikzReady = false;
let _tikzIframeInitStarted = false;

const initTikzIframe = () => {
    if (_tikzIframeInitStarted) return;
    _tikzIframeInitStarted = true;

    _tikzIframe = document.createElement('iframe');
    _tikzIframe.style.display = 'none';
    document.body.appendChild(_tikzIframe);

    const doc = _tikzIframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <script>
                window.addEventListener('message', function(event) {
                    if (event.data && event.data.type === 'render-tikz') {
                        const id = event.data.id;
                        const code = event.data.code;
                        
                        const container = document.createElement('div');
                        container.id = 'container-' + id;
                        document.body.appendChild(container);
                        
                        const script = document.createElement('script');
                        script.type = 'text/tikz';
                        script.textContent = code;
                        
                        const observer = new MutationObserver(function(mutations) {
                            for (let i = 0; i < mutations.length; i++) {
                                if (mutations[i].addedNodes.length > 0) {
                                    const svg = container.querySelector('svg');
                                    if (svg) {
                                        observer.disconnect();
                                        const serializer = new XMLSerializer();
                                        let svgString = serializer.serializeToString(svg);
                                        if (!svgString.match(/^<svg[^>]+xmlns="http:\\/\\/www\\.w3\\.org\\/2000\\/svg"/)) {
                                            svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
                                        }
                                        window.parent.postMessage({ type: 'tikz-result', id: id, svg: svgString }, '*');
                                        container.remove();
                                        return;
                                    }
                                }
                            }
                        });
                        
                        observer.observe(container, { childList: true, subtree: true });
                        container.appendChild(script);
                        
                        if (window.tikzjax && typeof window.tikzjax.process === 'function') {
                            window.tikzjax.process();
                        }
                    }
                });
                window.addEventListener('load', function() {
                    window.parent.postMessage({ type: 'tikz-iframe-ready' }, '*');
                });
            <\/script>
            <script src="https://tikzjax.com/v1/tikzjax.js"><\/script>
        </head>
        <body></body>
        </html>
    `);
    doc.close();

    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'tikz-iframe-ready') {
            _tikzReady = true;
        } else if (event.data && event.data.type === 'tikz-result') {
            const id = event.data.id;
            const item = _tikzQueue.find(i => i.id === id);
            if (item) {
                clearTimeout(item.timeoutHandle);
                item.resolve(event.data.svg);
                _tikzQueue = _tikzQueue.filter(i => i.id !== id);
            }
        }
    });
};

export const compileTikzLocalViaTikzJax = async (code) => {
    initTikzIframe();
    
    let tries = 0;
    while (!_tikzReady && tries < 60) {
        await new Promise(r => setTimeout(r, 500));
        tries++;
    }

    return new Promise((resolve, reject) => {
        if (!_tikzReady) return reject(new Error("TikzJax iframe timeout"));

        const id = Date.now().toString() + Math.random().toString().slice(2);
        
        const timeoutHandle = setTimeout(() => {
            _tikzQueue = _tikzQueue.filter(i => i.id !== id);
            reject(new Error("TikzJax timeout sau 20s"));
        }, 20000);

        _tikzQueue.push({
            id,
            resolve: (svgString) => {
                try {
                    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
                    resolve(`data:image/svg+xml;base64,${svgBase64}`);
                } catch(e) {
                    const blob = new Blob([svgString], { type: 'image/svg+xml' });
                    resolve(URL.createObjectURL(blob));
                }
            },
            timeoutHandle
        });

        _tikzIframe.contentWindow.postMessage({ type: 'render-tikz', id: id, code: code }, '*');
    });
};

// --- CÁC HÀM EXPORT HỖ TRỢ ---

export function cleanTikzCode(code) {
    let cleaned = code.replace(/\\resizebox\{[^}]+\}\{[^}]+\}\{\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, "$1");
    return cleaned.replace(/\\begin\{center\}/g, "").replace(/\\end\{center\}/g, "");
}

export function extractNextBrace(text) {
    if (!text) return null;
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 1, end = -1;
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        if (depth === 0) { end = i; break; }
    }
    if (end === -1) return null;
    return { content: text.substring(start + 1, end), remaining: text.substring(end + 1), fullMatch: text.substring(start, end + 1) };
}

// --- CÁC HÀM XỬ LÝ NỘI BỘ ---

/**
 * Thay thế lệnh custom VN như \heva{} và \hoac{} bằng LaTeX chuẩn
 * Xử lý đúng cả khi có ngoặc {} lồng nhau
 */
function replaceCustomMathCmd(text, cmd, leftDelim, rightDelim) {
    let result = '';
    let remaining = String(text || '');
    const search = '\\' + cmd;
    while (true) {
        const idx = remaining.indexOf(search);
        if (idx === -1) { result += remaining; break; }
        result += remaining.substring(0, idx);
        remaining = remaining.substring(idx + search.length).replace(/^\s*/, '');
        if (!remaining.startsWith('{')) { result += search; continue; }
        let depth = 1, i = 1;
        while (i < remaining.length && depth > 0) {
            if (remaining[i] === '{') depth++;
            else if (remaining[i] === '}') depth--;
            i++;
        }
        const content = remaining.substring(1, i - 1);
        remaining = remaining.substring(i);
        result += `${leftDelim}\\begin{aligned}${content}\\end{aligned}${rightDelim}`;
    }
    return result;
}

function processNestedTikz(text) {
    if (!text) return "";

    // 1. Bảo vệ các <script type="text/tikz"> đã nhúng sẵn (tránh double-wrap)
    const protectedBlocks = [];
    let textToProcess = text.replace(/<script\s+type="text\/tikz"[^>]*>[\s\S]*?<\/script>/gi, (match) => {
        const idx = protectedBlocks.length;
        protectedBlocks.push(match);
        return `%%TIKZ_PROTECTED_${idx}%%`;
    });

    // 2. Xử lý \begin{tikzpicture}...\end{tikzpicture} còn lại (chưa được nhúng)
    let result = "", remaining = String(textToProcess);
    while (true) {
        const startIdx = remaining.indexOf("\\begin{tikzpicture}");
        if (startIdx === -1) { result += remaining; break; }
        
        result += remaining.substring(0, startIdx);
        remaining = remaining.substring(startIdx);
        
        const openTag = "\\begin{tikzpicture}"; 
        const closeTag = "\\end{tikzpicture}";
        let depth = 1, endIdx = -1, searchPos = openTag.length;

        while (depth > 0) {
            const nextOpen = remaining.indexOf(openTag, searchPos);
            const nextClose = remaining.indexOf(closeTag, searchPos);
            if (nextClose === -1) { endIdx = remaining.length; depth = 0; break; }
            if (nextOpen !== -1 && nextOpen < nextClose) { depth++; searchPos = nextOpen + openTag.length; } 
            else { depth--; searchPos = nextClose + closeTag.length; if (depth === 0) endIdx = searchPos; }
        }
        
        let rawTikz = remaining.substring(0, endIdx);
        let finalTikz = cleanTikzCode(rawTikz);
        if (!finalTikz.includes("\\usetikzlibrary")) finalTikz = "\\usetikzlibrary{calc,arrows.meta}\n" + finalTikz;
        result += `<div class="flex justify-center my-4 overflow-x-auto"><script type="text/tikz">${finalTikz}<\/script></div>`;
        remaining = remaining.substring(endIdx);
    }

    // 3. Khôi phục các block đã bảo vệ
    protectedBlocks.forEach((block, idx) => {
        result = result.replace(`%%TIKZ_PROTECTED_${idx}%%`, block);
    });

    return result;
}


function processTabular(text) {
    if (!text) return "";
    let processed = text.replace(/\\begin\{table\}(?:\[.*?\])?[\s\S]*?\\end\{table\}/g, (match) => {
        // Giữ nội dung tabular, bỏ caption, renewcommand, centering
        return match
            .replace(/\\begin\{table\}(?:\[.*?\])?/g, '')
            .replace(/\\end\{table\}/g, '')
            .replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
            .replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, '')
            .replace(/\\centering/g, '');
    });
    // Cũng cleanup ngoài table environment
    processed = processed.replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');
    processed = processed.replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, '');
    const regex = /\\begin\{tabular\}(\{|\[).*?(\}|\])([\s\S]*?)\\end\{tabular\}/g;
    return processed.replace(regex, (match, open, close, body) => {
        const rows = body.split('\\\\').filter(r => r.trim().length > 0);
        let html = '<div class="my-3 w-full js-scale-wrapper" style="position: relative; width: 100%;">';
        html += '<table class="js-scale-table border-collapse border border-gray-300 bg-white text-sm origin-top-left" style="min-width: max-content;">';
        rows.forEach((row, rIdx) => {
            let cleanRow = row.replace(/\\hline/g, '').trim();
            if(cleanRow.length === 0) return;
            const cols = cleanRow.split('&');
            html += `<tr class="${rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">`;
            cols.forEach(col => { html += `<td class="border border-gray-300 px-3 py-2">${col.trim()}</td>`; });
            html += '</tr>';
        });
        html += '</table></div>';
        return html;
    });
}

function processLatexLists(text) {
    if (!text) return "";
    let processed = text;
    const parseItems = (bodyStr) => {
        const rawItems = bodyStr.split(/\\item(?![a-zA-Z])/).filter(s => s.trim().length > 0);
        return rawItems.map((item) => {
            let content = item.trim();
            let label = '';
            if (content.startsWith('[')) {
                const cb = content.indexOf(']');
                if (cb > -1) {
                    label = content.substring(1, cb).trim();
                    content = content.substring(cb + 1).trim();
                }
            }
            content = processTabular(content);
            return { label, content };
        });
    };

    processed = processed.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/gi, (match, body) => {
        const items = body.split('\\itemch').filter(s => s.trim().length > 0);
        const htmlItems = items.map(item => `<li class="flex items-start gap-2 mb-1"><span class="text-blue-600 font-bold shrink-0">•</span><div class="leading-relaxed">${item.trim()}</div></li>`).join('');
        return `<ul class="my-3 pl-2 list-none">${htmlItems}</ul>`;
    });

    const regexCols = /\\begin\{\s*(?:listEX|enumEX)\s*\}([\s\S]*?)\\end\{\s*(?:listEX|enumEX)\s*\}/gi;
    processed = processed.replace(regexCols, (match, bodyWithHeader) => {
        let cols = 1;
        const firstItemIdx = bodyWithHeader.indexOf('\\item');
        const headerText = firstItemIdx !== -1 ? bodyWithHeader.substring(0, firstItemIdx) : bodyWithHeader;

        // Trích xuất số cột từ header: tìm số trong {}, [], (), <> hoặc số đứng độc lập ở header
        const numMatches = [...headerText.matchAll(/[\{\[\(<](\d+)[\}\]\)>]/g)];
        if (numMatches.length > 0) {
            cols = parseInt(numMatches[numMatches.length - 1][1]) || 1;
        } else {
            const standaloneMatch = headerText.match(/\b(\d+)\b/);
            if (standaloneMatch) {
                cols = parseInt(standaloneMatch[1]) || 1;
            }
        }

        let body = bodyWithHeader;
        if (firstItemIdx !== -1) {
            body = body.substring(firstItemIdx);
        }

        const items = parseItems(body);
        
        let listStyle = "list-decimal";
        if (headerText.includes("a") || headerText.includes("a)") || headerText.includes("a.")) listStyle = "list-[lower-alpha]";
        else if (headerText.includes("A") || headerText.includes("A)") || headerText.includes("A.")) listStyle = "list-[upper-alpha]";
        else if (headerText.includes("i") || headerText.includes("i)") || headerText.includes("i.")) listStyle = "list-[lower-roman]";
        else if (headerText.includes("I") || headerText.includes("I)") || headerText.includes("I.")) listStyle = "list-[upper-roman]";
        else if (/enumEX/i.test(match)) listStyle = "list-[lower-alpha]";

        let colClass = "";
        if (cols === 2) colClass = "columns-1 sm:columns-2 gap-8";
        else if (cols === 3) colClass = "columns-1 sm:columns-3 gap-8";
        else if (cols === 4) colClass = "columns-2 sm:columns-4 gap-8";
        else if (cols > 4) colClass = `columns-1 sm:columns-${cols} gap-8`;

        let html = `<ol class="${listStyle} pl-8 my-3 space-y-2 ${colClass}">`;
        items.forEach((it) => {
            html += `<li class="pl-1 ${colClass ? 'break-inside-avoid' : ''}">${it.label ? `<span class="font-bold mr-1">${it.label}</span>` : ''}${it.content}</li>`;
        });
        html += `</ol>`;
        return html;
    });

    processed = processed.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/gi, (match, body) => {
        const items = parseItems(body);
        let html = `<ol class="list-decimal pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += `<li class="pl-1">${it.content}</li>`; });
        html += `</ol>`;
        return html;
    });

    processed = processed.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/gi, (match, body) => {
        const items = parseItems(body);
        let html = `<ul class="list-disc pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += `<li class="pl-1">${it.content}</li>`; });
        html += `</ul>`;
        return html;
    });
    return processed;
}

// --- CÁC HÀM EXPORT CHO BÊN NGOÀI ---

export const convertArrayToMatrix = (content) => {
  if (!content) return "";
  let processed = content.replace(/\\begin\{array\}\s*\{[^{}]*?\}/g, '\\begin{matrix}');
  processed = processed.replace(/\\begin\{array\}/g, '\\begin{matrix}');
  processed = processed.replace(/\\end\{array\}/g, '\\end{matrix}');
  return processed;
};

export const autoScaleTables = () => {
    document.querySelectorAll('.js-scale-wrapper').forEach(wrap => {
        const table = wrap.querySelector('table');
        if (!table) return;
        table.style.transform = 'none'; table.style.width = 'auto'; wrap.style.height = 'auto';
        if (table.scrollWidth > wrap.offsetWidth) {
            const scale = wrap.offsetWidth / table.scrollWidth;
            table.style.transform = `scale(${scale})`;
            wrap.style.height = `${table.scrollHeight * scale}px`;
            wrap.style.overflow = 'hidden'; 
        }
    });
};

/**
 * HÀM FORMAT CONTENT (FIX: EQNARRAY, <x, PLACEHOLDERS, ENUMEX)
 */
export const formatContent = (text) => {
    if (text === null || text === undefined) return "";
    let processed = text;

    // 0. Pre-process lệnh toán học custom của VN (phải làm TRƯỚC khi split)
    processed = replaceCustomMathCmd(processed, 'heva', '\\left\\{', '\\right.');
    processed = replaceCustomMathCmd(processed, 'hoac', '\\left[', '\\right.');
    processed = replaceCustomMathCmd(processed, 'heva*', '\\left\\{', '\\right.');
    processed = replaceCustomMathCmd(processed, 'hoac*', '\\left[', '\\right.');
    // Cleanup metadata LaTeX bảng (caption, arraystretch)
    processed = processed.replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');
    processed = processed.replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, '');
    processed = processed.replace(/\\renewcommand\\arraystretch\s*\{[^}]+\}/g, '');

    // 1. Clean Text
    processed = processed.replace(/\\centering/g, "");
    processed = processed.replace(/\\%/g, "%");
    processed = processed.replace(/\\textbf\{([^}]+)\}/g, '<b class="font-bold">$1</b>');
    processed = processed.replace(/\\textit\{([^}]+)\}/g, '<i class="italic">$1</i>');
    processed = processed.replace(/\\hfill/g, '<span style="display:inline-block; width: 2rem;"></span>');
    processed = processed.replace(/\\allowdisplaybreaks(\[.*?\])?/g, "");
    processed = processed.replace(/\\lq\\lq/g, '"').replace(/\\rq\\rq/g, '"').replace(/\\lq/g, '"').replace(/\\rq/g, '"');
    processed = processed.replace(/\\wideparen\{([^}]+)\}/g, '\\overset{\\frown}{$1}');
    processed = processed.replace(/\\(h|v)space\*?\{[^}]+\}/g, '').replace(/\\(no)?indent/g, '');

    // 2. Structure
    processed = convertArrayToMatrix(processed);
    processed = processNestedTikz(processed); 
    processed = processTabular(processed);    
    processed = processLatexLists(processed); 

    // 3. Placeholder & Clean Rác
    processed = processed.replace(/<div[^>]*class="[^"]*image-placeholder[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
    processed = processed.replace(/<div[^>]*class="[^"]*group relative[^"]*"[^>]*>(?!<img)([\s\S]*?)<\/div>/gi, ''); 
    processed = processed.replace(/Click đúp để tải file|hoặc Ctrl \+ V để dán ảnh|ẢNH TỪ IMMINI|VỊ TRÍ HÌNH TIKZ/gi, '');
    processed = processed.replace(/^\s*\}\s*$/gm, '').replace(/\}\s*$/g, '').replace(/Ảnh minh họa \(immini\)/g, '').replace(/Ảnh canh giữa/g, '');

    // 4. Regex Bảo Vệ MathJax & HTML (Loại trừ enumEX, listEX, enumerate, itemize khỏi MathJax block detection)
    const tagWhitelist = "script|style|div|span|p|br|img|table|tbody|thead|tr|td|th|ul|ol|li|b|i|u|strong|em|mark|label|input|button|a|h1|h2|h3|h4";
    const regex = new RegExp(`(\\\\begin\\{(?!(?:enumEX|listEX|enumerate|itemize|itemchoice)\\b)[a-zA-Z*]+\\}[\\s\\S]*?\\\\end\\{[a-zA-Z*]+\\}|\\$\\$[\\s\\S]*?\\$\\$|\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\([\\s\\S]*?\\\\\\)|(?:\\$[\\s\\S]*?\\$)|<\\/?(?:${tagWhitelist})[^>]*>)`, 'gi');
    
    const parts = processed.split(regex);
    
    return parts.map(part => {
        const trimmed = part.trim();
        const isMath = trimmed.startsWith('$') || trimmed.startsWith('\\(') || trimmed.startsWith('\\[') || (trimmed.startsWith('\\begin') && !trimmed.startsWith('\\begin{div') && !trimmed.startsWith('\\begin{grid'));
        const isTag = part.startsWith('<') && part.endsWith('>');

        if (isMath) {
            return part.replace(/</g, ' < '); // Fix lỗi <x
        } else if (isTag) {
            return part; // Giữ nguyên tag HTML
        } else {
            let cleanPart = part.replace(/</g, '&lt;'); // Mã hóa text thường
            cleanPart = cleanPart.replace(/\}/g, '');
            return cleanPart.replace(/\\\\/g, '<br>').replace(/\n/g, '<br>');
        }
    }).join('');
};

// ============================================================================
// 5. CÁC HÀM BỔ SUNG CHO EXAM (RENDER TIKZ, XỬ LÝ ẢNH, WATERMARK)
// ============================================================================

export const renderTikz = () => {
    const scripts = document.querySelectorAll('script[type="text/tikz"]');
    if (scripts.length === 0) return;
    
    scripts.forEach(script => {
        const code = script.textContent;
        const container = script.parentElement;
        
        // Tạo placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'flex justify-center my-4';
        placeholder.innerHTML = '<span class="text-blue-500 italic"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang vẽ hình TikZ...</span>';
        
        // Thay thế script bằng placeholder
        script.parentNode.replaceChild(placeholder, script);
        
        // Biên dịch ngầm bằng iframe
        compileTikzLocalViaTikzJax(code)
            .then(url => {
                placeholder.innerHTML = `<img src="${url}" class="rounded-lg shadow-sm" style="max-height:350px;" loading="lazy">`;
            })
            .catch(err => {
                placeholder.innerHTML = `<span class="text-red-500 italic">Lỗi vẽ hình: ${err.message}</span>`;
            });
    });
};

export const compressImage = (file, quality = 0.7, maxWidth = 1000) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

export const watermarkImage = (file, text) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;

                // Vẽ ảnh gốc
                ctx.drawImage(img, 0, 0);

                // Cấu hình đóng dấu (Góc trên phải, màu đỏ nổi bật)
                const fontSize = Math.max(20, Math.floor(img.width / 25));
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = "right";
                ctx.textBaseline = "top";
                
                const textWidth = ctx.measureText(text).width;
                // Nền trắng mờ
                ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
                ctx.fillRect(canvas.width - textWidth - 20, 10, textWidth + 10, fontSize + 10);

                // Chữ đỏ
                ctx.fillStyle = "red";
                ctx.fillText(text, canvas.width - 15, 15);

                canvas.toBlob((blob) => {
                    const newFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(newFile);
                }, 'image/jpeg', 0.8);
            };
            img.onerror = (err) => reject(err);
        };
    });
};
