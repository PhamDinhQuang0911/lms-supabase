/* =========================================================
   qmath-bridge.js — Cầu nối tích hợp Sân Chơi Trí Thức vào QMath LMS
   1. Đồng bộ tài khoản Giáo viên QMath & Quản lý hạn mức 4 lượt tạo Game/tháng cho GV Free + Mở khóa GV VIP
   2. Cửa sổ 3 cột Chọn câu hỏi trực quan từ Ngân hàng QMath theo Cây MapID + Xem trước câu hỏi (Live Preview)
   3. Nhập câu hỏi từ file Word (.docx) + Hướng dẫn chuẩn bị file Word (.docx) & Tải file mẫu
   ========================================================= */
(function () {
  const SUPABASE_URL = "https://cuniqanbumcrqcdlcvad.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o";
  const R2_CATALOG_URL = "https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev/bank_catalog.json";
  const WORKER_BANK_URL = "https://upload-helper.phamngockhanh-942001.workers.dev/bank";
  const ROOT_ADMIN_EMAILS = [
    "phamngockhanh.942002@gmail.com",
    "phamngockhanh.942001@gmail.com",
    "phamdinhquang0911@gmail.com"
  ];
  const MAX_FREE_GAMES_PER_MONTH = 4;

  /* ---------- Cây MapID mặc định chuẩn Chương trình GDPT 2018 (Dự phòng khi chưa tải kịp từ Server) ---------- */
  const DEFAULT_MAP_ID_TREE = [
    {
      id: "2", name: "Lớp 12", level: 0, children: [
        {
          id: "D", name: "Giải tích 12", level: 1, children: [
            { id: "1", name: "Chương 1. Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số", level: 2, children: [
              { id: "1", name: "Bài 1. Tính đơn điệu và cực trị của hàm số", level: 3, children: [
                { id: "1", name: "Dạng 1. Xét tính đồng biến, nghịch biến từ bảng biến thiên / đồ thị", level: 4 },
                { id: "2", name: "Dạng 2. Tìm cực trị của hàm số", level: 4 },
                { id: "3", name: "Dạng 3. Tìm tham số m để hàm số đơn điệu / có cực trị", level: 4 }
              ]},
              { id: "2", name: "Bài 2. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số", level: 3 },
              { id: "3", name: "Bài 3. Đường tiệm cận của đồ thị hàm số", level: 3 },
              { id: "4", name: "Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số", level: 3 },
              { id: "5", name: "Bài 5. Ứng dụng đạo hàm giải quyết bài toán thực tiễn", level: 3 }
            ]},
            { id: "2", name: "Chương 2. Nguyên hàm, Tích phân và Ứng dụng", level: 2, children: [
              { id: "1", name: "Bài 1. Nguyên hàm", level: 3 },
              { id: "2", name: "Bài 2. Tích phân", level: 3 },
              { id: "3", name: "Bài 3. Ứng dụng hình học của tích phân (Diện tích, Thể tích)", level: 3 }
            ]}
          ]
        },
        {
          id: "H", name: "Hình học Oxyz 12", level: 1, children: [
            { id: "1", name: "Chương 1. Vectơ và hệ trục tọa độ trong không gian", level: 2, children: [
              { id: "1", name: "Bài 1. Vectơ trong không gian", level: 3 },
              { id: "2", name: "Bài 2. Tọa độ của vectơ trong không gian", level: 3 },
              { id: "3", name: "Bài 3. Biểu thức tọa độ của các phép toán vectơ", level: 3 }
            ]},
            { id: "2", name: "Chương 2. Phương trình mặt phẳng, đường thẳng, mặt cầu", level: 2, children: [
              { id: "1", name: "Bài 1. Phương trình mặt phẳng", level: 3 },
              { id: "2", name: "Bài 2. Phương trình đường thẳng trong không gian", level: 3 },
              { id: "3", name: "Bài 3. Phương trình mặt cầu", level: 3 }
            ]}
          ]
        },
        {
          id: "X", name: "Thống kê và Xác suất 12", level: 1, children: [
            { id: "1", name: "Chương 1. Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm", level: 2 },
            { id: "2", name: "Chương 2. Xác suất có điều kiện và Công thức Bayes", level: 2 }
          ]
        }
      ]
    },
    {
      id: "1", name: "Lớp 11", level: 0, children: [
        {
          id: "D", name: "Đại số và Giải tích 11", level: 1, children: [
            { id: "1", name: "Chương 1. Hàm số lượng giác và phương trình lượng giác", level: 2 },
            { id: "2", name: "Chương 2. Dãy số, Cấp số cộng và Cấp số nhân", level: 2 },
            { id: "3", name: "Chương 3. Giới hạn và Hàm số liên tục", level: 2 },
            { id: "4", name: "Chương 4. Hàm số mũ và hàm số lôgarit", level: 2 },
            { id: "5", name: "Chương 5. Đạo hàm", level: 2 }
          ]
        },
        {
          id: "H", name: "Hình học không gian 11", level: 1, children: [
            { id: "1", name: "Chương 1. Đường thẳng và mặt phẳng trong không gian. Quan hệ song song", level: 2 },
            { id: "2", name: "Chương 2. Quan hệ vuông góc trong không gian. Góc và Khoảng cách", level: 2 }
          ]
        },
        {
          id: "X", name: "Thống kê và Xác suất 11", level: 1, children: [
            { id: "1", name: "Chương 1. Mẫu số liệu ghép nhóm", level: 2 },
            { id: "2", name: "Chương 2. Các quy tắc tính xác suất", level: 2 }
          ]
        }
      ]
    },
    {
      id: "0", name: "Lớp 10", level: 0, children: [
        {
          id: "D", name: "Đại số 10", level: 1, children: [
            { id: "1", name: "Chương 1. Mệnh đề và Tập hợp", level: 2 },
            { id: "2", name: "Chương 2. Bất phương trình và hệ bất phương trình bậc nhất hai ẩn", level: 2 },
            { id: "3", name: "Chương 3. Hàm số bậc hai và đồ thị", level: 2 },
            { id: "4", name: "Chương 4. Bất phương trình bậc hai một ẩn", level: 2 }
          ]
        },
        {
          id: "H", name: "Hình học 10", level: 1, children: [
            { id: "1", name: "Chương 1. Hệ thức lượng trong tam giác", level: 2 },
            { id: "2", name: "Chương 2. Vectơ", level: 2 },
            { id: "3", name: "Chương 3. Phương pháp tọa độ trong mặt phẳng (Oxy)", level: 2 }
          ]
        },
        {
          id: "X", name: "Thống kê và Xác suất 10", level: 1, children: [
            { id: "1", name: "Chương 1. Đại số tổ hợp", level: 2 },
            { id: "2", name: "Chương 2. Thống kê và Xác suất cổ điển", level: 2 }
          ]
        }
      ]
    },
    {
      id: "9", name: "Lớp 9", level: 0, children: [
        {
          id: "D", name: "Đại số 9", level: 1, children: [
            { id: "1", name: "Chương 1. Phương trình và hệ hai phương trình bậc nhất hai ẩn", level: 2 },
            { id: "2", name: "Chương 2. Phương trình và bất phương trình bậc nhất một ẩn", level: 2 },
            { id: "3", name: "Chương 3. Căn bậc hai và căn bậc ba", level: 2 },
            { id: "6", name: "Chương 6. Hàm số y = ax² và Phương trình bậc hai một ẩn (Định lí Vi-ét)", level: 2 }
          ]
        },
        {
          id: "H", name: "Hình học 9", level: 1, children: [
            { id: "4", name: "Chương 4. Hệ thức lượng trong tam giác vuông", level: 2 },
            { id: "5", name: "Chương 5. Đường tròn", level: 2 },
            { id: "9", name: "Chương 9. Đường tròn ngoại tiếp và đường tròn nội tiếp", level: 2 },
            { id: "0", name: "Chương 10. Một số hình khối trong thực tiễn (Trụ, Nón, Cầu)", level: 2 }
          ]
        },
        {
          id: "X", name: "Thống kê và Xác suất 9", level: 1, children: [
            { id: "7", name: "Chương 7. Tần số và tần số tương đối", level: 2 },
            { id: "8", name: "Chương 8. Xác suất của biến cố trong một số mô hình xác suất đơn giản", level: 2 }
          ]
        }
      ]
    },
    {
      id: "8", name: "Lớp 8", level: 0, children: [
        { id: "D", name: "Đại số 8", level: 1, children: [
          { id: "1", name: "Chương 1. Đa thức nhiều biến & Hằng đẳng thức", level: 2 },
          { id: "2", name: "Chương 2. Phân thức đại số", level: 2 },
          { id: "3", name: "Chương 3. Hàm số và đồ thị", level: 2 },
          { id: "4", name: "Chương 4. Phương trình bậc nhất một ẩn", level: 2 }
        ]},
        { id: "H", name: "Hình học 8", level: 1, children: [
          { id: "1", name: "Chương 1. Tứ giác", level: 2 },
          { id: "2", name: "Chương 2. Định lí Thalès và Tam giác đồng dạng", level: 2 }
        ]}
      ]
    },
    {
      id: "7", name: "Lớp 7", level: 0, children: [
        { id: "D", name: "Số học & Đại số 7", level: 1, children: [
          { id: "1", name: "Chương 1. Số hữu tỉ và Số thực", level: 2 },
          { id: "2", name: "Chương 2. Tỉ lệ thức và Đại lượng tỉ lệ", level: 2 },
          { id: "3", name: "Chương 3. Biểu thức đại số và Đa thức một biến", level: 2 }
        ]},
        { id: "H", name: "Hình học 7", level: 1, children: [
          { id: "1", name: "Chương 1. Góc và đường thẳng song song", level: 2 },
          { id: "2", name: "Chương 2. Tam giác bằng nhau & Các đường đồng quy", level: 2 }
        ]}
      ]
    },
    {
      id: "6", name: "Lớp 6", level: 0, children: [
        { id: "D", name: "Số học 6", level: 1, children: [
          { id: "1", name: "Chương 1. Tập hợp các số tự nhiên", level: 2 },
          { id: "2", name: "Chương 2. Tính chia hết trong tập hợp các số tự nhiên", level: 2 },
          { id: "3", name: "Chương 3. Số nguyên", level: 2 },
          { id: "4", name: "Chương 4. Phân số và Số thập phân", level: 2 }
        ]},
        { id: "H", name: "Hình học trực quan 6", level: 1, children: [
          { id: "1", name: "Chương 1. Một số hình phẳng trong thực tiễn", level: 2 },
          { id: "2", name: "Chương 2. Tính đối xứng và Các hình học cơ bản", level: 2 }
        ]}
      ]
    }
  ];

  /* ---------- Helper gọi Supabase REST API ---------- */
  async function sbFetch(path, options) {
    options = options || {};
    const headers = Object.assign({
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    }, options.headers || {});
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, Object.assign({}, options, { headers }));
    if (!res.ok) throw new Error("Supabase HTTP " + res.status);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  /* ---------- Trạng thái Người dùng & Hạn mức Giáo viên ---------- */
  const QB = {
    user: null,
    tier: "free", // "super_admin" | "vip" | "free"
    role: "teacher_free",
    mapIdTree: [],
    r2BankList: [],
    myExamQuestions: [],
    mathTypeApiUrl: null,
    readyPromise: null
  };

  function getMonthKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function getUserKey() {
    if (QB.user && (QB.user.uid || QB.user.id || QB.user.email)) {
      return String(QB.user.uid || QB.user.id || QB.user.email).toLowerCase().replace(/[^a-z0-9_@.-]/g, "_");
    }
    return "guest_teacher";
  }

  function getLocalQuotaMap() {
    try {
      return JSON.parse(localStorage.getItem("qmath_teacher_game_quota_v1") || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function setLocalQuotaCount(monthKey, count) {
    try {
      const map = getLocalQuotaMap();
      const uKey = getUserKey();
      if (!map[uKey]) map[uKey] = {};
      map[uKey][monthKey] = count;
      localStorage.setItem("qmath_teacher_game_quota_v1", JSON.stringify(map));
    } catch (e) {}
  }

  function getLocalQuotaCount(monthKey) {
    const map = getLocalQuotaMap();
    const uKey = getUserKey();
    return Number((map[uKey] && map[uKey][monthKey]) || 0);
  }

  /* ---------- 1. Khởi tạo Cầu nối Tài khoản QMath LMS ---------- */
  QB.init = async () => {
    if (QB.readyPromise) return QB.readyPromise;
    QB.readyPromise = (async () => {
      try {
        const rawUser = localStorage.getItem("lms_supabase_current_user");
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          if (parsed && (parsed.uid || parsed.id || parsed.email)) {
            QB.user = {
              uid: parsed.uid || parsed.id,
              email: (parsed.email || "").toLowerCase().trim(),
              displayName: parsed.displayName || parsed.display_name || parsed.name || (parsed.email || "").split("@")[0] || "Giáo viên",
              photoURL: parsed.photoURL || parsed.photo_url || "",
              role: parsed.role || "teacher",
              teacherTier: parsed.teacherTier || "free"
            };
          }
        }
      } catch (e) {}

      // Kiểm tra Super Admin theo email gốc
      if (QB.user && ROOT_ADMIN_EMAILS.includes(QB.user.email)) {
        QB.tier = "super_admin";
        QB.role = "super_admin";
      } else if (QB.user) {
        // Đồng bộ vai trò và hạn mức từ bảng configurations/admin_roles & users trên Supabase
        try {
          const [cfgRows, userRows] = await Promise.all([
            sbFetch("configurations?id=eq.admin_roles&select=id,data,raw_data").catch(() => []),
            QB.user.uid ? sbFetch(`users?id=eq.${encodeURIComponent(QB.user.uid)}&select=id,email,role,raw_data`).catch(() => []) : Promise.resolve([])
          ]);

          let resolvedTier = QB.user.teacherTier || "free";
          let resolvedRole = QB.user.role || "teacher";

          if (Array.isArray(cfgRows) && cfgRows.length > 0) {
            const cfgData = cfgRows[0].data || cfgRows[0].raw_data || {};
            const accounts = Array.isArray(cfgData.accounts) ? cfgData.accounts : [];
            const found = accounts.find((a) => (a.email || "").toLowerCase().trim() === QB.user.email);
            if (found) {
              if (found.role === "super_admin") {
                resolvedRole = "super_admin";
                resolvedTier = "super_admin";
              } else if (found.teacherTier === "free" || found.role === "teacher_free") {
                resolvedTier = "free";
              } else if (found.teacherTier === "vip" || found.role === "sub_admin" || found.role === "teacher") {
                resolvedTier = "vip";
              }
            }
          }

          if (Array.isArray(userRows) && userRows.length > 0) {
            const uRow = userRows[0];
            const rData = uRow.raw_data || {};
            if (uRow.role === "super_admin" || rData.role === "super_admin") {
              resolvedRole = "super_admin";
              resolvedTier = "super_admin";
            } else if (rData.teacherTier === "vip") {
              resolvedTier = "vip";
            } else if (rData.teacherTier === "free" || uRow.role === "teacher_free" || rData.role === "teacher_free") {
              if (resolvedTier !== "vip" && resolvedTier !== "super_admin") resolvedTier = "free";
            }

            // Đồng bộ số lượt đã tạo game trong tháng từ Supabase về localStorage
            const mKey = getMonthKey();
            const remoteQuota = (rData.gameMonthlyQuota && Number(rData.gameMonthlyQuota[mKey])) || 0;
            const localQuota = getLocalQuotaCount(mKey);
            if (remoteQuota > localQuota) {
              setLocalQuotaCount(mKey, remoteQuota);
            }
          }

          QB.role = resolvedRole;
          QB.tier = resolvedTier === "super_admin" ? "super_admin" : resolvedTier === "vip" ? "vip" : "free";
        } catch (e) {
          console.warn("[QMathBridge] Không thể đồng bộ tier từ server, dùng cấu hình cục bộ:", e);
        }
      }

      // Cầu nối sang FB của Sân Chơi Trí Thức để Giáo viên QMath không cần đăng nhập lần 2
      if (QB.user && window.FB) {
        const isTeacherOrAdmin = ["super_admin", "sub_admin", "teacher", "teacher_free", "admin"].includes(QB.role) || ROOT_ADMIN_EMAILS.includes(QB.user.email);
        if (!FB.user) {
          FB.user = {
            uid: QB.user.uid,
            email: QB.user.email,
            displayName: QB.user.displayName,
            photoURL: QB.user.photoURL
          };
        }
        if (isTeacherOrAdmin) {
          FB.isAdmin = true;
          if (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.adminEmails) && QB.user.email && !window.APP_CONFIG.adminEmails.includes(QB.user.email)) {
            window.APP_CONFIG.adminEmails.push(QB.user.email);
          }
        }
      }

      return QB;
    })();
    return QB.readyPromise;
  };

  /* ---------- 2. Kiểm tra & Trừ lượt Tạo Game hàng tháng (Yêu cầu 3) ---------- */
  QB.getQuotaStatus = () => {
    const monthKey = getMonthKey();
    const isSuper = QB.tier === "super_admin" || (QB.user && ROOT_ADMIN_EMAILS.includes(QB.user.email));
    const isVip = isSuper || QB.tier === "vip";
    const isFree = !isVip;
    const used = getLocalQuotaCount(monthKey);
    const max = MAX_FREE_GAMES_PER_MONTH;
    const remaining = isVip ? 999999 : Math.max(0, max - used);
    return {
      tier: isSuper ? "super_admin" : isVip ? "vip" : "free",
      isSuper,
      isVip,
      isFree,
      monthKey,
      used,
      max,
      remaining
    };
  };

  QB.consumeGameQuota = async (gameName) => {
    await QB.init();
    const st = QB.getQuotaStatus();
    if (st.isVip || st.isSuper) {
      return { allowed: true, status: st };
    }

    if (st.used >= st.max) {
      QB.openVipUpgradeModal(gameName);
      return { allowed: false, status: st };
    }

    const nextUsed = st.used + 1;
    setLocalQuotaCount(st.monthKey, nextUsed);

    // Đồng bộ lên Supabase users.raw_data.gameMonthlyQuota
    if (QB.user && QB.user.uid) {
      (async () => {
        try {
          const rows = await sbFetch(`users?id=eq.${encodeURIComponent(QB.user.uid)}&select=id,raw_data`);
          if (Array.isArray(rows) && rows.length > 0) {
            const rawData = Object.assign({}, rows[0].raw_data || {});
            rawData.gameMonthlyQuota = Object.assign({}, rawData.gameMonthlyQuota || {}, { [st.monthKey]: nextUsed });
            await sbFetch(`users?id=eq.${encodeURIComponent(QB.user.uid)}`, {
              method: "PATCH",
              body: JSON.stringify({ raw_data: rawData })
            });
          }
        } catch (e) {}
      })();
    }

    const left = Math.max(0, st.max - nextUsed);
    U.toast(
      `🎮 Đã khởi tạo game! Lượt tạo game miễn phí tháng ${st.monthKey}: <b>${nextUsed}/${st.max}</b> (Còn ${left} lượt).`,
      left === 0 ? "warn" : "ok",
      3800
    );
    return { allowed: true, status: QB.getQuotaStatus() };
  };

  /* ---------- Cửa sổ Yêu cầu Mở khóa Giáo viên VIP khi hết 4 lượt/tháng ---------- */
  QB.openVipUpgradeModal = (gameName) => {
    const st = QB.getQuotaStatus();
    const [year, month] = st.monthKey.split("-");
    const body = U.h(`<div>
      <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #f59e0b;border-radius:16px;padding:16px 18px;margin-bottom:16px;display:flex;align-items:center;gap:14px">
        <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;box-shadow:0 6px 14px rgba(234,88,12,0.3)">👑</div>
        <div>
          <div style="font-weight:900;font-size:15.5px;color:#92400e">Đã hết ${st.max}/${st.max} lượt tạo Game miễn phí trong tháng ${month}/${year}</div>
          <div style="font-size:13px;color:#b45309;margin-top:3px">Tài khoản <b>Giáo viên Miễn phí (Free)</b> được tạo tối đa <b>${st.max} lần chơi Game / tháng</b>${gameName ? ` (Trò chơi: <b>${U.esc(gameName)}</b>)` : ""}.</div>
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin-bottom:12px">
        <div style="font-weight:800;font-size:13.5px;color:#0f172a;margin-bottom:8px">✨ Quyền lợi đặc biệt khi nâng cấp Giáo viên VIP QMath:</div>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#334155;line-height:1.7">
          <li>🎮 <b>Tạo & tổ chức KHÔNG GIỚI HẠN</b> toàn bộ 14+ trò chơi học tập trực tuyến & tại lớp.</li>
          <li>🌳 <b>Khai thác kho Ngân hàng câu hỏi QMath</b> theo Cây ID (Lớp 6–12, Phân môn, Chương, Bài, Dạng bài).</li>
          <li>📄 <b>Nhập đề từ file Word (.docx)</b>, Trộn đề trắc nghiệm Word & Chấm phiếu OMR bằng Camera.</li>
          <li>🏫 <b>Quản lý Lớp học, Học sinh & Giao bài tập về nhà</b> tự động chấm điểm chi tiết.</li>
        </ul>
      </div>
      <p style="margin:0;font-size:12.5px;color:#64748b;text-align:center">Nâng cấp chỉ trong 30 giây qua mã VietQR tự động kích hoạt 24/7 trên Bảng điều khiển Giáo viên.</p>
    </div>`);

    return U.modal({
      title: "👑 Mở Khóa Giáo Viên VIP — Tạo Game Không Giới Hạn",
      size: "md",
      body,
      actions: [
        { label: "Để sau", cls: "btn-ghost" },
        {
          label: "👑 Nâng cấp Giáo viên VIP ngay",
          cls: "btn-primary",
          onClick: () => {
            try {
              if (window.opener && typeof window.opener.openTeacherVipUpgradeModal === "function") {
                window.opener.openTeacherVipUpgradeModal();
                window.opener.focus();
                return true;
              }
              if (window.parent && window.parent !== window && typeof window.parent.openTeacherVipUpgradeModal === "function") {
                window.parent.openTeacherVipUpgradeModal();
                return true;
              }
            } catch (e) {}
            window.location.href = "../dashboard.html?upgrade=vip";
            return true;
          }
        }
      ]
    });
  };

  /* ---------- Render thanh trạng thái hạn mức trên màn hình Cấu hình Game ---------- */
  QB.renderSetupQuotaBanner = (hostEl, gameName) => {
    if (!hostEl) return;
    const render = () => {
      const st = QB.getQuotaStatus();
      const [year, month] = st.monthKey.split("-");
      if (st.isVip || st.isSuper) {
        hostEl.innerHTML = `<div class="qm-setup-banner is-vip">
          <div class="qm-quota-left">
            <span class="qm-quota-pill">👑 ${st.isSuper ? "Root Super Admin" : "Giáo viên VIP"}</span>
            <span>Tài khoản của Thầy/Cô được <b>tạo Game học tập không giới hạn</b> trong mọi tháng.</span>
          </div>
          <a href="../dashboard.html" class="btn btn-sm btn-ghost">← Về Bảng điều khiển LMS</a>
        </div>`;
        return;
      }

      const exhausted = st.used >= st.max;
      const dots = Array.from({ length: st.max }, (_, i) => `<i class="qm-quota-dot ${i < st.used ? "used" : ""}"></i>`).join("");
      hostEl.innerHTML = `<div class="qm-setup-banner ${exhausted ? "is-exhausted" : "is-free"}">
        <div class="qm-quota-left">
          <span class="qm-quota-pill">${exhausted ? "⛔ Hết lượt tháng " + month + "/" + year : "🎁 Gói Giáo viên Free"}</span>
          <div class="qm-quota-dots" title="Đã dùng ${st.used}/${st.max} lượt">${dots}</div>
          <span>Đã tạo <b>${st.used}/${st.max}</b> lượt Game trong tháng ${month}/${year} ${exhausted ? "— <b>Vui lòng mở khóa VIP để tiếp tục tạo game!</b>" : `(Còn <b>${st.remaining}</b> lượt miễn phí)`}</span>
        </div>
        <button type="button" class="qm-vip-btn" id="qmUpgradeVipBtn">👑 Mở khóa Giáo viên VIP</button>
      </div>`;
      const btn = hostEl.querySelector("#qmUpgradeVipBtn");
      if (btn) btn.onclick = () => QB.openVipUpgradeModal(gameName);
    };
    render();
    QB.init().then(render);
  };

  /* ---------- 3. Đọc API MathType từ cấu hình QMath LMS ---------- */
  QB.getMathTypeApiUrl = async () => {
    if (QB.mathTypeApiUrl !== null) return QB.mathTypeApiUrl;
    try {
      const rows = await sbFetch("configurations?id=eq.mathtype_api&select=id,data,raw_data");
      if (Array.isArray(rows) && rows.length > 0) {
        const d = rows[0].data || rows[0].raw_data || {};
        QB.mathTypeApiUrl = String(d.url || "").trim();
        return QB.mathTypeApiUrl;
      }
    } catch (e) {}
    QB.mathTypeApiUrl = "";
    return "";
  };

  /* ---------- 4. Cửa sổ Hướng dẫn chuẩn bị File Word (.docx) & Tải file mẫu (Yêu cầu 1) ---------- */
  const SAMPLE_WORD_TEXT = `ĐỀ THI MẪU CHUẨN ĐỊNH DẠNG ĐƯA LÊN TRÒ CHƠI (.DOCX)

Câu 1. [NB] Cho tam giác ABC vuông tại A có AB = 6 cm, AC = 8 cm. Bán kính R của đường tròn ngoại tiếp tam giác ABC bằng:
A. R = 5 cm            B. R = 10 cm            C. R = 4 cm            D. R = 8 cm
(Mẹo: Trong Word, hãy GẠCH CHÂN chữ "A." bằng Ctrl+U, hoặc thêm dấu sao "*A.", hoặc ghi "Chọn A" ở Lời giải)
Lời giải:
Cạnh huyền BC = $\\sqrt{AB^2 + AC^2} = 10$ cm. Bán kính $R = BC/2 = 5$ cm.
Chọn A.

Câu 2. [TH] [ĐS] Cho hàm số $f(x) = x^3 - 3x + 2$. Xét tính đúng sai của các mệnh đề sau:
a) Đạo hàm của hàm số là $f'(x) = 3x^2 - 3$. [Đúng]
b) Hàm số đồng biến trên khoảng $(-1; 1)$. [Sai]
c) Điểm cực đại của đồ thị hàm số là $(-1; 4)$. [Đúng]
d) Giá trị nhỏ nhất của hàm số trên đoạn $[0; 2]$ bằng $2$. [Sai]
Lời giải:
a) Đúng vì $(x^3 - 3x + 2)' = 3x^2 - 3$.
b) Sai vì trên $(-1; 1)$ thì $f'(x) < 0$ nên hàm số nghịch biến.
c) Đúng vì $f(-1) = 4$.
d) Sai vì $\\min_{[0;2]} f(x) = f(1) = 0$.

Câu 3. [VD] Một vật chuyển động với vận tốc $v(t) = 4t$ (m/s). Tính quãng đường (đơn vị: mét) vật đi được trong 5 giây đầu tiên.
Lời giải:
Quãng đường vật đi được là $S = \\int_0^5 4t\\,dt = 2 \\cdot 5^2 = 50$ (m).
Đáp án: 50`;

  QB.openWordGuideModal = (onUploadClick) => {
    const body = U.h(`<div>
      <div class="qm-word-guide-grid">
        <div class="qm-wg-step">
          <b>📄 1. Định dạng tệp .docx</b>
          <p>Sử dụng file Word <b>.docx</b> (Word 2010 trở lên). Nếu đang ở đuôi <i>.doc</i> cũ, hãy chọn <i>File → Save As → .docx</i>.</p>
        </div>
        <div class="qm-wg-step">
          <b>🔢 2. Đánh số câu hỏi</b>
          <p>Bắt đầu mỗi câu bằng <b>Câu 1.</b>, <b>Câu 2:</b> hoặc <b>Bài 1.</b> (hỗ trợ cả đánh số tự động Numbering của Word).</p>
        </div>
        <div class="qm-wg-step">
          <b>✅ 3. Đánh dấu đáp án đúng</b>
          <p><u>Gạch chân</u> chữ cái đúng (<b><u>A.</u></b>, <b><u>a)</u></b>), hoặc đặt dấu sao <b>*A.</b>, hoặc ghi <code>Chọn A</code> / <code>Đáp án: 50</code> ở lời giải.</p>
        </div>
        <div class="qm-wg-step">
          <b>📐 4. Công thức Toán & Ảnh</b>
          <p>Hỗ trợ công thức LaTeX <code>$...$</code>, MathType và hình ảnh chèn trực tiếp trong văn bản Word.</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:14px">
        <div style="padding:11px 13px;border-radius:12px;border:1px solid #dbeafe;background:#eff6ff">
          <div style="font-weight:800;font-size:12.5px;color:#1e40af;margin-bottom:4px">🎯 Dạng 1: Trắc nghiệm 4 lựa chọn (MC)</div>
          <div style="font-size:12px;color:#334155;line-height:1.5">
            • 4 phương án viết <b>A.</b> <b>B.</b> <b>C.</b> <b>D.</b> (cùng dòng hoặc xuống dòng).<br>
            • Đáp án đúng: <u>Gạch chân</u> chữ cái (VD: <b><u>A.</u></b>), hoặc ghi <b>*A.</b>, hoặc ghi <code>Chọn A</code> trong Lời giải, hoặc đặt Bảng đáp án <code>1.A 2.B</code> ở cuối đề sau chữ <code>HẾT</code>.
          </div>
        </div>
        <div style="padding:11px 13px;border-radius:12px;border:1px solid #fce7f3;background:#fdf2f8">
          <div style="font-weight:800;font-size:12.5px;color:#9d174d;margin-bottom:4px">⚖️ Dạng 2: Đúng / Sai 4 ý (TF)</div>
          <div style="font-size:12px;color:#334155;line-height:1.5">
            • Ghi nhãn <b>[ĐS]</b> ở đầu câu, theo sau là 4 ý <b>a)</b>, <b>b)</b>, <b>c)</b>, <b>d)</b>.<br>
            • Cuối mỗi ý ghi <b>[Đúng]</b> hoặc <b>[Sai]</b>, HOẶC <u>gạch chân</u> chữ cái của các ý Đúng (VD: <b><u>a)</u></b>), HOẶC ghi <code>Đáp án: ĐSĐS</code>.
          </div>
        </div>
        <div style="padding:11px 13px;border-radius:12px;border:1px solid #dcfce7;background:#f0fdf4">
          <div style="font-weight:800;font-size:12.5px;color:#166534;margin-bottom:4px">⌨️ Dạng 3: Trả lời ngắn / Điền đáp số (SA)</div>
          <div style="font-size:12px;color:#334155;line-height:1.5">
            • Câu hỏi không có A, B, C, D.<br>
            • Cuối đề bài hoặc trong mục <b>Lời giải:</b> ghi rõ:<br>
            <code>Đáp án: 50</code> hoặc <code>Đáp số: 12,5</code>.
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <b style="font-size:12.5px;color:#1e293b">📋 Mẫu văn bản chuẩn (có thể sao chép dán vào Word):</b>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-sm btn-ghost" id="wgCopyBtn">📋 Sao chép văn bản mẫu</button>
          <a href="../mau_de_tron_chuan.docx" download="De_Mau_Game_QMath.docx" class="btn btn-sm btn-primary" style="text-decoration:none">⬇️ Tải file Word (.docx) mẫu</a>
        </div>
      </div>
      <pre class="qm-wg-example">${U.esc(SAMPLE_WORD_TEXT)}</pre>
    </div>`);

    body.querySelector("#wgCopyBtn").onclick = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(SAMPLE_WORD_TEXT).then(() => U.toast("Đã sao chép mẫu chuẩn vào bộ nhớ tạm!", "ok"));
      }
    };

    const actions = [{ label: "Đóng", cls: "btn-ghost" }];
    if (typeof onUploadClick === "function") {
      actions.push({
        label: "📄 Chọn file Word (.docx) tải lên ngay",
        cls: "btn-primary",
        onClick: () => {
          setTimeout(() => onUploadClick(), 120);
          return true;
        }
      });
    }
    return U.modal({
      title: "📘 Hướng Dẫn Chuẩn Bị File Word (.docx) Đưa Lên Trò Chơi",
      size: "lg",
      body,
      actions
    });
  };

  /* ---------- Nạp nhanh file Word (.docx) ngay trong màn hình Cấu hình Game ---------- */
  QB.quickImportWordForGame = async (game, onSetCreated) => {
    const file = await U.pickFile(".docx");
    if (!file) return;
    U.toast("⏳ Đang đọc và bóc tách câu hỏi từ file Word (.docx)...", "info", 2400);
    try {
      const list = await IO.parseFile(file);
      const st = IO.stats(list);
      const cleanName = file.name.replace(/\.docx$/i, "").trim() || "Đề Word";
      const setName = `📄 Word: ${cleanName}`;

      // Hiển thị hộp thoại xác nhận trước khi nạp vào Game
      const body = U.h(`<div>
        <div class="notice ok" style="margin-bottom:12px">
          ✅ Đã bóc tách thành công <b>${st.total}</b> câu hỏi từ tệp <b>${U.esc(file.name)}</b>:
          <span class="chip">MC: ${st.MC}</span>
          <span class="chip">Đúng/Sai: ${st.TF}</span>
          <span class="chip">Trả lời ngắn: ${st.SA}</span>
        </div>
        <div class="field" style="margin-bottom:12px">
          <label class="lbl">Tên bộ câu hỏi lưu cho Game</label>
          <input class="input" id="qmWordSetName" value="${U.esc(setName)}" maxlength="80">
        </div>
        <div style="max-height:280px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc">
          ${list.slice(0, 30).map((q, idx) => `<div style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12.5px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span class="qmb-badge type-${q.Type}">Câu ${idx + 1} · ${q.Type}</span>
              <span class="qmb-badge lv-nb">Đáp án: ${U.esc(q.CorrectAnswer || "?")}</span>
              ${q.Level ? `<span class="muted">${U.esc(q.Level)}</span>` : ""}
            </div>
            <div class="q-preview-row">${Quiz.rich(q.Question)}</div>
          </div>`).join("")}
        </div>
      </div>`);
      setTimeout(() => Quiz.typeset(body), 60);

      await U.modal({
        title: `📄 Xem trước câu hỏi từ file Word (${list.length} câu)`,
        size: "lg",
        body,
        actions: [
          { label: "📘 Xem hướng dẫn Word", cls: "btn-ghost", onClick: () => { QB.openWordGuideModal(); return false; } },
          { label: "Hủy", cls: "btn-ghost" },
          {
            label: `✅ Đưa ${list.length} câu hỏi này vào Game`,
            cls: "btn-primary",
            onClick: async (btn, wrap) => {
              btn.disabled = true;
              const finalName = (wrap.querySelector("#qmWordSetName").value || "").trim() || setName;
              const savedSet = await QB.saveQuestionsAsGameSet(list, finalName, game ? game.id : "");
              U.toast(`🎉 Đã nạp bộ câu hỏi "${U.esc(finalName)}" (${list.length} câu) vào trò chơi!`, "ok", 3200);
              if (typeof onSetCreated === "function") onSetCreated(savedSet, list);
              return true;
            }
          }
        ]
      }).result;
    } catch (err) {
      U.toast("⛔ " + (err.message || err), "err", 5500);
      QB.openWordGuideModal(() => QB.quickImportWordForGame(game, onSetCreated));
    }
  };

  /* ---------- Lưu mảng câu hỏi thành một Bộ đề (Set) trong DB của Game ---------- */
  QB.saveQuestionsAsGameSet = async (questions, setName, gameId) => {
    const cleanList = questions.map((q, i) => {
      const copy = U.plain(q);
      if (!copy.Id) copy.Id = "QM_" + Date.now().toString(36).toUpperCase() + "_" + (i + 1);
      return IO.clean(copy);
    });

    // Hợp nhất vào DB.questions (ưu tiên local hoặc cloud tùy quyền)
    const existMap = new Map(DB.questions.map((q) => [q.Id, q]));
    cleanList.forEach((q) => existMap.set(q.Id, q));
    DB.questions = Array.from(existMap.values());
    DB.usingDemo = false;
    U.store.set("questions", DB.questions);

    // Tạo bộ đề mới
    const newSet = {
      id: "set_" + U.uid(6),
      name: setName || ("Bộ đề QMath (" + cleanList.length + " câu)"),
      description: `Tạo từ QMath LMS (${cleanList.length} câu)`,
      questionIds: cleanList.map((q) => q.Id),
      updatedAt: Date.now()
    };
    const idx = DB.sets.findIndex((s) => s.name === newSet.name);
    if (idx >= 0) {
      newSet.id = DB.sets[idx].id;
      DB.sets[idx] = newSet;
    } else {
      DB.sets.unshift(newSet);
    }
    U.store.set("sets", DB.sets);
    if (gameId) {
      const gcfg = DB.gameCfg(gameId);
      gcfg.setId = newSet.id;
      U.store.set("games", DB.games);
    }
    return newSet;
  };

  /* =========================================================
     5. KHO NGÂN HÀNG CÂU HỎI QMATH THEO CÂY MAPID + XEM TRƯỚC (YÊU CẦU 2)
     ========================================================= */

  /* Nạp Cây MapID từ Cache / Supabase / Fallback */
  QB.loadMapIdTree = async () => {
    if (Array.isArray(QB.mapIdTree) && QB.mapIdTree.length > 0) return QB.mapIdTree;

    try {
      const cached = localStorage.getItem("lms_cached_mapid_tree");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          QB.mapIdTree = parsed;
        }
      }
    } catch (e) {}

    try {
      const rows = await sbFetch("configurations?id=eq.map_id_tree&select=id,data,raw_data");
      if (Array.isArray(rows) && rows.length > 0) {
        const d = rows[0].data || rows[0].raw_data || {};
        if (Array.isArray(d.tree) && d.tree.length > 0) {
          QB.mapIdTree = d.tree;
          try { localStorage.setItem("lms_cached_mapid_tree", JSON.stringify(d.tree)); } catch (e) {}
          return QB.mapIdTree;
        }
      }
    } catch (e) {}

    if (!QB.mapIdTree || !QB.mapIdTree.length) {
      QB.mapIdTree = DEFAULT_MAP_ID_TREE;
    }
    return QB.mapIdTree;
  };

  /* Chuẩn hóa câu hỏi từ Ngân hàng QMath R2 / Đề thi Supabase sang chuẩn Game */
  function convertQMathQuestionToGame(raw) {
    if (!raw || raw.isDuplicate) return null;
    const id = String(raw.cccd || raw.id || raw.Id || "").trim();
    const mapId = String(raw.mapId || "").trim().toUpperCase();
    const rawType = String(raw.type || raw.Type || "mc").toLowerCase().trim();

    let level = raw.level || raw.Level || "";
    if (level === "NB") level = "Nhận biết";
    else if (level === "TH") level = "Thông hiểu";
    else if (level === "VD") level = "Vận dụng";
    else if (level === "VDC") level = "Vận dụng cao";

    let grade = String(raw.grade || raw.Grade || "").trim();
    let subject = String(raw.subject || raw.Subject || "Toán").trim();

    // Phân tích tự động từ mã MapID (VD: 9D1H2-4 hoặc 0D1N1-2 hoặc 12D1V1-3)
    const m = mapId.match(/^(\d+)([A-Z]+)(\d+)([NHVCYBKGC])(\d*)(?:-([A-Za-z0-9]+))?$/i);
    if (m) {
      const gCode = m[1];
      if (!grade) grade = gCode === "0" ? "10" : gCode === "1" ? "11" : gCode === "2" ? "12" : gCode;
      const sCode = m[2].toUpperCase();
      if (sCode === "D" || sCode === "DS") subject = "Đại số";
      else if (sCode === "H" || sCode === "HH") subject = "Hình học";
      else if (sCode === "X" || sCode === "XS") subject = "Xác suất";
      else if (sCode === "G") subject = "Giải tích";
      const lvCode = m[4].toUpperCase();
      if (!level) {
        if (lvCode === "N" || lvCode === "Y") level = "Nhận biết";
        else if (lvCode === "H" || lvCode === "B") level = "Thông hiểu";
        else if (lvCode === "V" || lvCode === "K") level = "Vận dụng";
        else if (lvCode === "C" || lvCode === "G") level = "Vận dụng cao";
      }
    }

    const stem = String(raw.content != null ? raw.content : raw.Question || "").trim();
    if (!stem) return null;
    const explain = String(raw.solution != null ? raw.solution : raw.Explain || "").trim();

    // 1. Trắc nghiệm 4 lựa chọn (MC)
    if (rawType === "mc" || rawType === "tn") {
      const opts = {};
      const keys = ["A", "B", "C", "D"];
      if (Array.isArray(raw.options)) {
        raw.options.slice(0, 4).forEach((op, idx) => {
          const txt = typeof op === "object" && op !== null ? (op.text || op.content || "") : String(op == null ? "" : op);
          opts[keys[idx]] = txt.replace(/^[ABCD]\s*[\.\)]\s*/i, "").trim();
        });
      } else if (raw.Options && typeof raw.Options === "object") {
        keys.forEach((k) => {
          if (raw.Options[k] != null) opts[k] = String(raw.Options[k]);
        });
      }
      if (Object.keys(opts).length < 2) return null;

      let correctAns = "A";
      if (typeof raw.correct === "number" && raw.correct >= 0 && raw.correct < 4) {
        correctAns = keys[raw.correct];
      } else if (typeof raw.correct === "string" && /^[A-D]$/i.test(raw.correct.trim())) {
        correctAns = raw.correct.trim().toUpperCase();
      } else if (typeof raw.correctAnswer === "string" && /^[A-D]$/i.test(raw.correctAnswer.trim())) {
        correctAns = raw.correctAnswer.trim().toUpperCase();
      } else if (typeof raw.CorrectAnswer === "string" && /^[A-D]$/i.test(raw.CorrectAnswer.trim())) {
        correctAns = raw.CorrectAnswer.trim().toUpperCase();
      } else if (typeof raw.correct === "string" && /^[0-3]$/.test(raw.correct.trim())) {
        correctAns = keys[parseInt(raw.correct.trim(), 10)];
      }

      return {
        Id: id || ("QM_" + U.uid(6)),
        cccd: String(raw.cccd || id || ""),
        mapId,
        Type: "MC",
        Level: level || "Nhận biết",
        Grade: grade,
        Subject: subject,
        Chapter: raw.Chapter || "",
        Topic: raw.Topic || raw.source || "",
        Question: stem,
        Options: opts,
        CorrectAnswer: correctAns,
        Explain: explain
      };
    }

    // 2. Đúng / Sai 4 ý (TF)
    if (rawType === "tf" || rawType === "ds") {
      const opts = {};
      const tfKeys = ["a", "b", "c", "d"];
      let ansStr = "";
      if (Array.isArray(raw.statements) && raw.statements.length > 0) {
        raw.statements.slice(0, 4).forEach((st, idx) => {
          const txt = typeof st === "object" && st !== null ? (st.text || st.content || "") : String(st || "");
          opts[tfKeys[idx]] = txt.replace(/^[a-d]\s*[\.\)]\s*/i, "").trim();
          const isTrue = typeof st === "object" && st !== null ? Boolean(st.isTrue ?? st.correct) : false;
          ansStr += isTrue ? "Đ" : "S";
        });
      } else if (raw.Options && typeof raw.Options === "object") {
        tfKeys.forEach((k) => {
          const v = raw.Options[k] ?? raw.Options[k.toUpperCase()];
          if (v != null) opts[k] = String(v);
        });
        ansStr = String(raw.CorrectAnswer || raw.correctAnswer || "ĐSĐS").toUpperCase().replace(/D/g, "Đ");
      }
      if (!Object.keys(opts).length) return null;
      return {
        Id: id || ("QM_" + U.uid(6)),
        cccd: String(raw.cccd || id || ""),
        mapId,
        Type: "TF",
        Level: level || "Thông hiểu",
        Grade: grade,
        Subject: subject,
        Chapter: raw.Chapter || "",
        Topic: raw.Topic || raw.source || "",
        Question: stem,
        Options: opts,
        CorrectAnswer: ansStr || "ĐSĐS",
        Explain: explain
      };
    }

    // 3. Trả lời ngắn (SA)
    if (rawType === "short" || rawType === "sa" || rawType === "tln") {
      const ans = String(raw.answer != null ? raw.answer : (raw.CorrectAnswer != null ? raw.CorrectAnswer : "")).trim();
      if (!ans) return null;
      return {
        Id: id || ("QM_" + U.uid(6)),
        cccd: String(raw.cccd || id || ""),
        mapId,
        Type: "SA",
        Level: level || "Vận dụng",
        Grade: grade,
        Subject: subject,
        Chapter: raw.Chapter || "",
        Topic: raw.Topic || raw.source || "",
        Question: stem,
        CorrectAnswer: ans,
        Explain: explain
      };
    }

    return null;
  }

  /* Nạp danh sách câu hỏi từ Ngân hàng R2 QMath */
  QB.loadR2BankQuestions = async (forceReload) => {
    if (!forceReload && Array.isArray(QB.r2BankList) && QB.r2BankList.length > 0) {
      return QB.r2BankList;
    }

    let rawList = [];
    if (!forceReload) {
      try {
        const cached = localStorage.getItem("lms_cached_bank");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) rawList = parsed;
        }
      } catch (e) {}
    }

    if (!rawList.length || forceReload) {
      try {
        const res = await fetch(R2_CATALOG_URL + "?t=" + Date.now());
        if (res.ok) {
          rawList = await res.json();
          try { localStorage.setItem("lms_cached_bank", JSON.stringify(rawList)); } catch (e) {}
        }
      } catch (e) {
        try {
          const res2 = await fetch(WORKER_BANK_URL);
          if (res2.ok) {
            rawList = await res2.json();
            try { localStorage.setItem("lms_cached_bank", JSON.stringify(rawList)); } catch (e) {}
          }
        } catch (e2) {}
      }
    }

    QB.r2BankList = (Array.isArray(rawList) ? rawList : [])
      .map(convertQMathQuestionToGame)
      .filter(Boolean);
    return QB.r2BankList;
  };

  /* Nạp câu hỏi từ các Đề thi trên QMath LMS (bảng exams) */
  QB.loadExamQuestions = async () => {
    if (Array.isArray(QB.myExamQuestions) && QB.myExamQuestions.length > 0) return QB.myExamQuestions;
    try {
      const rows = await sbFetch("exams?select=id,title,subject,questions,raw_data&order=created_at.desc&limit=40");
      const out = [];
      const seen = new Set();
      (Array.isArray(rows) ? rows : []).forEach((ex) => {
        const qArr = Array.isArray(ex.questions) ? ex.questions : (ex.raw_data && Array.isArray(ex.raw_data.questions) ? ex.raw_data.questions : []);
        const exTitle = ex.title || (ex.raw_data && ex.raw_data.title) || "Đề thi QMath";
        qArr.forEach((rq, i) => {
          const conv = convertQMathQuestionToGame(Object.assign({}, rq, { source: exTitle }));
          if (!conv) return;
          const uKey = conv.cccd || (conv.Question.slice(0, 60) + "_" + conv.CorrectAnswer);
          if (seen.has(uKey)) return;
          seen.add(uKey);
          if (!conv.Id) conv.Id = `${ex.id}_Q${i + 1}`;
          out.push(conv);
        });
      });
      QB.myExamQuestions = out;
    } catch (e) {
      QB.myExamQuestions = [];
    }
    return QB.myExamQuestions;
  };

  /* ---------- Đối sánh thông minh giữa mã MapID của câu hỏi và nhánh trên Cây MapID ---------- */
  function matchQuestionToTreePath(q, pathNodes) {
    if (!pathNodes || !pathNodes.length) return true;
    const rawMapId = String(q.mapId || "").trim().toUpperCase();

    // Tách cấu trúc chuẩn: [Grade][Subject][Chapter][LevelChar][Lesson]-[Form]
    const m = rawMapId.match(/^(\d+)([A-Z]+)(\d+)(?:([NHVCYBKGC])(\d*))?(?:-([A-Za-z0-9]+))?$/i);

    // Cấp 0: Khối lớp (6, 7, 8, 9, 0/10, 1/11, 2/12)
    const gNodeId = String(pathNodes[0].id).toUpperCase();
    const gAliases = gNodeId === "0" || gNodeId === "10" ? ["0", "10"] : gNodeId === "1" || gNodeId === "11" ? ["1", "11"] : gNodeId === "2" || gNodeId === "12" ? ["2", "12"] : [gNodeId];

    if (m) {
      if (!gAliases.includes(m[1])) return false;

      // Cấp 1: Phân môn (D/DS, H/HH, X/XS, G)
      if (pathNodes.length >= 2) {
        const sNodeId = String(pathNodes[1].id).toUpperCase();
        const qSub = m[2].toUpperCase();
        const sMatch =
          sNodeId === qSub ||
          (sNodeId === "D" && qSub === "DS") || (sNodeId === "DS" && qSub === "D") ||
          (sNodeId === "H" && qSub === "HH") || (sNodeId === "HH" && qSub === "H") ||
          (sNodeId === "X" && qSub === "XS") || (sNodeId === "XS" && qSub === "X");
        if (!sMatch) return false;
      }

      // Cấp 2: Chương
      if (pathNodes.length >= 3) {
        const cNodeId = String(pathNodes[2].id).toUpperCase();
        if (String(m[3]).toUpperCase() !== cNodeId) return false;
      }

      // Cấp 3: Bài học
      if (pathNodes.length >= 4) {
        const lNodeId = String(pathNodes[3].id).toUpperCase();
        const qLesson = String(m[5] || "").toUpperCase();
        if (qLesson !== lNodeId) return false;
      }

      // Cấp 4: Dạng toán (sau dấu gạch ngang -)
      if (pathNodes.length >= 5) {
        const fNodeId = String(pathNodes[4].id).toUpperCase();
        const qForm = String(m[6] || "").toUpperCase();
        if (qForm !== fNodeId) return false;
      }

      return true;
    }

    // Fallback nếu câu hỏi không có mã MapID chuẩn mà chỉ có tiền tố hoặc thuộc tính Grade/Subject
    if (rawMapId) {
      const combinedPrefix = pathNodes.map((n) => String(n.id).toUpperCase()).join("");
      if (rawMapId.startsWith(combinedPrefix)) return true;
      return false;
    }

    // Nếu câu hỏi trong game chỉ có Grade ("10", "11", "12") và chưa gắn MapID
    if (pathNodes.length === 1 && q.Grade) {
      return gAliases.includes(String(q.Grade).trim());
    }
    return false;
  }

  /* ---------- Mở Cửa sổ 3 Cột Chọn Câu Hỏi Trực Quan Theo Cây ID (Yêu cầu 2) ---------- */
  QB.openBankPickerModal = async (opts) => {
    opts = opts || {};
    const game = opts.game || null;
    const onConfirm = opts.onConfirm || null;

    const state = {
      sourceTab: "r2", // "r2" | "exams" | "game"
      selectedPath: [], // mảng node từ gốc tới nhánh đang chọn
      expandedPaths: new Set(["2", "1", "0", "9"]),
      treeSearch: "",
      qSearch: "",
      levelFilter: "all",
      typeFilter: "all",
      previewQuestion: null,
      selectedMap: new Map(), // Id -> question object
      loading: true
    };

    const body = U.h(`<div class="qmb-studio">
      <!-- CỘT 1: CÂY MAPID -->
      <aside class="qmb-col-tree">
        <div class="qmb-pane-head">
          <div class="qmb-pane-title">
            <span>🌳 Cây Ma Trận ID Kiến Thức</span>
            <div class="qmb-tree-tools">
              <button type="button" class="qmb-mini-btn" id="qmbExpandAll" title="Mở rộng toàn bộ cây">Mở hết</button>
              <button type="button" class="qmb-mini-btn" id="qmbCollapseAll" title="Thu gọn cây">Thu gọn</button>
            </div>
          </div>
          <input type="text" class="qmb-tree-search" id="qmbTreeSearch" placeholder="🔍 Tìm Lớp, Chương, Bài, Dạng hoặc mã ID...">
        </div>
        <div class="qmb-tree-scroll" id="qmbTreeContainer">
          <div style="padding:24px;text-align:center;color:#64748b;font-size:13px">⏳ Đang tải Cây ID...</div>
        </div>
      </aside>

      <!-- CỘT 2: DANH SÁCH CÂU HỎI -->
      <section class="qmb-col-list">
        <div class="qmb-pane-head">
          <div class="qmb-source-tabs" id="qmbSourceTabs">
            <button type="button" class="qmb-source-tab active" data-src="r2">☁️ Kho Ngân Hàng QMath</button>
            <button type="button" class="qmb-source-tab" data-src="exams">📝 Đề Thi Của Tôi</button>
            <button type="button" class="qmb-source-tab" data-src="game">🎮 Kho Sẵn Trong Game</button>
          </div>
          <div class="qmb-breadcrumb" id="qmbBreadcrumb">
            <span>📂 Đang xem: <b>Toàn bộ các khối lớp</b></span>
          </div>
          <input type="text" class="qmb-tree-search" id="qmbQSearch" placeholder="🔎 Tìm theo nội dung câu hỏi, mã ID (VD: 9D1H1), mã CCCD...">
          <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap">
            <div class="qmb-filter-pills" id="qmbLevelPills">
              <button type="button" class="qmb-pill active" data-lv="all">Mọi mức độ</button>
              <button type="button" class="qmb-pill" data-lv="Nhận biết">NB</button>
              <button type="button" class="qmb-pill" data-lv="Thông hiểu">TH</button>
              <button type="button" class="qmb-pill" data-lv="Vận dụng">VD</button>
              <button type="button" class="qmb-pill" data-lv="Vận dụng cao">VDC</button>
            </div>
            <div class="qmb-filter-pills" id="qmbTypePills">
              <button type="button" class="qmb-pill active" data-tp="all">Mọi dạng</button>
              <button type="button" class="qmb-pill" data-tp="MC">TN (MC)</button>
              <button type="button" class="qmb-pill" data-tp="TF">Đ/S (TF)</button>
              <button type="button" class="qmb-pill" data-tp="SA">TLN (SA)</button>
            </div>
          </div>
        </div>
        <div class="qmb-batch-bar">
          <span id="qmbListStat" style="font-weight:700;color:#334155">0 câu hỏi phù hợp</span>
          <div style="display:flex;gap:5px;align-items:center">
            <button type="button" class="qmb-mini-btn" id="qmbSelectAllBtn">☑️ Chọn cả trang</button>
            <button type="button" class="qmb-mini-btn" id="qmbRandom10Btn">🎲 Ngẫu nhiên 10 câu</button>
            <button type="button" class="qmb-mini-btn" id="qmbClearSelBtn">🗑️ Bỏ chọn</button>
          </div>
        </div>
        <div class="qmb-list-scroll" id="qmbListContainer">
          <div style="padding:36px 20px;text-align:center;color:#64748b">⏳ Đang kết nối Kho Ngân hàng câu hỏi QMath...</div>
        </div>
      </section>

      <!-- CỘT 3: XEM TRƯỚC CÂU HỎI TRỰC QUAN (LIVE PREVIEW) -->
      <section class="qmb-col-preview">
        <div class="qmb-pane-head" style="flex-direction:row;align-items:center;justify-content:space-between">
          <div class="qmb-pane-title">👁️ Xem Trước Chi Tiết Câu Hỏi (Live Preview)</div>
          <div id="qmbPreviewHeaderActions"></div>
        </div>
        <div class="qmb-preview-scroll" id="qmbPreviewContainer">
          <div style="padding:60px 24px;text-align:center;color:#64748b">
            <div style="font-size:44px;margin-bottom:10px">👈</div>
            <b style="font-size:15px;color:#1e293b">Chọn một câu hỏi ở cột giữa để xem trước toàn bộ nội dung</b>
            <p style="font-size:13px;max-width:380px;margin:6px auto 0;line-height:1.5">Hiển thị đầy đủ công thức Toán học, hình minh họa, các phương án A, B, C, D, đáp án đúng và lời giải chi tiết.</p>
          </div>
        </div>
      </section>
    </div>`);

    const dlg = U.modal({
      title: `🏦 Chọn Câu Hỏi Từ Ngân Hàng QMath Theo Cây ID ${game ? "— " + U.esc(game.name) : ""}`,
      size: "qm-bank-modal",
      body,
      actions: [
        { label: "Hủy", cls: "btn-ghost" },
        {
          label: "✅ Đưa 0 câu hỏi đã chọn vào Game",
          cls: "btn-primary",
          onClick: async (btn) => {
            const chosen = Array.from(state.selectedMap.values());
            if (!chosen.length) {
              U.toast("⚠️ Hãy tích chọn ít nhất 1 câu hỏi để đưa vào Game!", "warn");
              return false;
            }
            btn.disabled = true;
            const pathTitle = state.selectedPath.length
              ? state.selectedPath[state.selectedPath.length - 1].name
              : "Ngân hàng QMath";
            const setName = `🏦 ${pathTitle} (${chosen.length} câu)`;
            const savedSet = await QB.saveQuestionsAsGameSet(chosen, setName, game ? game.id : "");
            U.toast(`🎉 Đã đưa ${chosen.length} câu hỏi vào bộ đề "${U.esc(setName)}"!`, "ok", 3200);
            if (typeof onConfirm === "function") onConfirm(savedSet, chosen);
            return true;
          }
        }
      ]
    });

    // Chèn ô đặt tên bộ đề & thống kê vào thanh footer của modal
    const modalFoot = body.closest(".modal").querySelector(".modal-f");
    const confirmBtn = modalFoot.querySelector(".btn-primary");
    const footLeft = U.h(`<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span id="qmbSelectedSummary" style="font-size:13px;font-weight:800;color:#0f172a;background:#dcfce7;color:#166534;padding:6px 12px;border-radius:10px;border:1px solid #86efac">
        🛒 Đã chọn: <b>0</b> câu hỏi
      </span>
      <span style="font-size:12px;color:#64748b">💡 Mẹo: Bấm vào dòng câu hỏi để xem trước lời giải bên phải; tích ô vuông để chọn nhiều câu.</span>
    </div>`);
    modalFoot.prepend(footLeft);

    function updateFooterSummary() {
      const arr = Array.from(state.selectedMap.values());
      const by = { MC: 0, TF: 0, SA: 0 };
      arr.forEach((q) => { by[q.Type] = (by[q.Type] || 0) + 1; });
      const sumEl = modalFoot.querySelector("#qmbSelectedSummary");
      if (sumEl) {
        sumEl.innerHTML = `🛒 Đã chọn: <b>${arr.length}</b> câu <span style="font-weight:500;font-size:11.5px">(MC: ${by.MC} · Đ/S: ${by.TF} · TLN: ${by.SA})</span>`;
      }
      if (confirmBtn) {
        confirmBtn.innerHTML = `✅ Đưa ${arr.length} câu hỏi đã chọn vào Game`;
      }
    }

    function getActiveSourceList() {
      if (state.sourceTab === "r2") return QB.r2BankList || [];
      if (state.sourceTab === "exams") return QB.myExamQuestions || [];
      return Quiz.flatten(DB.questions).length ? DB.questions : [];
    }

    function getFilteredQuestions() {
      const srcList = getActiveSourceList();
      const kw = state.qSearch.trim().toLowerCase();
      return srcList.filter((q) => {
        if (!q || !q.Question) return false;
        if (state.selectedPath.length > 0 && !matchQuestionToTreePath(q, state.selectedPath)) return false;
        if (state.levelFilter !== "all" && q.Level !== state.levelFilter) return false;
        if (state.typeFilter !== "all" && Quiz.baseType(q.Type) !== state.typeFilter) return false;
        if (kw) {
          const mId = String(q.mapId || "").toLowerCase();
          const cccd = String(q.cccd || q.Id || "").toLowerCase();
          const stem = String(q.Question || "").toLowerCase();
          const top = String(q.Topic || q.Chapter || "").toLowerCase();
          if (!mId.includes(kw) && !cccd.includes(kw) && !stem.includes(kw) && !top.includes(kw)) return false;
        }
        return true;
      });
    }

    /* ---------- Render Cột 1: Cây MapID ---------- */
    function renderTree() {
      const container = body.querySelector("#qmbTreeContainer");
      const tree = QB.mapIdTree || [];
      const srcList = getActiveSourceList();
      const qKw = state.treeSearch.trim().toLowerCase();

      function nodeMatchesSearch(node) {
        if (!qKw) return true;
        if (String(node.name || "").toLowerCase().includes(qKw) || String(node.id || "").toLowerCase().includes(qKw)) return true;
        return (node.children || []).some(nodeMatchesSearch);
      }

      const selectedKey = state.selectedPath.map((n) => n.id).join("_");

      let html = `<div class="qmb-tree-node">
        <div class="qmb-tree-row ${state.selectedPath.length === 0 ? "active" : ""}" data-path="">
          <span class="qmb-tree-caret">🌐</span>
          <span class="qmb-tree-id">ALL</span>
          <span class="qmb-tree-name">Toàn bộ các khối lớp</span>
          <span class="qmb-tree-cnt has-q">${srcList.length}</span>
        </div>
      </div>`;

      function buildNodeHtml(node, ancestorNodes) {
        if (!nodeMatchesSearch(node)) return "";
        const curPath = [...ancestorNodes, node];
        const pathKey = curPath.map((n) => n.id).join("_");
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        const isExpanded = qKw ? true : state.expandedPaths.has(pathKey);
        const isActive = selectedKey === pathKey;
        const count = srcList.filter((q) => matchQuestionToTreePath(q, curPath)).length;

        const icons = ["🎓", "📘", "📂", "📄", "🔹"];
        const lvIcon = icons[Math.min(curPath.length - 1, icons.length - 1)];

        let childrenHtml = "";
        if (hasChildren && isExpanded) {
          childrenHtml = `<div class="qmb-tree-children">${node.children.map((c) => buildNodeHtml(c, curPath)).join("")}</div>`;
        }

        return `<div class="qmb-tree-node">
          <div class="qmb-tree-row ${isActive ? "active" : ""}" data-path="${U.esc(pathKey)}">
            <span class="qmb-tree-caret" data-toggle="${U.esc(pathKey)}">${hasChildren ? (isExpanded ? "▾" : "▸") : "•"}</span>
            <span class="qmb-tree-id">[${U.esc(node.id)}]</span>
            <span class="qmb-tree-name" title="${U.esc(node.name)}">${lvIcon} ${U.esc(node.name)}</span>
            <span class="qmb-tree-cnt ${count > 0 ? "has-q" : ""}">${count}</span>
          </div>
          ${childrenHtml}
        </div>`;
      }

      html += tree.map((rootNode) => buildNodeHtml(rootNode, [])).join("");
      container.innerHTML = html;

      // Map pathKey -> mảng node
      const pathLookup = new Map();
      pathLookup.set("", []);
      (function indexTree(nodes, anc) {
        (nodes || []).forEach((n) => {
          const p = [...anc, n];
          pathLookup.set(p.map((x) => x.id).join("_"), p);
          if (n.children && n.children.length) indexTree(n.children, p);
        });
      })(tree, []);

      container.querySelectorAll("[data-toggle]").forEach((caret) => {
        caret.onclick = (e) => {
          e.stopPropagation();
          const pk = caret.dataset.toggle;
          if (!pk) return;
          if (state.expandedPaths.has(pk)) state.expandedPaths.delete(pk);
          else state.expandedPaths.add(pk);
          renderTree();
        };
      });

      container.querySelectorAll(".qmb-tree-row").forEach((row) => {
        row.onclick = () => {
          const pk = row.dataset.path || "";
          const pNodes = pathLookup.get(pk) || [];
          state.selectedPath = pNodes;
          if (pk) state.expandedPaths.add(pk);
          renderTree();
          renderBreadcrumb();
          renderList();
        };
      });
    }

    function renderBreadcrumb() {
      const bc = body.querySelector("#qmbBreadcrumb");
      if (!state.selectedPath.length) {
        bc.innerHTML = `<span>📂 Đang chọn: <b>Toàn bộ các khối lớp</b></span>`;
        return;
      }
      const code = state.selectedPath.map((n) => n.id).join("");
      const trail = state.selectedPath.map((n) => U.esc(n.name)).join(" › ");
      bc.innerHTML = `<div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${trail}">
        <span class="qmb-badge mapid" style="margin-right:5px">ID: ${U.esc(code)}</span>
        <b>${trail}</b>
      </div>
      <button type="button" class="qmb-mini-btn" id="qmbResetPath">✕ Xem tất cả</button>`;
      const rBtn = bc.querySelector("#qmbResetPath");
      if (rBtn) rBtn.onclick = () => { state.selectedPath = []; renderTree(); renderBreadcrumb(); renderList(); };
    }

    /* ---------- Render Cột 2: Danh sách câu hỏi ---------- */
    let currentFiltered = [];
    function renderList() {
      const listEl = body.querySelector("#qmbListContainer");
      const statEl = body.querySelector("#qmbListStat");
      if (state.loading) {
        listEl.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#64748b">⏳ Đang tải dữ liệu câu hỏi...</div>`;
        return;
      }
      currentFiltered = getFilteredQuestions();
      statEl.textContent = `${currentFiltered.length} câu hỏi phù hợp`;

      if (!currentFiltered.length) {
        listEl.innerHTML = `<div style="padding:36px 20px;text-align:center;color:#64748b">
          <div style="font-size:32px;margin-bottom:8px">📭</div>
          <b>Không có câu hỏi nào khớp với bộ lọc hiện tại</b>
          <p style="font-size:12px;margin-top:4px">Hãy chọn nhánh khác trên Cây ID hoặc bấm sang tab <b>🎮 Kho Sẵn Trong Game</b> / <b>📝 Đề Thi Của Tôi</b>.</p>
        </div>`;
        return;
      }

      // Hiển thị tối đa 120 câu đầu để cuộn mượt
      const visible = currentFiltered.slice(0, 120);
      if (!state.previewQuestion || !visible.some((q) => q.Id === state.previewQuestion.Id)) {
        state.previewQuestion = visible[0];
        renderPreview();
      }

      listEl.innerHTML = visible.map((q, idx) => {
        const isSel = state.selectedMap.has(q.Id);
        const isPrev = state.previewQuestion && state.previewQuestion.Id === q.Id;
        const lvCls = q.Level === "Nhận biết" ? "lv-nb" : q.Level === "Thông hiểu" ? "lv-th" : q.Level === "Vận dụng" ? "lv-vd" : q.Level === "Vận dụng cao" ? "lv-vdc" : "lv-nb";
        return `<div class="qmb-qitem ${isSel ? "selected" : ""} ${isPrev ? "previewing" : ""}" data-qid="${U.esc(q.Id)}">
          <input type="checkbox" class="qmb-qcheck" data-chk="${U.esc(q.Id)}" ${isSel ? "checked" : ""}>
          <div class="qmb-qmain">
            <div class="qmb-qmeta">
              <span style="font-weight:800;font-size:11px;color:#475569">#${idx + 1}</span>
              ${q.mapId ? `<span class="qmb-badge mapid">${U.esc(q.mapId)}</span>` : ""}
              <span class="qmb-badge type-${q.Type}">${q.Type === "MC" ? "Trắc nghiệm" : q.Type === "TF" ? "Đúng/Sai" : "Trả lời ngắn"}</span>
              ${q.Level ? `<span class="qmb-badge ${lvCls}">${U.esc(q.Level)}</span>` : ""}
              ${q.cccd ? `<span style="font-size:10px;color:#64748b;font-family:monospace">CCCD #${U.esc(q.cccd)}</span>` : ""}
            </div>
            <div class="qmb-qsnippet">${Quiz.rich(q.Question)}</div>
          </div>
        </div>`;
      }).join("");

      Quiz.typeset(listEl);

      listEl.querySelectorAll(".qmb-qitem").forEach((itemEl) => {
        itemEl.onclick = (e) => {
          const qId = itemEl.dataset.qid;
          const qObj = currentFiltered.find((x) => x.Id === qId);
          if (!qObj) return;
          if (e.target.classList.contains("qmb-qcheck")) {
            if (e.target.checked) state.selectedMap.set(qObj.Id, qObj);
            else state.selectedMap.delete(qObj.Id);
            itemEl.classList.toggle("selected", e.target.checked);
            updateFooterSummary();
            if (state.previewQuestion && state.previewQuestion.Id === qObj.Id) renderPreview();
            return;
          }
          state.previewQuestion = qObj;
          listEl.querySelectorAll(".qmb-qitem").forEach((el) => el.classList.toggle("previewing", el === itemEl));
          renderPreview();
        };
      });
    }

    /* ---------- Render Cột 3: Xem trước câu hỏi chi tiết (Live Preview) ---------- */
    function renderPreview() {
      const prevEl = body.querySelector("#qmbPreviewContainer");
      const actEl = body.querySelector("#qmbPreviewHeaderActions");
      const q = state.previewQuestion;
      if (!q) {
        actEl.innerHTML = "";
        return;
      }
      const isSel = state.selectedMap.has(q.Id);
      actEl.innerHTML = `<button type="button" class="btn btn-sm ${isSel ? "btn-ghost" : "btn-primary"}" id="qmbToggleCurBtn">
        ${isSel ? "✓ Đã chọn vào Game (Bấm để bỏ)" : "➕ Chọn câu hỏi này vào Game"}
      </button>`;
      actEl.querySelector("#qmbToggleCurBtn").onclick = () => {
        if (state.selectedMap.has(q.Id)) state.selectedMap.delete(q.Id);
        else state.selectedMap.set(q.Id, q);
        updateFooterSummary();
        renderList();
        renderPreview();
      };

      let optionsHtml = "";
      if (q.Type === "MC") {
        const keys = ["A", "B", "C", "D"];
        optionsHtml = `<div class="qmb-preview-opts">` + keys.filter((k) => q.Options && q.Options[k] != null).map((k) => {
          const isRight = String(q.CorrectAnswer || "").toUpperCase() === k;
          return `<div class="qmb-preview-opt ${isRight ? "is-correct" : ""}">
            <span class="qmb-preview-opt-key">${k}</span>
            <div style="flex:1">${Quiz.rich(q.Options[k])} ${isRight ? `<span style="margin-left:6px;color:#059669;font-weight:800">✓ Đáp án đúng</span>` : ""}</div>
          </div>`;
        }).join("") + `</div>`;
      } else if (q.Type === "TF") {
        const tfKeys = ["a", "b", "c", "d"];
        const ansRaw = String(q.CorrectAnswer || "ĐSĐS").toUpperCase().replace(/D/g, "Đ");
        optionsHtml = `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">` + tfKeys.filter((k) => q.Options && q.Options[k] != null).map((k, i) => {
          const isTrue = ansRaw[i] === "Đ" || ansRaw[i] === "T" || ansRaw[i] === "1";
          return `<div class="qmb-preview-opt ${isTrue ? "is-correct" : ""}">
            <span class="qmb-preview-opt-key">${k})</span>
            <div style="flex:1">${Quiz.rich(q.Options[k])}</div>
            <span class="qmb-badge ${isTrue ? "lv-nb" : "lv-vdc"}">${isTrue ? "✓ ĐÚNG" : "✗ SAI"}</span>
          </div>`;
        }).join("") + `</div>`;
      } else if (q.Type === "SA") {
        optionsHtml = `<div style="padding:12px 16px;border-radius:12px;background:#ecfdf5;border:1.5px solid #10b981;color:#065f46;font-weight:800;margin-bottom:16px">
          🔑 Đáp án đúng (Trả lời ngắn): <span style="font-size:15px">${Quiz.rich(q.CorrectAnswer)}</span>
        </div>`;
      }

      prevEl.innerHTML = `<div class="qmb-preview-card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${q.mapId ? `<span class="qmb-badge mapid" style="font-size:11.5px;padding:3px 8px">Mã ID: ${U.esc(q.mapId)}</span>` : ""}
            <span class="qmb-badge type-${q.Type}" style="font-size:11.5px;padding:3px 8px">${q.Type === "MC" ? "Trắc nghiệm 4 lựa chọn" : q.Type === "TF" ? "Đúng / Sai (4 ý)" : "Trả lời ngắn"}</span>
            ${q.Level ? `<span class="qmb-badge lv-th" style="font-size:11.5px;padding:3px 8px">Mức độ: ${U.esc(q.Level)}</span>` : ""}
            ${q.Grade ? `<span class="qmb-badge" style="background:#f1f5f9;color:#334155">Lớp ${U.esc(q.Grade)}</span>` : ""}
            ${q.Subject ? `<span class="qmb-badge" style="background:#f1f5f9;color:#334155">${U.esc(q.Subject)}</span>` : ""}
          </div>
          ${q.cccd ? `<span style="font-family:monospace;font-size:11.5px;color:#64748b">Mã câu hỏi: #${U.esc(q.cccd)}</span>` : ""}
        </div>

        <div class="qmb-preview-stem">${Quiz.rich(q.Question)}</div>
        ${optionsHtml}
        ${q.Explain ? `<div class="qmb-preview-solution">
          <b style="display:block;color:#4f46e5;margin-bottom:4px">💡 Lời giải chi tiết:</b>
          <div>${Quiz.rich(q.Explain)}</div>
        </div>` : `<div style="font-size:12px;color:#94a3b8;font-style:italic">Câu hỏi này chưa đính kèm lời giải chi tiết.</div>`}
      </div>`;

      Quiz.typeset(prevEl);
    }

    /* ---------- Sự kiện bộ lọc & nút chọn nhanh ---------- */
    body.querySelector("#qmbExpandAll").onclick = () => {
      (function exp(nodes, anc) {
        (nodes || []).forEach((n) => {
          const p = [...anc, n];
          state.expandedPaths.add(p.map((x) => x.id).join("_"));
          if (n.children) exp(n.children, p);
        });
      })(QB.mapIdTree, []);
      renderTree();
    };
    body.querySelector("#qmbCollapseAll").onclick = () => {
      state.expandedPaths.clear();
      renderTree();
    };
    body.querySelector("#qmbTreeSearch").oninput = U.debounce((e) => {
      state.treeSearch = e.target.value;
      renderTree();
    }, 180);
    body.querySelector("#qmbQSearch").oninput = U.debounce((e) => {
      state.qSearch = e.target.value;
      renderList();
    }, 180);

    body.querySelectorAll("#qmbSourceTabs .qmb-source-tab").forEach((b) => {
      b.onclick = async () => {
        body.querySelectorAll("#qmbSourceTabs .qmb-source-tab").forEach((x) => x.classList.toggle("active", x === b));
        state.sourceTab = b.dataset.src;
        state.loading = true;
        renderList();
        if (state.sourceTab === "exams") await QB.loadExamQuestions();
        state.loading = false;
        renderTree();
        renderList();
      };
    });

    body.querySelectorAll("#qmbLevelPills .qmb-pill").forEach((b) => {
      b.onclick = () => {
        body.querySelectorAll("#qmbLevelPills .qmb-pill").forEach((x) => x.classList.toggle("active", x === b));
        state.levelFilter = b.dataset.lv;
        renderList();
      };
    });

    body.querySelectorAll("#qmbTypePills .qmb-pill").forEach((b) => {
      b.onclick = () => {
        body.querySelectorAll("#qmbTypePills .qmb-pill").forEach((x) => x.classList.toggle("active", x === b));
        state.typeFilter = b.dataset.tp;
        renderList();
      };
    });

    body.querySelector("#qmbSelectAllBtn").onclick = () => {
      currentFiltered.slice(0, 120).forEach((q) => state.selectedMap.set(q.Id, q));
      updateFooterSummary();
      renderList();
      renderPreview();
      U.toast(`☑️ Đã chọn ${Math.min(120, currentFiltered.length)} câu hỏi trong danh sách hiện tại!`, "ok", 1800);
    };

    body.querySelector("#qmbRandom10Btn").onclick = () => {
      if (!currentFiltered.length) return;
      const picked = U.shuffle(currentFiltered).slice(0, 10);
      picked.forEach((q) => state.selectedMap.set(q.Id, q));
      updateFooterSummary();
      renderList();
      renderPreview();
      U.toast(`🎲 Đã chọn ngẫu nhiên thêm ${picked.length} câu hỏi!`, "ok", 1800);
    };

    body.querySelector("#qmbClearSelBtn").onclick = () => {
      state.selectedMap.clear();
      updateFooterSummary();
      renderList();
      renderPreview();
    };

    // Tải song song Cây MapID và Ngân hàng R2
    await Promise.all([QB.loadMapIdTree(), QB.loadR2BankQuestions()]);
    // Nếu kho R2 trống (offline), tự động nạp Đề thi hoặc Kho trong Game
    if (!QB.r2BankList.length) {
      await QB.loadExamQuestions();
      if (QB.myExamQuestions.length) {
        state.sourceTab = "exams";
      } else {
        state.sourceTab = "game";
      }
      body.querySelectorAll("#qmbSourceTabs .qmb-source-tab").forEach((x) => x.classList.toggle("active", x.dataset.src === state.sourceTab));
    }
    state.loading = false;
    renderTree();
    renderBreadcrumb();
    renderList();

    return dlg.result;
  };

  // Khởi động cầu nối ngay khi tải trang
  QB.init();
  window.QMathBridge = QB;
})();
