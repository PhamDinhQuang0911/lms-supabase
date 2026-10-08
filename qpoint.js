/**
 * qpoint.js — Hệ thống tiền tệ học tập Qpoint của QMath (file mới, dùng chung)
 *
 * Nguyên tắc thiết kế:
 *  1. Qpoint kiếm được từ VIỆC HỌC (làm bài, chuỗi ngày...) hoặc được nạp/tặng.
 *  2. Qpoint chỉ mua TIỆN ÍCH (gợi ý AI, 50/50, vé đóng băng chuỗi...), không mua đáp án.
 *  3. Mọi biến động đều ghi SỔ GIAO DỊCH (collection `qpoint_transactions`) để đối soát,
 *     không bao giờ chỉ sửa mỗi con số số dư.
 *
 * Cách dùng (trong <script type="module">):
 *   import { createQPoint } from './qpoint.js';
 *   const qp = createQPoint(db, user.uid);
 *   await qp.load();                         // đọc số dư (tự tặng 20 Qp chào mừng lần đầu)
 *   qp.onChange((bal) => ...);               // cập nhật UI khi số dư đổi
 *   await qp.award(10, 'practice_complete'); // cộng điểm
 *   const r = await qp.spend(5, 'ai_hint');  // trừ điểm -> {ok, balance}
 */
import {
    doc, getDoc, setDoc, updateDoc, addDoc, collection, increment,
    query, where, orderBy, limit, getDocs
} from "./supabase-db-compat.js?v=25";

export const QP_COSTS = {
    ai_hint: 5,      // 1 lượt Gợi ý AI
    use_5050: 3,     // 1 lượt trợ giúp 50/50
    streak_freeze: 15 // vé đóng băng chuỗi (dành cho tương lai)
};

export const QP_REWARDS = {
    welcome: 20,           // quà chào mừng lần đầu
    perCorrect: 2,         // mỗi câu đúng khi luyện tập
    goodScoreBonus: 10,    // thưởng thêm nếu đúng >= 80%
    reportAccepted: 50     // báo lỗi được giáo viên duyệt (dành cho tương lai)
};

export const DEFAULT_QPOINT_PACKAGES = [
    { id: 'qp_50', name: 'Gói Khởi Động', points: 50, bonus: 0, price: 20000, popular: false, desc: 'Dành cho ôn luyện nhẹ nhàng' },
    { id: 'qp_150', name: 'Gói Tiêu Chuẩn', points: 150, bonus: 15, price: 50000, popular: true, desc: 'Được học sinh lựa chọn nhiều nhất' },
    { id: 'qp_350', name: 'Gói Siêu Cấp', points: 350, bonus: 50, price: 100000, popular: false, desc: 'Tặng thêm 50 Qp, tiết kiệm 15%' },
    { id: 'qp_1000', name: 'Gói Không Giới Hạn', points: 1000, bonus: 200, price: 250000, popular: false, desc: 'Tặng thêm 200 Qp, luyện đề thoải mái' }
];

export async function getQPointConfig(db) {
    try {
        const snap = await getDoc(doc(db, "site_settings", "qpoint_packages"));
        if (snap.exists() && snap.data()) {
            const data = snap.data();
            return {
                enabled: data.enabled !== false,
                packages: (Array.isArray(data.packages) && data.packages.length > 0) ? data.packages : DEFAULT_QPOINT_PACKAGES,
                note: data.note || 'QPoint dùng để xem gợi ý AI, dùng trợ giúp 50/50 và xem lời giải chi tiết.'
            };
        }
    } catch(e) {
        console.warn("[QPoint] Lỗi đọc cấu hình gói:", e);
    }
    return {
        enabled: true,
        packages: DEFAULT_QPOINT_PACKAGES,
        note: 'QPoint dùng để xem gợi ý AI, dùng trợ giúp 50/50 và xem lời giải chi tiết.'
    };
}

export function createQPoint(db, uid, options = {}) {
    let balance = 0;
    let loaded = false;
    let free = false; // true với giáo viên/admin -> không bị trừ điểm
    const listeners = [];

    const notify = () => listeners.forEach(fn => { try { fn(balance); } catch (e) {} });

    async function writeLedger(amount, reason, balanceAfter, meta) {
        try {
            await addDoc(collection(db, "qpoint_transactions"), {
                uid, amount, reason,
                balanceAfter,
                meta: meta || null,
                at: new Date().toISOString()
            });
        } catch (e) { console.warn("QPoint: lỗi ghi sổ giao dịch", e); }
    }

    return {
        get balance() { return balance; },
        get loaded() { return loaded; },
        get free() { return free; },
        set free(v) { free = !!v; },

        onChange(fn) { listeners.push(fn); if (loaded) fn(balance); },

        /** Đọc số dư; nếu tài khoản chưa từng có Qpoint -> tặng quà chào mừng; tự đồng bộ nếu có tài khoản trùng email */
        async load() {
            try {
                const uRef = doc(db, "users", uid);
                const snap = await getDoc(uRef);
                let data = snap.exists() ? snap.data() : {};

                // Nếu data không có qpoints hoặc qpoints === 0, và có email hoặc username,
                // kiểm tra xem có tài khoản nào khác của học sinh này có điểm cao hơn không (do lịch sử chuyển đổi hoặc thầy cô cấp)
                const optEmail = (typeof options === 'object' && options ? (options.email || '') : '').trim().toLowerCase();
                const optUser = (typeof options === 'object' && options ? (options.username || '') : '').trim().toLowerCase();
                if ((typeof data.qpoints !== 'number' || data.qpoints === 0) && (optEmail || optUser)) {
                    try {
                        const emailList = [];
                        if (optEmail) emailList.push(optEmail);
                        if (optUser) emailList.push(`${optUser}@hocsinh.com`);
                        if (optEmail && optEmail.includes('@')) {
                            const uPart = optEmail.split('@')[0];
                            if (uPart) emailList.push(`${uPart}@hocsinh.com`);
                        }
                        const uniqueEmails = [...new Set(emailList.filter(Boolean))];
                        if (uniqueEmails.length > 0) {
                            const qSnap = await getDocs(query(collection(db, "users"), where("email", "in", uniqueEmails)));
                            let maxQp = data.qpoints || 0;
                            qSnap.forEach(d => {
                                const row = d.data();
                                const qVal = typeof row.qpoints === 'number' ? row.qpoints : ((row.raw_data && typeof row.raw_data.qpoints === 'number') ? row.raw_data.qpoints : 0);
                                if (qVal > maxQp) maxQp = qVal;
                            });
                            if (maxQp > (data.qpoints || 0)) {
                                data.qpoints = maxQp;
                                await updateDoc(uRef, { qpoints: maxQp }).catch(() => {});
                            }
                        }
                    } catch(eFallback) {
                        console.warn("[QPoint] Lỗi đồng bộ tài khoản trùng lặp:", eFallback);
                    }
                }

                if (typeof data.qpoints === 'number') {
                    balance = data.qpoints;
                } else {
                    balance = QP_REWARDS.welcome;
                    await setDoc(uRef, { qpoints: balance }, { merge: true });
                    await writeLedger(QP_REWARDS.welcome, 'welcome_bonus', balance);
                }
                loaded = true;
                notify();
            } catch (e) { console.warn("QPoint: lỗi tải số dư", e); }
            return balance;
        },

        /** Cộng điểm (thưởng). amount > 0 */
        async award(amount, reason, meta) {
            amount = Math.floor(Number(amount) || 0);
            if (amount <= 0 || !loaded) return balance;
            balance += amount;
            notify();
            try {
                await updateDoc(doc(db, "users", uid), { qpoints: increment(amount) });
                await writeLedger(amount, reason || 'award', balance, meta);
            } catch (e) { console.warn("QPoint: lỗi cộng điểm", e); balance -= amount; notify(); }
            return balance;
        },

        /**
         * Trừ điểm (mua tiện ích). Trả về {ok, balance}.
         * Tài khoản `free` (giáo viên) luôn ok mà không trừ.
         */
        async spend(amount, reason, meta) {
            amount = Math.floor(Number(amount) || 0);
            if (amount <= 0) return { ok: true, balance };
            if (!loaded) await this.load();
            if (balance < amount) return { ok: false, balance, error: 'insufficient' };
            balance -= amount;
            notify();
            try {
                await updateDoc(doc(db, "users", uid), { qpoints: increment(-amount) });
                await writeLedger(-amount, reason || 'spend', balance, meta);
                return { ok: true, balance };
            } catch (e) {
                console.warn("QPoint: lỗi trừ điểm", e);
                balance += amount; notify();
                return { ok: false, balance, error: 'network' };
            }
        },

        /** Thiết lập số dư chỉ định (dành cho Admin / Thầy cô) */
        async setBalance(newBalance, reason, meta) {
            newBalance = Math.max(0, Math.floor(Number(newBalance) || 0));
            const delta = newBalance - balance;
            balance = newBalance;
            notify();
            try {
                await updateDoc(doc(db, "users", uid), { qpoints: balance });
                await writeLedger(delta, reason || 'set_balance', balance, meta);
                return { ok: true, balance };
            } catch (e) {
                console.warn("QPoint: lỗi gán số dư", e);
                return { ok: false, balance };
            }
        }
    };
}

/**
 * Lấy lịch sử giao dịch QPoint của học sinh
 * @param {object} db - Database instance
 * @param {string} uid - User ID
 * @param {number} maxCount - Số lượng giao dịch tối đa
 */
export async function getStudentQPointTransactions(db, uid, maxCount = 50) {
    if (!uid) return [];
    try {
        const q = query(
            collection(db, "qpoint_transactions"),
            where("uid", "==", uid),
            orderBy("at", "desc"),
            limit(maxCount)
        );
        const snap = await getDocs(q);
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        return list;
    } catch (e) {
        console.warn("[QPoint] Lỗi tải sổ giao dịch:", e);
        return [];
    }
}

