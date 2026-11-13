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
    def = Object.assign({ modes: ["local", "online"], types: ["MC", "TF", "SA"], fields: [], tags: [], colors: ["#6c4cf5", "#ff5c9d"], order: 50 }, def);
    if (Array.isArray(def.modes) && !def.modes.includes("online")) {
      def.modes = def.modes.concat(["online"]);
    }
    if (!def.onlineKind) def.onlineKind = "race";
    if (!def.host) {
      def.host = (stage, ctx, players) => GK.defaultOnlineHost(stage, ctx, players);
    }
    Games.list.push(def); Games.list.sort((a, b) => a.order - b.order);
  };
  Games.get = (id) => Games.list.find((g) => g.id === id);
  Games.enabled = () => Games.list.filter((g) => DB.gameCfg(g.id).enabled !== false);
  Games.comingSoon = (arr) => (Games.soon = arr);
  window.Games = Games;

  const GK = {};
  window.GameKit = GK;

  GK.isStudentPractice = () => {
    const q = (window.App && typeof App.query === "function") ? App.query() : {};
    const urlParams = new URLSearchParams(window.location.search || "");
    const inUrl = q.studentPractice === "1" || urlParams.get("studentPractice") === "1";
    if (inUrl) {
      try { sessionStorage.setItem("qmath_student_practice", "1"); } catch (e) {}
      return true;
    }
    // Nếu URL hoàn toàn không có studentPractice=1 và không phải đang trong trang game studentPractice thì xoá cờ cũ
    const hash = String(window.location.hash || "");
    if (!hash.includes("studentPractice=1")) {
      try { sessionStorage.removeItem("qmath_student_practice"); } catch (e) {}
      return false;
    }
    return true;
  };

  GK.getStudentPracticeRoomInfo = () => {
    const q = (window.App && typeof App.query === "function") ? App.query() : {};
    const urlParams = new URLSearchParams(window.location.search || "");
    const metaRaw = (function () { try { return JSON.parse(localStorage.getItem("gfe_student_practice_meta") || "null"); } catch (e) { return null; } })();
    const pin = q.room || urlParams.get("room") || (metaRaw && metaRaw.roomPin) || "";
    const pid = q.pid || urlParams.get("pid") || (metaRaw && metaRaw.pid) || "";
    const playerName = (metaRaw && metaRaw.playerName) || "";
    return { pin: String(pin || "").trim(), pid: String(pid || "").trim(), playerName, metaRaw };
  };

  GK.getStudentPracticeBackUrl = () => {
    const info = GK.getStudentPracticeRoomInfo();
    try {
      if (info.pin) {
        sessionStorage.setItem("qmath_user_exited_game_pin", String(info.pin));
        sessionStorage.setItem("qmath_user_exited_ts", String(Date.now()));
      }
    } catch (e) {}
    return "../practice.html?mode=game" + (info.pin ? "&room=" + encodeURIComponent(info.pin) : "") + "&exitGame=1";
  };

  GK.returnToStudentPractice = (S) => {
    try {
      if (S) teardown(S, false);
    } catch (e) {}
    window.location.href = GK.getStudentPracticeBackUrl();
  };

  /* ---------------- Cấu hình Máy AI (Bot Đối Thủ Khi Chơi Solo) ---------------- */
  GK.BOT_PROFILES = {
    easy:   { id: "easy",   name: "Máy Tập Sự",     short: "Dễ",         icon: "🐣", acc: 0.45, minSec: 6.5, maxSec: 10.5, color: "#10b981", desc: "Đúng ~45% · 6.5–10.5s/câu" },
    normal: { id: "normal", name: "Máy Thông Minh", short: "Trung bình", icon: "🤖", acc: 0.68, minSec: 4.5, maxSec: 7.8,  color: "#3b82f6", desc: "Đúng ~68% · 4.5–7.8s/câu" },
    hard:   { id: "hard",   name: "Máy Cao Thủ",    short: "Khó",        icon: "🔥", acc: 0.82, minSec: 3.0, maxSec: 5.2,  color: "#f59e0b", desc: "Đúng ~82% · 3.0–5.2s/câu" },
    insane: { id: "insane", name: "Máy Siêu Cấp",   short: "Siêu cấp",   icon: "👑", acc: 0.92, minSec: 2.0, maxSec: 3.8,  color: "#ef4444", desc: "Đúng ~92% · 2.0–3.8s/câu" }
  };

  GK.getBotDifficulty = () => {
    const q = (window.App && typeof App.query === "function") ? App.query() : {};
    const urlParams = new URLSearchParams(window.location.search || "");
    const metaRaw = (function () { try { return JSON.parse(localStorage.getItem("gfe_student_practice_meta") || "null"); } catch (e) { return null; } })();
    let saved = "";
    try { saved = localStorage.getItem("qmath_solo_bot_diff") || ""; } catch (e) {}
    const d = String(q.botDiff || urlParams.get("botDiff") || (metaRaw && metaRaw.botDifficulty) || saved || "normal").toLowerCase().trim();
    return GK.BOT_PROFILES[d] ? d : "normal";
  };

  GK.setBotDifficulty = (diff) => {
    const valid = GK.BOT_PROFILES[diff] ? diff : "normal";
    try {
      localStorage.setItem("qmath_solo_bot_diff", valid);
      const metaRaw = JSON.parse(localStorage.getItem("gfe_student_practice_meta") || "null");
      if (metaRaw) {
        metaRaw.botDifficulty = valid;
        localStorage.setItem("gfe_student_practice_meta", JSON.stringify(metaRaw));
      }
    } catch (e) {}
    return GK.BOT_PROFILES[valid];
  };

  GK.getBotProfile = (diff) => GK.BOT_PROFILES[diff || GK.getBotDifficulty()] || GK.BOT_PROFILES.normal;

  GK.renderBotPanelCard = (boxEl, botState, ctx, onDiffChanged) => {
    if (!boxEl) return;
    const prof = GK.getBotProfile(ctx && ctx.cfg && ctx.cfg.botDifficulty);
    const qNum = botState.n || 1;
    const cor = botState.botCor || 0;
    const wr = botState.botWr || 0;
    const statusHtml = botState.lastStatusHtml || `<span style="color:#4338ca;font-weight:700">🧠 ${esc(prof.name)} đang suy nghĩ câu hỏi #${qNum}...</span>`;
    const thinkMs = botState.thinkMs || 5000;
    const isThinking = botState.phase === "thinking";
    const diffs = ["easy", "normal", "hard", "insane"];

    boxEl.innerHTML = `<div class="qm-bot-arena" style="padding:14px;display:flex;flex-direction:column;gap:12px;height:100%;box-sizing:border-box;justify-content:space-between;background:linear-gradient(180deg,rgba(99,102,241,0.06),rgba(139,92,246,0.03));border-radius:14px">
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:rgba(255,255,255,0.85);padding:10px 12px;border-radius:12px;border:1.5px solid rgba(99,102,241,0.22)">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:42px;height:42px;border-radius:12px;background:${prof.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 10px rgba(0,0,0,0.12)">${prof.icon}</div>
            <div>
              <div style="font-weight:800;font-size:14px;color:#1e1b4b">${esc(prof.name)} (${esc(prof.short)})</div>
              <div style="font-size:11.5px;color:#475569;font-weight:600">${esc(prof.desc)}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;font-size:12px;font-weight:800">
            <span style="padding:4px 8px;border-radius:8px;background:#dcfce7;color:#166534">✓ Đúng: ${cor}</span>
            <span style="padding:4px 8px;border-radius:8px;background:#fee2e2;color:#991b1b">✗ Sai: ${wr}</span>
          </div>
        </div>

        <div style="background:rgba(255,255,255,0.85);padding:9px 12px;border-radius:12px;border:1px solid rgba(148,163,184,0.3)">
          <div style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px">⚙️ Chọn độ khó của Máy ngay trong trận:</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">
            ${diffs.map((k) => {
              const pr = GK.BOT_PROFILES[k];
              const act = pr.id === prof.id;
              return `<button type="button" data-botdiff="${pr.id}" style="padding:6px 4px;border-radius:9px;font-size:11px;font-weight:${act ? "800" : "700"};border:${act ? "2px solid " + pr.color : "1px solid #cbd5e1"};background:${act ? "rgba(99,102,241,0.12)" : "#fff"};color:#1e293b;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px">
                <span style="font-size:15px">${pr.icon}</span>
                <span>${esc(pr.short)}</span>
              </button>`;
            }).join("")}
          </div>
        </div>

        <div style="background:rgba(255,255,255,0.92);padding:14px;border-radius:14px;border:1.5px dashed rgba(99,102,241,0.35);text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center">
          <div style="font-size:12px;font-weight:800;padding:3px 10px;border-radius:99px;background:#e0e7ff;color:#3730a3">Câu thứ #${qNum} của Máy</div>
          <div style="font-size:13.5px;line-height:1.45">${statusHtml}</div>
          <div style="width:100%;height:8px;border-radius:99px;background:#e2e8f0;overflow:hidden;margin-top:2px">
            <div class="qm-bot-pbar" style="height:100%;width:${isThinking ? "8%" : "100%"};background:linear-gradient(90deg,${prof.color},#6366f1);border-radius:99px;transition:${isThinking ? `width ${Math.max(400, thinkMs - 120)}ms linear` : "width 0.2s ease"}"></div>
          </div>
        </div>
      </div>

      <div style="font-size:11.5px;color:#64748b;background:rgba(241,245,249,0.9);padding:8px 10px;border-radius:10px;text-align:center;line-height:1.4;border:1px solid rgba(203,213,225,0.6)">
        🔒 <b>Chế độ Công Bằng:</b> Nội dung câu hỏi & đáp án của Máy được ẩn hoàn toàn để Đội 1 không nhìn thấy mà bắt chước đáp án.
      </div>
    </div>`;

    if (isThinking) {
      requestAnimationFrame(() => {
        const bar = boxEl.querySelector(".qm-bot-pbar");
        if (bar) bar.style.width = "100%";
      });
    }

    boxEl.querySelectorAll("button[data-botdiff]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const newDiff = btn.getAttribute("data-botdiff");
        const newProf = GK.setBotDifficulty(newDiff);
        if (ctx && ctx.cfg) ctx.cfg.botDifficulty = newProf.id;
        if (ctx && Array.isArray(ctx.teams)) {
          ctx.teams.forEach((t, idx) => {
            if (t.isBot) {
              t.botDiff = newProf.id;
              t.icon = newProf.icon;
              t.name = `${newProf.icon} ${newProf.name} (${newProf.short})`;
              const panelNameEl = document.querySelector(`.tpanel[data-t="${idx}"] .tp-name`);
              if (panelNameEl) panelNameEl.textContent = t.name;
              const laneNameEl = document.querySelector(`.lane[data-i="${idx}"] .lane-tag b`);
              if (laneNameEl) laneNameEl.textContent = t.name;
              const tugNameEl = document.querySelectorAll(".tug .tg-score .ts span")[idx];
              if (tugNameEl) tugNameEl.textContent = t.name;
              const ncNameEl = document.querySelectorAll(".nc-race .nc-lane .nc-nm")[idx];
              if (ncNameEl) ncNameEl.textContent = t.name;
            }
          });
        }
        const hudBtn = document.getElementById("hudBotDiffBtn");
        if (hudBtn) hudBtn.innerHTML = `🤖 Đấu Máy: ${esc(newProf.icon + " " + newProf.short)} ▾`;
        U.toast(`🤖 Đã chuyển độ khó của Máy sang: ${newProf.icon} ${newProf.name} (${newProf.short})`, "ok", 2000);
        GK.renderBotPanelCard(boxEl, botState, ctx, onDiffChanged);
        if (typeof onDiffChanged === "function") onDiffChanged(newProf);
      };
    });
  };

  /* ---------------- Cấu hình mặc định ---------------- */
  function defaults(game) {
    const c = {
      mode: game.modes[0], teamCount: 2, teamNames: U.TEAM_NAMES.slice(),
      shuffleQ: true, shuffleA: true, explain: false, types: game.types.slice(), limit: 0,
      onlineDurationMinutes: 15, onlineOpenTime: "", onlineMaxPlayers: 40, onlineSelfPaced: true,
      botOpponent: false, botDifficulty: GK.getBotDifficulty()
    };
    game.fields.forEach((f) => {
      if (f.type === "teams") c.teamCount = f.def || f.min || 2;
      else c[f.key] = typeof f.def === "function" ? f.def() : f.def;
    });
    const gc = DB.gameCfg(game.id);
    c.source = gc.setId && DB.findSet(gc.setId)
      ? { kind: "set", setId: gc.setId }
      : (DB.source === "local-file" && DB.questions.length ? { kind: "local" } : { kind: "none" });
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
    if (c.source && c.source.kind === "all") c.source = d.source;
    if (c.source && c.source.kind === "local" && (DB.source !== "local-file" || !DB.questions.length)) c.source = d.source;
    if (!game.modes.includes(c.mode)) c.mode = game.modes[0];
    c.types = (c.types || []).filter((t) => game.types.includes(t)); if (!c.types.length) c.types = game.types.slice();
    return c;
  }
  GK.teamsOf = (cfg) => Array.from({ length: cfg.teamCount }, (_, i) => {
    const isBot = Boolean(cfg.botOpponent && i >= 1);
    const prof = isBot ? GK.getBotProfile(cfg.botDifficulty) : null;
    const rawName = (cfg.teamNames[i] || U.TEAM_NAMES[i]).trim() || U.TEAM_NAMES[i];
    return {
      name: isBot ? `${prof.icon} ${prof.name} (${prof.short})` : rawName,
      color: U.TEAM_COLORS[i],
      i,
      isBot,
      botDiff: isBot ? prof.id : null,
      icon: isBot ? prof.icon : ""
    };
  });

  /* ---------------- Trang game ---------------- */
  async function launchStudentPracticeDirect(S) {
    const { game } = S;
    document.body.classList.add("is-student-practice");
    document.body.classList.remove("drawer-open", "m-open");
    const roomInfo = GK.getStudentPracticeRoomInfo();
    S.studentRoomPin = roomInfo.pin || "";
    S.studentPid = roomInfo.pid || "";
    S.studentPlayerName = roomInfo.playerName || (window.FB && typeof FB.name === "function" ? FB.name() : "Bạn");

    const backUrl = GK.getStudentPracticeBackUrl();
    const tbBack = document.querySelector('.topbar a[href="../dashboard.html"], .topbar a[href*="practice.html"]');
    if (tbBack) {
      tbBack.href = backUrl;
      tbBack.title = "Quay lại chọn câu hỏi / Phòng luyện tập";
      tbBack.innerHTML = '⬅️ <span class="hide-sm">Quay lại chọn câu hỏi</span>';
    }
    const brandLink = document.querySelector(".topbar .brand");
    if (brandLink) {
      brandLink.href = backUrl;
    }

    // Nếu vào từ phòng nhóm MOBA hoặc phòng mã PIN mà chưa nạp câu hỏi vào DB localFile thì lấy từ Room
    if (S.studentRoomPin) {
      try {
        const roomQs = await Room.getQuestions(S.studentRoomPin);
        if (Array.isArray(roomQs) && roomQs.length > 0 && (!DB.questions || !DB.questions.length)) {
          await DB.useLocalFile(roomQs);
        }
      } catch (e) {}
    }

    const cfg = loadCfg(game, null);
    cfg.source = { kind: "all" };
    cfg.mode = "local";
    cfg.explain = true;
    cfg.types = game.types.slice();

    const tf = game.fields.find((f) => f.type === "teams");
    if (tf) {
      if ((tf.min || 1) <= 1) {
        cfg.teamCount = 1;
        cfg.botOpponent = false;
        cfg.teamNames = [S.studentPlayerName || "Bạn"];
      } else {
        const botProf = GK.getBotProfile();
        cfg.teamCount = 2;
        cfg.botOpponent = true;
        cfg.botDifficulty = botProf.id;
        cfg.teamNames = [S.studentPlayerName || "Bạn", `${botProf.icon} ${botProf.name} (${botProf.short})`];
      }
    }

    let items = [];
    if (S.studentRoomPin) {
      try {
        const rqs = await Room.getQuestions(S.studentRoomPin);
        if (Array.isArray(rqs) && rqs.length > 0) {
          // rqs có thể đã ở dạng chuẩn hoá (stem, options, answer) hoặc thô (Question, Options, CorrectAnswer)
          items = rqs[0] && rqs[0].stem ? rqs : Quiz.flatten(rqs, cfg.types);
        }
      } catch (e) {}
    }
    if (!items.length) {
      items = Quiz.flatten(DB.questionsFor(cfg.source), cfg.types);
    }
    const qTotal = items.length;
    if (game.fields.some((f) => f.key === "goal") && qTotal > 0) {
      cfg.goal = Math.min(30, Math.max(3, qTotal));
    }

    const needQ = !game.needsQuestions || game.needsQuestions(cfg);
    if (!items.length && needQ) {
      U.toast("Chưa có câu hỏi luyện tập — đang quay lại trang chọn câu hỏi...", "warn", 2500);
      setTimeout(() => GK.returnToStudentPractice(S), 900);
      return;
    }
    startLocal(S, cfg, items);
  }

  GK.page = (view, id) => {
    const game = Games.get(id);
    if (!game) { view.innerHTML = `<div class="page"><div class="empty"><span class="em-ic">🕵️</span><h2>Không tìm thấy trò chơi</h2><a class="btn btn-primary" href="#/">Về trang chủ</a></div></div>`; return; }
    const S = { game, view, ctrl: null, timers: null, room: null, cleanups: [] };
    const q = App.query();
    const urlParams = new URLSearchParams(window.location.search || "");
    S.studentPractice = GK.isStudentPractice();
    S.autoStart = q.autoStart === "1" || urlParams.get("autoStart") === "1";
    if (S.studentPractice) {
      launchStudentPracticeDirect(S);
      return () => teardown(S, true);
    }
    document.body.classList.remove("is-student-practice");
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

  /* ---------------- MÀN CẤU HÌNH (CHỈ DÀNH CHO GIÁO VIÊN) ---------------- */
  function renderSetup(S) {
    if (S.studentPractice || GK.isStudentPractice()) {
      GK.returnToStudentPractice(S);
      return;
    }
    const { game } = S;
    const cfg = loadCfg(game, S.preset ? S.preset.cfg : null);
    App.enterGame(false);
    const presets = DB.allPresets(game.id);
    const facets = DB.facets();
    const v = S.view;
    v.innerHTML = `<div class="page gsetup" style="--c1:#1e3a8a;--c2:#2563eb">
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
            <button data-mode="online" class="${game.modes.includes("online") ? "" : "hide"}"><i>📱</i><b>Trực tuyến (Tạo phòng PIN)</b><small>Tạo mã PIN, cài giờ mở đề & thời gian làm bài để gửi cho học sinh</small></button>
          </div>
        </div>
        <div class="gs-sec hide" id="onlineScheduleSec" style="background:linear-gradient(135deg,rgba(37,99,235,0.06),rgba(14,165,233,0.08));border:1.5px solid rgba(37,99,235,0.22);border-radius:14px;padding:14px 16px">
          <div style="font-weight:800;font-size:14px;color:var(--primary);margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <span>📡 Cài đặt Phòng Trò Chơi Mã PIN (Gửi Link / PIN cho Học sinh)</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">
            <div class="field">
              <label class="lbl">⏱ Thời gian luyện tập (phút, 0 = không giới hạn)</label>
              <input class="input" type="number" id="onlDur" min="0" max="180" value="${Number(cfg.onlineDurationMinutes ?? 15)}">
            </div>
            <div class="field">
              <label class="lbl">📅 Thời gian mở đề (Để trống = Mở ngay)</label>
              <input class="input" type="datetime-local" id="onlOpen" value="${esc(cfg.onlineOpenTime || "")}">
            </div>
            <div class="field">
              <label class="lbl">👥 Số học sinh tối đa trong phòng</label>
              <input class="input" type="number" id="onlMaxP" min="2" max="200" value="${Number(cfg.onlineMaxPlayers || 50)}">
            </div>
          </div>
          <label class="switch" style="margin-top:10px">
            <input type="checkbox" id="onlSelfPaced" ${cfg.onlineSelfPaced !== false ? "checked" : ""}>
            <span>Cho phép học sinh <b>tự làm bài / chơi trò chơi ngay khi đến giờ mở đề</b> (có thể bỏ qua câu hỏi để quay lại làm sau & vinh danh người chiến thắng)</span>
          </label>
        </div>
        <div class="gs-sec" data-local-only id="teamSec"></div>
        <div class="gs-sec gs-fields" id="fieldSec"></div>
        <div class="gs-sec">
          <span class="lbl">Nguồn câu hỏi cho trò chơi</span>
          <div class="qm-src-toolbar">
            <button type="button" class="qm-src-card bank-card" id="qmPickBankBtn">
              <div class="qm-src-ic">📚</div>
              <div class="qm-src-txt">
                <b>Chọn từ Ngân hàng QMath</b>
                <small>Lớp ➔ Phân môn ➔ Bài ➔ Dạng bài &amp; Xem trước</small>
              </div>
            </button>
            <button type="button" class="qm-src-card word-card" id="qmPickWordBtn">
              <div class="qm-src-ic">📄</div>
              <div class="qm-src-txt">
                <b>Đưa câu hỏi từ File Word (.docx)</b>
                <small>Nhận diện công thức MathType, hình ảnh &amp; đáp án</small>
              </div>
            </button>
            <button type="button" class="qm-src-card tex-card" id="qmPickTexBtn">
              <div class="qm-src-ic">📜</div>
              <div class="qm-src-txt">
                <b>Đưa câu hỏi từ File LaTeX (.tex)</b>
                <small>Đọc chuẩn ex_test (\choice, \choiceTF, \shortans)</small>
              </div>
            </button>
          </div>
          <div class="qm-word-help-row">
            <span>💡 Hỗ trợ trực tiếp file <b>Word (.docx)</b> và file <b>LaTeX (.tex)</b> chuẩn <code>ex_test</code> — xem hướng dẫn &amp; tải file mẫu:</span>
            <button type="button" class="qm-link-btn" id="qmWordGuideBtn">📘 Xem hướng dẫn (.docx / .tex) &amp; Tải mẫu</button>
          </div>
          <select class="select" id="srcSel">
            <option value="">-- Chọn bộ đề hoặc nguồn câu hỏi --</option>
            ${DB.source === "local-file" && DB.questions.length ? `<option value="local">📂 Bộ câu hỏi vừa nạp (${DB.questions.length} câu)</option>` : ""}
            ${DB.sets.map((s) => `<option value="set:${s.id}">🧩 ${esc(s.name)}${DB.gameCfg(game.id).setId === s.id ? " (được phân bổ)" : ""}</option>`).join("")}
            ${DB.questions.length ? `<option value="filter">🔎 Lọc theo môn / lớp / chương…</option>` : ""}
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
      const onlSec = $("#onlineScheduleSec", v);
      if (onlSec) onlSec.classList.toggle("hide", m !== "online");
      refreshVis();
      renderFields();
      $("#goBtn", v).innerHTML = m === "online" ? "📡 Tạo phòng PIN & Lấy Link gửi Học sinh" : "▶ Bắt đầu chơi";
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
    if (S.studentPractice) {
      cfg.source = { kind: "all" };
      cfg.mode = "local";
      cfg.explain = true;
      const metaRaw = (function () { try { return JSON.parse(localStorage.getItem("gfe_student_practice_meta") || "null"); } catch (e) { return null; } })();
      const qTotal = DB.bank().length;
      if (game.fields.some((f) => f.key === "goal") && qTotal > 0) {
        cfg.goal = Math.min(30, Math.max(3, qTotal));
      }
      const quotaHost = $("#qmQuotaHost", v);
      if (quotaHost) {
        quotaHost.innerHTML = `<div class="notice" style="margin:0 0 12px 0;background:linear-gradient(135deg,#ecfdf5,#f0fdf4);border:1.5px solid #10b981;color:#065f46;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-radius:14px;padding:12px 16px">
          <div>
            <div style="font-weight:800;font-size:14px;color:#047857">🎮 Luyện tập qua Trò chơi: ${esc((metaRaw && metaRaw.title) || ("Bộ " + qTotal + " câu hỏi Ngân hàng QMath"))}</div>
            <div style="font-size:12px;color:#065f46;margin-top:2px">Đã nạp <b>${qTotal} câu hỏi</b> theo Khối / Phân môn / Chuyên đề bạn chọn. Bấm <b>▶ Bắt đầu chơi</b> hoặc chỉnh số đội bên dưới!</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn btn-sm btn-ghost" href="../practice.html?mode=game" style="background:#ffffff;border:1.5px solid #10b981;color:#047857;font-weight:700;text-decoration:none">📚 Đổi bài học / Đổi Game</a>
            <a class="btn btn-sm btn-ghost" href="../student.html" style="background:#ffffff;border:1px solid #cbd5e1;color:#334155;font-weight:700;text-decoration:none">🏠 Về Góc học tập</a>
          </div>
        </div>`;
      }
    } else if (window.QMathBridge && typeof QMathBridge.renderSetupQuotaBanner === "function") {
      QMathBridge.renderSetupQuotaBanner($("#qmQuotaHost", v), game.name);
    }
    if (window.QMathBridge) {
      const applyCreatedSet = (savedSet) => {
        if (!savedSet) return;
        if (Array.isArray(savedSet)) {
          DB.useLocalFile(savedSet);
          cfg.source = { kind: "local" };
        } else if (savedSet.id) {
          cfg.source = { kind: "set", setId: savedSet.id };
        }
        U.store.set("cfg_" + game.id, cfg);
        renderSetup(S);
      };
      const pickBankBtn = $("#qmPickBankBtn", v);
      if (pickBankBtn) pickBankBtn.onclick = () => QMathBridge.openBankPickerModal({ game, onConfirm: applyCreatedSet });
      const pickWordBtn = $("#qmPickWordBtn", v);
      if (pickWordBtn) pickWordBtn.onclick = () => QMathBridge.quickImportWordForGame(game, applyCreatedSet);
      const pickTexBtn = $("#qmPickTexBtn", v);
      if (pickTexBtn) pickTexBtn.onclick = () => QMathBridge.quickImportWordForGame(game, applyCreatedSet, { accept: ".tex,.txt" });
      const wordGuideBtn = $("#qmWordGuideBtn", v);
      if (wordGuideBtn) wordGuideBtn.onclick = () => QMathBridge.openWordGuideModal(() => QMathBridge.quickImportWordForGame(game, applyCreatedSet));
    }

    const srcSel = $("#srcSel", v);
    srcSel.value = cfg.source.kind === "set"
      ? "set:" + cfg.source.setId
      : (cfg.source.kind === "local" && DB.source === "local-file" && DB.questions.length ? "local" : (cfg.source.kind === "filter" ? "filter" : ""));
    if (!srcSel.value && DB.source === "local-file" && DB.questions.length && srcSel.querySelector('option[value="local"]')) {
      srcSel.value = "local";
    }
    $$("#fltBox select", v).forEach((s) => { s.value = (cfg.source.filter || {})[s.dataset.f] || ""; s.onchange = updSrc; });
    $$("#typeBox input", v).forEach((c) => { c.checked = cfg.types.includes(c.value); c.onchange = updSrc; });
    srcSel.onchange = updSrc;
    function readSrc() {
      const val = srcSel.value;
      if (val === "local") return { kind: "local" };
      if (val.startsWith("set:")) return { kind: "set", setId: val.slice(4) };
      if (val === "filter") { const f = {}; $$("#fltBox select", v).forEach((s) => { if (s.value) f[s.dataset.f] = s.value; }); return { kind: "filter", filter: f }; }
      return { kind: "none" };
    }
    function updSrc() {
      cfg.source = readSrc();
      cfg.types = $$("#typeBox input:checked", v).map((c) => c.value);
      $("#fltBox", v).classList.toggle("hide", cfg.source.kind !== "filter");
      const raw = DB.questionsFor(cfg.source), items = Quiz.flatten(raw, cfg.types);
      const by = { MC: 0, TF: 0, SA: 0 }; items.forEach((i) => by[i.type]++);
      const noQ = game.needsQuestions && !game.needsQuestions(cfg);
      $("#srcInfo", v).closest(".gs-sec").classList.toggle("dimmed", !!noQ);
      if (noQ) {
        $("#srcInfo", v).innerHTML = `<span class="chip green">Chế độ này không cần câu hỏi</span>`;
      } else if (cfg.source.kind === "none") {
        $("#srcInfo", v).innerHTML = `<span class="muted">Chưa chọn nguồn câu hỏi — hãy chọn từ <strong style="color:#0f172a">Ngân hàng QMath</strong>, tải <strong style="color:#0f172a">File Word (.docx)</strong>, tải <strong style="color:#0f172a">File LaTeX (.tex)</strong> hoặc chọn một <strong style="color:#0f172a">Bộ đề</strong>.</span>`;
      } else {
        $("#srcInfo", v).innerHTML = `<b class="${items.length ? "" : "warn"}">${items.length}</b> câu dùng được <span class="muted">(MC ${by.MC} · TF ${by.TF} · SA ${by.SA})</span>`;
      }
    }
    updSrc();

    $("#oShQ", v).checked = cfg.shuffleQ; $("#oShA", v).checked = cfg.shuffleA; $("#oExp", v).checked = cfg.explain;
    setMode(cfg.mode);

    const collect = () => {
      cfg.shuffleQ = $("#oShQ", v).checked;
      cfg.shuffleA = $("#oShA", v).checked;
      cfg.explain = $("#oExp", v).checked;
      if ($("#onlDur", v)) cfg.onlineDurationMinutes = Math.max(0, Number($("#onlDur", v).value || 0));
      if ($("#onlOpen", v)) cfg.onlineOpenTime = ($("#onlOpen", v).value || "").trim();
      if ($("#onlMaxP", v)) cfg.onlineMaxPlayers = Math.max(2, Number($("#onlMaxP", v).value || 50));
      if ($("#onlSelfPaced", v)) cfg.onlineSelfPaced = $("#onlSelfPaced", v).checked;
      updSrc();
      return cfg;
    };
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
      if (window.QMathBridge && !S.studentPractice && typeof QMathBridge.consumeGameQuota === "function") {
        const quotaRes = await QMathBridge.consumeGameQuota(game.name);
        if (!quotaRes.allowed) return;
      }
      if (cfg.limit > 0) items = U.shuffle(items).slice(0, cfg.limit);
      U.store.set("cfg_" + game.id, cfg);
      U.Sound.click();
      if (cfg.mode === "online") startOnline(S, cfg, items); else startLocal(S, cfg, items);
    };
    if (S.autoStart) {
      S.autoStart = false;
      try {
        history.replaceState(null, "", "#/game/" + game.id + (S.studentPractice ? "?studentPractice=1" : ""));
      } catch (e) {}
      setTimeout(() => {
        const btn = $("#goBtn", v);
        if (btn && !S.ctrl) btn.click();
      }, 150);
    }
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
    parts.push("📚 " + (src.kind === "set" ? "Bộ đề: " + ((DB.findSet(src.setId) || {}).name || "?") : src.kind === "filter" ? "Lọc: " + Object.values(src.filter || {}).join(" · ") : src.kind === "local" ? "Bộ câu hỏi vừa nạp" : "Chưa chọn nguồn"));
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
    const isStu = GK.isStudentPractice();
    const ov = h(`<div class="res-ov"><div class="res-card">
      <div class="res-head"><div class="sum-ic">${o.icon || "🎉"}</div><h2>${o.title}</h2><p>${o.sub || ""}</p></div>
      <div class="sum-body">${o.html || ""}</div>
      <div class="res-actions">
        <button class="btn btn-lg btn-fun btn-3d" data-a="again">↻ Chơi lại</button>
        <button class="btn btn-lg btn-primary" data-a="setup">${isStu ? "📚 Quay lại chọn câu hỏi" : "⚙️ Đổi cấu hình"}</button>
        <button class="btn btn-lg btn-ghost" data-a="close">✕ Đóng</button>
      </div></div></div>`);
    ctx.stage.appendChild(ov);
    $("[data-a=again]", ov).onclick = () => { ov.remove(); ctx.replay(); };
    $("[data-a=setup]", ov).onclick = () => {
      if (isStu) return GK.returnToStudentPractice();
      ctx.exit(false);
    };
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
      studentPractice: S.studentPractice,
      studentRoomPin: S.studentRoomPin || "",
      studentPid: S.studentPid || "",
      finish: (res) => finish(S, ctx, res),
      exit: (ask) => exitStage(S, ask),
      replay: () => { teardownGame(S); startLocal(S, cfg, items); }
    };
    return ctx;
  }
  function teardownGame(S) { try { S.ctrl && S.ctrl.destroy && S.ctrl.destroy(); } catch (e) { } S.ctrl = null; S.timers && S.timers.clear(); }
  async function exitStage(S, ask) {
    const isStu = S.studentPractice || GK.isStudentPractice();
    const msg = isStu ? "Quay lại trang cấu hình chọn câu hỏi / phòng luyện tập?" : "Thoát khỏi trận đấu hiện tại?";
    if (ask !== false && !(await U.confirm(msg, { ok: isStu ? "Quay lại" : "Thoát", danger: !isStu }))) return;
    if (isStu) {
      GK.returnToStudentPractice(S);
      return;
    }
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
    const isStu = (ctx && ctx.studentPractice) || GK.isStudentPractice();
    const roomPin = (ctx && ctx.studentRoomPin) || (GK.getStudentPracticeRoomInfo().pin);
    const roomBadge = (isStu && roomPin)
      ? `<span class="chip green" style="font-weight:800;margin-right:6px" title="Đang chơi trong phòng nhóm PIN ${esc(roomPin)}">👥 Phòng #${esc(roomPin)}</span>`
      : "";
    const hasBot = Boolean(ctx && ctx.cfg && ctx.cfg.botOpponent);
    const botProf = hasBot ? GK.getBotProfile(ctx.cfg.botDifficulty) : null;
    const botBadge = hasBot
      ? `<button type="button" class="chip" id="hudBotDiffBtn" style="font-weight:800;margin-right:6px;background:rgba(79,70,229,0.22);border:1.5px solid rgba(165,180,252,0.75);color:#fff;cursor:pointer;padding:4px 10px" title="Bấm để đổi độ khó của Máy AI">🤖 Đấu Máy: ${esc(botProf.icon + " " + botProf.short)} ▾</button>`
      : "";
    const exitLabel = isStu
      ? `<button class="hud-btn" data-a="exit" title="Quay lại chọn câu hỏi" style="width:auto;padding:0 12px;gap:6px;font-weight:700;font-size:13px">← <span class="hide-sm">Chọn câu hỏi</span></button>`
      : `<button class="hud-btn" data-a="exit" title="Thoát">←</button>`;
    const el = h(`<div class="hud">
      ${exitLabel}
      <div class="hud-title"><span class="hud-ic">${ctx.game.icon}</span><b>${esc(o.title || ctx.game.name)}</b></div>
      <div class="hud-mid">${roomBadge}${botBadge}${o.mid || ""}</div>
      <div class="hud-right">${o.right || ""}
        <button class="hud-btn hud-music ${U.Music.on ? "on" : ""}" data-a="music" title="Nhạc nền (bật/tắt)">🎵</button>
        <button class="hud-btn" data-a="mute" title="Tuỳ chọn âm thanh">${U.Sound.muted ? "🔇" : "🔊"}</button>
        <button class="hud-btn" data-a="fs" title="Toàn màn hình">⛶</button>
      </div></div>`);
    stage.prepend(el);
    $("[data-a=exit]", el).onclick = () => ctx.exit();
    const botBtn = $("#hudBotDiffBtn", el);
    if (botBtn) {
      botBtn.onclick = () => {
        const curId = (ctx.cfg && ctx.cfg.botDifficulty) || GK.getBotDifficulty();
        const body = h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0">
          ${["easy", "normal", "hard", "insane"].map((k) => {
            const pr = GK.BOT_PROFILES[k];
            const act = pr.id === curId;
            return `<button type="button" data-pickbot="${pr.id}" style="padding:12px;border-radius:14px;border:${act ? "2.5px solid " + pr.color : "1.5px solid #cbd5e1"};background:${act ? "rgba(99,102,241,0.1)" : "#fff"};cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px">
              <span style="font-size:28px">${pr.icon}</span>
              <div>
                <div style="font-weight:800;font-size:14px;color:#0f172a">${esc(pr.name)} (${esc(pr.short)})</div>
                <div style="font-size:12px;color:#475569;margin-top:2px">${esc(pr.desc)}</div>
              </div>
            </button>`;
          }).join("")}
        </div>`);
        const m = U.modal({ title: "🤖 Chọn Độ Khó Của Máy AI", size: "md", body, actions: [{ label: "Đóng", cls: "btn-ghost" }] });
        $$("button[data-pickbot]", body).forEach((b) => {
          b.onclick = () => {
            const np = GK.setBotDifficulty(b.getAttribute("data-pickbot"));
            if (ctx.cfg) ctx.cfg.botDifficulty = np.id;
            if (Array.isArray(ctx.teams)) {
              ctx.teams.forEach((t, idx) => {
                if (t.isBot) {
                  t.botDiff = np.id;
                  t.icon = np.icon;
                  t.name = `${np.icon} ${np.name} (${np.short})`;
                  const panelNameEl = stage.querySelector(`.tpanel[data-t="${idx}"] .tp-name`);
                  if (panelNameEl) panelNameEl.textContent = t.name;
                  const laneNameEl = stage.querySelector(`.lane[data-i="${idx}"] .lane-tag b`);
                  if (laneNameEl) laneNameEl.textContent = t.name;
                  const tugNameEl = stage.querySelectorAll(".tug .tg-score .ts span")[idx];
                  if (tugNameEl) tugNameEl.textContent = t.name;
                  const ncNameEl = stage.querySelectorAll(".nc-race .nc-lane .nc-nm")[idx];
                  if (ncNameEl) ncNameEl.textContent = t.name;
                  const dgNameEl = stage.querySelector(`.dg-team[data-t="${idx}"] b`);
                  if (dgNameEl) dgNameEl.textContent = t.name;
                  const olNameEl = stage.querySelector(`.ol-cst[data-c="${idx}"] .ol-cname b`);
                  if (olNameEl) olNameEl.textContent = t.name;
                  const botBox = stage.querySelector(`.tpanel[data-t="${idx}"] .tp-q`);
                  if (botBox && t._botState) GK.renderBotPanelCard(botBox, t._botState, ctx);
                }
              });
            }
            botBtn.innerHTML = `🤖 Đấu Máy: ${esc(np.icon + " " + np.short)} ▾`;
            U.toast(`🤖 Đã đổi độ khó Máy thành: ${np.icon} ${np.name} (${np.short})`, "ok", 2200);
            m.close();
          };
        });
      };
    }
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
    const P = teams.map((t, i) => {
      const pObj = {
        queue: Quiz.queue(ctx.items, { shuffleQ: ctx.cfg.shuffleQ, shuffleA: ctx.cfg.shuffleA }),
        ctrl: null,
        botTimer: null,
        frozen: 0,
        el: host.querySelector(`.tpanel[data-t="${i}"]`),
        n: 0,
        botCor: 0,
        botWr: 0,
        phase: "idle",
        thinkMs: 5000,
        lastStatusHtml: ""
      };
      if (t.isBot) t._botState = pObj;
      return pObj;
    });
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
    P.forEach((p, i) => {
      if (!teams[i].isBot) $(".tp-h", p.el).onclick = () => zoom(i);
      else {
        const zBtn = $(".tp-zoom", p.el);
        if (zBtn) zBtn.remove();
        GK.renderBotPanelCard($(".tp-q", p.el), p, ctx);
      }
    });
    back.onclick = () => zoom(zoomed);
    const onKey = (e) => { if (e.key === "Escape" && zoomed >= 0 && !document.querySelector(".modal-wrap,.lbx")) zoom(zoomed); };
    document.addEventListener("keydown", onKey);
    function next(i) {
      if (over) return;
      const p = P[i]; p.ctrl && p.ctrl.destroy();
      p.botTimer && ctx.timers.stop(p.botTimer);
      p.n++;
      if (teams[i] && teams[i].isBot) {
        const prof = GK.getBotProfile(ctx.cfg && ctx.cfg.botDifficulty);
        const thinkSec = prof.minSec + Math.random() * Math.max(0.5, prof.maxSec - prof.minSec);
        const thinkMs = Math.round(thinkSec * 1000);
        p.phase = "thinking";
        p.thinkMs = thinkMs;
        p.lastStatusHtml = `<span style="color:#4338ca;font-weight:800">🧠 ${esc(prof.name)} đang giải câu #${p.n}...</span>`;
        GK.renderBotPanelCard($(".tp-q", p.el), p, ctx);
        p.botTimer = ctx.timers.after(thinkMs, () => {
          if (over) return;
          const curProf = GK.getBotProfile(ctx.cfg && ctx.cfg.botDifficulty);
          const ok = Math.random() < curProf.acc;
          p.phase = "done";
          if (ok) {
            p.botCor++;
            p.lastStatusHtml = `<span style="color:#15803d;font-weight:800">✅ Câu #${p.n}: ${esc(curProf.name)} trả lời ĐÚNG! (+1 bước)</span>`;
          } else {
            p.botWr++;
            p.lastStatusHtml = `<span style="color:#b91c1c;font-weight:800">❌ Câu #${p.n}: ${esc(curProf.name)} trả lời SAI! ${o.freeze > 0 ? `(Đóng băng ${o.freeze}s ❄️)` : ""}</span>`;
          }
          GK.renderBotPanelCard($(".tp-q", p.el), p, ctx);
          handle(i, { ok, points: ok ? 1 : 0 }, null);
        });
        return;
      }
      const item = p.queue.next();
      p.ctrl = Quiz.mount($(".tp-q", p.el), item, { compact: true, keypad: o.keypad, num: p.n, explain: ctx.cfg.explain, autofocus: zoomed === i || teams.filter((t) => !t.isBot).length === 1, onAnswer: (res) => handle(i, res, item) });
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
      stop() { over = true; if (zoomed >= 0) zoom(zoomed); P.forEach((p) => { p.botTimer && ctx.timers.stop(p.botTimer); p.ctrl && p.ctrl.lock(); }); },
      destroy() { over = true; document.body.classList.remove("has-zoom"); document.removeEventListener("keydown", onKey); P.forEach((p) => { p.botTimer && ctx.timers.stop(p.botTimer); p.ctrl && p.ctrl.destroy(); }); },
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
    const isStu = S.studentPractice || GK.isStudentPractice();
    const stuRoom = GK.getStudentPracticeRoomInfo();
    const stuPin = S.studentRoomPin || stuRoom.pin || "";
    const stuPid = S.studentPid || stuRoom.pid || "";
    const backUrl = GK.getStudentPracticeBackUrl();

    const R = res.ranking || [];
    const unit = res.unit || "điểm";
    const winner = R[0];
    const tie = R.length > 1 && R[0].score === R[1].score && !res.noTie;
    const fig = (r, i) => r.figure || (ctx.game.figure ? ctx.game.figure(r.color, i) : `<div class="pod-ava" style="background:${r.color}">${r.avatar || esc((r.name || "?").charAt(0))}</div>`);
    const podOrder = [1, 0, 2].filter((i) => R[i]);
    const ov = h(`<div class="res-ov"><div class="res-card">
      <div class="res-rays"></div>
      <div class="res-head"><div class="res-trophy">${Art.trophy()}</div>
        <h2 id="resMainTitle">${R.length === 1 ? `🎉 ${esc(winner.name)}: ${U.fmtNum(winner.score)} ${unit}` : tie ? "Hòa nhau! 🤝" : `${esc(winner ? winner.name : "")} chiến thắng!`}</h2>
        <p id="resSubText">${res.sub || ""}</p></div>
      <div class="podium" id="resPodiumBox">${podOrder.map((i) => `<div class="pod p${i + 1}" style="--tc:${R[i].color || "#6c4cf5"};--i:${i}">
        <div class="pod-fig">${fig(R[i], i)}</div><b class="pod-name">${esc(R[i].name)}</b><span class="pod-score">${U.fmtNum(R[i].score)} ${unit}</span>
        <div class="pod-block"><span>${i + 1}</span></div></div>`).join("")}</div>
      <div id="resRoomLiveBox"></div>
      ${R.length > 3 || R.some((r) => r.correct != null) ? `<div class="res-table" id="resLocalTable"><table class="tbl"><thead><tr><th>#</th><th>Tên</th><th>${unit}</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>
        ${R.map((r, i) => `<tr><td><b>${i + 1}</b></td><td><span class="dot" style="background:${r.color || "#888"}"></span> ${r.avatar || ""} ${esc(r.name)}</td><td><b>${U.fmtNum(r.score)}</b></td><td>${r.correct != null ? r.correct : "—"}</td><td>${r.wrong != null ? r.wrong : "—"}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      <div class="res-actions">
        ${S.room ? "" : `<button class="btn btn-lg btn-fun btn-3d" data-a="again">↻ Chơi lại</button>`}
        ${isStu
          ? `<a class="btn btn-lg btn-primary" href="${esc(backUrl)}" style="text-decoration:none">${stuPin ? "🔄 Về Phòng nhóm (Đổi Game / Câu hỏi)" : "📚 Quay lại chọn câu hỏi / Đổi Game"}</a>`
          : `<button class="btn btn-lg btn-primary" data-a="setup">⚙️ Đổi cấu hình</button><button class="btn btn-lg btn-ghost" data-a="home">🏠 Trang chủ</button>`}
      </div></div></div>`);
    ctx.stage.appendChild(ov);
    U.Sound.win(); U.confetti(); setTimeout(() => U.confetti({ burst: true, count: 120 }), 700);
    $("[data-a=again]", ov) && ($("[data-a=again]", ov).onclick = () => { ov.remove(); ctx.replay(); });
    $("[data-a=setup]", ov) && ($("[data-a=setup]", ov).onclick = () => {
      if (isStu) return GK.returnToStudentPractice(S);
      teardown(S, true); renderSetup(S);
    });
    $("[data-a=home]", ov) && ($("[data-a=home]", ov).onclick = () => {
      if (isStu) return GK.returnToStudentPractice(S);
      App.go("/");
    });

    // Nếu học sinh đang chơi trong Phòng nhóm MOBA hoặc Phòng PIN -> Đồng bộ điểm & Hiển thị Bảng xếp hạng Người chiến thắng của cả phòng!
    if (isStu && stuPin && window.Room) {
      const myStat = R[0] || { score: 0, correct: 0, wrong: 0 };
      if (stuPid) {
        Room.updatePlayer(stuPin, stuPid, {
          score: Number(myStat.score || 0),
          correct: Number(myStat.correct || 0),
          wrong: Number(myStat.wrong || 0),
          progress: 100,
          finishedAt: Date.now()
        }).catch(() => {});
      }
      const offRoom = Room.watchPlayers(stuPin, (ps) => {
        const list = Object.values(ps || {}).sort((a, b) => (b.score || 0) - (a.score || 0) || (a.finishedAt || 9e15) - (b.finishedAt || 9e15));
        if (!list.length) return;
        const top = list[0];
        const allDone = list.length > 1 && list.every((p) => p.finishedAt);
        const mainTitle = $("#resMainTitle", ov);
        const subText = $("#resSubText", ov);
        if (mainTitle && list.length >= 1) {
          mainTitle.innerHTML = allDone
            ? `🏆 Người chiến thắng: ${esc(top.name)} (${U.fmtNum(top.score || 0)} điểm)!`
            : `👑 Đang dẫn đầu phòng #${esc(stuPin)}: ${esc(top.name)} (${U.fmtNum(top.score || 0)} điểm)`;
        }
        if (subText) {
          const doneCount = list.filter((p) => p.finishedAt).length;
          subText.innerHTML = `Phòng nhóm #${esc(stuPin)} · Đã hoàn thành: <b>${doneCount}/${list.length}</b> thành viên`;
        }
        const liveBox = $("#resRoomLiveBox", ov);
        if (liveBox) {
          liveBox.innerHTML = `<div class="res-table" style="margin-top:8px"><table class="tbl"><thead><tr><th>Hạng</th><th>Thành viên phòng #${esc(stuPin)}</th><th>Điểm</th><th>Đúng/Sai</th><th>Trạng thái</th></tr></thead><tbody>
            ${list.map((p, idx) => `<tr style="${p.pid === stuPid ? "background:rgba(16,185,129,0.12);font-weight:700" : ""}">
              <td><b>${idx === 0 ? "🥇 1" : idx === 1 ? "🥈 2" : idx === 2 ? "🥉 3" : idx + 1}</b></td>
              <td>${esc(p.avatar || "🦊")} ${esc(p.name)} ${p.isHost ? '<span class="chip amber" style="font-size:10px">Chủ phòng</span>' : ""}</td>
              <td><b>${U.fmtNum(p.score || 0)}</b></td>
              <td>${p.correct || 0} / ${p.wrong || 0}</td>
              <td>${p.finishedAt ? '<span class="chip green">✅ Hoàn thành</span>' : '<span class="chip amber">⏳ Đang chơi…</span>'}</td>
            </tr>`).join("")}
          </tbody></table></div>`;
        }
      });
      S.cleanups.push(offRoom);
    }

    // lưu kết quả
    DB.addResult({
      gameId: ctx.game.id, gameName: ctx.game.name, mode: ctx.cfg.mode, unit,
      source: ctx.cfg.source && ctx.cfg.source.kind === "set" ? (DB.findSet(ctx.cfg.source.setId) || {}).name || "" : ctx.cfg.source.kind,
      winner: tie ? "" : (winner ? winner.name : ""), questions: ctx.items.length,
      players: R.map((r, i) => ({ name: r.name, score: r.score || 0, correct: r.correct || 0, wrong: r.wrong || 0, rank: i + 1 }))
    });
    if (S.room) Room.finish(S.room.pin, R.map((r, i) => ({ pid: r.pid || "", name: r.name, score: r.score || 0, rank: i + 1 }))).catch(() => { });
  }

  /* ---------------- TRỰC TUYẾN: tạo phòng PIN + hẹn giờ mở đề + phòng chờ ---------------- */
  async function startOnline(S, cfg, items) {
    const btn = $("#goBtn", S.view);
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Đang tạo phòng PIN…'; }
    let pin, qs;
    try {
      qs = Quiz.prepare(items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA }).slice(0, 300);
      const baseSettings = S.game.roomSettings ? S.game.roomSettings(cfg) : {};
      const roomSettings = Object.assign({}, baseSettings, {
        maxPlayers: Number(cfg.onlineMaxPlayers || 50),
        openTime: cfg.onlineOpenTime || null,
        durationMinutes: Number(cfg.onlineDurationMinutes ?? 15),
        selfPaced: cfg.onlineSelfPaced !== false,
        explain: cfg.explain !== false,
        goal: Number(cfg.goal || Math.min(30, qs.length || 10))
      });
      pin = await Room.create({
        gameId: S.game.id,
        title: S.game.name,
        kind: S.game.onlineKind || "race",
        roomType: "teacher",
        maxPlayers: roomSettings.maxPlayers,
        openTime: roomSettings.openTime,
        durationMinutes: roomSettings.durationMinutes,
        selfPaced: roomSettings.selfPaced,
        questions: qs,
        settings: roomSettings
      });
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = "📡 Tạo phòng PIN & Lấy Link gửi Học sinh"; }
      return U.toast("Không tạo được phòng: " + (e.message || FB.errMsg(e)), "err", 5000);
    }
    S.room = { pin };
    const stage = makeStage(S, "st-" + S.game.id + " st-online");
    const ctx = makeCtx(S, cfg, items, stage); ctx.room = S.room; ctx.roomQs = qs;
    ctx.exit = async () => { if (await U.confirm("Đóng phòng và thoát? (Nếu giữ mã PIN cho học sinh tự làm bài theo giờ mở đề, hãy chọn Huỷ và chỉ cần giữ link)", { ok: "Đóng & Xoá phòng", danger: true })) { teardown(S, true); renderSetup(S); } };
    const players = await GK.lobby(stage, ctx, S);
    if (!players) return;
    stage.innerHTML = "";
    await Room.setStatus(pin, "playing");
    await Room.setState(pin, { phase: "playing", startAt: Date.now() + 3000, dur: Number(cfg.onlineDurationMinutes || 0) * 60 });
    S.ctrl = S.game.host(stage, ctx, players) || null;
  }

  GK.lobby = (stage, ctx, S) => new Promise((resolve) => {
    const pin = ctx.room.pin, game = ctx.game, teamMode = game.onlineKind === "tug";
    const baseOrigin = location.href.split("/san-choi/")[0];
    const practiceRoomUrl = baseOrigin + "/practice.html?mode=game&room=" + pin;
    const directJoinUrl = location.href.split("#")[0] + "#/join/" + pin;
    const durMin = Number(ctx.cfg.onlineDurationMinutes || 0);
    const openTimeStr = ctx.cfg.onlineOpenTime ? new Date(ctx.cfg.onlineOpenTime).toLocaleString("vi-VN") : "Mở ngay lập tức";
    GK.hud(stage, ctx, { title: game.name + " · Phòng PIN #" + pin });
    const body = h(`<div class="lobby">
      <div class="lb-left">
        <div class="lb-card">
          <div class="lb-step">① Mã PIN Phòng Trò Chơi</div>
          <div class="lb-pin">${pin.split("").map((d, i) => `<span style="--i:${i}">${d}</span>`).join("")}</div>
          <div style="font-size:12.5px;background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:8px 10px;margin:8px 0;text-align:left;line-height:1.5">
            <div>📅 <b>Giờ mở đề:</b> ${esc(openTimeStr)}</div>
            <div>⏱ <b>Thời gian luyện tập:</b> ${durMin > 0 ? durMin + " phút" : "Không giới hạn"}</div>
            <div>📚 <b>Số câu hỏi:</b> ${(ctx.roomQs || []).length} câu</div>
          </div>
          <div class="lb-qr" id="qr"></div>
          <div style="display:flex;flex-direction:column;gap:6px;width:100%;margin-top:6px">
            <button class="btn btn-sm btn-primary" id="cpyFull">📋 Sao chép Link Phòng + Mã PIN gửi Học sinh</button>
            <button class="btn btn-sm btn-ghost" id="cpy">🔗 Chỉ sao chép Link trực tiếp</button>
          </div>
        </div>
      </div>
      <div class="lb-right">
        <div class="lb-top"><h2><span id="pc">0</span> học sinh trong phòng</h2><span class="muted">Bấm vào tên để ${teamMode ? "đổi đội / " : ""}mời ra khỏi phòng</span>
          <button class="btn btn-xl btn-fun btn-3d" id="startBtn">▶ Bắt đầu / Mở bảng theo dõi</button></div>
        <div class="lb-players ${teamMode ? "teams" : ""}" id="plist">${teamMode ? `<div class="lb-team" style="--tc:${U.TEAM_COLORS[0]}"><h3>🔴 ${U.TEAM_NAMES[0]} <small id="tc0">0</small></h3><div class="lt-b" id="t0"></div></div><div class="lb-team" style="--tc:${U.TEAM_COLORS[1]}"><h3>🔵 ${U.TEAM_NAMES[1]} <small id="tc1">0</small></h3><div class="lt-b" id="t1"></div></div>` : ""}</div>
        <div class="lb-wait" id="wait"><div class="dots3"><i></i><i></i><i></i></div>Đang chờ học sinh nhập mã PIN <b>${pin}</b> hoặc bấm vào Link phòng…</div>
      </div></div>`);
    stage.appendChild(body);
    U.loadScript(U.QR_URL).then(() => { try { new QRCode($("#qr", body), { text: practiceRoomUrl, width: 170, height: 170, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { } }).catch(() => ($("#qr", body).innerHTML = ""));
    $("#cpy", body).onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText(practiceRoomUrl);
      U.toast("✅ Đã sao chép Link phòng cho học sinh!", "ok");
    };
    $("#cpyFull", body).onclick = () => {
      const msg = [
        `🎮 PHÒNG TRÒ CHƠI LUYỆN TẬP: ${game.name.toUpperCase()}`,
        `🔢 Mã PIN vào phòng: ${pin}`,
        `📅 Thời gian mở đề: ${openTimeStr}`,
        `⏱ Thời gian làm bài: ${durMin > 0 ? durMin + " phút" : "Tự do"}`,
        `👉 Link vào phòng trực tiếp: ${practiceRoomUrl}`,
        `(Hoặc vào Sân chơi nhập PIN: ${directJoinUrl})`
      ].join("\n");
      navigator.clipboard && navigator.clipboard.writeText(msg);
      U.toast("📋 Đã sao chép trọn bộ Link phòng + Mã PIN + Lịch mở đề!", "ok", 3000);
    };
    let players = {};
    const seen = new Set();
    const off = Room.watchPlayers(pin, (ps) => {
      players = ps || {};
      const arr = Object.entries(players).map(([pid, p]) => Object.assign({ pid }, p));
      $("#pc", body).textContent = arr.length;
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

  /* Bảng điều khiển trực tuyến mặc định cho giáo viên theo dõi học sinh làm bài / thi đấu */
  GK.defaultOnlineHost = (stage, ctx) => {
    const pin = ctx.room.pin;
    const durMin = Number(ctx.cfg.onlineDurationMinutes || 0);
    const hud = GK.hud(stage, ctx, {
      title: `${ctx.game.name} · PIN ${pin}`,
      mid: `<span class="clock" id="hostClock"></span>`,
      right: `<button class="hud-btn" data-a="end" title="Kết thúc & Vinh danh">🏁 Kết thúc</button>`
    });
    const board = h(`<div class="page" style="max-width:980px;margin:58px auto 20px;padding:16px">
      <div class="card" style="padding:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div>
            <h2 style="margin:0">📊 Bảng Theo Dõi Trực Tiếp · Phòng PIN <span style="color:var(--primary)">${esc(pin)}</span></h2>
            <p class="muted" style="margin:4px 0 0">Học sinh đang làm bài & thi đấu (${(ctx.roomQs || []).length} câu hỏi). Bấm Kết thúc bất kỳ lúc nào để vinh danh người chiến thắng.</p>
          </div>
        </div>
        <div id="hostLiveList"></div>
      </div>
    </div>`);
    stage.appendChild(board);
    let latestPlayers = {};
    let over = false;
    const endMatch = () => {
      if (over) return;
      over = true;
      const ranked = Object.entries(latestPlayers).map(([pid, p]) => Object.assign({ pid, color: U.TEAM_COLORS[(p.team || 0) % U.TEAM_COLORS.length] }, p))
        .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.correct || 0) - (a.correct || 0));
      ctx.finish({ unit: "điểm", sub: `Phòng trực tuyến PIN ${pin}`, ranking: ranked });
    };
    if (durMin > 0) {
      GK.clock(ctx, $("#hostClock", hud), durMin * 60, endMatch);
    }
    $("[data-a=end]", hud).onclick = async () => {
      if (await U.confirm("Kết thúc phòng luyện tập và hiển thị người chiến thắng?", { ok: "Kết thúc" })) endMatch();
    };
    const off = Room.watchPlayers(pin, (ps) => {
      latestPlayers = ps || {};
      const list = Object.entries(latestPlayers).map(([pid, p]) => Object.assign({ pid }, p))
        .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.correct || 0) - (a.correct || 0));
      const box = $("#hostLiveList", board);
      if (!box) return;
      if (!list.length) {
        box.innerHTML = `<div class="empty"><span class="em-ic">⏳</span>Chưa có học sinh nào trong phòng (Mã PIN: <b>${esc(pin)}</b>).</div>`;
        return;
      }
      box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Hạng</th><th>Học sinh</th><th>Điểm số</th><th>Đúng / Sai</th><th>Tiến độ</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        ${list.map((p, i) => `<tr>
          <td><b>${i === 0 ? "🥇 1" : i === 1 ? "🥈 2" : i === 2 ? "🥉 3" : i + 1}</b></td>
          <td>${esc(p.avatar || "🦊")} <b>${esc(p.name)}</b></td>
          <td><b style="color:var(--primary)">${U.fmtNum(p.score || 0)}</b></td>
          <td><span style="color:#16a34a;font-weight:700">${p.correct || 0}</span> / <span style="color:#dc2626">${p.wrong || 0}</span></td>
          <td>${Math.round(p.progress || 0)}/${(ctx.roomQs || []).length || 10}</td>
          <td>${p.finishedAt ? '<span class="chip green">✅ Đã xong</span>' : '<span class="chip amber">✍️ Đang làm</span>'}</td>
          <td><button class="btn btn-sm btn-ghost" data-kick="${esc(p.pid)}">✕ Kích</button></td>
        </tr>`).join("")}
      </tbody></table></div>`;
      $$("[data-kick]", box).forEach((b) => (b.onclick = () => Room.kick(pin, b.dataset.kick)));
    });
    return { destroy() { over = true; off && off(); }, stop() { over = true; off && off(); } };
  };

  /* Đội/nhân vật mặc định cho game cần figure */
  GK.ranking = (arr, key) => arr.slice().sort((a, b) => (b[key || "score"] - a[key || "score"]));
})();
