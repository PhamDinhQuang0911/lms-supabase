/* =========================================================
   vong-quay.js — VÒNG QUAY KỲ DIỆU (3 chế độ)
   🏆 Thi đấu theo đội : quay chọn giá trị câu hỏi, đúng thì ăn điểm.
   🎯 Gọi tên ngẫu nhiên: mỗi ô là 1 học sinh (tối đa 100), có thể
                          hỏi câu hỏi cho người được gọi.
   🎁 Quay số trúng thưởng: quay chọn người trúng lần lượt từng giải.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const SEG = [
    { v: 100, c: "#ef4444" }, { v: 300, c: "#f59e0b" }, { k: "x2", t: "x2", c: "#7c3aed", d: "Nhân đôi: câu hỏi trị giá 600!" },
    { v: 200, c: "#22c55e" }, { k: "lose", t: "😴", c: "#334155", d: "Mất lượt rồi!" }, { v: 400, c: "#3b82f6" },
    { k: "bonus", t: "🎁", c: "#ec4899", d: "Quà tặng: +100 điểm không cần trả lời!" }, { v: 150, c: "#14b8a6" },
    { v: 500, c: "#f97316" }, { k: "steal", t: "🦹", c: "#0f172a", d: "Siêu trộm: trả lời đúng để lấy 200 điểm của đội dẫn đầu!" },
    { v: 250, c: "#a855f7" }, { k: "again", t: "🔁", c: "#0ea5e9", d: "Được quay thêm lần nữa!" }
  ];
  const PALETTE = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#e11d48"];

  /* Vẽ bánh xe với danh sách ô bất kỳ: [{label, color}] */
  function drawWheel(cv, segs) {
    const ctx = cv.getContext("2d"), S = cv.width, R = S / 2, n = segs.length;
    ctx.clearRect(0, 0, S, S);
    const arc = (2 * Math.PI * R * 0.62) / n;
    const font = Math.max(9, Math.min(S * 0.064, arc * 0.62));
    segs.forEach((s, i) => {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R * 0.96, a0, a1); ctx.closePath();
      const g = ctx.createRadialGradient(R, R, R * 0.2, R, R, R); g.addColorStop(0, U.shade(s.color, 0.25)); g.addColorStop(1, s.color);
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = n > 50 ? 1.2 : S * 0.006; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.save(); ctx.translate(R, R); ctx.rotate((a0 + a1) / 2);
      ctx.fillStyle = "#fff"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      let fs = s.emoji ? font * 1.15 : font; const maxW = R * 0.64; let t = String(s.label);
      const setF = () => (ctx.font = `800 ${fs}px "Baloo 2", "Be Vietnam Pro", Arial`); setF();
      while (ctx.measureText(t).width > maxW && fs > Math.max(9, font * 0.55)) { fs *= 0.92; setF(); }
      ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 5;
      if (ctx.measureText(t).width > maxW) { while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1); t += "…"; }
      ctx.fillText(t, R * 0.88, 0); ctx.restore();
    });
    ctx.beginPath(); ctx.arc(R, R, R * 0.96, 0, Math.PI * 2); ctx.lineWidth = S * 0.03; ctx.strokeStyle = "#1d2340"; ctx.stroke();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ctx.beginPath(); ctx.arc(R + Math.cos(a) * R * 0.96, R + Math.sin(a) * R * 0.96, S * 0.011, 0, Math.PI * 2); ctx.fillStyle = i % 2 ? "#ffd166" : "#fff"; ctx.fill(); }
  }

  /* Bộ quay dùng chung: quay tới ô bất kỳ, gọi onTick(seg) khi qua mỗi ô */
  function spinner(cv, wheel, cfg) {
    let angle = 0, raf = 0;
    return {
      spin(n, onTick) {
        return new Promise((res) => {
          const target = Math.floor(Math.random() * n), segA = 360 / n;
          const want = 360 - (target * segA + segA / 2) + (Math.random() - 0.5) * segA * 0.6;
          const from = angle, to = angle + 360 * (4 + Math.floor(Math.random() * 3)) + ((want - (angle % 360)) + 360) % 360;
          const t0 = performance.now(), dur = (cfg.spinTime || 5) * 1000; let last = -1;
          cancelAnimationFrame(raf);
          (function f(t) {
            const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
            angle = from + (to - from) * e; cv.style.transform = `rotate(${angle}deg)`;
            const seg = Math.floor((((360 - (angle % 360)) % 360) / segA)) % n;
            if (seg !== last) { last = seg; U.Sound.spin(); wheel.classList.remove("tick"); void wheel.offsetWidth; wheel.classList.add("tick"); onTick && onTick(seg); }
            if (k < 1) raf = requestAnimationFrame(f); else res(target);
          })(t0);
        });
      },
      stop() { cancelAnimationFrame(raf); }
    };
  }

  function parsePeople(cfg) {
    let names = String(cfg.names || "").split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
    if (!names.length) names = Array.from({ length: U.clamp(+cfg.count || 30, 2, 100) }, (_, i) => String(i + 1));
    return names.slice(0, 100).map((name, i) => ({ name, i, color: PALETTE[i % PALETTE.length], score: 0, correct: 0, wrong: 0, called: 0 }));
  }

  const isTeam = (c) => (c.wheelMode || "team") === "team";
  Games.register({
    id: "vong-quay", order: 90, name: "Vòng quay kỳ diệu", icon: "🎡", colors: ["#fde047", "#fb7185"],
    tagline: "Thi đấu theo đội, gọi tên ngẫu nhiên hay quay số trúng thưởng — tất cả trong một vòng quay!",
    tags: ["1–8 đội", "Gọi tên", "Trúng thưởng"], modes: ["local"], minQ: 8,
    howto: ["<b>🏆 Thi đấu theo đội</b>: quay chọn giá trị câu hỏi, trả lời đúng để ăn điểm (có ô x2, 🎁, 🔁, 😴, 🦹).",
      "<b>🎯 Gọi tên ngẫu nhiên</b>: dán danh sách lớp (tối đa 100 bạn) hoặc chỉ cần nhập số người — vòng quay chọn ai trả lời.",
      "<b>🎁 Quay số trúng thưởng</b>: nhập danh sách giải, quay lần lượt từng giải, người trúng tự rời vòng quay.",
      "Bấm <b>QUAY</b> hoặc phím <kbd>Space</kbd>."],
    needsQuestions: (c) => isTeam(c) || (c.wheelMode === "pick" && !!c.askQ) || (c.wheelMode === "prize" && !!c.prizeAskQ),
    fields: [
      { key: "wheelMode", type: "seg", label: "Chế độ vòng quay", options: [["team", "🏆 Thi đấu theo đội"], ["pick", "🎯 Gọi tên ngẫu nhiên"], ["prize", "🎁 Quay số trúng thưởng"]], def: "team" },
      { key: "teams", type: "teams", min: 1, max: 8, def: 3, when: isTeam },
      { key: "rounds", type: "range", label: "Số lượt quay mỗi đội", min: 1, max: 10, def: 3, unit: " lượt", when: isTeam },
      { key: "pickTurn", type: "toggle", label: "Giáo viên tự chọn đội mỗi lượt (bấm vào đội còn lượt)", def: false, when: isTeam },
      { key: "names", type: "textarea", label: "Danh sách người chơi (mỗi dòng một tên)", def: "", rows: 5, placeholder: "Nguyễn Văn An\nTrần Thị Bình\n…\n(để trống = dùng số thứ tự 1, 2, 3…)", hint: "Có thể dán thẳng cột tên từ Excel. Tối đa 100 người.", when: (c) => !isTeam(c) },
      { key: "count", type: "number", label: "Số người / số phiếu (khi không nhập tên)", min: 2, max: 100, def: 30, hint: "Nhập số từ 2 đến 100 — vòng quay sẽ có các ô 1, 2, 3…", when: (c) => !isTeam(c), describeWhen: (c) => !String(c.names || "").trim() },
      { key: "prizes", type: "textarea", label: "Danh sách giải thưởng (quay lần lượt từ trên xuống)", def: "", rows: 4, placeholder: "Giải khuyến khích\nGiải ba\nGiải nhì\nGiải nhất\n(để trống = quay tự do, không giới hạn)", hint: "Khi bật “Dùng câu hỏi”, mỗi dòng là phần thưởng cho một câu trả lời đúng.", when: (c) => c.wheelMode === "prize" },
      { key: "prizeAskQ", type: "toggle", label: "Dùng câu hỏi: người trúng phải trả lời ĐÚNG mới nhận thưởng (sai thì chưa nhận, giải để dành lượt sau)", def: false, when: (c) => c.wheelMode === "prize" },
      { key: "removePicked", type: "toggle", label: "Loại người đã được gọi ra khỏi vòng quay", def: true, when: (c) => c.wheelMode === "pick" },
      { key: "askQ", type: "toggle", label: "Dùng câu hỏi: người được gọi trả lời một câu hỏi (đúng +10 điểm)", def: false, when: (c) => c.wheelMode === "pick" },
      { key: "qtime", type: "range", label: "Thời gian trả lời (0 = không giới hạn)", min: 0, max: 120, step: 5, def: 40, unit: " giây", when: (c) => isTeam(c) || (c.wheelMode === "pick" && c.askQ) || (c.wheelMode === "prize" && c.prizeAskQ) },
      { key: "spinTime", type: "range", label: "Thời gian quay", min: 2, max: 12, def: 5, unit: " giây" }
    ],

    play(stage, ctx) {
      const mode = ctx.cfg.wheelMode || "team";
      if (mode === "team") return playTeams(stage, ctx);
      return playPeople(stage, ctx, mode);
    }
  });

  /* Hỏi một câu trong hộp thoại, trả về kết quả (hoặc null) */
  async function askQuestion(ctx, queue, title) {
    const item = queue.next(), cfg = ctx.cfg;
    const m = U.modal({ title, size: "lg", body: `<div class="wq"><div class="wq-t"></div><div class="wq-q"></div></div>`, dismissible: false });
    let res = null, tid = null;
    const ctl = Quiz.mount($(".wq-q", m.body), item, { explain: cfg.explain, hotkeys: true, autofocus: true, onAnswer: (r) => {
      res = r; tid && ctx.timers.stop(tid);
      $(".wq", m.body).insertAdjacentHTML("beforeend", `<div style="text-align:right;margin-top:12px"><button class="btn btn-lg btn-primary" id="wqOk">Tiếp tục ➜</button></div>`);
      $("#wqOk", m.body).onclick = () => m.close();
    } });
    if (cfg.qtime) { let left = cfg.qtime; const el = $(".wq-t", m.body); el.textContent = "⏱ " + left + "s"; tid = ctx.timers.every(1000, () => { left--; el.textContent = "⏱ " + left + "s"; if (left <= 5 && left > 0) U.Sound.tick(); if (left <= 0) { ctx.timers.stop(tid); ctl.timeout(); } }); }
    await m.result; ctl.destroy(); tid && ctx.timers.stop(tid);
    return res;
  }

  function wheelShell(stage, sideHTML) {
    stage.insertAdjacentHTML("beforeend", `<div class="wheel-game">
      <div class="wg-left"><div class="wg-wheel"><canvas width="1000" height="1000"></canvas><div class="wg-hub">QUAY</div><div class="wg-ptr"></div></div><div class="wg-ticker"><span>Sẵn sàng!</span></div></div>
      <aside class="wg-side">${sideHTML}</aside></div>`);
    return { cv: $("canvas", stage), wheel: $(".wg-wheel", stage), side: $(".wg-side", stage), ticker: $(".wg-ticker span", stage) };
  }
  function bindSpinKeys(ctx, fn) {
    const key = (e) => { if (e.code === "Space" && !document.querySelector(".modal-wrap,.lbx,.wg-reveal,.res-ov") && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); fn(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }

  /* ====================== 🏆 THI ĐẤU THEO ĐỘI ====================== */
  function playTeams(stage, ctx) {
    const cfg = ctx.cfg, T = ctx.teams;
    const queue = Quiz.queue(ctx.items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA });
    const hud = GK.hud(stage, ctx, { mid: `<span class="hud-turn"></span>` });
    const W = wheelShell(stage, `
      <div class="wg-board">${T.map((t, i) => `<div class="wt" data-t="${i}" style="--tc:${t.color}"><b>${esc(t.name)}</b><small class="wt-r"></small><span class="wt-p">0</span></div>`).join("")}</div>
      <div class="wg-res"><span>🎡</span><p>Bấm <b>QUAY</b> hoặc phím <kbd>Space</kbd> để bắt đầu!</p></div>
      <button class="btn btn-xl btn-fun btn-3d" id="spinBtn">🎡 QUAY!</button>`);
    const segs = SEG.map((s) => ({ label: s.v || s.t, color: s.c, emoji: !s.v }));
    drawWheel(W.cv, segs);
    const sp = spinner(W.cv, W.wheel, cfg);
    const st = T.map(() => ({ pts: 0, spins: 0, correct: 0, wrong: 0 }));
    let turn = 0, spinning = false, over = false, awaitingPick = false;
    const side = W.side;
    const pickMode = !!cfg.pickTurn && T.length > 1;
    const refresh = () => {
      $$(".wt", side).forEach((el, i) => { el.classList.toggle("on", i === turn); $(".wt-p", el).textContent = U.fmtNum(st[i].pts); $(".wt-r", el).textContent = `${st[i].spins}/${cfg.rounds} lượt`; });
      $(".hud-turn", hud).innerHTML = pickMode ? `👉 Giáo viên chọn đội — đang chọn: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>` : `Lượt: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>`;
      T.map((_, i) => i).sort((a, b) => st[b].pts - st[a].pts).forEach((i, r) => ($(`.wt[data-t="${i}"]`, side).style.order = r));
    };
    const setRes = (ic, html) => ($(".wg-res", side).innerHTML = `<span>${ic}</span><p>${html}</p>`);
    function pickNext() {
      if (st.every((s) => s.spins >= cfg.rounds)) return end();
      awaitingPick = true; refresh(); $("#spinBtn", side).disabled = true;
      setRes("👉", "Giáo viên chọn đội tiếp theo — bấm vào một đội còn lượt quay");
      $$(".wt", side).forEach((el, i) => el.classList.toggle("pickable", st[i].spins < cfg.rounds));
    }
    function nextTurn(again) {
      if (over) return;
      if (again) { refresh(); $("#spinBtn", side).disabled = false; return; }
      if (pickMode) return pickNext();
      let k = 0; do { turn = (turn + 1) % T.length; k++; } while (st[turn].spins >= cfg.rounds && k <= T.length);
      if (st.every((s) => s.spins >= cfg.rounds)) return end();
      refresh(); $("#spinBtn", side).disabled = false;
    }
    async function spin() {
      if (spinning || over || awaitingPick) return;
      spinning = true; $("#spinBtn", side).disabled = true; st[turn].spins++; refresh();
      const i = await sp.spin(segs.length, (k) => (W.ticker.textContent = SEG[k].v ? SEG[k].v + " điểm" : SEG[k].d.split(":")[0]));
      spinning = false; if (!over) land(i);
    }
    async function land(i) {
      const s = SEG[i], t = turn;
      W.ticker.parentNode.classList.remove("hit"); void W.ticker.offsetWidth; W.ticker.parentNode.classList.add("hit");
      if (s.k === "lose") { U.Sound.lose(); setRes("😴", `<b>${esc(T[t].name)}</b>: ${s.d}`); GK.banner(stage, "😴 Mất lượt!", 1300); return ctx.timers.after(1600, () => nextTurn()); }
      if (s.k === "again") { U.Sound.coin(); st[t].spins--; setRes("🔁", s.d); GK.banner(stage, "🔁 Quay thêm lần nữa!", 1300); return ctx.timers.after(1400, () => nextTurn(true)); }
      if (s.k === "bonus") { U.Sound.coin(); st[t].pts += 100; refresh(); setRes("🎁", `<b>${esc(T[t].name)}</b> nhận +100 điểm quà tặng!`); GK.banner(stage, "🎁 +100 điểm!", 1300); return ctx.timers.after(1600, () => nextTurn()); }
      const value = s.k === "x2" ? 600 : s.k === "steal" ? 200 : s.v;
      setRes(s.v ? "💎" : s.t, s.d || `Câu hỏi trị giá <b>${value}</b> điểm`);
      U.Sound.pop(); await U.sleep(700); if (over) return;
      const res = await askQuestion(ctx, queue, `${s.v ? "💎 " + value + " điểm" : s.t + " " + value + " điểm"} — <span style="color:${T[t].color}">${esc(T[t].name)}</span>`);
      if (over) return;
      if (res && res.ok) {
        st[t].correct++;
        if (s.k === "steal") {
          const lead = T.map((_, k) => k).filter((k) => k !== t).sort((a, b) => st[b].pts - st[a].pts)[0];
          if (lead != null) { const take = Math.min(200, st[lead].pts); st[lead].pts -= take; st[t].pts += take; setRes("🦹", `<b>${esc(T[t].name)}</b> lấy ${take} điểm của ${esc(T[lead].name)}!`); }
        } else { st[t].pts += Math.round(value * (res.points || 1)); setRes("🎉", `<b>${esc(T[t].name)}</b> +${value} điểm!`); }
        U.Sound.coin();
      } else { st[t].wrong++; setRes("💨", `<b>${esc(T[t].name)}</b> chưa ghi được điểm.`); }
      refresh(); ctx.timers.after(900, () => nextTurn());
    }
    function end() {
      if (over) return; over = true;
      const order = T.map((_, i) => i).sort((a, b) => st[b].pts - st[a].pts);
      ctx.finish({ unit: "điểm", sub: `${cfg.rounds} lượt quay mỗi đội`, ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: st[i].pts, correct: st[i].correct, wrong: st[i].wrong })) });
    }
    $("#spinBtn", side).onclick = spin; $(".wg-hub", stage).onclick = spin;
    if (pickMode) $$(".wt", side).forEach((el) => (el.onclick = () => { const i = +el.dataset.t; if (over || spinning || !el.classList.contains("pickable")) return; turn = i; awaitingPick = false; $$(".wt", side).forEach((x) => x.classList.remove("pickable")); U.Sound.click(); setRes("🎡", `Mời <b style="color:${T[i].color}">${esc(T[i].name)}</b> bấm QUAY!`); refresh(); $("#spinBtn", side).disabled = false; }));
    const unbind = bindSpinKeys(ctx, spin);
    refresh(); if (pickMode) pickNext();
    return { destroy() { over = true; sp.stop(); unbind(); }, stop() { over = true; } };
  }

  /* ============ 🎯 GỌI TÊN NGẪU NHIÊN  &  🎁 QUAY SỐ TRÚNG THƯỞNG ============ */
  function playPeople(stage, ctx, mode) {
    const cfg = ctx.cfg, prize = mode === "prize";
    const all = parsePeople(cfg);
    let active = all.slice();
    const prizes = prize ? String(cfg.prizes || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
    const useQ = (prize ? !!cfg.prizeAskQ : !!cfg.askQ) && ctx.items.length > 0;
    const queue = useQ ? Quiz.queue(ctx.items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA }) : null;
    const history = []; // {person, prize?, res?}
    let spinning = false, over = false, awarded = 0;   // awarded = số giải đã trao (chỉ tăng khi trúng)
    const hud = GK.hud(stage, ctx, { title: prize ? "Quay số trúng thưởng" : "Vòng quay gọi tên", mid: `<span class="hud-turn"></span>`, right: `<button class="btn btn-sm btn-fun" data-a="end">🏁 Kết thúc</button>` });
    const W = wheelShell(stage, `
      <div class="wg-now"></div>
      <button class="btn btn-xl btn-fun btn-3d" id="spinBtn">🎡 QUAY!</button>
      <div class="wg-tools"><button class="btn btn-sm btn-ghost" data-a="reset">🔄 Đặt lại đủ ${all.length} người</button><button class="btn btn-sm btn-ghost" data-a="list">👥 Danh sách</button></div>
      <div class="wg-hist-h"><b>${prize ? "🏆 Người trúng thưởng" : "📋 Đã gọi"}</b><span class="chip" id="hCount">0</span></div>
      <ol class="wg-hist" id="hist"></ol>`);
    const sp = spinner(W.cv, W.wheel, cfg);
    const draw = () => drawWheel(W.cv, active.map((p) => ({ label: p.name, color: p.color })));
    const nextPrize = () => prizes[awarded] || null;                 // giải đang quay (prize có danh sách giải)
    const prizesDone = () => prize && prizes.length > 0 && awarded >= prizes.length;
    const winners = () => history.filter((x) => x.prize);            // prize: chỉ người thật sự trúng
    function refresh() {
      const left = active.length;
      $(".hud-turn", hud).innerHTML = prize
        ? (prizes.length ? `Giải: <b>${esc(nextPrize() || "Đã trao hết")}</b> · ${Math.min(awarded + (prizesDone() ? 0 : 1), prizes.length)}/${prizes.length}` : `Lượt quay <b>${history.length + 1}</b>`)
        : `Còn <b>${left}</b>/${all.length} người`;
      $(".wg-now", W.side).innerHTML = prize
        ? `<div class="now-prize"><small>${prizes.length ? (useQ ? "Trả lời đúng để nhận" : "Đang quay giải") : "Lượt quay số"}</small><b>${esc(prizes.length ? nextPrize() || "🎉 Đã trao hết giải" : "#" + (history.length + 1))}</b><span>${left} người đang có mặt${useQ ? " · cần trả lời đúng" : ""}</span></div>`
        : `<div class="now-prize pick"><small>Vòng quay gọi tên</small><b>${left} / ${all.length}</b><span>${cfg.removePicked ? "người chưa được gọi" : "người tham gia"}${useQ ? " · trả lời đúng +10 điểm" : ""}</span></div>`;
      const list = prize ? winners() : history;
      $("#hCount", W.side).textContent = list.length;
      $("#hist", W.side).innerHTML = list.slice().reverse().map((x, k) => `<li style="--pc:${x.person.color}"><span class="hn">${list.length - k}</span><b>${esc(x.person.name)}</b>${x.prize ? `<em>${esc(x.prize)}</em>` : ""}${x.res ? `<i class="${x.res.ok ? "ok" : "bad"}">${x.res.ok ? (prize ? "🏆" : "✓ +10") : "✗"}</i>` : ""}</li>`).join("") || `<li class="empty-h">Chưa có ai — bấm QUAY nhé!</li>`;
      $("#spinBtn", W.side).disabled = spinning || !active.length || prizesDone();
    }
    async function spin() {
      if (spinning || over || !active.length || prizesDone()) return;
      if (active.length === 1) { return land(0); }
      spinning = true; refresh();
      const i = await sp.spin(active.length, (k) => { const p = active[k]; if (p) { W.ticker.textContent = p.name; W.ticker.style.color = p.color; } });
      spinning = false; if (!over) land(i);
    }
    async function land(i) {
      const p = active[i]; if (!p) return;
      p.called++;
      W.ticker.textContent = p.name; W.ticker.parentNode.classList.remove("hit"); void W.ticker.offsetWidth; W.ticker.parentNode.classList.add("hit");
      const removeP = () => { active = active.filter((x) => x !== p); draw(); };

      if (prize) {
        const prz = nextPrize() || "";
        if (useQ) {
          // Được chọn — phải trả lời đúng mới nhận thưởng
          await reveal(p, { kind: "chosen", prize: prz, btn: "📝 Trả lời câu hỏi ➜" });
          if (over) return;
          const res = await askQuestion(ctx, queue, `🎁 <span style="color:${p.color}">${esc(p.name)}</span> trả lời để nhận ${prz ? "“" + esc(prz) + "”" : "phần thưởng"}`);
          if (over) return;
          if (res && res.ok) {
            p.score += 10; p.correct++;
            history.push({ person: p, prize: prz || "🎁 Trúng thưởng", res });
            if (prizes.length) awarded++;
            await reveal(p, { kind: "win", prize: prz });
          } else {
            p.wrong++;
            history.push({ person: p, prize: "", res: res || { ok: false } });
            U.Sound.wrong(); GK.banner(stage, `❌ <b>${esc(p.name)}</b> chưa trả lời đúng — giải để dành lượt sau`, 2200);
          }
          removeP();
        } else {
          // Không dùng câu hỏi: quay trúng là nhận luôn
          history.push({ person: p, prize: prz || ("🎟️ Lượt " + (history.length + 1)) });
          if (prizes.length) awarded++;
          await reveal(p, { kind: "win", prize: prz });
          removeP();
        }
      } else {
        // Gọi tên ngẫu nhiên
        await reveal(p, { kind: "pick", btn: useQ ? "📝 Trả lời câu hỏi ➜" : "Tiếp tục ➜" });
        if (over) return;
        const rec = { person: p };
        if (useQ) {
          const res = await askQuestion(ctx, queue, `🎯 Câu hỏi cho <span style="color:${p.color}">${esc(p.name)}</span>`);
          rec.res = res || { ok: false };
          if (res && res.ok) { p.score += 10; p.correct++; U.Sound.coin(); } else p.wrong++;
        }
        history.push(rec);
        if (cfg.removePicked) removeP();
      }
      refresh();
      if (!active.length || prizesDone()) ctx.timers.after(900, () => GK.banner(stage, prize ? "🎉 Đã trao hết giải thưởng!" : "✅ Đã gọi hết danh sách!", 2200));
    }
    /* o.kind: "win" (trúng/được gọi xong) · "chosen" (được chọn, sắp trả lời) · "pick" */
    function reveal(p, o) {
      o = o || {};
      const celebrate = o.kind === "win";
      return new Promise((res) => {
        if (celebrate) { U.Sound.win(); U.confetti({ burst: true, count: prize ? 200 : 120 }); } else U.Sound.pop();
        let small = "🎯 Xin mời", pz = "";
        if (o.kind === "win") { small = prize ? "🎉 Chúc mừng" : "🎯 Xin mời"; pz = o.prize ? `<div class="wr-prize">🏆 ${esc(o.prize)}</div>` : prize ? `<div class="wr-prize">🎟️ Lượt quay số ${winners().length + 1}</div>` : ""; }
        else if (o.kind === "chosen") { small = "🎯 Được chọn!"; pz = `<div class="wr-prize wr-stake">${o.prize ? "Trả lời đúng để nhận 🏆 " + esc(o.prize) : "Trả lời đúng để nhận thưởng"}</div>`; }
        const ov = h(`<div class="wg-reveal ${celebrate ? "" : "calm"}"><div class="wr-card" style="--pc:${p.color}">
          <div class="wr-rays"></div><small>${small}</small>
          <div class="wr-name">${esc(p.name)}</div>${pz}
          <button class="btn btn-xl btn-white btn-3d">${o.btn || "Tiếp tục ➜"}</button></div></div>`);
        stage.appendChild(ov);
        const done = () => { ov.classList.add("out"); setTimeout(() => ov.remove(), 250); document.removeEventListener("keydown", k); res(); };
        const k = (e) => { if (e.key === "Enter" || e.key === "Escape" || e.code === "Space") { e.preventDefault(); done(); } };
        setTimeout(() => document.addEventListener("keydown", k), 300);
        $("button", ov).onclick = done;
      });
    }
    function finish() {
      if (over) return; over = true; sp.stop();
      if (!prize && useQ && history.length) {
        const R = all.filter((p) => p.called).sort((a, b) => b.score - a.score || b.correct - a.correct);
        return ctx.finish({ unit: "điểm", sub: `Đã gọi ${history.length} lượt`, ranking: R.map((p) => ({ name: p.name, color: p.color, score: p.score, correct: p.correct, wrong: p.wrong })) });
      }
      const list = prize ? winners() : history;
      GK.summary(ctx, {
        icon: prize ? "🏆" : "📋", title: prize ? "Danh sách trúng thưởng" : "Danh sách đã gọi tên",
        sub: prize ? `${list.length} người trúng · ${all.length} người tham gia${useQ && history.length > list.length ? " · " + (history.length - list.length) + " lượt chưa trúng" : ""}` : `${history.length} lượt quay · ${all.length} người tham gia`,
        html: list.length ? `<div class="res-table"><table class="tbl"><thead><tr><th>#</th><th>Tên</th>${prize ? "<th>Giải</th>" : ""}</tr></thead><tbody>${list.map((x, k) => `<tr><td><b>${k + 1}</b></td><td><span class="dot" style="background:${x.person.color}"></span> ${esc(x.person.name)}</td>${prize ? `<td>${esc(x.prize || "—")}</td>` : ""}</tr>`).join("")}</tbody></table></div>
          <button class="btn btn-ghost" id="cpyList">📋 Sao chép danh sách</button>` : `<p class="muted">Chưa có ${prize ? "ai trúng thưởng" : "lượt quay nào"}.</p>`
      });
      const c = document.getElementById("cpyList");
      if (c) c.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(list.map((x, k) => `${k + 1}. ${x.person.name}${x.prize ? " — " + x.prize : ""}`).join("\n")); U.toast("Đã sao chép", "ok"); };
    }
    $("#spinBtn", W.side).onclick = spin; $(".wg-hub", stage).onclick = spin;
    $("[data-a=end]", hud).onclick = async () => { if (await U.confirm("Kết thúc và xem danh sách?", { ok: "Kết thúc" })) finish(); };
    $("[data-a=reset]", W.side).onclick = async () => { if (await U.confirm("Đặt lại vòng quay với đủ danh sách ban đầu? (lịch sử vẫn giữ)")) { active = all.slice(); draw(); refresh(); } };
    $("[data-a=list]", W.side).onclick = () => U.modal({ title: `👥 Danh sách (${all.length})`, size: "md", body: `<div class="ppl-list">${all.map((p) => `<span class="${active.includes(p) ? "" : "gone"}" style="--pc:${p.color}">${esc(p.name)}${p.score ? ` <b>${p.score}</b>` : ""}</span>`).join("")}</div><p class="muted" style="margin-bottom:0">Tên mờ = đã rời vòng quay.</p>` });
    const unbind = bindSpinKeys(ctx, spin);
    draw(); refresh();
    return { destroy() { over = true; sp.stop(); unbind(); }, stop() { over = true; } };
  }
})();
