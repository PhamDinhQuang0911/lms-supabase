/**
 * math-palette.js - Thanh công cụ & Bảng Soạn thảo Công thức Toán học trực quan kiểu MathType (Modal & Inline)
 * & Hệ thống tương tác chọn/thay thế/dán ảnh trực tiếp vào câu hỏi LaTeX.
 * Dùng chung cho: exam-editor.html, dashboard.html (questionEditModal), book-manager.html...
 */
(function(global) {
    'use strict';
    const window = global;

    const CLOUDFLARE_UPLOAD_API = "https://upload-helper.phamngockhanh-942001.workers.dev/";

    // Danh mục các mẫu công thức toán học phân theo nhóm
    const PALETTE_GROUPS = [
        {
            id: 'basic',
            name: 'Cơ bản',
            icon: 'fa-solid fa-square-root-variable',
            templates: [
                { label: 'a/b', desc: 'Phân số', latex: '\\frac{#sel#}{?}', cursorOffset: -4 },
                { label: '√x', desc: 'Căn bậc hai', latex: '\\sqrt{#sel#?}', cursorOffset: -1 },
                { label: 'ⁿ√x', desc: 'Căn bậc n', latex: '\\sqrt[n]{#sel#?}', cursorOffset: -1 },
                { label: 'x²', desc: 'Số mũ', latex: '{#sel#?}^{2}', cursorOffset: -4 },
                { label: 'xⁿ', desc: 'Lũy thừa tổng quát', latex: '{#sel#?}^{n}', cursorOffset: -4 },
                { label: 'xᵢ', desc: 'Chỉ số dưới', latex: '{#sel#?}_{i}', cursorOffset: -4 },
                { label: 'xᵢⁿ', desc: 'Chỉ số trên và dưới', latex: '{#sel#?}_{i}^{n}', cursorOffset: -7 },
                { label: '±', desc: 'Cộng trừ', latex: '\\pm ' },
                { label: '∓', desc: 'Trừ cộng', latex: '\\mp ' },
                { label: '×', desc: 'Nhân', latex: '\\times ' },
                { label: '·', desc: 'Tích chấm', latex: '\\cdot ' },
                { label: '÷', desc: 'Chia', latex: '\\div ' },
                { label: '≠', desc: 'Khác', latex: '\\neq ' },
                { label: '≈', desc: 'Xấp xỉ', latex: '\\approx ' },
                { label: '≤', desc: 'Nhỏ hơn hoặc bằng', latex: '\\le ' },
                { label: '≥', desc: 'Lớn hơn hoặc bằng', latex: '\\ge ' },
                { label: '∞', desc: 'Vô cực', latex: '\\infty ' }
            ]
        },
        {
            id: 'systems',
            name: 'Hệ & Ngoặc',
            icon: 'fa-solid fa-brackets-curly',
            templates: [
                { label: '{ Hệ', desc: 'Hệ phương trình (\\heva)', latex: '\\heva{\n    & #sel#? \\\\\n    & \n}', cursorOffset: -12 },
                { label: '[ Hoặc', desc: 'Dấu hoặc (\\hoac)', latex: '\\hoac{\n    & #sel#? \\\\\n    & \n}', cursorOffset: -12 },
                { label: '( ... )', desc: 'Ngoặc tròn co giãn', latex: '\\left( #sel#? \\right)', cursorOffset: -8 },
                { label: '[ ... ]', desc: 'Ngoặc vuông co giãn', latex: '\\left[ #sel#? \\right]', cursorOffset: -8 },
                { label: '{ ... }', desc: 'Ngoặc nhọn co giãn', latex: '\\left\\{ #sel#? \\right\\}', cursorOffset: -9 },
                { label: '| ... |', desc: 'Trị tuyệt đối co giãn', latex: '\\left| #sel#? \\right|', cursorOffset: -8 },
                { label: '‖ ... ‖', desc: 'Chuẩn / Độ dài', latex: '\\left\\| #sel#? \\right\\|', cursorOffset: -9 }
            ]
        },
        {
            id: 'geometry',
            name: 'Hình học & Vector',
            icon: 'fa-solid fa-shapes',
            templates: [
                { label: 'v⃗', desc: 'Vector ngắn', latex: '\\vec{#sel#?}', cursorOffset: -1 },
                { label: 'AB⃗', desc: 'Vector dài (\\overrightarrow)', latex: '\\overrightarrow{#sel#?}', cursorOffset: -1 },
                { label: 'ABĈ', desc: 'Góc (\\widehat)', latex: '\\widehat{#sel#?}', cursorOffset: -1 },
                { label: 'AB⁀', desc: 'Cung tròn (\\wideparen)', latex: '\\wideparen{#sel#?}', cursorOffset: -1 },
                { label: 'Δ', desc: 'Tam giác (\\Delta)', latex: '\\Delta ' },
                { label: '⊥', desc: 'Vuông góc', latex: '\\perp ' },
                { label: '∥', desc: 'Song song', latex: '\\parallel ' },
                { label: '°', desc: 'Độ (đo góc)', latex: '^{\\circ}' },
                { label: 'π', desc: 'Số Pi', latex: '\\pi ' },
                { label: '∠', desc: 'Ký hiệu góc', latex: '\\angle ' }
            ]
        },
        {
            id: 'calculus',
            name: 'Giải tích',
            icon: 'fa-solid fa-chart-line',
            templates: [
                { label: '∫dx', desc: 'Tích phân bất định', latex: '\\int #sel#?\\, dx', cursorOffset: -6 },
                { label: '∫ₐᵇ', desc: 'Tích phân xác định', latex: '\\int_{a}^{b} {#sel#?}\\, dx', cursorOffset: -7 },
                { label: 'lim', desc: 'Giới hạn', latex: '\\lim_{x \\to x_0} {#sel#?}', cursorOffset: -1 },
                { label: 'lim₊', desc: 'Giới hạn bên phải', latex: '\\lim_{x \\to x_0^+} {#sel#?}', cursorOffset: -1 },
                { label: 'lim₋', desc: 'Giới hạn bên trái', latex: '\\lim_{x \\to x_0^-} {#sel#?}', cursorOffset: -1 },
                { label: '∑', desc: 'Tổng sigma', latex: '\\sum_{i=1}^{n} {#sel#?}', cursorOffset: -1 },
                { label: '∏', desc: 'Tích pi', latex: '\\prod_{i=1}^{n} {#sel#?}', cursorOffset: -1 },
                { label: 'f\'(x)', desc: 'Đạo hàm', latex: 'f\'(#sel#?)', cursorOffset: -1 },
                { label: "f''(x)", desc: 'Đạo hàm cấp hai', latex: "f''(#sel#?)", cursorOffset: -1 },
                { label: 'sin', desc: 'Hàm sin', latex: '\\sin(#sel#?)', cursorOffset: -1 },
                { label: 'cos', desc: 'Hàm cos', latex: '\\cos(#sel#?)', cursorOffset: -1 },
                { label: 'tan', desc: 'Hàm tan', latex: '\\tan(#sel#?)', cursorOffset: -1 },
                { label: 'cot', desc: 'Hàm cot', latex: '\\cot(#sel#?)', cursorOffset: -1 }
            ]
        },
        {
            id: 'sets',
            name: 'Tập hợp & Logic',
            icon: 'fa-solid fa-infinity',
            templates: [
                { label: '∈', desc: 'Thuộc', latex: '\\in ' },
                { label: '∉', desc: 'Không thuộc', latex: '\\notin ' },
                { label: '⊂', desc: 'Tập con', latex: '\\subset ' },
                { label: '⊆', desc: 'Tập con hoặc bằng', latex: '\\subseteq ' },
                { label: '∪', desc: 'Hợp', latex: '\\cup ' },
                { label: '∩', desc: 'Giao', latex: '\\cap ' },
                { label: '\\', desc: 'Hiệu tập hợp', latex: '\\setminus ' },
                { label: '∅', desc: 'Tập rỗng', latex: '\\emptyset ' },
                { label: 'ℝ', desc: 'Tập số thực', latex: '\\mathbb{R}' },
                { label: 'ℕ', desc: 'Tập số tự nhiên', latex: '\\mathbb{N}' },
                { label: 'ℤ', desc: 'Tập số nguyên', latex: '\\mathbb{Z}' },
                { label: 'ℚ', desc: 'Tập số hữu tỉ', latex: '\\mathbb{Q}' },
                { label: '⇒', desc: 'Suy ra', latex: '\\Rightarrow ' },
                { label: '⇔', desc: 'Tương đương', latex: '\\Leftrightarrow ' },
                { label: '∀', desc: 'Với mọi', latex: '\\forall ' },
                { label: '∃', desc: 'Tồn tại', latex: '\\exists ' }
            ]
        },
        {
            id: 'greek',
            name: 'Ký tự Hy Lạp',
            icon: 'fa-solid fa-font',
            templates: [
                { label: 'α', desc: 'alpha', latex: '\\alpha ' },
                { label: 'β', desc: 'beta', latex: '\\beta ' },
                { label: 'γ', desc: 'gamma', latex: '\\gamma ' },
                { label: 'δ', desc: 'delta', latex: '\\delta ' },
                { label: 'ε', desc: 'epsilon', latex: '\\varepsilon ' },
                { label: 'θ', desc: 'theta', latex: '\\theta ' },
                { label: 'λ', desc: 'lambda', latex: '\\lambda ' },
                { label: 'μ', desc: 'mu', latex: '\\mu ' },
                { label: 'π', desc: 'pi', latex: '\\pi ' },
                { label: 'σ', desc: 'sigma', latex: '\\sigma ' },
                { label: 'φ', desc: 'phi', latex: '\\varphi ' },
                { label: 'ω', desc: 'omega', latex: '\\omega ' },
                { label: 'Δ', desc: 'Delta hoa', latex: '\\Delta ' },
                { label: 'Ω', desc: 'Omega hoa', latex: '\\Omega ' }
            ]
        }
    ];

    // Đối tượng điều khiển chính
    const MathPalette = {
        activeTextarea: null,
        dialogTargetInput: null,
        dialogActiveGroupId: 'basic',
        selectedImageElement: null,
        selectedImageTargetTextarea: null,
        previewDebounceTimer: null,

        /**
         * Gán con trỏ hoặc ghi nhớ textarea đang được chỉnh sửa
         */
        registerTextarea(textareaEl) {
            if (!textareaEl) return;
            const focusHandler = () => { this.activeTextarea = textareaEl; };
            textareaEl.addEventListener('focus', focusHandler);
            textareaEl.addEventListener('click', focusHandler);
            textareaEl.addEventListener('keyup', focusHandler);
        },

        /**
         * Chèn một mẫu công thức LaTeX vào textarea đang active
         */
        insertTemplate(latexTpl, cursorOffset = 0, targetEl = null) {
            const ta = targetEl || this.activeTextarea || document.activeElement;
            if (!ta || (ta.tagName !== 'TEXTAREA' && ta.tagName !== 'INPUT')) {
                if (window.showToast) window.showToast('Vui lòng nhấp vào ô văn bản trước khi chọn công thức!', 'info');
                else if (window.showNotification) window.showNotification('Vui lòng nhấp vào ô văn bản trước khi chọn công thức!', 'info');
                return;
            }

            const start = ta.selectionStart || 0;
            const end = ta.selectionEnd || 0;
            const selectedText = ta.value.substring(start, end);

            let inserted = latexTpl;
            let targetCursor = start;

            // Xử lý placeholder #sel#
            if (inserted.includes('#sel#')) {
                inserted = inserted.replace('#sel#', selectedText);
            }

            // Xử lý vị trí con trỏ '?'
            if (inserted.includes('?')) {
                const qIdx = inserted.indexOf('?');
                inserted = inserted.replace('?', '');
                targetCursor = start + qIdx;
            } else if (cursorOffset !== 0) {
                targetCursor = start + inserted.length + cursorOffset;
            } else {
                targetCursor = start + inserted.length;
            }

            const oldVal = ta.value;
            ta.value = oldVal.substring(0, start) + inserted + oldVal.substring(end);
            ta.focus();
            ta.setSelectionRange(targetCursor, targetCursor);

            // Bắn sự kiện input để hệ thống tự động lưu & preview
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        },

        /**
         * =========================================================================
         * MODAL SOẠN THẢO CÔNG THỨC MATHTYPE TRỰC QUAN (MATH FORMULA MODAL BUILDER)
         * =========================================================================
         */

        /**
         * Đảm bảo DOM của Modal MathType đã tồn tại trong body
         */
        ensureDialogInDom() {
            let modal = document.getElementById('mathFormulaModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'mathFormulaModal';
            modal.className = 'fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 hidden opacity-0 transition-opacity duration-200';
            
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden transform scale-95 transition-transform duration-200">
                    <!-- Header -->
                    <div class="px-5 py-3.5 bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 text-white flex items-center justify-between shadow-xs">
                        <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs shadow-inner">
                                <i class="fa-solid fa-square-root-variable text-amber-300 text-base"></i>
                            </div>
                            <div>
                                <h3 class="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
                                    Soạn thảo Công thức MathType
                                </h3>
                                <p class="text-[11px] text-indigo-200 leading-none mt-0.5">Chọn ký hiệu hoặc gõ mã LaTeX → Kiểm tra trực quan → Bấm [Chèn vào bài]</p>
                            </div>
                        </div>
                        <button type="button" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer" onclick="window.MathPalette.closeFormulaDialog()">
                            <i class="fa-solid fa-xmark text-sm"></i>
                        </button>
                    </div>

                    <!-- Category Tabs -->
                    <div class="border-b border-gray-200 bg-gray-50/90 px-3 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar" id="modalPaletteTabs">
                        ${PALETTE_GROUPS.map((g, idx) => `
                            <button type="button" class="modal-palette-tab-btn px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${idx === 0 ? 'bg-white text-indigo-700 shadow-2xs border border-gray-200' : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-100'}" data-group="${g.id}">
                                <i class="${g.icon} text-[11px]"></i>
                                <span>${g.name}</span>
                            </button>
                        `).join('')}
                    </div>

                    <!-- Symbol Grid Body -->
                    <div class="p-3 bg-gray-50/50 border-b border-gray-200 max-h-36 overflow-y-auto custom-scrollbar" id="modalPaletteSymbolArea">
                        ${PALETTE_GROUPS.map((g, idx) => `
                            <div class="modal-group-grid grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 ${idx === 0 ? '' : 'hidden'}" id="modal-grid-${g.id}">
                                ${g.templates.map(tpl => `
                                    <button type="button" class="modal-sym-btn h-8 px-1.5 bg-white hover:bg-indigo-50 text-gray-800 hover:text-indigo-700 border border-gray-200 rounded-lg flex items-center justify-center font-bold text-xs transition-colors shadow-2xs hover:border-indigo-300 transform active:scale-95 cursor-pointer" title="${tpl.desc || tpl.label}" data-latex="${tpl.latex.replace(/"/g, '&quot;')}" data-offset="${tpl.cursorOffset || 0}">
                                        <span class="font-serif leading-none">${tpl.label}</span>
                                    </button>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>

                    <!-- Sandbox Editor & Live Preview -->
                    <div class="p-4 space-y-3.5 flex-1 overflow-y-auto bg-white">
                        <!-- Input LaTeX -->
                        <div>
                            <div class="flex items-center justify-between mb-1.5">
                                <label class="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                    <i class="fa-solid fa-code text-indigo-600"></i> Mã LaTeX công thức:
                                </label>
                                <div class="flex items-center gap-1.5">
                                    <button type="button" onclick="window.MathPalette.wrapModalInput('$', '$')" class="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-md border border-indigo-200 transition" title="Bọc dấu $...$">$...$</button>
                                    <button type="button" onclick="window.MathPalette.wrapModalInput('$$', '$$')" class="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold rounded-md border border-purple-200 transition" title="Bọc dấu $$...$$">$$...$$</button>
                                    <button type="button" onclick="window.MathPalette.clearModalInput()" class="px-2 py-0.5 text-gray-400 hover:text-red-600 text-[11px] font-bold transition flex items-center gap-1" title="Xóa toàn bộ nội dung công thức">
                                        <i class="fa-solid fa-trash-can"></i> Xóa trắng
                                    </button>
                                </div>
                            </div>
                            <textarea id="modalFormulaInput" rows="3" class="w-full p-3 border border-indigo-200 rounded-xl font-mono text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50/20 leading-relaxed" placeholder="Bấm chọn các ký hiệu ở trên hoặc gõ trực tiếp mã LaTeX (ví dụ: \\frac{a}{b}, \\sqrt{x^2+1}, \\int_0^1 f(x)dx...)..."></textarea>
                        </div>

                        <!-- Live Preview MathJax -->
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                    <i class="fa-solid fa-eye text-emerald-600"></i> Xem trước hiển thị trực quan:
                                </label>
                                <span class="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold flex items-center gap-1">
                                    <i class="fa-solid fa-check"></i> Biên dịch tức thì
                                </span>
                            </div>
                            <div id="modalFormulaPreview" class="p-4 bg-slate-50 border border-slate-200 rounded-xl min-h-[68px] flex items-center justify-center text-center text-gray-800 text-base overflow-x-auto shadow-inner">
                                <span class="text-gray-400 text-xs italic">Công thức sẽ hiển thị trực quan tại đây...</span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer Action Bar -->
                    <div class="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
                        <span class="text-[11px] text-gray-500 hidden sm:inline flex items-center gap-1">
                            <i class="fa-solid fa-circle-info text-blue-500"></i> Sẽ tự động chèn vào vị trí con trỏ của bài viết
                        </span>
                        <div class="flex items-center gap-2 ml-auto">
                            <button type="button" onclick="window.MathPalette.closeFormulaDialog()" class="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-xl font-bold text-xs transition cursor-pointer">
                                Hủy bỏ
                            </button>
                            <button type="button" onclick="window.MathPalette.confirmInsertFormula()" class="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs shadow-md hover:shadow-lg transition flex items-center gap-1.5 cursor-pointer transform active:scale-95">
                                <i class="fa-solid fa-check"></i> Chèn vào bài
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Bind sự kiện đổi Tab
            modal.querySelectorAll('.modal-palette-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const groupId = btn.dataset.group;
                    modal.querySelectorAll('.modal-palette-tab-btn').forEach(b => {
                        b.classList.remove('bg-white', 'text-indigo-700', 'shadow-2xs', 'border', 'border-gray-200');
                        b.classList.add('text-gray-600', 'hover:text-indigo-600', 'hover:bg-gray-100');
                    });
                    btn.classList.add('bg-white', 'text-indigo-700', 'shadow-2xs', 'border', 'border-gray-200');
                    btn.classList.remove('text-gray-600', 'hover:text-indigo-600', 'hover:bg-gray-100');

                    modal.querySelectorAll('.modal-group-grid').forEach(g => g.classList.add('hidden'));
                    const targetGrid = document.getElementById(`modal-grid-${groupId}`);
                    if (targetGrid) targetGrid.classList.remove('hidden');
                });
            });

            // Bind sự kiện bấm nút ký hiệu
            modal.querySelectorAll('.modal-sym-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const latex = btn.dataset.latex;
                    const offset = parseInt(btn.dataset.offset || 0, 10);
                    MathPalette.insertIntoModalFormulaInput(latex, offset);
                });
            });

            // Bind sự kiện gõ trong modal input
            const formulaInput = modal.querySelector('#modalFormulaInput');
            if (formulaInput) {
                formulaInput.addEventListener('input', () => {
                    MathPalette.triggerModalPreviewDebounced();
                });
            }

            // Bấm Esc để đóng modal
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                    MathPalette.closeFormulaDialog();
                }
            });

            // Bấm vào nền mờ để đóng modal
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    MathPalette.closeFormulaDialog();
                }
            });

            return modal;
        },

        /**
         * Mở bảng soạn thảo công thức MathType
         * @param {string|HTMLElement} targetInputOrId - Ô textarea/input cần chèn công thức vào
         */
        openFormulaDialog(targetInputOrId = null) {
            const modal = this.ensureDialogInDom();

            // Xác định target element
            let targetEl = null;
            if (typeof targetInputOrId === 'string') {
                targetEl = document.getElementById(targetInputOrId);
            } else if (targetInputOrId && targetInputOrId.nodeType) {
                targetEl = targetInputOrId;
            }
            if (!targetEl) {
                targetEl = this.activeTextarea || document.activeElement;
            }
            this.dialogTargetInput = targetEl;

            // Nếu người dùng đang bôi đen một đoạn text trong target textarea, đưa vào modal để sửa tiếp
            const formulaInput = modal.querySelector('#modalFormulaInput');
            let initialVal = '';
            if (targetEl && (targetEl.tagName === 'TEXTAREA' || targetEl.tagName === 'INPUT')) {
                const s = targetEl.selectionStart || 0;
                const e = targetEl.selectionEnd || 0;
                if (e > s) {
                    let sel = targetEl.value.substring(s, e).trim();
                    // Loại bỏ bọc $ nếu có
                    if (sel.startsWith('$') && sel.endsWith('$')) {
                        sel = sel.replace(/^[\$]+|[\$]+$/g, '').trim();
                    }
                    initialVal = sel;
                }
            }
            if (formulaInput) {
                formulaInput.value = initialVal;
            }

            // Hiển thị modal
            modal.classList.remove('hidden');
            requestAnimationFrame(() => {
                modal.classList.remove('opacity-0');
                const content = modal.querySelector('div');
                if (content) {
                    content.classList.remove('scale-95');
                    content.classList.add('scale-100');
                }
            });

            // Cập nhật preview tức thì
            this.updateModalPreview();

            // Focus vào ô soạn thảo
            setTimeout(() => {
                if (formulaInput) {
                    formulaInput.focus();
                    formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
                }
            }, 100);
        },

        /**
         * Đóng bảng soạn thảo công thức MathType
         */
        closeFormulaDialog() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;

            modal.classList.add('opacity-0');
            const content = modal.querySelector('div');
            if (content) {
                content.classList.remove('scale-100');
                content.classList.add('scale-95');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 200);
        },

        /**
         * Chèn một mẫu ký hiệu vào ô textarea trong modal
         */
        insertIntoModalFormulaInput(latexTpl, cursorOffset = 0) {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const input = modal.querySelector('#modalFormulaInput');
            if (!input) return;

            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            const selectedText = input.value.substring(start, end);

            let inserted = latexTpl;
            let targetCursor = start;

            if (inserted.includes('#sel#')) {
                inserted = inserted.replace('#sel#', selectedText);
            }

            if (inserted.includes('?')) {
                const qIdx = inserted.indexOf('?');
                inserted = inserted.replace('?', '');
                targetCursor = start + qIdx;
            } else if (cursorOffset !== 0) {
                targetCursor = start + inserted.length + cursorOffset;
            } else {
                targetCursor = start + inserted.length;
            }

            const oldVal = input.value;
            input.value = oldVal.substring(0, start) + inserted + oldVal.substring(end);
            input.focus();
            input.setSelectionRange(targetCursor, targetCursor);

            this.updateModalPreview();
        },

        /**
         * Xóa trắng ô công thức trong modal
         */
        clearModalInput() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const input = modal.querySelector('#modalFormulaInput');
            if (input) {
                input.value = '';
                input.focus();
            }
            this.updateModalPreview();
        },

        /**
         * Bọc công thức bằng tiền tố / hậu tố (ví dụ $, $$)
         */
        wrapModalInput(prefix, suffix) {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const input = modal.querySelector('#modalFormulaInput');
            if (!input) return;

            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            if (start !== end) {
                const sel = input.value.substring(start, end);
                input.value = input.value.substring(0, start) + prefix + sel + suffix + input.value.substring(end);
            } else {
                input.value = prefix + input.value + suffix;
            }
            input.focus();
            this.updateModalPreview();
        },

        /**
         * Gọi render preview có debounce
         */
        triggerModalPreviewDebounced() {
            clearTimeout(this.previewDebounceTimer);
            this.previewDebounceTimer = setTimeout(() => {
                this.updateModalPreview();
            }, 120);
        },

        /**
         * Render công thức trong modal bằng MathJax
         */
        updateModalPreview() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const input = modal.querySelector('#modalFormulaInput');
            const previewEl = modal.querySelector('#modalFormulaPreview');
            if (!input || !previewEl) return;

            const rawVal = (input.value || '').trim();
            if (!rawVal) {
                previewEl.innerHTML = '<span class="text-gray-400 text-xs italic">Công thức sẽ hiển thị trực quan tại đây...</span>';
                return;
            }

            // Chuẩn hóa chuỗi render để MathJax biên dịch
            let renderStr = rawVal;
            // Nếu chưa có bao bọc $ hoặc $$, tự động bọc $$ để hiển thị to rõ trong khung preview
            if (!renderStr.startsWith('$') && !renderStr.startsWith('\\begin{') && !renderStr.startsWith('\\[') && !renderStr.startsWith('\\(')) {
                renderStr = '$$' + renderStr + '$$';
            } else if (renderStr.startsWith('$') && !renderStr.startsWith('$$') && renderStr.endsWith('$')) {
                // Đổi inline $...$ sang $$...$$ để preview nổi bật ở giữa
                const inner = renderStr.replace(/^[\$]+|[\$]+$/g, '');
                renderStr = '$$' + inner + '$$';
            }

            if (typeof window.formatContent === 'function') {
                previewEl.innerHTML = window.formatContent(renderStr);
            } else {
                previewEl.innerHTML = renderStr;
            }

            if (window.MathJax && window.MathJax.typesetPromise) {
                MathJax.typesetPromise([previewEl]).catch(() => {});
            }
        },

        /**
         * Xác nhận chèn công thức từ modal vào bài viết
         */
        confirmInsertFormula() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const input = modal.querySelector('#modalFormulaInput');
            if (!input) return;

            let formula = (input.value || '').trim();
            if (!formula) {
                if (window.showToast) window.showToast('Vui lòng nhập hoặc chọn công thức trước khi chèn!', 'warning');
                return;
            }

            // Tự động bọc chuẩn công thức nếu chưa có dấu $ hoặc môi trường LaTeX
            if (!formula.startsWith('$') && !formula.startsWith('\\begin{') && !formula.startsWith('\\[') && !formula.startsWith('\\(')) {
                if (formula.includes('\n') || formula.includes('\\heva') || formula.includes('\\hoac')) {
                    formula = '$$\n' + formula + '\n$$';
                } else {
                    formula = '$' + formula + '$';
                }
            }

            // Chèn vào target input
            const targetEl = this.dialogTargetInput || this.activeTextarea;
            if (targetEl && (targetEl.tagName === 'TEXTAREA' || targetEl.tagName === 'INPUT')) {
                const start = targetEl.selectionStart || 0;
                const end = targetEl.selectionEnd || 0;
                const oldVal = targetEl.value;

                // Thêm khoảng trắng đệm nếu cần thiết
                let toInsert = formula;
                if (start > 0 && oldVal[start - 1] !== ' ' && oldVal[start - 1] !== '\n') {
                    toInsert = ' ' + toInsert;
                }
                if (end < oldVal.length && oldVal[end] !== ' ' && oldVal[end] !== '\n') {
                    toInsert = toInsert + ' ';
                }

                targetEl.value = oldVal.substring(0, start) + toInsert + oldVal.substring(end);
                targetEl.focus();
                const newPos = start + toInsert.length;
                targetEl.setSelectionRange(newPos, newPos);

                // Kích hoạt cập nhật dữ liệu và preview câu hỏi
                targetEl.dispatchEvent(new Event('input', { bubbles: true }));

                if (window.showToast) window.showToast('Đã chèn công thức vào bài viết!', 'success');
                else if (window.showNotification) window.showNotification('Đã chèn công thức vào bài viết!', 'success');
            }

            this.closeFormulaDialog();
        },

        /**
         * Xử lý tải ảnh trực tiếp từ input file vào textarea tương ứng
         */
        async handleDirectImageUpload(event, targetInputOrId) {
            const file = event?.target?.files && event.target.files[0];
            if (!file) return;

            let targetEl = typeof targetInputOrId === 'string' ? document.getElementById(targetInputOrId) : targetInputOrId;
            if (!targetEl) targetEl = this.activeTextarea;
            if (!targetEl) return;

            const notify = (msg, type = 'info') => {
                if (window.showToast) window.showToast(msg, type);
                else if (window.showNotification) window.showNotification(msg, type);
            };

            notify('Đang tải ảnh lên Cloudflare...', 'info');

            try {
                const url = await this.uploadImageToCloudflare(file);
                const latexImg = `\n\\begin{center}\n\\includegraphics[width=0.6\\linewidth]{${url}}\n\\end{center}\n`;
                
                this.insertTemplate(latexImg, 0, targetEl);
                notify('Chèn ảnh thành công!', 'success');
            } catch(e) {
                console.error("Lỗi upload ảnh:", e);
                notify('Lỗi tải ảnh lên: ' + e.message, 'error');
            } finally {
                if (event.target) event.target.value = '';
            }
        },

        /**
         * =========================================================================
         * QUẢN LÝ ẢNH & THAY THẾ ẢNH TRỰC QUAN (IMAGE REPLACEMENT & CLIPBOARD PASTE)
         * =========================================================================
         */

        /**
         * Tải một file/blob ảnh lên Cloudflare R2 qua Worker
         */
        async uploadImageToCloudflare(fileOrBlob, customName = null) {
            const ext = fileOrBlob.type?.includes('png') ? '.png' : (fileOrBlob.type?.includes('webp') ? '.webp' : '.jpg');
            const fileName = customName || ('img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + ext);
            
            const formData = new FormData();
            formData.append('file', fileOrBlob, fileName);

            const res = await fetch(CLOUDFLARE_UPLOAD_API, {
                method: 'PUT',
                body: formData
            });

            if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
            const data = await res.json();
            return data.url;
        },

        /**
         * Thay thế ảnh trong một chuỗi nội dung LaTeX/HTML
         */
        replaceImageUrlInContent(content, oldUrl, newUrl) {
            if (!content || !oldUrl) return content;
            const decodedOld = decodeURIComponent(oldUrl);
            return content.split(oldUrl).join(newUrl).split(decodedOld).join(newUrl);
        },

        /**
         * Kích hoạt khả năng chọn và thay thế ảnh tương tác trong khung xem trước
         */
        enableImageReplacement(container, targetTextarea) {
            const containerEl = typeof container === 'string' ? document.getElementById(container) : container;
            const textareaEl = typeof targetTextarea === 'string' ? document.getElementById(targetTextarea) : targetTextarea;
            if (!containerEl || !textareaEl) return;

            // Xử lý click chọn ảnh
            containerEl.addEventListener('click', (e) => {
                const img = e.target.closest('img');
                if (!img) return;

                e.stopPropagation();
                this.selectImageForReplacement(img, textareaEl);
            });
        },

        /**
         * Đánh dấu ảnh đang được chọn và hiện thanh tác vụ thay thế ảnh
         */
        selectImageForReplacement(imgEl, targetTextareaEl) {
            document.querySelectorAll('.active-replacing-image').forEach(el => {
                el.classList.remove('active-replacing-image', 'ring-4', 'ring-primary-500', 'ring-offset-2');
            });
            document.querySelectorAll('#imageReplacementToolbar').forEach(el => el.remove());

            this.selectedImageElement = imgEl;
            this.selectedImageTargetTextarea = targetTextareaEl;

            imgEl.classList.add('active-replacing-image', 'ring-4', 'ring-primary-500', 'ring-offset-2', 'rounded-lg', 'transition-all');

            const toolbar = document.createElement('div');
            toolbar.id = 'imageReplacementToolbar';
            toolbar.className = 'absolute z-50 bg-gray-900/95 text-white px-2.5 py-1.5 rounded-xl shadow-xl flex items-center gap-2 text-xs backdrop-blur-xs border border-gray-700 animate-fadeIn';
            toolbar.innerHTML = `
                <span class="font-bold text-amber-400 flex items-center gap-1"><i class="fa-solid fa-image"></i> Đang chọn ảnh</span>
                <span class="text-gray-500">|</span>
                <button type="button" id="btnPasteOverImage" class="hover:text-emerald-400 flex items-center gap-1 font-bold transition cursor-pointer" title="Dán ảnh từ Clipboard (hoặc bấm phím tắt Ctrl+V)">
                    <i class="fa-solid fa-paste"></i> Dán đè (Ctrl+V)
                </button>
                <span class="text-gray-500">|</span>
                <label class="hover:text-blue-400 flex items-center gap-1 font-bold transition cursor-pointer" title="Tải file ảnh từ máy tính">
                    <i class="fa-solid fa-upload"></i> Tải từ máy
                    <input type="file" id="fileInputReplaceImage" accept="image/*" class="hidden">
                </label>
                <span class="text-gray-500">|</span>
                <button type="button" id="btnCancelReplaceImage" class="text-gray-400 hover:text-red-400 transition" title="Bỏ chọn">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;

            const rect = imgEl.getBoundingClientRect();
            document.body.appendChild(toolbar);
            const tbWidth = toolbar.offsetWidth || 260;
            const topPos = Math.max(10, rect.top + window.scrollY - 42);
            const leftPos = Math.max(10, Math.min(window.innerWidth - tbWidth - 10, rect.left + window.scrollX));
            toolbar.style.top = topPos + 'px';
            toolbar.style.left = leftPos + 'px';

            const doPaste = async () => {
                try {
                    const items = await navigator.clipboard.read();
                    for (const item of items) {
                        for (const type of item.types) {
                            if (type.startsWith('image/')) {
                                const blob = await item.getType(type);
                                await this.executeImageReplacement(imgEl, targetTextareaEl, blob);
                                return;
                            }
                        }
                    }
                    if (window.showToast) window.showToast('Không tìm thấy dữ liệu ảnh trong bộ nhớ tạm (Clipboard)!', 'warning');
                } catch(err) {
                    if (window.showToast) window.showToast('Vui lòng cấp quyền truy cập Clipboard hoặc dùng phím Ctrl+V!', 'warning');
                }
            };

            toolbar.querySelector('#btnPasteOverImage').addEventListener('click', (e) => {
                e.stopPropagation();
                doPaste();
            });

            toolbar.querySelector('#fileInputReplaceImage').addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    await this.executeImageReplacement(imgEl, targetTextareaEl, file);
                }
            });

            toolbar.querySelector('#btnCancelReplaceImage').addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearImageSelection();
            });
        },

        /**
         * Xóa trạng thái chọn ảnh
         */
        clearImageSelection() {
            if (this.selectedImageElement) {
                this.selectedImageElement.classList.remove('active-replacing-image', 'ring-4', 'ring-primary-500', 'ring-offset-2');
                this.selectedImageElement = null;
            }
            this.selectedImageTargetTextarea = null;
            document.querySelectorAll('#imageReplacementToolbar').forEach(el => el.remove());
        },

        /**
         * Thực hiện tải ảnh mới lên Cloudflare và thay thế URL trong textarea
         */
        async executeImageReplacement(imgEl, targetTextareaEl, fileOrBlob) {
            const oldSrc = imgEl.getAttribute('src');
            if (!oldSrc || !targetTextareaEl) return;

            const notify = (msg, type = 'info') => {
                if (window.showToast) window.showToast(msg, type);
                else if (window.showNotification) window.showNotification(msg, type);
            };

            notify('Đang tải ảnh mới lên Cloudflare...', 'info');
            imgEl.style.opacity = '0.5';

            try {
                const newUrl = await this.uploadImageToCloudflare(fileOrBlob);
                imgEl.src = newUrl;
                imgEl.style.opacity = '1';

                const oldContent = targetTextareaEl.value;
                const newContent = this.replaceImageUrlInContent(oldContent, oldSrc, newUrl);
                targetTextareaEl.value = newContent;
                targetTextareaEl.dispatchEvent(new Event('input', { bubbles: true }));

                notify('Thay thế ảnh thành công!', 'success');
                this.clearImageSelection();
            } catch(e) {
                console.error("Lỗi thay thế ảnh:", e);
                imgEl.style.opacity = '1';
                notify('Lỗi tải ảnh lên Cloudflare: ' + e.message, 'error');
            }
        },

        /**
         * Tạo thanh công cụ nhỏ gọn hoặc gắn kết tương thích ngược
         */
        createToolbar(container, targetTextarea = null) {
            const containerEl = typeof container === 'string' ? document.getElementById(container) : container;
            if (!containerEl) return null;

            let taEl = null;
            if (targetTextarea) {
                taEl = typeof targetTextarea === 'string' ? document.getElementById(targetTextarea) : targetTextarea;
                if (taEl) this.registerTextarea(taEl);
            }

            // Thanh công cụ thu gọn thông minh (dạng bar mini nếu được gọi trực tiếp)
            containerEl.innerHTML = `
                <div class="flex items-center gap-1.5 py-1 text-xs">
                    <button type="button" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer" onclick="window.MathPalette.openFormulaDialog('${typeof targetTextarea === 'string' ? targetTextarea : ''}')">
                        <i class="fa-solid fa-square-root-variable text-indigo-600"></i> MathType
                    </button>
                    <label class="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg border border-teal-200 font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer" title="Chèn ảnh từ máy tính">
                        <i class="fa-solid fa-image text-teal-600"></i> Ảnh
                        <input type="file" accept="image/*" class="hidden" onchange="window.MathPalette.handleDirectImageUpload(event, '${typeof targetTextarea === 'string' ? targetTextarea : ''}')">
                    </label>
                </div>
            `;
            return containerEl;
        }
    };

    /**
     * =========================================================================
     * TIỆN ÍCH TOÀN CỤC: BẬT / TẮT KHUNG NHẬP MÃ LATEX (TOGGLE LATEX CODE VIEW)
     * =========================================================================
     */
    window.toggleLatexEditor = function(textareaId, buttonId = null) {
        const wrapper = document.getElementById('wrapper_' + textareaId) || document.getElementById(textareaId);
        const btn = typeof buttonId === 'string' ? document.getElementById(buttonId) : buttonId;
        if (!wrapper) return;

        const isHidden = wrapper.classList.contains('hidden');
        if (isHidden) {
            // Mở khung soạn mã LaTeX
            wrapper.classList.remove('hidden');
            const ta = document.getElementById(textareaId);
            if (ta) {
                ta.focus();
                // Đưa con trỏ về cuối văn bản
                const len = ta.value.length;
                ta.setSelectionRange(len, len);
            }
            if (btn) {
                btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600', 'shadow-xs');
                btn.classList.remove('bg-gray-100', 'text-gray-700', 'bg-white', 'text-emerald-800', 'border-gray-300', 'border-emerald-300');
            }
        } else {
            // Đóng khung soạn mã LaTeX
            wrapper.classList.add('hidden');
            if (btn) {
                btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600', 'shadow-xs');
                btn.classList.add('bg-gray-100', 'text-gray-700', 'border-gray-300');
            }
        }
    };

    // Lắng nghe sự kiện paste toàn cục để thay thế ảnh nếu đang có ảnh được chọn
    window.addEventListener('paste', async (e) => {
        if (!MathPalette.selectedImageElement || !MathPalette.selectedImageTargetTextarea) return;

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData || !clipboardData.items) return;

        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                e.stopPropagation();
                const blob = item.getAsFile();
                if (blob) {
                    await MathPalette.executeImageReplacement(
                        MathPalette.selectedImageElement,
                        MathPalette.selectedImageTargetTextarea,
                        blob
                    );
                }
                return;
            }
        }
    }, true);

    // Bấm ra ngoài thì bỏ chọn ảnh
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.active-replacing-image') && !e.target.closest('#imageReplacementToolbar')) {
            MathPalette.clearImageSelection();
        }
    });

    // Export to global
    window.MathPalette = MathPalette;

})(typeof window !== 'undefined' ? window : this);
