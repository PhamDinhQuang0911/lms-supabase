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
    doc, getDoc, setDoc, updateDoc, addDoc, collection, increment
} from "./supabase-db-compat.js";

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

export function createQPoint(db, uid) {
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

        /** Đọc số dư; nếu tài khoản chưa từng có Qpoint -> tặng quà chào mừng */
        async load() {
            try {
                const uRef = doc(db, "users", uid);
                const snap = await getDoc(uRef);
                const data = snap.exists() ? snap.data() : {};
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
            if (free || amount <= 0) return { ok: true, balance };
            if (!loaded) return { ok: false, balance, error: 'not_loaded' };
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
        }
    };
}
