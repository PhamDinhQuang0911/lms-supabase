/**
 * app.js - Xử lý giao diện người dùng và giao tiếp với Pyodide Web Worker
 */

let worker = null;
let isWorkerReady = false;
let selectedDocxFile = null;

// Các phần tử DOM
const engineStatusBadge = document.getElementById("engineStatusBadge");
const engineStatusText = document.getElementById("engineStatusText");
const btnConvertTex = document.getElementById("btnConvertTex");
const btnConvertDocx = document.getElementById("btnConvertDocx");
const btnInsertSample = document.getElementById("btnInsertSample");
const texInput = document.getElementById("texInput");
const wordStandardSelect = document.getElementById("wordStandardSelect");
const exportModeSelect = document.getElementById("exportModeSelect");
const mathSizeSelect = document.getElementById("mathSizeSelect");

const progressSection = document.getElementById("progressSection");
const progressMessage = document.getElementById("progressMessage");
const progressPercent = document.getElementById("progressPercent");
const progressBarFill = document.getElementById("progressBarFill");
const logConsole = document.getElementById("logConsole");

const resultSection = document.getElementById("resultSection");
const downloadButtonsList = document.getElementById("downloadButtonsList");

const dropZone = document.getElementById("dropZone");
const docxFileInput = document.getElementById("docxFileInput");
const selectedFileInfo = document.getElementById("selectedFileInfo");

// ─────────────────────────────────────────────────────────────
// 1. KHỞI TẠO WEB WORKER
// ─────────────────────────────────────────────────────────────
function initWorker() {
    appendLog("Khởi tạo Web Worker chạy Pyodide WebAssembly...");
    worker = new Worker("tex2mathtype-worker.js");

    worker.onmessage = function (e) {
        const { type, message, pct, files, error } = e.data;

        if (type === "READY") {
            isWorkerReady = true;
            engineStatusBadge.className = "status-badge ready";
            engineStatusText.textContent = "Sẵn sàng (Wasm Python)";
            btnConvertTex.disabled = false;
            if (selectedDocxFile) btnConvertDocx.disabled = false;
            appendLog("✅ Hệ thống đã sẵn sàng xử lý chuyển đổi!");
        } 
        else if (type === "PROGRESS") {
            updateProgress(pct, message);
            appendLog(`[${pct}%] ${message}`);
        } 
        else if (type === "LOG") {
            appendLog(message);
        } 
        else if (type === "SUCCESS") {
            updateProgress(100, "Chuyển đổi thành công!");
            handleConvertSuccess(files);
            setButtonsState(false);
        } 
        else if (type === "ERROR") {
            engineStatusBadge.className = "status-badge error";
            engineStatusText.textContent = "Lỗi xử lý";
            appendLog("❌ LỖI: " + error);
            alert("Đã xảy ra lỗi: " + error);
            setButtonsState(false);
        }
    };

    worker.onerror = function (err) {
        console.error("Worker Error:", err);
        engineStatusBadge.className = "status-badge error";
        engineStatusText.textContent = "Lỗi Worker";
        appendLog("❌ Lỗi Worker: " + (err.message || "Không thể tải worker.js"));
    };
}

function appendLog(text) {
    if (!logConsole) return;
    logConsole.textContent += text + "\n";
    logConsole.scrollTop = logConsole.scrollHeight;
}

function updateProgress(pct, message) {
    progressSection.style.display = "block";
    progressMessage.textContent = message || "Đang xử lý...";
    progressPercent.textContent = pct + "%";
    progressBarFill.style.width = pct + "%";
}

function setButtonsState(isProcessing) {
    btnConvertTex.disabled = isProcessing || !isWorkerReady;
    btnConvertDocx.disabled = isProcessing || !isWorkerReady || !selectedDocxFile;
}

// ─────────────────────────────────────────────────────────────
// 2. XỬ LÝ KẾT QUẢ VÀ TẢI FILE
// ─────────────────────────────────────────────────────────────
function handleConvertSuccess(files) {
    resultSection.style.display = "block";
    downloadButtonsList.innerHTML = "";

    files.forEach((file) => {
        // Tạo Blob từ dữ liệu Uint8Array
        const blob = new Blob([file.data], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        });
        const blobUrl = URL.createObjectURL(blob);

        const itemDiv = document.createElement("div");
        itemDiv.className = "download-item";
        itemDiv.innerHTML = `
            <div class="download-info">
                <span>📄</span>
                <strong>${file.filename}</strong>
                <small>(${(file.data.length / 1024).toFixed(1)} KB)</small>
            </div>
            <a href="${blobUrl}" download="${file.filename}" class="btn btn-primary btn-sm">
                ⬇️ Tải file Word (.docx)
            </a>
        `;
        downloadButtonsList.appendChild(itemDiv);
    });

    // Cuộn mượt đến kết quả
    resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ─────────────────────────────────────────────────────────────
// 3. TAB NAVIGATION
// ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");
    });
});

// ─────────────────────────────────────────────────────────────
// 4. MẪU LATEX (SAMPLE CODE)
// ─────────────────────────────────────────────────────────────
const SAMPLE_LATEX = `\\begin{ex}
Cho hàm số $y=f(x)$ liên tục trên $\\mathbb{R}$ và có bảng xét dấu đạo hàm như sau:
Biết $\\int_0^1 (2x + 1) \\, dx = I$. Giá trị của $I$ là:
\\choice
{$I = 1$}
{$I = 3$}
{\\True $I = 2$}
{$I = 0$}
\\loigiai{
Ta có $\\int_0^1 (2x + 1) \\, dx = \\left(x^2 + x\\right)\\Big|_0^1 = (1 + 1) - 0 = 2$.
Do đó chọn phương án C.
}
\\end{ex}

\\begin{ex}
Giải phương trình bậc hai sau trên tập số phức $\\mathbb{C}$:
$$z^2 - 4z + 13 = 0$$
\\choice
{$z = 2 \\pm 2i$}
{\\True $z = 2 \\pm 3i$}
{$z = 3 \\pm 2i$}
{$z = -2 \\pm 3i$}
\\loigiai{
Ta có $\\Delta' = (-2)^2 - 13 = -9 = 9i^2$.
Phương trình có hai nghiệm phức $z_{1,2} = 2 \\pm 3i$.
}
\\end{ex}`;

btnInsertSample.addEventListener("click", () => {
    texInput.value = SAMPLE_LATEX;
    appendLog("Đã chèn mã đề thi mẫu thành công.");
});

// ─────────────────────────────────────────────────────────────
// 5. SỰ KIỆN CHUYỂN ĐỔI TEX
// ─────────────────────────────────────────────────────────────
btnConvertTex.addEventListener("click", () => {
    const text = texInput.value.trim();
    if (!text) {
        alert("Vui lòng nhập hoặc dán mã TeX trước khi chuyển đổi!");
        return;
    }

    resultSection.style.display = "none";
    updateProgress(0, "Bắt đầu chuyển đổi...");
    setButtonsState(true);

    const standard = wordStandardSelect.value;
    const mode = exportModeSelect.value;
    const basePt = parseFloat(mathSizeSelect ? mathSizeSelect.value : "11") || 11.0;

    worker.postMessage({
        action: "CONVERT_TEX",
        id: Date.now(),
        payload: {
            text: text,
            standard: standard,
            mode: mode,
            base_pt: basePt
        }
    });
});

// ─────────────────────────────────────────────────────────────
// 6. XỬ LÝ FILE DOCX (DRAG & DROP)
// ─────────────────────────────────────────────────────────────
dropZone.addEventListener("click", () => docxFileInput.click());

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

docxFileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    if (!file.name.endsWith(".docx")) {
        alert("Vui lòng chọn file định dạng .docx!");
        return;
    }
    selectedDocxFile = file;
    selectedFileInfo.style.display = "inline-block";
    selectedFileInfo.textContent = `Đã chọn: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (isWorkerReady) {
        btnConvertDocx.disabled = false;
    }
    appendLog(`Đã tải file vào bộ nhớ: ${file.name}`);
}

btnConvertDocx.addEventListener("click", () => {
    if (!selectedDocxFile) return;

    resultSection.style.display = "none";
    updateProgress(0, "Đang đọc file DOCX...");
    setButtonsState(true);

    const reader = new FileReader();
    reader.onload = function (e) {
        const arrayBuffer = e.target.result;
        const basePt = parseFloat(mathSizeSelect ? mathSizeSelect.value : "11") || 11.0;
        worker.postMessage({
            action: "CONVERT_DOCX",
            id: Date.now(),
            payload: {
                docxBuffer: arrayBuffer,
                base_pt: basePt
            }
        });
    };
    reader.readAsArrayBuffer(selectedDocxFile);
});

// Khởi chạy
initWorker();
