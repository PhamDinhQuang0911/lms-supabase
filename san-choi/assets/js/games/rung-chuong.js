/* =========================================================
   rung-chuong.js — RUNG CHUÔNG VÀNG ONLINE 🔔
   Sân thi đấu loại trực tiếp cho cả lớp / cả trường:
   học sinh vào phòng bằng PIN/QR, trả lời trên điện thoại.
   Sai (hoặc không trả lời) = "XIN CHIA TAY" rời sân; đúng = ở lại.
   Hỗ trợ đủ 3 loại câu: MC (trắc nghiệm), TF (đúng/sai), SA (trả lời ngắn).
   Điểm nhấn: 🛟 Phao cứu trợ (người đã bị loại trả lời đúng câu cứu
   trợ để quay lại sân) và ✈️ Máy bay giấy (khi còn đúng 1 thí sinh,
   các bạn đã bị loại bỏ phiếu gợi ý đáp án cho câu quyết định).
   Người trụ lại đến câu cuối cùng & trả lời đúng = RUNG CHUÔNG VÀNG!
   ========================================================= */
(function () {
  const { $, $$, esc } = U;
  const GK = GameKit;
  const COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];

  /* ---------- Danh sách thí sinh (chế độ Một màn hình) ---------- */
  function parseRoster(text) {
    const seen = new Set(), out = [];
    String(text || "").split(/\r?\n/).forEach((line) => {
      let s = line.split(/[;\t]/)[0].trim().replace(/^\d{1,3}\s*[.)\-:]\s*/, "").replace(/^[-•*]\s*/, "").trim();
      if (!s || /^(stt|họ\s*(và\s*)?tên|họ\s*tên|name|danh\s*sách)$/i.test(s)) return;
      const k = s.toLowerCase(); if (seen.has(k)) return; seen.add(k);
      out.push(s.slice(0, 30));
    });
    return out.slice(0, 200);
  }
  function loadRosterFile(cfg, api) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".txt,.csv,text/plain,text/csv";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const names = parseRoster(String(rd.result || ""));
        if (!names.length) return U.toast("Không đọc được tên nào trong file — hãy dùng file .txt/.csv, mỗi dòng 1 tên.", "warn", 4200);
        cfg.roster = names.join("\n");
        if (api && api.rerender) api.rerender();
        U.toast(`Đã tải ${names.length} thí sinh từ file 📂`, "ok");
      };
      rd.onerror = () => U.toast("Không đọc được file, thầy cô thử lại nhé.", "err");
      rd.readAsText(f);
    };
    inp.click();
  }

  /* ---------- Thứ tự câu hỏi & câu cứu trợ ---------- */
  const lvIdx = (it) => { const i = Quiz.LEVELS.indexOf(it.level || ""); return i < 0 ? 1 : i; };
  function applyIdOrder(items, ids) {
    if (!ids || !ids.length) return items.slice();
    const pos = new Map(ids.map((id, i) => [id, i]));
    return items.map((it, i) => [it, i]).sort((a, b) => {
      const pa = pos.has(a[0].id) ? pos.get(a[0].id) : 1e6 + a[1], pb = pos.has(b[0].id) ? pos.get(b[0].id) : 1e6 + b[1];
      return pa - pb;
    }).map((x) => x[0]);
  }
  function orderQuestions(items, cfg) {
    let arr = items.slice();
    if (cfg.qOrderMode === "easy") arr.sort((a, b) => lvIdx(a) - lvIdx(b));
    else if (cfg.qOrderMode === "hard") arr.sort((a, b) => lvIdx(b) - lvIdx(a));
    else if (cfg.qOrderMode === "rand") arr = U.shuffle(arr);
    else arr = applyIdOrder(arr, cfg.qOrder);
    return arr;
  }
  function findRescueIdx(Q, cfg, from, used) {
    const set = new Set(cfg.rescueIds || []);
    if (!set.size) return -1;
    for (let j = from; j < Q.length; j++) if (set.has(Q[j].id) && !used.has(Q[j].id)) return j;
    return -1;
  }

  /* ---------- Popup sắp xếp câu hỏi & chọn câu cứu trợ ---------- */
  function openSortModal(cfg, api) {
    const raw = DB.questionsFor(cfg.source);
    let items = Quiz.flatten(raw, cfg.types);
    if (!items.length) return U.toast("Chưa có câu hỏi nào từ nguồn đã chọn — hãy chọn nguồn câu hỏi khác trước.", "warn", 4200);
    let list = applyIdOrder(items, cfg.qOrder);
    const rescueSet = new Set(cfg.rescueIds || []);
    const body = U.h(`<div class="rc-sort">
      <div class="rc-sort-tools">
        <button class="btn btn-sm btn-ghost" data-t="easy">📈 Dễ → Khó</button>
        <button class="btn btn-sm btn-ghost" data-t="hard">📉 Khó → Dễ</button>
        <button class="btn btn-sm btn-ghost" data-t="rand">🔀 Trộn ngẫu nhiên</button>
        <button class="btn btn-sm btn-ghost" data-t="orig">↩️ Thứ tự ngân hàng</button>
        <span class="rc-sort-note">Sẽ dùng <b>${Math.min(cfg.count || 20, list.length)}</b> câu đầu · tích 🛟 để chọn câu cứu trợ</span>
      </div>
      <div class="rc-sort-list"></div>
    </div>`);
    const listEl = $(".rc-sort-list", body);
    const plain = (s) => { const d = document.createElement("div"); d.innerHTML = String(s || ""); return (d.textContent || "").trim().slice(0, 110); };
    function draw() {
      listEl.innerHTML = list.map((it, i) => `<div class="rc-srow ${i >= (cfg.count || 20) ? "spare" : ""}">
        <span class="rc-sno">${i + 1}</span>
        <span class="q-badge qb-${it.type}">${it.type}</span>
        <span class="rc-sstem">${esc(plain(it.stem))}${it.level ? ` <span class="q-chip">${esc(it.level)}</span>` : ""}</span>
        <label class="rc-sres" title="Dùng làm câu cứu trợ"><input type="checkbox" data-res="${it.id}" ${rescueSet.has(it.id) ? "checked" : ""}> 🛟</label>
        <span class="rc-sbtns"><button class="btn btn-sm btn-ghost" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button class="btn btn-sm btn-ghost" data-dn="${i}" ${i === list.length - 1 ? "disabled" : ""}>↓</button></span>
      </div>`).join("");
      $$("[data-up]", listEl).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); }));
      $$("[data-dn]", listEl).forEach((b) => (b.onclick = () => { const i = +b.dataset.dn; [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); }));
      $$("[data-res]", listEl).forEach((c) => (c.onchange = () => { c.checked ? rescueSet.add(c.dataset.res) : rescueSet.delete(c.dataset.res); }));
    }
    draw();
    $$("[data-t]", body).forEach((b) => (b.onclick = () => {
      const t = b.dataset.t;
      if (t === "easy") list.sort((a, c) => lvIdx(a) - lvIdx(c));
      else if (t === "hard") list.sort((a, c) => lvIdx(c) - lvIdx(a));
      else if (t === "rand") list = U.shuffle(list);
      else list = items.slice();
      draw();
    }));
    U.modal({
      title: "🎚️ Sắp xếp câu hỏi — Rung chuông vàng", size: "lg", body, autofocus: false,
      actions: [{ label: "Hủy", cls: "btn-ghost" }, { label: "💾 Lưu thứ tự này", cls: "btn-primary", onClick: () => {
        cfg.qOrder = list.map((it) => it.id);
        cfg.rescueIds = Array.from(rescueSet);
        cfg.qOrderMode = "list";
        if (api && api.rerender) api.rerender();
        U.toast(`Đã lưu thứ tự ${list.length} câu · ${cfg.rescueIds.length} câu cứu trợ 🛟`, "ok");
      } }]
    });
  }

  /* ---------- Tổng quan sàn đấu (overlay dùng chung 2 chế độ) ---------- */
  function makeOverview(stage, getData) {
    let el = null;
    function html() {
      const d = getData();
      const aliveN = d.players.filter((p) => !p.out).length, outN = d.players.length - aliveN;
      const rows = [];
      for (let i = d.total - 1; i >= 0; i--) {
        const cur = i === d.qi, next = i === d.qi + 1;
        rows.push(`<div class="rc-lad ${i === d.total - 1 ? "final" : ""} ${cur ? "cur" : ""} ${i < d.qi ? "done" : ""} ${d.rescueIdxs && d.rescueIdxs.has(i) ? "resc" : ""}"><span>${i + 1}</span><em>${i === d.total - 1 ? "Câu Chuông Vàng" : "Câu " + (i + 1)}</em>${d.rescueIdxs && d.rescueIdxs.has(i) ? "🛟" : ""}${i === d.total - 1 ? "🔔" : ""}${cur ? "<b>◀ đang thi</b>" : next ? "<b>sắp tới</b>" : ""}</div>`);
      }
      return `<div class="rc-ov-head"><span class="rc-ov-bell">🔔</span><div><h3>RUNG CHUÔNG VÀNG</h3><p>${esc(d.subtitle || "")}</p></div>
        <span class="rc-ov-pin">${d.pin ? "PIN " + esc(d.pin) : "Một màn hình"}</span>
        <span class="rc-ov-q">${d.qi < 0 ? "Sẵn sàng" : "Câu " + Math.min(d.qi + 1, d.total) + " / " + d.total}</span>
        <button class="btn btn-icon btn-ghost rc-ov-x" data-x="1">✕</button></div>
      <div class="rc-ov-stats">
        <div class="rc-ov-stat"><span>TRÊN SÀN</span><b>${aliveN}<small>/${d.players.length}</small></b><em>${outN ? outN + " bạn đã chia tay" : "Chưa ai rời sân"}</em></div>
        <div class="rc-ov-stat"><span>ĐÃ CHIA TAY</span><b>${outN}</b><em>${esc(d.phaseLabel || "")}</em></div>
        <div class="rc-ov-stat"><span>🛟 CỨU TRỢ</span><b class="sm">${esc(d.rescueText || "")}</b><em>&nbsp;</em></div>
        <div class="rc-ov-stat"><span>✈️ MÁY BAY GIẤY</span><b class="sm">${esc(d.airplaneText || "")}</b><em>&nbsp;</em></div>
      </div>
      <div class="rc-ov-cols">
        <div class="rc-ov-floor"><h4>SÀN THI ĐẤU <small>ô vàng: đang trên sàn · ô mờ: đã rời sân</small></h4>
          <div class="rc-ov-grid">${d.players.map((p, i) => `<div class="rc-tile ${p.out ? "out" : ""}"><span class="rc-tno">${i + 1}</span><span class="rc-tav">${p.avatar || "🙂"}</span><span class="rc-tnm">${esc(p.name)}</span></div>`).join("")}</div></div>
        <div class="rc-ov-ladder"><h4>🔔 CHUÔNG VÀNG</h4>${rows.join("")}</div>
      </div>`;
    }
    function bind() { const x = $("[data-x]", el); if (x) x.onclick = close; }
    function close() { if (el) { el.remove(); el = null; } }
    function refresh() { if (el) { $(".rc-ov-card", el).innerHTML = html(); bind(); } }
    function open() {
      if (el) { refresh(); return; }
      el = U.h(`<div class="rc-ov"><div class="rc-ov-card"></div></div>`);
      $(".rc-ov-card", el).innerHTML = html();
      stage.appendChild(el); bind();
      el.addEventListener("mousedown", (e) => { if (e.target === el) close(); });
    }
    return { open, refresh, close, get isOpen() { return !!el; } };
  }

  Games.register({
    id: "rung-chuong", order: 7, name: "Rung chuông vàng online", icon: "🔔", colors: ["#f59e0b", "#ef4444"],
    tagline: "Cả sân thi đấu loại trực tiếp — sai là chia tay, trụ lại cuối cùng để rung chiếc chuông vàng!",
    tags: ["Cả lớp", "Thời gian thực", "Điện thoại", "Loại trực tiếp"], modes: ["local", "online"], onlineKind: "bell", minQ: 10,
    types: ["MC", "TF", "SA"],
    howto: ["<b>Trực tuyến:</b> giáo viên tạo phòng, thí sinh vào bằng <b>mã PIN</b> hoặc quét QR và trả lời trên điện thoại.",
      "<b>Một màn hình:</b> nhập/tải danh sách thí sinh, học sinh lên sàn đấu thật và trả lời trên giấy/bảng con — giáo viên điều khiển và chấm ngay trên màn chiếu.",
      "Mỗi câu hỏi hiện trên màn chiếu kèm đếm ngược; <b>trả lời sai = rời sân</b> 👋, đúng = ở lại chinh phục câu tiếp theo.",
      "Khi sân còn ít người, giáo viên <b>🛟 ném phao cứu trợ</b>: bạn đã bị loại trả lời đúng câu cứu trợ sẽ được quay lại sân!",
      "Khi chỉ còn <b>1 thí sinh</b>, các bạn đã bị loại được <b>✈️ gấp máy bay giấy</b> gợi ý đáp án.",
      "Trụ lại và trả lời đúng câu cuối cùng = <b>🔔 RUNG CHUÔNG VÀNG!</b>"],
    fields: [
      { key: "roster", type: "textarea", modes: ["local"], label: "👥 Danh sách thí sinh (mỗi dòng 1 tên)", rows: 6, placeholder: "Nguyễn Minh Anh\nTrần Gia Bảo\nLê Ngọc Châu\n…", hint: "Dán danh sách lớp vào đây hoặc bấm nút tải file bên dưới. Tối đa 200 thí sinh." },
      { key: "_loadRoster", type: "action", modes: ["local"], label: "📂 Tải danh sách từ file (.txt / .csv)", hint: "File văn bản mỗi dòng 1 tên, hoặc file CSV (cột đầu tiên là họ tên). Trong Excel: chọn Lưu dạng CSV rồi tải lên đây.", onClick: (cfg, api) => loadRosterFile(cfg, api) },
      { key: "count", type: "range", label: "Số câu tối đa", min: 5, max: 40, def: 20, unit: " câu" },
      { key: "qtime", type: "range", label: "Thời gian mỗi câu", min: 10, max: 90, step: 5, def: 20, unit: " giây" },
      { key: "changeAns", type: "toggle", modes: ["online"], label: "🔁 Cho phép đổi đáp án khi còn thời gian (áp dụng cả MC, TF, SA)", def: false },
      { key: "rescueAt", type: "range", label: "Gợi ý ném phao cứu trợ khi sân còn ≤", min: 0, max: 30, def: 5, unit: " người (0 = tắt)" },
      { key: "rescueTimes", type: "seg", label: "Số lần cứu trợ tối đa", options: [["1", "1 lần"], ["2", "2 lần"], ["99", "Không giới hạn"]], def: "1" },
      { key: "airplane", type: "toggle", label: "✈️ Máy bay giấy — khán giả gợi ý khi còn 1 thí sinh (chỉ với câu trắc nghiệm)", def: true },
      { key: "qOrderMode", type: "seg", label: "Thứ tự câu hỏi", options: [["list", "📋 Theo danh sách tôi sắp"], ["easy", "📈 Dễ → Khó dần"], ["hard", "📉 Khó → Dễ"], ["rand", "🔀 Ngẫu nhiên"]], def: "list" },
      { key: "_sortBtn", type: "action", label: "🎚️ Sắp xếp câu hỏi & chọn câu cứu trợ", hint: "Mở bảng sắp xếp: dùng nút ↑ ↓ để đổi thứ tự xuất hiện, tích 🛟 cho những câu dùng làm câu cứu trợ. Áp dụng khi Thứ tự câu hỏi = 'Theo danh sách tôi sắp'.", onClick: (cfg, api) => openSortModal(cfg, api) },
      { key: "auto", type: "toggle", modes: ["online"], label: "Tự động chuyển (không cần bấm)", def: false }
    ],
    roomSettings: (cfg) => ({ qtime: cfg.qtime, explain: cfg.explain, changeAns: !!cfg.changeAns }),

    host(stage, ctx, players0) {
      const cfg = ctx.cfg, pin = ctx.room.pin, Q = orderQuestions(ctx.roomQs, cfg).slice(0, cfg.count), N = Q.length;
      const hud = GK.hud(stage, ctx, { title: "Rung chuông vàng · PIN " + pin, mid: `<span class="lq-prog"></span>`, right: `<button class="btn btn-sm rc-ovbtn" data-a="ov" title="Xem toàn cảnh sân đấu">🏟️ Tổng quan sàn đấu</button> <span class="chip rc-alive">🔔 0 trên sân</span>` });
      stage.insertAdjacentHTML("beforeend", `<div class="lq"><div class="lq-main rc-main"></div></div>`);
      const main = $(".lq-main", stage);
      let players = {}; players0.forEach((p) => (players[p.pid] = p));
      let qi = -1, over = false, offAns = null, tick = null, answers = {};
      let rescuesUsed = 0, rescueMode = false, airplaneUsedFor = -1, hintForQi = null, finished = false;
      const usedRescueIds = new Set();
      const rescueIdxSet = () => { const s = new Set(); const ids = new Set(cfg.rescueIds || []); Q.forEach((q, i) => { if (ids.has(q.id)) s.add(i); }); return s; };
      const ov = makeOverview(stage, () => ({
        subtitle: "Chế độ trực tuyến · học sinh trả lời trên điện thoại", pin, qi, total: N,
        players: plist().map((p) => ({ name: p.name, avatar: p.avatar, out: p.out })),
        rescueIdxs: rescueIdxSet(),
        phaseLabel: qi < 0 ? "Chưa bắt đầu" : "Đang thi đấu",
        rescueText: cfg.rescueTimes === "99" ? "Không giới hạn lượt" : `Còn ${Math.max(0, (+cfg.rescueTimes || 1) - rescuesUsed)} lượt`,
        airplaneText: cfg.airplane ? "1 lần · khi trên sàn còn 1 em" : "Đã tắt"
      }));
      const ovBtn = $("[data-a=ov]", hud); if (ovBtn) ovBtn.onclick = () => { U.Sound.click(); ov.open(); };

      const offP = Room.watchPlayers(pin, (ps) => { players = ps || {}; updAliveChip(); if ($(".rc-field", main)) renderFieldGrid(); if (ov.isOpen) ov.refresh(); });
      const plist = () => Object.entries(players).map(([pid, p]) => Object.assign({ pid }, p));
      const aliveList = () => plist().filter((p) => !p.out);
      const outList = () => plist().filter((p) => p.out);
      function updAliveChip() { const el = $(".rc-alive", hud); if (el) el.textContent = "🔔 " + aliveList().length + " trên sân · 👋 " + outList().length + " đã chia tay"; }
      function bulkUpdate(patch) { // cập nhật nhiều người chơi trong 1 lần ghi
        const u = {}; Object.keys(patch).forEach((pid) => { Object.keys(patch[pid]).forEach((k) => (u[`rooms/${pin}/players/${pid}/${k}`] = patch[pid][k])); });
        if (Object.keys(u).length) return FB.rtdb.ref().update(u); return Promise.resolve();
      }
      const rescueLeft = () => rescuesUsed < (+cfg.rescueTimes || 1);
      const canRescue = () => rescueLeft() && outList().length > 0 && qi + 1 < N && !finished;

      /* ================= SÂN ĐẤU (màn hình chờ giữa các câu) ================= */
      function renderField(msg) {
        if (over) return;
        Room.setState(pin, { phase: "field", qi, alive: aliveList().length });
        $(".lq-prog", hud).innerHTML = qi < 0 ? `Sẵn sàng · <b>${N}</b> câu` : `Đã qua <b>${qi + 1}</b>/${N} câu`;
        const a = aliveList().length, isLast = qi + 1 >= N;
        const suggestRescue = canRescue() && cfg.rescueAt > 0 && a <= cfg.rescueAt && a > 0;
        const showRescueBtn = canRescue() && (suggestRescue || a === 0);
        const nextIsMC = Q[qi + 1] && Q[qi + 1].type === "MC";
        const showPlane = cfg.airplane && a === 1 && qi + 1 < N && airplaneUsedFor !== qi + 1 && outList().length > 0 && nextIsMC;
        main.innerHTML = `<div class="rc-field">
          <div class="rc-bell ${a === 1 ? "hot" : ""}">🔔</div>
          <h2 class="rc-title">${qi < 0 ? "SÂN THI ĐẤU ĐÃ SẴN SÀNG!" : a === 0 ? "SÂN ĐẤU TRỐNG!" : a === 1 ? "CHỈ CÒN 1 THÍ SINH!" : "CÒN " + a + " THÍ SINH TRÊN SÂN"}</h2>
          <p class="rc-sub">${msg || (qi < 0 ? `Tất cả ${plist().length} thí sinh hãy sẵn sàng — trả lời sai là chia tay sân đấu đấy!` : isLast ? "Đã hết câu hỏi." : `Câu tiếp theo: câu ${qi + 2}/${N}${Q[qi + 1] ? " · " + Quiz.TYPES[Q[qi + 1].type] : ""}`)}</p>
          ${suggestRescue ? `<div class="rc-callout">🛟 Sân chỉ còn ${a} người — đây là lúc đẹp nhất để <b>ném phao cứu trợ</b> cho các bạn đã bị loại!</div>` : ""}
          ${a === 0 && canRescue() ? `<div class="rc-callout">🛟 Mọi người đã bị loại — hãy <b>ném phao cứu trợ</b> để cuộc thi tiếp tục!</div>` : ""}
          <div class="rc-grid">${plist().map((p) => `<div class="rc-p ${p.out ? "out" : ""} ${p.online === false ? "off" : ""}"><span class="rc-av">${p.avatar || "🙂"}</span><span class="rc-nm">${esc(p.name)}</span>${p.out ? `<span class="rc-x">👋</span>` : `<span class="rc-ck">✓${p.correct || ""}</span>`}</div>`).join("")}</div>
          <div class="lq-act rc-act">
            ${!isLast && a > 0 ? `<button class="btn btn-xl btn-fun btn-3d" data-a="next">▶ Câu ${qi + 2} — bắt đầu!</button>` : ""}
            ${showRescueBtn ? `<button class="btn btn-xl btn-white" data-a="rescue">🛟 Ném phao cứu trợ (${rescuesUsed}/${cfg.rescueTimes === "99" ? "∞" : cfg.rescueTimes})</button>` : ""}
            ${showPlane ? `<button class="btn btn-xl btn-white" data-a="plane">✈️ Máy bay giấy — khán giả gợi ý</button>` : ""}
            ${isLast || a === 0 ? `<button class="btn btn-xl btn-fun btn-3d" data-a="finish">🏆 Tổng kết & trao giải</button>` : `<button class="btn btn-lg btn-white" data-a="finish">🏁 Kết thúc sớm</button>`}
          </div></div>`;
        Quiz.typeset(main);
        const nx = $("[data-a=next]", main); if (nx) nx.onclick = () => { rescueMode = false; showQuestion(false); };
        const rs = $("[data-a=rescue]", main); if (rs) rs.onclick = rescueIntro;
        const pl = $("[data-a=plane]", main); if (pl) pl.onclick = airplaneIntro;
        const fn = $("[data-a=finish]", main); if (fn) fn.onclick = () => finishGame(false);
        if (cfg.auto && nx && !showRescueBtn && !showPlane) ctx.timers.after(4000, () => { if ($(".rc-field", main) && !over) { rescueMode = false; showQuestion(false); } });
      }
      function renderFieldGrid() { /* lưới thí sinh tự cập nhật qua watchPlayers — chỉ đổi class, không vẽ lại cả sân */
        const grid = $(".rc-grid", main); if (!grid) return;
        const map = {}; plist().forEach((p) => (map[p.pid] = p));
        $$(".rc-p", grid).forEach((el, i) => { const p = plist()[i]; if (!p) return; el.classList.toggle("out", !!p.out); });
      }

      /* ================= CÂU HỎI ================= */
      function expected() { return rescueMode ? outList() : aliveList(); }
      function updCount() { const el = $(".lq-ans b", main); if (el) el.textContent = Object.keys(answers).length + "/" + expected().length; }

      function showQuestion(isRescue) {
        if (over) return;
        if (isRescue) { // ưu tiên câu giáo viên đã chọn làm câu cứu trợ: hoán đổi lên vị trí tiếp theo
          const rj = findRescueIdx(Q, cfg, qi + 1, usedRescueIds);
          if (rj > qi + 1) { const t = Q[qi + 1]; Q[qi + 1] = Q[rj]; Q[rj] = t; }
          if (rj >= 0) usedRescueIds.add(Q[qi + 1].id);
        }
        qi++; if (qi >= N) return finishGame(false);
        rescueMode = !!isRescue;
        answers = {};
        const it = Q[qi], dur = cfg.qtime, startAt = Room.now() + 2500;
        const isFinal = qi === N - 1;
        $(".lq-prog", hud).innerHTML = `Câu <b>${qi + 1}</b>/${N}${rescueMode ? " · 🛟 CỨU TRỢ" : ""}${isFinal ? " · 🔔 CÂU CHUÔNG VÀNG" : ""}`;
        main.innerHTML = `<div class="lq-intro ${isFinal ? "rc-final" : ""}"><span class="lq-n">${rescueMode ? "🛟 Câu cứu trợ" : isFinal ? "🔔 CÂU CHUÔNG VÀNG" : "Câu " + (qi + 1)}</span><div class="lq-type">${Quiz.TYPES[it.type]}${rescueMode ? " — các bạn đã bị loại trả lời để quay lại sân!" : ""}</div><div class="lq-bar"><i></i></div></div>`;
        Room.setState(pin, { phase: "question", qi, startAt, dur, rescue: rescueMode, final: isFinal, hintKey: hintForQi === qi ? lastHint : null });
        ctx.timers.after(2500, () => {
          if (over) return;
          let body = "";
          if (it.type === "MC") body = `<div class="lq-opts n${it.options.length}">${it.options.map((o, i) => `<div class="lq-opt" style="--oc:${COLORS[i]};--i:${i}" data-k="${o.key}"><span class="lq-sh">${Quiz.SHAPES[i]}</span><span class="lq-tx">${Quiz.rich(o.text)}</span><span class="lq-cnt"></span></div>`).join("")}</div>`;
          else if (it.type === "TF") body = `<div class="lq-tf">${it.options.map((o, i) => `<div class="lq-tfr" style="--i:${i}" data-i="${i}"><b>${o.key})</b><span>${Quiz.rich(o.text)}</span><em class="lq-tfa"></em></div>`).join("")}</div>`;
          else body = `<div class="lq-sa">✍️ Nhập câu trả lời trên điện thoại của bạn<div class="lq-sa-ans"></div></div>`;
          main.innerHTML = `<div class="lq-q">
            <div class="lq-top"><div class="lq-timer"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="tr" cx="22" cy="22" r="19"/></svg><b>${dur}</b></div>
              <div class="lq-stem">${rescueMode ? `<div class="q-ctx">🛟 CÂU CỨU TRỢ — trả lời đúng để quay lại sân đấu!</div>` : ""}${it.context ? `<div class="q-ctx">${Quiz.rich(it.context)}</div>` : ""}${Quiz.rich(it.stem)}${hintForQi === qi && lastHint ? `<div class="rc-hint">✈️ Máy bay giấy gợi ý: đáp án <b>${esc(lastHint)}</b> được khán giả chọn nhiều nhất</div>` : ""}</div>
              <div class="lq-ans"><b>0/${expected().length}</b><span>${rescueMode ? "đã trả lời (đang bị loại)" : "đã trả lời"}</span></div></div>
            ${body}
            <div class="lq-act"><button class="btn btn-lg btn-white" data-a="skip">⏭ Dừng & công bố đáp án</button></div></div>`;
          Quiz.typeset(main);
          $("[data-a=skip]", main).onclick = () => reveal();
          const tr = $(".tr", main), tb = $(".lq-timer b", main);
          tick = ctx.timers.every(200, () => {
            const left = Math.max(0, dur - (Room.now() - startAt) / 1000);
            tb.textContent = Math.ceil(left); tr.style.strokeDashoffset = (1 - left / dur) * 119.4;
            if (left <= 0) reveal();
          });
          offAns && offAns();
          offAns = Room.watchAnswers(pin, qi, (a) => { answers = a || {}; updCount(); const exp = expected(); if (exp.length > 0 && exp.every((p) => answers[p.pid])) ctx.timers.after(600, () => reveal()); });
          U.Sound.go();
        });
      }
      let revealed = -1, lastHint = null;
      function reveal() {
        if (revealed === qi || over) return; revealed = qi;
        tick && ctx.timers.stop(tick); offAns && offAns(); offAns = null;
        const it = Q[qi], A = answers;
        Room.setState(pin, { phase: "reveal", qi, rescue: rescueMode });
        U.Sound.coin();
        const part = expected(); // người thuộc lượt này (trước khi loại/cứu)
        const okPids = part.filter((p) => A[p.pid] && A[p.pid].ok).map((p) => p.pid);
        const patch = {};
        if (rescueMode) okPids.forEach((pid) => (patch[pid] = { out: false }));
        else part.filter((p) => !okPids.includes(p.pid)).forEach((p) => (patch[p.pid] = { out: true }));
        const elimNames = rescueMode ? [] : part.filter((p) => !okPids.includes(p.pid));
        const savedNames = rescueMode ? part.filter((p) => okPids.includes(p.pid)) : [];
        bulkUpdate(patch).catch(() => { });
        const lq = $(".lq-q", main); if (!lq) { afterReveal(elimNames, savedNames); return; }
        lq.classList.add("revealed");
        const Aval = Object.values(A);
        if (it.type === "MC") {
          $$(".lq-opt", main).forEach((el) => {
            const k = el.dataset.k, n = Aval.filter((a) => a.given === k).length;
            el.classList.add(k === it.answer ? "right" : "wrong");
            $(".lq-cnt", el).innerHTML = `${n} <small>${Aval.length ? Math.round((n / Aval.length) * 100) : 0}%</small>`;
          });
        } else if (it.type === "TF") {
          $$(".lq-tfr", main).forEach((el) => {
            const i = +el.dataset.i, ok = Aval.filter((a) => a.given && a.given[i] === it.answer[i]).length;
            el.classList.add("show");
            $(".lq-tfa", el).innerHTML = `<span class="${it.answer[i] ? "t" : "f"}">${it.answer[i] ? "ĐÚNG" : "SAI"}</span> ${Aval.length ? Math.round((ok / Aval.length) * 100) : 0}% chọn đúng`;
          });
        } else {
          const right = Aval.filter((a) => a.ok).length;
          const top = {}; Aval.forEach((a) => { const g = String(a.given || "").trim(); if (g) top[g] = (top[g] || 0) + 1; });
          const sa = $(".lq-sa-ans", main); if (sa) sa.innerHTML = `<div class="lq-sa-right">Đáp án: <b>${esc(String(it.answer).split("|")[0])}</b> · ${right}/${Aval.length} bạn đúng</div>
            <div class="lq-cloud">${Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g, n]) => `<span class="${Quiz.saMatch(g, it.answer) ? "ok" : ""}" style="font-size:${14 + Math.min(n, 8) * 3}px">${esc(g)}</span>`).join("")}</div>`;
        }
        if (cfg.explain && it.explain) { lq.insertAdjacentHTML("beforeend", `<div class="lq-exp">💡 ${Quiz.rich(it.explain)}</div>`); Quiz.typeset(lq); }
        // Phần sân khấu: công bố ai chia tay / ai được cứu
        let drama = "";
        if (rescueMode) {
          drama = savedNames.length
            ? `<div class="rc-drama saved"><h3>🛟 ĐƯỢC CỨU — CHÀO MỪNG TRỞ LẠI SÂN!</h3><div class="rc-names">${savedNames.map((p, i) => `<span style="--i:${i}">${p.avatar || "🙂"} ${esc(p.name)}</span>`).join("")}</div></div>`
            : `<div class="rc-drama"><h3>🛟 Chưa bạn nào trả lời đúng câu cứu trợ</h3><p>Phao đã được ném nhưng chưa ai nắm được — cố lên lần sau nhé!</p></div>`;
          if (savedNames.length) U.Sound.win(); else U.Sound.wrong();
        } else if (elimNames.length) {
          drama = `<div class="rc-drama"><h3>👋 XIN CHIA TAY</h3><div class="rc-names">${elimNames.map((p, i) => `<span style="--i:${i}">${p.avatar || "🙂"} ${esc(p.name)}</span>`).join("")}</div><p>Cảm ơn các bạn đã thi đấu hết mình — hãy cổ vũ các bạn còn lại nhé!</p></div>`;
          U.Sound.wrong();
        } else {
          drama = `<div class="rc-drama saved"><h3>🎉 TUYỆT VỜI — CẢ SÂN ĐỀU ĐÚNG!</h3><p>Không ai phải chia tay ở câu này.</p></div>`;
          U.Sound.correct();
        }
        lq.insertAdjacentHTML("beforeend", drama);
        const act = $(".lq-act", main);
        act.innerHTML = `<button class="btn btn-xl btn-fun btn-3d" data-a="field">🏟️ Về sân đấu (${aliveList().length + (rescueMode ? savedNames.length : -elimNames.length)} trên sân)</button>`;
        $("[data-a=field]", act).onclick = () => afterReveal(elimNames, savedNames);
        if (cfg.auto) ctx.timers.after(6000, () => { if (revealed === qi && $(".lq-q", main)) afterReveal(elimNames, savedNames); });
      }
      function afterReveal(elimNames, savedNames) {
        if (over) return;
        // Cập nhật cục bộ ngay để sân đấu hiển thị đúng (watchPlayers cũng sẽ đồng bộ lại)
        if (rescueMode) savedNames.forEach((p) => { if (players[p.pid]) players[p.pid].out = false; });
        else elimNames.forEach((p) => { if (players[p.pid]) players[p.pid].out = true; });
        rescueMode = false; hintForQi = null;
        const a = aliveList().length;
        const isFinalDone = qi >= N - 1;
        if (isFinalDone) {
          if (a === 1) return championCeremony(aliveList()[0]);
          return finishGame(a === 0);
        }
        if (a === 0 && !canRescue()) return finishGame(true);
        if (a === 1 && qi + 1 < N) GK.banner(stage, `🔔 Chỉ còn <b>1 thí sinh</b> trên sân!`, 1800);
        renderField();
      }

      /* ================= CỨU TRỢ ================= */
      function rescueIntro() {
        if (!canRescue()) return;
        rescuesUsed++;
        Room.setState(pin, { phase: "rescue", qi });
        main.innerHTML = `<div class="rc-rescue">
          <div class="rc-bell">🛟</div>
          <h2 class="rc-title">PHAO CỨU TRỢ ĐÃ ĐƯỢC NÉM!</h2>
          <p class="rc-sub">${outList().length} bạn đã chia tay sẽ cùng trả lời <b>1 câu cứu trợ</b>.<br>Trả lời <b>đúng</b> = quay lại sân đấu ngay lập tức!</p>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="go">▶ Bắt đầu câu cứu trợ</button>
          <button class="btn btn-lg btn-white" data-a="back">↩ Quay lại sân đấu</button></div></div>`;
        U.Sound.go();
        $("[data-a=go]", main).onclick = () => showQuestion(true);
        $("[data-a=back]", main).onclick = () => { rescuesUsed--; renderField(); };
      }

      /* ================= MÁY BAY GIẤY ================= */
      function airplaneIntro() {
        const nqi = qi + 1, it = Q[nqi];
        if (!it || it.type !== "MC") return;
        airplaneUsedFor = nqi;
        const startAt = Room.now() + 1500, dur = 20;
        Room.setState(pin, { phase: "airplane", qi: nqi, startAt, dur });
        main.innerHTML = `<div class="rc-plane">
          <div class="rc-bell">✈️</div>
          <h2 class="rc-title">MÁY BAY GIẤY CỨU TRỢ!</h2>
          <p class="rc-sub">Chỉ còn <b>${esc((aliveList()[0] || {}).name || "1 thí sinh")}</b> trên sân. Các bạn đã chia tay hãy <b>bỏ phiếu trên điện thoại</b> để gợi ý đáp án cho câu ${nqi + 1}:</p>
          <div class="lq-stem rc-plane-q">${Quiz.rich(it.stem)}</div>
          <div class="rc-votes">${it.options.map((o, i) => `<div class="rc-vote" data-k="${o.key}"><span class="lq-sh" style="--oc:${COLORS[i]}">${Quiz.SHAPES[i]}</span><b>${esc(o.label || o.key)}</b><div class="rc-bar"><i style="width:0%"></i></div><span class="rc-pct">0%</span></div>`).join("")}</div>
          <p class="rc-sub" id="rcVoteCount">Đang chờ những chiếc máy bay đầu tiên…</p>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="pub">📣 Công bố gợi ý & vào câu ${nqi + 1}</button></div></div>`;
        Quiz.typeset(main);
        let votes = {};
        offAns && offAns();
        offAns = Room.watchAnswers(pin, "v" + nqi, (a) => {
          votes = a || {};
          const vals = Object.values(votes), tot = vals.length;
          $$(".rc-vote", main).forEach((el) => {
            const k = el.dataset.k, n = vals.filter((v) => v.given === k).length;
            $(".rc-bar i", el).style.width = (tot ? Math.round((n / tot) * 100) : 0) + "%";
            $(".rc-pct", el).textContent = (tot ? Math.round((n / tot) * 100) : 0) + "% · " + n;
          });
          const vc = $("#rcVoteCount", main); if (vc) vc.textContent = tot + " chiếc máy bay giấy đã bay tới! ✈️";
        });
        U.Sound.go();
        $("[data-a=pub]", main).onclick = () => {
          offAns && offAns(); offAns = null;
          const vals = Object.values(votes);
          let best = null, bn = -1;
          it.options.forEach((o) => { const n = vals.filter((v) => v.given === o.key).length; if (n > bn) { bn = n; best = o; } });
          lastHint = best ? (best.label || best.key) : null;
          hintForQi = nqi;
          Room.setState(pin, { phase: "airplane-result", qi: nqi, hintKey: lastHint });
          main.innerHTML = `<div class="rc-plane">
            <div class="rc-bell">✈️💌</div>
            <h2 class="rc-title">MÁY BAY GIẤY NÓI RẰNG…</h2>
            <p class="rc-sub">Đáp án được khán giả tin tưởng nhất: <b style="font-size:24px">${best ? esc(best.label || best.key) + ". " : ""}</b>${best ? Quiz.rich(best.text) : ""}<br><small>(${bn} phiếu) — chỉ là gợi ý thôi, quyết định cuối cùng vẫn là của thí sinh!</small></p>
            <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="go">▶ Vào câu ${nqi + 1}</button></div></div>`;
          Quiz.typeset(main);
          U.Sound.coin();
          $("[data-a=go]", main).onclick = () => { rescueMode = false; showQuestion(false); };
        };
      }

      /* ================= KẾT THÚC ================= */
      function championCeremony(p) {
        if (finished) return; finished = true;
        Room.setState(pin, { phase: "champion", qi });
        main.innerHTML = `<div class="rc-champ">
          <div class="rc-bell mega">🔔</div>
          <h2 class="rc-champ-t">RUNG CHUÔNG VÀNG!</h2>
          <p class="rc-champ-n">${p.avatar || "🏆"} ${esc(p.name)}</p>
          <p class="rc-sub">Người duy nhất trụ lại và chinh phục câu hỏi cuối cùng — xin chúc mừng nhà vô địch!</p>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="podium">🏆 Xem bảng vinh danh</button></div></div>`;
        U.Sound.win(); U.confetti(); setTimeout(() => U.confetti({ burst: true, count: 140 }), 800);
        if (window.U && U.Music) { /* nhạc nền giữ nguyên */ }
        $("[data-a=podium]", main).onclick = () => finishGame(false, p.pid);
      }
      function finishGame(noChampion, champPid) {
        if (finished && !champPid) return; finished = true; over = true;
        offP(); offAns && offAns();
        const champ = champPid || (aliveList().length === 1 && qi >= N - 1 ? aliveList()[0].pid : null);
        const R = plist().sort((a, b) => {
          if (champ) { if (a.pid === champ) return -1; if (b.pid === champ) return 1; }
          const ao = a.out ? 1 : 0, bo = b.out ? 1 : 0; if (ao !== bo) return ao - bo;
          return (b.correct || 0) - (a.correct || 0) || (b.score || 0) - (a.score || 0);
        });
        Room.setState(pin, { phase: "podium" });
        ctx.finish({ unit: "điểm", sub: `${R.length} thí sinh · ${Math.min(qi + 1, N)} câu hỏi${champ ? " · 🔔 Có nhà vô địch rung chuông vàng!" : noChampion ? " · Chưa ai rung được chuông lần này" : ""}`, ranking: R.map((p, i) => ({ pid: p.pid, name: p.name, avatar: p.avatar, color: U.TEAM_COLORS[i % 6], score: p.score || 0, correct: p.correct || 0, wrong: p.wrong || 0 })) });
      }

      GK.countdown(stage, "Thí sinh sẵn sàng — chuông vàng đang chờ!").then(() => { if (!over) { updAliveChip(); renderField(); } });
      return { destroy() { over = true; offP(); offAns && offAns(); ov.close(); }, stop() { over = true; offP(); } };
    },

    /* ================= CHẾ ĐỘ MỘT MÀN HÌNH (sàn đấu thật) ================= */
    play(stage, ctx) {
      const cfg = ctx.cfg;
      const hud = GK.hud(stage, ctx, { title: "Rung chuông vàng · Một màn hình", mid: `<span class="lq-prog"></span>`, right: `<button class="btn btn-sm rc-ovbtn" data-a="ov" title="Xem toàn cảnh sân đấu">🏟️ Tổng quan sàn đấu</button> <span class="chip rc-alive">🔔 0 trên sân</span>` });
      stage.insertAdjacentHTML("beforeend", `<div class="lq"><div class="lq-main rc-main"></div></div>`);
      const main = $(".lq-main", stage);
      const names = parseRoster(cfg.roster);
      if (!names.length) {
        main.innerHTML = `<div class="rc-field"><div class="rc-bell">👥</div><h2 class="rc-title">Chưa có danh sách thí sinh</h2>
          <p class="rc-sub">Chế độ Một màn hình cần danh sách thí sinh: thầy cô quay lại màn cấu hình, dán danh sách lớp vào ô <b>"Danh sách thí sinh"</b> hoặc bấm <b>"📂 Tải danh sách từ file"</b> nhé!</p>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="setup">⚙️ Quay lại cấu hình</button></div></div>`;
        $("[data-a=setup]", main).onclick = () => ctx.exit(false);
        return { destroy() { }, stop() { } };
      }
      const P = names.map((name, i) => ({ name, avatar: U.AVATARS[i % U.AVATARS.length], out: false, survived: 0 }));
      const Q = orderQuestions(Quiz.prepare(ctx.items, { shuffleQ: false, shuffleA: cfg.shuffleA }), cfg).slice(0, cfg.count), N = Q.length;
      let qi = -1, over = false, tick = null, rescueMode = false, rescuesUsed = 0, finished = false;
      let hint = null, hintForQi = -1; const usedRescueIds = new Set();
      const aliveL = () => P.filter((p) => !p.out), outL = () => P.filter((p) => p.out);
      const rescueLeft = () => rescuesUsed < (+cfg.rescueTimes || 1);
      const canRescue = () => rescueLeft() && outL().length > 0 && qi + 1 < N && !finished;
      const rescueIdxSet = () => { const s = new Set(); const ids = new Set(cfg.rescueIds || []); Q.forEach((q, i) => { if (ids.has(q.id)) s.add(i); }); return s; };
      const ov = makeOverview(stage, () => ({
        subtitle: "Chế độ một màn hình · sàn đấu thật tại lớp", pin: "", qi, total: N,
        players: P.map((p) => ({ name: p.name, avatar: p.avatar, out: p.out })),
        rescueIdxs: rescueIdxSet(),
        phaseLabel: qi < 0 ? "Chưa bắt đầu" : "Đang thi đấu",
        rescueText: cfg.rescueTimes === "99" ? "Không giới hạn lượt" : `Còn ${Math.max(0, (+cfg.rescueTimes || 1) - rescuesUsed)} lượt`,
        airplaneText: cfg.airplane ? "1 lần · khi trên sàn còn 1 em" : "Đã tắt"
      }));
      const ovBtn = $("[data-a=ov]", hud); if (ovBtn) ovBtn.onclick = () => { U.Sound.click(); ov.open(); };
      function updChip() { const el = $(".rc-alive", hud); if (el) el.textContent = "🔔 " + aliveL().length + " trên sân · 👋 " + outL().length + " đã chia tay"; }
      function gridHTML() { return P.map((p, i) => `<div class="rc-p ${p.out ? "out" : ""}"><span class="rc-num">${i + 1}</span><span class="rc-av">${p.avatar}</span><span class="rc-nm">${esc(p.name)}</span>${p.out ? `<span class="rc-x">👋</span>` : `<span class="rc-ck">✓${p.survived || ""}</span>`}</div>`).join(""); }

      function renderField(msg) {
        if (over) return;
        updChip();
        $(".lq-prog", hud).innerHTML = qi < 0 ? `Sẵn sàng · <b>${N}</b> câu` : `Đã qua <b>${qi + 1}</b>/${N} câu`;
        const a = aliveL().length, isLast = qi + 1 >= N;
        const suggestRescue = canRescue() && cfg.rescueAt > 0 && a <= cfg.rescueAt && a > 0;
        const showRescueBtn = canRescue() && (suggestRescue || a === 0);
        const nextIsMC = Q[qi + 1] && Q[qi + 1].type === "MC";
        const showPlane = cfg.airplane && a === 1 && qi + 1 < N && outL().length > 0 && nextIsMC;
        main.innerHTML = `<div class="rc-field">
          <div class="rc-bell ${a === 1 ? "hot" : ""}">🔔</div>
          <h2 class="rc-title">${qi < 0 ? "SÂN THI ĐẤU ĐÃ SẴN SÀNG!" : a === 0 ? "SÂN ĐẤU TRỐNG!" : a === 1 ? "CHỈ CÒN 1 THÍ SINH!" : "CÒN " + a + " THÍ SINH TRÊN SÂN"}</h2>
          <p class="rc-sub">${msg || (qi < 0 ? `Mời ${P.length} thí sinh lên sàn! Trả lời bằng bảng con/giơ tay — thầy cô chấm ngay trên màn hình này.` : isLast ? "Đã hết câu hỏi." : `Câu tiếp theo: câu ${qi + 2}/${N} · ${Quiz.TYPES[Q[qi + 1].type]}`)}</p>
          ${suggestRescue ? `<div class="rc-callout">🛟 Sân chỉ còn ${a} người — lúc đẹp nhất để <b>ném phao cứu trợ</b>!</div>` : ""}
          ${a === 0 && canRescue() ? `<div class="rc-callout">🛟 Cả sân đã chia tay — hãy <b>ném phao cứu trợ</b> để cuộc thi tiếp tục!</div>` : ""}
          <div class="rc-grid">${gridHTML()}</div>
          <div class="lq-act rc-act">
            ${!isLast && a > 0 ? `<button class="btn btn-xl btn-fun btn-3d" data-a="next">▶ Câu ${qi + 2} — bắt đầu!</button>` : ""}
            ${showRescueBtn ? `<button class="btn btn-xl btn-white" data-a="rescue">🛟 Ném phao cứu trợ</button>` : ""}
            ${showPlane ? `<button class="btn btn-xl btn-white" data-a="plane">✈️ Máy bay giấy — khán giả gợi ý</button>` : ""}
            ${isLast || a === 0 ? `<button class="btn btn-xl btn-fun btn-3d" data-a="finish">🏆 Tổng kết & trao giải</button>` : `<button class="btn btn-lg btn-white" data-a="finish">🏁 Kết thúc sớm</button>`}
          </div></div>`;
        const nx = $("[data-a=next]", main); if (nx) nx.onclick = () => showQuestion(false);
        const rs = $("[data-a=rescue]", main); if (rs) rs.onclick = rescueIntro;
        const pl = $("[data-a=plane]", main); if (pl) pl.onclick = airplaneIntro;
        const fn = $("[data-a=finish]", main); if (fn) fn.onclick = () => finishGame(null);
        if (ov.isOpen) ov.refresh();
      }

      function showQuestion(isRescue) {
        if (over) return;
        if (isRescue) {
          const rj = findRescueIdx(Q, cfg, qi + 1, usedRescueIds);
          if (rj > qi + 1) { const t = Q[qi + 1]; Q[qi + 1] = Q[rj]; Q[rj] = t; }
          if (rj >= 0) usedRescueIds.add(Q[qi + 1].id);
        }
        qi++; if (qi >= N) return finishGame(null);
        rescueMode = !!isRescue;
        const it = Q[qi], dur = cfg.qtime, isFinal = qi === N - 1;
        $(".lq-prog", hud).innerHTML = `Câu <b>${qi + 1}</b>/${N}${rescueMode ? " · 🛟 CỨU TRỢ" : ""}${isFinal ? " · 🔔 CÂU CHUÔNG VÀNG" : ""}`;
        main.innerHTML = `<div class="lq-intro ${isFinal ? "rc-final" : ""}"><span class="lq-n">${rescueMode ? "🛟 Câu cứu trợ" : isFinal ? "🔔 CÂU CHUÔNG VÀNG" : "Câu " + (qi + 1)}</span><div class="lq-type">${Quiz.TYPES[it.type]}${rescueMode ? " — các bạn đã chia tay trả lời để quay lại sân!" : " — thí sinh trả lời trên bảng con / giấy"}</div><div class="lq-bar"><i></i></div></div>`;
        U.Sound.go();
        ctx.timers.after(2500, () => {
          if (over) return;
          let body = "";
          if (it.type === "MC") body = `<div class="lq-opts n${it.options.length}">${it.options.map((o, i) => `<div class="lq-opt" style="--oc:${COLORS[i]};--i:${i}" data-k="${o.key}"><span class="lq-sh">${Quiz.SHAPES[i]}</span><span class="lq-tx">${Quiz.rich(o.text)}</span><span class="lq-cnt"></span></div>`).join("")}</div>`;
          else if (it.type === "TF") body = `<div class="lq-tf">${it.options.map((o, i) => `<div class="lq-tfr" style="--i:${i}" data-i="${i}"><b>${o.key})</b><span>${Quiz.rich(o.text)}</span><em class="lq-tfa"></em></div>`).join("")}</div>`;
          else body = `<div class="lq-sa">✍️ Thí sinh viết đáp án lên bảng con — chờ hiệu lệnh giơ bảng!<div class="lq-sa-ans"></div></div>`;
          main.innerHTML = `<div class="lq-q">
            <div class="lq-top"><div class="lq-timer"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="tr" cx="22" cy="22" r="19"/></svg><b>${dur}</b></div>
              <div class="lq-stem">${rescueMode ? `<div class="q-ctx">🛟 CÂU CỨU TRỢ — trả lời đúng để quay lại sân đấu!</div>` : ""}${it.context ? `<div class="q-ctx">${Quiz.rich(it.context)}</div>` : ""}${Quiz.rich(it.stem)}${hintForQi === qi && hint ? `<div class="rc-hint">✈️ Máy bay giấy gợi ý: đáp án <b>${esc(hint)}</b></div>` : ""}</div>
              <div class="lq-ans"><b>${rescueMode ? outL().length : aliveL().length}</b><span>${rescueMode ? "bạn đang cứu trợ" : "thí sinh trên sân"}</span></div></div>
            ${body}
            <div class="lq-act"><button class="btn btn-lg btn-white" data-a="skip">⏭ Hết giờ — công bố đáp án</button></div></div>`;
          Quiz.typeset(main);
          const startAt = Date.now();
          $("[data-a=skip]", main).onclick = () => reveal();
          const tr = $(".tr", main), tb = $(".lq-timer b", main);
          tick = ctx.timers.every(200, () => {
            const left = Math.max(0, dur - (Date.now() - startAt) / 1000);
            tb.textContent = Math.ceil(left); if (tr) tr.style.strokeDashoffset = (1 - left / dur) * 119.4;
            if (left <= 0) reveal();
          });
        });
      }
      let revealed = -1;
      function reveal() {
        if (revealed === qi || over) return; revealed = qi;
        tick && ctx.timers.stop(tick);
        const it = Q[qi];
        const lq = $(".lq-q", main); if (!lq) return;
        lq.classList.add("revealed");
        U.Sound.coin();
        if (it.type === "MC") $$(".lq-opt", main).forEach((el) => el.classList.add(el.dataset.k === it.answer ? "right" : "wrong"));
        else if (it.type === "TF") $$(".lq-tfr", main).forEach((el) => { const i = +el.dataset.i; el.classList.add("show"); $(".lq-tfa", el).innerHTML = `<span class="${it.answer[i] ? "t" : "f"}">${it.answer[i] ? "ĐÚNG" : "SAI"}</span>`; });
        else { const sa = $(".lq-sa-ans", main); if (sa) sa.innerHTML = `<div class="lq-sa-right">Đáp án: <b>${esc(String(it.answer).split("|")[0])}</b></div>`; }
        if (cfg.explain && it.explain) { lq.insertAdjacentHTML("beforeend", `<div class="lq-exp">💡 ${Quiz.rich(it.explain)}</div>`); Quiz.typeset(lq); }
        const act = $(".lq-act", main);
        act.innerHTML = `<button class="btn btn-xl btn-fun btn-3d" data-a="mark">${rescueMode ? "✋ Chọn các bạn trả lời ĐÚNG để cứu" : "✋ Chấm sân — chọn các bạn trả lời SAI"}</button>`;
        $("[data-a=mark]", act).onclick = marking;
      }
      function marking() {
        const targets = rescueMode ? outL() : aliveL();
        const sel = new Set();
        main.innerHTML = `<div class="rc-mark">
          <h2 class="rc-title">${rescueMode ? "🛟 Ai được cứu?" : "✋ Ai phải chia tay?"}</h2>
          <p class="rc-sub">${rescueMode ? "Bấm chọn những bạn đã trả lời <b>ĐÚNG</b> câu cứu trợ — các bạn ấy sẽ quay lại sân." : "Bấm chọn những bạn trả lời <b>SAI</b> (hoặc không giơ đáp án) — bấm lại để bỏ chọn nếu nhầm."}</p>
          <div class="rc-grid big">${targets.map((p) => `<button class="rc-p mark" data-nm="${esc(p.name)}"><span class="rc-av">${p.avatar}</span><span class="rc-nm">${esc(p.name)}</span></button>`).join("") || `<p class="rc-sub">Không có ai trong danh sách này.</p>`}</div>
          <p class="rc-mark-n">Đã chọn: <b>0</b> bạn</p>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="apply" disabled>${rescueMode ? "🛟 Chốt — đưa các bạn trở lại sân" : "✔ Chốt danh sách chia tay"}</button>
          <button class="btn btn-lg btn-white" data-a="none">${rescueMode ? "Không ai đúng cả" : "Cả sân đều đúng 🎉"}</button></div></div>`;
        $$(".rc-p.mark", main).forEach((b) => (b.onclick = () => {
          const nm = b.dataset.nm;
          sel.has(nm) ? sel.delete(nm) : sel.add(nm);
          b.classList.toggle("sel", sel.has(nm));
          $(".rc-mark-n b", main).textContent = sel.size;
          $("[data-a=apply]", main).disabled = !sel.size;
          U.Sound.click();
        }));
        $("[data-a=none]", main).onclick = () => applyMarks(new Set());
        $("[data-a=apply]", main).onclick = () => applyMarks(sel);
      }
      function applyMarks(sel) {
        const changed = [];
        P.forEach((p) => {
          if (rescueMode) { if (p.out && sel.has(p.name)) { p.out = false; changed.push(p); } }
          else if (!p.out) { if (sel.has(p.name)) { p.out = true; changed.push(p); } else p.survived++; }
        });
        rescueMode = false;
        const a = aliveL().length;
        let drama;
        // Thông báo sân khấu
        if (changed.length) {
          drama = changed[0] && changed[0].out
            ? `<div class="rc-drama"><h3>👋 XIN CHIA TAY</h3><div class="rc-names">${changed.map((p, i) => `<span style="--i:${i}">${p.avatar} ${esc(p.name)}</span>`).join("")}</div><p>Cảm ơn các bạn đã thi đấu hết mình!</p></div>`
            : `<div class="rc-drama saved"><h3>🛟 ĐƯỢC CỨU — CHÀO MỪNG TRỞ LẠI SÂN!</h3><div class="rc-names">${changed.map((p, i) => `<span style="--i:${i}">${p.avatar} ${esc(p.name)}</span>`).join("")}</div></div>`;
          changed[0].out ? U.Sound.wrong() : U.Sound.win();
        } else {
          drama = `<div class="rc-drama saved"><h3>🎉 Không ai phải chia tay ở câu này!</h3></div>`;
          U.Sound.correct();
        }
        main.innerHTML = `<div class="rc-field">${drama}<div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="field">🏟️ Về sân đấu (${a} trên sân)</button></div></div>`;
        $("[data-a=field]", main).onclick = () => afterReveal();
      }
      function afterReveal() {
        if (over) return;
        hint = null; hintForQi = -1;
        const a = aliveL().length, isFinalDone = qi >= N - 1;
        if (isFinalDone) {
          if (a === 1) return championCeremony(aliveL()[0]);
          return finishGame(null);
        }
        if (a === 0 && !canRescue()) return finishGame(null);
        if (a === 1) GK.banner(stage, `🔔 Chỉ còn <b>1 thí sinh</b> trên sân!`, 1800);
        renderField();
      }
      function rescueIntro() {
        if (!canRescue()) return;
        rescuesUsed++;
        main.innerHTML = `<div class="rc-rescue">
          <div class="rc-bell">🛟</div>
          <h2 class="rc-title">PHAO CỨU TRỢ ĐÃ ĐƯỢC NÉM!</h2>
          <p class="rc-sub">${outL().length} bạn đã chia tay sẽ cùng trả lời <b>1 câu cứu trợ</b>.<br>Trả lời <b>đúng</b> = quay lại sân đấu ngay lập tức!</p>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="go">▶ Bắt đầu câu cứu trợ</button>
          <button class="btn btn-lg btn-white" data-a="back">↩ Quay lại sân đấu</button></div></div>`;
        U.Sound.go();
        $("[data-a=go]", main).onclick = () => showQuestion(true);
        $("[data-a=back]", main).onclick = () => { rescuesUsed--; renderField(); };
      }
      function airplaneIntro() {
        const nqi = qi + 1, it = Q[nqi];
        if (!it || it.type !== "MC") return;
        const votes = {};
        main.innerHTML = `<div class="rc-plane">
          <div class="rc-bell">✈️</div>
          <h2 class="rc-title">MÁY BAY GIẤY CỨU TRỢ!</h2>
          <p class="rc-sub">Chỉ còn <b>${esc(aliveL()[0].name)}</b> trên sân. Cả lớp giơ tay bỏ phiếu cho câu ${nqi + 1} — thầy cô <b>bấm vào đáp án theo số tay giơ</b> (mỗi lần bấm = 1 phiếu):</p>
          <div class="lq-stem rc-plane-q">${Quiz.rich(it.stem)}</div>
          <div class="rc-votes">${it.options.map((o, i) => `<button class="rc-vote" data-k="${o.key}"><span class="lq-sh" style="--oc:${COLORS[i]}">${Quiz.SHAPES[i]}</span><b>${esc(o.label || o.key)}. ${Quiz.rich(o.text)}</b><div class="rc-bar"><i style="width:0%"></i></div><span class="rc-pct">0 phiếu</span></button>`).join("")}</div>
          <div class="lq-act"><button class="btn btn-ghost" data-a="reset">↺ Đếm lại từ đầu</button>
          <button class="btn btn-xl btn-fun btn-3d" data-a="pub">📣 Công bố gợi ý & vào câu ${nqi + 1}</button></div></div>`;
        Quiz.typeset(main);
        const draw = () => {
          const tot = Object.values(votes).reduce((s, n) => s + n, 0);
          $$(".rc-vote", main).forEach((el) => { const n = votes[el.dataset.k] || 0; $(".rc-bar i", el).style.width = (tot ? Math.round((n / tot) * 100) : 0) + "%"; $(".rc-pct", el).textContent = n + " phiếu"; });
        };
        $$(".rc-vote", main).forEach((b) => (b.onclick = () => { votes[b.dataset.k] = (votes[b.dataset.k] || 0) + 1; U.Sound.pop(); draw(); }));
        $("[data-a=reset]", main).onclick = () => { Object.keys(votes).forEach((k) => delete votes[k]); draw(); };
        $("[data-a=pub]", main).onclick = () => {
          let best = null, bn = -1;
          it.options.forEach((o) => { const n = votes[o.key] || 0; if (n > bn) { bn = n; best = o; } });
          hint = best ? (best.label || best.key) : null; hintForQi = nqi;
          main.innerHTML = `<div class="rc-plane"><div class="rc-bell">✈️💌</div>
            <h2 class="rc-title">MÁY BAY GIẤY NÓI RẰNG…</h2>
            <p class="rc-sub">Đáp án được cả lớp tin nhất: <b style="font-size:24px">${best ? esc(best.label || best.key) + ". " : ""}</b>${best ? Quiz.rich(best.text) : ""}<br><small>(${bn} phiếu) — chỉ là gợi ý, quyết định cuối cùng là của thí sinh!</small></p>
            <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="go">▶ Vào câu ${nqi + 1}</button></div></div>`;
          Quiz.typeset(main); U.Sound.coin();
          $("[data-a=go]", main).onclick = () => showQuestion(false);
        };
      }
      function championCeremony(p) {
        if (finished) return; finished = true;
        main.innerHTML = `<div class="rc-champ">
          <div class="rc-bell mega">🔔</div>
          <h2 class="rc-champ-t">RUNG CHUÔNG VÀNG!</h2>
          <p class="rc-champ-n">${p.avatar} ${esc(p.name)}</p>
          <p class="rc-sub">Người duy nhất trụ lại và chinh phục câu hỏi cuối cùng — xin chúc mừng nhà vô địch!</p>
          <div class="lq-act"><button class="btn btn-xl btn-fun btn-3d" data-a="podium">🏆 Xem bảng vinh danh</button></div></div>`;
        U.Sound.win(); U.confetti(); setTimeout(() => U.confetti({ burst: true, count: 140 }), 800);
        $("[data-a=podium]", main).onclick = () => finishGame(p);
      }
      function finishGame(champ) {
        if (over) return; over = true; finished = true;
        tick && ctx.timers.stop(tick);
        const R = P.slice().sort((a, b) => {
          if (champ) { if (a === champ) return -1; if (b === champ) return 1; }
          const ao = a.out ? 1 : 0, bo = b.out ? 1 : 0; if (ao !== bo) return ao - bo;
          return b.survived - a.survived;
        });
        ctx.finish({ unit: "câu", sub: `${P.length} thí sinh · ${Math.min(qi + 1, N)} câu hỏi${champ ? " · 🔔 Có nhà vô địch rung chuông vàng!" : " · Chế độ một màn hình"}`, ranking: R.map((p, i) => ({ name: p.name, avatar: p.avatar, color: U.TEAM_COLORS[i % 6], score: p.survived, correct: p.survived, wrong: p.out ? 1 : 0 })) });
      }

      GK.countdown(stage, "Mời các thí sinh lên sàn thi đấu!").then(() => { if (!over) { updChip(); renderField(); } });
      return { destroy() { over = true; ov.close(); }, stop() { over = true; } };
    }
  });
})();

