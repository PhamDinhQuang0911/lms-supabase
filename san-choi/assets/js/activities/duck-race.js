/* =========================================================
   duck-race.js — HOẠT ĐỘNG: ĐUA VỊT GỌI TÊN
   Chọn ngẫu nhiên một (hoặc vài) học sinh bằng cuộc đua vui
   nhộn, hồi hộp — KHÔNG cần trả lời câu hỏi.
   Lấy cảm hứng từ online-stopwatch.com/duck-race, có nhiều
   nhân vật (vịt, xe, thuyền rồng, thú rừng, vũ trụ, hỗn hợp)
   và nhiều "bất ngờ" dọc đường đua.
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  // Registry cho "Hoạt động" (dùng chung nếu sau này thêm hoạt động khác)
  window.Activities = window.Activities || {
    list: [],
    register(d) { this.list.push(Object.assign({ colors: ["#38bdf8", "#22c55e"] }, d)); },
    get(id) { return this.list.find((a) => a.id === id); }
  };

  const PALETTE = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#f97316", "#84cc16", "#0ea5e9", "#d946ef", "#10b981", "#fb7185"];
  const PACKS = {
    duck: { name: "Vịt bơi", icon: "🦆", scene: "water", vector: (c) => Art.duck(c), ar: 1.3 },
    car: { name: "Xe đua", icon: "🏎️", scene: "road", vector: (c, i) => Art.car(c, i + 1), ar: 2.1 },
    boat: { name: "Thuyền rồng", icon: "🐉", scene: "water", vector: (c) => Art.boat(c), ar: 2.4 },
    animals: { name: "Thú rừng", icon: "🐾", scene: "grass", emoji: ["🐢", "🐇", "🦊", "🐻", "🐼", "🐯", "🦁", "🐵", "🐨", "🐸", "🐷", "🐮", "🐹", "🦝", "🦔", "🐶", "🐱", "🐔", "🦄", "🦓"] },
    space: { name: "Vũ trụ", icon: "🚀", scene: "space", emoji: ["🚀", "🛸", "👽", "🌟", "☄️", "🪐", "🌈", "⭐", "🌙", "🔭", "👨‍🚀", "🌍", "💫", "🛰️"] },
    fun: { name: "Hỗn hợp vui nhộn", icon: "🎮", scene: "rainbow", emoji: ["🦄", "🐲", "🤖", "👾", "🦖", "🐙", "🦈", "🐝", "🦋", "🐳", "🦅", "🐺", "🦩", "🦚", "🍕", "⚽", "🏀", "🎈", "🍩", "👑"] }
  };
  const EVENTS = [
    { ic: "⚡", cls: "turbo", mult: 2.5, dur: 1.1, w: 10, snd: () => U.Sound.whoosh(), msg: "tăng tốc!" },
    { ic: "🚀", cls: "rocket", mult: 3.4, dur: 0.9, w: 6, snd: () => U.Sound.vroom(), msg: "phóng tên lửa!" },
    { ic: "✨", cls: "boost", mult: 1.8, dur: 1.3, w: 12, snd: () => U.Sound.coin(), msg: "may mắn" },
    { ic: "🌀", cls: "warp", warp: 0.12, dur: 0.5, w: 7, snd: () => U.Sound.pop(), msg: "dịch chuyển!" },
    { ic: "🍌", cls: "slip", mult: 0.12, dur: 1.0, w: 9, snd: () => U.Sound.wrong(), msg: "trượt vỏ chuối" },
    { ic: "🐢", cls: "slow", mult: 0.4, dur: 1.2, w: 9, msg: "chậm như rùa" },
    { ic: "💤", cls: "sleep", mult: 0, dur: 1.2, w: 6, msg: "ngủ quên" }
  ];
  const EV_TOTAL = EVENTS.reduce((s, e) => s + e.w, 0);
  const pickEvent = () => { let r = Math.random() * EV_TOTAL; for (const e of EVENTS) { if ((r -= e.w) <= 0) return e; } return EVENTS[0]; };

  function parsePeople(cfg) {
    let names = String(cfg.names || "").split(/\r?\n|;|,/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) names = Array.from({ length: U.clamp(+cfg.count || 10, 2, 40) }, (_, i) => String(i + 1));
    names = names.slice(0, 40);
    const pal = U.shuffle(PALETTE);
    return names.map((name, i) => ({ name, i, color: pal[i % pal.length] }));
  }
  function figure(pack, r, i) {
    if (pack.vector) return `<div class="dr-vec" style="--ar:${pack.ar}">${pack.vector(r.color, i)}</div>`;
    const list = pack.emoji, em = pack._shuffled ? pack._shuffled[i % list.length] : list[i % list.length];
    return `<div class="dr-emoji">${em}</div>`;
  }

  Activities.register({
    id: "dua-vit-goi-ten", name: "Đua vịt gọi tên", icon: "🦆", colors: ["#38bdf8", "#22c55e"], noQuiz: true,
    tagline: "Thả vịt (hoặc xe, gấu, tên lửa…) đua để chọn ngẫu nhiên học sinh — hồi hộp, bất ngờ, không cần câu hỏi!",
    mount(view) {
      const S = { timers: U.timers(), raf: 0 };
      const load = () => Object.assign({ pack: "duck", names: "", count: 10, winners: 1, len: "med", surprises: true }, U.store.get("act_duck", {}));
      let cfg = load();
      App.enterGame(false);

      function cleanup() { cancelAnimationFrame(S.raf); S.timers.clear(); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); App.enterGame(false); }

      /* ---------------- CẤU HÌNH ---------------- */
      function renderSetup() {
        cancelAnimationFrame(S.raf); S.timers.clear(); App.enterGame(false);
        view.innerHTML = `<div class="page gsetup" style="--c1:#38bdf8;--c2:#22c55e">
          <section class="gs-show" data-reveal>
            <div class="gs-art">${Art.thumb("dua-vit")}</div>
            <div class="gs-info">
              <div class="gs-title"><span class="gs-ic">🦆</span><div><h1>Đua vịt gọi tên</h1><p>Chọn ngẫu nhiên học sinh một cách thật vui và hồi hộp!</p></div></div>
              <div class="gc-tags"><span class="chip">Không cần câu hỏi</span><span class="chip">Gọi tên</span><span class="chip">Cả lớp</span></div>
              <ul class="gs-how"><li style="--i:0">Nhập danh sách lớp (hoặc chỉ cần số người), chọn nhân vật đua.</li>
                <li style="--i:1">Các tay đua chạy với tốc độ ngẫu nhiên, gặp đủ thứ bất ngờ dọc đường ⚡🍌🚀💤🌀.</li>
                <li style="--i:2">Người (hoặc nhóm) về đích đầu tiên được chọn — ai cũng hồi hộp đến giây cuối!</li></ul>
            </div>
          </section>
          <section class="gs-form card" data-reveal>
            <div class="gs-sec">
              <span class="lbl">Chọn nhân vật đua</span>
              <div class="pack-pick">${Object.entries(PACKS).map(([k, p]) => `<button data-pack="${k}" class="${cfg.pack === k ? "on" : ""}"><span class="pk-ic">${p.icon}</span><b>${p.name}</b></button>`).join("")}</div>
            </div>
            <div class="gs-sec">
              <span class="lbl">Danh sách người chơi (mỗi dòng một tên)</span>
              <textarea class="textarea" id="dNames" rows="5" placeholder="Nguyễn Văn An&#10;Trần Thị Bình&#10;…&#10;(để trống = dùng số thứ tự 1, 2, 3…)">${esc(cfg.names)}</textarea>
              <small class="muted">Có thể dán thẳng cột tên từ Excel. Tối đa 40 tay đua.</small>
            </div>
            <div class="gs-sec gs-fields">
              <div class="field"><label class="lbl">Số người (khi không nhập tên)</label><div class="num-field"><button type="button" data-step="-1">−</button><input class="input" type="number" id="dCount" min="2" max="40" value="${cfg.count}"><button type="button" data-step="1">+</button></div></div>
              <div class="field"><label class="lbl">Chọn mấy người về đích</label><div class="num-field"><button type="button" data-step="-1">−</button><input class="input" type="number" id="dWin" min="1" max="10" value="${cfg.winners}"><button type="button" data-step="1">+</button></div></div>
              <div class="field"><label class="lbl">Độ dài cuộc đua</label><div class="seg" id="dLen">${[["short", "⚡ Nhanh"], ["med", "🏁 Vừa"], ["long", "🍿 Dài & kịch tính"]].map(([k, l]) => `<button data-v="${k}" class="${cfg.len === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
            </div>
            <div class="gs-sec"><label class="switch"><input type="checkbox" id="dSurprise" ${cfg.surprises ? "checked" : ""}> 🎉 Bật các pha bất ngờ dọc đường (tăng tốc, trượt chuối, ngủ quên…)</label></div>
            <button class="btn btn-xl btn-fun btn-3d gs-go" id="dGo">🏁 Thả đua ngay!</button>
          </section>
        </div>`;
        U.reveal(view);
        $$(".pack-pick button", view).forEach((b) => (b.onclick = () => { cfg.pack = b.dataset.pack; U.Sound.pop(); $$(".pack-pick button", view).forEach((x) => x.classList.toggle("on", x === b)); }));
        $$("#dLen button", view).forEach((b) => (b.onclick = () => { cfg.len = b.dataset.v; $$("#dLen button", view).forEach((x) => x.classList.toggle("on", x === b)); }));
        $$(".num-field", view).forEach((w) => { const inp = $("input", w); const mn = +inp.min, mx = +inp.max; const set = (v) => { inp.value = U.clamp(Math.round(+v || mn), mn, mx); }; inp.onchange = () => set(inp.value); $$("[data-step]", w).forEach((b) => (b.onclick = () => set(+inp.value + +b.dataset.step))); });
        $("#dGo", view).onclick = () => {
          cfg.names = $("#dNames", view).value; cfg.count = +$("#dCount", view).value || 10;
          cfg.winners = U.clamp(+$("#dWin", view).value || 1, 1, 10); cfg.surprises = $("#dSurprise", view).checked;
          U.store.set("act_duck", cfg); U.Sound.click(); run();
        };
      }

      /* ---------------- CUỘC ĐUA ---------------- */
      function run() {
        App.enterGame(true);
        const pack = PACKS[cfg.pack];
        if (pack.emoji) pack._shuffled = U.shuffle(pack.emoji);
        const people = parsePeople(cfg);
        const winners = U.clamp(cfg.winners, 1, people.length);
        const stage = h(`<div class="drace scene-${pack.scene}" style="--c1:#0ea5e9;--c2:#22c55e">
          <div class="hud">
            <button class="hud-btn" data-a="exit" title="Thoát">←</button>
            <div class="hud-title"><span class="hud-ic">${pack.icon}</span><b>Đua ${esc(pack.name)} — gọi tên</b></div>
            <div class="hud-mid"><span class="dr-leader"></span></div>
            <div class="hud-right">
              <button class="hud-btn hud-music ${U.Music.on ? "on" : ""}" data-a="music" title="Nhạc nền">🎵</button>
              <button class="hud-btn" data-a="mute" title="Âm thanh">${U.Sound.muted ? "🔇" : "🔊"}</button>
              <button class="hud-btn" data-a="fs" title="Toàn màn hình">⛶</button>
            </div>
          </div>
          <div class="dr-track ${people.length > 14 ? "many" : ""}">
            <div class="dr-start"></div><div class="dr-finish"><span>🏁</span></div>
            <div class="dr-lanes">${people.map((r, i) => `<div class="dr-lane" data-i="${i}" style="--rc:${r.color};--i:${i}">
              <span class="dr-tag"><i class="dr-rank"></i><b>${esc(r.name)}</b></span>
              <div class="dr-racer" style="--p:0"><div class="dr-fx"></div><div class="dr-fig">${figure(pack, r, i)}</div></div>
            </div>`).join("")}</div>
          </div>
        </div>`);
        view.innerHTML = ""; view.appendChild(stage);
        const hud = $(".hud", stage);
        $("[data-a=exit]", hud).onclick = () => exit();
        const mBtn = $("[data-a=music]", hud), sBtn = $("[data-a=mute]", hud);
        mBtn.onclick = () => { mBtn.classList.toggle("on", U.Music.toggle()); };
        sBtn.onclick = () => GameKit.soundMenu(sBtn, () => { mBtn.classList.toggle("on", U.Music.on); sBtn.textContent = U.Sound.muted ? "🔇" : "🔊"; });
        $("[data-a=fs]", hud).onclick = () => U.fullscreen();

        const R = people.map((r, i) => Object.assign({}, r, { el: $(`.dr-lane[data-i="${i}"]`, stage), racer: $(`.dr-lane[data-i="${i}"] .dr-racer`, stage), fx: $(`.dr-lane[data-i="${i}"] .dr-fx`, stage), p: 0, ev: 0, mult: 1, done: false }));
        const dur = { short: 8, med: 13, long: 19 }[cfg.len] || 13;
        const baseV = 1 / dur;
        let over = false, started = false, finished = [], last = 0;
        const leaderEl = $(".dr-leader", stage);

        function draw(r) { r.racer.style.setProperty("--p", r.p.toFixed(4)); }
        function fx(r, e) {
          r.el.classList.remove("ev-turbo", "ev-rocket", "ev-boost", "ev-slip", "ev-slow", "ev-sleep", "ev-warp");
          r.el.classList.add("ev-" + e.cls);
          const f = h(`<div class="dr-pop">${e.ic}</div>`); r.fx.appendChild(f); setTimeout(() => f.remove(), 1200);
          e.snd && !U.Sound.muted && e.snd();
        }
        function clearFx(r) { r.el.classList.remove("ev-turbo", "ev-rocket", "ev-boost", "ev-slip", "ev-slow", "ev-sleep", "ev-warp"); }
        function trigger(r) {
          const e = pickEvent(); r.ev = e.dur; r.mult = e.mult != null ? e.mult : 1;
          if (e.warp) { r.p = Math.min(0.985, r.p + e.warp); draw(r); }
          fx(r, e);
        }
        function frame(t) {
          if (over) return;
          if (!last) last = t; const dt = Math.min(0.05, (t - last) / 1000); last = t;
          const lead = Math.max.apply(null, R.map((r) => r.p));
          const leader = R.find((r) => r.p === lead);
          if (leader) leaderEl.innerHTML = `🚩 Dẫn đầu: <b>${esc(leader.name)}</b>`;
          R.forEach((r) => {
            if (r.done) return;
            if (cfg.surprises && r.ev <= 0 && r.p > 0.03 && r.p < 0.93 && Math.random() < 0.9 * dt) trigger(r);
            let mult = 1;
            if (r.ev > 0) { r.ev -= dt; mult = r.mult; if (r.ev <= 0) { r.mult = 1; clearFx(r); } }
            const gap = lead - r.p;
            const band = gap > 0.1 ? 1.22 : (r.p === lead ? 0.9 : 1);          // bám đuổi sát nút
            const jitter = 0.55 + Math.random() * 0.9;
            r.p += baseV * mult * band * jitter * dt;
            if (r.p >= 1) {
              r.p = 1; r.done = true; finished.push(r); r.el.classList.add("won");
              $(".dr-rank", r.el).textContent = finished.length; U.Sound.pop();
              if (finished.length >= winners || finished.length >= R.length) { draw(r); return end(); }
            }
            draw(r);
          });
          S.raf = requestAnimationFrame(frame);
        }
        function end() {
          if (over) return; over = true; cancelAnimationFrame(S.raf);
          const rest = R.filter((r) => !r.done).sort((a, b) => b.p - a.p);
          const order = finished.concat(rest);
          const win = order.slice(0, winners);
          U.Music.duck && U.Music.duck(true);
          U.Sound.win(); U.confetti(); S.timers.after(600, () => U.confetti({ burst: true, count: 160 }));
          S.timers.after(4500, () => U.Music.duck && U.Music.duck(false));
          const figBig = (r, k) => pack.vector ? `<div class="wr-fig" style="--ar:${pack.ar}">${pack.vector(r.color, r.i)}</div>` : `<div class="wr-fig emoji">${(pack._shuffled || pack.emoji || [])[r.i % (pack.emoji ? pack.emoji.length : 1)] || "🏆"}</div>`;
          const ov = h(`<div class="res-ov"><div class="res-card dr-res">
            <div class="res-rays"></div>
            <div class="res-head"><div class="dr-medal">🏆</div><h2>${winners === 1 ? "🎉 " + esc(win[0].name) + " được chọn!" : "🎉 " + winners + " người về đích!"}</h2><p>Đua ${esc(pack.name)} · ${order.length} tay đua</p></div>
            <div class="dr-podium">${win.map((r, k) => `<div class="drp" style="--rc:${r.color};--i:${k}"><span class="drp-rank">${k + 1}</span>${figBig(r, k)}<b>${esc(r.name)}</b></div>`).join("")}</div>
            ${order.length > winners ? `<details class="dr-full"><summary>Xem thứ tự về đích của tất cả</summary><ol class="dr-order">${order.map((r) => `<li style="--rc:${r.color}"><b>${esc(r.name)}</b></li>`).join("")}</ol></details>` : ""}
            <div class="res-actions">
              <button class="btn btn-lg btn-fun btn-3d" data-a="again">↻ Đua lại</button>
              <button class="btn btn-lg btn-primary" data-a="setup">⚙️ Đổi cấu hình</button>
              <button class="btn btn-lg btn-ghost" data-a="home">🏠 Trang chủ</button>
            </div></div></div>`);
          stage.appendChild(ov);
          $("[data-a=again]", ov).onclick = () => { ov.remove(); run(); };
          $("[data-a=setup]", ov).onclick = () => renderSetup();
          $("[data-a=home]", ov).onclick = () => App.go("/");
        }
        function exit() { cancelAnimationFrame(S.raf); over = true; renderSetup(); }

        GameKit.countdown(stage, `${R.length} tay đua đã sẵn sàng!`).then(() => {
          if (over) return; started = true; stage.classList.add("running"); last = 0; S.raf = requestAnimationFrame(frame);
        });
      }

      renderSetup();
      return cleanup;
    }
  });
})();
