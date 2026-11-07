// Đăng ký Service Worker thống nhất và kích hoạt tức thì phiên bản mới
(async () => {
    if (!('serviceWorker' in navigator)) return;
    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

    if (isLocal) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key.startsWith('qmath-')).map((key) => caches.delete(key)));
        }
        return;
    }

    // Tự động dọn dẹp các cache phiên bản cũ để nạp ngay bản mới v67
    const CURRENT_VERSION = 'qmath-v135';
    if ('caches' in window) {
        caches.keys().then((keys) => {
            keys.forEach((key) => {
                if (key.startsWith('qmath-') && !key.startsWith(CURRENT_VERSION)) {
                    caches.delete(key);
                }
            });
        }).catch(() => {});
    }

    const registration = await navigator.serviceWorker.register('/sw.js?v=135', { updateViaCache: 'none' });
    registration.update().catch(() => {});
})().catch(() => {});
