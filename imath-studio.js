/**
 * QMath LMS - Xưởng Câu Hỏi Theo Dạng (Đổi Số Thông Minh - iMath Integration)
 * ============================================================================
 * Tích hợp đồng bộ với:
 *   1. Ngân hàng câu hỏi Cloudflare R2 (dashboard.html -> #view-questionbank)
 *      -> Chuẩn hóa MapID, cấp CCCD 8 số và nạp trực tiếp vào Ngân hàng để dùng cho
 *         Luyện tập (Practice), Tạo đề ma trận, và Trò chơi (Games).
 *   2. Trình soạn đề thi (exam-editor.html)
 *      -> Sinh câu hỏi theo dạng, đổi số tương tự theo MapID của câu đang chọn,
 *         vẽ hình trực tiếp bằng TikZJax và chèn thẳng vào đề thi.
 *   3. Hỗ trợ Hybrid Runtime:
 *      - Tự động kết nối Local Python Engine (http://127.0.0.1:8765) nếu đang bật
 *        để sinh vô hạn biến thể mới từ 37 module .pyc (0.001s/câu) và lưu mẫu TikZ mới.
 *      - Tự động chuyển sang Kho Đổi Số Web Tĩnh (data/imath/catalog_mapped.json + pool_L0x.json)
 *        để hoạt động 24/7 trên mọi thiết bị mà không cần cài đặt.
 */

(function () {
    'use strict';

    const LOCAL_BRIDGE_URL = 'http://127.0.0.1:8765';
    const CATALOG_URL = 'data/imath/catalog_mapped.json?v=20261110';

    const state = {
        catalog: [],
        byTag: {},
        byMapId: {},
        poolsLoaded: {}, // { L06: {...}, L09: {...} }
        variantCounters: {}, // { tag: idx }
        localBridgeOnline: false,
        mode: 'editor', // 'editor' | 'bank'
        filters: {
            grade: 'Toán 9',
            chapter: 'all',
            lesson: 'all',
            category: 'all',
            level: 'all',
            onlyTikz: false,
            keyword: ''
        },
        workspaceQuestions: [], // [{ id, tag, map_id, title, category, level_vi, latex_mc, tikz_group_id, is_tikz_overridden, showCode }]
        isLoadingCatalog: false
    };

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function notify(msg, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else {
            console.log(`[iMathStudio][${type}]`, msg);
        }
    }

    // ------------------------------------------------------------------
    // 1. KẾT NỐI DỮ LIỆU (HYBRID: LOCAL PYTHON BRIDGE + STATIC WEB POOL)
    // ------------------------------------------------------------------
    async function checkLocalBridge() {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 900);
            const res = await fetch(`${LOCAL_BRIDGE_URL}/api/ping`, { signal: ctrl.signal });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                state.localBridgeOnline = Boolean(data && data.ok);
            } else {
                state.localBridgeOnline = false;
            }
        } catch (_) {
            state.localBridgeOnline = false;
        }
        updateEngineBadge();
        return state.localBridgeOnline;
    }

    function updateEngineBadge() {
        const badge = document.getElementById('imathEngineStatusBadge');
        if (!badge) return;
        if (state.localBridgeOnline) {
            badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-100 border border-emerald-300/40 flex items-center gap-1.5';
            badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span><span>Engine Python Trực Tiếp (Sinh vô hạn)</span>';
        } else {
            badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15 text-white border border-white/25 flex items-center gap-1.5';
            badge.innerHTML = '<i class="fa-solid fa-cloud text-sky-200"></i><span>Kho Đổi Số Web Sẵn Sàng (2.423 dạng)</span>';
        }
    }

    async function ensureCatalogLoaded() {
        if (state.catalog.length > 0) return state.catalog;
        if (state.isLoadingCatalog) return state.catalog;
        state.isLoadingCatalog = true;
        try {
            const res = await fetch(CATALOG_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const list = await res.json();
            state.catalog = Array.isArray(list) ? list : [];
            state.byTag = {};
            state.byMapId = {};
            for (const item of state.catalog) {
                state.byTag[item.tag] = item;
                const mid = (item.map_id || '').toUpperCase();
                if (mid) {
                    if (!state.byMapId[mid]) state.byMapId[mid] = [];
                    state.byMapId[mid].push(item);
                    const baseMid = mid.split('-')[0];
                    if (baseMid && baseMid !== mid) {
                        if (!state.byMapId[baseMid]) state.byMapId[baseMid] = [];
                        state.byMapId[baseMid].push(item);
                    }
                }
            }
        } catch (err) {
            console.error('[iMathStudio] Lỗi tải catalog_mapped.json:', err);
            notify('Không thể tải danh mục dạng toán đổi số: ' + err.message, 'error');
        } finally {
            state.isLoadingCatalog = false;
        }
        return state.catalog;
    }

    async function ensureGradePoolLoaded(gradePrefix) {
        if (state.poolsLoaded[gradePrefix]) return state.poolsLoaded[gradePrefix];
        try {
            const res = await fetch(`data/imath/pool_${gradePrefix}.json?v=20261110`);
            if (res.ok) {
                state.poolsLoaded[gradePrefix] = await res.json();
                return state.poolsLoaded[gradePrefix];
            }
        } catch (err) {
            console.warn(`[iMathStudio] Không tải được pool_${gradePrefix}.json:`, err);
        }
        return {};
    }

    /**
     * Xáo trộn nhẹ phương án \choice{A}{B}{C}{D} trên trình duyệt khi dùng kho tĩnh
     * để tạo thêm biến thể mới ngay cả khi không bật Python Local Bridge.
     */
    function shuffleLatexChoicesClientSide(latexStr, roundIdx) {
        if (!latexStr || roundIdx <= 1) return latexStr;
        const pos = latexStr.indexOf('\\choice');
        if (pos === -1 || latexStr.slice(pos, pos + 9) === '\\choiceTF') return latexStr;

        let cursor = pos + 7;
        const opts = [];
        let firstOpen = -1;
        let lastClose = -1;

        while (opts.length < 4 && cursor < latexStr.length) {
            const openIdx = latexStr.indexOf('{', cursor);
            if (openIdx === -1) break;
            if (firstOpen === -1) firstOpen = openIdx;
            let depth = 0;
            let closeIdx = -1;
            for (let i = openIdx; i < latexStr.length; i++) {
                if (latexStr[i] === '{' && (i === 0 || latexStr[i - 1] !== '\\')) depth++;
                else if (latexStr[i] === '}' && (i === 0 || latexStr[i - 1] !== '\\')) {
                    depth--;
                    if (depth === 0) {
                        closeIdx = i;
                        break;
                    }
                }
            }
            if (closeIdx === -1) break;
            opts.push(latexStr.slice(openIdx + 1, closeIdx).trim());
            lastClose = closeIdx;
            cursor = closeIdx + 1;
        }

        if (opts.length !== 4 || firstOpen === -1 || lastClose === -1) return latexStr;
        const shuffled = opts.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = tmp;
        }
        const newChoiceBody = '\n' + shuffled.map(o => `{ ${o} }`).join('\n');
        return latexStr.slice(0, pos + 7) + newChoiceBody + latexStr.slice(lastClose + 1);
    }

    async function generateVariantsForTag(tag, count = 1) {
        await ensureCatalogLoaded();
        const meta = state.byTag[tag] || { tag, map_id: '', title: tag, category: 'Trắc nghiệm', level_vi: 'Nhận biết' };

        // 1. Ưu tiên gọi Local Python Bridge nếu đang bật (sinh trực tiếp từ .pyc)
        if (state.localBridgeOnline) {
            try {
                const res = await fetch(`${LOCAL_BRIDGE_URL}/api/generate?tag=${encodeURIComponent(tag)}&count=${count}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && Array.isArray(data.questions)) {
                        return data.questions.map(q => ({
                            tag: q.tag || tag,
                            map_id: q.map_id || meta.map_id || '',
                            title: q.title || meta.title || tag,
                            grade: q.grade || meta.grade || '',
                            chapter: q.chapter || meta.chapter || '',
                            lesson: q.lesson || meta.lesson || '',
                            category: q.category || meta.category || 'Trắc nghiệm',
                            level_vi: q.level_vi || meta.level_vi || 'Nhận biết',
                            latex_mc: q.latex_mc || '',
                            has_tikz: Boolean(q.has_tikz || meta.has_tikz),
                            tikz_group_id: meta.tikz_group_id || '',
                            is_tikz_overridden: Boolean(q.is_tikz_overridden || meta.is_tikz_overridden)
                        }));
                    }
                }
            } catch (_) {
                state.localBridgeOnline = false;
                updateEngineBadge();
            }
        }

        // 2. Fallback sang Kho Đổi Số Web Tĩnh (pool_L0x.json)
        const gradePrefix = tag.split('_')[0] || 'L09';
        const pool = await ensureGradePoolLoaded(gradePrefix);
        const variants = pool[tag] || [];
        if (variants.length === 0) {
            return [];
        }

        const results = [];
        for (let i = 0; i < count; i++) {
            const idx = (state.variantCounters[tag] || 0);
            state.variantCounters[tag] = idx + 1;
            const picked = variants[idx % variants.length];
            const round = Math.floor(idx / variants.length) + 1;
            const latexBlock = shuffleLatexChoicesClientSide(picked.latex, round);
            results.push({
                tag,
                map_id: meta.map_id || '',
                title: meta.title || tag,
                grade: meta.grade || '',
                chapter: meta.chapter || '',
                lesson: meta.lesson || '',
                category: meta.category || 'Trắc nghiệm',
                level_vi: meta.level_vi || 'Nhận biết',
                latex_mc: latexBlock,
                has_tikz: Boolean(meta.has_tikz),
                tikz_group_id: meta.tikz_group_id || '',
                is_tikz_overridden: Boolean(meta.is_tikz_overridden)
            });
        }
        return results;
    }

    // ------------------------------------------------------------------
    // 2. XÂY DỰNG GIAO DIỆN MODAL STUDIO (#imathStudioModal)
    // ------------------------------------------------------------------
    function ensureModalDOM() {
        let modal = document.getElementById('imathStudioModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'imathStudioModal';
        modal.className = 'fixed inset-0 z-[140] hidden items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 md:p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-900 w-full max-w-[1440px] h-[94vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                <!-- Header -->
                <div class="px-4 py-3 bg-gradient-to-r from-indigo-700 via-blue-700 to-teal-700 text-white flex items-center justify-between gap-3 shrink-0">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-lg shadow-inner shrink-0">
                            <i class="fa-solid fa-dice"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h2 class="text-base md:text-lg font-black tracking-tight truncate">Xưởng Tạo Câu Hỏi Theo Dạng (Đổi Số Chuẩn MapID)</h2>
                                <span id="imathEngineStatusBadge" class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-white border border-white/25">Đang kiểm tra...</span>
                            </div>
                            <p class="text-xs text-blue-100 truncate">2.423 dạng toán THCS (Lớp 6, 7, 8, 9) • Tự động gắn MapID chuẩn QMath, làm đẹp LaTeX & vẽ hình trực tiếp bằng TikZJax</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.pdf" target="_blank" class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 border border-amber-300/40 text-xs font-bold transition cursor-pointer" title="Mở bảng PDF thống kê toàn bộ 456 câu hỏi có hình vẽ TikZ kèm mã định danh [Lxx_Cx_Bx_xx]">
                            <i class="fa-solid fa-file-pdf text-amber-300"></i>
                            <span>Bảng PDF 456 Hình TikZ</span>
                        </a>
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" download="Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" class="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold transition cursor-pointer" title="Tải file mã nguồn .tex của 456 câu có hình TikZ">
                            <i class="fa-solid fa-file-code text-emerald-300"></i>
                            <span>Mã .tex 456 Hình</span>
                        </a>
                        <button type="button" onclick="window.closeIMathStudioModal()" class="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition cursor-pointer" title="Đóng">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <!-- Main 3-Column Body -->
                <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
                    <!-- Cột 1: Bộ lọc Chuyên đề & MapID (3 cols) -->
                    <div class="lg:col-span-3 flex flex-col min-h-0 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 gap-3 overflow-y-auto">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <i class="fa-solid fa-filter text-indigo-600"></i> Bộ lọc chuyên đề & MapID
                            </span>
                            <button type="button" onclick="window.resetIMathFilters()" class="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer">Đặt lại</button>
                        </div>

                        <!-- Khối lớp -->
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Khối lớp (Sách KNTTVCS)</label>
                            <div class="grid grid-cols-4 gap-1.5" id="imathGradeButtons">
                                <button type="button" onclick="window.setIMathGrade('Toán 6')" data-grade="Toán 6" class="imath-grade-btn py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer">Toán 6</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 7')" data-grade="Toán 7" class="imath-grade-btn py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer">Toán 7</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 8')" data-grade="Toán 8" class="imath-grade-btn py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer">Toán 8</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 9')" data-grade="Toán 9" class="imath-grade-btn py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer">Toán 9</button>
                            </div>
                        </div>

                        <!-- Chương -->
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Chương học</label>
                            <select id="imathFilterChapter" onchange="window.onIMathFilterChange('chapter')" class="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="all">Tất cả các chương</option>
                            </select>
                        </div>

                        <!-- Bài học -->
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Bài học</label>
                            <select id="imathFilterLesson" onchange="window.onIMathFilterChange('lesson')" class="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="all">Tất cả các bài</option>
                            </select>
                        </div>

                        <!-- Loại câu hỏi & Mức độ -->
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Loại câu hỏi</label>
                                <select id="imathFilterCategory" onchange="window.onIMathFilterChange('category')" class="w-full h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none">
                                    <option value="all">Tất cả loại</option>
                                    <option value="Trắc nghiệm">Trắc nghiệm</option>
                                    <option value="Đúng-Sai">Đúng - Sai</option>
                                    <option value="Trả lời ngắn">Trả lời ngắn</option>
                                    <option value="Tự luận">Tự luận</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Mức độ</label>
                                <select id="imathFilterLevel" onchange="window.onIMathFilterChange('level')" class="w-full h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none">
                                    <option value="all">Tất cả mức</option>
                                    <option value="M1">Nhận biết (NB)</option>
                                    <option value="M2">Thông hiểu (TH)</option>
                                    <option value="M3">Vận dụng (VD)</option>
                                    <option value="M4">Vận dụng cao (VDC)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Tìm theo MapID / Mã câu / Từ khóa -->
                        <div>
                            <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">Tìm theo MapID / Mã câu / Tên dạng</label>
                            <div class="relative">
                                <input type="text" id="imathFilterKeyword" oninput="window.onIMathFilterChange('keyword')" placeholder="VD: 9H4V2-5, L09_C4_B2_57, HINH_..." class="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500">
                                <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
                            </div>
                        </div>

                        <!-- Lọc riêng câu có hình TikZ -->
                        <label class="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 cursor-pointer select-none">
                            <input type="checkbox" id="imathFilterOnlyTikz" onchange="window.onIMathFilterChange('tikz')" class="w-4 h-4 rounded text-amber-600 focus:ring-amber-500">
                            <div class="text-xs">
                                <div class="font-bold text-amber-900 dark:text-amber-200">🎨 Chỉ hiện dạng có hình TikZ</div>
                                <div class="text-[10px] text-amber-700 dark:text-amber-400">Hiển thị mã câu & nhóm hình để duyệt/thay TikZ</div>
                            </div>
                        </label>

                        <!-- Box hướng dẫn nhanh -->
                        <div class="mt-auto p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/50 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5">
                            <div class="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Chu trình chuẩn hóa Ngân hàng:
                            </div>
                            <p>1. Chọn dạng bài bên giữa để <b>sinh câu hỏi đổi số</b>.</p>
                            <p>2. Xem trước công thức & hình <b>TikZJax</b> bên phải, bấm <b>🔄 Đổi số</b> hoặc <b>Sửa LaTeX/TikZ</b> nếu cần.</p>
                            <p>3. Bấm <b>☁️ Nạp vào Ngân hàng</b> để cấp CCCD & dùng cho <i>Luyện tập, Tạo đề, Trò chơi</i>!</p>
                        </div>
                    </div>

                    <!-- Cột 2: Danh sách Dạng toán đổi số (4 cols) -->
                    <div class="lg:col-span-4 flex flex-col min-h-0 bg-white dark:bg-slate-900">
                        <div class="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-800/40">
                            <div class="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                                <i class="fa-solid fa-layer-group text-indigo-600"></i>
                                <span>Danh sách dạng toán (<span id="imathTopicCount" class="text-indigo-600">0</span>)</span>
                            </div>
                            <button type="button" onclick="window.generateRandomFromFilteredTopics(5)" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition cursor-pointer flex items-center gap-1" title="Bốc ngẫu nhiên 5 dạng trong danh sách đang lọc và sinh mỗi dạng 1 câu">
                                <i class="fa-solid fa-shuffle"></i> +5 câu ngẫu nhiên
                            </button>
                        </div>
                        <div id="imathTopicList" class="flex-1 overflow-y-auto p-3 space-y-2">
                            <!-- Danh sách dạng toán render tại đây -->
                        </div>
                    </div>

                    <!-- Cột 3: Bàn làm việc Xem trước, Đổi số & Chuẩn hóa (5 cols) -->
                    <div class="lg:col-span-5 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
                        <div class="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 bg-white dark:bg-slate-900">
                            <div class="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                <i class="fa-solid fa-eye text-emerald-600"></i>
                                <span>Câu hỏi đã sinh (<span id="imathWorkspaceCount" class="text-emerald-600">0</span> câu)</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <button type="button" onclick="window.rerollAllWorkspaceQuestions()" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold transition cursor-pointer flex items-center gap-1" title="Đổi bộ số mới cho toàn bộ câu hỏi đang có ở cột này">
                                    <i class="fa-solid fa-arrows-rotate"></i> Đổi số tất cả
                                </button>
                                <button type="button" onclick="window.clearIMathWorkspace()" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-[11px] font-bold transition cursor-pointer" title="Xóa danh sách">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>

                        <div id="imathWorkspaceList" class="flex-1 overflow-y-auto p-3.5 space-y-3">
                            <!-- Các câu hỏi đã sinh render tại đây -->
                        </div>

                        <!-- Thanh công cụ xuất / nạp dưới cùng -->
                        <div class="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap shrink-0">
                            <button type="button" onclick="window.downloadIMathWorkspaceTex()" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
                                <i class="fa-solid fa-file-export text-emerald-600"></i> Xuất file .tex
                            </button>
                            <div class="flex items-center gap-2 flex-wrap">
                                <button type="button" onclick="window.pushIMathWorkspaceToBank()" class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer" title="Đưa toàn bộ câu hỏi đã chuẩn hóa vào Ngân hàng câu hỏi R2 để dùng cho Luyện tập, Tạo đề và Trò chơi">
                                    <i class="fa-solid fa-cloud-arrow-up"></i> Nạp vào Ngân hàng (R2)
                                </button>
                                <button type="button" id="btnIMathInsertToExam" onclick="window.insertIMathWorkspaceToExam()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer">
                                    <i class="fa-solid fa-plus-circle"></i> Chèn vào Đề thi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    // ------------------------------------------------------------------
    // 3. LOGIC LỌC & HIỂN THỊ DANH SÁCH DẠNG TOÁN (CỘT 1 & CỘT 2)
    // ------------------------------------------------------------------
    function renderFilterControls() {
        const gradeBtns = document.querySelectorAll('.imath-grade-btn');
        gradeBtns.forEach(btn => {
            const g = btn.getAttribute('data-grade');
            if (g === state.filters.grade) {
                btn.className = 'imath-grade-btn py-1.5 rounded-lg text-xs font-bold border bg-indigo-600 text-white border-indigo-600 shadow-2xs cursor-pointer';
            } else {
                btn.className = 'imath-grade-btn py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 cursor-pointer';
            }
        });

        // Populate chapters for current grade
        const chapSelect = document.getElementById('imathFilterChapter');
        if (chapSelect) {
            const chapters = [];
            for (const it of state.catalog) {
                if (state.filters.grade === 'all' || it.grade === state.filters.grade) {
                    if (!chapters.includes(it.chapter)) chapters.push(it.chapter);
                }
            }
            chapSelect.innerHTML = '<option value="all">Tất cả các chương (' + chapters.length + ')</option>' +
                chapters.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            chapSelect.value = chapters.includes(state.filters.chapter) ? state.filters.chapter : 'all';
            state.filters.chapter = chapSelect.value;
        }

        // Populate lessons for current grade + chapter
        const lesSelect = document.getElementById('imathFilterLesson');
        if (lesSelect) {
            const lessons = [];
            for (const it of state.catalog) {
                if ((state.filters.grade === 'all' || it.grade === state.filters.grade) &&
                    (state.filters.chapter === 'all' || it.chapter === state.filters.chapter)) {
                    if (!lessons.includes(it.lesson)) lessons.push(it.lesson);
                }
            }
            lesSelect.innerHTML = '<option value="all">Tất cả các bài (' + lessons.length + ')</option>' +
                lessons.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
            lesSelect.value = lessons.includes(state.filters.lesson) ? state.filters.lesson : 'all';
            state.filters.lesson = lesSelect.value;
        }
    }

    function getFilteredTopics() {
        const kw = (state.filters.keyword || '').trim().toLowerCase();
        return state.catalog.filter(it => {
            // Nếu người dùng gõ mã câu cụ thể (L06..L09) hoặc HINH_ thì tìm xuyên khối
            const isDirectCodeSearch = kw && (kw.startsWith('l0') || kw.startsWith('hinh_') || /^[6-9][dhx][0-9]/i.test(kw));
            if (!isDirectCodeSearch && state.filters.grade !== 'all' && it.grade !== state.filters.grade) return false;
            if (!isDirectCodeSearch && state.filters.chapter !== 'all' && it.chapter !== state.filters.chapter) return false;
            if (!isDirectCodeSearch && state.filters.lesson !== 'all' && it.lesson !== state.filters.lesson) return false;
            if (state.filters.category !== 'all' && it.category !== state.filters.category) return false;
            if (state.filters.level !== 'all' && it.level !== state.filters.level) return false;
            if (state.filters.onlyTikz && !it.has_tikz) return false;
            if (kw) {
                const hay = `${it.tag} ${it.map_id} ${it.tikz_group_id || ''} ${it.title} ${it.lesson}`.toLowerCase();
                if (!hay.includes(kw)) return false;
            }
            return true;
        });
    }

    function getLevelBadgeClass(level) {
        switch (level) {
            case 'M1': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'M2': return 'bg-sky-50 text-sky-700 border-sky-200';
            case 'M3': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'M4': return 'bg-rose-50 text-rose-700 border-rose-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    }

    function renderTopicList() {
        const listEl = document.getElementById('imathTopicList');
        const countEl = document.getElementById('imathTopicCount');
        if (!listEl) return;

        const filtered = getFilteredTopics();
        if (countEl) countEl.textContent = String(filtered.length);

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div class="text-center py-12 text-slate-400 text-xs">
                    <i class="fa-solid fa-magnifying-glass text-3xl mb-2 opacity-40"></i>
                    <p>Không tìm thấy dạng toán nào khớp bộ lọc.</p>
                </div>
            `;
            return;
        }

        // Hiển thị tối đa 150 mục đầu tiên để giữ tốc độ cuộn mượt
        const shown = filtered.slice(0, 150);
        listEl.innerHTML = shown.map(it => {
            const tikzBadge = it.has_tikz
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${it.is_tikz_overridden ? 'bg-teal-100 text-teal-800 border border-teal-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}" title="Mã nhóm hình TikZ: ${escapeHtml(it.tikz_group_id || it.tag)}">
                        <i class="fa-solid fa-draw-polygon mr-0.5"></i>${escapeHtml(it.tikz_group_id || 'TikZ')}${it.is_tikz_overridden ? ' ✨' : ''}
                   </span>`
                : '';

            return `
                <div class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-white dark:bg-slate-800/90 shadow-2xs transition flex flex-col gap-1.5">
                    <div class="flex items-center justify-between gap-1.5 flex-wrap">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold" title="Mã định danh câu hỏi trong iMath">${escapeHtml(it.tag)}</span>
                            <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[10px] font-bold" title="Mã MapID chuẩn QMath">MapID: ${escapeHtml(it.map_id)}</span>
                            ${tikzBadge}
                        </div>
                        <span class="px-1.5 py-0.5 rounded border text-[10px] font-bold ${getLevelBadgeClass(it.level)}">${escapeHtml(it.category)} • ${escapeHtml(it.level_vi)}</span>
                    </div>
                    <div class="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug">${escapeHtml(it.title)}</div>
                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                        <span class="text-[10px] text-slate-500 truncate">${escapeHtml(it.lesson)}</span>
                        <div class="flex items-center gap-1 shrink-0">
                            <button type="button" onclick="window.addIMathQuestion('${escapeHtml(it.tag)}', 1)" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition cursor-pointer shadow-2xs">+1 câu</button>
                            <button type="button" onclick="window.addIMathQuestion('${escapeHtml(it.tag)}', 3)" class="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition cursor-pointer" title="Sinh 3 câu biến thể đổi số của dạng này">+3</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ------------------------------------------------------------------
    // 4. HIỂN THỊ PREVIEW TRỰC TIẾP (MATHJAX + TIKZJAX) Ở CỘT 3
    // ------------------------------------------------------------------
    function formatLatexPreviewHtml(latexBlock) {
        if (!latexBlock) return '';
        let s = String(latexBlock)
            .replace(/^\\begin\{ex\}(?:\s*%\[[^\]]*\])?\s*/i, '')
            .replace(/\\end\{ex\}\s*$/i, '');

        // Bóc tách \loigiai{...}
        let solutionHtml = '';
        const lgIdx = s.indexOf('\\loigiai');
        if (lgIdx !== -1) {
            const openBrace = s.indexOf('{', lgIdx);
            if (openBrace !== -1) {
                const solContent = s.slice(openBrace + 1).replace(/\}\s*$/, '').trim();
                s = s.slice(0, lgIdx).trim();
                solutionHtml = `
                    <details class="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                        <summary class="font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer select-none">💡 Xem lời giải chi tiết</summary>
                        <div class="mt-1.5 pl-2 border-l-2 border-emerald-400 whitespace-pre-line">${solContent}</div>
                    </details>
                `;
            }
        }

        // Bóc tách TikZ để nhúng <script type="text/tikz"> cho TikZJax vẽ trực tiếp
        let tikzScriptHtml = '';
        const tikzRegex = /((?:\\definecolor[^\n]+\n\s*)*\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/;
        const mTikz = s.match(tikzRegex);
        if (mTikz) {
            const rawTikz = mTikz[1].trim();
            s = s.replace(mTikz[0], '');
            tikzScriptHtml = `
                <div class="my-2 flex justify-center bg-white rounded-xl p-2 border border-slate-200 overflow-x-auto tikz-container">
                    <script type="text/tikz">${rawTikz}<\/script>
                </div>
            `;
        }

        // Gỡ vỏ \immini[thm]{STEM}{} nếu có
        s = s.replace(/^\\immini(?:\[[^\]]*\])?\{([\s\S]*?)\}\s*\{\s*\}/, '$1');

        // Format \shortans{...}
        s = s.replace(/\\shortans(?:\[[^\]]*\])?\{([^{}]*)\}/g, (_, ans) => {
            return `<div class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold"><i class="fa-solid fa-key"></i> Đáp án điền số: <span class="font-mono">${escapeHtml(ans || '(Trống)')}</span></div>`;
        });

        // Format \choice hoặc \choiceTF
        for (const [cmd, labels] of [['\\choiceTF', ['a)', 'b)', 'c)', 'd)']], ['\\choice', ['A.', 'B.', 'C.', 'D.']]]) {
            const pos = s.indexOf(cmd);
            if (pos === -1) continue;
            if (cmd === '\\choice' && s.slice(pos, pos + 9) === '\\choiceTF') continue;

            const stem = s.slice(0, pos).trim();
            let cursor = pos + cmd.length;
            const opts = [];
            while (opts.length < 4 && cursor < s.length) {
                const openIdx = s.indexOf('{', cursor);
                if (openIdx === -1) break;
                let depth = 0;
                let closeIdx = -1;
                for (let i = openIdx; i < s.length; i++) {
                    if (s[i] === '{' && (i === 0 || s[i - 1] !== '\\')) depth++;
                    else if (s[i] === '}' && (i === 0 || s[i - 1] !== '\\')) {
                        depth--;
                        if (depth === 0) {
                            closeIdx = i;
                            break;
                        }
                    }
                }
                if (closeIdx === -1) break;
                opts.push(s.slice(openIdx + 1, closeIdx).trim());
                cursor = closeIdx + 1;
            }
            if (opts.length === 4) {
                const gridCols = cmd === '\\choice' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1';
                const optsHtml = opts.map((opt, idx) => {
                    const isTrue = opt.includes('\\True');
                    const cleanOpt = opt.replace(/\\True\s*/g, '').trim();
                    const cls = isTrue
                        ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700';
                    return `<div class="p-2 rounded-lg border text-xs flex items-start gap-1.5 ${cls}">
                        <span class="font-bold ${isTrue ? 'text-emerald-700' : 'text-slate-500'}">${labels[idx]}</span>
                        <div class="flex-1">${cleanOpt}</div>
                        ${isTrue ? '<i class="fa-solid fa-circle-check text-emerald-600 text-xs mt-0.5" title="Đáp án đúng"></i>' : ''}
                    </div>`;
                }).join('');
                s = `<div class="whitespace-pre-line">${stem}</div><div class="grid ${gridCols} gap-1.5 mt-2">${optsHtml}</div>`;
                break;
            }
        }

        return `<div class="text-xs text-slate-800 dark:text-slate-100 leading-relaxed">${s}${tikzScriptHtml}${solutionHtml}</div>`;
    }

    function renderWorkspace() {
        const listEl = document.getElementById('imathWorkspaceList');
        const countEl = document.getElementById('imathWorkspaceCount');
        if (!listEl) return;

        if (countEl) countEl.textContent = String(state.workspaceQuestions.length);

        if (state.workspaceQuestions.length === 0) {
            listEl.innerHTML = `
                <div class="h-full flex flex-col items-center justify-center text-center py-16 text-slate-400 text-xs">
                    <div class="w-14 h-14 rounded-2xl bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center text-2xl mb-3 text-slate-400">
                        <i class="fa-solid fa-dice-d20"></i>
                    </div>
                    <p class="font-bold text-slate-600 dark:text-slate-300 text-sm mb-1">Chưa có câu hỏi nào trong bàn làm việc</p>
                    <p class="max-w-xs">Hãy bấm <b>+1 câu</b> hoặc <b>+3</b> ở danh sách dạng toán bên trái để sinh câu hỏi đổi số mới.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = state.workspaceQuestions.map((q, idx) => `
            <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <!-- Card Top Bar -->
                <div class="px-3 py-2 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[11px]">Câu ${idx + 1}</span>
                        <span class="px-2 py-0.5 rounded bg-slate-800 text-white font-mono text-[10px] font-bold" title="Mã câu để tra cứu/thay hình TikZ">[${escapeHtml(q.tag)}]</span>
                        ${q.tikz_group_id ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-mono text-[10px] font-bold">🎨 ${escapeHtml(q.tikz_group_id)}</span>` : ''}
                        <div class="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                            <span class="text-[10px] font-bold text-slate-500">MapID:</span>
                            <input type="text" value="${escapeHtml(q.map_id)}" onchange="window.updateIMathQuestionMapId(${idx}, this.value)" class="w-20 text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-400 bg-transparent outline-none" title="Chỉnh sửa mã MapID của câu hỏi này">
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="window.rerollSingleWorkspaceQuestion(${idx})" class="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold transition cursor-pointer flex items-center gap-1" title="Sinh bộ số ngẫu nhiên khác cho câu hỏi này">
                            <i class="fa-solid fa-dice"></i> Đổi số
                        </button>
                        <button type="button" onclick="window.toggleIMathQuestionCode(${idx})" class="px-2 py-1 rounded-lg bg-slate-200/70 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition cursor-pointer" title="Xem / Sửa trực tiếp mã LaTeX & TikZ">
                            <i class="fa-solid fa-code"></i> LaTeX
                        </button>
                        <button type="button" onclick="window.removeIMathWorkspaceQuestion(${idx})" class="w-6 h-6 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition cursor-pointer" title="Xóa câu này">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>

                <!-- Rendered MathJax + TikZJax Preview -->
                <div class="p-3" id="imathPreviewCard_${idx}">
                    ${formatLatexPreviewHtml(q.latex_mc)}
                </div>

                <!-- Raw LaTeX / TikZ Editor Drawer -->
                <div id="imathCodeDrawer_${idx}" class="${q.showCode ? '' : 'hidden'} p-3 bg-slate-900 text-slate-100 border-t border-slate-800 space-y-2">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-bold text-emerald-400"><i class="fa-solid fa-terminal mr-1"></i>Mã nguồn LaTeX chuẩn ex_test (${escapeHtml(q.tag)}):</span>
                        <span class="text-slate-400">Chỉnh sửa sẽ tự động cập nhật khung xem trước</span>
                    </div>
                    <textarea rows="7" onchange="window.updateIMathQuestionLatex(${idx}, this.value)" class="w-full p-2.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-xs border border-slate-700 outline-none focus:border-emerald-500">${escapeHtml(q.latex_mc)}</textarea>
                </div>
            </div>
        `).join('');

        // Trigger MathJax & TikZJax rendering
        setTimeout(() => {
            if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                window.MathJax.typesetPromise([listEl]).catch(() => {});
            }
            if (typeof window.renderTikz === 'function') {
                window.renderTikz(listEl);
            }
        }, 60);
    }

    // ------------------------------------------------------------------
    // 5. CÁC HÀM TƯƠNG TÁC & KẾT NỐI VỚI NGÂN HÀNG CÂU HỎI / ĐỀ THI
    // ------------------------------------------------------------------
    window.openIMathStudioModal = async function (mode = 'editor', initialMapIdOrTag = '') {
        state.mode = mode;
        const modal = ensureModalDOM();
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Ẩn/hiện nút "Chèn vào Đề thi" tùy theo đang mở ở dashboard hay exam-editor
        const btnInsertExam = document.getElementById('btnIMathInsertToExam');
        if (btnInsertExam) {
            const isExamEditorPage = window.location.pathname.includes('exam-editor') || typeof window.parseLatexContent === 'function';
            btnInsertExam.style.display = isExamEditorPage ? 'inline-flex' : 'none';
        }

        checkLocalBridge();
        await ensureCatalogLoaded();

        if (initialMapIdOrTag) {
            state.filters.keyword = initialMapIdOrTag.trim();
            const kwInput = document.getElementById('imathFilterKeyword');
            if (kwInput) kwInput.value = state.filters.keyword;
        }

        renderFilterControls();
        renderTopicList();
        renderWorkspace();
    };

    window.closeIMathStudioModal = function () {
        const modal = document.getElementById('imathStudioModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };

    window.setIMathGrade = function (grade) {
        state.filters.grade = grade;
        state.filters.chapter = 'all';
        state.filters.lesson = 'all';
        renderFilterControls();
        renderTopicList();
    };

    window.onIMathFilterChange = function (field) {
        if (field === 'chapter') {
            state.filters.chapter = document.getElementById('imathFilterChapter')?.value || 'all';
            state.filters.lesson = 'all';
            renderFilterControls();
        } else if (field === 'lesson') {
            state.filters.lesson = document.getElementById('imathFilterLesson')?.value || 'all';
        } else if (field === 'category') {
            state.filters.category = document.getElementById('imathFilterCategory')?.value || 'all';
        } else if (field === 'level') {
            state.filters.level = document.getElementById('imathFilterLevel')?.value || 'all';
        } else if (field === 'keyword') {
            state.filters.keyword = document.getElementById('imathFilterKeyword')?.value || '';
        } else if (field === 'tikz') {
            state.filters.onlyTikz = Boolean(document.getElementById('imathFilterOnlyTikz')?.checked);
        }
        renderTopicList();
    };

    window.resetIMathFilters = function () {
        state.filters = {
            grade: 'Toán 9',
            chapter: 'all',
            lesson: 'all',
            category: 'all',
            level: 'all',
            onlyTikz: false,
            keyword: ''
        };
        const kw = document.getElementById('imathFilterKeyword');
        if (kw) kw.value = '';
        const tk = document.getElementById('imathFilterOnlyTikz');
        if (tk) tk.checked = false;
        const cat = document.getElementById('imathFilterCategory');
        if (cat) cat.value = 'all';
        const lvl = document.getElementById('imathFilterLevel');
        if (lvl) lvl.value = 'all';
        renderFilterControls();
        renderTopicList();
    };

    window.addIMathQuestion = async function (tag, count = 1) {
        const items = await generateVariantsForTag(tag, count);
        if (!items || items.length === 0) {
            notify(`Không tìm thấy dữ liệu cho dạng ${tag}`, 'warning');
            return;
        }
        for (const it of items) {
            state.workspaceQuestions.push({
                ...it,
                id: 'imath_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                showCode: false
            });
        }
        renderWorkspace();
        notify(`Đã sinh ${items.length} câu hỏi đổi số cho mã [${tag}]!`, 'success');
    };

    window.generateRandomFromFilteredTopics = async function (total = 5) {
        const filtered = getFilteredTopics();
        if (filtered.length === 0) {
            notify('Danh sách lọc đang trống!', 'warning');
            return;
        }
        const pool = filtered.slice();
        for (let i = 0; i < total; i++) {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const items = await generateVariantsForTag(pick.tag, 1);
            if (items.length > 0) {
                state.workspaceQuestions.push({
                    ...items[0],
                    id: 'imath_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    showCode: false
                });
            }
        }
        renderWorkspace();
        notify(`Đã sinh ngẫu nhiên ${total} câu hỏi đổi số!`, 'success');
    };

    window.rerollSingleWorkspaceQuestion = async function (idx) {
        const cur = state.workspaceQuestions[idx];
        if (!cur) return;
        const items = await generateVariantsForTag(cur.tag, 1);
        if (items.length > 0) {
            const customMapId = cur.map_id;
            state.workspaceQuestions[idx] = {
                ...items[0],
                map_id: customMapId,
                latex_mc: items[0].latex_mc.replace(/^\\begin\{ex\}(?:\s*%\[[^\]]*\])?/, `\\begin{ex}%[${customMapId}]`),
                id: cur.id,
                showCode: cur.showCode
            };
            renderWorkspace();
            notify(`Đã đổi bộ số mới cho Câu ${idx + 1} ([${cur.tag}])!`, 'success');
        }
    };

    window.rerollAllWorkspaceQuestions = async function () {
        if (state.workspaceQuestions.length === 0) return;
        for (let i = 0; i < state.workspaceQuestions.length; i++) {
            const cur = state.workspaceQuestions[i];
            const items = await generateVariantsForTag(cur.tag, 1);
            if (items.length > 0) {
                const customMapId = cur.map_id;
                state.workspaceQuestions[i] = {
                    ...items[0],
                    map_id: customMapId,
                    latex_mc: items[0].latex_mc.replace(/^\\begin\{ex\}(?:\s*%\[[^\]]*\])?/, `\\begin{ex}%[${customMapId}]`),
                    id: cur.id,
                    showCode: cur.showCode
                };
            }
        }
        renderWorkspace();
        notify(`Đã đổi bộ số mới cho toàn bộ ${state.workspaceQuestions.length} câu hỏi!`, 'success');
    };

    window.updateIMathQuestionMapId = function (idx, newMapId) {
        const q = state.workspaceQuestions[idx];
        if (!q) return;
        const cleanId = (newMapId || '').trim().toUpperCase();
        q.map_id = cleanId;
        q.latex_mc = q.latex_mc.replace(/^\\begin\{ex\}(?:\s*%\[[^\]]*\])?/, `\\begin{ex}%[${cleanId}]`);
        const drawer = document.querySelector(`#imathCodeDrawer_${idx} textarea`);
        if (drawer) drawer.value = q.latex_mc;
    };

    window.updateIMathQuestionLatex = function (idx, newLatex) {
        const q = state.workspaceQuestions[idx];
        if (!q) return;
        q.latex_mc = newLatex;
        const m = newLatex.match(/^\\begin\{ex\}\s*%\[([^\]]+)\]/);
        if (m) q.map_id = m[1].trim();
        renderWorkspace();
    };

    window.toggleIMathQuestionCode = function (idx) {
        const q = state.workspaceQuestions[idx];
        if (!q) return;
        q.showCode = !q.showCode;
        const drawer = document.getElementById(`imathCodeDrawer_${idx}`);
        if (drawer) drawer.classList.toggle('hidden', !q.showCode);
    };

    window.removeIMathWorkspaceQuestion = function (idx) {
        state.workspaceQuestions.splice(idx, 1);
        renderWorkspace();
    };

    window.clearIMathWorkspace = function () {
        state.workspaceQuestions = [];
        renderWorkspace();
    };

    window.downloadIMathWorkspaceTex = function () {
        if (state.workspaceQuestions.length === 0) {
            notify('Chưa có câu hỏi nào để xuất file .tex!', 'warning');
            return;
        }
        const content = state.workspaceQuestions.map((q, i) => `% === Câu ${i + 1} | Mã iMath: [${q.tag}] | MapID: ${q.map_id} ===\n${q.latex_mc}`).join('\n\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cau_Hoi_Doi_So_QMath_${new Date().toISOString().slice(0, 10)}.tex`;
        a.click();
        URL.revokeObjectURL(url);
    };

    /**
     * Chèn toàn bộ câu hỏi trong bàn làm việc vào Đề thi hiện tại (exam-editor.html)
     */
    window.insertIMathWorkspaceToExam = function () {
        if (state.workspaceQuestions.length === 0) {
            notify('Hãy chọn ít nhất 1 dạng toán để sinh câu hỏi trước khi chèn!', 'warning');
            return;
        }
        const combinedTex = state.workspaceQuestions.map(q => q.latex_mc).join('\n\n');
        if (typeof window.parseLatexContent === 'function') {
            window.parseLatexContent(combinedTex);
            window.closeIMathStudioModal();
            notify(`Đã chèn ${state.workspaceQuestions.length} câu hỏi đổi số vào đề thi!`, 'success');
        } else {
            notify('Chức năng chèn trực tiếp chỉ khả dụng trong trang Soạn Đề Thi (exam-editor.html).', 'warning');
        }
    };

    /**
     * Đưa toàn bộ câu hỏi đã chuẩn hóa vào Ngân hàng câu hỏi R2 (dashboard.html hoặc exam-editor.html)
     */
    window.pushIMathWorkspaceToBank = function () {
        if (state.workspaceQuestions.length === 0) {
            notify('Chưa có câu hỏi nào trong danh sách để nạp vào Ngân hàng!', 'warning');
            return;
        }
        const combinedTex = state.workspaceQuestions.map(q => q.latex_mc).join('\n\n');

        // Trường hợp 1: Đang ở trang Dashboard (có sẵn #bankDirectImportModal)
        const bankTexInput = document.getElementById('bankTexInput');
        if (bankTexInput && typeof window.openBankDirectImportModal === 'function') {
            window.closeIMathStudioModal();
            window.openBankDirectImportModal('tex');
            bankTexInput.value = combinedTex;
            if (typeof window.parseBankTexQuestions === 'function') {
                window.parseBankTexQuestions();
            }
            notify(`Đã chuyển ${state.workspaceQuestions.length} câu hỏi đổi số sang Hàng đợi Nạp Ngân hàng (tự động cấp CCCD & MapID)!`, 'success');
            return;
        }

        // Trường hợp 2: Đang ở trang Exam Editor -> Chèn vào đề thi và mở hộp thoại Lưu Bank
        if (typeof window.parseLatexContent === 'function') {
            window.parseLatexContent(combinedTex);
            window.closeIMathStudioModal();
            if (typeof window.saveCurrentQuestionsToBank === 'function') {
                setTimeout(() => window.saveCurrentQuestionsToBank(), 300);
            } else {
                notify(`Đã chèn ${state.workspaceQuestions.length} câu vào đề thi. Bấm "Lưu Bank" trên thanh công cụ để đồng bộ lên R2!`, 'success');
            }
        }
    };

    /**
     * Đổi số nhanh cho câu hỏi đang chọn trong exam-editor.html dựa trên MapID của câu đó
     */
    window.openIMathForCurrentEditorQuestion = async function () {
        const mapIdInput = document.getElementById('editMapId') || document.getElementById('editorMapId');
        const mapId = (mapIdInput?.value || '').trim();
        await window.openIMathStudioModal('editor', mapId);
    };

    // ------------------------------------------------------------------
    // 6. TỰ ĐỘNG GẮN NÚT VÀO GIAO DIỆN DASHBOARD & EXAM-EDITOR
    // ------------------------------------------------------------------
    function injectEntryButtons() {
        // 1. Trong dashboard.html (#view-questionbank)
        const bankDropdownContainer = document.getElementById('bankImportDropdownContainer');
        if (bankDropdownContainer && !document.getElementById('btnOpenIMathStudioBank')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btnOpenIMathStudioBank';
            btn.onclick = () => window.openIMathStudioModal('bank');
            btn.className = 'btn-season-primary h-9 md:h-10 px-3 md:px-3.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer shadow-2xs';
            btn.style.background = 'linear-gradient(135deg, #4f46e5, #0d9488)';
            btn.title = 'Mở Xưởng Tạo Câu Hỏi Theo Dạng (Đổi số thông minh chuẩn MapID) để nạp vào Ngân hàng';
            btn.innerHTML = '<i class="fa-solid fa-dice text-sm"></i> <span>Tạo câu đổi số (iMath)</span>';
            bankDropdownContainer.parentNode.insertBefore(btn, bankDropdownContainer.nextSibling);
        }

        // 2. Trong exam-editor.html (Thanh công cụ trên + Dropzone rỗng + Ô MapID)
        const dropdownImportExport = document.getElementById('dropdownImportExport');
        if (dropdownImportExport && !document.getElementById('btnOpenIMathStudioEditor')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btnOpenIMathStudioEditor';
            btn.onclick = () => window.openIMathStudioModal('editor');
            btn.className = 'h-8 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer';
            btn.title = 'Tạo câu hỏi theo dạng (Đổi số chuẩn MapID)';
            btn.innerHTML = '<i class="fa-solid fa-dice text-indigo-600 text-xs"></i> <span>Đổi số</span>';
            dropdownImportExport.parentNode.insertBefore(btn, dropdownImportExport);
        }

        const emptyDropzone = document.querySelector('#previewEmptyDropzone .flex.flex-wrap.items-center.justify-center.gap-2');
        if (emptyDropzone && !document.getElementById('btnEmptyDropzoneIMath')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btnEmptyDropzoneIMath';
            btn.onclick = () => window.openIMathStudioModal('editor');
            btn.className = 'px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer';
            btn.innerHTML = '<i class="fa-solid fa-dice text-indigo-600"></i> Tạo câu đổi số (Theo dạng)';
            emptyDropzone.appendChild(btn);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectEntryButtons);
    } else {
        injectEntryButtons();
    }
})();
