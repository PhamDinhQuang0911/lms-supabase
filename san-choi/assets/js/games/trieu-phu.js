/* =========================================================
   trieu-phu.js — AI LÀ TRIỆU PHÚ
   Leo thang điểm 15 câu, có mốc an toàn & 4 quyền trợ giúp.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
  const LV = { "Nhận biết": 0, "Thông hiểu": 1, "Vận dụng": 2, "Vận dụng cao": 3 };
  const COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];

  Games.register({
    id: "trieu-phu", order: 70, name: "Ai là triệu phú", icon: "💰", colors: ["#312e81", "#f59e0b"],
    tagline: "Vượt qua các câu hỏi khó dần để chạm tới 1.000.000 điểm — chơi một mình hoặc cả lớp cùng leo thang trên điện thoại!",
    tags: ["1 người / Cả lớp", "Quyền trợ giúp", "Có trực tuyến"], modes: ["local", "online"], onlineKind: "mil", minQ: 5,
    howto: ["🖥️ <b>Một màn hình</b>: một thí sinh leo thang 15 mốc, có mốc an toàn & 4 quyền trợ giúp (50:50, khán giả, gọi điện, đổi câu).",
      "📱 <b>Trực tuyến</b>: cả lớp cùng leo một thang điểm trên điện thoại — trả lời đúng thì leo tiếp, sai là dừng cuộc chơi và giữ điểm mốc an toàn.",
      "Giáo viên có nút <b>📊 Tình hình</b> để xem ai đang ở bậc nào và điểm của từng người theo thời gian thực.",
      "Câu hỏi được sắp từ <b>dễ đến khó</b>; mốc an toàn giúp bảo toàn điểm khi trả lời sai."],
    roomSettings: (cfg) => ({ qtime: cfg.qtime, explain: cfg.explain }),
    fields: [
      { key: "player", type: "text", label: "Tên người chơi / đội", def: "Thí sinh", placeholder: "Nhập tên…", modes: ["local"] },
      { key: "count", type: "range", label: "Số câu hỏi (số bậc thang)", min: 5, max: 15, def: 15, unit: " câu" },
      { key: "qtime", type: "range", label: "Thời gian mỗi câu (0 = không giới hạn)", min: 0, max: 90, step: 5, def: 30, unit: " giây" },
      { key: "auto", type: "toggle", label: "Tự động chuyển câu (chế độ trực tuyến)", def: false, modes: ["online"] }
    ],

    play(stage, ctx) {
      const cfg = ctx.cfg, name = (cfg.player || "Thí sinh").trim() || "Thí sinh";
      let pool = Quiz.prepare(ctx.items, { shuffleQ: true, shuffleA: cfg.shuffleA });
      pool.sort((a, b) => (LV[a.level] ?? 1) - (LV[b.level] ?? 1));
      const N = Math.min(cfg.count, pool.length);
      // chọn N câu trải đều độ khó
      let qs = []; const step = pool.length / N; for (let i = 0; i < N; i++) qs.push(pool[Math.floor(i * step)]);
      const spare = pool.filter((q) => !qs.includes(q));
      const values = LADDER.slice(LADDER.length - N);
      const safes = [N - 11, N - 6].filter((x) => x >= 0);
      GK.hud(stage, ctx, { title: "Ai là triệu phú", mid: `<span class="mil-who">🎤 ${esc(name)}</span>` });
      stage.insertAdjacentHTML("beforeend", `<div class="mil">
        <div class="mil-main">
          <div class="mil-logo"><div class="ml-ring"></div><span class="ml-amt">0</span><small>điểm</small></div>
          <div class="mil-q"></div>
          <div class="mil-ctrl"><button class="btn btn-glass" data-a="stop">✋ Dừng cuộc chơi</button><span class="mil-timer"></span></div>
        </div>
        <aside class="mil-side">
          <div class="mil-life">
            <button data-l="5050" title="50:50">50:50</button><button data-l="aud" title="Hỏi ý kiến khán giả">👥</button>
            <button data-l="call" title="Gọi điện thoại cho người thân">📞</button><button data-l="swap" title="Đổi câu hỏi">🔄</button>
          </div>
          <ol class="mil-ladder">${values.map((v, i) => `<li data-i="${i}" class="${safes.includes(i) ? "safe" : ""}"><span>${i + 1}</span><b>${U.fmtNum(v)}</b></li>`).reverse().join("")}</ol>
        </aside></div>`);
      const mil = $(".mil", stage);
      let cur = 0, over = false, qctrl = null, tId = null, locked = false;
      const used = {};
      const won = () => (cur > 0 ? values[cur - 1] : 0);
      const safeAmt = () => { let s = 0; safes.forEach((i) => { if (cur > i) s = values[i]; }); return s; };

      function ladder() {
        $$(".mil-ladder li", mil).forEach((li) => { const i = +li.dataset.i; li.classList.toggle("cur", i === cur); li.classList.toggle("done", i < cur); });
        const amt = $(".ml-amt", mil); amt.textContent = U.fmtNum(won());
      }
      function show() {
        locked = false; ladder();
        const it = qs[cur];
        qctrl && qctrl.destroy && qctrl.destroy(); qctrl = null;
        const box = $(".mil-q", mil);
        if (it.type === "MC") {
          box.innerHTML = `<div class="mq-stem"><span class="mq-n">Câu ${cur + 1}</span>${it.context ? `<div class="q-ctx">${Quiz.rich(it.context)}</div>` : ""}${Quiz.rich(it.stem)}</div>
            <div class="mq-opts">${it.options.map((o, i) => `<button class="mq-opt" data-k="${o.key}" style="--i:${i}"><b>${Quiz.LET[i]}:</b><span>${Quiz.rich(o.text)}</span></button>`).join("")}</div>`;
          Quiz.typeset(box);
          $$(".mq-opt", box).forEach((b) => (b.onclick = () => pick(b)));
        } else {
          box.innerHTML = `<div class="mq-stem"><span class="mq-n">Câu ${cur + 1}</span></div><div class="mq-card"></div>`;
          qctrl = Quiz.mount($(".mq-card", box), it, { explain: cfg.explain, meta: false, onAnswer: (res) => result(res.ok) });
        }
        $$(".mil-life button", mil).forEach((b) => { b.disabled = used[b.dataset.l] || (it.type !== "MC" && b.dataset.l !== "swap" && b.dataset.l !== "call") || (b.dataset.l === "swap" && !spare.length); b.classList.toggle("used", !!used[b.dataset.l]); });
        timer();
      }
      function timer() {
        tId && ctx.timers.stop(tId);
        const el = $(".mil-timer", mil); el.innerHTML = "";
        if (!cfg.qtime) return;
        let left = cfg.qtime; el.innerHTML = `<b>${left}</b>`;
        tId = ctx.timers.every(1000, () => {
          left--; el.innerHTML = `<b class="${left <= 5 ? "hot" : ""}">${left}</b>`; if (left <= 5 && left > 0) U.Sound.tick();
          if (left <= 0) { ctx.timers.stop(tId); if (qctrl) qctrl.timeout(); else { GK.banner(stage, "⏰ Hết giờ!", 1200); result(false); } }
        });
      }
      function pick(b) {
        if (locked) return; locked = true; tId && ctx.timers.stop(tId);
        U.Sound.drum();
        const box = $(".mil-q", mil); $$(".mq-opt", box).forEach((x) => (x.disabled = true));
        b.classList.add("sel");
        ctx.timers.after(1600, () => {
          const it = qs[cur], ok = b.dataset.k === it.answer;
          $(`.mq-opt[data-k="${it.answer}"]`, box).classList.add("right");
          if (!ok) b.classList.add("wrong");
          ok ? U.Sound.correct() : U.Sound.wrong();
          if (cfg.explain && it.explain) { box.insertAdjacentHTML("beforeend", `<div class="lq-exp">💡 ${Quiz.rich(it.explain)}</div>`); Quiz.typeset(box); }
          result(ok);
        });
      }
      function result(ok) {
        tId && ctx.timers.stop(tId);
        if (ok) {
          cur++;
          ladder();
          if (cur >= N) return ctx.timers.after(1400, () => end(values[N - 1], "🏆 Xuất sắc! Chinh phục toàn bộ " + N + " câu hỏi!"));
          if (safes.includes(cur - 1)) GK.banner(stage, `🛡️ Đã vượt mốc an toàn: <b>${U.fmtNum(values[cur - 1])}</b> điểm`, 1700);
          ctx.timers.after(cfg.explain ? 3200 : 1900, show);
        } else ctx.timers.after(cfg.explain ? 3800 : 2200, () => end(safeAmt(), `Dừng bước ở câu ${cur + 1} — nhận điểm mốc an toàn`, true));
      }
      function end(score, sub, wrong) {
        if (over) return; over = true; tId && ctx.timers.stop(tId);
        ctx.finish({ unit: "điểm", sub, noTie: true, ranking: [{ name, color: "#f59e0b", score, correct: cur, wrong: wrong ? 1 : 0, avatar: "🎤" }] });
      }
      $("[data-a=stop]", mil).onclick = async () => {
        if (locked) return;
        if (await U.confirm(`Dừng cuộc chơi và nhận <b>${U.fmtNum(won())}</b> điểm?`, { ok: "Dừng lại" })) end(won(), `Dừng cuộc chơi an toàn sau ${cur} câu`);
      };
      // Quyền trợ giúp
      $$(".mil-life button", mil).forEach((b) => (b.onclick = () => {
        if (locked || used[b.dataset.l]) return;
        const it = qs[cur], l = b.dataset.l; used[l] = true; b.classList.add("used"); b.disabled = true; U.Sound.coin();
        if (l === "5050") {
          const wrong = U.shuffle(it.options.filter((o) => o.key !== it.answer)).slice(0, Math.max(0, it.options.length - 2));
          wrong.forEach((o) => { const el = $(`.mq-opt[data-k="${o.key}"]`, mil); el.classList.add("gone"); el.disabled = true; });
        } else if (l === "aud") {
          const opts = it.options.filter((o) => { const el = $(`.mq-opt[data-k="${o.key}"]`, mil); return el && !el.classList.contains("gone"); });
          const right = 38 + Math.floor(Math.random() * 35); let rest = 100 - right; const vals = {};
          opts.forEach((o, i) => { if (o.key === it.answer) vals[o.key] = right; });
          const others = opts.filter((o) => o.key !== it.answer);
          others.forEach((o, i) => { const v = i === others.length - 1 ? rest : Math.floor(Math.random() * rest); vals[o.key] = v; rest -= v; });
          if (!others.length) vals[it.answer] = 100;
          U.modal({ title: "👥 Ý kiến khán giả", size: "sm", body: `<div class="aud">${opts.map((o) => `<div class="aud-c"><div class="aud-b"><i style="height:${vals[o.key]}%"></i></div><b>${vals[o.key]}%</b><span>${o.label}</span></div>`).join("")}</div>` });
        } else if (l === "call") {
          const sure = Math.random() < 0.8;
          let msg;
          if (it.type === "MC") { const o = sure ? it.options.find((x) => x.key === it.answer) : U.pick(it.options); msg = `“Theo mình thì đáp án là <b>${o.label}</b>. Mình chắc khoảng ${sure ? 70 + Math.floor(Math.random() * 25) : 40 + Math.floor(Math.random() * 20)}% đó!”`; }
          else if (it.type === "SA") msg = sure ? `“Mình nhớ đáp án bắt đầu bằng <b>${esc(String(it.answer).trim().charAt(0))}</b>… cố lên!”` : "“Câu này khó quá, mình không chắc lắm…”";
          else { const i = Math.floor(Math.random() * it.options.length); msg = `“Ý <b>${it.options[i].key})</b> hình như là <b>${(sure ? it.answer[i] : Math.random() < 0.5) ? "ĐÚNG" : "SAI"}</b> đấy!”`; }
          U.modal({ title: "📞 Gọi điện thoại cho người thân", size: "sm", body: `<div class="call"><div class="call-ava">🧑‍🏫</div><p>${msg}</p></div>` });
        } else if (l === "swap") {
          const alt = spare.splice(spare.findIndex((q) => q.type === it.type) >= 0 ? spare.findIndex((q) => q.type === it.type) : 0, 1)[0];
          if (alt) { qs[cur] = alt; show(); GK.banner(stage, "🔄 Đã đổi câu hỏi!", 1000); }
        }
      }));
      GK.countdown(stage, `Chào mừng ${esc(name)} đến với chương trình!`).then(() => !over && show());
      return { destroy() { over = true; qctrl && qctrl.destroy && qctrl.destroy(); }, stop() { over = true; } };
    },

    /* ==================== TRỰC TUYẾN — cả lớp cùng leo thang ==================== */
    host(stage, ctx, players0) {
      const cfg = ctx.cfg, pin = ctx.room.pin;
      const Q = ctx.roomQs.slice().sort((a, b) => (LV[a.level] ?? 1) - (LV[b.level] ?? 1)).slice(0, cfg.count);
      const N = Q.length;
      const values = LADDER.slice(LADDER.length - N);
      const safes = [N - 11, N - 6].filter((x) => x >= 0);
      let players = {}; players0.forEach((p) => (players[p.pid] = p));
      const money = {}, rung = {}, alive = {};
      const ensure = (pid) => { if (money[pid] == null) { money[pid] = 0; rung[pid] = 0; alive[pid] = true; } };
      Object.keys(players).forEach(ensure);
      const hud = GK.hud(stage, ctx, { title: "Triệu phú · PIN " + pin, mid: `<span class="milh-prog"></span>`, right: `<button class="btn btn-sm btn-fun" data-a="dash">📊 Tình hình</button> <span class="chip" style="background:#fde047;color:#7c2d12">👥 <b class="milh-pc">0</b></span>` });
      stage.insertAdjacentHTML("beforeend", `<div class="milh"><div class="milh-main"></div><aside class="milh-side"><div class="milh-rungs"></div><div class="milh-players"></div></aside></div>`);
      const main = $(".milh-main", stage), sideP = $(".milh-players", stage), sideR = $(".milh-rungs", stage);
      let qi = -1, over = false, offAns = null, tick = null, answers = {}, revealed = -1;
      const offP = Room.watchPlayers(pin, (ps) => { players = ps || {}; Object.keys(players).forEach(ensure); $(".milh-pc", hud).textContent = Object.keys(players).length; drawPlayers(); });
      const aliveCount = () => Object.keys(players).filter((pid) => alive[pid] !== false).length;
      const rowsData = () => Object.entries(players).map(([pid, p]) => Object.assign({ pid, money: money[pid] || 0, out: alive[pid] === false, rung: rung[pid] || 0 }, p)).sort((a, b) => (b.money - a.money) || (a.out - b.out));
      const guaranteed = (passed) => { let g = 0; safes.forEach((s) => { if (s <= passed - 1) g = values[s]; }); return g; };

      function drawRungs() { sideR.innerHTML = `<div class="mlh-cap">🪜 Thang điểm</div>` + values.map((v, i) => `<div class="mlh-rung ${i === qi ? "cur" : ""} ${i < qi ? "done" : ""} ${safes.includes(i) ? "safe" : ""}"><span>${i + 1}</span><b>${U.fmtNum(v)}</b></div>`).reverse().join(""); }
      function drawPlayers() {
        const list = rowsData();
        sideP.innerHTML = `<div class="mlh-cap">👥 Người chơi · <b>${aliveCount()}</b> còn trong cuộc</div>` + (list.length ? list.map((p) => `<div class="mlh-p ${p.out ? "out" : "alive"}"><span class="mlh-av">${p.avatar || "🙂"}</span><b>${esc(p.name)}</b><small>${p.out ? "⛔ dừng" : p.rung ? ("bậc " + p.rung) : "—"}</small><span class="mlh-m">${U.fmtNum(p.money)}</span></div>`).join("") : `<p class="muted" style="padding:10px">Chưa có ai vào phòng…</p>`);
      }
      function dashboard() {
        const list = rowsData();
        U.modal({ title: "📊 Tình hình người chơi", size: "lg", body: `<div class="mlh-dash">${list.length ? list.map((p, i) => `<div class="mlh-drow ${p.out ? "out" : ""}"><span class="mlh-dr">${i + 1}</span><span class="mlh-av">${p.avatar || "🙂"}</span><b>${esc(p.name)}</b><small>${p.out ? "⛔ dừng ở bậc " + p.rung : p.rung ? ("đang ở bậc " + p.rung + "/" + N) : "chưa trả lời câu nào"}</small><span class="mlh-m">${U.fmtNum(p.money)}</span></div>`).join("") : "<p>Chưa có người chơi.</p>"}</div>` });
      }
      $("[data-a=dash]", hud).onclick = dashboard;

      function showQuestion() {
        qi++; drawRungs();
        if (qi >= N || aliveCount() === 0) return podium();
        answers = {};
        const it = Q[qi], dur = cfg.qtime, startAt = Room.now() + 2500, value = values[qi];
        $(".milh-prog", hud).innerHTML = `Câu <b>${qi + 1}</b>/${N} · 💰 ${U.fmtNum(value)}`;
        main.innerHTML = `<div class="milh-intro"><div class="mi-amt">${U.fmtNum(value)} điểm</div><span class="mi-n">Câu ${qi + 1}/${N}${safes.includes(qi) ? " · 🛡️ Mốc an toàn" : ""}</span><div class="mi-type">${Quiz.TYPES[it.type]}</div></div>`;
        Room.setState(pin, { phase: "question", qi, startAt, dur, value, rung: qi + 1, total: N });
        ctx.timers.after(2500, () => { if (over) return; renderQ(it, dur, startAt, value); });
      }
      function renderQ(it, dur, startAt, value) {
        let body = "";
        if (it.type === "MC") body = `<div class="lq-opts n${it.options.length}">${it.options.map((o, i) => `<div class="lq-opt" style="--oc:${COLORS[i]};--i:${i}" data-k="${o.key}"><span class="lq-sh">${Quiz.SHAPES[i]}</span><span class="lq-tx">${Quiz.rich(o.text)}</span><span class="lq-cnt"></span></div>`).join("")}</div>`;
        else if (it.type === "TF") body = `<div class="lq-tf">${it.options.map((o, i) => `<div class="lq-tfr" style="--i:${i}" data-i="${i}"><b>${o.key})</b><span>${Quiz.rich(o.text)}</span><em class="lq-tfa"></em></div>`).join("")}</div>`;
        else body = `<div class="lq-sa">✍️ Nhập câu trả lời trên điện thoại<div class="lq-sa-ans"></div></div>`;
        main.innerHTML = `<div class="lq-q milh-q"><div class="lq-top"><div class="lq-timer"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="tr" cx="22" cy="22" r="19"/></svg><b>${dur || "∞"}</b></div><div class="lq-stem"><span class="milh-val">💰 ${U.fmtNum(value)} điểm</span>${it.context ? `<div class="q-ctx">${Quiz.rich(it.context)}</div>` : ""}${Quiz.rich(it.stem)}</div><div class="lq-ans"><b>0/${aliveCount()}</b><span>đã trả lời</span></div></div>${body}<div class="lq-act"><button class="btn btn-lg btn-white" data-a="skip">⏭ Dừng & công bố</button></div></div>`;
        Quiz.typeset(main);
        $("[data-a=skip]", main).onclick = reveal;
        const tr = $(".tr", main), tb = $(".lq-timer b", main);
        if (dur) tick = ctx.timers.every(200, () => { const left = Math.max(0, dur - (Room.now() - startAt) / 1000); tb.textContent = Math.ceil(left); if (tr) tr.style.strokeDashoffset = (1 - left / dur) * 119.4; if (left <= 0) reveal(); });
        offAns && offAns();
        offAns = Room.watchAnswers(pin, qi, (a) => { answers = a || {}; const na = Object.keys(answers).filter((pid) => alive[pid] !== false).length; const el = $(".lq-ans b", main); if (el) el.textContent = na + "/" + aliveCount(); if (na >= aliveCount() && aliveCount() > 0) ctx.timers.after(500, reveal); });
        U.Sound.go();
      }
      function reveal() {
        if (revealed === qi || over) return; revealed = qi;
        tick && ctx.timers.stop(tick); offAns && offAns(); offAns = null;
        const it = Q[qi], A = answers, value = values[qi];
        Room.setState(pin, { phase: "reveal", qi, value });
        U.Sound.coin();
        const lq = $(".lq-q", main);
        if (lq) {
          lq.classList.add("revealed");
          if (it.type === "MC") $$(".lq-opt", main).forEach((el) => { const k = el.dataset.k, n = Object.values(A).filter((x) => x.given === k).length; el.classList.add(k === it.answer ? "right" : "wrong"); $(".lq-cnt", el).textContent = n; });
          else if (it.type === "TF") $$(".lq-tfr", main).forEach((el) => { const i = +el.dataset.i; el.classList.add("show"); $(".lq-tfa", el).innerHTML = `<span class="${it.answer[i] ? "t" : "f"}">${it.answer[i] ? "ĐÚNG" : "SAI"}</span>`; });
          else $(".lq-sa-ans", main).innerHTML = `<div class="lq-sa-right">Đáp án: <b>${esc(String(it.answer).split("|")[0])}</b></div>`;
        }
        Object.keys(players).forEach((pid) => {
          if (alive[pid] === false) return; ensure(pid);
          const ans = A[pid];
          if (ans && ans.ok) { money[pid] = value; rung[pid] = qi + 1; }
          else { alive[pid] = false; money[pid] = guaranteed(qi); }
          Room.updatePlayer(pin, pid, { score: money[pid], out: alive[pid] === false, rung: rung[pid] });
        });
        drawPlayers(); drawRungs();
        const act = $(".lq-act", main);
        if (act) { const last = qi + 1 >= N || aliveCount() === 0; act.innerHTML = `<button class="btn btn-xl btn-fun btn-3d" data-a="next">${last ? "🎉 Kết quả chung cuộc" : "Câu tiếp theo ➜"}</button> <button class="btn btn-lg btn-white" data-a="dash2">📊 Tình hình</button>`; $("[data-a=next]", act).onclick = () => { if (!last) Room.setState(pin, { phase: "board", qi }); ctx.timers.after(60, showQuestion); }; $("[data-a=dash2]", act).onclick = dashboard; }
        if (cfg.auto) ctx.timers.after(6000, () => { if (revealed === qi && !over && $("[data-a=next]", main)) { Room.setState(pin, { phase: "board", qi }); showQuestion(); } });
      }
      function podium() {
        if (over) return; over = true; offP && offP(); offAns && offAns();
        Room.setState(pin, { phase: "podium" });
        const R = Object.entries(players).map(([pid, p]) => Object.assign({ pid, money: money[pid] || 0 }, p)).sort((a, b) => b.money - a.money);
        ctx.finish({ unit: "điểm", sub: `${R.length} người chơi · mốc cao nhất ${U.fmtNum(values[N - 1])} điểm`, ranking: R.map((p, i) => ({ pid: p.pid, name: p.name, avatar: p.avatar, color: U.TEAM_COLORS[i % 6], score: p.money })) });
      }
      drawRungs(); drawPlayers();
      GK.countdown(stage, "Sẵn sàng chinh phục Ai là triệu phú!").then(() => !over && showQuestion());
      return { destroy() { over = true; offP && offP(); offAns && offAns(); }, stop() { over = true; offP && offP(); } };
    }
  });
})();
