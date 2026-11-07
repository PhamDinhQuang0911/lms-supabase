/* =========================================================
   utils.js — Tiện ích dùng chung (DOM, âm thanh, confetti,
   modal, toast, hiệu ứng stagger "lướt sóng", lưu trữ...)
   ========================================================= */
(function () {
  const U = {};

  /* ---------- DOM ---------- */
  U.$ = (s, r) => (r || document).querySelector(s);
  U.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  U.h = (html) => { const t = document.createElement("template"); t.innerHTML = String(html).trim(); return t.content.firstElementChild; };
  U.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.on = (el, ev, sel, fn) => el.addEventListener(ev, (e) => { const t = e.target.closest(sel); if (t && el.contains(t)) fn(e, t); });

  /* ---------- Misc ---------- */
  U.shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.uid = (n) => (Date.now().toString(36) + Math.random().toString(36).slice(2, 2 + (n || 6)));
  U.fmtTime = (sec) => { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 250); }; };
  U.noAccent = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  U.norm = (s) => U.noAccent(s).toLowerCase().replace(/\s+/g, " ").trim();
  U.fmtNum = (n) => Number(n || 0).toLocaleString("vi-VN");
  U.fmtDate = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  };
  U.tsMs = (ts) => !ts ? 0 : ts.toMillis ? ts.toMillis() : ts.seconds ? ts.seconds * 1000 : +ts;
  U.plain = (o) => JSON.parse(JSON.stringify(o == null ? null : o));

  /* ---------- Màu ---------- */
  U.shade = (hex, p) => {
    hex = hex.replace("#", ""); if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = p < 0 ? 0 : 255, k = Math.abs(p);
    r = Math.round((t - r) * k + r); g = Math.round((t - g) * k + g); b = Math.round((t - b) * k + b);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };
  U.TEAM_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];
  U.TEAM_NAMES = ["Đội Đỏ", "Đội Xanh", "Đội Lá", "Đội Vàng", "Đội Tím", "Đội Hồng", "Đội Ngọc", "Đội Cam"];
  U.AVATARS = ["🦊", "🐼", "🐯", "🐸", "🐵", "🐧", "🦁", "🐨", "🐰", "🐻", "🦄", "🐙", "🐳", "🦉", "🐝", "🐲", "🦖", "🐱", "🐶", "🐹"];

  /* ---------- Lưu trữ an toàn ---------- */
  U.store = {
    get(k, d) { try { const v = localStorage.getItem("gfe_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("gfe_" + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem("gfe_" + k); } catch (e) { } }
  };

  /* ---------- Tải script/css động ---------- */
  const loaded = {};
  U.loadScript = (url) => loaded[url] || (loaded[url] = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = url; s.onload = () => res(); s.onerror = () => { delete loaded[url]; rej(new Error("Không tải được " + url)); };
    document.head.appendChild(s);
  }));
  U.XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  U.QR_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  U.needXLSX = async () => { if (!window.XLSX) await U.loadScript(U.XLSX_URL); return window.XLSX; };

  /* ---------- File ---------- */
  U.download = (name, content, mime) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "application/octet-stream" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  U.readFile = (file, as) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej;
    as === "buffer" ? r.readAsArrayBuffer(file) : r.readAsText(file, "utf-8");
  });
  U.pickFile = (accept) => new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = accept || "*";
    i.onchange = () => res(i.files[0] || null); i.click();
  });

  /* ---------- Âm thanh tổng hợp (WebAudio) ---------- */
  let actx = null;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay, slide) {
    if (U.Sound.muted) return;
    const ctx = ac(); if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, delay) {
    if (U.Sound.muted) return;
    const ctx = ac(); if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; g.gain.value = vol || 0.12;
    s.connect(g); g.connect(ctx.destination); s.start(t0);
  }
  U.Sound = {
    muted: U.store.get("muted", false),
    toggle() { this.muted = !this.muted; U.store.set("muted", this.muted); return this.muted; },
    click() { tone(720, 0.06, "triangle", 0.06); },
    pop() { tone(420, 0.09, "sine", 0.12, 0, 900); },
    correct() { tone(587, 0.11, "sine", 0.17); tone(784, 0.11, "sine", 0.17, 0.08); tone(1175, 0.22, "sine", 0.15, 0.16); },
    wrong() { tone(220, 0.22, "sawtooth", 0.09, 0, 140); tone(160, 0.3, "square", 0.06, 0.1, 110); },
    freeze() { tone(1600, 0.25, "sine", 0.05, 0, 600); tone(2400, 0.3, "triangle", 0.03, 0.05, 900); },
    whoosh() { noise(0.35, 0.09); tone(300, 0.3, "sine", 0.05, 0, 1200); },
    step() { tone(300, 0.07, "triangle", 0.08, 0, 520); },
    jump() { tone(260, 0.18, "square", 0.05, 0, 760); },
    quack() { tone(520, 0.08, "sawtooth", 0.08, 0, 380); tone(480, 0.1, "sawtooth", 0.07, 0.1, 330); },
    vroom() { tone(90, 0.5, "sawtooth", 0.07, 0, 240); },
    drum() { tone(110, 0.18, "sine", 0.25, 0, 50); noise(0.05, 0.08); },
    dice() { for (let i = 0; i < 8; i++) noise(0.03, 0.08, i * 0.07); },
    tick() { tone(1100, 0.04, "square", 0.04); },
    count() { tone(660, 0.15, "square", 0.08); },
    go() { tone(990, 0.35, "square", 0.1); tone(1320, 0.35, "triangle", 0.07); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, "triangle", 0.15, i * 0.11)); tone(1568, 0.6, "sine", 0.1, 0.6); },
    lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, "triangle", 0.1, i * 0.18)); },
    coin() { tone(988, 0.08, "square", 0.07); tone(1319, 0.25, "square", 0.07, 0.08); },
    spin() { tone(880, 0.03, "triangle", 0.05); }
  };


  /* =========================================================
     ÂM THANH TỪ FILE (đặt cạnh index.html):
       background.mp3 | .ogg | .wav | .m4a  → nhạc nền
       right.mp3 | .wav | .ogg              → trả lời đúng
       wrong.mp3 | .wav | .ogg              → trả lời sai
       win.mp3   | .wav | .ogg              → chiến thắng (tuỳ chọn)
     Không có file → dùng âm thanh tổng hợp mặc định.
     ========================================================= */
  const AFILES = {
    background: ["background.mp3", "background.ogg", "background.wav", "background.m4a"],
    right: ["right.mp3", "right.wav", "right.ogg"], wrong: ["wrong.mp3", "wrong.wav", "wrong.ogg"], win: ["win.mp3", "win.wav", "win.ogg"]
  };
  const afound = {}, aprobe = {};
  function probe(name) {
    if (aprobe[name]) return aprobe[name];
    return (aprobe[name] = new Promise((res) => {
      const list = AFILES[name].slice();
      const next = () => {
        const u = list.shift(); if (!u) { afound[name] = null; return res(null); }
        const a = new Audio(); let done = false;
        const ok = () => { if (done) return; done = true; afound[name] = u; res(u); };
        const bad = () => { if (done) return; done = true; next(); };
        a.addEventListener("loadedmetadata", ok, { once: true }); a.addEventListener("canplaythrough", ok, { once: true });
        a.addEventListener("error", bad, { once: true }); setTimeout(bad, 5000);
        a.preload = "auto"; a.src = u; a.load();
      };
      next();
    }));
  }
  U.audioFiles = { probe, has: (n) => !!afound[n], list: () => Object.assign({}, afound) };
  function playFile(name, vol) {
    const u = afound[name]; if (!u) return false;
    try { const a = new Audio(u); a.volume = vol == null ? 0.9 : vol; a.play().catch(() => { }); return true; } catch (e) { return false; }
  }
  // Tuỳ chọn âm thanh của người dùng
  U.Sound.answerOn = U.store.get("answerSfx", true);
  U.Sound.setAnswer = (v) => { U.Sound.answerOn = !!v; U.store.set("answerSfx", !!v); };
  U.Sound.setMuted = (v) => { U.Sound.muted = !!v; U.store.set("muted", !!v); };
  const synthCorrect = U.Sound.correct, synthWrong = U.Sound.wrong, synthWin = U.Sound.win;
  U.Sound.correct = function () { if (this.muted || !this.answerOn) return; if (!playFile("right")) synthCorrect(); };
  U.Sound.wrong = function () { if (this.muted || !this.answerOn) return; if (!playFile("wrong")) synthWrong(); };
  U.Sound.win = function () { if (this.muted) return; U.Music.duck(true); if (!playFile("win")) synthWin(); setTimeout(() => U.Music.duck(false), 4500); };

  /* ---------- Nhạc nền ---------- */
  const M = {
    on: U.store.get("musicOn", false), vol: U.store.get("musicVol", 0.35), active: false, el: null, synth: null, ducked: false,
    async start() {
      this.active = true;
      if (!this.on || this.el || this.synth) return;
      const url = await probe("background");
      if (!this.active || !this.on || this.el || this.synth) return;
      if (url) {
        const a = new Audio(url); a.loop = true; a.volume = 0; this.el = a;
        a.play().then(() => fade(a, this.level(), 900)).catch(() => { this.el = null; });
      } else this.synth = synthMusic(this.level());
    },
    stop() {
      this.active = false;
      if (this.el) { const a = this.el; this.el = null; fade(a, 0, 600, () => a.pause()); }
      if (this.synth) { this.synth.stop(); this.synth = null; }
    },
    level() { return this.vol * (this.ducked ? 0.35 : 1); },
    apply() { if (this.el) this.el.volume = this.level(); if (this.synth) this.synth.volume(this.level()); },
    toggle() { this.on = !this.on; U.store.set("musicOn", this.on); if (this.on && this.active) { this.active = false; this.start(); } else if (!this.on) { const act = this.active; this.stop(); this.active = act; } return this.on; },
    setVol(v) { this.vol = U.clamp(+v, 0, 1); U.store.set("musicVol", this.vol); this.apply(); },
    duck(d) { this.ducked = d; this.apply(); },
    source() { return afound.background ? "file " + afound.background : "nhạc mặc định" }
  };
  U.Music = M;
  function fade(a, to, ms, done) {
    const from = a.volume, t0 = performance.now();
    (function f(t) { const k = Math.min(1, (t - t0) / ms); a.volume = U.clamp(from + (to - from) * k, 0, 1); if (k < 1) requestAnimationFrame(f); else done && done(); })(t0);
  }
  /* Nhạc nền tổng hợp vui tươi (dùng khi không có file background.*) */
  function synthMusic(vol) {
    const ctx = ac(); if (!ctx) return null;
    const master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.5), ctx.currentTime + 1.2);
    const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const prog = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C G Am F
    const mel = [72, 74, 76, 79, 81, 84];
    const spb = 60 / 118; let next = ctx.currentTime + 0.1, step = 0;
    const note = (f, t, d, type, v) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05); };
    const id = setInterval(() => {
      while (next < ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % 4, e = step % 8, ch = prog[bar];
        if (e === 0 || e === 4) note(N(ch[0] - 24), next, spb * 1.6, "triangle", 0.5);
        note(N(ch[[0, 1, 2, 1][e % 4]] + 12), next, spb * 0.45, "square", 0.07);
        if (e % 2 === 0 && Math.random() < 0.45) note(N(mel[Math.floor(Math.random() * mel.length)]), next, spb * 0.9, "triangle", 0.16);
        if (e % 2 === 1) { const b = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const sN = ctx.createBufferSource(), g = ctx.createGain(); sN.buffer = b; g.gain.value = 0.05; sN.connect(g); g.connect(master); sN.start(next); }
        next += spb / 2; step++;
      }
    }, 80);
    return {
      stop() { clearInterval(id); try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5); } catch (e) { } setTimeout(() => master.disconnect(), 700); },
      volume(v) { try { master.gain.setTargetAtTime(Math.max(0.0001, v * 0.5), ctx.currentTime, 0.2); } catch (e) { } }
    };
  }
  // dò file âm thanh sau khi trang tải xong (không chặn giao diện)
  addEventListener("load", () => setTimeout(() => { probe("right"); probe("wrong"); probe("win"); }, 1200));

  /* ---------- Confetti ---------- */
  U.confetti = (opts) => {
    opts = opts || {};
    const n = opts.count || 180;
    const c = document.createElement("canvas"); c.className = "confetti-canvas"; document.body.appendChild(c);
    const ctx = c.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const colors = opts.colors || ["#6c4cf5", "#ff5c9d", "#ffc93c", "#1dd1a1", "#38bdf8", "#ff9f43", "#ef4444"];
    const ps = Array.from({ length: n }, (_, i) => {
      const fromSide = i % 2 ? 1 : -1;
      return {
        x: opts.burst ? innerWidth / 2 : (fromSide < 0 ? 0 : innerWidth), y: opts.burst ? innerHeight * 0.45 : innerHeight * 0.7,
        vx: opts.burst ? (Math.random() - 0.5) * 22 : -fromSide * (6 + Math.random() * 12), vy: -(10 + Math.random() * 14),
        w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        col: colors[i % colors.length], shape: i % 3, life: 1
      };
    });
    let frame = 0;
    (function anim() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach((p) => {
        p.vy += 0.38; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (frame > 120) p.life -= 0.012;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col;
        if (p.shape === 0) ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.6);
        else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 6.3); ctx.fill(); }
        else { ctx.beginPath(); for (let k = 0; k < 5; k++) { ctx.lineTo(Math.cos((k * 4 * Math.PI) / 5) * p.w * 0.7, Math.sin((k * 4 * Math.PI) / 5) * p.w * 0.7); } ctx.fill(); }
        ctx.restore();
      });
      if (++frame < 260) requestAnimationFrame(anim); else c.remove();
    })();
  };

  /* ---------- Toast ---------- */
  U.toast = (msg, type, ms) => {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const icons = { ok: "✅", err: "⛔", warn: "⚠️", info: "💡" };
    const t = U.h(`<div class="toast t-${type || "info"}"><span>${icons[type || "info"]}</span><div>${msg}</div></div>`);
    box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, ms || 2800);
  };

  /* ---------- Modal ---------- */
  U.modal = (o) => {
    o = o || {};
    const wrap = U.h(`<div class="modal-wrap"><div class="modal ${o.size || ""}" role="dialog" aria-modal="true">
      ${o.title !== false ? `<div class="modal-h"><h3>${o.title || ""}</h3><button class="btn btn-icon btn-ghost m-x" aria-label="Đóng">✕</button></div>` : ""}
      <div class="modal-b"></div>
      ${o.actions && o.actions.length ? `<div class="modal-f"></div>` : ""}
    </div></div>`);
    const body = U.$(".modal-b", wrap);
    if (typeof o.body === "string") body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    let resolve; const result = new Promise((r) => (resolve = r));
    const close = (v) => { if (!wrap.isConnected) return; wrap.classList.add("out"); setTimeout(() => wrap.remove(), 220); document.removeEventListener("keydown", onKey); resolve(v); o.onClose && o.onClose(v); };
    const onKey = (e) => { if (e.key === "Escape" && o.dismissible !== false) close(null); };
    document.addEventListener("keydown", onKey);
    const x = U.$(".m-x", wrap); if (x) x.onclick = () => close(null);
    if (o.dismissible !== false) wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(null); });
    const foot = U.$(".modal-f", wrap);
    (o.actions || []).forEach((a) => {
      const b = U.h(`<button class="btn ${a.cls || ""}">${a.label}</button>`);
      b.onclick = async () => {
        if (a.onClick) { const r = await a.onClick(b, wrap); if (r === false) return; close(r === undefined ? a.value : r); }
        else close(a.value);
      };
      foot.appendChild(b);
    });
    document.body.appendChild(wrap);
    const f = U.$("input,select,textarea", body); if (f && o.autofocus !== false) setTimeout(() => f.focus(), 60);
    if (window.Quiz) Quiz.typeset(body);
    return { el: wrap, body, close, result };
  };
  U.confirm = (msg, o) => {
    o = o || {};
    return U.modal({
      title: o.title || "Xác nhận", size: "sm", body: `<p style="margin:0;font-size:15.5px">${msg}</p>`,
      actions: [{ label: "Hủy", cls: "btn-ghost", value: false }, { label: o.ok || "Đồng ý", cls: o.danger ? "btn-danger" : "btn-primary", value: true }]
    }).result.then((v) => !!v);
  };
  U.prompt = (label, def, o) => {
    o = o || {};
    const m = U.modal({
      title: o.title || "Nhập", size: "sm",
      body: `<div class="field"><label>${label}</label><input class="input" value="${U.esc(def || "")}"></div>`,
      actions: [{ label: "Hủy", cls: "btn-ghost", value: null }, { label: o.ok || "OK", cls: "btn-primary", onClick: (b, w) => U.$("input", w).value }]
    });
    U.$("input", m.el).addEventListener("keydown", (e) => { if (e.key === "Enter") m.close(e.target.value); });
    return m.result;
  };

  /* ---------- Toàn màn hình ---------- */
  U.fullscreen = (el) => {
    el = el || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  };

  /* ---------- Stagger "lướt sóng" khi cuộn ----------
     Gắn data-reveal cho phần tử. Khi một loạt phần tử cùng
     lọt vào khung nhìn, sắp theo vị trí (trên→dưới, trái→phải)
     rồi gán độ trễ tăng dần => hiệu ứng sóng lan. */
  let io = null;
  U.reveal = (root) => {
    const els = U.$$("[data-reveal]:not(.in)", root || document);
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((e) => e.removeAttribute("data-reveal")); return;
    }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        const vis = entries.filter((e) => e.isIntersecting).map((e) => e.target);
        vis.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (Math.round(ra.top / 40) - Math.round(rb.top / 40)) || (ra.left - rb.left); });
        vis.forEach((el, i) => {
          io.unobserve(el);
          const r = el.getBoundingClientRect();
          const wave = Math.round((r.left / Math.max(1, innerWidth)) * 4); // lan theo chiều ngang
          el.style.setProperty("--d", (i * 70 + wave * 40) + "ms");
          el.classList.add("in");
          el.addEventListener("animationend", () => { el.removeAttribute("data-reveal"); el.classList.remove("in"); el.style.removeProperty("--d"); }, { once: true });
        });
      }, { root: document.getElementById("main"), threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    }
    els.forEach((e) => io.observe(e));
  };
  U.resetReveal = () => { if (io) { io.disconnect(); io = null; } };

  U.countUp = (el, to, ms) => {
    const t0 = performance.now(), from = 0; ms = ms || 1200;
    (function f(t) { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = U.fmtNum(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(f); })(t0);
  };

  /* ---------- Hẹn giờ có thể huỷ (cho game) ---------- */
  U.timers = () => {
    const ids = new Set(), ivs = new Set();
    return {
      after(ms, fn) { const id = setTimeout(() => { ids.delete(id); fn(); }, ms); ids.add(id); return id; },
      every(ms, fn) { const id = setInterval(fn, ms); ivs.add(id); return id; },
      stop(id) { clearInterval(id); ivs.delete(id); },
      clear() { ids.forEach(clearTimeout); ivs.forEach(clearInterval); ids.clear(); ivs.clear(); }
    };
  };


  /* ---------- Xem ảnh phóng to (lightbox) ----------
     Bấm vào mọi ảnh trong câu hỏi / phương án / lời giải để mở. */
  U.lightbox = (src) => {
    const ov = U.h(`<div class="lbx" role="dialog" aria-label="Xem ảnh">
      <div class="lbx-stage"><img src="${U.esc(src)}" alt="" draggable="false"></div>
      <div class="lbx-bar">
        <button data-z="-" title="Thu nhỏ">➖</button><span class="lbx-pct">100%</span><button data-z="+" title="Phóng to">➕</button>
        <button data-z="fit" title="Vừa màn hình">⤢</button><a href="${U.esc(src)}" target="_blank" rel="noopener" title="Mở ảnh gốc">↗</a>
        <button data-z="x" title="Đóng (Esc)">✕</button></div>
      <p class="lbx-tip">Lăn chuột / chụm 2 ngón để phóng to · kéo để di chuyển · Esc để đóng</p></div>`);
    const img = U.$("img", ov), stage = U.$(".lbx-stage", ov), pct = U.$(".lbx-pct", ov);
    let z = 1, x = 0, y = 0;
    const apply = () => { img.style.transform = `translate(${x}px,${y}px) scale(${z})`; pct.textContent = Math.round(z * 100) + "%"; ov.classList.toggle("zoomed", z > 1.01); };
    const zoom = (k) => { z = U.clamp(z * k, 0.5, 8); if (z <= 1) { x = 0; y = 0; } apply(); };
    const close = () => { ov.classList.add("out"); document.removeEventListener("keydown", key, true); setTimeout(() => ov.remove(), 220); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } if (e.key === "+" || e.key === "=") zoom(1.25); if (e.key === "-") zoom(0.8); };
    document.addEventListener("keydown", key, true);
    U.$$("[data-z]", ov).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const v = b.dataset.z; if (v === "x") close(); else if (v === "fit") { z = 1; x = y = 0; apply(); } else zoom(v === "+" ? 1.35 : 0.75); }));
    stage.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 0.87); }, { passive: false });
    img.addEventListener("dblclick", () => { if (z > 1.01) { z = 1; x = y = 0; apply(); } else zoom(2.2); });
    // kéo & chụm
    const pts = new Map(); let start = null;
    stage.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, e); stage.setPointerCapture(e.pointerId); start = { x, y, z, px: e.clientX, py: e.clientY, d: pts.size === 2 ? dist() : 0, moved: false }; });
    stage.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId) || !start) return; pts.set(e.pointerId, e);
      if (pts.size === 2 && start.d) { z = U.clamp(start.z * dist() / start.d, 0.5, 8); start.moved = true; apply(); return; }
      const dx = e.clientX - start.px, dy = e.clientY - start.py;
      if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true;
      if (z > 1) { x = start.x + dx; y = start.y + dy; apply(); }
    });
    const up = (e) => { pts.delete(e.pointerId); if (!pts.size) { if (start && !start.moved && e.target === stage) close(); start = null; } else if (pts.size === 1) start = null; };
    stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
    function dist() { const [a, b] = [...pts.values()]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1; }
    document.body.appendChild(ov); apply();
  };
  // bắt sự kiện ở pha "capture" để bấm ảnh trong nút phương án không bị tính là chọn đáp án
  document.addEventListener("click", (e) => {
    const w = e.target.closest && e.target.closest(".q-imgw");
    if (!w || w.classList.contains("err")) return;
    e.preventDefault(); e.stopPropagation();
    U.lightbox(w.dataset.zoom || (w.querySelector("img") || {}).src);
  }, true);

  window.U = U;
})();
