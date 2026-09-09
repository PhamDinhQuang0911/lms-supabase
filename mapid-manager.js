import { parseTopicFromTex } from './topic-parser.js';
import { 
    initializeApp, getAuth, onAuthStateChanged,
    getFirestore, doc, getDoc, setDoc, enableMultiTabIndexedDbPersistence as enableIndexedDbPersistence,
    supabase
} from "./supabase-db-compat.js";

// --- 1. CẤU HÌNH SUPABASE ---
const app = initializeApp({});
const db = getFirestore(app);
const auth = getAuth(app);

// Kích hoạt Cache Offline
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') console.log('Lỗi: Đang mở quá nhiều tab.');
    else if (err.code == 'unimplemented') console.log('Trình duyệt không hỗ trợ cache.');
});

// --- 2. TRẠNG THÁI (STATE) ---
let mapData = { metadata: [], tree: [] };
let selectedNode = null;
let expandedNodes = new Set(); 
let toastTimeout = null;

// --- 3. XỬ LÝ DỮ LIỆU (CORE) ---
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
            const node = { id: match[2], name: match[3], level: level, children: [], isTheory: false, isRealWorld: false };
            if (level === 0) { root.push(node); stack[0] = node; stack.length = 1; } 
            else { const p = stack[level - 1]; if (p) { p.children.push(node); stack[level] = node; stack.length = level + 1; } }
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
    if (node.children) node.children.forEach(c => count += countTotalChildren(c));
    return count;
}

// --- 4. VẼ GIAO DIỆN (UI RENDER) ---
function renderTree() {
    const container = document.getElementById('treeContainer');
    if (!container) return;
    container.innerHTML = '';
    let totalNodes = 0;

    if (!mapData.tree || mapData.tree.length === 0) {
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-64 text-gray-300"><i class="fa-solid fa-folder-tree text-5xl mb-3"></i><p>Chưa có dữ liệu</p></div>';
        return;
    }

    function createNodeElement(node, parentPathId = "") {
        totalNodes++;
        const currentPathId = parentPathId ? `${parentPathId}_${node.id}` : node.id;
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedNodes.has(currentPathId);
        const isSelected = selectedNode === node;

        const wrapper = document.createElement('div');
        const row = document.createElement('div');
        row.className = `tree-node flex items-center gap-2 p-1.5 cursor-pointer rounded select-none transition-colors duration-150 ${isSelected ? 'active bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-100 border-l-4 border-transparent'}`;
        
        const toggleBtn = document.createElement('span');
        toggleBtn.className = `w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-transform duration-200 cursor-pointer ${isExpanded ? 'rotate-90 text-blue-600' : ''}`;
        toggleBtn.innerHTML = hasChildren ? '<i class="fa-solid fa-caret-right"></i>' : '';
        toggleBtn.onclick = (e) => { e.stopPropagation(); if (hasChildren) { isExpanded ? expandedNodes.delete(currentPathId) : expandedNodes.add(currentPathId); renderTree(); } };

        let iconHtml = '<i class="fa-solid fa-circle text-[6px] text-gray-300"></i>';
        if (node.level === 0) iconHtml = '<i class="fa-solid fa-layer-group text-yellow-500"></i>';
        else if (node.level === 1) iconHtml = '<i class="fa-solid fa-book-open text-blue-500"></i>';
        else if (node.level === 2) iconHtml = '<i class="fa-solid fa-bookmark text-green-500"></i>';
        else iconHtml = '<i class="fa-solid fa-file-lines text-purple-500"></i>';

        const idBadge = document.createElement('span');
        idBadge.className = "font-mono text-xs font-bold text-gray-600 bg-gray-200 px-1.5 rounded min-w-[24px] text-center hover:bg-white hover:border hover:border-blue-400 outline-none";
        idBadge.contentEditable = true;
        idBadge.textContent = node.id;
        idBadge.onclick = e => e.stopPropagation();
        idBadge.onblur = () => { node.id = idBadge.textContent.trim(); updateRightPanel(); };
        idBadge.onkeydown = e => { if(e.key==='Enter') { e.preventDefault(); idBadge.blur(); }};

        // --- XỬ LÝ TÊN & MATHJAX ---
        const nameSpan = document.createElement('span');
        nameSpan.className = "node-name text-sm flex-1 break-words hover:text-blue-700 outline-none border-b border-transparent hover:border-dashed hover:border-gray-300";
        nameSpan.contentEditable = true;
        nameSpan.textContent = node.name; 
        
        nameSpan.onfocus = () => { nameSpan.textContent = node.name; };
        nameSpan.onblur = () => { node.name = nameSpan.textContent.trim(); updateRightPanel(); renderTree(); };
        nameSpan.onclick = e => e.stopPropagation();
        nameSpan.onkeydown = e => { if(e.key==='Enter') { e.preventDefault(); nameSpan.blur(); }};

        // --- [MỚI] HIỂN THỊ BADGE TAGS ---
        const tagsDiv = document.createElement('div');
        tagsDiv.className = "flex gap-1 mx-1";
        if (node.isTheory) tagsDiv.innerHTML += '<span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold shadow-sm" title="Lý thuyết">LT</span>';
        if (node.isRealWorld) tagsDiv.innerHTML += '<span class="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[9px] font-bold shadow-sm" title="Thực tế">TT</span>';

        const addBtn = document.createElement('button');
        addBtn.className = "w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-green-600 hover:bg-green-100 opacity-100 transition-all";
        addBtn.innerHTML = '<i class="fa-solid fa-plus text-xs"></i>';
        addBtn.onclick = (e) => { e.stopPropagation(); if (!node.children) node.children = []; node.children.push({ id: "?", name: "Mục mới", level: node.level + 1, children: [], isTheory: false, isRealWorld: false }); expandedNodes.add(currentPathId); renderTree(); };

        row.onclick = () => { selectedNode = node; renderTree(); updateRightPanel(); };
        row.classList.add('group');
        row.append(toggleBtn); 
        const iconDiv = document.createElement('div'); iconDiv.className = "w-5 text-center"; iconDiv.innerHTML = iconHtml; row.append(iconDiv);
        row.append(idBadge, nameSpan, tagsDiv, addBtn); // Đã chèn tagsDiv vào giao diện
        wrapper.appendChild(row);

        if (hasChildren && isExpanded) {
            const childContainer = document.createElement('div');
            childContainer.className = "pl-6 border-l border-dashed border-gray-300 ml-3";
            node.children.forEach(child => childContainer.appendChild(createNodeElement(child, currentPathId)));
            wrapper.appendChild(childContainer);
        }
        return wrapper;
    }

    mapData.tree.forEach(node => container.appendChild(createNodeElement(node)));
    const badge = document.getElementById('nodeCountBadge');
    if (badge) badge.innerText = `${totalNodes} mục`;

    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch(err => console.log('MathJax error:', err));
    }
}

window.currentTopicId = "";
    const btnGrp = document.getElementById("topicActionButtons");
    if (btnGrp) btnGrp.style.display = "none";
function updateRightPanel() {
    const infoPanel = document.getElementById('infoPanel');
    const infoEmpty = document.getElementById('infoEmpty');
    const statPanel = document.getElementById('statPanel');
    if (!infoPanel) return;

    if (!selectedNode) {
        infoPanel.classList.add('hidden'); statPanel.classList.add('hidden'); infoEmpty.classList.remove('hidden');
        return;
    }
    infoPanel.classList.remove('hidden'); statPanel.classList.remove('hidden'); infoEmpty.classList.add('hidden');

    const path = findPathToNode(mapData.tree, selectedNode);
    if (path) {
        const pathContainer = document.getElementById('pathContainer');
        if (pathContainer) {
            pathContainer.innerHTML = '';
            document.getElementById('previewID').innerText = path.map(n => n.id).join('');
            window.currentTopicId = path.map(n => n.id).join("");
              window.loadTopicContent(window.currentTopicId);
              path.forEach((p, idx) => {
                const div = document.createElement('div');
                div.className = "flex items-start gap-3 text-sm";
                div.innerHTML = `
                    <div class="flex flex-col items-center"><span class="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></span>${idx < path.length - 1 ? '<div class="w-0.5 h-full bg-gray-200 my-1"></div>' : ''}</div>
                    <div><span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cấp ${p.level}</span><div class="font-bold text-gray-800 math-content">${p.name}</div><div class="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-0.5 border border-blue-100">Mã: ${p.id}</div></div>
                `;
                pathContainer.appendChild(div);
            });
            if(window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([pathContainer]);
        }
    }
    const elDirect = document.getElementById('statDirectChild');
    const elTotal = document.getElementById('statTotalChild');
    if(elDirect) elDirect.innerText = selectedNode.children ? selectedNode.children.length : 0;
    if(elTotal) elTotal.innerText = countTotalChildren(selectedNode);

    // --- [MỚI] XỬ LÝ CHECKBOX THUỘC TÍNH (TAGS VĨ MÔ) ---
    const chkTheory = document.getElementById('chkTheory');
    const chkRealWorld = document.getElementById('chkRealWorld');
    
    if (chkTheory) {
        chkTheory.checked = !!selectedNode.isTheory;
        chkTheory.onchange = (e) => {
            selectedNode.isTheory = e.target.checked;
            renderTree(); // Cập nhật lại UI để hiện/ẩn Badge LT
            showToast(`Đã ${e.target.checked ? 'gắn' : 'bỏ'} thẻ Lý thuyết cho nhánh này.`);
        };
    }
    
    if (chkRealWorld) {
        chkRealWorld.checked = !!selectedNode.isRealWorld;
        chkRealWorld.onchange = (e) => {
            selectedNode.isRealWorld = e.target.checked;
            renderTree(); // Cập nhật lại UI để hiện/ẩn Badge TT
            showToast(`Đã ${e.target.checked ? 'gắn' : 'bỏ'} thẻ Thực tế cho nhánh này.`);
        };
    }
}

// --- 5. EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    const btnImport = document.getElementById('btnImport');
    if (btnImport) btnImport.addEventListener('click', () => document.getElementById('fileInput').click());

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        showToast('Đang đọc file...', 'info');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                // Việc import text cũ không làm mất tag nếu ta bổ sung sau,
                // Nhưng nếu ghi đè hoàn toàn bằng file txt sẽ reset lại tag.
                mapData = parseMapID(evt.target.result);
                expandedNodes.clear();
                renderTree();
                showToast('Đã nhập file thành công!');
            } catch (err) {
                console.error(err);
                alert("Lỗi đọc file: " + err.message);
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    const btnExport = document.getElementById('btnExport');
    if (btnExport) btnExport.addEventListener('click', () => {
        const text = generateMapID(mapData);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MapID_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
    });

    const btnSave = document.getElementById('btnSave');
    if (btnSave) btnSave.addEventListener('click', async () => {
        const oldText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btnSave.disabled = true;
        
        showToast('Đang lưu dữ liệu...', 'info');

        try {
            const cleanData = JSON.parse(JSON.stringify(mapData.tree));
            await setDoc(doc(db, "configurations", "map_id_tree"), {
                metadata: mapData.metadata,
                tree: cleanData,
                updatedAt: new Date().toISOString(),
                updatedBy: auth.currentUser ? auth.currentUser.email : 'unknown'
            });
            showToast('Đã lưu cấu hình lên Server!');
        } catch (e) {
            console.error(e);
            let msg = e.message;
            if (msg.includes("offline")) msg = "Mất kết nối. Vui lòng kiểm tra mạng.";
            alert("Lỗi lưu: " + msg);
        } finally {
            btnSave.innerHTML = oldText;
            btnSave.disabled = false;
        }
    });

    const btnDel = document.getElementById('btnDeleteNode');
    if (btnDel) btnDel.addEventListener('click', () => {
        if (!selectedNode) return;
        if (!confirm(`Xóa mục "${selectedNode.name}" và toàn bộ con?`)) return;
        function removeNode(nodes, target) {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i] === target) { nodes.splice(i, 1); return true; }
                if (nodes[i].children && removeNode(nodes[i].children, target)) return true;
            }
            return false;
        }
        removeNode(mapData.tree, selectedNode);
        selectedNode = null;
        renderTree();
        updateRightPanel();
        showToast('Đã xóa mục!');
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "configurations", "map_id_tree"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                mapData.tree = data.tree || [];
                mapData.metadata = data.metadata || [];
                renderTree();
            }
        } catch(e) { console.log(e); }
    } else {
        window.location.href = 'index.html';
    }
});

function showToast(msg) {
    const t = document.getElementById('toast');
    if (t) {
        const msgEl = document.getElementById('toastMsg');
        if(msgEl) msgEl.innerText = msg;
        
        if (toastTimeout) clearTimeout(toastTimeout);

        t.classList.remove('translate-x-full', 'opacity-0');
        
        toastTimeout = setTimeout(() => {
            t.classList.add('translate-x-full', 'opacity-0');
        }, 3000);
    }
}


// --- LOGIC QUẢN LÝ CHUYÊN ĐỀ (TOPIC MANAGER) ---
window.globalBankQuestions = [];
window.topicQuestions = [];

window.loadBankData = async () => {
    try {
        const res = await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/bank");
        if (res.ok) {
            window.globalBankQuestions = await res.json();
        }
    } catch (e) {
        console.error("Lỗi tải Ngân hàng:", e);
    }
};

window.loadTopicContent = async (mapId) => {
    if (!mapId) return;
    const guide = document.getElementById('topicBuilderGuide');
    if (guide) guide.style.display = 'none';
    const content = document.getElementById('topicBuilderContent');
    if (content) content.style.display = 'flex';
    const title2 = document.getElementById('topicContentTitle2');
    if (title2) title2.innerHTML = '<i class="fa-solid fa-bookmark mr-2"></i>' + mapId;
    document.getElementById('topicContentTitle').innerHTML = `<i class="fa-solid fa-book-open text-blue-500 mr-2"></i>Nội dung Chuyên đề: ${mapId}`;
    const listDiv = document.getElementById('topicQuestionsList');
    listDiv.innerHTML = '<div class="text-center py-20 text-gray-400"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-blue-500"></i><br>Đang tải câu hỏi...</div>';
    
    if (window.globalBankQuestions.length === 0) {
        await window.loadBankData();
    }
    
    window.topicQuestions = window.globalBankQuestions.filter(q => q.mapId === mapId || (q.id && q.id.startsWith(mapId + "_")));
    
    renderTopicQuestions();
};

function renderTopicQuestions() {
    const listDiv = document.getElementById('topicQuestionsList');
    if (window.topicQuestions.length === 0) {
        listDiv.innerHTML = `
            <div class="text-center text-gray-400 py-20 flex flex-col items-center">
                <i class="fa-solid fa-box-open text-4xl mb-3 text-gray-300"></i>
                <p>Chuyên đề này chưa có câu hỏi nào.</p>
                <p class="text-xs mt-2">Bấm "Nhập file" hoặc "Chọn từ kho" để thêm.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    window.topicQuestions.forEach((q, idx) => {
        let optionsHtml = '';
        if (q.options && q.options.length > 0) {
            optionsHtml = '<div class="grid grid-cols-2 gap-2 mt-3">';
            q.options.forEach(opt => {
                const isCorrect = (opt.key === q.correctAnswer);
                optionsHtml += `<div class="p-2 rounded text-sm ${isCorrect ? 'bg-green-50 border border-green-200 text-green-700 font-bold' : 'bg-gray-50 border border-gray-100 text-gray-600'}">${opt.key}. ${opt.text}</div>`;
            });
            optionsHtml += '</div>';
        }
        
        html += `
            <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group">
                <div class="flex justify-between items-start mb-2">
                    <span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">Câu ${idx + 1}</span>
                    <button onclick="window.removeQuestionFromTopic('${q.id}')" class="text-gray-400 hover:text-red-500 hidden group-hover:block transition-colors"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <div class="text-sm text-gray-800 math-content">${q.content}</div>
                ${optionsHtml}
            </div>
        `;
    });
    listDiv.innerHTML = html;
    if (window.MathJax) {
        MathJax.typesetPromise([listDiv]).catch(() => {});
    }
}

window.removeQuestionFromTopic = async (qId) => {
    if(!confirm("Bạn có muốn bỏ câu hỏi này khỏi chuyên đề?")) return;
    try {
        const qData = await (await fetch(`https://upload-helper.phamngockhanh-942001.workers.dev/bank?id=${qId}`)).json();
        qData.mapId = ""; // Remove mapId
        const blob = new Blob([JSON.stringify(qData)], { type: 'application/json' });
        const formData = new FormData();
        formData.append('file', blob, `bank/${qId}.json`);
        await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/", { method: 'PUT', body: formData });
        
        showToast("Đã loại bỏ khỏi chuyên đề!", "success");
        window.loadTopicContent(window.currentTopicId); // Reload
    } catch (e) {
        showToast("Lỗi: " + e.message, "error");
    }
};

// --- LOGIC NHẬP FILE ---
document.getElementById('btnImportTopic').addEventListener('click', () => {
    if (!window.currentTopicId) {
        showToast("Vui lòng chọn một chuyên đề bên trái!", "error");
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
    input.value = ''; // Reset
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showToast("Đang xử lý file...", "info");
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const fileMap = new Map();
                fileMap.set(file.name, text);
                
                const parsedTopic = await parseTopicFromTex(fileMap, new Map(), () => {});
                if (!parsedTopic.questions || parsedTopic.questions.length === 0) {
                    showToast("Không tìm thấy câu hỏi nào trong file!", "error");
                    return;
                }
                
                showToast(`Đã bóc tách ${parsedTopic.questions.length} câu. Đang tải lên...`, "info");
                for (let i = 0; i < parsedTopic.questions.length; i++) {
                    const q = parsedTopic.questions[i];
                    const qId = `${window.currentTopicId}_${Date.now()}_${i}`;
                    q.id = qId;
                    q.mapId = window.currentTopicId;
                    
                    const blob = new Blob([JSON.stringify(q)], { type: 'application/json' });
                    const formData = new FormData();
                    formData.append('file', blob, `bank/${qId}.json`);
                    await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/", { method: 'PUT', body: formData });
                }
                
                showToast("Nhập file thành công!", "success");
                window.loadTopicContent(window.currentTopicId); // Reload
            } catch (err) {
                console.error(err);
                showToast("Lỗi phân tích file", "error");
            }
        };
        reader.readAsText(file);
    };
    input.click();
});

// --- LOGIC CHỌN TỪ NGÂN HÀNG ---
document.getElementById('btnSelectBank').addEventListener('click', async () => {
    if (!window.currentTopicId) {
        showToast("Vui lòng chọn một chuyên đề bên trái!", "error");
        return;
    }
    document.getElementById('selectBankModalSubtitle').innerText = `Đang thêm vào: ${window.currentTopicId}`;
    document.getElementById('selectBankModal').classList.remove('hidden');
    document.getElementById('selectBankModal').classList.add('flex');
    
    if (window.globalBankQuestions.length === 0) {
        await window.loadBankData();
    }
    window.renderBankModalList();
});

window.renderBankModalList = () => {
    const listDiv = document.getElementById('bankModalList');
    const search = document.getElementById('bankSearch').value.toLowerCase();
    const filterLvl = document.getElementById('bankFilterLevel').value;
    
    let filtered = window.globalBankQuestions.filter(q => {
        if (q.mapId === window.currentTopicId) return false; // Hide already in this topic
        if (filterLvl !== 'all' && q.level !== filterLvl) return false;
        if (search && !q.content.toLowerCase().includes(search) && !(q.id && q.id.toLowerCase().includes(search))) return false;
        return true;
    });
    
    if (filtered.length === 0) {
        listDiv.innerHTML = '<div class="text-center py-10 text-gray-400">Không có câu hỏi nào phù hợp.</div>';
        return;
    }
    
    let html = '';
    filtered.forEach(q => {
        html += `
            <label class="bg-white p-3 rounded-xl border border-gray-200 flex gap-3 cursor-pointer hover:bg-blue-50 transition-colors mb-2">
                <input type="checkbox" value="${q.id}" class="bank-item-checkbox w-5 h-5 mt-1 text-blue-600 rounded">
                <div class="flex-1 overflow-hidden">
                    <div class="text-xs text-gray-500 mb-1 flex justify-between"><span>ID: ${q.id}</span><span class="bg-gray-100 px-2 py-0.5 rounded">${q.level || 'Chưa phân loại'}</span></div>
                    <div class="text-sm text-gray-800 math-content max-h-16 overflow-hidden">${q.content}</div>
                </div>
            </label>
        `;
    });
    listDiv.innerHTML = html;
    if (window.MathJax) MathJax.typesetPromise([listDiv]).catch(()=>{});
    
    // Checkbox event
    document.querySelectorAll('.bank-item-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const count = document.querySelectorAll('.bank-item-checkbox:checked').length;
            document.getElementById('bankSelectedCount').innerText = count;
        });
    });
};

document.getElementById('bankSearch').addEventListener('input', window.renderBankModalList);
document.getElementById('bankFilterLevel').addEventListener('change', window.renderBankModalList);

document.getElementById('btnConfirmBankSelection').addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.bank-item-checkbox:checked')).map(cb => cb.value);
    if (selected.length === 0) return;
    
    const btn = document.getElementById('btnConfirmBankSelection');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
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
        showToast(`Đã thêm ${selected.length} câu hỏi vào chuyên đề!`, "success");
        document.getElementById('selectBankModal').classList.remove('flex');
        document.getElementById('selectBankModal').classList.add('hidden');
        window.loadTopicContent(window.currentTopicId);
    } catch (e) {
        showToast("Lỗi: " + e.message, "error");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
        document.getElementById('bankSelectedCount').innerText = '0';
    }
});
