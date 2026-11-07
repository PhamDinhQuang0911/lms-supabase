/**
 * season-theme.js — Bộ máy giao diện theo mùa của QMath (dùng chung học sinh + giáo viên)
 * - Đặt data-season trên <html>  ->  styles.css nhuộm màu banner, sidebar, nút theo mùa
 * - Vẽ tranh trang trí theo mùa vào banner chào mừng (cây đào, đảo dừa, cây phong, người tuyết hoạt hình)
 * - Hiệu ứng tuyết rơi lấp lánh thuần SVG (luôn giữ màu trắng tinh khôi trong mọi chế độ sáng/tối Dark Mode)
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

    // ================= TRANH TRANG TRÍ THEO MÙA (đặt góc banner) =================
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
        // Người tuyết mùa đông kèm hiệu ứng tuyết rơi hoạt hình thuần SVG (Full Vector Snow Animation)
        winter: `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block">
            <defs>
                <radialGradient id="qmSnowGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
                </radialGradient>
                <style>
                    @keyframes qmSnowFallA { 0% { transform: translateY(-10px) translateX(0); opacity: 0; } 20% { opacity: 0.95; } 80% { opacity: 0.95; } 100% { transform: translateY(115px) translateX(6px); opacity: 0; } }
                    @keyframes qmSnowFallB { 0% { transform: translateY(-12px) translateX(0); opacity: 0; } 25% { opacity: 0.85; } 85% { opacity: 0.85; } 100% { transform: translateY(125px) translateX(-5px); opacity: 0; } }
                    @keyframes qmSnowFallC { 0% { transform: translateY(-8px) translateX(0); opacity: 0; } 30% { opacity: 0.9; } 80% { opacity: 0.9; } 100% { transform: translateY(105px) translateX(4px); opacity: 0; } }
                    .qm-sf-a { animation: qmSnowFallA 3.5s linear infinite; }
                    .qm-sf-b { animation: qmSnowFallB 4.2s linear infinite 1.2s; }
                    .qm-sf-c { animation: qmSnowFallC 3.8s linear infinite 0.6s; }
                    .qm-sf-d { animation: qmSnowFallA 4.5s linear infinite 2s; }
                    .qm-sf-e { animation: qmSnowFallB 3.2s linear infinite 1.8s; }
                </style>
            </defs>

            <!-- Ánh sáng tuyết trắng tinh khiết -->
            <circle cx="100" cy="55" r="48" fill="url(#qmSnowGlow)"/>

            <!-- Các bông tuyết chuyển động rơi từ đỉnh xuống chân người tuyết (luôn giữ màu trắng thuần trong Dark Mode) -->
            <g class="qm-sf-a">
                <circle cx="70" cy="15" r="2.2" fill="#FFFFFF"/>
                <path d="M70 11v8M66 15h8M67 12l6 6M73 12l-6 6" stroke="#FFFFFF" stroke-width="0.8" opacity="0.9"/>
            </g>
            <g class="qm-sf-b">
                <circle cx="130" cy="10" r="2.5" fill="#FFFFFF"/>
                <path d="M130 6v8M126 10h8M127 7l6 6M133 7l-6 6" stroke="#FFFFFF" stroke-width="0.8" opacity="0.9"/>
            </g>
            <g class="qm-sf-c">
                <circle cx="100" cy="20" r="2" fill="#FFFFFF"/>
                <path d="M100 17v6M97 20h6" stroke="#FFFFFF" stroke-width="0.8" opacity="0.85"/>
            </g>
            <g class="qm-sf-d">
                <circle cx="48" cy="35" r="1.8" fill="#FFFFFF" opacity="0.9"/>
            </g>
            <g class="qm-sf-e">
                <circle cx="152" cy="30" r="2.2" fill="#FFFFFF" opacity="0.85"/>
            </g>
            <g class="qm-sf-c">
                <circle cx="85" cy="40" r="1.5" fill="#FFFFFF" opacity="0.95"/>
            </g>
            <g class="qm-sf-b">
                <circle cx="118" cy="45" r="1.8" fill="#FFFFFF" opacity="0.8"/>
            </g>

            <!-- Bụi tuyết lất phất bao quanh -->
            <circle cx="58" cy="24" r="1.5" fill="#FFFFFF" opacity="0.8"/>
            <circle cx="142" cy="36" r="1.6" fill="#FFFFFF" opacity="0.75"/>
            <circle cx="42" cy="65" r="1.8" fill="#FFFFFF" opacity="0.85"/>
            <circle cx="158" cy="68" r="1.6" fill="#FFFFFF" opacity="0.75"/>
            <circle cx="52" cy="102" r="2" fill="#FFFFFF" opacity="0.9"/>
            <circle cx="148" cy="112" r="1.8" fill="#FFFFFF" opacity="0.9"/>
            <circle cx="32" cy="125" r="2.4" fill="#FFFFFF" opacity="0.95"/>
            <circle cx="168" cy="128" r="2.2" fill="#FFFFFF" opacity="0.95"/>

            <!-- Đế tuyết dưới chân -->
            <ellipse cx="100" cy="148" rx="72" ry="11" fill="#E0F2FE" opacity="0.95"/>
            <ellipse cx="100" cy="149" rx="55" ry="7" fill="#FFFFFF"/>

            <!-- Thân người tuyết -->
            <circle cx="100" cy="120" r="28" fill="#F8FAFC"/>
            <!-- Đầu người tuyết -->
            <circle cx="100" cy="78" r="20" fill="#F8FAFC"/>
            
            <!-- Mũ người tuyết -->
            <rect x="83" y="50" width="34" height="6" rx="3" fill="#1E293B"/>
            <rect x="89" y="30" width="22" height="22" rx="3" fill="#DC2626"/>
            <rect x="89" y="47" width="22" height="4" fill="#FBBF24"/>

            <!-- Mắt -->
            <circle cx="93" cy="74" r="2.8" fill="#0F172A"/>
            <circle cx="107" cy="74" r="2.8" fill="#0F172A"/>
            <circle cx="94" cy="73" r="0.9" fill="#FFFFFF"/>
            <circle cx="108" cy="73" r="0.9" fill="#FFFFFF"/>

            <!-- Mũi cà rốt -->
            <polygon points="100,79 100,83 112,81" fill="#F97316"/>

            <!-- Miệng cười đáng yêu -->
            <path d="M94 88c3 3 9 3 12 0" stroke="#0F172A" stroke-width="1.8" stroke-linecap="round"/>

            <!-- Khăn quàng cổ đỏ ấm áp -->
            <path d="M86 92c8 4 20 4 28 0" stroke="#DC2626" stroke-width="6" stroke-linecap="round"/>
            <path d="M106 94v14" stroke="#DC2626" stroke-width="5" stroke-linecap="round"/>

            <!-- Cúc áo -->
            <circle cx="100" cy="112" r="2.8" fill="#0F172A"/>
            <circle cx="100" cy="124" r="2.8" fill="#0F172A"/>
            <circle cx="100" cy="136" r="2.8" fill="#0F172A"/>

            <!-- Tay cành cây -->
            <path d="M74 110L52 96M52 96l8-6M52 96l2 8" stroke="#78350F" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M126 110l22-14M148 96l-8-6M148 96l-2 8" stroke="#78350F" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- Tuyết tích tụ mặt đất -->
            <ellipse cx="60" cy="148" rx="8" ry="3" fill="#FFFFFF" opacity="0.9"/>
            <ellipse cx="140" cy="148" rx="10" ry="3.5" fill="#FFFFFF" opacity="0.9"/>
        </svg>`
    };

    function addHeroDecor() {
        // Banner học sinh hoặc banner giáo viên
        const hero = document.querySelector('.from-teal-600, .from-blue-500, .from-primary-600, .from-primary-700');
        if (!hero) return;

        // Bổ sung linh vật mascot trang trí
        if (!hero.querySelector('.qm-season-decor')) {
            const decor = document.createElement('div');
            decor.className = 'qm-season-decor';
            decor.innerHTML = DECOR[season];
            hero.appendChild(decor);
        }

        // Bổ sung hiệu ứng tuyết rơi lãng mạn bay ngang qua banner vào mùa đông (dùng thuần SVG để miễn nhiễm đảo màu Dark Mode)
        if (season === 'winter' && !hero.querySelector('.qm-banner-snow')) {
            const snowBox = document.createElement('div');
            snowBox.className = 'qm-banner-snow pointer-events-none absolute inset-0 overflow-hidden z-[4]';
            snowBox.innerHTML = `<svg viewBox="0 0 400 200" preserveAspectRatio="none" fill="none" class="w-full h-full block">
                <defs>
                    <style>
                        @keyframes qmSvgSnowFall { 0% { transform: translateY(-12px) translateX(0); opacity: 0; } 20% { opacity: 0.85; } 80% { opacity: 0.85; } 100% { transform: translateY(210px) translateX(12px); opacity: 0; } }
                        .qm-sn-1 { animation: qmSvgSnowFall 4.2s linear infinite; }
                        .qm-sn-2 { animation: qmSvgSnowFall 5.0s linear infinite 1.2s; }
                        .qm-sn-3 { animation: qmSvgSnowFall 3.8s linear infinite 0.6s; }
                        .qm-sn-4 { animation: qmSvgSnowFall 4.6s linear infinite 2.2s; }
                        .qm-sn-5 { animation: qmSvgSnowFall 5.4s linear infinite 1.7s; }
                    </style>
                </defs>
                <circle cx="28" cy="5" r="2.2" fill="#FFFFFF" class="qm-sn-1"/>
                <circle cx="72" cy="15" r="3.2" fill="#FFFFFF" class="qm-sn-2"/>
                <circle cx="118" cy="8" r="2.0" fill="#FFFFFF" class="qm-sn-3"/>
                <circle cx="168" cy="22" r="2.6" fill="#FFFFFF" class="qm-sn-4"/>
                <circle cx="218" cy="12" r="2.2" fill="#FFFFFF" class="qm-sn-5"/>
                <circle cx="268" cy="18" r="3.2" fill="#FFFFFF" class="qm-sn-1"/>
                <circle cx="318" cy="10" r="2.4" fill="#FFFFFF" class="qm-sn-3"/>
                <circle cx="368" cy="25" r="3.0" fill="#FFFFFF" class="qm-sn-2"/>
            </svg>`;
            hero.appendChild(snowBox);
        }
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
