/* =========================================================
   kit.js — Khung dùng chung cho mọi game:
   • Games.register(...)  : đăng ký game mới (dễ bổ sung)
   • Màn cấu hình, sân chơi toàn màn hình, HUD, đếm ngược,
     bảng câu hỏi theo đội, phòng chờ trực tuyến, bục vinh quang.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;

  /* ---------------- Registry ---------------- */
  const Games = { list: [], soon: [] };
  Games.register = (def) => {
    def = Object.assign({ modes: ["local"], types: ["MC", "TF", "SA"], fields: [], tags: [], colors: ["#6c4cf5", "#ff5c9d"], order: 50 }, def);
    Games.list.push(def); Games.list.sort((a, b) => a.order - b.order);
  };
  Games.get = (id) => Games.list.find((g) => g.id === id);
  Games.enabled = () => Games.list.filter((g) => DB.gameCfg(g.id).enabled !== false);
  Games.comingSoon = (arr) => (Games.soon = arr);
  window.Games = Games;

  const GK = {};
  window.GameKit = GK;

  /* ---------------- Cấu hình mặc định ---------------- */
  function defaults(game) {
    const c = { mode: game.modes[0], teamCount: 2, teamNames: U.TEAM_NAMES.slice(), shuffleQ: true, shuffleA: true, explain: false, types: game.types.slice(), limit: 0 };
    game.fields.forEach((f) => {
      if (f.type === "teams") c.teamCount = f.def || f.min || 2;
      else c[f.key] = typeof f.def === "function" ? f.def() : f.def;
    });
    const gc = DB.gameCfg(game.id);
    c.source = gc.setId && DB.findSet(gc.setId) ? { kind: "set", setId: gc.setId } : { kind: "all" };
    return c;
  }
  function loadCfg(game, override) {
    const d = defaults(game), saved = override ? U.plain(override) : U.store.get("cfg_" + game.id, null);
    if (!saved) return d;
    const c = Object.assign(d, saved);
    const tf = game.fields.find((f) => f.type === "teams");
    if (tf) c.teamCount = U.clamp(+c.teamCount || tf.def || tf.min, tf.min, tf.max);
    c.teamNames = U.TEAM_NAMES.map((n, i) => (c.teamNames || [])[i] || n);
    if (c.source && c.source.kind === "set" && !DB.findSet(c.source.setId)) c.source = d.source;
    if (!game.modes.includes(c.mode)) c.mode = game.modes[0];
    c.types = (c.types || []).filter((t) => game.types.includes(t)); if (!c.types.length) c.types = game.types.slice();
    return c;
  }
  GK.teamsOf = (cfg) => Array.from({ length: cfg.teamCount }, (_, i) => ({ name: (cfg.teamNames[i] || U.TEAM_NAMES[i]).trim() || U.TEAM_NAMES[i], color: U.TEAM_COLORS[i], i }));

  /* ---------------- Trang game ---------------- */
  GK.page = (view, id) => {
    const game = Games.get(id);
    if (!game) { view.innerHTML = `<div class="page"><div class="empty"><span class="em-ic">🕵️</span><h2>Không tìm thấy trò chơi</h2><a class="btn btn-primary" href="#/">Về trang chủ</a></div></div>`; return; }
    const S = { game, view, ctrl: null, timers: null, room: null, cleanups: [] };
    const q = App.query();
    if (q.preset) { S.preset = DB.findPreset(q.preset) || null; if (!S.preset) U.toast("Không tìm thấy cấu hình đã lưu này.", "warn"); }
    if (q.new) S.creating = true;
    renderSetup(S);
    return () => teardown(S, true);
  };

  function teardown(S, leaving) {
    try { S.ctrl && S.ctrl.destroy && S.ctrl.destroy(); } catch (e) { console.error(e); }
    S.ctrl = null; S.timers && S.timers.clear();
    S.cleanups.forEach((f) => { try { f(); } catch (e) { } }); S.cleanups = [];
    if (S.room) { const r = S.room; S.room = null; Room.close(r.pin, leaving).catch(() => { }); }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    App.enterGame(false);
  }

  /* ---------------- MÀN CẤU HÌNH ---------------- */
  function renderSetup(S) {
    const { game } = S;
    const cfg = loadCfg(game, S.preset ? S.preset.cfg : null);
    App.enterGame(false);
    const presets = DB.allPresets(game.id);
    const facets = DB.facets();
    const v = S.view;
    v.innerHTML = `<div class="page gsetup" style="--c1:${game.colors[0]};--c2:${game.colors[1]}">
      <section class="gs-show" data-reveal>
        <div class="gs-art">${Art.thumb(game.id)}</div>
        <div class="gs-info">
          <div class="gs-title"><span class="gs-ic">${game.icon}</span><div><h1>${esc(game.name)}</h1><p>${esc(game.tagline || "")}</p></div></div>
          <div class="gc-tags">${game.tags.map((t) => `<span class="chip">${t}</span>`).join("")}${game.types.map((t) => `<span class="chip violet">${t}</span>`).join("")}</div>
          ${game.howto ? `<ul class="gs-how">${game.howto.map((x, i) => `<li style="--i:${i}">${x}</li>`).join("")}</ul>` : ""}
        </div>
      </section>
      <section class="gs-form card" data-reveal>
        <div id="qmQuotaHost"></div>
        ${S.creating ? `<div class="notice" style="margin:0">💾 Đang soạn <b>cấu hình mới</b> — chỉnh các mục bên dưới rồi bấm <b>Lưu cấu hình</b>.</div>` : ""}
        <div class="preset-bar">
          <span class="pb-ic">⚡</span>
          <select class="select" id="presetSel" title="Chơi trực tiếp, hoặc chọn một cấu hình đã soạn sẵn">
            <option value="">⚙️ Cấu hình trực tiếp (tự chỉnh bên dưới)</option>
            ${presets.length ? `<optgroup label="💾 Cấu hình soạn sẵn (${presets.length})">${presets.map((p) => `<option value="${esc(p.id)}" ${S.preset && S.preset.id === p.id ? "selected" : ""}>${p.where === "cloud" ? "☁️" : "💻"} ${esc(p.name)}</option>`).join("")}</optgroup>` : ""}
          </select>
          <button class="btn btn-ghost" id="presetSave" title="Lưu toàn bộ cấu hình hiện tại thành một cấu hình soạn sẵn để lần sau chọn nhanh">💾 Lưu cấu hình</button>
        </div>
        <div class="preset-hint">${presets.length ? "Chọn một mẫu để điền sẵn, hoặc để <b>Cấu hình trực tiếp</b> rồi tự chỉnh nhanh bên dưới — không cần lưu mẫu vẫn chơi được ngay." : "Cứ chỉnh các mục bên dưới rồi bấm <b>Bắt đầu chơi</b> — không cần tạo mẫu trước. Muốn dùng lại lần sau thì bấm <b>💾 Lưu cấu hình</b>."}</div>
        ${S.preset && S.preset.note ? `<div class="preset-note">📝 ${esc(S.preset.note)}</div>` : ""}
        <div class="gs-sec ${game.modes.length < 2 ? "hide" : ""}">
          <span class="lbl">Chế độ chơi</span>
          <div class="mode-pick">
            <button data-mode="local" class="${game.modes.includes("local") ? "" : "hide"}"><i>🖥️</i><b>Một màn hình</b><small>Chiếu lên bảng, các đội thi đấu trực tiếp</small></button>
            <button data-mode="online" class="${game.modes.includes("online") ? "" : "hide"}"><i>📱</i><b>Trực tuyến</b><small>Học sinh vào bằng mã PIN trên điện thoại</small></button>
          </div>
        </div>
        <div class="gs-sec" data-local-only id="teamSec"></div>
        <div class="gs-sec gs-fields" id="fieldSec"></div>
        <div class="gs-sec">
          <span class="lbl">Nguồn câu hỏi cho trò chơi</span>
          <div class="qm-src-toolbar">
            <button type="button" class="qm-src-card bank-card" id="qmPickBankBtn">
              <div class="qm-src-ic">🌳</div>
              <div class="qm-src-txt">
                <b>Chọn từ Ngân hàng QMath (Cây ID)</b>
                <small>Chọn đúng Lớp, Phân môn, Bài, Dạng bài & Xem trước câu hỏi</small>
              </div>
            </button>
            <button type="button" class="qm-src-card word-card" id="qmPickWordBtn">
              <div class="qm-src-ic">📄</div>
              <div class="qm-src-txt">
                <b>Đưa câu hỏi từ File Word (.docx)</b>
                <small>Tải trực tiếp đề Word (.docx) từ máy tính lên chơi ngay</small>
              </div>
            </button>
          </div>
          <div class="qm-word-help-row">
            <span>💡 Chưa rõ cách trình bày file Word (.docx) để tự động nhận câu hỏi & đáp án?</span>
            <button type="button" class="qm-link-btn" id="qmWordGuideBtn">📘 Xem hướng dẫn chuẩn bị file Word & Tải file mẫu (.docx)</button>
          </div>
          <select class="select" id="srcSel">
            <option value="all">📚 Toàn bộ ngân hàng câu hỏi</option>
            ${DB.sets.map((s) => `<option value="set:${s.id}">🧩 ${esc(s.name)}${DB.gameCfg(game.id).setId === s.id ? " (được phân bổ)" : ""}</option>`).join("")}
            <option value="filter">🔎 Lọc theo môn / lớp / chương…</option>
          </select>
          <div class="adm-filters" id="fltBox" style="margin:10px 0 0">
            ${["Subject:Môn", "Grade:Lớp", "Chapter:Chương", "Topic:Chủ đề", "Level:Mức độ"].map((p) => { const [k, l] = p.split(":"); return `<select class="select input-sm" data-f="${k}"><option value="">${l}: tất cả</option>${facets[k].map((x) => `<option>${esc(x)}</option>`).join("")}</select>`; }).join("")}
          </div>
          <div class="row" style="margin-top:12px" id="typeBox">${game.types.map((t) => `<label class="tchip"><input type="checkbox" value="${t}"><span>${Quiz.TYPES[t]}</span></label>`).join("")}</div>
          <div class="src-info" id="srcInfo"></div>
        </div>
        <div class="gs-sec row gs-opts">
          <label class="switch"><input type="checkbox" id="oShQ"> Trộn câu hỏi</label>
          <label class="switch"><input type="checkbox" id="oShA"> Trộn phương án</label>
          <label class="switch"><input type="checkbox" id="oExp"> Hiện lời giải</label>
        </div>
        <button class="btn btn-xl btn-fun btn-3d gs-go" id="goBtn">▶ Bắt đầu chơi</button>
      </section>
    </div>`;
    U.reveal(v);

    // Chế độ
    const setMode = (m) => {
      cfg.mode = m;
      $$(".mode-pick button", v).forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
      refreshVis();
      renderFields();
      $("#goBtn", v).innerHTML = m === "online" ? "📡 Tạo phòng trực tuyến" : "▶ Bắt đầu chơi";
    };
    $$(".mode-pick button", v).forEach((b) => (b.onclick = () => { U.Sound.click(); setMode(b.dataset.mode); }));

    // Đội
    const tf = game.fields.find((f) => f.type === "teams");
    function refreshVis() { const hide = !!(cfg.mode !== "local" || !tf || (tf.when && !tf.when(cfg))); $$("[data-local-only]", v).forEach((e) => e.classList.toggle("hide", hide)); }
    const renderTeams = () => {
      if (!tf) return;
      const sec = $("#teamSec", v);
      let segs = ""; for (let n = tf.min; n <= tf.max; n++) segs += `<button data-n="${n}" class="${n === cfg.teamCount ? "on" : ""}">${n}</button>`;
      sec.innerHTML = `<div class="row" style="justify-content:space-between"><span class="lbl">${tf.label || "Số đội chơi"}</span><div class="seg">${segs}</div></div>
        <div class="team-names stg">${Array.from({ length: cfg.teamCount }, (_, i) => `<div class="tn" style="--tc:${U.TEAM_COLORS[i]};--i:${i}"><i></i><input class="input" data-tn="${i}" maxlength="24" value="${esc(cfg.teamNames[i] || U.TEAM_NAMES[i])}"></div>`).join("")}</div>`;
      $$(".seg button", sec).forEach((b) => (b.onclick = () => { cfg.teamCount = +b.dataset.n; U.Sound.click(); renderTeams(); }));
      $$("[data-tn]", sec).forEach((i) => (i.oninput = () => (cfg.teamNames[+i.dataset.tn] = i.value)));
    };
    renderTeams();

    // Trường riêng
    function renderFields() {
      const box = $("#fieldSec", v);
      box.innerHTML = game.fields.filter((f) => f.type !== "teams" && (!f.modes || f.modes.includes(cfg.mode)) && (!f.when || f.when(cfg))).map((f) => {
        const val = cfg[f.key];
        if (f.type === "textarea") return `<div class="field"><label class="lbl">${f.label}</label><textarea class="textarea" data-k="${f.key}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || "")}">${esc(val || "")}</textarea>${f.hint ? `<small class="muted">${f.hint}</small>` : ""}</div>`;
        if (f.type === "number") return `<div class="field"><label class="lbl">${f.label}</label><div class="num-field"><button type="button" data-step="-1">−</button><input class="input" type="number" data-k="${f.key}" min="${f.min}" max="${f.max}" value="${val}"><button type="button" data-step="1">+</button></div>${f.hint ? `<small class="muted">${f.hint}</small>` : ""}</div>`;
        if (f.type === "range") return `<div class="rng field"><div class="row" style="justify-content:space-between"><label class="lbl">${f.label}</label><span class="rv" id="rv_${f.key}">${val}${f.unit || ""}</span></div>
          <input type="range" class="range" data-k="${f.key}" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${val}"></div>`;
        if (f.type === "seg") return `<div class="field"><label class="lbl">${f.label}</label><div class="seg" data-k="${f.key}">${f.options.map(([k, l]) => `<button data-v="${k}" class="${k === val ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
        if (f.type === "toggle") return `<label class="switch"><input type="checkbox" data-k="${f.key}" ${val ? "checked" : ""}> ${f.label}</label>`;
        if (f.type === "action") return `<div class="field"><button type="button" class="btn btn-lg btn-fun btn-3d gs-action" data-k="${f.key}" style="width:100%">${f.label}</button>${f.hint ? `<small class="muted">${f.hint}</small>` : ""}</div>`;
        if (f.type === "text") return `<div class="field"><label class="lbl">${f.label}</label><input class="input" data-k="${f.key}" value="${esc(val || "")}" placeholder="${esc(f.placeholder || "")}"></div>`;
        if (f.type === "select") return `<div class="field"><label class="lbl">${f.label}</label><select class="select" data-k="${f.key}">${f.options.map(([k, l]) => `<option value="${k}" ${k === val ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
        return "";
      }).join("");
      $$("input[type=range][data-k]", box).forEach((r) => {
        const f = game.fields.find((x) => x.key === r.dataset.k);
        const upd = () => { cfg[f.key] = +r.value; $("#rv_" + f.key, box).textContent = r.value + (f.unit || ""); r.style.setProperty("--p", ((r.value - f.min) / (f.max - f.min)) * 100 + "%"); };
        r.oninput = upd; upd();
      });
      $$(".seg[data-k]", box).forEach((s) => $$("button", s).forEach((b) => (b.onclick = () => {
        cfg[s.dataset.k] = b.dataset.v; $$("button", s).forEach((x) => x.classList.toggle("on", x === b));
        if (game.fields.some((f) => f.when) || (tf && tf.when)) { renderFields(); refreshVis(); updSrc(); }
      })));
      $$(".num-field", box).forEach((w) => {
        const inp = $("input", w), f = game.fields.find((x) => x.key === inp.dataset.k);
        const set = (val) => { val = U.clamp(Math.round(+val || f.min), f.min, f.max); inp.value = val; cfg[f.key] = val; };
        inp.onchange = () => set(inp.value); inp.oninput = () => { if (inp.value !== "") cfg[f.key] = U.clamp(+inp.value, f.min, f.max); };
        $$("[data-step]", w).forEach((b) => (b.onclick = () => set(+inp.value + +b.dataset.step)));
      });
      $$("textarea[data-k]", box).forEach((c) => (c.oninput = () => (cfg[c.dataset.k] = c.value)));
      $$("input[type=checkbox][data-k]", box).forEach((c) => (c.onchange = () => { cfg[c.dataset.k] = c.checked; if (game.fields.some((f) => f.when)) { renderFields(); updSrc(); } }));
      $$("input.input[data-k]:not([type=number]), select[data-k]", box).forEach((c) => (c.oninput = () => (cfg[c.dataset.k] = c.value)));
      $$(".gs-action[data-k]", box).forEach((b) => { const f = game.fields.find((x) => x.key === b.dataset.k); b.onclick = () => f && f.onClick && f.onClick(cfg, { rerender: renderFields }); });
    }

    // Nguồn câu hỏi & Cầu nối QMath LMS
    if (window.QMathBridge) {
      QMathBridge.renderSetupQuotaBanner($("#qmQuotaHost", v), game.name);
      const applyCreatedSet = (savedSet) => {
        if (!savedSet) return;
        cfg.source = { kind: "set", setId: savedSet.id };
        U.store.set("cfg_" + game.id, cfg);
        renderSetup(S);
      };
      const pickBankBtn = $("#qmPickBankBtn", v);
      if (pickBankBtn) pickBankBtn.onclick = () => QMathBridge.openBankPickerModal({ game, onConfirm: applyCreatedSet });
      const pickWordBtn = $("#qmPickWordBtn", v);
      if (pickWordBtn) pickWordBtn.onclick = () => QMathBridge.quickImportWordForGame(game, applyCreatedSet);
      const wordGuideBtn = $("#qmWordGuideBtn", v);
      if (wordGuideBtn) wordGuideBtn.onclick = () => QMathBridge.openWordGuideModal(() => QMathBridge.quickImportWordForGame(game, applyCreatedSet));
    }

    const srcSel = $("#srcSel", v);
    srcSel.value = cfg.source.kind === "set" ? "set:" + cfg.source.setId : cfg.source.kind;
    if (!srcSel.value) srcSel.value = "all";
    $$("#fltBox select", v).forEach((s) => { s.value = (cfg.source.filter || {})[s.dataset.f] || ""; s.onchange = updSrc; });
    $$("#typeBox input", v).forEach((c) => { c.checked = cfg.types.includes(c.value); c.onchange = updSrc; });
    srcSel.onchange = updSrc;
    function readSrc() {
      const val = srcSel.value;
      if (val.startsWith("set:")) return { kind: "set", setId: val.slice(4) };
      if (val === "filter") { const f = {}; $$("#fltBox select", v).forEach((s) => { if (s.value) f[s.dataset.f] = s.value; }); return { kind: "filter", filter: f }; }
      return { kind: "all" };
    }
    function updSrc() {
      cfg.source = readSrc();
      cfg.types = $$("#typeBox input:checked", v).map((c) => c.value);
      $("#fltBox", v).classList.toggle("hide", cfg.source.kind !== "filter");
      const raw = DB.questionsFor(cfg.source), items = Quiz.flatten(raw, cfg.types);
      const by = { MC: 0, TF: 0, SA: 0 }; items.forEach((i) => by[i.type]++);
      const noQ = game.needsQuestions && !game.needsQuestions(cfg);
      $("#srcInfo", v).closest(".gs-sec").classList.toggle("dimmed", !!noQ);
      $("#srcInfo", v).innerHTML = noQ ? `<span class="chip green">Chế độ này không cần câu hỏi</span>` : `<b class="${items.length ? "" : "warn"}">${items.length}</b> câu dùng được <span class="muted">(MC ${by.MC} · TF ${by.TF} · SA ${by.SA})</span>${DB.usingDemo ? ' <span class="chip amber">câu hỏi mẫu</span>' : ""}`;
    }
    updSrc();

    $("#oShQ", v).checked = cfg.shuffleQ; $("#oShA", v).checked = cfg.shuffleA; $("#oExp", v).checked = cfg.explain;
    setMode(cfg.mode);

    const collect = () => { cfg.shuffleQ = $("#oShQ", v).checked; cfg.shuffleA = $("#oShA", v).checked; cfg.explain = $("#oExp", v).checked; updSrc(); return cfg; };
    // Cấu hình soạn sẵn
    $("#presetSel", v).onchange = (e) => {
      const id = e.target.value;
      S.preset = id ? DB.findPreset(id) : null; S.creating = false;
      history.replaceState(null, "", "#/game/" + game.id + (id ? "?preset=" + encodeURIComponent(id) : ""));
      renderSetup(S);
      if (S.preset) U.toast(`Đã nạp cấu hình “${esc(S.preset.name)}”`, "ok", 1800);
    };
    $("#presetSave", v).onclick = () => GK.savePresetDialog(game, collect(), S.preset).then((p) => { if (p) { S.preset = p; S.creating = false; history.replaceState(null, "", "#/game/" + game.id + "?preset=" + encodeURIComponent(p.id)); renderSetup(S); } });

    $("#goBtn", v).onclick = async () => {
      collect();
      let items = Quiz.flatten(DB.questionsFor(cfg.source), cfg.types);
      const needQ = !game.needsQuestions || game.needsQuestions(cfg);
      if (!items.length && needQ) return U.toast("Không có câu hỏi phù hợp — hãy chọn nguồn khác hoặc thêm loại câu hỏi.", "warn");
      if (needQ && game.minQ && items.length < game.minQ) U.toast(`Gợi ý: nên có ít nhất ${game.minQ} câu cho trò này (hiện có ${items.length}).`, "warn", 3500);
      if (window.QMathBridge) {
        const quotaRes = await QMathBridge.consumeGameQuota(game.name);
        if (!quotaRes.allowed) return;
      }
      if (cfg.limit > 0) items = U.shuffle(items).slice(0, cfg.limit);
      U.store.set("cfg_" + game.id, cfg);
      U.Sound.click();
      if (cfg.mode === "online") startOnline(S, cfg, items); else startLocal(S, cfg, items);
    };
  }


  /* ---------------- Lưu cấu hình soạn sẵn ---------------- */
  GK.describeCfg = (game, c) => {
    const parts = [];
    if (game.modes.length > 1) parts.push(c.mode === "online" ? "📱 Trực tuyến" : "🖥️ Một màn hình");
    const tf = game.fields.find((f) => f.type === "teams");
    if (tf && c.mode !== "online" && (!tf.when || tf.when(c))) parts.push(`👥 ${c.teamCount} đội: ${(c.teamNames || []).slice(0, c.teamCount).join(", ")}`);
    game.fields.forEach((f) => {
      if (f.type === "teams" || (f.when && !f.when(c)) || (f.describeWhen && !f.describeWhen(c)) || (f.modes && !f.modes.includes(c.mode))) return;
      const val = c[f.key];
      if (f.type === "range" || f.type === "number") parts.push(`${f.label}: ${val}${f.unit || ""}`);
      else if (f.type === "seg" || f.type === "select") { const o = f.options.find((x) => x[0] === val); if (o) parts.push(`${f.label}: ${o[1]}`); }
      else if (f.type === "text" && val) parts.push(`${f.label}: ${val}`);
      else if (f.type === "textarea" && val) parts.push(`${f.label}: ${String(val).split(/\n+/).filter(Boolean).length} dòng`);
    });
    const src = c.source || {};
    parts.push("📚 " + (src.kind === "set" ? "Bộ đề: " + ((DB.findSet(src.setId) || {}).name || "?") : src.kind === "filter" ? "Lọc: " + Object.values(src.filter || {}).join(" · ") : "Toàn bộ ngân hàng"));
    return parts;
  };
  GK.savePresetDialog = async (game, cfg, cur) => {
    const canCloud = FB.available && FB.isAdmin;
    const body = h(`<div class="stack">
      <div class="field"><label>Tên cấu hình</label><input class="input" id="pName" maxlength="60" placeholder="VD: Lớp 10A1 – Ôn chương 1 (4 đội)" value="${esc(cur ? cur.name : "")}"></div>
      <div class="field"><label>Ghi chú (tuỳ chọn)</label><input class="input" id="pNote" maxlength="160" value="${esc(cur && cur.note || "")}"></div>
      <div class="field"><label>Lưu ở đâu</label>
        <div class="where-pick">
          <label class="${canCloud ? "" : "disabled"}"><input type="radio" name="pw" value="cloud" ${canCloud && (!cur || cur.where === "cloud") ? "checked" : ""} ${canCloud ? "" : "disabled"}><span><b>☁️ Lên hệ thống (Firestore)</b><small>${canCloud ? "Mọi giáo viên, mọi máy đều thấy & dùng được" : "Chỉ quản trị viên đã đăng nhập mới lưu được"}</small></span></label>
          <label><input type="radio" name="pw" value="local" ${!canCloud || (cur && cur.where === "local") ? "checked" : ""}><span><b>💻 Chỉ trên máy này</b><small>Dùng được cả khi không có Internet</small></span></label>
        </div></div>
      <div class="field"><label>Tóm tắt cấu hình</label><ul class="cfg-sum">${GK.describeCfg(game, cfg).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>`);
    const actions = [{ label: "Hủy", cls: "btn-ghost" }];
    const doSave = (asNew) => async (btn, w) => {
      const name = $("#pName", w).value.trim(); if (!name) { U.toast("Hãy đặt tên cho cấu hình", "warn"); return false; }
      const where = ($("input[name=pw]:checked", w) || {}).value || "local";
      const rec = { id: !asNew && cur && cur.where === where ? cur.id : "", name, note: $("#pNote", w).value.trim(), gameId: game.id, gameName: game.name, cfg: U.plain(cfg), createdAt: !asNew && cur ? cur.createdAt : 0 };
      btn.disabled = true;
      try { const p = await DB.savePreset(rec, where); U.toast(`Đã lưu cấu hình “${esc(name)}” ${where === "cloud" ? "lên hệ thống ☁️" : "trên máy này 💻"}`, "ok"); return Object.assign({ where }, p); }
      catch (e) { btn.disabled = false; U.toast(FB.errMsg(e), "err", 5000); return false; }
    };
    if (cur) actions.push({ label: "＋ Lưu thành bản mới", cls: "btn-ghost", onClick: doSave(true) });
    actions.push({ label: cur ? "💾 Cập nhật cấu hình" : "💾 Lưu cấu hình", cls: "btn-primary", onClick: doSave(false) });
    return U.modal({ title: `💾 Lưu cấu hình — ${esc(game.name)}`, size: "md", body, actions }).result;
  };

  /* Màn hình tổng kết đơn giản (cho chế độ không chấm điểm) */
  GK.summary = (ctx, o) => {
    const ov = h(`<div class="res-ov"><div class="res-card">
      <div class="res-head"><div class="sum-ic">${o.icon || "🎉"}</div><h2>${o.title}</h2><p>${o.sub || ""}</p></div>
      <div class="sum-body">${o.html || ""}</div>
      <div class="res-actions">
        <button class="btn btn-lg btn-fun btn-3d" data-a="again">↻ Chơi lại</button>
        <button class="btn btn-lg btn-primary" data-a="setup">⚙️ Đổi cấu hình</button>
        <button class="btn btn-lg btn-ghost" data-a="close">✕ Đóng</button>
      </div></div></div>`);
    ctx.stage.appendChild(ov);
    $("[data-a=again]", ov).onclick = () => { ov.remove(); ctx.replay(); };
    $("[data-a=setup]", ov).onclick = () => ctx.exit(false);
    $("[data-a=close]", ov).onclick = () => ov.remove();
    return ov;
  };

  /* ---------------- SÂN CHƠI ---------------- */
  function makeStage(S, cls) {
    App.enterGame(true);
    S.view.innerHTML = `<div class="stage ${cls || ""}" style="--c1:${S.game.colors[0]};--c2:${S.game.colors[1]}"></div>`;
    return S.view.firstElementChild;
  }
  function makeCtx(S, cfg, items, stage) {
    S.timers = U.timers();
    const ctx = {
      game: S.game, cfg, items, stage, timers: S.timers, teams: GK.teamsOf(cfg), room: S.room,
      finish: (res) => finish(S, ctx, res),
      exit: (ask) => exitStage(S, ask),
      replay: () => { teardownGame(S); startLocal(S, cfg, items); }
    };
    return ctx;
  }
  function teardownGame(S) { try { S.ctrl && S.ctrl.destroy && S.ctrl.destroy(); } catch (e) { } S.ctrl = null; S.timers && S.timers.clear(); }
  async function exitStage(S, ask) {
    if (ask !== false && !(await U.confirm("Thoát khỏi trận đấu hiện tại?", { ok: "Thoát", danger: true }))) return;
    teardown(S, true); renderSetup(S);
  }

  function startLocal(S, cfg, items) {
    const stage = makeStage(S, "st-" + S.game.id);
    const ctx = makeCtx(S, cfg, items, stage);
    S.ctrl = S.game.play(stage, ctx) || null;
  }

  /* HUD mỏng phía trên sân chơi */
  GK.hud = (stage, ctx, o) => {
    o = o || {};
    const el = h(`<div class="hud">
      <button class="hud-btn" data-a="exit" title="Thoát">←</button>
      <div class="hud-title"><span class="hud-ic">${ctx.game.icon}</span><b>${esc(o.title || ctx.game.name)}</b></div>
      <div class="hud-mid">${o.mid || ""}</div>
      <div class="hud-right">${o.right || ""}
        <button class="hud-btn hud-music ${U.Music.on ? "on" : ""}" data-a="music" title="Nhạc nền (bật/tắt)">🎵</button>
        <button class="hud-btn" data-a="mute" title="Tuỳ chọn âm thanh">${U.Sound.muted ? "🔇" : "🔊"}</button>
        <button class="hud-btn" data-a="fs" title="Toàn màn hình">⛶</button>
      </div></div>`);
    stage.prepend(el);
    $("[data-a=exit]", el).onclick = () => ctx.exit();
    const mBtn = $("[data-a=music]", el), sBtn = $("[data-a=mute]", el);
    mBtn.onclick = () => { const on = U.Music.toggle(); mBtn.classList.toggle("on", on); U.toast(on ? "🎵 Đã bật nhạc nền" : "🎵 Đã tắt nhạc nền", "info", 1400); };
    sBtn.onclick = (e) => { e.stopPropagation(); GK.soundMenu(sBtn, () => { mBtn.classList.toggle("on", U.Music.on); sBtn.textContent = U.Sound.muted ? "🔇" : "🔊"; }); };
    $("[data-a=fs]", el).onclick = () => U.fullscreen();
    return el;
  };
  /* Bảng tuỳ chọn âm thanh (bấm 🔊) */
  GK.soundMenu = (anchor, onChange) => {
    const old = document.querySelector(".snd-pop"); if (old) { old.remove(); return; }
    const r = anchor.getBoundingClientRect();
    const pop = h(`<div class="snd-pop" style="top:${r.bottom + 8}px;right:${Math.max(8, innerWidth - r.right - 6)}px">
      <b class="sp-t">🎚️ Âm thanh</b>
      <label class="switch"><input type="checkbox" data-k="music" ${U.Music.on ? "checked" : ""}> 🎵 Nhạc nền</label>
      <div class="sp-vol"><span>🔈</span><input type="range" class="range" min="0" max="100" value="${Math.round(U.Music.vol * 100)}" data-k="vol"><span>🔊</span></div>
      <label class="switch"><input type="checkbox" data-k="ans" ${U.Sound.answerOn ? "checked" : ""}> ✅ Âm thanh đúng / sai</label>
      <label class="switch"><input type="checkbox" data-k="fx" ${!U.Sound.muted ? "checked" : ""}> 🔔 Hiệu ứng âm thanh</label>
      <small class="sp-src">Nhạc: <span id="spSrc">…</span> · Đúng/sai: ${U.audioFiles.has("right") || U.audioFiles.has("wrong") ? "file của bạn" : "âm mặc định"}</small>
    </div>`);
    document.body.appendChild(pop);
    U.audioFiles.probe("background").then((u) => { const e = $("#spSrc", pop); if (e) e.textContent = u ? u : "giai điệu mặc định"; });
    const vol = $("[data-k=vol]", pop); const sv = () => vol.style.setProperty("--p", vol.value + "%"); sv();
    vol.oninput = () => { U.Music.setVol(vol.value / 100); sv(); };
    $("[data-k=music]", pop).onchange = (e) => { if (e.target.checked !== U.Music.on) U.Music.toggle(); onChange(); };
    $("[data-k=ans]", pop).onchange = (e) => { U.Sound.setAnswer(e.target.checked); if (e.target.checked) U.Sound.correct(); onChange(); };
    $("[data-k=fx]", pop).onchange = (e) => { U.Sound.setMuted(!e.target.checked); if (e.target.checked) U.Sound.pop(); onChange(); };
    const close = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener("pointerdown", close, true); } };
    setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
  };

  /* Đồng hồ đếm ngược trên HUD */
  GK.clock = (ctx, el, seconds, onEnd, onTick) => {
    let left = seconds, paused = false;
    const draw = () => { el.innerHTML = `<span class="clock ${left <= 10 ? "hot" : ""}">⏱ ${U.fmtTime(left)}</span>`; };
    draw();
    const id = ctx.timers.every(1000, () => {
      if (paused) return;
      left--; draw(); onTick && onTick(left);
      if (left <= 10 && left > 0) U.Sound.tick();
      if (left <= 0) { ctx.timers.stop(id); onEnd && onEnd(); }
    });
    return { get left() { return left; }, pause() { paused = true; }, resume() { paused = false; }, stop() { ctx.timers.stop(id); }, add(s) { left += s; draw(); } };
  };
  /* 3-2-1 BẮT ĐẦU! */
  GK.countdown = (stage, label) => new Promise((res) => {
    const ov = h(`<div class="cd-ov"><div class="cd-n"></div><div class="cd-l">${label || "Chuẩn bị…"}</div></div>`);
    stage.appendChild(ov);
    const n = $(".cd-n", ov); let k = 3;
    const step = () => {
      if (!ov.isConnected) return res();
      if (k === 0) { n.textContent = "BẮT ĐẦU!"; n.className = "cd-n go"; U.Sound.go(); setTimeout(() => { ov.classList.add("out"); setTimeout(() => { ov.remove(); res(); }, 300); }, 650); return; }
      n.textContent = k; n.className = "cd-n"; void n.offsetWidth; n.classList.add("pop"); U.Sound.count(); k--; setTimeout(step, 800);
    };
    step();
  });
  GK.banner = (stage, html, ms) => {
    const b = h(`<div class="banner-pop">${html}</div>`); stage.appendChild(b);
    setTimeout(() => { b.classList.add("out"); setTimeout(() => b.remove(), 400); }, ms || 1400);
  };
  GK.floatText = (anchor, text, color) => {
    if (!anchor) return; const r = anchor.getBoundingClientRect();
    const f = h(`<div class="float-txt" style="left:${r.left + r.width / 2}px;top:${r.top}px;color:${color || "#22c55e"}">${text}</div>`);
    document.body.appendChild(f); setTimeout(() => f.remove(), 1200);
  };

  /* ---------- Bảng câu hỏi cho từng đội (chơi đồng thời) ---------- */
  GK.panels = (host, teams, ctx, o) => {
    o = Object.assign({ freeze: 3, keypad: true }, o || {});
    host.innerHTML = `<div class="tpanels n${teams.length}">` + teams.map((t, i) => `
      <section class="tpanel" style="--tc:${t.color};--i:${i}" data-t="${i}">
        <header class="tp-h" title="Bấm để phóng to / thu nhỏ bảng câu hỏi của đội"><span class="tp-dot">${t.icon || ""}</span><b class="tp-name">${esc(t.name)}</b><span class="tp-stat"></span><span class="tp-score">0</span><button class="tp-zoom" type="button" aria-label="Phóng to"><span class="tz-in">⤢</span><span class="tz-out">✕ Thu nhỏ</span></button></header>
        <div class="tp-q"></div>
        <div class="tp-freeze"><div class="fz-ic">❄️</div><b>ĐÓNG BĂNG</b><span class="tp-fz">0</span></div>
      </section>`).join("") + `</div><div class="tp-back" title="Bấm để thu nhỏ"></div>`;
    const P = teams.map((t, i) => ({ queue: Quiz.queue(ctx.items, { shuffleQ: ctx.cfg.shuffleQ, shuffleA: ctx.cfg.shuffleA }), ctrl: null, frozen: 0, el: host.querySelector(`.tpanel[data-t="${i}"]`), n: 0 }));
    let over = false, zoomed = -1;
    const back = $(".tp-back", host);
    /* Phóng to bảng của một đội (gần toàn màn hình) */
    function zoom(i) {
      if (zoomed >= 0) P[zoomed].el.classList.remove("zoomed");
      zoomed = i === zoomed ? -1 : i;
      if (zoomed >= 0) {
        const el = P[zoomed].el; el.classList.add("zoomed"); U.Sound.pop();
        const inp = $(".sa-in:not(:disabled)", el); if (inp && !matchMedia("(pointer: coarse)").matches) inp.focus({ preventScroll: true });
      }
      back.classList.toggle("on", zoomed >= 0);
      document.body.classList.toggle("has-zoom", zoomed >= 0);
    }
    P.forEach((p, i) => { $(".tp-h", p.el).onclick = () => zoom(i); });
    back.onclick = () => zoom(zoomed);
    const onKey = (e) => { if (e.key === "Escape" && zoomed >= 0 && !document.querySelector(".modal-wrap,.lbx")) zoom(zoomed); };
    document.addEventListener("keydown", onKey);
    function next(i) {
      if (over) return;
      const p = P[i]; p.ctrl && p.ctrl.destroy();
      const item = p.queue.next(); p.n++;
      p.ctrl = Quiz.mount($(".tp-q", p.el), item, { compact: true, keypad: o.keypad, num: p.n, explain: ctx.cfg.explain, autofocus: zoomed === i || teams.length === 1, onAnswer: (res) => handle(i, res, item) });
      $(".tp-q", p.el).scrollTop = 0;
    }
    function handle(i, res, item) {
      const p = P[i];
      o.onResult && o.onResult(i, res, item);
      if (over) return;
      p.el.classList.remove("hit-ok", "hit-bad"); void p.el.offsetWidth; p.el.classList.add(res.ok ? "hit-ok" : "hit-bad");
      if (res.ok) ctx.timers.after(ctx.cfg.explain ? 1600 : 850, () => next(i));
      else if (o.freeze > 0) freeze(i, o.freeze);
      else ctx.timers.after(1800, () => next(i));
    }
    function freeze(i, s) {
      const p = P[i]; p.frozen = s; p.el.classList.add("frozen"); U.Sound.freeze();
      const fz = $(".tp-fz", p.el); fz.textContent = s;
      const id = ctx.timers.every(1000, () => {
        p.frozen--; fz.textContent = p.frozen;
        if (p.frozen <= 0) { ctx.timers.stop(id); p.el.classList.remove("frozen"); next(i); }
      });
    }
    return {
      start() { P.forEach((_, i) => next(i)); },
      stop() { over = true; if (zoomed >= 0) zoom(zoomed); P.forEach((p) => { p.ctrl && p.ctrl.lock(); }); },
      destroy() { over = true; document.body.classList.remove("has-zoom"); document.removeEventListener("keydown", onKey); P.forEach((p) => p.ctrl && p.ctrl.destroy()); },
      zoom,
      score(i, v) { const s = $(".tp-score", P[i].el); s.textContent = v; s.classList.remove("bump"); void s.offsetWidth; s.classList.add("bump"); },
      stat(i, html) { $(".tp-stat", P[i].el).innerHTML = html; },
      el(i) { return P[i].el; }
    };
  };

  /* ---------------- KẾT QUẢ / BỤC VINH QUANG ----------------
     res = { ranking:[{name,color,score,correct,wrong,avatar,figure,note}], unit, title, sub } */
  function finish(S, ctx, res) {
    if (ctx._finished) return; ctx._finished = true;
    try { S.ctrl && S.ctrl.stop && S.ctrl.stop(); } catch (e) { }
    const R = res.ranking || [];
    const unit = res.unit || "điểm";
    const winner = R[0];
    const tie = R.length > 1 && R[0].score === R[1].score && !res.noTie;
    const fig = (r, i) => r.figure || (ctx.game.figure ? ctx.game.figure(r.color, i) : `<div class="pod-ava" style="background:${r.color}">${r.avatar || esc((r.name || "?").charAt(0))}</div>`);
    const podOrder = [1, 0, 2].filter((i) => R[i]);
    const ov = h(`<div class="res-ov"><div class="res-card">
      <div class="res-rays"></div>
      <div class="res-head"><div class="res-trophy">${Art.trophy()}</div>
        <h2>${R.length === 1 ? `🎉 ${esc(winner.name)}: ${U.fmtNum(winner.score)} ${unit}` : tie ? "Hòa nhau! 🤝" : `${esc(winner ? winner.name : "")} chiến thắng!`}</h2>
        <p>${res.sub || ""}</p></div>
      <div class="podium">${podOrder.map((i) => `<div class="pod p${i + 1}" style="--tc:${R[i].color || "#6c4cf5"};--i:${i}">
        <div class="pod-fig">${fig(R[i], i)}</div><b class="pod-name">${esc(R[i].name)}</b><span class="pod-score">${U.fmtNum(R[i].score)} ${unit}</span>
        <div class="pod-block"><span>${i + 1}</span></div></div>`).join("")}</div>
      ${R.length > 3 || R.some((r) => r.correct != null) ? `<div class="res-table"><table class="tbl"><thead><tr><th>#</th><th>Tên</th><th>${unit}</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>
        ${R.map((r, i) => `<tr><td><b>${i + 1}</b></td><td><span class="dot" style="background:${r.color || "#888"}"></span> ${r.avatar || ""} ${esc(r.name)}</td><td><b>${U.fmtNum(r.score)}</b></td><td>${r.correct != null ? r.correct : "—"}</td><td>${r.wrong != null ? r.wrong : "—"}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      <div class="res-actions">
        ${S.room ? "" : `<button class="btn btn-lg btn-fun btn-3d" data-a="again">↻ Chơi lại</button>`}
        <button class="btn btn-lg btn-primary" data-a="setup">⚙️ Đổi cấu hình</button>
        <button class="btn btn-lg btn-ghost" data-a="home">🏠 Trang chủ</button>
      </div></div></div>`);
    ctx.stage.appendChild(ov);
    U.Sound.win(); U.confetti(); setTimeout(() => U.confetti({ burst: true, count: 120 }), 700);
    $("[data-a=again]", ov) && ($("[data-a=again]", ov).onclick = () => { ov.remove(); ctx.replay(); });
    $("[data-a=setup]", ov).onclick = () => { teardown(S, true); renderSetup(S); };
    $("[data-a=home]", ov).onclick = () => { App.go("/"); };
    // lưu kết quả
    DB.addResult({
      gameId: ctx.game.id, gameName: ctx.game.name, mode: ctx.cfg.mode, unit,
      source: ctx.cfg.source && ctx.cfg.source.kind === "set" ? (DB.findSet(ctx.cfg.source.setId) || {}).name || "" : ctx.cfg.source.kind,
      winner: tie ? "" : (winner ? winner.name : ""), questions: ctx.items.length,
      players: R.map((r, i) => ({ name: r.name, score: r.score || 0, correct: r.correct || 0, wrong: r.wrong || 0, rank: i + 1 }))
    });
    if (S.room) Room.finish(S.room.pin, R.map((r, i) => ({ pid: r.pid || "", name: r.name, score: r.score || 0, rank: i + 1 }))).catch(() => { });
  }

  /* ---------------- TRỰC TUYẾN: tạo phòng + phòng chờ ---------------- */
  async function startOnline(S, cfg, items) {
    if (!FB.available || !FB.rtdb) return U.toast("Chế độ trực tuyến cần kết nối Internet & Firebase.", "err");
    if (!FB.user) { U.toast("Hãy đăng nhập để tạo phòng trực tuyến.", "warn"); App.openAuth(); return; }
    const btn = $("#goBtn", S.view); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang tạo phòng…';
    let pin, qs;
    try {
      qs = Quiz.prepare(items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA }).slice(0, 300);
      pin = await Room.create({ gameId: S.game.id, title: S.game.name, kind: S.game.onlineKind || "race", questions: qs, settings: S.game.roomSettings ? S.game.roomSettings(cfg) : {} });
    } catch (e) { btn.disabled = false; btn.innerHTML = "📡 Tạo phòng trực tuyến"; return U.toast("Không tạo được phòng: " + FB.errMsg(e), "err", 5000); }
    S.room = { pin };
    const stage = makeStage(S, "st-" + S.game.id + " st-online");
    const ctx = makeCtx(S, cfg, items, stage); ctx.room = S.room; ctx.roomQs = qs;
    ctx.exit = async () => { if (await U.confirm("Đóng phòng và thoát?", { ok: "Đóng phòng", danger: true })) { teardown(S, true); renderSetup(S); } };
    const players = await GK.lobby(stage, ctx, S);
    if (!players) return;
    stage.innerHTML = "";
    await Room.setStatus(pin, "playing");
    S.ctrl = S.game.host(stage, ctx, players) || null;
  }

  GK.lobby = (stage, ctx, S) => new Promise((resolve) => {
    const pin = ctx.room.pin, game = ctx.game, teamMode = game.onlineKind === "tug";
    const url = location.href.split("#")[0] + "#/join/" + pin;
    GK.hud(stage, ctx, { title: game.name + " · Phòng chờ" });
    const body = h(`<div class="lobby">
      <div class="lb-left">
        <div class="lb-card">
          <div class="lb-step">① Mở trên điện thoại / máy tính</div>
          <div class="lb-url">${esc(url.replace(/^https?:\/\//, "").replace(/\/join\/\d+$/, "/join"))}</div>
          <div class="lb-step">② Nhập mã PIN</div>
          <div class="lb-pin">${pin.split("").map((d, i) => `<span style="--i:${i}">${d}</span>`).join("")}</div>
          <div class="lb-qr" id="qr"></div>
          <button class="btn btn-sm btn-ghost" id="cpy">📋 Sao chép đường link</button>
          ${location.protocol === "file:" ? `<p class="lb-warn">⚠️ Bạn đang mở web từ file trên máy. Học sinh chỉ vào được khi web được đưa lên hosting (Firebase Hosting / GitHub Pages…).</p>` : ""}
        </div>
      </div>
      <div class="lb-right">
        <div class="lb-top"><h2><span id="pc">0</span> người chơi</h2><span class="muted">Bấm vào tên để ${teamMode ? "đổi đội / " : ""}mời ra</span>
          <button class="btn btn-xl btn-fun btn-3d" id="startBtn" disabled>▶ Bắt đầu</button></div>
        <div class="lb-players ${teamMode ? "teams" : ""}" id="plist">${teamMode ? `<div class="lb-team" style="--tc:${U.TEAM_COLORS[0]}"><h3>🔴 ${U.TEAM_NAMES[0]} <small id="tc0">0</small></h3><div class="lt-b" id="t0"></div></div><div class="lb-team" style="--tc:${U.TEAM_COLORS[1]}"><h3>🔵 ${U.TEAM_NAMES[1]} <small id="tc1">0</small></h3><div class="lt-b" id="t1"></div></div>` : ""}</div>
        <div class="lb-wait" id="wait"><div class="dots3"><i></i><i></i><i></i></div>Đang chờ người chơi tham gia…</div>
      </div></div>`);
    stage.appendChild(body);
    U.loadScript(U.QR_URL).then(() => { try { new QRCode($("#qr", body), { text: url, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { } }).catch(() => ($("#qr", body).innerHTML = ""));
    $("#cpy", body).onclick = () => { navigator.clipboard && navigator.clipboard.writeText(url); U.toast("Đã sao chép link tham gia", "ok"); };
    let players = {};
    const seen = new Set();
    const off = Room.watchPlayers(pin, (ps) => {
      players = ps || {};
      const arr = Object.entries(players).map(([pid, p]) => Object.assign({ pid }, p));
      $("#pc", body).textContent = arr.length;
      $("#startBtn", body).disabled = !arr.length;
      $("#wait", body).classList.toggle("hide", !!arr.length);
      const chip = (p) => `<button class="pchip ${seen.has(p.pid) ? "" : "new"} ${p.online === false ? "off" : ""}" data-pid="${p.pid}"><span class="pc-ava">${p.avatar || "🙂"}</span>${esc(p.name)}</button>`;
      if (teamMode) {
        [0, 1].forEach((t) => { const list = arr.filter((p) => (p.team || 0) === t); $("#t" + t, body).innerHTML = list.map(chip).join(""); $("#tc" + t, body).textContent = list.length; });
      } else $("#plist", body).innerHTML = arr.map(chip).join("");
      arr.forEach((p) => { if (!seen.has(p.pid)) { seen.add(p.pid); U.Sound.pop(); } });
      $$(".pchip", body).forEach((b) => (b.onclick = async () => {
        const p = players[b.dataset.pid]; if (!p) return;
        if (teamMode) {
          const m = U.modal({ title: esc(p.name), size: "sm", body: "Bạn muốn làm gì?", actions: [{ label: "Đổi đội", cls: "btn-primary", value: "swap" }, { label: "Mời ra", cls: "btn-danger", value: "kick" }] });
          const a = await m.result;
          if (a === "swap") Room.updatePlayer(pin, b.dataset.pid, { team: (p.team || 0) ? 0 : 1 });
          if (a === "kick") Room.kick(pin, b.dataset.pid);
        } else if (await U.confirm(`Mời <b>${esc(p.name)}</b> ra khỏi phòng?`, { ok: "Mời ra", danger: true })) Room.kick(pin, b.dataset.pid);
      }));
    });
    S.cleanups.push(off);
    $("#startBtn", body).onclick = () => { off(); S.cleanups = S.cleanups.filter((f) => f !== off); resolve(Object.entries(players).map(([pid, p]) => Object.assign({ pid }, p))); };
  });

  /* Đội/nhân vật mặc định cho game cần figure */
  GK.ranking = (arr, key) => arr.slice().sort((a, b) => (b[key || "score"] - a[key || "score"]));
})();
