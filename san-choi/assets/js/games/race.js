/* =========================================================
   race.js — Bộ máy "đua" dùng chung cho 4 game:
   Đua xe · Đua vịt · Đua thuyền rồng · Nhảy bao bố
   Một màn hình: 2–6 đội trả lời song song, đúng thì tiến.
   Trực tuyến : mỗi học sinh là một tay đua trên điện thoại.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;

  const THEMES = [
    { id: "dua-xe", order: 20, name: "Đua xe tốc độ", icon: "🏎️", colors: ["#ff6b6b", "#ff9f43"], cls: "car", ar: 2.1, fig: (c, i) => Art.car(c, i + 1),
      tagline: "Trả lời đúng để nhấn ga — về đích trước là vô địch!", sfx: () => U.Sound.vroom(), word: "tăng tốc" },
    { id: "dua-vit", order: 30, name: "Đua vịt sông xanh", icon: "🦆", colors: ["#38bdf8", "#22c55e"], cls: "duck", ar: 1.3, fig: (c) => Art.duck(c),
      tagline: "Những chú vịt mũ màu bơi về đích nhờ câu trả lời của bạn!", sfx: () => U.Sound.quack(), word: "bơi nhanh" },
    { id: "dua-thuyen", order: 40, name: "Đua thuyền rồng", icon: "🐉", colors: ["#06b6d4", "#f59e0b"], cls: "boat", ar: 2.4, fig: (c) => Art.boat(c),
      tagline: "Trống giục vang trời — cả đội cùng chèo thuyền rồng về đích!", sfx: () => U.Sound.drum(), word: "chèo mạnh" },
    { id: "nhay-bao", order: 50, name: "Nhảy bao bố", icon: "🛍️", colors: ["#84cc16", "#f59e0b"], cls: "sack", ar: 0.77, fig: (c, i) => Art.sacker(c, i),
      tagline: "Trò chơi dân gian vui nhộn — mỗi câu đúng là một cú bật nhảy!", sfx: () => U.Sound.jump(), word: "bật nhảy" }
  ];

  const SCENE_TOP = {
    car: () => `<svg viewBox="0 0 800 100" ><defs><linearGradient id="rsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb26b"/><stop offset="1" stop-color="#ffd8a8"/></linearGradient></defs>
      <rect width="800" height="100" fill="url(#rsk)"/><circle cx="640" cy="44" r="26" fill="#fff3b0"/>
      <g fill="#7c3aed" opacity=".35">${Array.from({ length: 22 }, (_, i) => `<rect x="${i * 38}" y="${40 + ((i * 37) % 40)}" width="30" height="${60 - ((i * 37) % 40)}"/>`).join("")}</g>
      <g fill="#4c1d95" opacity=".55">${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 52 + 10}" y="${58 + ((i * 23) % 30)}" width="40" height="${42 - ((i * 23) % 30)}"/>`).join("")}</g>
      <rect y="92" width="800" height="8" fill="#ffd166"/></svg>`,
    duck: () => `<svg viewBox="0 0 800 100" ><rect width="800" height="100" fill="#bde9ff"/>
      ${Art.cloud(40, 10, 0.8)}${Art.cloud(330, 4, 1)}${Art.cloud(620, 14, 0.7)}
      <path d="M0 70 Q100 50 200 68 T400 64 T600 70 T800 70 V100 H0Z" fill="#7fd36b"/>${Art.tree(90, 66, 1)}${Art.tree(470, 62, 1.2, "#22a34a")}${Art.tree(720, 66, 0.9)}
      <path d="M0 88 Q200 80 400 88 T800 88 V100 H0Z" fill="#5cb85c"/></svg>`,
    boat: () => `<svg viewBox="0 0 800 100" ><defs><linearGradient id="rbs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd8a8"/><stop offset="1" stop-color="#ffeedd"/></linearGradient></defs>
      <rect width="800" height="100" fill="url(#rbs)"/><circle cx="160" cy="58" r="30" fill="#ff8a4c"/>
      <path d="M0 80 L80 40 L140 66 L220 30 L310 70 L400 36 L480 64 L560 26 L650 68 L730 50 L800 80 V100 H0Z" fill="#0f766e" opacity=".55"/>
      <path d="M0 90 L120 62 L210 84 L330 56 L440 86 L560 60 L690 88 L800 90 V100 H0Z" fill="#115e59" opacity=".7"/>
      ${Array.from({ length: 14 }, (_, i) => `<g transform="translate(${30 + i * 58} 86)"><path d="M0 0 v-22" stroke="#7a4a1e" stroke-width="2"/><path d="M0 -22 l16 5 l-16 5z" fill="${U.TEAM_COLORS[i % U.TEAM_COLORS.length]}"/></g>`).join("")}</svg>`,
    sack: () => `<svg viewBox="0 0 800 100" ><rect width="800" height="100" fill="#cdf3ff"/>${Art.cloud(80, 8, 0.8)}${Art.cloud(520, 4, 1)}
      <path d="M0 18 ${Array.from({ length: 21 }, (_, i) => `Q${i * 40 + 20} 34 ${i * 40 + 40} 18`).join(" ")}" stroke="#7a4a1e" stroke-width="2" fill="none"/>
      ${Array.from({ length: 20 }, (_, i) => `<path d="M${i * 40 + 8} 22 l12 18 l12 -18z" fill="${U.TEAM_COLORS[i % U.TEAM_COLORS.length]}" transform="translate(0 ${i % 2 ? 3 : 0})"/>`).join("")}
      <g>${Array.from({ length: 26 }, (_, i) => `<g transform="translate(${15 + i * 31} ${74 + (i % 3) * 3})"><circle r="9" fill="${Art.SKIN[i % 6]}"/><path d="M-9 -2 q9 -12 18 0z" fill="${Art.HAIR[i % 6]}"/><rect x="-11" y="8" width="22" height="20" rx="8" fill="${U.TEAM_COLORS[(i * 5) % 6]}"/></g>`).join("")}</g>
      <rect y="92" width="800" height="8" fill="#16a34a"/></svg>`
  };

  function sceneHTML(th, lanes) {
    return `<div class="race rc-${th.cls}">
      <div class="race-scene">
        <div class="rs-top"><div class="rs-strip">${Array(8).fill(SCENE_TOP[th.cls]()).join("")}</div></div>
        <div class="rs-lanes" style="--n:${lanes.length}">
          ${lanes.map((l, i) => `<div class="lane" data-i="${i}" style="--tc:${l.color};--p:0;--i:${i}">
            <div class="lane-tag"><span class="lt-ava">${l.avatar || ""}</span><b>${esc(l.name)}</b><span class="lt-v">0</span></div>
            <div class="racer" style="--ar:${th.ar}"><div class="racer-in">${l.figure}</div><div class="fx"></div></div>
          </div>`).join("")}
          <div class="finish-line"></div><div class="start-line"></div>
        </div>
      </div>
    </div>`;
  }
  function setLane(lane, p, label) {
    lane.style.setProperty("--p", Math.max(0, Math.min(1, p)).toFixed(4));
    if (label != null) $(".lt-v", lane).textContent = label;
  }
  function pulse(lane, cls, ms) { lane.classList.remove(cls); void lane.offsetWidth; lane.classList.add(cls); setTimeout(() => lane.classList.remove(cls), ms || 900); }
  const fmt1 = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");

  function makeGame(th) {
    return {
      id: th.id, order: th.order, name: th.name, icon: th.icon, colors: th.colors, tagline: th.tagline,
      tags: ["2–8 đội", "Trực tuyến"], modes: ["local", "online"], onlineKind: "race", minQ: 8,
      figure: th.fig,
      howto: [
        `Mỗi đội có một bảng câu hỏi riêng, trả lời <b>song song</b>.`,
        `Đúng → ${th.word} 1 bước. Câu Đúng/Sai đúng một phần tiến một phần.`,
        `Sai → bị <b>đóng băng</b> vài giây và xem đáp án đúng.`,
        `Về đích trước, hoặc đi xa nhất khi hết giờ là thắng!`
      ],
      fields: [
        { key: "teams", type: "teams", min: 2, max: 8, def: 3 },
        { key: "goal", type: "range", label: "Quãng đường (số câu đúng để về đích)", min: 3, max: 30, def: 8, unit: " câu" },
        { key: "time", type: "range", label: "Thời gian tối đa", min: 1, max: 20, def: 5, unit: " phút" },
        { key: "freeze", type: "range", label: "Đóng băng khi sai", min: 0, max: 10, def: 3, unit: " giây" },
        { key: "endMode", type: "seg", label: "Kết thúc khi", options: [["first", "🥇 Có người về đích"], ["all", "🏁 Tất cả về đích"]], def: "first" },
        { key: "keypad", type: "toggle", label: "Bàn phím số ảo cho câu trả lời ngắn (bảng tương tác)", def: true, modes: ["local"] }
      ],
      roomSettings: (cfg) => ({ goal: cfg.goal, freeze: cfg.freeze, explain: cfg.explain, time: cfg.time }),

      /* ---------- Một màn hình ---------- */
      play(stage, ctx) {
        const cfg = ctx.cfg, T = ctx.teams, goal = cfg.goal;
        const hud = GK.hud(stage, ctx, { mid: `<span class="hud-clock"></span>` });
        stage.insertAdjacentHTML("beforeend", sceneHTML(th, T.map((t, i) => ({ name: t.name, color: t.color, figure: th.fig(t.color, i) }))));
        const race = $(".race", stage);
        race.classList.toggle("duo", T.length === 2);   // 2 đội: câu hỏi hai bên, đường đua ở giữa
        race.insertAdjacentHTML("beforeend", `<div class="race-panels"></div>`);
        const lanes = $$(".lane", race);
        const st = T.map(() => ({ p: 0, correct: 0, wrong: 0, done: false }));
        const finished = [];
        let over = false, clock;
        lanes.forEach((l) => setLane(l, 0, "0/" + goal));
        const panels = GK.panels($(".race-panels", race), T, ctx, {
          freeze: cfg.freeze, keypad: cfg.keypad,
          onResult(i, res) {
            if (over || st[i].done) return;
            const s = st[i];
            if (res.ok) s.correct++; else s.wrong++;
            if (res.points > 0) {
              s.p = Math.min(goal, s.p + res.points);
              setLane(lanes[i], s.p / goal, fmt1(s.p) + "/" + goal);
              pulse(lanes[i], "boost", 1000); th.sfx();
              GK.floatText($(".racer", lanes[i]), res.ok ? "+1" : "+" + fmt1(res.points), "#fff");
            }
            if (!res.ok) { pulse(lanes[i], "stun", (cfg.freeze || 1) * 1000); }
            panels.score(i, fmt1(s.p));
            if (s.p >= goal && !s.done) {
              s.done = true; finished.push(i); lanes[i].classList.add("won"); panels.el(i).classList.add("tp-done");
              GK.banner(stage, `🏁 <b style="color:${T[i].color}">${esc(T[i].name)}</b> về đích hạng ${finished.length}!`, 1800);
              U.Sound.win();
              if (cfg.endMode !== "all" || finished.length === T.length) ctx.timers.after(1500, end);
            }
          }
        });
        function end() {
          if (over) return; over = true; panels.stop(); clock && clock.stop(); race.classList.remove("running");
          const order = T.map((t, i) => i).sort((a, b) => {
            const fa = finished.indexOf(a), fb = finished.indexOf(b);
            if (fa >= 0 || fb >= 0) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
            return st[b].p - st[a].p || st[b].correct - st[a].correct;
          });
          ctx.finish({ unit: "bước", sub: `Quãng đường ${goal} câu đúng`, ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: Math.round(st[i].p * 10) / 10, correct: st[i].correct, wrong: st[i].wrong, figure: th.fig(T[i].color, i) })) });
        }
        (async () => {
          await GK.countdown(stage, `${T.length} đội · về đích sau ${goal} câu đúng`);
          if (ctx._finished) return;
          race.classList.add("running");
          clock = GK.clock(ctx, $(".hud-clock", hud), cfg.time * 60, end);
          panels.start();
        })();
        return { destroy() { over = true; panels.destroy(); }, stop() { over = true; panels.stop(); } };
      },

      /* ---------- Trực tuyến (máy chiếu của giáo viên) ---------- */
      host(stage, ctx, players0) {
        const cfg = ctx.cfg, goal = cfg.goal, pin = ctx.room.pin;
        const hud = GK.hud(stage, ctx, { title: th.name + " · PIN " + pin, mid: `<span class="hud-clock"></span>`, right: `<button class="btn btn-sm btn-fun" data-a="end">🏁 Kết thúc</button>` });
        let players = {}; players0.forEach((p) => (players[p.pid] = p));
        let order = players0.map((p) => p.pid);
        const finished = []; let over = false, clock;
        const build = () => {
          const old = $(".race", stage); if (old) old.remove();
          stage.insertAdjacentHTML("beforeend", sceneHTML(th, order.map((pid, i) => ({ name: players[pid].name, avatar: players[pid].avatar, color: U.TEAM_COLORS[i % U.TEAM_COLORS.length], figure: th.fig(U.TEAM_COLORS[i % U.TEAM_COLORS.length], i) }))));
          $(".race", stage).classList.add("online", "running");
          $(".rs-lanes", stage).classList.toggle("many", order.length > 8);
          update();
        };
        const laneOf = (pid) => $(`.lane[data-i="${order.indexOf(pid)}"]`, stage);
        const last = {};
        function update() {
          order.forEach((pid) => {
            const p = players[pid], l = laneOf(pid); if (!p || !l) return;
            const pr = Math.min(goal, p.progress || 0);
            setLane(l, pr / goal, fmt1(pr) + "/" + goal);
            l.classList.toggle("offline", p.online === false);
            if (last[pid] != null && pr > last[pid]) { pulse(l, "boost", 1000); th.sfx(); }
            if (last[pid] != null && (p.wrong || 0) > (last[pid + "w"] || 0)) pulse(l, "stun", (cfg.freeze || 1) * 1000);
            last[pid] = pr; last[pid + "w"] = p.wrong || 0;
            if (pr >= goal && !finished.includes(pid)) {
              finished.push(pid); l.classList.add("won");
              GK.banner(stage, `🏁 ${p.avatar || ""} <b>${esc(p.name)}</b> về đích hạng ${finished.length}!`, 1800); U.Sound.win();
            }
          });
          const active = order.filter((pid) => players[pid] && players[pid].online !== false);
          if (!over && finished.length && (cfg.endMode !== "all" || active.every((pid) => finished.includes(pid)))) ctx.timers.after(1500, end);
        }
        const off = Room.watchPlayers(pin, (ps) => {
          if (over) return;
          players = ps || {};
          const fresh = Object.keys(players).filter((pid) => !order.includes(pid));
          const gone = order.filter((pid) => !players[pid]);
          if (fresh.length || gone.length) { order = order.filter((pid) => players[pid]).concat(fresh); build(); }
          else update();
        });
        function end() {
          if (over) return; over = true; off(); clock && clock.stop();
          const R = order.slice().sort((a, b) => {
            const fa = finished.indexOf(a), fb = finished.indexOf(b);
            if (fa >= 0 || fb >= 0) return (fa < 0 ? 999 : fa) - (fb < 0 ? 999 : fb);
            return (players[b].progress || 0) - (players[a].progress || 0) || (players[b].score || 0) - (players[a].score || 0);
          });
          ctx.finish({ unit: "bước", sub: `${R.length} tay đua · đích ${goal} câu`, ranking: R.map((pid, i) => ({ pid, name: players[pid].name, avatar: players[pid].avatar, color: U.TEAM_COLORS[order.indexOf(pid) % U.TEAM_COLORS.length], score: Math.round((players[pid].progress || 0) * 10) / 10, correct: players[pid].correct || 0, wrong: players[pid].wrong || 0, figure: th.fig(U.TEAM_COLORS[order.indexOf(pid) % U.TEAM_COLORS.length], order.indexOf(pid)) })) });
        }
        $("[data-a=end]", hud).onclick = async () => { if (await U.confirm("Kết thúc cuộc đua ngay?", { ok: "Kết thúc" })) end(); };
        build();
        Room.setState(pin, { phase: "race", startAt: Room.now() + 3600 });
        GK.countdown(stage, "Học sinh trả lời trên điện thoại để tiến lên!").then(() => { if (!over) clock = GK.clock(ctx, $(".hud-clock", hud), cfg.time * 60, end); });
        return { destroy() { over = true; off(); }, stop() { over = true; off(); } };
      }
    };
  }
  THEMES.forEach((th) => Games.register(makeGame(th)));
})();
