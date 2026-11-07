/* =========================================================
   o-chu.js — Ô CHỮ BÍ ẨN
   • Tự động: mỗi hàng ngang là một câu (Trả lời ngắn hoặc Trắc
     nghiệm có đáp án là MỘT TỪ) lấy từ Nguồn câu hỏi đã chọn;
     các hàng xếp để một cột dọc tạo thành TỪ KHOÁ.
   • Thiết kế tay: giáo viên mở "trình thiết kế ma trận" để tự đặt
     từng từ hàng ngang, chọn ô chữ khoá, thêm Ô QUÀ 🎁 và Ô
     CHƯỚNG NGẠI 💣, rồi LƯU THÀNH CẤU HÌNH để dùng lại.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const GK = GameKit;
  const base = (ch) => U.noAccent(ch).toUpperCase();
  const cells = (word) => Array.from(String(word).toUpperCase().replace(/\s+/g, ""));
  const SPEC = { gift: { ic: "🎁", cls: "gift", pts: 20, name: "Ô Quà tặng" }, pen: { ic: "💣", cls: "pen", pts: -15, name: "Ô Chướng ngại" } };

  /* Lấy MỘT TỪ (không dấu cách) làm đáp án hàng ngang + câu hỏi gợi ý */
  function wordOf(it) {
    if (it.type === "SA") { const a = String(it.answer).split(/\s*[|;]\s*/)[0].trim(); return /\s/.test(a) || !a ? null : a; }
    if (it.type === "MC") { const o = (it.options || []).find((x) => x.key === it.answer); if (!o) return null; const t = String(o.text).replace(/<[^>]+>/g, "").trim(); return (t && !/\s/.test(t) && t.length >= 2 && t.length <= 16) ? t : null; }
    return null;
  }

  /* ---------- Dựng bảng TỰ ĐỘNG từ ngân hàng ---------- */
  function buildAuto(keyword, pool) {
    const kw = Array.from(String(keyword).toUpperCase().replace(/\s+/g, "")).slice(0, 14);
    const cand = pool.map((it) => ({ it, w: wordOf(it) })).filter((o) => o.w).map((o) => ({ it: o.it, cs: cells(o.w) })).filter((o) => o.cs.length >= 2 && o.cs.length <= 16);
    const used = new Set(), rows = [];
    kw.forEach((kc, r) => {
      const b = base(kc);
      const list = cand.map((o, idx) => ({ o, idx })).filter((x) => !used.has(x.idx) && x.o.cs.some((c) => base(c) === b)).sort((a, b2) => a.o.cs.length - b2.o.cs.length);
      if (list.length) { const pick = list[Math.min(Math.floor(Math.random() * Math.min(3, list.length)), list.length - 1)]; used.add(pick.idx); rows.push({ clue: pick.o.it.stem, item: pick.o.it, word: pick.o.cs, keyIndex: pick.o.cs.findIndex((x) => base(x) === b), special: {} }); }
      else rows.push({ clue: "Ô quà — chữ cái của từ khoá", item: null, word: [kc], keyIndex: 0, special: {}, auto: true });
    });
    return layout(kw, rows);
  }

  /* ---------- Dựng bảng từ THIẾT KẾ TAY ---------- */
  function buildFromDesign(d) {
    const kw = Array.from(String(d.keyword || "").toUpperCase().replace(/\s+/g, ""));
    const rows = (d.rows || []).map((r, i) => {
      const word = cells(r.word || kw[i] || "?");
      let ki = Number.isInteger(r.keyIndex) ? r.keyIndex : word.findIndex((x) => base(x) === base(kw[i] || word[0]));
      if (ki < 0) ki = 0;
      const special = {};
      (r.special || []).forEach((s) => { if (s && s.c != null && SPEC[s.kind]) special[s.c] = s.kind; });
      return { clue: r.clue || `Hàng ${i + 1}`, item: r.item || null, word, keyIndex: ki, special, manualAns: (r.word || "").toUpperCase() };
    });
    return layout(kw, rows);
  }

  function layout(kw, rows) {
    const keyCol = Math.max(0, ...rows.map((r) => r.keyIndex));
    rows.forEach((r) => (r.offset = keyCol - r.keyIndex));
    const width = Math.max(1, ...rows.map((r) => r.offset + r.word.length));
    return { kw, rows, keyCol, width };
  }

  /* =========================================================
     TRÌNH THIẾT KẾ MA TRẬN
     ========================================================= */
  function openDesigner(cfg, game, onPlay) {
    const bank = DB.bank();
    const startDesign = cfg.ochuDesign;
    let kw = Array.from(String((startDesign && startDesign.keyword) || cfg.keyword || "HALONG").toUpperCase().replace(/\s+/g, ""));
    let rows = [];
    let seeded = startDesign;
    function syncRows() {
      const old = rows;
      rows = kw.map((kc, i) => (seeded && seeded.rows && seeded.rows[i]) || old[i] || { word: "", clue: "", keyIndex: null, special: [] });
      seeded = null;
    }
    syncRows();
    const ov = document.createElement("div");
    ov.className = "ocd-overlay";
    ov.style.zIndex = "900";
    ov.innerHTML = `<style>.modal-wrap, .modal-backdrop, .modal { z-index: 99999 !important; }</style>
    <div class="ocd-panel">
      <div class="ocd-head"><h2>🎨 Thiết kế ô chữ bí ẩn</h2><button class="ocd-close" id="ocdClose" title="Đóng">✕</button></div>
      <div class="ocd-body">
        <div class="ocd-kw"><label>Từ khoá hàng dọc</label><input class="input" id="ocdKw" value="${esc(kw.join(""))}" maxlength="14" placeholder="VD: HALONG"><button class="btn btn-fun" id="ocdBuild">↻ Dựng hàng</button></div>
        <p class="ocd-hint">Mỗi chữ cái của từ khoá là một hàng ngang. Nhập <b>từ hàng ngang</b> (một từ, có chứa chữ cái khoá), chọn vị trí chữ khoá, và <b>câu hỏi/gợi ý</b> (có thể bấm 📚 lấy từ ngân hàng). Bấm vào ô trong lưới xem trước để đặt <b>🎁 Ô quà</b> / <b>💣 Ô chướng ngại</b>.</p>
        <div class="ocd-rows"></div>
        <div class="ocd-prev"><div class="ocd-prev-lbl">Xem trước lưới — bấm ô để đặt 🎁 / 💣:</div><div class="ocd-grid" id="ocdGrid"></div></div>
      </div>
      <div class="ocd-actions">
        <button class="btn btn-lg btn-white" id="ocdSave">💾 Lưu thành cấu hình (preset)</button>
        <button class="btn btn-xl btn-fun btn-3d" id="ocdDone">${onPlay ? "▶ Bắt đầu chơi" : "✔ Lưu & đóng"}</button>
      </div></div>`;
    document.body.appendChild(ov);
    const host = $(".ocd-panel", ov), rowsEl = $(".ocd-rows", ov), gridEl = $("#ocdGrid", ov);
    const close = () => { try { ov.remove(); } catch (e) { } };

    function rowEditor(i) {
      const r = rows[i], kc = kw[i];
      const word = cells(r.word);
      const posOpts = word.map((c, ci) => ({ ci, ok: base(c) === base(kc) })).filter((o) => o.ok);
      return `<div class="ocd-row" data-i="${i}">
        <span class="ocd-no">${i + 1}</span><span class="ocd-kc" title="Chữ khoá của hàng này">${esc(kc)}</span>
        <input class="input ocd-w" data-i="${i}" value="${esc(r.word)}" placeholder="Từ hàng ngang (vd: HOCTAP)" maxlength="16" autocomplete="off">
        <select class="select ocd-pos" data-i="${i}" title="Vị trí chữ khoá trong từ">${posOpts.length ? posOpts.map((o) => `<option value="${o.ci}" ${r.keyIndex === o.ci ? "selected" : ""}>ô ${o.ci + 1}</option>`).join("") : `<option value="">—</option>`}</select>
        <input class="input ocd-clue" data-i="${i}" value="${esc(r.clue)}" placeholder="Câu hỏi / gợi ý cho hàng này" autocomplete="off">
        <button class="btn btn-sm ocd-bank" data-i="${i}" title="Chọn câu hỏi từ ngân hàng">📚</button>
      </div>`;
    }
    function drawRows() { rowsEl.innerHTML = kw.map((_, i) => rowEditor(i)).join(""); bindRows(); }
    function refreshPos(i) {
      const sel = $(`.ocd-pos[data-i="${i}"]`, rowsEl); if (!sel) return;
      const w = cells(rows[i].word);
      const posOpts = w.map((c, ci) => ({ ci, ok: base(c) === base(kw[i]) })).filter((o) => o.ok);
      sel.innerHTML = posOpts.length ? posOpts.map((o) => `<option value="${o.ci}" ${rows[i].keyIndex === o.ci ? "selected" : ""}>ô ${o.ci + 1}</option>`).join("") : `<option value="">—</option>`;
    }
    function bindRows() {
      // KHÔNG dựng lại toàn bộ hàng khi gõ (tránh mất con trỏ) — chỉ cập nhật ô vị trí + lưới
      $$(".ocd-w", rowsEl).forEach((inp) => (inp.oninput = () => { const i = +inp.dataset.i; rows[i].word = inp.value; const w = cells(inp.value); const ki = w.findIndex((x) => base(x) === base(kw[i])); rows[i].keyIndex = ki >= 0 ? ki : null; refreshPos(i); drawGrid(); }));
      $$(".ocd-pos", rowsEl).forEach((sel) => (sel.onchange = () => { const i = +sel.dataset.i; rows[i].keyIndex = sel.value === "" ? null : +sel.value; drawGrid(); }));
      $$(".ocd-clue", rowsEl).forEach((inp) => (inp.oninput = () => { rows[+inp.dataset.i].clue = inp.value; }));
      $$(".ocd-bank", rowsEl).forEach((b) => (b.onclick = () => pickFromBank(+b.dataset.i)));
    }
    function drawGrid() {
      const B = buildFromDesign({ keyword: kw.join(""), rows });
      gridEl.style.setProperty("--cols", B.width);
      gridEl.innerHTML = B.rows.map((r, ri) => r.word.map((ch, ci) => {
        const isKey = (r.offset + ci) === B.keyCol;
        const sp = r.special[ci];
        return `<div class="ocd-cell ${isKey ? "key" : ""} ${sp ? SPEC[sp].cls : ""}" data-r="${ri}" data-c="${ci}" style="grid-row:${ri + 1};grid-column:${r.offset + ci + 1}"><span>${esc(ch)}</span>${sp ? `<i class="ocd-sp">${SPEC[sp].ic}</i>` : ""}</div>`;
      }).join("")).join("");
      $$(".ocd-cell", gridEl).forEach((c) => (c.onclick = () => {
        const ri = +c.dataset.r, ci = +c.dataset.c;
        if ((B.rows[ri].offset + ci) === B.keyCol) { U.toast("Ô chữ khoá không thể là ô quà/chướng ngại.", "warn"); return; }
        const cur = rows[ri].special.find((s) => s.c === ci);
        const order = [null, "gift", "pen"]; const next = order[(order.indexOf(cur ? cur.kind : null) + 1) % 3];
        rows[ri].special = rows[ri].special.filter((s) => s.c !== ci); if (next) rows[ri].special.push({ c: ci, kind: next });
        U.Sound.click(); drawGrid();
      }));
    }
    async function pickFromBank(i) {
      const m = U.modal({
        title: "📚 Chọn câu hỏi từ ngân hàng", size: "lg", body: `<div class="ocd-bankdlg">
          <div class="row"><input class="input" id="obSearch" placeholder="🔎 Tìm câu hỏi…" style="flex:1">
            <select class="select input-sm" id="obType"><option value="">Mọi loại</option>${["MC", "TF", "SA"].map((t) => `<option value="${t}">${Quiz.TYPES[t]}</option>`).join("")}</select></div>
          <div class="ocd-banklist" id="obList"></div>
          <p class="muted" style="margin:6px 0 0;font-size:13px">Chọn câu để dùng làm <b>gợi ý</b> cho hàng này; nếu đáp án là một từ, hệ thống tự điền vào ô hàng ngang.</p></div>` });
      const modalWrap = m.el || (m.body && (m.body.closest(".modal-wrap") || m.body.parentElement.parentElement));
      if (modalWrap) modalWrap.style.zIndex = "100000";
      const listEl = $("#obList", m.body);
      const render = () => {
        const q = U.norm($("#obSearch", m.body).value), ty = $("#obType", m.body).value;
        const items = Quiz.flatten(bank, ["MC", "TF", "SA"]).filter((it) => (!ty || it.type === ty) && (!q || U.norm(it.stem).includes(q))).slice(0, 80);
        listEl.innerHTML = items.length ? items.map((it, k) => { const w = wordOf(it); return `<button class="ocd-bankit" data-k="${k}"><div class="obit-top"><span class="q-badge qb-${it.type}">${Quiz.TYPES[it.type]}</span><span class="obit-stem">${Quiz.rich(it.stem)}</span></div><div class="obit-ans">✅ Đáp án: <b>${Quiz.rich(Quiz.answerText(it))}</b>${w ? ` · điền ô: <em>${esc(w)}</em>` : ` <em class="obit-no">(đáp án nhiều từ — nhập ô thủ công)</em>`}</div></button>`; }).join("") : `<p class="muted" style="padding:14px">Không có câu phù hợp.</p>`;
        Quiz.typeset(listEl);
        $$(".ocd-bankit", listEl).forEach((b) => (b.onclick = () => { const it = items[+b.dataset.k]; rows[i].clue = it.stem; rows[i].item = { type: it.type, stem: it.stem, options: it.options, answer: it.answer, explain: it.explain, context: it.context }; const w = wordOf(it); if (w) { rows[i].word = w; const ww = cells(w); const ki = ww.findIndex((x) => base(x) === base(kw[i])); rows[i].keyIndex = ki >= 0 ? ki : null; } m.close(); drawRows(); drawGrid(); U.Sound.pop(); }));
      };
      $("#obSearch", m.body).oninput = render; $("#obType", m.body).onchange = render; render();
    }

    $("#ocdBuild", ov).onclick = () => { kw = Array.from($("#ocdKw", ov).value.toUpperCase().replace(/\s+/g, "")).slice(0, 14); if (!kw.length) { U.toast("Nhập từ khoá hàng dọc.", "warn"); return; } syncRows(); drawRows(); drawGrid(); };
    $("#ocdClose", ov).onclick = close;
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    function currentDesign() {
      kw = Array.from($("#ocdKw", ov).value.toUpperCase().replace(/\s+/g, "")).slice(0, 14);
      return { keyword: kw.join(""), rows: rows.map((r) => ({ word: r.word, clue: r.clue, keyIndex: r.keyIndex, special: r.special, item: r.item || null })) };
    }
    function validate(d) {
      if (!d.keyword) { U.toast("Chưa có từ khoá hàng dọc.", "warn"); return false; }
      for (let i = 0; i < d.rows.length; i++) { const w = cells(d.rows[i].word); if (w.length < 1) { U.toast(`Hàng ${i + 1} chưa có từ.`, "warn"); return false; } if (!w.some((c) => base(c) === base(d.keyword[i]))) { U.toast(`Hàng ${i + 1}: từ phải chứa chữ khoá "${d.keyword[i]}".`, "warn"); return false; } }
      return true;
    }
    $("#ocdSave", ov).onclick = async () => {
      const d = currentDesign(); if (!validate(d)) return;
      cfg.ochuDesign = d; cfg.keyword = d.keyword;
      const saveCfg = Object.assign({}, cfg, { ochuDesign: d, designer: false, keyword: d.keyword });
      const p = await GK.savePresetDialog(game, saveCfg, null);
      if (p) U.toast("Đã lưu cấu hình ô chữ. Lần sau chọn preset này để chơi ngay!", "ok", 3200);
    };
    $("#ocdDone", ov).onclick = () => { const d = currentDesign(); if (!validate(d)) return; cfg.ochuDesign = d; cfg.keyword = d.keyword; close(); if (onPlay) onPlay(buildFromDesign(d)); else U.toast("Đã lưu thiết kế. Bấm ▶ Bắt đầu chơi để chơi.", "ok", 2600); };
    drawRows(); drawGrid();
  }
  window.OChuDesigner = { open: openDesigner };

  /* =========================================================
     ĐĂNG KÝ GAME
     ========================================================= */
  Games.register({
    id: "o-chu", order: 85, name: "Ô chữ bí ẩn", icon: "🔤", colors: ["#0ea5e9", "#6366f1"],
    tagline: "Giải từng hàng ngang để lộ dần cột từ khoá bí ẩn — đội nào đoán ra trước sẽ thắng lớn!",
    tags: ["1–4 đội", "Theo lượt"], modes: ["local"], types: ["SA", "MC"], minQ: 0,
    needsQuestions: (c) => !(c && (c.ochuDesign || c.designer)),
    howto: ["Mỗi <b>hàng ngang</b> là một câu hỏi; trả lời đúng để lộ cả hàng và <b>+10 điểm</b>; các hàng xếp để một <b>cột dọc</b> tạo thành từ khoá.",
      "Tự động: hàng ngang lấy từ <b>Nguồn câu hỏi</b> (câu Trả lời ngắn, hoặc Trắc nghiệm có đáp án là một từ).",
      "Hoặc bật <b>🎨 Tự thiết kế ma trận</b> rồi bấm <b>Mở trình thiết kế</b> để tự đặt từng từ, thêm <b>🎁 Ô quà</b> / <b>💣 Ô chướng ngại</b> và <b>lưu thành cấu hình</b>.",
      "Bất cứ lúc nào cũng có thể bấm <b>Đoán từ khoá</b> — đúng được thưởng lớn, sai mất lượt."],
    fields: [
      { key: "teams", type: "teams", min: 1, max: 4, def: 2 },
      { key: "keyword", type: "text", label: "Từ khoá hàng dọc (chế độ tự động)", def: "HALONG", placeholder: "VD: HALONG, TOANHOC…" },
      { key: "designer", type: "toggle", label: "🎨 Tự thiết kế ma trận ô chữ", def: false },
      { key: "_designBtn", type: "action", label: "🎨 Mở trình thiết kế ma trận", when: (c) => c.designer, hint: "Mở cửa sổ thiết kế: đặt từ hàng ngang, ô quà/chướng ngại, rồi Lưu & đóng. Sau đó bấm ▶ Bắt đầu chơi.", onClick: (cfg) => { window.OChuDesigner.open(cfg, Games.get("o-chu"), null); } },
      { key: "pickTurn", type: "toggle", label: "Giáo viên tự chọn đội mỗi lượt (bấm vào đội)", def: false },
      { key: "qtime", type: "range", label: "Thời gian mỗi câu (0 = không giới hạn)", min: 0, max: 120, step: 5, def: 40, unit: " giây" }
    ],

    play(stage, ctx) {
      const cfg = ctx.cfg, T = ctx.teams, game = Games.get("o-chu");
      const main = document.createElement("div"); main.className = "oc-host"; stage.appendChild(main);
      const runWith = (B) => startBoard(stage, ctx, cfg, T, B, main);
      if (cfg.designer && !cfg.ochuDesign) {
        // bật thiết kế nhưng chưa thiết kế gì → mở trình thiết kế rồi chơi
        main.innerHTML = `<div class="oc-wait"><div class="oc-wait-ic">🎨</div><p>Đang mở trình thiết kế ô chữ…</p></div>`;
        openDesigner(cfg, game, (B) => { main.innerHTML = ""; runWith(B); });
        return { destroy() { }, stop() { } };
      }
      let B;
      if (cfg.ochuDesign) B = buildFromDesign(cfg.ochuDesign);
      else {
        const pool = ctx.items.filter((i) => i.type === "SA" || i.type === "MC");
        if (!String(cfg.keyword || "").replace(/\s+/g, "")) { U.toast("Hãy nhập từ khoá hàng dọc, hoặc bật trình thiết kế.", "warn"); return ctx.exit(false); }
        B = buildAuto(cfg.keyword, pool);
      }
      return runWith(B);
    }
  });

  /* ---------- Chạy một bàn ô chữ đã dựng ---------- */
  function startBoard(stage, ctx, cfg, T, B, main) {
    const giftRows = B.rows.filter((r) => r.auto).length;
    const pickMode = !!cfg.pickTurn && T.length > 1;
    GK.hud(stage, ctx, { mid: `<span class="hud-turn"></span>`, right: `<button class="btn btn-sm btn-fun" data-a="end">🏁 Kết thúc</button>` });
    main.innerHTML = `<div class="ochu">
      <div class="oc-board-wrap"><div class="oc-board" style="--cols:${B.width}"></div>
        ${giftRows === B.rows.length ? `<p class="oc-warn">⚠️ Chưa có câu hỏi phù hợp — ô chữ đang dùng toàn ô quà. Hãy chọn Nguồn câu hỏi (câu Trả lời ngắn / Trắc nghiệm đáp án một từ) hoặc bật trình thiết kế.</p>` : ""}
      </div>
      <aside class="oc-side">
        <div class="oc-teams">${T.map((t, i) => `<div class="oc-team" data-t="${i}" style="--tc:${t.color}"><b>${esc(t.name)}</b><span>0</span></div>`).join("")}</div>
        <div class="oc-key"><div class="lbl">Từ khoá (${B.kw.length} chữ)</div><div class="oc-key-slots">${B.kw.map(() => `<i></i>`).join("")}</div>
          <button class="btn btn-lg btn-fun btn-3d" data-a="guess">🔑 Đoán từ khoá</button></div>
        <p class="oc-tip">👆 Chọn một hàng ngang để trả lời</p>
      </aside></div>`;
    const board = $(".oc-board", main);
    board.innerHTML = B.rows.map((r, ri) => {
      const cellsHtml = r.word.map((ch, ci) => {
        const isKey = (r.offset + ci) === B.keyCol, sp = r.special[ci];
        return `<div class="oc-cell ${isKey ? "key" : ""} ${sp ? "sp-" + sp : ""}" data-r="${ri}" data-c="${ci}" data-sp="${sp || ""}" style="grid-column:${r.offset + ci + 2}"><span>${esc(ch)}</span></div>`;
      }).join("");
      return `<div class="oc-row ${r.auto ? "gift" : ""}" data-r="${ri}" style="grid-row:${ri + 1}">
        <button class="oc-num" data-r="${ri}" style="grid-column:1" title="${esc(String(r.clue).replace(/<[^>]+>/g, ""))}">${ri + 1}</button>${cellsHtml}</div>`;
    }).join("");
    const st = T.map(() => ({ pts: 0, correct: 0, wrong: 0 }));
    let turn = 0, over = false, busy = false, solved = 0;
    const refresh = () => {
      $$(".oc-team", main).forEach((el, i) => { el.classList.toggle("on", i === turn); el.classList.toggle("pickable", pickMode && !busy); $("span", el).textContent = st[i].pts; });
      $(".hud-turn", stage).innerHTML = T.length > 1 ? (pickMode ? `👉 Giáo viên chọn đội — đang chọn: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>` : `Lượt: <b style="color:${T[turn].color}">${esc(T[turn].name)}</b>`) : "";
    };
    const nextTurn = () => { if (pickMode) { refresh(); return; } turn = (turn + 1) % T.length; refresh(); };
    if (pickMode) $$(".oc-team", main).forEach((el) => (el.onclick = () => { if (over || busy || !el.classList.contains("pickable")) return; turn = +el.dataset.t; U.Sound.click(); refresh(); }));
    const keySlots = $$(".oc-key-slots i", main);
    function applySpecials(ri, t) {
      const r = B.rows[ri]; let delta = 0, notes = [];
      Object.keys(r.special).forEach((ci) => { const kind = r.special[ci]; const cell = $(`.oc-cell[data-r="${ri}"][data-c="${ci}"]`, board); if (cell) { cell.classList.add("sp-reveal"); cell.insertAdjacentHTML("beforeend", `<i class="oc-spic">${SPEC[kind].ic}</i>`); } delta += SPEC[kind].pts; notes.push(SPEC[kind].ic + " " + SPEC[kind].name + " " + (SPEC[kind].pts > 0 ? "+" : "") + SPEC[kind].pts); });
      if (delta) { st[t].pts += delta; GK.banner(stage, `${notes.join(" · ")} cho <b style="color:${T[t].color}">${esc(T[t].name)}</b>!`, 2000); (delta > 0 ? U.Sound.coin : U.Sound.wrong)(); }
    }
    function revealRow(ri, keyOnly) {
      $$(`.oc-cell[data-r="${ri}"]`, board).forEach((c) => { if (!keyOnly || c.classList.contains("key")) c.classList.add("show"); });
      if (keySlots[ri]) { keySlots[ri].textContent = B.kw[ri]; keySlots[ri].classList.add("on"); }
      if (!keyOnly) $(`.oc-row[data-r="${ri}"]`, board).classList.add("done");
    }
    function openRow(ri) {
      if (busy || over) return; const r = B.rows[ri];
      if ($(`.oc-row[data-r="${ri}"]`, board).classList.contains("done")) return;
      if (r.auto || !r.item) {
        // ô quà tự động hoặc hàng không gắn câu hỏi: hỏi miệng, giáo viên xác nhận
        openManual(ri);
        return;
      }
      busy = true; U.Sound.pop(); refresh(); const t = turn;
      const m = U.modal({ title: `Hàng ${ri + 1} — <span style="color:${T[t].color}">${esc(T[t].name)}</span>`, size: "lg", dismissible: false, body: `<div class="oc-qm"><div class="oc-qtime"></div><div class="oc-q"></div></div>` });
      let res = null, tid = null;
      const ctl = Quiz.mount($(".oc-q", m.body), r.item, { explain: cfg.explain, autofocus: true, meta: false, onAnswer: (rr) => { res = rr; tid && ctx.timers.stop(tid); $(".oc-qm", m.body).insertAdjacentHTML("beforeend", `<div style="text-align:right;margin-top:10px"><button class="btn btn-lg btn-primary" id="ocOk">Tiếp tục ➜</button></div>`); $("#ocOk", m.body).onclick = () => m.close(); } });
      if (cfg.qtime) { let left = cfg.qtime; const el = $(".oc-qtime", m.body); el.textContent = "⏱ " + left + "s"; tid = ctx.timers.every(1000, () => { left--; el.textContent = "⏱ " + left + "s"; if (left <= 5 && left > 0) U.Sound.tick(); if (left <= 0) { ctx.timers.stop(tid); ctl.timeout(); } }); }
      m.result.then(() => { ctl.destroy(); busy = false; if (over) return; resolveRow(ri, t, res && res.ok); });
    }
    function openManual(ri) {
      const t = turn; busy = true; refresh();
      const answer = B.rows[ri].word.join("");
      U.modal({ title: `Hàng ${ri + 1} — <span style="color:${T[t].color}">${esc(T[t].name)}</span>`, size: "md", dismissible: false,
        body: `<div class="oc-manual"><p>${esc(String(B.rows[ri].clue).replace(/<[^>]+>/g, "") || "Ô quà — chữ cái của từ khoá")}</p><input class="input" id="ocMan" placeholder="Nhập đáp án hàng ngang…" autocomplete="off"></div>`,
        actions: [{ label: "Hàng này là ô quà (lộ luôn)", cls: "btn-ghost", onClick: (b, w) => { busy = false; resolveRow(ri, t, true); return true; } },
          { label: "Chốt", cls: "btn-primary", onClick: (b, w) => { const v = $("#ocMan", w).value; busy = false; resolveRow(ri, t, U.norm(v.replace(/\s+/g, "")) === U.norm(answer)); return true; } }] });
    }
    function resolveRow(ri, t, ok) {
      if (over) return;
      if (ok) { st[t].pts += 10; st[t].correct++; revealRow(ri); solved++; GK.floatText($(`.oc-num[data-r="${ri}"]`, board), "+10", T[t].color); U.Sound.whoosh(); applySpecials(ri, t); checkDone(); }
      else { st[t].wrong++; U.Sound.wrong(); GK.banner(stage, `Chưa đúng. Đáp án hàng ${ri + 1}: <b>${esc(B.rows[ri].word.join(""))}</b>`, 2000); }
      refresh(); if (!over) nextTurn();
    }
    function checkDone() { if (solved >= B.rows.length && !over) ctx.timers.after(900, () => GK.banner(stage, "🖼️ Đã mở hết hàng ngang! Hãy đoán từ khoá!", 2200)); }
    async function guess() {
      if (busy || over) return; const t = turn;
      const g = await U.prompt(`<span style="color:${T[t].color}">${esc(T[t].name)}</span> đoán từ khoá:`, "", { title: "🔑 Đoán từ khoá", ok: "Chốt" });
      if (g == null) return;
      if (U.norm(g.replace(/\s+/g, "")) === U.norm(B.kw.join(""))) {
        const bonus = 40 + (B.rows.length - solved) * 10; st[t].pts += bonus;
        B.rows.forEach((_, ri) => revealRow(ri)); $$(".oc-cell.key", board).forEach((c) => c.classList.add("show", "lit"));
        U.Sound.win(); GK.banner(stage, `🎉 <b>${esc(B.kw.join(""))}</b> — chính xác! +${bonus} điểm`, 2600); refresh();
        ctx.timers.after(2600, end);
      } else { U.Sound.wrong(); GK.banner(stage, `❌ Chưa đúng — ${esc(T[t].name)} mất lượt`, 1600); st[t].wrong++; nextTurn(); }
    }
    function end() {
      if (over) return; over = true;
      B.rows.forEach((_, ri) => revealRow(ri));
      const order = T.map((_, i) => i).sort((a, b) => st[b].pts - st[a].pts);
      ctx.timers.after(700, () => ctx.finish({ unit: "điểm", sub: `Từ khoá: ${esc(B.kw.join(""))}`, ranking: order.map((i) => ({ name: T[i].name, color: T[i].color, score: st[i].pts, correct: st[i].correct, wrong: st[i].wrong })) }));
    }
    $$(".oc-num", board).forEach((b) => (b.onclick = () => openRow(+b.dataset.r)));
    $$(".oc-cell", board).forEach((c) => (c.onclick = () => openRow(+c.dataset.r)));
    $("[data-a=guess]", main).onclick = guess;
    $("[data-a=end]", stage).onclick = async () => { if (await U.confirm("Kết thúc và xem kết quả?", { ok: "Kết thúc" })) end(); };
    refresh();
    GK.countdown(stage, pickMode ? "Giáo viên chọn đội và giải ô chữ!" : "Giải ô chữ tìm từ khoá bí ẩn!");
    return { destroy() { over = true; }, stop() { over = true; } };
  }
})();