// ÄÄƒng kÃ½ Service Worker thá»‘ng nháº¥t vÃ  kÃ­ch hoáº¡t tá»©c thÃ¬ phiÃªn báº£n má»›i
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

    // Tá»± Ä‘á»™ng dá»n dáº¹p cÃ¡c cache phiÃªn báº£n cÅ© Ä‘á»ƒ náº¡p ngay báº£n má»›i v67
    const CURRENT_VERSION = 'qmath-v146';
    if ('caches' in window) {
        caches.keys().then((keys) => {
            keys.forEach((key) => {
                if (key.startsWith('qmath-') && !key.startsWith(CURRENT_VERSION)) {
                    caches.delete(key);
                }
            });
        }).catch(() => {});
    }

    const registration = await navigator.serviceWorker.register('/sw.js?v=146', { updateViaCache: 'none' });
    registration.update().catch(() => {});
})().catch(() => {});
