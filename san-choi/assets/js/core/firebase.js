/* =========================================================
   firebase.js — Khởi tạo Firebase (compat SDK) & Tự động đồng bộ
   phiên đăng nhập từ QMath LMS (không cần đăng nhập lại).
   ========================================================= */
(function () {
  const C = window.APP_CONFIG || {};
  const LMS_AUTH_KEY = "lms_supabase_current_user";
  const ROOT_ADMINS = [
    "phamdinhquang0911@gmail.com",
    "phamngockhanh.942001@gmail.com",
    "phamngockhanh.942002@gmail.com"
  ];

  function readLmsUser() {
    try {
      const raw = localStorage.getItem(LMS_AUTH_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || !(p.uid || p.id || p.email)) return null;
      const email = String(p.email || "").trim().toLowerCase();
      const role = String(p.role || "teacher").trim().toLowerCase();
      const displayName =
        p.displayName ||
        p.display_name ||
        p.name ||
        p.fullName ||
        (email ? email.split("@")[0] : "Giáo viên QMath");
      return {
        uid: String(p.uid || p.id || email),
        email,
        displayName,
        photoURL: p.photoURL || p.photo_url || "",
        role,
        teacherTier: p.teacherTier || (p.raw_data && p.raw_data.teacherTier) || "",
        emailVerified: true,
        isLmsUser: true,
        providerData: [{ providerId: "qmath-lms" }]
      };
    } catch (e) {
      return null;
    }
  }

  const initialLmsUser = readLmsUser();
  const FB = {
    available: false,
    app: null,
    auth: null,
    fs: null,
    rtdb: null,
    user: initialLmsUser,
    isAdmin: false,
    _subs: [],
    ready: null,
    readLmsUser
  };

  FB.checkAdmin = (u) => {
    if (!u) return false;
    const em = String(u.email || "").toLowerCase().trim();
    if (ROOT_ADMINS.includes(em)) return true;
    if (u.isLmsUser) {
      const r = String(u.role || "").toLowerCase();
      if (["super_admin", "sub_admin", "admin", "teacher", "teacher_free"].includes(r)) {
        return true;
      }
      // Nếu đăng nhập từ trang Giáo viên QMath mà role chưa ghi rõ student thì mặc định cho phép quản lý game
      if (r !== "student") return true;
    }
    const isListed = (C.adminEmails || []).map((x) => x.toLowerCase()).includes(em);
    const viaGoogle = (u.providerData || []).some((p) => p.providerId === "google.com" || p.providerId === "qmath-lms");
    return isListed && (u.emailVerified || viaGoogle);
  };

  FB.isAdmin = FB.checkAdmin(FB.user);

  FB.syncLmsAuth = () => {
    const lmsU = readLmsUser();
    if (lmsU) {
      FB.user = lmsU;
      FB.isAdmin = FB.checkAdmin(lmsU);
      FB._subs.forEach((f) => {
        try { f(FB.user); } catch (e) { console.error(e); }
      });
    }
    return FB.user;
  };

  window.addEventListener("storage", (e) => {
    if (e.key === LMS_AUTH_KEY) FB.syncLmsAuth();
  });

  FB.init = () => {
    if (FB.ready) return FB.ready;
    FB.ready = new Promise((resolve) => {
      try {
        const lmsNow = readLmsUser();
        if (lmsNow) {
          FB.user = lmsNow;
          FB.isAdmin = FB.checkAdmin(lmsNow);
        }
        if (!window.firebase || !firebase.initializeApp) throw new Error("no sdk");
        FB.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(C.firebase);
        FB.auth = firebase.auth();
        FB.fs = firebase.firestore();
        try { FB.fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
        try { FB.rtdb = firebase.database(); } catch (e) { FB.rtdb = null; }
        FB.available = true;
        let first = true;
        FB.auth.onAuthStateChanged((firebaseUser) => {
          const activeUser = readLmsUser() || firebaseUser || null;
          FB.user = activeUser;
          FB.isAdmin = FB.checkAdmin(activeUser);
          if (firebaseUser) FB.touchUser(firebaseUser);
          FB._subs.forEach((f) => {
            try { f(activeUser); } catch (e) { console.error(e); }
          });
          if (first) {
            first = false;
            resolve(true);
          }
        });
        setTimeout(() => {
          if (first) {
            first = false;
            const fallbackUser = readLmsUser();
            if (fallbackUser) {
              FB.user = fallbackUser;
              FB.isAdmin = FB.checkAdmin(fallbackUser);
            }
            resolve(true);
          }
        }, 3500);
        FB.auth.getRedirectResult().catch((e) => e && e.code && U.toast(FB.errMsg(e), "err"));
      } catch (e) {
        const fallbackUser = readLmsUser();
        if (fallbackUser) {
          FB.user = fallbackUser;
          FB.isAdmin = FB.checkAdmin(fallbackUser);
        }
        FB.available = false;
        resolve(false);
      }
    });
    return FB.ready;
  };

  FB.onAuth = (fn) => {
    FB._subs.push(fn);
  };

  FB.touchUser = (u) => {
    try {
      if (!FB.fs || !u || !u.uid) return;
      FB.fs.collection("users").doc(u.uid).set({
        email: u.email || "",
        displayName: u.displayName || "",
        photoURL: u.photoURL || "",
        provider: (u.providerData && u.providerData[0] && u.providerData[0].providerId) || "qmath-lms",
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
    } catch (e) {}
  };

  FB.signInGoogle = async () => {
    if (!FB.available) throw new Error("offline");
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try {
      return await FB.auth.signInWithPopup(p);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        return FB.auth.signInWithRedirect(p);
      }
      throw e;
    }
  };
  FB.signInEmail = (email, pw) => FB.auth.signInWithEmailAndPassword(email.trim(), pw);
  FB.register = async (email, pw, name) => {
    const cred = await FB.auth.createUserWithEmailAndPassword(email.trim(), pw);
    if (name) await cred.user.updateProfile({ displayName: name });
    try { await cred.user.sendEmailVerification(); } catch (e) {}
    return cred;
  };
  FB.resetPassword = (email) => FB.auth.sendPasswordResetEmail(email.trim());
  FB.signOut = async () => {
    if (FB.auth && FB.auth.currentUser) {
      await FB.auth.signOut();
    }
    const lmsNow = readLmsUser();
    if (lmsNow) {
      // Nếu đang dùng tài khoản LMS, chuyển về trang chủ LMS thay vì xóa phiên LMS ngoài ý muốn
      window.location.href = "../dashboard.html";
      return;
    }
    FB.user = null;
    FB.isAdmin = false;
    FB._subs.forEach((f) => {
      try { f(null); } catch (e) {}
    });
  };
  FB.ts = () => (FB.available ? firebase.firestore.FieldValue.serverTimestamp() : Date.now());
  FB.name = () => (FB.user ? FB.user.displayName || (FB.user.email || "").split("@")[0] : "Khách");

  FB.errMsg = (e) => {
    const m = {
      "auth/invalid-email": "Email không hợp lệ.",
      "auth/user-not-found": "Không tìm thấy tài khoản.",
      "auth/wrong-password": "Sai mật khẩu.",
      "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
      "auth/invalid-login-credentials": "Email hoặc mật khẩu không đúng.",
      "auth/email-already-in-use": "Email đã được sử dụng.",
      "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.",
      "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập.",
      "auth/network-request-failed": "Lỗi mạng — kiểm tra kết nối Internet.",
      "auth/unauthorized-domain": "Tên miền này chưa được cấp phép trong Firebase Authentication.",
      "auth/operation-not-allowed": "Phương thức đăng nhập chưa được bật.",
      "auth/too-many-requests": "Thử quá nhiều lần, vui lòng đợi một lát.",
      "permission-denied": "Không có quyền thực hiện.",
      "PERMISSION_DENIED": "Không có quyền thực hiện."
    };
    return m[e && e.code] || (e && e.message) || String(e);
  };

  window.FB = FB;
})();
