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
 *   3. Bộ lọc Chuyên đề & Dạng toán chuẩn MapID (6, 7, 8, 9):
 *      -> Lọc theo Khối lớp -> Phân môn -> Chương -> Bài -> Dạng của MapID (tương tự Khu luyện tập).
 */

(function () {
    'use strict';

    const LOCAL_BRIDGE_URL = 'http://127.0.0.1:8765';
    const DATA_VERSION = '20261113-v2';
    const CATALOG_URL = `data/imath/catalog_mapped.json?v=${DATA_VERSION}`;

    const state = {
        catalog: [],
        byTag: {},
        byMapId: {},
        poolsLoaded: {}, // { L06: {...}, L09: {...} }
        gradePoolPromises: {},
        tagPools: {}, // { tag: [{latex, ans}, ...] }
        tagPoolPromises: {},
        variantCounters: {}, // { tag: idx }
        localBridgeOnline: false,
        mode: 'editor', // 'editor' | 'bank'
        mobileTab: 'topics', // 'filter' | 'topics' | 'workspace'
        filters: {
            grade: 'Toán 9',
            subject: 'all', // 'all' | 'D' | 'H' | 'X'
            chapter: 'all',
            lesson: 'all',
            mapForm: 'all', // 'all' or form_name
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
        if (typeof window.showNotification === 'function') {
            try {
                window.showNotification(msg, type);
                return;
            } catch (_) {}
        }
        console.log(`[iMathStudio][${type}]`, msg);
    }

    function shortCategoryName(cat) {
        const c = String(cat || '').trim();
        if (c === 'Trắc nghiệm') return 'TN';
        if (c === 'Đúng-Sai') return 'Đ/S';
        if (c === 'Trả lời ngắn') return 'TLN';
        if (c === 'Tự luận') return 'TL';
        return c || 'TN';
    }

    // ------------------------------------------------------------------
    // 0. SELF-CONTAINED CSS (CLEAN, MINIMAL, SYNCHRONIZED WITH QMATH)
    // ------------------------------------------------------------------
    function injectStudioStyles() {
        let style = document.getElementById('imath-studio-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'imath-studio-styles';
            document.head.appendChild(style);
        }
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
                background: rgba(9, 11, 17, 0.72) !important;
                backdrop-filter: blur(4px) !important;
                -webkit-backdrop-filter: blur(4px) !important;
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
                max-width: 1460px !important;
                height: 92vh !important;
                max-height: 960px !important;
                background: #ffffff !important;
                color: #0f172a !important;
                border-radius: 16px !important;
                border: 1px solid #e2e8f0 !important;
                box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.45) !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                font-family: 'Be Vietnam Pro', 'Inter', system-ui, -apple-system, sans-serif !important;
                box-sizing: border-box !important;
            }
            html.dark .ims-dialog {
                background: #141622 !important;
                color: #e2e8f0 !important;
                border-color: #26293d !important;
            }

            /* Unified Minimal Header */
            .ims-header {
                padding: 12px 18px !important;
                background: #ffffff !important;
                color: #0f172a !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 12px !important;
                flex-shrink: 0 !important;
                border-bottom: 1px solid #e2e8f0 !important;
            }
            html.dark .ims-header {
                background: #181b28 !important;
                color: #f1f5f9 !important;
                border-bottom-color: #26293d !important;
            }
            .ims-header-left {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                min-width: 0 !important;
                flex: 1 !important;
            }
            .ims-header-icon {
                width: 36px !important;
                height: 36px !important;
                border-radius: 10px !important;
                background: #f1f5f9 !important;
                border: 1px solid #e2e8f0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 15px !important;
                color: #4f46e5 !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-header-icon {
                background: #222638 !important;
                border-color: #2f344d !important;
                color: #818cf8 !important;
            }
            .ims-header-title-row {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                flex-wrap: wrap !important;
            }
            .ims-header-title {
                font-size: 15px !important;
                font-weight: 700 !important;
                margin: 0 !important;
                color: inherit !important;
                line-height: 1.25 !important;
            }
            .ims-header-sub {
                font-size: 11.5px !important;
                color: #64748b !important;
                margin: 2px 0 0 0 !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            html.dark .ims-header-sub {
                color: #94a3b8 !important;
            }
            .ims-status-badge {
                display: inline-flex !important;
                align-items: center !important;
                gap: 5px !important;
                padding: 2px 9px !important;
                border-radius: 6px !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                background: #f1f5f9 !important;
                color: #475569 !important;
                border: 1px solid #e2e8f0 !important;
                cursor: pointer !important;
            }
            html.dark .ims-status-badge {
                background: #222638 !important;
                color: #94a3b8 !important;
                border-color: #2f344d !important;
            }
            .ims-status-badge.ims-online {
                color: #059669 !important;
                border-color: rgba(16, 185, 129, 0.35) !important;
            }
            html.dark .ims-status-badge.ims-online {
                color: #34d399 !important;
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
                border-radius: 8px !important;
                font-size: 11.5px !important;
                font-weight: 600 !important;
                text-decoration: none !important;
                transition: all 0.15s ease !important;
                cursor: pointer !important;
                white-space: nowrap !important;
                background: #f8fafc !important;
                color: #334155 !important;
                border: 1px solid #e2e8f0 !important;
            }
            html.dark .ims-hdr-btn {
                background: #222638 !important;
                color: #cbd5e1 !important;
                border-color: #2f344d !important;
            }
            .ims-hdr-btn:hover {
                border-color: #6366f1 !important;
                color: #4f46e5 !important;
            }
            html.dark .ims-hdr-btn:hover {
                border-color: #6366f1 !important;
                color: #a5b4fc !important;
            }
            .ims-close-btn {
                width: 32px !important;
                height: 32px !important;
                border-radius: 8px !important;
                background: transparent !important;
                border: 1px solid #e2e8f0 !important;
                color: #64748b !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 14px !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
            }
            html.dark .ims-close-btn {
                border-color: #2f344d !important;
                color: #94a3b8 !important;
            }
            .ims-close-btn:hover {
                background: #f1f5f9 !important;
                color: #0f172a !important;
            }
            html.dark .ims-close-btn:hover {
                background: #26293d !important;
                color: #ffffff !important;
            }

            /* Mobile tab bar */
            .ims-mobile-tabs {
                display: none !important;
                background: #f8fafc !important;
                border-bottom: 1px solid #e2e8f0 !important;
                padding: 6px 10px !important;
                gap: 6px !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-mobile-tabs {
                background: #181b28 !important;
                border-bottom-color: #26293d !important;
            }
            .ims-mobile-tab-btn {
                flex: 1 !important;
                padding: 6px 8px !important;
                border-radius: 8px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                border: 1px solid transparent !important;
                background: transparent !important;
                color: #64748b !important;
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
                grid-template-columns: 320px 410px 1fr !important;
                overflow: hidden !important;
            }
            .ims-col-filter {
                background: #f8fafc !important;
                border-right: 1px solid #e2e8f0 !important;
                padding: 12px 14px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 10px !important;
                overflow-y: auto !important;
                min-height: 0 !important;
            }
            html.dark .ims-col-filter {
                background: #161926 !important;
                border-right-color: #26293d !important;
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
                background: #141622 !important;
                border-right-color: #26293d !important;
            }
            .ims-col-workspace {
                background: #f8fafc !important;
                display: flex !important;
                flex-direction: column !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }
            html.dark .ims-col-workspace {
                background: #10121c !important;
            }

            /* Filter Controls */
            .ims-section-hdr {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.04em !important;
                color: #64748b !important;
            }
            html.dark .ims-section-hdr {
                color: #94a3b8 !important;
            }
            .ims-reset-link {
                font-size: 11px !important;
                font-weight: 600 !important;
                color: #64748b !important;
                background: none !important;
                border: none !important;
                cursor: pointer !important;
                text-transform: none !important;
            }
            .ims-reset-link:hover {
                color: #4f46e5 !important;
            }
            html.dark .ims-reset-link {
                color: #94a3b8 !important;
            }
            html.dark .ims-reset-link:hover {
                color: #a5b4fc !important;
            }
            .ims-label {
                display: block !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                color: #64748b !important;
                margin-bottom: 4px !important;
            }
            html.dark .ims-label {
                color: #94a3b8 !important;
            }
            .ims-seg-grid {
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 4px !important;
                background: #e2e8f0 !important;
                padding: 3px !important;
                border-radius: 8px !important;
            }
            html.dark .ims-seg-grid {
                background: #1e2233 !important;
            }
            .ims-seg-btn {
                padding: 5px 4px !important;
                border-radius: 6px !important;
                font-size: 11.5px !important;
                font-weight: 600 !important;
                border: none !important;
                background: transparent !important;
                color: #475569 !important;
                cursor: pointer !important;
                transition: all 0.12s ease !important;
                text-align: center !important;
                white-space: nowrap !important;
            }
            html.dark .ims-seg-btn {
                color: #94a3b8 !important;
            }
            .ims-seg-btn.ims-active {
                background: #ffffff !important;
                color: #0f172a !important;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08) !important;
            }
            html.dark .ims-seg-btn.ims-active {
                background: #2d334d !important;
                color: #f8fafc !important;
            }
            .ims-select, .ims-input {
                width: 100% !important;
                height: 34px !important;
                padding: 0 9px !important;
                border-radius: 8px !important;
                border: 1px solid #cbd5e1 !important;
                background: #ffffff !important;
                color: #0f172a !important;
                font-size: 12px !important;
                font-weight: 500 !important;
                outline: none !important;
                box-sizing: border-box !important;
            }
            html.dark .ims-select, html.dark .ims-input {
                background: #1e2233 !important;
                border-color: #2f344d !important;
                color: #f1f5f9 !important;
            }
            .ims-select:focus, .ims-input:focus {
                border-color: #6366f1 !important;
            }
            .ims-grid-2 {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 6px !important;
            }
            .ims-search-wrap {
                position: relative !important;
            }
            .ims-search-wrap i {
                position: absolute !important;
                left: 10px !important;
                top: 10px !important;
                color: #64748b !important;
                font-size: 11.5px !important;
                pointer-events: none !important;
            }
            .ims-search-wrap .ims-input {
                padding-left: 28px !important;
            }

            /* MapID Form Tree List (giống Khu luyện tập) */
            .ims-mapform-box {
                flex: 1 !important;
                min-height: 120px !important;
                display: flex !important;
                flex-direction: column !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 10px !important;
                background: #ffffff !important;
                overflow: hidden !important;
            }
            html.dark .ims-mapform-box {
                background: #1a1d2d !important;
                border-color: #2a2f45 !important;
            }
            .ims-mapform-hdr {
                padding: 7px 10px !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                color: #475569 !important;
                background: #f8fafc !important;
                border-bottom: 1px solid #e2e8f0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
            }
            html.dark .ims-mapform-hdr {
                background: #1e2233 !important;
                color: #94a3b8 !important;
                border-bottom-color: #2a2f45 !important;
            }
            .ims-mapform-list {
                flex: 1 !important;
                overflow-y: auto !important;
                padding: 6px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 3px !important;
            }
            .ims-mapform-item {
                display: flex !important;
                align-items: flex-start !important;
                justify-content: space-between !important;
                gap: 8px !important;
                padding: 6px 8px !important;
                border-radius: 7px !important;
                border: 1px solid transparent !important;
                background: transparent !important;
                color: #334155 !important;
                font-size: 11.5px !important;
                line-height: 1.35 !important;
                text-align: left !important;
                cursor: pointer !important;
                transition: all 0.12s ease !important;
            }
            html.dark .ims-mapform-item {
                color: #cbd5e1 !important;
            }
            .ims-mapform-item:hover {
                background: #f1f5f9 !important;
            }
            html.dark .ims-mapform-item:hover {
                background: #23283c !important;
            }
            .ims-mapform-item.ims-active {
                background: #eef2ff !important;
                border-color: #c7d2fe !important;
                color: #3730a3 !important;
                font-weight: 600 !important;
            }
            html.dark .ims-mapform-item.ims-active {
                background: rgba(99, 102, 241, 0.16) !important;
                border-color: rgba(99, 102, 241, 0.4) !important;
                color: #e0e7ff !important;
            }
            .ims-mapform-count {
                font-size: 10px !important;
                font-weight: 600 !important;
                color: #64748b !important;
                background: #f1f5f9 !important;
                padding: 1px 6px !important;
                border-radius: 999px !important;
                flex-shrink: 0 !important;
                margin-top: 1px !important;
            }
            html.dark .ims-mapform-count {
                background: #262b40 !important;
                color: #94a3b8 !important;
            }

            .ims-tikz-toggle {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                padding: 7px 10px !important;
                border-radius: 8px !important;
                background: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                font-size: 11.5px !important;
                font-weight: 500 !important;
                color: #475569 !important;
                cursor: pointer !important;
                user-select: none !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-tikz-toggle {
                background: #1e2233 !important;
                border-color: #2f344d !important;
                color: #cbd5e1 !important;
            }

            /* Column Subheaders */
            .ims-col-subheader {
                padding: 10px 14px !important;
                background: #ffffff !important;
                border-bottom: 1px solid #e2e8f0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-col-subheader {
                background: #181b28 !important;
                border-bottom-color: #26293d !important;
            }
            .ims-col-subheader-title {
                font-size: 12.5px !important;
                font-weight: 700 !important;
                color: #1e293b !important;
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
            }
            html.dark .ims-col-subheader-title {
                color: #e2e8f0 !important;
            }

            /* Scrollable Lists */
            .ims-scroll-list {
                flex: 1 !important;
                min-height: 0 !important;
                overflow-y: auto !important;
                padding: 10px 12px !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 6px !important;
            }

            /* Clean & Compact Topic Item Card (Ảnh 3 Redesign) */
            .ims-topic-card {
                padding: 10px 12px !important;
                border-radius: 10px !important;
                border: 1px solid #e2e8f0 !important;
                background: #ffffff !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 10px !important;
                transition: border-color 0.12s ease, background 0.12s ease !important;
            }
            html.dark .ims-topic-card {
                background: #191c2b !important;
                border-color: #262a3e !important;
            }
            .ims-topic-card:hover {
                border-color: #94a3b8 !important;
                background: #f8fafc !important;
            }
            html.dark .ims-topic-card:hover {
                border-color: #475569 !important;
                background: #1e2235 !important;
            }
            .ims-topic-main {
                flex: 1 !important;
                min-width: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
            }
            .ims-topic-title {
                font-size: 13px !important;
                font-weight: 600 !important;
                color: #0f172a !important;
                line-height: 1.38 !important;
            }
            html.dark .ims-topic-title {
                color: #f1f5f9 !important;
            }
            .ims-topic-meta {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                flex-wrap: wrap !important;
                font-size: 11px !important;
                color: #64748b !important;
            }
            html.dark .ims-topic-meta {
                color: #94a3b8 !important;
            }
            .ims-meta-mapid {
                padding: 1px 6px !important;
                border-radius: 4px !important;
                background: #f1f5f9 !important;
                color: #334155 !important;
                border: 1px solid #e2e8f0 !important;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
                font-size: 10.5px !important;
                font-weight: 600 !important;
            }
            html.dark .ims-meta-mapid {
                background: #23273a !important;
                color: #cbd5e1 !important;
                border-color: #313752 !important;
            }
            .ims-meta-dot {
                opacity: 0.45 !important;
            }
            .ims-meta-code {
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
                font-size: 10.5px !important;
                color: #64748b !important;
            }
            html.dark .ims-meta-code {
                color: #8b95a9 !important;
            }
            .ims-topic-actions {
                display: flex !important;
                align-items: center !important;
                gap: 5px !important;
                flex-shrink: 0 !important;
            }
            .ims-btn-add1 {
                height: 28px !important;
                padding: 0 10px !important;
                border-radius: 6px !important;
                background: #4f46e5 !important;
                color: #ffffff !important;
                border: 1px solid #4f46e5 !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: background 0.12s ease !important;
            }
            .ims-btn-add1:hover {
                background: #4338ca !important;
            }
            .ims-btn-add3 {
                height: 28px !important;
                padding: 0 8px !important;
                border-radius: 6px !important;
                background: #f8fafc !important;
                color: #475569 !important;
                border: 1px solid #cbd5e1 !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 4px !important;
                transition: all 0.12s ease !important;
            }
            html.dark .ims-btn-add3 {
                background: #222638 !important;
                color: #cbd5e1 !important;
                border-color: #313752 !important;
            }
            .ims-btn-add3:hover {
                border-color: #6366f1 !important;
                color: #4f46e5 !important;
            }
            html.dark .ims-btn-add3:hover {
                border-color: #818cf8 !important;
                color: #a5b4fc !important;
            }

            /* Workspace Question Card */
            .ims-q-card {
                background: #ffffff !important;
                border-radius: 12px !important;
                border: 1px solid #e2e8f0 !important;
                overflow: hidden !important;
                flex-shrink: 0 !important;
            }
            html.dark .ims-q-card {
                background: #171a28 !important;
                border-color: #26293d !important;
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
                background: #1c2030 !important;
                border-bottom-color: #26293d !important;
            }
            .ims-q-body {
                padding: 14px !important;
                font-size: 13.5px !important;
                color: #0f172a !important;
                line-height: 1.65 !important;
            }
            html.dark .ims-q-body {
                color: #e2e8f0 !important;
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
                border-radius: 8px !important;
                border: 1px solid #e2e8f0 !important;
                background: #f8fafc !important;
                font-size: 12.5px !important;
                display: flex !important;
                align-items: flex-start !important;
                gap: 6px !important;
            }
            html.dark .ims-choice-item {
                background: #131622 !important;
                border-color: #26293d !important;
                color: #cbd5e1 !important;
            }
            .ims-choice-item.ims-choice-true {
                background: rgba(16, 185, 129, 0.08) !important;
                border-color: rgba(16, 185, 129, 0.45) !important;
                color: #065f46 !important;
                font-weight: 600 !important;
            }
            html.dark .ims-choice-item.ims-choice-true {
                background: rgba(16, 185, 129, 0.14) !important;
                border-color: rgba(16, 185, 129, 0.45) !important;
                color: #a7f3d0 !important;
            }

            /* Workspace Bottom Action Bar */
            .ims-footer {
                padding: 10px 14px !important;
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
                background: #181b28 !important;
                border-top-color: #26293d !important;
            }
            .ims-btn {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                padding: 7px 13px !important;
                border-radius: 8px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                border: 1px solid transparent !important;
                transition: all 0.15s ease !important;
            }
            .ims-btn-sec {
                background: #f8fafc !important;
                color: #334155 !important;
                border-color: #cbd5e1 !important;
            }
            html.dark .ims-btn-sec {
                background: #222638 !important;
                color: #cbd5e1 !important;
                border-color: #313752 !important;
            }
            .ims-btn-sec:hover {
                border-color: #6366f1 !important;
            }
            .ims-btn-bank {
                background: #334155 !important;
                color: #ffffff !important;
                border-color: #475569 !important;
            }
            html.dark .ims-btn-bank {
                background: #2d334d !important;
                color: #f8fafc !important;
                border-color: #3f476b !important;
            }
            .ims-btn-bank:hover {
                background: #1e293b !important;
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
    }

    // ------------------------------------------------------------------
    // 1. KẾT NỐI DỮ LIỆU (KHÔNG DÙNG ABORTCONTROLLER ĐỂ TRÁNH ABORTERROR)
    // ------------------------------------------------------------------
    async function checkLocalBridge(forceCheck = false) {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isLocalHost && !forceCheck) {
            state.localBridgeOnline = false;
            updateEngineBadge();
            return false;
        }
        try {
            const fetchPromise = fetch(`${LOCAL_BRIDGE_URL}/api/ping`, { mode: 'cors' })
                .then(r => (r && r.ok ? r.json() : null))
                .catch(() => null);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 700));
            const data = await Promise.race([fetchPromise, timeoutPromise]);
            state.localBridgeOnline = Boolean(data && data.ok);
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
            badge.innerHTML = '<i class="fa-solid fa-bolt"></i><span>Engine Python Local</span>';
        } else {
            badge.className = 'ims-status-badge';
            badge.innerHTML = '<i class="fa-solid fa-database"></i><span>2.476 mẫu × 150 biến thể</span>';
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

    function shuffleArrayInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    async function ensureGradePoolLoaded(gradePrefix) {
        if (state.poolsLoaded[gradePrefix]) return state.poolsLoaded[gradePrefix];
        if (state.gradePoolPromises[gradePrefix]) return state.gradePoolPromises[gradePrefix];
        state.gradePoolPromises[gradePrefix] = (async () => {
            try {
                const res = await fetch(`data/imath/pool_${gradePrefix}.json?v=${DATA_VERSION}`);
                if (res.ok) {
                    state.poolsLoaded[gradePrefix] = await res.json();
                    return state.poolsLoaded[gradePrefix];
                }
            } catch (err) {
                console.warn(`[iMathStudio] Không tải được pool_${gradePrefix}.json:`, err);
            }
            return {};
        })();
        return state.gradePoolPromises[gradePrefix];
    }

    async function ensureTagVariantsLoaded(tag) {
        if (state.tagPools[tag]) return state.tagPools[tag];
        if (state.tagPoolPromises[tag]) return state.tagPoolPromises[tag];
        state.tagPoolPromises[tag] = (async () => {
            try {
                const res = await fetch(`data/imath/tags/${encodeURIComponent(tag)}.json?v=${DATA_VERSION}`);
                if (res.ok) {
                    const arr = await res.json();
                    if (Array.isArray(arr) && arr.length > 0) {
                        state.tagPools[tag] = shuffleArrayInPlace(arr.slice());
                        return state.tagPools[tag];
                    }
                }
            } catch (err) {
                console.warn(`[iMathStudio] Fallback pool cho ${tag}:`, err);
            }
            const gradePrefix = tag.split('_')[0] || 'L09';
            const pool = await ensureGradePoolLoaded(gradePrefix);
            const fallbackArr = Array.isArray(pool[tag]) ? shuffleArrayInPlace(pool[tag].slice()) : [];
            if (fallbackArr.length > 0) state.tagPools[tag] = fallbackArr;
            return fallbackArr;
        })();
        return state.tagPoolPromises[tag];
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

        const variants = await ensureTagVariantsLoaded(tag);
        if (!variants || variants.length === 0) {
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
                                <h2 class="ims-header-title">Tạo câu hỏi theo dạng (Đổi số chuẩn MapID)</h2>
                                <span id="imathEngineStatusBadge" onclick="window.pingIMathLocalEngine()" class="ims-status-badge" title="Bấm để kiểm tra kết nối Python Local Engine">2.473 mẫu chuẩn MapID</span>
                            </div>
                            <p class="ims-header-sub">Lọc theo cấu trúc MapID (Khối • Phân môn • Chương • Bài • Dạng toán) & nạp thẳng vào Ngân hàng câu hỏi / Đề thi</p>
                        </div>
                    </div>
                    <div class="ims-header-actions">
                        <a href="data/imath/So_Sanh_Hinh_Thuc_Te_Cu_Va_Moi.pdf" target="_blank" class="ims-hdr-btn ims-hdr-btn-pdf" style="border-color:#10b981;color:#10b981;background:rgba(16,185,129,0.08);" title="Xem bảng so sánh đối chiếu hình vẽ thực tế cũ và hình TikZ chuẩn mới">
                            <i class="fa-solid fa-file-circle-check"></i>
                            <span>So Sánh TikZ Mới</span>
                        </a>
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.pdf" target="_blank" class="ims-hdr-btn ims-hdr-btn-pdf" title="Mở bảng PDF thống kê 456 câu hỏi có hình vẽ TikZ kèm mã định danh">
                            <i class="fa-regular fa-file-pdf"></i>
                            <span>Bảng PDF 456 Hình</span>
                        </a>
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" download="Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" class="ims-hdr-btn ims-hdr-btn-tex" title="Tải file mã nguồn .tex của 456 câu có hình TikZ">
                            <i class="fa-solid fa-code"></i>
                            <span>File .tex 456 Hình</span>
                        </a>
                        <button type="button" onclick="window.closeIMathStudioModal()" class="ims-close-btn" title="Đóng (ESC)">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <!-- Mobile Navigation Tabs (< 1024px) -->
                <div class="ims-mobile-tabs">
                    <button type="button" onclick="window.setIMathMobileTab('filter')" id="imsMobileTab_filter" class="ims-mobile-tab-btn">
                        <i class="fa-solid fa-filter"></i> Bộ lọc MapID
                    </button>
                    <button type="button" onclick="window.setIMathMobileTab('topics')" id="imsMobileTab_topics" class="ims-mobile-tab-btn ims-tab-active">
                        <i class="fa-solid fa-layer-group"></i> Dạng câu (<span id="imathMobileTopicCount">0</span>)
                    </button>
                    <button type="button" onclick="window.setIMathMobileTab('workspace')" id="imsMobileTab_workspace" class="ims-mobile-tab-btn">
                        <i class="fa-solid fa-list-check"></i> Đã sinh (<span id="imathMobileWorkspaceCount">0</span>)
                    </button>
                </div>

                <!-- Main 3-Column Body -->
                <div class="ims-body" id="imathStudioBody" data-mobile-tab="topics">
                    <!-- Cột 1: Bộ lọc Chuyên đề & Dạng của MapID -->
                    <div class="ims-col-filter">
                        <div class="ims-section-hdr">
                            <span>Bộ lọc chuyên đề MapID</span>
                            <button type="button" onclick="window.resetIMathFilters()" class="ims-reset-link">Đặt lại</button>
                        </div>

                        <div>
                            <label class="ims-label">1. Khối lớp</label>
                            <div class="ims-seg-grid" id="imathGradeButtons">
                                <button type="button" onclick="window.setIMathGrade('Toán 6')" data-grade="Toán 6" class="ims-seg-btn">Lớp 6</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 7')" data-grade="Toán 7" class="ims-seg-btn">Lớp 7</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 8')" data-grade="Toán 8" class="ims-seg-btn">Lớp 8</button>
                                <button type="button" onclick="window.setIMathGrade('Toán 9')" data-grade="Toán 9" class="ims-seg-btn ims-active">Lớp 9</button>
                            </div>
                        </div>

                        <div>
                            <label class="ims-label">2. Phân môn (MapID)</label>
                            <div class="ims-seg-grid" id="imathSubjectButtons">
                                <button type="button" onclick="window.setIMathSubject('all')" data-subject="all" class="ims-seg-btn ims-active">Tất cả</button>
                                <button type="button" onclick="window.setIMathSubject('D')" data-subject="D" class="ims-seg-btn">Đại số</button>
                                <button type="button" onclick="window.setIMathSubject('H')" data-subject="H" class="ims-seg-btn">Hình học</button>
                                <button type="button" onclick="window.setIMathSubject('X')" data-subject="X" class="ims-seg-btn">XS - TK</button>
                            </div>
                        </div>

                        <div>
                            <label class="ims-label">3. Chương học</label>
                            <select id="imathFilterChapter" onchange="window.onIMathFilterChange('chapter')" class="ims-select">
                                <option value="all">Tất cả các chương</option>
                            </select>
                        </div>

                        <div>
                            <label class="ims-label">4. Bài / Chủ đề</label>
                            <select id="imathFilterLesson" onchange="window.onIMathFilterChange('lesson')" class="ims-select">
                                <option value="all">Tất cả các bài</option>
                            </select>
                        </div>

                        <!-- Danh sách Dạng của MapID (giống Khu luyện tập) -->
                        <div class="ims-mapform-box">
                            <div class="ims-mapform-hdr">
                                <span>5. Dạng toán theo MapID</span>
                                <span id="imathMapFormCountBadge" style="font-weight:600;font-size:10.5px;">0 dạng</span>
                            </div>
                            <div id="imathMapFormList" class="ims-mapform-list">
                                <!-- Các dạng của MapID render tại đây -->
                            </div>
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
                                    <option value="M1">Nhận biết</option>
                                    <option value="M2">Thông hiểu</option>
                                    <option value="M3">Vận dụng</option>
                                    <option value="M4">Vận dụng cao</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div class="ims-search-wrap">
                                <i class="fa-solid fa-magnifying-glass"></i>
                                <input type="text" id="imathFilterKeyword" oninput="window.onIMathFilterChange('keyword')" placeholder="Tìm MapID, mã câu, từ khóa..." class="ims-input">
                            </div>
                        </div>

                        <label class="ims-tikz-toggle">
                            <input type="checkbox" id="imathFilterOnlyTikz" onchange="window.onIMathFilterChange('tikz')" style="width:14px;height:14px;accent-color:#4f46e5;cursor:pointer;">
                            <span>Chỉ hiện câu có hình vẽ TikZ</span>
                        </label>
                    </div>

                    <!-- Cột 2: Danh sách mẫu câu đổi số (Đã làm gọn & đồng bộ) -->
                    <div class="ims-col-topics">
                        <div class="ims-col-subheader">
                            <div class="ims-col-subheader-title">
                                <span>Danh sách mẫu câu (<span id="imathTopicCount">0</span>)</span>
                            </div>
                            <button type="button" onclick="window.generateRandomFromFilteredTopics(5)" class="ims-btn-add3" title="Sinh ngẫu nhiên 5 câu từ danh sách đang lọc">
                                <i class="fa-solid fa-shuffle"></i> +5 ngẫu nhiên
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
                                <span>Câu hỏi đã sinh (<span id="imathWorkspaceCount">0</span>)</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <button type="button" onclick="window.rerollAllWorkspaceQuestions()" class="ims-btn-add3" title="Đổi bộ số mới cho toàn bộ câu hỏi đang có">
                                    <i class="fa-solid fa-arrows-rotate"></i> Đổi số tất cả
                                </button>
                                <button type="button" onclick="window.clearIMathWorkspace()" class="ims-btn-add3" title="Xóa toàn bộ câu đang có">
                                    <i class="fa-regular fa-trash-can"></i> Xóa hết
                                </button>
                            </div>
                        </div>

                        <div id="imathWorkspaceList" class="ims-scroll-list">
                            <!-- Các câu hỏi đã sinh render tại đây -->
                        </div>

                        <!-- Thanh công cụ xuất / nạp dưới cùng -->
                        <div class="ims-footer">
                            <button type="button" onclick="window.downloadIMathWorkspaceTex()" class="ims-btn ims-btn-sec">
                                <i class="fa-solid fa-download"></i> Tải file .tex
                            </button>
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <button type="button" onclick="window.pushIMathWorkspaceToBank()" class="ims-btn ims-btn-bank" title="Đưa toàn bộ câu hỏi vào Ngân hàng câu hỏi R2">
                                    <i class="fa-solid fa-cloud-arrow-up"></i> Nạp vào Ngân hàng
                                </button>
                                <button type="button" id="btnIMathInsertToExam" onclick="window.insertIMathWorkspaceToExam()" class="ims-btn ims-btn-exam">
                                    <i class="fa-solid fa-plus"></i> Chèn vào Đề thi
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

    window.pingIMathLocalEngine = function () {
        checkLocalBridge(true).then(online => {
            if (online) notify('Đã kết nối Engine Python Local (http://127.0.0.1:8765)!', 'success');
            else notify('Đang sử dụng Kho dữ liệu chuẩn MapID trên Web (2.476 mẫu × 150 biến thể).', 'info');
        });
    };

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
    // 3. LOGIC LỌC THEO DẠNG MAPID & HIỂN THỊ DANH SÁCH (CỘT 1 & CỘT 2)
    // ------------------------------------------------------------------
    function matchesBaseScope(it) {
        if (state.filters.grade !== 'all' && it.grade !== state.filters.grade) return false;
        if (state.filters.subject !== 'all' && (it.subj_code || 'D') !== state.filters.subject) return false;
        return true;
    }

    function renderFilterControls() {
        const gradeBtns = document.querySelectorAll('#imathGradeButtons .ims-seg-btn');
        gradeBtns.forEach(btn => {
            const g = btn.getAttribute('data-grade');
            btn.classList.toggle('ims-active', g === state.filters.grade);
        });

        const subjBtns = document.querySelectorAll('#imathSubjectButtons .ims-seg-btn');
        subjBtns.forEach(btn => {
            const s = btn.getAttribute('data-subject');
            btn.classList.toggle('ims-active', s === state.filters.subject);
        });

        // 3. Chương học
        const chapSelect = document.getElementById('imathFilterChapter');
        if (chapSelect) {
            const chapters = [];
            for (const it of state.catalog) {
                if (matchesBaseScope(it)) {
                    if (!chapters.includes(it.chapter)) chapters.push(it.chapter);
                }
            }
            chapSelect.innerHTML = '<option value="all">Tất cả các chương (' + chapters.length + ')</option>' +
                chapters.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            chapSelect.value = chapters.includes(state.filters.chapter) ? state.filters.chapter : 'all';
            state.filters.chapter = chapSelect.value;
        }

        // 4. Bài học
        const lesSelect = document.getElementById('imathFilterLesson');
        if (lesSelect) {
            const lessons = [];
            for (const it of state.catalog) {
                if (matchesBaseScope(it) && (state.filters.chapter === 'all' || it.chapter === state.filters.chapter)) {
                    if (!lessons.includes(it.lesson)) lessons.push(it.lesson);
                }
            }
            lesSelect.innerHTML = '<option value="all">Tất cả các bài (' + lessons.length + ')</option>' +
                lessons.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
            lesSelect.value = lessons.includes(state.filters.lesson) ? state.filters.lesson : 'all';
            state.filters.lesson = lesSelect.value;
        }

        // 5. Danh sách Dạng toán theo MapID
        renderMapFormList();
    }

    function renderMapFormList() {
        const listEl = document.getElementById('imathMapFormList');
        const badgeEl = document.getElementById('imathMapFormCountBadge');
        if (!listEl) return;

        const formMap = new Map();
        let totalInScope = 0;

        for (const it of state.catalog) {
            if (!matchesBaseScope(it)) continue;
            if (state.filters.chapter !== 'all' && it.chapter !== state.filters.chapter) continue;
            if (state.filters.lesson !== 'all' && it.lesson !== state.filters.lesson) continue;
            totalInScope++;
            const fname = (it.form_name || '').trim();
            if (!fname) continue;
            formMap.set(fname, (formMap.get(fname) || 0) + 1);
        }

        const forms = Array.from(formMap.entries());
        if (badgeEl) badgeEl.textContent = `${forms.length} dạng`;

        if (!forms.some(([fname]) => fname === state.filters.mapForm)) {
            state.filters.mapForm = 'all';
        }

        let html = `
            <button type="button" onclick="window.setIMathMapForm('all')" class="ims-mapform-item ${state.filters.mapForm === 'all' ? 'ims-active' : ''}">
                <span>Tất cả các dạng trong mục đang chọn</span>
                <span class="ims-mapform-count">${totalInScope}</span>
            </button>
        `;

        html += forms.map(([fname, cnt]) => {
            const isActive = state.filters.mapForm === fname;
            return `
                <button type="button" data-mapform="${escapeHtml(fname)}" onclick="window.setIMathMapForm(this.getAttribute('data-mapform'))" class="ims-mapform-item ${isActive ? 'ims-active' : ''}">
                    <span style="flex:1;min-width:0;">${escapeHtml(fname)}</span>
                    <span class="ims-mapform-count">${cnt}</span>
                </button>
            `;
        }).join('');

        listEl.innerHTML = html;
    }

    function getFilteredTopics() {
        const kw = (state.filters.keyword || '').trim().toLowerCase();
        return state.catalog.filter(it => {
            const isDirectCodeSearch = kw && (kw.startsWith('l0') || kw.startsWith('hinh_') || /^[6-9][dhx][0-9]/i.test(kw));
            if (!isDirectCodeSearch) {
                if (!matchesBaseScope(it)) return false;
                if (state.filters.chapter !== 'all' && it.chapter !== state.filters.chapter) return false;
                if (state.filters.lesson !== 'all' && it.lesson !== state.filters.lesson) return false;
                if (state.filters.mapForm !== 'all' && it.form_name !== state.filters.mapForm) return false;
            }
            if (state.filters.category !== 'all' && it.category !== state.filters.category) return false;
            if (state.filters.level !== 'all' && it.level !== state.filters.level) return false;
            if (state.filters.onlyTikz && !it.has_tikz) return false;
            if (kw) {
                const hay = `${it.tag} ${it.map_id} ${it.tikz_group_id || ''} ${it.title} ${it.lesson} ${it.form_name || ''}`.toLowerCase();
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
                    <i class="fa-solid fa-magnifying-glass" style="font-size:24px;margin-bottom:8px;opacity:0.4;display:block;"></i>
                    <div>Không tìm thấy mẫu câu hỏi nào khớp bộ lọc.</div>
                </div>
            `;
            return;
        }

        const shown = filtered.slice(0, 150);
        listEl.innerHTML = shown.map(it => {
            const catShort = shortCategoryName(it.category);
            const tikzMeta = it.has_tikz
                ? `<span class="ims-meta-dot">•</span><span class="ims-meta-code" title="Nhóm hình TikZ"><i class="fa-solid fa-draw-polygon" style="font-size:9.5px;margin-right:2px;"></i>${escapeHtml(it.tikz_group_id || 'TikZ')}</span>`
                : '';

            return `
                <div class="ims-topic-card">
                    <div class="ims-topic-main">
                        <div class="ims-topic-title">${escapeHtml(it.title)}</div>
                        <div class="ims-topic-meta">
                            <span class="ims-meta-mapid" title="Mã MapID">${escapeHtml(it.map_id)}</span>
                            <span>${escapeHtml(catShort)} • ${escapeHtml(it.level_vi)}</span>
                            <span class="ims-meta-dot">•</span>
                            <span class="ims-meta-code" title="${escapeHtml(it.lesson)}">${escapeHtml(it.tag)}</span>
                            ${tikzMeta}
                        </div>
                    </div>
                    <div class="ims-topic-actions">
                        <button type="button" onclick="window.addIMathQuestion('${escapeHtml(it.tag)}', 1)" class="ims-btn-add1">+1</button>
                        <button type="button" onclick="window.addIMathQuestion('${escapeHtml(it.tag)}', 3)" class="ims-btn-add3" title="Sinh 3 câu đổi số">+3</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ------------------------------------------------------------------
    // 4. HIỂN THỊ PREVIEW TRỰC TIẾP (MATHJAX + TIKZJAX) Ở CỘT 3
    // ------------------------------------------------------------------
    function splitTabularCellsJs(row) {
        const cells = [];
        let cur = '';
        let braceDepth = 0;
        for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            if (ch === '\\' && i + 1 < row.length) {
                cur += ch + row[i + 1];
                i++;
                continue;
            }
            if (ch === '{') braceDepth++;
            else if (ch === '}' && braceDepth > 0) braceDepth--;
            if (ch === '&' && braceDepth === 0) {
                cells.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        cells.push(cur);
        return cells;
    }

    function escapeMathAndTextSegment(str) {
        if (!str) return '';
        const mathBlocks = [];
        const protectedStr = String(str).replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^\$\n]+?\$)/g, (m) => {
            const token = `___IMS_MATH_${mathBlocks.length}___`;
            mathBlocks.push(m.replace(/</g, ' &lt; ').replace(/>/g, ' &gt; '));
            return token;
        });
        let cleaned = protectedStr
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\\%/g, '%')
            .replace(/\\vdots(?![a-zA-Z])/g, '&#8942;')
            .replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>')
            .replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>')
            .replace(/\\rightarrow(?![a-zA-Z])/g, '→')
            .replace(/\\Rightarrow(?![a-zA-Z])/g, '⇒')
            .replace(/\\\\+\s*(\n|$)/g, '$1')
            .replace(/\\\\+/g, '<br>');
        for (let i = 0; i < mathBlocks.length; i++) {
            cleaned = cleaned.replace(`___IMS_MATH_${i}___`, () => mathBlocks[i]);
        }
        return cleaned;
    }

    let _imsTokenSeq = 0;

    function convertTabularBlocksJs(str, htmlBlocks, prefix) {
        if (!str || !str.includes('\\begin{tabular}')) return str;
        let out = '';
        let cursor = 0;
        const startToken = '\\begin{tabular}';
        const endToken = '\\end{tabular}';
        while (cursor < str.length) {
            const idx = str.indexOf(startToken, cursor);
            if (idx === -1) { out += str.slice(cursor); break; }
            let p = idx + startToken.length;
            while (p < str.length && /\s/.test(str[p])) p++;
            if (str[p] === '[') {
                const closeBracket = str.indexOf(']', p);
                if (closeBracket !== -1) {
                    p = closeBracket + 1;
                    while (p < str.length && /\s/.test(str[p])) p++;
                }
            }
            if (str[p] !== '{') {
                out += str.slice(cursor, idx + startToken.length);
                cursor = idx + startToken.length;
                continue;
            }
            let depth = 0;
            let specEnd = p;
            for (; specEnd < str.length; specEnd++) {
                if (str[specEnd] === '\\') { specEnd++; continue; }
                if (str[specEnd] === '{') depth++;
                else if (str[specEnd] === '}') { depth--; if (depth === 0) break; }
            }
            const closeIdx = depth === 0 ? str.indexOf(endToken, specEnd + 1) : -1;
            if (depth !== 0 || closeIdx === -1) {
                out += str.slice(cursor, idx + startToken.length);
                cursor = idx + startToken.length;
                continue;
            }
            out += str.slice(cursor, idx);
            const body = str.slice(specEnd + 1, closeIdx);
            const rows = body.split(/\\\\(?:\s*\[[^\]]*\])?/);
            let tableHtml = '<div style="margin:8px 0;width:100%;overflow-x:auto;"><table style="margin:0 auto;border-collapse:collapse;font-size:13px;min-width:max-content;">';
            let rIdx = 0;
            rows.forEach((row) => {
                const cleanRow = row
                    .replace(/\\(?:hline|toprule|midrule|bottomrule)\b/g, '')
                    .replace(/\\cline\s*\{[^}]*\}/g, '')
                    .replace(/\\centering\b/g, '')
                    .trim();
                if (!cleanRow) return;
                const cols = splitTabularCellsJs(cleanRow);
                tableHtml += `<tr style="background:${rIdx % 2 === 0 ? 'transparent' : 'rgba(148,163,184,0.06)'};">`;
                cols.forEach((rawCol, cIdx) => {
                    let cell = rawCol.trim();
                    if (!cell || cell === '$$') {
                        cell = '&nbsp;';
                    } else {
                        cell = escapeMathAndTextSegment(cell);
                    }
                    const tag = rIdx === 0 ? 'th' : 'td';
                    const bg = rIdx === 0 ? 'background:rgba(99,102,241,0.08);font-weight:600;' : (cIdx === 0 ? 'font-weight:500;' : '');
                    tableHtml += `<${tag} style="border:1px solid rgba(148,163,184,0.45);padding:6px 10px;text-align:center;${bg}">${cell}</${tag}>`;
                });
                tableHtml += '</tr>';
                rIdx++;
            });
            tableHtml += '</table></div>';
            const tok = `${prefix}${htmlBlocks.length}___`;
            htmlBlocks.push(tableHtml);
            out += tok;
            cursor = closeIdx + endToken.length;
        }
        return out;
    }

    function cleanLineBreaksOutsideMath(str) {
        if (!str) return '';
        const prefix = `___IMS_H${++_imsTokenSeq}_`;
        const htmlBlocks = [];
        // 1. Bảo vệ các block .tikz-container (chứa <script type="text/tikz">...</script>) khỏi mọi bước dọn dẹp text
        let s = String(str).replace(/<div class="tikz-container"[\s\S]*?<\/script><\/div>/g, (m) => {
            const tok = `${prefix}${htmlBlocks.length}___`;
            htmlBlocks.push(m);
            return tok;
        });

        // 2. Bỏ lệnh căn chỉnh / chú thích LaTeX không dùng khi hiển thị web
        s = s
            .replace(/\\begin\{table\}(?:\[[^\]]*\])?/g, '')
            .replace(/\\end\{table\}/g, '')
            .replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
            .replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, '')
            .replace(/\\setlength\s*\{[^}]*\}\s*\{[^}]*\}/g, '')
            .replace(/\\centering\b/g, '')
            .replace(/\\(h|v)space\*?\{[^}]*\}/g, '')
            .replace(/\\(no)?indent\b/g, '')
            .replace(/((?:^|[^\\])(?:\\\\)*)%(?![0-9A-Fa-f]{2}\b)[^\r\n]*/g, '$1');

        // 3. Chuyển đổi \shortans, \begin{tabular}, \begin{center}, \begin{itemchoice}, \begin{itemize} thành HTML token
        s = s.replace(/\\shortans(?:\[[^\]]*\])?\{([^{}]*)\}/g, (_, ans) => {
            const tok = `${prefix}${htmlBlocks.length}___`;
            htmlBlocks.push(`<div style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.35);color:#10b981;font-size:12px;font-weight:600;">Đáp án: <span style="font-family:monospace;">${escapeHtml(ans || '(Trống)')}</span></div>`);
            return tok;
        });

        s = convertTabularBlocksJs(s, htmlBlocks, prefix);

        s = s.replace(/\\begin\{center\}\s*(\\\\)?/g, () => {
            const tok = `${prefix}${htmlBlocks.length}___`;
            htmlBlocks.push('<div style="text-align:center;">');
            return tok;
        }).replace(/\\end\{center\s*\}/g, () => {
            const tok = `${prefix}${htmlBlocks.length}___`;
            htmlBlocks.push('</div>');
            return tok;
        });

        s = s.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/g, (_, body) => {
            const items = body.split(/\\itemch\b/g).map(x => x.trim()).filter(Boolean);
            const itemsHtml = items.map((item, idx) => {
                const label = String.fromCharCode(97 + idx) + ')';
                return `<div style="margin:4px 0;"><strong style="color:#4f46e5;">${label}</strong> ${cleanLineBreaksOutsideMath(item)}</div>`;
            }).join('');
            const tok = `${prefix}${htmlBlocks.length}___`;
            htmlBlocks.push(`<div style="margin-top:4px;">${itemsHtml}</div>`);
            return tok;
        });

        s = s.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, body) => {
            const items = body.split(/\\item\b/g).map(x => x.trim()).filter(Boolean);
            const itemsHtml = items.map(item => `<li>${cleanLineBreaksOutsideMath(item)}</li>`).join('');
            const tok = `${prefix}${htmlBlocks.length}___`;
            htmlBlocks.push(`<ul style="margin:4px 0 4px 18px;padding:0;">${itemsHtml}</ul>`);
            return tok;
        });

        // 4. Escape < > an toàn cả trong lẫn ngoài công thức toán, giữ nguyên dòng
        let cleaned = escapeMathAndTextSegment(s);

        // 5. Khôi phục toàn bộ HTML / TikZ blocks
        for (let i = 0; i < htmlBlocks.length; i++) {
            cleaned = cleaned.replace(`${prefix}${i}___`, () => htmlBlocks[i]);
        }
        return cleaned;
    }

    function renderTikzContainersInHtml(htmlText) {
        if (!htmlText) return '';
        let res = htmlText;
        // 1. Gỡ wrapper \begin{center} quanh TikZ trước để tránh bị bọc 2 lần
        res = res.replace(/\\begin\{center\}\s*((?:\\(?:definecolor|colorlet|usetikzlibrary|tikzset|pgfplotsset)[^\n]*\n\s*)*\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\\end\{center\s*\}/g, '$1');
        // 2. Bọc khối TikZ duy nhất 1 lần vào thẻ <script type="text/tikz">
        res = res.replace(/((?:\\(?:definecolor|colorlet|usetikzlibrary|tikzset|pgfplotsset)[^\n]*\n\s*)*\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/g, (tikz) => {
            return `<div class="tikz-container" style="margin:10px 0;display:flex;justify-content:center;background:#ffffff;border-radius:10px;padding:10px;border:1px solid #e2e8f0;overflow-x:auto;"><script type="text/tikz">${tikz.trim()}<\/script></div>`;
        });
        return res;
    }

    function unwrapImminiJs(str) {
        if (!str || !str.includes('\\immini')) return str;
        let s = str;
        let guard = 0;
        while (s.includes('\\immini') && guard < 10) {
            guard++;
            const m = s.match(/\\immini(?:\[[^\]]*\])?\s*\{/);
            if (!m) break;
            const open1 = m.index + m[0].length - 1;
            let depth = 0;
            let close1 = -1;
            for (let i = open1; i < s.length; i++) {
                if (s[i] === '{' && (i === 0 || s[i - 1] !== '\\')) depth++;
                else if (s[i] === '}' && (i === 0 || s[i - 1] !== '\\')) {
                    depth--;
                    if (depth === 0) {
                        close1 = i;
                        break;
                    }
                }
            }
            if (close1 === -1) break;
            const open2 = s.indexOf('{', close1);
            if (open2 === -1) break;
            let close2 = -1;
            depth = 0;
            for (let i = open2; i < s.length; i++) {
                if (s[i] === '{' && (i === 0 || s[i - 1] !== '\\')) depth++;
                else if (s[i] === '}' && (i === 0 || s[i - 1] !== '\\')) {
                    depth--;
                    if (depth === 0) {
                        close2 = i;
                        break;
                    }
                }
            }
            if (close2 === -1) break;
            const stemPart = s.slice(open1 + 1, close1).trim();
            const tikzPart = s.slice(open2 + 1, close2).trim();
            s = s.slice(0, m.index) + stemPart + '\n' + tikzPart + '\n' + s.slice(close2 + 1);
        }
        return s;
    }

    function formatLatexPreviewHtml(latexBlock) {
        if (!latexBlock) return '';
        let s = String(latexBlock)
            .replace(/^\\begin\{ex\}(?:\s*%\[[^\]]*\])?\s*/i, '')
            .replace(/\\end\{ex\}\s*$/i, '');

        // 1. Bóc tách và xử lý khối Lời giải chi tiết \loigiai{...}
        let solutionHtml = '';
        const lgIdx = s.indexOf('\\loigiai');
        if (lgIdx !== -1) {
            const openBrace = s.indexOf('{', lgIdx);
            if (openBrace !== -1) {
                let depth = 0;
                let closeBrace = -1;
                for (let i = openBrace; i < s.length; i++) {
                    if (s[i] === '{' && (i === 0 || s[i - 1] !== '\\')) depth++;
                    else if (s[i] === '}' && (i === 0 || s[i - 1] !== '\\')) {
                        depth--;
                        if (depth === 0) {
                            closeBrace = i;
                            break;
                        }
                    }
                }
                let solContent = closeBrace !== -1 ? s.slice(openBrace + 1, closeBrace) : s.slice(openBrace + 1);
                // Bổ sung các nội dung (hình vẽ TikZ, bảng biểu) bị đặt sau \loigiai nếu có
                if (closeBrace !== -1) {
                    const extra = s.slice(closeBrace + 1).trim();
                    if (extra) {
                        solContent += '\n' + extra.replace(/^\\\\+\s*/, '').replace(/\}\s*$/, '');
                    }
                }
                s = s.slice(0, lgIdx).trim();

                // Dọn dẹp hình TikZ, bảng, ký tự < > và xuống dòng trong lời giải
                let cleanSol = renderTikzContainersInHtml(solContent);
                cleanSol = cleanLineBreaksOutsideMath(cleanSol);

                solutionHtml = `
                    <details style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(148,163,184,0.3);font-size:12.5px;">
                        <summary style="font-weight:600;color:#64748b;cursor:pointer;user-select:none;">Xem lời giải chi tiết</summary>
                        <div style="margin-top:6px;padding-left:10px;border-left:2px solid #6366f1;white-space:pre-line;">${cleanSol}</div>
                    </details>
                `;
            }
        }

        // 2. Mở gói \immini[thm]{stem}{tikz} ở phần đề bài nếu có
        s = unwrapImminiJs(s);

        // 3. Render các hình vẽ TikZ còn lại ở phần đề bài
        s = renderTikzContainersInHtml(s);

        // 4. Chuẩn hóa hiển thị lựa chọn \choice hoặc \choiceTF (giữ cả hình TikZ/phần còn lại sau \choice!)
        let hasChoices = false;
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
                hasChoices = true;
                const trailingRaw = s.slice(cursor).trim();
                const trailingTikz = [];
                const trailingRest = trailingRaw.replace(/<div class="tikz-container"[\s\S]*?<\/script><\/div>/g, (m) => {
                    trailingTikz.push(m);
                    return '';
                }).trim();
                const gridClass = cmd === '\\choice' ? 'ims-choices-grid' : 'ims-choices-tf';
                const optsHtml = opts.map((opt, idx) => {
                    const isTrue = opt.includes('\\True');
                    const cleanOpt = cleanLineBreaksOutsideMath(opt.replace(/\\True\s*/g, '').trim());
                    return `<div class="ims-choice-item ${isTrue ? 'ims-choice-true' : ''}">
                        <span style="font-weight:700;opacity:0.75;">${labels[idx]}</span>
                        <div style="flex:1;">${cleanOpt}</div>
                        ${isTrue ? '<i class="fa-solid fa-check" style="color:#10b981;font-size:12px;margin-top:3px;" title="Đáp án đúng"></i>' : ''}
                    </div>`;
                }).join('');
                const cleanStem = cleanLineBreaksOutsideMath(stem);
                const extraTrailHtml = trailingRest ? `<div style="margin-top:6px;">${cleanLineBreaksOutsideMath(trailingRest)}</div>` : '';
                s = `<div style="white-space:pre-line;">${cleanStem}</div>${trailingTikz.join('')}<div class="${gridClass}">${optsHtml}</div>${extraTrailHtml}`;
                break;
            }
        }

        if (!hasChoices) {
            s = cleanLineBreaksOutsideMath(s);
            s = `<div style="white-space:pre-line;">${s}</div>`;
        }

        return `<div>${s}${solutionHtml}</div>`;
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
                    <div style="width:48px;height:48px;border-radius:12px;background:rgba(148,163,184,0.12);display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:10px;color:#64748b;">
                        <i class="fa-solid fa-layer-group"></i>
                    </div>
                    <div style="font-weight:600;color:#64748b;font-size:13.5px;margin-bottom:4px;">Chưa có câu hỏi nào được sinh</div>
                    <div style="max-width:280px;line-height:1.5;opacity:0.85;">Chọn dạng toán theo MapID ở cột trái rồi bấm <b>+1</b> hoặc <b>+3</b> để tạo câu hỏi đổi số.</div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = state.workspaceQuestions.map((q, idx) => `
            <div class="ims-q-card">
                <div class="ims-q-card-hdr">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="padding:2px 8px;border-radius:5px;background:#4f46e5;color:#fff;font-weight:700;font-size:11px;">Câu ${idx + 1}</span>
                        <span class="ims-meta-mapid" title="Mã câu iMath">${escapeHtml(q.tag)}</span>
                        ${q.tikz_group_id ? `<span class="ims-meta-mapid" title="Mã hình TikZ">${escapeHtml(q.tikz_group_id)}</span>` : ''}
                        <div style="display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:5px;border:1px solid rgba(148,163,184,0.35);">
                            <span style="font-size:10.5px;color:#64748b;">MapID:</span>
                            <input type="text" value="${escapeHtml(q.map_id)}" onchange="window.updateIMathQuestionMapId(${idx}, this.value)" style="width:74px;font-size:11px;font-family:monospace;font-weight:700;color:inherit;background:transparent;border:none;outline:none;" title="Chỉnh sửa mã MapID">
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px;">
                        <button type="button" onclick="window.rerollSingleWorkspaceQuestion(${idx})" class="ims-btn-add3" title="Sinh bộ số khác cho câu này">
                            <i class="fa-solid fa-arrows-rotate"></i> Đổi số
                        </button>
                        <button type="button" onclick="window.toggleIMathQuestionCode(${idx})" class="ims-btn-add3" title="Xem / Sửa mã LaTeX">
                            <i class="fa-solid fa-code"></i> LaTeX
                        </button>
                        <button type="button" onclick="window.removeIMathWorkspaceQuestion(${idx})" class="ims-btn-add3" title="Xóa câu này">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <div class="ims-q-body" id="imathPreviewCard_${idx}">
                    ${formatLatexPreviewHtml(q.latex_mc)}
                </div>

                <div id="imathCodeDrawer_${idx}" style="display:${q.showCode ? 'block' : 'none'};padding:12px;background:#0f172a;color:#f8fafc;border-top:1px solid #1e293b;">
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;margin-bottom:6px;">
                        <span style="font-weight:600;color:#94a3b8;">Mã LaTeX ex_test (${escapeHtml(q.tag)}):</span>
                        <span style="color:#64748b;">Tự động cập nhật khi sửa</span>
                    </div>
                    <textarea rows="7" onchange="window.updateIMathQuestionLatex(${idx}, this.value)" style="width:100%;padding:10px;border-radius:8px;background:#020617;color:#e2e8f0;font-family:monospace;font-size:12px;border:1px solid #334155;outline:none;box-sizing:border-box;">${escapeHtml(q.latex_mc)}</textarea>
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

            checkLocalBridge(false).catch(() => {});
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
        state.filters.mapForm = 'all';
        renderFilterControls();
        renderTopicList();
    };

    window.setIMathSubject = function (subj) {
        state.filters.subject = subj;
        state.filters.chapter = 'all';
        state.filters.lesson = 'all';
        state.filters.mapForm = 'all';
        renderFilterControls();
        renderTopicList();
    };

    window.setIMathMapForm = function (formName) {
        state.filters.mapForm = formName || 'all';
        renderMapFormList();
        renderTopicList();
    };

    window.onIMathFilterChange = function (field) {
        if (field === 'chapter') {
            state.filters.chapter = document.getElementById('imathFilterChapter')?.value || 'all';
            state.filters.lesson = 'all';
            state.filters.mapForm = 'all';
            renderFilterControls();
        } else if (field === 'lesson') {
            state.filters.lesson = document.getElementById('imathFilterLesson')?.value || 'all';
            state.filters.mapForm = 'all';
            renderMapFormList();
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
            subject: 'all',
            chapter: 'all',
            lesson: 'all',
            mapForm: 'all',
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
            notify(`Đã sinh ${items.length} câu hỏi đổi số ([${tag}])`, 'success');
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
                notify(`Đã đổi bộ số mới cho Câu ${idx + 1}`, 'success');
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
            notify(`Đã đổi bộ số mới cho ${state.workspaceQuestions.length} câu hỏi!`, 'success');
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
        const combinedTex = state.workspaceQuestions
            .map(q => q.latex_mc || q.latex || '')
            .filter(Boolean)
            .join('\n\n');
        if (!combinedTex) {
            notify('Không có nội dung LaTeX hợp lệ để chèn!', 'warning');
            return;
        }
        if (typeof window.parseLatexContent === 'function') {
            window.closeIMathStudioModal();
            window.parseLatexContent(combinedTex);
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
            notify(`Đã chuyển ${state.workspaceQuestions.length} câu hỏi đổi số sang Hàng đợi Nạp Ngân hàng!`, 'success');
            return;
        }

        if (typeof window.parseLatexContent === 'function') {
            window.parseLatexContent(combinedTex);
            window.closeIMathStudioModal();
            if (typeof window.saveCurrentQuestionsToBank === 'function') {
                setTimeout(() => window.saveCurrentQuestionsToBank(), 300);
            } else {
                notify(`Đã chèn ${state.workspaceQuestions.length} câu vào đề thi. Bấm "Lưu Bank" để đồng bộ lên R2!`, 'success');
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
            btn.title = 'Mở Xưởng Tạo Câu Hỏi Theo Dạng (Đổi số chuẩn MapID)';
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
