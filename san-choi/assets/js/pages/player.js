/* =========================================================
   player.js — Màn hình HỌC SINH trên điện thoại
   #/join  hoặc  #/join/123456
   ========================================================= */
(function () {
  const { $, $$, esc, h } = U;
  const MC_COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c"];

  window.PlayerPage = (view, pinParam) => {
    const S = { offs: [], timers: U.timers(), ctrl: null };
    const cleanup = () => { S.offs.forEach((f) => { try { f(); } catch (e) { } }); S.offs = []; S.timers.clear(); S.ctrl && S.ctrl.destroy(); App.enterGame(false); };
    App.enterGame(true);
    pinParam ? askName(pinParam) : askPin();

    function askPin(err) {
      view.innerHTML = `<div class="pl pl-join"><div class="pl-bg"></div>
        <div class="pl-card stg">
          <div class="pl-logo">🎮</div>
          <h1>Vào phòng chơi</h1>
          <p class="muted">Nhập mã PIN giáo viên cung cấp</p>
          <div class="pin-boxes">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" data-i="${i}" aria-label="Số ${i + 1}">`).join("")}</div>
          ${err ? `<div class="pl-err">${esc(err)}</div>` : ""}
          <button class="btn btn-xl btn-fun btn-3d" id="go" style="width:100%">Tiếp tục ➜</button>
        </div></div>`;
      const ins = $$(".pin-boxes input", view);
      ins.forEach((i, k) => {
        i.addEventListener("input", () => { i.value = i.value.replace(/\D/g, "").slice(-1); if (i.value && ins[k + 1]) ins[k + 1].focus(); if (ins.every((x) => x.value)) $("#go", view).click(); });
        i.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !i.value && ins[k - 1]) ins[k - 1].focus(); if (e.key === "Enter") $("#go", view).click(); });
        i.addEventListener("paste", (e) => { const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6); if (t.length) { e.preventDefault(); t.split("").forEach((d, j) => ins[j] && (ins[j].value = d)); ins[Math.min(5, t.length - 1)].focus(); } });
      });
      setTimeout(() => ins[0].focus(), 100);
      $("#go", view).onclick = () => { const pin = ins.map((i) => i.value).join(""); if (pin.length === 6) App.go("/join/" + pin); else U.toast("Mã PIN gồm 6 chữ số", "warn"); };
    }

    async function askName(pin) {
      view.innerHTML = `<div class="loader"><div class="dots3"><i></i><i></i><i></i></div>Đang tìm phòng ${esc(pin)}…</div>`;
      let meta;
      try { meta = await Room.getMeta(pin); } catch (e) { return askPin("Không kết nối được máy chủ: " + FB.errMsg(e)); }
      if (!meta) return askPin("Không tìm thấy phòng " + pin + ". Kiểm tra lại mã PIN nhé!");
      if (meta.status === "ended") return askPin("Phòng " + pin + " đã kết thúc.");
      const saved = (() => { try { return JSON.parse(sessionStorage.getItem("gfe_play_" + pin) || "null"); } catch (e) { return null; } })();
      if (saved && saved.pid) return doJoin(pin, saved.name, saved.avatar, saved.pid);
      let avatar = U.pick(U.AVATARS);
      const lastName = U.store.get("playerName", "");
      view.innerHTML = `<div class="pl pl-join"><div class="pl-bg"></div>
        <div class="pl-card stg">
          <div class="pl-game">${(Games.get(meta.gameId) || {}).icon || "🎮"} ${esc(meta.title || "")}</div>
          <h1>Bạn là ai?</h1>
          <input class="input pl-name" maxlength="20" placeholder="Nhập tên của bạn" value="${esc(lastName)}">
          <div class="lbl" style="margin-top:6px">Chọn linh vật</div>
          <div class="ava-grid">${U.AVATARS.map((a) => `<button class="${a === avatar ? "on" : ""}" data-a="${a}">${a}</button>`).join("")}</div>
          <button class="btn btn-xl btn-fun btn-3d" id="go" style="width:100%">🚀 Vào phòng</button>
          <a href="#/join" class="muted" style="font-size:13px">Đổi mã PIN (${esc(pin)})</a>
        </div></div>`;
      $$(".ava-grid button", view).forEach((b) => (b.onclick = () => { avatar = b.dataset.a; U.Sound.pop(); $$(".ava-grid button", view).forEach((x) => x.classList.toggle("on", x === b)); }));
      const nm = $(".pl-name", view); setTimeout(() => nm.focus(), 120);
      nm.addEventListener("keydown", (e) => e.key === "Enter" && $("#go", view).click());
      $("#go", view).onclick = () => {
        const name = nm.value.trim(); if (!name) { nm.classList.add("shake"); setTimeout(() => nm.classList.remove("shake"), 400); return U.toast("Hãy nhập tên của bạn", "warn"); }
        U.store.set("playerName", name);
        doJoin(pin, name, avatar);
      };
    }

    async function doJoin(pin, name, avatar, pidOld) {
      view.innerHTML = `<div class="loader"><div class="dots3"><i></i><i></i><i></i></div>Đang vào phòng…</div>`;
      try {
        const r = await Room.join(pin, { name, avatar }, pidOld);
        S.pin = pin; S.pid = r.pid; S.meta = r.meta; S.name = r.name || name; S.avatar = avatar;
        sessionStorage.setItem("gfe_play_" + pin, JSON.stringify({ pid: r.pid, name: S.name, avatar }));
        S.qs = await Room.getQuestions(pin);
        listen();
      } catch (e) { sessionStorage.removeItem("gfe_play_" + pin); askPin(e.message || FB.errMsg(e)); }
    }

    /* ---------------- Lắng nghe phòng ---------------- */
    function listen() {
      S.me = {};
      S.offs.push(Room.watch(S.pin, "players/" + S.pid, (p) => {
        if (!p) { sessionStorage.removeItem("gfe_play_" + S.pin); cleanupAll(); view.innerHTML = `<div class="pl"><div class="pl-card"><div class="pl-big">👋</div><h2>Bạn đã rời phòng</h2><p class="muted">Giáo viên đã mời bạn ra hoặc phòng đã đóng.</p><a class="btn btn-primary" href="#/join">Vào phòng khác</a></div></div>`; return; }
        S.me = p; updHeader();
      }));
      S.offs.push(Room.watch(S.pin, "meta/status", (st) => {
        if (st == null) return;
        S.status = st;
        if (st === "lobby") lobby();
        else if (st === "playing" && !S.started) start();
        else if (st === "ended") ended();
      }));
    }
    function cleanupAll() { S.offs.forEach((f) => f()); S.offs = []; S.timers.clear(); }
    function shell(inner) {
      view.innerHTML = `<div class="pl pl-play" style="--tc:${S.meta.kind === "tug" ? U.TEAM_COLORS[S.me.team || 0] : "#6c4cf5"}">
        <div class="pl-head"><span class="pl-ava">${S.avatar}</span><b>${esc(S.name)}</b><span class="pl-sp"></span><span class="pl-score">⭐ ${U.fmtNum(S.me.score || 0)}</span></div>
        <div class="pl-body">${inner}</div></div>`;
    }
    function updHeader() { const sc = $(".pl-score", view); if (sc) sc.textContent = "⭐ " + U.fmtNum(S.me.score || 0); const tm = $(".pl-team", view); if (tm) { tm.textContent = "Bạn thuộc " + U.TEAM_NAMES[S.me.team || 0]; tm.style.background = U.TEAM_COLORS[S.me.team || 0]; } }

    function lobby() {
      const openTimeStr = S.meta.openTime || (S.meta.settings && S.meta.settings.openTime) || "";
      const openTs = openTimeStr ? new Date(openTimeStr).getTime() : 0;
      const durMin = Number(S.meta.durationMinutes || (S.meta.settings && S.meta.settings.durationMinutes) || 0);
      const isSelfPaced = S.meta.selfPaced !== false && (!S.meta.settings || S.meta.settings.selfPaced !== false);
      const renderLobbyInner = () => {
        const now = Date.now();
        const notOpenYet = openTs > now;
        const leftSec = notOpenYet ? Math.max(0, Math.ceil((openTs - now) / 1000)) : 0;
        shell(`<div class="pl-wait">
          <div class="pl-big bob">${S.avatar}</div>
          <h2>Đã vào phòng PIN #${esc(S.pin)}!</h2>
          ${S.meta.kind === "tug" ? `<div class="pl-team"></div>` : ""}
          <div style="background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;margin:8px auto;max-width:420px;font-size:13.5px;line-height:1.6">
            <div>🎮 <b>${esc(S.meta.title || "Phòng luyện tập")}</b> · 📚 <b>${(S.qs || []).length}</b> câu hỏi</div>
            ${durMin > 0 ? `<div>⏱ Thời gian luyện tập: <b>${durMin} phút</b></div>` : ""}
            ${openTs ? `<div>📅 Giờ mở đề: <b>${esc(new Date(openTs).toLocaleString("vi-VN"))}</b></div>` : ""}
          </div>
          ${notOpenYet
            ? `<div style="margin:12px 0;padding:12px 16px;border-radius:12px;background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.45)">
                <div style="font-weight:800;font-size:15px">⏳ Chưa đến giờ mở đề</div>
                <div style="font-size:22px;font-weight:900;margin-top:4px" id="openCountdown">${U.fmtTime(leftSec)}</div>
                <small>Đề sẽ tự động mở khi hết thời gian đếm ngược</small>
              </div>`
            : isSelfPaced
              ? `<div style="display:flex;flex-direction:column;gap:10px;max-width:380px;margin:14px auto 0;width:100%">
                  <button class="btn btn-xl btn-fun btn-3d" id="btnStartSelfQuiz">📝 Bắt đầu Luyện tập ngay</button>
                  ${Games.get(S.meta.gameId) ? `<button class="btn btn-lg btn-white" id="btnStartGameUI" style="color:#1e293b;font-weight:800">🎮 Chơi bằng giao diện Game (${esc(S.meta.title)})</button>` : ""}
                </div>`
              : `<p>Nhìn lên màn hình chiếu nhé — chờ giáo viên bắt đầu…</p><div class="dots3"><i></i><i></i><i></i></div>`
          }
        </div>`);
        updHeader();
        const btnQuiz = $("#btnStartSelfQuiz", view);
        if (btnQuiz) {
          btnQuiz.onclick = () => {
            S.selfPacedStarted = true;
            raceMode(true);
          };
        }
        const btnGame = $("#btnStartGameUI", view);
        if (btnGame) {
          btnGame.onclick = () => {
            try {
              localStorage.setItem("gfe_student_practice_meta", JSON.stringify({
                title: S.meta.title || "Phòng PIN #" + S.pin,
                count: (S.qs || []).length,
                roomPin: S.pin,
                pid: S.pid,
                playerName: S.name,
                at: Date.now()
              }));
            } catch (e) {}
            window.location.href = `index.html?studentPractice=1&autoStart=1&room=${encodeURIComponent(S.pin)}&pid=${encodeURIComponent(S.pid)}#/game/${encodeURIComponent(S.meta.gameId)}?studentPractice=1&autoStart=1&room=${encodeURIComponent(S.pin)}&pid=${encodeURIComponent(S.pid)}`;
          };
        }
      };
      renderLobbyInner();
      if (openTs > Date.now()) {
        const tid = S.timers.every(1000, () => {
          const rem = Math.ceil((openTs - Date.now()) / 1000);
          const cd = $("#openCountdown", view);
          if (cd && rem > 0) cd.textContent = U.fmtTime(rem);
          if (rem <= 0) {
            S.timers.stop(tid);
            renderLobbyInner();
          }
        });
      }
    }

    function start() {
      if (S.selfPacedStarted) return;
      S.started = true;
      if (S.meta.kind === "quiz") return quizMode();
      if (S.meta.kind === "mil") return milMode();
      if (S.meta.kind === "bell") return bellMode();
      raceMode(false);
    }

    /* ---------- Chế độ Ai là triệu phú (host điều khiển, host tính tiền thưởng) ---------- */
    function milMode() {
      const set = S.meta.settings || {};
      shell(`<div class="pl-q"></div>`);
      let curQi = -1, myRes = null;
      const eliminated = () => S.me && S.me.out;
      S.offs.push(Room.watch(S.pin, "state", (s) => {
        if (!s) return;
        const body = $(".pl-q", view); if (!body) return;
        if (s.phase === "question" && s.qi !== curQi) {
          curQi = s.qi; myRes = null;
          const it = S.qs[s.qi]; if (!it) return;
          if (eliminated()) { body.innerHTML = `<div class="pl-wait"><div class="pl-big">🚪</div><h2>Bạn đã dừng cuộc chơi</h2><p>Giữ <b>${U.fmtNum(S.me.score || 0)}</b> điểm — cổ vũ các bạn còn lại nhé!</p></div>`; return; }
          const wait = Math.max(0, s.startAt - Room.now());
          body.innerHTML = `<div class="pl-wait"><div class="pl-mil-rung">💰 Câu ${s.rung}/${s.total} · <b>${U.fmtNum(s.value || 0)}</b> điểm</div><div class="pl-big bob">🤔</div><h2>Sẵn sàng…</h2><p>Nhìn lên màn chiếu…</p></div>`;
          S.timers.after(wait, () => {
            if (curQi !== s.qi || eliminated()) return;
            body.innerHTML = `<div class="pl-tbar"><i></i></div><div class="pl-qq"></div>`;
            const bar = $(".pl-tbar i", body); if (s.dur) { bar.style.transition = `width ${s.dur}s linear`; requestAnimationFrame(() => (bar.style.width = "0%")); }
            S.ctrl && S.ctrl.destroy();
            S.ctrl = Quiz.mount($(".pl-qq", body), it, { reveal: false, feedback: false, meta: true, onAnswer: (res) => {
              const ms = Room.now() - s.startAt;
              myRes = { ok: res.ok };
              Room.answer(S.pin, s.qi, S.pid, { given: res.given == null ? "" : res.given, ok: res.ok, points: res.points, ms });
              body.insertAdjacentHTML("beforeend", `<div class="pl-sent">✅ Đã khoá đáp án — chờ công bố…</div>`);
            } });
          });
        } else if (s.phase === "reveal" && s.qi === curQi) {
          if (eliminated() && !myRes) return;
          if (S.ctrl) try { S.ctrl.reveal(); } catch (e) { }
          const r = myRes;
          body.insertAdjacentHTML("afterbegin", `<div class="pl-verdict ${r ? (r.ok ? "ok" : "bad") : "none"}">${r ? (r.ok ? `🎉 Chính xác! Leo lên mốc <b>${U.fmtNum(s.value || 0)}</b>` : "😢 Chưa đúng — dừng cuộc chơi") : "⏰ Hết giờ — chưa trả lời"}</div>`);
          const sent = $(".pl-sent", body); if (sent) sent.remove();
          r && r.ok ? U.Sound.correct() : U.Sound.wrong();
          if (set.explain && S.qs[s.qi].explain) { body.insertAdjacentHTML("beforeend", `<details class="fb-ex" open><summary>💡 Lời giải</summary><div>${Quiz.rich(S.qs[s.qi].explain)}</div></details>`); Quiz.typeset(body); }
        } else if (s.phase === "board") {
          Room.getRoom(S.pin).then((rDoc) => {
            const ps = Object.entries((rDoc && rDoc.players) || {}).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
            const rk = ps.findIndex(([pid]) => pid === S.pid) + 1;
            const out = S.me && S.me.out;
            body.innerHTML = `<div class="pl-wait"><div class="pl-rank">#${rk}</div><h2>${out ? "Đã dừng cuộc chơi" : rk === 1 ? "Đang dẫn đầu! 👑" : "Cố lên nhé! 💪"}</h2><p>💰 ${U.fmtNum(S.me.score || 0)} điểm${out ? "" : ` · còn trong cuộc chơi`}</p></div>`;
          });
        }
      }));
    }

    /* ---------- Rung chuông vàng (loại trực tiếp, host điều khiển) ---------- */
    function bellMode() {
      const set = S.meta.settings || {};
      shell(`<div class="pl-q"></div>`);
      let curQi = -1, curPhase = "", myRes = null, voted = false, allPlayers = {};
      let acc = null; // bộ đếm cục bộ của câu hiện tại (điểm/đúng/sai) — hỗ trợ ĐỔI đáp án mà không cộng trùng
      const isOut = () => !!(S.me && S.me.out);
      S.offs.push(Room.watchPlayers(S.pin, (ps) => { allPlayers = ps || {}; }));
      const aliveCount = () => Object.values(allPlayers).filter((p) => !p.out).length;
      S.offs.push(Room.watch(S.pin, "state", (s) => {
        if (!s) return;
        const body = $(".pl-q", view); if (!body) return;
        if (s.phase === "field") {
          curPhase = "field";
          body.innerHTML = isOut()
            ? `<div class="pl-wait"><div class="pl-big">👋</div><h2>Bạn đã chia tay sân đấu</h2><p>Bạn đã vượt qua <b>${S.me.correct || 0}</b> câu. Đừng đi xa — còn cơ hội <b>🛟 phao cứu trợ</b> và <b>✈️ máy bay giấy</b> đang chờ!</p><p class="muted">Sân còn ${s.alive != null ? s.alive : aliveCount()} thí sinh.</p></div>`
            : `<div class="pl-wait"><div class="pl-big bob">🔔</div><h2>Bạn vẫn trên sân đấu!</h2><p>Đã vượt qua <b>${S.me.correct || 0}</b> câu · Sân còn <b>${s.alive != null ? s.alive : aliveCount()}</b> thí sinh.<br>Nhìn lên màn chiếu, sẵn sàng cho câu tiếp theo…</p></div>`;
          return;
        }
        if (s.phase === "question" && s.qi !== curQi) {
          curQi = s.qi; curPhase = "question"; myRes = null;
          acc = { pts: 0, ok: null, score: S.me.score || 0, correct: S.me.correct || 0, wrong: S.me.wrong || 0, streak0: S.me.streak || 0 };
          const it = S.qs[s.qi]; if (!it) return;
          const participant = s.rescue ? isOut() : !isOut();
          if (!participant) {
            body.innerHTML = s.rescue
              ? `<div class="pl-wait"><div class="pl-big bob">🛟</div><h2>Câu cứu trợ đang diễn ra</h2><p>Các bạn được cứu sẽ quay lại sân. Bạn đang an toàn — chờ vòng tiếp theo nhé!</p></div>`
              : `<div class="pl-wait"><div class="pl-big">👋</div><h2>XIN CHIA TAY</h2><p>Bạn đã dừng lại sau <b>${S.me.correct || 0}</b> câu đúng. Hãy cổ vũ các bạn còn trên sân — và chờ 🛟 phao cứu trợ / ✈️ máy bay giấy nhé!</p></div>`;
            return;
          }
          const wait = Math.max(0, s.startAt - Room.now());
          body.innerHTML = `<div class="pl-wait">${s.rescue ? `<div class="pl-round">🛟 CÂU CỨU TRỢ — đúng là quay lại sân!</div>` : s.final ? `<div class="pl-round">🔔 CÂU CHUÔNG VÀNG</div>` : ""}<div class="pl-big bob">🤔</div><h2>${s.rescue ? "Cơ hội trở lại!" : "Sẵn sàng…"}</h2><p>Nhìn lên màn chiếu…</p></div>`;
          S.timers.after(wait, () => {
            if (curQi !== s.qi || curPhase !== "question") return;
            body.innerHTML = `<div class="pl-tbar"><i></i></div>${s.hintKey ? `<div class="pl-round">✈️ Máy bay giấy gợi ý đáp án: <b>${esc(s.hintKey)}</b></div>` : ""}<div class="pl-qq"></div>`;
            const bar = $(".pl-tbar i", body); if (s.dur) { bar.style.transition = `width ${s.dur}s linear`; requestAnimationFrame(() => (bar.style.width = "0%")); }
            S.ctrl && S.ctrl.destroy();
            S.ctrl = Quiz.mount($(".pl-qq", body), it, { reveal: false, feedback: false, meta: true, changeable: !!set.changeAns, onAnswer: (res) => {
              const ms = Room.now() - s.startAt, speed = Math.max(0, 1 - ms / (s.dur * 1000));
              const pts = res.points > 0 ? Math.round(res.points * (500 + 500 * speed)) : 0;
              const first = !acc || acc.ok === null;
              if (acc) { // cộng theo hiệu số để đổi đáp án không bị cộng trùng
                acc.score += pts - acc.pts; acc.correct += (res.ok ? 1 : 0) - (acc.ok ? 1 : 0); acc.wrong += (res.ok ? 0 : 1) - (acc.ok === null ? 0 : acc.ok ? 0 : 1);
                acc.pts = pts; acc.ok = res.ok;
                Room.updatePlayer(S.pin, S.pid, { score: acc.score, correct: acc.correct, wrong: acc.wrong, streak: res.ok ? acc.streak0 + 1 : 0 });
              }
              myRes = { ok: res.ok, pts };
              Room.answer(S.pin, s.qi, S.pid, { given: res.given == null ? "" : res.given, ok: res.ok, points: pts, ms });
              if (first) body.insertAdjacentHTML("beforeend", `<div class="pl-sent">${set.changeAns ? "✏️ Đã ghi nhận đáp án — bạn vẫn đổi được khi còn thời gian" : "✅ Đã khoá đáp án — chờ công bố…"}</div>`);
            } });
          });
          return;
        }
        if (s.phase === "reveal" && s.qi === curQi) {
          curPhase = "reveal";
          if (S.ctrl) try { S.ctrl.reveal(); } catch (e) { }
          const r = myRes;
          const wasParticipant = s.rescue ? isOut() || r : !isOut() || r;
          if (r) {
            const msg = s.rescue
              ? (r.ok ? "🛟 Bạn TRẢ LỜI ĐÚNG — chuẩn bị quay lại sân đấu!" : "😢 Chưa đúng — chưa được cứu lần này")
              : (r.ok ? `🎉 Chính xác! Bạn vẫn trên sân! <b>+${r.pts}</b>` : "👋 Chưa đúng — XIN CHIA TAY. Cảm ơn bạn đã thi đấu!");
            body.insertAdjacentHTML("afterbegin", `<div class="pl-verdict ${r.ok ? "ok" : "bad"}">${msg}</div>`);
            r.ok ? U.Sound.correct() : U.Sound.wrong();
          } else if (wasParticipant && !s.rescue && !isOut()) {
            body.insertAdjacentHTML("afterbegin", `<div class="pl-verdict bad">⏰ Hết giờ — chưa trả lời cũng là chia tay sân đấu</div>`);
          }
          const sent = $(".pl-sent", body); if (sent) sent.remove();
          if (set.explain && S.qs[s.qi] && S.qs[s.qi].explain) { body.insertAdjacentHTML("beforeend", `<details class="fb-ex" open><summary>💡 Lời giải</summary><div>${Quiz.rich(S.qs[s.qi].explain)}</div></details>`); Quiz.typeset(body); }
          return;
        }
        if (s.phase === "rescue") {
          curPhase = "rescue";
          body.innerHTML = isOut()
            ? `<div class="pl-wait"><div class="pl-big bob">🛟</div><h2>PHAO CỨU TRỢ!</h2><p>Cơ hội quay lại sân đấu: trả lời đúng <b>câu cứu trợ</b> sắp tới là bạn trở lại ngay. Chuẩn bị nhé!</p></div>`
            : `<div class="pl-wait"><div class="pl-big">🛟</div><h2>Đang ném phao cứu trợ</h2><p>Các bạn đã bị loại đang có cơ hội quay lại sân…</p></div>`;
          return;
        }
        if (s.phase === "airplane") {
          curPhase = "airplane"; voted = false;
          const it = S.qs[s.qi];
          if (!isOut()) {
            body.innerHTML = `<div class="pl-wait"><div class="pl-big bob">✈️</div><h2>Khán giả đang gấp máy bay giấy…</h2><p>Cả sân đang bỏ phiếu gợi ý đáp án cho bạn. Hít sâu, tin vào chính mình nhé!</p></div>`;
            return;
          }
          if (!it || it.type !== "MC") { body.innerHTML = `<div class="pl-wait"><div class="pl-big">✈️</div><h2>Máy bay giấy</h2><p>Câu này không bỏ phiếu được.</p></div>`; return; }
          body.innerHTML = `<div class="pl-round">✈️ MÁY BAY GIẤY — gợi ý cho thí sinh cuối cùng</div>
            <div class="lq-stem" style="margin:10px 0">${Quiz.rich(it.stem)}</div>
            <div class="pl-votes">${it.options.map((o, i) => `<button class="mc-opt c${i}" data-k="${o.key}"><span class="mc-lt">${esc(o.label || o.key)}</span><span class="mc-tx">${Quiz.rich(o.text)}</span></button>`).join("")}</div>
            <p class="muted" style="text-align:center">Chọn đáp án bạn tin là đúng để "gấp máy bay" gửi lên!</p>`;
          Quiz.typeset(body);
          $$(".pl-votes .mc-opt", body).forEach((b) => (b.onclick = () => {
            if (voted) return; voted = true;
            Room.answer(S.pin, "v" + s.qi, S.pid, { given: b.dataset.k, ok: false, points: 0, ms: 0 });
            $$(".pl-votes .mc-opt", body).forEach((x) => { x.disabled = true; x.classList.toggle("sel", x === b); });
            body.insertAdjacentHTML("beforeend", `<div class="pl-sent">✈️ Máy bay của bạn đã bay tới sân khấu!</div>`);
            U.Sound.pop();
          }));
          return;
        }
        if (s.phase === "airplane-result") {
          curPhase = "airplane-result";
          body.innerHTML = isOut()
            ? `<div class="pl-wait"><div class="pl-big">✈️💌</div><h2>Đã công bố gợi ý!</h2><p>Khán giả chọn nhiều nhất: đáp án <b>${esc(s.hintKey || "?")}</b>. Cùng xem thí sinh quyết định thế nào…</p></div>`
            : `<div class="pl-wait"><div class="pl-big bob">✈️💌</div><h2>Máy bay giấy gợi ý: đáp án ${esc(s.hintKey || "?")}</h2><p>Đây chỉ là gợi ý của khán giả — quyết định là của bạn. Chuẩn bị trả lời câu quyết định!</p></div>`;
          return;
        }
        if (s.phase === "champion" || s.phase === "podium") {
          curPhase = s.phase;
          body.innerHTML = `<div class="pl-wait"><div class="pl-big">🏆</div><h2>${s.phase === "champion" ? "ĐÃ CÓ NHÀ VÔ ĐỊCH RUNG CHUÔNG VÀNG!" : "Tổng kết"}</h2><p>Nhìn lên màn chiếu để xem bảng vinh danh nhé!</p></div>`;
          if (s.phase === "champion") U.Sound.win();
          return;
        }
      }));
    }

    /* ---------- Chế độ tự chơi (đua / kéo co / luyện tập PIN) ---------- */
    function raceMode(immediate) {
      const set = S.meta.settings || {}, goal = set.goal || Math.max(1, (S.qs || []).length) || 10, freeze = set.freeze || 0;
      const durMin = Number(S.meta.durationMinutes || set.durationMinutes || 0);
      const queue = Quiz.queue(S.qs, { shuffleQ: true, shuffleA: false });
      let st = { progress: S.me.progress || 0, score: S.me.score || 0, correct: S.me.correct || 0, wrong: S.me.wrong || 0, streak: S.me.streak || 0 };
      let n = st.correct + st.wrong;
      const isTug = S.meta.kind === "tug";
      shell(`<div class="pl-prog ${isTug ? "hide" : ""}"><div class="pp-bar"><i></i><span class="pp-fig">${S.avatar}</span></div><b class="pp-t"></b>${durMin > 0 ? `<span class="chip amber" id="plDurTimer" style="margin-left:8px">⏱ ${durMin}:00</span>` : ""}</div>
        ${isTug ? `<div class="pl-team"></div>` : ""}
        <div class="pl-q"></div><div class="pl-freeze hide"><div>❄️</div><b>Đóng băng</b><span></span></div>`);
      updHeader();
      if (durMin > 0) {
        let secLeft = durMin * 60;
        const tId = S.timers.every(1000, () => {
          secLeft--;
          const el = $("#plDurTimer", view);
          if (el) el.textContent = "⏱ " + U.fmtTime(Math.max(0, secLeft));
          if (secLeft <= 0) {
            S.timers.stop(tId);
            showPlayerFinishedStandings();
          }
        });
      }
      const drawProg = () => { const k = Math.min(1, st.progress / goal); const b = $(".pp-bar i", view); if (b) b.style.width = k * 100 + "%"; const f = $(".pp-fig", view); if (f) f.style.left = `calc(${k * 100}% - ${k * 28}px)`; const t = $(".pp-t", view); if (t) t.textContent = `${Math.round(st.progress * 10) / 10}/${goal}`; };
      drawProg();
      function showPlayerFinishedStandings() {
        Room.updatePlayer(S.pin, S.pid, Object.assign({}, st, { finishedAt: Date.now() })).catch(() => {});
        const qBox = $(".pl-q", view);
        if (!qBox) return;
        qBox.innerHTML = `<div class="pl-wait"><div class="pl-big">🏆</div><h2 id="plWinTitle">Bạn đã hoàn thành bài luyện tập!</h2><p id="plWinSub">Đang cập nhật bảng xếp hạng phòng #${esc(S.pin)}…</p><div id="plLiveStandings" style="max-width:460px;margin:12px auto 0;text-align:left"></div><div style="margin-top:14px"><a class="btn btn-primary" href="../practice.html?mode=game&room=${encodeURIComponent(S.pin)}">🔄 Quay lại Phòng / Đổi bài</a></div></div>`;
        S.offs.push(Room.watchPlayers(S.pin, (ps) => {
          const list = Object.values(ps || {}).sort((a, b) => (b.score || 0) - (a.score || 0) || (a.finishedAt || 9e15) - (b.finishedAt || 9e15));
          if (!list.length) return;
          const top = list[0];
          const wt = $("#plWinTitle", qBox);
          if (wt) wt.innerHTML = `🏆 Người chiến thắng: ${esc(top.name)} (${U.fmtNum(top.score || 0)} điểm)`;
          const lb = $("#plLiveStandings", qBox);
          if (lb) {
            lb.innerHTML = `<div class="lb-list">${list.map((p, idx) => `<div class="lb-row ${p.pid === S.pid ? "me" : ""}"><span class="lb-rank">${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}</span><span class="lb-name">${esc(p.avatar || "🦊")} ${esc(p.name)}</span><span class="lb-score">${U.fmtNum(p.score || 0)} đ (${p.correct || 0} đúng)</span></div>`).join("")}</div>`;
          }
        }));
      }
      const next = () => {
        if (S.status === "ended") return;
        if (!isTug && (st.progress >= goal || (st.correct + st.wrong) >= (S.qs || []).length && (S.qs || []).length > 0)) {
          showPlayerFinishedStandings();
          return;
        }
        S.ctrl && S.ctrl.destroy(); n++;
        S.ctrl = Quiz.mount($(".pl-q", view), queue.next(), { num: n, explain: set.explain !== false, onAnswer: onAns });
        $(".pl-q", view).scrollTop = 0;
      };
      function onAns(res) {
        if (res.ok) { st.correct++; st.streak++; } else { st.wrong++; st.streak = 0; }
        st.progress = Math.round((st.progress + res.points) * 100) / 100;
        st.score += Math.round(100 * res.points) + (res.ok && st.streak >= 3 ? 20 : 0);
        Room.updatePlayer(S.pin, S.pid, Object.assign({}, st, st.progress >= goal && !isTug ? { finishedAt: Date.now() } : {}));
        drawProg();
        if (res.ok) S.timers.after(set.explain ? 1800 : 900, next);
        else if (freeze > 0) {
          const fz = $(".pl-freeze", view); fz.classList.remove("hide"); let left = freeze; $("span", fz).textContent = left; U.Sound.freeze();
          const id = S.timers.every(1000, () => { left--; $("span", fz).textContent = left; if (left <= 0) { S.timers.stop(id); fz.classList.add("hide"); next(); } });
        } else S.timers.after(1800, next);
      }
      if (immediate || S.meta.selfPaced) {
        S.raceGo = true;
        next();
        return;
      }
      // chờ hiệu lệnh xuất phát
      S.offs.push(Room.watch(S.pin, "state", (s) => {
        if (S.raceGo || !s || !s.startAt) return;
        S.raceGo = true;
        const wait = Math.max(0, s.startAt - Room.now());
        $(".pl-q", view).innerHTML = `<div class="pl-wait"><div class="pl-big cd">3</div><h2>Chuẩn bị!</h2></div>`;
        let c = Math.ceil(wait / 1000);
        const id = S.timers.every(1000, () => { c--; const el = $(".cd", view); if (el) el.textContent = c > 0 ? c : "GO!"; if (c <= 0) { S.timers.stop(id); next(); } });
        if (c <= 0) { S.timers.stop(id); next(); }
      }));
    }

    /* ---------- Chế độ đấu trường (host điều khiển) ---------- */
    function quizMode() {
      const set = S.meta.settings || {};
      shell(`<div class="pl-q"></div>`);
      let curQi = -1, myRes = null, sentAt = 0, acc = null;
      S.offs.push(Room.watch(S.pin, "state", (s) => {
        if (!s) return;
        const body = $(".pl-q", view); if (!body) return;
        if (s.phase === "question" && s.qi !== curQi) {
          curQi = s.qi; myRes = null;
          acc = { pts: 0, ok: null, score: S.me.score || 0, correct: S.me.correct || 0, wrong: S.me.wrong || 0, streak0: S.me.streak || 0 };
          const it = S.qs[s.qi]; if (!it) return;
          const wait = Math.max(0, s.startAt - Room.now());
          body.innerHTML = `<div class="pl-wait">${s.roundName ? `<div class="pl-round">${esc(s.roundName)}</div>` : ""}<div class="pl-big bob">🤔</div><h2>Câu hỏi${s.value ? ` · ${s.value} điểm` : ""}</h2><p>Nhìn lên màn chiếu…</p></div>`;
          S.timers.after(wait, () => {
            if (curQi !== s.qi) return;
            body.innerHTML = `<div class="pl-tbar"><i></i></div><div class="pl-qq"></div>`;
            const bar = $(".pl-tbar i", body); bar.style.transition = `width ${s.dur}s linear`; requestAnimationFrame(() => (bar.style.width = "0%"));
            S.ctrl && S.ctrl.destroy();
            S.ctrl = Quiz.mount($(".pl-qq", body), it, { reveal: false, feedback: false, meta: true, changeable: !!set.changeAns, onAnswer: (res) => {
              const ms = Room.now() - s.startAt, speed = Math.max(0, 1 - ms / (s.dur * 1000));
              const streak = res.ok ? acc.streak0 + 1 : 0;
              const pts = res.points > 0 ? Math.round(res.points * (500 + 500 * speed)) + (res.ok && streak >= 2 ? Math.min(250, (streak - 1) * 50) : 0) : 0;
              const first = acc.ok === null;
              acc.score += pts - acc.pts; acc.correct += (res.ok ? 1 : 0) - (acc.ok ? 1 : 0); acc.wrong += (res.ok ? 0 : 1) - (acc.ok === null ? 0 : acc.ok ? 0 : 1);
              acc.pts = pts; acc.ok = res.ok;
              myRes = { ok: res.ok, pts, partial: res.points };
              Room.answer(S.pin, s.qi, S.pid, { given: res.given == null ? "" : res.given, ok: res.ok, points: pts, ms });
              Room.updatePlayer(S.pin, S.pid, { score: acc.score, correct: acc.correct, wrong: acc.wrong, streak });
              if (first) body.insertAdjacentHTML("beforeend", `<div class="pl-sent">${set.changeAns ? "✏️ Đã ghi nhận đáp án — bạn vẫn đổi được khi còn thời gian" : "✅ Đã khoá đáp án — chờ công bố…"}</div>`);
            } });
          });
        } else if (s.phase === "reveal" && s.qi === curQi) {
          if (S.ctrl) try { S.ctrl.reveal(); } catch (e) { }
          const r = myRes;
          body.insertAdjacentHTML("afterbegin", `<div class="pl-verdict ${r ? (r.ok ? "ok" : r.pts ? "part" : "bad") : "none"}">${r ? (r.ok ? `🎉 Chính xác! <b>+${r.pts}</b>` : r.pts ? `👍 Đúng một phần <b>+${r.pts}</b>` : "😢 Chưa đúng") : "⏰ Hết giờ — bạn chưa trả lời"}</div>`);
          const sent = $(".pl-sent", body); if (sent) sent.remove();
          r && r.ok ? U.Sound.correct() : U.Sound.wrong();
          if (set.explain && S.qs[s.qi].explain) { body.insertAdjacentHTML("beforeend", `<details class="fb-ex" open><summary>💡 Lời giải</summary><div>${Quiz.rich(S.qs[s.qi].explain)}</div></details>`); Quiz.typeset(body); }
        } else if (s.phase === "board") {
          Room.getRoom(S.pin).then((rDoc) => {
            const ps = Object.entries((rDoc && rDoc.players) || {}).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
            const rk = ps.findIndex(([pid]) => pid === S.pid) + 1;
            body.innerHTML = `<div class="pl-wait"><div class="pl-rank">#${rk}</div><h2>${rk === 1 ? "Bạn đang dẫn đầu! 👑" : rk <= 3 ? "Top 3 rồi! 🔥" : "Cố lên nhé! 💪"}</h2><p>⭐ ${U.fmtNum(S.me.score || 0)} điểm ${(S.me.streak || 0) >= 2 ? `· 🔥 chuỗi ${S.me.streak}` : ""}</p></div>`;
          });
        }
      }));
    }

    async function ended() {
      cleanupAll();
      sessionStorage.removeItem("gfe_play_" + S.pin);
      const rDoc = await Room.getRoom(S.pin).catch(() => null);
      let R = (rDoc && Array.isArray(rDoc.results) && rDoc.results.length) ? rDoc.results : [];
      if (!R.length && rDoc && rDoc.players) {
        R = Object.values(rDoc.players).sort((a, b) => (b.score || 0) - (a.score || 0)).map((p, i) => ({ pid: p.pid, name: p.name, score: p.score || 0, rank: i + 1 }));
      }
      const winner = R[0];
      const me = R.find((r) => r.pid === S.pid);
      const rk = me ? me.rank : null;
      view.innerHTML = `<div class="pl pl-end"><div class="pl-card stg">
        <div class="pl-big">${rk === 1 ? "🥇" : rk === 2 ? "🥈" : rk === 3 ? "🥉" : "🎉"}</div>
        <h1>${rk ? "Hạng " + rk : "Kết thúc!"}</h1>
        ${winner ? `<div style="margin:6px 0 10px;font-weight:800;color:#fbbf24">🏆 Người chiến thắng: ${esc(winner.name)} (${U.fmtNum(winner.score)} điểm)</div>` : ""}
        <p class="muted">${me ? `${U.fmtNum(me.score)} điểm` : S.meta.kind === "tug" ? "Xem kết quả đội trên màn chiếu" : "Cảm ơn bạn đã tham gia"}</p>
        <div class="lb-list" style="text-align:left">${R.slice(0, 8).map((r) => `<div class="lb-row ${r.pid === S.pid ? "me" : ""}"><span class="lb-rank">${r.rank}</span><span class="lb-name">${esc(r.name)}</span><span class="lb-score">${U.fmtNum(r.score)}</span></div>`).join("")}</div>
        <a class="btn btn-lg btn-primary" href="../practice.html?mode=game">Quay lại Phòng luyện tập</a></div></div>`;
      if (rk && rk <= 3) { U.Sound.win(); U.confetti(); }
    }
    return cleanup;
  };
})();
