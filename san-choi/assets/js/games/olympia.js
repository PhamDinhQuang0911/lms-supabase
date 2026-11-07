/* =========================================================
   olympia.js — ĐƯỜNG LÊN ĐỈNH OLYMPIA
   4 vòng: Khởi động · Vượt chướng ngại vật · Tăng tốc · Về đích.
   • Một màn hình: giáo viên dẫn chương trình, chấm Đúng/Sai cho
     từng thí sinh (linh hoạt như gameshow thật).
   • Trực tuyến: thí sinh trả lời trên điện thoại, chấm tự động,
     tính điểm theo luật từng vòng.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const ROUNDS = [
    { key: "khoidong", name: "Khởi động", icon: "🔥", desc: "Trả lời nhanh, mỗi câu đúng +10 điểm" },
    { key: "vuotcnv", name: "Vượt chướng ngại vật", icon: "🧩", desc: "Giải gợi ý & đoán từ khoá bí ẩn" },
    { key: "tangtoc", name: "Tăng tốc", icon: "⚡", desc: "Câu sau giá trị cao hơn: 10·20·30·40" },
    { key: "vedich", name: "Về đích", icon: "🏁", desc: "Tự chọn giá trị 10/20/30 & Ngôi sao hy vọng" }
  ];
  const starfield = (n) => Array.from({ length: n || 40 }, (_, i) => `<span class="ol-star" style="left:${(i * 53) % 100}%;top:${(i * 29) % 100}%;--d:${(i % 5) * .4}s;--s:${0.6 + (i % 4) * 0.3}"></span>`).join("");

  function scoreboardHTML(C) {
    return `<div class="ol-board">${C.map((c, i) => `<div class="ol-cst" data-c="${i}" style="--cc:${c.color}">
      <div class="ol-climb"><span class="ol-dot">🧗</span></div>
      <div class="ol-cname"><b>${esc(c.name)}</b></div><div class="ol-cscore">0</div></div>`).join("")}</div>`;
  }
  function paintBoard(stage, C) {
    const max = Math.max(100, ...C.map((c) => c.score));
    $$(".ol-cst", stage).forEach((el, i) => {
      $(".ol-cscore", el).textContent = U.fmtNum(C[i].score);
      $(".ol-climb .ol-dot", el).style.bottom = Math.max(0, Math.min(1, C[i].score / max)) * 86 + "%";
      el.classList.toggle("lead", C[i].score === Math.max(...C.map((x) => x.score)) && C[i].score > 0);
    });
  }

  Games.register({
    id: "olympia", order: 1, name: "Đường lên đỉnh Olympia", icon: "🏔️", colors: ["#1e3a8a", "#f59e0b"],
    tagline: "Sân chơi tri thức hoành tráng với 4 vòng thi huyền thoại — leo tới đỉnh vinh quang!",
    tags: ["2–4 thí sinh", "4 vòng thi", "Trực tuyến"], modes: ["local", "online"], onlineKind: "quiz", minQ: 12,
    figure: (c, i) => Art.pawn(c, i + 1),
    howto: [
      "<b>🔥 Khởi động</b>: trả lời nhanh, mỗi câu đúng +10 điểm.",
      "<b>🧩 Vượt chướng ngại vật</b>: giải các gợi ý hàng ngang, đoán <b>từ khoá</b> để ghi điểm lớn.",
      "<b>⚡ Tăng tốc</b>: 4 câu khó dần, giá trị 10·20·30·40.",
      "<b>🏁 Về đích</b>: tự chọn giá trị 10/20/30 mỗi câu, có <b>Ngôi sao hy vọng</b> nhân đôi."
    ],
    fields: [
      { key: "teams", type: "teams", min: 2, max: 4, def: 4, label: "Số thí sinh" },
      { key: "warmEach", type: "range", label: "Khởi động: số câu mỗi thí sinh", min: 2, max: 8, def: 3, unit: " câu", modes: ["local"] },
      { key: "warmCount", type: "range", label: "Khởi động: số câu (chung)", min: 4, max: 20, def: 8, unit: " câu", modes: ["online"] },
      { key: "obstacle", type: "text", label: "Từ khoá Chướng ngại vật (để trống = bỏ qua vòng này)", def: "", placeholder: "VD: TRI THUC" },
      { key: "vedichQ", type: "range", label: "Về đích: số câu mỗi thí sinh", min: 2, max: 5, def: 3, unit: " câu" },
      { key: "qtime", type: "range", label: "Thời gian mỗi câu", min: 10, max: 60, step: 5, def: 20, unit: " giây" },
      { key: "olPick", type: "toggle", label: "Giáo viên tự chọn thí sinh mỗi lượt (Khởi động & Về đích)", def: false, modes: ["local"] }
    ],
    roomSettings: (cfg) => ({ warmCount: cfg.warmCount, obstacle: cfg.obstacle, vedichQ: cfg.vedichQ, qtime: cfg.qtime, explain: cfg.explain }),

    /* ==================== MỘT MÀN HÌNH ==================== */
    play(stage, ctx) {
      const cfg = ctx.cfg, C = ctx.teams.map((t) => Object.assign({}, t, { score: 0, correct: 0, wrong: 0 }));
      const queue = Quiz.queue(ctx.items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA });
      const saPool = ctx.items.filter((i) => i.type === "SA");
      GK.hud(stage, ctx, { mid: `<span class="ol-round-tag"></span>`, right: `<button class="btn btn-sm btn-fun" data-a="skip">Bỏ qua vòng ▸</button>` });
      stage.insertAdjacentHTML("beforeend", `<div class="olympia"><div class="ol-sky">${starfield(46)}</div>
        <div class="ol-stage"><div class="ol-main" id="olMain"></div></div>
        ${scoreboardHTML(C)}</div>`);
      const main = $("#olMain", stage);
      let over = false, roundIdx = -1, skip = false, curAbort = null;
      const setRoundTag = (r) => ($(".ol-round-tag", stage).innerHTML = `<b>${r.icon} ${r.name}</b>`);
      paintBoard(stage, C);
      const pickMode = !!cfg.olPick && C.length > 1;
      function pickTeam(label) {
        return new Promise((resolve) => {
          main.innerHTML = `<div class="ol-pickteam"><h2>🖐️ ${esc(label)}</h2>
            <div class="olpt-grid">${C.map((c, i) => `<button class="olpt-b" data-i="${i}" style="--cc:${c.color}"><span class="olpt-dot"></span><b>${esc(c.name)}</b><small>${c.score} điểm</small></button>`).join("")}</div></div>`;
          curAbort = () => { curAbort = null; resolve(null); };
          $$(".olpt-b", main).forEach((b) => (b.onclick = () => { curAbort = null; U.Sound.click(); resolve(+b.dataset.i); }));
        });
      }

      function intro(r) {
        return new Promise((res) => {
          main.innerHTML = `<div class="ol-intro"><div class="oi-ic">${r.icon}</div><h1>${r.name}</h1><p>${r.desc}</p><button class="btn btn-xl btn-fun btn-3d" id="oiGo">Bắt đầu vòng ${roundIdx + 1} ▸</button></div>`;
          U.Sound.go();
          const go = () => { curAbort = null; res(); };
          curAbort = go; $("#oiGo", main).onclick = go;
        });
      }
      /* Khung hỏi MỘT MÀN HÌNH: giáo viên bấm chọn / gõ đáp án trực tiếp,
         hệ thống báo đúng/sai, rồi chấm điểm cho (các) thí sinh. */
      function ask(item, o) {
        o = o || {};
        const single = o.who != null;
        return new Promise((resolve) => {
          main.innerHTML = `<div class="ol-q">
            <div class="olq-top"><span class="olq-badge">${o.badge || Quiz.TYPES[item.type]}</span>${o.value ? `<span class="olq-val">${o.value} điểm</span>` : ""}<span class="olq-timer"></span></div>
            <div class="olq-stem">${item.context ? `<div class="q-ctx">${Quiz.rich(item.context)}</div>` : ""}${Quiz.rich(item.stem)}</div>
            <div class="olq-opts"></div>
            <div class="olq-answer hide">💡 Đáp án: <b>${Quiz.rich(Quiz.answerText(item))}</b>${item.explain ? `<div class="olq-exp">${Quiz.rich(item.explain)}</div>` : ""}</div>
            <div class="olq-judge hide"><div class="olj-label">Thí sinh nào trả lời đúng?</div><div class="olj-cst"></div></div>
            <div class="olq-ctrl"><button class="btn btn-lg btn-white" id="olReveal">👁️ Hiện đáp án</button><button class="btn btn-lg btn-primary hide" id="olNext">Tiếp theo ▸</button></div>
          </div>`;
          const optsEl = $(".olq-opts", main);
          let tfPicks = {};
          if (item.type === "MC") {
            optsEl.innerHTML = item.options.map((op, i) => `<div class="olq-opt" data-k="${op.key}" role="button" tabindex="0"><b>${Quiz.LET[i]}</b><span>${Quiz.rich(op.text)}</span></div>`).join("");
          } else if (item.type === "TF") {
            optsEl.innerHTML = `<div class="olq-tf">${item.options.map((op, i) => `<div class="olq-tfr" data-i="${i}"><span class="olq-tfs"><b>${op.key})</b> ${Quiz.rich(op.text)}</span><span class="olq-tfbtns"><button class="olq-tfb" data-v="1">Đúng</button><button class="olq-tfb" data-v="0">Sai</button></span><em class="hide"></em></div>`).join("")}</div>`;
          } else {
            optsEl.innerHTML = `<div class="olq-sa"><input class="input olq-sa-in" placeholder="Gõ đáp án của thí sinh rồi Enter…" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn btn-lg btn-primary" id="olSaGo">Kiểm tra ▸</button></div>`;
          }
          Quiz.typeset(main);
          const who = single ? [o.who] : C.map((_, i) => i);
          let timer = null, revealed = false, settled = false, chosenOk = null;
          const done = (arr) => { if (settled) return; settled = true; curAbort = null; timer && ctx.timers.stop(timer); resolve(arr || []); };
          curAbort = () => done([]);
          if (cfg.qtime) { let left = cfg.qtime; const el = $(".olq-timer", main); el.textContent = "⏱ " + left; timer = ctx.timers.every(1000, () => { left--; el.textContent = "⏱ " + left; if (left <= 5 && left > 0) U.Sound.tick(); if (left <= 0) { ctx.timers.stop(timer); reveal(); } }); }

          // —— Tương tác trực tiếp trên màn hình ——
          if (item.type === "MC") {
            $$(".olq-opt", optsEl).forEach((e) => {
              const choose = () => { if (revealed) return; chosenOk = e.dataset.k === item.answer; e.classList.add("chosen", chosenOk ? "pick-ok" : "pick-no"); (chosenOk ? U.Sound.correct : U.Sound.wrong)(); reveal(); };
              e.onclick = choose; e.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); choose(); } };
            });
          } else if (item.type === "TF") {
            $$(".olq-tfr", optsEl).forEach((row) => { const i = +row.dataset.i; $$(".olq-tfb", row).forEach((b) => (b.onclick = () => { if (revealed) return; tfPicks[i] = b.dataset.v === "1"; $$(".olq-tfb", row).forEach((x) => x.classList.toggle("on", x === b)); U.Sound.click(); })); });
          } else {
            const inp = $(".olq-sa-in", main);
            const go = () => { if (revealed) return; const val = inp.value.trim(); chosenOk = val ? !!Quiz.check(item, inp.value).ok : null; if (val) (chosenOk ? U.Sound.correct : U.Sound.wrong)(); reveal(); };
            $("#olSaGo", main).onclick = go;
            inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); go(); } });
            setTimeout(() => { try { inp.focus(); } catch (e) { } }, 60);
          }

          function reveal() {
            if (revealed) return; revealed = true; timer && ctx.timers.stop(timer); U.Sound.coin();
            if (item.type === "MC") $$(".olq-opt", main).forEach((e) => e.classList.toggle("right", e.dataset.k === item.answer));
            if (item.type === "TF") {
              const picked = Object.keys(tfPicks).length;
              if (picked === item.options.length) chosenOk = item.options.every((_, i) => tfPicks[i] === !!item.answer[i]);
              else if (picked) chosenOk = false;
              $$(".olq-tfr", main).forEach((row) => { const i = +row.dataset.i; const em = $("em", row); em.classList.remove("hide"); em.textContent = item.answer[i] ? "Đúng" : "Sai"; row.classList.add(item.answer[i] ? "tf-true" : "tf-false"); const pb = $(".olq-tfb.on", row); if (pb) pb.classList.add((pb.dataset.v === "1") === !!item.answer[i] ? "ok" : "no"); });
            }
            if (item.type === "SA") { const in2 = $(".olq-sa-in", main); if (in2) { in2.readOnly = true; if (chosenOk != null) in2.classList.add(chosenOk ? "ok" : "no"); } }
            $(".olq-answer", main).classList.remove("hide");
            const jc = $(".olj-cst", main);
            jc.innerHTML = who.map((i) => `<button class="olj-b" data-c="${i}" style="--cc:${C[i].color}"><span class="olj-dot"></span>${esc(C[i].name)}<i class="olj-mark"></i></button>`).join("");
            $(".olq-judge", main).classList.remove("hide");
            const got = {};
            $$(".olj-b", jc).forEach((b) => (b.onclick = () => { const i = +b.dataset.c; got[i] = !got[i]; b.classList.toggle("on", !!got[i]); U.Sound.click(); }));
            if (single && chosenOk === true) { got[who[0]] = true; const b = $(`.olj-b[data-c="${who[0]}"]`, jc); if (b) b.classList.add("on"); }
            $("#olReveal", main).classList.add("hide"); $("#olNext", main).classList.remove("hide");
            $("#olNext", main).onclick = () => { Object.keys(got).forEach((i) => { if (got[i]) { C[i].score += o.value || 10; C[i].correct++; } }); paintBoard(stage, C); done(Object.keys(got).filter((i) => got[i]).map(Number)); };
          }
          $("#olReveal", main).onclick = reveal;
        });
      }

      async function roundWarm() {
        for (let k = 0; k < cfg.warmEach; k++) for (let i = 0; i < C.length; i++) {
          if (over || skip) return;
          const idx = pickMode ? await pickTeam(`Khởi động · câu ${k + 1} — chọn thí sinh trả lời`) : i;
          if (over || skip || idx == null) return;
          GK.banner(stage, `🔥 ${esc(C[idx].name)} — câu ${k + 1}`, 1100); await U.sleep(900);
          if (over || skip) return;
          await ask(queue.next(), { who: idx, value: 10, badge: "Khởi động · " + C[idx].name });
        }
      }
      function roundObstacle() {
        const kw = String(cfg.obstacle || "").trim();
        if (!kw) return Promise.resolve();
        const kwCells = Array.from(kw.toUpperCase().replace(/\s+/g, ""));
        const rows = []; const used = new Set();
        for (let i = 0; i < Math.min(5, saPool.length); i++) { let it, g = 0; do { it = U.pick(saPool); g++; } while (used.has(it) && g < 20); if (!used.has(it)) { used.add(it); rows.push(it); } }
        const doneRows = new Set(); let revealed = false, finished = false;
        return new Promise((resolve) => {
          const finish = () => { if (finished) return; finished = true; resolve(); };
          function board() {
            if (finished || over) return;
            if (skip) return finish();
            curAbort = finish;
            main.innerHTML = `<div class="ol-obst"><h2>🧩 ${rows.length ? "Giải gợi ý rồi đoán" : "Hãy đoán"} Chướng ngại vật (${kwCells.length} chữ cái)</h2>
              <div class="olo-key big">${kwCells.map((c) => `<i class="${revealed ? "on" : ""}">${revealed ? esc(c) : "?"}</i>`).join("")}</div>
              ${rows.length ? `<div class="olo-rows">${rows.map((_, i) => `<button class="olo-row ${doneRows.has(i) ? "done" : ""}" data-i="${i}" ${doneRows.has(i) ? "disabled" : ""}>Gợi ý ${i + 1}</button>`).join("")}</div>` : ""}
              <div class="row" style="justify-content:center;gap:10px"><button class="btn btn-xl btn-fun btn-3d" data-a="guess">🔑 Đoán Chướng ngại vật</button>
              <button class="btn btn-lg btn-ghost" data-a="skipR">Sang vòng sau ▸</button></div></div>`;
            $$(".olo-row:not([disabled])", main).forEach((btn) => (btn.onclick = async () => {
              const i = +btn.dataset.i; await ask(rows[i], { value: 10, badge: "Gợi ý " + (i + 1) }); if (skip || over) return finish(); doneRows.add(i); board();
            }));
            $("[data-a=guess]", main).onclick = guess;
            $("[data-a=skipR]", main).onclick = finish;
          }
          function guess() {
            const early = doneRows.size < rows.length;
            U.modal({ title: "🔑 Đoán Chướng ngại vật", size: "md", body: `<p>Thí sinh nào trả lời? Chọn tên rồi nhập đáp án.</p>
              <div class="oc-pickc">${C.map((c, i) => `<button class="pickc" data-c="${i}" style="--cc:${c.color}">${esc(c.name)}</button>`).join("")}</div>
              <input class="input" id="oloAns" placeholder="Nhập Chướng ngại vật…" style="margin-top:10px">`,
              actions: [{ label: "Hủy", cls: "btn-ghost" }, { label: "Chốt", cls: "btn-primary", onClick: (btn, w) => {
                const ci = $(".pickc.on", w); if (!ci) { U.toast("Chọn thí sinh trả lời", "warn"); return false; }
                const i = +ci.dataset.c, ans = $("#oloAns", w).value;
                if (U.norm(ans.replace(/\s+/g, "")) === U.norm(kw.replace(/\s+/g, ""))) {
                  const bonus = early ? 60 : 30; C[i].score += bonus; C[i].correct++; paintBoard(stage, C); revealed = true; board();
                  U.Sound.win(); U.confetti(); GK.banner(stage, `🎉 ${esc(C[i].name)} đoán đúng “${esc(kw)}” +${bonus} điểm!`, 2600);
                  ctx.timers.after(2200, finish);
                } else { C[i].wrong++; U.Sound.wrong(); GK.banner(stage, `❌ ${esc(C[i].name)} đoán sai Chướng ngại vật!`, 1800); paintBoard(stage, C); }
                return true;
              } }] });
            setTimeout(() => $$(".pickc", document).forEach((b) => (b.onclick = () => $$(".pickc", document).forEach((x) => x.classList.toggle("on", x === b)))), 30);
          }
          board();
        });
      }
      async function roundAccel() {
        const vals = [10, 20, 30, 40];
        for (let k = 0; k < 4; k++) { if (over || skip) return; GK.banner(stage, `⚡ Câu ${k + 1} · ${vals[k]} điểm`, 1200); await U.sleep(900); if (over || skip) return; await ask(queue.next(), { value: vals[k], badge: "Tăng tốc · câu " + (k + 1) }); }
      }
      async function roundFinish() {
        const total = pickMode ? cfg.vedichQ * C.length : C.length;
        for (let t = 0; t < total; t++) {
          if (over || skip) return;
          const i = pickMode ? await pickTeam(`Về đích — chọn thí sinh (lượt ${t + 1}/${total})`) : t;
          if (over || skip || i == null) return;
          const loops = pickMode ? 1 : cfg.vedichQ;
          for (let k = 0; k < loops; k++) {
            if (over || skip) return;
            const choice = await new Promise((res) => {
              main.innerHTML = `<div class="ol-pick"><h2>🏁 ${esc(C[i].name)}${pickMode ? "" : ` — câu ${k + 1}/${cfg.vedichQ}`}</h2><p>Chọn giá trị câu hỏi:</p>
                <div class="olp-vals">${[10, 20, 30].map((v) => `<button data-v="${v}">${v}</button>`).join("")}</div>
                <label class="switch olp-star"><input type="checkbox" id="olStar"> ⭐ Ngôi sao hy vọng (đúng ×2, sai −giá trị)</label></div>`;
              curAbort = () => { curAbort = null; res(null); };
              $$(".olp-vals button", main).forEach((b) => (b.onclick = () => { curAbort = null; res({ v: +b.dataset.v, star: $("#olStar", main).checked }); }));
            });
            if (over || skip || !choice) return;
            const got = await ask(queue.next(), { who: i, value: choice.v, badge: `Về đích · ${C[i].name}${choice.star ? " · ⭐" : ""}` });
            // ask đã cộng value cho ai đúng; xử lý ngôi sao: nếu chọn sao mà thí sinh i KHÔNG đúng → trừ value
            if (choice.star) {
              if (got.includes(i)) { C[i].score += choice.v; } // tổng thành ×2 (đã +1 lần trong ask)
              else { C[i].score -= choice.v; }
              paintBoard(stage, C);
            }
          }
        }
      }

      const runners = { khoidong: roundWarm, vuotcnv: roundObstacle, tangtoc: roundAccel, vedich: roundFinish };
      $("[data-a=skip]", stage).onclick = () => {
        if (over) return; skip = true; U.toast("⏭ Bỏ qua vòng hiện tại…", "info");
        const f = curAbort; curAbort = null; if (f) f();
      };
      async function flow() {
        for (roundIdx = 0; roundIdx < ROUNDS.length; roundIdx++) {
          if (over) return; const r = ROUNDS[roundIdx]; setRoundTag(r); skip = false;
          await intro(r); if (over) return;
          await runners[r.key](); if (over) return;
        }
        finish();
      }
      function finish() {
        if (over) return; over = true;
        const order = C.map((_, i) => i).sort((a, b) => C[b].score - C[a].score);
        ctx.finish({ unit: "điểm", sub: "Nhà leo núi xuất sắc nhất!", ranking: order.map((i) => ({ name: C[i].name, color: C[i].color, score: C[i].score, correct: C[i].correct, wrong: C[i].wrong, figure: Art.pawn(C[i].color, i + 1) })) });
      }
      GK.countdown(stage, "Chào mừng đến Đường lên đỉnh Olympia!").then(() => { if (!over) flow(); });
      return { destroy() { over = true; }, stop() { over = true; } };
    },

    /* ==================== TRỰC TUYẾN (cả lớp thi 4 vòng trên điện thoại) ==================== */
    host(stage, ctx, players0) {
      const cfg = ctx.cfg, pin = ctx.room.pin, Q = ctx.roomQs, COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];
      const saIdx = Q.map((q, i) => (q.type === "SA" ? i : -1)).filter((i) => i >= 0);
      const kw = String(cfg.obstacle || "").trim();
      // Kế hoạch 4 vòng: danh sách chỉ số câu trong Q
      const plan = []; let cur = 0; const take = (n) => { const a = []; for (let k = 0; k < n && Q.length; k++) { a.push(cur % Q.length); cur++; } return a; };
      plan.push({ r: ROUNDS[0], qs: take(cfg.warmCount || 8), val: () => 10 });
      if (kw) plan.push({ r: ROUNDS[1], qs: (saIdx.length ? saIdx.slice(0, 4) : take(4)), val: () => 10, obstacle: kw });
      plan.push({ r: ROUNDS[2], qs: take(4), val: (k) => [10, 20, 30, 40][k] || 20 });
      plan.push({ r: ROUNDS[3], qs: take(cfg.vedichQ || 3), val: (k) => [20, 30, 40, 30, 20][k] || 20 });

      const hud = GK.hud(stage, ctx, { title: "Olympia · PIN " + pin, mid: `<span class="ol-round-tag"></span>`, right: `<span class="chip" style="background:#fde047;color:#7c2d12">👥 <b class="olpc">0</b></span>` });
      stage.insertAdjacentHTML("beforeend", `<div class="olympia online"><div class="ol-sky">${starfield(50)}</div><div class="ol-stage"><div class="ol-main lq-main" id="olMain"></div></div></div>`);
      const main = $("#olMain", stage);
      let players = {}; players0.forEach((p) => (players[p.pid] = p));
      let over = false, tick = null, offAns = null, answers = {}, prevRank = {}, pIdx = 0, qPos = 0, gi = -1;
      const offP = Room.watchPlayers(pin, (ps) => { players = ps || {}; $(".olpc", hud).textContent = Object.keys(players).length; const e = $(".lq-ans b", main); if (e) e.textContent = Object.keys(answers).length + "/" + online(); });
      const online = () => Object.values(players).filter((p) => p.online !== false).length;
      const ranked = () => Object.entries(players).map(([pid, p]) => Object.assign({ pid }, p)).sort((a, b) => (b.score || 0) - (a.score || 0));

      function roundIntro(seg) {
        $(".ol-round-tag", stage).innerHTML = `<b>${seg.r.icon} ${seg.r.name}</b>`;
        Room.setState(pin, { phase: "board", qi: gi });
        main.innerHTML = `<div class="ol-intro"><div class="oi-ic">${seg.r.icon}</div><h1>${seg.r.name}</h1><p>${seg.r.desc}</p>
          <button class="btn btn-xl btn-fun btn-3d" data-a="go">Bắt đầu ▸</button></div>`;
        U.Sound.go(); $("[data-a=go]", main).onclick = () => { qPos = 0; nextInSeg(); };
      }
      function nextInSeg() {
        const seg = plan[pIdx]; if (!seg) return podium();
        if (qPos >= seg.qs.length) {
          if (seg.obstacle) return revealObstacle(seg);
          pIdx++; return pIdx < plan.length ? roundIntro(plan[pIdx]) : podium();
        }
        showQuestion(seg, seg.qs[qPos], seg.val(qPos));
      }
      function showQuestion(seg, idx, value) {
        gi++; answers = {}; const it = Q[idx], dur = cfg.qtime, startAt = Room.now() + 2200;
        Room.setState(pin, { phase: "question", qi: idx, startAt, dur, roundName: seg.r.name, value });
        main.innerHTML = `<div class="lq-intro"><span class="lq-n">${seg.r.icon} ${esc(seg.r.name)}</span><div class="lq-type">${Quiz.TYPES[it.type]} · ${value} điểm</div><div class="lq-bar"><i></i></div></div>`;
        ctx.timers.after(2200, () => {
          if (over) return;
          let body = it.type === "MC" ? `<div class="lq-opts n${it.options.length}">${it.options.map((o, i) => `<div class="lq-opt" style="--oc:${COLORS[i % 4]};--i:${i}" data-k="${o.key}"><span class="lq-sh">${Quiz.SHAPES[i]}</span><span class="lq-tx">${Quiz.rich(o.text)}</span><span class="lq-cnt"></span></div>`).join("")}</div>`
            : it.type === "TF" ? `<div class="lq-tf">${it.options.map((o, i) => `<div class="lq-tfr" style="--i:${i}" data-i="${i}"><b>${o.key})</b><span>${Quiz.rich(o.text)}</span><em class="lq-tfa"></em></div>`).join("")}</div>`
              : `<div class="lq-sa">✍️ Nhập câu trả lời trên điện thoại<div class="lq-sa-ans"></div></div>`;
          main.innerHTML = `<div class="lq-q"><div class="lq-top">
            <div class="lq-timer"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="tr" cx="22" cy="22" r="19"/></svg><b>${dur}</b></div>
            <div class="lq-stem">${it.context ? `<div class="q-ctx">${Quiz.rich(it.context)}</div>` : ""}${Quiz.rich(it.stem)}</div>
            <div class="lq-ans"><b>0/${online()}</b><span>đã trả lời</span></div></div>${body}
            <div class="lq-act"><button class="btn btn-lg btn-white" data-a="skip">⏭ Xem đáp án</button></div></div>`;
          Quiz.typeset(main);
          const tr = $(".tr", main), tb = $(".lq-timer b", main);
          $("[data-a=skip]", main).onclick = () => reveal(it, idx);
          tick = ctx.timers.every(200, () => { const left = Math.max(0, dur - (Room.now() - startAt) / 1000); tb.textContent = Math.ceil(left); tr.style.strokeDashoffset = (1 - left / dur) * 119.4; if (left <= 0) reveal(it, idx); });
          offAns && offAns(); offAns = Room.watchAnswers(pin, idx, (a) => { answers = a || {}; const e = $(".lq-ans b", main); if (e) e.textContent = Object.keys(answers).length + "/" + online(); if (Object.keys(answers).length >= online() && online() > 0) ctx.timers.after(500, () => reveal(it, idx)); });
          U.Sound.go();
        });
      }
      let revealedIdx = -1;
      function reveal(it, idx) {
        if (revealedIdx === idx || over) return; revealedIdx = idx; tick && ctx.timers.stop(tick); offAns && offAns(); offAns = null;
        Room.setState(pin, { phase: "reveal", qi: idx }); U.Sound.coin();
        const lq = $(".lq-q", main), A = Object.values(answers); if (!lq) return; lq.classList.add("revealed");
        if (it.type === "MC") $$(".lq-opt", main).forEach((el) => { const n = A.filter((a) => a.given === el.dataset.k).length; el.classList.add(el.dataset.k === it.answer ? "right" : "wrong"); $(".lq-cnt", el).innerHTML = `${n}`; });
        else if (it.type === "TF") $$(".lq-tfr", main).forEach((el) => { const i = +el.dataset.i; el.classList.add("show"); $(".lq-tfa", el).innerHTML = `<span class="${it.answer[i] ? "t" : "f"}">${it.answer[i] ? "ĐÚNG" : "SAI"}</span>`; });
        else { const right = A.filter((a) => a.ok).length; $(".lq-sa-ans", main).innerHTML = `<div class="lq-sa-right">Đáp án: <b>${esc(String(it.answer).split("|")[0])}</b> · ${right}/${A.length} đúng</div>`; }
        $(".lq-act", main).innerHTML = `<button class="btn btn-xl btn-fun btn-3d" data-a="board">🏆 Bảng xếp hạng</button>`;
        $("[data-a=board]", main).onclick = board;
      }
      function board() {
        Room.setState(pin, { phase: "board", qi: gi });
        const R = ranked(), top = R.slice(0, 8);
        main.innerHTML = `<div class="lq-board"><h2>🏆 Bảng xếp hạng</h2><div class="lq-list">${top.map((p, i) => { const was = prevRank[p.pid], up = was != null && was > i; return `<div class="lq-row ${i < 3 ? "top" + (i + 1) : ""}" style="--i:${i}"><span class="lq-rk">${i + 1}</span><span class="lq-av">${p.avatar || "🙂"}</span><b>${esc(p.name)}</b>${(p.streak || 0) >= 2 ? `<span class="lq-streak">🔥${p.streak}</span>` : ""}${up ? `<span class="lq-up">▲</span>` : ""}<span class="lq-sc">${U.fmtNum(p.score || 0)}</span></div>`; }).join("")}</div>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="next">Tiếp theo ▸</button></div></div>`;
        R.forEach((p, i) => (prevRank[p.pid] = i));
        $("[data-a=next]", main).onclick = () => { qPos++; nextInSeg(); };
      }
      function revealObstacle(seg) {
        Room.setState(pin, { phase: "board", qi: gi });
        const cells = Array.from(seg.obstacle.toUpperCase().replace(/\s+/g, ""));
        main.innerHTML = `<div class="ol-obst"><h2>🧩 Chướng ngại vật</h2><div class="olo-key big">${cells.map(() => `<i>?</i>`).join("")}</div>
          <button class="btn btn-xl btn-fun btn-3d" data-a="reveal">Mở đáp án 🔑</button></div>`;
        $("[data-a=reveal]", main).onclick = () => {
          $$(".olo-key i", main).forEach((e, k) => ctx.timers.after(k * 180, () => { e.textContent = cells[k]; e.classList.add("on"); U.Sound.tick(); }));
          U.Sound.win(); U.confetti();
          $("[data-a=reveal]", main).outerHTML = `<button class="btn btn-xl btn-primary" data-a="next">Vòng tiếp theo ▸</button>`;
          $("[data-a=next]", main).onclick = () => { pIdx++; roundIntro(plan[pIdx]); };
        };
      }
      function podium() {
        if (over) return; over = true; offP(); offAns && offAns();
        Room.setState(pin, { phase: "podium" });
        const R = ranked();
        ctx.finish({ unit: "điểm", sub: `${R.length} thí sinh · 4 vòng thi`, ranking: R.map((p, i) => ({ pid: p.pid, name: p.name, avatar: p.avatar, color: ["#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ec4899"][i % 6], score: p.score || 0, correct: p.correct || 0, wrong: p.wrong || 0 })) });
      }
      GK.countdown(stage, "Đường lên đỉnh Olympia — Trực tuyến!").then(() => { if (!over) { pIdx = 0; roundIntro(plan[0]); } });
      return { destroy() { over = true; offP(); offAns && offAns(); }, stop() { over = true; offP(); } };
    }
  });
})();
