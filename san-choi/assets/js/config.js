/* =========================================================
   config.js — Cấu hình chung. Sửa tại đây khi cần.
   ========================================================= */
window.APP_CONFIG = {
  appName: "Sân Chơi Tri Thức",
  slogan: "Học mà chơi — Chơi mà học!",

  /* =========================================================
     CẤU HÌNH MÀU SẮC GIAO DIỆN & NÚT BẤM (BUTTON THEME CONFIG)
     Bạn có thể thay đổi trực tiếp các mã màu tại đây.
     Các bảng màu gợi ý sẵn:
     1. Amber Gold (Hiện tại): primary: "#f59e0b", primaryDark: "#d97706", accent: "#ea580c"
     2. Ocean Blue:            primary: "#0284c7", primaryDark: "#1d4ed8", accent: "#06b6d4"
     3. Emerald Mint:          primary: "#059669", primaryDark: "#047857", accent: "#10b981"
     4. Sunset Coral:          primary: "#f97316", primaryDark: "#dc2626", accent: "#f43f5e"
     5. Cyberpunk:             primary: "#8b5cf6", primaryDark: "#7c3aed", accent: "#ec4899"
     ========================================================= */
  theme: {
    name: "Amber Gold",
    primary: "#f59e0b",                     // Màu chủ đạo vàng hổ phách
    primaryDark: "#d97706",                 // Màu gradient đổ bóng đậm
    primaryDeep: "#b45309",                 // Màu viền 3D & text-shadow
    primaryLight: "#fbbf24",                // Màu highlight khi hover
    primarySoft: "rgba(245, 158, 11, 0.16)",// Nền mềm khi chọn item
    accent: "#ea580c",                      // Màu phụ gradient cho nút fun
    btnTextColor: "#ffffff",                // Màu chữ trên nút bấm
    btnRadius: "12px",                      // Bo tròn góc nút
    btnShadow: "0 8px 22px -6px rgba(217, 119, 6, .75), 0 3px 6px -2px rgba(245, 158, 11, .4)"
  },

  firebase: {
    apiKey: "AIzaSyCm7fRHsKc-NeiV-T7q-vAtecrpX0YpiTA",
    authDomain: "game-for-everyone-d6fcf.firebaseapp.com",
    databaseURL: "https:\/\/game-for-everyone-d6fcf-default-rtdb.firebaseio.com",
    projectId: "game-for-everyone-d6fcf",
    storageBucket: "game-for-everyone-d6fcf.firebasestorage.app",
    messagingSenderId: "183369323037",
    appId: "1:183369323037:web:2e26f2e8e7df03c3896cf4"
  },

  /* Chỉ những email này mới thấy menu "Quản trị".
     (Nhớ sửa đồng bộ trong firebase/firestore.rules và firebase/database.rules.json) */
  adminEmails: ["dungchihappy79@gmail.com"],

  /* Thời gian chờ Firestore trước khi chuyển sang dữ liệu offline (ms) */
  cloudTimeout: 9000
};
