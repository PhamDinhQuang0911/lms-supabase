import { parseTopicFromTex } from './topic-parser.js';
import { 
    initializeApp, getAuth, onAuthStateChanged,
    getFirestore, doc, getDoc, setDoc, enableMultiTabIndexedDbPersistence as enableIndexedDbPersistence,
    supabase
} from "./supabase-db-compat.js";

// --- 1. CẤU HÌNH SUPABASE / FIRESTORE COMPAT ---
const app = initializeApp({});
const db = getFirestore(app);
const auth = getAuth(app);

// Kích hoạt Cache Offline
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') console.log('Lưu ý: Đang mở nhiều tab cùng lúc.');
    else if (err.code === 'unimplemented') console.log('Trình duyệt không hỗ trợ IndexedDb offline.');
});

// --- 2. TRẠNG THÁI (STATE) ---
let mapData = { metadata: [], tree: [] };
let selectedNode = null;
let expandedNodes = new Set(); 
let toastTimeout = null;
let treeSearchQuery = "";

// Nạp cache cục bộ trước để giao diện hiện tức thì không bị chớp giật
try {
    const localTree = localStorage.getItem('lms_cached_mapid_tree');
    if (localTree) {
        const parsed = JSON.parse(localTree);
        if (Array.isArray(parsed) && parsed.length > 0) {
            mapData.tree = parsed;
        }
    }
} catch(e) {}

// --- 3. XỬ LÝ DỮ LIỆU CÂY MAPID (CORE PARSER & GENERATOR) ---
function parseMapID(text) {
    const lines = text.split(/\r?\n/);
    const root = [];
    const stack = [];
    const metadata = [];
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (!trimmed.startsWith('-')) { metadata.push(line); return; }
        const match = line.match(/^(-+)\[(.+?)\]\s*(.*)/);
        if (match) {
            const dashes = match[1].length;
            const level = Math.round((dashes - 1) / 3);
            const node = { 
                id: match[2], 
                name: match[3], 
                level: level, 
                children: [], 
                isTheory: false, 
                isRealWorld: false 
            };
            if (level === 0) { 
                root.push(node); 
                stack[0] = node; 
                stack.length = 1; 
            } else { 
                const p = stack[level - 1]; 
                if (p) { 
                    if (!p.children) p.children = [];
                    p.children.push(node); 
                    stack[level] = node; 
                    stack.length = level + 1; 
                } 
            }
        }
    });
    return { tree: root, metadata };
}

function generateMapID(data) {
    let output = (data.metadata || []).join('\n') + '\n';
    function traverse(nodes, lvl) {
        if (!nodes) return;
        nodes.forEach(n => {
            output += `${'-'.repeat(1 + lvl * 3)}[${n.id}] ${n.name}\n`;
            if (n.children && n.children.length) traverse(n.children, lvl + 1);
        });
    }
    traverse(data.tree, 0);
    return output;
}

function findPathToNode(nodes, target, currentPath = []) {
    for (let node of nodes) {
        if (node === target) return [...currentPath, node];
        if (node.children && node.children.length > 0) {
            const path = findPathToNode(node.children, target, [...currentPath, node]);
            if (path) return path;
        }
    }
    return null;
}

function countTotalChildren(node) {
    let count = node.children ? node.children.length : 0;
    if (node.children) {
        node.children.forEach(c => count += countTotalChildren(c));
    }
    return count;
}

function removeNodeFromTree(targetNode) {
    function traverseAndRemove(nodes) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i] === targetNode) {
                nodes.splice(i, 1);
                return true;
            }
            if (nodes[i].children && nodes[i].children.length > 0) {
                if (traverseAndRemove(nodes[i].children)) {
                    return true;
                }
            }
        }
        return false;
    }
    return traverseAndRemove(mapData.tree);
}

function deleteNodeWithConfirm(node) {
    if (!node) return;
    const nodeName = node.name || 'Mục này';
    const nodeId = node.id || '?';
    const childCount = countTotalChildren(node);
    const extraMsg = childCount > 0 ? `\n(LƯU Ý: Thao tác này sẽ xóa kèm toàn bộ ${childCount} mục con bên trong)` : '';
    
    if (!confirm(`Bạn có chắc chắn muốn xóa mục:\n[${nodeId}] ${nodeName}?${extraMsg}`)) {
        return;
    }
    
    removeNodeFromTree(node);
    if (selectedNode === node) {
        selectedNode = null;
    }
    renderTree();
    updateRightPanel();
    showToast(`Đã xóa mục [${nodeId}] ${nodeName}!`, "success");
}
window.deleteNodeWithConfirm = deleteNodeWithConfirm;

// Kiểm tra xem node hoặc con cháu của nó có khớp với từ khóa tìm kiếm hay không
function isNodeMatchingSearch(node, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const matchThis = (node.name && node.name.toLowerCase().includes(q)) || 
                      (node.id && node.id.toLowerCase().includes(q));
    if (matchThis) return true;
    if (node.children && node.children.length > 0) {
        return node.children.some(c => isNodeMatchingSearch(c, query));
    }
    return false;
}

// --- 4. RENDER CÂY KIẾN THỨC (TREE UI) ---
function renderTree() {
    const container = document.getElementById('treeContainer');
    if (!container) return;
    container.innerHTML = '';
    let totalNodes = 0;

    if (!mapData.tree || mapData.tree.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 text-gray-400">
                <i class="fa-solid fa-folder-tree text-5xl mb-3 text-gray-300 dark:text-gray-700"></i>
                <p class="text-sm font-bold text-gray-500">Chưa có dữ liệu Cây MapID</p>
                <p class="text-xs text-gray-400 mt-1">Bấm nút "Nhập" để nạp từ file .txt hoặc "+ Lớp" để bắt đầu.</p>
            </div>`;
        const badge = document.getElementById('nodeCountBadge');
        if (badge) badge.innerText = '0 mục';
        return;
    }

    function createNodeElement(node, parentPathId = "") {
        // Kiểm tra bộ lọc tìm kiếm
        if (treeSearchQuery && !isNodeMatchingSearch(node, treeSearchQuery)) {
            return null;
        }

        totalNodes++;
        const currentPathId = parentPathId ? `${parentPathId}_${node.id}` : `${node.id}`;
        const hasChildren = node.children && node.children.length > 0;
        
        // Khi đang tìm kiếm, tự động mở các nhánh có kết quả
        const isExpanded = treeSearchQuery ? true : expandedNodes.has(currentPathId);
        const isSelected = selectedNode === node;

        const wrapper = document.createElement('div');
        wrapper.className = "tree-node-wrapper";

        const row = document.createElement('div');
        row.className = `tree-node flex items-center gap-1.5 p-1.5 my-0.5 cursor-pointer rounded-xl select-none transition-colors duration-150 group ${isSelected ? 'active shadow-2xs' : ''}`;
        row.dataset.level = node.level || 0;

        // 1. Nút Toggle Expand / Collapse
        const toggleBtn = document.createElement('span');
        toggleBtn.className = `w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-orange-600 transition-transform duration-200 cursor-pointer shrink-0 ${isExpanded ? 'rotate-90 text-orange-600' : ''}`;
        toggleBtn.innerHTML = hasChildren ? '<i class="fa-solid fa-caret-right text-xs"></i>' : '<span class="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700"></span>';
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            if (hasChildren) {
                if (isExpanded) expandedNodes.delete(currentPathId);
                else expandedNodes.add(currentPathId);
                renderTree();
            }
        };

        // 2. Icon theo cấp bậc
        let iconHtml = '<i class="fa-solid fa-tags text-purple-500 text-xs"></i>';
        if (node.level === 0) iconHtml = '<i class="fa-solid fa-layer-group text-amber-500 text-xs"></i>';
        else if (node.level === 1) iconHtml = '<i class="fa-solid fa-book-open text-blue-500 text-xs"></i>';
        else if (node.level === 2) iconHtml = '<i class="fa-solid fa-bookmark text-emerald-500 text-xs"></i>';
        else if (node.level === 3) iconHtml = '<i class="fa-solid fa-file-lines text-indigo-500 text-xs"></i>';

        const iconDiv = document.createElement('div');
        iconDiv.className = "w-4 text-center shrink-0";
        iconDiv.innerHTML = iconHtml;

        // 3. Badge Mã ID (Editable nhanh)
        const idBadge = document.createElement('span');
        idBadge.className = "font-mono text-[11px] font-black text-gray-700 dark:text-gray-200 bg-gray-200/80 dark:bg-gray-800 px-1.5 py-0.5 rounded-md min-w-[22px] text-center shrink-0 border border-transparent hover:border-orange-400 outline-none";
        idBadge.contentEditable = true;
        idBadge.spellcheck = false;
        idBadge.textContent = node.id || '?';
        idBadge.title = "Click để sửa Mã ID trực tiếp";
        idBadge.onclick = e => e.stopPropagation();
        idBadge.onblur = () => {
            const val = idBadge.textContent.trim();
            if (val) node.id = val;
            updateRightPanel();
        };
        idBadge.onkeydown = e => {
            if (e.key === 'Enter') { e.preventDefault(); idBadge.blur(); }
        };

        // 4. Tên Node (Editable nhanh)
        const nameSpan = document.createElement('span');
        nameSpan.className = "node-name text-xs md:text-[12.5px] flex-1 break-words font-medium text-gray-700 dark:text-gray-200 hover:text-orange-600 outline-none math-content";
        nameSpan.contentEditable = true;
        nameSpan.spellcheck = false;
        nameSpan.textContent = node.name || 'Mục chưa đặt tên';
        nameSpan.title = "Click để sửa Tên mục trực tiếp";
        nameSpan.onclick = e => e.stopPropagation();
        nameSpan.onblur = () => {
            const val = nameSpan.textContent.trim();
            if (val) node.name = val;
            updateRightPanel();
        };
        nameSpan.onkeydown = e => {
            if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
        };

        // 5. Badges thẻ thuộc tính [LT] và [TT]
        const tagsDiv = document.createElement('div');
        tagsDiv.className = "flex items-center gap-1 shrink-0";
        if (node.isTheory) tagsDiv.innerHTML += '<span class="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[9px] font-black" title="Dạng Lý thuyết">LT</span>';
        if (node.isRealWorld) tagsDiv.innerHTML += '<span class="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[9px] font-black" title="Toán Thực tế">TT</span>';

        // 6. Action Buttons: Thêm con (+) và Xóa (🗑)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = "flex items-center gap-0.5 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1";

        // Nút thêm con (+)
        const addBtn = document.createElement('button');
        addBtn.className = "w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer";
        addBtn.title = "Thêm mục con cho mục này";
        addBtn.innerHTML = '<i class="fa-solid fa-plus text-[10px]"></i>';
        addBtn.onclick = (e) => {
            e.stopPropagation();
            if (!node.children) node.children = [];
            const newChild = {
                id: "?",
                name: "Mục mới",
                level: (node.level || 0) + 1,
                children: [],
                isTheory: false,
                isRealWorld: false
            };
            node.children.push(newChild);
            expandedNodes.add(currentPathId);
            selectedNode = newChild;
            renderTree();
            updateRightPanel();
            showToast("Đã thêm mục con mới! Hãy sửa mã ID và tên mục.", "info");
        };

        // Nút xóa (🗑)
        const delBtn = document.createElement('button');
        delBtn.className = "w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer";
        delBtn.title = "Xóa mục này";
        delBtn.innerHTML = '<i class="fa-solid fa-trash-can text-[10px]"></i>';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteNodeWithConfirm(node);
        };

        actionsDiv.append(addBtn, delBtn);

        // Click vào hàng để chọn node
        row.onclick = () => {
            selectedNode = node;
            renderTree();
            updateRightPanel();
        };

        row.append(toggleBtn, iconDiv, idBadge, nameSpan, tagsDiv, actionsDiv);
        wrapper.appendChild(row);

        // Render các node con
        if (hasChildren && isExpanded) {
            const childContainer = document.createElement('div');
            childContainer.className = "tree-children";
            node.children.forEach(child => {
                const childEl = createNodeElement(child, currentPathId);
                if (childEl) childContainer.appendChild(childEl);
            });
            wrapper.appendChild(childContainer);
        }

        return wrapper;
    }

    mapData.tree.forEach(node => {
        const el = createNodeElement(node);
        if (el) container.appendChild(el);
    });

    const badge = document.getElementById('nodeCountBadge');
    if (badge) badge.innerText = `${totalNodes} mục`;

    // Render MathJax cho các công thức toán trong cây
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch(() => {});
    }
}

// --- 5. CẬP NHẬT PANEL CHI TIẾT BÊN PHẢI (RIGHT PANEL) ---
window.currentTopicId = "";

function updateRightPanel() {
    const guidePanel = document.getElementById('topicBuilderGuide');
    const contentPanel = document.getElementById('topicContentPanel');
    if (!guidePanel || !contentPanel) return;

    if (!selectedNode) {
        guidePanel.style.display = 'flex';
        contentPanel.style.display = 'none';
        window.currentTopicId = "";
        return;
    }

    guidePanel.style.display = 'none';
    contentPanel.style.display = 'flex';

    const path = findPathToNode(mapData.tree, selectedNode);
    if (!path) return;

    // 1. Mã kết hợp (Canonical MapID)
    const combinedId = path.map(n => n.id).join('');
    window.currentTopicId = combinedId;

    const previewEl = document.getElementById('previewID');
    if (previewEl) previewEl.innerText = combinedId;

    const titleEl = document.getElementById('topicContentTitle');
    if (titleEl) titleEl.innerText = selectedNode.name || 'Mục chưa đặt tên';

    // 2. Cấp độ Badge
    const levelBadge = document.getElementById('nodeLevelBadge');
    if (levelBadge) {
        const lvl = selectedNode.level || 0;
        const lvlNames = ['Cấp 0 (Lớp)', 'Cấp 1 (Môn)', 'Cấp 2 (Chương)', 'Cấp 3 (Bài)', 'Cấp 4 (Dạng)'];
        levelBadge.innerText = lvlNames[lvl] || `Cấp ${lvl}`;
    }

    // 3. Render Breadcrumb Path
    const pathContainer = document.getElementById('pathContainer');
    if (pathContainer) {
        pathContainer.innerHTML = '';
        path.forEach((p, idx) => {
            const isLast = idx === path.length - 1;
            const span = document.createElement('span');
            span.className = `flex items-center gap-1 font-bold ${isLast ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer'}`;
            span.innerHTML = `<span>${p.name}</span><code class="text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 px-1 py-0.2 rounded">[${p.id}]</code>`;
            span.onclick = () => {
                selectedNode = p;
                renderTree();
                updateRightPanel();
            };
            pathContainer.appendChild(span);

            if (!isLast) {
                const sep = document.createElement('span');
                sep.className = "text-gray-400 text-[10px]";
                sep.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
                pathContainer.appendChild(sep);
            }
        });
    }

    // 4. Form Sửa Thuộc Tính Node
    const editIdInput = document.getElementById('editNodeId');
    if (editIdInput) {
        editIdInput.value = selectedNode.id || '';
        editIdInput.oninput = (e) => {
            selectedNode.id = e.target.value.trim();
            // Cập nhật lại preview ID
            const newPath = findPathToNode(mapData.tree, selectedNode);
            if (newPath) {
                window.currentTopicId = newPath.map(n => n.id).join('');
                if (previewEl) previewEl.innerText = window.currentTopicId;
            }
            renderTree();
        };
    }

    const editNameInput = document.getElementById('editNodeName');
    if (editNameInput) {
        editNameInput.value = selectedNode.name || '';
        editNameInput.oninput = (e) => {
            selectedNode.name = e.target.value;
            if (titleEl) titleEl.innerText = e.target.value;
            renderTree();
        };
    }

    const chkTheory = document.getElementById('chkTheory');
    if (chkTheory) {
        chkTheory.checked = !!selectedNode.isTheory;
        chkTheory.onchange = (e) => {
            selectedNode.isTheory = e.target.checked;
            renderTree();
            showToast(`Đã ${e.target.checked ? 'gắn' : 'bỏ'} thẻ Lý thuyết [LT].`, "info");
        };
    }

    const chkRealWorld = document.getElementById('chkRealWorld');
    if (chkRealWorld) {
        chkRealWorld.checked = !!selectedNode.isRealWorld;
        chkRealWorld.onchange = (e) => {
            selectedNode.isRealWorld = e.target.checked;
            renderTree();
            showToast(`Đã ${e.target.checked ? 'gắn' : 'bỏ'} thẻ Thực tế [TT].`, "info");
        };
    }

    // 5. Ghi chú lý thuyết
    const theoryNotes = document.getElementById('nodeTheoryNotes');
    if (theoryNotes) {
        theoryNotes.value = selectedNode.theory || '';
    }

    // 6. Tải danh sách câu hỏi khớp mã ID này
    window.loadTopicContent(window.currentTopicId);

    // Render lại MathJax cho breadcrumb và tiêu đề
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([pathContainer, titleEl]).catch(() => {});
    }
}

// Xóa node đang chọn
window.deleteCurrentNode = function() {
    if (selectedNode) {
        deleteNodeWithConfirm(selectedNode);
    }
};

// Lưu ghi chú lý thuyết
window.saveNodeTheory = function() {
    if (!selectedNode) return;
    const txt = document.getElementById('nodeTheoryNotes')?.value || '';
    selectedNode.theory = txt;
    showToast("Đã lưu ghi chú lý thuyết vào mục này!", "success");
};

// Chuyển đổi tab bên phải (Overview vs Theory)
window.switchMapTab = function(tabName) {
    const tabOverview = document.getElementById('mapTab-overview');
    const tabTheory = document.getElementById('mapTab-theory');
    const contentOverview = document.getElementById('mapContent-overview');
    const contentTheory = document.getElementById('mapContent-theory');

    if (tabName === 'overview') {
        if (tabOverview) tabOverview.className = "pb-3 border-b-2 border-season-from text-season-from font-bold text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5";
        if (tabTheory) tabTheory.className = "pb-3 border-b-2 border-transparent hover:text-gray-900 dark:hover:text-gray-100 text-gray-500 font-bold text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5";
        if (contentOverview) contentOverview.classList.remove('hidden');
        if (contentTheory) contentTheory.classList.add('hidden');
    } else {
        if (tabTheory) tabTheory.className = "pb-3 border-b-2 border-season-from text-season-from font-bold text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5";
        if (tabOverview) tabOverview.className = "pb-3 border-b-2 border-transparent hover:text-gray-900 dark:hover:text-gray-100 text-gray-500 font-bold text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5";
        if (contentTheory) contentTheory.classList.remove('hidden');
        if (contentOverview) contentOverview.classList.add('hidden');
    }
};

// Thêm mục gốc (Level 0 - Lớp mới)
window.addRootNode = function() {
    const newRoot = {
        id: "?",
        name: "Lớp mới / Khối mới",
        level: 0,
        children: [],
        isTheory: false,
        isRealWorld: false
    };
    mapData.tree.push(newRoot);
    selectedNode = newRoot;
    renderTree();
    updateRightPanel();
    showToast("Đã thêm Lớp mới ở cấp gốc! Hãy sửa mã ID (VD: 9, 10, 11) và Tên.", "info");
};

// Mở rộng tất cả các nhánh
window.expandAllNodes = function() {
    function traverse(nodes, parentId = "") {
        nodes.forEach(n => {
            const pathId = parentId ? `${parentId}_${n.id}` : `${n.id}`;
            expandedNodes.add(pathId);
            if (n.children && n.children.length > 0) traverse(n.children, pathId);
        });
    }
    traverse(mapData.tree);
    renderTree();
};

// Thu gọn tất cả các nhánh
window.collapseAllNodes = function() {
    expandedNodes.clear();
    renderTree();
};

// Tìm kiếm nhanh trên cây
window.clearTreeSearch = function() {
    const input = document.getElementById('treeSearchInput');
    if (input) input.value = '';
    treeSearchQuery = "";
    document.getElementById('btnClearSearch')?.classList.add('hidden');
    renderTree();
};

const searchInput = document.getElementById('treeSearchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        treeSearchQuery = e.target.value.trim();
        const clearBtn = document.getElementById('btnClearSearch');
        if (clearBtn) {
            if (treeSearchQuery) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }
        renderTree();
    });
}

// --- 6. LOGIC NGÂN HÀNG CÂU HỎI KHỚP MAPID ---
window.globalBankQuestions = [];
window.topicQuestions = [];

window.loadBankData = async () => {
    try {
        const cached = localStorage.getItem('lms_cached_bank');
        if (cached) {
            window.globalBankQuestions = JSON.parse(cached);
        }
        const res = await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/bank");
        if (res.ok) {
            const data = await res.json();
            window.globalBankQuestions = data;
            try { localStorage.setItem('lms_cached_bank', JSON.stringify(data)); } catch(_) {}
        }
    } catch (e) {
        console.warn("Lỗi tải Ngân hàng:", e);
    }
};

window.reloadCurrentTopicQuestions = async () => {
    await window.loadBankData();
    window.loadTopicContent(window.currentTopicId);
    showToast("Đã làm mới danh sách câu hỏi!", "info");
};

window.loadTopicContent = async (mapId) => {
    if (!mapId) return;
    const listDiv = document.getElementById('topicQuestionsList');
    if (!listDiv) return;
    
    listDiv.innerHTML = `
        <div class="text-center py-16 text-gray-400">
            <i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-orange-500"></i>
            <p class="text-xs font-bold">Đang tra cứu câu hỏi khớp mã ${mapId}...</p>
        </div>`;

    if (!window.globalBankQuestions || window.globalBankQuestions.length === 0) {
        await window.loadBankData();
    }

    const cleanTargetId = String(mapId).toUpperCase();
    
    // Lọc câu hỏi có mapId bắt đầu bằng cleanTargetId hoặc id bắt đầu bằng cleanTargetId
    window.topicQuestions = window.globalBankQuestions.filter(q => {
        if (!q) return false;
        const qMid = String(q.mapId || (q.id && q.id.includes('_') ? q.id.split('_')[0] : q.id) || "").toUpperCase();
        return qMid === cleanTargetId || qMid.startsWith(cleanTargetId);
    });

    // Cập nhật thống kê
    let nb = 0, th = 0, vd = 0, vdc = 0;
    window.topicQuestions.forEach(q => {
        const lvl = (q.level || '').toLowerCase();
        if (lvl.includes('nhận biết') || lvl === 'nb') nb++;
        else if (lvl.includes('thông hiểu') || lvl === 'th') th++;
        else if (lvl.includes('vận dụng cao') || lvl === 'vdc') vdc++;
        else if (lvl.includes('vận dụng') || lvl === 'vd') vd++;
    });

    const elNb = document.getElementById('statNb');
    const elTh = document.getElementById('statTh');
    const elVd = document.getElementById('statVd');
    const elVdc = document.getElementById('statVdc');
    const elTotal = document.getElementById('statTotalMatched');

    if (elNb) elNb.innerText = nb;
    if (elTh) elTh.innerText = th;
    if (elVd) elVd.innerText = vd;
    if (elVdc) elVdc.innerText = vdc;
    if (elTotal) elTotal.innerText = `${window.topicQuestions.length} câu`;

    renderTopicQuestions();
};

function renderTopicQuestions() {
    const listDiv = document.getElementById('topicQuestionsList');
    if (!listDiv) return;

    if (window.topicQuestions.length === 0) {
        listDiv.innerHTML = `
            <div class="text-center text-gray-400 py-16 flex flex-col items-center">
                <i class="fa-solid fa-box-open text-4xl mb-3 text-gray-300 dark:text-gray-700"></i>
                <p class="font-bold text-sm text-gray-500">Chưa có câu hỏi nào khớp với mã ${window.currentTopicId}.</p>
                <p class="text-xs text-gray-400 mt-1">Bấm "Nạp câu hỏi" từ file hoặc "Chọn từ kho" để gán câu vào mã này.</p>
            </div>`;
        return;
    }

    let html = '';
    window.topicQuestions.forEach((q, idx) => {
        let optionsHtml = '';
        if (q.options && q.options.length > 0) {
            optionsHtml = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">';
            q.options.forEach(opt => {
                const isCorrect = (opt.key === q.correctAnswer);
                optionsHtml += `
                    <div class="p-2 rounded-xl text-xs ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold' : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300'}">
                        <strong class="font-black mr-1">${opt.key}.</strong> <span class="math-content">${opt.text}</span>
                    </div>`;
            });
            optionsHtml += '</div>';
        }

        html += `
            <div class="bg-gray-50/50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 relative group transition-all hover:border-season-from">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-2">
                        <span class="badge-season px-2 py-0.5 rounded-lg text-[11px] font-black">Câu ${idx + 1}</span>
                        <span class="font-mono text-xs font-bold text-gray-500 dark:text-gray-400">ID: ${q.id}</span>
                        ${q.cccd ? `<span class="bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded">CCCD #${q.cccd}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300">${q.level || 'Chưa phân loại'}</span>
                        <button onclick="window.removeQuestionFromTopic('${q.id}')" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 cursor-pointer" title="Bỏ gán MapID khỏi câu này">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
                <div class="text-xs sm:text-sm text-gray-800 dark:text-gray-200 math-content leading-relaxed">${q.content}</div>
                ${optionsHtml}
            </div>`;
    });

    listDiv.innerHTML = html;
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([listDiv]).catch(() => {});
    }
}

window.removeQuestionFromTopic = async (qId) => {
    if (!confirm("Bạn có muốn bỏ gán MapID của câu hỏi này không?")) return;
    try {
        const qData = await (await fetch(`https://upload-helper.phamngockhanh-942001.workers.dev/bank?id=${qId}`)).json();
        qData.mapId = ""; // Gỡ mapId
        const blob = new Blob([JSON.stringify(qData)], { type: 'application/json' });
        const formData = new FormData();
        formData.append('file', blob, `bank/${qId}.json`);
        await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/", { method: 'PUT', body: formData });
        
        showToast("Đã bỏ gán MapID khỏi câu hỏi!", "success");
        window.loadTopicContent(window.currentTopicId);
    } catch (e) {
        showToast("Lỗi: " + e.message, "error");
    }
};

// --- 7. LOGIC NẠP CÂU HỎI VÀ GÁN MAPID ---
const btnImportTopic = document.getElementById('btnImportTopic');
if (btnImportTopic) {
    btnImportTopic.addEventListener('click', () => {
        if (!window.currentTopicId) {
            showToast("Vui lòng chọn một mục trong Cây bên trái trước!", "warning");
            return;
        }
        let input = document.getElementById('hiddenImportTopicInput');
        if (!input) {
            input = document.createElement('input');
            input.id = 'hiddenImportTopicInput';
            input.type = 'file';
            input.accept = '.txt,.tex';
            input.style.display = 'none';
            document.body.appendChild(input);
        }
        input.value = '';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showToast("Đang phân tích file...", "info");
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const text = event.target.result;
                    const fileMap = new Map();
                    fileMap.set(file.name, text);
                    
                    const parsedTopic = await parseTopicFromTex(fileMap, new Map(), () => {});
                    if (!parsedTopic.questions || parsedTopic.questions.length === 0) {
                        showToast("Không tìm thấy câu hỏi hợp lệ trong file!", "error");
                        return;
                    }
                    
                    showToast(`Bóc tách được ${parsedTopic.questions.length} câu. Đang cấp mã CCCD & đẩy lên Ngân hàng...`, "info");
                    
                    let batch = null;
                    if (window.BankService) {
                        batch = await window.BankService.allocateCccdBatch(parsedTopic.questions.length);
                    }

                    const questionsToUpload = [];
                    for (let i = 0; i < parsedTopic.questions.length; i++) {
                        const q = parsedTopic.questions[i];
                        const qCccd = batch ? batch.list[i] : String(Date.now() + i);
                        q.mapId = window.currentTopicId;
                        
                        let bankQ;
                        if (window.BankService) {
                            bankQ = window.BankService.createBankQuestion({
                                ...q,
                                topicId: window.currentTopicId,
                                mapId: window.currentTopicId
                            }, qCccd);
                        } else {
                            q.id = qCccd;
                            q.cccd = qCccd;
                            bankQ = q;
                        }
                        questionsToUpload.push(bankQ);
                    }

                    if (window.BankService) {
                        await window.BankService.uploadQuestionsToBank(questionsToUpload, { concurrency: 5 });
                    } else {
                        for (const q of questionsToUpload) {
                            const blob = new Blob([JSON.stringify(q)], { type: 'application/json' });
                            const formData = new FormData();
                            formData.append('file', blob, `bank/${q.id}.json`);
                            await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/", { method: 'PUT', body: formData });
                        }
                    }
                    
                    showToast(`Đã thêm thành công ${questionsToUpload.length} câu vào MapID ${window.currentTopicId}!`, "success");
                    window.loadTopicContent(window.currentTopicId);
                } catch (err) {
                    console.error(err);
                    showToast("Lỗi phân tích file: " + err.message, "error");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}

// Modal chọn từ Ngân hàng
const btnSelectBank = document.getElementById('btnSelectBank');
if (btnSelectBank) {
    btnSelectBank.addEventListener('click', async () => {
        if (!window.currentTopicId) {
            showToast("Vui lòng chọn một mục trong Cây bên trái trước!", "warning");
            return;
        }
        const sub = document.getElementById('selectBankModalSubtitle');
        if (sub) sub.innerText = `Đang thêm vào MapID: ${window.currentTopicId}`;
        
        const modal = document.getElementById('selectBankModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        
        if (!window.globalBankQuestions || window.globalBankQuestions.length === 0) {
            await window.loadBankData();
        }
        window.renderBankModalList();
    });
}

window.renderBankModalList = () => {
    const listDiv = document.getElementById('bankModalList');
    if (!listDiv) return;
    const search = (document.getElementById('bankSearch')?.value || '').toLowerCase();
    const filterLvl = document.getElementById('bankFilterLevel')?.value || 'all';
    
    let filtered = window.globalBankQuestions.filter(q => {
        if (!q) return false;
        if (q.mapId === window.currentTopicId) return false; // Ẩn các câu đã có mapId này
        if (filterLvl !== 'all' && q.level !== filterLvl) return false;
        if (search && !q.content?.toLowerCase().includes(search) && !(q.id && q.id.toLowerCase().includes(search))) return false;
        return true;
    });
    
    if (filtered.length === 0) {
        listDiv.innerHTML = '<div class="text-center py-12 text-gray-400 text-xs font-bold">Không tìm thấy câu hỏi nào phù hợp.</div>';
        return;
    }
    
    let html = '';
    filtered.slice(0, 100).forEach(q => {
        html += `
            <label class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 flex gap-3 cursor-pointer hover:bg-orange-50/50 dark:hover:bg-gray-750 transition-colors mb-2.5">
                <input type="checkbox" value="${q.id}" class="bank-item-checkbox w-4 h-4 mt-1 text-orange-600 rounded border-gray-300 dark:border-gray-600 shrink-0">
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] text-gray-500 dark:text-gray-400 mb-1 flex justify-between items-center gap-2">
                        <div class="flex items-center gap-2 truncate">
                            <span class="font-bold text-gray-800 dark:text-gray-200 font-mono">#${q.id}</span>
                            ${q.mapId ? `<span class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono px-1.5 py-0.2 rounded text-[10px]">Map: ${q.mapId}</span>` : ''}
                        </div>
                        <span class="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0">${q.level || 'Chưa phân loại'}</span>
                    </div>
                    <div class="text-xs text-gray-800 dark:text-gray-200 math-content line-clamp-2">${q.content}</div>
                </div>
            </label>`;
    });
    
    listDiv.innerHTML = html;
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([listDiv]).catch(() => {});
    }
    
    document.querySelectorAll('.bank-item-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const count = document.querySelectorAll('.bank-item-checkbox:checked').length;
            const cntEl = document.getElementById('bankSelectedCount');
            if (cntEl) cntEl.innerText = count;
        });
    });
};

document.getElementById('bankSearch')?.addEventListener('input', window.renderBankModalList);
document.getElementById('bankFilterLevel')?.addEventListener('change', window.renderBankModalList);

document.getElementById('btnConfirmBankSelection')?.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.bank-item-checkbox:checked')).map(cb => cb.value);
    if (selected.length === 0) return;
    
    const btn = document.getElementById('btnConfirmBankSelection');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gán...';
    btn.disabled = true;
    
    try {
        for (let qId of selected) {
            const qData = await (await fetch(`https://upload-helper.phamngockhanh-942001.workers.dev/bank?id=${qId}`)).json();
            qData.mapId = window.currentTopicId;
            const blob = new Blob([JSON.stringify(qData)], { type: 'application/json' });
            const formData = new FormData();
            formData.append('file', blob, `bank/${qId}.json`);
            await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/", { method: 'PUT', body: formData });
        }
        showToast(`Đã gán thành công ${selected.length} câu hỏi vào MapID ${window.currentTopicId}!`, "success");
        const modal = document.getElementById('selectBankModal');
        if (modal) {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }
        window.loadTopicContent(window.currentTopicId);
    } catch (e) {
        showToast("Lỗi: " + e.message, "error");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
        const cntEl = document.getElementById('bankSelectedCount');
        if (cntEl) cntEl.innerText = '0';
    }
});

// --- 8. LƯU CẤU HÌNH, NHẬP & XUẤT FILE ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Nhập file .txt
    const btnImport = document.getElementById('btnImport');
    const fileInput = document.getElementById('fileInput');
    if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showToast('Đang nạp file cấu hình MapID...', 'info');

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    mapData = parseMapID(evt.target.result);
                    expandedNodes.clear();
                    renderTree();
                    showToast('Đã nhập Cây MapID thành công! Hãy kiểm tra và bấm "Lưu cấu hình".', 'success');
                } catch (err) {
                    console.error(err);
                    alert("Lỗi đọc file MapID: " + err.message);
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });
    }

    // 2. Xuất file .txt
    const btnExport = document.getElementById('btnExport');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const text = generateMapID(mapData);
            const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `MapID_Chuan_${new Date().toISOString().slice(0,10)}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("Đã xuất file MapID thành công!", "success");
        });
    }

    // 3. Lưu Cây MapID lên Server
    const btnSave = document.getElementById('btnSave');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const oldHtml = btnSave.innerHTML;
            btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang lưu...</span>';
            btnSave.disabled = true;
            
            showToast('Đang lưu Cây MapID chuẩn lên Server...', 'info');

            try {
                const cleanData = JSON.parse(JSON.stringify(mapData.tree));
                await setDoc(doc(db, "configurations", "map_id_tree"), {
                    metadata: mapData.metadata || [],
                    tree: cleanData,
                    updatedAt: new Date().toISOString(),
                    updatedBy: auth.currentUser ? auth.currentUser.email : 'system'
                });

                // Cập nhật cache cục bộ cho các trang khác (dashboard, practice, exam-editor)
                try {
                    localStorage.setItem('lms_cached_mapid_tree', JSON.stringify(cleanData));
                    localStorage.setItem('lms_mapid_last_updated', Date.now().toString());
                    window.globalIdTree = cleanData;
                } catch(_) {}

                showToast('Đã lưu Cây MapID Chuẩn lên Server thành công! Đồng bộ tức thì với Ngân hàng câu hỏi, Luyện tập và Soạn đề.', 'success');
            } catch (e) {
                console.error(e);
                alert("Lỗi lưu Cây MapID: " + e.message);
            } finally {
                btnSave.innerHTML = oldHtml;
                btnSave.disabled = false;
            }
        });
    }
});

// --- 9. TỰ ĐỘNG TẢI DỮ LIỆU KHI MỞ TRANG ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "configurations", "map_id_tree"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                mapData.tree = data.tree || [];
                mapData.metadata = data.metadata || [];
                try {
                    localStorage.setItem('lms_cached_mapid_tree', JSON.stringify(mapData.tree));
                } catch(_) {}
                renderTree();
            } else if (mapData.tree.length > 0) {
                renderTree();
            }
        } catch(e) {
            console.warn("Lỗi tải configurations/map_id_tree:", e);
            if (mapData.tree.length > 0) renderTree();
        }
    } else {
        // Cho phép xem tạm nếu có cache cục bộ, nếu không chuyển hướng đăng nhập
        if (!mapData.tree || mapData.tree.length === 0) {
            window.location.href = 'index.html';
        } else {
            renderTree();
        }
    }
});

// Toast notification helper
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    const msgEl = document.getElementById('toastMsg');
    const iconEl = document.getElementById('toastIcon');
    
    if (msgEl) msgEl.innerText = msg;
    if (iconEl) {
        if (type === 'error') {
            iconEl.className = 'fa-solid fa-circle-exclamation text-rose-500 text-lg';
        } else if (type === 'info') {
            iconEl.className = 'fa-solid fa-circle-info text-blue-500 text-lg';
        } else if (type === 'warning') {
            iconEl.className = 'fa-solid fa-triangle-exclamation text-amber-500 text-lg';
        } else {
            iconEl.className = 'fa-solid fa-circle-check text-emerald-500 text-lg';
        }
    }
    
    if (toastTimeout) clearTimeout(toastTimeout);
    t.classList.remove('translate-x-full', 'opacity-0');
    
    toastTimeout = setTimeout(() => {
        t.classList.add('translate-x-full', 'opacity-0');
    }, 3200);
}
window.showToast = showToast;
