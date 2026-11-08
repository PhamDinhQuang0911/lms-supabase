/* =========================================================
   home.js — Trang chủ & Bảng vàng
   ========================================================= */
(function () {
  const { $, $$, esc } = U;

  function gameCard(g) {
    return `<a class="game-card" href="#/game/${g.id}" data-reveal style="--c1:${g.colors[0]};--c2:${g.colors[1]}">
      <div class="gc-thumb">${Art.thumb(g.id)}</div>
      <div class="gc-body">
        <div class="gc-title"><span>${g.icon}</span>${esc(g.name)}</div>
        <div class="gc-desc">${esc(g.tagline || "")}</div>
        <div class="gc-tags">${g.tags.map((t, i) => `<span class="chip ${t === "Trực tuyến" || t === "Thời gian thực" ? "green" : i ? "" : "violet"}">${t}</span>`).join("")}</div>
      </div>
      <span class="gc-play">▶</span>
    </a>`;
  }
  function actCard(a) {
    return `<a class="game-card" href="#/hoat-dong/${a.id}" data-reveal style="--c1:${a.colors[0]};--c2:${a.colors[1]}">
      <div class="gc-thumb"><svg viewBox="0 0 320 180"><defs><linearGradient id="ag${a.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.colors[0]}"/><stop offset="1" stop-color="${a.colors[1]}"/></linearGradient></defs><rect width="320" height="180" fill="url(#ag${a.id})"/>
        <text x="160" y="122" font-size="80" text-anchor="middle">${a.icon}</text></svg></div>
      <div class="gc-body">
        <div class="gc-title"><span>${a.icon}</span>${esc(a.name)}</div>
        <div class="gc-desc">${esc(a.tagline || "")}</div>
        <div class="gc-tags"><span class="chip green">Hoạt động</span>${a.noQuiz ? `<span class="chip">Không cần câu hỏi</span>` : ""}</div>
      </div>
      <span class="gc-play">▶</span>
    </a>`;
  }
  function soonCard(s) {
    return `<div class="game-card soon" data-reveal style="--c1:${s.colors[0]};--c2:${s.colors[1]}">
      <div class="gc-thumb"><svg viewBox="0 0 320 180"><rect width="320" height="180" fill="url(#sg${s.id})"/><defs><linearGradient id="sg${s.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.colors[0]}"/><stop offset="1" stop-color="${s.colors[1]}"/></linearGradient></defs>
        <text x="160" y="118" font-size="74" text-anchor="middle">${s.icon}</text></svg><span class="gc-soon">Sắp ra mắt</span></div>
      <div class="gc-body"><div class="gc-title"><span>${s.icon}</span>${esc(s.name)}</div><div class="gc-desc">${esc(s.desc)}</div></div></div>`;
  }

  window.HomePage = (view) => {
    const games = Games.enabled();
    const acts = (window.Activities && Activities.list) || [];
    const st = DB.settings;
    const words = (st.slogan || "Học mà chơi — Chơi mà học!").split(" ");
    view.innerHTML = `<div class="page home">
      ${st.announcement ? `<div class="notice" data-reveal>📣 ${esc(st.announcement)}</div>` : ""}
      ${DB.source === "local-file" ? `<div class="notice" data-reveal>📂 Đang dùng câu hỏi từ file trên máy. <button class="btn btn-sm btn-ghost" id="dropLocal">Quay lại dữ liệu trực tuyến</button></div>` : ""}
      <section class="hero">
        <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="dots"></div>
        <div class="hero-text">
          <span class="hero-badge"><b>MỚI</b> ${games.length} trò chơi${acts.length ? ` · ${acts.length} hoạt động` : ""} · chơi trực tuyến bằng mã PIN</span>
          <h1>${words.map((w, i) => `<span class="word ${/chơi|Chơi|học|Học/.test(w) ? "hl" : ""}" style="--i:${i}">${esc(w)}</span>`).join(" ")}</h1>
          <p class="lead">${esc(st.siteName)} biến bài ôn tập thành những trận thi đấu sôi động: kéo co, đua xe, đua vịt, thuyền rồng, xúc xắc… Câu hỏi trắc nghiệm, đúng/sai, trả lời ngắn — giáo viên soạn một lần, chơi được mọi game.</p>
          <div class="hero-cta">
            <a class="btn btn-xl btn-white btn-3d" href="#games" id="toGames">🎮 Chọn trò chơi</a>
            <a class="btn btn-xl btn-glass" href="#/join">🔢 Vào phòng bằng PIN</a>
          </div>
          <div class="hero-stats">
            <div><b data-count="${games.length + acts.length}">0</b><span>Trò chơi & hoạt động</span></div>
            <div><b data-count="${Quiz.countPlayable(DB.bank())}">0</b><span>Câu hỏi sẵn sàng</span></div>
            <div><b>3</b><span>Dạng câu hỏi</span></div>
          </div>
        </div>
        <div class="hero-visual">
          ${Art.hero()}
          <div class="float-chip fc1"><i style="background:#eff6ff;color:#2563eb">✅</i>Chính xác! +1</div>
          <div class="float-chip fc2"><i style="background:#eff6ff;color:#2563eb">🔥</i>Chuỗi đúng ×5</div>
          <div class="float-chip fc3"><i style="background:#eff6ff;color:#2563eb">🏆</i>Đội Xanh dẫn đầu</div>
        </div>
      </section>

      <section class="sec" id="games">
        <div class="sec-h"><div class="grow"><span class="eyebrow">Kho trò chơi</span><h2>Hôm nay lớp mình chơi gì? 🎯</h2><p>Mỗi trò đều dùng chung ngân hàng câu hỏi do giáo viên cài đặt.</p></div>
          <div class="seg" id="gFilter"><button class="on" data-f="all">Tất cả</button><button data-f="act">Hoạt động</button><button data-f="team">Thi đấu đội</button><button data-f="online">Trực tuyến</button><button data-f="turn">Theo lượt</button></div></div>
        <div class="games-grid" id="gGrid">${games.map(gameCard).join("")}${acts.map(actCard).join("")}${Games.soon.map(soonCard).join("")}</div>
      </section>

      ${DB.allPresets().length ? `<section class="sec">
        <div class="sec-h"><div class="grow"><span class="eyebrow">Chơi nhanh</span><h2>⚡ Cấu hình soạn sẵn</h2><p>Giáo viên đã chuẩn bị sẵn — bấm là vào trận!</p></div>${FB.isAdmin ? `<a class="btn btn-ghost" href="#/admin/presets">Quản lý</a>` : ""}</div>
        <div class="quick-grid">${DB.allPresets().filter((p) => Games.get(p.gameId)).slice(0, 12).map((p) => { const g = Games.get(p.gameId); return `<a class="quick-card" data-reveal href="#/game/${g.id}?preset=${encodeURIComponent(p.id)}" style="--c1:#1d4ed8;--c2:#2563eb">
          <span class="qc-ic">${g.icon}</span><span class="qc-tx"><b>${esc(p.name)}</b><small>${esc(g.name)}${p.note ? " · " + esc(p.note) : ""}</small></span><span class="qc-go">▶</span></a>`; }).join("")}</div>
      </section>` : ""}

      <section class="sec">
        <div class="sec-h"><div><span class="eyebrow">Cách chơi</span><h2>3 bước là vào trận!</h2></div></div>
        <div class="steps3">
          <div class="step" data-reveal><span class="num">1</span><div class="s-ic">📚</div><h3>Chọn bộ câu hỏi</h3><p>Giáo viên chọn câu hỏi từ Ngân hàng QMath hoặc tải trực tiếp từ file Word (.docx) có công thức Toán & hình ảnh.</p></div>
          <div class="step" data-reveal><span class="num">2</span><div class="s-ic">🎮</div><h3>Chọn trò chơi & chế độ</h3><p>Chiếu một màn hình cho cả lớp thi đấu theo đội, hoặc tạo phòng trực tuyến với mã PIN.</p></div>
          <div class="step" data-reveal><span class="num">3</span><div class="s-ic">🏆</div><h3>Thi đấu & vinh danh</h3><p>Trả lời đúng để tiến lên, xem lời giải ngay, điểm số được lưu vào bảng vàng.</p></div>
        </div>
      </section>

      <section class="sec home-bottom">
        <div class="card" data-reveal><div class="card-h"><h3>🏆 Bảng vàng gần đây</h3><span class="grow"></span><a class="btn btn-sm btn-ghost" href="#/bang-vang">Xem tất cả</a></div><div id="hLb"><div class="muted">Đang tải…</div></div></div>
        <div class="card" data-reveal><div class="card-h"><h3>📚 Đưa câu hỏi lên Game (Ngân hàng QMath & Word .docx)</h3></div>
          <p class="muted" style="font-size:14px;margin:0 0 8px">Giáo viên có thể đưa câu hỏi vào trò chơi theo <b>2 cách cực nhanh</b>:</p>
          <div style="display:flex;flex-direction:column">
            <div style="display:flex;gap:13px;padding:14px 0;border-bottom:1px dashed var(--line)">
              <span style="flex:0 0 32px;height:32px;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-weight:800;display:grid;place-items:center;font-size:16px">📚</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;margin-bottom:3px">Cách 1: Chọn từng bước từ Ngân hàng câu hỏi QMath</div>
                <p class="muted" style="font-size:13.5px;margin:0 0 9px;line-height:1.55">Chọn lần lượt <b>Lớp ➔ Phân môn ➔ Chương / Bài học ➔ Dạng bài</b>, bấm chọn câu hỏi và xem trước trực quan ngay bên cạnh.</p>
                <button class="btn btn-sm btn-primary" id="homeOpenBankPicker">📚 Chọn câu hỏi từ Ngân hàng QMath</button>
              </div>
            </div>
            <div style="display:flex;gap:13px;padding:14px 0;border-bottom:1px dashed var(--line)">
              <span style="flex:0 0 32px;height:32px;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-weight:800;display:grid;place-items:center;font-size:16px">📄</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;margin-bottom:3px">Cách 2: Tải trực tiếp file Word (.docx) từ máy tính</div>
                <p class="muted" style="font-size:13.5px;margin:0 0 9px;line-height:1.55">Nhận diện tự động công thức <b>MathType / LaTeX</b>, hình ảnh <b>EMF/WMF/PNG</b>, bảng biểu và gạch chân đáp án đúng giống hệt trình Tạo đề Word QMath.</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="btn btn-sm btn-primary" id="openLocal">📄 Tải file Word (.docx) / Excel / JSON</button>
                  <button class="btn btn-sm btn-ghost" id="homeWordGuide">📘 Hướng dẫn chuẩn bị file Word & Tải mẫu</button>
                </div>
              </div>
            </div>
          </div></div>
      </section>
      <footer class="foot">© ${new Date().getFullYear()} ${esc(st.siteName)} · QMath LMS</footer>
    </div>`;
    U.reveal(view);
    $$("[data-count]", view).forEach((b) => U.countUp(b, +b.dataset.count, 1400));
    $("#toGames", view).onclick = (e) => { e.preventDefault(); $("#games", view).scrollIntoView({ behavior: "smooth" }); };
    $$("#gFilter button", view).forEach((b) => (b.onclick = () => {
      $$("#gFilter button", view).forEach((x) => x.classList.toggle("on", x === b));
      const f = b.dataset.f;
      if (f === "act") { $("#gGrid", view).innerHTML = acts.map(actCard).join("") || `<div class="empty" style="grid-column:1/-1"><span class="em-ic">🎈</span>Chưa có hoạt động nào.</div>`; U.reveal(view); return; }
      const list = games.filter((g) => f === "all" || (f === "online" && g.modes.includes("online")) || (f === "team" && g.fields.some((x) => x.type === "teams") && !g.tags.includes("Theo lượt")) || (f === "turn" && g.tags.includes("Theo lượt")));
      $("#gGrid", view).innerHTML = list.map(gameCard).join("") + (f === "all" ? acts.map(actCard).join("") + Games.soon.map(soonCard).join("") : "");
      U.reveal(view);
    }));
    /* [Bổ sung] Lưu bộ câu hỏi vừa mở lên Firestore (collection "questions") để tạo ngân hàng dùng chung.
       Chạy ngầm sau khi đã nạp file như cũ; mọi lỗi đều được bỏ qua nên không ảnh hưởng chức năng hiện có.
       Nếu có câu trùng ID thì hỏi người dùng: Ghi đè / Bỏ qua / Thêm mới (cấp ID mới tự động). */
    const cloudDocId = (id) => String(id || U.uid()).replace(/[\/\s#\[\]\.]+/g, "_").slice(0, 120);
    const freshId = (used) => {
      const d = new Date(), p = (n, l) => String(n).padStart(l || 2, "0");
      const stamp = p(d.getDate()) + p(d.getMonth() + 1) + d.getFullYear() + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
      let id; do { id = "Q" + stamp + Math.random().toString(36).slice(2, 6).toUpperCase(); } while (used && used.has(cloudDocId(id)));
      return id;
    };
    const commitQuestions = async (pairs) => { // pairs: [[docId, data]]
      for (let i = 0; i < pairs.length; i += 400) {
        const b = FB.fs.batch();
        pairs.slice(i, i + 400).forEach(([id, q]) => b.set(FB.fs.collection("questions").doc(id), q));
        await b.commit();
      }
    };
    const saveFileToCloud = async (list) => {
      try {
        if (!window.FB || !FB.available || !FB.fs || navigator.onLine === false) return;

        // Lấy danh sách ID đang có trên cơ sở dữ liệu để phát hiện trùng.
        const existing = new Set();
        try { const snap = await FB.fs.collection("questions").get(); snap.forEach((d) => existing.add(d.id)); }
        catch (e) { console.warn("Không đọc được ngân hàng câu hỏi:", e && e.message); }

        const prep = list.map((raw) => {
          const q = U.plain(raw); delete q._doc; delete q._sel;
          if (!q.Id) q.Id = freshId(existing);
          return q;
        });
        const dups = prep.filter((q) => existing.has(cloudDocId(q.Id)));

        let mode = "overwrite";
        if (dups.length) {
          mode = await U.modal({
            title: "⚠️ Có câu hỏi trùng ID",
            body: `<p>File có <b>${prep.length}</b> câu hỏi, trong đó <b>${dups.length}</b> câu trùng ID với ngân hàng dùng chung.</p>
              <p class="muted" style="margin:6px 0 0">Bạn muốn xử lý các câu trùng thế nào?</p>
              <ul style="margin:8px 0 0;padding-left:18px;line-height:1.7">
                <li><b>Thêm mới</b>: giữ cả câu cũ lẫn câu mới, câu trong file được cấp ID mới tự động (theo ngày giờ + số ngẫu nhiên).</li>
                <li><b>Ghi đè</b>: thay câu cũ bằng câu trong file.</li>
                <li><b>Bỏ qua câu trùng</b>: giữ nguyên câu cũ, không lưu câu trùng.</li>
              </ul>`,
            actions: [
              { label: "Thêm mới", cls: "btn-primary", value: "new" },
              { label: "Ghi đè", cls: "", value: "overwrite" },
              { label: "Bỏ qua câu trùng", cls: "btn-ghost", value: "skip" }
            ]
          }).result;
          if (!mode) { U.toast("Đã huỷ lưu lên cơ sở dữ liệu dùng chung (file vẫn dùng được trên máy).", "info", 4000); return; }
        }

        let added = 0, overwritten = 0, skipped = 0;
        const pairs = [];
        prep.forEach((q) => {
          const id0 = cloudDocId(q.Id);
          const isDup = existing.has(id0);
          if (isDup && mode === "skip") { skipped++; return; }
          if (isDup && mode === "new") {
            q.Id = freshId(existing); added++;
          } else if (isDup) { overwritten++; } else { added++; }
          const id = cloudDocId(q.Id);
          existing.add(id);
          q.updatedAt = Date.now();
          pairs.push([id, q]);
        });

        if (!pairs.length) { U.toast("Không có câu hỏi nào được lưu lên cơ sở dữ liệu.", "info", 4000); return; }
        await commitQuestions(pairs);
        const parts = [];
        if (added) parts.push(`thêm mới ${added}`);
        if (overwritten) parts.push(`ghi đè ${overwritten}`);
        if (skipped) parts.push(`bỏ qua ${skipped}`);
        U.toast(`☁️ Đã lưu lên ngân hàng dùng chung: ${parts.join(", ")}.`, "ok", 5000);
      } catch (e) {
        console.warn("Không lưu được câu hỏi lên Firestore:", e && e.message);
        U.toast("Chưa lưu được lên cơ sở dữ liệu: " + ((window.FB && FB.errMsg) ? FB.errMsg(e) : (e && e.message)), "warn", 5000);
      }
    };
    const bpBtn = $("#homeOpenBankPicker", view);
    if (bpBtn) bpBtn.onclick = () => window.QMathBridge && QMathBridge.openBankPickerModal({ onConfirm: () => App.render() });
    const wgBtn = $("#homeWordGuide", view);
    if (wgBtn) wgBtn.onclick = () => window.QMathBridge && QMathBridge.openWordGuideModal(() => $("#openLocal", view).click());
    $("#openLocal", view).onclick = async () => {
      const f = await U.pickFile(".docx,.json,.js,.xlsx,.xls,.csv"); if (!f) return;
      try { const list = await IO.parseFile(f); if (!list.length) throw new Error("File không có câu hỏi"); await DB.useLocalFile(list); U.toast(`Đã nạp ${list.length} câu hỏi từ file ${f.name}`, "ok"); App.render(); saveFileToCloud(list); }
      catch (e) { U.toast("Không đọc được file: " + e.message, "err", 4000); }
    };
    const dl = $("#dropLocal", view); if (dl) dl.onclick = async () => { await DB.clearLocalFile(); App.render(); };
    DB.listResults(40).then((rs) => {
      const box = $("#hLb", view); if (!box) return;
      const agg = aggregate(rs).slice(0, 5);
      box.innerHTML = agg.length ? `<div class="lb-list">${agg.map((p) => `<div class="lb-row"><span class="lb-rank"></span><span class="lb-name">${esc(p.name)} <small class="muted">· ${p.wins} lần thắng</small></span><span class="lb-score">${U.fmtNum(p.score)}</span></div>`).join("")}</div>`.replace(/<span class="lb-rank"><\/span>/g, () => "") : `<div class="empty" style="padding:20px"><span class="em-ic">🏁</span>Chưa có trận đấu nào — hãy chơi trận đầu tiên!</div>`;
      $$(".lb-row", box).forEach((r, i) => r.insertAdjacentHTML("afterbegin", `<span class="lb-rank">${i + 1}</span>`));
    });
  };

  function aggregate(rs, gameId) {
    const m = {};
    rs.filter((r) => !gameId || r.gameId === gameId).forEach((r) => (r.players || []).forEach((p) => {
      const k = U.norm(p.name); if (!k) return;
      const o = m[k] || (m[k] = { name: p.name, score: 0, wins: 0, matches: 0, correct: 0 });
      o.score += +p.score || 0; o.matches++; o.correct += +p.correct || 0; if (p.rank === 1) o.wins++;
    }));
    return Object.values(m).sort((a, b) => b.wins - a.wins || b.score - a.score);
  }

  window.LeaderboardPage = (view) => {
    view.innerHTML = `<div class="page">
      <div class="page-h"><div class="ph-ic" style="--g:linear-gradient(135deg,#ffe066,#f59f00)">🏆</div><div><h1>Bảng vàng</h1><p>Vinh danh những người chơi & đội xuất sắc</p></div></div>
      <div class="row" style="margin-bottom:14px"><select class="select" id="lbGame" style="max-width:280px"><option value="">🎮 Tất cả trò chơi</option>${Games.list.map((g) => `<option value="${g.id}">${g.icon} ${esc(g.name)}</option>`).join("")}</select></div>
      <div class="lb-grid"><div class="card"><div class="card-h"><h3>👑 Xếp hạng tổng</h3></div><div id="lbTop"><div class="loader" style="min-height:120px"><div class="dots3"><i></i><i></i><i></i></div></div></div></div>
      <div class="card"><div class="card-h"><h3>🕑 Trận đấu gần đây</h3></div><div id="lbRecent"></div></div></div></div>`;
    let rs = [];
    const draw = () => {
      const gid = $("#lbGame", view).value;
      const agg = aggregate(rs, gid).slice(0, 30);
      $("#lbTop", view).innerHTML = agg.length ? `<div class="lb-list stg">${agg.map((p, i) => `<div class="lb-row" style="--i:${i}"><span class="lb-rank">${i + 1}</span><span class="lb-name">${esc(p.name)}<br><small class="muted">${p.matches} trận · ${p.wins} thắng · ${p.correct} câu đúng</small></span><span class="lb-score">${U.fmtNum(Math.round(p.score))}</span></div>`).join("")}</div>` : `<div class="empty"><span class="em-ic">🏁</span>Chưa có dữ liệu</div>`;
      const rec = rs.filter((r) => !gid || r.gameId === gid).slice(0, 30);
      $("#lbRecent", view).innerHTML = rec.length ? `<div class="lb-list">${rec.map((r) => { const g = Games.get(r.gameId); return `<div class="lb-row"><span class="lb-rank">${g ? g.icon : "🎮"}</span><span class="lb-name">${esc(r.gameName || "")} — <b>${esc(r.winner || "Hòa")}</b><br><small class="muted">${U.fmtDate(r.at || r.createdAt)} · ${(r.players || []).length} người/đội · ${r.mode === "online" ? "📱 trực tuyến" : "🖥️ một màn hình"}</small></span></div>`; }).join("")}</div>` : `<div class="empty">Chưa có trận đấu</div>`;
    };
    $("#lbGame", view).onchange = draw;
    DB.listResults(500).then((r) => { rs = r; draw(); });
  };
  window.aggregateResults = aggregate;
})();
