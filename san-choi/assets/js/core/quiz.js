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

  /* ---------- Hiển thị nội dung giàu: ảnh + công thức LaTeX chuẩn QMath (exam-editor / utils.js) ---------- */
  const IMG_HOST = /(res\.cloudinary\.com|cloudinary\.com\/.+\/image\/|i\.imgur\.com|googleusercontent\.com|i\.ibb\.co|imgbb\.com|drive\.google\.com\/uc|r2\.dev\/|firebasestorage\.googleapis\.com)/i;
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i;
  Quiz.isImgUrl = (u) => /^data:image\//i.test(u) || IMG_EXT.test(u) || IMG_HOST.test(u);
  const imgTag = (url) => {
    const u = U.esc(url);
    return `<span class="q-imgw" data-zoom="${u}" title="Bấm để phóng to"><img class="q-img" src="${u}" alt="Hình minh hoạ" loading="lazy" onerror="this.parentNode.classList.add('err')"><i class="q-zoom">🔍</i></span>`;
  };

  function replaceCustomMathCmd(text, cmd, leftDelim, rightDelim) {
    let result = "";
    let remaining = String(text || "");
    const search = "\\" + cmd;
    while (true) {
      const idx = remaining.indexOf(search);
      if (idx === -1) { result += remaining; break; }
      result += remaining.substring(0, idx);
      remaining = remaining.substring(idx + search.length).replace(/^\s*/, "");
      if (!remaining.startsWith("{")) { result += search; continue; }
      let depth = 1, i = 1;
      while (i < remaining.length && depth > 0) {
        if (remaining[i] === "{") depth++;
        else if (remaining[i] === "}") depth--;
        i++;
      }
      const content = remaining.substring(1, i - 1);
      remaining = remaining.substring(i);
      result += `${leftDelim}\\begin{aligned}${content}\\end{aligned}${rightDelim}`;
    }
    return result;
  }

  function unwrapImmini(text) {
    if (!text || !text.includes("\\immini")) return text || "";
    let out = "";
    let rem = String(text);
    while (true) {
      const m = rem.match(/\\immini(?:\s*\[[^\]]*\])?\s*\{/);
      if (!m) { out += rem; break; }
      const startIdx = m.index;
      out += rem.slice(0, startIdx);
      rem = rem.slice(startIdx + m[0].length);
      // Extract 1st brace group {text}
      let d = 1, i = 0;
      while (i < rem.length && d > 0) {
        if (rem[i] === "{") d++;
        else if (rem[i] === "}") d--;
        i++;
      }
      const g1 = rem.slice(0, Math.max(0, i - 1));
      rem = rem.slice(i).replace(/^\s*/, "");
      // Extract optional 2nd brace group {image}
      if (rem.startsWith("{")) {
        let d2 = 1, j = 1;
        while (j < rem.length && d2 > 0) {
          if (rem[j] === "{") d2++;
          else if (rem[j] === "}") d2--;
          j++;
        }
        const g2 = rem.slice(1, Math.max(1, j - 1));
        rem = rem.slice(j);
        out += g1 + "\n" + g2;
      } else {
        out += g1;
      }
    }
    return out;
  }

  function processTabular(text) {
    if (!text) return "";
    let processed = text.replace(/\\begin\{table\}(?:\[.*?\])?([\s\S]*?)\\end\{table\}/gi, "$1");
    processed = processed
      .replace(/\\caption\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "")
      .replace(/\\renewcommand\s*\{?\s*\\arraystretch\s*\}?\s*\{[^}]+\}/g, "")
      .replace(/\\centering/g, "");
    const regex = /\\begin\{tabular\}\s*(?:\{[^}]*\}|\[[^\]]*\])([\s\S]*?)\\end\{tabular\}/gi;
    return processed.replace(regex, (_, body) => {
      const rows = body.split("\\\\").filter((r) => r.trim().length > 0);
      let html = '<div class="qm-tbl-wrap"><table class="qm-latex-tbl">';
      rows.forEach((row) => {
        const cleanRow = row.replace(/\\hline/g, "").trim();
        if (!cleanRow) return;
        const cols = cleanRow.split("&");
        html += "<tr>";
        cols.forEach((col) => {
          html += `<td>${col.trim()}</td>`;
        });
        html += "</tr>";
      });
      html += "</table></div>";
      return html;
    });
  }

  function processLatexLists(text) {
    if (!text) return "";
    let processed = text;
    processed = processed.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/gi, (_, body) => {
      const items = body.split(/\\itemch\b/g).filter((s) => s.trim().length > 0);
      const htmlItems = items.map((item, idx) => {
        const letter = String.fromCharCode(97 + idx);
        return `<div class="qm-ic-item"><span class="qm-ic-badge">${letter})</span><div class="qm-ic-body">${item.trim()}</div></div>`;
      }).join("");
      return `<div class="qm-ic-list">${htmlItems}</div>`;
    });
    processed = processed.replace(/\\itemch\b/g, '<br><strong class="qm-ic-inline">• Ý: </strong>');
    processed = processed.replace(/\\begin\{nx\}([\s\S]*?)\\end\{nx\}/gi, (_, body) => {
      return `<div class="qm-nx-box"><strong>💡 Nhận xét:</strong> ${body.trim()}</div>`;
    });

    const parseItems = (bodyStr) =>
      bodyStr
        .split(/\\item(?![a-zA-Z])/)
        .map((s) => s.trim())
        .filter(Boolean);

    processed = processed.replace(/\\begin\{\s*(?:listEX|enumEX|enumerate)\s*\}(?:\[[^\]]*\]|\{[^}]*\})*([\s\S]*?)\\end\{\s*(?:listEX|enumEX|enumerate)\s*\}/gi, (_, body) => {
      const items = parseItems(body);
      return `<ol class="qm-ol-list">${items.map((it) => `<li>${it}</li>`).join("")}</ol>`;
    });
    processed = processed.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/gi, (_, body) => {
      const items = parseItems(body);
      return `<ul class="qm-ul-list">${items.map((it) => `<li>${it}</li>`).join("")}</ul>`;
    });
    return processed;
  }

  Quiz.formatQMathContent = (text) => {
    if (text === null || text === undefined) return "";
    let processed = String(text);

    // 1. Bảo vệ hình ảnh (<img ...>, ![...](url)) thành token trước khi xử lý LaTeX/HTML
    const imgTokens = [];
    const pushImg = (url) => {
      const cleanUrl = String(url || "").trim();
      if (!cleanUrl) return "";
      const tok = `@@QM_IMG_${imgTokens.length}@@`;
      imgTokens.push(imgTag(cleanUrl));
      return ` ${tok} `;
    };

    processed = processed.replace(/<div[^>]*>\s*(<img[^>]*>)\s*<\/div>/gi, "$1");
    processed = processed.replace(/<img[^>]*?src=["']([^"']+)["'][^>]*>/gi, (_, src) => pushImg(src));
    processed = processed.replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/g, (_, src) => pushImg(src));
    processed = processed.replace(/\\begin\{center\}\s*\\includegraphics(?:\[.*?\])?\{(https?:\/\/[^}]+)\}\s*\\end\{center\}/g, (_, src) => pushImg(src));
    processed = processed.replace(/\\includegraphics(?:\[.*?\])?\{(https?:\/\/[^}]+)\}/g, (_, src) => pushImg(src));

    // 2. Bảo vệ mã hình vẽ TikZ (<script type="text/tikz"> hoặc \begin{tikzpicture}...\end{tikzpicture})
    const tikzTokens = [];
    processed = processed.replace(/<script\s+type=["']text\/tikz["'][^>]*>([\s\S]*?)<\/script>/gi, (_, code) => {
      const tok = `@@QM_TIKZ_${tikzTokens.length}@@`;
      tikzTokens.push(`<div class="qm-tikz-holder" data-tikz="${U.esc(code.trim())}">⏳ Đang tải hình vẽ...</div>`);
      return ` ${tok} `;
    });
    processed = processed.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/gi, (code) => {
      const tok = `@@QM_TIKZ_${tikzTokens.length}@@`;
      tikzTokens.push(`<div class="qm-tikz-holder" data-tikz="${U.esc(code.trim())}">⏳ Đang tải hình vẽ...</div>`);
      return ` ${tok} `;
    });

    // 3. Xử lý các lệnh toán học đặc thù của QMath / ex_test
    processed = unwrapImmini(processed);
    processed = replaceCustomMathCmd(processed, "heva*", "\\left\\{", "\\right.");
    processed = replaceCustomMathCmd(processed, "hoac*", "\\left[", "\\right.");
    processed = replaceCustomMathCmd(processed, "heva", "\\left\\{", "\\right.");
    processed = replaceCustomMathCmd(processed, "hoac", "\\left[", "\\right.");

    const regexMangledSystem = /\\left\s*([^\\]*(?:\\(?!(?:begin\{array\}|right))[^\\]*)*?)\s*\\begin\{array\}\s*\{[^{}]*\}\s*\\end\{array\}\s*\\right(?:\\\.|\.|\{|\})?\s*([\s\S]*?)\s*(?:\\\{|\\\}|\\\.|(?=\$))/g;
    processed = processed.replace(regexMangledSystem, (_, eq1, eq2) => {
      const clean1 = (eq1 || "").trim().replace(/^\\left\s*/, "");
      const clean2 = (eq2 || "").trim().replace(/^[.\\]+/, "").trim();
      return `\\begin{cases} ${clean1} \\\\ ${clean2} \\end{cases}`;
    });
    processed = processed.replace(/\\left\\\{\s*\\begin\{array\}\s*\{[^{}]*\}([\s\S]*?)\\end\{array\}\s*\\right\.?/g, "\\begin{cases}$1\\end{cases}");
    processed = processed.replace(/\\begin\{array\}\s*\{[^{}]*\}\s*\\end\{array\}/g, "");
    processed = processed.replace(/\\left([a-zA-Z0-9])/g, "$1");
    processed = processed.replace(/\\right([a-zA-Z0-9])/g, "$1");

    // 4. Dọn dẹp môi trường LaTeX thừa
    processed = processed.replace(/\\begin\{(?:ex|bt|vd|cau|question|center)\}(?:\[.*?\])?/gi, "");
    processed = processed.replace(/\\end\{(?:ex|bt|vd|cau|question|center)\}/gi, "");
    processed = processed.replace(/\\loigiai\s*\{/gi, "");
    processed = processed.replace(/\\arrow(?![a-zA-Z])/g, "\\rightarrow ");
    processed = processed.replace(/\\Arrow(?![a-zA-Z])/g, "\\Rightarrow ");
    processed = processed.replace(/\\centering/g, "");
    processed = processed.replace(/\\allowdisplaybreaks(\[.*?\])?/g, "");
    processed = processed.replace(/\\lq\\lq/g, '"').replace(/\\rq\\rq/g, '"').replace(/\\lq/g, '"').replace(/\\rq/g, '"');
    processed = processed.replace(/\\(?:wideparen|widearc|overparen|cung)\s*\{([^}]+)\}/g, "\\overset{\\frown}{$1}");
    processed = processed.replace(/\\(?:wideparen|widearc|overparen|cung)(?:\s+|(?=[A-Za-z]))([A-Za-z0-9]{1,4})\b/g, "\\overset{\\frown}{$1}");
    processed = processed.replace(/(^|[^\\])sđ(?=\s*\\overset\{\\frown\})/g, "$1\\text{sđ}\\;");
    processed = processed.replace(/\\(?:h|v)space\*?\{[^}]+\}/g, " ").replace(/\\(?:no)?indent/g, "");
    processed = processed.replace(/Click đúp để tải file|hoặc Ctrl \+ V để dán ảnh|ẢNH TỪ IMMINI|VỊ TRÍ HÌNH TIKZ|Ảnh minh họa \(immini\)|Ảnh canh giữa/gi, "");

    // Bỏ thẻ <div ...> hoặc </div> rác bao ngoài ảnh từ kho ngân hàng cũ
    processed = processed.replace(/<\/?(?:div|p|span)(?:\s+[^>]*)?>/gi, (tag) => {
      if (/^<\/?(?:div|p)/i.test(tag)) return "\n";
      return "";
    });

    // 5. Bảng & Danh sách LaTeX (itemchoice, itemch, tabular, enumEX...)
    processed = processTabular(processed);
    processed = processLatexLists(processed);

    processed = processed.trim().replace(/^\{([\s\S]*)\}$/, "$1");

    // 6. Tách phần Toán ($...$, $$...$$, \(...\), \[...\], \begin{...}...\end{...}) và thẻ HTML hợp lệ để xử lý xuống dòng \\ và \n
    const tagWhitelist = "div|span|p|br|img|table|tbody|thead|tr|td|th|ul|ol|li|b|i|u|strong|em|a";
    const splitRe = new RegExp(
      `(\\\\begin\\{[a-zA-Z*]+\\}[\\s\\S]*?\\\\end\\{[a-zA-Z*]+\\}|\\$\\$[\\s\\S]*?\\$\\$|\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\([\\s\\S]*?\\\\\\)|\\$[\\s\\S]*?\\$|<\\/?(?:${tagWhitelist})(?:\\s+[^>]*)?>)`,
      "gi"
    );

    const parts = processed.split(splitRe);
    let htmlOut = parts.map((part) => {
      if (!part) return "";
      const trimmed = part.trim();
      const isMath =
        trimmed.startsWith("$") ||
        trimmed.startsWith("\\(") ||
        trimmed.startsWith("\\[") ||
        trimmed.startsWith("\\begin{");
      const isTag = part.startsWith("<") && part.endsWith(">");

      if (isMath) {
        return part.replace(/<br\s*\/?>/gi, " \\\\ ").replace(/</g, " &lt; ");
      }
      if (isTag) {
        return part;
      }

      // Văn bản thường ngoài công thức Toán: nhận diện URL ảnh trần còn sót, mã hóa ký tự <, đổi \\ và \n thành <br>
      const urlRe = /(?:https?:\/\/[^\s<>"']+|data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
      let seg = "", last = 0, m;
      while ((m = urlRe.exec(part))) {
        const url = /^data:image\//i.test(m[0]) ? m[0] : m[0].replace(/[),.;:!?\]}]+$/, "");
        seg += transformPlainText(part.slice(last, m.index));
        seg += Quiz.isImgUrl(url)
          ? imgTag(url)
          : `<a href="${U.esc(url)}" target="_blank" rel="noopener">${U.esc(url.length > 48 ? url.slice(0, 45) + "…" : url)}</a>`;
        last = m.index + url.length;
      }
      seg += transformPlainText(part.slice(last));
      return seg;
    }).join("");

    // 7. Khôi phục token ảnh và TikZ
    imgTokens.forEach((html, idx) => {
      htmlOut = htmlOut.replace(`@@QM_IMG_${idx}@@`, html);
    });
    tikzTokens.forEach((html, idx) => {
      htmlOut = htmlOut.replace(`@@QM_TIKZ_${idx}@@`, html);
    });

    // Dọn các thẻ <br> thừa liên tiếp
    htmlOut = htmlOut
      .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>")
      .replace(/^(?:<br\s*\/?>\s*)+|(?:<br\s*\/?>\s*)+$/gi, "")
      .replace(/(<br\s*\/?>\s*)+(<span class="q-imgw")/gi, "<br>$2")
      .replace(/(<\/span>)(\s*<br\s*\/?>)+/gi, "$1<br>");

    return htmlOut;
  };

  function transformPlainText(str) {
    if (!str) return "";
    let s = U.esc(str);
    s = s.replace(/\\%/g, "%");
    s = s.replace(/\\textbf\{([^}]+)\}/g, "<b>$1</b>");
    s = s.replace(/\\textit\{([^}]+)\}/g, "<i>$1</i>");
    s = s.replace(/\\underline\{([^}]+)\}/g, "<u>$1</u>");
    s = s.replace(/\\rightarrow/g, "→").replace(/\\Rightarrow/g, "⇒");
    s = s.replace(/\\hfill/g, '<span style="display:inline-block;width:1.5rem"></span>');
    s = s.replace(/\\\\/g, "<br>").replace(/\n/g, "<br>");
    return s;
  }

  Quiz.rich = (text) => Quiz.formatQMathContent(text);

  const tikzCache = new Map();
  async function compileTikzBlocksInElement(el) {
    if (!el || !el.querySelectorAll) return;
    const holders = el.querySelectorAll(".qm-tikz-holder[data-tikz]");
    if (!holders.length) return;
    holders.forEach(async (holder) => {
      const rawCode = holder.getAttribute("data-tikz") || "";
      holder.removeAttribute("data-tikz");
      if (!rawCode) return;
      if (tikzCache.has(rawCode)) {
        holder.outerHTML = imgTag(tikzCache.get(rawCode));
        return;
      }
      try {
        let code = rawCode
          .replace(/AMP_PLACEHOLDER/g, "&")
          .replace(/\\widecheck/g, "\\widehat");
        if (!code.includes("\\usetikzlibrary")) {
          code = "\\usetikzlibrary{calc,arrows.meta,angles,quotes,intersections,patterns,shapes,positioning}\n" + code;
        }
        const endpoints = ["https://api.qmath.io.vn/compile", "https://compile.qmath.io.vn/compile"];
        let compiledUrl = "";
        for (const ep of endpoints) {
          try {
            const resp = await fetch(ep, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code })
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data && data.url && !data.url.includes("Image+Error")) {
                compiledUrl = data.url;
                break;
              }
            }
          } catch (e) {}
        }
        if (compiledUrl) {
          tikzCache.set(rawCode, compiledUrl);
          holder.outerHTML = imgTag(compiledUrl);
        } else {
          holder.remove();
        }
      } catch (e) {
        holder.remove();
      }
    });
  }

  Quiz.typeset = (el) => {
    if (!el) return;
    compileTikzBlocksInElement(el);
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        macros: {
          "\\heva": "\\left\\{\\begin{aligned}#1\\end{aligned}\\right.",
          "\\hoac": "\\left[\\begin{aligned}#1\\end{aligned}\\right.",
          "\\overparen": "\\overset{\\frown}{#1}",
          "\\wideparen": "\\overset{\\frown}{#1}",
          "\\widearc": "\\overset{\\frown}{#1}",
          "\\cung": "\\overset{\\frown}{#1}",
          "\\vec": "\\overrightarrow{#1}"
        },
        throwOnError: false,
        ignoredClasses: ["no-math"]
      });
    } catch (e) {}
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
