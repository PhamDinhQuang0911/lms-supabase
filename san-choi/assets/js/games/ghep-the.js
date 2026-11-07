/* =========================================================
   ghep-the.js — LẬT THẺ TRÍ NHỚ 🃏
   Các đội lần lượt lật 2 thẻ: một thẻ CÂU HỎI và một thẻ
   ĐÁP ÁN. Ghép đúng thành một cặp thì ghi điểm và được
   lật tiếp; sai thì thẻ úp lại, chuyển lượt. Ai ghép được
   nhiều cặp nhất khi bàn cờ trống sẽ chiến thắng!
   ========================================================= */
(function () {
  const { $, $$, esc } = U;
  const GK = GameKit;

  const plain = (s) => { const d = document.createElement("div"); d.innerHTML = String(s || ""); return (d.textContent || "").replace(/\s+/g, " ").trim(); };
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  function buildPairs(items, want) {
    const pool = [];
    (items || []).forEach((it) => {
      if (it.type !== "MC" && it.type !== "SA") return;
      const stem = plain(it.stem);
      let ans = "";
      if (it.type === "MC") { const o = (it.options || []).find((x) => x.key === it.answer); ans = o ? plain(o.text) : ""; }
      else ans = plain(String(it.answer || "").split("|")[0]);
      if (!stem || !ans) return;
      if (stem.length > 130 || ans.length > 70) return;
      if (stem.toLowerCase() === ans.toLowerCase()) return;
      pool.push({ q: stem, a: ans, len: stem.length });
    });
    pool.sort((x, y) => x.len - y.len);
    const seen = new Set(), picked = [];
    for (const p of pool) { const k = p.q.toLowerCase(); if (seen.has(k)) continue; seen.add(k); picked.push(p); if (picked.length >= want) break; }
    return picked;
  }

  Games.register({
    id: "ghep-the", order: 82, name: "Lật thẻ trí nhớ", icon: "🃏", colors: ["#06b6d4", "#8b5cf6"],
    tagline: "Lật cặp thẻ câu hỏi – đáp án trùng nhau để ghi điểm. Trí nhớ siêu phàm, cặp nào cũng \"vào tay\"!",
    tags: ["Theo lượt", "Trí nhớ", "1–6 đội"], modes: ["local"], types: ["MC", "SA"], minQ: 6,
    howto: ["Các đội <b>lần lượt lật 2 thẻ</b>: một thẻ câu hỏi, một thẻ đáp án.",
      "Ghép <b>đúng một cặp</b> được <b>+10 điểm</b> và <b>được lật tiếp</b>; ghép đúng liên tiếp còn được thưởng chuỗi.",
      "Ghép sai, hai thẻ úp lại — hãy ghi nhớ vị trí của chúng cho lượt sau!",
      "Đội ghép được nhiều điểm nhất khi bàn cờ trống sẽ chiến thắng."],
    fields: [
      { key: "teams", type: "teams", min: 1, max: 6, def: 2 },
      { key: "pairs", type: "seg", label: "Số cặp thẻ", options: [["6", "6 cặp (12 thẻ)"], ["8", "8 cặp (16 thẻ)"], ["10", "10 cặp (20 thẻ)"], ["12", "12 cặp (24 thẻ)"]], def: "8" },
      { key: "preview", type: "toggle", label: "👀 Cho cả lớp xem trước vị trí các thẻ (5 giây)", def: false },
      { key: "pickTurn", type: "toggle", label: "Giáo viên tự chọn đội mỗi lượt (bấm vào tên đội)", def: false }
    ],

    play(stage, ctx) {
      const cfg = ctx.cfg, T = ctx.teams, want = +cfg.pairs || 8;
      const pairs = buildPairs(ctx.items, want);
      const hud = GK.hud(stage, ctx, {
        title: "Lật thẻ trí nhớ", mid: `<span class="hud-turn"></span>`,
        right: `<span class="chip rc-alive mm-prog">🃏 0/${pairs.length} cặp</span> <button class="btn btn-sm btn-white" data-a="key">🔑 Đáp án ghép cặp</button> <button class="btn btn-sm btn-fun" data-a="end">🏁 Kết thúc</button>`
      });
      if (!pairs.length) {
        stage.insertAdjacentHTML("beforeend", `<div class="lq"><div class="lq-main"><div class="rc-field"><div class="rc-bell">🃏</div><h2 class="rc-title">Chưa đủ câu hỏi để tạo cặp thẻ</h2><p class="rc-sub">Trò chơi cần các câu <b>MC hoặc SA</b> có câu hỏi và đáp án ngắn gọn. Thầy cô hãy chọn nguồn câu hỏi khác hoặc thêm câu hỏi ngắn vào ngân hàng nhé!</p><div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="setup">⚙️ Quay lại cấu hình</button></div></div></div></div>`);
        $("[data-a=setup]", stage).onclick = () => ctx.exit(false);
        return { destroy() { }, stop() { } };
      }
      // Dựng bàn cờ: mỗi cặp sinh 2 thẻ (Q và A), xáo trộn vị trí
      const cards = [];
      pairs.forEach((p, pi) => { cards.push({ pair: pi, kind: "q", text: p.q }); cards.push({ pair: pi, kind: "a", text: p.a }); });
      const deck = U.shuffle(cards);
      const cols = pairs <= 6 ? 4 : pairs <= 10 ? 5 : 6;
      stage.insertAdjacentHTML("beforeend", `
        <div class="mm-wrap">
          <aside class="mm-side">${T.map((t, i) => `<div class="pt mm-team" data-t="${i}" style="--tc:${t.color}"><b>${esc(t.name)}</b><span>0</span><small class="mm-pairs"></small></div>`).join("")}
            <p class="mm-tip">👆 Đội đang chơi hãy lật <b>2 thẻ</b>: 1 thẻ <b>Câu hỏi</b> + 1 thẻ <b>Đáp án</b></p></aside>
          <div class="mm-grid" style="--cols:${cols}">${deck.map((c, i) => `
            <button class="mm-card" data-i="${i}" data-pair="${c.pair}" data-kind="${c.kind}">
              <span class="mm-in">
                <span class="mm-face mm-back"><i>🃏</i><b>${i + 1}</b></span>
                <span class="mm-face mm-front"><em class="mm-kind ${c.kind}">${c.kind === "q" ? "❓ Câu hỏi" : "✅ Đáp án"}</em><span class="mm-tx">${esc(clip(c.text, 110))}</span></span>
              </span>
            </button>`).join("")}</div>
        </div>`);
      const st = T.map(() => ({ pts: 0, pairs: 0, miss: 0, combo: 0, best: 0 }));
      let turn = 0, opened = [], found = 0, over = false, busy = false;
      const pickMode = !!cfg.pickTurn && T.length > 1;
      function refresh() {
        $$(".mm-team", stage).forEach((el, i) => {
          el.classList.toggle("on", i === turn); el.classList.toggle("pickable", pickMode);
          $("span", el).textContent = st[i].pts;
          $(".mm-pairs", el).textContent = st[i].pairs ? `🃏 ${st[i].pairs} cặp` : "";
        });
        $(".hud-turn", hud).innerHTML = T.length > 1 ? `Lượt: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>${pickMode ? " (giáo viên bấm chọn đội)" : ""}` : "";
        $(".mm-prog", hud).textContent = `🃏 ${found}/${pairs.length} cặp`;
      }
      if (pickMode) $$(".mm-team", stage).forEach((el) => (el.onclick = () => { if (over || busy) return; turn = +el.dataset.t; U.Sound.click(); refresh(); }));
      const nextTurn = () => { if (!pickMode) turn = (turn + 1) % T.length; refresh(); };

      function flip(card) {
        if (over || busy || card.classList.contains("up") || card.classList.contains("done")) return;
        U.Sound.pop();
        card.classList.add("up");
        opened.push(card);
        if (opened.length < 2) return;
        const [c1, c2] = opened; opened = [];
        const t = turn;
        if (c1.dataset.pair === c2.dataset.pair && c1.dataset.kind !== c2.dataset.kind) {
          busy = true;
          st[t].combo++; st[t].best = Math.max(st[t].best, st[t].combo);
          const pts = 10 + Math.min(10, Math.max(0, st[t].combo - 1) * 2);
          st[t].pts += pts; st[t].pairs++; found++;
          [c1, c2].forEach((c) => { c.classList.add("done"); c.style.setProperty("--tc", T[t].color); });
          U.Sound.coin();
          GK.floatText(c2, "+" + pts, T[t].color);
          GK.banner(stage, `🎉 <b>${esc(T[t].name)}</b> ghép đúng một cặp! +${pts} điểm${st[t].combo >= 2 ? ` · 🔥 chuỗi ${st[t].combo}` : ""} — được lật tiếp!`, 1500);
          refresh();
          ctx.timers.after(650, () => { busy = false; if (found >= pairs.length) end(true); });
        } else {
          busy = true;
          st[t].combo = 0; st[t].miss++;
          U.Sound.wrong();
          [c1, c2].forEach((c) => c.classList.add("miss"));
          ctx.timers.after(1250, () => {
            [c1, c2].forEach((c) => { c.classList.remove("up", "miss"); });
            busy = false; nextTurn();
          });
        }
      }
      $$(".mm-card", stage).forEach((c) => (c.onclick = () => flip(c)));

      $("[data-a=key]", hud).onclick = () => {
        U.modal({
          title: "🔑 Đáp án ghép cặp (chỉ giáo viên xem)", size: "lg",
          body: `<table class="tbl"><thead><tr><th>Cặp</th><th>❓ Câu hỏi</th><th>✅ Đáp án</th></tr></thead><tbody>${pairs.map((p, i) => `<tr><td><b>${i + 1}</b></td><td>${esc(clip(p.q, 90))}</td><td><b>${esc(clip(p.a, 60))}</b></td></tr>`).join("")}</tbody></table>`,
          actions: [{ label: "Đóng", cls: "btn-primary" }]
        });
      };
      function end(allDone) {
        if (over) return; over = true;
        if (allDone) { U.Sound.win(); U.confetti(); GK.banner(stage, "🎉 BÀN CỜ ĐÃ TRỐNG — TẤT CẢ CÁC CẶP ĐÃ ĐƯỢC GHÉP!", 2000); }
        const order = T.map((_, i) => i).sort((a, b) => st[b].pts - st[a].pts || st[b].pairs - st[a].pairs);
        ctx.timers.after(allDone ? 1600 : 300, () => ctx.finish({
          unit: "điểm", sub: `Đã ghép ${found}/${pairs.length} cặp thẻ`,
          ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: st[i].pts, correct: st[i].pairs, wrong: st[i].miss }))
        }));
      }
      $("[data-a=end]", hud).onclick = async () => { if (await U.confirm("Kết thúc và xem kết quả?", { ok: "Kết thúc" })) end(false); };

      refresh();
      if (cfg.preview) {
        busy = true;
        $$(".mm-card", stage).forEach((c) => c.classList.add("up"));
        GK.banner(stage, "👀 NHÌN KỸ VÀ GHI NHỚ VỊ TRÍ CÁC THẺ… 5 giây!", 2400);
        ctx.timers.after(5000, () => { $$(".mm-card", stage).forEach((c) => c.classList.remove("up")); busy = false; GK.banner(stage, "🃏 BẮT ĐẦU LẬT THẺ!", 1200); U.Sound.go(); });
      } else {
        GK.countdown(stage, "Ghi nhớ thật kỹ — lật thẻ thôi! 🃏").then(() => { });
      }
      return { destroy() { over = true; }, stop() { over = true; } };
    }
  });
})();
