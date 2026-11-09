// supabase-db-compat.js
// TOÀN BỘ TẦNG TƯƠNG THÍCH ĐỘC LẬP TỪ FIREBASE SANG SUPABASE POSTGRESQL & REALTIME
import { supabase, getServerNow, calibrateServerTime, parseDateSafe } from './supabase-client.js?v=27';

export { supabase, getServerNow, calibrateServerTime, parseDateSafe };

// ==========================================
// 1. APP & STORAGE & FUNCTIONS COMPAT
// ==========================================
export function initializeApp(config, name = '[DEFAULT]') {
    return { name, config };
}
export function deleteApp(app) {
    return Promise.resolve();
}
export function getFirestore(app) {
    return { name: 'supabase_db' };
}
export function getStorage(app) {
    return { name: 'supabase_storage' };
}
export function ref(storage, path) {
    return { storage, path };
}
export async function uploadBytes(ref, file) {
    return { ref };
}
export async function getDownloadURL(ref) {
    return '';
}
export async function deleteObject(ref) {
    return true;
}
export function getFunctions(app) {
    return { name: 'supabase_functions' };
}
export function httpsCallable(functions, name) {
    return async (data) => {
        if (name === 'resetStudentPassword' || name === 'updateStudentPassword') {
            const uid = data.studentUid || data.uid;
            const newPassword = data.newPassword;
            if (uid && newPassword) {
                await updatePassword({ uid: uid }, newPassword);
                return { data: { success: true } };
            }
        }
        return { data: {} };
    };
}

// ==========================================
// 2. AUTHENTICATION COMPAT (DÙNG SUPABASE USERS TABLE)
// ==========================================
const AUTH_STORAGE_KEY = 'lms_supabase_current_user';
const SESSION_SECRET_SALT = 'QM_SHIELD_2026_V5_9981_SECRET';
const ROOT_ADMIN_EMAILS = ["phamdinhquang0911@gmail.com", "phamngockhanh.942001@gmail.com", "phamngockhanh.942002@gmail.com", "phamdinhquang1@gmail.com", "phamdinhquang1@hocsinh.com", "phamdinhquang1"];

function computeUserSessionSig(u) {
    if (!u || !(u.uid || u.id)) return '';
    const uid = String(u.uid || u.id || '');
    const email = String(u.email || '').trim().toLowerCase();
    const role = String(u.role || 'student').trim().toLowerCase();
    const raw = `${uid}|${email}|${role}|${SESSION_SECRET_SALT}`;
    let h1 = 0xdeadbeef ^ raw.length, h2 = 0x41c6ce57 ^ raw.length;
    for (let i = 0, ch; i < raw.length; i++) {
        ch = raw.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'qm5_' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '_' + (h1 >>> 0).toString(16);
}

function saveSignedUserSession(userObj) {
    if (!userObj) return null;
    const cleanCopy = { ...userObj };
    delete cleanCopy.password;
    cleanCopy._sig = computeUserSessionSig(cleanCopy);
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(cleanCopy));
    } catch (e) {}
    return cleanCopy;
}

export const DEFAULT_ADMIN = {
    uid: 'toPSzoUgYqduYdZrzj8QjARQoOW2',
    id: 'toPSzoUgYqduYdZrzj8QjARQoOW2',
    email: 'phamngockhanh.942002@gmail.com',
    displayName: 'Phạm Đình Quang',
    role: 'admin',
    photoURL: 'https://ui-avatars.com/api/?name=Pham+Dinh+Quang&background=0D8ABC&color=fff'
};

class SupabaseAuth {
    constructor(isDefault = true) {
        this.isDefault = isDefault;
        this.listeners = [];
        if (isDefault) {
            const saved = localStorage.getItem(AUTH_STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    delete parsed.password;
                    const expectedSig = computeUserSessionSig(parsed);
                    if (parsed._sig && parsed._sig !== expectedSig) {
                        console.warn("[QMath Auth] Phát hiện can thiệp trái phép vào phiên localStorage! Đã hủy phiên.");
                        localStorage.removeItem(AUTH_STORAGE_KEY);
                        this.currentUser = null;
                    } else {
                        if (!parsed._sig) {
                            parsed._sig = expectedSig;
                            saveSignedUserSession(parsed);
                        }
                        this.currentUser = parsed;
                        this._verifyElevatedSessionAsync(parsed);
                    }
                } catch (e) {
                    this.currentUser = null;
                }
            } else {
                this.currentUser = null;
            }
        } else {
            this.currentUser = null;
        }
    }

    async _verifyElevatedSessionAsync(u) {
        if (!u || !u.uid) return;
        const claimedRole = String(u.role || 'student').toLowerCase();
        if (!['admin', 'teacher', 'super_admin'].includes(claimedRole)) return;
        const emailLower = String(u.email || '').trim().toLowerCase();
        if (ROOT_ADMIN_EMAILS.includes(emailLower)) return;
        try {
            const { data: row } = await supabase.from('users').select('id, email, role').eq('id', u.uid).maybeSingle();
            if (row && row.role === 'student') {
                const { data: adm } = await supabase.from('admin_accounts').select('id').or(`email.ilike.${emailLower},id.eq.${u.uid}`).limit(1);
                if (!adm || adm.length === 0) {
                    console.warn("[QMath Auth] Phiên không có quyền quản trị trên máy chủ, hạ quyền về học sinh.");
                    u.role = 'student';
                    this.currentUser = saveSignedUserSession(u);
                    this._notify();
                }
            }
        } catch (_) {}
    }

    _notify() {
        this.listeners.forEach(cb => {
            try { cb(this.currentUser); } catch (e) { console.error(e); }
        });
    }
}

const authInstance = new SupabaseAuth(true);

export function getAuth(app) {
    if (app && app.name && app.name !== '[DEFAULT]') {
        return new SupabaseAuth(false);
    }
    return authInstance;
}

export function onAuthStateChanged(auth, callback) {
    auth.listeners.push(callback);
    setTimeout(() => {
        callback(auth.currentUser);
    }, 10);
    return () => {
        auth.listeners = auth.listeners.filter(cb => cb !== callback);
    };
}

export async function signInWithEmailAndPassword(auth, email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const usernamePart = cleanEmail.split('@')[0];
    const hocsinhEmail = `${usernamePart}@hocsinh.com`;
    const cleanPass = (password !== undefined && password !== null) ? String(password).trim() : '';

    // 1. Tìm trong bảng users (hỗ trợ cả email chuẩn, email dạng @hocsinh.com, và id)
    let userRow = null;
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .or(`email.ilike.${cleanEmail},email.ilike.${hocsinhEmail},id.eq.${cleanEmail},id.eq.${usernamePart}`);

        if (!error && users && users.length > 0) {
            // Nếu có nhiều hơn 1 tài khoản (do lịch sử di chuyển), ưu tiên tài khoản khớp chính xác mật khẩu
            if (users.length > 1 && cleanPass) {
                const passMatch = users.find(u => {
                    const expected = u.password || (u.raw_data && u.raw_data.password);
                    return expected && String(expected).trim() === cleanPass;
                });
                userRow = passMatch || users[0];
            } else {
                userRow = users[0];
            }
        }
    } catch(e) {
        console.warn("Lỗi tìm người dùng:", e);
    }

    // 2. Nếu chưa thấy, tìm tiếp theo số điện thoại (phòng trường hợp người dùng nhập SĐT trực tiếp)
    if (!userRow && cleanEmail) {
        try {
            const { data: usersByPhone } = await supabase
                .from('users')
                .select('*')
                .eq('phone', cleanEmail)
                .limit(1);
            if (usersByPhone && usersByPhone.length > 0) {
                userRow = usersByPhone[0];
            }
        } catch(e) {}
    }

    // 3. Nếu vẫn chưa thấy, kiểm tra trong bảng admin_accounts
    if (!userRow && cleanEmail) {
        try {
            const { data: admins } = await supabase
                .from('admin_accounts')
                .select('*')
                .or(`email.ilike.${cleanEmail},id.eq.${cleanEmail}`)
                .limit(1);
            if (admins && admins.length > 0) {
                const a = admins[0];
                userRow = {
                    id: a.id,
                    email: a.email,
                    display_name: a.display_name,
                    role: a.role || 'admin',
                    password: a.password || (a.raw_data && a.raw_data.password) || null
                };
            }
        } catch(e) {}
    }

    // 3.5. Kiểm tra trong configurations/admin_roles nếu vẫn chưa thấy
    if (!userRow && cleanEmail) {
        try {
            const { data: cfgDoc } = await supabase
                .from('configurations')
                .select('raw_data')
                .eq('id', 'admin_roles')
                .maybeSingle();
            if (cfgDoc && cfgDoc.raw_data && Array.isArray(cfgDoc.raw_data.accounts)) {
                const foundAdmin = cfgDoc.raw_data.accounts.find(a => (a.email || '').toLowerCase() === cleanEmail || (a.id || '').toLowerCase() === cleanEmail);
                if (foundAdmin) {
                    userRow = {
                        id: foundAdmin.id || ('admin_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')),
                        email: foundAdmin.email || cleanEmail,
                        display_name: foundAdmin.displayName || cleanEmail.split('@')[0],
                        role: foundAdmin.role === 'super_admin' ? 'admin' : 'teacher',
                        password: foundAdmin.password || null
                    };
                }
            }
        } catch(e) {}
    }

    // 4. Fallback đặc biệt cho tài khoản Quản trị viên hệ thống (Admin)
    const ADMIN_EMAILS = ROOT_ADMIN_EMAILS;
    if (!userRow && ADMIN_EMAILS.includes(cleanEmail)) {
        userRow = {
            id: 'admin_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'),
            email: cleanEmail,
            display_name: 'Phạm Đình Quang (Admin)',
            role: 'admin',
            password: null
        };
    }

    if (!userRow) {
        throw new Error("Tài khoản không tồn tại trên hệ thống!");
    }

    if (!cleanPass) {
        throw new Error("Vui lòng nhập mật khẩu!");
    }

    // 5. Kiểm tra mật khẩu (bắt buộc có mật khẩu; tự động khóa mật khẩu ở lần đăng nhập đầu nếu tài khoản di chuyển từ Firebase chưa lưu mật khẩu)
    const expectedPass = userRow.password || (userRow.raw_data && userRow.raw_data.password);
    if (expectedPass) {
        if (String(expectedPass).trim() !== cleanPass) {
            throw new Error("Mật khẩu không chính xác!");
        }
    } else {
        if (cleanPass.length < 4) {
            throw new Error("Mật khẩu không chính xác!");
        }
        try {
            if (userRow.id) {
                await supabase.from('users').update({ password: cleanPass }).eq('id', userRow.id);
            }
        } catch (_) {}
    }

    const userObj = {
        uid: userRow.id,
        id: userRow.id,
        email: userRow.email || `${userRow.id}@hocsinh.com`,
        displayName: userRow.display_name || userRow.email,
        photoURL: userRow.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userRow.display_name || userRow.email)}&background=random`,
        role: userRow.role || 'student',
        phone: userRow.phone,
        qpoints: userRow.qpoints || 0,
        sbd: userRow.sbd || ''
    };

    if (auth.isDefault !== false) {
        auth.currentUser = saveSignedUserSession(userObj);
    } else {
        auth.currentUser = userObj;
    }
    auth._notify();
    return { user: auth.currentUser };
}

export async function signInWithQrToken(auth, qrToken) {
    if (!qrToken || typeof qrToken !== 'string') {
        throw new Error("Mã QR không hợp lệ!");
    }
    let token = qrToken.trim();
    // Nếu quét cả URL (VD: https://qmath.io.vn/index.html?qr_token=xyz), tự bóc tách lấy giá trị token
    if (token.includes('?')) {
        try {
            const originUrl = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'https://qmath.io.vn';
            const urlObj = new URL(token, originUrl);
            token = urlObj.searchParams.get('qr_token') || urlObj.searchParams.get('qr_login') || token;
        } catch(e) {
            const m = token.match(/[?&](?:qr_token|qr_login)=([^&#]+)/);
            if (m) token = decodeURIComponent(m[1]);
        }
    }
    token = token.trim();
    if (!token) {
        throw new Error("Mã QR trống hoặc không đúng định dạng!");
    }

    // 1. Tìm user trong bảng users có raw_data->>qrLoginToken khớp token
    let userRow = null;
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('raw_data->>qrLoginToken', token)
            .limit(1);

        if (!error && users && users.length > 0) {
            userRow = users[0];
        }
    } catch (e) {
        console.warn("[signInWithQrToken] Lỗi tìm user theo qrLoginToken:", e);
    }

    // 1.2 Fallback tìm theo qr_login_token nếu có
    if (!userRow) {
        try {
            const { data: users2 } = await supabase
                .from('users')
                .select('*')
                .eq('raw_data->>qr_login_token', token)
                .limit(1);
            if (users2 && users2.length > 0) {
                userRow = users2[0];
            }
        } catch(e) {}
    }

    if (!userRow) {
        throw new Error("Mã QR này không tồn tại, đã hết hạn hoặc đã được Giáo viên cấp mã mới!");
    }

    const raw = (userRow.raw_data && typeof userRow.raw_data === 'object') ? userRow.raw_data : {};
    const userObj = {
        uid: userRow.id,
        id: userRow.id,
        email: userRow.email || `${userRow.id}@hocsinh.com`,
        displayName: userRow.display_name || raw.displayName || userRow.email,
        photoURL: userRow.photo_url || raw.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userRow.display_name || userRow.email)}&background=random`,
        role: userRow.role || raw.role || 'student',
        phone: userRow.phone || raw.phone,
        qpoints: userRow.qpoints || 0,
        sbd: userRow.sbd || raw.sbd || '',
        authType: 'qr_token'
    };

    if (auth.isDefault !== false) {
        auth.currentUser = saveSignedUserSession(userObj);
    } else {
        auth.currentUser = userObj;
    }
    auth._notify();

    // Cập nhật last_login
    try {
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', userRow.id);
    } catch(e) {}

    return { user: userObj };
}

export function generateQrLoginToken(studentId = '') {
    const rand1 = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    const rand2 = Math.random().toString(36).substring(2, 10);
    return `qm_qr_${rand1}${time}${rand2}`;
}

export async function getOrCreateStudentQrToken(studentId) {
    if (!studentId) return null;
    try {
        const { data: userRow } = await supabase
            .from('users')
            .select('id, raw_data')
            .eq('id', studentId)
            .maybeSingle();

        if (userRow && userRow.raw_data && userRow.raw_data.qrLoginToken) {
            return userRow.raw_data.qrLoginToken;
        }

        const newToken = generateQrLoginToken(studentId);
        const currentRaw = (userRow && userRow.raw_data) ? userRow.raw_data : {};
        const updatedRaw = { ...currentRaw, qrLoginToken: newToken, qrUpdatedAt: new Date().toISOString() };

        await supabase
            .from('users')
            .update({ raw_data: updatedRaw })
            .eq('id', studentId);

        return newToken;
    } catch(e) {
        console.warn("[getOrCreateStudentQrToken] Lỗi:", e);
        return null;
    }
}

export async function resetStudentQrToken(studentId) {
    if (!studentId) throw new Error("Thiếu ID học sinh!");
    const newToken = generateQrLoginToken(studentId);
    try {
        const { data: userRow } = await supabase
            .from('users')
            .select('id, raw_data')
            .eq('id', studentId)
            .maybeSingle();

        const currentRaw = (userRow && userRow.raw_data) ? userRow.raw_data : {};
        const updatedRaw = { ...currentRaw, qrLoginToken: newToken, qrUpdatedAt: new Date().toISOString() };

        await supabase
            .from('users')
            .update({ raw_data: updatedRaw })
            .eq('id', studentId);

        return newToken;
    } catch (e) {
        console.error("[resetStudentQrToken] Lỗi đặt lại mã QR:", e);
        throw e;
    }
}

export async function createUserWithEmailAndPassword(auth, email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password !== undefined && password !== null) ? String(password).trim() : '';

    if (!cleanEmail) {
        const err = new Error("Email hoặc tên đăng nhập không được để trống!");
        err.code = 'auth/invalid-email';
        throw err;
    }
    if (!cleanPass || cleanPass.length < 6) {
        const err = new Error("Mật khẩu phải có ít nhất 6 ký tự!");
        err.code = 'auth/weak-password';
        throw err;
    }

    const usernamePart = cleanEmail.split('@')[0];
    const hocsinhEmail = `${usernamePart}@hocsinh.com`;

    // 1. Kiểm tra nghiêm ngặt trùng lặp trong bảng 'users' (cả email, username, id)
    try {
        const { data: existingUsers } = await supabase
            .from('users')
            .select('id, email')
            .or(`email.ilike.${cleanEmail},email.ilike.${hocsinhEmail},id.eq.${cleanEmail},id.eq.${usernamePart}`)
            .limit(1);

        if (existingUsers && existingUsers.length > 0) {
            const err = new Error("Tên đăng nhập hoặc Email này đã tồn tại trên hệ thống! Vui lòng chọn tên đăng nhập khác.");
            err.code = 'auth/email-already-in-use';
            throw err;
        }
    } catch (e) {
        if (e.code === 'auth/email-already-in-use') throw e;
        console.warn("Lỗi kiểm tra trùng lặp users:", e);
    }

    // 2. Kiểm tra trùng lặp trong bảng 'admin_accounts'
    try {
        const { data: existingAdmins } = await supabase
            .from('admin_accounts')
            .select('id, email')
            .or(`email.ilike.${cleanEmail},email.ilike.${hocsinhEmail},id.eq.${cleanEmail},id.eq.${usernamePart}`)
            .limit(1);

        if (existingAdmins && existingAdmins.length > 0) {
            const err = new Error("Tên đăng nhập hoặc Email này đã tồn tại trên hệ thống! Vui lòng chọn tên đăng nhập khác.");
            err.code = 'auth/email-already-in-use';
            throw err;
        }
    } catch (e) {
        if (e.code === 'auth/email-already-in-use') throw e;
        console.warn("Lỗi kiểm tra trùng lặp admin_accounts:", e);
    }

    // 3. Tiến hành tạo mới trong Supabase PostgreSQL
    const newId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    const newUser = {
        id: newId,
        email: cleanEmail,
        password: cleanPass,
        role: 'student',
        display_name: usernamePart,
        created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('users').insert(newUser);
    if (error) {
        console.error("Lỗi tạo người dùng:", error);
        throw error;
    }

    const userObj = {
        uid: newId,
        id: newId,
        email: cleanEmail,
        displayName: newUser.display_name,
        role: 'student'
    };

    if (auth) {
        if (auth.isDefault !== false) {
            auth.currentUser = saveSignedUserSession(userObj);
            if (auth._notify) auth._notify();
        } else {
            auth.currentUser = userObj;
        }
    }

    return { user: userObj };
}

export async function signOut(auth) {
    if (!auth || auth.isDefault !== false) {
        if (auth) auth.currentUser = null;
        localStorage.removeItem(AUTH_STORAGE_KEY);
        if (auth && auth._notify) auth._notify();
    }
    return Promise.resolve();
}

export async function updateProfile(user, profile) {
    if (!user) return;
    const updates = {};
    if (profile.displayName) updates.display_name = profile.displayName;
    if (profile.photoURL) updates.photo_url = profile.photoURL;

    await supabase.from('users').update(updates).eq('id', user.uid || user.id);
    if (authInstance.currentUser) {
        Object.assign(authInstance.currentUser, profile);
        authInstance.currentUser = saveSignedUserSession(authInstance.currentUser);
    }
}

export async function updatePassword(user, newPassword) {
    if (!user || !newPassword) return;
    const cleanPass = String(newPassword).trim();
    if (!cleanPass) return;

    const userId = user.uid || user.id || '';
    const userEmail = (user.email || '').trim().toLowerCase();
    const usernamePart = userEmail.split('@')[0];

    // 1. Cập nhật bảng 'users' (cả cột password và raw_data.password)
    try {
        let queryUsers = supabase.from('users').select('id, raw_data');
        if (userId && userEmail) {
            queryUsers = queryUsers.or(`id.eq.${userId},email.ilike.${userEmail}`);
        } else if (userId) {
            queryUsers = queryUsers.eq('id', userId);
        } else if (userEmail) {
            queryUsers = queryUsers.ilike('email', userEmail);
        }
        const { data: usersFound } = await queryUsers;
        if (usersFound && usersFound.length > 0) {
            for (const u of usersFound) {
                const currRaw = (u.raw_data && typeof u.raw_data === 'object') ? u.raw_data : {};
                const updatedRaw = { ...currRaw, password: cleanPass };
                await supabase.from('users').update({
                    password: cleanPass,
                    raw_data: updatedRaw,
                    updated_at: new Date().toISOString()
                }).eq('id', u.id);
            }
        }
    } catch (e) {
        console.warn("Lỗi cập nhật mật khẩu bảng users:", e);
    }

    // 2. Cập nhật bảng 'admin_accounts' (nếu là tài khoản giáo viên/admin)
    try {
        if (userEmail || userId) {
            const cleanDocId = userEmail ? userEmail.replace(/[@.]/g, '_') : '';
            const conds = [];
            if (userId) conds.push(`id.eq.${userId}`);
            if (cleanDocId) conds.push(`id.eq.${cleanDocId}`);
            if (userEmail) conds.push(`email.ilike.${userEmail}`);
            const { data: adminsFound } = await supabase.from('admin_accounts').select('id, raw_data').or(conds.join(','));
            if (adminsFound && adminsFound.length > 0) {
                for (const a of adminsFound) {
                    const currRaw = (a.raw_data && typeof a.raw_data === 'object') ? a.raw_data : {};
                    const updatedRaw = { ...currRaw, password: cleanPass };
                    await supabase.from('admin_accounts').update({
                        raw_data: updatedRaw,
                        updated_at: new Date().toISOString()
                    }).eq('id', a.id);
                }
            }
        }
    } catch (e) {
        console.warn("Lỗi cập nhật mật khẩu bảng admin_accounts:", e);
    }

    // 3. Cập nhật bảng 'configurations' id='admin_roles' (danh sách tài khoản giáo viên)
    try {
        const { data: cfgDoc } = await supabase
            .from('configurations')
            .select('raw_data')
            .eq('id', 'admin_roles')
            .maybeSingle();
        if (cfgDoc && cfgDoc.raw_data && Array.isArray(cfgDoc.raw_data.accounts)) {
            let changed = false;
            const updatedAccounts = cfgDoc.raw_data.accounts.map(acc => {
                const matchEmail = userEmail && (acc.email || '').toLowerCase() === userEmail;
                const matchId = userId && (acc.id === userId || acc.id === 'admin_' + userEmail.replace(/[^a-zA-Z0-9]/g, '_'));
                if (matchEmail || matchId) {
                    changed = true;
                    return { ...acc, password: cleanPass };
                }
                return acc;
            });
            if (changed) {
                await supabase.from('configurations').upsert({
                    id: 'admin_roles',
                    raw_data: { ...cfgDoc.raw_data, accounts: updatedAccounts, updatedAt: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
            }
        }
    } catch (e) {
        console.warn("Lỗi cập nhật mật khẩu admin_roles:", e);
    }

    // 4. Đồng bộ mật khẩu mới vào tất cả lớp học trong bảng 'classes' (để giáo viên xem danh sách thấy ngay mật khẩu mới)
    try {
        const { data: classesList } = await supabase
            .from('classes')
            .select('id, students, raw_data');
        if (classesList && Array.isArray(classesList)) {
            for (const c of classesList) {
                const stList = Array.isArray(c.students) ? c.students : (c.raw_data && Array.isArray(c.raw_data.students) ? c.raw_data.students : []);
                let classChanged = false;
                const newStudents = stList.map(s => {
                    const matchUid = userId && s.uid === userId;
                    const matchEmail = userEmail && (s.email || '').toLowerCase() === userEmail;
                    const matchUsername = (s.username && usernamePart && s.username.toLowerCase() === usernamePart);
                    if (matchUid || matchEmail || matchUsername) {
                        classChanged = true;
                        return { ...s, password: cleanPass };
                    }
                    return s;
                });
                if (classChanged) {
                    const currRaw = (c.raw_data && typeof c.raw_data === 'object') ? c.raw_data : {};
                    await supabase.from('classes').update({
                        students: newStudents,
                        raw_data: { ...currRaw, students: newStudents }
                    }).eq('id', c.id);
                }
            }
        }
    } catch (e) {
        console.warn("Lỗi đồng bộ mật khẩu học sinh vào classes:", e);
    }

    // 5. Cập nhật phiên đăng nhập hiện tại (không lưu mật khẩu明文 vào localStorage)
    const currentStored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (currentStored) {
        try {
            const parsed = JSON.parse(currentStored);
            if ((userId && parsed.id === userId) || (userEmail && (parsed.email || '').toLowerCase() === userEmail)) {
                delete parsed.password;
                saveSignedUserSession(parsed);
            }
        } catch (e) {}
    }
}

export class GoogleAuthProvider {}
export async function signInWithPopup(auth, provider) {
    throw new Error("Vui lòng đăng nhập bằng Email/SĐT và Mật khẩu!");
}
export async function sendPasswordResetEmail(auth, email) {
    if (!email) throw new Error("Vui lòng nhập email!");
    try {
        if (supabase && supabase.auth && typeof supabase.auth.resetPasswordForEmail === 'function') {
            await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
        }
    } catch (e) {
        console.warn("Supabase resetPasswordForEmail:", e);
    }
    return true;
}

export class EmailAuthProvider {
    static credential(email, password) { return { email, password }; }
}


// ==========================================
// 4. PARENT WATCH & LESSON NOTE HELPERS
// ==========================================
export function generateParentWatchToken(studentId = '') {
    const r1 = Math.random().toString(36).substring(2, 10);
    const t = Date.now().toString(36);
    const r2 = Math.random().toString(36).substring(2, 10);
    return `qm_pw_${r1}${t}${r2}`;
}

export async function getOrCreateParentWatchToken({ studentId, studentName = '', classId = '', className = '', examId = '', examTitle = '', forceNew = false } = {}) {
    if (!studentId) return null;
    const docId = examId ? `${studentId}_${examId}` : `student_${studentId}`;
    try {
        if (!forceNew) {
            const snap = await getDoc(doc(null, 'parent_watch_tokens', docId));
            if (snap.exists() && snap.data().token && !snap.data().revoked) {
                return snap.data().token;
            }
            // Nếu chưa có theo exam, kiểm tra token cố định của học sinh trên users
            if (!examId) {
                const { data: userRow } = await supabase.from('users').select('id, raw_data').eq('id', studentId).maybeSingle();
                if (userRow && userRow.raw_data && userRow.raw_data.parentWatchToken) {
                    const tok = userRow.raw_data.parentWatchToken;
                    await setDoc(doc(null, 'parent_watch_tokens', docId), {
                        token: tok,
                        scope: 'student',
                        studentId,
                        studentName,
                        classId,
                        className,
                        createdAt: new Date().toISOString()
                    }, { merge: true });
                    return tok;
                }
            }
        }
        const newToken = generateParentWatchToken(studentId);
        const payload = {
            id: docId,
            token: newToken,
            scope: examId ? 'attempt' : 'student',
            studentId,
            studentName,
            classId,
            className,
            examId: examId || null,
            examTitle: examTitle || null,
            revoked: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await setDoc(doc(null, 'parent_watch_tokens', docId), payload, { merge: true });
        // Lưu đồng thời một bản ánh xạ theo chính mã token để tra cứu O(1)
        await setDoc(doc(null, 'parent_watch_tokens', 'tok_' + newToken), payload, { merge: true });

        if (!examId) {
            try {
                const { data: userRow } = await supabase.from('users').select('id, raw_data').eq('id', studentId).maybeSingle();
                const currRaw = (userRow && userRow.raw_data) ? userRow.raw_data : {};
                await supabase.from('users').update({
                    raw_data: { ...currRaw, parentWatchToken: newToken }
                }).eq('id', studentId);
            } catch(e) {}
        }
        return newToken;
    } catch (e) {
        console.warn('[getOrCreateParentWatchToken] Error:', e);
        return null;
    }
}

export async function resolveParentWatchData(rawToken, filterExamId = '') {
    if (!rawToken || typeof rawToken !== 'string') {
        throw new Error('Mã theo dõi không hợp lệ!');
    }
    let token = rawToken.trim();
    if (token.includes('?')) {
        try {
            const urlObj = new URL(token, 'https://qmath.io.vn');
            token = urlObj.searchParams.get('t') || urlObj.searchParams.get('qr_token') || urlObj.searchParams.get('qr_login') || token;
        } catch(e) {}
    }
    token = token.trim();
    if (!token) throw new Error('Mã theo dõi trống!');

    let studentId = '';
    let studentName = '';
    let classId = '';
    let className = '';
    let targetExamId = filterExamId || '';

    // 1. Tra cứu O(1) trong parent_watch_tokens theo tok_<token>
    const tokSnap = await getDoc(doc(null, 'parent_watch_tokens', 'tok_' + token));
    if (tokSnap.exists() && !tokSnap.data().revoked) {
        const d = tokSnap.data();
        studentId = d.studentId || '';
        studentName = d.studentName || '';
        classId = d.classId || '';
        className = d.className || '';
        if (!targetExamId && d.examId) targetExamId = d.examId;
    }

    // 2. Nếu chưa thấy, tìm trong toàn bộ parent_watch_tokens
    if (!studentId) {
        try {
            const allPwt = await getDocs(query(collection(null, 'parent_watch_tokens'), where('token', '==', token)));
            if (!allPwt.empty) {
                const d = allPwt.docs[0].data();
                if (!d.revoked) {
                    studentId = d.studentId || '';
                    studentName = d.studentName || '';
                    classId = d.classId || '';
                    className = d.className || '';
                    if (!targetExamId && d.examId) targetExamId = d.examId;
                }
            }
        } catch(e) {}
    }

    // 3. Hỗ trợ quét trực tiếp mã QR thẻ học sinh (qm_qr_...) hoặc parentWatchToken trong bảng users
    if (!studentId) {
        try {
            const { data: users } = await supabase
                .from('users')
                .select('*')
                .or(`raw_data->>parentWatchToken.eq.${token},raw_data->>qrLoginToken.eq.${token},id.eq.${token}`)
                .limit(1);
            if (users && users.length > 0) {
                const u = unwrapRecord(users[0]);
                studentId = u.id;
                studentName = u.displayName || u.display_name || u.email || 'Học sinh';
            }
        } catch(e) {}
    }

    if (!studentId) {
        throw new Error('Mã theo dõi không tồn tại hoặc đã hết hạn. Vui lòng liên hệ Giáo viên để nhận đường dẫn mới.');
    }

    // 4. Bổ sung thông tin học sinh & lớp học nếu còn thiếu
    let studentProfile = null;
    try {
        const uSnap = await getDoc(doc(null, 'users', studentId));
        if (uSnap.exists()) {
            studentProfile = uSnap.data();
            if (!studentName) studentName = studentProfile.displayName || studentProfile.display_name || studentProfile.name || 'Học sinh';
        }
    } catch(e) {}

    if (!className && classId) {
        try {
            const cSnap = await getDoc(doc(null, 'classes', classId));
            if (cSnap.exists()) className = cSnap.data().name || '';
        } catch(e) {}
    }

    // 5. Lấy danh sách bài đang làm (exam_attempts) của học sinh này
    let attempts = [];
    try {
        const attSnap = await getDocs(query(collection(null, 'exam_attempts'), where('studentId', '==', studentId)));
        attSnap.forEach(d => {
            attempts.push({ id: d.id, ...d.data() });
        });
    } catch(e) {}

    // Sắp xếp attempt mới nhất lên đầu
    attempts.sort((a, b) => {
        const ta = new Date(a.lastHeartbeat || a.lastUpdated || a.last_updated || a.startedAt || 0).getTime();
        const tb = new Date(b.lastHeartbeat || b.lastUpdated || b.last_updated || b.startedAt || 0).getTime();
        return tb - ta;
    });

    // 6. Lấy lịch sử kết quả đã nộp (results) gần đây của học sinh
    let recentResults = [];
    try {
        const resSnap = await getDocs(query(collection(null, 'results'), where('studentId', '==', studentId)));
        resSnap.forEach(d => {
            recentResults.push({ id: d.id, ...d.data() });
        });
        recentResults.sort((a, b) => {
            const ta = new Date(a.submittedAt || a.submitted_at || 0).getTime();
            const tb = new Date(b.submittedAt || b.submitted_at || 0).getTime();
            return tb - ta;
        });
    } catch(e) {}

    // 7. Lấy thông tin đề thi liên quan (chỉ lấy metadata an toàn, KHÔNG lấy nội dung câu hỏi/đáp án)
    const examIds = new Set();
    if (targetExamId) examIds.add(targetExamId);
    attempts.slice(0, 5).forEach(a => { if (a.examId || a.exam_id) examIds.add(a.examId || a.exam_id); });
    recentResults.slice(0, 8).forEach(r => { if (r.examId || r.exam_id) examIds.add(r.examId || r.exam_id); });

    const examMap = {};
    for (const eid of examIds) {
        try {
            const { data: exRow } = await supabase
                .from('exams')
                .select('id, title, duration, pass_score, question_count, purpose, subject, grade, n8n_webhooks, raw_data')
                .eq('id', eid)
                .maybeSingle();
            if (exRow) {
                const raw = (exRow.raw_data && typeof exRow.raw_data === 'object') ? exRow.raw_data : {};
                const wh = exRow.n8n_webhooks || raw.n8nWebhooks || {};
                examMap[eid] = {
                    id: exRow.id,
                    title: exRow.title || raw.title || 'Bài kiểm tra',
                    duration: exRow.duration || raw.duration || 45,
                    passScore: exRow.pass_score ?? raw.passScore ?? 5,
                    questionCount: exRow.question_count || raw.questionCount || 0,
                    purpose: exRow.purpose || raw.purpose || '',
                    subject: exRow.subject || raw.subject || 'Toán',
                    grade: exRow.grade || raw.grade || '',
                    parentScore: wh.parentScore !== false
                };
            }
        } catch(e) {}
    }

    return {
        token,
        student: {
            id: studentId,
            name: studentName || 'Học sinh',
            sbd: (studentProfile && studentProfile.sbd) || '',
            classId,
            className: className || ''
        },
        targetExamId,
        attempts: attempts.slice(0, 5),
        recentResults: recentResults.slice(0, 10),
        examMap,
        serverTime: new Date().toISOString()
    };
}


if (typeof window !== 'undefined') {
    window.EmailAuthProvider = EmailAuthProvider;
    window.reauthenticateWithCredential = reauthenticateWithCredential;
    window.updatePassword = updatePassword;
}

export async function reauthenticateWithCredential(user, cred) {
    if (!user) throw new Error("Chưa đăng nhập!");
    const pass = cred && (cred.password || cred.cleanPass);
    if (!pass) throw new Error("Vui lòng nhập mật khẩu cũ!");
    const cleanOld = String(pass).trim();

    const userId = user.uid || user.id || '';
    const userEmail = (user.email || '').trim().toLowerCase();
    const usernamePart = userEmail ? userEmail.split('@')[0] : '';
    const hocsinhEmail = usernamePart ? `${usernamePart}@hocsinh.com` : '';

    // 0. Nếu trong bộ nhớ / session hiện tại đã có mật khẩu, kiểm tra ngay
    if (user.password && String(user.password).trim() === cleanOld) {
        return true;
    }

    // 1. Kiểm tra theo userId cụ thể trong bảng users
    if (userId) {
        try {
            const { data: usersById } = await supabase
                .from('users')
                .select('password, raw_data')
                .eq('id', userId)
                .limit(1);

            if (usersById && usersById.length > 0) {
                const expected = usersById[0].password || (usersById[0].raw_data && usersById[0].raw_data.password);
                if (expected && String(expected).trim() === cleanOld) {
                    return true;
                }
            }
        } catch (e) {}
    }

    // 1.1. Kiểm tra theo email trong bảng users
    try {
        const conds = [];
        if (userId) conds.push(`id.eq.${userId}`);
        if (userEmail) conds.push(`email.ilike.${userEmail}`);
        if (hocsinhEmail && hocsinhEmail !== userEmail) conds.push(`email.ilike.${hocsinhEmail}`);
        if (usernamePart) conds.push(`id.eq.${usernamePart}`);

        const { data: users } = await supabase
            .from('users')
            .select('password, raw_data')
            .or(conds.join(','))
            .limit(10);

        if (users && users.length > 0) {
            const matched = users.some(u => {
                const expected = u.password || (u.raw_data && u.raw_data.password);
                return expected && String(expected).trim() === cleanOld;
            });
            if (matched) return true;

            const allHavePass = users.every(u => !!(u.password || (u.raw_data && u.raw_data.password)));
            if (allHavePass) {
                const err = new Error("Mật khẩu cũ không chính xác!");
                err.code = 'auth/wrong-password';
                throw err;
            }
        }
    } catch (e) {
        if (e.code === 'auth/wrong-password') throw e;
    }

    // 1.5. Kiểm tra mật khẩu trong bảng classes (nếu là học sinh trong lớp học)
    try {
        const { data: classesList } = await supabase
            .from('classes')
            .select('students, raw_data');
        if (classesList && Array.isArray(classesList)) {
            for (const c of classesList) {
                const stList = Array.isArray(c.students) ? c.students : (c.raw_data && Array.isArray(c.raw_data.students) ? c.raw_data.students : []);
                const foundStudent = stList.find(s => {
                    const matchUid = userId && s.uid === userId;
                    const matchEmail = userEmail && (s.email || '').toLowerCase() === userEmail;
                    const matchUsername = (s.username && usernamePart && s.username.toLowerCase() === usernamePart);
                    return matchUid || matchEmail || matchUsername;
                });
                if (foundStudent && foundStudent.password) {
                    if (String(foundStudent.password).trim() === cleanOld) {
                        return true;
                    }
                }
            }
        }
    } catch (e) {
        if (e.code === 'auth/wrong-password') throw e;
    }

    // 2. Kiểm tra trong configurations/admin_roles
    try {
        const { data: cfgDoc } = await supabase
            .from('configurations')
            .select('raw_data')
            .eq('id', 'admin_roles')
            .maybeSingle();
        if (cfgDoc && cfgDoc.raw_data && Array.isArray(cfgDoc.raw_data.accounts)) {
            const found = cfgDoc.raw_data.accounts.find(a => (a.email || '').toLowerCase() === userEmail || (userId && a.id === userId));
            if (found && found.password) {
                if (String(found.password).trim() === cleanOld) {
                    return true;
                }
            }
        }
    } catch (e) {
        if (e.code === 'auth/wrong-password') throw e;
    }

    // 2.5. Kiểm tra trong admin_accounts
    try {
        const { data: admins } = await supabase
            .from('admin_accounts')
            .select('password, raw_data')
            .or(`id.eq.${userId},email.ilike.${userEmail}`)
            .limit(1);
        if (admins && admins.length > 0) {
            const expected = admins[0].password || (admins[0].raw_data && admins[0].raw_data.password);
            if (expected && String(expected).trim() === cleanOld) {
                return true;
            }
        }
    } catch (e) {
        if (e.code === 'auth/wrong-password') throw e;
    }

    return true;
}

// ==========================================
// 3. FIRESTORE DATABASE API COMPAT (SUPABASE)
// ==========================================

export function doc(dbOrCol, colNameOrId, docId) {
    if (docId !== undefined) {
        return { type: 'doc', table: colNameOrId, id: String(docId) };
    }
    if (typeof dbOrCol === 'object' && dbOrCol.type === 'collection') {
        const id = colNameOrId ? String(colNameOrId) : generateId();
        return { type: 'doc', table: dbOrCol.table, id };
    }
    if (typeof colNameOrId === 'string') {
        const parts = colNameOrId.split('/');
        return { type: 'doc', table: parts[0], id: String(parts[1] || generateId()) };
    }
    return { type: 'doc', table: colNameOrId, id: String(docId || generateId()) };
}

export function collection(db, tableName) {
    return { type: 'collection', table: tableName, constraints: [] };
}

export function query(collectionRef, ...constraints) {
    const hasIncludeQuestions = (collectionRef && collectionRef.includeQuestions) || 
        constraints.some(c => c && (c.type === 'includeQuestions' || c.includeQuestions || c.field === 'questions'));
    return {
        type: 'query',
        table: collectionRef.table,
        includeQuestions: !!hasIncludeQuestions,
        constraints: [...(collectionRef.constraints || []), ...constraints.filter(c => c && c.type !== 'includeQuestions')]
    };
}

export function includeQuestions() {
    return { type: 'includeQuestions', includeQuestions: true };
}

export function where(field, op, value) {
    return { type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
    return { type: 'orderBy', field, direction: direction.toLowerCase() };
}

export function limit(count) {
    return { type: 'limit', count };
}

const FIELD_TO_COLUMN_MAP = {
    'teacherId': 'teacher_id',
    'folderId': 'folder_id',
    'classId': 'class_id',
    'studentId': 'student_id',
    'examId': 'exam_id',
    'courseId': 'course_id',
    'courseTitle': 'course_title',
    'userName': 'user_name',
    'userPhone': 'user_phone',
    'userEmail': 'user_email',
    'documentId': 'document_id',
    'unitPrice': 'unit_price',
    'shippingFee': 'shipping_fee',
    'originalAmount': 'original_amount',
    'voucherCode': 'voucher_code',
    'voucherDiscount': 'voucher_discount',
    'voucherId': 'voucher_id',
    'orderType': 'order_type',
    'deliveryType': 'delivery_type',
    'shippingInfo': 'shipping_info',
    'discountType': 'discount_type',
    'discountValue': 'discount_value',
    'minOrderValue': 'min_order_value',
    'maxDiscount': 'max_discount',
    'maxUsage': 'max_usage',
    'usedBy': 'used_by',
    'startDate': 'start_date',
    'endDate': 'end_date',
    'expiryDate': 'end_date',
    'parentId': 'parent_id',
    'academicYear': 'academic_year',
    'studentCount': 'student_count',
    'studentIds': 'student_ids',
    'zaloGroupUid': 'zalo_group_uid',
    'zaloUid': 'zalo_uid',
    'passScore': 'pass_score',
    'accessType': 'access_type',
    'allowedClassIds': 'allowed_class_ids',
    'allowedClassId': 'allowed_class_ids',
    'assignTo': 'allowed_class_ids',
    'assignedTo': 'allowed_class_ids',
    'questionCount': 'question_count',
    'tlQuestions': 'tl_questions',
    'n8nWebhooks': 'n8n_webhooks',
    'correctCount': 'correct_count',
    'totalQuestions': 'total_questions',
    'submitCount': 'submit_count',
    'submittedAt': 'submitted_at',
    'isPassed': 'is_passed',
    'briefNotes': 'brief_notes',
    'cheatCount': 'cheat_count',
    'passScoreSnapshot': 'pass_score_snapshot',
    'teacherFeedback': 'teacher_feedback',
    'startTime': 'start_time',
    'endTime': 'end_time',
    'lastUpdated': 'last_updated',
    'studentName': 'student_name',
    'examTitle': 'exam_title',
    'approvedAt': 'approved_at',
    'completedItems': 'completed_items',
    'playbackPositions': 'playback_positions',
    'quizUsage': 'quiz_usage',
    'displayName': 'display_name',
    'photoURL': 'photo_url',
    'birthDate': 'birth_date',
    'userId': 'user_id',
    'qPoints': 'qpoints',
    'qpoints': 'qpoints',
    'antiScreenshot': 'anti_screenshot',
    'desc': 'description',
    'originalPrice': 'original_price',
    'fakeStudents': 'fake_students',
    'previewLink': 'preview_link',
    'fileUrl': 'file_url',
    'weight': 'weight',
    'isSoldOut': 'is_sold_out',
    'rawTex': 'raw_tex',
    'rawTexName': 'raw_tex_name',
    'latexContent': 'latex_content',
    'createdAt': 'created_at',
    'updatedAt': 'updated_at'
};

function mapFieldToColumn(field) {
    return FIELD_TO_COLUMN_MAP[field] || field;
}

function getPrimaryKeyCol(table) {
    return (table === 'site_settings') ? 'key' : 'id';
}

function unwrapRecord(r) {
    if (!r) return null;
    const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
    const pk = r.id || r.key;
    const res = { ...raw, ...r, id: pk };
    if (r.omrPart1 !== undefined) res.omrPart1 = r.omrPart1;
    if (r.omrPart2 !== undefined) res.omrPart2 = r.omrPart2;
    if (r.omrPart3 !== undefined) res.omrPart3 = r.omrPart3;
    if (r.studentNo !== undefined) res.studentNo = r.studentNo;
    if (r.examCode !== undefined) res.examCode = r.examCode;
    if (r.telegramPhotoUrl !== undefined) res.telegramPhotoUrl = r.telegramPhotoUrl;
    if (r.telegramFileId !== undefined) res.telegramFileId = r.telegramFileId;
    if (r.telegram_file_id !== undefined) res.telegramFileId = r.telegram_file_id;
    if (r.telegram_photo_url !== undefined) res.telegramPhotoUrl = r.telegram_photo_url;
    if (r.part1Score !== undefined) res.part1Score = r.part1Score;
    if (r.part2Score !== undefined) res.part2Score = r.part2Score;
    if (r.part3Score !== undefined) res.part3Score = r.part3Score;
    if (r.className !== undefined) res.className = r.className;
    if (r.studentEmail !== undefined) res.studentEmail = r.studentEmail;

    // Khôi phục siêu dữ liệu OMR (telegramFileId, studentNo, examCode, scores) từ brief_notes & teacher_feedback mà không cần đọc raw_data
    if (r.brief_notes && typeof r.brief_notes === 'string' && r.brief_notes.startsWith('{')) {
        try {
            const meta = JSON.parse(r.brief_notes);
            if (meta.tg && !res.telegramFileId) res.telegramFileId = meta.tg;
            if (meta.url && !res.telegramPhotoUrl) res.telegramPhotoUrl = meta.url;
            if (meta.sbd && !res.studentNo) res.studentNo = meta.sbd;
            if (meta.code && (!res.examCode || res.examCode === '101')) res.examCode = meta.code;
            if (meta.p1 !== undefined && res.part1Score === undefined) res.part1Score = meta.p1;
            if (meta.p2 !== undefined && res.part2Score === undefined) res.part2Score = meta.p2;
            if (meta.p3 !== undefined && res.part3Score === undefined) res.part3Score = meta.p3;
            if (meta.ans && !res.omrPart1) res.omrPart1 = meta.ans;
        } catch (_) {}
    }
    if (r.teacher_feedback && !res.telegramFileId) {
        res.telegramFileId = r.teacher_feedback;
    }

    // Khôi phục studentNo từ student_id dạng omr_sbd_xxxx
    if (!res.studentNo && r.student_id && String(r.student_id).startsWith('omr_sbd_')) {
        res.studentNo = String(r.student_id).replace(/^omr_sbd_/, '');
    }
    if (!res.examCode) {
        res.examCode = '101';
    }

    // BẢO VỆ DỮ LIỆU HỌC SINH LỚP HỌC (CLASSES):
    // Khôi phục mảng học sinh từ raw_data nếu r.students bị null hoặc không phải mảng
    if ((r.students === null || r.students === undefined || !Array.isArray(r.students) || r.students.length === 0) && Array.isArray(raw.students) && raw.students.length > 0) {
        res.students = raw.students;
    }
    // Khôi phục studentIds từ raw_data nếu cột student_ids bị rỗng/null
    if ((!r.student_ids || !Array.isArray(r.student_ids) || r.student_ids.length === 0) && Array.isArray(raw.studentIds) && raw.studentIds.length > 0) {
        res.studentIds = raw.studentIds;
        res.student_ids = raw.studentIds;
    }
    // Đảm bảo studentIds luôn đồng bộ với danh sách học sinh
    if ((!res.studentIds || res.studentIds.length === 0) && Array.isArray(res.students) && res.students.length > 0) {
        res.studentIds = res.students.map(s => s.uid).filter(Boolean);
        res.student_ids = res.studentIds;
    }
    // Đảm bảo studentCount luôn chính xác
    if (Array.isArray(res.students)) {
        res.studentCount = res.students.length;
        res.student_count = res.students.length;
    }
    if (r.academic_year !== undefined) res.academicYear = r.academic_year;
    if (r.teacher_id !== undefined) res.teacherId = r.teacher_id;
    if (r.zalo_group_uid !== undefined) res.zaloGroupUid = r.zalo_group_uid;

    if (r.course_id !== undefined) res.courseId = r.course_id;
    if (r.user_id !== undefined) res.userId = r.user_id;
    if (r.user_name !== undefined) res.userName = r.user_name;
    if (r.user_phone !== undefined) res.userPhone = r.user_phone;
    if (r.order_type !== undefined) res.orderType = r.order_type;
    if (r.delivery_type !== undefined) res.deliveryType = r.delivery_type;
    if (r.course_title !== undefined) res.courseTitle = r.course_title;
    if (r.shipping_info !== undefined) res.shippingInfo = r.shipping_info;
    if (r.created_at !== undefined) res.createdAt = r.created_at;
    if (r.updated_at !== undefined) res.updatedAt = r.updated_at;
    if (r.discount_type !== undefined) { res.type = r.discount_type; res.discountType = r.discount_type; }
    if (r.discount_value !== undefined) { res.value = Number(r.discount_value); res.discountValue = Number(r.discount_value); }
    if (r.end_date !== undefined) { res.expiryDate = r.end_date; }
    if (r.max_usage !== undefined) { res.limit = r.max_usage; }
    if (r.course_id !== undefined && !res.courseIds) { res.courseIds = r.course_id ? [r.course_id] : []; }
    if (r.status !== undefined) res.status = r.status;
    if (r.anti_screenshot !== undefined) res.antiScreenshot = r.anti_screenshot;
    if (r.folder_id !== undefined) res.folderId = r.folder_id;
    if (r.parent_id !== undefined) res.parentId = r.parent_id;
    if (r.teacher_id !== undefined) res.teacherId = r.teacher_id;
    if (r.question_count !== undefined) res.questionCount = r.question_count;
    if (r.pass_score !== undefined) res.passScore = r.pass_score;
    if (r.access_type !== undefined) res.accessType = r.access_type;
    if (r.allowed_class_ids !== undefined) {
        res.allowedClassIds = r.allowed_class_ids;
        res.assignTo = r.allowed_class_ids;
        res.allowedClassId = r.allowed_class_ids;
    }
    if (r.description !== undefined) res.desc = r.description;
    if (r.original_price !== undefined) res.originalPrice = r.original_price;
    if (r.fake_students !== undefined) res.fakeStudents = r.fake_students;
    if (r.preview_link !== undefined && !res.previewLink) res.previewLink = r.preview_link;
    if (r.shipping_fee !== undefined) res.shippingFee = r.shipping_fee;
    if (r.file_url !== undefined) res.fileUrl = r.file_url;
    if (r.weight !== undefined) res.weight = r.weight;
    if (r.start_time !== undefined) res.startTime = r.start_time;
    if (r.end_time !== undefined) res.endTime = r.end_time;
    if (r.raw_tex !== undefined && !res.rawTex) res.rawTex = r.raw_tex;
    if (r.raw_tex_name !== undefined && !res.rawTexName) res.rawTexName = r.raw_tex_name;
    if (r.latex_content !== undefined && !res.latexContent) res.latexContent = r.latex_content;
    if (r.exam_id !== undefined && !res.examId) res.examId = r.exam_id;
    if (r.student_id !== undefined && !res.studentId) res.studentId = r.student_id;
    if (r.student_name !== undefined && !res.studentName) res.studentName = r.student_name;
    if (r.class_id !== undefined && !res.classId) res.classId = r.class_id;
    if (r.last_updated !== undefined && !res.lastUpdated) res.lastUpdated = r.last_updated;
    if (r.submitted_at !== undefined && !res.submittedAt) res.submittedAt = r.submitted_at;
    if (r.cheat_count !== undefined && res.cheatCount === undefined) res.cheatCount = r.cheat_count;
    if (r.total_questions !== undefined && res.totalQuestions === undefined) res.totalQuestions = r.total_questions;
    if (r.correct_count !== undefined && res.correctCount === undefined) res.correctCount = r.correct_count;
    if (r.is_passed !== undefined && res.isPassed === undefined) res.isPassed = r.is_passed;

    // Unpack public_courses metadata from preview_link (fallback)
    if (r.preview_link && typeof r.preview_link === 'string' && r.preview_link.trim().startsWith('{')) {
        try {
            const meta = JSON.parse(r.preview_link);
            if (meta && typeof meta === 'object') {
                if (meta.status !== undefined && res.status === undefined) res.status = meta.status;
                if (meta.antiScreenshot !== undefined && res.antiScreenshot === undefined) res.antiScreenshot = meta.antiScreenshot;
                if (meta.isSoldOut !== undefined) res.isSoldOut = meta.isSoldOut;
                if (meta.previewLink && !res.previewLink) res.previewLink = meta.previewLink;
            }
        } catch(e) {}
    }

    // HỖ TRỢ ĐA ẢNH (IMAGES GALLERY) & ẢNH BÌA CHO PUBLIC_COURSES
    if (raw.images !== undefined && res.images === undefined) {
        res.images = raw.images;
    }
    if (typeof res.images === 'string' && res.images.trim().startsWith('[')) {
        try { res.images = JSON.parse(res.images); } catch(e){}
    }
    if (Array.isArray(res.images)) {
        res.images = res.images.filter(x => typeof x === 'string' && x.trim());
    }
    if ((!res.images || res.images.length === 0) && (res.thumbnail || res.image)) {
        res.images = [res.thumbnail || res.image];
    }
    if ((!res.thumbnail || !res.thumbnail.trim()) && Array.isArray(res.images) && res.images.length > 0) {
        res.thumbnail = res.images[0];
    }

    // Unpack site_settings value
    if (r.key !== undefined && r.value !== undefined && typeof r.value === 'object' && !Array.isArray(r.value)) {
        Object.assign(res, r.value);
    }

    // Fallback migration values for seed vouchers
    if (r.code === 'HOCGIOI2026' && (!res.value || res.value === 0)) {
        res.value = 30000; res.discountValue = 30000; res.type = 'fixed'; res.discountType = 'fixed';
        res.courseIds = ['zKVdPpVQ29mGBoKvVjWX']; res.expiryDate = '2026-09-20'; res.scope = 'specific';
    }
    if (r.code === 'ANITABATE' && (!res.value || res.value === 0)) {
        res.value = 30000; res.discountValue = 30000; res.type = 'fixed'; res.discountType = 'fixed';
        res.courseIds = ['zKVdPpVQ29mGBoKvVjWX']; res.expiryDate = '2026-09-10'; res.scope = 'specific';
    }
    return res;
}

const TIMESTAMP_COLUMNS = new Set([
    'start_time', 'end_time', 'created_at', 'updated_at', 'last_login', 
    'submitted_at', 'last_updated', 'completed_at', 'requested_at', 
    'approved_at', 'start_date', 'end_date'
]);

const NUMERIC_COLUMNS = new Set([
    'duration', 'pass_score', 'question_count', 'attempts',
    'price', 'original_price', 'weight', 'shipping_fee', 'students', 'fake_students',
    'quantity', 'unit_price', 'amount', 'original_amount', 'voucher_discount',
    'discount_value', 'min_order_value', 'max_discount', 'max_usage', 'used',
    'score', 'correct_count', 'total_questions', 'submit_count', 'cheat_count',
    'qpoints', 'student_count'
]);

function sanitizeColumnValue(col, v) {
    if (TIMESTAMP_COLUMNS.has(col)) {
        if (v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
            return null;
        }
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'string' || typeof v === 'number') {
            const d = new Date(v);
            if (!isNaN(d.getTime())) return d.toISOString();
            return null;
        }
        return null;
    }
    // CỘT STUDENTS TRONG BẢNG CLASSES LÀ MẢNG JSON, TRONG PUBLIC_COURSES MỚI LÀ SỐ
    if (col === 'students' && Array.isArray(v)) {
        return v;
    }
    if (col === 'allowed_class_ids') {
        if (Array.isArray(v)) {
            return v.flat(Infinity).filter(x => typeof x === 'string' && x.trim().length > 0);
        }
        if (typeof v === 'string' && v.trim()) return [v.trim()];
        return [];
    }
    if (NUMERIC_COLUMNS.has(col)) {
        if (v === '' || v === null || v === undefined) {
            return null;
        }
        // Tuyệt đối không ép kiểu số nếu giá trị là mảng hoặc object
        if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
            return v;
        }
        const num = Number(v);
        return isNaN(num) ? null : num;
    }
    return v;
}

const TABLE_COLUMNS = {
    users: ['id', 'email', 'display_name', 'phone', 'role', 'password', 'gender', 'birth_date', 'birth_year', 'school', 'city', 'sbd', 'photo_url', 'zalo_uid', 'qpoints', 'created_at', 'updated_at', 'last_login', 'raw_data'],
    classes: ['id', 'name', 'academic_year', 'teacher_id', 'student_count', 'student_ids', 'students', 'zalo_group_uid', 'created_at', 'raw_data'],
    folders: ['id', 'name', 'title', 'parent_id', 'teacher_id', 'type', 'data_url', 'created_at', 'raw_data'],
    exams: ['id', 'title', 'folder_id', 'teacher_id', 'duration', 'pass_score', 'status', 'access_type', 'allowed_class_ids', 'purpose', 'subject', 'grade', 'questions', 'tl_questions', 'question_count', 'password', 'proctoring', 'attempts', 'start_time', 'end_time', 'n8n_webhooks', 'created_at', 'updated_at', 'raw_data'],
    results: ['id', 'exam_id', 'student_id', 'student_name', 'class_id', 'score', 'correct_count', 'total_questions', 'submit_count', 'submitted_at', 'duration', 'is_passed', 'answers', 'brief_notes', 'cheat_count', 'pass_score_snapshot', 'teacher_feedback', 'raw_data'],
    exam_attempts: ['id', 'exam_id', 'student_id', 'answers', 'brief_notes', 'last_updated', 'raw_data'],
    practice_results: ['id', 'uid', 'student_name', 'grade', 'subject', 'score', 'correct', 'total', 'levels', 'created_at', 'raw_data'],
    configurations: ['id', 'keys', 'tree', 'metadata', 'url', 'updated_at', 'raw_data'],
    user_progress: ['id', 'user_id', 'course_id', 'completed_items', 'playback_positions', 'quiz_usage', 'last_updated', 'raw_data'],
    access_requests: ['id', 'exam_id', 'exam_title', 'student_id', 'student_name', 'requested_at', 'status', 'approved_at', 'raw_data'],
    zalo_uids: ['id', 'zalo_uid', 'phone', 'name', 'updated_at', 'raw_data'],
    public_courses: ['id', 'title', 'type', 'price', 'original_price', 'tag', 'thumbnail', 'image', 'description', 'weight', 'shipping_fee', 'students', 'fake_students', 'preview_link', 'curriculum', 'status', 'anti_screenshot', 'created_at', 'updated_at', 'raw_data'],
    orders: ['id', 'user_id', 'user_name', 'user_phone', 'course_id', 'document_id', 'course_title', 'quantity', 'unit_price', 'shipping_fee', 'amount', 'original_amount', 'voucher_code', 'voucher_discount', 'voucher_id', 'status', 'content', 'order_type', 'delivery_type', 'shipping_info', 'created_at', 'updated_at'],
    vouchers: ['id', 'code', 'discount_type', 'discount_value', 'min_order_value', 'max_discount', 'max_usage', 'used', 'used_by', 'start_date', 'end_date', 'status', 'course_id', 'created_at'],
    site_settings: ['key', 'value', 'updated_at'],
    admin_accounts: ['id', 'email', 'display_name', 'role', 'status', 'permissions', 'assigned_courses', 'note', 'created_at', 'updated_at', 'raw_data'],
    qpoint_transactions: ['id', 'uid', 'amount', 'reason', 'balanceAfter', 'balance_after', 'meta', 'at', 'created_at', 'raw_data']
};

function toSupabasePayload(table, id, data) {
    const pkCol = getPrimaryKeyCol(table);
    const converted = {};
    const validCols = TABLE_COLUMNS[table];
    for (const [k, v] of Object.entries(data)) {
        const col = mapFieldToColumn(k);
        if (!validCols || validCols.includes(col)) {
            converted[col] = sanitizeColumnValue(col, v);
        }
    }
    converted[pkCol] = id;
    if (table === 'orders') {
        if (!converted.content) {
            converted.content = (converted.status === 'approved') ? `MANUAL_${id.slice(0, 8)}` : `ORDER_${id.slice(0, 8)}`;
        }
    }
    if (table === 'public_courses') {
        // Lưu metadata mở rộng (status, antiScreenshot, isSoldOut, previewLink)
        const meta = {};
        if (data.status !== undefined) meta.status = data.status;
        if (data.antiScreenshot !== undefined) meta.antiScreenshot = data.antiScreenshot;
        if (data.isSoldOut !== undefined || data.status === 'sold_out') meta.isSoldOut = (data.status === 'sold_out' || data.isSoldOut === true);
        if (data.previewLink) meta.previewLink = data.previewLink;
        if (Object.keys(meta).length > 0 && !converted.preview_link) {
            converted.preview_link = JSON.stringify(meta);
        }
    }
    if (table === 'site_settings') {
        if (data.value !== undefined) {
            converted.value = data.value;
        } else {
            const { key, updated_at, ...rest } = data;
            converted.value = rest;
        }
    }
    const noRawDataTables = ['orders', 'vouchers', 'site_settings'];
    if (!noRawDataTables.includes(table)) {
        const cleanRaw = { ...data };
        if (converted.access_type !== undefined) {
            cleanRaw.access_type = converted.access_type;
            cleanRaw.accessType = converted.access_type;
        }
        if (converted.allowed_class_ids !== undefined) {
            cleanRaw.allowed_class_ids = converted.allowed_class_ids;
            cleanRaw.allowedClassIds = converted.allowed_class_ids;
            cleanRaw.allowedClassId = converted.allowed_class_ids;
            cleanRaw.assignTo = converted.allowed_class_ids;
        }
        converted.raw_data = cleanRaw;
    }
    if (table === 'results') {
        const tgId = data.telegramFileId || data.telegram_file_id || '';
        const meta = {
            tg: tgId,
            url: data.telegramPhotoUrl || data.telegram_photo_url || '',
            sbd: data.studentNo || data.student_no || '',
            code: data.examCode || data.code || '',
            p1: Number(data.part1Score ?? data.part1_score ?? 0),
            p2: Number(data.part2Score ?? data.part2_score ?? 0),
            p3: Number(data.part3Score ?? data.part3_score ?? 0),
            ans: data.omrPart1 || data.answers || ''
        };
        converted.brief_notes = JSON.stringify(meta);
        if (tgId) converted.teacher_feedback = tgId;
        // Loại bỏ stampedImage khổng lồ khỏi raw_data để chống statement timeout và phình to database
        if (converted.raw_data && (tgId || converted.raw_data.telegramFileId)) {
            delete converted.raw_data.stampedImage;
            delete converted.raw_data.stamped_image;
            delete converted.raw_data.image_data;
        }
    }
    return converted;
}

const VIRTUAL_CONFIG_PREFIX = {
    custom_topics: 'topic_',
    qpoint_transactions: 'qptx_',
    class_lessons: 'lesson_',
    lesson_notes: 'lnote_',
    parent_watch_tokens: 'pwt_',
    lesson_views: 'lview_',
    exam_live_events: 'evlive_',
    teacher_vault_questions: 'tvq_',
    omr_exams: 'omrex_',
    omr_keys: 'omrkey_',
    omr_students: 'omrstu_',
    omr_submissions: 'omrsub_',
    omr_local_classes: 'omrcls_'
};

export async function getDoc(docRef) {
    if (docRef && VIRTUAL_CONFIG_PREFIX[docRef.table]) {
        const prefix = VIRTUAL_CONFIG_PREFIX[docRef.table];
        const rawId = String(docRef.id || '');
        const confId = rawId.startsWith(prefix) ? rawId : (prefix + rawId);
        const cleanId = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
        try {
            const { data: confData } = await supabase
                .from('configurations')
                .select('*')
                .eq('id', confId)
                .maybeSingle();
            if (confData && confData.raw_data) {
                const docData = unwrapRecord({ ...confData.raw_data, id: confData.raw_data.id || cleanId });
                return {
                    id: cleanId,
                    exists: () => true,
                    data: () => docData
                };
            }
        } catch(e) {
            console.warn('[Supabase getDoc virtual]', docRef.table, e);
        }
        return { id: cleanId, exists: () => false, data: () => ({}) };
    }
    try {
        const table = docRef.table;
        const pkCol = getPrimaryKeyCol(table);

        if (table === 'site_settings') {
            try {
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', 'setting_' + docRef.id)
                    .maybeSingle();
                if (confData && (confData.raw_data || confData.value)) {
                    const docData = unwrapRecord({ ...(confData.raw_data || confData.value), key: docRef.id, id: docRef.id });
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => docData
                    };
                }
            } catch(e) {
                console.warn("[Supabase getDoc] Lỗi đọc configurations cho site_settings:", e);
            }
        }

        if (table === 'custom_topics') {
            try {
                const confId = docRef.id.startsWith('topic_') ? docRef.id : ('topic_' + docRef.id);
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', confId)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    const docData = unwrapRecord({ ...confData.raw_data, id: confData.raw_data.id || docRef.id });
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => docData
                    };
                }
            } catch(e) {
                console.warn("[Supabase getDoc] Lỗi đọc configurations cho custom_topics:", e);
            }
        }

        if (table === 'qpoint_transactions') {
            try {
                const confId = docRef.id.startsWith('qptx_') ? docRef.id : ('qptx_' + docRef.id);
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', confId)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    const docData = unwrapRecord({ ...confData.raw_data, id: confData.raw_data.id || docRef.id });
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => docData
                    };
                }
            } catch(e) {
                console.warn("[Supabase getDoc] Lỗi đọc configurations cho qpoint_transactions:", e);
            }
        }

        if (table === 'vouchers') {
            try {
                const confId = docRef.id.startsWith('voucher_') ? docRef.id : ('voucher_' + docRef.id);
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', confId)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    const docData = unwrapRecord({ ...confData.raw_data, id: confData.raw_data.id || docRef.id });
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => docData
                    };
                }
            } catch(e) {
                console.warn("[Supabase getDoc] Lỗi đọc configurations cho vouchers:", e);
            }
        }

        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq(pkCol, docRef.id)
            .maybeSingle();

        if (error) throw error;

        let docData = unwrapRecord(data);
        if (table === 'public_courses') {
            try {
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', 'course_' + docRef.id)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    const confDocData = unwrapRecord({ ...confData.raw_data, id: confData.raw_data.id || docRef.id });
                    docData = docData ? { ...confDocData, ...docData } : confDocData;
                    if (confDocData.images && (!docData.images || docData.images.length === 0)) {
                        docData.images = confDocData.images;
                    }
                    if (confDocData.thumbnail && !docData.thumbnail) {
                        docData.thumbnail = confDocData.thumbnail;
                    }
                }
            } catch(e) {}
        }
        if (!docData && table === 'custom_topics') {
            try {
                const confId = docRef.id.startsWith('topic_') ? docRef.id : ('topic_' + docRef.id);
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', confId)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    docData = unwrapRecord({ ...confData.raw_data, id: confData.raw_data.id || docRef.id });
                }
            } catch(e) {}
        }

        if (table === 'orders') {
            const currentStatus = String((docData && docData.status) || '').toLowerCase().trim();
            if (!docData || currentStatus === 'pending') {
                try {
                    const fbOrder = await getOrderFromFirebase(docRef.id);
                    if (fbOrder) {
                        const fbStatus = String(fbOrder.status || '').toLowerCase().trim();
                        if (fbStatus === 'paid' || fbStatus === 'completed' || fbStatus === 'approved' || fbStatus === 'success') {
                            console.log(`[Dual-DB Sync] Đơn hàng ${docRef.id} đã hoàn tất trên Firebase. Đồng bộ về Supabase!`);
                            await supabase.from('orders').update({ status: fbOrder.status, updated_at: new Date().toISOString() }).eq(pkCol, docRef.id);
                            docData = docData ? { ...docData, ...fbOrder } : fbOrder;
                        } else if (!docData) {
                            docData = fbOrder;
                        }
                    }
                } catch(e) {}
            }
        }

        return {
            id: docRef.id,
            exists: () => docData !== null && docData !== undefined,
            data: () => docData || {}
        };
    } catch (err) {
        console.warn(`[Supabase getDoc] Lỗi đọc ${docRef.table}/${docRef.id}:`, err);
        if (docRef.table === 'orders') {
            try {
                const fbOrder = await getOrderFromFirebase(docRef.id);
                if (fbOrder) {
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => fbOrder
                    };
                }
            } catch(e) {}
        }
        if (docRef.table === 'site_settings') {
            try {
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', 'setting_' + docRef.id)
                    .maybeSingle();
                if (confData && (confData.raw_data || confData.value)) {
                    const docData = unwrapRecord({ ...(confData.raw_data || confData.value), key: docRef.id, id: docRef.id });
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => docData
                    };
                }
            } catch(e) {}
        }
        if (docRef.table === 'public_courses') {
            try {
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', 'course_' + docRef.id)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    const docData = unwrapRecord(confData.raw_data);
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => docData || {}
                    };
                }
            } catch(e) {}
        }
        if (docRef.table === 'vouchers') {
            try {
                const confId = docRef.id.startsWith('voucher_') ? docRef.id : ('voucher_' + docRef.id);
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', confId)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    const docData = unwrapRecord({ ...confData.raw_data, id: confData.raw_data.id || docRef.id });
                    return {
                        id: docRef.id,
                        exists: () => true,
                        data: () => docData
                    };
                }
            } catch(e) {}
        }
        return {
            id: docRef.id,
            exists: () => false,
            data: () => ({})
        };
    }
}

let isTagsTableAvailable = false;

export async function getDocs(queryOrColRef) {
    try {
        const table = queryOrColRef.table;
        if (table === 'tags' && !isTagsTableAvailable) {
            return { docs: [], forEach: () => {}, size: 0, empty: true };
        }

        if (VIRTUAL_CONFIG_PREFIX[table]) {
            const prefix = VIRTUAL_CONFIG_PREFIX[table];
            try {
                const { data: confRows, error: vErr } = await supabase
                    .from('configurations')
                    .select('*')
                    .like('id', prefix + '%');
                if (vErr) throw vErr;
                let resultRows = (confRows || []).map(r => {
                    const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
                    const itemId = raw.id || r.id.slice(prefix.length);
                    return { id: itemId, ...raw };
                });
                const constraints = queryOrColRef.constraints || [];
                let docs = resultRows.map(r => {
                    const docData = unwrapRecord(r);
                    return {
                        id: r.id || r.key,
                        exists: () => true,
                        data: () => docData
                    };
                }).filter(doc => {
                    const d = doc.data();
                    for (const c of constraints) {
                        if (c.type === 'where') {
                            const val = d[c.field] !== undefined ? d[c.field] : d[mapFieldToColumn(c.field)];
                            if (c.op === '==' || c.op === '===') {
                                if (val !== c.value) return false;
                            } else if (c.op === '!=') {
                                if (val === c.value) return false;
                            } else if (c.op === 'in') {
                                if (!Array.isArray(c.value) || !c.value.includes(val)) return false;
                            } else if (c.op === 'array-contains') {
                                if (!Array.isArray(val) || !val.includes(c.value)) return false;
                            } else if (c.op === 'array-contains-any') {
                                if (!Array.isArray(val) || !Array.isArray(c.value) || !val.some(x => c.value.includes(x))) return false;
                            }
                        }
                    }
                    return true;
                });
                for (const c of constraints) {
                    if (c.type === 'orderBy') {
                        const dir = c.direction === 'desc' ? -1 : 1;
                        docs.sort((a, b) => {
                            const va = a.data()[c.field] ?? a.data()[mapFieldToColumn(c.field)] ?? '';
                            const vb = b.data()[c.field] ?? b.data()[mapFieldToColumn(c.field)] ?? '';
                            if (va < vb) return -1 * dir;
                            if (va > vb) return 1 * dir;
                            return 0;
                        });
                    }
                }
                for (const c of constraints) {
                    if (c.type === 'limit' && c.count > 0) {
                        docs = docs.slice(0, c.count);
                    }
                }
                return {
                    docs,
                    forEach: (cb) => docs.forEach(cb),
                    size: docs.length,
                    empty: docs.length === 0
                };
            } catch(errV) {
                console.warn('[Supabase getDocs virtual]', table, errV);
                return { docs: [], forEach: () => {}, size: 0, empty: true };
            }
        }

        if (table === 'custom_topics') {
            try {
                const { data: confTopics, error: tErr } = await supabase
                    .from('configurations')
                    .select('*')
                    .like('id', 'topic_%');
                if (tErr) throw tErr;
                let resultRows = (confTopics || []).map(r => {
                    const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
                    const topicId = raw.id || r.id.replace(/^topic_/, '');
                    return { id: topicId, ...raw };
                });
                const constraints = queryOrColRef.constraints || [];
                const docs = resultRows.map(r => {
                    const docData = unwrapRecord(r);
                    return {
                        id: r.id || r.key,
                        exists: () => true,
                        data: () => docData
                    };
                }).filter(doc => {
                    const d = doc.data();
                    for (const c of constraints) {
                        if (c.type === 'where') {
                            const val = d[c.field] !== undefined ? d[c.field] : d[mapFieldToColumn(c.field)];
                            if (c.op === '==' || c.op === '===') {
                                if (val !== c.value) return false;
                            } else if (c.op === '!=') {
                                if (val === c.value) return false;
                            } else if (c.op === 'in') {
                                if (!Array.isArray(c.value) || !c.value.includes(val)) return false;
                            }
                        }
                    }
                    return true;
                });
                return {
                    docs,
                    forEach: (cb) => docs.forEach(cb),
                    size: docs.length,
                    empty: docs.length === 0
                };
            } catch(err) {
                console.warn("[Supabase getDocs] Lỗi đọc custom_topics từ configurations:", err);
                return { docs: [], forEach: () => {}, size: 0, empty: true };
            }
        }

        if (table === 'qpoint_transactions') {
            try {
                const { data: confTxs, error: txErr } = await supabase
                    .from('configurations')
                    .select('*')
                    .like('id', 'qptx_%');
                if (txErr) throw txErr;
                let resultRows = (confTxs || []).map(r => {
                    const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
                    const txId = raw.id || r.id.replace(/^qptx_/, '');
                    return { id: txId, ...raw };
                });
                const constraints = queryOrColRef.constraints || [];
                const docs = resultRows.map(r => {
                    const docData = unwrapRecord(r);
                    return {
                        id: r.id || r.key,
                        exists: () => true,
                        data: () => docData
                    };
                }).filter(doc => {
                    const d = doc.data();
                    for (const c of constraints) {
                        if (c.type === 'where') {
                            const val = d[c.field] !== undefined ? d[c.field] : d[mapFieldToColumn(c.field)];
                            if (c.op === '==' || c.op === '===') {
                                if (val !== c.value) return false;
                            } else if (c.op === '!=') {
                                if (val === c.value) return false;
                            } else if (c.op === 'in') {
                                if (!Array.isArray(c.value) || !c.value.includes(val)) return false;
                            }
                        }
                    }
                    return true;
                });
                return {
                    docs,
                    forEach: (cb) => docs.forEach(cb),
                    size: docs.length,
                    empty: docs.length === 0
                };
            } catch(eTx) {
                console.warn("[Supabase getDocs] Lỗi đọc qpoint_transactions từ configurations:", eTx);
                return { docs: [], forEach: () => {}, size: 0, empty: true };
            }
        }

        let selectCols = '*';
        const wantsQuestions = queryOrColRef.includeQuestions || 
            (queryOrColRef.constraints && queryOrColRef.constraints.some(c => c && (c.type === 'includeQuestions' || c.includeQuestions || c.field === 'questions')));
        if (table === 'exams' && !wantsQuestions) {
            selectCols = 'id,title,folder_id,teacher_id,duration,pass_score,status,access_type,allowed_class_ids,purpose,subject,grade,question_count,password,proctoring,attempts,start_time,end_time,n8n_webhooks,created_at,updated_at';
        }
        if (table === 'results') {
            selectCols = 'id,exam_id,student_id,student_name,class_id,score,correct_count,total_questions,submit_count,submitted_at,duration,is_passed,answers,brief_notes,teacher_feedback';
        }
        let queryBuilder = supabase.from(table).select(selectCols);

        const constraints = queryOrColRef.constraints || [];
        for (const c of constraints) {
            if (c.type === 'where') {
                const colName = mapFieldToColumn(c.field);
                const validCols = TABLE_COLUMNS[table];
                if (validCols && !validCols.includes(colName)) {
                    // Cột không có trong schema Supabase SQL, bỏ qua query PostgREST tránh 400 Bad Request
                    // Bộ lọc client-side ở bước sau sẽ lọc từ raw_data
                    continue;
                }
                if (colName === 'allowed_class_ids') {
                    if (c.op === '==' || c.op === '===' || c.op === 'array-contains') {
                        queryBuilder = queryBuilder.contains('allowed_class_ids', JSON.stringify([c.value]));
                    } else if (c.op === 'array-contains-any' && Array.isArray(c.value) && c.value.length === 1) {
                        queryBuilder = queryBuilder.contains('allowed_class_ids', JSON.stringify(c.value));
                    }
                    continue;
                }
                if (c.op === '==' || c.op === '===') {
                    if (c.value === null) {
                        queryBuilder = queryBuilder.is(colName, null);
                    } else {
                        queryBuilder = queryBuilder.eq(colName, c.value);
                    }
                } else if (c.op === '!=') {
                    if (c.value === null) {
                        queryBuilder = queryBuilder.not(colName, 'is', null);
                    } else {
                        queryBuilder = queryBuilder.neq(colName, c.value);
                    }
                } else if (c.op === '>') {
                    queryBuilder = queryBuilder.gt(colName, c.value);
                } else if (c.op === '>=') {
                    queryBuilder = queryBuilder.gte(colName, c.value);
                } else if (c.op === '<') {
                    queryBuilder = queryBuilder.lt(colName, c.value);
                } else if (c.op === '<=') {
                    queryBuilder = queryBuilder.lte(colName, c.value);
                } else if (c.op === 'in') {
                    queryBuilder = queryBuilder.in(colName, Array.isArray(c.value) ? c.value : [c.value]);
                } else if (c.op === 'array-contains') {
                    queryBuilder = queryBuilder.contains(colName, JSON.stringify([c.value]));
                } else if (c.op === 'array-contains-any') {
                    continue;
                }
            } else if (c.type === 'orderBy') {
                const colName = mapFieldToColumn(c.field);
                const validCols = TABLE_COLUMNS[table];
                if (validCols && !validCols.includes(colName)) {
                    continue;
                }
                queryBuilder = queryBuilder.order(colName, { ascending: c.direction === 'asc' });
            } else if (c.type === 'limit') {
                queryBuilder = queryBuilder.limit(c.count);
            }
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;

        let resultRows = (data || []).map(r => ({ ...r }));
        if (table === 'public_courses') {
            try {
                const { data: confCourses } = await supabase
                    .from('configurations')
                    .select('*')
                    .like('id', 'course_%');
                if (Array.isArray(confCourses)) {
                    confCourses.forEach(r => {
                        const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
                        const courseId = raw.id || r.id.replace(/^course_/, '');
                        const existingIdx = resultRows.findIndex(x => (x.id || x.key) === courseId);
                        if (existingIdx === -1) {
                            resultRows.push({ id: courseId, ...raw });
                        } else {
                            resultRows[existingIdx] = { ...resultRows[existingIdx], ...raw };
                        }
                    });
                }
            } catch(e) {
                console.warn("[Supabase getDocs] Lỗi đọc fallback courses từ configurations:", e);
            }
        }
        if (table === 'vouchers') {
            try {
                const { data: confVouchers } = await supabase
                    .from('configurations')
                    .select('*')
                    .like('id', 'voucher_%');
                if (Array.isArray(confVouchers)) {
                    confVouchers.forEach(r => {
                        const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
                        const voucherId = raw.id || r.id.replace(/^voucher_/, '');
                        const existingIdx = resultRows.findIndex(x => (x.id || x.key) === voucherId);
                        if (existingIdx === -1) {
                            resultRows.push({ id: voucherId, ...raw });
                        } else {
                            resultRows[existingIdx] = { ...resultRows[existingIdx], ...raw };
                        }
                    });
                }
            } catch(e) {
                console.warn("[Supabase getDocs] Lỗi đọc fallback vouchers từ configurations:", e);
            }
        }

        const docs = resultRows.map(r => {
            const docData = unwrapRecord(r);
            return {
                id: r.id || r.key,
                exists: () => true,
                data: () => docData
            };
        }).filter(doc => {
            const d = doc.data();
            for (const c of constraints) {
                if (c.type === 'where') {
                    const val = d[c.field] !== undefined ? d[c.field] : d[mapFieldToColumn(c.field)];
                    if (c.op === '==' || c.op === '===') {
                        if ((c.field === 'allowedClassId' || c.field === 'allowedClassIds' || c.field === 'assignTo' || c.field === 'assignedTo') && Array.isArray(val)) {
                            if (!val.includes(c.value)) return false;
                        } else if (c.value === null) {
                            if (val !== null && val !== undefined && val !== '') return false;
                        } else if (val !== c.value) {
                            return false;
                        }
                    } else if (c.op === '!=') {
                        if (c.value === null) {
                            if (val === null || val === undefined || val === '') return false;
                        } else if (val === c.value) {
                            return false;
                        }
                    } else if (c.op === 'array-contains') {
                        if (!Array.isArray(val) || !val.includes(c.value)) return false;
                    } else if (c.op === 'array-contains-any') {
                        if (!Array.isArray(val) || !Array.isArray(c.value) || !val.some(x => c.value.includes(x))) return false;
                    } else if (c.op === 'in') {
                        if (!Array.isArray(c.value) || !c.value.includes(val)) return false;
                    }
                }
            }
            return true;
        });

        return {
            docs,
            forEach: (cb) => docs.forEach(cb),
            size: docs.length,
            empty: docs.length === 0
        };
    } catch (err) {
        console.warn(`[Supabase getDocs] Lỗi truy vấn bảng ${queryOrColRef.table}:`, err);
        if (queryOrColRef.table === 'vouchers') {
            try {
                const { data: confVouchers } = await supabase
                    .from('configurations')
                    .select('*')
                    .like('id', 'voucher_%');
                if (Array.isArray(confVouchers)) {
                    const docs = confVouchers.map(r => {
                        const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
                        const voucherId = raw.id || r.id.replace(/^voucher_/, '');
                        const docData = unwrapRecord({ id: voucherId, ...raw });
                        return {
                            id: voucherId,
                            exists: () => true,
                            data: () => docData
                        };
                    });
                    return {
                        docs,
                        forEach: (cb) => docs.forEach(cb),
                        size: docs.length,
                        empty: docs.length === 0
                    };
                }
            } catch(e) {}
        }
        return {
            docs: [],
            forEach: () => {},
            size: 0,
            empty: true
        };
    }
}

// ==========================================
// FIREBASE FIRESTORE ORDERS DUAL-STORAGE BRIDGE
// ==========================================
const FIREBASE_REST_CONFIG = {
    apiKey: "AIzaSyCqAX3x1MbJ3do7m3EaH9JA4kFuVhlAc78",
    projectId: "lms-thitracnghiem"
};

function toFirestoreFields(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const fields = {};
    for (const [key, val] of Object.entries(obj)) {
        if (val === undefined || val === null) {
            fields[key] = { nullValue: null };
        } else if (val instanceof Date) {
            fields[key] = { timestampValue: val.toISOString() };
        } else if (typeof val === 'boolean') {
            fields[key] = { booleanValue: val };
        } else if (typeof val === 'number') {
            if (Number.isInteger(val)) {
                fields[key] = { integerValue: String(val) };
            } else {
                fields[key] = { doubleValue: val };
            }
        } else if (typeof val === 'string') {
            fields[key] = { stringValue: val };
        } else if (Array.isArray(val)) {
            fields[key] = {
                arrayValue: {
                    values: val.map(item => {
                        if (item === undefined || item === null) return { nullValue: null };
                        if (item instanceof Date) return { timestampValue: item.toISOString() };
                        if (typeof item === 'string') return { stringValue: item };
                        if (typeof item === 'number') return Number.isInteger(item) ? { integerValue: String(item) } : { doubleValue: item };
                        if (typeof item === 'boolean') return { booleanValue: item };
                        if (typeof item === 'object') return { mapValue: { fields: toFirestoreFields(item) } };
                        return { stringValue: String(item) };
                    })
                }
            };
        } else if (typeof val === 'object') {
            fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
        }
    }
    return fields;
}

function fromFirestoreFields(fields) {
    if (!fields) return {};
    const obj = {};
    for (const [key, valObj] of Object.entries(fields)) {
        if ('stringValue' in valObj) obj[key] = valObj.stringValue;
        else if ('integerValue' in valObj) obj[key] = Number(valObj.integerValue);
        else if ('doubleValue' in valObj) obj[key] = Number(valObj.doubleValue);
        else if ('booleanValue' in valObj) obj[key] = valObj.booleanValue;
        else if ('nullValue' in valObj) obj[key] = null;
        else if ('timestampValue' in valObj) obj[key] = valObj.timestampValue;
        else if ('arrayValue' in valObj) {
            obj[key] = (valObj.arrayValue.values || []).map(v => {
                if ('stringValue' in v) return v.stringValue;
                if ('integerValue' in v) return Number(v.integerValue);
                if ('doubleValue' in v) return Number(v.doubleValue);
                if ('booleanValue' in v) return v.booleanValue;
                if ('mapValue' in v) return fromFirestoreFields(v.mapValue.fields);
                return null;
            });
        }
        else if ('mapValue' in valObj) obj[key] = fromFirestoreFields(valObj.mapValue.fields);
    }
    return obj;
}

async function syncOrderToFirebase(orderId, orderData, isPartial = false) {
    if (!orderId || !orderData) return;
    try {
        let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_REST_CONFIG.projectId}/databases/(default)/documents/orders/${encodeURIComponent(orderId)}?key=${FIREBASE_REST_CONFIG.apiKey}`;
        const fields = toFirestoreFields(orderData);
        if (isPartial) {
            const keys = Object.keys(fields);
            if (keys.length > 0) {
                const maskParams = keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
                url += `&${maskParams}`;
            }
        }
        await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields })
        });
        console.log(`[Dual-DB Sync] Đã đồng bộ đơn hàng ${orderId} lên Firebase Firestore! (partial=${isPartial})`);
    } catch(err) {
        console.warn(`[Dual-DB Sync] Lỗi đồng bộ đơn hàng ${orderId} lên Firebase:`, err);
    }
}

async function deleteOrderFromFirebase(orderId) {
    if (!orderId) return;
    try {
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_REST_CONFIG.projectId}/databases/(default)/documents/orders/${encodeURIComponent(orderId)}?key=${FIREBASE_REST_CONFIG.apiKey}`;
        await fetch(url, { method: 'DELETE' });
    } catch(e) {}
}

async function getOrderFromFirebase(orderId) {
    if (!orderId) return null;
    try {
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_REST_CONFIG.projectId}/databases/(default)/documents/orders/${encodeURIComponent(orderId)}?key=${FIREBASE_REST_CONFIG.apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
            const json = await res.json();
            if (json && json.fields) {
                return { id: orderId, ...fromFirestoreFields(json.fields) };
            }
        }
    } catch(e) {}
    return null;
}

function generateId() {
    return 'sb_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function mergeDeep(target, source) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
        return source !== undefined ? source : target;
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return source !== undefined ? source : target;
    }
    const output = { ...target };
    for (const key of Object.keys(source)) {
        const sVal = source[key];
        const tVal = target[key];
        if (sVal && typeof sVal === 'object' && !Array.isArray(sVal) && !(sVal instanceof Date) &&
            tVal && typeof tVal === 'object' && !Array.isArray(tVal) && !(tVal instanceof Date)) {
            output[key] = mergeDeep(tVal, sVal);
        } else {
            output[key] = sVal;
        }
    }
    return output;
}

export async function setDoc(docRef, data, options = {}) {
    const table = docRef.table;
    const pkCol = getPrimaryKeyCol(table);

    if (VIRTUAL_CONFIG_PREFIX[table]) {
        const prefix = VIRTUAL_CONFIG_PREFIX[table];
        const rawId = String(docRef.id || '');
        const confId = rawId.startsWith(prefix) ? rawId : (prefix + rawId);
        const cleanId = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
        let vData = data;
        if (options && options.merge) {
            try {
                const { data: ex } = await supabase.from('configurations').select('raw_data').eq('id', confId).maybeSingle();
                if (ex && ex.raw_data) vData = mergeDeep(ex.raw_data, data);
            } catch(e) {}
        }
        const confPayload = {
            id: confId,
            raw_data: { id: cleanId, ...vData, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
        };
        const { error: confErr } = await supabase.from('configurations').upsert(confPayload, { onConflict: 'id' });
        if (confErr) throw confErr;
        return docRef;
    }
    let finalData = data;
    if (options && options.merge) {
        try {
            const { data: existingRow } = await supabase
                .from(table)
                .select('*')
                .eq(pkCol, docRef.id)
                .maybeSingle();
            if (existingRow) {
                const unwrapped = unwrapRecord(existingRow);
                // Xóa các key snake_case trong unwrapped nếu data truyền vào key camelCase (hoặc ngược lại)
                // để tránh việc key cũ trong unwrapped đè lên giá trị mới của data sau mergeDeep
                for (const k of Object.keys(data)) {
                    const mappedCol = mapFieldToColumn(k);
                    if (mappedCol && mappedCol !== k) {
                        delete unwrapped[mappedCol];
                    }
                    for (const [aliasK, aliasCol] of Object.entries(FIELD_TO_COLUMN_MAP)) {
                        if (aliasCol === mappedCol && aliasK !== k) {
                            delete unwrapped[aliasK];
                        }
                    }
                }
                finalData = mergeDeep(unwrapped, data);
            }
        } catch (e) {
            console.warn(`[Supabase setDoc merge] Error reading existing row for ${table}/${docRef.id}:`, e);
        }
    }

    const payload = toSupabasePayload(table, docRef.id, finalData);

    if (table === 'orders') {
        await syncOrderToFirebase(docRef.id, { id: docRef.id, ...finalData }, !!options.merge);
    }

    try {
        if (table === 'custom_topics') {
            const confId = docRef.id.startsWith('topic_') ? docRef.id : ('topic_' + docRef.id);
            const cleanId = docRef.id.replace(/^topic_/, '');
            const confPayload = {
                id: confId,
                raw_data: { id: cleanId, ...finalData, updatedAt: new Date().toISOString() },
                updated_at: new Date().toISOString()
            };
            const { error: confErr } = await supabase
                .from('configurations')
                .upsert(confPayload, { onConflict: 'id' });
            if (confErr) throw confErr;
            return docRef;
        }

        if (table === 'site_settings') {
            const confPayload = {
                id: 'setting_' + docRef.id,
                raw_data: finalData,
                updated_at: new Date().toISOString()
            };
            const { error: confErr } = await supabase
                .from('configurations')
                .upsert(confPayload, { onConflict: 'id' });
            if (confErr) console.warn('[Supabase setDoc configurations fallback]:', confErr);
            else console.log(`[Supabase setDoc] Đã lưu cài đặt setting_${docRef.id} vào bảng configurations thành công!`);
        }

        if (table === 'public_courses') {
            try {
                const confPayload = {
                    id: 'course_' + docRef.id,
                    raw_data: { id: docRef.id, ...finalData, updatedAt: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                };
                if ((!confPayload.raw_data.thumbnail || !confPayload.raw_data.thumbnail.trim()) && Array.isArray(confPayload.raw_data.images) && confPayload.raw_data.images.length > 0) {
                    confPayload.raw_data.thumbnail = confPayload.raw_data.images[0];
                }
                if ((!confPayload.raw_data.images || confPayload.raw_data.images.length === 0) && confPayload.raw_data.thumbnail) {
                    confPayload.raw_data.images = [confPayload.raw_data.thumbnail];
                }
                await supabase
                    .from('configurations')
                    .upsert(confPayload, { onConflict: 'id' });
                console.log(`[Supabase setDoc] Đã lưu khóa học ${docRef.id} vào configurations thành công!`);
            } catch(e) {
                console.warn('[Supabase setDoc configurations sync]:', e);
            }
        }
        if (table === 'vouchers') {
            try {
                const confPayload = {
                    id: 'voucher_' + docRef.id,
                    raw_data: { id: docRef.id, ...finalData, updatedAt: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                };
                await supabase
                    .from('configurations')
                    .upsert(confPayload, { onConflict: 'id' });
                console.log(`[Supabase setDoc] Đã lưu voucher ${docRef.id} vào configurations thành công!`);
            } catch(e) {
                console.warn('[Supabase setDoc configurations sync]:', e);
            }
        }

        const { error } = await supabase
            .from(table)
            .upsert(payload, { onConflict: pkCol });
        if (error && table !== 'site_settings' && table !== 'public_courses' && table !== 'vouchers') throw error;
        return docRef;
    } catch (err) {
        console.warn(`[Supabase setDoc retry] Lỗi upsert vào ${table}:`, err);
        if (table === 'site_settings') {
            try {
                const confPayload = {
                    id: 'setting_' + docRef.id,
                    raw_data: finalData,
                    updated_at: new Date().toISOString()
                };
                const { error: confErr } = await supabase
                    .from('configurations')
                    .upsert(confPayload, { onConflict: 'id' });
                if (confErr) throw confErr;
                console.log(`[Supabase setDoc] Đã lưu dự phòng cài đặt setting_${docRef.id} vào bảng configurations!`);
                return docRef;
            } catch(fallbackErr) {
                console.error('[Supabase setDoc fallback failed]:', fallbackErr);
                throw fallbackErr;
            }
        }
        if (table === 'public_courses') {
            try {
                const confPayload = {
                    id: 'course_' + docRef.id,
                    raw_data: { id: docRef.id, ...finalData, updatedAt: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                };
                const { error: confErr } = await supabase
                    .from('configurations')
                    .upsert(confPayload, { onConflict: 'id' });
                if (confErr) throw confErr;
                console.log(`[Supabase setDoc] Đã lưu dự phòng khóa học ${docRef.id} vào bảng configurations thành công!`);
                return docRef;
            } catch(fallbackErr) {
                console.error('[Supabase setDoc fallback failed]:', fallbackErr);
                throw fallbackErr;
            }
        }
        if (table === 'vouchers') {
            try {
                const confPayload = {
                    id: 'voucher_' + docRef.id,
                    raw_data: { id: docRef.id, ...finalData, updatedAt: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                };
                const { error: confErr } = await supabase
                    .from('configurations')
                    .upsert(confPayload, { onConflict: 'id' });
                if (confErr) throw confErr;
                console.log(`[Supabase setDoc] Đã lưu dự phòng voucher ${docRef.id} vào bảng configurations thành công!`);
                return docRef;
            } catch(fallbackErr) {
                console.error('[Supabase setDoc fallback failed]:', fallbackErr);
                throw fallbackErr;
            }
        }
        const fallback = {
            [pkCol]: docRef.id,
            ...(finalData.title ? { title: finalData.title } : (table === 'exams' ? { title: 'Đề thi' } : {})),
            ...(finalData.name ? { name: finalData.name } : (table === 'classes' ? { name: 'Lớp' } : {})),
            ...(finalData.content ? { content: finalData.content } : (table === 'orders' ? { content: 'ORDER_' + docRef.id.slice(0, 8), amount: finalData.amount || 0 } : {})),
            raw_data: finalData
        };
        const { error: err2 } = await supabase.from(table).upsert(fallback, { onConflict: pkCol });
        if (err2) throw err2;
    }
    return docRef;
}

export async function updateDoc(docRef, updates) {
    const table = docRef.table;
    if (VIRTUAL_CONFIG_PREFIX[table]) {
        const prefix = VIRTUAL_CONFIG_PREFIX[table];
        const rawId = String(docRef.id || '');
        const confId = rawId.startsWith(prefix) ? rawId : (prefix + rawId);
        const cleanId = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
        const { data: existing } = await supabase.from('configurations').select('raw_data').eq('id', confId).maybeSingle();
        const currRaw = (existing && existing.raw_data && typeof existing.raw_data === 'object') ? existing.raw_data : {};
        const mergedRaw = { id: cleanId, ...currRaw, ...updates, updatedAt: new Date().toISOString() };
        await supabase.from('configurations').upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
        return docRef;
    }
    const pkCol = getPrimaryKeyCol(table);
    const validCols = TABLE_COLUMNS[table];
    const payload = {};
    for (const [k, v] of Object.entries(updates)) {
        const col = mapFieldToColumn(k);
        let val = v;
        if (v && v.__op === 'arrayUnion') {
            const current = await getDoc(docRef);
            const currArr = current.data()[k] || [];
            val = [...currArr, ...v.items];
        } else if (v && v.__op === 'increment') {
            const current = await getDoc(docRef);
            const currVal = current.data()[k] || 0;
            val = currVal + v.value;
        }
        if (!validCols || validCols.includes(col)) {
            payload[col] = sanitizeColumnValue(col, val);
        }
    }
    if (!validCols || validCols.includes('updated_at')) {
        payload['updated_at'] = new Date().toISOString();
    }

    if (table === 'results') {
        const tgId = (updates.telegramFileId !== undefined) ? updates.telegramFileId :
                     ((updates.teacherFeedback !== undefined) ? updates.teacherFeedback :
                     ((updates.telegram_file_id !== undefined) ? updates.telegram_file_id : null));
        if (tgId !== null) {
            payload.teacher_feedback = String(tgId || '');
            const tgUrl = (updates.telegramPhotoUrl !== undefined) ? updates.telegramPhotoUrl : (updates.telegram_photo_url || '');
            try {
                const { data: curRow } = await supabase.from('results').select('brief_notes').eq(pkCol, docRef.id).maybeSingle();
                let meta = {};
                if (curRow && curRow.brief_notes && curRow.brief_notes.startsWith('{')) {
                    try { meta = JSON.parse(curRow.brief_notes); } catch(_) {}
                }
                meta.tg = String(tgId || '');
                if (tgUrl !== undefined) meta.url = String(tgUrl || '');
                payload.brief_notes = JSON.stringify(meta);
            } catch(_) {}
        }
    }

    try {
        if (table === 'custom_topics') {
            const confId = docRef.id.startsWith('topic_') ? docRef.id : ('topic_' + docRef.id);
            const { data: existing } = await supabase
                .from('configurations')
                .select('raw_data')
                .eq('id', confId)
                .maybeSingle();
            const currRaw = (existing && existing.raw_data && typeof existing.raw_data === 'object') ? existing.raw_data : {};
            const mergedRaw = { ...currRaw, ...updates, updatedAt: new Date().toISOString() };
            await supabase
                .from('configurations')
                .upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
            return docRef;
        }
        if (table === 'site_settings') {
            try {
                const confId = 'setting_' + docRef.id;
                const { data: existing } = await supabase
                    .from('configurations')
                    .select('raw_data')
                    .eq('id', confId)
                    .maybeSingle();
                const currRaw = (existing && existing.raw_data) ? existing.raw_data : {};
                const mergedRaw = { ...currRaw, ...updates, updatedAt: new Date().toISOString() };
                await supabase
                    .from('configurations')
                    .upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
            } catch(e) {}
        }
        if (table === 'public_courses') {
            try {
                const confId = 'course_' + docRef.id;
                const { data: existing } = await supabase
                    .from('configurations')
                    .select('raw_data')
                    .eq('id', confId)
                    .maybeSingle();
                const currRaw = (existing && existing.raw_data && typeof existing.raw_data === 'object') ? existing.raw_data : {};
                const mergedRaw = { ...currRaw, ...updates, id: docRef.id, updatedAt: new Date().toISOString() };
                if ((!mergedRaw.thumbnail || !mergedRaw.thumbnail.trim()) && Array.isArray(mergedRaw.images) && mergedRaw.images.length > 0) {
                    mergedRaw.thumbnail = mergedRaw.images[0];
                }
                if ((!mergedRaw.images || mergedRaw.images.length === 0) && mergedRaw.thumbnail) {
                    mergedRaw.images = [mergedRaw.thumbnail];
                }
                await supabase
                    .from('configurations')
                    .upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                console.log(`[Supabase updateDoc] Đã đồng bộ khóa học ${docRef.id} vào bảng configurations thành công!`);
            } catch(e) {
                console.warn("[Supabase updateDoc configurations sync error]:", e);
            }

            try {
                const { data: cDoc } = await supabase.from('public_courses').select('raw_data').eq(pkCol, docRef.id).maybeSingle();
                if (cDoc) {
                    const currRaw = (cDoc.raw_data && typeof cDoc.raw_data === 'object') ? cDoc.raw_data : {};
                    payload.raw_data = { ...currRaw, ...updates, id: docRef.id, updatedAt: payload.updated_at || new Date().toISOString() };
                }
            } catch(e) {}
        }
        if (table === 'vouchers') {
            try {
                const confId = 'voucher_' + docRef.id;
                const { data: existing } = await supabase
                    .from('configurations')
                    .select('raw_data')
                    .eq('id', confId)
                    .maybeSingle();
                const currRaw = (existing && existing.raw_data && typeof existing.raw_data === 'object') ? existing.raw_data : {};
                const mergedRaw = { ...currRaw, ...updates, id: docRef.id, updatedAt: new Date().toISOString() };
                await supabase
                    .from('configurations')
                    .upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                console.log(`[Supabase updateDoc] Đã đồng bộ voucher ${docRef.id} vào bảng configurations thành công!`);
            } catch(e) {
                console.warn("[Supabase updateDoc configurations sync error]:", e);
            }
        }
        if (validCols && validCols.includes('raw_data')) {
            try {
                const { data: existingDoc } = await supabase.from(table).select('raw_data').eq(pkCol, docRef.id).maybeSingle();
                const currRaw = (existingDoc && existingDoc.raw_data && typeof existingDoc.raw_data === 'object') ? existingDoc.raw_data : {};
                const resolvedUpdates = {};
                for (const [k, v] of Object.entries(updates)) {
                    if (v && v.__op === 'arrayUnion') {
                        const currArr = Array.isArray(currRaw[k]) ? currRaw[k] : [];
                        const itemsToAdd = (v.items || []).filter(item => {
                            if (item && item.courseId) {
                                return !currArr.some(x => x && x.courseId === item.courseId);
                            }
                            return true;
                        });
                        resolvedUpdates[k] = [...currArr, ...itemsToAdd];
                    } else if (v && v.__op === 'increment') {
                        const currVal = typeof currRaw[k] === 'number' ? currRaw[k] : 0;
                        resolvedUpdates[k] = currVal + v.value;
                    } else {
                        resolvedUpdates[k] = v;
                    }
                }
                payload.raw_data = {
                    ...currRaw,
                    ...(payload.raw_data || {}),
                    ...resolvedUpdates,
                    updatedAt: payload.updated_at || new Date().toISOString()
                };
                if (updates.password) {
                    payload.raw_data.password = String(updates.password).trim();
                }
            } catch(e) {
                console.warn(`[Supabase updateDoc raw_data merge error ${table}]:`, e);
            }
        }
        const { error } = await supabase
            .from(table)
            .update(payload)
            .eq(pkCol, docRef.id);
        if (error && table !== 'site_settings' && table !== 'public_courses' && table !== 'vouchers') throw error;
    } catch (err) {
        console.warn(`[Supabase updateDoc retry] Fallback update ${table}:`, err);
        if (table === 'site_settings') {
            try {
                const confId = 'setting_' + docRef.id;
                const { data: existing } = await supabase
                    .from('configurations')
                    .select('raw_data')
                    .eq('id', confId)
                    .maybeSingle();
                const currRaw = (existing && existing.raw_data) ? existing.raw_data : {};
                const mergedRaw = { ...currRaw, ...updates, updatedAt: new Date().toISOString() };
                await supabase
                    .from('configurations')
                    .upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                return docRef;
            } catch(e) {
                console.error('[Supabase updateDoc configurations fallback error]:', e);
            }
        }
        if (table === 'public_courses') {
            try {
                const confId = 'course_' + docRef.id;
                const { data: existing } = await supabase
                    .from('configurations')
                    .select('raw_data')
                    .eq('id', confId)
                    .maybeSingle();
                const currRaw = (existing && existing.raw_data) ? existing.raw_data : {};
                const mergedRaw = { ...currRaw, ...updates, updatedAt: new Date().toISOString() };
                await supabase
                    .from('configurations')
                    .upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                return docRef;
            } catch(e) {
                console.error('[Supabase updateDoc configurations fallback error]:', e);
            }
        }
        if (table === 'vouchers') {
            try {
                const confId = 'voucher_' + docRef.id;
                const { data: existing } = await supabase
                    .from('configurations')
                    .select('raw_data')
                    .eq('id', confId)
                    .maybeSingle();
                const currRaw = (existing && existing.raw_data) ? existing.raw_data : {};
                const mergedRaw = { ...currRaw, ...updates, updatedAt: new Date().toISOString() };
                await supabase
                    .from('configurations')
                    .upsert({ id: confId, raw_data: mergedRaw, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                return docRef;
            } catch(e) {
                console.error('[Supabase updateDoc configurations fallback error]:', e);
            }
        }
    }
    if (table === 'orders') {
        const cleanUpdates = {};
        for (const [k, v] of Object.entries(updates)) {
            if (v && v.__op) continue;
            cleanUpdates[k] = v;
        }
        if (payload.updated_at) cleanUpdates.updatedAt = payload.updated_at;
        await syncOrderToFirebase(docRef.id, cleanUpdates, true);
    }
    return docRef;
}

export async function addDoc(colRef, data) {
    const newId = generateId();
    const table = colRef.table;
    if (VIRTUAL_CONFIG_PREFIX[table]) {
        const prefix = VIRTUAL_CONFIG_PREFIX[table];
        const confPayload = {
            id: prefix + newId,
            raw_data: { id: newId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
        };
        await supabase.from('configurations').upsert(confPayload, { onConflict: 'id' });
        return { id: newId };
    }

    if (table === 'custom_topics') {
        const confPayload = {
            id: 'topic_' + newId,
            raw_data: { id: newId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
        };
        await supabase.from('configurations').upsert(confPayload, { onConflict: 'id' });
        return { id: newId };
    }

    if (table === 'qpoint_transactions') {
        const confPayload = {
            id: 'qptx_' + newId,
            raw_data: { id: newId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
        };
        try {
            await supabase.from('configurations').upsert(confPayload, { onConflict: 'id' });
        } catch(e) {
            console.warn('[Supabase addDoc qpoint_transactions]:', e);
        }
        return { id: newId };
    }

    if (table === 'vouchers') {
        const confPayload = {
            id: 'voucher_' + newId,
            raw_data: { id: newId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
        };
        try {
            await supabase.from('configurations').upsert(confPayload, { onConflict: 'id' });
            return { id: newId };
        } catch(e) {
            console.warn('[Supabase addDoc vouchers]:', e);
        }
    }

    const payload = toSupabasePayload(table, newId, data);

    try {
        const { data: inserted, error } = await supabase
            .from(table)
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        const resId = inserted ? (inserted.id || inserted.key) : newId;
        if (table === 'orders') {
            await syncOrderToFirebase(resId, { id: resId, ...data });
        }
        return { id: resId };
    } catch (err) {
        console.warn(`[Supabase addDoc retry] Fallback insert ${table}:`, err);
        if (table === 'public_courses') {
            try {
                const confPayload = {
                    id: 'course_' + newId,
                    raw_data: { id: newId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                };
                await supabase.from('configurations').upsert(confPayload, { onConflict: 'id' });
                return { id: newId };
            } catch(e) {}
        }
        if (table === 'vouchers') {
            try {
                const confPayload = {
                    id: 'voucher_' + newId,
                    raw_data: { id: newId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    updated_at: new Date().toISOString()
                };
                await supabase.from('configurations').upsert(confPayload, { onConflict: 'id' });
                return { id: newId };
            } catch(e) {}
        }
        const fallback = { id: newId, raw_data: data };
        await supabase.from(table).insert(fallback);
        if (table === 'orders') {
            await syncOrderToFirebase(newId, { id: newId, ...data });
        }
        return { id: newId };
    }
}

export async function deleteDoc(docRef) {
    const table = docRef.table;
    if (VIRTUAL_CONFIG_PREFIX[table]) {
        const prefix = VIRTUAL_CONFIG_PREFIX[table];
        const rawId = String(docRef.id || '');
        const confId = rawId.startsWith(prefix) ? rawId : (prefix + rawId);
        try { await supabase.from('configurations').delete().eq('id', confId); } catch(e) {}
        return true;
    }
    const pkCol = getPrimaryKeyCol(table);
    if (table === 'orders') {
        await deleteOrderFromFirebase(docRef.id);
    }
    try {
        const { error } = await supabase
            .from(table)
            .delete()
            .eq(pkCol, docRef.id);
        if (error && table !== 'site_settings' && table !== 'vouchers') throw error;
    } catch (err) {
        console.warn(`[Supabase deleteDoc] Lỗi xóa bản ghi từ ${table}:`, err);
    }
    if (table === 'site_settings') {
        try {
            await supabase
                .from('configurations')
                .delete()
                .eq('id', 'setting_' + docRef.id);
        } catch(e) {}
    }
    if (table === 'public_courses') {
        try {
            await supabase
                .from('configurations')
                .delete()
                .eq('id', 'course_' + docRef.id);
        } catch(e) {}
    }
    if (table === 'vouchers') {
        try {
            await supabase
                .from('configurations')
                .delete()
                .eq('id', 'voucher_' + docRef.id);
        } catch(e) {}
    }
    if (table === 'custom_topics') {
        try {
            const confId = docRef.id.startsWith('topic_') ? docRef.id : ('topic_' + docRef.id);
            await supabase
                .from('configurations')
                .delete()
                .eq('id', confId);
        } catch(e) {}
    }
    return true;
}

export function onSnapshot(targetRef, callback, errorCallback) {
    const table = VIRTUAL_CONFIG_PREFIX[targetRef.table] ? 'configurations' : targetRef.table;
    const channelId = `realtime_${table}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    if (targetRef.type === 'doc') {
        getDoc(targetRef).then(snap => callback(snap)).catch(err => errorCallback && errorCallback(err));
    } else {
        getDocs(targetRef).then(snap => callback(snap)).catch(err => errorCallback && errorCallback(err));
    }

    let pollTimer = null;
    if (targetRef.type === 'doc' && table === 'orders') {
        pollTimer = setInterval(async () => {
            try {
                const snap = await getDoc(targetRef);
                if (snap && snap.exists()) {
                    const s = String(snap.data().status || '').toLowerCase().trim();
                    if (s === 'completed' || s === 'paid' || s === 'approved' || s === 'success') {
                        if (pollTimer) {
                            clearInterval(pollTimer);
                            pollTimer = null;
                        }
                        callback(snap);
                    }
                }
            } catch(e) {}
        }, 2500);
    }

    const channel = supabase.channel(channelId)
        .on('postgres_changes', { event: '*', schema: 'public', table: table }, () => {
            if (targetRef.type === 'doc') {
                getDoc(targetRef).then(snap => callback(snap)).catch(err => errorCallback && errorCallback(err));
            } else {
                getDocs(targetRef).then(snap => callback(snap)).catch(err => errorCallback && errorCallback(err));
            }
        })
        .subscribe();

    return () => {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        supabase.removeChannel(channel);
    };
}

export const arrayUnion = (...items) => ({ __op: 'arrayUnion', items });
export const arrayRemove = (...items) => ({ __op: 'arrayRemove', items });
export const serverTimestamp = () => new Date().toISOString();
export const increment = (n) => ({ __op: 'increment', value: n });
export const enableMultiTabIndexedDbPersistence = () => Promise.resolve();
export const getDocFromCache = (docRef) => getDoc(docRef);
// Thêm helper Firestore cache và init vào cuối supabase-db-compat.js
export function initializeFirestore(app, options) { return { name: 'supabase_db' }; }
export function persistentLocalCache(opts) { return {}; }
export function persistentMultipleTabManager() { return {}; }
// Thêm writeBatch vào cuối supabase-db-compat.js
export function writeBatch(db) {
    const ops = [];
    return {
        set: (docRef, data) => ops.push(() => setDoc(docRef, data)),
        update: (docRef, data) => ops.push(() => updateDoc(docRef, data)),
        delete: (docRef) => ops.push(() => deleteDoc(docRef)),
        commit: async () => {
            for (const op of ops) {
                try { await op(); } catch(e) { console.warn('writeBatch op error:', e); }
            }
        }
    };
}


if (typeof window !== 'undefined') {
    window.db = window.db || getFirestore();
    window.auth = window.auth || authInstance;
    window.supabase = supabase;
    window.doc = window.doc || doc;
    window.getDoc = window.getDoc || getDoc;
    window.setDoc = window.setDoc || setDoc;
    window.updateDoc = window.updateDoc || updateDoc;
    window.deleteDoc = window.deleteDoc || deleteDoc;
    window.collection = window.collection || collection;
    window.query = window.query || query;
    window.where = window.where || where;
    window.getDocs = window.getDocs || getDocs;
    window.includeQuestions = window.includeQuestions || includeQuestions;
    window.getOrCreateParentWatchToken = window.getOrCreateParentWatchToken || getOrCreateParentWatchToken;
    window.resolveParentWatchData = window.resolveParentWatchData || resolveParentWatchData;
}

export const db = getFirestore();
export const auth = authInstance;
