/**
 * season-theme.js — Bộ máy giao diện theo mùa của QMath (dùng chung học sinh + giáo viên)
 * - Đặt data-season trên <html>  ->  styles.css nhuộm màu banner, sidebar, nút theo mùa
 * - Vẽ tranh trang trí theo mùa vào banner chào mừng (cây đào, đảo dừa, cây phong, người tuyết)
 * - Icon rơi SVG trong sidebar (nếu trang có #sidebar-container)
 * Mùa: xuân T2-4 | hạ T5-7 | thu T8-10 | đông T11-1
 */
(function () {
    const today = new Date();
    const m = today.getMonth() + 1;
    const d = today.getDate();

    let season = 'autumn';
    if (m === 11 || m === 12 || m === 1) season = 'winter';
    else if (m >= 2 && m <= 4) season = 'spring';
    else if (m >= 5 && m <= 7) season = 'summer';
    document.documentElement.setAttribute('data-season', season);

    // ================= TRANH TRANG TRÍ THEO MÙA (đặt góc phải banner) =================
    const DECOR = {
        // Cành đào mùa xuân
        spring: `<svg viewBox="0 0 160 120" fill="none">
            <path d="M150 118C120 100 96 76 88 44M88 44C84 60 70 68 56 66M88 44c10 6 26 4 34-8M88 44C86 30 92 16 106 10" stroke="#9F5B4D" stroke-width="5" stroke-linecap="round"/>
            <g fill="#F9A8D4"><circle cx="54" cy="62" r="7"/><circle cx="66" cy="70" r="6"/><circle cx="120" cy="34" r="7"/><circle cx="128" cy="42" r="5"/><circle cx="104" cy="12" r="7"/><circle cx="112" cy="22" r="5"/><circle cx="96" cy="52" r="5"/></g>
            <g fill="#F472B6"><circle cx="46" cy="70" r="5"/><circle cx="112" cy="30" r="5"/><circle cx="98" cy="18" r="5"/><circle cx="80" cy="58" r="4"/></g>
            <g fill="#FDE047"><circle cx="54" cy="62" r="2"/><circle cx="120" cy="34" r="2"/><circle cx="104" cy="12" r="2"/></g>
        </svg>`,
        // Đảo dừa mùa hè
        summer: `<svg viewBox="0 0 160 120" fill="none">
            <circle cx="128" cy="26" r="14" fill="#FDE047"/>
            <ellipse cx="80" cy="108" rx="62" ry="14" fill="#FDE68A"/>
            <path d="M74 100C72 76 74 58 80 44" stroke="#A16207" stroke-width="7" stroke-linecap="round"/>
            <g stroke="#4ADE80" stroke-width="6" stroke-linecap="round" fill="none">
                <path d="M80 44C66 36 52 36 42 44"/><path d="M80 44C74 30 62 24 50 24"/>
                <path d="M80 44C88 30 100 26 112 30"/><path d="M80 44C94 38 106 40 116 50"/>
            </g>
            <circle cx="72" cy="52" r="5" fill="#92400E"/><circle cx="84" cy="54" r="5" fill="#92400E"/>
            <path d="M18 96c6-6 14-6 20 0M120 100c6-6 14-6 20 0" stroke="#7DD3FC" stroke-width="4" stroke-linecap="round"/>
        </svg>`,
        // Cây phong mùa thu
        autumn: `<svg viewBox="0 0 160 120" fill="none">
            <path d="M80 112V64M80 76L62 58M80 72l20-16" stroke="#854D0E" stroke-width="7" stroke-linecap="round"/>
            <g fill="#F59E0B"><circle cx="80" cy="42" r="22"/><circle cx="56" cy="52" r="15"/><circle cx="106" cy="50" r="15"/></g>
            <g fill="#EA580C"><circle cx="68" cy="34" r="11"/><circle cx="94" cy="32" r="10"/><circle cx="118" cy="58" r="8"/></g>
            <g fill="#FBBF24"><circle cx="46" cy="62" r="7"/><circle cx="86" cy="24" r="7"/></g>
            <path d="M36 100c4-4 4-8 2-12M128 96c-3-5-2-9 1-13" stroke="#EA580C" stroke-width="4" stroke-linecap="round"/>
            <ellipse cx="80" cy="113" rx="46" ry="6" fill="#FDBA74" opacity="0.6"/>
        </svg>`,
        // Người tuyết mùa đông
        winter: `<svg viewBox="0 0 160 120" fill="none">
            <ellipse cx="80" cy="110" rx="60" ry="9" fill="#E0F2FE"/>
            <circle cx="80" cy="86" r="24" fill="#F8FAFC"/>
            <circle cx="80" cy="50" r="17" fill="#F8FAFC"/>
            <rect x="66" y="26" width="28" height="5" rx="2.5" fill="#334155"/>
            <rect x="71" y="10" width="18" height="18" rx="3" fill="#DC2626"/>
            <circle cx="74" cy="47" r="2.5" fill="#0F172A"/><circle cx="86" cy="47" r="2.5" fill="#0F172A"/>
            <path d="M80 52l5 4-5 2z" fill="#F97316"/>
            <path d="M78 60c2 2 6 2 8 0" stroke="#0F172A" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="80" cy="80" r="2.5" fill="#0F172A"/><circle cx="80" cy="90" r="2.5" fill="#0F172A"/>
            <path d="M58 78L40 66M102 78l18-12" stroke="#92400E" stroke-width="4" stroke-linecap="round"/>
            <path d="M120 96c5-4 11-4 16 0M28 92c4-4 10-4 15 0" stroke="#BAE6FD" stroke-width="3" stroke-linecap="round"/>
        </svg>`
    };

    function addHeroDecor() {
        // Banner học sinh hoặc banner giáo viên
        const hero = document.querySelector('.from-teal-600, .from-blue-500, .from-primary-600, .from-primary-700');
        if (!hero || hero.querySelector('.qm-season-decor')) return;
        const decor = document.createElement('div');
        decor.className = 'qm-season-decor';
        decor.innerHTML = DECOR[season];
        hero.appendChild(decor);
    }

    // ================= ICON RƠI TRONG SIDEBAR =================
    const SVG_ITEMS = {
        autumn: [
            '<svg viewBox="0 0 24 24"><path d="M12 2C8 6 4 8 4 13a8 8 0 0 0 16 0c0-5-4-7-8-11z" fill="#F59E0B"/></svg>',
            '<svg viewBox="0 0 24 24"><path d="M12 3c-2 4-7 5-7 10a7 7 0 0 0 14 0c0-5-5-6-7-10z" fill="#EA580C" opacity="0.85"/></svg>'
        ],
        winter: [
            '<svg viewBox="0 0 24 24" stroke="#93C5FD" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>',
            '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#E0F2FE" opacity="0.9"/></svg>'
        ],
        spring: [
            '<svg viewBox="0 0 24 24"><g fill="#F9A8D4"><ellipse cx="12" cy="6" rx="3" ry="5"/><ellipse cx="12" cy="18" rx="3" ry="5"/><ellipse cx="6" cy="12" rx="5" ry="3"/><ellipse cx="18" cy="12" rx="5" ry="3"/></g><circle cx="12" cy="12" r="2.5" fill="#FBBF24"/></svg>',
            '<svg viewBox="0 0 24 24"><path d="M12 4c3 3 3 8 0 12-3-4-3-9 0-12z" fill="#FB7185" opacity="0.8" transform="rotate(30 12 12)"/></svg>'
        ],
        summer: [
            '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#FDE047"/><g stroke="#FCD34D" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></g></svg>',
            '<svg viewBox="0 0 24 24"><path d="M3 15c3-4 7-4 9 0 2-4 6-4 9 0v3H3z" fill="#7DD3FC" opacity="0.85"/></svg>'
        ]
    };

    function addFallingItems() {
        const sidebar = document.getElementById('sidebar-container');
        if (!sidebar || sidebar.querySelector('.falling-item')) return;
        const items = SVG_ITEMS[season];
        const count = season === 'winter' ? 9 : 6;
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.classList.add('falling-item');
            el.innerHTML = items[i % items.length];
            const size = Math.random() * 8 + 12;
            el.style.left = Math.random() * 80 + '%';
            el.style.width = size + 'px';
            el.style.height = size + 'px';
            el.style.animationDuration = (Math.random() * 6 + 7) + 's';
            el.style.animationDelay = (Math.random() * 7) + 's';
            sidebar.appendChild(el);
        }
    }

    // ================= TRANG TRÍ DỊP LỄ ĐẶC BIỆT =================
    function addHolidayDecor() {
        const logoDecor = document.getElementById('logoDecor');
        const treeDecor = document.getElementById('sidebarDecorTree');
        if (m === 12 && d >= 15) {
            if (logoDecor) logoDecor.innerHTML = '<div class="santa-hat">🎅</div>';
            if (treeDecor) treeDecor.innerHTML = '<div class="xmas-tree-decor">🎄</div>';
        }
        if ((m === 1 && d >= 20) || m === 2) {
            if (logoDecor) logoDecor.innerHTML = '<div class="absolute -top-3 -right-2 text-2xl animate-pulse">🌸</div>';
        }
    }

    function init() { addHeroDecor(); addFallingItems(); addHolidayDecor(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
