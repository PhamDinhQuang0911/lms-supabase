/* =========================================================
   admin.js — Khu vực QUẢN TRỊ (chỉ admin)
   Tổng quan · Ngân hàng câu hỏi · Bộ đề & phân bổ · Điểm số
   Phòng trực tuyến · Người dùng · Cài đặt
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const A = {};
  window.Admin = A;
  const LEVELS = Quiz.LEVELS;
  const TYPES = [["MC", "MC · Trắc nghiệm"], ["TF", "TF · Đúng/Sai"], ["SA", "SA · Trả lời ngắn"], ["LA", "LA · Tự luận"], ["Group", "Group · Nhóm câu"]];

  function header(ic, title, sub, grad) {
    return `<div class="page-h"><div class="ph-ic" style="--g:${grad || "linear-gradient(135deg,#6c4cf5,#ff5c9d)"}">${ic}</div><div class="grow"><h1>${title}</h1><p>${sub || ""}</p></div><span class="chip ${DB.source === "cloud" ? "green" : "amber"}">${DB.sourceLabel()}</span></div>`;
  }
  const busy = (btn, on, txt) => { if (!btn) return; if (on) { btn._t = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${txt || "Đang xử lý…"}`; } else { btn.disabled = false; btn.innerHTML = btn._t; } };
  const fail = (e) => U.toast(FB.errMsg(e), "err", 5000);

  /* ======================= TỔNG QUAN ======================= */
  A.dashboard = (view) => {
    const qs = DB.questions, by = { MC: 0, TF: 0, SA: 0, LA: 0, Group: 0 };
    qs.forEach((q) => by[Quiz.baseType(q.Type)] = (by[Quiz.baseType(q.Type)] || 0) + 1);
    const f = DB.facets(qs);
    view.innerHTML = `<div class="page">${header("📊", "Tổng quan quản trị", "Xin chào " + esc(FB.name()) + " 👋 — mọi cài đặt cho web game nằm ở đây.")}
      <div class="stat-tiles stg">
        <div class="stat-tile" style="--i:0"><i>📚</i><b>${qs.length}</b><span>Câu hỏi trong ngân hàng</span></div>
        <div class="stat-tile" style="--i:1"><i>✅</i><b>${Quiz.countPlayable(qs)}</b><span>Câu chơi được (MC/TF/SA)</span></div>
        <div class="stat-tile" style="--i:2"><i>🧩</i><b>${DB.sets.length}</b><span>Bộ đề</span></div>
        <div class="stat-tile" style="--i:3"><i>📖</i><b>${f.Subject.length}</b><span>Môn học</span></div>
        <div class="stat-tile" style="--i:4"><i>🎮</i><b>${Games.enabled().length}/${Games.list.length}</b><span>Trò chơi đang bật</span></div>
        <div class="stat-tile" style="--i:5"><i>🏅</i><b id="dRes">…</b><span>Trận đấu đã lưu</span></div>
      </div>
      ${!qs.length ? `<div class="notice">🌱 Ngân hàng câu hỏi trên Firestore đang trống — web đang dùng câu hỏi mẫu. <button class="btn btn-sm btn-primary" id="seed">Nạp ${DEMO_QUESTIONS.length} câu mẫu vào Firestore</button><a class="btn btn-sm btn-ghost" href="#/admin/questions">Nhập từ file</a></div>` : ""}
      <div class="grid2">
        <div class="card" data-reveal><div class="card-h"><h3>📦 Phân loại câu hỏi</h3></div>
          <div class="type-bars">${Object.entries(by).map(([k, v]) => `<div class="tb"><span>${k}</span><div><i style="width:${qs.length ? (v / qs.length) * 100 : 0}%"></i></div><b>${v}</b></div>`).join("")}</div></div>
        <div class="card" data-reveal><div class="card-h"><h3>⚡ Thao tác nhanh</h3></div><div class="quick">
          <a class="btn btn-primary" href="#/admin/questions">📥 Nhập câu hỏi (JSON / Excel)</a>
          <a class="btn btn-ghost" href="#/admin/sets">🧩 Tạo bộ đề & phân bổ game</a>
          <a class="btn btn-ghost" href="#/admin/presets">💾 Cấu hình soạn sẵn cho các game</a>
          <button class="btn btn-ghost" id="offl">💾 Tải bản offline (questions-offline.js)</button>
          <a class="btn btn-ghost" href="#/admin/scores">🏅 Xem điểm số</a>
          <a class="btn btn-ghost" href="#/admin/settings">⚙️ Cài đặt web</a></div></div>
      </div></div>`;
    U.reveal(view);
    DB.listResults(500).then((r) => { const e = $("#dRes", view); if (e) e.textContent = r.length; });
    const sd = $("#seed", view); if (sd) sd.onclick = async () => { busy(sd, true); try { const r = await DB.importQuestions(DEMO_QUESTIONS, { overwrite: true }); U.toast(`Đã nạp ${r.added + r.updated} câu`, "ok"); App.render(); } catch (e) { busy(sd, false); fail(e); } };
    $("#offl", view).onclick = () => { U.download("questions-offline.js", DB.exportOfflineJS(), "text/javascript"); U.toast("Đặt file vào thư mục data/ cạnh index.html", "info", 4000); };
  };

  /* ======================= NGÂN HÀNG CÂU HỎI ======================= */
  A.questions = (view) => {
    const st = { flt: U.store.get("admFlt", {}), page: 0, per: 30, sel: new Set() };
    view.innerHTML = `<div class="page">${header("📚", "Ngân hàng câu hỏi", "Thêm, sửa, nhập/xuất câu hỏi MC · TF · SA (và tự luận, nhóm câu).", "linear-gradient(135deg,#818cf8,#22d3ee)")}
      <div class="adm-tools">
        <button class="btn btn-primary" id="qAdd">➕ Thêm câu hỏi</button>
        <button class="btn btn-fun" id="qPickBank">🌳 Chọn từ Kho QMath (Cây ID)</button>
        <button class="btn btn-fun" id="qImp">📥 Nhập Word (.docx) / Excel / JSON</button>
        <button class="btn btn-ghost" id="qWordGuide">📘 Hướng dẫn file Word (.docx)</button>
        <button class="btn btn-ghost" id="qExpJ">⬇️ JSON</button>
        <button class="btn btn-ghost" id="qExpX">⬇️ Excel</button>
        <button class="btn btn-ghost" id="qTpl">📄 File Excel mẫu</button>
        <button class="btn btn-ghost" id="qOff">💾 Bản offline</button>
        <span class="grow"></span>
        <input class="input" id="qSearch" placeholder="🔎 Tìm theo nội dung, Id…" style="max-width:280px">
      </div>
      <div class="adm-filters" id="qFlt"></div>
      <div class="adm-tools bulk hide" id="qBulk"><b id="qSelN"></b>
        <button class="btn btn-sm btn-primary" data-b="meta">✏️ Sửa Môn/Lớp/Chương…</button>
        <button class="btn btn-sm btn-ghost" data-b="set">🧩 Thêm vào bộ đề</button>
        <button class="btn btn-sm btn-ghost" data-b="exp">⬇️ Xuất mục đã chọn</button>
        <button class="btn btn-sm btn-danger" data-b="del">🗑 Xoá</button>
        <button class="btn btn-sm btn-ghost" data-b="clr">Bỏ chọn</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="qAll"></th><th>Id</th><th>Loại</th><th style="min-width:300px">Câu hỏi</th><th>Đáp án</th><th>Môn · Lớp</th><th>Chương · Chủ đề</th><th>Mức độ</th><th></th></tr></thead><tbody id="qBody"></tbody></table></div>
      <div class="pager" id="qPager"></div></div>`;

    function drawFilters() {
      const f = DB.facets(DB.questions);
      $("#qFlt", view).innerHTML = [["Type", "Loại", ["MC", "TF", "SA", "LA", "Group"]], ["Subject", "Môn", f.Subject], ["Grade", "Lớp", f.Grade], ["Chapter", "Chương", f.Chapter], ["Topic", "Chủ đề", f.Topic], ["Level", "Mức độ", f.Level]].map(([k, l, arr]) =>
        `<select class="select input-sm" data-f="${k}"><option value="">${l}: tất cả</option>${arr.map((x) => `<option ${st.flt[k] === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`).join("");
      $$("#qFlt select", view).forEach((s) => (s.onchange = () => { st.flt[s.dataset.f] = s.value; U.store.set("admFlt", st.flt); st.page = 0; draw(); }));
    }
    const list = () => DB.filterQ(DB.questions, Object.assign({}, st.flt, { search: $("#qSearch", view).value }));
    function ansText(q) {
      const t = Quiz.baseType(q.Type);
      if (t === "Group") return `${(q.children || []).length} câu con`;
      if (t === "LA") return "—";
      return `<b>${esc(q.CorrectAnswer || "")}</b>`;
    }
    function draw() {
      const L = list(), pages = Math.max(1, Math.ceil(L.length / st.per)); st.page = Math.min(st.page, pages - 1);
      const rows = L.slice(st.page * st.per, (st.page + 1) * st.per);
      $("#qBody", view).innerHTML = rows.length ? rows.map((q) => `<tr data-d="${esc(q._doc)}">
        <td><input type="checkbox" class="qck" ${st.sel.has(q._doc) ? "checked" : ""}></td>
        <td><code>${esc(q.Id)}</code></td><td><span class="q-badge qb-${Quiz.baseType(q.Type)}">${esc(q.Type)}</span></td>
        <td><div class="qrow-stem">${Quiz.rich(String(q.Question || "").slice(0, 400))}</div></td>
        <td>${ansText(q)}</td><td>${esc(q.Subject || "—")}<br><small class="muted">Lớp ${esc(q.Grade || "—")}</small></td>
        <td>${esc(q.Chapter || "—")}<br><small class="muted">${esc(q.Topic || "")}</small></td><td>${q.Level ? `<span class="chip">${esc(q.Level)}</span>` : "—"}</td>
        <td style="white-space:nowrap"><button class="btn btn-sm btn-icon btn-ghost" data-a="view" title="Xem">👁</button><button class="btn btn-sm btn-icon btn-ghost" data-a="edit" title="Sửa">✏️</button><button class="btn btn-sm btn-icon btn-ghost" data-a="dup" title="Nhân bản">⧉</button><button class="btn btn-sm btn-icon btn-ghost" data-a="del" title="Xoá">🗑</button></td></tr>`).join("")
        : `<tr><td colspan="9"><div class="empty"><span class="em-ic">📭</span>${DB.questions.length ? "Không có câu hỏi khớp bộ lọc" : "Ngân hàng trống — hãy nhập file hoặc thêm câu hỏi."}</div></td></tr>`;
      Quiz.typeset($("#qBody", view));
      let pg = `<span class="muted">${L.length} câu · trang</span>`;
      for (let i = 0; i < pages; i++) if (pages <= 12 || Math.abs(i - st.page) < 3 || i === 0 || i === pages - 1) pg += `<button class="btn btn-sm ${i === st.page ? "btn-primary" : "btn-ghost"}" data-p="${i}">${i + 1}</button>`;
      $("#qPager", view).innerHTML = pg;
      $$("[data-p]", view).forEach((b) => (b.onclick = () => { st.page = +b.dataset.p; draw(); $("#main").scrollTo({ top: 0, behavior: "smooth" }); }));
      $$(".qck", view).forEach((c) => (c.onchange = () => { const d = c.closest("tr").dataset.d; c.checked ? st.sel.add(d) : st.sel.delete(d); bulk(); }));
      $("#qAll", view).checked = rows.length && rows.every((q) => st.sel.has(q._doc));
      bulk();
    }
    function bulk() { $("#qBulk", view).classList.toggle("hide", !st.sel.size); $("#qSelN", view).textContent = `Đã chọn ${st.sel.size} câu`; }
    $("#qAll", view).onchange = (e) => { const L = list().slice(st.page * st.per, (st.page + 1) * st.per); L.forEach((q) => e.target.checked ? st.sel.add(q._doc) : st.sel.delete(q._doc)); draw(); };
    $("#qSearch", view).oninput = U.debounce(() => { st.page = 0; draw(); }, 250);
    U.on($("#qBody", view), "click", "[data-a]", async (e, b) => {
      const d = b.closest("tr").dataset.d, q = DB.questions.find((x) => x._doc === d); if (!q) return;
      const a = b.dataset.a;
      if (a === "view") U.modal({ title: `👁 ${esc(q.Id)} · ${esc(q.Type)}`, size: "lg", body: Quiz.preview(q) });
      if (a === "edit") A.editQuestion(q).then((ok) => ok && (drawFilters(), draw()));
      if (a === "dup") { const c = U.plain(q); delete c._doc; c.Id = q.Id + "_copy"; A.editQuestion(c, true).then((ok) => ok && draw()); }
      if (a === "del" && await U.confirm(`Xoá câu <b>${esc(q.Id)}</b>?`, { danger: true, ok: "Xoá" })) { try { await DB.deleteQuestions([d]); st.sel.delete(d); draw(); U.toast("Đã xoá", "ok"); } catch (er) { fail(er); } }
    });
    $("#qAdd", view).onclick = () => A.editQuestion({ Type: "MC", Options: {} }, true).then((ok) => ok && (drawFilters(), draw()));
    $("#qPickBank", view).onclick = () => window.QMathBridge && QMathBridge.openBankPickerModal({ onConfirm: () => { drawFilters(); draw(); } });
    $("#qWordGuide", view).onclick = () => window.QMathBridge && QMathBridge.openWordGuideModal(() => A.importDialog().then((ok) => ok && (drawFilters(), draw())));
    $("#qImp", view).onclick = () => A.importDialog().then((ok) => ok && (drawFilters(), draw()));
    $("#qExpJ", view).onclick = () => U.download("ngan-hang-cau-hoi.json", IO.toJSON(list()), "application/json");
    $("#qExpX", view).onclick = () => IO.toExcel(list()).catch(fail);
    $("#qTpl", view).onclick = () => IO.template().catch(fail);
    $("#qOff", view).onclick = () => { U.download("questions-offline.js", DB.exportOfflineJS(), "text/javascript"); U.toast("Đặt file vào thư mục data/ cạnh index.html để dùng khi không có mạng", "info", 4500); };
    $$("#qBulk [data-b]", view).forEach((b) => (b.onclick = async () => {
      const ids = Array.from(st.sel), a = b.dataset.b;
      if (a === "clr") { st.sel.clear(); return draw(); }
      if (a === "exp") return U.download("cau-hoi-da-chon.json", IO.toJSON(DB.questions.filter((q) => st.sel.has(q._doc))), "application/json");
      if (a === "del") { if (!(await U.confirm(`Xoá <b>${ids.length}</b> câu hỏi đã chọn?`, { danger: true, ok: "Xoá tất cả" }))) return; busy(b, true); try { await DB.deleteQuestions(ids); st.sel.clear(); U.toast("Đã xoá " + ids.length + " câu", "ok"); } catch (e) { fail(e); } busy(b, false); drawFilters(); return draw(); }
      if (a === "meta") {
        const f = DB.facets(DB.questions);
        const m = U.modal({ title: `✏️ Sửa thông tin cho ${ids.length} câu`, size: "md", body: `<p class="muted" style="margin-top:0">Để trống ô nào thì giữ nguyên giá trị cũ của ô đó.</p><div class="grid2">
          ${[["Subject", "Môn"], ["Grade", "Lớp"], ["Chapter", "Chương"], ["Topic", "Chủ đề"]].map(([k, l]) => `<div class="field"><label>${l}</label><input class="input" data-k="${k}" list="dl${k}"><datalist id="dl${k}">${f[k].map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div>`).join("")}
          <div class="field"><label>Mức độ</label><select class="select" data-k="Level"><option value="">(giữ nguyên)</option>${LEVELS.map((l) => `<option>${l}</option>`).join("")}</select></div></div>`,
          actions: [{ label: "Hủy", cls: "btn-ghost" }, { label: "Lưu thay đổi", cls: "btn-primary", onClick: async (btn, w) => { const p = {}; $$("[data-k]", w).forEach((i) => { if (i.value.trim()) p[i.dataset.k] = i.value.trim(); }); busy(btn, true); try { await DB.bulkUpdate(ids, p); U.toast("Đã cập nhật", "ok"); return true; } catch (e) { busy(btn, false); fail(e); return false; } } }] });
        if (await m.result) { drawFilters(); draw(); }
      }
      if (a === "set") {
        if (!DB.sets.length) return U.toast("Chưa có bộ đề — hãy tạo ở mục Bộ đề & phân bổ", "warn");
        const m = U.modal({ title: "🧩 Thêm vào bộ đề", size: "sm", body: `<select class="select" id="toSet">${DB.sets.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>`,
          actions: [{ label: "Hủy", cls: "btn-ghost" }, { label: "Thêm", cls: "btn-primary", onClick: async (btn, w) => {
            const s = DB.findSet($("#toSet", w).value); const qids = new Set(s.questionIds || []);
            DB.questions.filter((q) => st.sel.has(q._doc)).forEach((q) => qids.add(q.Id));
            busy(btn, true); try { await DB.saveSet(Object.assign({}, s, { questionIds: Array.from(qids), filter: null })); U.toast("Đã thêm vào bộ đề " + s.name, "ok"); return true; } catch (e) { busy(btn, false); fail(e); return false; } } }] });
        await m.result;
      }
    }));
    drawFilters(); draw();
  };

  /* ----- Form câu hỏi (dùng đệ quy cho câu con của nhóm) ----- */
  function qForm(q, child) {
    q = U.plain(q || {}); q.Options = q.Options || {};
    const f = DB.facets(DB.questions);
    const el = h(`<div class="qform">
      <div class="grid2">
        <div class="field"><label>Id</label><input class="input" data-k="Id" value="${esc(q.Id || "")}" placeholder="Tự tạo nếu để trống"></div>
        <div class="field"><label>Loại câu hỏi</label><select class="select" data-k="Type">${(child ? TYPES.filter((t) => t[0] !== "Group") : TYPES).map(([k, l]) => `<option value="${k}" ${Quiz.baseType(q.Type || "MC") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        ${child ? "" : `<div class="field"><label>Mức độ</label><select class="select" data-k="Level"><option value=""></option>${LEVELS.map((l) => `<option ${q.Level === l ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label>Lớp</label><input class="input" data-k="Grade" list="fG" value="${esc(q.Grade || "")}"></div>
        <div class="field"><label>Môn</label><input class="input" data-k="Subject" list="fS" value="${esc(q.Subject || "")}"></div>
        <div class="field"><label>Chương</label><input class="input" data-k="Chapter" list="fC" value="${esc(q.Chapter || "")}"></div>
        <div class="field"><label>Chủ đề</label><input class="input" data-k="Topic" list="fT" value="${esc(q.Topic || "")}"></div>
        <datalist id="fG">${f.Grade.map((x) => `<option value="${esc(x)}">`).join("")}</datalist><datalist id="fS">${f.Subject.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
        <datalist id="fC">${f.Chapter.map((x) => `<option value="${esc(x)}">`).join("")}</datalist><datalist id="fT">${f.Topic.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`}
      </div>
      <div class="field" style="margin-top:12px"><label>Nội dung câu hỏi <small style="text-transform:none;font-weight:600">— công thức viết trong $...$, dán link ảnh trên dòng riêng</small></label><textarea class="textarea" data-k="Question" rows="3">${esc(q.Question || "")}</textarea></div>
      <div class="live-prev" data-prev></div>
      <div class="qf-type" style="margin-top:12px"></div>
      <div class="field" style="margin-top:12px"><label>Lời giải / giải thích</label><textarea class="textarea" data-k="Explain" rows="2">${esc(q.Explain || "")}</textarea></div>
    </div>`);
    const typeBox = $(".qf-type", el), typeSel = $("[data-k=Type]", el);
    let children = (q.children || []).map((c) => qForm(c, true));
    const prev = U.debounce(() => { const p = $("[data-prev]", el); p.innerHTML = Quiz.rich($("[data-k=Question]", el).value) || '<span class="muted">Xem trước…</span>'; Quiz.typeset(p); }, 300);
    $("[data-k=Question]", el).oninput = prev; prev();
    function renderType() {
      const t = typeSel.value;
      if (t === "MC") {
        const ans = String(q.CorrectAnswer || "").toUpperCase().charAt(0);
        typeBox.innerHTML = `<span class="lbl">Phương án — bấm chữ cái để chọn đáp án đúng</span>` + ["A", "B", "C", "D"].map((k) => `<div class="opt-row"><button type="button" class="ok-pick ${ans === k ? "on" : ""}" data-ok="${k}">${k}</button><input class="input" data-o="${k}" value="${esc(q.Options[k] || "")}"><span></span></div>`).join("");
        $$(".ok-pick", typeBox).forEach((b) => (b.onclick = () => { $$(".ok-pick", typeBox).forEach((x) => x.classList.toggle("on", x === b)); }));
      } else if (t === "TF") {
        const raw = String(q.CorrectAnswer || "").toUpperCase();
        typeBox.innerHTML = `<span class="lbl">4 ý — chọn Đ (đúng) / S (sai) cho từng ý</span>` + ["a", "b", "c", "d"].map((k, i) => { const v = raw[i]; const isT = "ĐDT1".includes(v || "-"); return `<div class="opt-row"><b style="text-align:center">${k})</b><input class="input" data-o="${k}" value="${esc(q.Options[k] || q.Options[k.toUpperCase()] || "")}"><span class="tf-pick" data-tf="${i}"><button type="button" class="t ${v && isT ? "on" : ""}">Đ</button><button type="button" class="f ${v && !isT ? "on" : ""}">S</button></span></div>`; }).join("");
        $$(".tf-pick", typeBox).forEach((p) => $$("button", p).forEach((b) => (b.onclick = () => $$("button", p).forEach((x) => x.classList.toggle("on", x === b)))));
      } else if (t === "SA") {
        typeBox.innerHTML = `<div class="field"><label>Đáp án đúng <small style="text-transform:none">— nhiều đáp án được chấp nhận ngăn bằng dấu | (VD: 0,5|1/2)</small></label><input class="input" data-sa value="${esc(q.CorrectAnswer || "")}"></div>`;
      } else if (t === "LA") typeBox.innerHTML = `<p class="muted">Câu tự luận chỉ lưu trong ngân hàng, không dùng trong game.</p>`;
      else if (t === "Group") {
        typeBox.innerHTML = `<span class="lbl">Câu hỏi con</span><div class="kids"></div><button type="button" class="btn btn-ghost btn-sm" data-addkid>➕ Thêm câu con</button>`;
        const kids = $(".kids", typeBox);
        const drawKids = () => { kids.innerHTML = ""; children.forEach((c, i) => { const box = h(`<div class="child-box"><div class="row" style="margin-bottom:8px"><b>Câu con ${i + 1}</b><span class="grow"></span><button type="button" class="btn btn-sm btn-ghost" data-rm>🗑 Xoá</button></div></div>`); box.appendChild(c.el); $("[data-rm]", box).onclick = () => { children.splice(i, 1); drawKids(); }; kids.appendChild(box); }); };
        drawKids();
        $("[data-addkid]", typeBox).onclick = () => { children.push(qForm({ Type: "GroupMC", Id: ($("[data-k=Id]", el).value || "Q") + "_" + (children.length + 1) }, true)); drawKids(); };
      }
    }
    typeSel.onchange = () => { q.CorrectAnswer = ""; renderType(); };
    renderType();
    return {
      el, read() {
        const o = {}; $$(":scope > .grid2 [data-k], :scope > .field [data-k]", el).forEach((i) => { if (i.value.trim() !== "") o[i.dataset.k] = i.value; });
        const t = typeSel.value; o.Type = child && t !== "Group" ? "Group" + t : t;
        if (t === "MC") { o.Options = {}; $$("[data-o]", typeBox).forEach((i) => { if (i.value.trim()) o.Options[i.dataset.o] = i.value; }); const ok = $(".ok-pick.on", typeBox); o.CorrectAnswer = ok ? ok.dataset.ok : ""; }
        if (t === "TF") { o.Options = {}; $$("[data-o]", typeBox).forEach((i) => { if (i.value.trim()) o.Options[i.dataset.o] = i.value; }); o.CorrectAnswer = $$(".tf-pick", typeBox).map((p) => { const b = $("button.on", p); return b ? (b.classList.contains("t") ? "Đ" : "S") : ""; }).join(""); }
        if (t === "SA") o.CorrectAnswer = $("[data-sa]", typeBox).value.trim();
        if (t === "Group") o.children = children.map((c) => c.read());
        return o;
      }
    };
  }

  A.editQuestion = (q, isNew) => {
    const form = qForm(q);
    const m = U.modal({ title: isNew ? "➕ Thêm câu hỏi" : "✏️ Sửa câu hỏi " + esc(q.Id || ""), size: "lg", body: form.el, autofocus: false,
      actions: [{ label: "Hủy", cls: "btn-ghost" }, { label: "💾 Lưu câu hỏi", cls: "btn-primary", onClick: async (btn) => {
        const o = form.read();
        const errs = IO.validate(o).concat(...(o.children || []).map((c, i) => IO.validate(c).map((e) => `câu con ${i + 1}: ${e}`)));
        if (errs.length) { U.toast("Chưa hợp lệ: " + errs.join("; "), "warn", 4500); return false; }
        if (isNew && o.Id && DB.questions.some((x) => x.Id === o.Id) && !(await U.confirm(`Id <b>${esc(o.Id)}</b> đã tồn tại. Ghi đè?`))) return false;
        busy(btn, true);
        try { await DB.saveQuestion(IO.clean(o), isNew ? null : q._doc); U.toast("Đã lưu câu hỏi", "ok"); return true; } catch (e) { busy(btn, false); fail(e); return false; }
      } }] });
    return m.result.then((v) => !!v);
  };

  /* ----- Nhập file ----- */
  A.importDialog = () => {
    const body = h(`<div>
      <div class="drop" id="drop"><div class="d-ic">📥</div><b>Kéo thả file vào đây hoặc bấm để chọn</b><p class="muted" style="margin:6px 0 0">Hỗ trợ <b>file Word (.docx)</b>, <b>Excel (.xlsx / .xls / .csv)</b> và <b>JSON (.json)</b></p></div>
      <div class="qm-word-help-row" style="margin-top:10px">
        <span>📄 <b>Mẹo nhập file Word (.docx):</b> Gạch chân chữ cái đúng (<u>A.</u>, <u>a)</u>) hoặc ghi <code>Chọn A</code> / <code>Đáp án: 50</code> ở lời giải.</span>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="qm-link-btn" id="impWordGuideBtn">📘 Xem hướng dẫn chuẩn bị file Word</button>
          <a href="../mau_de_tron_chuan.docx" download="De_Mau_Game_QMath.docx" class="qm-link-btn">⬇️ Tải file Word mẫu (.docx)</a>
        </div>
      </div>
      <div id="impRes" style="margin-top:14px"></div></div>`);
    let parsed = null;
    const m = U.modal({ title: "📥 Nhập câu hỏi vào ngân hàng (Word .docx / Excel / JSON)", size: "lg", body, actions: [{ label: "Hủy", cls: "btn-ghost" }, { label: "Nhập vào ngân hàng", cls: "btn-primary", onClick: async (btn, w) => {
      if (!parsed || !parsed.length) { U.toast("Chưa chọn file", "warn"); return false; }
      const meta = {}; $$("[data-dm]", w).forEach((i) => { if (i.value.trim()) meta[i.dataset.dm] = i.value.trim(); });
      const list = parsed.map((q) => { const c = U.plain(q); Object.keys(meta).forEach((k) => { if (!c[k]) c[k] = meta[k]; }); return c; });
      busy(btn, true, "Đang nhập…");
      try { const r = await DB.importQuestions(list, { overwrite: $("#impOw", w).checked }); U.toast(`Xong! Thêm mới ${r.added}, cập nhật ${r.updated}, bỏ qua ${r.skipped}`, "ok", 5000); return true; }
      catch (e) { busy(btn, false); fail(e); return false; }
    } }] });
    const drop = $("#drop", body);
    const guideBtn = $("#impWordGuideBtn", body);
    if (guideBtn) guideBtn.onclick = () => window.QMathBridge && QMathBridge.openWordGuideModal();
    const handle = async (file) => {
      if (!file) return;
      $("#impRes", body).innerHTML = `<div class="loader" style="min-height:80px"><div class="dots3"><i></i><i></i><i></i></div></div>`;
      try {
        parsed = await IO.parseFile(file);
        const s = IO.stats(parsed);
        $("#impRes", body).innerHTML = `<div class="card" style="box-shadow:none">
          <div class="row"><b>📄 ${esc(file.name)}</b><span class="chip violet">${s.total} câu</span>${["MC", "TF", "SA", "LA", "Group"].filter((k) => s[k]).map((k) => `<span class="chip">${k}: ${s[k]}</span>`).join("")}${s.children ? `<span class="chip">${s.children} câu con</span>` : ""}</div>
          ${s.errors.length ? `<div class="notice" style="margin-top:10px">⚠️ ${s.errors.length} câu có thể chưa hợp lệ (vẫn được lưu, nhưng không xuất hiện trong game): ${s.errors.slice(0, 6).map((e) => `<code>${esc(e.id || "#" + (e.i + 1))}</code> ${esc(e.msg)}`).join(" · ")}${s.errors.length > 6 ? "…" : ""}</div>` : `<p style="color:var(--green);font-weight:700">✓ Tất cả câu hỏi hợp lệ</p>`}
          <label class="switch" style="margin:8px 0"><input type="checkbox" id="impOw" checked> Ghi đè câu hỏi trùng Id</label>
          <div class="lbl" style="margin-top:8px">Gán thông tin cho các câu đang để trống (tuỳ chọn)</div>
          <div class="grid2" style="margin-top:6px">${[["Subject", "Môn"], ["Grade", "Lớp"], ["Chapter", "Chương"], ["Topic", "Chủ đề"], ["Level", "Mức độ"]].map(([k, l]) => `<input class="input input-sm" data-dm="${k}" placeholder="${l}">`).join("")}</div>
          <div class="lbl" style="margin-top:12px">Xem trước 3 câu đầu</div>${parsed.slice(0, 3).map((q) => `<div class="child-box">${Quiz.preview(q)}</div>`).join("")}</div>`;
        Quiz.typeset($("#impRes", body));
      } catch (e) { parsed = null; $("#impRes", body).innerHTML = `<div class="notice">⛔ Không đọc được file: ${esc(e.message)}</div>`; }
    };
    drop.onclick = async () => handle(await U.pickFile(".docx,.json,.js,.txt,.xlsx,.xls,.csv"));
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files[0]); };
    return m.result.then((v) => !!v);
  };

  /* ======================= BỘ ĐỀ & PHÂN BỔ ======================= */
  A.sets = (view) => {
    const draw = () => {
      view.innerHTML = `<div class="page">${header("🧩", "Bộ đề & phân bổ cho game", "Gom câu hỏi thành bộ đề, rồi chọn bộ đề mặc định cho từng trò chơi.", "linear-gradient(135deg,#f472b6,#fb923c)")}
        <div class="card" data-reveal style="margin-bottom:16px"><div class="card-h"><h3>🎮 Phân bổ câu hỏi cho từng game</h3><span class="muted">Bật/tắt game và chọn bộ đề mặc định (người chơi vẫn có thể đổi khi cấu hình).</span></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Trò chơi</th><th>Hiển thị</th><th>Bộ đề mặc định</th><th>Số câu dùng được</th></tr></thead><tbody>
          ${Games.list.map((g) => { const c = DB.gameCfg(g.id); const n = Quiz.flatten(c.setId ? DB.resolveSet(DB.findSet(c.setId)) : DB.bank(), g.types).length;
            return `<tr data-g="${g.id}"><td><b>${g.icon} ${esc(g.name)}</b><br><small class="muted">${g.types.join(" · ")}</small></td>
            <td><label class="switch"><input type="checkbox" data-en ${c.enabled !== false ? "checked" : ""}></label></td>
            <td><select class="select input-sm" data-set><option value="">📚 Toàn bộ ngân hàng</option>${DB.sets.map((s) => `<option value="${s.id}" ${c.setId === s.id ? "selected" : ""}>🧩 ${esc(s.name)}</option>`).join("")}</select></td>
            <td><span class="chip ${n ? "green" : "red"}">${n} câu</span></td></tr>`; }).join("")}
          </tbody></table></div></div>
        <div class="card-h"><h3>📦 Danh sách bộ đề (${DB.sets.length})</h3><span class="grow"></span><button class="btn btn-primary" id="sAdd">➕ Tạo bộ đề</button></div>
        <div class="sets-grid">${DB.sets.length ? DB.sets.map((s) => { const n = DB.resolveSet(s).length; const games = Games.list.filter((g) => DB.gameCfg(g.id).setId === s.id);
          return `<div class="set-card" data-reveal data-s="${s.id}" style="--sc:${s.color || "#6c4cf5"}"><div class="sc-top"><b>${esc(s.name)}</b><span class="chip violet">${n} câu</span></div>
            <p class="muted">${esc(s.desc || (s.filter ? "Bộ đề động theo bộ lọc" : "Chọn câu thủ công"))}</p>
            <div class="gc-tags">${games.map((g) => `<span class="chip">${g.icon} ${esc(g.name)}</span>`).join("") || '<span class="muted" style="font-size:12px">Chưa gán cho game nào</span>'}</div>
            <div class="row" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-a="edit">✏️ Sửa</button><button class="btn btn-sm btn-ghost" data-a="exp">⬇️ Xuất</button><button class="btn btn-sm btn-ghost" data-a="del">🗑</button></div></div>`; }).join("") : `<div class="empty"><span class="em-ic">🧩</span>Chưa có bộ đề nào</div>`}</div></div>`;
      U.reveal(view);
      $$("tr[data-g]", view).forEach((tr) => {
        const gid = tr.dataset.g;
        $("[data-en]", tr).onchange = (e) => DB.saveGameConfig(gid, { enabled: e.target.checked }).then(() => { U.toast("Đã lưu", "ok"); App.buildDrawer(); }).catch(fail);
        $("[data-set]", tr).onchange = (e) => DB.saveGameConfig(gid, { setId: e.target.value }).then(() => { U.toast("Đã phân bổ bộ đề", "ok"); draw(); }).catch(fail);
      });
      $("#sAdd", view).onclick = () => A.editSet({}).then((ok) => ok && draw());
      $$(".set-card", view).forEach((c) => U.on(c, "click", "[data-a]", async (e, b) => {
        const s = DB.findSet(c.dataset.s);
        if (b.dataset.a === "edit") A.editSet(s).then((ok) => ok && draw());
        if (b.dataset.a === "exp") U.download((s.name || "bo-de") + ".json", IO.toJSON(DB.resolveSet(s)), "application/json");
        if (b.dataset.a === "del" && await U.confirm(`Xoá bộ đề <b>${esc(s.name)}</b>? (câu hỏi vẫn còn trong ngân hàng)`, { danger: true, ok: "Xoá" })) { try { await DB.deleteSet(s.id); draw(); } catch (er) { fail(er); } }
      }));
    };
    draw();
  };

  A.editSet = (set) => {
    set = U.plain(set || {}); const isNew = !set.id;
    const sel = new Set(set.questionIds || []);
    const f = DB.facets(DB.questions);
    const COLORS = ["#6c4cf5", "#ef4444", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6"];
    const body = h(`<div>
      <div class="grid2"><div class="field"><label>Tên bộ đề</label><input class="input" id="sName" value="${esc(set.name || "")}" placeholder="VD: Ôn tập Toán 10 - Chương 1"></div>
        <div class="field"><label>Mô tả</label><input class="input" id="sDesc" value="${esc(set.desc || "")}"></div></div>
      <div class="row" style="margin:10px 0"><span class="lbl">Màu</span>${COLORS.map((c) => `<button type="button" class="cdot ${(set.color || COLORS[0]) === c ? "on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("")}</div>
      <div class="field"><label>Gán cho trò chơi</label><div class="row">${Games.list.map((g) => `<label class="tchip"><input type="checkbox" value="${g.id}" ${set.id && DB.gameCfg(g.id).setId === set.id ? "checked" : ""}><span>${g.icon} ${esc(g.name)}</span></label>`).join("")}</div></div>
      <div class="seg" id="sMode" style="margin:14px 0 10px"><button data-m="pick" class="${set.filter ? "" : "on"}">✋ Chọn câu thủ công</button><button data-m="filter" class="${set.filter ? "on" : ""}">🔎 Bộ đề động theo bộ lọc</button></div>
      <div class="adm-filters" id="sFlt">${[["Subject", "Môn"], ["Grade", "Lớp"], ["Chapter", "Chương"], ["Topic", "Chủ đề"], ["Level", "Mức độ"], ["Type", "Loại"]].map(([k, l]) => `<select class="select input-sm" data-f="${k}"><option value="">${l}: tất cả</option>${(k === "Type" ? ["MC", "TF", "SA", "Group"] : f[k]).map((x) => `<option ${(set.filter || {})[k] === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`).join("")}<input class="input input-sm" id="sSearch" placeholder="🔎 Tìm…"></div>
      <div class="row" id="sPickBar" style="margin-bottom:8px"><b id="sCount"></b><span class="grow"></span><button type="button" class="btn btn-sm btn-ghost" id="sAll">Chọn tất cả đang lọc</button><button type="button" class="btn btn-sm btn-ghost" id="sNone">Bỏ chọn đang lọc</button></div>
      <div class="check-list" id="sList"></div></div>`);
    let mode = set.filter ? "filter" : "pick";
    const flt = () => { const o = {}; $$("#sFlt select", body).forEach((s) => { if (s.value) o[s.dataset.f] = s.value; }); return o; };
    const L = () => DB.filterQ(DB.questions, Object.assign(flt(), { search: $("#sSearch", body).value }));
    function drawList() {
      const list = L();
      $("#sCount", body).textContent = mode === "pick" ? `Đã chọn ${sel.size} câu · đang hiện ${list.length}` : `Bộ đề sẽ gồm ${DB.filterQ(DB.questions, flt()).length} câu khớp bộ lọc (tự cập nhật khi thêm câu mới)`;
      $("#sAll", body).classList.toggle("hide", mode !== "pick"); $("#sNone", body).classList.toggle("hide", mode !== "pick");
      $("#sList", body).innerHTML = list.slice(0, 400).map((q) => `<label><input type="checkbox" value="${esc(q.Id)}" ${mode === "filter" ? "checked disabled" : sel.has(q.Id) ? "checked" : ""}><span><code>${esc(q.Id)}</code> <span class="q-badge qb-${Quiz.baseType(q.Type)}">${esc(q.Type)}</span> ${esc(String(q.Question || "").slice(0, 140))}</span></label>`).join("") + (list.length > 400 ? `<p class="muted" style="padding:8px">… và ${list.length - 400} câu nữa (lọc hẹp hơn để xem)</p>` : "");
      $$("#sList input", body).forEach((c) => (c.onchange = () => { c.checked ? sel.add(c.value) : sel.delete(c.value); drawList(); }));
    }
    $$("#sFlt select", body).forEach((s) => (s.onchange = drawList)); $("#sSearch", body).oninput = U.debounce(drawList, 250);
    $("#sAll", body).onclick = () => { L().forEach((q) => sel.add(q.Id)); drawList(); };
    $("#sNone", body).onclick = () => { L().forEach((q) => sel.delete(q.Id)); drawList(); };
    $$("#sMode button", body).forEach((b) => (b.onclick = () => { mode = b.dataset.m; $$("#sMode button", body).forEach((x) => x.classList.toggle("on", x === b)); drawList(); }));
    $$(".cdot", body).forEach((b) => (b.onclick = () => { $$(".cdot", body).forEach((x) => x.classList.toggle("on", x === b)); }));
    drawList();
    const m = U.modal({ title: isNew ? "➕ Tạo bộ đề" : "✏️ Sửa bộ đề", size: "xl", body, actions: [{ label: "Hủy", cls: "btn-ghost" }, { label: "💾 Lưu bộ đề", cls: "btn-primary", onClick: async (btn) => {
      const name = $("#sName", body).value.trim(); if (!name) { U.toast("Hãy đặt tên bộ đề", "warn"); return false; }
      const data = { id: set.id, name, desc: $("#sDesc", body).value.trim(), color: ($(".cdot.on", body) || {}).dataset ? $(".cdot.on", body).dataset.c : "#6c4cf5", createdAt: set.createdAt,
        questionIds: mode === "pick" ? Array.from(sel) : [], filter: mode === "filter" ? flt() : null };
      busy(btn, true);
      try {
        const id = await DB.saveSet(data);
        const games = $$(".tchip input", body).filter((c) => c.checked).map((c) => c.value);
        for (const g of Games.list) { const cur = DB.gameCfg(g.id).setId; if (games.includes(g.id) && cur !== id) await DB.saveGameConfig(g.id, { setId: id }); if (!games.includes(g.id) && cur === id) await DB.saveGameConfig(g.id, { setId: "" }); }
        U.toast("Đã lưu bộ đề", "ok"); return true;
      } catch (e) { busy(btn, false); fail(e); return false; }
    } }] });
    return m.result.then((v) => !!v);
  };


  /* ======================= CẤU HÌNH SOẠN SẴN ======================= */
  A.presets = (view) => {
    const draw = () => {
      const all = DB.allPresets(), games = Games.list.filter((g) => all.some((p) => p.gameId === g.id));
      view.innerHTML = `<div class="page">${header("💾", "Cấu hình soạn sẵn", "Soạn trước cấu hình cho từng trò chơi (đội, câu hỏi, ảnh, thời gian…), đặt tên và lưu lại — vào game chỉ cần chọn là chơi.", "linear-gradient(135deg,#34d399,#6c4cf5)")}
        <div class="adm-tools">
          <button class="btn btn-primary" id="pNew">➕ Tạo cấu hình mới</button>
          <button class="btn btn-ghost" id="pExp">⬇️ Tải tất cả về máy (JSON)</button>
          <button class="btn btn-ghost" id="pImp">📥 Nhập từ file</button>
          ${DB.localPresets().length ? `<button class="btn btn-fun" id="pPush">☁️ Đưa ${DB.localPresets().length} cấu hình trên máy lên hệ thống</button>` : ""}
          <span class="grow"></span><span class="chip">☁️ ${(DB.presets || []).length} trên hệ thống · 💻 ${DB.localPresets().length} trên máy này</span>
        </div>
        ${all.length ? games.map((g) => `<div class="pre-group" data-reveal><div class="pg-h" style="--c1:${g.colors[0]};--c2:${g.colors[1]}"><span>${g.icon}</span><h3>${esc(g.name)}</h3><span class="chip">${all.filter((p) => p.gameId === g.id).length}</span></div>
          <div class="pre-grid">${all.filter((p) => p.gameId === g.id).map((p) => `<div class="pre-card" data-id="${esc(p.id)}">
            <div class="pc-top"><b>${esc(p.name)}</b><span class="chip ${p.where === "cloud" ? "violet" : "amber"}">${p.where === "cloud" ? "☁️ Hệ thống" : "💻 Máy này"}</span></div>
            ${p.note ? `<p class="pc-note">${esc(p.note)}</p>` : ""}
            <ul class="cfg-sum">${GameKit.describeCfg(g, p.cfg || {}).slice(0, 7).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
            <small class="muted">Cập nhật ${U.fmtDate(p.updatedAt)}${p.by ? " · " + esc(p.by) : ""}</small>
            <div class="row" style="margin-top:8px"><a class="btn btn-sm btn-fun" href="#/game/${g.id}?preset=${encodeURIComponent(p.id)}">▶ Mở & chơi</a>
              <button class="btn btn-sm btn-ghost" data-a="ren">✏️ Đổi tên</button><button class="btn btn-sm btn-ghost" data-a="dup">⧉ Nhân bản</button>
              <button class="btn btn-sm btn-ghost" data-a="dl">⬇️</button><button class="btn btn-sm btn-ghost" data-a="del">🗑</button></div></div>`).join("")}</div></div>`).join("")
        : `<div class="empty"><span class="em-ic">💾</span><h3>Chưa có cấu hình nào</h3><p>Bấm <b>Tạo cấu hình mới</b>, chọn trò chơi, chỉnh các mục rồi bấm <b>💾 Lưu cấu hình</b>.<br>Hoặc ở bất kỳ màn cấu hình trò chơi nào, bấm nút <b>💾 Lưu cấu hình</b>.</p></div>`}
      </div>`;
      U.reveal(view);
      $("#pNew", view).onclick = async () => {
        const m = U.modal({ title: "➕ Tạo cấu hình cho trò chơi nào?", size: "md", body: `<div class="pick-game">${Games.list.map((g) => `<button data-g="${g.id}" style="--c1:${g.colors[0]};--c2:${g.colors[1]}"><span>${g.icon}</span>${esc(g.name)}</button>`).join("")}</div>` });
        $$("[data-g]", m.body).forEach((b) => (b.onclick = () => { m.close(); App.go("/game/" + b.dataset.g + "?new=1"); }));
      };
      $("#pExp", view).onclick = () => U.download("cau-hinh-soan-san.json", JSON.stringify({ type: "gfe-presets", exportedAt: new Date().toISOString(), presets: all.map((p) => { const c = U.plain(p); delete c.where; return c; }) }, null, 1), "application/json");
      $("#pImp", view).onclick = async () => {
        const f = await U.pickFile(".json"); if (!f) return;
        try {
          const d = JSON.parse(await U.readFile(f)); const list = Array.isArray(d) ? d : d.presets || [];
          if (!list.length) throw new Error("File không có cấu hình");
          const where = FB.isAdmin && await U.confirm(`Nhập ${list.length} cấu hình. Lưu <b>lên hệ thống ☁️</b>? (Chọn “Hủy” để chỉ lưu trên máy này)`, { ok: "☁️ Lên hệ thống" }) ? "cloud" : "local";
          for (const p of list) if (p.gameId && p.cfg) await DB.savePreset(Object.assign({}, p, { id: "" }), where);
          U.toast(`Đã nhập ${list.length} cấu hình`, "ok"); draw();
        } catch (e) { fail(e); }
      };
      const push = $("#pPush", view);
      if (push) push.onclick = async () => {
        if (!FB.isAdmin) return U.toast("Cần đăng nhập quản trị", "warn");
        busy(push, true);
        try { for (const p of DB.localPresets()) { await DB.savePreset(Object.assign({}, p, { id: "" }), "cloud"); await DB.deletePreset(Object.assign({ where: "local" }, p)); } U.toast("Đã đưa lên hệ thống", "ok"); draw(); }
        catch (e) { busy(push, false); fail(e); }
      };
      $$(".pre-card", view).forEach((c) => U.on(c, "click", "[data-a]", async (e, b) => {
        const p = DB.findPreset(c.dataset.id); if (!p) return;
        const a = b.dataset.a;
        try {
          if (a === "ren") { const n = await U.prompt("Tên mới", p.name, { title: "✏️ Đổi tên cấu hình" }); if (n && n.trim()) { await DB.savePreset(Object.assign({}, p, { name: n.trim() }), p.where); draw(); } }
          if (a === "dup") { await DB.savePreset(Object.assign({}, p, { id: "", name: p.name + " (bản sao)", createdAt: 0 }), p.where); draw(); }
          if (a === "dl") { const c2 = U.plain(p); delete c2.where; U.download(p.name.replace(/[\\/:*?"<>|]+/g, "_") + ".json", JSON.stringify({ type: "gfe-presets", presets: [c2] }, null, 1), "application/json"); }
          if (a === "del" && await U.confirm(`Xoá cấu hình <b>${esc(p.name)}</b>?`, { danger: true, ok: "Xoá" })) { await DB.deletePreset(p); draw(); }
        } catch (er) { fail(er); }
      }));
    };
    draw();
  };

  /* ======================= ĐIỂM SỐ ======================= */
  A.scores = (view) => {
    view.innerHTML = `<div class="page">${header("🏅", "Quản lý điểm số", "Lịch sử các trận đấu, xếp hạng người chơi, xuất Excel.", "linear-gradient(135deg,#fde047,#f59e0b)")}
      <div class="adm-tools"><select class="select" id="rGame" style="max-width:260px"><option value="">🎮 Tất cả trò chơi</option>${Games.list.map((g) => `<option value="${g.id}">${g.icon} ${esc(g.name)}</option>`).join("")}</select>
        <input class="input" id="rSearch" placeholder="🔎 Tên người chơi / đội…" style="max-width:240px"><span class="grow"></span>
        <button class="btn btn-ghost" id="rExp">⬇️ Xuất Excel</button><button class="btn btn-danger" id="rDel" disabled>🗑 Xoá mục đã chọn</button></div>
      <div class="seg adm-tabs" id="rTab"><button class="on" data-t="matches">🕑 Các trận đấu</button><button data-t="players">👤 Xếp hạng người chơi</button></div>
      <div id="rBox"><div class="loader" style="min-height:200px"><div class="dots3"><i></i><i></i><i></i></div></div></div></div>`;
    let rs = [], tab = "matches"; const sel = new Set();
    const filtered = () => { const g = $("#rGame", view).value, s = U.norm($("#rSearch", view).value); return rs.filter((r) => (!g || r.gameId === g) && (!s || (r.players || []).some((p) => U.norm(p.name).includes(s)))); };
    function draw() {
      const L = filtered();
      if (tab === "players") {
        const agg = aggregateResults(L);
        $("#rBox", view).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Người chơi / đội</th><th>Số trận</th><th>Thắng</th><th>Câu đúng</th><th>Tổng điểm</th></tr></thead><tbody>${agg.map((p, i) => `<tr><td><b>${i + 1}</b></td><td><b>${esc(p.name)}</b></td><td>${p.matches}</td><td>${p.wins}</td><td>${p.correct}</td><td><b>${U.fmtNum(Math.round(p.score))}</b></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">Chưa có dữ liệu</div></td></tr>`}</tbody></table></div>`;
        return;
      }
      $("#rBox", view).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="rAll"></th><th>Thời gian</th><th>Trò chơi</th><th>Chế độ</th><th>Người tổ chức</th><th>Kết quả</th><th></th></tr></thead><tbody>
        ${L.map((r) => `<tr data-id="${r.id}"><td><input type="checkbox" class="rck" ${sel.has(r.id) ? "checked" : ""}></td><td>${U.fmtDate(r.at || r.createdAt)}</td><td>${(Games.get(r.gameId) || {}).icon || ""} ${esc(r.gameName || r.gameId)}</td>
          <td>${r.mode === "online" ? '<span class="chip green">Trực tuyến</span>' : '<span class="chip">Một màn hình</span>'}</td><td>${esc(r.host || "")}</td>
          <td>${(r.players || []).slice(0, 4).map((p) => `${p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : p.rank + "."} ${esc(p.name)} <b>${U.fmtNum(p.score)}</b>`).join(" · ")}${(r.players || []).length > 4 ? " …" : ""}</td>
          <td><button class="btn btn-sm btn-ghost" data-a="view">Chi tiết</button></td></tr>`).join("") || `<tr><td colspan="7"><div class="empty"><span class="em-ic">🏁</span>Chưa có trận đấu nào</div></td></tr>`}</tbody></table></div>`;
      $$(".rck", view).forEach((c) => (c.onchange = () => { const id = c.closest("tr").dataset.id; c.checked ? sel.add(id) : sel.delete(id); $("#rDel", view).disabled = !sel.size; }));
      const all = $("#rAll", view); if (all) all.onchange = () => { L.forEach((r) => all.checked ? sel.add(r.id) : sel.delete(r.id)); draw(); $("#rDel", view).disabled = !sel.size; };
      $$("[data-a=view]", view).forEach((b) => (b.onclick = () => {
        const r = rs.find((x) => x.id === b.closest("tr").dataset.id);
        U.modal({ title: `${(Games.get(r.gameId) || {}).icon || ""} ${esc(r.gameName)} — ${U.fmtDate(r.at || r.createdAt)}`, size: "lg", body: `<p class="muted">Nguồn câu hỏi: ${esc(r.source || "")} · ${r.questions || "?"} câu · Đơn vị: ${esc(r.unit || "điểm")}</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Hạng</th><th>Tên</th><th>Điểm</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>${(r.players || []).map((p) => `<tr><td>${p.rank}</td><td>${esc(p.name)}</td><td><b>${U.fmtNum(p.score)}</b></td><td>${p.correct}</td><td>${p.wrong}</td></tr>`).join("")}</tbody></table></div>` });
      }));
    }
    $$("#rTab button", view).forEach((b) => (b.onclick = () => { tab = b.dataset.t; $$("#rTab button", view).forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    $("#rGame", view).onchange = draw; $("#rSearch", view).oninput = U.debounce(draw, 250);
    $("#rDel", view).onclick = async () => { if (!(await U.confirm(`Xoá ${sel.size} trận đấu đã chọn?`, { danger: true, ok: "Xoá" }))) return; try { await DB.deleteResults(Array.from(sel)); rs = rs.filter((r) => !sel.has(r.id)); sel.clear(); $("#rDel", view).disabled = true; draw(); U.toast("Đã xoá", "ok"); } catch (e) { fail(e); } };
    $("#rExp", view).onclick = async () => {
      try {
        const XLSX = await U.needXLSX(); const rows = [];
        filtered().forEach((r) => (r.players || []).forEach((p) => rows.push({ "Thời gian": U.fmtDate(r.at || r.createdAt), "Trò chơi": r.gameName, "Chế độ": r.mode === "online" ? "Trực tuyến" : "Một màn hình", "Hạng": p.rank, "Tên": p.name, "Điểm": p.score, "Đúng": p.correct, "Sai": p.wrong, "Người tổ chức": r.host || "" })));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "DiemSo");
        const agg = aggregateResults(filtered()).map((p, i) => ({ "Hạng": i + 1, "Tên": p.name, "Số trận": p.matches, "Thắng": p.wins, "Câu đúng": p.correct, "Tổng điểm": Math.round(p.score) }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agg), "XepHang");
        XLSX.writeFile(wb, "diem-so.xlsx");
      } catch (e) { fail(e); }
    };
    DB.listResults(1000).then((r) => { rs = r; draw(); });
  };

  /* ======================= PHÒNG TRỰC TUYẾN ======================= */
  A.rooms = (view) => {
    view.innerHTML = `<div class="page">${header("📡", "Phòng trực tuyến", "Các phòng đang mở trên Realtime Database.", "linear-gradient(135deg,#22d3ee,#6c4cf5)")}
      <div class="adm-tools"><button class="btn btn-ghost" id="rmRef">🔄 Làm mới</button><button class="btn btn-danger" id="rmOld">🧹 Dọn phòng đã kết thúc / quá 6 giờ</button></div><div id="rmBox"></div></div>`;
    const load = async () => {
      $("#rmBox", view).innerHTML = `<div class="loader" style="min-height:160px"><div class="dots3"><i></i><i></i><i></i></div></div>`;
      try {
        const all = await Room.listAll(); const arr = Object.entries(all).map(([pin, r]) => ({ pin, meta: r.meta || {}, n: Object.keys(r.players || {}).length })).sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
        view._rooms = arr;
        $("#rmBox", view).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>PIN</th><th>Trò chơi</th><th>Chủ phòng</th><th>Trạng thái</th><th>Người chơi</th><th>Tạo lúc</th><th></th></tr></thead><tbody>${arr.map((r) => `<tr><td><b style="font-family:var(--font-fun);font-size:18px">${r.pin}</b></td><td>${(Games.get(r.meta.gameId) || {}).icon || ""} ${esc(r.meta.title || "")}</td><td>${esc(r.meta.hostName || "")}</td>
          <td><span class="chip ${r.meta.status === "playing" ? "green" : r.meta.status === "ended" ? "" : "amber"}">${{ lobby: "Phòng chờ", playing: "Đang chơi", ended: "Kết thúc" }[r.meta.status] || r.meta.status}</span></td><td>${r.n}</td><td>${U.fmtDate(r.meta.createdAt)}</td>
          <td><button class="btn btn-sm btn-ghost" data-pin="${r.pin}">🗑 Xoá</button></td></tr>`).join("") || `<tr><td colspan="7"><div class="empty"><span class="em-ic">📭</span>Không có phòng nào</div></td></tr>`}</tbody></table></div>`;
        $$("[data-pin]", view).forEach((b) => (b.onclick = async () => { await Room.remove(b.dataset.pin).catch(fail); load(); }));
      } catch (e) { $("#rmBox", view).innerHTML = `<div class="notice">⛔ ${esc(FB.errMsg(e))}</div>`; }
    };
    $("#rmRef", view).onclick = load;
    $("#rmOld", view).onclick = async () => { const old = (view._rooms || []).filter((r) => r.meta.status === "ended" || Date.now() - (r.meta.createdAt || 0) > 6 * 3600e3); for (const r of old) await Room.remove(r.pin).catch(() => { }); U.toast(`Đã dọn ${old.length} phòng`, "ok"); load(); };
    if (!FB.rtdb) $("#rmBox", view).innerHTML = `<div class="notice">Realtime Database chưa sẵn sàng.</div>`; else load();
  };

  /* ======================= NGƯỜI DÙNG ======================= */
  A.users = (view) => {
    view.innerHTML = `<div class="page">${header("👥", "Người dùng", "Tài khoản đã đăng nhập vào web (Google / Email).", "linear-gradient(135deg,#34d399,#3b82f6)")}<div id="uBox"><div class="loader" style="min-height:160px"><div class="dots3"><i></i><i></i><i></i></div></div></div></div>`;
    DB.listUsers().then((us) => {
      $("#uBox", view).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Tên</th><th>Email</th><th>Phương thức</th><th>Vai trò</th><th>Đăng nhập gần nhất</th></tr></thead><tbody>${us.map((u) => `<tr><td>${u.photoURL ? `<img class="ava" src="${esc(u.photoURL)}" referrerpolicy="no-referrer">` : `<span class="ava">${esc((u.displayName || u.email || "?").charAt(0).toUpperCase())}</span>`}</td><td>${esc(u.displayName || "")}</td><td>${esc(u.email || "")}</td><td>${u.provider === "google.com" ? "Google" : "Email"}</td><td>${(APP_CONFIG.adminEmails || []).includes((u.email || "").toLowerCase()) ? '<span class="chip violet">Quản trị</span>' : '<span class="chip">Người dùng</span>'}</td><td>${U.fmtDate(u.lastLogin)}</td></tr>`).join("")}</tbody></table></div>`;
    }).catch((e) => ($("#uBox", view).innerHTML = `<div class="notice">⛔ ${esc(FB.errMsg(e))}</div>`));
  };

  /* ======================= CÀI ĐẶT ======================= */
  A.settings = (view) => {
    const s = DB.settings;
    view.innerHTML = `<div class="page">${header("⚙️", "Cài đặt web", "Tên web, thông báo, lưu điểm, sao lưu dữ liệu và chế độ offline.", "linear-gradient(135deg,#94a3b8,#6c4cf5)")}
      <div class="grid2">
        <div class="card" data-reveal><div class="card-h"><h3>🎨 Giao diện & nội dung</h3></div><div class="stack">
          <div class="field"><label>Tên web</label><input class="input" data-k="siteName" value="${esc(s.siteName)}"></div>
          <div class="field"><label>Khẩu hiệu (hiện ở trang chủ)</label><input class="input" data-k="slogan" value="${esc(s.slogan)}"></div>
          <div class="field"><label>Thông báo nổi bật (để trống nếu không dùng)</label><textarea class="textarea" data-k="announcement" rows="2">${esc(s.announcement || "")}</textarea></div>
          <label class="switch"><input type="checkbox" data-b="saveResults" ${s.saveResults !== false ? "checked" : ""}> Lưu kết quả các trận đấu (bảng vàng)</label>
          <button class="btn btn-primary" id="stSave">💾 Lưu cài đặt</button></div></div>
        <div class="card" data-reveal><div class="card-h"><h3>💾 Dữ liệu & offline</h3></div><div class="stack">
          <p class="muted" style="margin:0">Tải <b>questions-offline.js</b> rồi đặt vào thư mục <code>data/</code> (cùng cấp <code>index.html</code>). Khi không có Internet, web tự dùng file này.</p>
          <button class="btn btn-fun" id="stOff">💾 Tải questions-offline.js</button>
          <button class="btn btn-ghost" id="stBak">🗄️ Sao lưu toàn bộ (JSON)</button>
          <button class="btn btn-ghost" id="stRes">♻️ Khôi phục từ bản sao lưu</button>
          <label class="switch"><input type="checkbox" id="stForce" ${U.store.get("forceOffline", false) ? "checked" : ""}> Chỉ dùng dữ liệu offline trên máy này (bỏ qua Firestore)</label>
          <button class="btn btn-ghost" id="stCache">🧹 Xoá bộ nhớ đệm trên máy này</button></div></div>
        <div class="card" data-reveal><div class="card-h"><h3>🔐 Firebase</h3></div>
          <p style="margin-top:0">Dự án: <code>${esc(APP_CONFIG.firebase.projectId)}</code></p>
          <p class="muted">Quản trị viên: ${(APP_CONFIG.adminEmails || []).map((e) => `<code>${esc(e)}</code>`).join(", ")}<br>Đổi danh sách admin trong <code>assets/js/config.js</code> và file rules trong thư mục <code>firebase/</code>.</p>
          <p class="muted">Trạng thái: Auth ${FB.available ? "✅" : "❌"} · Firestore ${DB.source === "cloud" ? "✅" : "⚠️ ngoại tuyến"} · Realtime DB ${FB.rtdb ? "✅" : "❌"}</p></div>
      </div></div>`;
    U.reveal(view);
    $("#stSave", view).onclick = async (e) => {
      const p = {}; $$("[data-k]", view).forEach((i) => (p[i.dataset.k] = i.value.trim())); $$("[data-b]", view).forEach((i) => (p[i.dataset.b] = i.checked));
      busy(e.currentTarget, true); try { await DB.saveSettings(p); U.toast("Đã lưu cài đặt", "ok"); App.buildDrawer(); App.applyBrand(); } catch (er) { fail(er); } busy(e.currentTarget, false);
    };
    $("#stOff", view).onclick = () => U.download("questions-offline.js", DB.exportOfflineJS(), "text/javascript");
    $("#stBak", view).onclick = () => U.download("sao-luu-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify({ questions: DB.questions.map((q) => { const c = U.plain(q); delete c._doc; return c; }), sets: DB.sets, gameConfigs: DB.gameConfigs, settings: DB.settings, presets: DB.presets }, null, 1), "application/json");
    $("#stRes", view).onclick = async () => {
      const f = await U.pickFile(".json"); if (!f) return;
      try {
        const d = JSON.parse(await U.readFile(f));
        if (!(await U.confirm(`Khôi phục ${(d.questions || []).length} câu hỏi, ${(d.sets || []).length} bộ đề? Dữ liệu trùng sẽ bị ghi đè.`))) return;
        await DB.importQuestions(d.questions || [], { overwrite: true });
        for (const s of d.sets || []) await DB.saveSet(s);
        for (const [g, c] of Object.entries(d.gameConfigs || {})) await DB.saveGameConfig(g, c);
        if (d.settings) await DB.saveSettings(d.settings);
        for (const p of d.presets || []) await DB.savePreset(p, "cloud");
        U.toast("Khôi phục thành công", "ok"); App.render();
      } catch (e) { fail(e); }
    };
    $("#stForce", view).onchange = async (e) => { U.store.set("forceOffline", e.target.checked); await DB.load(true); App.render(); U.toast(e.target.checked ? "Đang dùng dữ liệu offline" : "Đã kết nối lại Firestore", "info"); };
    $("#stCache", view).onclick = () => { U.store.del("cache"); U.store.del("localFile"); U.toast("Đã xoá bộ nhớ đệm", "ok"); };
  };
})();
