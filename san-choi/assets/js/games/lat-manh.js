/* =========================================================
   lat-manh.js — LẬT MẢNH GHÉP BÍ ẨN
   Mỗi mảnh che một phần bức tranh; trả lời đúng để lật mở,
   đoán đúng từ khoá bí mật để giành chiến thắng lớn.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const TILE_COLORS = ["#6c4cf5", "#3b82f6", "#ec4899", "#22c55e", "#f59e0b", "#14b8a6", "#ef4444", "#a855f7"];
  const IMAGES = [["hero", "🏞️ Đường đua & dòng sông"], ["dua-thuyen", "🐉 Thuyền rồng"], ["dua-vit", "🦆 Đàn vịt"], ["keo-co", "🪢 Kéo co"], ["nhay-bao", "🛍️ Nhảy bao bố"], ["vong-quay", "🎡 Vòng quay"], ["url", "🔗 Ảnh từ đường link…"]];

  Games.register({
    id: "lat-manh", order: 80, name: "Lật mảnh ghép", icon: "🧩", colors: ["#fb923c", "#f472b6"],
    tagline: "Trả lời đúng để lật từng mảnh, khám phá bức tranh và đoán từ khoá bí mật!",
    tags: ["1–8 đội", "Theo lượt"], modes: ["local"], minQ: 9,
    howto: ["Các đội lần lượt chọn một mảnh ghép và trả lời câu hỏi ẩn sau nó.", "Đúng → mảnh ghép lật mở, đội được <b>+10 điểm</b>.",
      "Bất cứ lúc nào cũng có thể <b>đoán từ khoá</b>: đúng được thưởng lớn, sai mất lượt.", "Giáo viên có thể dùng ảnh riêng bằng đường link."],
    fields: [
      { key: "teams", type: "teams", min: 1, max: 8, def: 2 },
      { key: "grid", type: "seg", label: "Số mảnh ghép", options: [3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), `${n}×${n}`]), def: "3" },
      { key: "image", type: "select", label: "Bức tranh bí ẩn", options: IMAGES, def: "hero" },
      { key: "imageUrl", type: "text", label: "Đường link ảnh (nếu chọn ảnh từ link)", def: "", placeholder: "https://…/anh.jpg" },
      { key: "keyword", type: "text", label: "Từ khoá bí mật (có thể bỏ trống)", def: "", placeholder: "VD: Hạ Long" },
      { key: "pickTurn", type: "toggle", label: "Giáo viên tự chọn đội mỗi lượt (bấm vào đội)", def: false }
    ],

    play(stage, ctx) {
      const cfg = ctx.cfg, T = ctx.teams, G = +cfg.grid || 3, N = G * G;
      const queue = Quiz.queue(ctx.items, { shuffleQ: cfg.shuffleQ, shuffleA: cfg.shuffleA });
      const img = cfg.image === "url" && cfg.imageUrl ? `<img src="${esc(cfg.imageUrl)}" alt="">` : cfg.image === "hero" ? Art.hero() : Art.thumb(cfg.image === "url" ? "hero" : cfg.image);
      const hud = GK.hud(stage, ctx, { mid: `<span class="hud-turn"></span>`, right: `<button class="btn btn-sm btn-fun" data-a="end">🏁 Kết thúc</button>` });
      stage.insertAdjacentHTML("beforeend", `<div class="puz">
        <div class="puz-board"><div class="puz-frame" style="--g:${G}"><div class="puz-img">${img}</div>
          <div class="puz-tiles">${Array.from({ length: N }, (_, i) => `<button class="tile" data-i="${i}" style="--tc:${TILE_COLORS[i % TILE_COLORS.length]};--i:${i}"><span>${i + 1}</span></button>`).join("")}</div></div></div>
        <aside class="puz-side">
          <div class="puz-teams">${T.map((t, i) => `<div class="pt" data-t="${i}" style="--tc:${t.color}"><b>${esc(t.name)}</b><span>0</span></div>`).join("")}</div>
          ${cfg.keyword ? `<div class="puz-key"><div class="lbl">Từ khoá bí mật</div><div class="pk-slots">${[...cfg.keyword.trim()].map((c) => c === " " ? `<i class="sp"></i>` : `<i></i>`).join("")}</div><small>${cfg.keyword.trim().replace(/\s/g, "").length} chữ cái</small>
            <button class="btn btn-lg btn-fun btn-3d" data-a="guess">🔑 Đoán từ khoá</button></div>` : `<div class="puz-key"><p class="muted" style="margin:0">Mở hết các mảnh để khám phá bức tranh!</p></div>`}
          <p class="puz-tip">👆 Chọn một mảnh ghép để trả lời câu hỏi</p>
        </aside></div>`);
      const puz = $(".puz", stage);
      const st = T.map(() => ({ pts: 0, correct: 0, wrong: 0 }));
      let turn = 0, opened = 0, over = false, busy = false;
      const pickMode = !!cfg.pickTurn && T.length > 1;
      const refresh = () => {
        $$(".pt", puz).forEach((el, i) => { el.classList.toggle("on", i === turn); el.classList.toggle("pickable", pickMode); $("span", el).textContent = st[i].pts; });
        $(".hud-turn", hud).innerHTML = T.length > 1 ? (pickMode ? `👉 Giáo viên chọn đội, rồi mở mảnh — đang chọn: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>` : `Lượt: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>`) : "";
      };
      const nextTurn = () => { if (pickMode) { refresh(); return; } turn = (turn + 1) % T.length; refresh(); };
      if (pickMode) { $$(".pt", puz).forEach((el) => (el.onclick = () => { if (over || busy) return; turn = +el.dataset.t; U.Sound.click(); refresh(); })); const tip = $(".puz-tip", puz); if (tip) tip.innerHTML = "👆 Bấm chọn <b>đội</b> rồi chọn một mảnh ghép"; }
      $$(".tile", puz).forEach((tile) => (tile.onclick = async () => {
        if (busy || over || tile.classList.contains("open")) return;
        busy = true; U.Sound.pop();
        const item = queue.next(), t = turn;
        const m = U.modal({ title: `🧩 Mảnh số ${+tile.dataset.i + 1} — <span style="color:${T[t].color}">${esc(T[t].name)}</span>`, size: "lg", body: `<div class="puz-qm"></div>`, dismissible: false });
        let res = null;
        Quiz.mount($(".puz-qm", m.body), item, { explain: cfg.explain, hotkeys: true, keypad: false, autofocus: true, onAnswer: (r) => {
          res = r;
          $(".puz-qm", m.body).insertAdjacentHTML("beforeend", `<div style="text-align:right;margin-top:12px"><button class="btn btn-lg btn-primary" id="pzOk">Tiếp tục ➜</button></div>`);
          $("#pzOk", m.body).onclick = () => m.close();
          if (r.ok && !cfg.explain) ctx.timers.after(1300, () => m.close());
        } });
        await m.result; busy = false;
        if (over) return;
        if (res && res.ok) {
          st[t].pts += 10; st[t].correct++; opened++;
          tile.classList.add("open"); U.Sound.whoosh();
          GK.floatText(tile, "+10", T[t].color);
          if (opened === N) { refresh(); if (!cfg.keyword) return ctx.timers.after(1200, end); GK.banner(stage, "🖼️ Đã mở toàn bộ bức tranh! Hãy đoán từ khoá!", 2200); }
        } else { st[t].wrong++; tile.classList.add("miss"); setTimeout(() => tile.classList.remove("miss"), 900); }
        nextTurn();
      }));
      const guessBtn = $("[data-a=guess]", puz);
      if (guessBtn) guessBtn.onclick = async () => {
        if (busy || over) return;
        const t = turn;
        const g = await U.prompt(`<span style="color:${T[t].color}">${esc(T[t].name)}</span> đoán từ khoá:`, "", { title: "🔑 Đoán từ khoá bí mật", ok: "Chốt đáp án" });
        if (g == null) return;
        if (U.norm(g) === U.norm(cfg.keyword)) {
          const bonus = 30 + (N - opened) * 10; st[t].pts += bonus;
          $$(".tile", puz).forEach((x, i) => setTimeout(() => x.classList.add("open"), i * 40));
          $$(".pk-slots i:not(.sp)", puz).forEach((s, i) => { s.textContent = cfg.keyword.trim().replace(/\s/g, "")[i]; s.classList.add("on"); });
          GK.banner(stage, `🎉 <b>${esc(cfg.keyword)}</b> — chính xác! +${bonus} điểm`, 2600); U.Sound.win(); refresh();
          ctx.timers.after(2800, end);
        } else { U.Sound.wrong(); GK.banner(stage, `❌ Chưa đúng — ${esc(T[t].name)} mất lượt`, 1600); nextTurn(); }
      };
      $("[data-a=end]", hud).onclick = async () => { if (await U.confirm("Kết thúc và xem kết quả?", { ok: "Kết thúc" })) end(); };
      function end() {
        if (over) return; over = true;
        $$(".tile", puz).forEach((x) => x.classList.add("open"));
        const order = T.map((_, i) => i).sort((a, b) => st[b].pts - st[a].pts);
        ctx.timers.after(900, () => ctx.finish({ unit: "điểm", sub: cfg.keyword ? `Từ khoá: ${esc(cfg.keyword)}` : "Bức tranh đã được khám phá!", ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: st[i].pts, correct: st[i].correct, wrong: st[i].wrong })) }));
      }
      refresh();
      return { destroy() { over = true; }, stop() { over = true; } };
    }
  });
})();
