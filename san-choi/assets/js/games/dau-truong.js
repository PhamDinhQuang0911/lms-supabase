/* =========================================================
   dau-truong.js — ĐẤU TRƯỜNG TRỰC TUYẾN (kiểu Kahoot)
   Máy chiếu hiển thị câu hỏi, học sinh trả lời trên điện thoại.
   Trả lời đúng & nhanh = nhiều điểm; có chuỗi thắng, BXH.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];

  Games.register({
    id: "dau-truong", order: 5, name: "Đấu trường trực tuyến", icon: "⚡", colors: ["#6c4cf5", "#22d3ee"],
    tagline: "Cả lớp cùng thi trên điện thoại — nhanh tay, đúng đáp án, leo bảng xếp hạng!",
    tags: ["Cả lớp", "Thời gian thực", "Điện thoại"], modes: ["online"], onlineKind: "quiz", minQ: 5,
    howto: ["Giáo viên tạo phòng, học sinh vào bằng <b>mã PIN</b> hoặc quét QR.", "Câu hỏi hiện trên màn chiếu, học sinh chọn đáp án trên điện thoại.",
      "Đúng và <b>nhanh</b> được nhiều điểm hơn, giữ chuỗi đúng để nhận thưởng 🔥.", "Sau mỗi câu là bảng xếp hạng nóng hổi!"],
    fields: [
      { key: "count", type: "range", label: "Số câu hỏi", min: 3, max: 50, def: 10, unit: " câu" },
      { key: "qtime", type: "range", label: "Thời gian mỗi câu", min: 5, max: 120, step: 5, def: 20, unit: " giây" },
      { key: "auto", type: "toggle", label: "Tự động chuyển câu (không cần bấm)", def: false }
    ],
    roomSettings: (cfg) => ({ qtime: cfg.qtime, explain: cfg.explain }),

    host(stage, ctx, players0) {
      const cfg = ctx.cfg, pin = ctx.room.pin, Q = ctx.roomQs.slice(0, cfg.count), N = Q.length;
      const hud = GK.hud(stage, ctx, { title: "Đấu trường · PIN " + pin, mid: `<span class="lq-prog"></span>`, right: `<span class="chip violet lq-pc">👥 0</span>` });
      stage.insertAdjacentHTML("beforeend", `<div class="lq"><div class="lq-main"></div></div>`);
      const main = $(".lq-main", stage);
      let players = {}; players0.forEach((p) => (players[p.pid] = p));
      let qi = -1, over = false, offAns = null, tick = null, answers = {}, prevRank = {};
      const offP = Room.watchPlayers(pin, (ps) => { players = ps || {}; $(".lq-pc", hud).textContent = "👥 " + Object.keys(players).length; updCount(); });
      const online = () => Object.values(players).filter((p) => p.online !== false).length;
      function updCount() { const el = $(".lq-ans b", main); if (el) el.textContent = Object.keys(answers).length + "/" + online(); }
      const ranked = () => Object.entries(players).map(([pid, p]) => Object.assign({ pid }, p)).sort((a, b) => (b.score || 0) - (a.score || 0));

      function showQuestion() {
        qi++; if (qi >= N) return podium();
        answers = {};
        const it = Q[qi], dur = cfg.qtime, startAt = Room.now() + 2500;
        $(".lq-prog", hud).innerHTML = `Câu <b>${qi + 1}</b>/${N}`;
        // màn giới thiệu câu
        main.innerHTML = `<div class="lq-intro"><span class="lq-n">Câu ${qi + 1}</span><div class="lq-type">${Quiz.TYPES[it.type]}</div><div class="lq-bar"><i></i></div></div>`;
        Room.setState(pin, { phase: "question", qi, startAt, dur });
        ctx.timers.after(2500, () => {
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
            tb.textContent = Math.ceil(left); tr.style.strokeDashoffset = (1 - left / dur) * 119.4;
            if (left <= 0) reveal();
          });
          offAns && offAns();
          offAns = Room.watchAnswers(pin, qi, (a) => { answers = a || {}; updCount(); if (Object.keys(answers).length >= online() && online() > 0) ctx.timers.after(600, reveal); });
          U.Sound.go();
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
        const act = $(".lq-act", main);
        act.innerHTML = `<button class="btn btn-xl btn-fun btn-3d" data-a="board">🏆 Bảng xếp hạng</button>`;
        $("[data-a=board]", act).onclick = board;
        if (cfg.auto) ctx.timers.after(5000, () => { if (revealed === qi && !main.querySelector(".lq-board")) board(); });
      }
      function board() {
        if (over) return;
        Room.setState(pin, { phase: "board", qi });
        const R = ranked(), top = R.slice(0, 8);
        main.innerHTML = `<div class="lq-board"><h2>🏆 Bảng xếp hạng</h2><div class="lq-list">${top.map((p, i) => {
          const was = prevRank[p.pid], up = was != null && was > i;
          return `<div class="lq-row ${i < 3 ? "top" + (i + 1) : ""}" style="--i:${i}"><span class="lq-rk">${i + 1}</span><span class="lq-av">${p.avatar || "🙂"}</span><b>${esc(p.name)}</b>${(p.streak || 0) >= 2 ? `<span class="lq-streak">🔥${p.streak}</span>` : ""}${up ? `<span class="lq-up">▲${was - i}</span>` : ""}<span class="lq-sc">${U.fmtNum(p.score || 0)}</span></div>`;
        }).join("")}</div>
        <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="next">${qi + 1 >= N ? "🎉 Xem kết quả chung cuộc" : "Câu tiếp theo ➜"}</button></div></div>`;
        R.forEach((p, i) => (prevRank[p.pid] = i));
        $("[data-a=next]", main).onclick = showQuestion;
        if (cfg.auto) ctx.timers.after(4500, () => { if ($(".lq-board", main)) showQuestion(); });
      }
      function podium() {
        over = true; offP(); offAns && offAns();
        Room.setState(pin, { phase: "podium" });
        const R = ranked();
        ctx.finish({ unit: "điểm", sub: `${R.length} người chơi · ${N} câu hỏi`, ranking: R.map((p, i) => ({ pid: p.pid, name: p.name, avatar: p.avatar, color: U.TEAM_COLORS[i % 6], score: p.score || 0, correct: p.correct || 0, wrong: p.wrong || 0 })) });
      }
      GK.countdown(stage, "Chuẩn bị điện thoại nhé!").then(() => !over && showQuestion());
      return { destroy() { over = true; offP(); offAns && offAns(); }, stop() { over = true; offP(); } };
    }
  });
})();
