/**
 * QMath LMS - Xưởng Câu Hỏi Theo Dạng (Đổi Số Thông Minh - iMath Integration)
 * ============================================================================
 * Tích hợp đồng bộ với:
 *   1. Ngân hàng câu hỏi Cloudflare R2 (dashboard.html -> Sảnh chính, Sidebar & #view-questionbank)
 *      -> Chuẩn hóa MapID, cấp CCCD 8 số và nạp trực tiếp vào Ngân hàng để dùng cho
 *         Luyện tập (Practice), Tạo đề ma trận, và Trò chơi (Games).
 *   2. Trình soạn đề thi (exam-editor.html)
 *      -> Sinh câu hỏi theo dạng, đổi số tương tự theo MapID của câu đang chọn,
 *         vẽ hình trực tiếp bằng TikZJax và chèn thẳng vào đề thi.
 *   3. Hỗ trợ Hybrid Runtime:
 *      - Tự động kết nối Local Python Engine (http://127.0.0.1:8765) nếu đang bật
 *        để sinh vô hạn biến thể mới từ 37 module .pyc (0.004s/câu) và lưu mẫu TikZ mới.
 *      - Tự động chuyển sang Kho Đổi Số Web Tĩnh (data/imath/catalog_mapped.json + pool_L0x.json)
 *        để hoạt động 24/7 trên mọi thiết bị mà không cần cài đặt.
 */

(function () {
    'use strict';

    const LOCAL_BRIDGE_URL = 'http://127.0.0.1:8765';
    const CATALOG_URL = 'data/imath/catalog_mapped.json?v=20261111';

    const state = {
        catalog: [],
        byTag: {},
        byMapId: {},
        poolsLoaded: {}, // { L06: {...}, L09: {...} }
        variantCounters: {}, // { tag: idx }
        localBridgeOnline: false,
        mode: 'editor', // 'editor' | 'bank'
        mobileTab: 'topics', // 'filter' | 'topics' | 'workspace'
        filters: {
            grade: 'Toán 9',
            chapter: 'all',
            lesson: 'all',
            category: 'all',
            level: 'all',
            onlyTikz: false,
            keyword: ''
        },
        workspaceQuestions: [],
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
            try {
                window.showToast(msg, type);
                return;
            } catch (_) {}
        }
        console.log(`[iMathStudio][${type}]`, msg);
    }

    // ------------------------------------------------------------------
    // 0. SELF-CONTAINED CSS (KHÔNG PHỤ THUỘC TAILWIND JIT)
    // ------------------------------------------------------------------
    function injectStudioStyles() {
        if (document.getElementById('imath-studio-styles')) return;
        const style = document.createElement('style');
        style.id = 'imath-studio-styles';
        style.textContent = `
            #imathStudioModal.ims-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 9999 !important;
                background: rgba(15, 23, 42, 0.74) !important;
                backdrop-filter: blur(5px) !important;
                -webkit-backdrop-filter: blur(5px) !important;
                display: none !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 12px !important;
                box-sizing: border-box !important;
            }
            #imathStudioModal.ims-overlay.ims-open {
                display: flex !important;
            }
            .ims-dialog {
                width: 100% !important;
                max-width: 1440px !important;
                height: 92vh !important;
                max-height: 960px !important;
                background: #ffffff !important;
                color: #0f172a !important;
                border-radius: 18px !important;
                border: 1px solid #cbd5e1 !important;
                box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.55) !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                font-family: 'Be Vietnam Pro', 'Inter', system-ui, -apple-system, sans-serif !important;
                box-sizing: border-box !important;
            }
            html.dark .ims-dialog {
                background: #13111c !important;
                color: #f1f5f9 !important;
                border-color: #2e2a40 !important;
            }
            .ims-header {
                padding: 12px 18px !important;
                background: linear-gradient(135deg, #312e81 0%, #1d4ed8 52%, #0f766e 100%) !important;
                color: #ffffff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 12px !important;
                flex-shrink: 0 !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.16) !important;
            }
            .ims-header-left {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                min-width: 0 !important;
                flex: 1 !important;
            }
            .ims-header-icon {
                width: 40px !important;
                height: 40px !important;
                border-radius: 12px !important;
                background: rgba(255, 255, 255, 0.16) !important;
                border: 1px solid rgba(255, 255, 255, 0.28) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 18px !important;
                color: #ffffff !important;
                flex-shrink: 0 !important;
            }
            .ims-header-title-row {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                flex-wrap: wrap !important;
            }
            .ims-header-title {
                font-size: 16px !important;
                font-weight: 800 !important;
                margin: 0 !important;
                color: #ffffff !important;
                line-height: 1.25 !important;
            }
            .ims-header-sub {
                font-size: 11.5px !important;
                color: #dbeafe !important;
                margin: 2px 0 0 0 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            .ims-status-badge {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                padding: 3px 10px !important;
                border-radius: 999px !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                background: rgba(255, 255, 255, 0.16) !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.28) !important;
            }
            .ims-status-badge.ims-online {
                background: rgba(16, 185, 129, 0.25) !important;
                color: #d1fae5 !important;
                border-color: rgba(110, 231, 183, 0.5) !important;
            }
            .ims-header-actions {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                flex-shrink: 0 !important;
            }
            .ims-hdr-btn {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                padding: 6px 11px !important;
                border-radius: 10px !important;
                font-size: 11.5px !important;
                font-weight: 700 !important;
                text-decoration: none !important;
                transition: all 0.15s ease !important;
                cursor: pointer !important;
                white-space: nowrap !important;
            }
            .ims-hdr-btn-pdf {
                background: rgba(251, 191, 36, 0.22) !important;
                color: #fef3c7 !important;
                border: 1px solid rgba(252, 211, 77, 0.45) !important;
            }
            .ims-hdr-btn-pdf:hover {
                background: rgba(251, 191, 36, 0.35) !important;
            }
            .ims-hdr-btn-tex {
                background: rgba(255, 255, 255, 0.14) !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.25) !important;
            }
            .ims-hdr-btn-tex:hover {
                background: rgba(255, 255, 255, 0.24) !important;
            }
            .ims-close-btn {
                width: 34px !important;
                height: 34px !important;
                border-radius: 999px !important;
                background: rgba(255, 255, 255, 0.16) !important;
                border: 1px solid rgba(255, 255, 255, 0.25) !important;
                color: #ffffff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 15px !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
            }
            .ims-close-btn:hover {
                background: #ef4444 !important;
                border-color: #ef4444 !important;
            }

            /* Mobile tab bar */
            .ims-mobile-tabs {
                display: none !important;
                background: #f1f5f9 !important;
                border-bottom: 1px solid #cbd5e1 !important;
                padding: 6px 10px !important;
                gap: 6px !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-mobile-tabs {
                background: #1a1726 !important;
                border-bottom-color: #2e2a40 !important;
            }
            .ims-mobile-tab-btn {
                flex: 1 !important;
                padding: 7px 8px !important;
                border-radius: 9px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                border: 1px solid transparent !important;
                background: transparent !important;
                color: #475569 !important;
                cursor: pointer !important;
                text-align: center !important;
            }
            html.dark .ims-mobile-tab-btn {
                color: #94a3b8 !important;
            }
            .ims-mobile-tab-btn.ims-tab-active {
                background: #4f46e5 !important;
                color: #ffffff !important;
            }

            /* Main 3-Column Grid */
            .ims-body {
                flex: 1 !important;
                min-height: 0 !important;
                display: grid !important;
                grid-template-columns: 290px 400px 1fr !important;
                overflow: hidden !important;
            }
            .ims-col-filter {
                background: #f8fafc !important;
                border-right: 1px solid #e2e8f0 !important;
                padding: 14px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 12px !important;
                overflow-y: auto !important;
                min-height: 0 !important;
            }
            html.dark .ims-col-filter {
                background: #181524 !important;
                border-right-color: #2e2a40 !important;
            }
            .ims-col-topics {
                background: #ffffff !important;
                border-right: 1px solid #e2e8f0 !important;
                display: flex !important;
                flex-direction: column !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            html.dark .ims-col-topics {
                background: #13111c !important;
                border-right-color: #2e2a40 !important;
            }
            .ims-col-workspace {
                background: #f1f5f9 !important;
                display: flex !important;
                flex-direction: column !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            html.dark .ims-col-workspace {
                background: #0d0b14 !important;
            }

            /* Filter controls */
            .ims-section-hdr {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                font-size: 11.5px !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.04em !important;
                color: #334155 !important;
            }
            html.dark .ims-section-hdr {
                color: #cbd5e1 !important;
            }
            .ims-reset-link {
                font-size: 11px !important;
                font-weight: 700 !important;
                color: #4f46e5 !important;
                background: none !important;
                border: none !important;
                cursor: pointer !important;
                text-transform: none !important;
            }
            html.dark .ims-reset-link {
                color: #818cf8 !important;
            }
            .ims-label {
                display: block !important;
                font-size: 11.5px !important;
                font-weight: 700 !important;
                color: #475569 !important;
                margin-bottom: 5px !important;
            }
            html.dark .ims-label {
                color: #94a3b8 !important;
            }
            .ims-grade-grid {
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 6px !important;
            }
            .ims-grade-btn {
                padding: 7px 4px !important;
                border-radius: 9px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                border: 1px solid #cbd5e1 !important;
                background: #ffffff !important;
                color: #334155 !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
                text-align: center !important;
            }
            html.dark .ims-grade-btn {
                background: #1e1b2e !important;
                border-color: #38344d !important;
                color: #cbd5e1 !important;
            }
            .ims-grade-btn.ims-active {
                background: #4f46e5 !important;
                border-color: #4f46e5 !important;
                color: #ffffff !important;
                box-shadow: 0 2px 6px rgba(79, 70, 229, 0.35) !important;
            }
            .ims-select, .ims-input {
                width: 100% !important;
                height: 36px !important;
                padding: 0 10px !important;
                border-radius: 10px !important;
                border: 1px solid #cbd5e1 !important;
                background: #ffffff !important;
                color: #0f172a !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                outline: none !important;
                box-sizing: border-box !important;
            }
            html.dark .ims-select, html.dark .ims-input {
                background: #1e1b2e !important;
                border-color: #38344d !important;
                color: #f1f5f9 !important;
            }
            .ims-select:focus, .ims-input:focus {
                border-color: #6366f1 !important;
                box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2) !important;
            }
            .ims-grid-2 {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 8px !important;
            }
            .ims-search-wrap {
                position: relative !important;
            }
            .ims-search-wrap i {
                position: absolute !important;
                left: 10px !important;
                top: 11px !important;
                color: #64748b !important;
                font-size: 12px !important;
                pointer-events: none !important;
            }
            .ims-search-wrap .ims-input {
                padding-left: 30px !important;
            }
            .ims-tikz-filter-box {
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                padding: 10px 12px !important;
                border-radius: 12px !important;
                background: #fffbeb !important;
                border: 1px solid #fde68a !important;
                cursor: pointer !important;
                user-select: none !important;
            }
            html.dark .ims-tikz-filter-box {
                background: rgba(120, 53, 15, 0.25) !important;
                border-color: rgba(217, 119, 6, 0.45) !important;
            }
            .ims-guide-box {
                margin-top: auto !important;
                padding: 12px !important;
                border-radius: 12px !important;
                background: #eef2ff !important;
                border: 1px solid #c7d2fe !important;
                font-size: 11.5px !important;
                color: #334155 !important;
                line-height: 1.5 !important;
            }
            html.dark .ims-guide-box {
                background: rgba(49, 46, 129, 0.25) !important;
                border-color: rgba(99, 102, 241, 0.35) !important;
                color: #cbd5e1 !important;
            }

            /* Column Subheaders */
            .ims-col-subheader {
                padding: 10px 14px !important;
                background: #f8fafc !important;
                border-bottom: 1px solid #e2e8f0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-col-subheader {
                background: #1a1726 !important;
                border-bottom-color: #2e2a40 !important;
            }
            .ims-col-subheader-title {
                font-size: 12.5px !important;
                font-weight: 800 !important;
                color: #1e293b !important;
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
            }
            html.dark .ims-col-subheader-title {
                color: #f1f5f9 !important;
            }

            /* Scrollable Lists */
            .ims-scroll-list {
                flex: 1 !important;
                min-height: 0 !important;
                overflow-y: auto !important;
                padding: 12px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 10px !important;
            }

            /* Topic Item Card */
            .ims-topic-card {
                padding: 11px 12px !important;
                border-radius: 12px !important;
                border: 1px solid #e2e8f0 !important;
                background: #ffffff !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 7px !important;
                transition: all 0.15s ease !important;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03) !important;
            }
            html.dark .ims-topic-card {
                background: #1c192b !important;
                border-color: #2e2a40 !important;
            }
            .ims-topic-card:hover {
                border-color: #6366f1 !important;
                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.1) !important;
            }
            .ims-topic-top {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 6px !important;
                flex-wrap: wrap !important;
            }
            .ims-badge-row {
                display: flex !important;
                align-items: center !important;
                gap: 5px !important;
                flex-wrap: wrap !important;
            }
            .ims-badge-tag {
                padding: 2px 7px !important;
                border-radius: 6px !important;
                background: #0f172a !important;
                color: #ffffff !important;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
                font-size: 10.5px !important;
                font-weight: 700 !important;
            }
            html.dark .ims-badge-tag {
                background: #312e81 !important;
            }
            .ims-badge-mapid {
                padding: 2px 7px !important;
                border-radius: 6px !important;
                background: #eef2ff !important;
                color: #4338ca !important;
                border: 1px solid #c7d2fe !important;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
                font-size: 10.5px !important;
                font-weight: 700 !important;
            }
            html.dark .ims-badge-mapid {
                background: rgba(79, 70, 229, 0.2) !important;
                color: #a5b4fc !important;
                border-color: rgba(99, 102, 241, 0.4) !important;
            }
            .ims-badge-tikz {
                padding: 2px 7px !important;
                border-radius: 6px !important;
                background: #fef3c7 !important;
                color: #92400e !important;
                border: 1px solid #fcd34d !important;
                font-size: 10px !important;
                font-weight: 700 !important;
            }
            .ims-badge-tikz.ims-tikz-override {
                background: #ccfbf1 !important;
                color: #115e59 !important;
                border-color: #5eead4 !important;
            }
            .ims-badge-lvl {
                padding: 2px 7px !important;
                border-radius: 6px !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                border: 1px solid #e2e8f0 !important;
            }
            .ims-lvl-M1 { background: #ecfdf5 !important; color: #047857 !important; border-color: #a7f3d0 !important; }
            .ims-lvl-M2 { background: #f0f9ff !important; color: #0369a1 !important; border-color: #bae6fd !important; }
            .ims-lvl-M3 { background: #fffbeb !important; color: #b45309 !important; border-color: #fde68a !important; }
            .ims-lvl-M4 { background: #fff1f2 !important; color: #be123c !important; border-color: #fecdd3 !important; }
            .ims-topic-title {
                font-size: 12.5px !important;
                font-weight: 700 !important;
                color: #1e293b !important;
                line-height: 1.4 !important;
            }
            html.dark .ims-topic-title {
                color: #f1f5f9 !important;
            }
            .ims-topic-foot {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                padding-top: 6px !important;
                border-top: 1px solid #f1f5f9 !important;
            }
            html.dark .ims-topic-foot {
                border-top-color: #2e2a40 !important;
            }
            .ims-topic-lesson {
                font-size: 10.5px !important;
                color: #64748b !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            .ims-btn-add1 {
                padding: 4px 10px !important;
                border-radius: 7px !important;
                background: #4f46e5 !important;
                color: #ffffff !important;
                border: none !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
            }
            .ims-btn-add1:hover {
                background: #4338ca !important;
            }
            .ims-btn-add3 {
                padding: 4px 8px !important;
                border-radius: 7px !important;
                background: #eef2ff !important;
                color: #4338ca !important;
                border: 1px solid #c7d2fe !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
            }
            .ims-btn-add3:hover {
                background: #e0e7ff !important;
            }

            /* Workspace Question Card */
            .ims-q-card {
                background: #ffffff !important;
                border-radius: 14px !important;
                border: 1px solid #cbd5e1 !important;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04) !important;
                overflow: hidden !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-q-card {
                background: #181524 !important;
                border-color: #2e2a40 !important;
            }
            .ims-q-card-hdr {
                padding: 8px 12px !important;
                background: #f8fafc !important;
                border-bottom: 1px solid #e2e8f0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                flex-wrap: wrap !important;
            }
            html.dark .ims-q-card-hdr {
                background: #1f1b2e !important;
                border-bottom-color: #2e2a40 !important;
            }
            .ims-q-body {
                padding: 14px !important;
                font-size: 13.5px !important;
                color: #0f172a !important;
                line-height: 1.65 !important;
            }
            html.dark .ims-q-body {
                color: #f1f5f9 !important;
            }
            .ims-choices-grid {
                display: grid !important;
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 8px !important;
                margin-top: 10px !important;
            }
            .ims-choices-tf {
                display: grid !important;
                grid-template-columns: 1fr !important;
                gap: 6px !important;
                margin-top: 10px !important;
            }
            .ims-choice-item {
                padding: 8px 10px !important;
                border-radius: 9px !important;
                border: 1px solid #e2e8f0 !important;
                background: #f8fafc !important;
                font-size: 12.5px !important;
                display: flex !important;
                align-items: flex-start !important;
                gap: 6px !important;
            }
            html.dark .ims-choice-item {
                background: #13111c !important;
                border-color: #2e2a40 !important;
                color: #e2e8f0 !important;
            }
            .ims-choice-item.ims-choice-true {
                background: #ecfdf5 !important;
                border-color: #34d399 !important;
                color: #064e3b !important;
                font-weight: 600 !important;
            }
            html.dark .ims-choice-item.ims-choice-true {
                background: rgba(6, 78, 59, 0.35) !important;
                border-color: #10b981 !important;
                color: #d1fae5 !important;
            }

            /* Workspace Bottom Action Bar */
            .ims-footer {
                padding: 12px 14px !important;
                background: #ffffff !important;
                border-top: 1px solid #e2e8f0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                flex-wrap: wrap !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-footer {
                background: #181524 !important;
                border-top-color: #2e2a40 !important;
            }
            .ims-btn {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                padding: 8px 14px !important;
                border-radius: 10px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                border: 1px solid transparent !important;
                transition: all 0.15s ease !important;
            }
            .ims-btn-sec {
                background: #f1f5f9 !important;
                color: #334155 !important;
                border-color: #cbd5e1 !important;
            }
            .ims-btn-sec:hover {
                background: #e2e8f0 !important;
            }
            .ims-btn-bank {
                background: #d97706 !important;
                color: #ffffff !important;
            }
            .ims-btn-bank:hover {
                background: #b45309 !important;
            }
            .ims-btn-exam {
                background: #4f46e5 !important;
                color: #ffffff !important;
            }
            .ims-btn-exam:hover {
                background: #4338ca !important;
            }

            @media (max-width: 1024px) {
                .ims-hdr-btn-tex { display: none !important; }
                .ims-mobile-tabs { display: flex !important; }
                .ims-body {
                    grid-template-columns: 1fr !important;
                }
                .ims-body[data-mobile-tab="filter"] .ims-col-topics,
                .ims-body[data-mobile-tab="filter"] .ims-col-workspace {
                    display: none !important;
                }
                .ims-body[data-mobile-tab="topics"] .ims-col-filter,
                .ims-body[data-mobile-tab="topics"] .ims-col-workspace {
                    display: none !important;
                }
                .ims-body[data-mobile-tab="workspace"] .ims-col-filter,
                .ims-body[data-mobile-tab="workspace"] .ims-col-topics {
                    display: none !important;
                }
            }
            @media (max-width: 640px) {
                .ims-hdr-btn-pdf span { display: none !important; }
                .ims-choices-grid { grid-template-columns: 1fr !important; }
            }
        `;
        document.head.appendChild(style);
    }

    // ------------------------------------------------------------------
    // 1. KẾT NỐI DỮ LIỆU (HYBRID: LOCAL PYTHON BRIDGE + STATIC WEB POOL)
    // ------------------------------------------------------------------
    async function checkLocalBridge() {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => {
                try { ctrl.abort(); } catch (_) {}
            }, 900);
            const res = await fetch(`${LOCAL_BRIDGE_URL}/api/ping`, { signal: ctrl.signal }).catch(() => null);
            clearTimeout(timer);
            if (res && res.ok) {
                const data = await res.json().catch(() => null);
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
            badge.className = 'ims-status-badge ims-online';
            badge.innerHTML = '<i class="fa-solid fa-bolt"></i><span>Engine Python Trực Tiếp (Sinh vô hạn)</span>';
        } else {
            badge.className = 'ims-status-badge';
            badge.innerHTML = '<i class="fa-solid fa-cloud"></i><span>Kho Đổi Số Web Sẵn Sàng (2.423 dạng)</span>';
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
            console.warn('[iMathStudio] Lỗi tải catalog_mapped.json:', err);
            notify('Không thể tải danh mục dạng toán đổi số: ' + (err.message || err), 'error');
        } finally {
            state.isLoadingCatalog = false;
        }
        return state.catalog;
    }

    async function ensureGradePoolLoaded(gradePrefix) {
        if (state.poolsLoaded[gradePrefix]) return state.poolsLoaded[gradePrefix];
        try {
            const res = await fetch(`data/imath/pool_${gradePrefix}.json?v=20261111`);
            if (res.ok) {
                state.poolsLoaded[gradePrefix] = await res.json();
                return state.poolsLoaded[gradePrefix];
            }
        } catch (err) {
            console.warn(`[iMathStudio] Không tải được pool_${gradePrefix}.json:`, err);
        }
        return {};
    }

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
        injectStudioStyles();
        let modal = document.getElementById('imathStudioModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'imathStudioModal';
        modal.className = 'ims-overlay';
        modal.addEventListener('click', function (e) {
            if (e.target === modal) window.closeIMathStudioModal();
        });

        modal.innerHTML = `
            <div class="ims-dialog" role="dialog" aria-modal="true">
                <!-- Header -->
                <div class="ims-header">
                    <div class="ims-header-left">
                        <div class="ims-header-icon">
                            <i class="fa-solid fa-dice"></i>
                        </div>
                        <div style="min-width:0;flex:1;">
                            <div class="ims-header-title-row">
                                <h2 class="ims-header-title">Xưởng Tạo Câu Hỏi Đổi Số (Theo Dạng Chuẩn MapID)</h2>
                                <span id="imathEngineStatusBadge" class="ims-status-badge">Đang kiểm tra...</span>
                            </div>
                            <p class="ims-header-sub">2.423 dạng toán THCS (Toán 6, 7, 8, 9) • Chuẩn hóa \\dfrac, \\wideparen, \\choiceTF, \\shortans & vẽ hình trực tiếp bằng TikZJax</p>
                        </div>
                    </div>
                    <div class="ims-header-actions">
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.pdf" target="_blank" class="ims-hdr-btn ims-hdr-btn-pdf" title="Mở bảng PDF thống kê toàn bộ 456 câu hỏi có hình vẽ TikZ kèm mã định danh [Lxx_Cx_Bx_xx]">
                            <i class="fa-solid fa-file-pdf"></i>
                            <span>Bảng PDF 456 Hình TikZ</span>
                        </a>
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" download="Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" class="ims-hdr-btn ims-hdr-btn-tex" title="Tải file mã nguồn .tex của 456 câu có hình TikZ">
                            <i class="fa-solid fa-file-code"></i>
                            <span>Mã .tex 456 Hình</span>
                        </a>
                        <button type="button" onclick="window.closeIMathStudioModal()" class="ims-close-btn" title="Đóng (ESC)">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <!-- Mobile Navigation Tabs (< 1024px) -->
                <div class="ims-mobile-tabs">
                    <button type="button" onclick="window.setIMathMobileTab('filter')" id="imsMobileTab_filter" class="ims-mobile-tab-btn">
                        <i class="fa-solid fa-filter"></i> Bộ lọc
                    </button>
                    <button type="button" onclick="window.setIMathMobileTab('topics')" id="imsMobileTab_topics" class="ims-mobile-tab-btn ims-tab-active">
                        <i class="fa-solid fa-layer-group"></i> Dạng toán (<span id="imathMobileTopicCount">0</span>)
                    </button>
                    <button type="button" onclick="window.setIMathMobileTab('workspace')" id="imsMobileTab_workspace" class="ims-mobile-tab-btn">
                        <i class="fa-solid fa-eye"></i> Bàn làm việc (<span id="imathMobileWorkspaceCount">0</span>)
                    </button>
                </div>

                <!-- Main 3-Column Body -->
                <div class="ims-body" id="imathStudioBody" data-mobile-tab="topics">
                    <!-- Cột 1: Bộ lọc Chuyên đề & MapID -->
                    <div class="ims-col-filter">
                        <div class="ims-section-hdr">
                            <span><i class="fa-solid fa-filter" style="color:#4f46e5;margin-right:5px;"></i> Bộ lọc chuyên đề & MapID</span>
                            <button type="button" onclick="window.resetIMathFilters()" class="ims-reset-link">Đặt lại</button>
                        </div>

                        <div>
                            <label class="ims-label">Khối lớp (Sách KNTTVCS)</label>
                            <div class="ims-grade-grid" id="imathGradeButtons">
                                <button type="button" onclick="window.setIMathGrade('Toán 6')" data-grade="Toán 6" class="ims-grade-btn">Toán 6</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 7')" data-grade="Toán 7" class="ims-grade-btn">Toán 7</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 8')" data-grade="Toán 8" class="ims-grade-btn">Toán 8</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 9')" data-grade="Toán 9" class="ims-grade-btn ims-active">Toán 9</button>
                            </div>
                        </div>

                        <div>
                            <label class="ims-label">Chương học</label>
                            <select id="imathFilterChapter" onchange="window.onIMathFilterChange('chapter')" class="ims-select">
                                <option value="all">Tất cả các chương</option>
                            </select>
                        </div>

                        <div>
                            <label class="ims-label">Bài học</label>
                            <select id="imathFilterLesson" onchange="window.onIMathFilterChange('lesson')" class="ims-select">
                                <option value="all">Tất cả các bài</option>
                            </select>
                        </div>

                        <div class="ims-grid-2">
                            <div>
                                <label class="ims-label">Loại câu hỏi</label>
                                <select id="imathFilterCategory" onchange="window.onIMathFilterChange('category')" class="ims-select">
                                    <option value="all">Tất cả loại</option>
                                    <option value="Trắc nghiệm">Trắc nghiệm</option>
                                    <option value="Đúng-Sai">Đúng - Sai</option>
                                    <option value="Trả lời ngắn">Trả lời ngắn</option>
                                    <option value="Tự luận">Tự luận</option>
                                </select>
                            </div>
                            <div>
                                <label class="ims-label">Mức độ</label>
                                <select id="imathFilterLevel" onchange="window.onIMathFilterChange('level')" class="ims-select">
                                    <option value="all">Tất cả mức</option>
                                    <option value="M1">Nhận biết (NB)</option>
                                    <option value="M2">Thông hiểu (TH)</option>
                                    <option value="M3">Vận dụng (VD)</option>
                                    <option value="M4">Vận dụng cao (VDC)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label class="ims-label">Tìm theo MapID / Mã câu / Tên dạng</label>
                            <div class="ims-search-wrap">
                                <i class="fa-solid fa-magnifying-glass"></i>
                                <input type="text" id="imathFilterKeyword" oninput="window.onIMathFilterChange('keyword')" placeholder="VD: 9H4V2-5, L09_C4_B2_57, HINH_..." class="ims-input">
                            </div>
                        </div>

                        <label class="ims-tikz-filter-box">
                            <input type="checkbox" id="imathFilterOnlyTikz" onchange="window.onIMathFilterChange('tikz')" style="width:16px;height:16px;accent-color:#d97706;cursor:pointer;">
                            <div>
                                <div style="font-size:12px;font-weight:800;color:#92400e;">🎨 Chỉ hiện dạng có hình TikZ</div>
                                <div style="font-size:10.5px;color:#b45309;">Hiển thị mã câu & nhóm hình để duyệt/thay TikZ</div>
                            </div>
                        </label>

                        <div class="ims-guide-box">
                            <div style="font-weight:800;color:#4338ca;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Chu trình chuẩn hóa Ngân hàng:
                            </div>
                            <div>1. Chọn dạng bài ở cột giữa để <b>sinh câu hỏi đổi số</b>.</div>
                            <div>2. Xem trước công thức & hình <b>TikZJax</b> bên phải, bấm <b>Đổi số</b> hoặc sửa <b>LaTeX/MapID</b>.</div>
                            <div>3. Bấm <b>Nạp vào Ngân hàng (R2)</b> để cấp CCCD & dùng cho <i>Luyện tập, Tạo đề, Trò chơi</i>!</div>
                        </div>
                    </div>

                    <!-- Cột 2: Danh sách Dạng toán đổi số -->
                    <div class="ims-col-topics">
                        <div class="ims-col-subheader">
                            <div class="ims-col-subheader-title">
                                <i class="fa-solid fa-layer-group" style="color:#4f46e5;"></i>
                                <span>Danh sách dạng toán (<span id="imathTopicCount" style="color:#4f46e5;">0</span>)</span>
                            </div>
                            <button type="button" onclick="window.generateRandomFromFilteredTopics(5)" class="ims-btn-add3" title="Bốc ngẫu nhiên 5 dạng trong danh sách đang lọc và sinh mỗi dạng 1 câu">
                                <i class="fa-solid fa-shuffle"></i> +5 câu ngẫu nhiên
                            </button>
                        </div>
                        <div id="imathTopicList" class="ims-scroll-list">
                            <!-- Danh sách dạng toán render tại đây -->
                        </div>
                    </div>

                    <!-- Cột 3: Bàn làm việc Xem trước, Đổi số & Chuẩn hóa -->
                    <div class="ims-col-workspace">
                        <div class="ims-col-subheader">
                            <div class="ims-col-subheader-title">
                                <i class="fa-solid fa-eye" style="color:#059669;"></i>
                                <span>Câu hỏi đã sinh (<span id="imathWorkspaceCount" style="color:#059669;">0</span> câu)</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <button type="button" onclick="window.rerollAllWorkspaceQuestions()" class="ims-btn-add3" style="background:#fffbeb!important;color:#92400e!important;border-color:#fde68a!important;" title="Đổi bộ số mới cho toàn bộ câu hỏi đang có ở cột này">
                                    <i class="fa-solid fa-arrows-rotate"></i> Đổi số tất cả
                                </button>
                                <button type="button" onclick="window.clearIMathWorkspace()" class="ims-btn-add3" style="background:#fff1f2!important;color:#be123c!important;border-color:#fecdd3!important;" title="Xóa danh sách">
                                    <i class="fa-solid fa-trash-can"></i> Xóa hết
                                </button>
                            </div>
                        </div>

                        <div id="imathWorkspaceList" class="ims-scroll-list">
                            <!-- Các câu hỏi đã sinh render tại đây -->
                        </div>

                        <!-- Thanh công cụ xuất / nạp dưới cùng -->
                        <div class="ims-footer">
                            <button type="button" onclick="window.downloadIMathWorkspaceTex()" class="ims-btn ims-btn-sec">
                                <i class="fa-solid fa-file-export" style="color:#059669;"></i> Xuất file .tex
                            </button>
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <button type="button" onclick="window.pushIMathWorkspaceToBank()" class="ims-btn ims-btn-bank" title="Đưa toàn bộ câu hỏi đã chuẩn hóa vào Ngân hàng câu hỏi R2 để dùng cho Luyện tập, Tạo đề và Trò chơi">
                                    <i class="fa-solid fa-cloud-arrow-up"></i> Nạp vào Ngân hàng (R2)
                                </button>
                                <button type="button" id="btnIMathInsertToExam" onclick="window.insertIMathWorkspaceToExam()" class="ims-btn ims-btn-exam">
                                    <i class="fa-solid fa-plus-circle"></i> Chèn vào Đề thi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && modal.classList.contains('ims-open')) {
                window.closeIMathStudioModal();
            }
        });

        return modal;
    }

    window.setIMathMobileTab = function (tabName) {
        state.mobileTab = tabName;
        const body = document.getElementById('imathStudioBody');
        if (body) body.setAttribute('data-mobile-tab', tabName);
        ['filter', 'topics', 'workspace'].forEach(t => {
            const btn = document.getElementById('imsMobileTab_' + t);
            if (btn) btn.classList.toggle('ims-tab-active', t === tabName);
        });
    };

    // ------------------------------------------------------------------
    // 3. LOGIC LỌC & HIỂN THỊ DANH SÁCH DẠNG TOÁN (CỘT 1 & CỘT 2)
    // ------------------------------------------------------------------
    function renderFilterControls() {
        const gradeBtns = document.querySelectorAll('#imathGradeButtons .ims-grade-btn');
        gradeBtns.forEach(btn => {
            const g = btn.getAttribute('data-grade');
            btn.classList.toggle('ims-active', g === state.filters.grade);
        });

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

    function renderTopicList() {
        const listEl = document.getElementById('imathTopicList');
        const countEl = document.getElementById('imathTopicCount');
        const mobCountEl = document.getElementById('imathMobileTopicCount');
        if (!listEl) return;

        const filtered = getFilteredTopics();
        if (countEl) countEl.textContent = String(filtered.length);
        if (mobCountEl) mobCountEl.textContent = String(filtered.length);

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center;padding:48px 16px;color:#94a3b8;font-size:12.5px;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size:28px;margin-bottom:8px;opacity:0.4;display:block;"></i>
                    <div>Không tìm thấy dạng toán nào khớp bộ lọc.</div>
                </div>
            `;
            return;
        }

        const shown = filtered.slice(0, 150);
        listEl.innerHTML = shown.map(it => {
            const tikzBadge = it.has_tikz
                ? `<span class="ims-badge-tikz ${it.is_tikz_overridden ? 'ims-tikz-override' : ''}" title="Mã nhóm hình TikZ: ${escapeHtml(it.tikz_group_id || it.tag)}">
                        <i class="fa-solid fa-draw-polygon"></i> ${escapeHtml(it.tikz_group_id || 'TikZ')}${it.is_tikz_overridden ? ' ✨' : ''}
                   </span>`
                : '';

            return `
                <div class="ims-topic-card">
                    <div class="ims-topic-top">
                        <div class="ims-badge-row">
                            <span class="ims-badge-tag" title="Mã định danh câu hỏi trong iMath">${escapeHtml(it.tag)}</span>
                            <span class="ims-badge-mapid" title="Mã MapID chuẩn QMath">MapID: ${escapeHtml(it.map_id)}</span>
                            ${tikzBadge}
                        </div>
                        <span class="ims-badge-lvl ims-lvl-${escapeHtml(it.level || 'M1')}">${escapeHtml(it.category)} • ${escapeHtml(it.level_vi)}</span>
                    </div>
                    <div class="ims-topic-title">${escapeHtml(it.title)}</div>
                    <div class="ims-topic-foot">
                        <span class="ims-topic-lesson" title="${escapeHtml(it.lesson)}">${escapeHtml(it.lesson)}</span>
                        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
                            <button type="button" onclick="window.addIMathQuestion('${escapeHtml(it.tag)}', 1)" class="ims-btn-add1">+1 câu</button>
                            <button type="button" onclick="window.addIMathQuestion('${escapeHtml(it.tag)}', 3)" class="ims-btn-add3" title="Sinh 3 câu biến thể đổi số của dạng này">+3</button>
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

        let solutionHtml = '';
        const lgIdx = s.indexOf('\\loigiai');
        if (lgIdx !== -1) {
            const openBrace = s.indexOf('{', lgIdx);
            if (openBrace !== -1) {
                const solContent = s.slice(openBrace + 1).replace(/\}\s*$/, '').trim();
                s = s.slice(0, lgIdx).trim();
                solutionHtml = `
                    <details style="margin-top:10px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:12.5px;">
                        <summary style="font-weight:700;color:#059669;cursor:pointer;user-select:none;">💡 Xem lời giải chi tiết</summary>
                        <div style="margin-top:6px;padding-left:10px;border-left:3px solid #10b981;white-space:pre-line;">${solContent}</div>
                    </details>
                `;
            }
        }

        let tikzScriptHtml = '';
        const tikzRegex = /((?:\\definecolor[^\n]+\n\s*)*\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/;
        const mTikz = s.match(tikzRegex);
        if (mTikz) {
            const rawTikz = mTikz[1].trim();
            s = s.replace(mTikz[0], '');
            tikzScriptHtml = `
                <div class="tikz-container" style="margin:10px 0;display:flex;justify-content:center;background:#ffffff;border-radius:12px;padding:10px;border:1px solid #e2e8f0;overflow-x:auto;">
                    <script type="text/tikz">${rawTikz}<\/script>
                </div>
            `;
        }

        s = s.replace(/^\\immini(?:\[[^\]]*\])?\{([\s\S]*?)\}\s*\{\s*\}/, '$1');

        s = s.replace(/\\shortans(?:\[[^\]]*\])?\{([^{}]*)\}/g, (_, ans) => {
            return `<div style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;font-size:12px;font-weight:700;"><i class="fa-solid fa-key"></i> Đáp án điền số: <span style="font-family:monospace;">${escapeHtml(ans || '(Trống)')}</span></div>`;
        });

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
                const gridClass = cmd === '\\choice' ? 'ims-choices-grid' : 'ims-choices-tf';
                const optsHtml = opts.map((opt, idx) => {
                    const isTrue = opt.includes('\\True');
                    const cleanOpt = opt.replace(/\\True\s*/g, '').trim();
                    return `<div class="ims-choice-item ${isTrue ? 'ims-choice-true' : ''}">
                        <span style="font-weight:800;${isTrue ? 'color:#047857;' : 'color:#64748b;'}">${labels[idx]}</span>
                        <div style="flex:1;">${cleanOpt}</div>
                        ${isTrue ? '<i class="fa-solid fa-circle-check" style="color:#059669;font-size:13px;margin-top:2px;" title="Đáp án đúng"></i>' : ''}
                    </div>`;
                }).join('');
                s = `<div style="white-space:pre-line;">${stem}</div><div class="${gridClass}">${optsHtml}</div>`;
                break;
            }
        }

        return `<div>${s}${tikzScriptHtml}${solutionHtml}</div>`;
    }

    function renderWorkspace() {
        const listEl = document.getElementById('imathWorkspaceList');
        const countEl = document.getElementById('imathWorkspaceCount');
        const mobCountEl = document.getElementById('imathMobileWorkspaceCount');
        if (!listEl) return;

        if (countEl) countEl.textContent = String(state.workspaceQuestions.length);
        if (mobCountEl) mobCountEl.textContent = String(state.workspaceQuestions.length);

        if (state.workspaceQuestions.length === 0) {
            listEl.innerHTML = `
                <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 20px;color:#94a3b8;font-size:12.5px;">
                    <div style="width:56px;height:56px;border-radius:16px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;color:#64748b;">
                        <i class="fa-solid fa-dice-d20"></i>
                    </div>
                    <div style="font-weight:800;color:#475569;font-size:14px;margin-bottom:4px;">Chưa có câu hỏi nào trong bàn làm việc</div>
                    <div style="max-width:300px;line-height:1.5;">Hãy bấm <b>+1 câu</b> hoặc <b>+3</b> ở danh sách dạng toán bên trái để sinh câu hỏi đổi số mới.</div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = state.workspaceQuestions.map((q, idx) => `
            <div class="ims-q-card">
                <div class="ims-q-card-hdr">
                    <div class="ims-badge-row">
                        <span style="padding:2px 8px;border-radius:6px;background:#4f46e5;color:#fff;font-weight:800;font-size:11px;">Câu ${idx + 1}</span>
                        <span class="ims-badge-tag" title="Mã câu để tra cứu/thay hình TikZ">[${escapeHtml(q.tag)}]</span>
                        ${q.tikz_group_id ? `<span class="ims-badge-tikz">🎨 ${escapeHtml(q.tikz_group_id)}</span>` : ''}
                        <div style="display:inline-flex;align-items:center;gap:4px;background:#ffffff;padding:2px 8px;border-radius:6px;border:1px solid #cbd5e1;">
                            <span style="font-size:10.5px;font-weight:700;color:#64748b;">MapID:</span>
                            <input type="text" value="${escapeHtml(q.map_id)}" onchange="window.updateIMathQuestionMapId(${idx}, this.value)" style="width:76px;font-size:11px;font-family:monospace;font-weight:800;color:#4338ca;background:transparent;border:none;outline:none;" title="Chỉnh sửa mã MapID của câu hỏi này">
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px;">
                        <button type="button" onclick="window.rerollSingleWorkspaceQuestion(${idx})" class="ims-btn-add3" style="background:#fffbeb!important;color:#92400e!important;border-color:#fcd34d!important;" title="Sinh bộ số ngẫu nhiên khác cho câu hỏi này">
                            <i class="fa-solid fa-dice"></i> Đổi số
                        </button>
                        <button type="button" onclick="window.toggleIMathQuestionCode(${idx})" class="ims-btn-add3" style="background:#f1f5f9!important;color:#334155!important;border-color:#cbd5e1!important;" title="Xem / Sửa trực tiếp mã LaTeX & TikZ">
                            <i class="fa-solid fa-code"></i> LaTeX
                        </button>
                        <button type="button" onclick="window.removeIMathWorkspaceQuestion(${idx})" class="ims-btn-add3" style="background:#fff1f2!important;color:#be123c!important;border-color:#fecdd3!important;" title="Xóa câu này">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <div class="ims-q-body" id="imathPreviewCard_${idx}">
                    ${formatLatexPreviewHtml(q.latex_mc)}
                </div>

                <div id="imathCodeDrawer_${idx}" style="display:${q.showCode ? 'block' : 'none'};padding:12px;background:#0f172a;color:#f8fafc;border-top:1px solid #1e293b;">
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;margin-bottom:6px;">
                        <span style="font-weight:700;color:#34d399;"><i class="fa-solid fa-terminal"></i> Mã nguồn LaTeX chuẩn ex_test (${escapeHtml(q.tag)}):</span>
                        <span style="color:#94a3b8;">Chỉnh sửa sẽ tự động cập nhật khung xem trước</span>
                    </div>
                    <textarea rows="7" onchange="window.updateIMathQuestionLatex(${idx}, this.value)" style="width:100%;padding:10px;border-radius:8px;background:#020617;color:#6ee7b7;font-family:monospace;font-size:12px;border:1px solid #334155;outline:none;box-sizing:border-box;">${escapeHtml(q.latex_mc)}</textarea>
                </div>
            </div>
        `).join('');

        setTimeout(() => {
            try {
                if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                    window.MathJax.typesetPromise([listEl]).catch(() => {});
                }
            } catch (_) {}
            try {
                if (typeof window.renderTikz === 'function') {
                    window.renderTikz(listEl);
                }
            } catch (_) {}
        }, 60);
    }

    // ------------------------------------------------------------------
    // 5. CÁC HÀM TƯƠNG TÁC & KẾT NỐI VỚI NGÂN HÀNG CÂU HỎI / ĐỀ THI
    // ------------------------------------------------------------------
    window.openIMathStudioModal = async function (mode = 'editor', initialMapIdOrTag = '') {
        try {
            state.mode = mode;
            const modal = ensureModalDOM();
            modal.classList.add('ims-open');

            const btnInsertExam = document.getElementById('btnIMathInsertToExam');
            if (btnInsertExam) {
                const isExamEditorPage = window.location.pathname.includes('exam-editor') || typeof window.parseLatexContent === 'function';
                btnInsertExam.style.display = isExamEditorPage ? 'inline-flex' : 'none';
            }

            checkLocalBridge().catch(() => {});
            await ensureCatalogLoaded();

            if (initialMapIdOrTag) {
                state.filters.keyword = initialMapIdOrTag.trim();
                const kwInput = document.getElementById('imathFilterKeyword');
                if (kwInput) kwInput.value = state.filters.keyword;
            }

            renderFilterControls();
            renderTopicList();
            renderWorkspace();
        } catch (err) {
            console.warn('[iMathStudio] openIMathStudioModal error:', err);
        }
    };

    window.closeIMathStudioModal = function () {
        const modal = document.getElementById('imathStudioModal');
        if (modal) {
            modal.classList.remove('ims-open');
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
        try {
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
            if (window.innerWidth <= 1024) {
                window.setIMathMobileTab('workspace');
            }
            notify(`Đã sinh ${items.length} câu hỏi đổi số cho mã [${tag}]!`, 'success');
        } catch (err) {
            console.warn('[iMathStudio] addIMathQuestion error:', err);
        }
    };

    window.generateRandomFromFilteredTopics = async function (total = 5) {
        try {
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
            if (window.innerWidth <= 1024) {
                window.setIMathMobileTab('workspace');
            }
            notify(`Đã sinh ngẫu nhiên ${total} câu hỏi đổi số!`, 'success');
        } catch (err) {
            console.warn('[iMathStudio] generateRandom error:', err);
        }
    };

    window.rerollSingleWorkspaceQuestion = async function (idx) {
        try {
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
        } catch (err) {
            console.warn('[iMathStudio] rerollSingle error:', err);
        }
    };

    window.rerollAllWorkspaceQuestions = async function () {
        try {
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
        } catch (err) {
            console.warn('[iMathStudio] rerollAll error:', err);
        }
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
        if (drawer) drawer.style.display = q.showCode ? 'block' : 'none';
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

    window.pushIMathWorkspaceToBank = function () {
        if (state.workspaceQuestions.length === 0) {
            notify('Chưa có câu hỏi nào trong danh sách để nạp vào Ngân hàng!', 'warning');
            return;
        }
        const combinedTex = state.workspaceQuestions.map(q => q.latex_mc).join('\n\n');

        const bankTexInput = document.getElementById('bankTexInput');
        if (bankTexInput && typeof window.openBankDirectImportModal === 'function') {
            window.closeIMathStudioModal();
            if (typeof window.switchView === 'function') {
                try { window.switchView('questionbank'); } catch (_) {}
            }
            window.openBankDirectImportModal('tex');
            bankTexInput.value = combinedTex;
            if (typeof window.parseBankTexQuestions === 'function') {
                window.parseBankTexQuestions();
            }
            notify(`Đã chuyển ${state.workspaceQuestions.length} câu hỏi đổi số sang Hàng đợi Nạp Ngân hàng (tự động cấp CCCD & MapID)!`, 'success');
            return;
        }

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

    window.openIMathForCurrentEditorQuestion = async function () {
        const mapIdInput = document.getElementById('editMapId') || document.getElementById('editorMapId');
        const mapId = (mapIdInput?.value || '').trim();
        await window.openIMathStudioModal('editor', mapId);
    };

    // ------------------------------------------------------------------
    // 6. TỰ ĐỘNG GẮN NÚT VÀO GIAO DIỆN DASHBOARD & EXAM-EDITOR
    // ------------------------------------------------------------------
    function injectEntryButtons() {
        injectStudioStyles();

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

        // 2. Trong exam-editor.html (Thanh công cụ trên + Dropzone rỗng)
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
