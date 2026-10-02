/**
 * math-palette.js - Bảng Soạn thảo Công thức Toán học TRỰC QUAN kiểu MathType (WYSIWYG qua MathLive)
 * & Hệ thống tương tác chọn/thay thế/dán ảnh trực tiếp vào câu hỏi LaTeX.
 * Dùng chung cho: exam-editor.html, dashboard.html (questionEditModal), book-manager.html...
 */
(function(global) {
    'use strict';
    const window = global;

    const CLOUDFLARE_UPLOAD_API = "https://upload-helper.phamngockhanh-942001.workers.dev/";

    // Danh mục các mẫu công thức toán học phân theo nhóm trực quan
    const PALETTE_GROUPS = [
        {
            id: 'basic',
            name: 'Cơ bản',
            icon: 'fa-solid fa-square-root-variable',
            templates: [
                { label: 'a/b', desc: 'Phân số trực quan', latex: '\\frac{#?}{#?}' },
                { label: '√x', desc: 'Căn bậc hai', latex: '\\sqrt{#?}' },
                { label: 'ⁿ√x', desc: 'Căn bậc n', latex: '\\sqrt[#?]{#?}' },
                { label: 'x²', desc: 'Bình phương', latex: '{#?}^{2}' },
                { label: 'xⁿ', desc: 'Lũy thừa số mũ', latex: '{#?}^{#?}' },
                { label: 'xᵢ', desc: 'Chỉ số dưới', latex: '{#?}_{#?}' },
                { label: 'xᵢⁿ', desc: 'Chỉ số trên và dưới', latex: '{#?}_{#?}^{#?}' },
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
                { label: '{ Hệ 2 PT', desc: 'Hệ 2 phương trình', latex: '\\begin{cases} #? \\\\ #? \\end{cases}' },
                { label: '{ Hệ 3 PT', desc: 'Hệ 3 phương trình', latex: '\\begin{cases} #? \\\\ #? \\\\ #? \\end{cases}' },
                { label: '[ Hoặc', desc: 'Dấu ngoặc hoặc', latex: '\\left[\\begin{aligned} #? \\\\ #? \\end{aligned}\\right.' },
                { label: '( ... )', desc: 'Ngoặc tròn co giãn', latex: '\\left( #? \\right)' },
                { label: '[ ... ]', desc: 'Ngoặc vuông co giãn', latex: '\\left[ #? \\right]' },
                { label: '{ ... }', desc: 'Ngoặc nhọn co giãn', latex: '\\left\\{ #? \\right\\}' },
                { label: '| ... |', desc: 'Trị tuyệt đối co giãn', latex: '\\left| #? \\right|' },
                { label: '‖ ... ‖', desc: 'Độ dài / Chuẩn vector', latex: '\\left\\| #? \\right\\|' }
            ]
        },
        {
            id: 'geometry',
            name: 'Hình học & Vector',
            icon: 'fa-solid fa-shapes',
            templates: [
                { label: 'v⃗', desc: 'Vector ngắn', latex: '\\vec{#?}' },
                { label: 'AB⃗', desc: 'Vector dài', latex: '\\overrightarrow{#?}' },
                { label: 'ABĈ', desc: 'Ký hiệu góc', latex: '\\widehat{#?}' },
                { label: 'AB⁀', desc: 'Cung tròn', latex: '\\wideparen{#?}' },
                { label: 'Δ', desc: 'Tam giác (Delta)', latex: '\\Delta ' },
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
                { label: '∫dx', desc: 'Tích phân bất định', latex: '\\int {#?}\\, dx' },
                { label: '∫ₐᵇ', desc: 'Tích phân xác định', latex: '\\int_{#?}^{#?} {#?}\\, dx' },
                { label: 'lim', desc: 'Giới hạn', latex: '\\lim_{x \\to #?} {#?}' },
                { label: 'lim₊', desc: 'Giới hạn bên phải', latex: '\\lim_{x \\to {#?}^+} {#?}' },
                { label: 'lim₋', desc: 'Giới hạn bên trái', latex: '\\lim_{x \\to {#?}^-} {#?}' },
                { label: '∑', desc: 'Tổng sigma', latex: '\\sum_{i=1}^{#?} {#?}' },
                { label: '∏', desc: 'Tích pi', latex: '\\prod_{i=1}^{#?} {#?}' },
                { label: 'f\'(x)', desc: 'Đạo hàm', latex: 'f\'(#?)' },
                { label: "f''(x)", desc: 'Đạo hàm cấp hai', latex: "f''(#?)" },
                { label: 'sin', desc: 'Hàm sin', latex: '\\sin(#?)' },
                { label: 'cos', desc: 'Hàm cos', latex: '\\cos(#?)' },
                { label: 'tan', desc: 'Hàm tan', latex: '\\tan(#?)' },
                { label: 'cot', desc: 'Hàm cot', latex: '\\cot(#?)' }
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
        selectedImageElement: null,
        selectedImageTargetTextarea: null,

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

            if (inserted.includes('#sel#')) {
                inserted = inserted.replace('#sel#', selectedText);
            }
            if (inserted.includes('#?')) {
                inserted = inserted.replace(/#\?/g, '');
            }

            if (cursorOffset !== 0) {
                targetCursor = start + inserted.length + cursorOffset;
            } else {
                targetCursor = start + inserted.length;
            }

            const oldVal = ta.value;
            ta.value = oldVal.substring(0, start) + inserted + oldVal.substring(end);
            ta.focus();
            ta.setSelectionRange(targetCursor, targetCursor);

            ta.dispatchEvent(new Event('input', { bubbles: true }));
        },

        /**
         * =========================================================================
         * MODAL SOẠN THẢO CÔNG THỨC MATHTYPE TRỰC QUAN (WYSIWYG MATHLIVE)
         * =========================================================================
         */

        /**
         * Đảm bảo DOM của Modal MathType đã tồn tại trong body với z-index cực đại
         */
        ensureDialogInDom() {
            let modal = document.getElementById('mathFormulaModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'mathFormulaModal';
            // Cài đặt style trực tiếp z-index: 9999999 để luôn hiển thị TRÊN MỌI BẢNG MODAL KHÁC
            modal.style.cssText = 'position: fixed !important; inset: 0 !important; z-index: 9999999 !important; background-color: rgba(15, 23, 42, 0.75) !important; backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; padding: 12px;';
            
            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl flex flex-col max-h-[94vh] overflow-hidden transform scale-95 transition-transform duration-200" style="position: relative !important; z-index: 10000000 !important;">
                    <!-- Header -->
                    <div class="px-5 py-3.5 bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 text-white flex items-center justify-between shadow-xs">
                        <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs shadow-inner">
                                <i class="fa-solid fa-square-root-variable text-amber-300 text-base"></i>
                            </div>
                            <div>
                                <h3 class="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
                                    Soạn thảo Công thức MathType (Trực quan)
                                </h3>
                                <p class="text-[11px] text-indigo-200 leading-none mt-0.5">Nhấp chọn mẫu công thức (Phân số, Căn, Hệ PT...) & Nhập trực tiếp vào các ô trống</p>
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
                                    <button type="button" class="modal-sym-btn h-8 px-1.5 bg-white hover:bg-indigo-50 text-gray-800 hover:text-indigo-700 border border-gray-200 rounded-lg flex items-center justify-center font-bold text-xs transition-colors shadow-2xs hover:border-indigo-300 transform active:scale-95 cursor-pointer" title="${tpl.desc || tpl.label}" data-latex="${tpl.latex.replace(/"/g, '&quot;')}">
                                        <span class="font-serif leading-none">${tpl.label}</span>
                                    </button>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>

                    <!-- Sandbox WYSIWYG MathLive Field -->
                    <div class="p-4 space-y-3 flex-1 overflow-y-auto bg-white">
                        <div class="bg-indigo-50/40 p-3.5 rounded-2xl border-2 border-indigo-200">
                            <div class="flex items-center justify-between mb-2">
                                <label class="text-xs font-bold text-indigo-900 flex items-center gap-1.5 uppercase tracking-wide">
                                    <i class="fa-solid fa-shapes text-indigo-600"></i> Khung Soạn thảo Trực quan (MathType):
                                </label>
                                <button type="button" onclick="window.MathPalette.clearModalInput()" class="px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 text-[11px] font-bold rounded-lg border border-red-200 shadow-2xs transition flex items-center gap-1 cursor-pointer" title="Xóa toàn bộ">
                                    <i class="fa-solid fa-trash-can"></i> Xóa trắng
                                </button>
                            </div>
                            
                            <!-- BẢNG NHẬP WYSIWYG MATHLIVE -->
                            <div class="bg-white rounded-xl border border-indigo-300 shadow-inner p-3 min-h-[96px] flex items-center focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                                <math-field id="modalMathField" class="w-full font-serif text-gray-900 leading-relaxed" style="font-size: 1.55rem; min-height: 52px; outline: none; border: none; background: transparent;"></math-field>
                            </div>

                            <!-- Dòng hiển thị mã LaTeX tương ứng -->
                            <div class="mt-2.5 pt-2 border-t border-indigo-100 flex items-center justify-between flex-wrap gap-2 text-xs">
                                <div class="flex items-center gap-1.5 text-gray-600 font-mono text-[11px] overflow-hidden">
                                    <span class="font-bold text-indigo-700 font-sans">Mã LaTeX:</span>
                                    <code id="modalMathFieldLatexPreview" class="bg-white px-2 py-0.5 rounded border border-gray-200 text-indigo-800 text-[11px] truncate max-w-sm italic">...</code>
                                </div>
                                <span class="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-200 flex items-center gap-1">
                                    <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i> Điền trực tiếp vào ô vuông
                                </span>
                            </div>
                        </div>

                        <!-- Hướng dẫn thao tác nhanh -->
                        <div class="bg-amber-50/60 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-amber-800">
                            <i class="fa-solid fa-lightbulb text-amber-600 mt-0.5 shrink-0"></i>
                            <div>
                                <strong>Mẹo thao tác MathType:</strong> Bấm chọn mẫu (ví dụ <strong>a/b</strong> hoặc <strong>{ Hệ</strong>), các ô trống <span class="border border-dashed border-amber-500 px-1 rounded bg-white font-mono">[ ]</span> sẽ xuất hiện để bạn nhập số hoặc chữ. Dùng phím mũi tên <strong>← → ↑ ↓</strong> hoặc <strong>Tab</strong> để chuyển đổi giữa tử số và mẫu số!
                            </div>
                        </div>
                    </div>

                    <!-- Footer Action Bar -->
                    <div class="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
                        <span class="text-[11px] text-gray-500 hidden sm:inline flex items-center gap-1">
                            <i class="fa-solid fa-circle-info text-blue-500"></i> Tự động bọc chuẩn $...$ khi chèn vào bài viết
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

            // Bind sự kiện bấm nút ký hiệu vào MathLive
            modal.querySelectorAll('.modal-sym-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const latex = btn.dataset.latex;
                    MathPalette.insertIntoModalFormulaInput(latex);
                });
            });

            // Cấu hình MathField
            const mf = modal.querySelector('#modalMathField');
            if (mf) {
                mf.mathVirtualKeyboardPolicy = 'manual';
                mf.addEventListener('input', () => {
                    MathPalette.updateModalMathFieldStatus();
                });
            }

            // Bấm Esc để đóng modal
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.style.display === 'flex') {
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
         * Mở bảng soạn thảo công thức MathType trực quan
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

            // Nếu người dùng đang bôi đen một đoạn text trong target textarea, đưa vào MathLive
            const mf = modal.querySelector('#modalMathField');
            let initialVal = '';
            if (targetEl && (targetEl.tagName === 'TEXTAREA' || targetEl.tagName === 'INPUT')) {
                const s = targetEl.selectionStart || 0;
                const e = targetEl.selectionEnd || 0;
                if (e > s) {
                    let sel = targetEl.value.substring(s, e).trim();
                    if (sel.startsWith('$') && sel.endsWith('$')) {
                        sel = sel.replace(/^[\$]+|[\$]+$/g, '').trim();
                    }
                    initialVal = sel;
                }
            }

            // Hiển thị modal trực tiếp bằng inline style flex
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                const content = modal.querySelector('div');
                if (content) {
                    content.classList.remove('scale-95');
                    content.classList.add('scale-100');
                }
            });

            if (mf) {
                if (typeof mf.setValue === 'function') {
                    mf.setValue(initialVal || '');
                } else {
                    mf.value = initialVal || '';
                }
                setTimeout(() => {
                    if (typeof mf.focus === 'function') mf.focus();
                }, 100);
            }

            this.updateModalMathFieldStatus();
        },

        /**
         * Đóng bảng soạn thảo công thức MathType
         */
        closeFormulaDialog() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;

            const content = modal.querySelector('div');
            if (content) {
                content.classList.remove('scale-100');
                content.classList.add('scale-95');
            }
            setTimeout(() => {
                modal.style.display = 'none';
            }, 150);
        },

        /**
         * Chèn một mẫu ký hiệu vào MathLive (với các ô trống #? trực quan)
         */
        insertIntoModalFormulaInput(latexTpl) {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const mf = modal.querySelector('#modalMathField');
            if (!mf) return;

            if (typeof mf.insert === 'function') {
                mf.focus();
                mf.insert(latexTpl, { mode: 'math' });
            } else if (typeof mf.executeCommand === 'function') {
                mf.focus();
                mf.executeCommand(['insert', latexTpl]);
            } else {
                mf.value = (mf.value || '') + latexTpl.replace(/#\?/g, '');
            }

            this.updateModalMathFieldStatus();
        },

        /**
         * Xóa trắng ô công thức trong MathLive
         */
        clearModalInput() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const mf = modal.querySelector('#modalMathField');
            if (mf) {
                if (typeof mf.setValue === 'function') mf.setValue('');
                else mf.value = '';
                mf.focus();
            }
            this.updateModalMathFieldStatus();
        },

        /**
         * Cập nhật dòng preview mã LaTeX dưới khung MathLive
         */
        updateModalMathFieldStatus() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const mf = modal.querySelector('#modalMathField');
            const previewCode = modal.querySelector('#modalMathFieldLatexPreview');
            if (!mf || !previewCode) return;

            let val = '';
            if (typeof mf.getValue === 'function') {
                val = mf.getValue('latex') || mf.value || '';
            } else {
                val = mf.value || '';
            }

            previewCode.textContent = val.trim() ? val : '(Trống)';
        },

        /**
         * Xác nhận chèn công thức từ modal vào bài viết
         */
        confirmInsertFormula() {
            const modal = document.getElementById('mathFormulaModal');
            if (!modal) return;
            const mf = modal.querySelector('#modalMathField');
            if (!mf) return;

            let formula = '';
            if (typeof mf.getValue === 'function') {
                formula = mf.getValue('latex') || mf.value || '';
            } else {
                formula = mf.value || '';
            }

            formula = (formula || '').trim();
            if (!formula) {
                if (window.showToast) window.showToast('Vui lòng nhập hoặc chọn công thức trước khi chèn!', 'warning');
                return;
            }

            // Chuyển đổi \begin{cases} sang \heva chuẩn QMath
            if (formula.includes('\\begin{cases}')) {
                formula = formula.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, function(match, inner) {
                    const lines = inner.split('\\\\').map(l => l.trim()).filter(Boolean);
                    return '\\heva{\n    & ' + lines.join(' \\\\\n    & ') + '\n}';
                });
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
                const latexImg = `\\begin{center}\n\\includegraphics[width=0.6\\linewidth]{${url}}\n\\end{center}\n`;
                
                const isSolutionEl = (targetEl.id === 'editSolution' || targetEl.id === 'edit_solution' || targetInputOrId === 'editSolution' || targetInputOrId === 'edit_solution');
                if (isSolutionEl) {
                    // Đối với phần lời giải: Chèn ảnh lên BÊN TRÊN lời giải theo yêu cầu
                    const currentVal = (targetEl.value || '').trim();
                    if (currentVal.length > 0) {
                        targetEl.value = latexImg + '\n' + currentVal;
                    } else {
                        targetEl.value = latexImg;
                    }
                    targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    this.insertTemplate('\n' + latexImg, 0, targetEl);
                }
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
            toolbar.style.cssText = 'position: absolute !important; z-index: 999999 !important;';
            toolbar.className = 'bg-gray-900/95 text-white px-2.5 py-1.5 rounded-xl shadow-xl flex items-center gap-2 text-xs backdrop-blur-xs border border-gray-700 animate-fadeIn';
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
         * Tạo thanh công cụ nhỏ gọn
         */
        createToolbar(container, targetTextarea = null) {
            const containerEl = typeof container === 'string' ? document.getElementById(container) : container;
            if (!containerEl) return null;

            let taEl = null;
            if (targetTextarea) {
                taEl = typeof targetTextarea === 'string' ? document.getElementById(targetTextarea) : targetTextarea;
                if (taEl) this.registerTextarea(taEl);
            }

            containerEl.innerHTML = `
                <div class="flex items-center gap-2 py-1 text-xs">
                    <button type="button" class="btn-editor-action btn-editor-mathtype px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer" onclick="window.MathPalette.openFormulaDialog('${typeof targetTextarea === 'string' ? targetTextarea : ''}')">
                        <i class="fa-solid fa-square-root-variable"></i> MathType
                    </button>
                    <label class="btn-editor-action btn-editor-image px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer" title="Chèn ảnh từ máy tính">
                        <i class="fa-solid fa-image"></i> Ảnh
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
            wrapper.classList.remove('hidden');
            const ta = document.getElementById(textareaId);
            if (ta) {
                ta.focus();
                const len = ta.value.length;
                ta.setSelectionRange(len, len);
            }
            if (btn) {
                btn.classList.add('active');
            }
        } else {
            wrapper.classList.add('hidden');
            if (btn) {
                btn.classList.remove('active');
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

    // Chèn CSS định kiểu nổi bật cho các nút bấm action (High-contrast, đẹp cả sáng lẫn tối)
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .btn-editor-action {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 700 !important;
            font-size: 12px !important;
            padding: 5px 12px !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            user-select: none !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important;
        }
        .btn-editor-mathtype {
            background-color: #4f46e5 !important;
            color: #ffffff !important;
            border: 1px solid #6366f1 !important;
        }
        .btn-editor-mathtype:hover {
            background-color: #4338ca !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3) !important;
        }
        .btn-editor-image {
            background-color: #0d9488 !important;
            color: #ffffff !important;
            border: 1px solid #14b8a6 !important;
        }
        .btn-editor-image:hover {
            background-color: #0f766e !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.3) !important;
        }
        .btn-editor-latex {
            background-color: #334155 !important;
            color: #ffffff !important;
            border: 1px solid #475569 !important;
        }
        .btn-editor-latex:hover {
            background-color: #1e293b !important;
            transform: translateY(-1px);
        }
        .btn-editor-latex.active {
            background-color: #2563eb !important;
            color: #ffffff !important;
            border: 1px solid #60a5fa !important;
            box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.5) !important;
        }
    `;
    document.head.appendChild(styleEl);

    // Export to global
    window.MathPalette = MathPalette;

})(typeof window !== 'undefined' ? window : this);
