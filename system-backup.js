// system-backup.js
// TRUNG TÂM SAO LƯU & PHỤC HỒI TOÀN BỘ HỆ THỐNG LMS QMATH
// Hỗ trợ Cloudflare R2 (Ngân hàng câu hỏi, CCCD config) & Supabase PostgreSQL (Đề thi, Lớp học, ID tree, Cấu hình)

(function(global, factory) {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        global.systemBackup = factory();
    }
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const SUPABASE_URL = 'https://cuniqanbumcrqcdlcvad.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o';
    const WORKER_UPLOAD_URL = 'https://upload-helper.phamngockhanh-942001.workers.dev/';
    const R2_PUBLIC_BASE = 'https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev';

    const BACKUP_HISTORY_KEY = 'lms_system_backup_history';
    const LOCAL_BANK_CACHE_KEY = 'lms_bank_questions_cache';

    // Danh sách toàn bộ các bảng Supabase của hệ thống
    const ALL_SUPABASE_TABLES = [
        { name: 'configurations', module: 'configs', pk: 'id', title: 'Cấu hình & Cây ID chuẩn' },
        { name: 'site_settings', module: 'configs', pk: 'key', title: 'Cài đặt giao diện & Banner' },
        { name: 'exams', module: 'exams', pk: 'id', title: 'Danh sách Đề thi' },
        { name: 'folders', module: 'exams', pk: 'id', title: 'Thư mục phân loại đề thi' },
        { name: 'classes', module: 'classes_users', pk: 'id', title: 'Danh sách Lớp học' },
        { name: 'users', module: 'classes_users', pk: 'id', title: 'Tài khoản Học sinh & Giáo viên' },
        { name: 'admin_accounts', module: 'classes_users', pk: 'id', title: 'Phân quyền Quản trị viên' },
        { name: 'results', module: 'results_progress', pk: 'id', title: 'Kết quả nộp bài thi' },
        { name: 'exam_attempts', module: 'results_progress', pk: 'id', title: 'Bài thi đang làm dở' },
        { name: 'practice_results', module: 'results_progress', pk: 'id', title: 'Kết quả luyện tập' },
        { name: 'user_progress', module: 'results_progress', pk: 'id', title: 'Tiến độ học tập' },
        { name: 'access_requests', module: 'results_progress', pk: 'id', title: 'Yêu cầu mở khóa bài thi' },
        { name: 'public_courses', module: 'courses_orders', pk: 'id', title: 'Khóa học phát hành' },
        { name: 'orders', module: 'courses_orders', pk: 'id', title: 'Đơn hàng mua khóa học' },
        { name: 'vouchers', module: 'courses_orders', pk: 'id', title: 'Mã giảm giá Voucher' },
        { name: 'zalo_uids', module: 'courses_orders', pk: 'id', title: 'Liên kết tài khoản Zalo' }
    ];

    // Định nghĩa các khối dữ liệu (Modules) để người dùng chọn sao lưu / phục hồi
    const MODULES = [
        {
            id: 'bank',
            title: 'Ngân hàng câu hỏi R2 & CCCD',
            desc: 'Toàn bộ 2,000+ câu hỏi ngân hàng trung tâm (bank_catalog.json) và bộ đếm mã CCCD tự tăng (cccd_config.json).',
            icon: 'fa-solid fa-database',
            badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
        },
        {
            id: 'configs',
            title: 'Cây ID chuẩn & Cấu hình hệ thống',
            desc: 'Cây ID chuẩn hóa phân loại Toán (map_id_tree), cấu hình AI, banner trang chủ và các thiết lập hệ thống.',
            icon: 'fa-solid fa-sitemap',
            badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
        },
        {
            id: 'exams',
            title: 'Đề thi & Thư mục (Exams & Folders)',
            desc: 'Toàn bộ đề thi trong hệ thống, cấu hình bài thi, câu hỏi trắc nghiệm & tự luận và cây thư mục phân loại.',
            icon: 'fa-solid fa-folder-tree',
            badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
        },
        {
            id: 'classes_users',
            title: 'Lớp học & Người dùng (Classes & Users)',
            desc: 'Danh sách lớp học, hồ sơ học sinh, giáo viên và tài khoản phân quyền Super Admin / Giáo viên.',
            icon: 'fa-solid fa-users',
            badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
        },
        {
            id: 'results_progress',
            title: 'Kết quả thi cử & Tiến trình (Results)',
            desc: 'Lịch sử nộp bài, điểm số chi tiết, bài thi đang làm dở, kết quả luyện tập và tiến trình học tập.',
            icon: 'fa-solid fa-chart-line',
            badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        },
        {
            id: 'courses_orders',
            title: 'Khóa học & Đơn hàng & Zalo',
            desc: 'Danh mục khóa học bán công khai, đơn hàng đặt mua, mã giảm giá voucher và liên kết định danh Zalo.',
            icon: 'fa-solid fa-bag-shopping',
            badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
        }
    ];

    // Helper: Lấy client Supabase (từ window hoặc khởi tạo qua REST)
    function getSupabaseClient() {
        if (typeof window !== 'undefined' && window.supabase) {
            return window.supabase;
        }
        return null;
    }

    // Helper: Headers cho REST API Supabase
    function getSupabaseHeaders(extraHeaders = {}) {
        return {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            ...extraHeaders
        };
    }

    // Helper: Đọc tổng số dòng nhanh của 1 bảng Supabase (HEAD / limit 0)
    async function getTableCount(tableName) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=count`, {
                headers: getSupabaseHeaders({
                    'Range': '0-0',
                    'Prefer': 'count=exact'
                })
            });
            if (!res.ok) return 0;
            const range = res.headers.get('content-range');
            if (range && range.includes('/')) {
                const total = parseInt(range.split('/')[1], 10);
                return isNaN(total) ? 0 : total;
            }
            return 0;
        } catch (e) {
            return 0;
        }
    }

    // Helper: Đọc toàn bộ dữ liệu 1 bảng (tự động phân trang chống giới hạn 1000 dòng của PostgREST)
    async function fetchTableAll(tableName, onStep = null) {
        let allRows = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*`, {
                headers: getSupabaseHeaders({
                    'Range': `${from}-${to}`
                })
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Lỗi tải bảng ${tableName}: HTTP ${res.status} - ${errText}`);
            }
            const rows = await res.json();
            if (!Array.isArray(rows) || rows.length === 0) break;
            allRows.push(...rows);
            if (onStep) {
                onStep(allRows.length);
            }
            if (rows.length < pageSize) break;
            page++;
        }
        return allRows;
    }

    // Helper: Lấy JSZip instance an toàn
    function getJSZip() {
        if (typeof JSZip !== 'undefined') return JSZip;
        if (typeof window !== 'undefined' && window.JSZip) return window.JSZip;
        if (typeof require === 'function') {
            try { return require('jszip'); } catch (e) {}
        }
        throw new Error("Thư viện JSZip chưa được nạp. Vui lòng kiểm tra lại script jszip.min.js!");
    }

    // =========================================================================
    // 1. THỐNG KÊ SỐ LƯỢNG TRỰC TIẾP (LIVE STATS)
    // =========================================================================
    async function getLiveStats() {
        const stats = {
            bankQuestions: 0,
            lastCccd: 0,
            tables: {}
        };

        // 1. Thống kê Cloudflare R2
        try {
            const [catRes, cccdRes] = await Promise.all([
                fetch(`${R2_PUBLIC_BASE}/bank_catalog.json?t=${Date.now()}`, { cache: 'no-store' }),
                fetch(`${R2_PUBLIC_BASE}/cccd_config.json?t=${Date.now()}`, { cache: 'no-store' })
            ]);
            if (catRes.ok) {
                const cat = await catRes.json();
                stats.bankQuestions = Array.isArray(cat) ? cat.length : 0;
            }
            if (cccdRes.ok) {
                const cccd = await cccdRes.json();
                stats.lastCccd = cccd.lastCccd || 0;
            }
        } catch (e) {
            console.warn('[SystemBackup] Không thể lấy stats R2:', e);
        }

        // 2. Thống kê Supabase tables
        await Promise.all(ALL_SUPABASE_TABLES.map(async (tbl) => {
            const cnt = await getTableCount(tbl.name);
            stats.tables[tbl.name] = cnt;
        }));

        // Tổng hợp theo modules
        stats.modules = {
            bank: {
                questions: stats.bankQuestions,
                lastCccd: stats.lastCccd,
                badge: `${stats.bankQuestions.toLocaleString('vi-VN')} câu hỏi`
            },
            configs: {
                count: (stats.tables.configurations || 0) + (stats.tables.site_settings || 0),
                badge: `${stats.tables.configurations || 0} mục cấu hình`
            },
            exams: {
                exams: stats.tables.exams || 0,
                folders: stats.tables.folders || 0,
                badge: `${stats.tables.exams || 0} đề thi, ${stats.tables.folders || 0} thư mục`
            },
            classes_users: {
                classes: stats.tables.classes || 0,
                users: stats.tables.users || 0,
                admins: stats.tables.admin_accounts || 0,
                badge: `${stats.tables.classes || 0} lớp, ${stats.tables.users || 0} học sinh`
            },
            results_progress: {
                results: stats.tables.results || 0,
                attempts: stats.tables.exam_attempts || 0,
                practice: stats.tables.practice_results || 0,
                badge: `${stats.tables.results || 0} bài thi, ${stats.tables.practice_results || 0} luyện tập`
            },
            courses_orders: {
                courses: stats.tables.public_courses || 0,
                orders: stats.tables.orders || 0,
                vouchers: stats.tables.vouchers || 0,
                badge: `${stats.tables.courses || 0} khóa học, ${stats.tables.orders || 0} đơn hàng`
            }
        };

        return stats;
    }

    // =========================================================================
    // 2. XUẤT SAO LƯU HỆ THỐNG (EXPORT TO ZIP)
    // =========================================================================
    async function exportBackup(options = {}) {
        const {
            selectedModules = ['bank', 'configs', 'exams', 'classes_users', 'results_progress', 'courses_orders'],
            onProgress = null, // callback(percent, message, detail)
            creator = 'Admin'
        } = options;

        const JSZipClass = getJSZip();
        const zip = new JSZipClass();
        const report = {
            counts: {},
            files: []
        };

        const targetTables = ALL_SUPABASE_TABLES.filter(t => selectedModules.includes(t.module));
        const totalSteps = (selectedModules.includes('bank') ? 1 : 0) + targetTables.length + 2;
        let currentStep = 0;

        const updateStatus = (percent, message, detail = '') => {
            if (typeof onProgress === 'function') {
                onProgress(Math.min(100, Math.max(0, Math.round(percent))), message, detail);
            }
        };

        updateStatus(5, 'Đang chuẩn bị gói sao lưu hệ thống...');

        // 1. Sao lưu R2 Ngân hàng câu hỏi
        if (selectedModules.includes('bank')) {
            currentStep++;
            updateStatus(Math.round((currentStep / totalSteps) * 80), 'Đang tải Ngân hàng câu hỏi từ Cloudflare R2...');
            try {
                const [catRes, cccdRes] = await Promise.all([
                    fetch(`${R2_PUBLIC_BASE}/bank_catalog.json?t=${Date.now()}`, { cache: 'no-store' }),
                    fetch(`${R2_PUBLIC_BASE}/cccd_config.json?t=${Date.now()}`, { cache: 'no-store' })
                ]);

                if (catRes.ok) {
                    const catalog = await catRes.json();
                    zip.file('bank/bank_catalog.json', JSON.stringify(catalog, null, 2));
                    report.counts.bank_questions = Array.isArray(catalog) ? catalog.length : 0;
                    report.files.push('bank/bank_catalog.json');
                }
                if (cccdRes.ok) {
                    const cccd = await cccdRes.json();
                    zip.file('bank/cccd_config.json', JSON.stringify(cccd, null, 2));
                    report.counts.last_cccd = cccd.lastCccd || 0;
                    report.files.push('bank/cccd_config.json');
                }
            } catch (err) {
                console.error('[SystemBackup] Lỗi tải Ngân hàng R2:', err);
                throw new Error(`Lỗi tải dữ liệu Ngân hàng từ R2: ${err.message}`);
            }
        }

        // 2. Sao lưu các bảng Supabase theo modules được chọn
        for (const tbl of targetTables) {
            currentStep++;
            const stepPercent = Math.round((currentStep / totalSteps) * 80);
            updateStatus(stepPercent, `Đang tải bảng ${tbl.title} (${tbl.name})...`);

            try {
                const rows = await fetchTableAll(tbl.name);
                zip.file(`database/${tbl.name}.json`, JSON.stringify(rows, null, 2));
                report.counts[tbl.name] = rows.length;
                report.files.push(`database/${tbl.name}.json`);
            } catch (tblErr) {
                console.warn(`[SystemBackup] Lỗi tải bảng ${tbl.name}:`, tblErr);
                // Với site_settings hoặc public_courses nếu lỗi vẫn ghi mảng rỗng để không dừng tiến trình
                zip.file(`database/${tbl.name}.json`, JSON.stringify([], null, 2));
                report.counts[tbl.name] = 0;
            }
        }

        // 3. Tạo file manifest mô tả chi tiết bản sao lưu
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const manifest = {
            system: 'LMS QMath',
            appVersion: '2.5',
            manifestVersion: '1.0',
            createdAt: now.toISOString(),
            creator: creator,
            selectedModules: selectedModules,
            counts: report.counts,
            files: report.files
        };
        zip.file('backup_manifest.json', JSON.stringify(manifest, null, 2));

        // 4. Tiến hành nén file ZIP
        updateStatus(85, 'Đang tối ưu hóa & nén file ZIP...', 'Vui lòng chờ trong giây lát');
        const blob = await zip.generateAsync(
            {
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            },
            (metadata) => {
                const zipPercent = 85 + Math.round((metadata.percent / 100) * 14);
                updateStatus(zipPercent, `Đang đóng gói file ZIP: ${Math.round(metadata.percent)}%`, metadata.currentFile || '');
            }
        );

        // 5. Tự động kích hoạt tải xuống
        const fileName = `lms_qmath_backup_${dateStr}.zip`;
        if (typeof window !== 'undefined' && window.document) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }

        updateStatus(100, 'Sao lưu hoàn tất thành công!', `Đã tạo tệp ${fileName} (${(blob.size / (1024 * 1024)).toFixed(2)} MB)`);

        // Ghi lại lịch sử
        addHistoryEntry({
            type: 'backup',
            date: now.toISOString(),
            filename: fileName,
            sizeBytes: blob.size,
            sizeMB: (blob.size / (1024 * 1024)).toFixed(2),
            modules: selectedModules,
            counts: report.counts
        });

        return {
            success: true,
            fileName,
            blob,
            size: blob.size,
            manifest,
            counts: report.counts
        };
    }

    // =========================================================================
    // 3. KIỂM TRA & ĐỌC NỘI DUNG TỆP SAO LƯU (INSPECT BACKUP FILE)
    // =========================================================================
    async function inspectBackupFile(file) {
        if (!file) throw new Error("Chưa chọn tệp dữ liệu!");

        const fileName = (file.name || '').toLowerCase();
        const fileType = (file.type || '').toLowerCase();
        const isZip = fileName.endsWith('.zip') || fileType.includes('zip');
        const isJson = fileName.endsWith('.json') || fileType.includes('json');

        if (!isZip && !isJson) {
            throw new Error("Định dạng tệp không hợp lệ! Vui lòng chọn tệp .zip hoặc .json");
        }

        // Trường hợp 1: Tệp JSON đơn lẻ
        if (isJson) {
            const text = await file.text();
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                throw new Error("Tệp JSON bị lỗi cú pháp, không thể đọc dữ liệu!");
            }

            // Nhận diện loại JSON
            let type = 'unknown';
            let summary = '';
            let moduleKey = 'custom';

            if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].cccd || parsed[0].mapId || parsed[0].content)) {
                type = 'bank_catalog';
                moduleKey = 'bank';
                summary = `Danh mục Ngân hàng câu hỏi (${parsed.length.toLocaleString('vi-VN')} câu)`;
            } else if (parsed && parsed.tree && parsed.id === 'map_id_tree') {
                type = 'map_id_tree';
                moduleKey = 'configs';
                summary = `Cây ID chuẩn hóa môn Toán (map_id_tree)`;
            } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title && parsed[0].questions) {
                type = 'exams';
                moduleKey = 'exams';
                summary = `Danh sách Đề thi (${parsed.length} đề thi)`;
            } else {
                summary = `Tệp JSON dữ liệu tùy chỉnh`;
            }

            return {
                isZip: false,
                isSingleJson: true,
                type,
                moduleKey,
                fileName: file.name,
                fileSize: file.size,
                summary,
                data: parsed,
                availableModules: [moduleKey]
            };
        }

        // Trường hợp 2: Tệp ZIP đầy đủ
        const JSZipClass = getJSZip();
        let zip;
        try {
            let zipInput = file;
            if (file && typeof file.arrayBuffer === 'function') {
                try {
                    zipInput = await file.arrayBuffer();
                } catch(bufErr) {
                    zipInput = file;
                }
            }
            zip = await JSZipClass.loadAsync(zipInput);
        } catch (zipErr) {
            throw new Error(`Không thể mở tệp ZIP: ${zipErr.message}`);
        }

        let manifest = null;
        const manifestFile = zip.file('backup_manifest.json');
        if (manifestFile) {
            try {
                manifest = JSON.parse(await manifestFile.async('text'));
            } catch (e) {}
        }

        // Quét các tệp có trong ZIP
        const foundFiles = [];
        const detectedCounts = {};
        const availableModules = new Set();

        // Kiểm tra bank
        const bankCatFile = zip.file('bank/bank_catalog.json');
        const cccdConfigFile = zip.file('bank/cccd_config.json');
        if (bankCatFile) {
            availableModules.add('bank');
            try {
                const cat = JSON.parse(await bankCatFile.async('text'));
                detectedCounts.bank_questions = Array.isArray(cat) ? cat.length : 0;
            } catch (e) {}
        }
        if (cccdConfigFile) {
            try {
                const cccd = JSON.parse(await cccdConfigFile.async('text'));
                detectedCounts.last_cccd = cccd.lastCccd || 0;
            } catch (e) {}
        }

        // Kiểm tra database tables
        for (const tbl of ALL_SUPABASE_TABLES) {
            const tblFile = zip.file(`database/${tbl.name}.json`);
            if (tblFile) {
                availableModules.add(tbl.module);
                try {
                    const rows = JSON.parse(await tblFile.async('text'));
                    detectedCounts[tbl.name] = Array.isArray(rows) ? rows.length : 0;
                } catch (e) {}
            }
        }

        return {
            isZip: true,
            isSingleJson: false,
            fileName: file.name,
            fileSize: file.size,
            manifest,
            zip,
            counts: manifest ? { ...detectedCounts, ...manifest.counts } : detectedCounts,
            availableModules: Array.from(availableModules)
        };
    }

    // =========================================================================
    // 4. TIẾN HÀNH KHÔI PHỤC DỮ LIỆU (RESTORE FROM BACKUP)
    // =========================================================================
    async function restoreBackup(inspectionResult, options = {}) {
        const {
            selectedModules = null, // null = khôi phục tất cả module có trong tệp
            mode = 'upsert', // 'upsert' (hòa trộn / cập nhật) hoặc 'replace'
            onProgress = null
        } = options;

        const updateStatus = (percent, message, detail = '', logType = 'info') => {
            if (typeof onProgress === 'function') {
                onProgress(Math.min(100, Math.max(0, Math.round(percent))), message, detail, logType);
            }
        };

        const logs = [];
        const log = (msg, type = 'info') => {
            logs.push({ time: new Date().toLocaleTimeString('vi-VN'), message: msg, type });
            updateStatus(currentProgress, currentMessage, msg, type);
        };

        let currentProgress = 5;
        let currentMessage = 'Bắt đầu quá trình khôi phục dữ liệu...';
        updateStatus(currentProgress, currentMessage, 'Đang chuẩn bị xác thực kết nối...');

        const targetModules = selectedModules || inspectionResult.availableModules;
        const totalModules = targetModules.length;
        let processedModules = 0;

        const report = {
            restoredBankQuestions: 0,
            restoredTables: {},
            success: true,
            logs
        };

        // --- TRƯỜNG HỢP A: KHÔI PHỤC TỆP JSON ĐƠN LẺ ---
        if (inspectionResult.isSingleJson) {
            const { type, data } = inspectionResult;
            if (type === 'bank_catalog' && Array.isArray(data)) {
                updateStatus(30, 'Đang nạp danh mục Ngân hàng câu hỏi lên Cloudflare R2...');
                await uploadBankCatalogToR2(data, log);
                report.restoredBankQuestions = data.length;
                updateStatus(100, 'Khôi phục Ngân hàng câu hỏi thành công!', `Đã nạp ${data.length} câu hỏi`);
                return report;
            } else if (type === 'map_id_tree') {
                updateStatus(30, 'Đang nạp Cây ID chuẩn hóa vào Supabase configurations...');
                await upsertTableRows('configurations', [data], 'id', log);
                report.restoredTables.configurations = 1;
                updateStatus(100, 'Khôi phục Cây ID chuẩn thành công!', 'Đã nạp map_id_tree');
                return report;
            } else if (type === 'exams' && Array.isArray(data)) {
                updateStatus(30, `Đang nạp ${data.length} đề thi vào Supabase exams...`);
                await upsertTableRows('exams', data, 'id', log);
                report.restoredTables.exams = data.length;
                updateStatus(100, 'Khôi phục Đề thi thành công!', `Đã nạp ${data.length} đề thi`);
                return report;
            } else {
                throw new Error("Không nhận diện được định dạng dữ liệu trong file JSON!");
            }
        }

        // --- TRƯỜNG HỢP B: KHÔI PHỤC TỆP ZIP TOÀN HỆ THỐNG ---
        const zip = inspectionResult.zip;

        // 1. Khôi phục Ngân hàng R2
        if (targetModules.includes('bank')) {
            processedModules++;
            currentProgress = (processedModules / (totalModules + 1)) * 90;
            currentMessage = 'Đang khôi phục Ngân hàng câu hỏi R2 & CCCD...';
            updateStatus(currentProgress, currentMessage);

            const bankCatFile = zip.file('bank/bank_catalog.json');
            const cccdConfigFile = zip.file('bank/cccd_config.json');

            if (bankCatFile) {
                try {
                    const catalogText = await bankCatFile.async('text');
                    const catalog = JSON.parse(catalogText);
                    if (Array.isArray(catalog)) {
                        log(`Đang nạp ${catalog.length.toLocaleString('vi-VN')} câu hỏi lên Cloudflare R2...`, 'info');
                        await uploadBankCatalogToR2(catalog, log);
                        report.restoredBankQuestions = catalog.length;
                        log(`✅ Đã nạp thành công ${catalog.length} câu hỏi vào Cloudflare R2!`, 'success');
                    }
                } catch (r2Err) {
                    log(`❌ Lỗi nạp Ngân hàng lên R2: ${r2Err.message}`, 'error');
                }
            }

            if (cccdConfigFile) {
                try {
                    const cccdText = await cccdConfigFile.async('text');
                    const cccdConfig = JSON.parse(cccdText);
                    log(`Đang khôi phục bộ đếm CCCD: ${cccdConfig.lastCccd}...`, 'info');
                    await uploadCccdConfigToR2(cccdConfig, log);
                    log(`✅ Đã khôi phục bộ đếm CCCD: ${cccdConfig.lastCccd}`, 'success');
                } catch (cccdErr) {
                    log(`⚠️ Lỗi nạp CCCD Config: ${cccdErr.message}`, 'warning');
                }
            }
        }

        // 2. Khôi phục các bảng Supabase
        const targetTables = ALL_SUPABASE_TABLES.filter(t => targetModules.includes(t.module));

        // Thứ tự ưu tiên nạp: Cấu hình -> Thư mục -> Đề thi -> Lớp học -> Người dùng -> Kết quả
        const TABLE_ORDER = ['configurations', 'site_settings', 'folders', 'exams', 'classes', 'admin_accounts', 'users', 'results', 'exam_attempts', 'practice_results', 'public_courses', 'orders', 'vouchers', 'access_requests', 'zalo_uids', 'user_progress'];
        targetTables.sort((a, b) => {
            const idxA = TABLE_ORDER.indexOf(a.name);
            const idxB = TABLE_ORDER.indexOf(b.name);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        for (const tbl of targetTables) {
            const tblFile = zip.file(`database/${tbl.name}.json`);
            if (!tblFile) continue;

            processedModules++;
            currentProgress = Math.min(90, (processedModules / (totalModules + 1)) * 90);
            currentMessage = `Đang khôi phục bảng ${tbl.title} (${tbl.name})...`;
            updateStatus(currentProgress, currentMessage);

            try {
                const text = await tblFile.async('text');
                const rows = JSON.parse(text);
                if (Array.isArray(rows) && rows.length > 0) {
                    log(`Đang nạp ${rows.length} bản ghi vào bảng ${tbl.name}...`, 'info');
                    const count = await upsertTableRows(tbl.name, rows, tbl.pk, log);
                    report.restoredTables[tbl.name] = count;
                    log(`✅ Đã khôi phục ${count} bản ghi vào ${tbl.name}`, 'success');
                } else {
                    report.restoredTables[tbl.name] = 0;
                }
            } catch (tblErr) {
                log(`❌ Lỗi khôi phục bảng ${tbl.name}: ${tblErr.message}`, 'error');
            }
        }

        currentProgress = 100;
        currentMessage = 'Khôi phục toàn bộ hệ thống hoàn tất!';
        updateStatus(currentProgress, currentMessage, 'Đã hoàn tất khôi phục tất cả các mục được chọn');

        // Ghi lại lịch sử
        addHistoryEntry({
            type: 'restore',
            date: new Date().toISOString(),
            filename: inspectionResult.fileName,
            modules: targetModules,
            restoredCounts: {
                bank_questions: report.restoredBankQuestions,
                ...report.restoredTables
            }
        });

        return report;
    }

    // =========================================================================
    // HELPER: NẠP DỮ LIỆU LÊN CLOUDFLARE R2
    // =========================================================================
    async function uploadBankCatalogToR2(catalog, log = console.log) {
        const jsonStr = JSON.stringify(catalog, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });

        // 1. Nạp bank_catalog.json
        const fd1 = new FormData();
        fd1.append('file', blob, 'bank_catalog.json');
        const res1 = await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: fd1 });
        if (!res1.ok) {
            log(`⚠️ Nạp bank_catalog.json thất bại (HTTP ${res1.status})`, 'warning');
        }

        // 2. Nạp bản sao lưu full_bank_catalog.json
        const fd2 = new FormData();
        fd2.append('file', blob, 'full_bank_catalog.json');
        await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: fd2 }).catch(() => {});

        // 3. Đồng bộ vào LocalStorage cache của trình duyệt
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(LOCAL_BANK_CACHE_KEY, JSON.stringify(catalog));
            }
        } catch (e) {
            console.warn('[SystemBackup] Không thể lưu cache localStorage:', e);
        }

        // 4. Nếu có BankService toàn cục, làm mới cache
        if (typeof window !== 'undefined' && window.bankService && typeof window.bankService.clearBankCache === 'function') {
            try { window.bankService.clearBankCache(); } catch (e) {}
        }
    }

    async function uploadCccdConfigToR2(cccdConfig, log = console.log) {
        const jsonStr = JSON.stringify(cccdConfig, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const fd = new FormData();
        fd.append('file', blob, 'cccd_config.json');
        const res = await fetch(WORKER_UPLOAD_URL, { method: 'PUT', body: fd });

        if (typeof window !== 'undefined' && window.bankService && typeof window.bankService.setLocalLastCccd === 'function') {
            try { window.bankService.setLocalLastCccd(cccdConfig.lastCccd); } catch (e) {}
        }
        return res.ok;
    }

    // =========================================================================
    // HELPER: UPSERT DỮ LIỆU VÀO SUPABASE (PHÂN ĐOẠN BATCH 50 DÒNG)
    // =========================================================================
    async function upsertTableRows(tableName, rows, pkCol = 'id', log = console.log) {
        if (!Array.isArray(rows) || rows.length === 0) return 0;

        const sb = getSupabaseClient();
        const chunkSize = 50;
        let successCount = 0;

        for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);

            // Thử nạp trực tiếp qua Supabase Client hoặc REST
            let upsertSuccess = false;

            if (sb) {
                try {
                    const { error } = await sb.from(tableName).upsert(chunk, { onConflict: pkCol });
                    if (!error) {
                        upsertSuccess = true;
                        successCount += chunk.length;
                    } else {
                        log(`[Upsert ${tableName} batch ${i / chunkSize + 1}] Lỗi: ${error.message}`, 'warning');
                    }
                } catch (sbErr) {
                    log(`[Upsert ${tableName}] Lỗi sb client: ${sbErr.message}`, 'warning');
                }
            }

            // Fallback REST API nếu sb client chưa có hoặc thất bại
            if (!upsertSuccess) {
                try {
                    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?on_conflict=${pkCol}`, {
                        method: 'POST',
                        headers: getSupabaseHeaders({
                            'Content-Type': 'application/json',
                            'Prefer': 'resolution=merge-duplicates'
                        }),
                        body: JSON.stringify(chunk)
                    });

                    if (res.ok) {
                        upsertSuccess = true;
                        successCount += chunk.length;
                    } else if (res.status === 401 && (tableName === 'site_settings' || tableName === 'public_courses')) {
                        // Fallback đặc biệt: site_settings & public_courses lưu vào bảng configurations
                        log(`[Fallback ${tableName}] Lưu vào configurations do RLS...`, 'info');
                        for (const item of chunk) {
                            const confId = tableName === 'site_settings' ? ('setting_' + (item.key || item.id)) : ('course_' + item.id);
                            const confPayload = {
                                id: confId,
                                raw_data: item,
                                updated_at: new Date().toISOString()
                            };
                            await fetch(`${SUPABASE_URL}/rest/v1/configurations?on_conflict=id`, {
                                method: 'POST',
                                headers: getSupabaseHeaders({
                                    'Content-Type': 'application/json',
                                    'Prefer': 'resolution=merge-duplicates'
                                }),
                                body: JSON.stringify(confPayload)
                            }).catch(() => {});
                        }
                        upsertSuccess = true;
                        successCount += chunk.length;
                    } else {
                        const errBody = await res.text();
                        log(`[REST Upsert ${tableName}] HTTP ${res.status}: ${errBody}`, 'error');
                    }
                } catch (restErr) {
                    log(`[REST Upsert ${tableName}] Lỗi mạng: ${restErr.message}`, 'error');
                }
            }
        }

        return successCount;
    }

    // =========================================================================
    // 5. QUẢN LÝ LỊCH SỬ SAO LƯU & KHÔI PHỤC (HISTORY STORAGE)
    // =========================================================================
    function getHistory() {
        try {
            if (typeof localStorage === 'undefined') return [];
            const raw = localStorage.getItem(BACKUP_HISTORY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function addHistoryEntry(entry) {
        try {
            if (typeof localStorage === 'undefined') return;
            const history = getHistory();
            history.unshift({
                id: 'bk_' + Date.now(),
                ...entry
            });
            // Giữ tối đa 30 nhật ký gần nhất
            if (history.length > 30) history.length = 30;
            localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history));
        } catch (e) {}
    }

    function clearHistory() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(BACKUP_HISTORY_KEY);
            }
        } catch (e) {}
    }

    // =========================================================================
    // 6. UI CONTROLLER CHO MODAL SAO LƯU & PHỤC HỒI (SYSTEM BACKUP UI)
    // =========================================================================
    const systemBackupUI = {
        currentInspection: null,

        openModal: async function(targetModule = null) {
            if (typeof document === 'undefined') return;
            const modal = document.getElementById('systemBackupModal');
            if (!modal) {
                console.error('[SystemBackupUI] Không tìm thấy phần tử #systemBackupModal');
                return;
            }

            // Mở modal
            if (typeof window.toggleModal === 'function') {
                window.toggleModal('systemBackupModal', true);
            } else {
                modal.classList.remove('opacity-0', 'pointer-events-none');
            }

            // Chuyển về tab mặc định
            systemBackupUI.switchTab('backup');

            // Nếu chỉ định module cụ thể (ví dụ bấm từ Ngân hàng câu hỏi)
            if (targetModule) {
                const checkboxes = document.querySelectorAll('.bk-module-chk');
                checkboxes.forEach(chk => {
                    chk.checked = (chk.value === targetModule);
                });
            }

            // Tải thống kê trực tiếp
            await systemBackupUI.refreshStats();
        },

        closeModal: function() {
            if (typeof document === 'undefined') return;
            if (typeof window.toggleModal === 'function') {
                window.toggleModal('systemBackupModal', false);
            } else {
                const modal = document.getElementById('systemBackupModal');
                if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
            }
        },

        switchTab: function(tabName) {
            if (typeof document === 'undefined') return;
            const tabs = ['backup', 'restore', 'history'];
            tabs.forEach(t => {
                const btn = document.getElementById(`tabBtn_${t}`);
                const content = document.getElementById(`bkTabContent_${t}`);
                if (btn) {
                    if (t === tabName) {
                        btn.className = 'px-4 py-2 rounded-xl bg-blue-600 text-white font-bold shadow-xs flex items-center gap-2 transition cursor-pointer';
                    } else {
                        btn.className = 'px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 font-bold flex items-center gap-2 transition cursor-pointer';
                    }
                }
                if (content) {
                    if (t === tabName) content.classList.remove('hidden');
                    else content.classList.add('hidden');
                }
            });

            if (tabName === 'history') {
                systemBackupUI.renderHistory();
            }
        },

        refreshStats: async function() {
            if (typeof document === 'undefined') return;
            const spinner = '<i class="fa-solid fa-spinner fa-spin"></i>';
            const statIds = ['bank', 'configs', 'exams', 'classes_users', 'results_progress', 'courses_orders'];
            statIds.forEach(id => {
                const el = document.getElementById(`bkStat_${id}`);
                if (el) el.innerHTML = spinner;
            });

            try {
                const stats = await getLiveStats();
                if (stats && stats.modules) {
                    Object.entries(stats.modules).forEach(([modKey, modInfo]) => {
                        const el = document.getElementById(`bkStat_${modKey}`);
                        if (el) el.textContent = modInfo.badge;
                    });
                }
            } catch (err) {
                console.warn('[SystemBackupUI] Lỗi refresh stats:', err);
            }
        },

        selectAllModules: function(checkAll) {
            if (typeof document === 'undefined') return;
            const checkboxes = document.querySelectorAll('.bk-module-chk');
            checkboxes.forEach(chk => { chk.checked = checkAll; });
        },

        runExportBackup: async function() {
            if (typeof document === 'undefined') return;
            const checkboxes = document.querySelectorAll('.bk-module-chk:checked');
            const selected = Array.from(checkboxes).map(c => c.value);

            if (selected.length === 0) {
                if (typeof window.showNotification === 'function') {
                    window.showNotification("Vui lòng chọn ít nhất 1 khối dữ liệu để sao lưu!", "warning");
                } else {
                    alert("Vui lòng chọn ít nhất 1 khối dữ liệu để sao lưu!");
                }
                return;
            }

            const btn = document.getElementById('btnRunExportBackup');
            const origHtml = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang sao lưu...';
            }

            const progressBox = document.getElementById('bkExportProgressBox');
            const progressBar = document.getElementById('bkExportProgressBar');
            const progressPct = document.getElementById('bkExportProgressPct');
            const progressStep = document.getElementById('bkExportProgressStep');
            const progressDetail = document.getElementById('bkExportProgressDetail');

            if (progressBox) progressBox.classList.remove('hidden');

            try {
                const creatorName = (typeof window !== 'undefined' && window.currentAdminProfile && (window.currentAdminProfile.displayName || window.currentAdminProfile.email)) ? (window.currentAdminProfile.displayName || window.currentAdminProfile.email) : 'Quản trị viên';
                const result = await exportBackup({
                    selectedModules: selected,
                    creator: creatorName,
                    onProgress: (pct, msg, detail) => {
                        if (progressBar) progressBar.style.width = `${pct}%`;
                        if (progressPct) progressPct.textContent = `${pct}%`;
                        if (progressStep) progressStep.textContent = msg;
                        if (progressDetail) progressDetail.textContent = detail || '';
                    }
                });

                if (typeof window.showNotification === 'function') {
                    window.showNotification(`Đã tạo và tải xuống bản sao lưu: ${result.fileName}!`, "success");
                }

                setTimeout(() => {
                    if (progressBox) progressBox.classList.add('hidden');
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = origHtml;
                    }
                }, 4000);
            } catch (err) {
                console.error('[SystemBackupUI] Lỗi xuất sao lưu:', err);
                if (typeof window.showNotification === 'function') {
                    window.showNotification(`Lỗi sao lưu: ${err.message}`, "error");
                } else {
                    alert(`Lỗi sao lưu: ${err.message}`);
                }
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origHtml;
                }
            }
        },

        handleFileSelected: async function(file) {
            if (!file) return;

            const inspectLoading = document.getElementById('restoreInspectLoading');
            const inspectCard = document.getElementById('restoreInspectCard');
            const dropzone = document.getElementById('restoreDropzone');

            if (inspectLoading) inspectLoading.classList.remove('hidden');

            try {
                const inspection = await inspectBackupFile(file);
                systemBackupUI.currentInspection = inspection;

                // Cập nhật thông tin file
                const nameEl = document.getElementById('restoreFileName');
                const sizeEl = document.getElementById('restoreFileSize');
                const dateEl = document.getElementById('restoreFileDate');
                const creatorEl = document.getElementById('restoreFileCreator');

                if (nameEl) nameEl.textContent = inspection.fileName;
                if (sizeEl) sizeEl.textContent = (inspection.fileSize / (1024 * 1024)).toFixed(2) + ' MB';

                const createdDate = inspection.manifest?.createdAt ? new Date(inspection.manifest.createdAt).toLocaleString('vi-VN') : 'Không rõ';
                if (dateEl) dateEl.textContent = createdDate;
                if (creatorEl) creatorEl.textContent = inspection.manifest?.creator || 'Hệ thống';

                // Tạo danh sách checkbox các module có thể khôi phục
                const modulesContainer = document.getElementById('restoreModulesList');
                if (modulesContainer) {
                    modulesContainer.innerHTML = '';
                    MODULES.forEach(mod => {
                        const isAvailable = inspection.availableModules.includes(mod.id);
                        if (!isAvailable && inspection.isZip) return;

                        let countBadge = '';
                        if (mod.id === 'bank' && inspection.counts?.bank_questions) {
                            countBadge = `${inspection.counts.bank_questions.toLocaleString('vi-VN')} câu hỏi`;
                        } else if (mod.id === 'exams' && inspection.counts?.exams) {
                            countBadge = `${inspection.counts.exams} đề thi`;
                        } else if (mod.id === 'configs' && inspection.counts?.configurations) {
                            countBadge = `${inspection.counts.configurations} cấu hình`;
                        } else if (mod.id === 'classes_users' && (inspection.counts?.classes || inspection.counts?.users)) {
                            countBadge = `${inspection.counts.classes || 0} lớp, ${inspection.counts.users || 0} học sinh`;
                        } else if (mod.id === 'results_progress' && inspection.counts?.results) {
                            countBadge = `${inspection.counts.results} bài nộp`;
                        }

                        const card = document.createElement('label');
                        card.className = `flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${isAvailable ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f1d2b] hover:border-blue-400' : 'opacity-40 pointer-events-none border-dashed'}`;
                        card.innerHTML = `
                            <input type="checkbox" class="bk-restore-module-chk mt-1 rounded accent-emerald-600" value="${mod.id}" ${isAvailable ? 'checked' : 'disabled'}>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between">
                                    <span class="font-bold text-xs text-gray-800 dark:text-gray-200">${mod.title}</span>
                                    ${countBadge ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${mod.badgeClass}">${countBadge}</span>` : ''}
                                </div>
                                <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">${mod.desc}</p>
                            </div>
                        `;
                        modulesContainer.appendChild(card);
                    });
                }

                if (inspectLoading) inspectLoading.classList.add('hidden');
                if (dropzone) dropzone.classList.add('hidden');
                if (inspectCard) inspectCard.classList.remove('hidden');
            } catch (err) {
                console.error('[SystemBackupUI] Lỗi đọc file:', err);
                if (inspectLoading) inspectLoading.classList.add('hidden');
                if (typeof window.showNotification === 'function') {
                    window.showNotification(`Tệp không hợp lệ: ${err.message}`, "error");
                } else {
                    alert(`Tệp không hợp lệ: ${err.message}`);
                }
            }
        },

        resetRestoreFile: function() {
            if (typeof document === 'undefined') return;
            systemBackupUI.currentInspection = null;
            const fileInput = document.getElementById('backupFileInput');
            if (fileInput) fileInput.value = '';

            const inspectCard = document.getElementById('restoreInspectCard');
            const dropzone = document.getElementById('restoreDropzone');
            const progressSection = document.getElementById('restoreProgressSection');

            if (inspectCard) inspectCard.classList.add('hidden');
            if (progressSection) progressSection.classList.add('hidden');
            if (dropzone) dropzone.classList.remove('hidden');
        },

        runRestore: async function() {
            if (!systemBackupUI.currentInspection) {
                alert("Vui lòng chọn tệp sao lưu trước!");
                return;
            }

            const checkedBoxes = document.querySelectorAll('.bk-restore-module-chk:checked');
            const selectedModules = Array.from(checkedBoxes).map(c => c.value);

            if (selectedModules.length === 0) {
                alert("Vui lòng chọn ít nhất 1 khối dữ liệu để khôi phục!");
                return;
            }

            const confirmMsg = "XÁC NHẬN KHÔI PHỤC DỮ LIỆU HỆ THỐNG:\n\n" +
                "- Dữ liệu từ bản sao lưu sẽ được cập nhật/ghi đè vào hệ thống.\n" +
                "- Khối dữ liệu sẽ nạp: " + selectedModules.join(', ') + "\n\n" +
                "Thầy/Cô có chắc chắn muốn tiến hành khôi phục?";

            let confirmed = false;
            if (typeof window.customConfirm === 'function') {
                confirmed = await window.customConfirm(confirmMsg);
            } else {
                confirmed = confirm(confirmMsg);
            }
            if (!confirmed) return;

            const btn = document.getElementById('btnRunRestore');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang khôi phục...';
            }

            const progressSection = document.getElementById('restoreProgressSection');
            const progressBar = document.getElementById('restoreProgressBar');
            const progressPct = document.getElementById('restoreProgressPct');
            const progressStep = document.getElementById('restoreProgressStep');
            const consoleOutput = document.getElementById('restoreConsoleOutput');
            const reloadBtn = document.getElementById('btnReloadAfterRestore');

            if (progressSection) progressSection.classList.remove('hidden');
            if (consoleOutput) consoleOutput.innerHTML = '';
            if (reloadBtn) reloadBtn.classList.add('hidden');

            const appendLog = (msg, type = 'info') => {
                if (!consoleOutput) return;
                const line = document.createElement('div');
                const timeStr = new Date().toLocaleTimeString('vi-VN');
                let colorClass = 'text-gray-300';
                let icon = 'ℹ️';
                if (type === 'success') { colorClass = 'text-emerald-400 font-bold'; icon = '✅'; }
                else if (type === 'warning') { colorClass = 'text-amber-400'; icon = '⚠️'; }
                else if (type === 'error') { colorClass = 'text-red-400 font-bold'; icon = '❌'; }

                line.className = `${colorClass} text-[11px] font-mono leading-relaxed`;
                line.innerHTML = `<span class="text-gray-500">[${timeStr}]</span> ${icon} ${msg}`;
                consoleOutput.appendChild(line);
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            };

            try {
                const report = await restoreBackup(systemBackupUI.currentInspection, {
                    selectedModules: selectedModules,
                    onProgress: (pct, msg, detail, logType) => {
                        if (progressBar) progressBar.style.width = `${pct}%`;
                        if (progressPct) progressPct.textContent = `${pct}%`;
                        if (progressStep) progressStep.textContent = msg;
                        if (detail) appendLog(detail, logType);
                    }
                });

                appendLog('🎉 TOÀN BỘ TIẾN TRÌNH KHÔI PHỤC ĐÃ HOÀN TẤT THÀNH CÔNG!', 'success');

                if (typeof window.showNotification === 'function') {
                    window.showNotification("Khôi phục dữ liệu hệ thống hoàn tất!", "success");
                }

                if (reloadBtn) reloadBtn.classList.remove('hidden');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i> Khôi phục hoàn tất';
                }
            } catch (err) {
                console.error('[SystemBackupUI] Lỗi khôi phục:', err);
                appendLog(`LỖI KHÔI PHỤC: ${err.message}`, 'error');
                if (typeof window.showNotification === 'function') {
                    window.showNotification(`Lỗi khôi phục: ${err.message}`, "error");
                }
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-rotate-left mr-1.5"></i> Thử lại';
                }
            }
        },

        renderHistory: function() {
            if (typeof document === 'undefined') return;
            const container = document.getElementById('backupHistoryTableBody');
            if (!container) return;

            const list = getHistory();
            if (list.length === 0) {
                container.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-8 text-center text-xs text-gray-400">
                            <i class="fa-solid fa-clock-rotate-left text-2xl mb-2 text-gray-300 dark:text-gray-600 block"></i>
                            Chưa có nhật ký sao lưu hoặc khôi phục nào trên thiết bị này.
                        </td>
                    </tr>
                `;
                return;
            }

            container.innerHTML = list.map(item => {
                const dateStr = item.date ? new Date(item.date).toLocaleString('vi-VN') : 'Không rõ';
                const isBackup = item.type === 'backup';
                const typeBadge = isBackup
                    ? '<span class="text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full"><i class="fa-solid fa-cloud-arrow-down mr-1"></i> Sao lưu</span>'
                    : '<span class="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full"><i class="fa-solid fa-rotate-left mr-1"></i> Khôi phục</span>';

                let detail = '';
                if (item.counts) {
                    const parts = [];
                    if (item.counts.bank_questions) parts.push(`${item.counts.bank_questions} câu`);
                    if (item.counts.exams) parts.push(`${item.counts.exams} đề`);
                    if (item.counts.classes) parts.push(`${item.counts.classes} lớp`);
                    if (item.counts.users) parts.push(`${item.counts.users} HS`);
                    detail = parts.join(', ');
                } else if (item.restoredCounts) {
                    const parts = [];
                    if (item.restoredCounts.bank_questions) parts.push(`${item.restoredCounts.bank_questions} câu`);
                    if (item.restoredCounts.exams) parts.push(`${item.restoredCounts.exams} đề`);
                    detail = parts.join(', ');
                }

                return `
                    <tr class="border-b border-gray-100 dark:border-gray-800 text-xs hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
                        <td class="py-2.5 px-3 font-mono text-[11px] text-gray-500 dark:text-gray-400">${dateStr}</td>
                        <td class="py-2.5 px-3">${typeBadge}</td>
                        <td class="py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[200px]" title="${item.filename || ''}">${item.filename || 'Tệp dữ liệu'}</td>
                        <td class="py-2.5 px-3 text-gray-500 dark:text-gray-400">${item.sizeMB ? item.sizeMB + ' MB' : '-'}</td>
                        <td class="py-2.5 px-3 text-gray-600 dark:text-gray-300">${detail || 'Toàn bộ'}</td>
                    </tr>
                `;
            }).join('');
        },

        clearAllHistory: function() {
            if (confirm("Thầy/Cô có chắc chắn muốn xóa toàn bộ lịch sử sao lưu trên trình duyệt này?")) {
                clearHistory();
                systemBackupUI.renderHistory();
            }
        }
    };

    // Tự động phơi bày ra global window
    if (typeof window !== 'undefined') {
        window.systemBackup = {
            MODULES,
            ALL_SUPABASE_TABLES,
            getLiveStats,
            exportBackup,
            inspectBackupFile,
            restoreBackup,
            getHistory,
            clearHistory
        };
        window.systemBackupUI = systemBackupUI;
        window.openSystemBackupModal = systemBackupUI.openModal;
        window.closeSystemBackupModal = systemBackupUI.closeModal;
    }

    return {
        MODULES,
        ALL_SUPABASE_TABLES,
        getLiveStats,
        exportBackup,
        inspectBackupFile,
        restoreBackup,
        getHistory,
        clearHistory,
        systemBackupUI
    };
});

