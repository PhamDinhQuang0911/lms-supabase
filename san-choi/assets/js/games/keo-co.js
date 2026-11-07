/* =========================================================
   keo-co.js — KÉO CO TRI THỨC (2 đội)
   ========================================================= */
(function () {
  const { $, $$, esc } = U;
  const GK = GameKit;

  function sceneHTML(names, colors, kids) {
    const side = (t) => Array.from({ length: kids }, (_, k) => `<div class="tk" style="--k:${k}">${Art.tugKid(colors[t], k + t * 3)}</div>`).join("");
    return `<div class="tug">
      <div class="tug-scene">
        <div class="tg-sky"></div>
        <svg class="tg-bg" viewBox="0 0 800 300" preserveAspectRatio="none"><path d="M0 170 Q120 130 260 160 T540 150 T800 158 V300 H0Z" fill="#8ee59b"/><path d="M0 205 Q200 185 400 200 T800 196 V300 H0Z" fill="#4fcf72"/></svg>
        <div class="tg-cloud c1">${'<svg viewBox="0 0 64 34">' + Art.cloud(0, 0, 1) + "</svg>"}</div><div class="tg-cloud c2">${'<svg viewBox="0 0 64 34">' + Art.cloud(0, 0, 1) + "</svg>"}</div>
        <div class="tg-mark m0"><span>🏁</span></div><div class="tg-mark m1"><span>🏁</span></div><div class="tg-center"></div>
        <div class="tg-score"><div class="ts" style="--tc:${colors[0]}"><b class="ts0">0</b><span>${esc(names[0])}</span></div><div class="ts-vs">VS</div><div class="ts" style="--tc:${colors[1]}"><b class="ts1">0</b><span>${esc(names[1])}</span></div></div>
        <div class="tg-rope-grp">
          <div class="tg-rope"></div><div class="tg-flag">🚩</div>
          <div class="tg-team t0">${side(0)}</div>
          <div class="tg-team t1">${side(1)}</div>
        </div>
        <div class="tg-meter"><i style="background:${colors[0]}"></i><i style="background:${colors[1]}"></i><b class="tg-needle"></b></div>
      </div>
    </div>`;
  }

  Games.register({
    id: "keo-co", order: 10, name: "Kéo co tri thức", icon: "🪢", colors: ["#6c4cf5", "#38bdf8"],
    tagline: "Hai đội so tài — mỗi câu đúng là một cú kéo dây về phía mình!",
    tags: ["2 đội", "Trực tuyến"], modes: ["local", "online"], onlineKind: "tug", minQ: 8,
    figure: (c, i) => Art.tugKid(c, i),
    howto: [
      "Hai đội trả lời <b>song song</b> trên hai nửa màn hình.",
      "Đúng → kéo dây về phía đội mình. Sai → đóng băng vài giây.",
      "Kéo lá cờ vượt <b>vạch thắng</b> trước là chiến thắng tuyệt đối.",
      "Hết giờ: đội đang kéo được nhiều hơn sẽ thắng."
    ],
    fields: [
      { key: "teams", type: "teams", min: 2, max: 2, def: 2, label: "Hai đội thi đấu" },
      { key: "gap", type: "range", label: "Chênh lệch để thắng tuyệt đối", min: 2, max: 15, def: 5, unit: " câu" },
      { key: "time", type: "range", label: "Thời gian thi đấu", min: 1, max: 15, def: 3, unit: " phút" },
      { key: "freeze", type: "range", label: "Đóng băng khi sai", min: 0, max: 10, def: 3, unit: " giây" },
      { key: "keypad", type: "toggle", label: "Bàn phím số ảo cho câu trả lời ngắn", def: true, modes: ["local"] }
    ],
    roomSettings: (cfg) => ({ goal: 9999, freeze: cfg.freeze, explain: cfg.explain, time: cfg.time, teams: [U.TEAM_NAMES[0], U.TEAM_NAMES[1]] }),

    play(stage, ctx) {
      const cfg = ctx.cfg, T = ctx.teams.slice(0, 2);
      const hud = GK.hud(stage, ctx, { mid: `<span class="hud-clock"></span>` });
      const wide = matchMedia("(min-width: 1001px)").matches;
      stage.insertAdjacentHTML("beforeend", sceneHTML(T.map((t) => t.name), T.map((t) => t.color), wide ? 2 : 3));
      const tug = $(".tug", stage); tug.classList.add("duo");   // câu hỏi hai bên, sân kéo co ở giữa
      tug.insertAdjacentHTML("beforeend", `<div class="race-panels"></div>`);
      const pts = [0, 0], cor = [0, 0], wr = [0, 0];
      let over = false, clock;
      const draw = (team) => {
        const diff = pts[0] - pts[1], k = Math.max(-1, Math.min(1, diff / cfg.gap));
        tug.style.setProperty("--k", k.toFixed(3));
        $(".ts0", tug).textContent = Math.round(pts[0] * 10) / 10; $(".ts1", tug).textContent = Math.round(pts[1] * 10) / 10;
        if (team != null) { const tm = $(".tg-team.t" + team, tug); tm.classList.remove("pull"); void tm.offsetWidth; tm.classList.add("pull"); }
      };
      const panels = GK.panels($(".race-panels", tug), T, ctx, {
        freeze: cfg.freeze, keypad: cfg.keypad,
        onResult(i, res) {
          if (over) return;
          res.ok ? cor[i]++ : wr[i]++;
          if (res.points > 0) { pts[i] += res.points; draw(i); U.Sound.whoosh(); }
          panels.score(i, Math.round(pts[i] * 10) / 10);
          if (Math.abs(pts[0] - pts[1]) >= cfg.gap) ctx.timers.after(700, () => end(pts[0] > pts[1] ? 0 : 1));
        }
      });
      function end(w) {
        if (over) return; over = true; panels.stop(); clock && clock.stop();
        if (w == null) w = pts[0] === pts[1] ? -1 : pts[0] > pts[1] ? 0 : 1;
        tug.classList.add("done");
        const order = w === 1 ? [1, 0] : [0, 1];
        ctx.finish({ unit: "điểm", sub: w === -1 ? "Hai đội ngang tài ngang sức!" : Math.abs(pts[0] - pts[1]) >= cfg.gap ? "Kéo cờ qua vạch thắng tuyệt đối!" : "Thắng khi hết giờ thi đấu",
          ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: Math.round(pts[i] * 10) / 10, correct: cor[i], wrong: wr[i], figure: Art.tugKid(T[i].color, i) })) });
      }
      draw();
      (async () => {
        await GK.countdown(stage, `${esc(T[0].name)} ⚔️ ${esc(T[1].name)}`);
        if (ctx._finished) return;
        clock = GK.clock(ctx, $(".hud-clock", hud), cfg.time * 60, () => end());
        panels.start();
      })();
      return { destroy() { over = true; panels.destroy(); }, stop() { over = true; panels.stop(); } };
    },

    host(stage, ctx, players0) {
      const cfg = ctx.cfg, pin = ctx.room.pin, names = [U.TEAM_NAMES[0], U.TEAM_NAMES[1]], colors = [U.TEAM_COLORS[0], U.TEAM_COLORS[1]];
      const hud = GK.hud(stage, ctx, { title: "Kéo co · PIN " + pin, mid: `<span class="hud-clock"></span>`, right: `<button class="btn btn-sm btn-fun" data-a="end">🏁 Kết thúc</button>` });
      stage.insertAdjacentHTML("beforeend", sceneHTML(names, colors, 4));
      const tug = $(".tug", stage); tug.classList.add("online");
      tug.insertAdjacentHTML("beforeend", `<div class="tug-roster"><div class="tr t0" style="--tc:${colors[0]}"></div><div class="tr t1" style="--tc:${colors[1]}"></div></div>`);
      let players = {}; players0.forEach((p) => (players[p.pid] = p));
      let over = false, clock, lastTot = [0, 0], P = [0, 0];
      function calc() {
        const tot = [0, 0], n = [0, 0], cor = [0, 0], wr = [0, 0];
        Object.values(players).forEach((p) => { const t = p.team || 0; tot[t] += p.progress || 0; n[t]++; cor[t] += p.correct || 0; wr[t] += p.wrong || 0; });
        const maxN = Math.max(1, n[0], n[1]);
        P = [0, 1].map((t) => (n[t] ? (tot[t] * maxN) / n[t] : 0));
        const gap = cfg.gap * Math.max(1, Math.ceil(maxN / 2));
        return { tot, n, cor, wr, gap };
      }
      function update() {
        const c = calc();
        const k = Math.max(-1, Math.min(1, (P[0] - P[1]) / c.gap));
        tug.style.setProperty("--k", k.toFixed(3));
        $(".ts0", tug).textContent = Math.round(P[0] * 10) / 10; $(".ts1", tug).textContent = Math.round(P[1] * 10) / 10;
        [0, 1].forEach((t) => { if (c.tot[t] > lastTot[t]) { const tm = $(".tg-team.t" + t, tug); tm.classList.remove("pull"); void tm.offsetWidth; tm.classList.add("pull"); U.Sound.whoosh(); } });
        lastTot = c.tot;
        [0, 1].forEach((t) => {
          const list = Object.values(players).filter((p) => (p.team || 0) === t).sort((a, b) => (b.progress || 0) - (a.progress || 0));
          $(".tr.t" + t, tug).innerHTML = `<b>${names[t]} · ${list.length}</b>` + list.map((p) => `<span class="${p.online === false ? "off" : ""}">${p.avatar || ""} ${esc(p.name)} <i>${Math.round((p.progress || 0) * 10) / 10}</i></span>`).join("");
        });
        if (!over && Math.abs(P[0] - P[1]) >= c.gap) ctx.timers.after(600, () => end(P[0] > P[1] ? 0 : 1));
      }
      const off = Room.watchPlayers(pin, (ps) => { if (over) return; players = ps || {}; update(); });
      function end(w) {
        if (over) return; over = true; off(); clock && clock.stop();
        const c = calc();
        if (w == null) w = P[0] === P[1] ? -1 : P[0] > P[1] ? 0 : 1;
        const order = w === 1 ? [1, 0] : [0, 1];
        const R = order.map((t) => ({ name: names[t], color: colors[t], score: Math.round(P[t] * 10) / 10, correct: c.cor[t], wrong: c.wr[t], figure: Art.tugKid(colors[t], t) }));
        ctx.finish({ unit: "điểm", sub: "Thành viên: " + order.map((t) => `${names[t]} ${c.n[t]} bạn`).join(" · "), ranking: R });
      }
      $("[data-a=end]", hud).onclick = async () => { if (await U.confirm("Kết thúc trận kéo co?", { ok: "Kết thúc" })) end(); };
      update();
      Room.setState(pin, { phase: "race", startAt: Room.now() + 3600 });
      GK.countdown(stage, "Học sinh trả lời trên điện thoại để kéo dây!").then(() => { if (!over) clock = GK.clock(ctx, $(".hud-clock", hud), cfg.time * 60, () => end()); });
      return { destroy() { over = true; off(); }, stop() { over = true; off(); } };
    }
  });
})();
