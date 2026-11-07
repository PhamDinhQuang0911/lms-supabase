/* =========================================================
   room.js — Phòng chơi trực tuyến (Firebase Realtime Database)
   rooms/{pin}/
     meta     : {pin, gameId, title, kind, hostUid, hostName, status, createdAt, settings}
     questions: [ ... câu hỏi đã chuẩn hoá ... ]
     state    : {phase, qi, startAt, dur}         (game do host điều khiển)
     players/{pid}: {name, avatar, team, score, correct, wrong, progress, streak, online, finishedAt}
     answers/{qi}/{pid}: {given, ok, points, ms}
     results  : [{pid, name, score, rank}]
   ========================================================= */
(function () {
  const Room = {};
  let offset = 0;
  const ref = (p) => FB.rtdb.ref(p);
  const TS = () => firebase.database.ServerValue.TIMESTAMP;

  Room.init = () => {
    if (!FB.rtdb) return;
    try { ref(".info/serverTimeOffset").on("value", (s) => (offset = s.val() || 0)); } catch (e) { }
  };
  Room.now = () => Date.now() + offset;

  Room.create = async ({ gameId, title, kind, questions, settings }) => {
    for (let t = 0; t < 8; t++) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const s = await ref("rooms/" + pin + "/meta").get();
      if (s.exists()) continue;
      await ref("rooms/" + pin).set(U.plain({
        meta: { pin, gameId, title, kind, hostUid: FB.user.uid, hostName: FB.name(), status: "lobby", createdAt: Date.now(), settings: settings || {} },
        questions, state: { phase: "lobby" }
      }));
      return pin;
    }
    throw new Error("Không tạo được mã PIN, thử lại.");
  };
  Room.watch = (pin, path, cb) => {
    const r = ref("rooms/" + pin + (path ? "/" + path : ""));
    const fn = (s) => cb(s.val());
    r.on("value", fn);
    return () => r.off("value", fn);
  };
  Room.watchPlayers = (pin, cb) => Room.watch(pin, "players", cb);
  Room.updatePlayer = (pin, pid, patch) => ref(`rooms/${pin}/players/${pid}`).update(patch);
  Room.kick = (pin, pid) => ref(`rooms/${pin}/players/${pid}`).remove();
  Room.setStatus = (pin, status) => ref(`rooms/${pin}/meta/status`).set(status);
  Room.setState = (pin, state) => ref(`rooms/${pin}/state`).set(U.plain(state));
  Room.finish = async (pin, results) => {
    await ref(`rooms/${pin}/results`).set(U.plain(results));
    await ref(`rooms/${pin}/meta/status`).set("ended");
  };
  Room.close = async (pin) => {
    const s = await ref(`rooms/${pin}/meta/status`).get();
    if (s.val() === "ended") return;
    await ref(`rooms/${pin}`).remove();
  };
  Room.remove = (pin) => ref(`rooms/${pin}`).remove();
  Room.listAll = async () => { const s = await ref("rooms").get(); return s.val() || {}; };

  /* ---------- Phía người chơi ---------- */
  Room.getMeta = async (pin) => { const s = await ref(`rooms/${pin}/meta`).get(); return s.val(); };
  Room.getQuestions = async (pin) => { const s = await ref(`rooms/${pin}/questions`).get(); return s.val() || []; };
  Room.join = async (pin, { name, avatar }, pidOld) => {
    const meta = await Room.getMeta(pin);
    if (!meta) throw new Error("Không tìm thấy phòng với mã PIN này.");
    if (meta.status === "ended") throw new Error("Phòng đã kết thúc.");
    const ps = (await ref(`rooms/${pin}/players`).get()).val() || {};
    if (pidOld && ps[pidOld]) {
      await ref(`rooms/${pin}/players/${pidOld}`).update({ online: true });
      ref(`rooms/${pin}/players/${pidOld}/online`).onDisconnect().set(false);
      return { pid: pidOld, meta };
    }
    if (meta.status === "playing" && meta.kind === "quiz") { /* cho phép vào muộn */ }
    let nm = name.trim().slice(0, 20); const names = Object.values(ps).map((p) => (p.name || "").toLowerCase());
    let k = 2; while (names.includes(nm.toLowerCase())) nm = name.trim().slice(0, 17) + " " + k++;
    const c = [0, 0]; Object.values(ps).forEach((p) => c[p.team || 0]++);
    const pid = "p" + U.uid(8);
    const pref = ref(`rooms/${pin}/players/${pid}`);
    await pref.set({ name: nm, avatar, team: c[0] <= c[1] ? 0 : 1, score: 0, correct: 0, wrong: 0, progress: 0, streak: 0, online: true, joinedAt: Date.now() });
    pref.child("online").onDisconnect().set(false);
    return { pid, meta, name: nm };
  };
  Room.answer = (pin, qi, pid, data) => ref(`rooms/${pin}/answers/${qi}/${pid}`).set(U.plain(data));
  Room.watchAnswers = (pin, qi, cb) => Room.watch(pin, "answers/" + qi, cb);

  window.Room = Room;
})();
