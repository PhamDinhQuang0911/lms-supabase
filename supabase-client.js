// ================================================================
// SUPABASE CLIENT (LMS QMATH)
// ================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://cuniqanbumcrqcdlcvad.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o";

// ================================================================
// HỆ THỐNG ĐỒNG BỘ THỜI GIAN THỰC TỪ SERVER (CHỐNG LỆCH GIỜ THIẾT BỊ)
// ================================================================
let serverTimeOffset = 0;
let isServerTimeCalibrated = false;

export function updateServerTimeFromHeader(dateHeader, rtt = 0) {
    if (!dateHeader) return;
    try {
        const serverMs = new Date(dateHeader).getTime();
        if (!isNaN(serverMs)) {
            const adjustedServerMs = serverMs + Math.round(rtt / 2);
            serverTimeOffset = adjustedServerMs - Date.now();
            isServerTimeCalibrated = true;
            if (typeof window !== 'undefined') {
                window.serverTimeOffset = serverTimeOffset;
                window.isServerTimeCalibrated = true;
                if (Math.abs(serverTimeOffset) > 60000) {
                    console.info(`[ServerTime] Đã hiệu chuẩn giờ thiết bị lệch ${Math.round(serverTimeOffset / 1000)}s so với máy chủ.`);
                }
            }
        }
    } catch (e) {}
}

export async function calibrateServerTime() {
    try {
        const t0 = Date.now();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?limit=0`, {
            method: 'HEAD',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            cache: 'no-store'
        });
        const dateHdr = res.headers.get('date');
        if (dateHdr) {
            updateServerTimeFromHeader(dateHdr, Date.now() - t0);
            return true;
        }
    } catch (e) {
        console.warn("[ServerTime] Hiệu chuẩn giờ server lỗi:", e);
    }
    return false;
}

export function getServerNow() {
    const offset = (typeof window !== 'undefined' && typeof window.serverTimeOffset === 'number')
        ? window.serverTimeOffset
        : serverTimeOffset;
    return new Date(Date.now() + offset);
}

export function parseDateSafe(dateVal) {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
    if (typeof dateVal === 'number') return new Date(dateVal);
    if (typeof dateVal === 'string') {
        let s = dateVal.trim();
        if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2})?$/.test(s)) {
            s = s.replace(' ', 'T') + '+07:00';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

// Hook fetch để tự động cập nhật offset trên mỗi yêu cầu gửi tới Supabase
const customFetch = async (input, init) => {
    const t0 = Date.now();
    const res = await fetch(input, init);
    const dateHdr = res.headers.get('date');
    if (dateHdr) {
        updateServerTimeFromHeader(dateHdr, Date.now() - t0);
    }
    return res;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    global: {
        fetch: customFetch
    }
});

// Gắn vào window để các script truyền thống có thể gọi trực tiếp
if (typeof window !== 'undefined') {
    window.supabase = supabase;
    window.getServerNow = getServerNow;
    window.calibrateServerTime = calibrateServerTime;
    window.parseDateSafe = parseDateSafe;
    window.serverTimeOffset = 0;
    window.isServerTimeCalibrated = false;
    calibrateServerTime();
}
