/* =========================================================
   firebase.js — Khởi tạo Firebase (compat SDK), đăng nhập
   Google + Email/Mật khẩu, xác định quyền Admin.
   ========================================================= */
(function () {
  const C = window.APP_CONFIG;
  const FB = { available: false, app: null, auth: null, fs: null, rtdb: null, user: null, isAdmin: false, _subs: [], ready: null };

  FB.init = () => {
    if (FB.ready) return FB.ready;
    FB.ready = new Promise((resolve) => {
      try {
        if (!window.firebase || !firebase.initializeApp) throw new Error("no sdk");
        FB.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(C.firebase);
        FB.auth = firebase.auth();
        FB.fs = firebase.firestore();
        try { FB.fs.enablePersistence({ synchronizeTabs: true }).catch(() => { }); } catch (e) { }
        try { FB.rtdb = firebase.database(); } catch (e) { FB.rtdb = null; }
        FB.available = true;
        let first = true;
        FB.auth.onAuthStateChanged((u) => {
          FB.user = u;
          FB.isAdmin = FB.checkAdmin(u);
          if (u) FB.touchUser(u);
          FB._subs.forEach((f) => { try { f(u); } catch (e) { console.error(e); } });
          if (first) { first = false; resolve(true); }
        });
        // phòng khi auth không phản hồi (offline)
        setTimeout(() => { if (first) { first = false; resolve(true); } }, 4000);
        FB.auth.getRedirectResult().catch((e) => e && e.code && U.toast(FB.errMsg(e), "err"));
      } catch (e) {
        FB.available = false; resolve(false);
      }
    });
    return FB.ready;
  };

  FB.checkAdmin = (u) => {
    if (!u || !u.email) return false;
    const em = u.email.toLowerCase();
    const isListed = (C.adminEmails || []).map((x) => x.toLowerCase()).includes(em);
    const viaGoogle = (u.providerData || []).some((p) => p.providerId === "google.com");
    return isListed && (u.emailVerified || viaGoogle);
  };
  FB.onAuth = (fn) => { FB._subs.push(fn); };

  FB.touchUser = (u) => {
    try {
      FB.fs.collection("users").doc(u.uid).set({
        email: u.email || "", displayName: u.displayName || "", photoURL: u.photoURL || "",
        provider: (u.providerData[0] && u.providerData[0].providerId) || "",
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => { });
    } catch (e) { }
  };

  FB.signInGoogle = async () => {
    if (!FB.available) throw new Error("offline");
    const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
    try { return await FB.auth.signInWithPopup(p); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return FB.auth.signInWithRedirect(p);
      throw e;
    }
  };
  FB.signInEmail = (email, pw) => FB.auth.signInWithEmailAndPassword(email.trim(), pw);
  FB.register = async (email, pw, name) => {
    const cred = await FB.auth.createUserWithEmailAndPassword(email.trim(), pw);
    if (name) await cred.user.updateProfile({ displayName: name });
    try { await cred.user.sendEmailVerification(); } catch (e) { }
    return cred;
  };
  FB.resetPassword = (email) => FB.auth.sendPasswordResetEmail(email.trim());
  FB.signOut = () => FB.auth && FB.auth.signOut();
  FB.ts = () => FB.available ? firebase.firestore.FieldValue.serverTimestamp() : Date.now();
  FB.name = () => FB.user ? (FB.user.displayName || (FB.user.email || "").split("@")[0]) : "Khách";

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
      "auth/unauthorized-domain": "Tên miền này chưa được cấp phép trong Firebase Authentication → Settings → Authorized domains.",
      "auth/operation-not-allowed": "Phương thức đăng nhập chưa được bật trong Firebase Console.",
      "auth/too-many-requests": "Thử quá nhiều lần, vui lòng đợi một lát.",
      "permission-denied": "Không có quyền thực hiện (kiểm tra Security Rules).",
      "PERMISSION_DENIED": "Không có quyền thực hiện (kiểm tra Security Rules)."
    };
    return m[e && e.code] || (e && e.message) || String(e);
  };

  window.FB = FB;
})();
