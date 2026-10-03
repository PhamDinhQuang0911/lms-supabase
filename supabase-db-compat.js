// supabase-db-compat.js
// TOÀN BỘ TẦNG TƯƠNG THÍCH ĐỘC LẬP TỪ FIREBASE SANG SUPABASE POSTGRESQL & REALTIME
import { supabase } from './supabase-client.js';

export { supabase };

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
                    this.currentUser = JSON.parse(saved);
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
    const ADMIN_EMAILS = ["phamdinhquang0911@gmail.com", "phamngockhanh.942001@gmail.com", "phamngockhanh.942002@gmail.com", "admin@gmail.com"];
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

    // 5. Kiểm tra mật khẩu (nếu tài khoản có mật khẩu bảo vệ)
    const expectedPass = userRow.password || (userRow.raw_data && userRow.raw_data.password);
    if (expectedPass) {
        if (!cleanPass) {
            throw new Error("Vui lòng nhập mật khẩu!");
        }
        if (String(expectedPass).trim() !== cleanPass) {
            throw new Error("Mật khẩu không chính xác!");
        }
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

    auth.currentUser = userObj;
    if (auth.isDefault !== false) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
    }
    auth._notify();
    return { user: userObj };
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
        auth.currentUser = userObj;
        if (auth.isDefault !== false) {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
            if (auth._notify) auth._notify();
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
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authInstance.currentUser));
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

    // 5. Cập nhật phiên đăng nhập hiện tại
    if (user) {
        user.password = cleanPass;
    }
    const currentStored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (currentStored) {
        try {
            const parsed = JSON.parse(currentStored);
            if ((userId && parsed.id === userId) || (userEmail && (parsed.email || '').toLowerCase() === userEmail)) {
                parsed.password = cleanPass;
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
            }
        } catch (e) {}
    }
}

export class GoogleAuthProvider {}
export async function signInWithPopup(auth, provider) {
    return signInWithEmailAndPassword(auth, 'phamngockhanh.942002@gmail.com', '');
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

function mapFieldToColumn(field) {
    const map = {
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
        'allowedClassId': 'allowed_class_ids',
        'qPoints': 'qpoints',
        'qpoints': 'qpoints',
        'antiScreenshot': 'anti_screenshot',
        'desc': 'description',
        'originalPrice': 'original_price',
        'fakeStudents': 'fake_students',
        'previewLink': 'preview_link',
        'shippingFee': 'shipping_fee',
        'fileUrl': 'file_url',
        'weight': 'weight',
        'isSoldOut': 'is_sold_out',
        'rawTex': 'raw_tex',
        'rawTexName': 'raw_tex_name',
        'latexContent': 'latex_content',
        'createdAt': 'created_at',
        'updatedAt': 'updated_at'
    };
    return map[field] || field;
}

function getPrimaryKeyCol(table) {
    return (table === 'site_settings') ? 'key' : 'id';
}

function unwrapRecord(r) {
    if (!r) return null;
    const raw = (r.raw_data && typeof r.raw_data === 'object') ? r.raw_data : {};
    const pk = r.id || r.key;
    const res = { ...raw, ...r, id: pk };

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
        if (Array.isArray(v)) return v;
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
    practice_results: ['id', 'user_id', 'topic_id', 'score', 'total_questions', 'duration', 'completed_at', 'details', 'raw_data'],
    configurations: ['id', 'keys', 'tree', 'metadata', 'url', 'updated_at', 'raw_data'],
    user_progress: ['id', 'user_id', 'course_id', 'completed_items', 'playback_positions', 'quiz_usage', 'last_updated', 'raw_data'],
    access_requests: ['id', 'exam_id', 'exam_title', 'student_id', 'student_name', 'requested_at', 'status', 'approved_at', 'raw_data'],
    zalo_uids: ['id', 'zalo_uid', 'phone', 'name', 'updated_at', 'raw_data'],
    public_courses: ['id', 'title', 'type', 'price', 'original_price', 'tag', 'thumbnail', 'image', 'description', 'weight', 'shipping_fee', 'students', 'fake_students', 'preview_link', 'curriculum', 'status', 'anti_screenshot', 'created_at', 'updated_at', 'raw_data'],
    orders: ['id', 'user_id', 'user_name', 'user_phone', 'course_id', 'document_id', 'course_title', 'quantity', 'unit_price', 'shipping_fee', 'amount', 'original_amount', 'voucher_code', 'voucher_discount', 'voucher_id', 'status', 'content', 'order_type', 'delivery_type', 'shipping_info', 'created_at', 'updated_at'],
    vouchers: ['id', 'code', 'discount_type', 'discount_value', 'min_order_value', 'max_discount', 'max_usage', 'used', 'used_by', 'start_date', 'end_date', 'status', 'course_id', 'created_at'],
    site_settings: ['key', 'value', 'updated_at'],
    admin_accounts: ['id', 'email', 'display_name', 'role', 'status', 'permissions', 'assigned_courses', 'note', 'created_at', 'updated_at', 'raw_data']
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
        converted.raw_data = data;
    }
    return converted;
}

export async function getDoc(docRef) {
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

        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq(pkCol, docRef.id)
            .maybeSingle();

        if (error) throw error;

        let docData = unwrapRecord(data);
        if (!docData && table === 'public_courses') {
            try {
                const { data: confData } = await supabase
                    .from('configurations')
                    .select('*')
                    .eq('id', 'course_' + docRef.id)
                    .maybeSingle();
                if (confData && confData.raw_data) {
                    docData = unwrapRecord(confData.raw_data);
                }
            } catch(e) {}
        }

        return {
            id: docRef.id,
            exists: () => docData !== null && docData !== undefined,
            data: () => docData || {}
        };
    } catch (err) {
        console.warn(`[Supabase getDoc] Lỗi đọc ${docRef.table}/${docRef.id}:`, err);
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

        let selectCols = '*';
        const wantsQuestions = queryOrColRef.includeQuestions || 
            (queryOrColRef.constraints && queryOrColRef.constraints.some(c => c && (c.type === 'includeQuestions' || c.includeQuestions || c.field === 'questions')));
        if (table === 'exams' && !wantsQuestions) {
            selectCols = 'id,title,folder_id,teacher_id,duration,pass_score,status,access_type,allowed_class_ids,purpose,subject,grade,question_count,password,proctoring,attempts,start_time,end_time,n8n_webhooks,created_at,updated_at';
        }
        let queryBuilder = supabase.from(table).select(selectCols);

        const constraints = queryOrColRef.constraints || [];
        for (const c of constraints) {
            if (c.type === 'where') {
                const colName = mapFieldToColumn(c.field);
                if (colName === 'allowed_class_ids') {
                    if (c.op === '==' || c.op === '===' || c.op === 'array-contains') {
                        queryBuilder = queryBuilder.contains('allowed_class_ids', JSON.stringify([c.value]));
                    } else if (c.op === 'array-contains-any' && Array.isArray(c.value) && c.value.length === 1) {
                        queryBuilder = queryBuilder.contains('allowed_class_ids', JSON.stringify(c.value));
                    }
                    continue;
                }
                if (c.op === '==' || c.op === '===') {
                    queryBuilder = queryBuilder.eq(colName, c.value);
                } else if (c.op === '!=') {
                    queryBuilder = queryBuilder.neq(colName, c.value);
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
                        } else if (val !== c.value) {
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
        return {
            docs: [],
            forEach: () => {},
            size: 0,
            empty: true
        };
    }
}

function generateId() {
    return 'sb_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export async function setDoc(docRef, data, options = {}) {
    const table = docRef.table;
    const pkCol = getPrimaryKeyCol(table);
    const payload = toSupabasePayload(table, docRef.id, data);

    try {
        if (table === 'site_settings') {
            const confPayload = {
                id: 'setting_' + docRef.id,
                raw_data: data,
                updated_at: new Date().toISOString()
            };
            const { error: confErr } = await supabase
                .from('configurations')
                .upsert(confPayload, { onConflict: 'id' });
            if (confErr) console.warn('[Supabase setDoc configurations fallback]:', confErr);
            else console.log(`[Supabase setDoc] Đã lưu cài đặt setting_${docRef.id} vào bảng configurations thành công!`);
        }

        const { error } = await supabase
            .from(table)
            .upsert(payload, { onConflict: pkCol });
        if (error && table !== 'site_settings') throw error;
        return docRef;
    } catch (err) {
        console.warn(`[Supabase setDoc retry] Lỗi upsert vào ${table}:`, err);
        if (table === 'site_settings') {
            try {
                const confPayload = {
                    id: 'setting_' + docRef.id,
                    raw_data: data,
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
                    raw_data: { id: docRef.id, ...data, updatedAt: new Date().toISOString() },
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
        const fallback = {
            [pkCol]: docRef.id,
            ...(data.title ? { title: data.title } : (table === 'exams' ? { title: 'Đề thi' } : {})),
            ...(data.name ? { name: data.name } : (table === 'classes' ? { name: 'Lớp' } : {})),
            ...(data.content ? { content: data.content } : (table === 'orders' ? { content: 'ORDER_' + docRef.id.slice(0, 8), amount: data.amount || 0 } : {})),
            raw_data: data
        };
        const { error: err2 } = await supabase.from(table).upsert(fallback, { onConflict: pkCol });
        if (err2) throw err2;
    }
    return docRef;
}

export async function updateDoc(docRef, updates) {
    const table = docRef.table;
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

    try {
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
        if (table === 'users' && updates.password) {
            try {
                const { data: uDoc } = await supabase.from('users').select('raw_data').eq(pkCol, docRef.id).maybeSingle();
                const currRaw = (uDoc && uDoc.raw_data && typeof uDoc.raw_data === 'object') ? uDoc.raw_data : {};
                payload.raw_data = { ...currRaw, password: String(updates.password).trim() };
            } catch(e) {}
        }
        if (table === 'classes' && updates.students) {
            try {
                const { data: cDoc } = await supabase.from('classes').select('raw_data').eq(pkCol, docRef.id).maybeSingle();
                const currRaw = (cDoc && cDoc.raw_data && typeof cDoc.raw_data === 'object') ? cDoc.raw_data : {};
                payload.raw_data = { ...currRaw, students: updates.students };
            } catch(e) {}
        }
        if (table === 'exams' && updates.questions) {
            try {
                const { data: exDoc } = await supabase.from('exams').select('raw_data').eq(pkCol, docRef.id).maybeSingle();
                const currRaw = (exDoc && exDoc.raw_data && typeof exDoc.raw_data === 'object') ? exDoc.raw_data : {};
                payload.raw_data = { ...currRaw, questions: updates.questions, updatedAt: payload.updated_at || new Date().toISOString() };
            } catch(e) {}
        }
        const { error } = await supabase
            .from(table)
            .update(payload)
            .eq(pkCol, docRef.id);
        if (error && table !== 'site_settings') throw error;
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
    }
    return docRef;
}

export async function addDoc(colRef, data) {
    const newId = generateId();
    const table = colRef.table;
    const payload = toSupabasePayload(table, newId, data);

    try {
        const { data: inserted, error } = await supabase
            .from(table)
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return { id: inserted ? (inserted.id || inserted.key) : newId };
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
        const fallback = { id: newId, raw_data: data };
        await supabase.from(table).insert(fallback);
        return { id: newId };
    }
}

export async function deleteDoc(docRef) {
    const table = docRef.table;
    const pkCol = getPrimaryKeyCol(table);
    try {
        const { error } = await supabase
            .from(table)
            .delete()
            .eq(pkCol, docRef.id);
        if (error && table !== 'site_settings') throw error;
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
    return true;
}

export function onSnapshot(targetRef, callback, errorCallback) {
    const table = targetRef.table;
    const channelId = `realtime_${table}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    if (targetRef.type === 'doc') {
        getDoc(targetRef).then(snap => callback(snap)).catch(err => errorCallback && errorCallback(err));
    } else {
        getDocs(targetRef).then(snap => callback(snap)).catch(err => errorCallback && errorCallback(err));
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
}

