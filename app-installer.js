/**
 * QMath App Installer (PWA / Add to Home Screen)
 * Tự động hiển thị lời nhắc "Cài đặt phần mềm" cho thiết bị di động (Android, iPhone) và iPad/Tablet.
 * Hỗ trợ tạo lối tắt 1 chạm trên Android và hướng dẫn trực quan theo chuẩn Apple trên iOS/iPadOS.
 */
(function() {
    'use strict';

    // 1. Kiểm tra môi trường thiết bị
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
        (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const isIPad = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /iPad/.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isMobileOrTablet = isIOS || isAndroid || (window.innerWidth <= 1024 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

    // Kiểm tra xem đã mở từ lối tắt / standalone hay chưa
    const isStandalone = (window.navigator.standalone === true) || 
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);

    // Nếu đã ở trong App (Lối tắt) -> Tuyệt đối không hiển thị banner cài đặt
    if (isStandalone) return;

    // Không làm phiền khi đang trong phòng thi hoặc xem làm bài tập tính giờ
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('exam.html') || currentPath.includes('homework-player.html')) {
        return;
    }

    let deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
        hideBanner(true);
        try { localStorage.setItem('qmath_app_installed', 'true'); } catch(e) {}
    });

    // Modal hướng dẫn riêng cho iOS / iPad
    function showIosGuideModal() {
        let modal = document.getElementById('qmathIosInstallModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'qmathIosInstallModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;animation:qmathFadeIn 0.25s ease-out;';
            
            const shareIconPos = isIPad ? 'ở góc trên bên phải màn hình Safari' : 'ở thanh công cụ đáy màn hình Safari';
            const arrowIndicator = isIPad 
                ? '<div style="text-align:right;padding-right:24px;margin-bottom:10px;font-size:16px;font-weight:700;color:#0284c7;animation:qmathBounceUp 1.2s infinite;"><i class="fa-solid fa-arrow-up"></i> Nút Chia sẻ ở góc trên này</div>'
                : '<div style="text-align:center;margin-top:14px;font-size:16px;font-weight:700;color:#0284c7;animation:qmathBounceDown 1.2s infinite;"><i class="fa-solid fa-arrow-down"></i> Nút Chia sẻ ở thanh dưới cùng</div>';

            modal.innerHTML = `
                <div style="background:#fff;color:#1e293b;border-radius:24px;max-width:440px;width:100%;padding:22px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);font-family:Inter,system-ui,sans-serif;position:relative;animation:qmathSlideUp 0.3s cubic-bezier(0.16,1,0.3,1);">
                    <button onclick="document.getElementById('qmathIosInstallModal').style.display='none'" style="position:absolute;top:16px;right:16px;width:32px;height:32px;border:none;background:#f1f5f9;color:#64748b;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;">✕</button>
                    
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                        <img src="/app-icon-192.png" onerror="this.src='/apple-touch-icon.png'" style="width:48px;height:48px;border-radius:12px;box-shadow:0 4px 10px rgba(234,88,12,0.3);object-fit:cover;">
                        <div>
                            <h3 style="margin:0;font-size:17px;font-weight:800;color:#0f172a;">Cài đặt Toán Thầy Choang</h3>
                            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Dành cho thiết bị ${isIPad ? 'iPad' : 'iPhone / iOS'}</p>
                        </div>
                    </div>

                    <div style="background:#fff7ed;border:1px solid #ffedd5;border-radius:14px;padding:12px 14px;margin-bottom:16px;">
                        <p style="margin:0;font-size:12.5px;color:#9a3412;line-height:1.5;font-weight:600;">
                            <i class="fa-solid fa-circle-info" style="margin-right:5px;"></i> Apple Safari yêu cầu tạo lối tắt qua nút Chia sẻ theo 3 bước sau:
                        </p>
                    </div>

                    <div style="display:flex;flex-direction:column;gap:13px;font-size:13px;color:#334155;line-height:1.45;">
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <span style="width:24px;height:24px;border-radius:50%;background:#ea580c;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</span>
                            <div>
                                Nhấn vào nút <strong>Chia sẻ</strong> <span style="display:inline-flex;align-items:center;background:#e0f2fe;color:#0284c7;padding:2px 8px;border-radius:8px;font-weight:700;"><i class="fa-solid fa-arrow-up-from-bracket" style="margin-right:4px;"></i> Share</span> (${shareIconPos}).
                            </div>
                        </div>

                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <span style="width:24px;height:24px;border-radius:50%;background:#ea580c;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</span>
                            <div>
                                Cuộn tìm và chọn mục <strong>"Thêm vào MH chính"</strong> <span style="display:inline-flex;align-items:center;background:#f1f5f9;color:#334155;padding:2px 8px;border-radius:8px;font-weight:700;"><i class="fa-regular fa-square-plus" style="margin-right:4px;"></i> Add to Home Screen</span>.
                            </div>
                        </div>

                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <span style="width:24px;height:24px;border-radius:50%;background:#ea580c;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</span>
                            <div>
                                Bấm <strong>"Thêm"</strong> (Add) ở góc trên bên phải để hoàn tất. Lối tắt sẽ xuất hiện ngay trên màn hình chính của bạn!
                            </div>
                        </div>
                    </div>

                    ${isIPad ? arrowIndicator : ''}

                    <button onclick="document.getElementById('qmathIosInstallModal').style.display='none'" style="margin-top:18px;width:100%;padding:12px;background:linear-gradient(135deg,#ea580c,#f59e0b);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 16px rgba(234,88,12,0.35);">
                        Tôi đã hiểu
                    </button>

                    ${!isIPad ? arrowIndicator : ''}
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            modal.style.display = 'flex';
        }
    }

    // Modal hướng dẫn Android khi chưa có event beforeinstallprompt
    function showAndroidGuideModal() {
        let modal = document.getElementById('qmathAndroidInstallModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'qmathAndroidInstallModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;animation:qmathFadeIn 0.25s ease-out;';
            modal.innerHTML = `
                <div style="background:#fff;color:#1e293b;border-radius:24px;max-width:440px;width:100%;padding:22px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);font-family:Inter,system-ui,sans-serif;position:relative;animation:qmathSlideUp 0.3s cubic-bezier(0.16,1,0.3,1);">
                    <button onclick="document.getElementById('qmathAndroidInstallModal').style.display='none'" style="position:absolute;top:16px;right:16px;width:32px;height:32px;border:none;background:#f1f5f9;color:#64748b;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;">✕</button>
                    
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                        <img src="/app-icon-192.png" onerror="this.src='/apple-touch-icon.png'" style="width:48px;height:48px;border-radius:12px;box-shadow:0 4px 10px rgba(234,88,12,0.3);object-fit:cover;">
                        <div>
                            <h3 style="margin:0;font-size:17px;font-weight:800;color:#0f172a;">Cài đặt Toán Thầy Choang</h3>
                            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Dành cho thiết bị Android</p>
                        </div>
                    </div>

                    <div style="display:flex;flex-direction:column;gap:13px;font-size:13px;color:#334155;line-height:1.45;margin-top:14px;">
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <span style="width:24px;height:24px;border-radius:50%;background:#ea580c;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</span>
                            <div>
                                Nhấn vào biểu tượng <strong>Menu 3 chấm</strong> <span style="display:inline-flex;align-items:center;background:#f1f5f9;color:#0f172a;padding:2px 8px;border-radius:8px;font-weight:700;"><i class="fa-solid fa-ellipsis-vertical" style="margin-right:4px;"></i> Menu</span> ở góc trên bên phải trình duyệt.
                            </div>
                        </div>

                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <span style="width:24px;height:24px;border-radius:50%;background:#ea580c;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</span>
                            <div>
                                Chọn mục <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào màn hình chính"</strong>.
                            </div>
                        </div>

                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <span style="width:24px;height:24px;border-radius:50%;background:#ea580c;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</span>
                            <div>
                                Bấm <strong>"Cài đặt"</strong> để xác nhận. Ứng dụng sẽ tự động được thêm ra màn hình chính!
                            </div>
                        </div>
                    </div>

                    <button onclick="document.getElementById('qmathAndroidInstallModal').style.display='none'" style="margin-top:18px;width:100%;padding:12px;background:linear-gradient(135deg,#ea580c,#f59e0b);color:#fff;border:none;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 16px rgba(234,88,12,0.35);">
                        Tôi đã hiểu
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            modal.style.display = 'flex';
        }
    }

    // Hàm gọi khi nhấn nút "Cài đặt"
    window.triggerAppInstall = async function() {
        if (deferredInstallPrompt) {
            try {
                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                if (choice && choice.outcome === 'accepted') {
                    hideBanner(true);
                }
                deferredInstallPrompt = null;
            } catch(e) {
                console.warn("Prompt error:", e);
                if (isIOS) showIosGuideModal();
                else showAndroidGuideModal();
            }
        } else {
            if (isIOS) {
                showIosGuideModal();
            } else {
                showAndroidGuideModal();
            }
        }
    };

    function hideBanner(persist = true) {
        const banner = document.getElementById('qmathInstallBanner');
        if (banner) {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(20px)';
            setTimeout(() => banner.remove(), 300);
        }
        if (persist) {
            try {
                // Tạm ẩn trong 2 ngày nếu người dùng đóng
                localStorage.setItem('qmath_install_dismissed_until', String(Date.now() + 2 * 24 * 60 * 60 * 1000));
            } catch(e) {}
        }
    }

    // Khởi tạo hiển thị banner
    function initInstallBanner() {
        if (!isMobileOrTablet) return;

        try {
            const dismissedUntil = localStorage.getItem('qmath_install_dismissed_until');
            if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
                return;
            }
        } catch(e) {}

        // Đợi 1.5 giây sau khi mở trang để người dùng bắt đầu lướt rồi mới hiện lời nhắc
        setTimeout(() => {
            if (document.getElementById('qmathInstallBanner')) return;

            if (!document.getElementById('qmathInstallStyles')) {
                const style = document.createElement('style');
                style.id = 'qmathInstallStyles';
                style.textContent = `
                    @keyframes qmathSlideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                    @keyframes qmathFadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes qmathBounceUp { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
                    @keyframes qmathBounceDown { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(7px); } }
                `;
                document.head.appendChild(style);
            }

            const banner = document.createElement('div');
            banner.id = 'qmathInstallBanner';
            banner.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:99999;max-width:440px;margin:0 auto;background:rgba(255,255,255,0.97);backdrop-filter:blur(10px);border:1px solid #fed7aa;box-shadow:0 20px 40px -10px rgba(234,88,12,0.25), 0 0 0 1px rgba(234,88,12,0.1);border-radius:20px;padding:12px 14px;display:flex;align-items:center;gap:12px;font-family:Inter,system-ui,sans-serif;animation:qmathSlideUp 0.4s cubic-bezier(0.16,1,0.3,1);transition:all 0.3s ease;';

            banner.innerHTML = `
                <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#f97316,#ea580c);padding:2px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 10px rgba(234,88,12,0.3);">
                    <img src="/app-icon-192.png" onerror="this.src='/apple-touch-icon.png'" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" alt="QMath">
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:13.5px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Toán Thầy Choang</span>
                        <span style="font-size:9.5px;font-weight:700;background:#ffedd5;color:#c2410c;padding:1px 6px;border-radius:20px;white-space:nowrap;">Lối tắt</span>
                    </div>
                    <p style="margin:2px 0 0;font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Cài phần mềm về máy để mở nhanh và mượt hơn</p>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                    <button id="qmathInstallActionBtn" onclick="window.triggerAppInstall()" style="background:linear-gradient(135deg,#ea580c,#f59e0b);color:#fff;border:none;padding:8px 13px;border-radius:12px;font-size:12.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:5px;box-shadow:0 4px 12px rgba(234,88,12,0.35);transition:transform 0.1s active;">
                        <i class="fa-solid fa-download"></i> Cài đặt
                    </button>
                    <button onclick="(function(){ const b = document.getElementById('qmathInstallBanner'); if(b){ b.style.opacity='0'; b.style.transform='translateY(20px)'; setTimeout(()=>b.remove(),300); try{localStorage.setItem('qmath_install_dismissed_until', String(Date.now()+2*24*60*60*1000));}catch(e){} } })()" style="background:none;border:none;color:#94a3b8;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;" title="Đóng">
                        ✕
                    </button>
                </div>
            `;

            document.body.appendChild(banner);
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInstallBanner);
    } else {
        initInstallBanner();
    }
})();
