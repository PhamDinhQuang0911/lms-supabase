/* =========================================================
   data.js — Tầng dữ liệu
   Firestore (collections: questions, sets, gameConfigs,
   settings, results, users) + dự phòng offline:
   cache localStorage → data/questions-offline.js → mẫu demo.
   ========================================================= */
(function () {
  const DEFAULT_SETTINGS = {
    siteName: (window.APP_CONFIG && APP_CONFIG.appName) || "Sân Chơi Tri Thức · QMath",
    slogan: (window.APP_CONFIG && APP_CONFIG.slogan) || "Học mà chơi — Chơi mà học!",
    announcement: "", defaultFreeze: 3, defaultGoal: 10, showExplain: true, saveResults: true, allowHostAnyone: true
  };
  function sanitizeSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS, s || {});
    const ann = String(out.announcement || "");
    if (/sở hữu|mã nguồn|liên hệ|0398514851|tích hợp|riêng tư|zalo|sđt|điện thoại|\d{8,11}/i.test(ann)) {
      out.announcement = "";
    }
    if (!out.siteName || /game for everyone/i.test(out.siteName)) {
      out.siteName = DEFAULT_SETTINGS.siteName;
    }
    return out;
  }
  const DB = {
    source: "none", questions: [], sets: [], gameConfigs: {}, presets: [], settings: sanitizeSettings(DEFAULT_SETTINGS),
    loaded: false, _subs: [], usingDemo: false
  };
  const col = (n) => FB.fs.collection(n);
  const docId = (id) => String(id || U.uid()).replace(/[\/\s#\[\]\.]+/g, "_").slice(0, 120);
  const natural = (a, b) => String(a.Id || "").localeCompare(String(b.Id || ""), "vi", { numeric: true });

  DB.onChange = (fn) => DB._subs.push(fn);
  DB.emit = () => DB._subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  DB.cloud = () => FB.available && navigator.onLine !== false && DB.source === "cloud";

  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]); }

  /* ---------- Nạp dữ liệu ---------- */
  DB.load = async (force) => {
    if (DB.loaded && !force) return;
    let ok = false;
    const lf = U.store.get("localFile", null);
    if (lf && lf.questions && lf.questions.length) {
      DB.questions = lf.questions.slice().sort(natural); DB.sets = lf.sets || []; DB.gameConfigs = lf.gameConfigs || {}; DB.presets = lf.presets || [];
      DB.settings = sanitizeSettings(lf.settings || {}); DB.source = "local-file";
      DB.usingDemo = false; DB.loaded = true; DB.emit(); return;
    }
    if (FB.available && navigator.onLine !== false && !U.store.get("forceOffline", false)) {
      try {
        const [qs, ss, gc, st, ps] = await withTimeout(Promise.all([
          col("questions").get(), col("sets").get(), col("gameConfigs").get(), col("settings").doc("site").get(),
          col("presets").get().catch(() => null)   // chưa cập nhật rules thì bỏ qua, không ảnh hưởng phần khác
        ]), APP_CONFIG.cloudTimeout || 9000);
        DB.presets = ps ? ps.docs.map((d) => Object.assign({ id: d.id }, d.data())) : [];
        DB.questions = qs.docs.map((d) => Object.assign({ _doc: d.id }, d.data())).sort(natural);
        DB.sets = ss.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        DB.gameConfigs = {}; gc.docs.forEach((d) => (DB.gameConfigs[d.id] = d.data()));
        DB.settings = sanitizeSettings(st.exists ? st.data() : {});
        DB.source = "cloud"; ok = true;
        U.store.set("cache", { questions: DB.questions, sets: DB.sets, gameConfigs: DB.gameConfigs, settings: DB.settings, presets: DB.presets, at: Date.now() });
      } catch (e) { console.warn("Firestore không khả dụng:", e.message); }
    }
    if (!ok) {
      const cache = U.store.get("cache", null);
      const off = window.OFFLINE_DATA;
      const local = null;
      const pickData = (off && off.questions && off.questions.length ? off : null) || (cache && cache.questions && cache.questions.length ? cache : null);
      if (pickData) {
        DB.questions = (pickData.questions || []).slice().sort(natural); DB.sets = pickData.sets || []; DB.gameConfigs = pickData.gameConfigs || {}; DB.presets = pickData.presets || [];
        DB.settings = sanitizeSettings(pickData.settings || {});
        DB.source = local ? "local-file" : pickData === off ? "offline-file" : "cache";
      } else { DB.source = "demo"; DB.questions = []; }
    }
    DB.usingDemo = !DB.questions.length;
    DB.loaded = true; DB.emit();
  };

  /* Câu hỏi dùng để chơi (nếu ngân hàng trống => câu mẫu) */
  DB.bank = () => DB.questions.length ? DB.questions : (window.DEMO_QUESTIONS || []);
  DB.findQ = (id) => DB.bank().find((q) => q.Id === id || q._doc === id);
  DB.findSet = (id) => DB.sets.find((s) => s.id === id);

  DB.sourceLabel = () => ({
    cloud: "☁️ Firestore", cache: "📦 Bộ nhớ đệm (ngoại tuyến)", "offline-file": "💾 File offline", "local-file": "📂 File từ máy", demo: "🧪 Dữ liệu mẫu", none: "…"
  })[DB.source] + (DB.usingDemo && DB.source !== "demo" ? " · đang dùng câu mẫu" : "");

  /* Các giá trị phân loại để lọc */
  DB.facets = (list) => {
    list = list || DB.bank();
    const f = { Subject: new Set(), Grade: new Set(), Chapter: new Set(), Topic: new Set(), Level: new Set(), Type: new Set() };
    list.forEach((q) => { Object.keys(f).forEach((k) => { if (q[k]) f[k].add(String(q[k])); }); });
    const out = {}; Object.keys(f).forEach((k) => (out[k] = Array.from(f[k]).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }))));
    return out;
  };
  DB.filterQ = (list, flt) => {
    if (!flt) return list;
    const s = flt.search ? U.norm(flt.search) : "";
    return list.filter((q) => {
      for (const k of ["Subject", "Grade", "Chapter", "Topic", "Level"]) if (flt[k] && String(q[k] || "") !== flt[k]) return false;
      if (flt.Type && Quiz.baseType(q.Type) !== flt.Type) return false;
      if (s && !U.norm([q.Id, q.Question, q.Subject, q.Chapter, q.Topic].join(" ")).includes(s)) return false;
      return true;
    });
  };
  DB.resolveSet = (set) => {
    if (!set) return [];
    if (set.questionIds && set.questionIds.length) return set.questionIds.map(DB.findQ).filter(Boolean);
    if (set.filter) return DB.filterQ(DB.bank(), set.filter);
    return [];
  };
  /* Lấy câu hỏi cho một game theo nguồn đã chọn: {kind:'set'|'filter'|'all', setId, filter} */
  DB.questionsFor = (src) => {
    src = src || { kind: "all" };
    if (src.kind === "set") return DB.resolveSet(DB.findSet(src.setId));
    if (src.kind === "filter") return DB.filterQ(DB.bank(), src.filter);
    return DB.bank();
  };

  function needCloud() {
    if (!FB.available) throw new Error("Không kết nối được Firebase.");
    if (!FB.isAdmin) throw new Error("Chỉ quản trị viên mới được thay đổi dữ liệu.");
  }
  function clean(q) { const c = U.plain(q); delete c._doc; delete c._sel; return c; }
  function saveCache() { U.store.set("cache", { questions: DB.questions, sets: DB.sets, gameConfigs: DB.gameConfigs, settings: DB.settings, presets: DB.presets, at: Date.now() }); }

  /* ---------- Câu hỏi ---------- */
  DB.saveQuestion = async (q, oldDoc) => {
    needCloud();
    q = clean(q); if (!q.Id) q.Id = "Q" + U.uid(4).toUpperCase();
    const id = docId(q.Id);
    q.updatedAt = Date.now();
    await col("questions").doc(id).set(q);
    if (oldDoc && oldDoc !== id) await col("questions").doc(oldDoc).delete();
    DB.questions = DB.questions.filter((x) => x._doc !== id && x._doc !== oldDoc);
    DB.questions.push(Object.assign({ _doc: id }, q)); DB.questions.sort(natural);
    DB.usingDemo = false; saveCache(); DB.emit();
  };
  async function batchRun(ops) { // ops: [fn(batch)]
    for (let i = 0; i < ops.length; i += 400) {
      const b = FB.fs.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit();
    }
  }
  DB.deleteQuestions = async (docs) => {
    needCloud();
    await batchRun(docs.map((d) => (b) => b.delete(col("questions").doc(d))));
    DB.questions = DB.questions.filter((q) => !docs.includes(q._doc)); saveCache(); DB.emit();
  };
  DB.bulkUpdate = async (docs, patch) => {
    needCloud();
    const p = {}; Object.keys(patch).forEach((k) => { if (patch[k] !== undefined && patch[k] !== null && patch[k] !== "__keep") p[k] = patch[k]; });
    if (!Object.keys(p).length) return;
    p.updatedAt = Date.now();
    await batchRun(docs.map((d) => (b) => b.set(col("questions").doc(d), p, { merge: true })));
    DB.questions.forEach((q) => { if (docs.includes(q._doc)) Object.assign(q, p); }); saveCache(); DB.emit();
  };
  /* Nhập hàng loạt: trả về {added, updated, skipped} */
  DB.importQuestions = async (list, o) => {
    needCloud(); o = o || {};
    const existing = new Set(DB.questions.map((q) => q._doc));
    let added = 0, updated = 0, skipped = 0; const ops = [];
    list.forEach((raw) => {
      const q = clean(raw); if (!q.Id) q.Id = "Q" + U.uid(5).toUpperCase();
      const id = docId(q.Id);
      if (existing.has(id)) { if (!o.overwrite) { skipped++; return; } updated++; } else added++;
      q.updatedAt = Date.now();
      ops.push((b) => b.set(col("questions").doc(id), q));
      DB.questions = DB.questions.filter((x) => x._doc !== id); DB.questions.push(Object.assign({ _doc: id }, q));
      existing.add(id);
    });
    await batchRun(ops);
    DB.questions.sort(natural); DB.usingDemo = !DB.questions.length; saveCache(); DB.emit();
    return { added, updated, skipped };
  };

  /* ---------- Bộ đề ---------- */
  DB.saveSet = async (set) => {
    needCloud();
    const s = U.plain(set); const id = s.id || "set_" + U.uid(); delete s.id;
    s.updatedAt = Date.now(); if (!s.createdAt) s.createdAt = Date.now();
    await col("sets").doc(id).set(s);
    DB.sets = DB.sets.filter((x) => x.id !== id); DB.sets.push(Object.assign({ id }, s)); saveCache(); DB.emit();
    return id;
  };
  DB.deleteSet = async (id) => {
    needCloud(); await col("sets").doc(id).delete();
    DB.sets = DB.sets.filter((x) => x.id !== id);
    for (const g of Object.keys(DB.gameConfigs)) if (DB.gameConfigs[g].setId === id) await DB.saveGameConfig(g, { setId: "" });
    saveCache(); DB.emit();
  };

  /* ---------- Cấu hình game ---------- */
  DB.gameCfg = (gid) => Object.assign({ enabled: true, setId: "" }, DB.gameConfigs[gid] || {});
  DB.saveGameConfig = async (gid, patch) => {
    needCloud();
    const c = Object.assign(DB.gameCfg(gid), patch); await col("gameConfigs").doc(gid).set(c);
    DB.gameConfigs[gid] = c; saveCache(); DB.emit();
  };

  /* ---------- Cài đặt ---------- */
  DB.saveSettings = async (patch) => {
    needCloud();
    DB.settings = Object.assign({}, DB.settings, patch);
    await col("settings").doc("site").set(DB.settings); saveCache(); DB.emit();
  };


  /* ---------- Cấu hình soạn sẵn (presets) ----------
     Lưu ở Firestore (collection "presets", do admin quản lý)
     và/hoặc trên máy này (localStorage) để dùng offline. */
  DB.localPresets = () => U.store.get("presetsLocal", []);
  DB.allPresets = (gameId) => {
    const cloud = (DB.presets || []).map((p) => Object.assign({ where: "cloud" }, p));
    const local = DB.localPresets().map((p) => Object.assign({ where: "local" }, p));
    return cloud.concat(local).filter((p) => !gameId || p.gameId === gameId)
      .sort((a, b) => (a.gameId || "").localeCompare(b.gameId || "") || String(a.name).localeCompare(String(b.name), "vi", { numeric: true }));
  };
  DB.findPreset = (id) => DB.allPresets().find((p) => p.id === id);
  DB.savePreset = async (p, where) => {
    const rec = U.plain(p); delete rec.where;
    rec.updatedAt = Date.now(); if (!rec.createdAt) rec.createdAt = Date.now(); rec.by = FB.name();
    if (where === "cloud") {
      needCloud();
      if (!rec.id || String(rec.id).startsWith("loc_")) rec.id = "pre_" + U.uid();
      const id = rec.id; const data = Object.assign({}, rec); delete data.id;
      await col("presets").doc(id).set(data);
      DB.presets = (DB.presets || []).filter((x) => x.id !== id).concat([rec]);
      saveCache();
    } else {
      if (!rec.id || String(rec.id).startsWith("pre_")) rec.id = "loc_" + U.uid();
      const list = DB.localPresets().filter((x) => x.id !== rec.id); list.push(rec); U.store.set("presetsLocal", list);
    }
    DB.emit(); return rec;
  };
  DB.deletePreset = async (p) => {
    if (p.where === "cloud" || String(p.id).startsWith("pre_")) {
      needCloud(); await col("presets").doc(p.id).delete();
      DB.presets = (DB.presets || []).filter((x) => x.id !== p.id); saveCache();
    } else U.store.set("presetsLocal", DB.localPresets().filter((x) => x.id !== p.id));
    DB.emit();
  };

  /* ---------- Kết quả / điểm số ---------- */
  DB.addResult = async (r) => {
    if (DB.settings.saveResults === false) return;
    const rec = U.plain(r); rec.host = FB.name(); rec.hostUid = FB.user ? FB.user.uid : "";
    rec.at = Date.now();
    const local = U.store.get("results", []); local.unshift(Object.assign({ id: "L" + U.uid(), _local: true }, rec)); U.store.set("results", local.slice(0, 300));
    if (FB.available && navigator.onLine !== false) {
      try { rec.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await col("results").add(rec); } catch (e) { console.warn("Không lưu được kết quả lên Firestore:", e.message); }
    }
  };
  DB.listResults = async (limit) => {
    if (FB.available && navigator.onLine !== false) {
      try {
        const s = await withTimeout(col("results").orderBy("at", "desc").limit(limit || 300).get(), 8000);
        return s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      } catch (e) { console.warn(e.message); }
    }
    return U.store.get("results", []);
  };
  DB.deleteResults = async (ids) => {
    const loc = U.store.get("results", []).filter((r) => !ids.includes(r.id)); U.store.set("results", loc);
    const cloudIds = ids.filter((i) => !String(i).startsWith("L"));
    if (cloudIds.length) { needCloud(); await batchRun(cloudIds.map((id) => (b) => b.delete(col("results").doc(id)))); }
  };
  DB.listUsers = async () => {
    needCloud();
    const s = await col("users").orderBy("lastLogin", "desc").limit(500).get();
    return s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  };

  /* ---------- Offline ---------- */
  DB.exportOfflineJS = () => {
    const data = { exportedAt: new Date().toISOString(), questions: DB.questions.map(clean), sets: DB.sets, gameConfigs: DB.gameConfigs, settings: DB.settings, presets: DB.presets };
    return "/* File dữ liệu offline — Sân Chơi Tri Thức\n   Đặt file này vào thư mục  data/  (cùng cấp index.html) với tên  questions-offline.js\n   Khi không có Internet, web sẽ tự dùng dữ liệu này. Xuất lúc: " + data.exportedAt + " */\nwindow.OFFLINE_DATA = " + JSON.stringify(data, null, 1) + ";\n";
  };
  DB.useLocalFile = (data) => {
    const d = Array.isArray(data) ? { questions: data } : data;
    U.store.set("localFile", { questions: d.questions || [], sets: d.sets || [], gameConfigs: d.gameConfigs || {}, settings: d.settings || {}, presets: d.presets || [] });
    return DB.load(true);
  };
  DB.clearLocalFile = () => { U.store.del("localFile"); return DB.load(true); };

  DB.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  window.DB = DB;
})();
