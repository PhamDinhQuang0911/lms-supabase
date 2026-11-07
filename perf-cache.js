// Browser cache for non-sensitive, read-heavy LMS data.
export function readCache(key, maxAgeMs) {
    try {
        const entry = JSON.parse(sessionStorage.getItem(`qmath-cache:${key}`));
        if (!entry || Date.now() - entry.savedAt > maxAgeMs) return null;
        return entry.value;
    } catch (_) { return null; }
}

export function writeCache(key, value) {
    try { sessionStorage.setItem(`qmath-cache:${key}`, JSON.stringify({ savedAt: Date.now(), value })); }
    catch (_) { /* Storage can be disabled or full. */ }
}
