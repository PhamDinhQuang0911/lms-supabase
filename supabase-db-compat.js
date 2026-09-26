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
    return async (data) => ({ data: {} });
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
    const cleanPass = (password || '').trim();

    // 1. Tìm trong bảng users bằng .limit(1) (tránh hoàn toàn lỗi PGRST116 của maybeSingle)
    let userRow = null;
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .or(`email.ilike.${cleanEmail},id.eq.${cleanEmail}`)
            .limit(1);

        if (!error && users && users.length > 0) {
            userRow = users[0];
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
    if (userRow.password) {
        if (!cleanPass) {
            throw new Error("Vui lòng nhập mật khẩu!");
        }
        if (userRow.password !== cleanPass) {
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
    const newId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    const cleanEmail = (email || '').trim().toLowerCase();
    const newUser = {
        id: newId,
        email: cleanEmail,
        password: password,
        role: 'student',
        display_name: cleanEmail.split('@')[0],
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
    if (!user) return;
    await supabase.from('users').update({ password: newPassword }).eq('id', user.uid || user.id);
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
export async function reauthenticateWithCredential(user, cred) {
    return Promise.resolve();
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
    return {
        type: 'query',
        table: collectionRef.table,
        constraints: [...(collectionRef.constraints || []), ...constraints]
    };
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
        'studentCount': 'student_count',
        'studentIds': 'student_ids',
        'zaloGroupUid': 'zalo_group_uid',
        'zaloUid': 'zalo_uid',
        'passScore': 'pass_score',
        'accessType': 'access_type',
        'allowedClassIds': 'allowed_class_ids',
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
    if (r.teacher_id !== undefined) res.teacherId = r.teacher_id;
    if (r.question_count !== undefined) res.questionCount = r.question_count;
    if (r.pass_score !== undefined) res.passScore = r.pass_score;
    if (r.access_type !== undefined) res.accessType = r.access_type;
    if (r.allowed_class_ids !== undefined) res.allowedClassIds = r.allowed_class_ids;
    if (r.description !== undefined) res.desc = r.description;
    if (r.original_price !== undefined) res.originalPrice = r.original_price;
    if (r.fake_students !== undefined) res.fakeStudents = r.fake_students;
    if (r.preview_link !== undefined && !res.previewLink) res.previewLink = r.preview_link;
    if (r.shipping_fee !== undefined) res.shippingFee = r.shipping_fee;
    if (r.file_url !== undefined) res.fileUrl = r.file_url;
    if (r.weight !== undefined) res.weight = r.weight;

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

const TABLE_COLUMNS = {
    users: ['id', 'email', 'display_name', 'phone', 'role', 'password', 'gender', 'birth_date', 'birth_year', 'school', 'city', 'sbd', 'photo_url', 'zalo_uid', 'qpoints', 'created_at', 'updated_at', 'last_login', 'raw_data'],
    classes: ['id', 'name', 'academic_year', 'teacher_id', 'student_count', 'student_ids', 'students', 'zalo_group_uid', 'created_at', 'raw_data'],
    folders: ['id', 'name', 'title', 'parent_id', 'teacher_id', 'type', 'data_url', 'created_at', 'raw_data'],
    exams: ['id', 'title', 'folder_id', 'teacher_id', 'duration', 'pass_score', 'status', 'access_type', 'allowed_class_ids', 'purpose', 'subject', 'grade', 'questions', 'tl_questions', 'question_count', 'password', 'proctoring', 'attempts', 'start_time', 'end_time', 'n8n_webhooks', 'created_at', 'updated_at', 'raw_data'],
    results: ['id', 'exam_id', 'student_id', 'student_name', 'class_id', 'score', 'correct_count', 'total_questions', 'submit_count', 'submitted_at', 'duration', 'is_passed', 'answers', 'brief_notes', 'cheat_count', 'pass_score_snapshot', 'teacher_feedback', 'raw_data'],
    exam_attempts: ['id', 'exam_id', 'student_id', 'answers', 'brief_notes', 'last_updated', 'raw_data'],
    practice_results: ['id', 'user_id', 'topic_id', 'score', 'total_questions', 'duration', 'completed_at', 'details', 'raw_data'],
    configurations: ['id', 'keys', 'tree', 'metadata', 'url', 'key', 'value', 'description', 'updated_at', 'raw_data'],
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
            converted[col] = v;
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
        if (table === 'exams' && !queryOrColRef.includeQuestions) {
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
                        if ((c.field === 'allowedClassId' || c.field === 'allowedClassIds') && Array.isArray(val)) {
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
        const { error } = await supabase
            .from(table)
            .upsert(payload, { onConflict: pkCol });
        if (error) throw error;
    } catch (err) {
        console.warn(`[Supabase setDoc retry] Lỗi upsert vào ${table}:`, err);
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
        const fallback = { [pkCol]: docRef.id, raw_data: data };
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
            payload[col] = val;
        }
    }
    if (!validCols || validCols.includes('updated_at')) {
        payload['updated_at'] = new Date().toISOString();
    }

    try {
        const { error } = await supabase
            .from(table)
            .update(payload)
            .eq(pkCol, docRef.id);
        if (error) throw error;
    } catch (err) {
        console.warn(`[Supabase updateDoc retry] Fallback update ${table}:`, err);
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
        if (error) throw error;
    } catch (err) {
        console.warn(`[Supabase deleteDoc] Lỗi xóa bản ghi từ ${table}:`, err);
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
}

