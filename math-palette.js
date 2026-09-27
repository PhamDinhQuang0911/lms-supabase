/**
 * math-palette.js - Thanh công cụ soạn thảo công thức Toán học trực quan kiểu MathType
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
        activeGroupId: 'basic',
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
        insertTemplate(latexTpl, cursorOffset = 0) {
            const ta = this.activeTextarea || document.activeElement;
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
            // Decode URL components if needed
            const decodedOld = decodeURIComponent(oldUrl);
            return content.split(oldUrl).join(newUrl).split(decodedOld).join(newUrl);
        },

        /**
         * Kích hoạt khả năng chọn và thay thế ảnh tương tác trong khung xem trước
         * Khi bấm vào ảnh: hiện khung viền chọn + thanh nút nổi [📋 Dán ảnh (Ctrl+V)] [📁 Tải ảnh từ máy]
         * Khi bấm Ctrl+V hoặc chọn file: tự upload và thay URL trong textarea tương ứng!
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
            // Xóa highlight của ảnh trước đó
            document.querySelectorAll('.active-replacing-image').forEach(el => {
                el.classList.remove('active-replacing-image', 'ring-4', 'ring-primary-500', 'ring-offset-2');
            });
            document.querySelectorAll('#imageReplacementToolbar').forEach(el => el.remove());

            this.selectedImageElement = imgEl;
            this.selectedImageTargetTextarea = targetTextareaEl;

            imgEl.classList.add('active-replacing-image', 'ring-4', 'ring-primary-500', 'ring-offset-2', 'rounded-lg', 'transition-all');

            // Tạo thanh tác vụ nổi ngay trên ảnh
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

            // Định vị thanh toolbar trên ảnh
            const rect = imgEl.getBoundingClientRect();
            document.body.appendChild(toolbar);
            const tbWidth = toolbar.offsetWidth || 260;
            const topPos = Math.max(10, rect.top + window.scrollY - 42);
            const leftPos = Math.max(10, Math.min(window.innerWidth - tbWidth - 10, rect.left + window.scrollX));
            toolbar.style.top = topPos + 'px';
            toolbar.style.left = leftPos + 'px';

            // Xử lý nút dán từ clipboard
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

            // Xử lý upload từ máy tính
            toolbar.querySelector('#fileInputReplaceImage').addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    await this.executeImageReplacement(imgEl, targetTextareaEl, file);
                }
            });

            // Xử lý nút Hủy
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

                // Thay thế trong textarea
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
         * Khởi tạo và đính kèm thanh MathPalette vào một container
         * @param {string|HTMLElement} container - Nơi render toolbar
         * @param {string|HTMLElement} targetTextarea - Textarea liên kết (tùy chọn)
         */
        createToolbar(container, targetTextarea = null) {
            const containerEl = typeof container === 'string' ? document.getElementById(container) : container;
            if (!containerEl) return null;

            let taEl = null;
            if (targetTextarea) {
                taEl = typeof targetTextarea === 'string' ? document.getElementById(targetTextarea) : targetTextarea;
                if (taEl) this.registerTextarea(taEl);
            }

            const toolbarId = 'math-palette-' + Math.random().toString(36).substring(2, 9);
            
            const html = `
                <div id="${toolbarId}" class="math-palette-wrapper bg-white border border-gray-200 rounded-xl shadow-2xs overflow-hidden mb-2 select-none text-xs">
                    <!-- Header Categories -->
                    <div class="palette-tabs flex items-center bg-gray-50 border-b border-gray-200 px-1 py-1 gap-1 overflow-x-auto no-scrollbar">
                        <span class="text-[11px] font-black text-primary-700 px-2 flex items-center gap-1 shrink-0 uppercase tracking-wider">
                            <i class="fa-solid fa-square-root-variable text-primary-600"></i> MathType
                        </span>
                        ${PALETTE_GROUPS.map((g, idx) => `
                            <button type="button" class="palette-tab-btn px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1.5 ${idx === 0 ? 'bg-white text-primary-700 shadow-2xs border border-gray-200/80' : 'text-gray-600 hover:text-primary-600 hover:bg-gray-100'}" data-group="${g.id}">
                                <span>${g.name}</span>
                            </button>
                        `).join('')}
                        
                        <div class="ml-auto flex items-center gap-1 shrink-0">
                            <!-- Chèn ảnh trực tiếp -->
                            <label class="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-lg border border-teal-200 shrink-0 transition flex items-center gap-1 cursor-pointer" title="Chèn hoặc tải ảnh mới từ máy tính vào vị trí con trỏ">
                                <i class="fa-solid fa-image"></i> <span>Chèn ảnh</span>
                                <input type="file" class="palette-file-insert-img hidden" accept="image/*">
                            </label>
                            <!-- Bọc $...$ -->
                            <button type="button" class="palette-quick-wrap px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg border border-amber-200 shrink-0 transition" title="Bọc đoạn đang chọn bằng dấu $...$">$...$</button>
                        </div>
                    </div>

                    <!-- Button Body -->
                    <div class="palette-body p-2 bg-gray-50/50 max-h-36 overflow-y-auto custom-scrollbar">
                        ${PALETTE_GROUPS.map((g, idx) => `
                            <div class="palette-group-grid grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 ${idx === 0 ? '' : 'hidden'}" id="${toolbarId}-group-${g.id}">
                                ${g.templates.map(tpl => `
                                    <button type="button" class="palette-btn h-8 px-1.5 bg-white hover:bg-primary-50 text-gray-800 hover:text-primary-700 border border-gray-200 rounded-lg flex items-center justify-center font-bold text-xs transition-colors shadow-2xs hover:border-primary-300 transform active:scale-95" title="${tpl.desc || tpl.label}" data-latex="${tpl.latex.replace(/"/g, '&quot;')}" data-offset="${tpl.cursorOffset || 0}">
                                        <span class="font-serif leading-none">${tpl.label}</span>
                                    </button>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            containerEl.innerHTML = html;
            const barEl = document.getElementById(toolbarId);

            // Bind tab switching
            barEl.querySelectorAll('.palette-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const groupId = btn.dataset.group;
                    barEl.querySelectorAll('.palette-tab-btn').forEach(b => {
                        b.classList.remove('bg-white', 'text-primary-700', 'shadow-2xs', 'border', 'border-gray-200/80');
                        b.classList.add('text-gray-600', 'hover:text-primary-600', 'hover:bg-gray-100');
                    });
                    btn.classList.add('bg-white', 'text-primary-700', 'shadow-2xs', 'border', 'border-gray-200/80');
                    btn.classList.remove('text-gray-600', 'hover:text-primary-600', 'hover:bg-gray-100');

                    barEl.querySelectorAll('.palette-group-grid').forEach(grid => grid.classList.add('hidden'));
                    const targetGrid = document.getElementById(`${toolbarId}-group-${groupId}`);
                    if (targetGrid) targetGrid.classList.remove('hidden');
                });
            });

            // Bind template clicks
            barEl.querySelectorAll('.palette-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const latex = btn.dataset.latex;
                    const offset = parseInt(btn.dataset.offset || 0, 10);
                    MathPalette.insertTemplate(latex, offset);
                });
            });

            // Bind quick wrap $...$
            const wrapBtn = barEl.querySelector('.palette-quick-wrap');
            if (wrapBtn) {
                wrapBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    MathPalette.insertTemplate('$$#sel#?$$', -2);
                });
            }

            // Bind chèn ảnh mới từ nút toolbar
            const imgInput = barEl.querySelector('.palette-file-insert-img');
            if (imgInput) {
                imgInput.addEventListener('change', async (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    try {
                        if (window.showToast) window.showToast('Đang tải ảnh lên Cloudflare...', 'info');
                        const url = await MathPalette.uploadImageToCloudflare(file);
                        MathPalette.insertTemplate(`\\begin{center}\n\\includegraphics[width=0.6\\linewidth]{${url}}\n\\end{center}\n`);
                        if (window.showToast) window.showToast('Chèn ảnh thành công!', 'success');
                    } catch(err) {
                        if (window.showToast) window.showToast('Lỗi tải ảnh: ' + err.message, 'error');
                    }
                    imgInput.value = '';
                });
            }

            return barEl;
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
