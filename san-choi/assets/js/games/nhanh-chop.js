/* =========================================================
   nhanh-chop.js — NHANH NHƯ CHỚP ⚡
   Chuỗi câu hỏi tốc độ: trả lời càng NHANH điểm càng CAO,
   giữ chuỗi đúng để bùng nổ điểm. Hai chế độ:
   • Một màn hình: các đội đua đồng thời trên các bảng riêng.
   • Trực tuyến: cả lớp trả lời trên điện thoại (kiểu Đấu trường),
     mỗi câu vinh danh "tay nhanh nhất".
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];
  const speedBonus = (sec) => (sec <= 2 ? 100 : sec <= 5 ? 60 : sec <= 10 ? 30 : 10);
  const speedLabel = (sec) => (sec <= 2 ? "⚡ CHỚP!" : sec <= 5 ? "🔥 Rất nhanh!" : sec <= 10 ? "👍 Nhanh" : "");

  Games.register({
    id: "nhanh-chop", order: 6, name: "Nhanh như chớp", icon: "⚡", colors: ["#f59e0b", "#ef4444"],
    tagline: "Chuỗi câu hỏi tốc độ — trả lời càng nhanh điểm càng cao, giữ chuỗi đúng để bùng nổ!",
    tags: ["Cả lớp", "Thời gian thực", "Tốc độ"], modes: ["local", "online"], onlineKind: "quiz", minQ: 5,
    howto: ["Trả lời <b>đúng và nhanh</b>: trong 2 giây đầu được cộng tối đa <b>+100 điểm tốc độ</b>.",
      "Đúng liên tiếp tạo <b>chuỗi lửa 🔥</b> — chuỗi càng dài, điểm thưởng càng lớn.",
      "Trả lời sai bị <b>đóng băng 2 giây</b> (một màn hình) — bình tĩnh mà bứt phá!",
      "Trực tuyến: sau mỗi câu, vinh danh <b>⚡ tay nhanh nhất</b> của lớp."],
    fields: [
      { key: "teams", type: "teams", min: 2, max: 4, def: 2, modes: ["local"] },
      { key: "mins", type: "seg", label: "⏱️ Thời lượng trận (một màn hình)", options: [["2", "2 phút"], ["3", "3 phút"], ["5", "5 phút"]], def: "3", modes: ["local"] },
      { key: "count", type: "range", label: "Số câu hỏi (trực tuyến)", min: 5, max: 40, def: 15, unit: " câu", modes: ["online"] },
      { key: "qtime", type: "range", label: "⏱️ Thời gian tối đa mỗi câu", min: 5, max: 60, step: 5, def: 15, unit: " giây" },
      { key: "auto", type: "toggle", label: "⚡ Tự động chạy liên tục (không cần bấm)", def: true, modes: ["online"] }
    ],
    roomSettings: (cfg) => ({ qtime: cfg.qtime, explain: cfg.explain }),

    /* ================= MỘT MÀN HÌNH — các đội đua đồng thời ================= */
    play(stage, ctx) {
      const cfg = ctx.cfg, T = ctx.teams;
      const hud = GK.hud(stage, ctx, {
        title: "Nhanh như chớp", mid: `<span class="nc-clock"></span>`,
        right: `<button class="btn btn-sm btn-white" data-a="rank">🏆 Bảng xếp hạng</button> <button class="btn btn-sm btn-fun" data-a="end">🏁 Kết thúc</button>`
      });
      stage.insertAdjacentHTML("beforeend", `
        <div class="nc-race">${T.map((t, i) => `<div class="nc-lane" style="--tc:${t.color}"><span class="nc-nm">${esc(t.name)}</span><div class="nc-bar"><i></i></div><span class="nc-sc">0</span></div>`).join("")}</div>
        <div class="tpanels n${T.length}">${T.map((t, i) => `
          <section class="tpanel" style="--tc:${t.color};--i:${i}" data-t="${i}">
            <header class="tp-h"><span class="tp-dot"></span><b class="tp-name">${esc(t.name)}</b><span class="tp-stat"></span><span class="tp-score">0</span></header>
            <div class="tp-q"></div>
            <div class="tp-freeze"><div class="fz-ic">❄️</div><b>ĐÓNG BĂNG</b><span class="tp-fz">0</span></div>
          </section>`).join("")}</div>`);
      const st = T.map(() => ({ pts: 0, correct: 0, wrong: 0, streak: 0, best: 0 }));
      let over = false;
      const P = T.map((t, i) => ({
        queue: Quiz.queue(ctx.items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA }),
        el: $(`.tpanel[data-t="${i}"]`, stage), ctrl: null, capT: null, t0: 0, n: 0, frozen: false
      }));
      function drawRace() {
        const lead = Math.max(1, ...st.map((s) => s.pts));
        $$(".nc-lane", stage).forEach((el, i) => { $(".nc-bar i", el).style.width = Math.round((st[i].pts / lead) * 100) + "%"; $(".nc-sc", el).textContent = U.fmtNum(st[i].pts); });
      }
      function updPanel(i) {
        const s = st[i];
        $(".tp-score", P[i].el).textContent = U.fmtNum(s.pts);
        $(".tp-stat", P[i].el).innerHTML = s.streak >= 2 ? `<span class="lq-streak">🔥${s.streak}</span>` : "";
        drawRace();
      }
      function next(i) {
        if (over) return;
        const p = P[i];
        p.ctrl && p.ctrl.destroy();
        const item = p.queue.next(); p.n++;
        p.t0 = Date.now();
        p.ctrl = Quiz.mount($(".tp-q", p.el), item, {
          compact: true, keypad: true, num: p.n, explain: cfg.explain,
          onAnswer: (res) => handle(i, res, item)
        });
        $(".tp-q", p.el).scrollTop = 0;
        p.capT = ctx.timers.after(cfg.qtime * 1000, () => { if (!over && p.ctrl) p.ctrl.timeout(); });
      }
      function handle(i, res) {
        const p = P[i], s = st[i];
        ctx.timers.stop(p.capT);
        const sec = (Date.now() - p.t0) / 1000, frac = res.points || 0;
        s.streak = res.ok ? s.streak + 1 : 0; s.best = Math.max(s.best, s.streak);
        let pts = 0;
        if (frac > 0) pts = Math.round(100 * frac + speedBonus(sec) * frac + (res.ok ? Math.min(50, Math.max(0, s.streak - 1) * 10) : 0));
        s.pts += pts; res.ok ? s.correct++ : s.wrong++;
        p.el.classList.remove("hit-ok", "hit-bad"); void p.el.offsetWidth; p.el.classList.add(res.ok ? "hit-ok" : "hit-bad");
        if (pts > 0) GK.floatText($(".tp-score", p.el), "+" + pts + (res.ok && sec <= 2 ? " ⚡" : ""), T[i].color);
        updPanel(i);
        if (over) return;
        if (res.ok) ctx.timers.after(cfg.explain ? 1700 : 950, () => next(i));
        else freeze(i);
      }
      function freeze(i) {
        const p = P[i]; p.frozen = true; p.el.classList.add("frozen"); U.Sound.freeze();
        let left = 2; $(".tp-fz", p.el).textContent = left;
        const id = ctx.timers.every(1000, () => {
          left--; $(".tp-fz", p.el).textContent = Math.max(0, left);
          if (left <= 0) { ctx.timers.stop(id); p.el.classList.remove("frozen"); p.frozen = false; next(i); }
        });
      }
      function standingsHTML() {
        const order = T.map((_, i) => i).sort((a, b) => st[b].pts - st[a].pts);
        return `<table class="tbl"><thead><tr><th>#</th><th>Đội</th><th>Điểm</th><th>Đúng</th><th>Sai</th><th>Chuỗi cao nhất</th></tr></thead><tbody>
          ${order.map((i, r) => `<tr><td><b>${r + 1}</b></td><td><span class="dot" style="background:${T[i].color}"></span> ${esc(T[i].name)}</td><td><b>${U.fmtNum(st[i].pts)}</b></td><td>${st[i].correct}</td><td>${st[i].wrong}</td><td>${st[i].best >= 2 ? "🔥" + st[i].best : "—"}</td></tr>`).join("")}</tbody></table>`;
      }
      $("[data-a=rank]", hud).onclick = () => { U.Sound.click(); U.modal({ title: "🏆 Bảng xếp hạng — Nhanh như chớp", size: "lg", body: standingsHTML(), actions: [{ label: "Đóng", cls: "btn-primary" }] }); };
      let ending = false;
      function end() {
        if (over || ending) return; ending = true; over = true;
        P.forEach((p) => { ctx.timers.stop(p.capT); p.ctrl && p.ctrl.lock(); });
        GK.banner(stage, "⏰ HẾT GIỜ!", 1300); U.Sound.coin();
        const order = T.map((_, i) => i).sort((a, b) => st[b].pts - st[a].pts || st[b].correct - st[a].correct);
        ctx.timers.after(1400, () => ctx.finish({ unit: "điểm", sub: `Trận đấu ${cfg.mins} phút · tổng ${P.reduce((s, p) => s + p.n, 0)} lượt trả lời`, ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: st[i].pts, correct: st[i].correct, wrong: st[i].wrong })) }));
      }
      $("[data-a=end]", hud).onclick = async () => { if (await U.confirm("Kết thúc trận và xem kết quả?", { ok: "Kết thúc" })) end(); };
      const clock = GK.clock(ctx, $(".nc-clock", hud), (+cfg.mins || 3) * 60, end);
      GK.countdown(stage, "Sẵn sàng bứt tốc… ⚡").then(() => { if (!over) P.forEach((_, i) => next(i)); });
      return { destroy() { over = true; clock.stop(); P.forEach((p) => p.ctrl && p.ctrl.destroy()); }, stop() { over = true; clock.stop(); P.forEach((p) => p.ctrl && p.ctrl.lock()); } };
    },

    /* ================= TRỰC TUYẾN — máy chủ ================= */
    host(stage, ctx, players0) {
      const cfg = ctx.cfg, pin = ctx.room.pin, Q = ctx.roomQs.slice(0, cfg.count), N = Q.length;
      const hud = GK.hud(stage, ctx, {
        title: "Nhanh như chớp · PIN " + pin, mid: `<span class="lq-prog"></span>`,
        right: `<button class="btn btn-sm btn-white" data-a="rank">🏆 Bảng xếp hạng</button> <span class="chip rc-alive lq-pc">👥 0</span>`
      });
      stage.insertAdjacentHTML("beforeend", `<div class="lq"><div class="lq-main"></div></div>`);
      const main = $(".lq-main", stage);
      let players = {}; players0.forEach((p) => (players[p.pid] = p));
      let qi = -1, over = false, offAns = null, tick = null, answers = {}, prevRank = {};
      const ranked = () => Object.entries(players).map(([pid, p]) => Object.assign({ pid }, p)).sort((a, b) => (b.score || 0) - (a.score || 0));
      const offP = Room.watchPlayers(pin, (ps) => { players = ps || {}; $(".lq-pc", hud).textContent = "👥 " + Object.keys(players).length; updCount(); });
      const online = () => Object.values(players).filter((p) => p.online !== false).length;
      function updCount() { const el = $(".lq-ans b", main); if (el) el.textContent = Object.keys(answers).length + "/" + online(); }
      $("[data-a=rank]", hud).onclick = () => {
        const R = ranked();
        U.modal({
          title: "🏆 Bảng xếp hạng — Nhanh như chớp", size: "lg",
          body: R.length ? `<table class="tbl"><thead><tr><th>#</th><th>Thí sinh</th><th>Điểm</th><th>Đúng</th><th>Chuỗi</th></tr></thead><tbody>${R.map((p, i) => `<tr><td><b>${i + 1}</b></td><td>${p.avatar || "🙂"} ${esc(p.name)}</td><td><b>${U.fmtNum(p.score || 0)}</b></td><td>${p.correct || 0}</td><td>${(p.streak || 0) >= 2 ? "🔥" + p.streak : "—"}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">Chưa có người chơi nào.</p>`,
          actions: [{ label: "Đóng", cls: "btn-primary" }]
        });
      };

      function showQuestion() {
        if (over) return;
        qi++; if (qi >= N) return podium();
        answers = {};
        const it = Q[qi], dur = cfg.qtime, startAt = Room.now() + 1600;
        $(".lq-prog", hud).innerHTML = `Câu <b>${qi + 1}</b>/${N}`;
        main.innerHTML = `<div class="lq-intro"><span class="lq-n">⚡ Câu ${qi + 1}</span><div class="lq-type">${Quiz.TYPES[it.type]} — nhanh tay lên!</div><div class="lq-bar"><i></i></div></div>`;
        Room.setState(pin, { phase: "question", qi, startAt, dur });
        U.Sound.go();
        ctx.timers.after(1600, () => {
          if (over) return;
          let body = "";
          if (it.type === "MC") body = `<div class="lq-opts n${it.options.length}">${it.options.map((o, i) => `<div class="lq-opt" style="--oc:${COLORS[i]};--i:${i}" data-k="${o.key}"><span class="lq-sh">${Quiz.SHAPES[i]}</span><span class="lq-tx">${Quiz.rich(o.text)}</span><span class="lq-cnt"></span></div>`).join("")}</div>`;
          else if (it.type === "TF") body = `<div class="lq-tf">${it.options.map((o, i) => `<div class="lq-tfr" style="--i:${i}" data-i="${i}"><b>${o.key})</b><span>${Quiz.rich(o.text)}</span><em class="lq-tfa"></em></div>`).join("")}</div>`;
          else body = `<div class="lq-sa">✍️ Nhập câu trả lời trên điện thoại của bạn<div class="lq-sa-ans"></div></div>`;
          main.innerHTML = `<div class="lq-q">
            <div class="lq-top"><div class="lq-timer"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="tr" cx="22" cy="22" r="19"/></svg><b>${dur}</b></div>
              <div class="lq-stem">${it.context ? `<div class="q-ctx">${Quiz.rich(it.context)}</div>` : ""}${Quiz.rich(it.stem)}</div>
              <div class="lq-ans"><b>0/${online()}</b><span>đã trả lời</span></div></div>
            ${body}
            <div class="lq-act"><button class="btn btn-lg btn-white" data-a="skip">⏭ Dừng & xem đáp án</button></div></div>`;
          Quiz.typeset(main);
          $("[data-a=skip]", main).onclick = reveal;
          const tr = $(".tr", main), tb = $(".lq-timer b", main);
          tick = ctx.timers.every(200, () => {
            const left = Math.max(0, dur - (Room.now() - startAt) / 1000);
            tb.textContent = Math.ceil(left); if (tr) tr.style.strokeDashoffset = (1 - left / dur) * 119.4;
            if (left <= 0) reveal();
          });
          offAns && offAns();
          offAns = Room.watchAnswers(pin, qi, (a) => { answers = a || {}; updCount(); if (Object.keys(answers).length >= online() && online() > 0) ctx.timers.after(500, reveal); });
        });
      }
      let revealed = -1;
      function reveal() {
        if (revealed === qi || over) return; revealed = qi;
        tick && ctx.timers.stop(tick); offAns && offAns(); offAns = null;
        const it = Q[qi], A = Object.values(answers);
        Room.setState(pin, { phase: "reveal", qi });
        U.Sound.coin();
        const lq = $(".lq-q", main); if (!lq) return;
        lq.classList.add("revealed");
        if (it.type === "MC") {
          $$(".lq-opt", main).forEach((el) => {
            const k = el.dataset.k, n = A.filter((a) => a.given === k).length;
            el.classList.add(k === it.answer ? "right" : "wrong");
            $(".lq-cnt", el).innerHTML = `${n} <small>${A.length ? Math.round((n / A.length) * 100) : 0}%</small>`;
          });
        } else if (it.type === "TF") {
          $$(".lq-tfr", main).forEach((el) => {
            const i = +el.dataset.i, ok = A.filter((a) => a.given && a.given[i] === it.answer[i]).length;
            el.classList.add("show");
            $(".lq-tfa", el).innerHTML = `<span class="${it.answer[i] ? "t" : "f"}">${it.answer[i] ? "ĐÚNG" : "SAI"}</span> ${A.length ? Math.round((ok / A.length) * 100) : 0}% chọn đúng`;
          });
        } else {
          const right = A.filter((a) => a.ok).length;
          const top = {}; A.forEach((a) => { const g = String(a.given || "").trim(); if (g) top[g] = (top[g] || 0) + 1; });
          $(".lq-sa-ans", main).innerHTML = `<div class="lq-sa-right">Đáp án: <b>${esc(String(it.answer).split("|")[0])}</b> · ${right}/${A.length} bạn đúng</div>
            <div class="lq-cloud">${Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g, n]) => `<span class="${Quiz.saMatch(g, it.answer) ? "ok" : ""}" style="font-size:${14 + Math.min(n, 8) * 3}px">${esc(g)}</span>`).join("")}</div>`;
        }
        if (cfg.explain && it.explain) { lq.insertAdjacentHTML("beforeend", `<div class="lq-exp">💡 ${Quiz.rich(it.explain)}</div>`); Quiz.typeset(lq); }
        // Vinh danh tay nhanh nhất
        let fast = null;
        Object.entries(answers).forEach(([pid, a]) => { if (a.ok && a.ms != null && (!fast || a.ms < fast.ms)) fast = { pid, ms: a.ms }; });
        const fname = fast && players[fast.pid] ? players[fast.pid].name : null;
        const act = $(".lq-act", main);
        act.innerHTML = `${fname ? `<div class="nc-fast">⚡ Tay nhanh nhất: <b>${esc(fname)}</b> — chỉ ${(fast.ms / 1000).toFixed(1)} giây!</div>` : ""}<button class="btn btn-xl btn-fun btn-3d" data-a="board">🏆 Bảng xếp hạng</button>`;
        $("[data-a=board]", act).onclick = board;
        if (cfg.auto) ctx.timers.after(3200, () => { if (revealed === qi && !over && $(".lq-q", main)) board(); });
      }
      function board() {
        if (over) return;
        Room.setState(pin, { phase: "board", qi });
        const R = ranked(), top = R.slice(0, 8);
        main.innerHTML = `<div class="lq-board"><h2>🏆 Bảng xếp hạng</h2><div class="lq-list">${top.map((p, i) => {
          const was = prevRank[p.pid], up = was != null && was > i;
          return `<div class="lq-row ${i < 3 ? "top" + (i + 1) : ""}" style="--i:${i}"><span class="lq-rk">${i + 1}</span><span class="lq-av">${p.avatar || "🙂"}</span><b>${esc(p.name)}</b>${(p.streak || 0) >= 2 ? `<span class="lq-streak">🔥${p.streak}</span>` : ""}${up ? `<span class="lq-up">▲${was - i}</span>` : ""}<span class="lq-sc">${U.fmtNum(p.score || 0)}</span></div>`;
        }).join("")}</div>
        <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="next">${qi + 1 >= N ? "🎉 Xem kết quả chung cuộc" : "⚡ Câu tiếp theo"}</button></div></div>`;
        R.forEach((p, i) => (prevRank[p.pid] = i));
        $("[data-a=next]", main).onclick = showQuestion;
        if (cfg.auto) ctx.timers.after(3000, () => { if ($(".lq-board", main) && !over) showQuestion(); });
      }
      function podium() {
        over = true; offP(); offAns && offAns();
        Room.setState(pin, { phase: "podium" });
        const R = ranked();
        ctx.finish({ unit: "điểm", sub: `⚡ ${R.length} người chơi · ${N} câu tốc độ`, ranking: R.map((p, i) => ({ pid: p.pid, name: p.name, avatar: p.avatar, color: U.TEAM_COLORS[i % 6], score: p.score || 0, correct: p.correct || 0, wrong: p.wrong || 0 })) });
      }
      GK.countdown(stage, "Cầm chắc điện thoại — đua tốc độ bắt đầu! ⚡").then(() => { if (!over) showQuestion(); });
      return { destroy() { over = true; offP(); offAns && offAns(); }, stop() { over = true; offP(); } };
    }
  });
})();
