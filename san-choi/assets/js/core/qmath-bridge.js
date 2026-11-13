/* =========================================================
   qmath-bridge.js — Cầu nối tích hợp Sân Chơi Tri Thức vào QMath LMS
   1. Tự động đồng bộ tài khoản Giáo viên QMath (SSO không cần đăng nhập lại)
      & Quản lý hạn mức 4 lượt tạo Game/tháng cho GV Free + Mở khóa GV VIP
   2. Cửa sổ Chọn câu hỏi từ Kho Ngân hàng QMath theo từng bước trực quan:
      Bước 1: Chọn Lớp ➔ Bước 2: Chọn Phân môn ➔ Bước 3: Chọn Chương / Bài học
      ➔ Bước 4: Chọn Dạng bài ➔ Chọn từng câu hỏi kèm Khung Xem Trước (Live Preview)
      chuẩn hiển thị như trang Sửa đề thi (exam-editor.html)
   3. Nhập câu hỏi từ file Word (.docx) nhận diện công thức Toán MathType & Hình ảnh EMF/PNG
   ========================================================= */
(function () {
  const SUPABASE_URL = "https://cuniqanbumcrqcdlcvad.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o";
  const R2_CATALOG_URL = "https://pub-2efc95bbe7924897bdd0db54d0da243f.r2.dev/bank_catalog.json";
  const WORKER_BANK_URL = "https://upload-helper.phamngockhanh-942001.workers.dev/bank";
  const ROOT_ADMIN_EMAILS = [
    "phamngockhanh.942002@gmail.com",
    "phamngockhanh.942001@gmail.com",
    "phamdinhquang0911@gmail.com",
    "phamdinhquang1@gmail.com",
    "phamdinhquang1@hocsinh.com",
    "phamdinhquang1"
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
                { id: "1", name: "Dạng 1. Xét tính đồng biến, nghịch biến của hàm số", level: 4 },
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
              { id: "3", name: "Bài 3. Ứng dụng hình học của tích phân", level: 3 }
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

  /* ---------- Helper gọi Supabase REST API (Sử dụng select=* để tương thích 100% bảng) ---------- */
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
              displayName: parsed.displayName || parsed.display_name || parsed.name || (parsed.email || "").split("@")[0] || "Giáo viên QMath",
              photoURL: parsed.photoURL || parsed.photo_url || "",
              role: parsed.role || "teacher",
              teacherTier: parsed.teacherTier || (parsed.raw_data && parsed.raw_data.teacherTier) || "free"
            };
          }
        }
      } catch (e) {}

      if (QB.user && ROOT_ADMIN_EMAILS.includes(QB.user.email)) {
        QB.tier = "super_admin";
        QB.role = "super_admin";
      } else if (QB.user) {
        try {
          const [cfgRows, userRows] = await Promise.all([
            sbFetch("configurations?id=eq.admin_roles&select=*").catch(() => []),
            QB.user.uid ? sbFetch(`users?id=eq.${encodeURIComponent(QB.user.uid)}&select=*`).catch(() => []) : Promise.resolve([])
          ]);

          let resolvedTier = QB.user.teacherTier || "free";
          let resolvedRole = QB.user.role || "teacher";

          if (Array.isArray(cfgRows) && cfgRows.length > 0) {
            const cfgData = cfgRows[0].raw_data || cfgRows[0].data || {};
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

      if (QB.user && window.FB) {
        if (typeof FB.syncLmsAuth === "function") {
          FB.syncLmsAuth();
        }
        if (window.App && typeof App.buildDrawer === "function") {
          try { App.buildDrawer(); } catch (e) {}
        }
      }

      return QB;
    })();
    return QB.readyPromise;
  };

  /* ---------- 2. Kiểm tra & Trừ lượt Tạo Game hàng tháng ---------- */
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
      <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:16px 18px;margin-bottom:16px;display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;border-radius:12px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">👑</div>
        <div>
          <div style="font-weight:800;font-size:15.5px;color:#1e3a8a">Đã hết ${st.max}/${st.max} lượt tạo Game miễn phí trong tháng ${month}/${year}</div>
          <div style="font-size:13px;color:#1e40af;margin-top:3px">Tài khoản <b>Giáo viên Miễn phí (Free)</b> được tạo tối đa <b>${st.max} lần chơi Game / tháng</b>${gameName ? ` (Trò chơi: <b>${U.esc(gameName)}</b>)` : ""}.</div>
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:12px">
        <div style="font-weight:800;font-size:13.5px;color:#0f172a;margin-bottom:8px">Quyền lợi khi nâng cấp Giáo viên VIP QMath:</div>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#334155;line-height:1.7">
          <li><b>Tạo & tổ chức KHÔNG GIỚI HẠN</b> toàn bộ 14+ trò chơi học tập trực tuyến & tại lớp.</li>
          <li><b>Khai thác kho Ngân hàng câu hỏi QMath</b> đầy đủ Lớp 6–12 theo Phân môn, Bài học, Dạng bài.</li>
          <li><b>Nhập đề từ file Word (.docx)</b>, Trộn đề trắc nghiệm Word & Chấm phiếu OMR bằng Camera.</li>
          <li><b>Quản lý Lớp học, Học sinh & Giao bài tập về nhà</b> tự động chấm điểm chi tiết.</li>
        </ul>
      </div>
      <p style="margin:0;font-size:12.5px;color:#64748b;text-align:center">Nâng cấp tự động trong 30 giây qua mã VietQR trên Bảng điều khiển Giáo viên.</p>
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
            <span class="qm-quota-pill">👑 ${st.isSuper ? "Super Admin" : "Giáo viên VIP"}</span>
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

  /* ---------- 3. Đọc API MathType từ cấu hình QMath LMS (Sử dụng select=* để đọc đúng cột raw_data) ---------- */
  QB.getMathTypeApiUrl = async () => {
    if (QB.mathTypeApiUrl !== null) return QB.mathTypeApiUrl;
    try {
      const rows = await sbFetch("configurations?id=eq.mathtype_api&select=*");
      if (Array.isArray(rows) && rows.length > 0) {
        const d = rows[0].raw_data || rows[0].data || {};
        QB.mathTypeApiUrl = String(d.url || "").trim();
        return QB.mathTypeApiUrl;
      }
    } catch (e) {
      console.warn("[QMathBridge] Không đọc được cấu hình mathtype_api:", e);
    }
    QB.mathTypeApiUrl = "";
    return "";
  };

  /* ---------- 4. Cửa sổ Hướng dẫn chuẩn bị File Word (.docx) & Tải file mẫu ---------- */
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
          <b>📐 4. Công thức Toán & Hình ảnh</b>
          <p>Hỗ trợ tự động nhận diện công thức <b>MathType</b>, <b>LaTeX <code>$...$</code></b> và mọi <b>hình vẽ / bảng biểu</b> trong Word (giống hệt phần Tạo đề thi bằng file Word).</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:14px">
        <div style="padding:11px 13px;border-radius:10px;border:1px solid #dbeafe;background:#eff6ff">
          <div style="font-weight:800;font-size:12.5px;color:#1e40af;margin-bottom:4px">1. Trắc nghiệm 4 lựa chọn (MC)</div>
          <div style="font-size:12px;color:#334155;line-height:1.5">
            • 4 phương án viết <b>A.</b> <b>B.</b> <b>C.</b> <b>D.</b> (cùng dòng, xuống dòng hoặc trong bảng).<br>
            • Đáp án đúng: <u>Gạch chân</u> chữ cái (VD: <b><u>A.</u></b>), hoặc ghi <b>*A.</b>, hoặc ghi <code>Chọn A</code> trong Lời giải, hoặc đặt Bảng đáp án cuối đề.
          </div>
        </div>
        <div style="padding:11px 13px;border-radius:10px;border:1px solid #dbeafe;background:#f8fafc">
          <div style="font-weight:800;font-size:12.5px;color:#1e40af;margin-bottom:4px">2. Đúng / Sai 4 ý (TF)</div>
          <div style="font-size:12px;color:#334155;line-height:1.5">
            • Ghi nhãn <b>[ĐS]</b> ở đầu câu, theo sau là 4 ý <b>a)</b>, <b>b)</b>, <b>c)</b>, <b>d)</b>.<br>
            • Cuối mỗi ý ghi <b>[Đúng]</b> hoặc <b>[Sai]</b>, HOẶC <u>gạch chân</u> chữ cái của các ý Đúng (VD: <b><u>a)</u></b>), HOẶC ghi <code>Đáp án: ĐSĐS</code>.
          </div>
        </div>
        <div style="padding:11px 13px;border-radius:10px;border:1px solid #dbeafe;background:#f8fafc">
          <div style="font-weight:800;font-size:12.5px;color:#1e40af;margin-bottom:4px">3. Trả lời ngắn / Điền số (SA)</div>
          <div style="font-size:12px;color:#334155;line-height:1.5">
            • Câu hỏi không có A, B, C, D.<br>
            • Cuối đề bài hoặc trong mục <b>Lời giải:</b> ghi rõ:<br>
            <code>Đáp án: 50</code> hoặc <code>Đáp số: 12,5</code>.
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <b style="font-size:12.5px;color:#1e293b">Mẫu văn bản chuẩn (Word .docx) · Hỗ trợ cả LaTeX (.tex) chuẩn <code>ex_test</code> (<code>\\begin{ex}...\\choice / \\choiceTF / \\shortans\\end{ex}</code>):</b>
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
        label: "📄 Chọn file (.docx / .tex) từ máy tính ngay",
        cls: "btn-primary",
        onClick: () => {
          onUploadClick();
          return true;
        }
      });
    }

    return U.modal({
      title: "📘 Hướng Dẫn Đưa Câu Hỏi Word (.docx) & LaTeX (.tex) Lên Game",
      size: "lg",
      body,
      actions
    });
  };

  QB.quickImportWordForGame = async (game, onDone, opts = {}) => {
    const accept = opts.accept || ".docx,.tex,.txt,.json,.js,.xlsx,.xls,.csv";
    const file = await U.pickFile(accept);
    if (!file) return;
    try {
      U.toast(`Đang đọc file ${file.name}...`, "info", 2000);
      const list = await IO.parseFile(file);
      if (!Array.isArray(list) || !list.length) {
        U.toast("Không tìm thấy câu hỏi hợp lệ trong file đã chọn!", "warn", 3500);
        return;
      }
      const playable = Quiz.countPlayable ? Quiz.countPlayable(list) : list.length;
      if (typeof onDone === "function") onDone(list, file);
      U.toast(`Đã nạp ${list.length} câu hỏi (${playable} câu chơi được) từ ${file.name}!`, "ok", 3800);
    } catch (e) {
      U.toast("Không đọc được file: " + (e && e.message ? e.message : String(e)), "err", 4500);
    }
  };
  QB.quickImportFileForGame = QB.quickImportWordForGame;

  /* ---------- 5. Tải dữ liệu Cây Kiến Thức & Kho Ngân Hàng Câu Hỏi QMath ---------- */
  async function loadMapIdTree() {
    if (QB.mapIdTree && QB.mapIdTree.length > 0) return QB.mapIdTree;
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
      const rows = await sbFetch("configurations?id=eq.map_id_tree&select=*");
      if (Array.isArray(rows) && rows.length > 0) {
        const d = rows[0].raw_data || rows[0].data || {};
        if (Array.isArray(d.tree) && d.tree.length > 0) {
          QB.mapIdTree = d.tree;
          try { localStorage.setItem("lms_cached_mapid_tree", JSON.stringify(d.tree)); } catch (e) {}
          return QB.mapIdTree;
        }
      }
    } catch (e) {
      console.warn("[QMathBridge] Dùng cây MapID mặc định:", e);
    }

    if (!QB.mapIdTree || !QB.mapIdTree.length) {
      QB.mapIdTree = DEFAULT_MAP_ID_TREE;
    }
    return QB.mapIdTree;
  }

  async function loadQMathBankCatalog() {
    if (QB.r2BankList && QB.r2BankList.length > 0) return QB.r2BankList;

    try {
      const cached = localStorage.getItem("lms_cached_bank");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          QB.r2BankList = parsed.filter((q) => !q.isDuplicate);
        }
      }
    } catch (e) {}

    try {
      const res = await fetch(R2_CATALOG_URL + "?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          QB.r2BankList = data.filter((q) => !q.isDuplicate);
          try { localStorage.setItem("lms_cached_bank", JSON.stringify(data)); } catch (e) {}
        }
      }
    } catch (e) {
      try {
        const res2 = await fetch(WORKER_BANK_URL);
        if (res2.ok) {
          const data2 = await res2.json();
          if (Array.isArray(data2)) {
            QB.r2BankList = data2.filter((q) => !q.isDuplicate);
          }
        }
      } catch (e2) {}
    }

    if (QB.user && QB.user.uid && QB.myExamQuestions.length === 0) {
      try {
        const examRows = await sbFetch(`exams?author_id=eq.${encodeURIComponent(QB.user.uid)}&select=*&order=created_at.desc&limit=30`);
        if (Array.isArray(examRows)) {
          const extracted = [];
          examRows.forEach((ex) => {
            const raw = ex.raw_data || {};
            const qs = Array.isArray(ex.questions) ? ex.questions : Array.isArray(raw.questions) ? raw.questions : [];
            const title = ex.title || raw.title || "Đề thi của tôi";
            qs.forEach((q, idx) => {
              if (!q || (!q.content && !q.Question)) return;
              extracted.push(Object.assign({}, q, {
                id: q.id || q.cccd || `${ex.id}_Q${idx + 1}`,
                cccd: q.cccd || q.id || `${ex.id}_Q${idx + 1}`,
                mapId: q.mapId || "",
                source: title,
                _fromMyExam: true,
                _examTitle: title
              }));
            });
          });
          QB.myExamQuestions = extracted;
        }
      } catch (e) {}
    }

    return QB.r2BankList;
  }

  /* ---------- Phân tích mã MapID thành { grade, subjectCode, chapter, levelCode, lesson, dang } ---------- */
  function parseMapIdParts(mapId) {
    if (!mapId) return null;
    const clean = String(mapId).trim().toUpperCase().replace(/^\[|\]$/g, "");
    const m = clean.match(/^(\d+)([A-Z]+)(\d+)([NHVCYBKGC])(\d*)(?:-([A-Za-z0-9]+))?$/i);
    if (!m) return null;
    const gRaw = m[1];
    const grade = gRaw === "10" ? "0" : gRaw === "11" ? "1" : gRaw === "12" ? "2" : gRaw;
    const gLabel = grade === "0" ? "10" : grade === "1" ? "11" : grade === "2" ? "12" : grade;
    const sRaw = m[2].toUpperCase();
    const subjectCode = sRaw === "DS" ? "D" : sRaw === "HH" ? "H" : sRaw === "XS" ? "X" : sRaw;
    const chapter = m[3];
    const lRaw = m[4].toUpperCase();
    let levelName = "Thông hiểu";
    if (lRaw === "N" || lRaw === "Y") levelName = "Nhận biết";
    else if (lRaw === "H" || lRaw === "B") levelName = "Thông hiểu";
    else if (lRaw === "V" || lRaw === "K") levelName = "Vận dụng";
    else if (lRaw === "C" || lRaw === "G") levelName = "Vận dụng cao";
    const lesson = m[5] || "";
    const dang = m[6] || "";
    return {
      raw: clean,
      grade,
      gradeLabel: gLabel,
      subjectCode,
      chapter,
      levelCode: lRaw,
      levelName,
      lesson,
      dang
    };
  }

  /* ---------- Làm giàu Cây Kiến Thức từ dữ liệu câu hỏi thực tế (đảm bảo mọi Bài & Dạng có câu hỏi đều xuất hiện) ---------- */
  function buildEnrichedKnowledgeTree(rawTree, questions) {
    const tree = JSON.parse(JSON.stringify(Array.isArray(rawTree) && rawTree.length ? rawTree : DEFAULT_MAP_ID_TREE));
    const gradeNames = { "6": "Lớp 6", "7": "Lớp 7", "8": "Lớp 8", "9": "Lớp 9", "0": "Lớp 10", "1": "Lớp 11", "2": "Lớp 12" };
    const subjNames = { "D": "Đại số & Giải tích", "H": "Hình học", "X": "Thống kê & Xác suất", "C": "Chuyên đề học tập", "T": "Hoạt động thực hành" };

    (questions || []).forEach((q) => {
      const p = parseMapIdParts(q.mapId || q.id);
      if (!p || !p.grade) return;

      let gNode = tree.find((g) => String(g.id) === String(p.grade) || (p.grade === "0" && String(g.id) === "10") || (p.grade === "1" && String(g.id) === "11") || (p.grade === "2" && String(g.id) === "12"));
      if (!gNode) {
        gNode = { id: p.grade, name: gradeNames[p.grade] || ("Lớp " + p.gradeLabel), level: 0, children: [] };
        tree.push(gNode);
      }
      if (!Array.isArray(gNode.children)) gNode.children = [];

      if (!p.subjectCode) return;
      let sNode = gNode.children.find((s) => String(s.id).toUpperCase() === p.subjectCode);
      if (!sNode) {
        sNode = { id: p.subjectCode, name: (subjNames[p.subjectCode] || ("Phân môn " + p.subjectCode)) + " " + p.gradeLabel, level: 1, children: [] };
        gNode.children.push(sNode);
      }
      if (!Array.isArray(sNode.children)) sNode.children = [];

      if (!p.chapter) return;
      let cNode = sNode.children.find((c) => String(c.id) === String(p.chapter));
      if (!cNode) {
        cNode = { id: String(p.chapter), name: "Chương " + p.chapter, level: 2, children: [] };
        sNode.children.push(cNode);
      }
      if (!Array.isArray(cNode.children)) cNode.children = [];

      if (!p.lesson) return;
      let lNode = cNode.children.find((l) => String(l.id) === String(p.lesson));
      if (!lNode) {
        lNode = { id: String(p.lesson), name: "Bài " + p.lesson, level: 3, children: [] };
        cNode.children.push(lNode);
      }
      if (!Array.isArray(lNode.children)) lNode.children = [];

      if (!p.dang) return;
      let dNode = lNode.children.find((d) => String(d.id) === String(p.dang));
      if (!dNode) {
        dNode = { id: String(p.dang), name: "Dạng " + p.dang, level: 4, children: [] };
        lNode.children.push(dNode);
      }
    });

    // Sắp xếp các Lớp theo thứ tự Lớp 6 -> Lớp 12 (hoặc Lớp 12 -> Lớp 6)
    const gradeOrder = ["6", "7", "8", "9", "0", "10", "1", "11", "2", "12"];
    tree.sort((a, b) => {
      const ia = gradeOrder.indexOf(String(a.id));
      const ib = gradeOrder.indexOf(String(b.id));
      if (ia !== -1 && ib !== -1) return ia - ib;
      return String(a.name).localeCompare(String(b.name), "vi");
    });

    return tree;
  }

  function matchQuestionToSelection(q, sel) {
    if (!sel || !sel.grade) return true;
    const p = parseMapIdParts(q.mapId || q.id);
    if (!p) return false;
    const normSelGrade = sel.grade === "10" ? "0" : sel.grade === "11" ? "1" : sel.grade === "12" ? "2" : String(sel.grade);
    if (p.grade !== normSelGrade) return false;
    if (sel.subject && p.subjectCode !== String(sel.subject).toUpperCase()) return false;
    if (sel.chapter && String(p.chapter) !== String(sel.chapter)) return false;
    if (sel.lesson && String(p.lesson) !== String(sel.lesson)) return false;
    if (sel.dang && String(p.dang) !== String(sel.dang)) return false;
    return true;
  }

  /* ---------- Tải chi tiết câu hỏi từ Cloudflare Worker ---------- */
  const fullQuestionCache = new Map();

  async function fetchFullQuestionDetail(qMeta) {
    if (!qMeta) return null;
    const qId = String(qMeta.id || qMeta.cccd || "");
    if (qMeta.content && ((Array.isArray(qMeta.options) && qMeta.options.length > 0) || (Array.isArray(qMeta.statements) && qMeta.statements.length > 0) || qMeta.answer != null)) {
      fullQuestionCache.set(qId, qMeta);
      return qMeta;
    }
    if (qMeta.Question && (qMeta.Options || qMeta.CorrectAnswer != null)) {
      fullQuestionCache.set(qId, qMeta);
      return qMeta;
    }
    if (fullQuestionCache.has(qId)) return fullQuestionCache.get(qId);

    try {
      const res = await fetch(`${WORKER_BANK_URL}?id=${encodeURIComponent(qId)}`);
      if (res.ok) {
        const full = await res.json();
        if (full && (full.content || full.Question)) {
          const merged = Object.assign({}, qMeta, full);
          fullQuestionCache.set(qId, merged);
          return merged;
        }
      }
    } catch (e) {}
    return qMeta;
  }

  /* ---------- Chuyển đổi Câu hỏi từ chuẩn QMath LMS sang chuẩn Game (MC / TF / SA) ---------- */
  function convertQMathQuestionToGameFormat(rawQ) {
    if (!rawQ) return null;
    if (rawQ.Question && (rawQ.Options || rawQ.CorrectAnswer != null) && ["MC", "TF", "SA"].includes(Quiz.baseType(rawQ.Type))) {
      return IO.clean(rawQ);
    }

    const qId = String(rawQ.cccd || rawQ.id || U.uid()).trim();
    const mapId = String(rawQ.mapId || "").trim();
    const parsed = parseMapIdParts(mapId);

    const grade = rawQ.Grade || (parsed ? parsed.gradeLabel : "");
    let subject = rawQ.subject || rawQ.Subject || "Toán";
    if ((!subject || subject === "Khác" || subject === "Chưa phân loại") && parsed) {
      if (parsed.subjectCode === "D") subject = "Đại số";
      else if (parsed.subjectCode === "H") subject = "Hình học";
      else if (parsed.subjectCode === "X") subject = "Xác suất";
    }
    const level = rawQ.level || rawQ.Level || (parsed ? parsed.levelName : "Thông hiểu");
    const chapter = rawQ.Chapter || (parsed && parsed.chapter ? "Chương " + parsed.chapter : "");
    const topic = rawQ.Topic || (parsed && parsed.lesson ? "Bài " + parsed.lesson + (parsed.dang ? " - Dạng " + parsed.dang : "") : (mapId || ""));

    const rawType = String(rawQ.type || rawQ.Type || "").toLowerCase().trim();
    let gType = "MC";
    if (rawType === "tf" || rawType === "dung_sai" || rawType === "dungsai" || (Array.isArray(rawQ.statements) && rawQ.statements.length > 0)) {
      gType = "TF";
    } else if (rawType === "short" || rawType === "sa" || rawType === "tra_loi_ngan" || rawType === "dien_khuyet" || ((rawQ.answer !== undefined && rawQ.answer !== null && String(rawQ.answer).trim() !== "") && (!rawQ.options || !rawQ.options.length))) {
      gType = "SA";
    } else if (rawType === "essay" || rawType === "tu_luan" || rawType === "la") {
      return null;
    }

    const stem = String(rawQ.content || rawQ.Question || "").trim();
    const explain = String(rawQ.solution || rawQ.Explain || "").trim();
    if (!stem) return null;

    if (gType === "MC") {
      const optsArr = Array.isArray(rawQ.options) ? rawQ.options : [];
      const Options = {};
      const keys = ["A", "B", "C", "D", "E", "F"];
      if (optsArr.length > 0) {
        optsArr.slice(0, 6).forEach((txt, idx) => {
          if (txt != null && String(txt).trim() !== "") {
            Options[keys[idx]] = String(txt).trim();
          }
        });
      } else if (rawQ.Options && typeof rawQ.Options === "object") {
        keys.forEach((k) => {
          if (rawQ.Options[k] != null) Options[k] = String(rawQ.Options[k]).trim();
        });
      }
      if (Object.keys(Options).length < 2) return null;

      let correctKey = "A";
      if (typeof rawQ.correct === "number" && rawQ.correct >= 0 && rawQ.correct < 6) {
        correctKey = keys[rawQ.correct];
      } else if (typeof rawQ.correctAnswer === "string" && /^[A-F]$/i.test(rawQ.correctAnswer.trim())) {
        correctKey = rawQ.correctAnswer.trim().toUpperCase();
      } else if (typeof rawQ.CorrectAnswer === "string" && /^[A-F]$/i.test(rawQ.CorrectAnswer.trim())) {
        correctKey = rawQ.CorrectAnswer.trim().toUpperCase();
      } else if (typeof rawQ.correct === "string" && /^[A-F]$/i.test(rawQ.correct.trim())) {
        correctKey = rawQ.correct.trim().toUpperCase();
      }

      return IO.clean({
        Id: qId,
        cccd: qId,
        mapId: mapId,
        Type: "MC",
        Level: level,
        Grade: grade,
        Subject: subject,
        Chapter: chapter,
        Topic: topic,
        Question: stem,
        Options,
        CorrectAnswer: correctKey,
        Explain: explain
      });
    }

    if (gType === "TF") {
      const tfKeys = ["a", "b", "c", "d"];
      const Options = {};
      let ansStr = "";

      if (Array.isArray(rawQ.statements) && rawQ.statements.length > 0) {
        rawQ.statements.slice(0, 4).forEach((st, idx) => {
          const txt = typeof st === "string" ? st : (st.text || st.content || "");
          Options[tfKeys[idx]] = String(txt).trim();
          const isT = st && (st.isTrue === true || st.correct === true || st.isCorrect === true || st.isTrue === "true" || st.isTrue === "D" || st.isTrue === "Đ");
          ansStr += isT ? "Đ" : "S";
        });
      } else if (Array.isArray(rawQ.options) && rawQ.options.length > 0) {
        const rawAnsParts = String(rawQ.correctAnswer || rawQ.CorrectAnswer || "Đ,S,Đ,S").toUpperCase().split(/[\s,;]+/);
        rawQ.options.slice(0, 4).forEach((txt, idx) => {
          Options[tfKeys[idx]] = String(txt || "").trim();
          const tok = rawAnsParts[idx] || "S";
          ansStr += (tok === "D" || tok === "Đ" || tok === "TRUE" || tok === "1") ? "Đ" : "S";
        });
      }

      if (!Object.keys(Options).length) return null;
      return IO.clean({
        Id: qId,
        cccd: qId,
        mapId: mapId,
        Type: "TF",
        Level: level,
        Grade: grade,
        Subject: subject,
        Chapter: chapter,
        Topic: topic,
        Question: stem,
        Options,
        CorrectAnswer: ansStr || "ĐSĐS",
        Explain: explain
      });
    }

    if (gType === "SA") {
      const ans = String(rawQ.answer != null && rawQ.answer !== "" ? rawQ.answer : (rawQ.correctAnswer || rawQ.CorrectAnswer || "")).trim()
        .replace(/^\$+|\$+$/g, "")
        .replace(/\{([.,])\}/g, "$1");
      if (!ans) return null;
      return IO.clean({
        Id: qId,
        cccd: qId,
        mapId: mapId,
        Type: "SA",
        Level: level,
        Grade: grade,
        Subject: subject,
        Chapter: chapter,
        Topic: topic,
        Question: stem,
        CorrectAnswer: ans,
        Explain: explain
      });
    }

    return null;
  }
  QB.convertQMathQuestionToGameFormat = convertQMathQuestionToGameFormat;

  function detectRawQType(q) {
    if (!q) return "MC";
    if (q.Type && ["MC", "TF", "SA"].includes(Quiz.baseType(q.Type))) return Quiz.baseType(q.Type);
    const t = String(q.type || "").toLowerCase().trim();
    if (t === "tf" || t === "dung_sai" || t === "dungsai" || (Array.isArray(q.statements) && q.statements.length > 0)) return "TF";
    if (t === "short" || t === "sa" || t === "tra_loi_ngan" || ((q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== "") && (!q.options || !q.options.length))) return "SA";
    if (t === "essay" || t === "tu_luan" || t === "la") return "LA";
    return "MC";
  }

  /* =========================================================
     6. CỬA SỔ CHỌN CÂU HỎI TỪ KHO NGÂN HÀNG QMATH THEO TỪNG BƯỚC
        Bước 1: Chọn Lớp ➔ Bước 2: Chọn Phân môn ➔ Bước 3: Chọn Bài học
        ➔ Bước 4: Chọn Dạng bài ➔ Danh sách câu hỏi & Xem trước (Live Preview)
     ========================================================= */
  QB.openBankPickerModal = async (options) => {
    options = options || {};
    const onConfirm = options.onConfirm || null;
    const targetName = options.targetName || "Trò chơi";

    const state = {
      sourceTab: "qmath_bank", // "qmath_bank" | "my_exams" | "game_bank"
      stepMode: "grade",       // "grade" | "subject" | "lesson" | "questions"
      sel: {
        grade: "",
        gradeName: "",
        subject: "",
        subjectName: "",
        chapter: "",
        chapterName: "",
        lesson: "",
        lessonName: "",
        dang: "",
        dangName: ""
      },
      searchQuery: "",
      typeFilter: "",
      levelFilter: "",
      selectedIds: new Set(),
      selectedMap: new Map(),
      activePreviewId: null,
      filteredQuestions: [],
      pageLimit: 50,
      enrichedTree: []
    };

    const body = U.h(`<div class="qmb-progressive-wrap">
      <!-- Thanh điều hướng các bước (Step Breadcrumb Bar) -->
      <div class="qmb-step-bar">
        <div class="qmb-steps-nav" id="qmbStepsNav"></div>
        <div class="qmb-source-tabs">
          <button type="button" class="qmb-src-tab on" data-src="qmath_bank">🏦 Ngân hàng QMath</button>
          <button type="button" class="qmb-src-tab" data-src="my_exams">📝 Đề thi của tôi</button>
          <button type="button" class="qmb-src-tab" data-src="game_bank">🎮 Kho trong Game</button>
        </div>
      </div>

      <!-- Khung chọn Bước 1 (Lớp), Bước 2 (Phân môn), Bước 3 (Chương / Bài học) -->
      <div class="qmb-wizard-stage" id="qmbWizardStage"></div>

      <!-- Khung Bước 4 (Dạng bài) + 2 cột Danh sách câu hỏi & Xem trước (Live Preview) -->
      <div class="qmb-work-stage hide" id="qmbWorkStage">
        <!-- Thanh chọn nhanh các Dạng bài của Bài học đang chọn -->
        <div class="qmb-dang-strip" id="qmbDangStrip"></div>

        <!-- 2 Cột: Cột trái = Danh sách câu hỏi để chọn lần lượt | Cột phải = Xem trước chi tiết -->
        <div class="qmb-split-2col">
          <div class="qmb-col-list">
            <div class="qmb-list-toolbar">
              <div class="qmb-filter-row">
                <input type="search" class="qmb-search-inp" id="qmbSearchInp" placeholder="🔎 Tìm nội dung câu hỏi, mã câu hỏi...">
                <select class="qmb-filter-sel" id="qmbTypeSel">
                  <option value="">Tất cả loại câu</option>
                  <option value="MC">Trắc nghiệm (4 lựa chọn)</option>
                  <option value="TF">Đúng / Sai (4 ý)</option>
                  <option value="SA">Trả lời ngắn</option>
                </select>
                <select class="qmb-filter-sel" id="qmbLevelSel">
                  <option value="">Tất cả mức độ</option>
                  <option value="Nhận biết">Nhận biết</option>
                  <option value="Thông hiểu">Thông hiểu</option>
                  <option value="Vận dụng">Vận dụng</option>
                  <option value="Vận dụng cao">Vận dụng cao</option>
                </select>
              </div>
              <div class="qmb-list-subbar">
                <span id="qmbMatchCount" style="font-weight:700;color:#334155">Đang tải...</span>
                <div style="display:flex;gap:6px">
                  <button type="button" class="qmb-mini-btn" id="qmbSelectPageBtn">☑️ Chọn tất cả dạng này</button>
                  <button type="button" class="qmb-mini-btn" id="qmbClearSelBtn">Bỏ chọn hết</button>
                </div>
              </div>
            </div>
            <div class="qmb-qlist-scroll" id="qmbQListScroll"></div>
          </div>

          <div class="qmb-col-preview">
            <div class="qmb-pane-head" style="flex-direction:row;align-items:center;justify-content:space-between">
              <div class="qmb-pane-title">👁️ Xem trước câu hỏi (Hiển thị chuẩn đề thi)</div>
              <div id="qmbPrevActionWrap"></div>
            </div>
            <div class="qmb-preview-scroll" id="qmbPreviewScroll">
              <div class="qmb-preview-empty">
                <div style="font-size:40px">👈</div>
                <b>Bấm vào một câu hỏi ở danh sách bên trái để xem trước</b>
                <span style="font-size:12.5px">Hiển thị đầy đủ công thức Toán học, hình vẽ, 4 phương án A/B/C/D, mệnh đề Đúng/Sai và Lời giải chi tiết.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`);

    const m = U.modal({
      title: `📚 Chọn Câu Hỏi Từ Ngân Hàng Đề Thi QMath → ${targetName}`,
      size: "xl",
      body,
      autofocus: false,
      actions: [
        { label: "Đóng", cls: "btn-ghost" },
        {
          label: "✅ Đưa các câu đã chọn vào Game (0 câu)",
          cls: "btn-primary",
          onClick: async () => {
            if (state.selectedIds.size === 0) {
              U.toast("Vui lòng tích chọn ít nhất 1 câu hỏi!", "warn");
              return false;
            }
            await confirmSelection(m);
            return false;
          }
        }
      ]
    });

    const modalEl = document.querySelector(".modal-wrap:last-of-type .modal");
    if (modalEl) modalEl.classList.add("qm-bank-modal");

    const modalFoot = modalEl ? modalEl.querySelector(".modal-f") : null;
    let footCounterEl = null;
    let confirmBtnEl = null;
    if (modalFoot) {
      confirmBtnEl = modalFoot.querySelector(".btn-primary");
      const leftInfo = U.h(`<div class="qmb-foot-summary">
        <span class="qmb-sel-count" id="qmbFootBadge">Đã chọn: 0 câu</span>
        <span style="font-size:12.5px;color:#475569">Chọn theo từng bước: <b>Lớp ➔ Phân môn ➔ Bài học ➔ Dạng bài</b> rồi tích chọn câu hỏi</span>
      </div>`);
      modalFoot.insertBefore(leftInfo, modalFoot.firstChild);
      footCounterEl = leftInfo.querySelector("#qmbFootBadge");
    }

    function updateFooterCount() {
      const n = state.selectedIds.size;
      if (footCounterEl) footCounterEl.textContent = `Đã chọn: ${n} câu`;
      if (confirmBtnEl) confirmBtnEl.innerHTML = `✅ Đưa vào Game (<b>${n}</b> câu hỏi đã chọn)`;
    }

    function getActiveSourceList() {
      if (state.sourceTab === "my_exams") return QB.myExamQuestions || [];
      if (state.sourceTab === "game_bank") return DB.bank() || [];
      return QB.r2BankList || [];
    }

    /* ---------- Render Thanh Điều Hướng Bước (Step Bar) ---------- */
    const stepsNavEl = body.querySelector("#qmbStepsNav");
    const wizardStageEl = body.querySelector("#qmbWizardStage");
    const workStageEl = body.querySelector("#qmbWorkStage");
    const dangStripEl = body.querySelector("#qmbDangStrip");
    const qListEl = body.querySelector("#qmbQListScroll");
    const previewEl = body.querySelector("#qmbPreviewScroll");
    const prevActionWrap = body.querySelector("#qmbPrevActionWrap");
    const matchCountEl = body.querySelector("#qmbMatchCount");

    function renderStepBar() {
      if (state.sourceTab !== "qmath_bank") {
        stepsNavEl.innerHTML = `<span class="qmb-step-pill active">📂 Nguồn: ${state.sourceTab === "my_exams" ? "Đề thi đã tạo của tôi" : "Kho câu hỏi có sẵn trong Game"}</span>`;
        return;
      }

      const s = state.sel;
      const step1Cls = state.stepMode === "grade" ? "active" : s.grade ? "done" : "";
      const step2Cls = state.stepMode === "subject" ? "active" : s.subject ? "done" : !s.grade ? "disabled" : "";
      const step3Cls = state.stepMode === "lesson" ? "active" : (s.chapter || s.lesson) ? "done" : !s.subject ? "disabled" : "";
      const step4Cls = state.stepMode === "questions" ? "active" : !s.grade ? "disabled" : "";

      stepsNavEl.innerHTML = `
        <button type="button" class="qmb-step-pill ${step1Cls}" data-goto="grade">
          <span class="qmb-step-num">1</span>
          <span>${s.gradeName ? U.esc(s.gradeName) : "Chọn Lớp"}</span>
        </button>
        <span class="qmb-step-arr">›</span>
        <button type="button" class="qmb-step-pill ${step2Cls}" data-goto="subject" ${!s.grade ? "disabled" : ""}>
          <span class="qmb-step-num">2</span>
          <span>${s.subjectName ? U.esc(s.subjectName) : "Chọn Phân môn"}</span>
        </button>
        <span class="qmb-step-arr">›</span>
        <button type="button" class="qmb-step-pill ${step3Cls}" data-goto="lesson" ${!s.subject ? "disabled" : ""}>
          <span class="qmb-step-num">3</span>
          <span>${s.lessonName ? U.esc(s.lessonName) : s.chapterName ? U.esc(s.chapterName) : "Chọn Chương / Bài"}</span>
        </button>
        <span class="qmb-step-arr">›</span>
        <button type="button" class="qmb-step-pill ${step4Cls}" data-goto="questions" ${!s.grade ? "disabled" : ""}>
          <span class="qmb-step-num">4</span>
          <span>${s.dangName ? U.esc(s.dangName) : "Chọn Dạng & Câu hỏi"}</span>
        </button>
      `;

      stepsNavEl.querySelectorAll(".qmb-step-pill[data-goto]").forEach((btn) => {
        btn.onclick = () => {
          const target = btn.getAttribute("data-goto");
          if (target === "grade") {
            state.stepMode = "grade";
            renderStage();
          } else if (target === "subject" && state.sel.grade) {
            state.stepMode = "subject";
            renderStage();
          } else if (target === "lesson" && state.sel.subject) {
            state.stepMode = "lesson";
            renderStage();
          } else if (target === "questions" && state.sel.grade) {
            state.stepMode = "questions";
            renderStage();
          }
        };
      });
    }

    function countQuestionsMatching(partialSel) {
      const list = getActiveSourceList();
      let c = 0;
      for (let i = 0; i < list.length; i++) {
        if (matchQuestionToSelection(list[i], partialSel)) c++;
      }
      return c;
    }

    function getSelectedGradeNode() {
      const g = state.sel.grade;
      if (!g) return null;
      return state.enrichedTree.find((n) => String(n.id) === String(g) || (g === "0" && String(n.id) === "10") || (g === "1" && String(n.id) === "11") || (g === "2" && String(n.id) === "12"));
    }

    function getSelectedSubjectNode() {
      const gNode = getSelectedGradeNode();
      if (!gNode || !Array.isArray(gNode.children) || !state.sel.subject) return null;
      return gNode.children.find((s) => String(s.id).toUpperCase() === String(state.sel.subject).toUpperCase());
    }

    function getSelectedLessonNode() {
      const sNode = getSelectedSubjectNode();
      if (!sNode || !Array.isArray(sNode.children) || !state.sel.chapter || !state.sel.lesson) return null;
      const cNode = sNode.children.find((c) => String(c.id) === String(state.sel.chapter));
      if (!cNode || !Array.isArray(cNode.children)) return null;
      return cNode.children.find((l) => String(l.id) === String(state.sel.lesson));
    }

    /* ---------- Render Màn hình Chính theo Bước đang chọn ---------- */
    function renderStage() {
      renderStepBar();

      if (state.sourceTab !== "qmath_bank") {
        wizardStageEl.classList.add("hide");
        workStageEl.classList.remove("hide");
        dangStripEl.innerHTML = "";
        dangStripEl.classList.add("hide");
        applyFiltersAndRenderList();
        return;
      }

      if (state.stepMode === "grade") {
        wizardStageEl.classList.remove("hide");
        workStageEl.classList.add("hide");
        renderStep1Grades();
      } else if (state.stepMode === "subject") {
        wizardStageEl.classList.remove("hide");
        workStageEl.classList.add("hide");
        renderStep2Subjects();
      } else if (state.stepMode === "lesson") {
        wizardStageEl.classList.remove("hide");
        workStageEl.classList.add("hide");
        renderStep3ChaptersAndLessons();
      } else {
        wizardStageEl.classList.add("hide");
        workStageEl.classList.remove("hide");
        renderStep4DangAndQuestions();
      }
    }

    /* ---------- BƯỚC 1: CHỌN KHỐI LỚP ---------- */
    function renderStep1Grades() {
      const grades = state.enrichedTree || [];
      let cardsHtml = "";
      grades.forEach((gNode) => {
        const gId = String(gNode.id);
        const normG = gId === "10" ? "0" : gId === "11" ? "1" : gId === "12" ? "2" : gId;
        const count = countQuestionsMatching({ grade: normG });
        const subjCount = Array.isArray(gNode.children) ? gNode.children.length : 0;
        const isCur = state.sel.grade === normG;
        cardsHtml += `
          <button type="button" class="qmb-choice-card ${isCur ? "active" : ""}" data-grade="${U.esc(normG)}" data-name="${U.esc(gNode.name)}">
            <div class="qmb-cc-icon">🎓</div>
            <div class="qmb-cc-info">
              <div class="qmb-cc-title">${U.esc(gNode.name)}</div>
              <div class="qmb-cc-sub">${subjCount} phân môn · <b>${count}</b> câu hỏi</div>
            </div>
            <span class="qmb-cc-arrow">→</span>
          </button>
        `;
      });

      wizardStageEl.innerHTML = `
        <div class="qmb-wizard-box">
          <div class="qmb-wizard-header">
            <div>
              <span class="qmb-wiz-step-badge">Bước 1 / 4</span>
              <h3>Chọn Khối Lớp</h3>
              <p>Hãy chọn Khối Lớp để hiển thị các Phân môn tương ứng.</p>
            </div>
          </div>
          <div class="qmb-card-grid cols-4">${cardsHtml}</div>
        </div>
      `;

      wizardStageEl.querySelectorAll(".qmb-choice-card[data-grade]").forEach((btn) => {
        btn.onclick = () => {
          const g = btn.getAttribute("data-grade");
          const gName = btn.getAttribute("data-name");
          state.sel = {
            grade: g,
            gradeName: gName,
            subject: "",
            subjectName: "",
            chapter: "",
            chapterName: "",
            lesson: "",
            lessonName: "",
            dang: "",
            dangName: ""
          };
          state.stepMode = "subject";
          renderStage();
        };
      });
    }

    /* ---------- BƯỚC 2: CHỌN PHÂN MÔN ---------- */
    function renderStep2Subjects() {
      const gNode = getSelectedGradeNode();
      const subjects = (gNode && Array.isArray(gNode.children)) ? gNode.children : [];
      const totalGradeCount = countQuestionsMatching({ grade: state.sel.grade });

      let cardsHtml = "";
      subjects.forEach((sNode) => {
        const sId = String(sNode.id).toUpperCase();
        const count = countQuestionsMatching({ grade: state.sel.grade, subject: sId });
        const chapCount = Array.isArray(sNode.children) ? sNode.children.length : 0;
        const icon = sId === "H" ? "📐" : sId === "X" ? "🎲" : "📘";
        const isCur = state.sel.subject === sId;
        cardsHtml += `
          <button type="button" class="qmb-choice-card ${isCur ? "active" : ""}" data-subj="${U.esc(sId)}" data-name="${U.esc(sNode.name)}">
            <div class="qmb-cc-icon">${icon}</div>
            <div class="qmb-cc-info">
              <div class="qmb-cc-title">${U.esc(sNode.name)}</div>
              <div class="qmb-cc-sub">${chapCount} chương · <b>${count}</b> câu hỏi</div>
            </div>
            <span class="qmb-cc-arrow">→</span>
          </button>
        `;
      });

      wizardStageEl.innerHTML = `
        <div class="qmb-wizard-box">
          <div class="qmb-wizard-header">
            <div>
              <span class="qmb-wiz-step-badge">Bước 2 / 4 · ${U.esc(state.sel.gradeName)}</span>
              <h3>Chọn Phân Môn (${U.esc(state.sel.gradeName)})</h3>
              <p>Chọn Phân môn để hiển thị danh sách các Chương và Bài học.</p>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn btn-sm btn-ghost" id="qmbBackToGrade">← Đổi Lớp khác</button>
              <button type="button" class="btn btn-sm btn-primary" id="qmbViewAllGrade">Xem tất cả ${totalGradeCount} câu của ${U.esc(state.sel.gradeName)} →</button>
            </div>
          </div>
          <div class="qmb-card-grid cols-3">${cardsHtml}</div>
        </div>
      `;

      wizardStageEl.querySelector("#qmbBackToGrade").onclick = () => {
        state.stepMode = "grade";
        renderStage();
      };
      wizardStageEl.querySelector("#qmbViewAllGrade").onclick = () => {
        state.sel.subject = "";
        state.sel.subjectName = "Tất cả phân môn";
        state.sel.chapter = "";
        state.sel.chapterName = "";
        state.sel.lesson = "";
        state.sel.lessonName = "";
        state.sel.dang = "";
        state.sel.dangName = "";
        state.stepMode = "questions";
        renderStage();
      };

      wizardStageEl.querySelectorAll(".qmb-choice-card[data-subj]").forEach((btn) => {
        btn.onclick = () => {
          state.sel.subject = btn.getAttribute("data-subj");
          state.sel.subjectName = btn.getAttribute("data-name");
          state.sel.chapter = "";
          state.sel.chapterName = "";
          state.sel.lesson = "";
          state.sel.lessonName = "";
          state.sel.dang = "";
          state.sel.dangName = "";
          state.stepMode = "lesson";
          renderStage();
        };
      });
    }

    /* ---------- BƯỚC 3: CHỌN CHƯƠNG & BÀI HỌC ---------- */
    function renderStep3ChaptersAndLessons() {
      const sNode = getSelectedSubjectNode();
      const chapters = (sNode && Array.isArray(sNode.children)) ? sNode.children : [];
      const totalSubjCount = countQuestionsMatching({ grade: state.sel.grade, subject: state.sel.subject });

      let chaptersHtml = "";
      chapters.forEach((cNode) => {
        const cId = String(cNode.id);
        const chapCount = countQuestionsMatching({ grade: state.sel.grade, subject: state.sel.subject, chapter: cId });
        const lessons = Array.isArray(cNode.children) ? cNode.children : [];

        let lessonsHtml = "";
        if (lessons.length > 0) {
          lessonsHtml = `<div class="qmb-lesson-grid">` + lessons.map((lNode) => {
            const lId = String(lNode.id);
            const lCount = countQuestionsMatching({ grade: state.sel.grade, subject: state.sel.subject, chapter: cId, lesson: lId });
            const dangCount = Array.isArray(lNode.children) ? lNode.children.length : 0;
            const isCur = state.sel.chapter === cId && state.sel.lesson === lId;
            return `
              <button type="button" class="qmb-lesson-card ${isCur ? "active" : ""}" data-chap="${U.esc(cId)}" data-chapname="${U.esc(cNode.name)}" data-lesson="${U.esc(lId)}" data-lessonname="${U.esc(lNode.name)}">
                <div class="qmb-lc-top">
                  <span class="qmb-lc-title">${U.esc(lNode.name)}</span>
                  <span class="qmb-lc-count">${lCount} câu</span>
                </div>
                <div class="qmb-lc-foot">
                  <span>${dangCount > 0 ? `${dangCount} dạng toán` : "Xem câu hỏi trong bài"}</span>
                  <span>Chọn bài này →</span>
                </div>
              </button>
            `;
          }).join("") + `</div>`;
        } else {
          lessonsHtml = `
            <div style="padding:10px 0">
              <button type="button" class="btn btn-sm btn-primary qmb-pick-chap-btn" data-chap="${U.esc(cId)}" data-chapname="${U.esc(cNode.name)}">
                Mở danh sách ${chapCount} câu hỏi của ${U.esc(cNode.name)} →
              </button>
            </div>
          `;
        }

        chaptersHtml += `
          <div class="qmb-chapter-block">
            <div class="qmb-chapter-head">
              <div class="qmb-chapter-title">📂 ${U.esc(cNode.name)}</div>
              <button type="button" class="qmb-mini-btn qmb-pick-chap-btn" data-chap="${U.esc(cId)}" data-chapname="${U.esc(cNode.name)}">
                Xem cả chương (${chapCount} câu) →
              </button>
            </div>
            ${lessonsHtml}
          </div>
        `;
      });

      wizardStageEl.innerHTML = `
        <div class="qmb-wizard-box">
          <div class="qmb-wizard-header">
            <div>
              <span class="qmb-wiz-step-badge">Bước 3 / 4 · ${U.esc(state.sel.gradeName)} › ${U.esc(state.sel.subjectName)}</span>
              <h3>Chọn Chương & Bài Học</h3>
              <p>Bấm vào một <b>Bài học</b> bên dưới để hiển thị các <b>Dạng bài</b> và danh sách câu hỏi.</p>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn btn-sm btn-ghost" id="qmbBackToSubj">← Đổi Phân môn</button>
              <button type="button" class="btn btn-sm btn-primary" id="qmbViewAllSubj">Xem tất cả ${totalSubjCount} câu của ${U.esc(state.sel.subjectName)} →</button>
            </div>
          </div>
          <div class="qmb-chapters-list">${chaptersHtml || `<div class="empty">Chưa có danh mục chương cho phân môn này.</div>`}</div>
        </div>
      `;

      wizardStageEl.querySelector("#qmbBackToSubj").onclick = () => {
        state.stepMode = "subject";
        renderStage();
      };
      wizardStageEl.querySelector("#qmbViewAllSubj").onclick = () => {
        state.sel.chapter = "";
        state.sel.chapterName = "";
        state.sel.lesson = "";
        state.sel.lessonName = "Tất cả bài học";
        state.sel.dang = "";
        state.sel.dangName = "";
        state.stepMode = "questions";
        renderStage();
      };

      wizardStageEl.querySelectorAll(".qmb-pick-chap-btn").forEach((btn) => {
        btn.onclick = () => {
          state.sel.chapter = btn.getAttribute("data-chap");
          state.sel.chapterName = btn.getAttribute("data-chapname");
          state.sel.lesson = "";
          state.sel.lessonName = "";
          state.sel.dang = "";
          state.sel.dangName = "Tất cả câu trong chương";
          state.stepMode = "questions";
          renderStage();
        };
      });

      wizardStageEl.querySelectorAll(".qmb-lesson-card").forEach((btn) => {
        btn.onclick = () => {
          state.sel.chapter = btn.getAttribute("data-chap");
          state.sel.chapterName = btn.getAttribute("data-chapname");
          state.sel.lesson = btn.getAttribute("data-lesson");
          state.sel.lessonName = btn.getAttribute("data-lessonname");
          state.sel.dang = "";
          state.sel.dangName = "Tất cả các dạng trong bài";
          state.stepMode = "questions";
          renderStage();
        };
      });
    }

    /* ---------- BƯỚC 4: CHỌN DẠNG BÀI & CHỌN CÂU HỎI KÈM LIVE PREVIEW ---------- */
    function renderStep4DangAndQuestions() {
      const lNode = getSelectedLessonNode();
      const dangs = (lNode && Array.isArray(lNode.children)) ? lNode.children : [];

      if (dangs.length > 0) {
        dangStripEl.classList.remove("hide");
        const allLessonCount = countQuestionsMatching({
          grade: state.sel.grade,
          subject: state.sel.subject,
          chapter: state.sel.chapter,
          lesson: state.sel.lesson
        });

        let pillsHtml = `
          <button type="button" class="qmb-dang-pill ${!state.sel.dang ? "active" : ""}" data-dang="" data-name="Tất cả các dạng trong bài">
            <span>Tất cả các dạng</span>
            <b class="qmb-dang-cnt">${allLessonCount}</b>
          </button>
        `;
        dangs.forEach((dNode) => {
          const dId = String(dNode.id);
          const dCount = countQuestionsMatching({
            grade: state.sel.grade,
            subject: state.sel.subject,
            chapter: state.sel.chapter,
            lesson: state.sel.lesson,
            dang: dId
          });
          const isCur = String(state.sel.dang) === dId;
          pillsHtml += `
            <button type="button" class="qmb-dang-pill ${isCur ? "active" : ""}" data-dang="${U.esc(dId)}" data-name="${U.esc(dNode.name)}">
              <span>${U.esc(dNode.name)}</span>
              <b class="qmb-dang-cnt">${dCount}</b>
            </button>
          `;
        });

        dangStripEl.innerHTML = `
          <div class="qmb-dang-head">
            <span class="qmb-dang-label">🎯 Bước 4 — Chọn Dạng toán (${U.esc(state.sel.lessonName || state.sel.chapterName)}):</span>
            <button type="button" class="qmb-mini-btn" id="qmbChangeLessonBtn">← Đổi Bài học khác</button>
          </div>
          <div class="qmb-dang-pills">${pillsHtml}</div>
        `;

        dangStripEl.querySelector("#qmbChangeLessonBtn").onclick = () => {
          state.stepMode = state.sel.subject ? "lesson" : "grade";
          renderStage();
        };

        dangStripEl.querySelectorAll(".qmb-dang-pill").forEach((btn) => {
          btn.onclick = () => {
            state.sel.dang = btn.getAttribute("data-dang") || "";
            state.sel.dangName = btn.getAttribute("data-name") || "";
            state.pageLimit = 50;
            renderStepBar();
            dangStripEl.querySelectorAll(".qmb-dang-pill").forEach((x) => x.classList.toggle("active", x === btn));
            applyFiltersAndRenderList();
          };
        });
      } else {
        dangStripEl.classList.remove("hide");
        dangStripEl.innerHTML = `
          <div class="qmb-dang-head" style="margin-bottom:0">
            <span class="qmb-dang-label">📂 Đang xem: <b>${U.esc(state.sel.lessonName || state.sel.chapterName || state.sel.subjectName || state.sel.gradeName)}</b></span>
            <button type="button" class="qmb-mini-btn" id="qmbChangeLessonBtn">← Quay lại chọn Bài học / Phân môn</button>
          </div>
        `;
        dangStripEl.querySelector("#qmbChangeLessonBtn").onclick = () => {
          state.stepMode = state.sel.subject ? "lesson" : state.sel.grade ? "subject" : "grade";
          renderStage();
        };
      }

      applyFiltersAndRenderList();
    }

    /* ---------- Lọc & Hiển thị Danh sách câu hỏi (Cột trái) ---------- */
    function applyFiltersAndRenderList() {
      const rawList = getActiveSourceList();
      const qLower = state.searchQuery.toLowerCase().trim();

      state.filteredQuestions = rawList.filter((q) => {
        const qType = detectRawQType(q);
        if (qType === "LA") return false;
        if (state.sourceTab === "qmath_bank" && !matchQuestionToSelection(q, state.sel)) return false;
        if (state.typeFilter && qType !== state.typeFilter) return false;

        if (state.levelFilter) {
          const parsed = parseMapIdParts(q.mapId || q.id);
          const lv = q.level || q.Level || (parsed ? parsed.levelName : "");
          if (lv !== state.levelFilter) return false;
        }

        if (qLower) {
          const idStr = String(q.id || q.cccd || q.Id || "").toLowerCase();
          const mapStr = String(q.mapId || "").toLowerCase();
          const cachedFull = fullQuestionCache.get(String(q.id || q.cccd || q.Id || "")) || q;
          const contentStr = String(cachedFull.content || cachedFull.Question || "").toLowerCase();
          if (!idStr.includes(qLower) && !mapStr.includes(qLower) && !contentStr.includes(qLower)) return false;
        }

        return true;
      });

      matchCountEl.textContent = `Có ${state.filteredQuestions.length} câu hỏi`;
      renderQuestionList();

      // Tự động mở xem trước câu hỏi đầu tiên trong danh sách và tải ngầm 12 câu đầu
      if (state.filteredQuestions.length > 0) {
        const firstQ = state.filteredQuestions[0];
        const firstId = String(firstQ.id || firstQ.cccd || firstQ.Id || "");
        if (!state.activePreviewId || !state.filteredQuestions.some((x) => String(x.id || x.cccd || x.Id || "") === state.activePreviewId)) {
          openPreview(firstQ);
        }
        prefetchTopQuestions(state.filteredQuestions.slice(0, 12));
      } else {
        previewEl.innerHTML = `<div class="qmb-preview-empty"><b>Không có câu hỏi nào trong mục này</b></div>`;
        prevActionWrap.innerHTML = "";
      }
    }

    let prefetchTimer = null;
    function prefetchTopQuestions(list) {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(async () => {
        for (const item of list) {
          const qId = String(item.id || item.cccd || item.Id || "");
          if (!qId || fullQuestionCache.has(qId) || item.content || item.Question) continue;
          const full = await fetchFullQuestionDetail(item);
          if (full && (full.content || full.Question)) {
            const snippetEl = qListEl.querySelector(`.qmb-qcard[data-qid="${CSS.escape(qId)}"] .qmb-qsnippet`);
            if (snippetEl) {
              snippetEl.innerHTML = Quiz.rich(full.content || full.Question || "");
              Quiz.typeset(snippetEl);
            }
          }
        }
      }, 80);
    }

    function renderQuestionList() {
      const list = state.filteredQuestions;
      if (!list.length) {
        qListEl.innerHTML = `<div class="qmb-preview-empty" style="height:240px">
          <div style="font-size:32px">📭</div>
          <b>Không tìm thấy câu hỏi phù hợp</b>
          <span style="font-size:12px">Hãy chọn Dạng bài / Bài học khác hoặc xóa bộ lọc tìm kiếm.</span>
        </div>`;
        return;
      }

      const slice = list.slice(0, state.pageLimit);
      let html = "";
      slice.forEach((q, idx) => {
        const qId = String(q.id || q.cccd || q.Id || "");
        const cached = fullQuestionCache.get(qId) || q;
        const qType = detectRawQType(cached);
        const parsed = parseMapIdParts(cached.mapId || qId);
        const lv = cached.level || cached.Level || (parsed ? parsed.levelName : "");
        const isChecked = state.selectedIds.has(qId);
        const isPreview = state.activePreviewId === qId;
        const rawStem = String(cached.content || cached.Question || "").trim();

        const typeLabel = qType === "MC" ? "Trắc nghiệm" : qType === "TF" ? "Đúng/Sai" : "Trả lời ngắn";

        html += `<div class="qmb-qcard ${isChecked ? "selected" : ""} ${isPreview ? "active-preview" : ""}" data-qid="${U.esc(qId)}">
          <input type="checkbox" class="qmb-qcheck" data-checkid="${U.esc(qId)}" ${isChecked ? "checked" : ""} title="Tích chọn câu hỏi này">
          <div class="qmb-qbody">
            <div class="qmb-qmeta">
              <span class="qmb-qnum">Câu ${idx + 1}</span>
              <span class="qmb-qbadge type-${qType}">${typeLabel}</span>
              ${lv ? `<span class="qmb-qbadge lv">${U.esc(lv)}</span>` : ""}
              <span style="font-size:11px;color:#94a3b8;margin-left:auto">#${U.esc(qId)}</span>
            </div>
            <div class="qmb-qsnippet">
              ${rawStem ? Quiz.rich(rawStem) : `<span style="color:#64748b;font-style:italic">Đang tải nội dung câu hỏi...</span>`}
            </div>
          </div>
        </div>`;
      });

      if (list.length > state.pageLimit) {
        html += `<div style="text-align:center;padding:10px">
          <button type="button" class="btn btn-sm btn-ghost" id="qmbLoadMoreBtn">Xem thêm câu hỏi (${state.pageLimit}/${list.length}) ↓</button>
        </div>`;
      }

      qListEl.innerHTML = html;
      Quiz.typeset(qListEl);

      qListEl.querySelectorAll(".qmb-qcard").forEach((card) => {
        const qId = card.getAttribute("data-qid");
        const qObj = slice.find((x) => String(x.id || x.cccd || x.Id || "") === qId);
        const cb = card.querySelector(".qmb-qcheck");

        if (cb) {
          cb.onclick = (e) => {
            e.stopPropagation();
            toggleSelectQuestion(qId, qObj, cb.checked);
            card.classList.toggle("selected", cb.checked);
            if (state.activePreviewId === qId) renderPreviewActionBtn(qId, qObj);
          };
        }

        card.onclick = () => {
          openPreview(qObj);
        };
      });

      const moreBtn = qListEl.querySelector("#qmbLoadMoreBtn");
      if (moreBtn) {
        moreBtn.onclick = () => {
          state.pageLimit += 50;
          renderQuestionList();
        };
      }
    }

    function toggleSelectQuestion(qId, qObj, forceState) {
      const willSelect = forceState !== undefined ? forceState : !state.selectedIds.has(qId);
      if (willSelect) {
        state.selectedIds.add(qId);
        state.selectedMap.set(qId, fullQuestionCache.get(qId) || qObj);
      } else {
        state.selectedIds.delete(qId);
        state.selectedMap.delete(qId);
      }
      updateFooterCount();
    }

    function renderPreviewActionBtn(qId, qObj) {
      if (!prevActionWrap) return;
      const isSel = state.selectedIds.has(qId);
      prevActionWrap.innerHTML = `<button type="button" class="btn btn-sm ${isSel ? "btn-ghost" : "btn-primary"}" id="qmbTogglePreviewSelBtn">
        ${isSel ? "✓ Đã chọn câu này (Bấm để bỏ)" : "+ Chọn câu hỏi này"}
      </button>`;
      const btn = prevActionWrap.querySelector("#qmbTogglePreviewSelBtn");
      if (btn) {
        btn.onclick = () => {
          toggleSelectQuestion(qId, qObj);
          renderPreviewActionBtn(qId, qObj);
          const card = qListEl.querySelector(`.qmb-qcard[data-qid="${CSS.escape(qId)}"]`);
          if (card) {
            card.classList.toggle("selected", state.selectedIds.has(qId));
            const cb = card.querySelector(".qmb-qcheck");
            if (cb) cb.checked = state.selectedIds.has(qId);
          }
        };
      }
    }

    /* ---------- Hiển thị Xem trước chi tiết câu hỏi (Chuẩn trang Edit đề thi exam-editor.html) ---------- */
    async function openPreview(qObj) {
      if (!qObj) return;
      const qId = String(qObj.id || qObj.cccd || qObj.Id || "");
      state.activePreviewId = qId;

      qListEl.querySelectorAll(".qmb-qcard").forEach((c) => {
        c.classList.toggle("active-preview", c.getAttribute("data-qid") === qId);
      });

      renderPreviewActionBtn(qId, qObj);
      previewEl.innerHTML = `<div class="qmb-preview-empty"><div class="spin"></div><b>Đang tải nội dung câu hỏi #${U.esc(qId)}...</b></div>`;

      const full = await fetchFullQuestionDetail(qObj);
      if (state.selectedIds.has(qId)) {
        state.selectedMap.set(qId, full);
      }

      const snippetEl = qListEl.querySelector(`.qmb-qcard[data-qid="${CSS.escape(qId)}"] .qmb-qsnippet`);
      if (snippetEl && (full.content || full.Question)) {
        snippetEl.innerHTML = Quiz.rich(full.content || full.Question || "");
        Quiz.typeset(snippetEl);
      }

      const converted = convertQMathQuestionToGameFormat(full);
      const stem = String(full.content || full.Question || "").trim();
      const explain = String(full.solution || full.Explain || "").trim();
      const qType = converted ? Quiz.baseType(converted.Type) : detectRawQType(full);
      const parsed = parseMapIdParts(full.mapId || qId);
      const lv = full.level || full.Level || (parsed ? parsed.levelName : "Thông hiểu");

      let optionsHtml = "";
      if (qType === "MC") {
        const opts = (converted && converted.Options) || {};
        const ans = (converted && converted.CorrectAnswer) || "A";
        optionsHtml = `<div class="qmb-prev-opts">` + ["A", "B", "C", "D", "E", "F"].filter((k) => opts[k] != null).map((k) => {
          const isRight = k === ans;
          return `<div class="qmb-prev-opt ${isRight ? "correct" : ""}">
            <span class="qmb-opt-key">${k}</span>
            <div class="qmb-opt-tx">${Quiz.rich(opts[k])}</div>
            ${isRight ? `<span style="margin-left:auto;color:#15803d;font-weight:800;font-size:12px;flex-shrink:0">✓ Đáp án đúng</span>` : ""}
          </div>`;
        }).join("") + `</div>`;
      } else if (qType === "TF") {
        const opts = (converted && converted.Options) || {};
        const ans = String((converted && converted.CorrectAnswer) || "ĐSĐS");
        optionsHtml = `<div class="qmb-prev-opts">` + ["a", "b", "c", "d"].filter((k) => opts[k] != null).map((k, idx) => {
          const isTrue = ans[idx] === "Đ" || ans[idx] === "D";
          return `<div class="qmb-prev-opt ${isTrue ? "correct" : ""}">
            <span class="qmb-opt-key">${k})</span>
            <div class="qmb-opt-tx" style="flex:1">${Quiz.rich(opts[k])}</div>
            <span class="qmb-qbadge" style="background:${isTrue ? "#dcfce7" : "#fee2e2"};color:${isTrue ? "#15803d" : "#b91c1c"};margin-left:auto;flex-shrink:0">${isTrue ? "ĐÚNG" : "SAI"}</span>
          </div>`;
        }).join("") + `</div>`;
      } else if (qType === "SA") {
        const ans = (converted && converted.CorrectAnswer) || full.answer || full.correctAnswer || "";
        optionsHtml = `<div style="padding:12px 14px;border-radius:10px;background:#eff6ff;border:1.5px solid #93c5fd;color:#1e3a8a;font-weight:800;margin-bottom:14px">
          🔑 Đáp án điền số / trả lời ngắn: <span style="font-size:16px;text-decoration:underline">${U.esc(String(ans))}</span>
        </div>`;
      }

      previewEl.innerHTML = `<div class="qmb-prev-card">
        <div class="qmb-qmeta" style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9">
          <span class="qmb-qbadge type-${qType}">${Quiz.TYPES[qType] || qType}</span>
          ${lv ? `<span class="qmb-qbadge lv">${U.esc(lv)}</span>` : ""}
          ${full.mapId ? `<span class="qmb-qbadge" style="background:#f1f5f9;color:#475569">Mã bài: ${U.esc(full.mapId)}</span>` : ""}
          <span style="font-size:12px;color:#64748b;margin-left:auto">ID: #${U.esc(qId)}</span>
        </div>
        <div class="qmb-prev-stem">${stem ? Quiz.rich(stem) : "<i>Không có nội dung đề bài</i>"}</div>
        ${optionsHtml}
        ${explain ? `<div class="qmb-prev-sol">
          <b>💡 Lời giải chi tiết:</b>
          <div>${Quiz.rich(explain)}</div>
        </div>` : ""}
      </div>`;

      Quiz.typeset(previewEl);
    }

    /* ---------- Xác nhận đưa các câu hỏi đã chọn vào Game ---------- */
    async function confirmSelection(modalObj) {
      const ids = Array.from(state.selectedIds);
      if (confirmBtnEl) {
        confirmBtnEl.disabled = true;
        confirmBtnEl.innerHTML = `<span class="spin"></span> Đang tải ${ids.length} câu hỏi...`;
      }

      const rawItems = ids.map((id) => state.selectedMap.get(id)).filter(Boolean);
      const fullItems = [];
      const concurrency = 8;
      let cursor = 0;

      async function worker() {
        while (cursor < rawItems.length) {
          const idx = cursor++;
          const full = await fetchFullQuestionDetail(rawItems[idx]);
          if (full) fullItems[idx] = full;
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, rawItems.length) }, () => worker()));

      const playableList = fullItems
        .map((item) => convertQMathQuestionToGameFormat(item))
        .filter(Boolean);

      if (!playableList.length) {
        if (confirmBtnEl) {
          confirmBtnEl.disabled = false;
          updateFooterCount();
        }
        U.toast("Các câu hỏi đã chọn không có phương án trắc nghiệm / trả lời ngắn hợp lệ cho Game!", "err", 4000);
        return;
      }

      modalObj.close();
      if (typeof onConfirm === "function") {
        onConfirm(playableList);
      } else {
        DB.useLocalFile(playableList);
        U.toast(`🎉 Đã nạp ${playableList.length} câu hỏi từ Ngân hàng QMath vào bộ câu hỏi hiện tại!`, "ok", 4000);
      }
    }

    /* ---------- Sự kiện tìm kiếm & bộ lọc ---------- */
    body.querySelector("#qmbSearchInp").addEventListener("input", U.debounce((e) => {
      state.searchQuery = e.target.value;
      state.pageLimit = 50;
      applyFiltersAndRenderList();
    }, 200));

    body.querySelector("#qmbTypeSel").onchange = (e) => {
      state.typeFilter = e.target.value;
      state.pageLimit = 50;
      applyFiltersAndRenderList();
    };

    body.querySelector("#qmbLevelSel").onchange = (e) => {
      state.levelFilter = e.target.value;
      state.pageLimit = 50;
      applyFiltersAndRenderList();
    };

    body.querySelector("#qmbSelectPageBtn").onclick = () => {
      const slice = state.filteredQuestions.slice(0, state.pageLimit);
      slice.forEach((q) => {
        const qId = String(q.id || q.cccd || q.Id || "");
        state.selectedIds.add(qId);
        state.selectedMap.set(qId, fullQuestionCache.get(qId) || q);
      });
      updateFooterCount();
      renderQuestionList();
      if (state.activePreviewId) {
        const curObj = slice.find((x) => String(x.id || x.cccd || x.Id || "") === state.activePreviewId);
        if (curObj) renderPreviewActionBtn(state.activePreviewId, curObj);
      }
      U.toast(`Đã chọn ${slice.length} câu hỏi trong danh sách hiện tại!`, "ok", 1800);
    };

    body.querySelector("#qmbClearSelBtn").onclick = () => {
      state.selectedIds.clear();
      state.selectedMap.clear();
      updateFooterCount();
      renderQuestionList();
      if (state.activePreviewId) renderPreviewActionBtn(state.activePreviewId, null);
    };

    body.querySelectorAll(".qmb-src-tab").forEach((tabBtn) => {
      tabBtn.onclick = () => {
        body.querySelectorAll(".qmb-src-tab").forEach((b) => b.classList.toggle("on", b === tabBtn));
        state.sourceTab = tabBtn.getAttribute("data-src");
        state.pageLimit = 50;
        renderStage();
      };
    });

    /* ---------- Khởi tạo dữ liệu ban đầu ---------- */
    wizardStageEl.innerHTML = `<div class="qmb-preview-empty" style="height:360px"><div class="spin"></div><b>Đang kết nối Kho Ngân hàng câu hỏi QMath...</b></div>`;
    await QB.init();
    const [rawTree, bankQuestions] = await Promise.all([loadMapIdTree(), loadQMathBankCatalog()]);
    state.enrichedTree = buildEnrichedKnowledgeTree(rawTree, bankQuestions);
    renderStage();
  };

  /* ---------- 7. Gắn thanh công cụ Ngân hàng QMath + Word (.docx) + Hạn mức vào màn hình Cấu hình mọi Game ---------- */
  function enhanceGameSetupScreen() {
    if (!window.GameKit || typeof GameKit.page !== "function" || GameKit._qmathEnhanced) return;
    GameKit._qmathEnhanced = true;

    const origPage = GameKit.page;
    GameKit.page = async function (view, gameId) {
      const cleanup = await origPage.call(this, view, gameId);
      try {
        injectQMathToolsIntoGameSetup(view, gameId);
      } catch (e) {
        console.warn("[QMathBridge] Lỗi gắn công cụ vào GameSetup:", e);
      }
      return cleanup;
    };
  }

  function injectQMathToolsIntoGameSetup(view, gameId) {
    const g = window.Games && Games.get(gameId);
    const setupGrid = view.querySelector(".setup-grid");
    if (!g || !setupGrid || view.querySelector("#qmPickBankBtn")) return;

    const bannerHost = U.h(`<div></div>`);
    setupGrid.parentNode.insertBefore(bannerHost, setupGrid);
    QB.renderSetupQuotaBanner(bannerHost, g.name);

    const srcSelect = view.querySelector("#sSrc");
    const fileBox = view.querySelector("#sFileBox");
    const fileInput = view.querySelector("#sFile");

    if (srcSelect && srcSelect.parentElement) {
      const fieldEl = srcSelect.parentElement;
      const quickBar = U.h(`<div>
        <div class="qm-src-toolbar">
          <button type="button" class="qm-src-card bank-card" id="qmPickFromBankBtn">
            <div class="qm-src-ic">📚</div>
            <div class="qm-src-txt">
              <b>Chọn từ Ngân hàng câu hỏi QMath</b>
              <small>Chọn Lớp ➔ Phân môn ➔ Bài ➔ Dạng bài & Xem trước</small>
            </div>
          </button>
          <button type="button" class="qm-src-card word-card" id="qmUploadWordQuickBtn">
            <div class="qm-src-ic">📄</div>
            <div class="qm-src-txt">
              <b>Tải đề từ Word (.docx) / LaTeX (.tex)</b>
              <small>Nhận diện công thức MathType, LaTeX ex_test &amp; hình ảnh</small>
            </div>
          </button>
        </div>
        <div class="qm-word-help-row">
          <span>💡 <b>Mẹo đưa file Word (.docx) &amp; LaTeX (.tex) lên Game:</b> Hỗ trợ công thức MathType, LaTeX <code>ex_test</code>, hình vẽ &amp; gạch chân đáp án đúng.</span>
          <button type="button" class="qm-link-btn" id="qmOpenWordGuideBtn">📘 Xem hướng dẫn chuẩn (.docx / .tex) &amp; Tải mẫu</button>
        </div>
      </div>`);

      fieldEl.parentNode.insertBefore(quickBar, fieldEl.nextSibling);

      const applyCustomQuestionsToSetup = (questions, sourceLabel) => {
        DB.useLocalFile(questions);
        if (!srcSelect.querySelector('option[value="__qmath_picked"]')) {
          const opt = document.createElement("option");
          opt.value = "__qmath_picked";
          srcSelect.insertBefore(opt, srcSelect.firstChild);
        }
        const opt = srcSelect.querySelector('option[value="__qmath_picked"]');
        const playableCount = Quiz.countPlayable(questions);
        opt.textContent = `✅ Đã chọn: ${sourceLabel} (${playableCount} câu chơi được)`;
        srcSelect.value = "__qmath_picked";
        if (fileBox) fileBox.classList.add("hide");

        const cntB = view.querySelector("#sCnt");
        const maxEl = view.querySelector("#sMax");
        if (cntB) cntB.textContent = playableCount;
        if (maxEl && playableCount > 0) {
          maxEl.max = Math.max(5, playableCount);
          if (+maxEl.value > playableCount) maxEl.value = playableCount;
          maxEl.dispatchEvent(new Event("input"));
        }
      };

      const origPool = DB.poolForGame;
      if (!origPool._qmathPatched) {
        const patchedPool = function (gid, setId) {
          if (setId === "__qmath_picked") {
            return DB.bank();
          }
          return origPool.call(DB, gid, setId);
        };
        patchedPool._qmathPatched = true;
        DB.poolForGame = patchedPool;
      }

      quickBar.querySelector("#qmPickFromBankBtn").onclick = () => {
        QB.openBankPickerModal({
          targetName: g.name,
          onConfirm: (pickedList) => {
            applyCustomQuestionsToSetup(pickedList, `${pickedList.length} câu từ Ngân hàng QMath`);
            U.toast(`🎉 Đã nạp ${pickedList.length} câu hỏi từ Ngân hàng QMath vào trò chơi "${g.name}"!`, "ok", 3800);
          }
        });
      };

      quickBar.querySelector("#qmUploadWordQuickBtn").onclick = () => {
        srcSelect.value = "__file";
        srcSelect.dispatchEvent(new Event("change"));
        if (fileInput) fileInput.click();
      };

      quickBar.querySelector("#qmOpenWordGuideBtn").onclick = () => {
        QB.openWordGuideModal(() => {
          srcSelect.value = "__file";
          srcSelect.dispatchEvent(new Event("change"));
          if (fileInput) fileInput.click();
        });
      };
    }

    ["#goLocal", "#goPin", "#goSavePreset"].forEach((sel) => {
      const btn = view.querySelector(sel);
      if (!btn || btn._qmathQuotaWrapped) return;
      btn._qmathQuotaWrapped = true;
      const origHandler = btn.onclick;
      btn.onclick = async (e) => {
        if (sel === "#goLocal" || sel === "#goPin") {
          const check = await QB.consumeGameQuota(g.name);
          QB.renderSetupQuotaBanner(bannerHost, g.name);
          if (!check.allowed) return;
        }
        if (typeof origHandler === "function") {
          return origHandler.call(btn, e);
        }
      };
    });
  }

  /* ---------- 8. Gắn sự kiện cho nút trên Trang chủ & Trang Quản trị ---------- */
  function observeViewsForQMathButtons() {
    document.addEventListener("click", (e) => {
      const bankBtn = e.target.closest("#homeOpenBankPicker, #admOpenQMathBank");
      if (bankBtn) {
        e.preventDefault();
        QB.openBankPickerModal({
          targetName: "Bộ câu hỏi Trò chơi",
          onConfirm: async (pickedList) => {
            DB.useLocalFile(pickedList);
            U.toast(`🎉 Đã nạp ${pickedList.length} câu hỏi từ Ngân hàng QMath! Hãy chọn trò chơi để bắt đầu.`, "ok", 4000);
            if (window.App && typeof App.render === "function") App.render();
          }
        });
        return;
      }

      const guideBtn = e.target.closest("#homeWordGuide, #admWordGuideBtn");
      if (guideBtn) {
        e.preventDefault();
        QB.openWordGuideModal(() => {
          const openLocalBtn = document.querySelector("#openLocal");
          if (openLocalBtn) openLocalBtn.click();
        });
      }
    });
  }

  function bootBridge() {
    QB.init();
    enhanceGameSetupScreen();
    observeViewsForQMathButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootBridge);
  } else {
    bootBridge();
  }

  window.QMathBridge = QB;
})();
