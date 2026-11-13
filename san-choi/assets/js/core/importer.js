/* =========================================================
   importer.js — Nhập / xuất câu hỏi: Word (.docx), LaTeX (.tex), JSON & Excel (SheetJS)
   Đồng bộ 100% cơ chế đọc Word (.docx) từ exam-editor.html:
   - Chuyển đổi công thức MathType sang LaTeX qua API cấu hình QMath LMS
   - Giải mã hình ảnh vector EMF/WMF từ Word sang PNG độ nét cao qua emf-converter.js
   - Bảo toàn hình ảnh nhúng, bảng số liệu, gạch chân đáp án đúng (<u>A.</u>)
   ========================================================= */
(function () {
  const COLS = ["Id", "Type", "Level", "Grade", "Subject", "Chapter", "Topic", "Question", "A", "B", "C", "D", "CorrectAnswer", "Explain", "ParentId"];
  const ALIAS = {
    id: "Id", "mã": "Id", "ma": "Id", "mã câu": "Id", type: "Type", "loại": "Type", "loai": "Type", "dạng": "Type",
    level: "Level", "mức độ": "Level", "muc do": "Level", "mức": "Level", grade: "Grade", "lớp": "Grade", "lop": "Grade", "khối": "Grade",
    subject: "Subject", "môn": "Subject", "mon": "Subject", "môn học": "Subject", chapter: "Chapter", "chương": "Chapter", "chuong": "Chapter",
    topic: "Topic", "chủ đề": "Topic", "chu de": "Topic", "bài": "Topic", question: "Question", "câu hỏi": "Question", "cau hoi": "Question", "nội dung": "Question", "đề bài": "Question",
    a: "A", b: "B", c: "C", d: "D", "phương án a": "A", "phương án b": "B", "phương án c": "C", "phương án d": "D",
    correctanswer: "CorrectAnswer", answer: "CorrectAnswer", "đáp án": "CorrectAnswer", "dap an": "CorrectAnswer", "đáp án đúng": "CorrectAnswer",
    explain: "Explain", "lời giải": "Explain", "giải thích": "Explain", "loi giai": "Explain", "hướng dẫn": "Explain",
    parentid: "ParentId", parent: "ParentId", "nhóm": "ParentId", "thuộc nhóm": "ParentId", "id cha": "ParentId"
  };
  const TYPE_ALIAS = { "TN": "MC", "TRẮC NGHIỆM": "MC", "MC": "MC", "ĐS": "TF", "ĐÚNG SAI": "TF", "DS": "TF", "TF": "TF", "TLN": "SA", "TRẢ LỜI NGẮN": "SA", "SHORT": "SA", "SA": "SA", "TỰ LUẬN": "LA", "TL": "LA", "ESSAY": "LA", "NHÓM": "Group", "GROUP": "Group" };
  const META = ["Level", "Grade", "Subject", "Chapter", "Topic"];
  const MAMMOTH_URL = "https://unpkg.com/mammoth@1.12.1/mammoth.browser.min.js";

  function normType(t, isChild) {
    let u = String(t || "").trim().toUpperCase();
    u = TYPE_ALIAS[u] || u;
    if (u === "Group" || u === "GROUP") return "Group";
    if (u.startsWith("GROUP")) return "Group" + u.slice(5);
    if (isChild && ["MC", "TF", "SA", "LA"].includes(u)) return "Group" + u;
    return ["MC", "TF", "SA", "LA"].includes(u) ? u : (u || "MC");
  }

  function cleanQ(q, isChild) {
    const o = {};
    o.Id = String(q.Id || q.id || "").trim();
    o.Type = normType(q.Type || q.type, isChild);
    META.forEach((k) => (o[k] = q[k] != null ? String(q[k]).trim() : ""));
    if (q.mapId) o.mapId = String(q.mapId).trim();
    if (q.cccd) o.cccd = String(q.cccd).trim();
    o.Question = q.Question != null ? String(q.Question) : "";
    const base = Quiz.baseType(o.Type);
    if (base === "MC" || base === "TF") {
      const src = q.Options || {};
      const keys = base === "MC" ? ["A", "B", "C", "D", "E", "F"] : ["a", "b", "c", "d"];
      o.Options = {};
      keys.forEach((k) => {
        const v = src[k] != null ? src[k] : src[k.toUpperCase()] != null ? src[k.toUpperCase()] : src[k.toLowerCase()];
        if (v != null && String(v).trim() !== "") o.Options[k] = String(v);
      });
    }
    if (q.CorrectAnswer != null && base !== "LA" && base !== "Group") o.CorrectAnswer = String(q.CorrectAnswer).trim();
    if (q.Explain) o.Explain = String(q.Explain);
    if (base === "Group") o.children = (q.children || []).map((c) => cleanQ(c, true));
    return o;
  }

  function validate(q) {
    const t = Quiz.baseType(q.Type), errs = [];
    if (!q.Question && t !== "Group") errs.push("thiếu nội dung câu hỏi");
    if (t === "MC") {
      if (Object.keys(q.Options || {}).length < 2) errs.push("cần ≥ 2 phương án");
      if (!/^[A-F]$/i.test(q.CorrectAnswer || "")) errs.push("đáp án MC phải là A–D");
    }
    if (t === "TF") {
      if (!q.Options || !Object.keys(q.Options).length) errs.push("thiếu các ý a–d");
      if (!/^[ĐDSTF01đs]{1,4}$/i.test(String(q.CorrectAnswer || "").replace(/[\s,;\-]/g, ""))) errs.push("đáp án TF dạng ĐSĐS");
    }
    if (t === "SA" && !q.CorrectAnswer) errs.push("thiếu đáp án");
    if (t === "Group" && !(q.children || []).length) errs.push("nhóm chưa có câu con");
    return errs;
  }

  const IO = { COLS };

  IO.needMammoth = async () => {
    if (!window.mammoth) await U.loadScript(MAMMOTH_URL);
    return window.mammoth;
  };

  /* ---------- Nạp mô-đun giải mã ảnh vector EMF/WMF (dùng chung với exam-editor.html) ---------- */
  async function ensureEmfConverter() {
    if (typeof window.convertMetafileToDataUrl === "function") return window.convertMetafileToDataUrl;
    try {
      const emfUrl = new URL("../emf-converter.js?v=20260925", window.location.href).href;
      const emfMod = await import(emfUrl);
      if (emfMod && typeof emfMod.convertMetafileToDataUrl === "function") {
        window.convertMetafileToDataUrl = emfMod.convertMetafileToDataUrl;
        return window.convertMetafileToDataUrl;
      }
    } catch (e) {
      console.warn("[Word Import] Không thể nạp emf-converter.js:", e);
    }
    return null;
  }

  /* ---------- Làm sạch công thức Toán từ Word / MathType (chuẩn exam-editor.html) ---------- */
  function cleanWordMathLatex(str, tokenVault) {
    if (!str || typeof str !== "string") return str || "";
    const regexMangledSystem = /\\left\s*([^\\]*(?:\\(?!(?:begin\{array\}|right))[^\\]*)*?)\s*\\begin\{array\}\s*\{[^{}]*\}\s*\\end\{array\}\s*\\right(?:\\\.|\.|\{|\})?\s*([\s\S]*?)\s*(?:\\\{|\\\}|\\\.|(?=\$))/g;
    str = str.replace(regexMangledSystem, (_, eq1, eq2) => {
      const clean1 = (eq1 || "").trim().replace(/^\\left\s*/, "");
      const clean2 = (eq2 || "").trim().replace(/^[.\s]+/, "").replace(/^\\\./, "").replace(/\\\{$/, "").trim();
      return `\\begin{cases} ${clean1} \\\\ ${clean2} \\end{cases}`;
    });
    str = str.replace(/\\left\\\{\s*\\begin\{array\}\s*\{[^{}]*\}([\s\S]*?)\\end\{array\}\s*\\right\.?/g, "\\begin{cases}$1\\end{cases}");
    str = str.replace(/\\left\[\s*\\begin\{array\}\s*\{[^{}]*\}([\s\S]*?)\\end\{array\}\s*\\right\]/g, "\\begin{bmatrix}$1\\end{bmatrix}");
    str = str.replace(/\\begin\{array\}\s*\{[^{}]*\}\s*\\end\{array\}/g, "");
    str = str.replace(/\\left([a-zA-Z0-9])/g, "$1");
    str = str.replace(/\\right([a-zA-Z0-9])/g, "$1");

    // Khôi phục bảng HTML và ảnh nhúng từ token
    if (tokenVault) {
      if (Array.isArray(tokenVault.tables)) {
        tokenVault.tables.forEach((tblHtml, idx) => {
          str = str.split(`[[WORD_TABLE_${idx}]]`).join(tblHtml);
        });
      }
      if (Array.isArray(tokenVault.images)) {
        tokenVault.images.forEach((imgHtml, idx) => {
          str = str.split(`[[WORD_IMG_${idx}]]`).join(imgHtml);
        });
      }
    }
    return str.trim();
  }
  IO.cleanWordMathLatex = cleanWordMathLatex;

  /* ---------- Chuyển HTML từ Mammoth sang văn bản chuẩn hóa để bóc tách (chuẩn exam-editor.html) ---------- */
  function wordHtmlToImportText(html) {
    const source = new DOMParser().parseFromString(html || "", "text/html");
    const wordTables = [];
    const wordImages = [];

    // 1. Nhận diện thẻ gạch chân <u> trên chữ cái phương án A, B, C, D hoặc a, b, c, d
    source.querySelectorAll("u").forEach((underlined) => {
      const txt = (underlined.textContent || "").trim();
      const label = txt.match(/^\*?([A-Da-d])\s*[\.\)\:]?$/);
      if (label) {
        underlined.before(document.createTextNode(` [[WORD_UNDERLINE_${label[1].toUpperCase()}]] `));
      } else {
        const prefixMatch = txt.match(/^\*?([A-Da-d])\s*[\.\)\:]\s+/);
        if (prefixMatch) {
          underlined.before(document.createTextNode(` [[WORD_UNDERLINE_${prefixMatch[1].toUpperCase()}]] `));
        }
      }
    });

    // 2. Kiểm tra xem văn bản Word đã có sẵn các nhãn "Câu 1.", "Câu 2." được gõ tay hay chưa
    const rawBodyText = source.body.textContent || "";
    const explicitMatches = rawBodyText.match(/(?:^|\n|\s)(?:Câu|Bài)\s*\d+\s*[\.:]/gi) || [];
    const hasExplicitQuestions = explicitMatches.length >= 2;

    // 3. Khôi phục đánh số tự động <ol><li> của Word thành "Câu 1.", "Câu 2."
    let questionNumber = 1;
    source.querySelectorAll("ol").forEach((ol) => {
      if (ol.closest("table")) return;
      Array.from(ol.children).filter((child) => child.tagName === "LI").forEach((item) => {
        const itemText = (item.textContent || "").trim();
        if (/^\s*(?:Câu|Bài)\s*\d+\s*[\.:]/i.test(itemText)) {
          const m = itemText.match(/^\s*(?:Câu|Bài)\s*(\d+)/i);
          if (m) questionNumber = Math.max(questionNumber, parseInt(m[1], 10) + 1);
          return;
        }
        if (hasExplicitQuestions) return;
        const isNotQuestion =
          /^\s*(?:Lời\s*giải|Hướng\s*dẫn|HDG|Mệnh\s*đề|Khẳng\s*định|TH\s*\d|Trường\s*hợp|Bước\s*\d|Cách\s*\d)\b/i.test(itemText) ||
          /^\s*\*?(?:[A-Da-d]\s*[\.\)]|\([A-Da-d]\))\s*/i.test(itemText) ||
          /^\s*(?:Đáp\s*án|Đáp\s*số|Kết\s*quả)\s*[:=]/i.test(itemText) ||
          /^\s*[+\-*•–—>]\s*/i.test(itemText) ||
          /^\s*(?:Đúng|Sai)\s*$/i.test(itemText);
        if (!isNotQuestion) {
          item.insertBefore(document.createTextNode(`Câu ${questionNumber}. `), item.firstChild);
          questionNumber++;
        }
      });
    });

    // 4. Bảo vệ ảnh nhúng bằng token [[WORD_IMG_i]] trước khi xử lý bảng & textContent
    //    (để ảnh nằm trong bảng hoặc nằm trong phương án A/B/C/D không bao giờ bị mất hay làm nhiễu regex)
    source.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (/^(data:image\/|https?:\/\/)/i.test(src)) {
        const token = `[[WORD_IMG_${wordImages.length}]]`;
        wordImages.push(`<img src="${src}" alt="Hình minh họa">`);
        img.replaceWith(document.createTextNode(` ${token} `));
      } else {
        img.remove();
      }
    });

    // 5. Xử lý bảng:
    //    - Nếu bảng dùng để dàn trang 4 đáp án A. B. C. D. hoặc câu hỏi -> giải phóng các ô thành dòng văn bản
    //    - Nếu bảng là bảng số liệu / bảng biến thiên -> giữ nguyên HTML table qua token [[WORD_TABLE_i]]
    source.querySelectorAll("table").forEach((table) => {
      const tblText = (table.textContent || "").trim();
      const hasQuestionLabels = /(?:^|\n|\s)(?:Câu|Bài)\s*\d+\s*[\.:]/i.test(tblText);
      const hasMcOptions = /(?:^|\s)A\s*[\.\):][\s\S]+(?:^|\s)B\s*[\.\):]/i.test(tblText);
      if (hasQuestionLabels || hasMcOptions) {
        table.querySelectorAll("td, th").forEach((cell) => cell.append("   "));
        table.querySelectorAll("tr").forEach((tr) => tr.append("\n"));
      } else {
        table.classList.add("qm-latex-tbl");
        table.setAttribute("border", "1");
        table.querySelectorAll("td, th").forEach((cell) => {
          cell.setAttribute("style", "border:1px solid #cbd5e1;padding:6px 10px;vertical-align:top;");
        });
        const token = `[[WORD_TABLE_${wordTables.length}]]`;
        wordTables.push(`<div class="qm-tbl-wrap">${table.outerHTML}</div>`);
        table.replaceWith(document.createTextNode(` ${token} `));
      }
    });

    source.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
    source.querySelectorAll("p, div, li, tr, h1, h2, h3, h4").forEach((el) => el.append("\n"));

    const text = (source.body.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      text,
      vault: {
        tables: wordTables,
        images: wordImages
      }
    };
  }
  IO.wordHtmlToImportText = wordHtmlToImportText;

  /* ---------- Bóc tách danh sách câu hỏi từ văn bản Word ---------- */
  IO.parseWordText = (rawInput, externalVault) => {
    const textObj = typeof rawInput === "object" && rawInput !== null && "text" in rawInput
      ? rawInput
      : { text: String(rawInput || ""), vault: externalVault || { tables: [], images: [] } };
    const vault = textObj.vault || { tables: [], images: [] };
    let text = String(textObj.text || "").replace(/\r/g, "").trim();
    if (!text) return [];

    // 1. Tách phần sau chữ "HẾT" hoặc "BẢNG ĐÁP ÁN" để dò bảng đáp án tổng hợp cuối đề (nếu có)
    const endKeyMap = {};
    const hetMatch = /(?:^|\n)\s*[-–—_*\s#]*\b(?:HẾT|Hết|BẢNG\s*ĐÁP\s*ÁN)\b[-–—_*\s#.:]*\s*(?:\n|$)/i.exec(text);
    let tailText = "";
    if (hetMatch) {
      tailText = text.slice(hetMatch.index);
      text = text.slice(0, hetMatch.index).trim();
      const ansPairs = [...tailText.matchAll(/(?:Câu\s*)?(\d{1,3})\s*[\.\-:)\s]\s*([ABCD])\b/gi)];
      ansPairs.forEach((m) => {
        const num = String(parseInt(m[1], 10));
        if (!endKeyMap[num]) endKeyMap[num] = m[2].toUpperCase();
      });
    }

    const questionStarts = [...text.matchAll(/(?:^|\n)\s*(?:##\s*)?(?:Câu|Bài)\s*(\d+)\s*[\.:]/gi)];
    if (!questionStarts.length) return [];

    function stripTrailingSectionHeaders(str) {
      if (!str) return "";
      return str
        .replace(/(?:^|\n)\s*(?:PHẦN\s*[I|V|X\d]+|Phần\s*tự\s*luận)[\s\S]*$/i, "")
        .replace(/(?:^|\n)\s*(?:Trả\s*lời|Thí\s*sinh)[^\n]*(?:từ\s*câu|đến\s*câu)[\s\S]*$/i, "")
        .trim();
    }

    const out = [];
    questionStarts.forEach((match, index) => {
      const qNum = String(parseInt(match[1], 10) || index + 1);
      const start = match.index + match[0].length;
      const end = index + 1 < questionStarts.length ? questionStarts[index + 1].index : text.length;
      let body = text.slice(start, end).trim();

      body = body.replace(/^(?:PHẦN\s*[I|V|X\d]+|Phần\s*tự\s*luận)[^\n]*\n+/i, "").trim();

      // Lấy các nhãn gạch chân [[WORD_UNDERLINE_A]]
      const underlinedLabels = [...body.matchAll(/\[\[WORD_UNDERLINE_([A-D])\]\]/g)].map((m) => m[1].toUpperCase());
      body = body.replace(/\[\[WORD_UNDERLINE_[A-D]\]\]/g, "");

      // Tách phần Lời giải
      let solution = "";
      const solutionMatch = /(?:^|\n)\s*(?:Lời\s*giải|Hướng\s*dẫn(?:\s*giải)?|HDG)\s*[:.]?/im.exec(body);
      if (solutionMatch) {
        solution = body.slice(solutionMatch.index + solutionMatch[0].length).trim();
        body = body.slice(0, solutionMatch.index).trim();
      }
      if (solution) solution = stripTrailingSectionHeaders(solution);
      else body = stripTrailingSectionHeaders(body);

      // Trích xuất mức độ [NB], [TH], [VD], [VDC] hoặc mã MapID [9D1H2-1]
      let level = "Nhận biết";
      let grade = "";
      let subject = "Toán";
      let mapId = "";

      const tagMatches = [...body.matchAll(/\[\s*([A-Za-z0-9_\-]+)\s*\]/g)];
      tagMatches.forEach((tm) => {
        const tok = tm[1].toUpperCase();
        if (tok.startsWith("WORD_")) return;
        if (tok === "NB") level = "Nhận biết";
        else if (tok === "TH") level = "Thông hiểu";
        else if (tok === "VD") level = "Vận dụng";
        else if (tok === "VDC") level = "Vận dụng cao";
        else if (/^(\d+)([A-Z]+)(\d+)([NHVCYBKGC])(\d*)(?:-([A-Za-z0-9]+))?$/i.test(tok)) {
          mapId = tok;
        }
      });
      body = body.replace(/^\s*\[\s*(?:NB|TH|VD|VDC)\s*\]\s*/i, "");
      if (mapId) {
        body = body.replace(new RegExp("\\[\\s*" + mapId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\s*\\]\\s*", "i"), "");
        const m = mapId.match(/^(\d+)([A-Z]+)(\d+)([NHVCYBKGC])/i);
        if (m) {
          const gCode = m[1];
          grade = gCode === "0" ? "10" : gCode === "1" ? "11" : gCode === "2" ? "12" : gCode;
          const sCode = m[2].toUpperCase();
          if (sCode === "D" || sCode === "DS") subject = "Đại số";
          else if (sCode === "H" || sCode === "HH") subject = "Hình học";
          else if (sCode === "X" || sCode === "XS") subject = "Xác suất";
          else if (sCode === "G") subject = "Giải tích";
          const lCode = m[4].toUpperCase();
          if (lCode === "N" || lCode === "Y") level = "Nhận biết";
          else if (lCode === "H" || lCode === "B") level = "Thông hiểu";
          else if (lCode === "V" || lCode === "K") level = "Vận dụng";
          else if (lCode === "C" || lCode === "G") level = "Vận dụng cao";
        }
      }

      // Kiểm tra đánh dấu sao *A. hoặc *a)
      const starredMC = [];
      const starredTF = [];
      body = body.replace(/(?:^|\n|\s)\*([ABCD])(\s*[\.\)\:])/g, (_, l, sep) => {
        starredMC.push(l.toUpperCase());
        return ` ${l}${sep}`;
      });
      body = body.replace(/(?:^|\n|\s)\*([a-d])(\s*[\.\)])/gi, (_, l, sep) => {
        starredTF.push(l.toUpperCase());
        return `\n${l.toLowerCase()}${sep}`;
      });

      // 1. Dò phương án MC: A. B. C. D.
      const optionMatches = [...body.matchAll(/(?:^|\n|\s)([ABCD])\s*[\.\)\:]\s*/g)];

      // 2. Dò mệnh đề Đúng/Sai: a) b) c) d)
      const tfMatches = [...body.matchAll(/(?:^|\n|\s)([a-d])\s*[\.\)]\s*/gi)];
      const hasDsBadge = /(?:\[\s*(?:ĐS|Đ\/S|Đúng\s*[\/,-]?\s*Sai)\s*\]|\(\s*Đúng\s*[\/,-]?\s*Sai\s*\)|tính\s*đúng[\s,/-]*sai|khẳng\s*định\s*sau|mệnh\s*đề\s*sau)/i.test(body);
      const isTrueFalse = tfMatches.length >= 4 && (optionMatches.length < 4 || hasDsBadge);

      // 3. Dò câu Trả lời ngắn: "Đáp án: ...", "Đáp số: ...", "Kết quả: ...", "<key=...>"
      const shortAnsRegex = /(?:^|\n|\b)(?:Đáp\s*án|Đáp\s*số|Kết\s*quả)\s*[:=]\s*([^\n\r]+)|<key\s*=\s*([^>]+)>/i;
      const shortInSolution = shortAnsRegex.exec(solution);
      const shortInBody = shortAnsRegex.exec(body);
      const shortMatch = shortInSolution || shortInBody;

      const qId = `W${String(out.length + 1).padStart(3, "0")}`;

      if (isTrueFalse) {
        const stem = cleanWordMathLatex(
          body.slice(0, tfMatches[0].index)
            .replace(/\[\s*(?:ĐS|Đ\/S|Đúng\s*[\/,-]?\s*Sai)\s*\]|\(\s*Đúng\s*[\/,-]?\s*Sai\s*\)/gi, "")
            .trim(),
          vault
        );
        const opts = {};
        const tfKeys = ["a", "b", "c", "d"];
        let ansChars = "";

        let explicitPattern = "";
        const patMatch = /(?:Đáp\s*án|Kết\s*quả)\s*[:=]?\s*([ĐDS][\s,\-–—/]*[ĐDS][\s,\-–—/]*[ĐDS][\s,\-–—/]*[ĐDS])/i.exec(solution || body);
        if (patMatch) {
          explicitPattern = patMatch[1].toUpperCase().replace(/[^ĐDS]/g, "").replace(/D/g, "Đ");
        }

        tfMatches.slice(0, 4).forEach((st, idx) => {
          const stStart = st.index + st[0].length;
          const stEnd = idx < 3 ? tfMatches[idx + 1].index : body.length;
          let rawText = stripTrailingSectionHeaders(body.slice(stStart, stEnd).trim());
          const answerMatch = /(?:\[\s*(Đúng|Sai|Đ|S)\s*\]|\(\s*(Đúng|Sai|Đ|S)\s*\)|[-–—:]\s*(Đúng|Sai))\s*$/i.exec(rawText);
          const labelUpper = tfKeys[idx].toUpperCase();

          let isTrue = false;
          if (explicitPattern.length === 4) {
            isTrue = explicitPattern[idx] === "Đ";
          } else if (answerMatch) {
            const tok = (answerMatch[1] || answerMatch[2] || answerMatch[3] || "").toLowerCase();
            isTrue = tok === "đúng" || tok === "đ";
          } else if (underlinedLabels.length > 0 || starredTF.length > 0) {
            isTrue = underlinedLabels.includes(labelUpper) || starredTF.includes(labelUpper);
          } else if (solution) {
            const solMatch = new RegExp("(?:^|\\n|\\b)(?:mệnh\\s*đề\\s*|khẳng\\s*định\\s*|ý\\s*)?" + tfKeys[idx] + "\\s*[:.)\\-–—]?\\s*(?:là\\s*)?(đúng|sai)\\b", "i").exec(solution);
            if (solMatch && solMatch[1].toLowerCase() === "đúng") isTrue = true;
          }

          opts[tfKeys[idx]] = cleanWordMathLatex(
            rawText.replace(/(?:\[\s*(?:Đúng|Sai|Đ|S)\s*\]|\(\s*(?:Đúng|Sai|Đ|S)\s*\)|[-–—:]\s*(?:Đúng|Sai))\s*$/i, "").trim(),
            vault
          );
          ansChars += isTrue ? "Đ" : "S";
        });

        out.push(cleanQ({
          Id: qId,
          Type: "TF",
          Level: level,
          Grade: grade,
          Subject: subject,
          mapId: mapId,
          Question: stem,
          Options: opts,
          CorrectAnswer: ansChars || "ĐSĐS",
          Explain: cleanWordMathLatex(solution, vault)
        }));
      } else if (optionMatches.length >= 4) {
        const stem = cleanWordMathLatex(body.slice(0, optionMatches[0].index).trim(), vault);
        const opts = {};
        const mcKeys = ["A", "B", "C", "D"];
        optionMatches.slice(0, 4).forEach((opt, idx) => {
          const optStart = opt.index + opt[0].length;
          const optEnd = idx < 3 ? optionMatches[idx + 1].index : body.length;
          let optText = body.slice(optStart, optEnd).trim();
          optText = optText.replace(/(?:^|\n)\s*(?:Chọn|Đáp\s*án)\s*[:\-]?\s*[ABCD]\s*\.?\s*$/i, "").trim();
          opts[mcKeys[idx]] = cleanWordMathLatex(optText, vault);
        });

        let correct = "";
        const solCorrectMatch = /(?:chọn|đáp\s*án(?:\s*đúng)?(?:\s*là)?)\s*[:\-=]?\s*([ABCD])\b/i.exec(solution || body);
        if (underlinedLabels.length > 0) {
          correct = underlinedLabels[0];
        } else if (starredMC.length > 0) {
          correct = starredMC[0];
        } else if (solCorrectMatch) {
          correct = solCorrectMatch[1].toUpperCase();
        } else if (endKeyMap[qNum]) {
          correct = endKeyMap[qNum];
        } else {
          correct = "A";
        }

        out.push(cleanQ({
          Id: qId,
          Type: "MC",
          Level: level,
          Grade: grade,
          Subject: subject,
          mapId: mapId,
          Question: stem,
          Options: opts,
          CorrectAnswer: correct,
          Explain: cleanWordMathLatex(solution, vault)
        }));
      } else if (shortMatch) {
        let rawAns = (shortMatch[1] || shortMatch[2] || "").trim();
        rawAns = rawAns.replace(/^\$+|\$+$/g, "").replace(/\{([.,])\}/g, "$1").replace(/\.$/, "").trim();
        const stem = cleanWordMathLatex(
          body
            .replace(/(?:^|\n)\s*(?:Đáp\s*án|Đáp\s*số|Kết\s*quả)\s*[:=]\s*[^\n\r]+/i, "")
            .replace(/<key\s*=\s*[^>]+>/gi, "")
            .trim(),
          vault
        );
        out.push(cleanQ({
          Id: qId,
          Type: "SA",
          Level: level,
          Grade: grade,
          Subject: subject,
          mapId: mapId,
          Question: stem,
          CorrectAnswer: cleanWordMathLatex(rawAns, vault),
          Explain: cleanWordMathLatex(solution, vault)
        }));
      }
    });

    return out;
  };

  /* ---------- Đọc file Word (.docx) bằng Mammoth + MathType API + EMF/WMF-to-PNG (y hệt exam-editor.html) ---------- */
  function extractEmbeddedRaster(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (!bytes || bytes.length < 16) return null;
    for (let i = 0; i <= bytes.length - 16; i++) {
      if (bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x47 &&
          bytes[i + 4] === 0x0d && bytes[i + 5] === 0x0a && bytes[i + 6] === 0x1a && bytes[i + 7] === 0x0a) {
        for (let k = i + 8; k <= bytes.length - 8; k++) {
          if (bytes[k] === 0x49 && bytes[k + 1] === 0x45 && bytes[k + 2] === 0x4e && bytes[k + 3] === 0x44) {
            return { mime: "image/png", data: bytes.subarray(i, k + 8) };
          }
        }
      }
    }
    for (let i = 0; i <= bytes.length - 4; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
        for (let k = i + 3; k <= bytes.length - 2; k++) {
          if (bytes[k] === 0xff && bytes[k + 1] === 0xd9) {
            return { mime: "image/jpeg", data: bytes.subarray(i, k + 2) };
          }
        }
      }
    }
    return null;
  }

  function uint8ArrayToBase64(bytes) {
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 16384;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  IO.parseDocx = async (buf, fileObj) => {
    const mammoth = await IO.needMammoth();
    await ensureEmfConverter();
    let arrayBuffer = buf;

    // 1. Gọi dịch vụ chuyển đổi MathType sang LaTeX giống hệt exam-editor.html
    if (window.QMathBridge && typeof window.QMathBridge.getMathTypeApiUrl === "function") {
      try {
        const apiUrl = await window.QMathBridge.getMathTypeApiUrl();
        if (apiUrl) {
          U.toast("⏳ Đang chuyển công thức MathType sang LaTeX...", "info", 2500);
          const fd = new FormData();
          const uploadFile = fileObj || new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
          fd.append("file", uploadFile, (fileObj && fileObj.name) || "questions.docx");
          const resp = await fetch(apiUrl, { method: "POST", body: fd });
          if (resp.ok) {
            arrayBuffer = await resp.arrayBuffer();
          } else {
            console.warn("[Word Import] MathType API trả về HTTP " + resp.status);
          }
        }
      } catch (e) {
        console.warn("[Word Import] Lỗi gọi MathType API, tiếp tục đọc file Word gốc:", e);
      }
    }

    // 2. Cấu hình Mammoth giải mã cả ảnh thường và ảnh vector EMF/WMF (công thức / hình vẽ Word) sang PNG
    const mammothOptions = {
      styleMap: ["u => u"],
      convertImage: mammoth.images.imgElement((element) => {
        const contentType = element.contentType || "";
        if (contentType === "image/x-emf" || contentType === "image/x-wmf") {
          return element.readAsArrayBuffer().then(async (rawBuf) => {
            try {
              const ab = rawBuf instanceof ArrayBuffer
                ? rawBuf
                : rawBuf.buffer
                  ? rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength)
                  : new Uint8Array(rawBuf).buffer;

              // Ưu tiên 1: Trích xuất ảnh raster (PNG/JPEG) nhúng trong EMF/WMF
              const embedded = extractEmbeddedRaster(ab);
              if (embedded) {
                return { src: `data:${embedded.mime};base64,${uint8ArrayToBase64(embedded.data)}`, alt: "Hình minh họa" };
              }

              // Ưu tiên 2: Giải mã vector EMF/WMF sang PNG bằng emf-converter.js (giống exam-editor.html)
              if (typeof window.convertMetafileToDataUrl === "function") {
                const pngUrl = await window.convertMetafileToDataUrl(ab, { dpiScale: 2 });
                if (pngUrl) {
                  return { src: pngUrl, alt: "Hình minh họa" };
                }
              }
            } catch (e) {
              console.warn("[Word Import] Lỗi chuyển EMF/WMF sang PNG:", e);
            }
            const b64 = await element.readAsBase64String();
            return { src: `data:${contentType};base64,${b64}`, alt: "Hình minh họa" };
          });
        }
        return element.readAsBase64String().then((b64) => ({
          src: `data:${contentType || "image/png"};base64,${b64}`,
          alt: "Hình minh họa"
        }));
      })
    };

    const result = await mammoth.convertToHtml({ arrayBuffer }, mammothOptions);
    const extracted = wordHtmlToImportText(result.value);
    const questions = IO.parseWordText(extracted);
    if (!questions.length) {
      throw new Error("Không tìm thấy câu hỏi hợp lệ trong file Word (.docx). Hãy đảm bảo các câu bắt đầu bằng 'Câu 1.', 'Câu 2.' và bấm nút '📘 Hướng dẫn file Word' để xem mẫu chuẩn.");
    }
    return questions;
  };

  /* JSON: mảng câu hỏi hoặc {questions:[...]} hoặc OFFLINE_DATA */
  IO.parseJSON = (text) => {
    text = String(text).replace(/^\uFEFF/, "").trim();
    if (/^\s*(?:Câu|Bài)\s*\d+\s*[\.:]/im.test(text) && !text.startsWith("[") && !text.startsWith("{")) {
      return IO.parseWordText(text);
    }
    const m = text.match(/window\.OFFLINE_DATA\s*=\s*([\s\S]*?);?\s*$/);
    let data = JSON.parse(m ? m[1] : text);
    if (!Array.isArray(data)) data = data.questions || data.data || [];
    return data.map((q) => cleanQ(q));
  };

  /* Excel/CSV -> câu hỏi */
  IO.parseSheet = async (buf) => {
    const XLSX = await U.needXLSX();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
    const out = [], groups = {}; let lastGroup = null;
    rows.forEach((r) => {
      const q = { Options: {} };
      Object.keys(r).forEach((h) => {
        const key = ALIAS[String(h).trim().toLowerCase()] || (COLS.includes(String(h).trim()) ? String(h).trim() : null);
        if (!key) return;
        const v = r[h];
        if (["A", "B", "C", "D"].includes(key)) { if (String(v).trim() !== "") q.Options[key] = String(v); }
        else q[key] = v;
      });
      if (!q.Question && !q.Id && !Object.keys(q.Options).length) return;
      let t = normType(q.Type);
      const parentId = String(q.ParentId || "").trim();
      const isChild = !!parentId || (t.startsWith("Group") && t !== "Group");
      if (Quiz.baseType(t) === "TF") { const o = {}; Object.keys(q.Options).forEach((k) => (o[k.toLowerCase()] = q.Options[k])); q.Options = o; }
      delete q.ParentId;
      if (t === "Group") { q.children = []; const c = cleanQ(q); c.children = []; out.push(c); groups[c.Id] = c; lastGroup = c; return; }
      if (isChild) {
        const g = groups[parentId] || lastGroup;
        if (g) { q.Type = normType(q.Type, true); META.forEach((k) => { if (!q[k]) q[k] = g[k]; }); g.children.push(cleanQ(q, true)); return; }
      }
      out.push(cleanQ(q));
    });
    return out;
  };

  function texReadBalanced(str, startIdx, openCh = "{", closeCh = "}") {
    if (!str || startIdx < 0 || startIdx >= str.length) return null;
    const o = str.indexOf(openCh, startIdx);
    if (o === -1) return null;
    let depth = 0;
    for (let i = o; i < str.length; i++) {
      const ch = str[i];
      if (ch === "\\" && i + 1 < str.length) { i++; continue; }
      if (ch === openCh) depth++;
      else if (ch === closeCh) {
        depth--;
        if (depth === 0) {
          return { text: str.slice(o + 1, i), start: o, end: i, nextIdx: i + 1 };
        }
      }
    }
    return null;
  }

  function texSkipWsAndBracket(str, idx) {
    let i = idx;
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i < str.length && str[i] === "[") {
      const br = texReadBalanced(str, i, "[", "]");
      if (br) return br.nextIdx;
    }
    return i;
  }

  function texUnwrapImmini(str) {
    let out = String(str || "");
    let guard = 0;
    while (guard++ < 30) {
      const pos = out.search(/\\immini(?![a-zA-Z])/);
      if (pos === -1) break;
      let cursor = texSkipWsAndBracket(out, pos + 7);
      const arg1 = texReadBalanced(out, cursor, "{", "}");
      if (!arg1) break;
      const arg2 = texReadBalanced(out, arg1.nextIdx, "{", "}");
      if (!arg2) {
        out = out.slice(0, pos) + arg1.text + out.slice(arg1.nextIdx);
        continue;
      }
      const cleanSide = arg2.text
        .replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, "")
        .replace(/\\begin\{center\}|\\end\{center\}/g, "")
        .trim();
      const combined = cleanSide ? `${arg1.text.trim()}\n${cleanSide}` : arg1.text.trim();
      out = out.slice(0, pos) + combined + out.slice(arg2.nextIdx);
    }
    return out;
  }

  function cleanTexProseChunk(txt, itemState = { idx: 0 }) {
    let s = String(txt || "");
    s = s.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, "");
    s = s.replace(/\\begin\{(?:center|flushleft|flushright)\}|\\end\{(?:center|flushleft|flushright)\}/g, "");
    s = s.replace(/\\begin\{itemchoice\}/g, () => {
      itemState.idx = 0;
      return "\n";
    }).replace(/\\end\{itemchoice\}/g, "");
    s = s.replace(/\\itemch(?![a-zA-Z])/g, () => {
      const lbl = ["a)", "b)", "c)", "d)"][itemState.idx++] || "•";
      return `\n${lbl} `;
    });
    s = s.replace(/\\begin\{(?:itemize|enumerate)\}/g, "\n").replace(/\\end\{(?:itemize|enumerate)\}/g, "");
    s = s.replace(/\\item(?![a-zA-Z])\s*/g, "\n• ");
    s = s.replace(/\\(?:textbf|mathbf)\s*\{([^{}]*)\}/g, "<b>$1</b>");
    s = s.replace(/\\(?:textit|emph)\s*\{([^{}]*)\}/g, "<i>$1</i>");
    s = s.replace(/\\centerline\s*\{([^{}]*)\}/g, "$1");
    s = s.replace(/\\(?:noindent|centering|hfill|newline|par|medskip|bigskip|smallskip)\b/g, " ");
    s = s.replace(/\\\\(?:\s*\[[^\]]*\])?/g, "\n");
    s = s.replace(/~/g, " ");
    return s;
  }

  function cleanTexSegment(raw) {
    if (!raw) return "";
    let s = texUnwrapImmini(String(raw));
    s = s.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, "");
    const mathRe = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?:\\.|[^$])+\$)/g;
    const parts = s.split(mathRe);
    const itemState = { idx: 0 };
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        parts[i] = cleanTexProseChunk(parts[i], itemState);
      } else {
        parts[i] = parts[i].replace(/\{,\}/g, ",").replace(/\\colon\b/g, ":");
      }
    }
    return parts.join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/ {2,}/g, " ")
      .trim();
  }

  function parseTexMapIdMeta(rawId) {
    const meta = { mapId: "", Grade: "", Subject: "Toán", Level: "Nhận biết" };
    const id = String(rawId || "").trim().toUpperCase();
    const m = id.match(/^(\d+)([A-Z]+)(\d+)([NHVCYBKGC])(\d*)(?:-([A-Za-z0-9]+))?$/i);
    if (!m) return meta;
    meta.mapId = id;
    const gCode = m[1];
    meta.Grade = gCode === "0" ? "10" : gCode === "1" ? "11" : gCode === "2" ? "12" : gCode;
    const sCode = m[2].toUpperCase();
    if (sCode === "D" || sCode === "DS") meta.Subject = "Đại số";
    else if (sCode === "H" || sCode === "HH") meta.Subject = "Hình học";
    else if (sCode === "X" || sCode === "XS") meta.Subject = "Xác suất";
    else if (sCode === "G") meta.Subject = "Giải tích";
    const lCode = m[4].toUpperCase();
    if (lCode === "N" || lCode === "B") meta.Level = "Nhận biết";
    else if (lCode === "H" || lCode === "T") meta.Level = "Thông hiểu";
    else if (lCode === "V") meta.Level = "Vận dụng";
    else if (lCode === "C") meta.Level = "Vận dụng cao";
    return meta;
  }

  IO.parseTex = (rawText) => {
    const text = String(rawText || "").replace(/\r/g, "");
    if (!text.trim()) return [];
    const blockRe = /\\begin\{(ex|bt)\}(?:\[([^\]]*)\])?(?:%\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g;
    const out = [];
    let match;
    let idx = 0;

    while ((match = blockRe.exec(text)) !== null) {
      idx++;
      const optArg = (match[2] || "").trim();
      const mapArg = (match[3] || "").trim();
      let rawBody = match[4] || "";

      // Trích xuất %[MapID] nếu nằm ở dòng đầu trong body trước khi loại bỏ comment %
      let mapCandidate = mapArg || (/^\s*%\[([^\]]+)\]/.test(rawBody) ? rawBody.match(/^\s*%\[([^\]]+)\]/)[1].trim() : "");
      if (!mapCandidate && optArg && !/^\d+$/.test(optArg)) mapCandidate = optArg;
      const meta = parseTexMapIdMeta(mapCandidate);
      const qId = (/^\d{4,}$/.test(optArg) ? optArg : "") || meta.mapId || `TEX_${String(idx).padStart(3, "0")}`;

      // Loại bỏ chú thích % không bị escape
      let body = rawBody.replace(/(^|[^\\])%[^\n]*/g, "$1").trim();

      // Tách \loigiai{...} ở cuối (nếu có)
      let explain = "";
      const lgIdx = body.lastIndexOf("\\loigiai");
      if (lgIdx !== -1) {
        const lgArg = texReadBalanced(body, lgIdx + 8, "{", "}");
        if (lgArg) {
          explain = cleanTexSegment(lgArg.text);
          body = (body.slice(0, lgIdx) + "\n" + body.slice(lgArg.nextIdx)).trim();
        }
      }

      const unwrappedBody = texUnwrapImmini(body).replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, "");
      const tfMatch = /\\choiceTF(?![a-zA-Z])/.exec(unwrappedBody);
      const mcMatch = /\\choice(?![a-zA-Z])/.exec(unwrappedBody);
      const saMatch = /\\shortans(?![a-zA-Z])/.exec(unwrappedBody);

      if (tfMatch) {
        const stem = cleanTexSegment(unwrappedBody.slice(0, tfMatch.index));
        let cursor = tfMatch.index + tfMatch[0].length;
        const opts = {};
        let ansChars = "";
        const keys = ["a", "b", "c", "d"];
        for (let i = 0; i < 4; i++) {
          const arg = texReadBalanced(unwrappedBody, cursor, "{", "}");
          if (!arg) break;
          cursor = arg.nextIdx;
          const isTrue = /\\True(?![a-zA-Z])/.test(arg.text);
          ansChars += isTrue ? "Đ" : "S";
          opts[keys[i]] = cleanTexSegment(arg.text.replace(/\\(?:True|False)(?![a-zA-Z])/g, "").replace(/\[\s*(?:NB|TH|VD|VDC|##)\s*\]/gi, ""));
        }
        const tail = cleanTexSegment(unwrappedBody.slice(cursor));
        const finalStem = tail ? `${stem}\n${tail}`.trim() : stem;
        out.push(cleanQ({
          Id: qId,
          cccd: /^\d+$/.test(optArg) ? optArg : "",
          mapId: meta.mapId,
          Type: "TF",
          Level: meta.Level,
          Grade: meta.Grade,
          Subject: meta.Subject,
          Question: finalStem,
          Options: opts,
          CorrectAnswer: ansChars.padEnd(4, "S").slice(0, 4),
          Explain: explain
        }));
      } else if (mcMatch) {
        const stem = cleanTexSegment(unwrappedBody.slice(0, mcMatch.index));
        let cursor = mcMatch.index + mcMatch[0].length;
        const opts = {};
        let correct = "A";
        const keys = ["A", "B", "C", "D"];
        for (let i = 0; i < 4; i++) {
          const arg = texReadBalanced(unwrappedBody, cursor, "{", "}");
          if (!arg) break;
          cursor = arg.nextIdx;
          if (/\\True(?![a-zA-Z])/.test(arg.text)) correct = keys[i];
          opts[keys[i]] = cleanTexSegment(arg.text.replace(/\\(?:True|False)(?![a-zA-Z])/g, "").replace(/\[\s*(?:NB|TH|VD|VDC|##)\s*\]/gi, ""));
        }
        const tail = cleanTexSegment(unwrappedBody.slice(cursor));
        const finalStem = tail ? `${stem}\n${tail}`.trim() : stem;
        out.push(cleanQ({
          Id: qId,
          cccd: /^\d+$/.test(optArg) ? optArg : "",
          mapId: meta.mapId,
          Type: "MC",
          Level: meta.Level,
          Grade: meta.Grade,
          Subject: meta.Subject,
          Question: finalStem,
          Options: opts,
          CorrectAnswer: correct,
          Explain: explain
        }));
      } else if (saMatch) {
        const afterCmd = texSkipWsAndBracket(unwrappedBody, saMatch.index + saMatch[0].length);
        const saArg = texReadBalanced(unwrappedBody, afterCmd, "{", "}");
        let rawAns = saArg ? saArg.text : "";
        rawAns = rawAns
          .replace(/\\(?:textbf|mathbf|text|mathrm|textrm)\s*\{([^{}]*)\}/g, "$1")
          .replace(/^\$+|\$+$/g, "")
          .replace(/\{([.,])\}/g, "$1")
          .trim();
        const rawStem = saArg
          ? (unwrappedBody.slice(0, saMatch.index) + "\n" + unwrappedBody.slice(saArg.nextIdx))
          : unwrappedBody.slice(0, saMatch.index);
        out.push(cleanQ({
          Id: qId,
          cccd: /^\d+$/.test(optArg) ? optArg : "",
          mapId: meta.mapId,
          Type: "SA",
          Level: meta.Level,
          Grade: meta.Grade,
          Subject: meta.Subject,
          Question: cleanTexSegment(rawStem),
          CorrectAnswer: rawAns,
          Explain: explain
        }));
      } else {
        out.push(cleanQ({
          Id: qId,
          cccd: /^\d+$/.test(optArg) ? optArg : "",
          mapId: meta.mapId,
          Type: "LA",
          Level: meta.Level,
          Grade: meta.Grade,
          Subject: meta.Subject,
          Question: cleanTexSegment(unwrappedBody),
          Explain: explain
        }));
      }
    }
    return out;
  };

  IO.parseFile = async (file) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) return IO.parseDocx(await U.readFile(file, "buffer"), file);
    if (name.endsWith(".doc")) throw new Error("Hệ thống chỉ hỗ trợ định dạng .docx (Word 2010 trở lên). Hãy mở file trong Word và chọn File → Save As → .docx nhé!");
    if (name.endsWith(".tex")) return IO.parseTex(await U.readFile(file));
    if (name.endsWith(".txt")) {
      const txt = await U.readFile(file);
      if (/\\begin\s*\{(?:ex|bt)\}/.test(txt)) return IO.parseTex(txt);
      return IO.parseJSON(txt);
    }
    if (name.endsWith(".json") || name.endsWith(".js")) return IO.parseJSON(await U.readFile(file));
    return IO.parseSheet(await U.readFile(file, "buffer"));
  };

  IO.validate = validate;
  IO.clean = cleanQ;
  IO.stats = (list) => {
    const s = { total: list.length, MC: 0, TF: 0, SA: 0, LA: 0, Group: 0, children: 0, errors: [] };
    list.forEach((q, i) => {
      const t = Quiz.baseType(q.Type); s[t] = (s[t] || 0) + 1;
      if (t === "Group") s.children += (q.children || []).length;
      const e = validate(q); if (e.length) s.errors.push({ i, id: q.Id, msg: e.join(", ") });
      (q.children || []).forEach((c) => { const ec = validate(c); if (ec.length) s.errors.push({ i, id: c.Id || q.Id + " (con)", msg: ec.join(", ") }); });
    });
    return s;
  };

  /* Xuất */
  IO.toJSON = (list) => JSON.stringify(list.map((q) => { const c = U.plain(q); delete c._doc; delete c.updatedAt; return c; }), null, 2);
  function toRows(list) {
    const rows = [];
    const row = (q, parent) => {
      const t = Quiz.baseType(q.Type), r = {};
      COLS.forEach((k) => (r[k] = ""));
      r.Id = q.Id || ""; r.Type = q.Type || ""; META.forEach((k) => (r[k] = q[k] || ""));
      r.Question = q.Question || ""; r.CorrectAnswer = q.CorrectAnswer || ""; r.Explain = q.Explain || ""; r.ParentId = parent ? parent.Id : "";
      const o = q.Options || {};
      if (t === "TF") ["a", "b", "c", "d"].forEach((k, i) => (r["ABCD"[i]] = o[k] || ""));
      else ["A", "B", "C", "D"].forEach((k) => (r[k] = o[k] || ""));
      rows.push(r);
      (q.children || []).forEach((c) => row(c, q));
    };
    list.forEach((q) => row(q));
    return rows;
  }
  IO.toExcel = async (list, name) => {
    const XLSX = await U.needXLSX();
    const ws = XLSX.utils.json_to_sheet(toRows(list), { header: COLS });
    ws["!cols"] = COLS.map((c) => ({ wch: c === "Question" || c === "Explain" ? 60 : c.length < 3 ? 26 : 14 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "CauHoi");
    const guide = XLSX.utils.aoa_to_sheet([
      ["HƯỚNG DẪN NHẬP CÂU HỎI"], [""],
      ["Type", "MC = trắc nghiệm 1 đáp án · TF = đúng/sai 4 ý · SA = trả lời ngắn · LA = tự luận · Group = nhóm câu"],
      ["MC", "Cột A–D là 4 phương án; CorrectAnswer là A/B/C/D"],
      ["TF", "Cột A–D là 4 ý a) b) c) d); CorrectAnswer dạng ĐSĐS (hoặc DSDS: D/Đ = Đúng, S = Sai)"],
      ["SA", "CorrectAnswer là số hoặc từ; nhiều đáp án chấp nhận ngăn bằng dấu |  (ví dụ: 0,5|1/2)"],
      ["Level", "Nhận biết · Thông hiểu · Vận dụng · Vận dụng cao"],
      ["Công thức", "Viết LaTeX giữa dấu $...$, ví dụ $\\dfrac{a}{b}$"],
      ["Hình ảnh", "Dán đường link ảnh (.png/.jpg) vào nội dung câu hỏi, xuống dòng riêng"]
    ]);
    guide["!cols"] = [{ wch: 14 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, guide, "HuongDan");
    XLSX.writeFile(wb, name || "ngan-hang-cau-hoi.xlsx");
  };
  IO.template = () => IO.toExcel([
    { Id: "Q001", Type: "MC", Level: "Nhận biết", Grade: "10", Subject: "Toán", Chapter: "Hệ thức lượng", Topic: "Định lí sin", Question: "Theo định lí sin, $\\dfrac{a}{\\sin A}$ bằng", Options: { A: "$R$", B: "$2R$", C: "$\\dfrac{R}{2}$", D: "$4R$" }, CorrectAnswer: "B", Explain: "Định lí sin." },
    { Id: "Q002", Type: "TF", Level: "Thông hiểu", Grade: "11", Subject: "Vật lý", Question: "Xét tính đúng sai:", Options: { a: "Ý a", b: "Ý b", c: "Ý c", d: "Ý d" }, CorrectAnswer: "SDDS" },
    { Id: "Q003", Type: "SA", Level: "Vận dụng", Grade: "12", Subject: "Toán", Question: "Nghiệm âm của phương trình ... là?", CorrectAnswer: "-1" }
  ], "mau-nhap-cau-hoi.xlsx");

  window.IO = IO;
})();
