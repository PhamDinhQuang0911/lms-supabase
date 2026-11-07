/* =========================================================
   xuc-xac.js — TUNG XÚC XẮC: Cờ tri thức theo lượt
   Trả lời đúng → được tung xúc xắc → di chuyển trên bàn cờ
   có ô thưởng, ô bẫy, tên lửa, cầu trượt…
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const CELL = {
    bonus: { ic: "⭐", t: "Ngôi sao: tiến thêm 2 ô!", mv: 2 },
    trap: { ic: "🕳️", t: "Rơi xuống hố: lùi 2 ô!", mv: -2 },
    again: { ic: "🔁", t: "Được thêm một lượt!", again: true },
    skip: { ic: "😴", t: "Ngủ quên: mất lượt sau!", skip: true },
    rocket: { ic: "🚀", t: "Tên lửa: bay vọt 4 ô!", mv: 4 },
    slide: { ic: "🛝", t: "Cầu trượt: trượt lùi 4 ô!", mv: -4 },
    gift: { ic: "🎁", t: "Hộp quà: +50 điểm thưởng!", pts: 50 }
  };
  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const faceHTML = (n, cls) => `<div class="face ${cls}">${Array.from({ length: 9 }, (_, k) => `<i class="${PIPS[n].includes(k + 1) ? "on" : ""}"></i>`).join("")}</div>`;
  const diceHTML = () => `<div class="dice-wrap"><div class="dice">${faceHTML(1, "f1")}${faceHTML(6, "f6")}${faceHTML(2, "f2")}${faceHTML(5, "f5")}${faceHTML(3, "f3")}${faceHTML(4, "f4")}</div></div>`;

  function layoutCells(N) {
    const types = Array(N).fill("");
    const pool = ["bonus", "trap", "again", "bonus", "skip", "gift", "rocket", "trap", "slide", "bonus", "gift", "again"];
    let k = 0;
    for (let i = 3; i < N - 2; i += 3 + (i % 2)) types[i] = pool[k++ % pool.length];
    return types;
  }

  Games.register({
    id: "xuc-xac", order: 60, name: "Tung xúc xắc", icon: "🎲", colors: ["#a855f7", "#f472b6"],
    tagline: "Cờ tri thức: trả lời đúng mới được tung xúc xắc — ai về đích trước?",
    tags: ["2–4 đội", "Theo lượt"], modes: ["local"], minQ: 10,
    figure: (c, i) => Art.pawn(c, i + 1),
    howto: ["Các đội lần lượt trả lời một câu hỏi.", "Đúng → được <b>tung xúc xắc</b> và di chuyển quân cờ.",
      "Ô đặc biệt: ⭐ tiến 2 · 🚀 tiến 4 · 🕳️ lùi 2 · 🛝 lùi 4 · 🔁 thêm lượt · 😴 mất lượt · 🎁 điểm thưởng.", "Quân cờ đến 🏆 trước là thắng!"],
    fields: [
      { key: "teams", type: "teams", min: 2, max: 4, def: 2 },
      { key: "cells", type: "range", label: "Số ô trên bàn cờ", min: 16, max: 48, step: 4, def: 32, unit: " ô" },
      { key: "qtime", type: "range", label: "Thời gian mỗi câu (0 = không giới hạn)", min: 0, max: 120, step: 5, def: 45, unit: " giây" },
      { key: "keypad", type: "toggle", label: "Bàn phím số ảo cho câu trả lời ngắn", def: false },
      { key: "pickTurn", type: "toggle", label: "Giáo viên tự chọn đội mỗi lượt (bấm vào đội trên bảng)", def: false }
    ],

    play(stage, ctx) {
      const cfg = ctx.cfg, T = ctx.teams, N = cfg.cells;
      const types = layoutCells(N);
      const queue = Quiz.queue(ctx.items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA });
      GK.hud(stage, ctx, { mid: `<span class="hud-turn"></span>` });
      const C = 8, rows = Math.ceil(N / C);
      stage.insertAdjacentHTML("beforeend", `<div class="dice-game">
        <div class="dg-board"><div class="board" style="--cols:${C};--rows:${rows}">
          ${types.map((ty, i) => { const r = Math.floor(i / C), c = r % 2 ? C - 1 - (i % C) : i % C;
            return `<div class="cell ${ty} ${i === 0 ? "start" : i === N - 1 ? "goal" : ""}" data-i="${i}" style="grid-row:${r + 1};grid-column:${c + 1};--i:${i}">
              <span class="cn">${i === 0 ? "" : i}</span><span class="ci">${i === 0 ? "🚩" : i === N - 1 ? "🏆" : ty ? CELL[ty].ic : ""}</span></div>`; }).join("")}
          ${T.map((t, i) => `<div class="token" data-t="${i}" style="--tc:${t.color}">${Art.pawn(t.color, i + 1)}</div>`).join("")}
        </div></div>
        <aside class="dg-side">
          <div class="dg-teams">${T.map((t, i) => `<div class="dg-team" data-t="${i}" style="--tc:${t.color}"><span class="dg-pawn">${Art.pawn(t.color, i + 1)}</span><b>${esc(t.name)}</b><span class="dg-pos">Ô 0</span><span class="dg-pts">0</span></div>`).join("")}</div>
          <div class="dg-turn"></div>
          <div class="dg-q"></div>
          <div class="dg-roll hide">${diceHTML()}<button class="btn btn-xl btn-fun btn-3d" id="rollBtn">🎲 Tung xúc xắc</button></div>
        </aside></div>`);
      const board = $(".board", stage), side = $(".dg-side", stage);
      const st = T.map(() => ({ pos: 0, skip: 0, pts: 0, correct: 0, wrong: 0 }));
      let turn = 0, over = false, qctrl = null, qclock = null;
      const pickMode = !!cfg.pickTurn && T.length > 1;

      function placeToken(t, animate) {
        const cell = $(`.cell[data-i="${st[t].pos}"]`, board), tok = $(`.token[data-t="${t}"]`, board);
        const same = st.map((s, k) => k).filter((k) => st[k].pos === st[t].pos);
        const off = same.indexOf(t) - (same.length - 1) / 2;
        tok.style.left = (cell.offsetLeft + cell.offsetWidth / 2 + off * cell.offsetWidth * 0.22) + "px";
        tok.style.top = (cell.offsetTop + cell.offsetHeight * 0.52) + "px";
        tok.style.width = Math.max(18, cell.offsetWidth * 0.42) + "px";
        if (animate) { tok.classList.remove("hop"); void tok.offsetWidth; tok.classList.add("hop"); }
      }
      const placeAll = () => T.forEach((_, i) => placeToken(i));
      const ro = new ResizeObserver(placeAll); ro.observe(board);
      function refresh() {
        $$(".dg-team", side).forEach((el, i) => { el.classList.toggle("on", i === turn); $(".dg-pos", el).textContent = st[i].pos >= N - 1 ? "🏆 Đích" : "Ô " + st[i].pos; $(".dg-pts", el).textContent = st[i].pts; });
        $$(".token", board).forEach((tk, i) => tk.classList.toggle("active", i === turn));
        $(".hud-turn", stage).innerHTML = `Lượt: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>`;
      }
      async function move(t, steps) {
        const dir = steps > 0 ? 1 : -1;
        for (let k = 0; k < Math.abs(steps); k++) {
          const np = st[t].pos + dir; if (np < 0 || np > N - 1) break;
          st[t].pos = np; placeToken(t, true); U.Sound.step(); await U.sleep(260);
          if (over) return;
        }
        placeAll();
      }
      function proceedTurn() {
        $$(".dg-team", side).forEach((el) => el.classList.remove("pickable"));
        if (st[turn].skip > 0) {
          st[turn].skip--; refresh();
          GK.banner(stage, `😴 <b style="color:${T[turn].color}">${esc(T[turn].name)}</b> mất lượt này!`, 1500);
          ctx.timers.after(1600, () => nextTurn());
          return;
        }
        ask();
      }
      function pickNext() {
        refresh();
        $(".dg-roll", side).classList.add("hide"); $(".dg-q", side).innerHTML = "";
        $(".dg-turn", side).innerHTML = `<div class="pick-note">👉 Giáo viên chọn đội trả lời tiếp (bấm vào đội trên bảng)</div>`;
        GK.banner(stage, "👉 Chọn đội tiếp theo", 1200);
        $$(".dg-team", side).forEach((el) => el.classList.add("pickable"));
      }
      function nextTurn(same) {
        if (over) return;
        if (same) return proceedTurn();
        if (pickMode) return pickNext();
        turn = (turn + 1) % T.length;
        proceedTurn();
      }
      function ask() {
        refresh();
        $(".dg-roll", side).classList.add("hide");
        $(".dg-turn", side).innerHTML = `<div class="turn-pill" style="--tc:${T[turn].color}"><span>${Art.pawn(T[turn].color, turn + 1)}</span>Lượt của <b>${esc(T[turn].name)}</b>${cfg.qtime ? `<em class="q-time"></em>` : ""}</div>`;
        qctrl && qctrl.destroy();
        const item = queue.next();
        qctrl = Quiz.mount($(".dg-q", side), item, { keypad: cfg.keypad, explain: cfg.explain, hotkeys: true, onAnswer: onAns });
        if (cfg.qtime) {
          let left = cfg.qtime; const el = $(".q-time", side); el.textContent = left + "s";
          qclock && ctx.timers.stop(qclock);
          qclock = ctx.timers.every(1000, () => { left--; el.textContent = left + "s"; if (left <= 5 && left > 0) U.Sound.tick(); if (left <= 0) { ctx.timers.stop(qclock); qctrl.timeout(); } });
        }
      }
      function onAns(res) {
        qclock && ctx.timers.stop(qclock);
        if (res.ok) {
          st[turn].correct++; st[turn].pts += 10;
          $(".dg-roll", side).classList.remove("hide");
          const rb = $("#rollBtn", side); rb.disabled = false; rb.focus();
          rb.onclick = roll;
        } else { st[turn].wrong++; refresh(); ctx.timers.after(cfg.explain ? 3200 : 2200, () => nextTurn()); }
        refresh();
      }
      async function roll() {
        const rb = $("#rollBtn", side); rb.disabled = true;
        const v = 1 + Math.floor(Math.random() * 6), dice = $(".dice", side);
        const [rx, ry] = ROT[v], sx = 720 + 360 * Math.floor(Math.random() * 2), sy = 720;
        U.Sound.dice();
        dice.style.transition = "none"; dice.style.transform = "rotateX(0) rotateY(0)"; void dice.offsetWidth;
        dice.style.transition = ""; dice.style.transform = `rotateX(${rx + sx}deg) rotateY(${ry + sy}deg)`;
        await U.sleep(1300); if (over) return;
        GK.banner(stage, `🎲 <b>${v}</b>`, 900);
        await move(turn, v); if (over) return;
        if (st[turn].pos >= N - 1) return win(turn);
        const ty = types[st[turn].pos], eff = ty && CELL[ty];
        let again = false;
        if (eff) {
          await U.sleep(250);
          GK.banner(stage, `${eff.ic} ${eff.t}`, 1500);
          eff.mv > 0 ? U.Sound.coin() : eff.mv < 0 ? U.Sound.wrong() : U.Sound.pop();
          await U.sleep(900);
          if (eff.mv) await move(turn, eff.mv);
          if (eff.pts) st[turn].pts += eff.pts;
          if (eff.skip) st[turn].skip++;
          if (eff.again) again = true;
          if (st[turn].pos >= N - 1) return win(turn);
        }
        refresh();
        ctx.timers.after(700, () => nextTurn(again));
      }
      function win(t) {
        over = true; st[t].pts += 100; refresh();
        const order = T.map((_, i) => i).sort((a, b) => (a === t ? -1 : b === t ? 1 : st[b].pos - st[a].pos || st[b].pts - st[a].pts));
        ctx.timers.after(600, () => ctx.finish({ unit: "điểm", sub: `Về đích trên bàn cờ ${N} ô`, ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: st[i].pts, correct: st[i].correct, wrong: st[i].wrong, figure: Art.pawn(T[i].color, i + 1) })) }));
      }
      if (pickMode) $$(".dg-team", side).forEach((el) => (el.onclick = () => { if (over || !el.classList.contains("pickable")) return; turn = +el.dataset.t; U.Sound.click(); proceedTurn(); }));
      requestAnimationFrame(() => { placeAll(); refresh(); });
      (async () => { await GK.countdown(stage, pickMode ? "Giáo viên chọn đội đi trước!" : "Đội " + esc(T[0].name) + " đi trước!"); if (!over) (pickMode ? pickNext() : ask()); })();
      return { destroy() { over = true; ro.disconnect(); qctrl && qctrl.destroy(); }, stop() { over = true; } };
    }
  });
})();
