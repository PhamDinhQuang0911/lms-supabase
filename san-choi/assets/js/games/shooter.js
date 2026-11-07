/* =========================================================
   shooter.js — Bộ máy "bắn mục tiêu" dùng chung:
   🧟 Chặn Zombie   — zombie mang đáp án tiến về hàng rào
   🎈 Bắn bóng bay  — bóng bay mang đáp án bay lên trời
   Mỗi câu: nhiều mục tiêu, bắn đúng mục tiêu mang đáp án đúng
   trước khi nó chạm vạch nguy hiểm. Dùng MC & SA.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;

  const THEMES = [
    {
      id: "zombie", order: 110, name: "Chặn Zombie", icon: "🧟", colors: ["#22c55e", "#065f46"],
      tagline: "Bắn hạ zombie mang đáp án đúng trước khi chúng tràn xuống phá hàng rào tri thức!",
      scene: "grave", dir: "right", types: ["MC"], fig: (c) => Art.zombie(c), ar: 0.75,
      hitSfx: () => U.Sound.boom && U.Sound.boom(), escape: "Zombie đã tràn qua hàng rào!", unit: "điểm",
      howto: ["Câu hỏi và danh sách phương án <b>A·B·C·D</b> nằm bên trái; các zombie (chỉ mang chữ cái) lừ lừ bò từ trái sang phải về hàng rào.",
        "Bắn (bấm vào zombie, bấm phương án bên trái, hoặc gõ phím <b>A·B·C·D</b>) đúng zombie mang đáp án đúng.",
        "Bắn nhầm hoặc để zombie đúng chạm hàng rào → mất 1 mạng. Trả lời đúng liên tiếp được thưởng combo 🔥.",
        "Chỉ dùng câu <b>Trắc nghiệm</b>."]
    },
    {
      id: "bong-bay", order: 120, name: "Bắn bóng bay", icon: "🎈", colors: ["#f43f5e", "#38bdf8"],
      tagline: "Những quả bóng mang đáp án bay vút lên trời — nhanh tay bắn trúng đáp án đúng!",
      scene: "sky", dir: "up", types: ["MC", "SA"], fig: (c, label) => Art.balloon(c, label), ar: 0.66,
      hitSfx: () => U.Sound.pop(), escape: "Bóng đã bay mất!", unit: "điểm",
      howto: ["Câu hỏi và danh sách phương án <b>A·B·C·D</b> nằm bên trái; các quả bóng (mang chữ cái) bay dần lên trời bên phải.",
        "Bắn (bấm vào bóng, bấm phương án bên trái, hoặc gõ phím <b>A·B·C·D</b>) đúng quả bóng mang đáp án đúng trước khi nó bay mất.",
        "Bắn nhầm hoặc để bóng đúng bay mất → mất 1 mạng. Đúng liên tiếp được combo 🔥."]
    }
  ];
  const LET = ["A", "B", "C", "D", "E", "F"];
  const COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#22c55e", "#a855f7", "#ec4899"];

  const fmtNum = (v) => (Math.round(v * 100) / 100).toString().replace(".", ",");
  function buildTargets(item, saPool) {
    if (item.type === "MC") {
      const opts = item.options.map((o) => ({ text: o.text, correct: o.key === item.answer, rich: true }));
      return U.shuffle(opts);
    }
    // SA: đáp án đúng + 3 mồi nhử
    const ans = String(item.answer).split(/\s*[|;]\s*/)[0].trim();
    const num = parseFloat(ans.replace(",", "."));
    const list = [ans]; const seen = new Set([U.norm(ans)]);
    if (!isNaN(num) && /^[-+]?[\d.,/]+$/.test(ans)) {
      let tries = 0;
      while (list.length < 4 && tries++ < 60) {
        const d = (Math.floor(Math.random() * 9) - 4) || (Math.random() < .5 ? 2 : -2);
        const v = Math.round((num + d) * 100) / 100; const t = fmtNum(v);
        if (!seen.has(U.norm(t))) { seen.add(U.norm(t)); list.push(t); }
      }
    } else {
      U.shuffle(saPool).forEach((w) => { if (list.length < 4 && !seen.has(U.norm(w))) { seen.add(U.norm(w)); list.push(w); } });
    }
    let k = 1; while (list.length < 4) { const t = isNaN(num) ? ans + " " + k : fmtNum(num + k * 3); if (!seen.has(U.norm(t))) { seen.add(U.norm(t)); list.push(t); } k++; }
    return U.shuffle(list.map((t, i) => ({ text: t, correct: i === 0 })));   // list[0] là đáp án đúng
  }

  function makeGame(th) {
    return {
      id: th.id, order: th.order, name: th.name, icon: th.icon, colors: th.colors, tagline: th.tagline,
      tags: ["Cả lớp", "Phản xạ nhanh"], modes: ["local"], types: th.types, minQ: 5, howto: th.howto,
      figure: (c) => th.fig(c),
      fields: [
        { key: "player", type: "text", label: "Tên lớp / người chơi", def: "Cả lớp", placeholder: "VD: Lớp 6A" },
        { key: "lives", type: "range", label: "Số mạng", min: 1, max: 9, def: 5, unit: " ❤️" },
        { key: "speed", type: "seg", label: "Tốc độ", options: [["easy", "🐢 Dễ"], ["normal", "🏃 Vừa"], ["hard", "⚡ Khó"]], def: "normal" },
        { key: "count", type: "range", label: "Số câu (0 = chơi tới khi hết mạng)", min: 0, max: 50, def: 0, unit: " câu" }
      ],

      play(stage, ctx) {
        const cfg = ctx.cfg, name = (cfg.player || "Cả lớp").trim() || "Cả lớp";
        const saPool = ctx.items.filter((i) => i.type === "SA").map((i) => String(i.answer).split(/\s*[|;]\s*/)[0].trim());
        const queue = Quiz.queue(ctx.items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA });
        const crossDur = { easy: 10, normal: 7, hard: 4.8 }[cfg.speed] || 7;
        GK.hud(stage, ctx, { mid: `<span class="sh-stat"></span>` });
        stage.insertAdjacentHTML("beforeend", `<div class="shoot shoot2 sc-${th.scene} sh-${th.dir}">
          <div class="sh-side">
            <div class="sh-top"><div class="sh-lives"></div><div class="sh-combo"></div><div class="sh-score">0</div></div>
            <div class="sh-qbar"><span class="sh-qn"></span><div class="sh-q"></div></div>
            <div class="sh-opts"></div>
            <div class="sh-hint"><small>Bấm vào phương án, bắn mục tiêu, hoặc gõ phím <b>A·B·C·D</b></small></div>
          </div>
          <div class="sh-field"><div class="sh-danger"></div><div class="sh-targets"></div><div class="sh-ground"></div></div>
        </div>`);
        const shoot = $(".shoot", stage), field = $(".sh-targets", shoot);
        const G = { score: 0, lives: cfg.lives, combo: 0, best: 0, correct: 0, wrong: 0, n: 0, over: false, busy: false, raf: 0, targets: [], waveStart: 0 };

        function drawHud() {
          $(".sh-lives", shoot).innerHTML = Array.from({ length: Math.max(cfg.lives, G.lives) }, (_, i) => `<span class="${i < G.lives ? "on" : "off"}">❤️</span>`).join("");
          $(".sh-score", shoot).textContent = U.fmtNum(G.score);
          $(".sh-combo", shoot).innerHTML = G.combo >= 2 ? `🔥 Combo ×${G.combo}` : "";
          $(".sh-stat", $(".hud", stage)).innerHTML = `🎯 ${name}${cfg.count ? ` · Câu ${Math.min(G.n, cfg.count)}/${cfg.count}` : ""}`;
        }
        function spawnWave() {
          if (G.over) return;
          if (cfg.count && G.n >= cfg.count) return end();
          G.n++; G.busy = false;
          const item = queue.next();
          const targets = buildTargets(item, saPool).slice(0, item.type === "MC" ? item.options.length : 4);
          $(".sh-qn", shoot).textContent = "Câu " + G.n;
          $(".sh-q", shoot).innerHTML = Quiz.rich(item.stem); Quiz.typeset($(".sh-q", shoot));
          const nT = targets.length;
          // danh sách phương án bên cạnh câu hỏi (A·B·C·D + nội dung đầy đủ, cuộn nếu dài)
          $(".sh-opts", shoot).innerHTML = targets.map((t, i) => `<button class="sh-opt" data-i="${i}" style="--col:${COLORS[i % COLORS.length]}"><b>${LET[i]}</b><span>${t.rich ? Quiz.rich(t.text) : esc(t.text)}</span></button>`).join("");
          Quiz.typeset($(".sh-opts", shoot));
          // mục tiêu trên sân chỉ mang CHỮ CÁI cho gọn
          field.innerHTML = targets.map((t, i) => {
            const col = COLORS[i % COLORS.length];
            const figHtml = th.fig(col, LET[i]);
            const badge = th.scene === "grave" ? `<div class="sh-let" style="--col:${col}">${LET[i]}</div>` : "";
            return `<button class="sh-t" data-i="${i}" data-correct="${t.correct ? 1 : 0}" style="--lane:${i};--n:${nT};--col:${col};--p:0" aria-label="Phương án ${LET[i]}">
              ${badge}<div class="sh-fig">${figHtml}</div>
              <div class="sh-burst"></div></button>`;
          }).join("");
          G.targets = targets.map((t, i) => ({ t, el: $(`.sh-t[data-i="${i}"]`, field), p: 0, v: (0.85 + Math.random() * 0.3) / crossDur, dead: false }));
          G.targets.forEach((o) => (o.el.onclick = () => hit(o)));
          $$(".sh-opt", shoot).forEach((el) => (el.onclick = () => { const o = G.targets[+el.dataset.i]; if (o) hit(o); }));
          G.item = item; G.waveStart = performance.now();
          drawHud();
        }
        function draw() { G.targets.forEach((o) => { if (!o.dead) o.el.style.setProperty("--p", o.p.toFixed(4)); }); }
        function loop(now) {
          if (G.over) return;
          const dt = Math.min(0.05, (now - (G._last || now)) / 1000); G._last = now;
          if (!G.busy) {
            let escaped = false;
            G.targets.forEach((o) => { if (o.dead) return; o.p += o.v * dt * (0.8 + Math.random() * 0.4); if (o.p >= 1) { o.p = 1; if (o.t.correct) escaped = true; } });
            draw();
            if (escaped) fail("escape");   // KHÔNG return — vòng lặp phải tiếp tục để sóng sau còn chuyển động
          }
          if (!G.over) G.raf = requestAnimationFrame(loop);
        }
        const optEl = (o) => $(`.sh-opt[data-i="${G.targets.indexOf(o)}"]`, shoot);
        function hit(o) {
          if (G.busy || o.dead || G.over) return;
          const oe = optEl(o);
          if (o.t.correct) {
            G.busy = true; o.el.classList.add("hit", "good"); if (oe) oe.classList.add("good"); th.hitSfx(); U.Sound.correct();
            const speed = Math.max(0, 1 - (performance.now() - G.waveStart) / (crossDur * 1000));
            G.combo++; G.best = Math.max(G.best, G.combo); G.correct++;
            const pts = 100 + Math.round(speed * 120) + (G.combo >= 2 ? (G.combo - 1) * 25 : 0);
            G.score += pts;
            GK.floatText(o.el, "+" + pts, "#fde047");
            G.targets.forEach((x) => { if (x !== o && !x.dead) { x.dead = true; x.el.classList.add("dim"); } });
            drawHud();
            ctx.timers.after(900, spawnWave);
          } else {
            o.dead = true; o.el.classList.add("hit", "bad"); if (oe) oe.classList.add("bad"); U.Sound.wrong();
            G.combo = 0; loseLife();
            if (!G.over && G.targets.every((x) => x.dead || !x.t.correct)) { /* vẫn còn đáp án đúng */ }
            drawHud();
            if (G.targets.filter((x) => !x.dead).length === 0) ctx.timers.after(700, spawnWave);
          }
        }
        function fail(kind) {
          if (G.busy || G.over) return; G.busy = true; G.combo = 0;
          const right = G.targets.find((x) => x.t.correct);
          if (right) { right.el.classList.add("reveal"); const re = optEl(right); if (re) re.classList.add("good"); }
          GK.banner(stage, `❌ ${kind === "escape" ? th.escape : "Chưa đúng!"} Đáp án: <b>${Quiz.rich(Quiz.answerText(G.item))}</b>`, 1800);
          loseLife();
          if (!G.over) ctx.timers.after(1600, spawnWave);
        }
        function loseLife() { G.wrong++; G.lives--; shoot.classList.remove("shake"); void shoot.offsetWidth; shoot.classList.add("shake"); drawHud(); if (G.lives <= 0) ctx.timers.after(500, end); }
        function end() {
          if (G.over) return; G.over = true; cancelAnimationFrame(G.raf);
          ctx.finish({ unit: th.unit, noTie: true, sub: `Trả lời đúng ${G.correct} câu · combo cao nhất ×${G.best}`,
            ranking: [{ name, color: th.colors[0], score: G.score, correct: G.correct, wrong: G.wrong, figure: th.fig(th.colors[0]) }] });
        }
        // Bàn phím A-F / 1-6
        const onKey = (e) => {
          if (G.over || G.busy) return; const k = e.key.toUpperCase();
          let idx = LET.indexOf(k); if (idx < 0) idx = "123456".indexOf(k);
          if (idx >= 0 && G.targets[idx] && !G.targets[idx].dead) hit(G.targets[idx]);
        };
        document.addEventListener("keydown", onKey);

        GK.countdown(stage, th.icon + " Sẵn sàng bảo vệ tri thức!").then(() => { if (G.over) return; G._last = performance.now(); G.raf = requestAnimationFrame(loop); spawnWave(); });
        return { destroy() { G.over = true; cancelAnimationFrame(G.raf); document.removeEventListener("keydown", onKey); }, stop() { G.over = true; cancelAnimationFrame(G.raf); } };
      }
    };
  }
  // thêm hiệu ứng nổ cho zombie
  U.Sound.boom = U.Sound.boom || function () { if (this.muted) return; this.wrong(); };
  THEMES.forEach((th) => Games.register(makeGame(th)));
})();
