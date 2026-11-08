/* =========================================================
   room.js — Phòng chơi trực tuyến & Phòng nhóm MOBA
   Đồng bộ đa thiết bị qua QMath Supabase (configurations: groom_{pin}, groom_q_{pin})
   + BroadcastChannel tức thì trên cùng trình duyệt + dự phòng Firebase RTDB.
   Cấu trúc:
     groom_{pin}:
       meta     : {pin, gameId, title, kind, hostUid, hostName, status, maxPlayers, openTime, durationMinutes, createdAt, updatedAt, settings, practiceConfig, kickedUids}
       state    : {phase, qi, startAt, dur, roundId}
       players  : { [pid]: {pid, uid, name, avatar, team, score, correct, wrong, skipped, progress, total, streak, online, isHost, joinedAt, finishedAt} }
       answers  : { [qi]: { [pid]: {given, ok, points, ms} } }
       results  : [{pid, name, avatar, score, correct, progress, finishedAt, rank}]
     groom_q_{pin}:
       questions: [ ... câu hỏi chuẩn hoá ... ]
   ========================================================= */
(function () {
  const SUPABASE_URL = "https://cuniqanbumcrqcdlcvad.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODg1NjYsImV4cCI6MjA4ODI2NDU2Nn0.95331-2-i643R2v1_2gBMG2-qdA2g-L6T2WzX7k_t_I";

  const Room = {};
  const _cache = {};       // pin -> room doc
  const _qCache = {};      // pin -> questions array
  const _watchers = {};    // pin -> Set<{path, cb, lastJson}>
  const _timers = {};      // pin -> intervalId
  const _channels = {};    // pin -> BroadcastChannel
  const _writeQueues = {}; // pin -> Promise

  function headers(prefer) {
    const h = {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json"
    };
    if (prefer) h["Prefer"] = prefer;
    return h;
  }

  function plain(v) {
    if (window.U && typeof U.plain === "function") return U.plain(v);
    return JSON.parse(JSON.stringify(v === undefined ? null : v));
  }

  function getChannel(pin) {
    if (!window.BroadcastChannel) return null;
    if (!_channels[pin]) {
      try {
        const bc = new BroadcastChannel("qmath_groom_" + pin);
        bc.onmessage = (ev) => {
          if (ev && ev.data && ev.data.room) {
            _cache[pin] = ev.data.room;
            notifyWatchers(pin, _cache[pin]);
          }
        };
        _channels[pin] = bc;
      } catch (e) { }
    }
    return _channels[pin];
  }

  function broadcastLocal(pin, roomDoc) {
    try {
      const bc = getChannel(pin);
      if (bc) bc.postMessage({ pin, room: roomDoc, at: Date.now() });
    } catch (e) { }
    try {
      localStorage.setItem("qmath_groom_local_" + pin, JSON.stringify({ room: roomDoc, at: Date.now() }));
    } catch (e) { }
  }

  async function sbGetDoc(id) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/configurations?id=eq.${encodeURIComponent(id)}&select=data,updated_at`, {
        method: "GET",
        headers: headers()
      });
      if (!res.ok) return null;
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
        return rows[0].data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function sbSaveDoc(id, data) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/configurations?on_conflict=id`, {
        method: "POST",
        headers: headers("resolution=merge-duplicates,return=minimal"),
        body: JSON.stringify({
          id: id,
          data: plain(data),
          updated_at: new Date().toISOString()
        })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function sbDeleteDoc(id) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/configurations?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers()
      });
    } catch (e) { }
  }

  async function fetchRoom(pin, force) {
    pin = String(pin || "").trim();
    if (!pin) return null;
    if (!force && _cache[pin]) return _cache[pin];
    const remote = await sbGetDoc("groom_" + pin);
    if (remote && remote.meta) {
      _cache[pin] = remote;
      return remote;
    }
    try {
      const loc = JSON.parse(localStorage.getItem("qmath_groom_local_" + pin) || "null");
      if (loc && loc.room && loc.room.meta) {
        _cache[pin] = loc.room;
        return loc.room;
      }
    } catch (e) { }
    delete _cache[pin];
    return null;
  }

  function mutateRoom(pin, mutator) {
    pin = String(pin || "").trim();
    const prev = _writeQueues[pin] || Promise.resolve();
    const next = prev.then(async () => {
      let doc = await fetchRoom(pin, true);
      if (!doc) doc = _cache[pin] || null;
      const updated = await mutator(doc);
      if (updated === "__DELETE__") {
        delete _cache[pin];
        delete _qCache[pin];
        try { localStorage.removeItem("qmath_groom_local_" + pin); } catch (e) { }
        try { localStorage.removeItem("qmath_groom_q_" + pin); } catch (e) { }
        await Promise.all([sbDeleteDoc("groom_" + pin), sbDeleteDoc("groom_q_" + pin)]);
        notifyWatchers(pin, null);
        return null;
      }
      if (updated) {
        if (updated.meta) updated.meta.updatedAt = Date.now();
        _cache[pin] = updated;
        broadcastLocal(pin, updated);
        notifyWatchers(pin, updated);
        await sbSaveDoc("groom_" + pin, updated);
      }
      return updated;
    }).catch((err) => {
      console.warn("[Room.mutateRoom]", err);
      return _cache[pin] || null;
    });
    _writeQueues[pin] = next;
    return next;
  }

  function extractPath(obj, path) {
    if (!obj) return null;
    if (!path) return obj;
    const parts = String(path).split("/").filter(Boolean);
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return null;
      cur = cur[p];
    }
    return cur === undefined ? null : cur;
  }

  function notifyWatchers(pin, roomDoc) {
    const set = _watchers[pin];
    if (!set || !set.size) return;
    set.forEach((w) => {
      try {
        const val = extractPath(roomDoc, w.path);
        const j = JSON.stringify(val);
        if (j !== w.lastJson) {
          w.lastJson = j;
          w.cb(val);
        }
      } catch (e) { console.error(e); }
    });
  }

  function ensurePoller(pin) {
    if (_timers[pin]) return;
    getChannel(pin);
    _timers[pin] = setInterval(async () => {
      const set = _watchers[pin];
      if (!set || !set.size) {
        clearInterval(_timers[pin]);
        delete _timers[pin];
        return;
      }
      const doc = await fetchRoom(pin, true);
      notifyWatchers(pin, doc);
    }, 1200);
  }

  Room.init = () => { };
  Room.now = () => Date.now();

  Room.create = async (arg1, arg2) => {
    const opts = (arg2 !== undefined) ? Object.assign({}, arg1, { questions: arg2 }) : (arg1 || {});
    const gameId = opts.gameId || "practice";
    const title = opts.title || "Phòng luyện tập";
    const kind = opts.kind || "quiz";
    const questions = Array.isArray(opts.questions) ? opts.questions : [];
    const settings = Object.assign({
      maxPlayers: Number(opts.maxPlayers || (opts.settings && opts.settings.maxPlayers) || 30),
      openTime: opts.openTime || (opts.settings && opts.settings.openTime) || null,
      durationMinutes: Number(opts.durationMinutes || (opts.settings && opts.settings.durationMinutes) || 0),
      selfPaced: opts.selfPaced !== undefined ? opts.selfPaced : Boolean(opts.settings && opts.settings.selfPaced),
      allowSkip: true
    }, opts.settings || {});

    const hostUid = opts.hostUid || (window.FB && FB.user && FB.user.uid) || ("u_" + Math.random().toString(36).slice(2, 10));
    const hostName = opts.hostName || (window.FB && typeof FB.name === "function" ? FB.name() : "Chủ phòng");

    for (let t = 0; t < 10; t++) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      const existing = await sbGetDoc("groom_" + pin);
      if (existing && existing.meta && existing.meta.status !== "ended" && (Date.now() - (existing.meta.createdAt || 0) < 3 * 3600e3)) {
        continue;
      }
      const now = Date.now();
      const roomDoc = plain({
        meta: {
          pin,
          gameId,
          title,
          kind,
          roomType: opts.roomType || "teacher", // 'teacher' | 'moba'
          hostUid,
          hostName,
          status: "lobby",
          maxPlayers: settings.maxPlayers || 30,
          openTime: settings.openTime || null,
          durationMinutes: settings.durationMinutes || 0,
          selfPaced: Boolean(settings.selfPaced),
          createdAt: now,
          updatedAt: now,
          questionCount: questions.length,
          practiceConfig: opts.practiceConfig || null,
          kickedUids: [],
          settings
        },
        state: { phase: "lobby", qi: 0, roundId: 1 },
        players: opts.initialPlayers || {},
        answers: {},
        results: []
      });

      _cache[pin] = roomDoc;
      _qCache[pin] = plain(questions);
      broadcastLocal(pin, roomDoc);
      try { localStorage.setItem("qmath_groom_q_" + pin, JSON.stringify(_qCache[pin])); } catch (e) { }

      await Promise.all([
        sbSaveDoc("groom_" + pin, roomDoc),
        sbSaveDoc("groom_q_" + pin, { pin, questions: _qCache[pin], updatedAt: now })
      ]);
      return pin;
    }
    throw new Error("Không tạo được mã PIN phòng, vui lòng thử lại.");
  };

  Room.getRoom = async (pin, force) => fetchRoom(pin, force !== false);

  Room.getMeta = async (pin) => {
    const r = await fetchRoom(pin, true);
    return r ? r.meta : null;
  };

  Room.getQuestions = async (pin) => {
    pin = String(pin || "").trim();
    const qDoc = await sbGetDoc("groom_q_" + pin);
    if (qDoc && Array.isArray(qDoc.questions)) {
      _qCache[pin] = qDoc.questions;
      return qDoc.questions;
    }
    if (_qCache[pin]) return _qCache[pin];
    try {
      const loc = JSON.parse(localStorage.getItem("qmath_groom_q_" + pin) || "null");
      if (Array.isArray(loc)) return loc;
    } catch (e) { }
    const r = await fetchRoom(pin, false);
    return (r && Array.isArray(r.questions)) ? r.questions : [];
  };

  Room.setQuestions = async (pin, questions) => {
    pin = String(pin || "").trim();
    const qs = plain(questions || []);
    _qCache[pin] = qs;
    try { localStorage.setItem("qmath_groom_q_" + pin, JSON.stringify(qs)); } catch (e) { }
    await sbSaveDoc("groom_q_" + pin, { pin, questions: qs, updatedAt: Date.now() });
    await mutateRoom(pin, (doc) => {
      if (!doc || !doc.meta) return doc;
      doc.meta.questionCount = qs.length;
      doc.meta.questionsUpdatedAt = Date.now();
      return doc;
    });
  };

  Room.updateMeta = (pin, patch) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    doc.meta = Object.assign({}, doc.meta || {}, plain(patch || {}));
    if (patch && patch.settings) {
      doc.meta.settings = Object.assign({}, (doc.meta && doc.meta.settings) || {}, plain(patch.settings));
    }
    return doc;
  });

  Room.setMaxPlayers = (pin, maxPlayers) => {
    const m = Math.max(1, Math.min(200, Number(maxPlayers) || 10));
    return Room.updateMeta(pin, { maxPlayers: m, settings: { maxPlayers: m } });
  };

  Room.watch = (pin, path, cb) => {
    pin = String(pin || "").trim();
    if (!_watchers[pin]) _watchers[pin] = new Set();
    const entry = { path: path || "", cb, lastJson: undefined };
    _watchers[pin].add(entry);
    fetchRoom(pin, true).then((doc) => {
      if (!_watchers[pin] || !_watchers[pin].has(entry)) return;
      const val = extractPath(doc, entry.path);
      entry.lastJson = JSON.stringify(val);
      try { cb(val); } catch (e) { console.error(e); }
    });
    ensurePoller(pin);
    return () => {
      if (_watchers[pin]) {
        _watchers[pin].delete(entry);
        if (!_watchers[pin].size) {
          clearInterval(_timers[pin]);
          delete _timers[pin];
        }
      }
    };
  };

  Room.watchPlayers = (pin, cb) => Room.watch(pin, "players", cb);

  Room.updatePlayer = (pin, pid, patch) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    if (!doc.players) doc.players = {};
    if (!doc.players[pid]) return doc;
    doc.players[pid] = Object.assign({}, doc.players[pid], plain(patch || {}), { lastActiveAt: Date.now() });
    return doc;
  });

  Room.kick = (pin, pid) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    if (doc.players && doc.players[pid]) {
      const kickedUid = doc.players[pid].uid || pid;
      delete doc.players[pid];
      if (!Array.isArray(doc.meta.kickedUids)) doc.meta.kickedUids = [];
      if (!doc.meta.kickedUids.includes(kickedUid)) doc.meta.kickedUids.push(kickedUid);
      if (!doc.meta.kickedUids.includes(pid)) doc.meta.kickedUids.push(pid);
    }
    return doc;
  });

  Room.leave = (pin, pid) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    if (doc.players && doc.players[pid]) {
      delete doc.players[pid];
    }
    const remaining = Object.values(doc.players || {});
    // Nếu là phòng nhóm học sinh (moba) hoặc tất cả đã thoát khỏi phòng -> Tự động hủy mã phòng!
    if (remaining.length === 0) {
      if (doc.meta && doc.meta.roomType === "moba") {
        return "__DELETE__";
      }
      // Với phòng giáo viên, nếu đã bắt đầu mà tất cả học sinh thoát hoặc host thoát
      if (doc.meta && doc.meta.autoDestroyOnEmpty) {
        return "__DELETE__";
      }
    } else if (doc.meta && (doc.meta.hostUid === pid || !remaining.some((p) => p.isHost || p.uid === doc.meta.hostUid || p.pid === doc.meta.hostUid))) {
      // Chuyển quyền chủ phòng cho người chơi tiếp theo trong phòng nhóm MOBA
      if (doc.meta.roomType === "moba") {
        const nextHost = remaining.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0];
        if (nextHost) {
          nextHost.isHost = true;
          doc.meta.hostUid = nextHost.uid || nextHost.pid;
          doc.meta.hostName = nextHost.name;
        }
      }
    }
    return doc;
  });

  Room.setStatus = (pin, status) => mutateRoom(pin, (doc) => {
    if (!doc || !doc.meta) return null;
    doc.meta.status = status;
    if (!doc.state) doc.state = {};
    doc.state.phase = status;
    if (status === "playing" && !doc.state.startAt) doc.state.startAt = Date.now();
    return doc;
  });

  Room.setState = (pin, state) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    doc.state = Object.assign({}, doc.state || {}, plain(state || {}));
    return doc;
  });

  Room.resetForNextMatch = (pin, patchMeta) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    if (patchMeta) doc.meta = Object.assign({}, doc.meta || {}, plain(patchMeta));
    doc.meta.status = "lobby";
    doc.state = { phase: "lobby", qi: 0, roundId: ((doc.state && doc.state.roundId) || 1) + 1 };
    doc.answers = {};
    doc.results = [];
    Object.values(doc.players || {}).forEach((p) => {
      p.score = 0;
      p.correct = 0;
      p.wrong = 0;
      p.skipped = 0;
      p.progress = 0;
      p.streak = 0;
      p.finishedAt = null;
      p.ready = true;
    });
    return doc;
  });

  Room.finish = (pin, results) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    doc.results = plain(results || []);
    if (doc.meta) doc.meta.status = "ended";
    if (!doc.state) doc.state = {};
    doc.state.phase = "ended";
    return doc;
  });

  Room.close = async (pin) => {
    const m = await Room.getMeta(pin);
    if (m && m.status === "ended") return;
    await Room.remove(pin);
  };

  Room.remove = (pin) => mutateRoom(pin, () => "__DELETE__");

  Room.listAll = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/configurations?id=like.groom_%25&select=id,data,updated_at&order=updated_at.desc&limit=50`, {
        method: "GET",
        headers: headers()
      });
      if (!res.ok) return {};
      const rows = await res.json();
      const out = {};
      (rows || []).forEach((r) => {
        if (r.id && r.id.startsWith("groom_") && !r.id.startsWith("groom_q_") && r.data && r.data.meta) {
          const pin = r.id.replace(/^groom_/, "");
          out[pin] = r.data;
        }
      });
      return out;
    } catch (e) {
      return {};
    }
  };

  /* ---------- Phía người chơi ---------- */
  Room.join = async (pin, playerInfo, pidOld) => {
    pin = String(pin || "").trim();
    const doc = await fetchRoom(pin, true);
    if (!doc || !doc.meta) throw new Error("Không tìm thấy phòng với mã PIN " + pin + " (hoặc phòng đã bị hủy).");
    const meta = doc.meta;
    if (meta.status === "ended" && meta.roomType !== "moba") throw new Error("Phòng chơi này đã kết thúc.");

    const uid = (playerInfo && playerInfo.uid) || pidOld || ("p" + (window.U ? U.uid(8) : Math.random().toString(36).slice(2, 10)));
    const kicked = Array.isArray(meta.kickedUids) ? meta.kickedUids : [];
    if (kicked.includes(uid) || (pidOld && kicked.includes(pidOld))) {
      throw new Error("Bạn đã bị chủ phòng mời ra khỏi phòng này.");
    }

    let resultPayload = null;
    await mutateRoom(pin, (cur) => {
      if (!cur || !cur.meta) throw new Error("Phòng không còn tồn tại.");
      if (!cur.players) cur.players = {};
      const ps = cur.players;

      // Nếu người chơi đã ở trong phòng -> kết nối lại
      const existingPid = (pidOld && ps[pidOld]) ? pidOld : (ps[uid] ? uid : Object.keys(ps).find((k) => ps[k] && ps[k].uid === uid));
      if (existingPid && ps[existingPid]) {
        ps[existingPid].online = true;
        if (playerInfo && playerInfo.name) ps[existingPid].name = playerInfo.name.trim().slice(0, 24);
        if (playerInfo && playerInfo.avatar) ps[existingPid].avatar = playerInfo.avatar;
        ps[existingPid].lastActiveAt = Date.now();
        resultPayload = { pid: existingPid, meta: cur.meta, name: ps[existingPid].name, player: ps[existingPid] };
        return cur;
      }

      const maxP = Number(cur.meta.maxPlayers || (cur.meta.settings && cur.meta.settings.maxPlayers) || 30);
      const currentCount = Object.keys(ps).length;
      if (currentCount >= maxP) {
        throw new Error(`Phòng đã đầy (${currentCount}/${maxP} người). Vui lòng nhờ chủ phòng tăng giới hạn số người!`);
      }

      let rawName = ((playerInfo && playerInfo.name) || "Học sinh").trim().slice(0, 22) || "Học sinh";
      let nm = rawName;
      const names = Object.values(ps).map((p) => (p.name || "").toLowerCase());
      let k = 2;
      while (names.includes(nm.toLowerCase())) nm = rawName.slice(0, 18) + " " + k++;

      const c = [0, 0];
      Object.values(ps).forEach((p) => c[p.team || 0]++);
      const pid = pidOld || uid || ("p" + (window.U ? U.uid(8) : Math.random().toString(36).slice(2, 10)));
      const isHost = Boolean((playerInfo && playerInfo.isHost) || cur.meta.hostUid === uid || cur.meta.hostUid === pid || currentCount === 0 && cur.meta.roomType === "moba");
      if (isHost && cur.meta.roomType === "moba") {
        cur.meta.hostUid = pid;
        cur.meta.hostName = nm;
      }

      const pObj = {
        pid,
        uid,
        name: nm,
        avatar: (playerInfo && playerInfo.avatar) || "🦊",
        team: c[0] <= c[1] ? 0 : 1,
        score: 0,
        correct: 0,
        wrong: 0,
        skipped: 0,
        progress: 0,
        total: Number(cur.meta.questionCount || 0),
        streak: 0,
        online: true,
        isHost,
        joinedAt: Date.now(),
        lastActiveAt: Date.now()
      };
      ps[pid] = pObj;
      resultPayload = { pid, meta: cur.meta, name: nm, player: pObj };
      return cur;
    });

    return resultPayload;
  };

  Room.answer = (pin, qi, pid, data) => mutateRoom(pin, (doc) => {
    if (!doc) return null;
    if (!doc.answers) doc.answers = {};
    if (!doc.answers[qi]) doc.answers[qi] = {};
    doc.answers[qi][pid] = plain(data);
    return doc;
  });

  Room.watchAnswers = (pin, qi, cb) => Room.watch(pin, "answers/" + qi, cb);

  window.Room = Room;
})();
