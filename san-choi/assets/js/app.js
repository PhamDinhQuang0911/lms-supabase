/* =========================================================
   app.js — Khung ứng dụng: router, menu hamburger, theme,
   đăng nhập, khởi động.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const App = { routes: [], cleanup: null };
  window.App = App;
  const desktop = () => matchMedia("(min-width: 900px)").matches;

  Games.comingSoon([]);

  /* ---------------- Router ---------------- */
  App.route = (pattern, fn, o) => {
    const keys = []; const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    App.routes.push(Object.assign({ re, keys, fn, pattern }, o || {}));
  };
  App.go = (p) => { if (location.hash === "#" + p) App.render(); else location.hash = "#" + p; };
  App.path = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];
  App.query = () => { const q = {}; const qs = location.hash.split("?")[1] || ""; qs.split("&").forEach((kv) => { if (!kv) return; const [k, v] = kv.split("="); q[decodeURIComponent(k)] = decodeURIComponent(v || "1"); }); return q; };
  App.render = async () => {
    const path = App.path();
    if (App.cleanup) { try { App.cleanup(); } catch (e) { console.error(e); } App.cleanup = null; }
    U.resetReveal();
    let r = null, params = {};
    for (const x of App.routes) { const m = path.match(x.re); if (m) { r = x; x.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; } }
    const view = $("#view");
    $("#main").scrollTop = 0;
    if (!r) { view.innerHTML = `<div class="page"><div class="empty"><span class="em-ic">🧭</span><h2>Không tìm thấy trang</h2><a class="btn btn-primary" href="#/">Về trang chủ</a></div></div>`; return; }
    if (r.admin && !FB.isAdmin) {
      view.innerHTML = `<div class="page"><div class="empty"><span class="em-ic">🔐</span><h2>Khu vực dành cho quản trị viên</h2><p>Vui lòng đăng nhập bằng tài khoản quản trị.</p><button class="btn btn-primary" id="lg">Đăng nhập</button></div></div>`;
      $("#lg", view).onclick = () => App.openAuth();
      setCrumb("Quản trị"); markNav(path); return;
    }
    setCrumb(typeof r.title === "function" ? r.title(params) : r.title || "");
    markNav(path);
    if (!desktop()) document.body.classList.remove("m-open");
    try { App.cleanup = (await r.fn(view, params)) || null; } catch (e) { console.error(e); view.innerHTML = `<div class="page"><div class="notice">⛔ Lỗi: ${esc(e.message)}</div></div>`; }
  };
  function setCrumb(t) { $("#crumb").textContent = t || ""; document.title = (t ? t + " · " : "") + DB.settings.siteName; }
  function markNav(path) { $$(".nav-item[data-href]").forEach((a) => a.classList.toggle("active", a.dataset.href === path || (a.dataset.href !== "/" && path.startsWith(a.dataset.href + "/") && !a.dataset.exact))); }

  /* ---------------- Khi vào / ra màn chơi ---------------- */
  let wasOpen = null;
  App.enterGame = (on) => {
    const b = document.body;
    if (on) U.Music.start(); else { U.Music.stop(); const sp = document.querySelector(".snd-pop"); if (sp) sp.remove(); }
    if (on && !b.classList.contains("in-game")) { b.classList.add("in-game"); if (desktop()) { wasOpen = b.classList.contains("drawer-open"); b.classList.remove("drawer-open"); } }
    else if (!on && b.classList.contains("in-game")) { b.classList.remove("in-game"); if (desktop() && wasOpen) b.classList.add("drawer-open"); wasOpen = null; }
  };

  /* ---------------- Menu hamburger ---------------- */
  App.buildDrawer = () => {
    if (window.FB && typeof FB.readLmsUser === "function" && !FB.user) {
      const lmsU = FB.readLmsUser();
      if (lmsU) {
        FB.user = lmsU;
        FB.isAdmin = FB.checkAdmin(lmsU);
      }
    }
    let i = 0; const n = () => i++;
    const item = (href, ic, tx, o) => `<a class="nav-item" href="#${href}" data-href="${href}" ${o && o.exact ? 'data-exact="1"' : ""} title="${esc(tx)}" style="--i:${n()}"><span class="ni-ic">${ic}</span><span class="ni-tx">${esc(tx)}</span>${o && o.badge ? `<span class="ni-badge">${o.badge}</span>` : ""}</a>`;
    const sec = (t) => `<div class="nav-sec" style="--i:${n()}">${t}</div>`;
    let html = sec("Khám phá") + item("/", "🏠", "Trang chủ", { exact: true }) + item("/join", "🔢", "Vào phòng bằng PIN") + item("/bang-vang", "🏆", "Bảng vàng");
    html += sec("Trò chơi");
    Games.enabled().forEach((g) => (html += item("/game/" + g.id, g.icon, g.name, { badge: g.modes.includes("online") ? "Online" : "" })));
    Games.soon.forEach((s) => (html += `<div class="nav-item disabled" title="${esc(s.name)} — sắp ra mắt" style="--i:${n()}"><span class="ni-ic">${s.icon}</span><span class="ni-tx">${esc(s.name)}</span><span class="ni-badge soon">Sắp có</span></div>`));
    if (window.Activities && Activities.list.length) {
      html += sec("Hoạt động");
      Activities.list.forEach((a) => (html += item("/hoat-dong/" + a.id, a.icon, a.name, { badge: "Vui" })));
    }
    if (FB.isAdmin) {
      html += sec("Quản trị");
      [["/admin", "📊", "Tổng quan"], ["/admin/questions", "📚", "Ngân hàng câu hỏi"], ["/admin/sets", "🧩", "Bộ đề & phân bổ game"], ["/admin/presets", "💾", "Cấu hình soạn sẵn"], ["/admin/scores", "🏅", "Điểm số người chơi"], ["/admin/rooms", "📡", "Phòng trực tuyến"], ["/admin/users", "👥", "Người dùng"], ["/admin/settings", "⚙️", "Cài đặt"]]
        .forEach(([hr, ic, tx]) => (html += item(hr, ic, tx, { exact: hr === "/admin" })));
    }
    $("#navList").innerHTML = html;
    const u = FB.user;
    const roleLabel = u ? (u.role === "super_admin" ? "👑 Super Admin QMath" : FB.isAdmin ? "🏫 Giáo viên QMath" : esc(u.email || "Học sinh QMath")) : "";
    $("#drawerFoot").innerHTML = u
      ? `<div class="user-card">${avatar(u, 34)}<div class="uc-tx"><b>${esc(FB.name())}</b><small>${roleLabel}</small></div><a class="btn btn-sm btn-icon btn-ghost uc-out" href="../dashboard.html" title="Về Bảng điều khiển QMath LMS">🏫</a></div>`
      : `<a class="nav-item" href="../index.html" title="Đăng nhập trên QMath LMS" style="--i:${n()}"><span class="ni-ic">🏫</span><span class="ni-tx">Đăng nhập LMS</span></a>`;
    $("#tbUser").innerHTML = u
      ? `<span class="tb-btn" style="padding-left:5px;gap:7px">${avatar(u, 22)} <span class="hide-sm">${esc(FB.name())}</span></span>`
      : `<span class="tb-btn">🏫 <span class="hide-sm">Tài khoản LMS</span></span>`;
    markNav(App.path());
    if (App.refreshSearch) App.refreshSearch();
  };
  function avatar(u, s) {
    return u.photoURL ? `<img class="ava" src="${esc(u.photoURL)}" referrerpolicy="no-referrer" style="width:${s}px;height:${s}px" alt="">` : `<span class="ava" style="width:${s}px;height:${s}px">${esc((FB.name() || "?").charAt(0).toUpperCase())}</span>`;
  }
  /* ---------------- Áp dụng cấu hình Theme & Nút bấm ---------------- */
  App.applyThemeConfig = () => {
    const th = (window.APP_CONFIG && APP_CONFIG.theme) || {};
    const root = document.documentElement;
    if (th.primary) {
      root.style.setProperty("--primary", th.primary);
      root.style.setProperty("--violet", th.primary);
    }
    if (th.primaryDark) {
      root.style.setProperty("--primary-2", th.primaryDark);
    }
    if (th.primaryDeep) {
      root.style.setProperty("--primary-3", th.primaryDeep);
      root.style.setProperty("--btn-3d-shadow", th.primaryDeep);
    }
    if (th.primaryLight) {
      root.style.setProperty("--primary-light", th.primaryLight);
    }
    if (th.primarySoft) {
      root.style.setProperty("--primary-soft", th.primarySoft);
    }
    if (th.btnRadius) {
      root.style.setProperty("--btn-radius", th.btnRadius);
    }
    if (th.primary && th.primaryDark) {
      root.style.setProperty("--btn-primary-bg", `linear-gradient(135deg, ${th.primary}, ${th.primaryDark})`);
      root.style.setProperty("--hero-1", th.primary);
      root.style.setProperty("--hero-2", th.primaryDark);
    }
    if (th.primaryLight && th.accent) {
      root.style.setProperty("--btn-fun-bg", `linear-gradient(135deg, ${th.primaryLight}, ${th.accent})`);
      root.style.setProperty("--hero-3", th.accent);
    }
    if (th.btnTextColor) {
      root.style.setProperty("--btn-primary-fg", th.btnTextColor);
    }
    if (th.btnShadow) {
      root.style.setProperty("--btn-primary-shadow", th.btnShadow);
    }
  };

  App.applyBrand = () => { $(".brand-tx").textContent = DB.settings.siteName; };

  /* ---------------- Tìm kiếm nhanh trong menu ---------------- */
  function setupSearch() {
    const inp = $("#navSearch"), ic = $("#navSearchIc"), clr = $("#navSearchClear");
    if (!inp) return;
    const openDrawer = () => { if (desktop()) { if (!document.body.classList.contains("drawer-open")) { document.body.classList.add("drawer-open"); U.store.set("drawerOpen", true); } } else document.body.classList.add("m-open"); };
    ic.onclick = () => { openDrawer(); setTimeout(() => inp.focus(), 120); };
    const apply = () => {
      const q = U.norm(inp.value.trim());
      document.body.classList.toggle("searching", !!q);
      const items = $$("#navList .nav-item");
      let any = false;
      items.forEach((el) => {
        const tx = U.norm(el.textContent);
        const hit = !q || tx.includes(q);
        el.classList.toggle("s-hide", !!q && !hit);
        if (hit && q) any = true;
      });
      // ẩn tiêu đề nhóm không còn mục nào
      $$("#navList .nav-sec").forEach((s) => {
        let has = false, e = s.nextElementSibling;
        while (e && !e.classList.contains("nav-sec")) { if (e.classList.contains("nav-item") && !e.classList.contains("s-hide")) { has = true; break; } e = e.nextElementSibling; }
        s.classList.toggle("s-hide", !!q && !has);
      });
      let none = $("#navNone");
      if (q && !any) { if (!none) { none = U.h(`<div class="nav-none" id="navNone">🔍 Không tìm thấy “<b></b>”</div>`); $("#navList").appendChild(none); } $("b", none).textContent = inp.value.trim(); none.classList.remove("s-hide"); }
      else if (none) none.classList.add("s-hide");
      clr.classList.toggle("show", !!inp.value);
    };
    inp.addEventListener("input", apply);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { inp.value = ""; apply(); inp.blur(); }
      if (e.key === "Enter") { const first = $$("#navList .nav-item:not(.s-hide)[data-href]")[0]; if (first) { App.go(first.dataset.href.replace(/^#/, "")); inp.value = ""; apply(); if (!desktop()) document.body.classList.remove("m-open"); } }
    });
    clr.onclick = () => { inp.value = ""; apply(); inp.focus(); };
  }
  App.refreshSearch = () => { const inp = $("#navSearch"); if (inp && inp.value) inp.dispatchEvent(new Event("input")); };

  /* ---------------- Đăng nhập / Tài khoản QMath LMS ---------------- */
  App.openAuth = () => {
    if (window.FB && typeof FB.readLmsUser === "function" && !FB.user) {
      const lmsU = FB.readLmsUser();
      if (lmsU) {
        FB.user = lmsU;
        FB.isAdmin = FB.checkAdmin(lmsU);
      }
    }
    if (FB.user) {
      const u = FB.user;
      const st = window.QMathBridge && typeof QMathBridge.getQuotaStatus === "function" ? QMathBridge.getQuotaStatus() : null;
      const tierBadge = st
        ? st.isSuper
          ? "👑 Root Super Admin (Tạo Game không giới hạn)"
          : st.isVip
            ? "👑 Giáo viên VIP (Tạo Game không giới hạn)"
            : `🎁 Giáo viên Free (Đã dùng ${st.used}/${st.max} lượt tạo game trong tháng)`
        : (FB.isAdmin ? "🏫 Giáo viên QMath" : "Học sinh QMath");
      return U.modal({
        title: "🏫 Tài khoản QMath LMS",
        size: "sm",
        body: `<div style="text-align:center">${avatar(u, 68).replace('class="ava"', 'class="ava" style="width:68px;height:68px;margin:0 auto 10px;font-size:26px"')}<h3>${esc(FB.name())}</h3><p class="muted" style="line-height:1.6">${esc(u.email || "")}<br><b>${tierBadge}</b></p></div>`,
        actions: [
          { label: "Đóng", cls: "btn-ghost" },
          {
            label: "🏫 Về Bảng điều khiển QMath LMS",
            cls: "btn-primary",
            onClick: () => {
              window.location.href = "../dashboard.html";
              return true;
            }
          }
        ]
      });
    }
    // Nếu chưa đăng nhập trên web LMS thì chuyển thẳng sang trang đăng nhập QMath LMS
    window.location.href = "../index.html";
  };

  /* ---------------- Theme ---------------- */
  App.setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    U.store.set("theme", t);
    try { localStorage.setItem("gfe_theme_raw", t); } catch (e) { }
    const primary = (window.APP_CONFIG && APP_CONFIG.theme && APP_CONFIG.theme.primary) || "#f59e0b";
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#12100e" : primary;
  };

  /* ---------------- Routes ---------------- */
  App.route("/", (v) => HomePage(v), { title: "Trang chủ" });
  App.route("/game/:id", (v, p) => GameKit.page(v, p.id), { title: (p) => (Games.get(p.id) || {}).name || "Trò chơi" });
  App.route("/hoat-dong/:id", (v, p) => {
    const a = window.Activities && Activities.get(p.id);
    if (!a) { v.innerHTML = `<div class="page"><div class="empty"><span class="em-ic">🕵️</span><h2>Không tìm thấy hoạt động</h2><a class="btn btn-primary" href="#/">Về trang chủ</a></div></div>`; return; }
    return a.mount(v);
  }, { title: (p) => ((window.Activities && Activities.get(p.id)) || {}).name || "Hoạt động" });
  App.route("/join", (v) => PlayerPage(v), { title: "Vào phòng" });
  App.route("/join/:pin", (v, p) => PlayerPage(v, p.pin), { title: (p) => "Phòng " + p.pin });
  App.route("/bang-vang", (v) => LeaderboardPage(v), { title: "Bảng vàng" });
  App.route("/admin", (v) => Admin.dashboard(v), { title: "Quản trị", admin: true });
  App.route("/admin/questions", (v) => Admin.questions(v), { title: "Ngân hàng câu hỏi", admin: true });
  App.route("/admin/sets", (v) => Admin.sets(v), { title: "Bộ đề & phân bổ", admin: true });
  App.route("/admin/presets", (v) => Admin.presets(v), { title: "Cấu hình soạn sẵn", admin: true });
  App.route("/admin/scores", (v) => Admin.scores(v), { title: "Điểm số", admin: true });
  App.route("/admin/rooms", (v) => Admin.rooms(v), { title: "Phòng trực tuyến", admin: true });
  App.route("/admin/users", (v) => Admin.users(v), { title: "Người dùng", admin: true });
  App.route("/admin/settings", (v) => Admin.settings(v), { title: "Cài đặt", admin: true });

  /* ---------------- Khởi động ---------------- */
  async function boot() {
    App.applyThemeConfig();
    // trạng thái menu
    const pref = U.store.get("drawerOpen", null);
    if (desktop() && (pref === null ? innerWidth >= 1280 : pref)) document.body.classList.add("drawer-open");
    $("#hb").onclick = () => {
      U.Sound.click();
      if (desktop()) { const o = document.body.classList.toggle("drawer-open"); U.store.set("drawerOpen", o); if (document.body.classList.contains("in-game")) wasOpen = o; }
      else document.body.classList.toggle("m-open");
    };
    $("#backdrop").onclick = () => document.body.classList.remove("m-open");
    $("#navList").addEventListener("click", (e) => { if (e.target.closest("a") && !desktop()) document.body.classList.remove("m-open"); });
    setupSearch();
    $("#themeSw").onclick = () => { App.setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); U.Sound.pop(); };
    $("#tbJoin").onclick = () => App.go("/join");
    $("#tbFs").onclick = () => U.fullscreen();
    $("#tbUser").onclick = () => App.openAuth();
    addEventListener("online", () => ($("#netBadge").classList.add("hide")));
    addEventListener("offline", () => ($("#netBadge").classList.remove("hide")));
    if (navigator.onLine === false) $("#netBadge").classList.remove("hide");
    App.setTheme(document.documentElement.dataset.theme || "light");

    App.buildDrawer();
    await FB.init();
    Room.init();
    await DB.load();
    App.applyBrand(); App.buildDrawer();
    let firstAuth = true;
    FB.onAuth(() => {
      App.buildDrawer();
      if (firstAuth) { firstAuth = false; return; }
      if (App.path().startsWith("/admin") || App.path() === "/") App.render();
      if (FB.isAdmin) U.toast("👑 Xin chào quản trị viên!", "ok");
    });
    firstAuth = false;
    DB.onChange(() => App.buildDrawer());
    addEventListener("hashchange", App.render);
    $("#splash").classList.add("out"); setTimeout(() => $("#splash").remove(), 600);
    App.render();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
