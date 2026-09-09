// Đăng ký Service Worker thống nhất. Trên localhost luôn tắt cache offline để
// giáo viên thấy ngay mã mới sau khi tải lại trang.
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

    const registration = await navigator.serviceWorker.register('/sw.js?v=10', { updateViaCache: 'none' });
    registration.update().catch(() => {});
})().catch(() => {});
