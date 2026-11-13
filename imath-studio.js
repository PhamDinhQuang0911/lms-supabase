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
    const DATA_VERSION = '20261113-v4';
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
        previewIndexByTag: {}, // { tag: 0-based active sample index }
        matrixExpanded: false,
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
                width: calc(100vw - 24px) !important;
                max-width: 1860px !important;
                height: calc(100vh - 20px) !important;
                max-height: 1120px !important;
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
                grid-template-columns: 310px 390px 1fr !important;
                overflow: hidden !important;
            }
            @media (max-width: 1440px) and (min-width: 1025px) {
                .ims-body {
                    grid-template-columns: 280px 345px 1fr !important;
                }
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
                overflow-wrap: anywhere !important;
                word-break: break-word !important;
                min-width: 0 !important;
            }
            .ims-q-body .tikz-container {
                max-width: 100% !important;
                overflow-x: auto !important;
            }
            .ims-q-body .tikz-container svg {
                max-width: 100% !important;
                height: auto !important;
            }
            .ims-q-body mjx-container {
                max-width: 100% !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
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
            .ims-btn-word {
                background: #0284c7 !important;
                color: #ffffff !important;
            }
            .ims-btn-word:hover {
                background: #0369a1 !important;
            }
            .ims-topic-selected-badge {
                display: inline-flex !important;
                align-items: center !important;
                gap: 3px !important;
                padding: 1px 6px !important;
                border-radius: 999px !important;
                background: rgba(79, 70, 229, 0.12) !important;
                color: #4338ca !important;
                border: 1px solid rgba(79, 70, 229, 0.28) !important;
                font-size: 10.5px !important;
                font-weight: 700 !important;
            }
            html.dark .ims-topic-selected-badge {
                background: rgba(99, 102, 241, 0.2) !important;
                color: #c7d2fe !important;
                border-color: rgba(129, 140, 248, 0.35) !important;
            }
            .ims-stats-summary {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                flex-wrap: wrap !important;
            }
            .ims-stats-kpis {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                flex-wrap: wrap !important;
            }
            .ims-stat-kpi {
                display: inline-flex !important;
                align-items: center !important;
                gap: 4px !important;
                padding: 3px 9px !important;
                border-radius: 999px !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                border: 1px solid #cbd5e1 !important;
                background: #ffffff !important;
                color: #334155 !important;
            }
            html.dark .ims-stat-kpi {
                background: #1c2030 !important;
                border-color: #313752 !important;
                color: #cbd5e1 !important;
            }
            .ims-stat-kpi.kpi-total {
                background: #eef2ff !important;
                border-color: #c7d2fe !important;
                color: #3730a3 !important;
            }
            html.dark .ims-stat-kpi.kpi-total {
                background: rgba(79, 70, 229, 0.22) !important;
                border-color: rgba(129, 140, 248, 0.4) !important;
                color: #c7d2fe !important;
            }
            .ims-stat-kpi.kpi-tn {
                background: #eff6ff !important;
                border-color: #bfdbfe !important;
                color: #1d4ed8 !important;
            }
            .ims-stat-kpi.kpi-ds {
                background: #ecfdf5 !important;
                border-color: #a7f3d0 !important;
                color: #047857 !important;
            }
            .ims-stat-kpi.kpi-tln {
                background: #fff7ed !important;
                border-color: #fed7aa !important;
                color: #c2410c !important;
            }
            .ims-stat-kpi.kpi-tl {
                background: #f5f3ff !important;
                border-color: #ddd6fe !important;
                color: #6d28d9 !important;
            }
            html.dark .ims-stat-kpi.kpi-tn { background: rgba(59,130,246,0.16) !important; border-color: rgba(59,130,246,0.35) !important; color: #93c5fd !important; }
            html.dark .ims-stat-kpi.kpi-ds { background: rgba(16,185,129,0.16) !important; border-color: rgba(16,185,129,0.35) !important; color: #6ee7b7 !important; }
            html.dark .ims-stat-kpi.kpi-tln { background: rgba(249,115,22,0.16) !important; border-color: rgba(249,115,22,0.35) !important; color: #fdba74 !important; }
            html.dark .ims-stat-kpi.kpi-tl { background: rgba(139,92,246,0.16) !important; border-color: rgba(139,92,246,0.35) !important; color: #c4b5fd !important; }
            .ims-stats-tag-pills {
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 5px !important;
                margin-top: 7px !important;
                max-height: 76px !important;
                overflow-y: auto !important;
            }
            .ims-stats-tag-chip {
                display: inline-flex !important;
                align-items: center !important;
                gap: 4px !important;
                padding: 2px 8px !important;
                border-radius: 6px !important;
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
                font-size: 10.5px !important;
                font-weight: 600 !important;
                color: #334155 !important;
                cursor: pointer !important;
                transition: all 0.12s ease !important;
            }
            .ims-stats-tag-chip:hover {
                border-color: #6366f1 !important;
                color: #4f46e5 !important;
            }
            html.dark .ims-stats-tag-chip {
                background: #1c2030 !important;
                border-color: #313752 !important;
                color: #cbd5e1 !important;
            }
            .ims-card-qty-box {
                display: inline-flex !important;
                align-items: center !important;
                gap: 3px !important;
                padding: 2px 4px !important;
                border-radius: 8px !important;
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
            }
            html.dark .ims-card-qty-box {
                background: #141724 !important;
                border-color: #313752 !important;
            }
            .ims-card-qty-label {
                font-size: 10px !important;
                font-weight: 700 !important;
                color: #64748b !important;
                padding: 0 3px !important;
                white-space: nowrap !important;
            }
            .ims-card-var-nav {
                display: inline-flex !important;
                align-items: center !important;
                gap: 2px !important;
                padding: 2px 4px !important;
                border-radius: 7px !important;
                background: #eef2ff !important;
                border: 1px solid #c7d2fe !important;
                font-size: 10.5px !important;
                font-weight: 700 !important;
                color: #3730a3 !important;
            }
            html.dark .ims-card-var-nav {
                background: rgba(79, 70, 229, 0.2) !important;
                border-color: rgba(129, 140, 248, 0.4) !important;
                color: #c7d2fe !important;
            }
            .ims-var-btn {
                width: 19px !important;
                height: 19px !important;
                border-radius: 5px !important;
                border: none !important;
                background: transparent !important;
                color: inherit !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 10px !important;
            }
            .ims-var-btn:hover {
                background: rgba(79, 70, 229, 0.14) !important;
            }
            .ims-preview-hint {
                margin-bottom: 8px !important;
                padding: 4px 10px !important;
                border-radius: 7px !important;
                background: #f8fafc !important;
                border: 1px dashed #cbd5e1 !important;
                font-size: 11px !important;
                color: #475569 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                flex-wrap: wrap !important;
            }
            html.dark .ims-preview-hint {
                background: #131622 !important;
                border-color: #2b3048 !important;
                color: #94a3b8 !important;
            }
            .ims-quota-pill {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                background: rgba(16, 185, 129, 0.12);
                color: #059669;
                border: 1px solid rgba(16, 185, 129, 0.35);
                white-space: nowrap;
            }
            .ims-quota-pill.ims-quota-warn {
                background: rgba(245, 158, 11, 0.12);
                color: #d97706;
                border-color: rgba(245, 158, 11, 0.35);
            }
            .ims-quota-pill.ims-quota-zero {
                background: rgba(239, 68, 68, 0.12);
                color: #dc2626;
                border-color: rgba(239, 68, 68, 0.35);
            }
            .ims-matrix-panel {
                border-bottom: 1px solid rgba(148, 163, 184, 0.25);
                background: rgba(248, 250, 252, 0.72);
                padding: 8px 14px;
                flex-shrink: 0;
            }
            html.dark .ims-matrix-panel,
            .dark .ims-matrix-panel {
                background: rgba(15, 23, 42, 0.55);
            }
            .ims-matrix-hdr {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                flex-wrap: wrap;
                font-size: 11.5px;
                font-weight: 700;
            }
            .ims-matrix-stats {
                display: flex;
                align-items: center;
                gap: 5px;
                flex-wrap: wrap;
            }
            .ims-stat-chip {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                padding: 2px 7px;
                border-radius: 999px;
                font-size: 10.5px;
                font-weight: 700;
                border: 1px solid transparent;
            }
            .ims-stat-tn { background: rgba(79,70,229,0.12); color: #4f46e5; border-color: rgba(79,70,229,0.28); }
            .ims-stat-ds { background: rgba(16,185,129,0.12); color: #059669; border-color: rgba(16,185,129,0.28); }
            .ims-stat-tln { background: rgba(245,158,11,0.12); color: #d97706; border-color: rgba(245,158,11,0.28); }
            .ims-stat-tl { background: rgba(100,116,139,0.14); color: #475569; border-color: rgba(100,116,139,0.28); }
            .ims-matrix-rows {
                margin-top: 7px;
                max-height: 146px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 5px;
                padding-right: 2px;
            }
            .ims-matrix-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 5px 8px;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.85);
                border: 1px solid rgba(148, 163, 184, 0.25);
                font-size: 11.5px;
            }
            html.dark .ims-matrix-row,
            .dark .ims-matrix-row {
                background: rgba(30, 41, 59, 0.85);
            }
            .ims-matrix-row-info {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
                flex: 1;
            }
            .ims-matrix-row-title {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-weight: 600;
                opacity: 0.9;
            }
            .ims-matrix-stepper {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                flex-shrink: 0;
            }
            .ims-step-btn {
                width: 22px;
                height: 22px;
                border-radius: 6px;
                border: 1px solid rgba(148, 163, 184, 0.4);
                background: transparent;
                color: inherit;
                font-weight: 800;
                font-size: 12px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
            }
            .ims-step-btn:hover {
                background: rgba(79, 70, 229, 0.14);
                border-color: #4f46e5;
                color: #4f46e5;
            }
            .ims-step-input {
                width: 38px;
                height: 22px;
                text-align: center;
                border-radius: 6px;
                border: 1px solid rgba(148, 163, 184, 0.4);
                background: transparent;
                color: inherit;
                font-size: 11.5px;
                font-weight: 700;
                outline: none;
            }

            @media (max-width: 1024px) {
                .ims-header {
                    flex-wrap: wrap !important;
                    padding: 10px 14px !important;
                    gap: 8px !important;
                }
                .ims-header-left {
                    min-width: 240px !important;
                }
                .ims-header-actions {
                    margin-left: auto !important;
                    flex-wrap: wrap !important;
                    justify-content: flex-end !important;
                }
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
                #imathStudioModal.ims-overlay {
                    padding: 0 !important;
                }
                .ims-dialog {
                    width: 100vw !important;
                    max-width: 100vw !important;
                    height: 100vh !important;
                    height: 100dvh !important;
                    max-height: 100vh !important;
                    max-height: 100dvh !important;
                    border-radius: 0 !important;
                    border: none !important;
                }
                .ims-header {
                    position: relative !important;
                    flex-direction: column !important;
                    align-items: stretch !important;
                    padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 9px 12px !important;
                    gap: 7px !important;
                }
                .ims-header-left {
                    width: 100% !important;
                    min-width: 0 !important;
                    flex: none !important;
                    padding-right: 40px !important;
                    gap: 10px !important;
                    align-items: center !important;
                    box-sizing: border-box !important;
                }
                .ims-header-icon {
                    width: 32px !important;
                    height: 32px !important;
                    border-radius: 9px !important;
                    font-size: 14px !important;
                }
                .ims-header-title-row {
                    gap: 4px 6px !important;
                }
                .ims-header-title {
                    font-size: 13.5px !important;
                    line-height: 1.3 !important;
                    white-space: normal !important;
                    word-break: normal !important;
                }
                .ims-header-sub {
                    display: none !important;
                }
                .ims-status-badge {
                    font-size: 10.5px !important;
                    padding: 2px 7px !important;
                    white-space: nowrap !important;
                    max-width: 100% !important;
                }
                .ims-header-actions {
                    width: 100% !important;
                    margin-left: 0 !important;
                    justify-content: flex-start !important;
                    flex-wrap: wrap !important;
                    gap: 6px !important;
                }
                .ims-close-btn {
                    position: absolute !important;
                    top: calc(10px + env(safe-area-inset-top, 0px)) !important;
                    right: 12px !important;
                    width: 32px !important;
                    height: 32px !important;
                    z-index: 2 !important;
                }
                .ims-hdr-btn-pdf {
                    padding: 4px 8px !important;
                    font-size: 11px !important;
                    border-radius: 7px !important;
                }
                .ims-quota-pill {
                    font-size: 10.5px !important;
                    padding: 3px 9px !important;
                    max-width: 100% !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                }
                .ims-mobile-tabs {
                    padding: 6px 8px !important;
                    gap: 5px !important;
                }
                .ims-mobile-tab-btn {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 4px !important;
                    padding: 7px 6px !important;
                    font-size: 11.5px !important;
                    white-space: nowrap !important;
                    min-width: 0 !important;
                }
                .ims-col-filter {
                    padding: 10px 12px 16px !important;
                    gap: 9px !important;
                }
                .ims-seg-btn {
                    font-size: 11px !important;
                    padding: 6px 3px !important;
                }
                .ims-mapform-box {
                    min-height: 170px !important;
                    max-height: 260px !important;
                }
                .ims-col-subheader {
                    padding: 8px 10px !important;
                    flex-wrap: wrap !important;
                    gap: 6px !important;
                }
                .ims-scroll-list {
                    padding: 8px 10px !important;
                    gap: 8px !important;
                }
                .ims-topic-card {
                    padding: 10px !important;
                    gap: 8px !important;
                }
                .ims-matrix-panel {
                    padding: 8px 10px !important;
                }
                .ims-matrix-rows {
                    max-height: 112px !important;
                }
                .ims-matrix-row {
                    flex-wrap: wrap !important;
                    gap: 6px !important;
                    padding: 6px 8px !important;
                }
                .ims-matrix-row-info {
                    width: 100% !important;
                }
                .ims-matrix-stepper {
                    margin-left: auto !important;
                }
                .ims-q-card-hdr {
                    padding: 8px 10px !important;
                    gap: 6px !important;
                }
                .ims-q-body {
                    padding: 11px 10px !important;
                    font-size: 13px !important;
                }
                .ims-choices-grid {
                    grid-template-columns: 1fr !important;
                    gap: 6px !important;
                }
                .ims-footer {
                    padding: 8px 10px calc(10px + env(safe-area-inset-bottom, 0px)) !important;
                    display: flex !important;
                    flex-wrap: wrap !important;
                    gap: 6px !important;
                    justify-content: stretch !important;
                }
                .ims-footer-actions {
                    display: contents !important;
                }
                .ims-footer .ims-btn {
                    flex: 1 1 calc(50% - 4px) !important;
                    min-width: 135px !important;
                    justify-content: center !important;
                    text-align: center !important;
                    padding: 8px 8px !important;
                    font-size: 11.5px !important;
                    white-space: nowrap !important;
                }
            }
            .ims-role-hidden {
                display: none !important;
            }
            .ims-footer-actions {
                margin-left: auto !important;
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
                        <span id="imathQuotaPill" class="ims-quota-pill" style="display:none;" title="Hạn mức tạo & tải đề trong tháng"></span>
                        <a href="data/imath/So_Sanh_Hinh_Thuc_Te_Cu_Va_Moi.pdf" target="_blank" class="ims-hdr-btn ims-hdr-btn-pdf ims-super-only" style="border-color:#10b981;color:#10b981;background:rgba(16,185,129,0.08);" title="Xem bảng so sánh đối chiếu hình vẽ thực tế cũ và hình TikZ chuẩn mới">
                            <i class="fa-solid fa-file-circle-check"></i>
                            <span>So Sánh TikZ Mới</span>
                        </a>
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.pdf" target="_blank" class="ims-hdr-btn ims-hdr-btn-pdf ims-super-only" title="Mở bảng PDF thống kê 456 câu hỏi có hình vẽ TikZ kèm mã định danh">
                            <i class="fa-regular fa-file-pdf"></i>
                            <span>Bảng PDF 456 Hình</span>
                        </a>
                        <a href="data/imath/Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" download="Bang_Thong_Ke_460_Cau_Hoi_Co_Hinh_TikZ.tex" class="ims-hdr-btn ims-hdr-btn-tex ims-super-only" title="Tải file mã nguồn .tex của 456 câu có hình TikZ">
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
                        <i class="fa-solid fa-filter"></i> <span>Bộ lọc MapID</span>
                    </button>
                    <button type="button" onclick="window.setIMathMobileTab('topics')" id="imsMobileTab_topics" class="ims-mobile-tab-btn ims-tab-active">
                        <i class="fa-solid fa-layer-group"></i> <span>Dạng câu (<span id="imathMobileTopicCount">0</span>)</span>
                    </button>
                    <button type="button" onclick="window.setIMathMobileTab('workspace')" id="imsMobileTab_workspace" class="ims-mobile-tab-btn">
                        <i class="fa-solid fa-list-check"></i> <span>Đã sinh (<span id="imathMobileWorkspaceCount">0</span>)</span>
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

                        <div id="imathMatrixPanel" class="ims-matrix-panel">
                            <!-- Ma trận dạng đã chọn & thống kê TN - ĐS - TLN -->
                        </div>

                        <div id="imathWorkspaceList" class="ims-scroll-list">
                            <!-- Các câu hỏi đã sinh render tại đây -->
                        </div>

                        <!-- Thanh công cụ xuất / nạp dưới cùng -->
                        <div class="ims-footer">
                            <button type="button" id="btnIMathDownloadTex" onclick="window.downloadIMathWorkspaceTex()" class="ims-btn ims-btn-sec ims-role-hidden">
                                <i class="fa-solid fa-download"></i> Tải file .tex
                            </button>
                            <div class="ims-footer-actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <button type="button" id="btnIMathPushBank" onclick="window.pushIMathWorkspaceToBank()" class="ims-btn ims-btn-bank" title="Đưa toàn bộ câu hỏi vào Ngân hàng câu hỏi R2">
                                    <i class="fa-solid fa-cloud-arrow-up"></i> Nạp vào Ngân hàng
                                </button>
                                <button type="button" id="btnIMathToOnlineExam" onclick="window.exportIMathToOnlineExam()" class="ims-btn ims-btn-exam" title="Đưa toàn bộ câu hỏi sang Trình tạo đề online (exam-editor.html)">
                                    <i class="fa-solid fa-paper-plane"></i> Đưa sang tạo đề online
                                </button>
                                <button type="button" id="btnIMathToWordMathType" onclick="window.exportIMathToWordMathType()" class="ims-btn ims-btn-word" title="Cấu hình tiêu đề, định dạng và xuất file Word MathType (.docx)">
                                    <i class="fa-solid fa-file-word"></i> Xuất file Word MathType
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        if (!window._imsQuotaListenerBound) {
            window._imsQuotaListenerBound = true;
            window.addEventListener('qmath-quota-updated', function () {
                if (typeof window.refreshIMathRoleVisibility === 'function') {
                    window.refreshIMathRoleVisibility();
                }
            });
        }

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

        const tagCounts = {};
        for (const q of state.workspaceQuestions) {
            if (q && q.tag) tagCounts[q.tag] = (tagCounts[q.tag] || 0) + 1;
        }
        const shown = filtered.slice(0, 150);
        listEl.innerHTML = shown.map(it => {
            const catShort = shortCategoryName(it.category);
            const selectedCnt = tagCounts[it.tag] || 0;
            const selectedBadge = selectedCnt > 0
                ? `<span class="ims-topic-selected-badge" title="Đã thêm vào đề"><i class="fa-solid fa-check" style="font-size:8.5px;"></i>×${selectedCnt}</span>`
                : '';
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
                            ${selectedBadge}
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

    function detectIMathQuestionKind(q) {
        const tex = String((q && (q.latex_mc || q.latex)) || '');
        const cat = String((q && q.category) || '').trim();
        if (/\\choiceTF(?![a-zA-Z])/.test(tex) || cat === 'Đúng-Sai') return 'DS';
        if (/\\shortans(?:\[|\{)/.test(tex) || cat === 'Trả lời ngắn') return 'TLN';
        if (/\\choice(?![a-zA-Z])/.test(tex) || cat === 'Trắc nghiệm') return 'TN';
        return 'TL';
    }

    function groupWorkspaceQuestions() {
        const qs = state.workspaceQuestions || [];
        const groupMap = new Map();
        qs.forEach((q, wsIndex) => {
            const tag = q.tag || q.map_id || 'unknown';
            const kind = detectIMathQuestionKind(q);
            if (!groupMap.has(tag)) {
                const metaTitle = (state.byTag && state.byTag[tag] && state.byTag[tag].title) || q.title || tag;
                groupMap.set(tag, {
                    tag,
                    title: metaTitle,
                    map_id: q.map_id || '',
                    tikz_group_id: q.tikz_group_id || '',
                    kind,
                    items: []
                });
            }
            groupMap.get(tag).items.push({ q, wsIndex });
        });
        return Array.from(groupMap.values());
    }

    function safeTagDomId(tag) {
        return String(tag || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    window.scrollToIMathTagCard = function (tag) {
        const el = document.getElementById('ims-group-card-' + safeTagDomId(tag));
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            el.style.boxShadow = '0 0 0 2px #4f46e5';
            setTimeout(() => { el.style.boxShadow = ''; }, 900);
        }
    };

    function renderIMathMatrixPanel() {
        const panel = document.getElementById('imathMatrixPanel');
        if (!panel) return;
        const qs = state.workspaceQuestions || [];
        const groups = groupWorkspaceQuestions();
        const counts = { TN: 0, DS: 0, TLN: 0, TL: 0 };
        qs.forEach((q) => {
            const kind = detectIMathQuestionKind(q);
            counts[kind] = (counts[kind] || 0) + 1;
        });

        const kindChipClass = { TN: 'kpi-tn', DS: 'kpi-ds', TLN: 'kpi-tln', TL: 'kpi-tl' };
        const kindLabel = { TN: 'TN', DS: 'ĐS', TLN: 'TLN', TL: 'TL' };
        const collapsed = Boolean(state.matrixCollapsed);

        const tagChipsHtml = (!collapsed && groups.length > 0)
            ? `<div class="ims-stats-tag-pills">${groups.map((g) => {
                const encTag = encodeURIComponent(g.tag);
                return `<button type="button" class="ims-stats-tag-chip" onclick="window.scrollToIMathTagCard(decodeURIComponent('${encTag}'))" title="${escapeHtml(g.title)} (Bấm để cuộn tới câu mẫu)">
                    <span class="ims-stat-kpi ${kindChipClass[g.kind] || 'kpi-tn'}" style="padding:1px 5px !important;font-size:9.5px !important;">${kindLabel[g.kind] || 'TN'}</span>
                    <span>${escapeHtml(g.tag)}</span>
                    <b style="color:#4f46e5;">×${g.items.length}</b>
                </button>`;
            }).join('')}</div>`
            : '';

        panel.innerHTML = `
            <div class="ims-stats-summary">
                <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12px;">
                    <i class="fa-solid fa-chart-column" style="color:#4f46e5;"></i>
                    <span>Thống kê câu đã chọn</span>
                </span>
                <div class="ims-stats-kpis">
                    <span class="ims-stat-kpi kpi-total">${groups.length} dạng · ${qs.length} câu</span>
                    <span class="ims-stat-kpi kpi-tn">TN: ${counts.TN}</span>
                    <span class="ims-stat-kpi kpi-ds">ĐS: ${counts.DS}</span>
                    <span class="ims-stat-kpi kpi-tln">TLN: ${counts.TLN}</span>
                    ${counts.TL > 0 ? `<span class="ims-stat-kpi kpi-tl">TL: ${counts.TL}</span>` : ''}
                    ${groups.length > 0 ? `<button type="button" onclick="window.toggleIMathMatrixCollapse()" class="ims-btn-add3" style="padding:2px 8px;height:24px;font-size:10.5px;">${collapsed ? 'Hiện chi tiết' : 'Thu gọn'}</button>` : ''}
                </div>
            </div>
            ${tagChipsHtml}
        `;
    }

    window.toggleIMathMatrixCollapse = function () {
        state.matrixCollapsed = !Boolean(state.matrixCollapsed);
        renderIMathMatrixPanel();
    };

    window.stepIMathTagCount = function (tag, delta) {
        const curCount = state.workspaceQuestions.filter(q => q.tag === tag).length;
        const nextCount = Math.max(0, Math.min(150, curCount + Number(delta || 0)));
        return window.setIMathTagCount(tag, nextCount);
    };

    window.cycleIMathTagPreview = function (tag, delta) {
        const count = state.workspaceQuestions.filter(q => q.tag === tag).length;
        if (count <= 1) return;
        const curIdx = Number(state.previewIndexByTag[tag] || 0);
        const nextIdx = (curIdx + delta + count) % count;
        state.previewIndexByTag[tag] = nextIdx;
        renderWorkspace();
    };

    window.setIMathTagCount = async function (tag, rawCount) {
        try {
            const parsed = parseInt(String(rawCount).trim(), 10);
            if (isNaN(parsed)) {
                renderWorkspace();
                return;
            }
            const targetCount = Math.max(0, Math.min(150, parsed));
            const curCount = state.workspaceQuestions.filter(q => q.tag === tag).length;
            if (targetCount === curCount) {
                renderIMathMatrixPanel();
                return;
            }
            if (targetCount < curCount) {
                let toRemove = curCount - targetCount;
                for (let i = state.workspaceQuestions.length - 1; i >= 0 && toRemove > 0; i--) {
                    if (state.workspaceQuestions[i].tag === tag) {
                        state.workspaceQuestions.splice(i, 1);
                        toRemove--;
                    }
                }
                if (targetCount === 0) {
                    delete state.previewIndexByTag[tag];
                } else if (Number(state.previewIndexByTag[tag] || 0) >= targetCount) {
                    state.previewIndexByTag[tag] = targetCount - 1;
                }
                renderWorkspace();
                renderTopicList();
                return;
            }
            const delta = targetCount - curCount;
            const items = await generateVariantsForTag(tag, delta);
            if (!items || items.length === 0) {
                notify(`Không thể sinh thêm câu hỏi cho dạng ${tag}`, 'warning');
                renderIMathMatrixPanel();
                return;
            }
            const existingForTag = state.workspaceQuestions.find(q => q.tag === tag);
            const inheritedMapId = existingForTag ? existingForTag.map_id : null;
            const newCards = items.map(it => ({
                ...it,
                map_id: inheritedMapId || it.map_id,
                latex_mc: inheritedMapId
                    ? String(it.latex_mc || '').replace(/^\\begin\{ex\}(?:\s*%\[[^\]]*\])?/, `\\begin{ex}%[${inheritedMapId}]`)
                    : it.latex_mc,
                id: 'imath_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                showCode: false
            }));
            let lastIdx = -1;
            for (let i = state.workspaceQuestions.length - 1; i >= 0; i--) {
                if (state.workspaceQuestions[i].tag === tag) {
                    lastIdx = i;
                    break;
                }
            }
            if (lastIdx !== -1) {
                state.workspaceQuestions.splice(lastIdx + 1, 0, ...newCards);
            } else {
                state.workspaceQuestions.push(...newCards);
            }
            if (state.previewIndexByTag[tag] === undefined) {
                state.previewIndexByTag[tag] = 0;
            }
            renderWorkspace();
            renderTopicList();
        } catch (err) {
            console.warn('[iMathStudio] setIMathTagCount error:', err);
        }
    };

    window.refreshIMathRoleVisibility = function () {
        const modal = document.getElementById('imathStudioModal');
        const quotaInfo = window.QMathQuota ? window.QMathQuota.getRoleInfo() : null;
        const quotaSummary = (window.QMathQuota && typeof window.QMathQuota.getDisplaySummary === 'function')
            ? window.QMathQuota.getDisplaySummary()
            : (window.QMathQuota ? window.QMathQuota.getStatus() : null);

        let isSuper = false;
        let canDownloadTex = false;
        if (quotaInfo) {
            isSuper = Boolean(quotaInfo.isSuper);
            canDownloadTex = Boolean(quotaInfo.canDownloadTex);
        } else {
            const prof = window.currentAdminProfile || {};
            const email = String(prof.email || '').trim().toLowerCase();
            isSuper = prof.role === 'super_admin' || prof.isRoot === true || [
                'phamdinhquang0911@gmail.com',
                'phamquang09112001@gmail.com',
                'phamngockhanh.942001@gmail.com',
                'phamngockhanh.942002@gmail.com'
            ].includes(email);
            canDownloadTex = isSuper;
        }

        if (modal) {
            modal.querySelectorAll('.ims-super-only').forEach((el) => {
                el.classList.toggle('ims-role-hidden', !isSuper);
                el.style.setProperty('display', isSuper ? 'inline-flex' : 'none', 'important');
            });
            modal.querySelectorAll('.ims-q-tex-btn').forEach((el) => {
                el.classList.toggle('ims-role-hidden', !canDownloadTex);
                el.style.setProperty('display', canDownloadTex ? 'inline-flex' : 'none', 'important');
            });
            if (!canDownloadTex) {
                modal.querySelectorAll('.ims-q-code-drawer').forEach((el) => {
                    el.classList.add('ims-role-hidden');
                    el.style.setProperty('display', 'none', 'important');
                });
            }
        }

        const btnTex = document.getElementById('btnIMathDownloadTex');
        if (btnTex) {
            btnTex.classList.toggle('ims-role-hidden', !canDownloadTex);
            btnTex.style.setProperty('display', canDownloadTex ? 'inline-flex' : 'none', 'important');
        }

        const pill = document.getElementById('imathQuotaPill');
        if (pill && quotaSummary) {
            pill.style.display = 'inline-flex';
            if (quotaSummary.limit < 0 || quotaSummary.unlimited) {
                pill.className = 'ims-quota-pill';
                pill.textContent = quotaSummary.isSuper
                    ? '✨ Không giới hạn (Super Admin)'
                    : '✨ Gói VIP · Không giới hạn lượt/tháng';
                pill.title = 'Không giới hạn số lượt tạo và tải đề mỗi tháng';
                pill.style.cursor = 'default';
                pill.onclick = null;
            } else {
                const rem = Math.max(0, quotaSummary.remaining);
                pill.className = 'ims-quota-pill' + (rem <= 0 ? ' ims-quota-zero' : (rem <= 10 ? ' ims-quota-warn' : ''));
                pill.textContent = `📊 Còn ${rem}/${quotaSummary.limit} lượt/tháng`;
                pill.title = quotaSummary.isFree
                    ? `Đã dùng ${quotaSummary.used}/${quotaSummary.limit} lượt tạo/tải đề trong tháng ${quotaSummary.monthKey}. Bấm để nâng cấp VIP!`
                    : `Đã dùng ${quotaSummary.used}/${quotaSummary.limit} lượt trong tháng ${quotaSummary.monthKey}`;
                pill.style.cursor = quotaSummary.isFree ? 'pointer' : 'default';
                pill.onclick = (quotaSummary.isFree && typeof window.openTeacherVipUpgradeModal === 'function')
                    ? () => window.openTeacherVipUpgradeModal()
                    : null;
            }
        }
    };

    function renderWorkspace() {
        const listEl = document.getElementById('imathWorkspaceList');
        const countEl = document.getElementById('imathWorkspaceCount');
        const mobCountEl = document.getElementById('imathMobileWorkspaceCount');
        renderIMathMatrixPanel();
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

        const groups = groupWorkspaceQuestions();
        const canTex = window.QMathQuota ? Boolean(window.QMathQuota.getRoleInfo().canDownloadTex) : false;
        const kindLabel = { TN: 'TN', DS: 'ĐS', TLN: 'TLN', TL: 'TL' };
        const kindStyle = {
            TN: 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;',
            DS: 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;',
            TLN: 'background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;',
            TL: 'background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe;'
        };

        listEl.innerHTML = groups.map((grp, gIdx) => {
            const count = grp.items.length;
            const rawPreviewIdx = Number(state.previewIndexByTag[grp.tag] || 0);
            const pIdx = Math.max(0, Math.min(count - 1, rawPreviewIdx));
            state.previewIndexByTag[grp.tag] = pIdx;
            const activeEntry = grp.items[pIdx];
            const q = activeEntry.q;
            const idx = activeEntry.wsIndex;
            const encTag = encodeURIComponent(grp.tag);

            return `
            <div class="ims-q-card" id="ims-group-card-${safeTagDomId(grp.tag)}">
                <div class="ims-q-card-hdr">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;">
                        <span style="padding:2px 8px;border-radius:5px;background:#4f46e5;color:#fff;font-weight:700;font-size:11px;">Dạng ${gIdx + 1}</span>
                        <span style="padding:1px 6px;border-radius:5px;font-weight:700;font-size:10.5px;${kindStyle[grp.kind] || kindStyle.TN}">${kindLabel[grp.kind] || 'TN'}</span>
                        <span class="ims-meta-mapid" title="Mã dạng iMath">${escapeHtml(grp.tag)}</span>
                        ${q.tikz_group_id ? `<span class="ims-meta-mapid" title="Mã hình TikZ">${escapeHtml(q.tikz_group_id)}</span>` : ''}
                        <div style="display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:5px;border:1px solid rgba(148,163,184,0.35);">
                            <span style="font-size:10.5px;color:#64748b;">MapID:</span>
                            <input type="text" value="${escapeHtml(q.map_id)}" onchange="window.updateIMathTagMapId(decodeURIComponent('${encTag}'), this.value)" style="width:74px;font-size:11px;font-family:monospace;font-weight:700;color:inherit;background:transparent;border:none;outline:none;" title="Chỉnh sửa mã MapID cho toàn bộ dạng này">
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
                        <div class="ims-card-qty-box" title="Tăng giảm hoặc nhập số lượng câu cho dạng ${escapeHtml(grp.tag)}">
                            <span class="ims-card-qty-label">SL:</span>
                            <button type="button" class="ims-step-btn" onclick="window.stepIMathTagCount(decodeURIComponent('${encTag}'), -1)" title="Giảm 1 câu">−</button>
                            <input type="number" min="0" max="150" value="${count}" class="ims-step-input" style="width:46px !important;text-align:center;" onchange="window.setIMathTagCount(decodeURIComponent('${encTag}'), this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" title="Nhập số lượng (1–150) rồi nhấn Enter">
                            <button type="button" class="ims-step-btn" onclick="window.stepIMathTagCount(decodeURIComponent('${encTag}'), 1)" title="Tăng 1 câu">+</button>
                        </div>
                        ${count > 1 ? `
                        <span class="ims-card-var-nav" title="Xem từng biến thể đã sinh trong cùng dạng">
                            <button type="button" class="ims-var-btn" onclick="window.cycleIMathTagPreview(decodeURIComponent('${encTag}'), -1)" title="Mẫu trước"><i class="fa-solid fa-chevron-left"></i></button>
                            <span>Mẫu ${pIdx + 1}/${count}</span>
                            <button type="button" class="ims-var-btn" onclick="window.cycleIMathTagPreview(decodeURIComponent('${encTag}'), 1)" title="Mẫu tiếp"><i class="fa-solid fa-chevron-right"></i></button>
                        </span>` : ''}
                        <button type="button" onclick="window.rerollSingleWorkspaceQuestion(${idx})" class="ims-btn-add3" title="Sinh bộ số khác cho mẫu xem trước này">
                            <i class="fa-solid fa-arrows-rotate"></i> Đổi số
                        </button>
                        <button type="button" onclick="window.toggleIMathQuestionCode(${idx})" class="ims-btn-add3 ims-q-tex-btn ${canTex ? '' : 'ims-role-hidden'}" style="${canTex ? '' : 'display:none !important;'}" title="Xem / Sửa mã LaTeX">
                            <i class="fa-solid fa-code"></i> LaTeX
                        </button>
                        <button type="button" onclick="window.setIMathTagCount(decodeURIComponent('${encTag}'), 0)" class="ims-btn-add3" style="color:#ef4444;" title="Xóa toàn bộ dạng ${escapeHtml(grp.tag)}">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <div class="ims-q-body" id="imathPreviewCard_${idx}">
                    <div class="ims-preview-hint">
                        <span style="font-weight:700;">${escapeHtml(grp.title)}</span>
                        <span>${count > 1 ? `Đang xem trước mẫu <b>${pIdx + 1}/${count}</b> · Khi xuất giữ đủ <b>${count}</b> biến thể` : '1 câu đã chọn'}</span>
                    </div>
                    ${formatLatexPreviewHtml(q.latex_mc)}
                </div>

                <div id="imathCodeDrawer_${idx}" class="ims-q-code-drawer" style="display:${canTex && q.showCode ? 'block' : 'none'};padding:12px;background:#0f172a;color:#f8fafc;border-top:1px solid #1e293b;">
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;margin-bottom:6px;">
                        <span style="font-weight:600;color:#94a3b8;">Mã LaTeX ex_test (${escapeHtml(q.tag)} - Mẫu ${pIdx + 1}/${count}):</span>
                        <span style="color:#64748b;">Tự động cập nhật khi sửa</span>
                    </div>
                    <textarea rows="7" onchange="window.updateIMathQuestionLatex(${idx}, this.value)" style="width:100%;padding:10px;border-radius:8px;background:#020617;color:#e2e8f0;font-family:monospace;font-size:12px;border:1px solid #334155;outline:none;box-sizing:border-box;">${escapeHtml(q.latex_mc)}</textarea>
                </div>
            </div>
        `;
        }).join('');

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

            if (typeof window.refreshIMathRoleVisibility === 'function') {
                window.refreshIMathRoleVisibility();
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
            if (state.previewIndexByTag[tag] === undefined) {
                state.previewIndexByTag[tag] = 0;
            }
            renderWorkspace();
            renderTopicList();
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
            renderTopicList();
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

    window.updateIMathTagMapId = function (tag, newMapId) {
        const cleanId = (newMapId || '').trim().toUpperCase();
        state.workspaceQuestions.forEach((q, idx) => {
            if (!q || q.tag !== tag) return;
            q.map_id = cleanId;
            q.latex_mc = String(q.latex_mc || '').replace(/^\\begin\{ex\}(?:\s*%\[[^\]]*\])?/, `\\begin{ex}%[${cleanId}]`);
            const drawer = document.querySelector(`#imathCodeDrawer_${idx} textarea`);
            if (drawer) drawer.value = q.latex_mc;
        });
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
        renderTopicList();
    };

    window.clearIMathWorkspace = function () {
        state.workspaceQuestions = [];
        state.previewIndexByTag = {};
        renderWorkspace();
        renderTopicList();
    };

    function buildCombinedIMathTex() {
        return (state.workspaceQuestions || [])
            .map((q, i) => `% === Câu ${i + 1} | Mã iMath: [${q.tag}] | MapID: ${q.map_id} ===\n${(q.latex_mc || q.latex || '').trim()}`)
            .filter(Boolean)
            .join('\n\n');
    }

    function normalizeParsedQuestionForWord(pq, src, idx) {
        const out = { ...pq };
        out.id = out.id || pq.cccd || (src && (src.map_id || src.tag)) || (`imath_${idx + 1}`);
        out.mapId = out.mapId || (src && src.map_id) || '';
        const sol = out.solution || out.explain || out.explanation || '';
        out.solution = sol;
        out.explain = sol;
        out.explanation = sol;
        if (out.type === 'mc' && typeof out.correct === 'number' && out.correct >= 0 && out.correct < 4) {
            out.correctAnswer = ['A', 'B', 'C', 'D'][out.correct];
        }
        if (out.type === 'tf' && Array.isArray(out.statements)) {
            const tfMap = {};
            ['a', 'b', 'c', 'd'].forEach((k, i) => {
                if (out.statements[i]) {
                    tfMap[k] = out.statements[i].isTrue ? 'Đ' : 'S';
                }
            });
            out.correctTf = tfMap;
        }
        return out;
    }

    window.downloadIMathWorkspaceTex = async function () {
        if (window.QMathQuota && !window.QMathQuota.getRoleInfo().canDownloadTex) {
            notify('Tài khoản của bạn chưa được cấp quyền tải file .tex!', 'error');
            return;
        }
        if (state.workspaceQuestions.length === 0) {
            notify('Chưa có câu hỏi nào để xuất file .tex!', 'warning');
            return;
        }
        if (window.QMathQuota) {
            const qRes = await window.QMathQuota.consume('Tải file .tex từ iMath Studio');
            if (typeof window.refreshIMathRoleVisibility === 'function') window.refreshIMathRoleVisibility();
            if (!qRes.allowed) return;
        }
        const content = buildCombinedIMathTex();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cau_Hoi_Doi_So_QMath_${new Date().toISOString().slice(0, 10)}.tex`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`Đã tải file .tex gồm ${state.workspaceQuestions.length} câu hỏi!`, 'success');
    };

    window.exportIMathToOnlineExam = function () {
        if (state.workspaceQuestions.length === 0) {
            notify('Hãy chọn ít nhất 1 dạng toán để sinh câu hỏi trước khi đưa sang tạo đề online!', 'warning');
            return;
        }
        if (window.QMathQuota) {
            const st = window.QMathQuota.getStatus();
            if (st.limit >= 0 && st.remaining <= 0) {
                notify(`Bạn đã hết lượt tạo/tải đề trong tháng này (${st.used}/${st.limit} lần).`, 'error');
                return;
            }
        }
        const combinedTex = buildCombinedIMathTex();
        if (!combinedTex) {
            notify('Không có nội dung LaTeX hợp lệ!', 'warning');
            return;
        }
        const isOnExamEditor = window.location.pathname.includes('exam-editor') && typeof window.parseLatexContent === 'function';
        if (isOnExamEditor) {
            window.closeIMathStudioModal();
            const count = window.parseLatexContent(combinedTex);
            notify(`Đã đưa ${count || state.workspaceQuestions.length} câu hỏi đổi số vào đề thi online!`, 'success');
            return;
        }
        try {
            const firstGrade = (state.workspaceQuestions.find(q => q.grade)?.grade) || '';
            const titleGuess = firstGrade
                ? `Đề ${firstGrade} (iMath Studio - ${state.workspaceQuestions.length} câu)`
                : `Đề luyện tập iMath Studio (${state.workspaceQuestions.length} câu)`;
            localStorage.setItem('qmath_imath_pending_exam_tex', JSON.stringify({
                tex: combinedTex,
                count: state.workspaceQuestions.length,
                title: titleGuess,
                createdAt: Date.now()
            }));
        } catch (err) {
            notify('Không thể lưu dữ liệu tạm để chuyển trang: ' + err.message, 'error');
            return;
        }
        window.closeIMathStudioModal();
        notify(`Đang chuyển ${state.workspaceQuestions.length} câu hỏi sang khu tạo đề online...`, 'success');
        window.location.href = 'exam-editor.html?from=imath';
    };

    window.insertIMathWorkspaceToExam = window.exportIMathToOnlineExam;

    window.exportIMathToWordMathType = function () {
        if (state.workspaceQuestions.length === 0) {
            notify('Hãy chọn ít nhất 1 dạng toán để sinh câu hỏi trước khi xuất Word!', 'warning');
            return;
        }
        if (typeof window.openExportWordModal !== 'function') {
            notify('Module xuất Word MathType chưa sẵn sàng, vui lòng thử lại sau giây lát!', 'warning');
            return;
        }
        if (window.QMathQuota) {
            const st = window.QMathQuota.getStatus();
            if (st.limit >= 0 && st.remaining <= 0) {
                notify(`Bạn đã hết lượt tạo/tải đề trong tháng này (${st.used}/${st.limit} lần).`, 'error');
                return;
            }
        }
        const combinedTex = buildCombinedIMathTex();
        let parsedList = [];
        if (typeof window.parseLatexExamString === 'function') {
            try {
                parsedList = window.parseLatexExamString(combinedTex) || [];
            } catch (err) {
                console.warn('[iMathStudio] parseLatexExamString warning:', err);
            }
        }
        if (!Array.isArray(parsedList) || parsedList.length === 0) {
            notify('Không thể phân tích câu hỏi sang định dạng xuất Word. Vui lòng kiểm tra module phân tích LaTeX!', 'error');
            return;
        }
        const normalizedQuestions = parsedList.map((pq, idx) => normalizeParsedQuestionForWord(pq, state.workspaceQuestions[idx], idx));
        const firstQ = state.workspaceQuestions[0] || {};
        const examTitle = firstQ.grade
            ? `Đề ${firstQ.grade} (${normalizedQuestions.length} câu)`
            : `Đề luyện tập Toán (${normalizedQuestions.length} câu)`;
        const examObj = {
            title: examTitle,
            duration: 90,
            grade: firstQ.grade || '',
            subject: 'Toán học',
            questions: normalizedQuestions
        };
        window.openExportWordModal(examObj, normalizedQuestions);
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
