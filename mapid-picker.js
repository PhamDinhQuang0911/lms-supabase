/**
 * mapid-picker.js - Modal chọn MapID trực quan từ Cây Ma Trận Kiến Thức
 * Hỗ trợ chọn thủ công đa cấp (Lớp -> Phân môn -> Chương -> Bài -> Dạng -> Mức độ)
 * Tạo mã chuẩn: [Lớp][Môn][Chương][Mức độ][Bài]-[Dạng] (VD: 9D1H2-1)
 * Dùng chung cho: exam-editor.html, dashboard.html, book-manager.html...
 */
(function(global) {
    'use strict';
    const window = global;

    let modalInstance = null;

    /**
     * Tự động tải cây MapID nếu chưa có
     */
    async function ensureIdTree() {
        if (window.globalIdTree && Array.isArray(window.globalIdTree) && window.globalIdTree.length > 0) {
            return window.globalIdTree;
        }

        // Kiểm tra LocalStorage
        try {
            const cached = localStorage.getItem('lms_cached_mapid_tree');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    window.globalIdTree = parsed;
                    return parsed;
                }
            }
        } catch(e) {}

        // Tải từ Firestore
        try {
            const db = window.firebaseDb || window.db || window._examDb;
            const docFn = window.firestoreDoc || window.doc;
            const getDocFn = window.firestoreGetDoc || window.getDoc;
            if (db && docFn && getDocFn) {
                const snap = await getDocFn(docFn(db, "configurations", "map_id_tree"));
                if (snap && snap.exists && snap.exists()) {
                    const tree = snap.data().tree || [];
                    window.globalIdTree = tree;
                    try { localStorage.setItem('lms_cached_mapid_tree', JSON.stringify(tree)); } catch(e) {}
                    return tree;
                }
            }
        } catch(e) {
            console.warn("Lỗi tải MapID tree từ Firestore:", e);
        }

        return window.globalIdTree || [];
    }

    /**
     * Phân tích một chuỗi MapID có sẵn để pre-select (VD: 9D1H2-1 hoặc 9D1N1-1)
     */
    function parseExistingMapId(mapIdStr) {
        if (!mapIdStr) return null;
        const clean = String(mapIdStr).trim().toUpperCase();
        // Regex: (Lớp: d+)(Môn: [A-Z]+)(Chương: d+)(Mức: [NHVC])(Bài: d+)(?:-(d+))?
        const m = clean.match(/^(d+)([A-Z]+)(d+)([NHVC])(d+)(?:-(d+))?$/);
        if (m) {
            return {
                grade: m[1],
                subject: m[2],
                chapter: m[3],
                level: m[4],
                lesson: m[5],
                type: m[6] || '1'
            };
        }
        return null;
    }

    /**
     * Hiển thị modal chọn MapID
     * @param {Object} options
     *   - initialMapId: chuỗi MapID đang có (tùy chọn)
     *   - title: tiêu đề modal
     *   - onSelect: function(mapId, nodeDetails)
     */
    async function showMapIdTreePicker(options = {}) {
        const tree = await ensureIdTree();
        if (!tree || tree.length === 0) {
            const msg = 'Chưa tải được Cây MapID từ hệ thống. Vui lòng kiểm tra kết nối mạng!';
            if (window.showToast) window.showToast(msg, 'warning');
            else if (window.showNotification) window.showNotification(msg, 'warning');
            else alert(msg);
            return;
        }

        // Xóa modal cũ nếu có
        if (modalInstance && modalInstance.parentNode) {
            modalInstance.parentNode.removeChild(modalInstance);
            modalInstance = null;
        }

        const preParsed = parseExistingMapId(options.initialMapId);
        let selectedGrade = preParsed?.grade || '9';
        let selectedSubject = preParsed?.subject || '';
        let selectedChapter = preParsed?.chapter || '';
        let selectedLesson = preParsed?.lesson || '';
        let selectedType = preParsed?.type || '';
        let selectedLevel = preParsed?.level || 'H'; // Mặc định Thông hiểu (H)

        // Modal container
        const modal = document.createElement('div');
        modal.id = 'mapIdPickerModal';
        modal.className = 'fixed inset-0 z-[120] flex items-center justify-center bg-gray-900/60 backdrop-blur-xs p-4 select-none animate-fadeIn';

        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-100 transform transition-all scale-100">
                <!-- Header -->
                <div class="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shadow-inner">
                            <i class="fa-solid fa-network-wired"></i>
                        </div>
                        <div>
                            <h3 class="font-black text-base leading-tight">${options.title || 'Chọn MapID từ Cây Ma Trận Kiến Thức'}</h3>
                            <p class="text-xs text-emerald-100 font-medium">Chuẩn hóa cấu trúc 6 cấp độ: [Lớp][Môn][Chương][Mức độ][Bài]-[Dạng]</p>
                        </div>
                    </div>
                    <button type="button" id="btnCloseMapIdPicker" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>

                <!-- Body -->
                <div class="p-5 flex-1 overflow-y-auto space-y-4 text-sm bg-gray-50/50 custom-scrollbar">
                    
                    <!-- Search input -->
                    <div>
                        <div class="relative">
                            <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 text-xs"></i>
                            <input type="text" id="pickerSearchNode" placeholder="Tìm nhanh bài học, dạng toán (VD: hàm số, căn thức, pitago...)" class="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-hidden">
                        </div>
                        <div id="pickerSearchResults" class="hidden mt-1.5 max-h-36 overflow-y-auto bg-white border border-teal-200 rounded-xl shadow-md p-1 space-y-1 text-xs"></div>
                    </div>

                    <!-- Cascading selections -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                        <!-- Cấp 0: Lớp -->
                        <div>
                            <label class="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                                <span class="w-4 h-4 rounded-full bg-teal-100 text-teal-800 text-[10px] inline-flex items-center justify-center font-black">1</span>
                                Khối / Lớp
                            </label>
                            <select id="selPickerGrade" class="w-full p-2 border border-gray-300 rounded-lg text-xs font-bold bg-white focus:ring-2 focus:ring-teal-500 outline-hidden"></select>
                        </div>

                        <!-- Cấp 1: Phân môn -->
                        <div>
                            <label class="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                                <span class="w-4 h-4 rounded-full bg-teal-100 text-teal-800 text-[10px] inline-flex items-center justify-center font-black">2</span>
                                Phân môn
                            </label>
                            <select id="selPickerSubject" class="w-full p-2 border border-gray-300 rounded-lg text-xs font-bold bg-white focus:ring-2 focus:ring-teal-500 outline-hidden"></select>
                        </div>

                        <!-- Cấp 2: Chương -->
                        <div>
                            <label class="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                                <span class="w-4 h-4 rounded-full bg-teal-100 text-teal-800 text-[10px] inline-flex items-center justify-center font-black">3</span>
                                Chương
                            </label>
                            <select id="selPickerChapter" class="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-teal-500 outline-hidden"></select>
                        </div>

                        <!-- Cấp 3: Bài học -->
                        <div>
                            <label class="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                                <span class="w-4 h-4 rounded-full bg-teal-100 text-teal-800 text-[10px] inline-flex items-center justify-center font-black">4</span>
                                Bài học
                            </label>
                            <select id="selPickerLesson" class="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-teal-500 outline-hidden"></select>
                        </div>

                        <!-- Cấp 4: Dạng toán -->
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-600 mb-1 flex items-center gap-1">
                                <span class="w-4 h-4 rounded-full bg-teal-100 text-teal-800 text-[10px] inline-flex items-center justify-center font-black">5</span>
                                Dạng toán
                            </label>
                            <select id="selPickerType" class="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-teal-500 outline-hidden"></select>
                        </div>
                    </div>

                    <!-- Mức độ nhận thức -->
                    <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                        <label class="block text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                            <span class="w-4 h-4 rounded-full bg-teal-100 text-teal-800 text-[10px] inline-flex items-center justify-center font-black">6</span>
                            Mức độ tư duy
                        </label>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" id="pickerLevelButtons">
                            <button type="button" data-level="N" class="level-btn p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${selectedLevel === 'N' ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold ring-2 ring-emerald-200' : 'border-gray-200 hover:border-gray-300 text-gray-700'}">
                                <span class="text-xs font-black">Nhận biết (N)</span>
                                <span class="text-[10px] text-gray-500">Mức NB</span>
                            </button>
                            <button type="button" data-level="H" class="level-btn p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${selectedLevel === 'H' ? 'border-blue-500 bg-blue-50 text-blue-800 font-bold ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300 text-gray-700'}">
                                <span class="text-xs font-black">Thông hiểu (H)</span>
                                <span class="text-[10px] text-gray-500">Mức TH</span>
                            </button>
                            <button type="button" data-level="V" class="level-btn p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${selectedLevel === 'V' ? 'border-amber-500 bg-amber-50 text-amber-800 font-bold ring-2 ring-amber-200' : 'border-gray-200 hover:border-gray-300 text-gray-700'}">
                                <span class="text-xs font-black">Vận dụng (V)</span>
                                <span class="text-[10px] text-gray-500">Mức VD</span>
                            </button>
                            <button type="button" data-level="C" class="level-btn p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${selectedLevel === 'C' ? 'border-rose-500 bg-rose-50 text-rose-800 font-bold ring-2 ring-rose-200' : 'border-gray-200 hover:border-gray-300 text-gray-700'}">
                                <span class="text-xs font-black">Vận dụng cao (C)</span>
                                <span class="text-[10px] text-gray-500">Mức VDC</span>
                            </button>
                        </div>
                    </div>

                    <!-- Live MapID Preview Box -->
                    <div class="bg-gradient-to-r from-gray-900 to-slate-800 text-white p-4 rounded-xl shadow-md flex items-center justify-between gap-3">
                        <div>
                            <span class="text-[11px] text-gray-300 uppercase tracking-wider block font-bold">Mã MapID chuẩn tạo ra:</span>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span id="lblPickerResultMapId" class="text-xl font-black font-mono text-emerald-400 tracking-wider">------</span>
                                <button type="button" id="btnPickerCopy" class="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[11px] text-gray-200 transition" title="Sao chép mã này"><i class="fa-solid fa-copy"></i></button>
                            </div>
                            <p id="lblPickerPathInfo" class="text-xs text-gray-300 mt-1 truncate max-w-md">Chưa chọn đầy đủ các cấp</p>
                        </div>
                        <div class="shrink-0 text-right">
                            <span id="lblPickerLevelBadge" class="inline-block px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">Thông hiểu</span>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="p-4 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
                    <button type="button" id="btnPickerCancel" class="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100 transition">Hủy bỏ</button>
                    <button type="button" id="btnPickerApply" class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-600/30 transition flex items-center gap-1.5">
                        <i class="fa-solid fa-check"></i> Áp dụng MapID này
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modalInstance = modal;

        // Elements
        const selGrade = modal.querySelector('#selPickerGrade');
        const selSubject = modal.querySelector('#selPickerSubject');
        const selChapter = modal.querySelector('#selPickerChapter');
        const selLesson = modal.querySelector('#selPickerLesson');
        const selType = modal.querySelector('#selPickerType');
        const lblResultMapId = modal.querySelector('#lblPickerResultMapId');
        const lblPathInfo = modal.querySelector('#lblPickerPathInfo');
        const lblLevelBadge = modal.querySelector('#lblPickerLevelBadge');

        // Hàm điền options vào select
        function populateSelect(selectEl, nodes, selectedId = '', defaultLabel = '--- Chọn ---') {
            selectEl.innerHTML = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = defaultLabel;
            selectEl.appendChild(defaultOpt);

            if (!Array.isArray(nodes)) return;
            nodes.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n.id;
                opt.textContent = n.name ? (n.name.startsWith(n.id) ? n.name : `[${n.id}] ${n.name}`) : n.id;
                if (String(n.id) === String(selectedId)) opt.selected = true;
                selectEl.appendChild(opt);
            });
        }

        // Cập nhật Cấp 0: Lớp
        populateSelect(selGrade, tree, selectedGrade, 'Chọn Lớp');
        if (!selGrade.value && tree.length > 0) {
            selGrade.value = tree[0].id;
        }

        function getActiveGradeNode() {
            return tree.find(n => String(n.id) === String(selGrade.value));
        }
        function getActiveSubjectNode() {
            const g = getActiveGradeNode();
            return g?.children?.find(n => String(n.id) === String(selSubject.value));
        }
        function getActiveChapterNode() {
            const s = getActiveSubjectNode();
            return s?.children?.find(n => String(n.id) === String(selChapter.value));
        }
        function getActiveLessonNode() {
            const c = getActiveChapterNode();
            return c?.children?.find(n => String(n.id) === String(selLesson.value));
        }

        function updateSubjects() {
            const gNode = getActiveGradeNode();
            populateSelect(selSubject, gNode?.children || [], selectedSubject, 'Chọn Phân môn');
            if (!selSubject.value && gNode?.children?.length > 0) {
                selSubject.value = gNode.children[0].id;
            }
            updateChapters();
        }

        function updateChapters() {
            const sNode = getActiveSubjectNode();
            populateSelect(selChapter, sNode?.children || [], selectedChapter, 'Chọn Chương');
            if (!selChapter.value && sNode?.children?.length > 0) {
                selChapter.value = sNode.children[0].id;
            }
            updateLessons();
        }

        function updateLessons() {
            const cNode = getActiveChapterNode();
            populateSelect(selLesson, cNode?.children || [], selectedLesson, 'Chọn Bài học');
            if (!selLesson.value && cNode?.children?.length > 0) {
                selLesson.value = cNode.children[0].id;
            }
            updateTypes();
        }

        function updateTypes() {
            const lNode = getActiveLessonNode();
            populateSelect(selType, lNode?.children || [], selectedType, 'Dạng 1 (Mặc định)');
            updateResult();
        }

        function updateResult() {
            const g = selGrade.value || '';
            const s = selSubject.value || '';
            const c = selChapter.value || '';
            const l = selLesson.value || '';
            const t = selType.value || '1';
            const lv = selectedLevel;

            // Đặt tên hiển thị mức độ
            const levelNames = { 'N': 'Nhận biết', 'H': 'Thông hiểu', 'V': 'Vận dụng', 'C': 'Vận dụng cao' };
            const levelColors = {
                'N': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
                'H': 'bg-blue-500/20 text-blue-300 border-blue-400/30',
                'V': 'bg-amber-500/20 text-amber-300 border-amber-400/30',
                'C': 'bg-rose-500/20 text-rose-300 border-rose-400/30'
            };

            lblLevelBadge.textContent = levelNames[lv] || 'Thông hiểu';
            lblLevelBadge.className = `inline-block px-3 py-1 rounded-full text-xs font-black border ${levelColors[lv] || ''}`;

            if (g && s && c && l) {
                const generatedId = `${g}${s}${c}${lv}${l}-${t}`;
                lblResultMapId.textContent = generatedId;

                const gName = getActiveGradeNode()?.name || `Lớp ${g}`;
                const sName = getActiveSubjectNode()?.name || s;
                const cName = getActiveChapterNode()?.name || `Chương ${c}`;
                const lName = getActiveLessonNode()?.name || `Bài ${l}`;
                const tName = lNodeTypesFind(t) || `Dạng ${t}`;

                lblPathInfo.textContent = `${gName} > ${sName} > ${cName} > ${lName} > ${tName}`;
            } else {
                lblResultMapId.textContent = `${g || '?'}${s || '?'}${c || '?'}${lv}${l || '?'}-${t || '1'}`;
                lblPathInfo.textContent = 'Vui lòng chọn đầy đủ Khối, Môn, Chương, Bài để sinh mã hoàn chỉnh!';
            }
        }

        function lNodeTypesFind(typeId) {
            const lNode = getActiveLessonNode();
            const found = lNode?.children?.find(n => String(n.id) === String(typeId));
            return found ? found.name : '';
        }

        // Listeners for dropdowns
        selGrade.addEventListener('change', () => { selectedGrade = selGrade.value; updateSubjects(); });
        selSubject.addEventListener('change', () => { selectedSubject = selSubject.value; updateChapters(); });
        selChapter.addEventListener('change', () => { selectedChapter = selChapter.value; updateLessons(); });
        selLesson.addEventListener('change', () => { selectedLesson = selLesson.value; updateTypes(); });
        selType.addEventListener('change', () => { selectedType = selType.value; updateResult(); });

        // Level buttons
        modal.querySelectorAll('.level-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedLevel = btn.dataset.level;
                modal.querySelectorAll('.level-btn').forEach(b => {
                    b.className = 'level-btn p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer border-gray-200 hover:border-gray-300 text-gray-700';
                });
                const colorMap = {
                    'N': 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold ring-2 ring-emerald-200',
                    'H': 'border-blue-500 bg-blue-50 text-blue-800 font-bold ring-2 ring-blue-200',
                    'V': 'border-amber-500 bg-amber-50 text-amber-800 font-bold ring-2 ring-amber-200',
                    'C': 'border-rose-500 bg-rose-50 text-rose-800 font-bold ring-2 ring-rose-200'
                };
                btn.className = `level-btn p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${colorMap[selectedLevel]}`;
                updateResult();
            });
        });

        // Search in tree
        const searchInput = modal.querySelector('#pickerSearchNode');
        const searchResults = modal.querySelector('#pickerSearchResults');

        searchInput.addEventListener('input', () => {
            const q = searchInput.value.trim().toLowerCase();
            if (!q) {
                searchResults.classList.add('hidden');
                searchResults.innerHTML = '';
                return;
            }

            // Duyệt cây tìm node khớp
            const matches = [];
            function walk(node, path) {
                const currentPath = [...path, node];
                if (node.name && node.name.toLowerCase().includes(q)) {
                    matches.push({ node, path: currentPath });
                }
                if (Array.isArray(node.children)) {
                    node.children.forEach(c => walk(c, currentPath));
                }
            }
            tree.forEach(g => walk(g, []));

            if (matches.length === 0) {
                searchResults.innerHTML = '<div class="p-2 text-gray-400 text-center">Không tìm thấy bài học hay dạng toán nào phù hợp.</div>';
                searchResults.classList.remove('hidden');
                return;
            }

            searchResults.innerHTML = matches.slice(0, 8).map((m, idx) => {
                const pathStr = m.path.map(p => p.name || p.id).join(' &gt; ');
                return `
                    <div class="search-item p-1.5 hover:bg-teal-50 rounded-lg cursor-pointer transition text-gray-700 flex items-center justify-between" data-idx="${idx}">
                        <div class="truncate pr-2 font-medium">${pathStr}</div>
                        <span class="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">Chọn</span>
                    </div>
                `;
            }).join('');
            searchResults.classList.remove('hidden');

            searchResults.querySelectorAll('.search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const idx = parseInt(item.dataset.idx, 10);
                    const matched = matches[idx];
                    if (matched) {
                        const p = matched.path;
                        if (p[0]) selGrade.value = p[0].id;
                        updateSubjects();
                        if (p[1]) selSubject.value = p[1].id;
                        updateChapters();
                        if (p[2]) selChapter.value = p[2].id;
                        updateLessons();
                        if (p[3]) selLesson.value = p[3].id;
                        updateTypes();
                        if (p[4]) selType.value = p[4].id;
                        updateResult();
                    }
                    searchResults.classList.add('hidden');
                    searchInput.value = '';
                });
            });
        });

        // Copy button
        modal.querySelector('#btnPickerCopy').addEventListener('click', () => {
            const text = lblResultMapId.textContent;
            navigator.clipboard.writeText(text).then(() => {
                if (window.showToast) window.showToast(`Đã sao chép mã ${text}`, 'success');
            });
        });

        // Close handlers
        const closeModal = () => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            modalInstance = null;
        };
        modal.querySelector('#btnCloseMapIdPicker').addEventListener('click', closeModal);
        modal.querySelector('#btnPickerCancel').addEventListener('click', closeModal);

        // Apply handler
        modal.querySelector('#btnPickerApply').addEventListener('click', () => {
            const finalMapId = lblResultMapId.textContent;
            if (!finalMapId || finalMapId.includes('?')) {
                if (window.showToast) window.showToast('Vui lòng chọn đầy đủ các cấp trước khi áp dụng!', 'warning');
                else alert('Vui lòng chọn đầy đủ các cấp trước khi áp dụng!');
                return;
            }

            closeModal();
            if (typeof options.onSelect === 'function') {
                options.onSelect(finalMapId, {
                    grade: selGrade.value,
                    subject: selSubject.value,
                    chapter: selChapter.value,
                    lesson: selLesson.value,
                    type: selType.value,
                    level: selectedLevel,
                    path: lblPathInfo.textContent
                });
            }
        });

        // Khởi tạo ban đầu
        updateSubjects();
    }

    // Export global
    window.showMapIdTreePicker = showMapIdTreePicker;

})(typeof window !== 'undefined' ? window : this);
