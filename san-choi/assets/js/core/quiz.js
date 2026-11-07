/* =========================================================
   quiz.js — Engine câu hỏi dùng chung cho mọi game
   Hỗ trợ: MC (1 đáp án đúng), TF (Đúng/Sai 4 ý a-d),
           SA (điền số / điền từ). Group được tách thành câu con.
   ========================================================= */
(function () {
  const LET = ["A", "B", "C", "D", "E", "F"];
  const SHAPES = ["▲", "◆", "●", "■", "★", "⬟"];
  const TFK = ["a", "b", "c", "d"];
  const TOUCH = () => matchMedia("(hover: none) and (pointer: coarse)").matches;
  const Quiz = {};

  Quiz.TYPES = { MC: "Trắc nghiệm", TF: "Đúng / Sai", SA: "Trả lời ngắn", LA: "Tự luận", Group: "Nhóm câu" };
  Quiz.LEVELS = ["Nhận biết", "Thông hiểu", "Vận dụng", "Vận dụng cao"];
  Quiz.baseType = (t) => {
    t = String(t || "").trim();
    const u = t.toUpperCase();
    if (u === "GROUP") return "Group";
    if (u.startsWith("GROUP")) return u.slice(5);
    return u;
  };

  /* ---------- Chuẩn hoá câu hỏi thô (JSON ngân hàng) -> item chơi được ---------- */
  function opt(o, k) { if (!o) return null; return o[k] != null ? o[k] : o[k.toLowerCase()] != null ? o[k.toLowerCase()] : o[k.toUpperCase()]; }
  function toItem(q, parent) {
    const type = Quiz.baseType(q.Type);
    const base = {
      id: q.Id || U.uid(), type, stem: q.Question || "", context: parent ? parent.Question || "" : "",
      explain: q.Explain || "", level: q.Level || (parent && parent.Level) || "",
      subject: q.Subject || (parent && parent.Subject) || "", grade: q.Grade || (parent && parent.Grade) || "",
      chapter: q.Chapter || (parent && parent.Chapter) || "", topic: q.Topic || (parent && parent.Topic) || ""
    };
    if (type === "MC") {
      const opts = LET.map((k) => ({ key: k, text: opt(q.Options, k) })).filter((o) => o.text != null && String(o.text).trim() !== "");
      const ans = String(q.CorrectAnswer || "").trim().toUpperCase().charAt(0);
      if (opts.length < 2 || !opts.some((o) => o.key === ans)) return null;
      return Object.assign(base, { options: opts.map((o) => ({ key: o.key, text: String(o.text) })), answer: ans });
    }
    if (type === "TF") {
      const opts = TFK.map((k) => ({ key: k, text: opt(q.Options, k) })).filter((o) => o.text != null && String(o.text).trim() !== "");
      const raw = String(q.CorrectAnswer || "").toUpperCase().replace(/ĐÚNG/g, "Đ").replace(/SAI/g, "S").replace(/[^ĐDSTF01]/g, "");
      if (!opts.length || raw.length < opts.length) return null;
      const answer = opts.map((o, i) => "ĐDT1".includes(raw[i]));
      return Object.assign(base, { options: opts.map((o) => ({ key: o.key, text: String(o.text) })), answer });
    }
    if (type === "SA") {
      const a = String(q.CorrectAnswer == null ? "" : q.CorrectAnswer).trim();
      if (!a) return null;
      return Object.assign(base, { answer: a });
    }
    return null; // LA (tự luận) không dùng trong game
  }
  Quiz.flatten = (list, types) => {
    types = types || ["MC", "TF", "SA"];
    const out = [];
    (list || []).forEach((q) => {
      if (!q) return;
      if (Quiz.baseType(q.Type) === "Group") { (q.children || []).forEach((c) => { const it = toItem(c, q); if (it && types.includes(it.type)) out.push(it); }); return; }
      const it = toItem(q); if (it && types.includes(it.type)) out.push(it);
    });
    return out;
  };
  Quiz.countPlayable = (list) => Quiz.flatten(list).length;

  /* Trộn câu và trộn phương án (MC) — gán nhãn hiển thị A,B,C,D theo vị trí */
  Quiz.prepare = (items, o) => {
    o = o || {};
    let arr = items.map((it) => U.plain(it));
    if (o.shuffleQ !== false) arr = U.shuffle(arr);
    arr.forEach((it) => {
      if (it.type === "MC" && o.shuffleA !== false) it.options = U.shuffle(it.options);
      if (it.options) it.options.forEach((op, i) => (op.label = it.type === "MC" ? LET[i] : op.key));
    });
    return arr;
  };

  /* Hàng đợi vô hạn: hết câu thì trộn lại */
  Quiz.queue = (items, o) => {
    let q = Quiz.prepare(items, o), i = 0;
    return {
      next() { if (i >= q.length) { q = Quiz.prepare(items, o); i = 0; } return q[i++]; },
      get size() { return items.length; }
    };
  };

  /* ---------- Kiểm tra đáp án ---------- */
  function cleanSA(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ").replace(/[.。]+$/, ""); }
  function toNum(s) {
    s = String(s == null ? "" : s).trim().replace(/\s/g, "").replace(/,/g, ".");
    let m = s.match(/^([-+]?\d+)\/(\d+)$/); if (m && +m[2] !== 0) return +m[1] / +m[2];
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return parseFloat(s);
    return null;
  }
  Quiz.saMatch = (given, answer) => {
    const g = cleanSA(given); if (!g) return false;
    return String(answer).split(/\s*[|;]\s*/).filter(Boolean).some((a) => {
      const A = cleanSA(a); if (A === g) return true;
      const na = toNum(a), ng = toNum(given);
      if (na != null && ng != null) return Math.abs(na - ng) <= 1e-9 * Math.max(1, Math.abs(na));
      return U.norm(A) === U.norm(g);
    });
  };
  const TF_POINTS = [0, 0.1, 0.25, 0.5, 1];
  Quiz.check = (item, given) => {
    if (item.type === "MC") { const ok = given === item.answer; return { ok, points: ok ? 1 : 0, given }; }
    if (item.type === "TF") {
      const n = item.answer.reduce((s, v, i) => s + (given && given[i] === v ? 1 : 0), 0);
      const full = n === item.answer.length;
      const pts = item.answer.length === 4 ? TF_POINTS[n] : n / item.answer.length;
      return { ok: full, points: full ? 1 : pts, nRight: n, given };
    }
    if (item.type === "SA") { const ok = Quiz.saMatch(given, item.answer); return { ok, points: ok ? 1 : 0, given }; }
    return { ok: false, points: 0 };
  };
  Quiz.answerText = (item) => {
    if (item.type === "MC") { const o = item.options.find((x) => x.key === item.answer); return (o && (o.label || o.key)) + ". " + (o ? o.text : ""); }
    if (item.type === "TF") return item.options.map((o, i) => o.key + ") " + (item.answer[i] ? "Đúng" : "Sai")).join(" · ");
    return String(item.answer).split(/\s*[|;]\s*/)[0];
  };

  /* ---------- Hiển thị nội dung giàu: ảnh + công thức LaTeX ---------- */
  const IMG_HOST = /(res\.cloudinary\.com|cloudinary\.com\/.+\/image\/|i\.imgur\.com|googleusercontent\.com|i\.ibb\.co|imgbb\.com|drive\.google\.com\/uc|r2\.dev\/|firebasestorage\.googleapis\.com)/i;
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i;
  Quiz.isImgUrl = (u) => /^data:image\//i.test(u) || IMG_EXT.test(u) || IMG_HOST.test(u);
  const imgTag = (url) => {
    const u = U.esc(url);
    return `<span class="q-imgw" data-zoom="${u}" title="Bấm để phóng to"><img class="q-img" src="${u}" alt="Hình minh hoạ" loading="lazy" onerror="this.parentNode.classList.add('err')"><i class="q-zoom">🔍</i></span>`;
  };
  Quiz.rich = (text) => {
    let raw = String(text == null ? "" : text);
    // ảnh dạng Markdown ![...](url) → chỉ giữ url
    raw = raw.replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g, " $1 ");
    // thẻ <img src="..."> dán từ nơi khác hoặc từ Word .docx → url
    raw = raw.replace(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi, " $1 ");
    const re = /(?:https?:\/\/[^\s<>"']+|data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(raw))) {
      const url = /^data:image\//i.test(m[0]) ? m[0] : m[0].replace(/[),.;:!?\]}]+$/, "");
      out += U.esc(raw.slice(last, m.index));
      out += Quiz.isImgUrl(url) ? imgTag(url) : `<a href="${U.esc(url)}" target="_blank" rel="noopener">${U.esc(url.length > 48 ? url.slice(0, 45) + "…" : url)}</a>`;
      last = m.index + url.length;
    }
    out += U.esc(raw.slice(last));
    return out.replace(/\n/g, "<br>").replace(/(<br>\s*)+(<span class="q-imgw")/g, "$2").replace(/(<\/span>)(\s*<br>)+/g, "$1");
  };
  Quiz.typeset = (el) => {
    if (!el || !window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }
        ], throwOnError: false, ignoredClasses: ["no-math"]
      });
    } catch (e) { }
  };
  Quiz.html = (text) => Quiz.rich(text); // alias
  // Lưới an toàn: khi mở mục "Lời giải" (details.fb-ex), đảm bảo công thức Toán được render đẹp
  document.addEventListener("toggle", (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains("fb-ex") && t.open) Quiz.typeset(t);
  }, true);

  /* ---------- Gắn giao diện trả lời ----------
     o = { compact, keypad, num, total, meta, hotkeys, explain,
           onAnswer(result, item), feedback (true), accent } */
  Quiz.mount = (el, item, o) => {
    o = Object.assign({ feedback: true, meta: true, explain: false }, o || {});
    if (item.options) item.options.forEach((op, i) => { if (!op.label) op.label = item.type === "MC" ? LET[i] : op.key; });
    const metaHtml = o.meta ? `<div class="q-head">
        <span class="q-badge qb-${item.type}">${Quiz.TYPES[item.type] || item.type}</span>
        ${item.level ? `<span class="q-chip">${U.esc(item.level)}</span>` : ""}
        ${o.num ? `<span class="q-num">Câu ${o.num}${o.total ? "/" + o.total : ""}</span>` : ""}
      </div>` : "";
    let body = "";
    if (item.type === "MC") {
      body = `<div class="mc-grid n${item.options.length}">` + item.options.map((op, i) =>
        `<button class="mc-opt c${i}" data-k="${op.key}" style="--i:${i}"><span class="mc-sh">${SHAPES[i]}</span><span class="mc-lt">${op.label}</span><span class="mc-tx">${Quiz.rich(op.text)}</span></button>`).join("") + `</div>`;
    } else if (item.type === "TF") {
      body = `<div class="tf-list">` + item.options.map((op, i) =>
        `<div class="tf-row" data-i="${i}" style="--i:${i}"><span class="tf-k">${op.key})</span><div class="tf-tx">${Quiz.rich(op.text)}</div>
          <div class="tf-btns"><button class="tf-b tf-t" data-v="1">Đúng</button><button class="tf-b tf-f" data-v="0">Sai</button></div></div>`).join("") +
        `</div><button class="btn btn-primary tf-go" disabled>Chốt đáp án ✓</button>`;
    } else if (item.type === "SA") {
      body = `<div class="sa-wrap"><input class="sa-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" placeholder="Nhập đáp án…" ${o.keypad && TOUCH() ? 'inputmode="none"' : ""}>
        <button class="btn btn-primary sa-go">Gửi ➤</button></div>
        ${o.keypad ? `<div class="keypad">${["7", "8", "9", "4", "5", "6", "1", "2", "3", "-", "0", ",", "/", "⌫", "⌨"].map((k) => `<button data-kp="${k}">${k}</button>`).join("")}</div>` : ""}`;
    }
    el.innerHTML = `<div class="qcard qt-${item.type} ${o.compact ? "compact" : ""}">
      ${metaHtml}
      ${item.context ? `<div class="q-ctx">${Quiz.rich(item.context)}</div>` : ""}
      <div class="q-stem">${Quiz.rich(item.stem)}</div>
      <div class="q-body">${body}</div>
      <div class="q-fb"></div>
    </div>`;
    const card = el.firstElementChild;
    Quiz.typeset(card);
    let locked = false, destroyed = false;
    const tfSel = item.type === "TF" ? item.options.map(() => null) : null;

    let lastGiven = null, lastRes = null;
    function finish(given) {
      if (locked) return;
      const res = Quiz.check(item, given);
      lastGiven = given; lastRes = res;
      if (o.changeable && o.reveal === false) {
        // Chế độ ĐỔI ĐÁP ÁN: ghi nhận lựa chọn hiện tại nhưng KHÔNG khoá —
        // người chơi chọn lại bao nhiêu lần cũng được cho tới khi hết giờ/công bố.
        card.classList.add("answered", "pending");
        if (item.type === "MC") U.$$(".mc-opt", card).forEach((b) => { b.classList.toggle("chosen", b.dataset.k === given); b.classList.remove("dim"); });
        const fb = U.$(".q-fb", card);
        if (fb) fb.innerHTML = `<div class="fb note">✏️ Đã ghi nhận đáp án — bạn vẫn <b>đổi được</b> khi còn thời gian.</div>`;
        if (item.type === "TF") { const go = U.$(".tf-go", card); if (go) go.textContent = "Cập nhật đáp án ✓"; }
        if (item.type === "SA") { const go = U.$(".sa-go", card); if (go) go.textContent = "Cập nhật ➤"; }
        U.Sound.pop();
        o.onAnswer && o.onAnswer(res, item);
        return;
      }
      locked = true;
      if (o.reveal === false) {
        card.classList.add("answered", "pending");
        if (item.type === "MC") U.$$(".mc-opt", card).forEach((b) => { b.disabled = true; b.classList.add(b.dataset.k === given ? "chosen" : "dim"); });
        if (item.type === "TF") { U.$$(".tf-b", card).forEach((b) => (b.disabled = true)); const go = U.$(".tf-go", card); if (go) go.remove(); }
        if (item.type === "SA") { U.$(".sa-in", card).disabled = true; U.$$(".sa-go,.keypad button", card).forEach((b) => (b.disabled = true)); }
        U.Sound.pop();
        o.onAnswer && o.onAnswer(res, item);
        return;
      }
      mark(given, res);
      o.onAnswer && o.onAnswer(res, item);
    }
    function mark(given, res) {
      card.classList.remove("pending", "dim");
      U.$$(".mc-opt", card).forEach((b) => b.classList.remove("chosen", "dim"));
      card.classList.add("answered", res.ok ? "is-ok" : "is-bad");
      // đánh dấu
      if (item.type === "MC") {
        U.$$(".mc-opt", card).forEach((b) => {
          b.disabled = true;
          if (b.dataset.k === item.answer) b.classList.add("right");
          else if (b.dataset.k === given) b.classList.add("wrong"); else b.classList.add("dim");
        });
      } else if (item.type === "TF") {
        U.$$(".tf-row", card).forEach((r, i) => {
          r.classList.add(given[i] === item.answer[i] ? "right" : "wrong");
          U.$$(".tf-b", r).forEach((b) => { b.disabled = true; if ((b.dataset.v === "1") === item.answer[i]) b.classList.add("truth"); });
        });
        const go = U.$(".tf-go", card); if (go) go.remove();
      } else if (item.type === "SA") {
        const inp = U.$(".sa-in", card); inp.disabled = true; inp.classList.add(res.ok ? "right" : "wrong");
        U.$$(".sa-go,.keypad button", card).forEach((b) => (b.disabled = true));
      }
      if (o.feedback) {
        const fb = U.$(".q-fb", card);
        fb.innerHTML = res.ok
          ? `<div class="fb ok"><b>✓ Chính xác!</b>${o.pointsText ? `<span>${o.pointsText(res)}</span>` : ""}</div>`
          : `<div class="fb bad"><b>${item.type === "TF" && res.nRight ? `✗ Đúng ${res.nRight}/${item.answer.length} ý` : "✗ Chưa đúng"}</b><span>Đáp án: <span class="fb-ans">${Quiz.rich(Quiz.answerText(item))}</span></span></div>`;
        if (o.explain && item.explain) fb.insertAdjacentHTML("beforeend", `<details class="fb-ex"><summary>💡 Lời giải</summary><div>${Quiz.rich(item.explain)}</div></details>`);
        Quiz.typeset(fb);
      }
      if (o.sound !== false) res.ok ? U.Sound.correct() : U.Sound.wrong();
    }

    // sự kiện
    if (item.type === "MC") {
      U.$$(".mc-opt", card).forEach((b) => (b.onclick = () => finish(b.dataset.k)));
    } else if (item.type === "TF") {
      U.$$(".tf-row", card).forEach((r) => {
        const i = +r.dataset.i;
        U.$$(".tf-b", r).forEach((b) => (b.onclick = () => {
          if (locked) return; U.Sound.click();
          tfSel[i] = b.dataset.v === "1";
          U.$$(".tf-b", r).forEach((x) => x.classList.toggle("on", x === b));
          r.classList.add("picked");
          U.$(".tf-go", card).disabled = tfSel.some((v) => v === null);
        }));
      });
      U.$(".tf-go", card).onclick = () => finish(tfSel.slice());
    } else if (item.type === "SA") {
      const inp = U.$(".sa-in", card);
      const go = () => { if (inp.value.trim()) finish(inp.value); else { inp.classList.add("shake"); setTimeout(() => inp.classList.remove("shake"), 400); } };
      U.$(".sa-go", card).onclick = go;
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      U.$$(".keypad button", card).forEach((b) => (b.onclick = () => {
        const k = b.dataset.kp; U.Sound.click();
        const st = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? inp.value.length;
        if (k === "⌫") { if (st !== en) inp.value = inp.value.slice(0, st) + inp.value.slice(en); else if (st > 0) { inp.value = inp.value.slice(0, st - 1) + inp.value.slice(en); setCaret(st - 1); return refocus(); } setCaret(st); }
        else if (k === "⌨") { inp.removeAttribute("inputmode"); inp.focus(); return; }
        else { inp.value = inp.value.slice(0, st) + k + inp.value.slice(en); setCaret(st + k.length); }
        refocus();
      }));
      function setCaret(p) { try { inp.setSelectionRange(p, p); } catch (e) { } }
      function refocus() { if (!TOUCH()) inp.focus({ preventScroll: true }); }
      // máy tính: gõ phím ở bất kỳ đâu trên thẻ câu hỏi là nhập vào ô đáp án
      card.addEventListener("keydown", (e) => {
        if (locked || e.target === inp || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length === 1 || e.key === "Backspace") { inp.focus({ preventScroll: true }); }
        if (e.key === "Enter") go();
      });
      card.tabIndex = -1;
      if (o.autofocus && !TOUCH()) setTimeout(() => inp.focus({ preventScroll: true }), 60);
    }
    let keyH = null;
    if (o.hotkeys) {
      keyH = (e) => {
        if (locked || destroyed || /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
        const k = e.key.toUpperCase(); let idx = "1234".indexOf(k); if (idx < 0) idx = "ABCD".indexOf(k);
        if (item.type === "MC" && idx >= 0 && item.options[idx]) finish(item.options[idx].key);
      };
      document.addEventListener("keydown", keyH);
    }
    return {
      el: card, item,
      get locked() { return locked; },
      lock() { locked = true; card.classList.add("locked"); },
      unlock() { if (!card.classList.contains("answered")) { locked = false; card.classList.remove("locked"); } },
      submit(given) { finish(given); },
      reveal() { if (lastRes && o.changeable) { locked = true; U.$$("button,input", card).forEach((b) => (b.disabled = true)); mark(lastGiven, lastRes); return lastRes; } if (!locked) { locked = true; lastGiven = item.type === "TF" ? tfSel.slice() : item.type === "SA" ? (U.$(".sa-in", card).value || "") : null; lastRes = Quiz.check(item, lastGiven); U.$$("button,input", card).forEach((b) => (b.disabled = true)); } mark(lastGiven, lastRes); return lastRes; },
      timeout() { if (!locked && !lastRes) finish(item.type === "TF" ? tfSel.slice() : item.type === "SA" ? (U.$(".sa-in", card).value || "") : null); },
      destroy() { destroyed = true; if (keyH) document.removeEventListener("keydown", keyH); }
    };
  };

  /* Thẻ xem trước câu hỏi (dùng trong admin) */
  Quiz.preview = (q) => {
    const t = Quiz.baseType(q.Type);
    let h = `<div class="qprev"><div class="q-stem">${Quiz.rich(q.Question)}</div>`;
    if (t === "MC" || t === "TF") {
      const keys = t === "MC" ? LET.slice(0, 4) : TFK;
      const raw = String(q.CorrectAnswer || "").toUpperCase();
      h += `<ul class="qp-opts">` + keys.map((k, i) => {
        const v = opt(q.Options, k); if (v == null || v === "") return "";
        const right = t === "MC" ? raw.charAt(0) === k : null;
        const tf = t === "TF" ? ("ĐDT1".includes(raw[i]) ? "Đ" : raw[i] ? "S" : "?") : "";
        return `<li class="${right ? "right" : ""}"><b>${k}${t === "TF" ? ")" : "."}</b> ${Quiz.rich(v)} ${t === "TF" ? `<span class="tfp ${tf === "Đ" ? "t" : "f"}">${tf}</span>` : ""}</li>`;
      }).join("") + `</ul>`;
    } else if (t === "SA") h += `<div class="qp-sa">Đáp án: <b>${U.esc(q.CorrectAnswer)}</b></div>`;
    else if (t === "Group") h += (q.children || []).map((c, i) => `<div class="qp-child"><span class="q-badge qb-${Quiz.baseType(c.Type)}">${i + 1}. ${Quiz.TYPES[Quiz.baseType(c.Type)] || c.Type}</span>${Quiz.preview(c)}</div>`).join("");
    if (q.Explain) h += `<details class="fb-ex"><summary>💡 Lời giải</summary><div>${Quiz.rich(q.Explain)}</div></details>`;
    return h + `</div>`;
  };

  Quiz.LET = LET; Quiz.SHAPES = SHAPES;
  window.Quiz = Quiz;
})();
