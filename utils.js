/**
 * utils.js - Thư viện dùng chung (Đã tích hợp đầy đủ xử lý Ảnh & TikZ)
 */

/**
 * utils.js - Phiên bản "Strict Timeout"
 */
const safeStorageGet = (key, defaultVal = null) => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const v = window.localStorage.getItem(key);
            return v !== null ? v : defaultVal;
        }
    } catch (_) {}
    return defaultVal;
};

const safeStorageSet = (key, val) => {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, val);
        }
    } catch (_) {}
};

export const getTikzApiUrl = () => {
    // Tự động nâng cấp URL cũ trong máy người dùng lên tên miền HTTPS mới
    if (safeStorageGet('tikzVpsUrl') === 'http://42.96.4.216:3000') {
        safeStorageSet('tikzVpsUrl', 'https://api.qmath.io.vn');
    }

    const mode = safeStorageGet('tikzVpsMode', 'personal');
    // Đổi mặc định sang tên miền HTTPS xịn vừa tạo qua Cloudflare Tunnel
    const customUrl = safeStorageGet('tikzVpsUrl', 'https://api.qmath.io.vn');
    
    if (mode === 'personal' && customUrl) {
        const baseUrl = customUrl.replace(/\/+$/, '');
        
        // Sửa lỗi Mixed Content trên Github Pages
        if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:' && baseUrl.startsWith('http://')) {
            console.warn("Trình duyệt chặn kết nối HTTP từ trang HTTPS (Mixed Content). Tạm thời chuyển sang server Free.");
            if (window.showToast) window.showToast("Trình duyệt chặn HTTP từ trang HTTPS. Tạm thời chuyển sang server Free.", "error");
            return "https://compile.qmath.io.vn/compile"; // Fallback
        }

        if (baseUrl.endsWith('/compile')) return baseUrl;
        return `${baseUrl}/compile`;
    }
    return "https://compile.qmath.io.vn/compile"; // Free tier
};

export const prepareTikzForCompilation = (rawCode) => {
    let cleanCode = String(rawCode || '')
        .replace(/<\/?(?:div|script|span|p)[^>]*>/gi, '')
        .replace(/AMP_PLACEHOLDER/g, '&')
        .replace(/\\widecheck/g, '\\widehat');

    const defaultLibs = "\\usetikzlibrary{calc,arrows.meta,angles,quotes,intersections,patterns,shapes,positioning,decorations.markings,backgrounds}\n";
    const defaultStyles = "\\tikzset{\n" +
        "  circle line/.style={draw},\n" +
        "  construction/.style={draw},\n" +
        "  marked point/.style={circle, fill, inner sep=1.2pt},\n" +
        "  point label/.style={},\n" +
        "  figure label/.style={},\n" +
        "  line/.style={draw},\n" +
        "  point/.style={circle, fill, inner sep=1pt},\n" +
        "  dot/.style={circle, fill, inner sep=1pt}\n" +
        "}\n";

    if (!cleanCode.includes("\\usetikzlibrary")) {
        cleanCode = defaultLibs + cleanCode;
    }
    if (!cleanCode.includes("circle line/.style")) {
        cleanCode = defaultStyles + cleanCode;
    }
    return cleanCode;
};

export const compileTikZToImage = async (tikzCode) => {
    // THỜI GIAN TỐI ĐA CHO PHÉP: 60 Giây
    const TIMEOUT_MS = 60000;

    const controller = new AbortController();
    
    let timeoutId = null;
    // 1. Lệnh ngắt kết nối
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error("TIMEOUT_FORCE"));
        }, TIMEOUT_MS);
    });

    // 2. Lệnh gửi đi thực tế có tự động khắc phục lỗi pgfkeys
    const requestPromise = async () => {
        const apiUrl = getTikzApiUrl();
        let currentCode = prepareTikzForCompilation(tikzCode);
        let attempts = 0;

        while (attempts < 3) {
            attempts++;
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: currentCode }),
                    signal: controller.signal
                });

                if (response.ok) {
                    const text = await response.text();
                    if (!text || text.trim() === "") throw new Error("Empty Response");
                    const data = JSON.parse(text);
                    if (data.url && !data.url.includes("Image+Error")) {
                        return data.url;
                    }
                }

                // Nếu có lỗi, kiểm tra chi tiết lỗi từ server để tự khắc phục
                const errText = await response.text();
                let errJson = null;
                try { errJson = JSON.parse(errText); } catch(e) {}
                const details = errJson?.details || errText;

                // Tự động phát hiện thiếu pgfkeys (ví dụ: circle line, marked point, ...)
                const missingKeys = new Set();
                const regex = /Package pgfkeys Error: I do not know the key '(?:(?:\/tikz\/|\/pgf\/))?([^']+)'/g;
                let m;
                while ((m = regex.exec(details)) !== null) {
                    missingKeys.add(m[1].trim());
                }

                if (missingKeys.size > 0 && attempts < 3) {
                    const defs = Array.from(missingKeys).map(k => {
                        if (/line|construction|edge/i.test(k)) return `  ${k}/.style={draw},`;
                        if (/point|dot/i.test(k)) return `  ${k}/.style={circle, fill, inner sep=1.2pt},`;
                        return `  ${k}/.style={},`;
                    }).join('\n');
                    currentCode = `\\tikzset{\n${defs}\n}\n` + currentCode;
                    continue;
                }

                throw new Error(errJson?.error ? `${errJson.error}: ${details.substring(0, 250)}` : `HTTP Error ${response.status}`);
            } catch (err) {
                if (attempts >= 3 || err.name === 'AbortError') throw err;
            }
        }
        throw new Error("Không thể biên dịch TikZ sau nhiều lần thử");
    };

    // 3. Cuộc đua: Ai xong trước thì lấy kết quả người đó
    try {
        return await Promise.race([requestPromise(), timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

// --- HÀM MỚI: BIÊN DỊCH BATCH (Nhiều hình 1 lúc) ---
export const compileTikZBatch = async (codesArray) => {
    const TIMEOUT_MS = 120000; // Tăng lên 120 giây
    const controller = new AbortController();
    let batchTimeoutId = null;
    
    const timeoutPromise = new Promise((_, reject) => {
        batchTimeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error("TIMEOUT_FORCE"));
        }, TIMEOUT_MS);
    });

    const requestPromise = async () => {
        try {
            const baseUrl = getTikzApiUrl().replace(/\/compile$/, '');
            const apiUrl = `${baseUrl}/compile-batch`;
            
            const preprocessed = codesArray.map(c => prepareTikzForCompilation(c));

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codes: preprocessed }),
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

    try {
        return await Promise.race([requestPromise(), timeoutPromise]);
    } finally {
        if (batchTimeoutId) clearTimeout(batchTimeoutId);
    }
};

// --- QUẢN LÝ CHẾ ĐỘ BIÊN DỊCH TIKZ (LỰA CHỌN 1: VPS - ỔN ĐỊNH | LỰA CHỌN 2: TIKZJAX - TRÌNH DUYỆT | LỰA CHỌN 3: QUICKLATEX) ---

const CLOUDFLARE_R2_UPLOAD_URL = "https://upload-helper.phamngockhanh-942001.workers.dev/";

/**
 * Chuyển chuỗi SVG thành PNG Blob độ phân giải cao (Retina 2.5x) rồi upload lên Cloudflare R2.
 * Lưu ý: R2 bucket không trả về header Content-Type: image/svg+xml cho file .svg khiến thẻ <img> bị vỡ ảnh,
 * do đó khi lưu lên R2 bắt buộc lưu định dạng .png (trình duyệt tự nhận diện magic bytes \x89PNG).
 */
export const uploadSvgStringToR2 = async (svgString, prefix = 'tikz') => {
    if (!svgString || typeof svgString !== 'string') throw new Error("SVG rỗng");
    let finalSvg = svgString.trim();
    if (!finalSvg.match(/^<svg[^>]+xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i)) {
        finalSvg = finalSvg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(finalSvg)}`;
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
        return dataUri;
    }
    try {
        const pngBlob = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const scale = 2.5;
                    const w = Math.max(img.naturalWidth || img.width || 300, 60);
                    const h = Math.max(img.naturalHeight || img.height || 200, 40);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(w * scale);
                    canvas.height = Math.round(h * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.scale(scale, scale);
                    ctx.drawImage(img, 0, 0, w, h);
                    canvas.toBlob((blob) => {
                        if (blob && blob.size > 100) resolve(blob);
                        else reject(new Error("Canvas toBlob rỗng"));
                    }, 'image/png');
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = () => reject(new Error("Không nạp được SVG vào Image"));
            img.src = dataUri;
        });
        const formData = new FormData();
        const fileName = `tikz/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        formData.append('file', pngBlob, fileName);
        const resp = await fetch(CLOUDFLARE_R2_UPLOAD_URL, {
            method: 'PUT',
            body: formData
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.url) return data.url;
        }
    } catch (e) {
        console.warn("[R2 PNG Upload] Dùng Data URI trực tiếp:", e.message);
    }
    return dataUri;
};

/**
 * Lấy chế độ biên dịch TikZ hiện tại ('vps', 'tikzjax', hoặc 'quicklatex'). Mặc định là 'vps'.
 */
export const getTikzRenderMode = () => {
    const mode = safeStorageGet('tikzRenderMode', 'vps') || 'vps';
    return ['vps', 'tikzjax', 'quicklatex'].includes(mode) ? mode : 'vps';
};

/**
 * Đặt chế độ biên dịch TikZ ('vps', 'tikzjax', hoặc 'quicklatex') và lưu vào localStorage.
 */
export const setTikzRenderMode = (mode) => {
    const valid = ['vps', 'tikzjax', 'quicklatex'].includes(mode) ? mode : 'vps';
    safeStorageSet('tikzRenderMode', valid);
    return valid;
};

/**
 * Kiểm tra xem mã TikZ có đủ điều kiện render bằng TikzJax (@rod2ik/tikzjax WebAssembly) không.
 * Bản @rod2ik/tikzjax 1.6.0 hỗ trợ đầy đủ: tikz thuần, calc, arrows.meta, angles, quotes, patterns,
 * intersections, pgfplots, và cả tkz-tab (bảng biến thiên)!
 * Chỉ các gói đặc thù của Việt Nam/Euclide (tkz-euclide: \tkzDefPoint, \tkzDraw...) mới cần chuyển sang QuickLaTeX / VPS.
 */
export function canRenderWithTikzJax(code) {
    if (!code || typeof code !== 'string') return false;
    const vpsOnlyKeywords = [
        'tkz-euclide', 'tkzDefPoint', 'tkzDraw', 'tkzMark', 'tkzLabel', 'tkzInter', 'tkzFind',
        '\\usepackage{twemoji}', '\\usepackage{emoji}', '\\usepackage{tcolorbox}',
        'bchart', 'forest', 'smartdiagram'
    ];
    return !vpsOnlyKeywords.some(kw => code.includes(kw));
}

/**
 * Chuyển đổi ký tự tiếng Việt UTF-8 trong mã TikZ sang lệnh dấu chuẩn LaTeX OT1
 * để trình biên dịch e-TeX WebAssembly của TikZJax không bị lỗi bảng mã.
 */
function convertVietnameseForTikzJax(str) {
    if (!str || typeof str !== 'string') return '';
    const map = {
        'á': "\\'{a}", 'à': "\\`{a}", 'ả': "\\'{a}", 'ã': "\\~{a}", 'ạ': "\\d{a}",
        'ă': "\\u{a}", 'ắ': "\\'{\\u{a}}", 'ằ': "\\`{\\u{a}}", 'ẳ': "\\'{\\u{a}}", 'ẵ': "\\~{\\u{a}}", 'ặ': "\\d{\\u{a}}",
        'â': "\\^{a}", 'ấ': "\\'{\\^{a}}", 'ầ': "\\`{\\^{a}}", 'ẩ': "\\'{\\^{a}}", 'ẫ': "\\~{\\^{a}}", 'ậ': "\\d{\\^{a}}",
        'é': "\\'{e}", 'è': "\\`{e}", 'ẻ': "\\'{e}", 'ẽ': "\\~{e}", 'ẹ': "\\d{e}",
        'ê': "\\^{e}", 'ế': "\\'{\\^{e}}", 'ề': "\\`{\\^{e}}", 'ể': "\\'{\\^{e}}", 'ễ': "\\~{\\^{e}}", 'ệ': "\\d{\\^{e}}",
        'í': "\\'{\\i}", 'ì': "\\`{\\i}", 'ỉ': "\\'{\\i}", 'ĩ': "\\~{\\i}", 'ị': "\\d{i}",
        'ó': "\\'{o}", 'ò': "\\`{o}", 'ỏ': "\\'{o}", 'õ': "\\~{o}", 'ọ': "\\d{o}",
        'ô': "\\^{o}", 'ố': "\\'{\\^{o}}", 'ồ': "\\`{\\^{o}}", 'ổ': "\\'{\\^{o}}", 'ỗ': "\\~{\\^{o}}", 'ộ': "\\d{\\^{o}}",
        'ơ': "o", 'ớ': "\\'{o}", 'ờ': "\\`{o}", 'ở': "\\'{o}", 'ỡ': "\\~{o}", 'ợ': "\\d{o}",
        'ú': "\\'{u}", 'ù': "\\`{u}", 'ủ': "\\'{u}", 'ũ': "\\~{u}", 'ụ': "\\d{u}",
        'ư': "u", 'ứ': "\\'{u}", 'ừ': "\\`{u}", 'ử': "\\'{u}", 'ữ': "\\~{u}", 'ự': "\\d{u}",
        'ý': "\\'{y}", 'ỳ': "\\`{y}", 'ỷ': "\\'{y}", 'ỹ': "\\~{y}", 'ỵ': "\\d{y}",
        'đ': "d", 'Đ': "D"
    };
    return str.replace(/[^\x00-\x7F]/g, (ch) => {
        if (map[ch]) return map[ch];
        const lower = ch.toLowerCase();
        if (map[lower]) {
            return map[lower].replace(/\{([a-z])\}/, (_, c) => `{${c.toUpperCase()}}`);
        }
        return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    });
}

// --- BỘ NHỚ ĐỆM SVG TIKZJAX TRỰC TIẾP TRÊN TRÌNH DUYỆT (0ms HIỂN THỊ TỨC THÌ) ---
const TIKZJAX_SVG_CACHE_KEY = 'qmath_tikzjax_svg_cache_v3';
const _tikzSvgMemCache = new Map();

function hashTikzKey(code) {
    const norm = String(code || '').replace(/\s+/g, ' ').trim();
    let h1 = 0xdeadbeef ^ norm.length;
    let h2 = 0x41c6ce57 ^ norm.length;
    for (let i = 0; i < norm.length; i++) {
        const ch = norm.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + '_' + (h1 >>> 0).toString(36);
}

export function getCachedTikzSvg(code) {
    const key = hashTikzKey(code);
    if (_tikzSvgMemCache.has(key)) return _tikzSvgMemCache.get(key);
    try {
        const raw = safeStorageGet(TIKZJAX_SVG_CACHE_KEY, '');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed[key]) {
                _tikzSvgMemCache.set(key, parsed[key]);
                return parsed[key];
            }
        }
    } catch (_) {}
    return null;
}

function setCachedTikzSvg(code, svgHtml) {
    if (!code || !svgHtml) return;
    const key = hashTikzKey(code);
    _tikzSvgMemCache.set(key, svgHtml);
    try {
        const raw = safeStorageGet(TIKZJAX_SVG_CACHE_KEY, '');
        const parsed = raw ? JSON.parse(raw) : {};
        const keys = Object.keys(parsed);
        if (keys.length > 120) {
            keys.slice(0, 40).forEach(k => delete parsed[k]);
        }
        parsed[key] = svgHtml;
        safeStorageSet(TIKZJAX_SVG_CACHE_KEY, JSON.stringify(parsed));
    } catch (_) {}
}

// --- HÀM BIÊN DỊCH BẰNG TIKZJAX WORKER (@rod2ik/tikzjax@1.6.0 WEBASSEMBLY) ---
const TIKZJAX_CDN_DIST = "https://cdn.jsdelivr.net/npm/@rod2ik/tikzjax@1.6.0/dist";
let _tikzWorker = null;
let _tikzWorkerInitPromise = null;
let _tikzWorkerPending = new Map();
let _tikzWorkerUid = 1;
let _tikzWorkerQueue = Promise.resolve();

export const ensureTikzJaxFontsLoaded = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('qmath-tikzjax-fonts-css')) return;
    const link = document.createElement('link');
    link.id = 'qmath-tikzjax-fonts-css';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = `${TIKZJAX_CDN_DIST}/fonts.min.css`;
    (document.head || document.documentElement).appendChild(link);
};

const callTikzWorkerMethod = (method, args, timeoutMs = 25000) => {
    return new Promise((resolve, reject) => {
        if (!_tikzWorker) return reject(new Error("TikZJax Worker chưa khởi tạo"));
        const uid = _tikzWorkerUid++;
        const timer = setTimeout(() => {
            if (_tikzWorkerPending.has(uid)) {
                _tikzWorkerPending.delete(uid);
                reject(new Error(`TikZJax timeout (${Math.round(timeoutMs / 1000)}s)`));
            }
        }, timeoutMs);
        _tikzWorkerPending.set(uid, {
            resolve: (val) => { clearTimeout(timer); resolve(val); },
            reject: (err) => { clearTimeout(timer); reject(err); }
        });
        _tikzWorker.postMessage({ type: 'run', uid, method, args });
    });
};

const initTikzJaxWorker = () => {
    if (_tikzWorkerInitPromise) return _tikzWorkerInitPromise;
    _tikzWorkerInitPromise = (async () => {
        ensureTikzJaxFontsLoaded();
        const workerResp = await fetch(`${TIKZJAX_CDN_DIST}/run-tex.js`);
        if (!workerResp.ok) throw new Error(`Không tải được TikZJax Worker (${workerResp.status})`);
        const workerJs = await workerResp.text();
        const blob = new Blob([workerJs], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        await new Promise((resolve, reject) => {
            const w = new Worker(blobUrl);
            const initTimeout = setTimeout(() => reject(new Error("TikZJax Worker khởi động quá thời gian")), 15000);
            w.onmessage = (ev) => {
                const msg = ev.data;
                if (!msg) return;
                if (msg.type === 'init') {
                    clearTimeout(initTimeout);
                    _tikzWorker = w;
                    resolve();
                } else if (msg.type === 'result' && msg.complete) {
                    const p = _tikzWorkerPending.get(msg.uid);
                    if (p) {
                        _tikzWorkerPending.delete(msg.uid);
                        p.resolve(msg.payload);
                    }
                } else if (msg.type === 'error') {
                    const p = _tikzWorkerPending.get(msg.uid);
                    if (p) {
                        _tikzWorkerPending.delete(msg.uid);
                        const errMsg = (msg.error && msg.error.message) ? msg.error.message : JSON.stringify(msg.error || 'TikZJax error');
                        p.reject(new Error(errMsg));
                    }
                }
            };
            w.onerror = (err) => {
                clearTimeout(initTimeout);
                reject(new Error(err.message || "Lỗi TikZJax Web Worker"));
            };
        });

        await callTikzWorkerMethod('load', [TIKZJAX_CDN_DIST], 30000);
        return _tikzWorker;
    })().catch((err) => {
        _tikzWorkerInitPromise = null;
        _tikzWorker = null;
        throw err;
    });
    return _tikzWorkerInitPromise;
};

/**
 * Biên dịch mã TikZ trực tiếp thành chuỗi <svg>...</svg> ngay trên trình duyệt bằng WebAssembly
 * (không tạo file ảnh, không upload lên server, có bộ nhớ đệm 0ms).
 */
export const compileTikzToSvgViaTikzJax = async (code) => {
    ensureTikzJaxFontsLoaded();
    let cleaned = cleanTikzCode(String(code || ''));
    const cached = getCachedTikzSvg(cleaned);
    if (cached) return cached;

    if (!canRenderWithTikzJax(cleaned)) {
        throw new Error("Mã TikZ chứa gói mở rộng đặc thù (tkz-euclide), tự động chuyển sang server");
    }

    const runTask = async () => {
        const cachedAgain = getCachedTikzSvg(cleaned);
        if (cachedAgain) return cachedAgain;

        await initTikzJaxWorker();
        let body = cleaned;
        const extraLibs = [];
        body = body.replace(/\\usetikzlibrary\s*\{([^}]*)\}/g, (_, libs) => {
            extraLibs.push(...libs.split(',').map(s => s.trim()).filter(Boolean));
            return '';
        });

        let extraPreambles = '';
        const preludeData = extractTikzPrelude(body);
        if (preludeData.prelude) {
            extraPreambles += preludeData.prelude + '\n';
            body = preludeData.rest;
        }

        body = body.trim();
        if (!body.includes('\\begin{tikzpicture}') && !body.includes('\\tikz')) {
            body = `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
        }

        const safeTexBody = convertVietnameseForTikzJax(body);
        const hasTkzTab = /\\tkzTab/i.test(safeTexBody);
        const hasPgfPlots = /\\begin\{axis\}|\\addplot/i.test(safeTexBody);

        const pkgList = ['amsmath', 'amssymb', 'amsfonts'];
        if (hasTkzTab) pkgList.push('tkz-tab');
        if (hasPgfPlots) pkgList.push('pgfplots');

        const defaultLibs = [
            'calc', 'arrows', 'arrows.meta', 'angles', 'quotes',
            'intersections', 'patterns', 'positioning',
            'shapes', 'shapes.geometric', 'shapes.misc',
            'decorations', 'decorations.markings', 'decorations.pathreplacing', 'decorations.pathmorphing',
            'backgrounds', '3d', 'babel'
        ];
        const mergedLibs = Array.from(new Set([...defaultLibs, ...extraLibs])).join(',');

        const defaultStyles = "\\tikzset{" +
            "circle line/.style={draw}," +
            "construction/.style={draw}," +
            "marked point/.style={circle, fill, inner sep=1.2pt}," +
            "point label/.style={}," +
            "figure label/.style={}," +
            "line/.style={draw}," +
            "point/.style={circle, fill, inner sep=1pt}," +
            "dot/.style={circle, fill, inner sep=1pt}" +
            "}\n" + extraPreambles;

        const svgString = await callTikzWorkerMethod('texify', [
            safeTexBody,
            {
                texPackages: pkgList.join(','),
                tikzLibraries: mergedLibs,
                addToPreamble: defaultStyles
            }
        ], 20000);

        if (!svgString || !svgString.includes('<svg')) {
            throw new Error("TikZJax không trả về dữ liệu SVG hợp lệ");
        }

        const styledSvg = svgString.trim().replace(
            /^<svg\b/i,
            '<svg class="tikzjax-inline-svg" style="max-height:220px;max-width:100%;height:auto;display:block;margin:2px auto;overflow:visible;"'
        );
        setCachedTikzSvg(cleaned, styledSvg);
        return styledSvg;
    };

    const nextInQueue = _tikzWorkerQueue.then(runTask, runTask);
    _tikzWorkerQueue = nextInQueue.catch(() => {});
    return nextInQueue;
};

export const compileTikzLocalViaTikzJax = async (code, options = {}) => {
    const svgString = await compileTikzToSvgViaTikzJax(code);
    if (options.asRawSvg) return svgString;
    if (options.uploadToR2 === true) {
        return await uploadSvgStringToR2(svgString, 'tikzjax');
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
};

// --- HÀM BIÊN DỊCH BẰNG QUICKLATEX (CLOUD LATEX SERVER MIỄN PHÍ) ---
export const compileTikzViaQuickLaTeX = async (rawCode, options = {}) => {
    let cleaned = cleanTikzCode(String(rawCode || ''));
    const extraLibs = [];
    cleaned = cleaned.replace(/\\usetikzlibrary\s*\{([^}]*)\}/g, (_, libs) => {
        extraLibs.push(...libs.split(',').map(s => s.trim()).filter(Boolean));
        return '';
    });

    let extraTikzSet = '';
    cleaned = cleaned.replace(/\\tikzset\s*\{([\s\S]*?)\}\s*(?=\\begin\{tikzpicture\})/g, (m) => {
        extraTikzSet += m + '\n';
        return '';
    });

    const preludeData = extractTikzPrelude(cleaned);
    let extraPrelude = '';
    if (preludeData.prelude) {
        extraPrelude = preludeData.prelude + '\n';
        cleaned = preludeData.rest;
    }

    cleaned = cleaned.trim();
    if (!cleaned.includes('\\begin{tikzpicture}') && !cleaned.includes('\\tikz')) {
        cleaned = `\\begin{tikzpicture}\n${cleaned}\n\\end{tikzpicture}`;
    }

    const hasVietChars = /[^\x00-\x7F]/.test(cleaned);
    const hasTkzEuclide = /tkzDef|tkzDraw|tkzMark|tkzLabel|tkzInter|tkzFind|tkz-euclide/i.test(cleaned);
    const hasTkzTab = /tkzTab|tkz-tab/i.test(cleaned);
    const hasPgfPlots = /\\begin\{axis\}|\\addplot|pgfplots/i.test(cleaned);

    const preambleLines = [];
    if (hasVietChars) preambleLines.push('\\usepackage[utf8]{vietnam}');
    preambleLines.push('\\usepackage{amsmath,amsfonts,amssymb}');
    const tikzPkgs = ['tikz'];
    if (hasTkzTab) tikzPkgs.push('tkz-tab');
    if (hasTkzEuclide) tikzPkgs.push('tkz-euclide');
    if (hasPgfPlots) tikzPkgs.push('pgfplots');
    preambleLines.push(`\\usepackage{${tikzPkgs.join(',')}}`);
    if (hasPgfPlots) preambleLines.push('\\pgfplotsset{compat=newest}');

    const baseLibs = [
        'calc', 'arrows', 'arrows.meta', 'angles', 'quotes',
        'intersections', 'patterns', 'positioning', 'shapes', 'shapes.geometric',
        'decorations.markings', 'decorations.pathreplacing', 'backgrounds'
    ];
    const allLibs = Array.from(new Set([...baseLibs, ...extraLibs])).join(',');
    preambleLines.push(`\\usetikzlibrary{${allLibs}}`);
    if (extraTikzSet) preambleLines.push(extraTikzSet.trim());
    if (extraPrelude) preambleLines.push(extraPrelude.trim());

    const preamble = preambleLines.join('\n');
    const bodyStr = [
        `formula=${encodeURIComponent(cleaned)}`,
        `fsize=21px`,
        `fcolor=000000`,
        `mode=0`,
        `out=1`,
        `remhost=quicklatex.com`,
        `preamble=${encodeURIComponent(preamble)}`
    ].join('&');

    const qlTarget = 'https://www.quicklatex.com/latex3.f';
    const endpoints = [
        `https://corsmirror.com/v1?url=${encodeURIComponent(qlTarget)}`,
        qlTarget
    ];

    let responseText = '';
    let lastErr = null;

    for (const ep of endpoints) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        try {
            const resp = await fetch(ep, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: bodyStr,
                signal: controller.signal
            });
            clearTimeout(timer);
            if (resp.ok) {
                const txt = await resp.text();
                if (txt && (txt.trim().startsWith('0') || txt.trim().startsWith('-'))) {
                    responseText = txt.trim();
                    break;
                }
            }
        } catch (err) {
            clearTimeout(timer);
            lastErr = err;
        }
    }

    if (!responseText) {
        throw new Error(`Không thể kết nối QuickLaTeX (${lastErr ? lastErr.message : 'Timeout'})`);
    }

    const lines = responseText.split(/\r?\n/);
    const status = lines[0].trim();
    const secondLine = (lines[1] || '').trim();
    const rawImgUrl = (secondLine.split(/\s+/)[0] || '').replace(/^http:\/\//i, 'https://');

    if (status !== '0' || !rawImgUrl || rawImgUrl.includes('error.png')) {
        const errDetail = lines.slice(2).join(' ').trim() || 'Lỗi cú pháp TikZ trên QuickLaTeX';
        throw new Error(`QuickLaTeX: ${errDetail.substring(0, 220)}`);
    }

    // Lưu ảnh định dạng .png chuẩn lên Cloudflare R2 (tránh lỗi R2 không trả về Content-Type cho .svg)
    if (options.uploadToR2 !== false) {
        const pngFetchUrls = [
            `https://images.weserv.nl/?url=${encodeURIComponent(rawImgUrl)}&output=png`,
            `https://corsmirror.com/v1?url=${encodeURIComponent(rawImgUrl)}`
        ];
        for (const fetchUrl of pngFetchUrls) {
            try {
                const pngResp = await fetch(fetchUrl);
                if (pngResp.ok) {
                    const arrBuf = await pngResp.arrayBuffer();
                    if (arrBuf && arrBuf.byteLength > 100) {
                        const pngBlob = new Blob([arrBuf], { type: 'image/png' });
                        const formData = new FormData();
                        formData.append('file', pngBlob, `tikz/quicklatex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`);
                        const upResp = await fetch(CLOUDFLARE_R2_UPLOAD_URL, { method: 'PUT', body: formData });
                        if (upResp.ok) {
                            const upData = await upResp.json();
                            if (upData && upData.url) return upData.url;
                        }
                    }
                }
            } catch (e) {
                console.warn('[QuickLaTeX] Thử nguồn tải PNG tiếp theo:', e.message);
            }
        }
    }

    return rawImgUrl;
};

// --- CÁC HÀM EXPORT HỖ TRỢ ---

export function cleanTikzCode(code) {
    let cleaned = code;

    // 1. Xóa \resizebox bọc ngoài
    cleaned = cleaned.replace(/\\resizebox\{[^}]+\}\{[^}]+\}\{\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, "$1");

    // 2. Xóa môi trường center bọc ngoài
    cleaned = cleaned.replace(/\\begin\{center\}/g, "").replace(/\\end\{center\}/g, "");

    // 3. Xóa các \usepackage{} không được cài trên VPS tiêu chuẩn
    const unsupportedPackages = [
        'twemoji',       // emoji Twitter - cần LuaLaTeX + font đặc biệt
        'emoji',         // tương tự twemoji
        'fontawesome5',  // icon font - không phải lúc nào cũng có
        'fontawesome',
        'marvosym',
        'wasysym',
        'pifont',        // thường có nhưng đôi khi thiếu
        'awesomebox',
        'tcolorbox',     // nặng, có thể không có
        'mdframed',
        'soul',
        'ulem',
        'luacode',
        'luatexja',
    ];
    unsupportedPackages.forEach(pkg => {
        // Xóa: \usepackage{pkg}, \usepackage[...]{pkg}
        const re = new RegExp(`\\\\usepackage(?:\\[[^\\]]*\\])?\\{${pkg}\\}[^\\n]*\\n?`, 'g');
        cleaned = cleaned.replace(re, '');
    });

    // 4. Thay lệnh \twemoji{...} bằng text đơn giản
    // 4. Hàm chuyển chuỗi codepoint hex (kiểu "1f9cd-1f3ff-200d-2642-fe0f") → emoji Unicode thực
    const codePointsToEmoji = (codeStr) => {
        try {
            return codeStr.split('-')
                .map(cp => String.fromCodePoint(parseInt(cp, 16)))
                .join('');
        } catch(e) {
            return ''; // nếu codepoint không hợp lệ thì trả về rỗng
        }
    };

    // Thay \twemoji[scale=...]{codepoints} và \twemoji{codepoints}
    // Tham số là chuỗi hex codepoint (VD: 1f3eb) hoặc tên (VD: check mark)
    cleaned = cleaned.replace(/\\twemoji(?:\[[^\]]*\])?\{([^}]+)\}/g, (match, arg) => {
        const trimmed = arg.trim();
        // Nếu là chuỗi hex (chứa chữ số và dấu gạch ngang) → chuyển sang emoji
        if (/^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/.test(trimmed)) {
            return codePointsToEmoji(trimmed);
        }
        // Nếu là tên chữ thường → tra bảng
        const emojiMap = {
            'check mark': '✓', 'heavy check mark': '✔', 'cross mark': '✗',
            'warning': '⚠', 'star': '★', 'heart': '♥', 'circle': '●',
            'arrow right': '→', 'arrow left': '←', 'arrow up': '↑', 'arrow down': '↓',
        };
        return emojiMap[trimmed.toLowerCase()] || '';
    });

    // 5. Xóa các lệnh liên quan đến emoji khác (có hoặc không có tham số tùy chọn)
    cleaned = cleaned.replace(/\\emoji(?:\[[^\]]*\])?\{[^}]*\}/g, '');
    cleaned = cleaned.replace(/\\faIcon(?:\[[^\]]*\])?\{[^}]*\}/g, '');
    cleaned = cleaned.replace(/\\textSFx(?:\[[^\]]*\])?\{[^}]*\}/g, '');

    // 6. Xóa các thẻ HTML bao bọc nếu có và khôi phục ký tự
    cleaned = cleaned.replace(/<\/?(?:div|script|span|p)[^>]*>/gi, '');
    cleaned = cleaned.replace(/AMP_PLACEHOLDER/g, '&');
    cleaned = cleaned.replace(/\\widecheck/g, '\\widehat');

    return cleaned;
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

/**
 * TÁCH CÁC LỆNH ĐỊNH NGHĨA DÙNG CHO TIKZ ĐẶT NGOÀI \begin{tikzpicture}
 * (\definecolor, \colorlet, \tikzset, \tikzstyle, \usetikzlibrary, \pgfplotsset, \pgfmathsetmacro)
 * Trả về { prelude: chuỗi các lệnh, rest: văn bản sau khi đã gỡ các lệnh đó }.
 * Dùng để ghép phần định nghĩa màu/kiểu vào trước mã hình khi gửi biên dịch.
 */
const TIKZ_PRELUDE_SPECS = [
    { name: 'definecolor', args: 3 },
    { name: 'colorlet', args: 2 },
    { name: 'tikzset', args: 1 },
    { name: 'usetikzlibrary', args: 1 },
    { name: 'pgfplotsset', args: 1 },
    { name: 'pgfmathsetmacro', args: 2 },
];

export function extractTikzPrelude(text) {
    if (!text || typeof text !== 'string') return { prelude: '', rest: text || '' };
    const found = [];
    let rest = '';
    let i = 0;
    const src = text;
    while (i < src.length) {
        if (src[i] !== '\\') { rest += src[i++]; continue; }
        // Keep everything inside tikzpicture / axis environments intact (local \pgfmathsetmacro, \definecolor, \tikzset, etc.)
        let copiedEnv = false;
        for (const envName of ['tikzpicture', 'axis']) {
            const beginTag = `\\begin{${envName}}`;
            const endTag = `\\end{${envName}}`;
            if (src.startsWith(beginTag, i)) {
                let depth = 1;
                let scan = i + beginTag.length;
                while (scan < src.length && depth > 0) {
                    const nextBegin = src.indexOf(beginTag, scan);
                    const nextEnd = src.indexOf(endTag, scan);
                    if (nextEnd === -1) { scan = src.length; depth = 0; break; }
                    if (nextBegin !== -1 && nextBegin < nextEnd) {
                        depth++;
                        scan = nextBegin + beginTag.length;
                    } else {
                        depth--;
                        scan = nextEnd + endTag.length;
                    }
                }
                rest += src.slice(i, scan);
                i = scan;
                copiedEnv = true;
                break;
            }
        }
        if (copiedEnv) continue;
        let matched = false;
        for (const spec of TIKZ_PRELUDE_SPECS) {
            const cmd = '\\' + spec.name;
            if (!src.startsWith(cmd, i)) continue;
            const after = src[i + cmd.length];
            if (after && /[a-zA-Z]/.test(after)) continue;
            let pos = i + cmd.length;
            const skipWs = () => { while (pos < src.length && /\s/.test(src[pos])) pos++; };
            skipWs();
            if (src[pos] === '[') {
                const close = src.indexOf(']', pos);
                if (close === -1) break;
                pos = close + 1;
                skipWs();
            }
            let ok = true;
            for (let a = 0; a < spec.args; a++) {
                skipWs();
                if (src[pos] !== '{') { ok = false; break; }
                let depth = 0, j = pos;
                for (; j < src.length; j++) {
                    if (src[j] === '\\') { j++; continue; }
                    if (src[j] === '{') depth++;
                    else if (src[j] === '}') { depth--; if (depth === 0) break; }
                }
                if (depth !== 0) { ok = false; break; }
                pos = j + 1;
            }
            if (!ok) break;
            found.push(src.substring(i, pos).trim());
            i = pos;
            matched = true;
            break;
        }
        if (!matched) {
            // \tikzstyle{name}=[...]
            const m = src.substring(i).match(/^\\tikzstyle\s*\{[^{}]*\}\s*=\s*\[/);
            if (m) {
                let depth = 0, j = i + m[0].length - 1;
                for (; j < src.length; j++) {
                    if (src[j] === '[') depth++;
                    else if (src[j] === ']') { depth--; if (depth === 0) break; }
                }
                if (depth === 0) {
                    found.push(src.substring(i, j + 1).trim());
                    i = j + 1;
                    continue;
                }
            }
            rest += src[i++];
        }
    }
    const uniq = Array.from(new Set(found));
    return { prelude: uniq.join('\n'), rest };
}

/**
 * Ghép phần định nghĩa (màu, kiểu, macro) vào trước mã TikZ nếu mã chưa chứa chúng.
 */
export function attachTikzPrelude(tikzCode, ...preludes) {
    const code = String(tikzCode || '');
    const lines = [];
    preludes.filter(Boolean).forEach(p => {
        String(p).split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
            if (!code.includes(line) && !lines.includes(line)) lines.push(line);
        });
    });
    return lines.length ? lines.join('\n') + '\n' + code : code;
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
    let textToProcess = text.replace(/<script\s+type=["']text\/tikz["'][^>]*>[\s\S]*?<\/script>/gi, (match) => {
        const idx = protectedBlocks.length;
        protectedBlocks.push(match);
        return `QMTIKZNESTED${idx}QMEND`;
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
        result = result.replace(`QMTIKZNESTED${idx}QMEND`, () => block);
    });

    return result;
}


function splitLatexTableCells(row) {
    const cells = [];
    let cur = '';
    let braceDepth = 0;
    for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '\\' && i + 1 < row.length) {
            cur += ch + row[i + 1];
            i++;
            continue;
        }
        if (ch === '{') braceDepth++;
        else if (ch === '}' && braceDepth > 0) braceDepth--;
        if (ch === '&' && braceDepth === 0) {
            cells.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    cells.push(cur);
    return cells;
}

function processTabular(text) {
    if (!text) return "";
    let processed = String(text).replace(/\\begin\{table\}(?:\[.*?\])?[\s\S]*?\\end\{table\}/g, (match) => {
        return match
            .replace(/\\begin\{table\}(?:\[.*?\])?/g, '')
            .replace(/\\end\{table\}/g, '')
            .replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
            .replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, '')
            .replace(/\\setlength\s*\{[^}]*\}\s*\{[^}]*\}/g, '')
            .replace(/\\centering/g, '');
    });
    processed = processed
        .replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
        .replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, '')
        .replace(/\\setlength\s*\{[^}]*\}\s*\{[^}]*\}/g, '');

    let out = '';
    let cursor = 0;
    const startToken = '\\begin{tabular}';
    const endToken = '\\end{tabular}';
    while (cursor < processed.length) {
        const idx = processed.indexOf(startToken, cursor);
        if (idx === -1) { out += processed.slice(cursor); break; }
        let before = processed.slice(cursor, idx).replace(/(?:<br\s*\/?>\s*)+$/i, '');
        let p = idx + startToken.length;
        while (p < processed.length && /\s/.test(processed[p])) p++;
        if (processed[p] === '[') {
            const closeBracket = processed.indexOf(']', p);
            if (closeBracket !== -1) {
                p = closeBracket + 1;
                while (p < processed.length && /\s/.test(processed[p])) p++;
            }
        }
        if (processed[p] !== '{') {
            out += processed.slice(cursor, idx + startToken.length);
            cursor = idx + startToken.length;
            continue;
        }
        let depth = 0;
        let specEnd = p;
        for (; specEnd < processed.length; specEnd++) {
            if (processed[specEnd] === '\\') { specEnd++; continue; }
            if (processed[specEnd] === '{') depth++;
            else if (processed[specEnd] === '}') { depth--; if (depth === 0) break; }
        }
        const closeIdx = depth === 0 ? processed.indexOf(endToken, specEnd + 1) : -1;
        if (depth !== 0 || closeIdx === -1) {
            out += processed.slice(cursor, idx + startToken.length);
            cursor = idx + startToken.length;
            continue;
        }
        out += before;
        const body = processed.slice(specEnd + 1, closeIdx);
        const rows = body.split(/\\\\(?:\s*\[[^\]]*\])?/);
        let html = '<div class="my-2 w-full overflow-x-auto js-scale-wrapper" style="position: relative; width: 100%;">';
        html += '<table class="js-scale-table mx-auto border-collapse border border-slate-300 bg-white text-sm" style="min-width: max-content;">';
        let rIdx = 0;
        rows.forEach((row) => {
            const cleanRow = row
                .replace(/\\(?:hline|toprule|midrule|bottomrule)\b/g, '')
                .replace(/\\cline\s*\{[^}]*\}/g, '')
                .replace(/\\centering\b/g, '')
                .trim();
            if (!cleanRow) return;
            const cols = splitLatexTableCells(cleanRow);
            html += `<tr class="${rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">`;
            cols.forEach((rawCol, cIdx) => {
                let cell = rawCol.trim();
                if (!cell || cell === '$$') cell = '&nbsp;';
                const cellTag = rIdx === 0 ? 'th' : 'td';
                const weightCls = rIdx === 0 ? 'font-semibold bg-slate-100 text-slate-800' : (cIdx === 0 ? 'font-medium text-slate-800 bg-slate-50/60' : 'text-slate-700');
                html += `<${cellTag} class="border border-slate-300 px-3 py-1.5 text-center ${weightCls}">${cell}</${cellTag}>`;
            });
            html += '</tr>';
            rIdx++;
        });
        html += '</table></div>';
        out += html;
        cursor = closeIdx + endToken.length;
        const afterBr = processed.slice(cursor).match(/^(?:\s*<br\s*\/?>)+/i);
        if (afterBr) cursor += afterBr[0].length;
    }
    return out;
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
        const items = body.split(/\\itemch\b/g).filter(s => s.trim().length > 0);
        const htmlItems = items.map((item, idx) => {
            const letter = String.fromCharCode(97 + idx); // a, b, c, d
            return `<li class="flex items-start gap-2.5 mb-2.5 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/50"><span class="w-6 h-6 rounded-lg bg-amber-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">${letter}</span><div class="leading-relaxed flex-1 text-gray-800 dark:text-gray-200 text-sm font-medium">${item.trim()}</div></li>`;
        }).join('');
        return `<ul class="my-3 pl-0 list-none space-y-2">${htmlItems}</ul>`;
    });

    processed = processed.replace(/\\begin\{nx\}([\s\S]*?)\\end\{nx\}/gi, (match, body) => {
        return `<div class="my-3 p-3.5 border-l-4 border-teal-500 bg-teal-50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200 rounded-r-xl shadow-2xs"><strong class="block mb-1 text-teal-800 dark:text-teal-300 flex items-center gap-1.5"><i class="fa-solid fa-lightbulb text-teal-600"></i>Nhận xét:</strong>${body}</div>`;
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

    // Xóa <br> thừa xung quanh block elements (bảng, danh sách)
    processed = processed.replace(/(<br\s*\/?>)+\s*(<div class="(?:my-0|my-1|my-2|my-3)[^"]*js-scale-wrapper)/gi, '$2');
    processed = processed.replace(/(<\/div>)\s*(<br\s*\/?>)+/gi, '$1');
    processed = processed.replace(/(<br\s*\/?>)+\s*(<(?:ul|ol|table)[^>]*>)/gi, '<br>$2');
    processed = processed.replace(/(<\/(?:ul|ol|table)>)\s*(<br\s*\/?>)+/gi, '$1');
    
    return processed;
}

// --- CÁC HÀM EXPORT CHO BÊN NGOÀI ---

export const convertArrayToMatrix = (content) => {
  if (!content) return "";
  // DISABLED: MathJax natively supports \begin{array} with lines, converting to matrix destroys |c| borders.
  // let processed = content.replace(/\\begin\{array\}\s*\{[^{}]*?\}/g, '\\begin{matrix}');
  // processed = processed.replace(/\\begin\{array\}/g, '\\begin{matrix}');
  // processed = processed.replace(/\\end\{array\}/g, '\\end{matrix}');
  // return processed;
  return content;
};

export const autoScaleTables = (root = document) => {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.js-scale-wrapper').forEach(wrap => {
        const table = wrap.querySelector('table');
        if (!table) return;
        table.style.transform = 'none'; 
        table.style.width = 'auto'; 
        wrap.style.height = 'auto';
        wrap.style.overflowX = 'auto';
        const wrapWidth = wrap.clientWidth || wrap.offsetWidth;
        if (wrapWidth > 0 && table.scrollWidth > wrapWidth) {
            const scale = Math.max(wrapWidth / table.scrollWidth, 0.7);
            if (scale < 0.99) {
                table.style.transformOrigin = 'top left';
                table.style.transform = `scale(${scale})`;
                wrap.style.height = `${Math.ceil(table.scrollHeight * scale)}px`;
            }
        }
    });
};

/**
 * HÀM FORMAT CONTENT (FIX: EQNARRAY, <x, PLACEHOLDERS, ENUMEX)
 */
export const formatContent = (text) => {
    if (text === null || text === undefined) return "";
    // Bảo vệ tuyệt đối khối <script type="text/tikz"> khỏi mọi bước biến đổi văn bản
    // (VD: xóa dòng chỉ có "}" làm mất ngoặc đóng của \foreach/\newcommand -> TikZ lỗi "File ended")
    const tikzShield = [];
    const restoreTikzShield = (html) => tikzShield.length
        ? html.replace(/QMTIKZSHIELD(\d+)QMEND/g, (_, i) => tikzShield[Number(i)] || '')
        : html;
    let processed = String(text).replace(/<script\s+type=["']text\/tikz["'][^>]*>[\s\S]*?<\/script>/gi, (m) => {
        tikzShield.push(m);
        return `QMTIKZSHIELD${tikzShield.length - 1}QMEND`;
    });
    let out = '';
    if (tikzShield.length) {
        out = restoreTikzShield(formatContentCore(processed));
    } else {
        out = formatContentCore(processed);
    }
    return stripBrAroundBlocks(out);
};

const formatContentCore = (text) => {
    let processed = text;

    // 0. Pre-process lệnh toán học custom của VN (phải làm TRƯỚC khi split)
    processed = replaceCustomMathCmd(processed, 'heva', '\\left\\{', '\\right.');
    processed = replaceCustomMathCmd(processed, 'hoac', '\\left[', '\\right.');
    processed = replaceCustomMathCmd(processed, 'heva*', '\\left\\{', '\\right.');
    processed = replaceCustomMathCmd(processed, 'hoac*', '\\left[', '\\right.');
    // Sửa lỗi hệ phương trình bị phân rã từ MathType Word:
    const regexMangledSystem = /\\left\s*([^\\]*(?:\\(?!(?:begin\{array\}|right))[^\\]*)*?)\s*\\begin\{array\}\s*\{[^{}]*\}\s*\\end\{array\}\s*\\right(?:\\\.|\.|\{|\})?\s*([\s\S]*?)\s*(?:\\\{|\\\}|\\\.|(?=\$))/g;
    processed = processed.replace(regexMangledSystem, (match, eq1, eq2) => {
        const clean1 = (eq1 || '').trim().replace(/^\\left\s*/, '');
        const clean2 = (eq2 || '').trim().replace(/^[.\\]+/, '').trim();
        return `\\begin{cases} ${clean1} \\\\ ${clean2} \\end{cases}`;
    });
    processed = processed.replace(/\\begin\{array\}\s*\{[^{}]*\}\s*\\end\{array\}/g, '');
    // Sửa lỗi orphaned \left / \right nhưng không được xóa tiền tố của \rightarrow, \leftarrow, \rightleftharpoons
    processed = processed.replace(/\\(?:left|right)(?=\s*[0-9])/g, '');
    processed = processed.replace(/\\(?:left|right)(?=\s+[a-zA-Z]\b)/g, '');
    processed = processed.replace(/\\(?:left|right)(?=(?:[a-zA-Z]\b)(?!arrow|leftharpoon|rightharpoon|leftharpoons))/g, '');

    // Cleanup metadata LaTeX bảng (caption, arraystretch)
    processed = processed.replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');
    processed = processed.replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, '');
    processed = processed.replace(/\\renewcommand\\arraystretch\s*\{[^}]+\}/g, '');

    // 0.5 Strip question environments
    processed = processed.replace(/\\begin\{(?:ex|bt|vd|cau|question)\}(?:\[.*?\])?/g, '');
    processed = processed.replace(/\\end\{(?:ex|bt|vd|cau|question)\}/g, '');
    processed = processed.replace(/\\immini(?:\[.*?\])?\s*\{/g, '{'); // Strip \immini but keep the group
    processed = processed.replace(/\\loigiai\s*\{/gi, '');

    // 1. Clean Text (Math-safe replacements)
    // Hỗ trợ triệt để lệnh mũi tên phản ứng hóa học / suy ra (\arrow, \Arrow, arrow)
    // Bảo vệ tuyệt đối các lệnh LaTeX chuẩn: \rightarrow, \leftarrow, \Rightarrow, \Leftarrow, v.v.
    processed = processed.replace(/\\arrow(?![a-zA-Z])/g, ' \\rightarrow ');
    processed = processed.replace(/\\Arrow(?![a-zA-Z])/g, ' \\Rightarrow ');
    processed = processed.replace(/(?<!\\right)(?<!\\left)(?<!\\long)(?<!\\up)(?<!\\down)(?<=[0-9a-zA-Z_)}])\s*(?:\\?arrow)\s*(?=[0-9a-zA-Z_(\\])/gi, ' \\rightarrow ');
    processed = processed.replace(/(?<![\\a-zA-Z])arrow(?![a-zA-Z])/gi, ' \\rightarrow ');
    // Loại bỏ triệt để các thẻ phân loại [NB], [TH], [VD], [VDC], [##] khỏi nội dung hiển thị
    processed = processed.replace(/\[\s*(?:NB|TH|VD|VDC|##)\s*\]/gi, '');
    processed = processed.replace(/\\centering/g, "");
    processed = processed.replace(/\\allowdisplaybreaks(\[.*?\])?/g, "");
    processed = processed.replace(/\\lq\\lq/g, '"').replace(/\\rq\\rq/g, '"').replace(/\\lq/g, '"').replace(/\\rq/g, '"');
    processed = processed.replace(/\\(?:wideparen|widearc|overparen|cung)\s*\{([^}]+)\}/g, '\\overparen{$1}');
    processed = processed.replace(/\\(?:wideparen|widearc|overparen|cung)(?:\s+|(?=[A-Za-z]))([A-Za-z0-9]{1,4})\b/g, '\\overparen{$1}');
    processed = processed.replace(/(^|[^\\])sđ(?=\s*\\overparen)/g, '$1\\text{sđ}\\;');
    processed = processed.replace(/\\text\{sđ\}(?=\s*\\overparen)/g, '\\text{sđ}\\;');
    processed = processed.replace(/\\(h|v)space\*?\{[^}]+\}/g, '').replace(/\\(no)?indent/g, '');
    processed = processed.replace(/\\begin\{center\}\s*\\includegraphics(?:\[.*?\])?\{(https?:\/\/[^}]+)\}\s*\\end\{center\}/g, '<div class="flex justify-center my-3"><img src="$1" class="max-h-[350px] object-contain rounded-lg shadow-sm" loading="lazy"></div>');
    processed = processed.replace(/\\includegraphics(?:\[.*?\])?\{(https?:\/\/[^}]+)\}/g, '<div class="flex justify-center my-3"><img src="$1" class="max-h-[350px] object-contain rounded-lg shadow-sm" loading="lazy"></div>');

    // 2. Structure
    processed = convertArrayToMatrix(processed);
    processed = processNestedTikz(processed);

    // Protect embedded TikZ scripts & HTML tags before stripping LaTeX comments / layout commands / lone braces
    const tikzProtected = [];
    processed = processed.replace(/<script\s+type=["']text\/tikz["'][^>]*>[\s\S]*?<\/script>/gi, (m) => {
        const idx = tikzProtected.length;
        tikzProtected.push(m);
        return `QMUTILSTIKZPROTECT${idx}QMEND`;
    });
    processed = processed
        .replace(/\\setlength\s*\{[^}]*\}\s*\{[^}]*\}/g, '')
        .replace(/((?:^|[^\\])(?:\\\\)*)%(?![0-9A-Fa-f]{2}\b)[^\r\n]*/g, '$1')
        .replace(/\\begin\{center\}/g, '<div class="text-center my-2">')
        .replace(/\\end\{center\}/g, '</div>')
        .replace(/\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}/g, '<div>')
        .replace(/\\end\{minipage\}/g, '</div>');

    processed = processTabular(processed);
    processed = processLatexLists(processed);

    // 3. Placeholder & Clean Rác
    processed = processed.replace(/Click đúp để tải file|hoặc Ctrl \+ V để dán ảnh|ẢNH TỪ IMMINI|VỊ TRÍ HÌNH TIKZ/gi, '');
    processed = processed.replace(/^\s*\}\s*$/gm, '').replace(/Ảnh minh họa \(immini\)/g, '').replace(/Ảnh canh giữa/g, '');
    
    // Xóa cặp ngoặc nhọn {} nếu nó bao bọc toàn bộ chuỗi (thường gặp trong parse mệnh đề Đúng/Sai)
    processed = processed.trim().replace(/^\{([\s\S]*)\}$/, '$1');

    // Khôi phục TikZ sau bước dọn rác (tránh xóa nhầm dấu "}" đóng của \newcommand / \foreach)
    tikzProtected.forEach((m, idx) => {
        processed = processed.replace(`QMUTILSTIKZPROTECT${idx}QMEND`, () => m);
    });

    // 4. Regex Bảo Vệ MathJax, TikZ Script & HTML (Loại trừ enumEX, listEX, enumerate, itemize, center, table khỏi MathJax block detection)
    const tagWhitelist = "script|style|div|span|p|br|img|table|tbody|thead|tr|td|th|ul|ol|li|b|i|u|strong|em|mark|label|input|button|a|h1|h2|h3|h4";
    const regex = new RegExp(`(<script\\s+type=["']text\\/tikz["'][^>]*>[\\s\\S]*?<\\/script>|\\\\begin\\{(?!(?:enumEX|listEX|enumerate|itemize|itemchoice|center|minipage|table|figure)\\b)[a-zA-Z*]+\\}[\\s\\S]*?\\\\end\\{[a-zA-Z*]+\\}|\\$\\$[\\s\\S]*?\\$\\$|\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\([\\s\\S]*?\\\\\\)|(?:\\$[\\s\\S]*?\\$)|<\\/?(?:${tagWhitelist})[^>]*>)`, 'gi');
    
    const parts = processed.split(regex);
    
    return parts.map(part => {
        const trimmed = part.trim();
        if (/^<script\s+type=["']text\/tikz["']/i.test(trimmed)) {
            return part; // Bảo toàn tuyệt đối mã nguồn bên trong <script type="text/tikz">...</script>
        }
        const isMath = trimmed.startsWith('$') || trimmed.startsWith('\\(') || trimmed.startsWith('\\[') || (trimmed.startsWith('\\begin') && !trimmed.startsWith('\\begin{div') && !trimmed.startsWith('\\begin{grid'));
        const isTag = trimmed.startsWith('<') && trimmed.endsWith('>');

        if (isMath) {
            let mathType = trimmed.substring(0, 2);
            if (trimmed.startsWith('$') && !trimmed.startsWith('$$')) mathType = '$';
            const brToken = '%%UTILS_MATH_BR%%';
            let cleanedMath = part.replace(/<br\s*\/?>/gi, brToken);
            cleanedMath = cleanedMath.replace(/</g, ' &lt; ').replace(/>/g, ' &gt; ');
            if (mathType === '$' || mathType === '$$') {
                cleanedMath = cleanedMath.split(brToken).join(` ${mathType} <br> ${mathType} `);
            } else {
                cleanedMath = cleanedMath.split(brToken).join(' \\\\ ');
            }
            return cleanedMath;
        } else if (isTag) {
            return part; // Giữ nguyên tag HTML
        } else {
            let cleanPart = part.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Mã hóa < > trong text thường
            cleanPart = cleanPart.replace(/\\%/g, '%'); // Chỉ unescape \% thành % khi ở ngoài công thức toán MathJax
            cleanPart = cleanPart.replace(/\\vdots(?![a-zA-Z])/g, '&#8942;');
            cleanPart = cleanPart.replace(/\\textbf\{([^}]+)\}/g, '<b class="font-bold">$1</b>');
            cleanPart = cleanPart.replace(/\\textit\{([^}]+)\}/g, '<i class="italic">$1</i>');
            cleanPart = cleanPart.replace(/\\rightarrow/g, '→').replace(/\\Rightarrow/g, '⇒');
            cleanPart = cleanPart.replace(/\\hfill/g, '<span style="display:inline-block; width: 2rem;"></span>');
            return cleanPart.replace(/\\\\/g, '<br>').replace(/\n/g, '<br>');
        }
    }).join('');
};

export function stripBrAroundBlocks(html) {
    if (!html || typeof html !== 'string') return '';
    let res = html;
    // 1. Xóa <br> thừa trước và sau các block elements (bảng js-scale-wrapper, ảnh)
    res = res.replace(/(<br\s*\/?>[\s]*){1,}<div class="[^"]*js-scale-wrapper/gi, '<div class="js-scale-wrapper');
    res = res.replace(/<\/div>([\s]*<br\s*\/?>[\s]*){1,}(?=<div class="[^"]*js-scale-wrapper)/gi, '</div>');
    
    // 2. Xóa triệt để khoảng trắng <br> thừa bám sát trước và sau khung TikZ / TikZJax
    res = res.replace(/(?:<br\s*\/?>\s*)+(?=<div[^>]*class=["'][^"']*(?:tikzjax|tikz-container|justify-center)[^"']*)/gi, '');
    res = res.replace(/(?:<br\s*\/?>\s*)+(?=<script[^>]*type=["']text\/tikz["'])/gi, '');
    res = res.replace(/(<\/script>\s*<\/div>|<\/script>)(?:\s*<br\s*\/?>)+/gi, '$1');
    res = res.replace(/(<div[^>]*class=["'][^"']*(?:tikzjax|tikz-container)[^"']*>[^<]*<\/div>)(?:\s*<br\s*\/?>)+/gi, '$1');

    res = res.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>'); // Max 2 br consecutive
    return res;
}

// ============================================================================
// 5. CÁC HÀM BỔ SUNG CHO EXAM (RENDER TIKZ, XỬ LÝ ẢNH, WATERMARK)
// ============================================================================

export const renderTikz = (root = document) => {
    const scripts = root && root.querySelectorAll ? root.querySelectorAll('script[type="text/tikz"]') : document.querySelectorAll('script[type="text/tikz"]');
    if (!scripts || scripts.length === 0) return;

    ensureTikzJaxFontsLoaded();

    scripts.forEach(script => {
        const code = script.textContent || '';
        const cleaned = cleanTikzCode(code);

        // Tạo khung hiển thị SVG trực tiếp (kèm mathjax_ignore để MathJax không can thiệp)
        const placeholder = document.createElement('div');
        placeholder.className = 'tikzjax-wrapper mathjax_ignore flex justify-center my-0.5 overflow-x-auto';
        script.parentNode.replaceChild(placeholder, script);

        // 0. Nếu đã có trong bộ nhớ đệm SVG -> Hiển thị tức thì 0ms!
        const cachedSvg = getCachedTikzSvg(cleaned);
        if (cachedSvg) {
            placeholder.innerHTML = cachedSvg;
            return;
        }

        if (canRenderWithTikzJax(cleaned)) {
            // Render trực tiếp bằng TikZJax WebAssembly ngay trên trình duyệt thành thẻ <svg> inline (như MathJax)
            placeholder.innerHTML = '<span class="text-amber-600 dark:text-amber-400 italic text-xs flex items-center gap-1.5 py-2"><i class="fa-solid fa-bolt fa-fade"></i>Đang hiển thị hình TikZJax...</span>';
            compileTikzToSvgViaTikzJax(cleaned)
                .then(svgHtml => {
                    placeholder.innerHTML = svgHtml;
                })
                .catch(err => {
                    console.warn(`[TikZJax Inline] Lỗi render (${err.message}), tự động chuyển sang QuickLaTeX / VPS...`);
                    placeholder.innerHTML = '<span class="text-purple-600 dark:text-purple-400 italic text-xs flex items-center gap-1.5 py-2"><i class="fa-solid fa-spinner fa-spin"></i>Đang chuyển tiếp sang QuickLaTeX...</span>';
                    return compileTikzViaQuickLaTeX(cleaned)
                        .catch(() => compileTikZToImage(cleaned))
                        .then(fallbackUrl => {
                            placeholder.innerHTML = `<img src="${fallbackUrl}" class="rounded-lg shadow-sm max-h-[260px] object-contain mx-auto w-full md:w-auto" loading="lazy">`;
                        })
                        .catch(finalErr => {
                            placeholder.innerHTML = `<span class="text-rose-500 italic text-xs">Lỗi vẽ hình: ${finalErr.message}</span>`;
                        });
                });
        } else {
            // Mã có gói mở rộng đặc thù (tkz-euclide) -> Dùng QuickLaTeX / VPS
            placeholder.innerHTML = '<span class="text-purple-600 dark:text-purple-400 italic text-xs flex items-center gap-1.5 py-2"><i class="fa-solid fa-spinner fa-spin"></i>Đang vẽ hình phức tạp (QuickLaTeX / VPS)...</span>';
            compileTikzViaQuickLaTeX(cleaned)
                .catch(() => compileTikZToImage(cleaned))
                .then(url => {
                    placeholder.innerHTML = `<img src="${url}" class="rounded-lg shadow-sm max-h-[260px] object-contain mx-auto w-full md:w-auto" loading="lazy">`;
                })
                .catch(err => {
                    placeholder.innerHTML = `<span class="text-rose-500 italic text-xs">Lỗi vẽ hình: ${err.message}</span>`;
                });
        }
    });
};

export const compressImage = (file, quality = 0.6, maxWidth = 600) => {
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

/**
 * TỰ ĐỘNG ĐẢO LỜI GIẢI CÂU ĐÚNG / SAI KHI TRỘN MỆNH ĐỀ
 * @param {string} solution - Lời giải gốc (thường gồm lời dẫn + các ý a, b, c, d)
 * @param {number[]} shuffleMap - Mảng ánh xạ chỉ số đảo, ví dụ [2, 0, 3, 1] nghĩa là ý 0 mới là ý 2 cũ
 * @returns {string} Lời giải sau khi đã sắp xếp lại các ý theo đúng thứ tự hiển thị
 */
export const reorderTfSolution = (solution, shuffleMap) => {
    if (!solution || typeof solution !== 'string' || !Array.isArray(shuffleMap) || shuffleMap.length < 2) {
        return solution;
    }

    const n = shuffleMap.length;
    const expectedLetters = ['a', 'b', 'c', 'd'].slice(0, n);

    const markerPatterns = [
        /(?:^|\n)\s*(?:[\+\-\*(?:\•)]\s*)?(?:(?:Ý|ý|Mệnh\s+đề|mệnh\s+đề)\s*)?\(?([a-dA-D])\)?(?:\s*[:.]|\s+)/g,
        /(?:^|\n)\s*(?:[\+\-\*(?:\•)]\s*)?(?:(?:Ý|ý|Mệnh\s+đề|mệnh\s+đề)\s*)?([a-dA-D])[\.:](?:\s+|$)/g,
        /(?:^|\n)\s*(?:[\+\-\*(?:\•)]\s*)?(?:Ý|ý|Mệnh\s+đề|mệnh\s+đề)\s+([a-dA-D])(?:\s*[:.]|\s+)/g
    ];

    for (const pattern of markerPatterns) {
        pattern.lastIndex = 0;
        const matches = [];
        let match;
        while ((match = pattern.exec(solution)) !== null) {
            const letter = match[1].toLowerCase();
            if (matches.length < n && letter === expectedLetters[matches.length]) {
                matches.push({
                    start: match.index,
                    end: pattern.lastIndex,
                    letter: letter
                });
            }
        }

        if (matches.length === n) {
            const preamble = solution.substring(0, matches[0].start).trim();
            const parts = [];
            for (let i = 0; i < n; i++) {
                const start = matches[i].start;
                const end = (i < n - 1) ? matches[i + 1].start : solution.length;
                let partText = solution.substring(start, end).trim();
                
                // Lược bỏ nhãn đầu dòng dạng a), Ý a:, + Mệnh đề a:
                partText = partText.replace(/^(?:[\+\-\*(?:\•)]\s*)?(?:(?:Ý|ý|Mệnh\s+đề|mệnh\s+đề)\s*)?\(?[a-dA-D]\)?[\.:]?\s*/i, '').trim();
                // Lược bỏ nhãn lặp dư thừa như: "Mệnh đề a đúng vì...", "Ý a là sai vì..."
                partText = partText.replace(/^(?:Mệnh\s+đề|mệnh\s+đề|Ý|ý)\s+[a-dA-D](?:\s*là\s*(?:mệnh\s+đề\s*)?)?[\.:\s-]*/i, '').trim();
                
                if (partText.length > 0) {
                    partText = partText.charAt(0).toUpperCase() + partText.slice(1);
                }
                parts.push(partText);
            }

            const reorderedParts = [];
            for (let newPos = 0; newPos < n; newPos++) {
                const oldIdx = shuffleMap[newPos];
                const body = (oldIdx !== undefined && parts[oldIdx] !== undefined) ? parts[oldIdx] : (parts[newPos] || '');
                reorderedParts.push(expectedLetters[newPos] + ') ' + body);
            }

            let res = '';
            if (preamble) res = preamble + '\n\n';
            res += reorderedParts.join('\n\n');
            return res;
        }
    }

    return solution;
};

if (typeof window !== 'undefined') {
    window.getTikzApiUrl = getTikzApiUrl;
    window.compileTikZToImage = compileTikZToImage;
    window.compileTikZBatch = compileTikZBatch;
    window.compileTikzLocalViaTikzJax = compileTikzLocalViaTikzJax;
    window.compileTikzToSvgViaTikzJax = compileTikzToSvgViaTikzJax;
    window.getCachedTikzSvg = getCachedTikzSvg;
    window.compileTikzViaQuickLaTeX = compileTikzViaQuickLaTeX;
    window.uploadSvgStringToR2 = uploadSvgStringToR2;
    window.canRenderWithTikzJax = canRenderWithTikzJax;
    window.getTikzRenderMode = getTikzRenderMode;
    window.setTikzRenderMode = setTikzRenderMode;
    window.formatContent = formatContent;
    window.convertArrayToMatrix = convertArrayToMatrix;
    window.autoScaleTables = autoScaleTables;
    window.cleanTikzCode = cleanTikzCode;
    window.extractNextBrace = extractNextBrace;
    window.extractTikzPrelude = extractTikzPrelude;
    window.attachTikzPrelude = attachTikzPrelude;
    window.renderTikz = renderTikz;
    window.reorderTfSolution = reorderTfSolution;
}

