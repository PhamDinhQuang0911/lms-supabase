/**
 * worker.js - Web Worker chạy Pyodide và xử lý TeX2MathType Pro
 */

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let pyodide = null;
let isReady = false;

function postLog(msg) {
    self.postMessage({ type: "LOG", message: msg });
}

function postProgress(pct, msg) {
    self.postMessage({ type: "PROGRESS", pct: pct, message: msg });
}

async function initPyodideWorker() {
    try {
        postProgress(10, "Đang tải môi trường Python WebAssembly...");
        pyodide = await loadPyodide({
            stdout: (text) => postLog("[Python] " + text),
            stderr: (text) => postLog("[Python Err] " + text),
        });

        postProgress(30, "Đang nạp các thư viện C/Wasm (lxml, pillow)...");
        await pyodide.loadPackage(["lxml", "pillow", "micropip"]);

        postProgress(50, "Đang cài đặt python-docx, fonttools, olefile qua micropip...");
        const micropip = pyodide.pyimport("micropip");
        await micropip.install(["python-docx", "fonttools", "olefile"]);

        postProgress(75, "Đang tải mã nguồn TeX2MathType Pro...");
        // Tải gói core zip từ cùng thư mục web kèm cache buster
        const zipResponse = await fetch("tex2mathtype_core.zip?v=" + Date.now());
        if (!zipResponse.ok) {
            throw new Error(`Không tải được tex2mathtype_core.zip (HTTP ${zipResponse.status})`);
        }
        const zipArrayBuffer = await zipResponse.arrayBuffer();

        postProgress(85, "Đang giải nén thư viện vào môi trường ảo...");
        // Ghi zip vào file hệ thống ảo của Pyodide và giải nén
        pyodide.FS.writeFile("/home/pyodide/core.zip", new Uint8Array(zipArrayBuffer));
        
        await pyodide.runPythonAsync(`
import zipfile, os, sys
with zipfile.ZipFile('/home/pyodide/core.zip', 'r') as zf:
    zf.extractall('/home/pyodide/')

if '/home/pyodide' not in sys.path:
    sys.path.insert(0, '/home/pyodide')

import web_bridge
print("TeX2MathType Pro Web Bridge đã sẵn sàng!")
        `);

        isReady = true;
        postProgress(100, "Hệ thống đã sẵn sàng!");
        self.postMessage({ type: "READY" });
    } catch (err) {
        self.postMessage({
            type: "ERROR",
            error: "Khởi tạo thất bại: " + (err.message || err.toString())
        });
    }
}

// Bắt đầu khởi tạo ngay khi Worker được nạp
initPyodideWorker();

self.onmessage = async function(e) {
    const { action, id, payload } = e.data;

    if (!isReady) {
        self.postMessage({
            type: "ERROR",
            id: id,
            error: "Môi trường Python chưa khởi tạo xong. Vui lòng đợi trong giây lát!"
        });
        return;
    }

    if (action === "CONVERT_TEX") {
        try {
            const { text, standard, mode, base_pt, header_config } = payload;
            const ptSize = parseFloat(base_pt) || 11.0;
            
            // Đăng ký callback báo tiến trình từ Python sang JS Worker
            pyodide.globals.set("report_progress_to_js", (pct, msg) => {
                postProgress(pct, msg);
            });

            // Chuyển chuỗi TeX và Header vào Python
            pyodide.globals.set("input_latex_text", text);
            pyodide.globals.set("input_standard", standard);
            pyodide.globals.set("input_mode", mode);
            pyodide.globals.set("input_base_pt", ptSize);
            pyodide.globals.set("input_header_config", header_config ? JSON.stringify(header_config) : null);

            // Ghi nhận các file hình ảnh đính kèm vào /home/pyodide/images
            try { pyodide.FS.mkdir("/home/pyodide/images"); } catch(e) {}
            if (payload.images && Array.isArray(payload.images)) {
                for (const img of payload.images) {
                    if (img.filename && img.data) {
                        const u8 = img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data);
                        pyodide.FS.writeFile(`/home/pyodide/images/${img.filename}`, u8);
                    }
                }
            }

            postProgress(5, "Bắt đầu chuyển đổi LaTeX sang Word MathType...");

            await pyodide.runPythonAsync(`
import web_bridge, json
hdr_cfg = json.loads(input_header_config) if input_header_config else None
converted_list = web_bridge.convert_tex_to_docx_bytes(
    latex_text=input_latex_text,
    standard=input_standard,
    export_mode=input_mode,
    base_pt=input_base_pt,
    images_dir='/home/pyodide/images',
    progress_cb=report_progress_to_js,
    header_config=hdr_cfg
)
            `);

            // Lấy kết quả trả về từ Python
            const convertedListPy = pyodide.globals.get("converted_list");
            const files = [];

            for (let i = 0; i < convertedListPy.length; i++) {
                const item = convertedListPy.get(i);
                const filename = item.get("filename");
                const pyBytes = item.get("data"); // Python bytes
                const jsUint8 = pyBytes.toJs();   // Chuyển sang Uint8Array

                files.push({
                    filename: filename,
                    data: jsUint8
                });
            }

            self.postMessage({
                type: "SUCCESS",
                id: id,
                files: files
            });

        } catch (err) {
            self.postMessage({
                type: "ERROR",
                id: id,
                error: "Lỗi chuyển đổi: " + (err.message || err.toString())
            });
        }
    } 
    else if (action === "CONVERT_DOCX") {
        try {
            const { docxBuffer, base_pt } = payload;
            const ptSize = parseFloat(base_pt) || 11.0;

            pyodide.globals.set("report_progress_to_js", (pct, msg) => {
                postProgress(pct, msg);
            });
            pyodide.globals.set("input_base_pt", ptSize);

            // Ghi file docx vào virtual filesystem
            const uint8 = new Uint8Array(docxBuffer);
            pyodide.FS.writeFile("/home/pyodide/temp_input.docx", uint8);

            postProgress(10, "Đang xử lý file Word DOCX...");

            await pyodide.runPythonAsync(`
import web_bridge
with open('/home/pyodide/temp_input.docx', 'rb') as f:
    docx_bytes = f.read()

res_dict = web_bridge.convert_docx_bytes_inplace(
    docx_bytes=docx_bytes,
    base_pt=input_base_pt,
    progress_cb=report_progress_to_js
)
            `);

            const resPy = pyodide.globals.get("res_dict");
            const filename = resPy.get("filename");
            const outBytes = resPy.get("data").toJs();

            self.postMessage({
                type: "SUCCESS",
                id: id,
                files: [{
                    filename: filename,
                    data: outBytes
                }]
            });
        } catch (err) {
            self.postMessage({
                type: "ERROR",
                id: id,
                error: "Lỗi chuyển đổi DOCX: " + (err.message || err.toString())
            });
        }
    }
};
