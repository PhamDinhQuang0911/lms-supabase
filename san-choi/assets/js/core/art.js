/* =========================================================
   art.js — Thư viện nhân vật & cảnh vẽ bằng SVG (vector,
   sắc nét mọi màn hình, đổi màu theo đội).
   ========================================================= */
(function () {
  let n = 0; const uid = () => "a" + (++n) + Math.random().toString(36).slice(2, 5);
  const sh = (c, p) => U.shade(c, p);
  const SKIN = ["#ffd7b5", "#f6c79a", "#eab485", "#d99a6c", "#ffe0c2", "#f1c27d"];
  const HAIR = ["#3b2a20", "#1f1a17", "#6b3e26", "#2b2b2b", "#8a4b2a", "#4a2f1d"];
  const Art = { SKIN, HAIR };

  Art.place = (svg, x, y, w, h, extra) => svg.replace("<svg ", `<svg x="${x}" y="${y}" width="${w}" height="${h}" ${extra || ""} `);

  /* ---------------- XE ĐUA (nhìn ngang) ---------------- */
  Art.car = (color, num, o) => {
    o = o || {}; const g = uid(), d = sh(color, -0.35), l = sh(color, 0.35);
    return `<svg viewBox="0 0 170 80" class="art art-car" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${d}"/></linearGradient>
<linearGradient id="${g}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6f7ff"/><stop offset="1" stop-color="#7cc8f0"/></linearGradient></defs>
<ellipse cx="86" cy="72" rx="72" ry="6" fill="#000" opacity=".22"/>
<path d="M8 30 L30 30 L33 40 L12 42Z" fill="${d}"/><rect x="8" y="27" width="24" height="5" rx="2" fill="${sh(color, -0.5)}"/>
<path d="M14 54 Q12 42 28 39 L56 35 Q66 18 90 16 L112 16 Q127 17 138 32 L154 36 Q164 40 162 52 L160 58 Q159 62 154 62 L20 62 Q14 62 14 56Z" fill="url(#${g})" stroke="${sh(color, -0.55)}" stroke-width="2"/>
<path d="M62 35 Q70 23 89 22 L100 22 L100 35Z" fill="url(#${g}w)" stroke="${sh(color, -0.55)}" stroke-width="1.5"/>
<path d="M105 22 L112 22 Q124 23 132 35 L105 35Z" fill="url(#${g}w)" stroke="${sh(color, -0.55)}" stroke-width="1.5"/>
<circle cx="90" cy="30" r="7.5" fill="#fff" stroke="${d}" stroke-width="1.5"/><path d="M90 26 h7 a4 4 0 0 1 0 7 h-7z" fill="#1d2340" opacity=".85"/>
<path d="M20 47 L156 45" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
<path d="M20 53 L156 51" stroke="${sh(color, 0.6)}" stroke-width="2" stroke-linecap="round" opacity=".6"/>
<circle cx="80" cy="49" r="10" fill="#fff" stroke="${d}" stroke-width="2"/>
<text x="80" y="53.5" font-family="Baloo 2,Arial" font-size="13" font-weight="800" text-anchor="middle" fill="${d}">${num == null ? "" : num}</text>
<ellipse cx="158" cy="44" rx="3.5" ry="4.5" fill="#fff6b0" stroke="#e2b400"/><rect x="14" y="44" width="4" height="7" rx="1" fill="#ff3b3b"/>
<path d="M34 24 Q60 20 70 22" stroke="#fff" stroke-width="2" opacity=".5" fill="none"/>
<g class="wheel"><circle cx="44" cy="62" r="13" fill="#1b1b22"/><circle cx="44" cy="62" r="7" fill="#d9dce6"/><path d="M44 55v14M37 62h14M39 57l10 10M49 57l-10 10" stroke="#8a8fa3" stroke-width="1.6"/><circle cx="44" cy="62" r="2.2" fill="#555"/></g>
<g class="wheel"><circle cx="130" cy="62" r="13" fill="#1b1b22"/><circle cx="130" cy="62" r="7" fill="#d9dce6"/><path d="M130 55v14M123 62h14M125 57l10 10M135 57l-10 10" stroke="#8a8fa3" stroke-width="1.6"/><circle cx="130" cy="62" r="2.2" fill="#555"/></g>
</svg>`;
  };

  /* ---------------- VỊT ---------------- */
  Art.duck = (color, o) => {
    o = o || {}; const g = uid(), d = sh(color, -0.35);
    return `<svg viewBox="0 0 130 100" class="art art-duck" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="${g}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff6b8"/><stop offset=".5" stop-color="#ffd93d"/><stop offset="1" stop-color="#f5b300"/></radialGradient></defs>
<ellipse cx="62" cy="88" rx="50" ry="7" fill="#063a6b" opacity=".18"/>
<path d="M14 58 Q2 40 12 34 Q20 46 32 50Z" fill="#ffc81f" stroke="#e09c00" stroke-width="2" stroke-linejoin="round"/>
<path d="M12 60 Q14 88 60 90 Q100 90 104 64 Q106 50 90 48 L44 48 Q20 46 12 60Z" fill="url(#${g})" stroke="#e09c00" stroke-width="2.2"/>
<path d="M38 58 Q56 48 78 58 Q70 78 46 76 Q34 70 38 58Z" fill="#ffc400" stroke="#e09c00" stroke-width="1.6"/>
<path d="M46 62 Q58 58 68 63" stroke="#e09c00" stroke-width="1.5" fill="none" opacity=".6"/>
<circle cx="86" cy="34" r="21" fill="url(#${g})" stroke="#e09c00" stroke-width="2.2"/>
<path d="M102 36 Q122 32 125 40 Q118 49 101 46Z" fill="#ff8a1f" stroke="#d96500" stroke-width="1.8" stroke-linejoin="round"/><path d="M104 41 Q114 41 123 40" stroke="#d96500" stroke-width="1.3" fill="none"/>
<ellipse cx="93" cy="29" rx="4.6" ry="5.4" fill="#1d2340"/><circle cx="94.8" cy="27" r="1.8" fill="#fff"/>
<ellipse cx="86" cy="43" rx="5" ry="3.2" fill="#ff8fa3" opacity=".6"/>
<path d="M64 22 Q68 4 88 6 Q106 8 106 24 Q86 16 64 22Z" fill="${color}" stroke="${d}" stroke-width="1.8"/>
<path d="M103 21 L120 23 Q118 28 104 27Z" fill="${d}"/><circle cx="84" cy="7" r="4" fill="#fff" stroke="${d}"/>
<path d="M70 18 Q84 13 100 18" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>
<path class="ripple" d="M4 86 Q16 79 28 86 T52 86 T76 86 T100 86 T124 86" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".85"/>
</svg>`;
  };

  /* ---------------- THUYỀN RỒNG ---------------- */
  Art.boat = (color, o) => {
    o = o || {}; const g = uid(), d = sh(color, -0.4), l = sh(color, 0.3);
    const rower = (x, i) => `<g class="rower" style="--i:${i}">
      <g class="oar" style="transform-origin:${x + 4}px 44px"><path d="M${x + 4} 44 L${x - 18} 78" stroke="#7a4a1e" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="${x - 19}" cy="80" rx="4.5" ry="8" transform="rotate(35 ${x - 19} 80)" fill="#a8672d"/></g>
      <path d="M${x - 7} 52 Q${x - 6} 34 ${x + 2} 33 Q${x + 11} 34 ${x + 11} 52Z" fill="#fff" stroke="${d}" stroke-width="1.4"/>
      <circle cx="${x + 2}" cy="26" r="8" fill="${SKIN[i % SKIN.length]}"/>
      <path d="M${x - 6} 24 Q${x + 2} 14 ${x + 10} 24Z" fill="${color}"/><path d="M${x - 7} 24 h18" stroke="${d}" stroke-width="2"/>
      <circle cx="${x + 5}" cy="27" r="1.3" fill="#1d2340"/></g>`;
    return `<svg viewBox="0 0 240 100" class="art art-boat" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${d}"/></linearGradient>
<pattern id="${g}p" width="12" height="10" patternUnits="userSpaceOnUse"><path d="M0 10 Q6 0 12 10" fill="none" stroke="${sh(color, 0.55)}" stroke-width="1.6" opacity=".7"/></pattern></defs>
<ellipse cx="120" cy="88" rx="108" ry="7" fill="#03305a" opacity=".22"/>
${[48, 88, 128, 168].map(rower).join("")}
<g><circle cx="26" cy="38" r="9" fill="${SKIN[2]}"/><path d="M18 36 Q26 27 34 36Z" fill="#ffd166"/>
<ellipse cx="30" cy="58" rx="11" ry="8" fill="#c0392b" stroke="#7b241c" stroke-width="2"/><ellipse cx="30" cy="54" rx="11" ry="4" fill="#f5d6a0" stroke="#7b241c" stroke-width="1.5"/>
<g class="drumstick"><path d="M33 40 L36 52" stroke="#5b3a1a" stroke-width="2.5" stroke-linecap="round"/></g></g>
<path d="M8 56 L206 56 Q204 76 182 80 L40 80 Q16 78 8 56Z" fill="url(#${g})" stroke="${sh(color, -0.6)}" stroke-width="2.4"/>
<path d="M12 60 L202 60 Q200 74 182 77 L42 77 Q22 75 12 60Z" fill="url(#${g}p)"/>
<path d="M6 56 L208 56" stroke="#ffd166" stroke-width="4.5" stroke-linecap="round"/>
<path d="M10 58 Q-2 44 6 30 Q8 44 20 50Z" fill="${color}" stroke="${sh(color, -0.6)}" stroke-width="2"/>
<path d="M4 34 Q-4 26 2 20 Q6 28 10 30Z" fill="#ffd166"/>
<path d="M202 58 Q214 44 206 26 Q222 18 234 30 Q228 33 226 37 Q236 42 224 47 Q214 50 206 60Z" fill="${color}" stroke="${sh(color, -0.6)}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M208 24 Q206 12 214 8 Q214 18 218 22Z" fill="#ffd166" stroke="#d4a017"/><path d="M200 34 Q192 26 198 18 Q202 28 206 30Z" fill="#ffd166"/>
<circle cx="222" cy="31" r="3.4" fill="#fff"/><circle cx="223" cy="31" r="1.8" fill="#1d2340"/>
<path d="M226 42 L238 44 L228 46Z" fill="#fff"/><path d="M234 30 Q240 26 238 22" stroke="#ff6b3d" stroke-width="2" fill="none"/>
<path class="ripple" d="M0 90 Q15 83 30 90 T60 90 T90 90 T120 90 T150 90 T180 90 T210 90 T240 90" stroke="#fff" stroke-width="3" fill="none" opacity=".75"/>
</svg>`;
  };

  /* ---------------- NHẢY BAO BỐ ---------------- */
  Art.sacker = (color, i) => {
    i = i || 0; const skin = SKIN[i % SKIN.length], hair = HAIR[i % HAIR.length], d = sh(color, -0.35), g = uid();
    const girl = i % 2 === 1;
    return `<svg viewBox="0 0 100 130" class="art art-sack" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3c48d"/><stop offset="1" stop-color="#b58b4c"/></linearGradient></defs>
<g class="hopper">
${girl ? `<path d="M30 30 Q24 56 34 62 L66 62 Q76 56 70 30Z" fill="${hair}"/>` : ""}
<path d="M32 76 Q32 44 50 43 Q68 44 68 76Z" fill="${color}" stroke="${d}" stroke-width="1.6"/>
<path d="M44 46 L50 54 L56 46" fill="none" stroke="#fff" stroke-width="2"/>
<path d="M36 52 Q22 62 28 76" stroke="${skin}" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M64 52 Q78 62 72 76" stroke="${skin}" stroke-width="7" stroke-linecap="round" fill="none"/>
<path d="M24 74 Q22 108 30 122 L70 122 Q78 108 76 74 Q50 66 24 74Z" fill="url(#${g})" stroke="#8b6a3a" stroke-width="2.2"/>
<path d="M22 94 Q50 88 78 94 L78 104 Q50 98 22 104Z" fill="${color}"/><path d="M22 94 Q50 88 78 94" stroke="${d}" stroke-width="1.5" fill="none"/>
<path d="M20 74 Q50 64 80 74 L78 82 Q50 72 22 82Z" fill="#c9a266" stroke="#8b6a3a" stroke-width="1.8"/>
<path d="M36 84 l4 6 M56 110 l5 4 M62 80 l-3 5" stroke="#8b6a3a" stroke-width="1.5" opacity=".6"/>
<circle cx="27" cy="77" r="5" fill="${skin}"/><circle cx="73" cy="77" r="5" fill="${skin}"/>
<circle cx="50" cy="28" r="18" fill="${skin}"/>
${girl
        ? `<path d="M31 27 Q30 8 50 8 Q70 8 69 27 Q64 16 50 17 Q38 17 31 27Z" fill="${hair}"/><circle cx="31" cy="20" r="6" fill="${color}"/><circle cx="69" cy="20" r="6" fill="${color}"/>`
        : `<path d="M32 26 Q30 8 50 8 Q72 8 68 26 Q66 16 58 18 Q52 12 44 18 Q36 16 32 26Z" fill="${hair}"/>`}
<ellipse cx="43" cy="29" rx="2.6" ry="3.2" fill="#1d2340"/><ellipse cx="57" cy="29" rx="2.6" ry="3.2" fill="#1d2340"/>
<circle cx="44" cy="28" r=".9" fill="#fff"/><circle cx="58" cy="28" r=".9" fill="#fff"/>
<path d="M43 36 Q50 42 57 36" stroke="#b5463a" stroke-width="2.2" fill="#ff8a80" stroke-linecap="round"/>
<ellipse cx="38" cy="35" rx="3.5" ry="2.2" fill="#ff8fa3" opacity=".55"/><ellipse cx="62" cy="35" rx="3.5" ry="2.2" fill="#ff8fa3" opacity=".55"/>
</g></svg>`;
  };

  /* ---------------- KÉO CO (nhìn ngang, quay mặt sang phải) ---------------- */
  Art.tugKid = (color, i) => {
    i = i || 0; const skin = SKIN[i % SKIN.length], hair = HAIR[(i + 1) % HAIR.length], d = sh(color, -0.35);
    return `<svg viewBox="0 0 90 120" class="art art-tug" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="38" cy="114" rx="26" ry="4" fill="#000" opacity=".18"/>
<g class="kid">
<path d="M34 76 L16 108" stroke="#2f3b66" stroke-width="10" stroke-linecap="round"/>
<path d="M42 76 L50 108" stroke="#3a4a80" stroke-width="10" stroke-linecap="round"/>
<path d="M8 110 h16" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M44 110 h16" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
<path d="M8 112 h16 M44 112 h16" stroke="${d}" stroke-width="3" stroke-linecap="round"/>
<g transform="rotate(-20 38 60)"><rect x="25" y="38" width="28" height="42" rx="12" fill="${color}" stroke="${d}" stroke-width="1.6"/>
<text x="39" y="66" font-family="Baloo 2,Arial" font-size="13" font-weight="800" text-anchor="middle" fill="#fff" opacity=".9">${i + 1}</text></g>
<path d="M42 50 Q62 60 82 68" stroke="${skin}" stroke-width="8" stroke-linecap="round" fill="none"/>
<path d="M36 56 Q58 66 80 72" stroke="${sh(skin, -0.12)}" stroke-width="8" stroke-linecap="round" fill="none"/>
<circle cx="82" cy="69" r="5" fill="${skin}"/>
<circle cx="28" cy="28" r="16" fill="${skin}"/>
<path d="M12 26 Q12 9 30 10 Q44 12 44 24 Q34 18 24 22 Q16 24 12 26Z" fill="${hair}"/>
<path d="M12 22 Q28 16 44 20" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M12 22 l-8 6 M12 22 l-9 -2" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="35" cy="28" rx="2.3" ry="2.8" fill="#1d2340"/><path d="M31 23 l7 2" stroke="#1d2340" stroke-width="1.8" stroke-linecap="round"/>
<path d="M33 35 Q38 33 41 36 Q38 39 33 37Z" fill="#b5463a"/>
<ellipse cx="25" cy="34" rx="3.5" ry="2.2" fill="#ff8fa3" opacity=".6"/>
<path d="M44 16 q4 -4 2 -8 M48 22 q5 -2 5 -6" stroke="#5ec8ff" stroke-width="2" fill="none" stroke-linecap="round" class="sweat"/>
</g></svg>`;
  };

  /* ---------------- QUÂN CỜ ---------------- */
  Art.pawn = (color, label) => {
    const g = uid(), d = sh(color, -0.4), l = sh(color, 0.45);
    return `<svg viewBox="0 0 44 60" class="art art-pawn" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="${g}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${l}"/><stop offset=".6" stop-color="${color}"/><stop offset="1" stop-color="${d}"/></radialGradient></defs>
<ellipse cx="22" cy="55" rx="17" ry="4" fill="#000" opacity=".25"/>
<path d="M6 52 Q6 44 14 42 L16 30 Q10 26 12 20 L32 20 Q34 26 28 30 L30 42 Q38 44 38 52Z" fill="url(#${g})" stroke="${d}" stroke-width="1.6"/>
<circle cx="22" cy="13" r="10" fill="url(#${g})" stroke="${d}" stroke-width="1.6"/>
<ellipse cx="18.5" cy="9.5" rx="3" ry="2" fill="#fff" opacity=".7"/>
${label != null ? `<text x="22" y="49" font-family="Baloo 2,Arial" font-weight="800" font-size="11" fill="#fff" text-anchor="middle">${label}</text>` : ""}
</svg>`;
  };

  /* ---------------- ZOMBIE (ngộ nghĩnh, không ghê rợn) ---------------- */
  Art.zombie = (color, i) => {
    i = i || 0; const g = uid(), skin = "#9ccc65", d = "#689f38";
    return `<svg viewBox="0 0 90 120" class="art art-zombie" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aed581"/><stop offset="1" stop-color="#7cb342"/></linearGradient></defs>
<ellipse cx="45" cy="116" rx="24" ry="4" fill="#000" opacity=".22"/>
<g class="zb">
<path d="M30 66 L24 104" stroke="#4e342e" stroke-width="9" stroke-linecap="round"/><path d="M58 66 L64 104" stroke="#3e2723" stroke-width="9" stroke-linecap="round"/>
<path d="M18 104 h16 M56 104 h16" stroke="#263238" stroke-width="7" stroke-linecap="round"/>
<rect x="28" y="40" width="34" height="34" rx="9" fill="url(#${g})" stroke="${d}" stroke-width="2"/>
<path d="M30 52 h30 M34 46 v22" stroke="${d}" stroke-width="1.4" opacity=".5"/>
<path d="M28 48 Q10 50 8 40" stroke="${skin}" stroke-width="8" stroke-linecap="round" fill="none"/>
<path d="M62 48 Q80 50 82 40" stroke="${skin}" stroke-width="8" stroke-linecap="round" fill="none"/>
<circle cx="8" cy="39" r="5" fill="${skin}"/><circle cx="82" cy="39" r="5" fill="${skin}"/>
<circle cx="45" cy="26" r="17" fill="url(#${g})" stroke="${d}" stroke-width="2"/>
<path d="M30 20 Q34 10 45 11 Q56 10 60 20 Q52 15 45 16 Q38 15 30 20Z" fill="#558b2f"/>
<ellipse cx="38" cy="26" rx="4.5" ry="5" fill="#fff"/><ellipse cx="53" cy="26" rx="4.5" ry="5" fill="#fff"/>
<circle cx="39" cy="27" r="2.3" fill="#1b1f3b"/><circle cx="52" cy="27" r="2.3" fill="#1b1f3b"/>
<path d="M36 36 h18" stroke="#33691e" stroke-width="2.4" stroke-linecap="round"/>
<path d="M39 36 v4 M45 36 v5 M51 36 v4" stroke="#33691e" stroke-width="1.6"/>
<path d="M58 22 l6 -3 M58 28 l6 1" stroke="#33691e" stroke-width="1.5" opacity=".6"/>
</g></svg>`;
  };

  /* ---------------- BÓNG BAY ---------------- */
  Art.balloon = (color, label) => {
    const g = uid(), l = sh(color, 0.4), d = sh(color, -0.3);
    return `<svg viewBox="0 0 80 120" class="art art-balloon" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="${g}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${l}"/><stop offset=".6" stop-color="${color}"/><stop offset="1" stop-color="${d}"/></radialGradient></defs>
<path d="M40 70 Q38 78 40 84 Q42 90 40 96" stroke="#b0bec5" stroke-width="1.6" fill="none"/>
<path d="M40 62 L36 70 h8z" fill="${d}"/>
<path d="M40 4 C64 4 70 30 64 46 C59 58 48 66 40 68 C32 66 21 58 16 46 C10 30 16 4 40 4Z" fill="url(#${g})" stroke="${d}" stroke-width="1.5"/>
<ellipse cx="31" cy="24" rx="7" ry="11" fill="#fff" opacity=".4" transform="rotate(-20 31 24)"/>
${label != null ? `<text x="40" y="42" font-family="Baloo 2,Arial" font-weight="800" font-size="20" fill="#fff" text-anchor="middle">${label}</text>` : ""}
</svg>`;
  };

  /* ---------------- Trang trí ---------------- */
  Art.cloud = (x, y, s, op) => `<g transform="translate(${x} ${y}) scale(${s || 1})" opacity="${op || 0.95}"><path d="M10 30 Q0 30 2 21 Q4 12 14 14 Q18 2 32 4 Q44 0 48 12 Q60 10 60 22 Q62 30 52 30Z" fill="#fff"/></g>`;
  Art.tree = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s || 1})"><rect x="-3" y="0" width="6" height="16" rx="2" fill="#8a5a2b"/><circle cx="0" cy="-8" r="14" fill="${c || "#3fb15a"}"/><circle cx="-8" cy="-2" r="9" fill="${U.shade(c || "#3fb15a", -0.12)}"/><circle cx="7" cy="-14" r="6" fill="#fff" opacity=".18"/></g>`;
  Art.star = (x, y, r, c) => { let p = ""; for (let k = 0; k < 10; k++) { const a = (Math.PI / 5) * k - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; p += (k ? "L" : "M") + (x + Math.cos(a) * rr).toFixed(1) + " " + (y + Math.sin(a) * rr).toFixed(1); } return `<path d="${p}Z" fill="${c || "#ffd166"}"/>`; };
  Art.flagChecker = (x, y, w, h, n) => { let s = ""; n = n || 6; const cw = w / 2, ch = h / n; for (let r = 0; r < n; r++) for (let c = 0; c < 2; c++) s += `<rect x="${x + c * cw}" y="${y + r * ch}" width="${cw}" height="${ch}" fill="${(r + c) % 2 ? "#1d2340" : "#fff"}"/>`; return s; };
  Art.trophy = () => `<svg viewBox="0 0 120 130" class="art" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".5" stop-color="#ffc93c"/><stop offset="1" stop-color="#e09100"/></linearGradient></defs>
<path d="M30 14 H90 V44 Q90 76 60 80 Q30 76 30 44Z" fill="url(#tg)" stroke="#b87400" stroke-width="3"/>
<path d="M30 22 Q8 22 10 42 Q12 58 34 60" fill="none" stroke="#e5a400" stroke-width="7"/><path d="M90 22 Q112 22 110 42 Q108 58 86 60" fill="none" stroke="#e5a400" stroke-width="7"/>
<rect x="52" y="78" width="16" height="18" fill="#e5a400"/><rect x="34" y="96" width="52" height="12" rx="4" fill="#8a5a2b"/><rect x="28" y="106" width="64" height="14" rx="4" fill="#6d4421"/>
<path d="M44 22 Q42 50 56 66" stroke="#fff" stroke-width="5" opacity=".55" fill="none" stroke-linecap="round"/>${Art.star(60, 42, 13, "#fff8d6")}</svg>`;

  /* ---------------- Ảnh minh hoạ thẻ game (320x180) ---------------- */
  const T = {};
  const bg = (a, b) => { const g = uid(); return { id: g, def: `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` }; };
  const wrap = (defs, inner) => `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${inner}</svg>`;

  T["keo-co"] = () => { const s = bg("#7dd3fc", "#c4b5fd");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>${Art.cloud(20, 18, 0.8)}${Art.cloud(220, 10, 1)}
<path d="M0 120 Q80 100 160 116 T320 112 V180 H0Z" fill="#6ee7a0"/><path d="M0 140 Q90 126 180 140 T320 136 V180 H0Z" fill="#34c77b"/>
<rect x="157" y="104" width="6" height="60" fill="#fff" opacity=".85"/>
<path d="M30 132 L290 132" stroke="#a0662f" stroke-width="5" stroke-linecap="round"/><path d="M30 132 L290 132" stroke="#d29a5a" stroke-width="2" stroke-dasharray="6 6"/>
<path d="M160 132 l-8 18 h16z" fill="#ef4444"/>
${Art.place(Art.tugKid("#ef4444", 0), 18, 82, 56, 74)}${Art.place(Art.tugKid("#ef4444", 2), 62, 82, 56, 74)}
<g transform="translate(320 0) scale(-1 1)">${Art.place(Art.tugKid("#3b82f6", 1), 18, 82, 56, 74)}${Art.place(Art.tugKid("#3b82f6", 3), 62, 82, 56, 74)}</g>
<text x="160" y="40" font-family="Baloo 2,Arial" font-size="30" font-weight="800" text-anchor="middle" fill="#fff" stroke="#6c4cf5" stroke-width="1.5">VS</text>`); };

  T["dua-xe"] = () => { const s = bg("#ffb26b", "#ff6b9d");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<circle cx="250" cy="44" r="26" fill="#fff2a8" opacity=".9"/>
<path d="M0 78 L30 60 L60 74 L95 48 L130 70 L170 52 L210 72 L250 56 L290 70 L320 58 V90 H0Z" fill="#7c3aed" opacity=".35"/>
<rect y="86" width="320" height="94" fill="#3a3f55"/><rect y="86" width="320" height="6" fill="#ffd166"/>
<path d="M0 118 H320 M0 150 H320" stroke="#fff" stroke-width="3" stroke-dasharray="18 14" opacity=".7"/>
${Art.flagChecker(286, 92, 20, 86, 8)}
<path d="M14 104 h40 M8 112 h30 M20 140 h44 M10 132 h26" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/>
${Art.place(Art.car("#ef4444", 1), 70, 86, 120, 56)}${Art.place(Art.car("#22c55e", 2), 150, 120, 120, 56)}`); };

  T["dua-vit"] = () => { const s = bg("#38bdf8", "#1e6fd9");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<rect width="320" height="54" fill="#bde9ff"/>${Art.cloud(30, 8, 0.7)}${Art.cloud(200, 2, 0.9)}
<path d="M0 54 Q40 44 80 54 T160 54 T240 54 T320 54 V64 H0Z" fill="#7fd36b"/>
${[80, 112, 144].map((y) => `<path d="M0 ${y} Q20 ${y - 6} 40 ${y} T80 ${y} T120 ${y} T160 ${y} T200 ${y} T240 ${y} T280 ${y} T320 ${y}" stroke="#fff" stroke-width="2" fill="none" opacity=".35"/>`).join("")}
<ellipse cx="270" cy="160" rx="18" ry="6" fill="#4ade80"/><ellipse cx="40" cy="96" rx="14" ry="5" fill="#4ade80"/>
${Art.place(Art.duck("#ef4444"), 60, 62, 76, 58)}${Art.place(Art.duck("#a855f7"), 150, 92, 84, 64)}${Art.place(Art.duck("#22c55e"), 36, 116, 80, 60)}`); };

  T["dua-thuyen"] = () => { const s = bg("#22d3ee", "#0e7490");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<rect width="320" height="60" fill="#ffd8a8"/><circle cx="70" cy="44" r="22" fill="#ff8a4c"/>
<path d="M0 60 L40 40 L70 54 L120 30 L170 56 L220 36 L270 52 L320 38 V66 H0Z" fill="#0f766e" opacity=".55"/>
${[90, 130, 165].map((y) => `<path d="M0 ${y} Q20 ${y - 5} 40 ${y} T80 ${y} T120 ${y} T160 ${y} T200 ${y} T240 ${y} T280 ${y} T320 ${y}" stroke="#fff" stroke-width="2" fill="none" opacity=".35"/>`).join("")}
${Art.place(Art.boat("#ef4444"), 20, 64, 190, 78)}${Art.place(Art.boat("#f59e0b"), 110, 104, 190, 78)}`); };

  T["nhay-bao"] = () => { const s = bg("#bbf7d0", "#fde68a");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>${Art.cloud(240, 12, 0.8)}
<path d="M0 96 Q160 80 320 96 V180 H0Z" fill="#4ade80"/><path d="M0 150 H320" stroke="#fff" stroke-width="3" opacity=".6"/><path d="M0 122 H320" stroke="#fff" stroke-width="3" opacity=".6"/>
${Art.tree(30, 84, 1.2)}${Art.tree(292, 80, 1)}
<rect x="270" y="96" width="5" height="84" fill="#fff"/>
${Art.place(Art.sacker("#ef4444", 0), 70, 42, 64, 84)}${Art.place(Art.sacker("#3b82f6", 1), 138, 70, 64, 84)}${Art.place(Art.sacker("#f59e0b", 2), 200, 50, 60, 78)}
<path d="M100 132 q-6 4 -14 2 M168 160 q-6 4 -14 2" stroke="#a16207" stroke-width="2" fill="none" opacity=".5"/>`); };

  T["xuc-xac"] = () => { const s = bg("#a78bfa", "#f472b6"); let cells = "";
    const cols = ["#fde68a", "#bae6fd", "#bbf7d0", "#fecaca", "#ddd6fe"];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) cells += `<rect x="${18 + c * 42}" y="${40 + r * 42}" width="38" height="38" rx="9" fill="${cols[(r * 7 + c) % 5]}" stroke="#fff" stroke-width="2"/>`;
    const die = (x, y, rot, pips) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-22" y="-22" width="44" height="44" rx="10" fill="#fff" stroke="#e2e8f0" stroke-width="2"/>${pips.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="4.5" fill="#6c4cf5"/>`).join("")}</g>`;
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>${cells}
${Art.place(Art.pawn("#ef4444"), 60, 40, 30, 42)}${Art.place(Art.pawn("#3b82f6"), 144, 84, 30, 42)}
${die(232, 54, 14, [[-10, -10], [0, 0], [10, 10]])}${die(274, 92, -12, [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 0]])}
${Art.star(250, 130, 12, "#fff")}`); };

  T["dau-truong"] = () => { const s = bg("#6c4cf5", "#22d3ee");
    const phone = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-28" y="-50" width="56" height="100" rx="10" fill="#1d2340"/><rect x="-24" y="-44" width="48" height="88" rx="6" fill="#fff"/>
${[["#ef4444", -12, -6], ["#3b82f6", 12, -6], ["#f59e0b", -12, 18], ["#22c55e", 12, 18]].map(([c, a, b]) => `<rect x="${a - 10}" y="${b - 10}" width="20" height="20" rx="4" fill="${c}"/>`).join("")}<rect x="-18" y="-36" width="36" height="8" rx="3" fill="#e2e8f0"/></g>`;
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<circle cx="60" cy="40" r="60" fill="#fff" opacity=".08"/><circle cx="280" cy="160" r="70" fill="#fff" opacity=".08"/>
<rect x="88" y="30" width="144" height="88" rx="10" fill="#1d2340"/><rect x="94" y="36" width="132" height="76" rx="6" fill="#f8fafc"/>
<text x="160" y="60" font-family="Baloo 2,Arial" font-size="13" font-weight="800" text-anchor="middle" fill="#6c4cf5">MÃ PIN</text>
<text x="160" y="92" font-family="Baloo 2,Arial" font-size="26" font-weight="800" text-anchor="middle" fill="#1d2340" letter-spacing="3">482 915</text>
<rect x="150" y="118" width="20" height="14" fill="#1d2340"/><rect x="128" y="130" width="64" height="6" rx="3" fill="#1d2340"/>
${phone(46, 120, -12)}${phone(274, 116, 10)}
<text x="70" y="40" font-size="20">⚡</text><text x="240" y="44" font-size="20">🏆</text>`); };

  T["nhanh-chop"] = () => { const s = bg("#f59e0b", "#ef4444");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<path d="M0 128 Q80 108 160 122 T320 116 V180 H0Z" fill="#7f1d1d" opacity=".35"/>
<path d="M168 8 L118 96 L152 96 L128 172 L206 74 L168 74 L196 8Z" fill="#fef08a" stroke="#f59e0b" stroke-width="4" stroke-linejoin="round"/>
<path d="M40 44 h44 M28 66 h34 M258 40 h40 M246 62 h30" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
<text x="52" y="156" font-family="Baloo 2,Arial" font-size="25" font-weight="800" fill="#fff">3…2…1…</text>
<text x="238" y="156" font-family="Baloo 2,Arial" font-size="25" font-weight="800" fill="#fff">GO! ⚡</text>`); };

  T["ghep-the"] = () => { const s = bg("#06b6d4", "#8b5cf6");
    const card = (x, y, r, face) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-27" y="-38" width="54" height="76" rx="9" fill="${face ? "#fff" : "#312e81"}" stroke="#fff" stroke-width="2.5"/>${face ? `<text x="0" y="12" font-size="30" text-anchor="middle">🦊</text>` : `<text x="0" y="14" font-size="30" text-anchor="middle">🃏</text>`}</g>`;
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<path d="M0 150 Q160 128 320 148 V180 H0Z" fill="#0e7490" opacity=".5"/>
${card(70, 84, -10, false)}${card(134, 78, 6, true)}${card(198, 84, -4, false)}${card(258, 76, 12, true)}
<path d="M134 30 q14 -14 28 0 M198 118 q14 14 28 0" stroke="#fde047" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-dasharray="1 7"/>
${Art.star(160, 150, 10, "#fde047")}${Art.star(52, 34, 7, "#fff")}${Art.star(282, 140, 8, "#fff")}`); };

  T["rung-chuong"] = () => { const s = bg("#f59e0b", "#ef4444"); let dots = "";
    for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) dots += `<circle cx="${36 + c * 36}" cy="${138 + r * 24}" r="9" fill="#fff" opacity="${r === 1 && c > 4 ? ".25" : ".9"}"/>`;
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<circle cx="160" cy="66" r="46" fill="#fbbf24" stroke="#fff7ed" stroke-width="4"/><circle cx="160" cy="66" r="36" fill="#f59e0b"/>
<path d="M160 38 q6 10 0 16 M138 78 q22 12 44 0" stroke="#92400e" stroke-width="5" fill="none" stroke-linecap="round"/>
<text x="160" y="80" font-size="30" text-anchor="middle">🔔</text>
<path d="M96 30 l-14 -12 M224 30 l14 -12 M160 14 v-8" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
${dots}
<text x="160" y="126" font-family="Baloo 2,Arial" font-size="12" font-weight="800" text-anchor="middle" fill="#fff">AI SẼ RUNG CHUÔNG?</text>`); };

  T["trieu-phu"] = () => { const g = uid();
    return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="${g}" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#4c3bd1"/><stop offset="1" stop-color="#0b0b2e"/></radialGradient>
<linearGradient id="${g}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect width="320" height="180" fill="url(#${g})"/><path d="M110 0 L80 180 H240 L210 0Z" fill="url(#${g}l)"/>
<circle cx="160" cy="62" r="40" fill="none" stroke="#ffd166" stroke-width="4"/><circle cx="160" cy="62" r="31" fill="#1e1b6e" stroke="#7c6cff" stroke-width="2"/>
<text x="160" y="74" font-family="Baloo 2,Arial" font-size="32" font-weight="800" text-anchor="middle" fill="#ffd166">$</text>
${[["A", 30, 118], ["B", 166, 118], ["C", 30, 148], ["D", 166, 148]].map(([k, x, y], i) => `<path d="M${x} ${y + 10} l12 -12 h100 l12 12 l-12 12 h-100z" fill="${i === 1 ? "#f59e0b" : "#1e1b6e"}" stroke="#7c6cff" stroke-width="2"/><text x="${x + 22}" y="${y + 15}" font-family="Baloo 2,Arial" font-weight="800" font-size="13" fill="#ffd166">${k}:</text>`).join("")}
${Art.star(40, 30, 6, "#fff")}${Art.star(290, 40, 5, "#ffd166")}${Art.star(270, 90, 4, "#fff")}</svg>`; };

  T["lat-manh"] = () => { const s = bg("#fb923c", "#f472b6"); let tiles = "";
    const open = [1, 2, 5, 6, 9, 10];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const k = r * 4 + c; if (!open.includes(k)) tiles += `<rect x="${60 + c * 50}" y="${18 + r * 48}" width="48" height="46" rx="6" fill="${["#6c4cf5", "#3b82f6", "#ec4899", "#22c55e"][k % 4]}" stroke="#fff" stroke-width="2"/><text x="${84 + c * 50}" y="${48 + r * 48}" font-family="Baloo 2,Arial" font-size="18" font-weight="800" fill="#fff" text-anchor="middle">${k + 1}</text>`; }
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<rect x="60" y="18" width="198" height="142" rx="8" fill="#7dd3fc"/><circle cx="160" cy="70" r="20" fill="#fde047"/>
<path d="M60 130 L110 80 L150 118 L190 76 L258 140 V160 H60Z" fill="#16a34a"/><path d="M60 150 Q160 130 258 152 V160 H60Z" fill="#15803d"/>${tiles}
<text x="290" y="40" font-size="26">❓</text><text x="14" y="160" font-size="26">🧩</text>`); };

  T["vong-quay"] = () => { const s = bg("#fde047", "#fb7185"); const cx = 160, cy = 92, r = 74, k = 8; let seg = "";
    const cs = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];
    for (let i = 0; i < k; i++) { const a0 = (i / k) * Math.PI * 2, a1 = ((i + 1) / k) * Math.PI * 2; seg += `<path d="M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}Z" fill="${cs[i]}" stroke="#fff" stroke-width="2"/>`; }
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/><circle cx="${cx}" cy="${cy}" r="${r + 8}" fill="#1d2340"/>
${Array.from({ length: 16 }, (_, i) => `<circle cx="${cx + (r + 4) * Math.cos(i / 16 * 6.283)}" cy="${cy + (r + 4) * Math.sin(i / 16 * 6.283)}" r="2.5" fill="#ffd166"/>`).join("")}
<g transform="rotate(12 ${cx} ${cy})">${seg}</g><circle cx="${cx}" cy="${cy}" r="14" fill="#fff" stroke="#1d2340" stroke-width="3"/>
<path d="M${cx} 6 l-10 -2 l10 22 l10 -22z" fill="#fff" stroke="#1d2340" stroke-width="2"/>
<text x="40" y="60" font-size="24">✨</text><text x="262" y="150" font-size="24">🎁</text>`); };

  T["zombie"] = () => { const s = bg("#1b5e20", "#0b3d12");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>
<circle cx="250" cy="40" r="22" fill="#e8f5e9" opacity=".85"/><circle cx="258" cy="36" r="22" fill="url(#${s.id})"/>
<path d="M0 120 Q80 104 160 116 T320 112 V180 H0Z" fill="#2e7d32"/><path d="M0 142 Q90 130 180 142 T320 138 V180 H0Z" fill="#1b5e20"/>
${[40, 120, 210, 280].map((x, i) => `<g transform="translate(${x} 150)"><rect x="-10" y="-30" width="20" height="30" rx="8" fill="#cfd8dc"/><path d="M-10 -24 h20" stroke="#90a4ae" stroke-width="2"/><text x="0" y="-8" font-size="8" fill="#607d8b" text-anchor="middle">RIP</text></g>`).join("")}
<rect x="18" y="70" width="10" height="96" fill="#8d6e63"/><rect x="14" y="66" width="18" height="70" rx="3" fill="#a1887f"/>
${Art.place(Art.zombie("#7cb342", 0), 90, 62, 70, 94)}${Art.place(Art.zombie("#8bc34a", 1), 150, 70, 66, 88)}${Art.place(Art.zombie("#689f38", 2), 210, 60, 68, 92)}
<circle cx="150" cy="96" r="16" fill="none" stroke="#ff5252" stroke-width="3"/><path d="M150 76 v12 M150 104 v12 M130 96 h12 M158 96 h12" stroke="#ff5252" stroke-width="3"/>`); };

  T["bong-bay"] = () => { const s = bg("#7dd3fc", "#e0f2fe");
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>${Art.cloud(30, 20, 1)}${Art.cloud(220, 12, 1.2)}
${[["#ef4444", 60, "A"], ["#3b82f6", 120, "B"], ["#22c55e", 190, "C"], ["#f59e0b", 255, "D"]].map(([c, x, k], i) => Art.place(Art.balloon(c, k), x - 26, 20 + (i % 2) * 24, 52, 78)).join("")}
<circle cx="150" cy="96" r="15" fill="none" stroke="#1b1f3b" stroke-width="3" opacity=".5"/><path d="M150 78 v10 M150 104 v10 M132 96 h10 M158 96 h10" stroke="#1b1f3b" stroke-width="3" opacity=".5"/>
<path d="M60 150 l12 -20 M66 150 l6 -16" stroke="#fff" stroke-width="2" opacity=".6"/>`); };

  T["o-chu"] = () => { const s = bg("#0ea5e9", "#6366f1"); let cells = "";
    const grid = [[0, 4, 5], [1, 3, 4], [2, 2, 6], [3, 4, 4], [4, 3, 5]];
    grid.forEach(([r, start, len]) => { for (let c = 0; c < len; c++) { const key = (start + c) === 4; cells += `<rect x="${40 + (start + c) * 30}" y="${28 + r * 26}" width="28" height="24" rx="4" fill="${key ? "#fde047" : "#fff"}" stroke="#1e3a8a" stroke-width="1.5"/>`; } });
    return wrap(s.def, `<rect width="320" height="180" fill="url(#${s.id})"/>${cells}
<text x="160" y="172" font-family="Baloo 2,Arial" font-size="15" font-weight="800" fill="#fde047" text-anchor="middle">⬇ TỪ KHOÁ</text>
<text x="20" y="40" font-size="22">🔤</text>`); };

  T["olympia"] = () => { const g = uid();
    return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="${g}" cx=".5" cy=".2" r="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0b1e4d"/></radialGradient><linearGradient id="${g}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
<rect width="320" height="180" fill="url(#${g})"/>
${Array.from({ length: 28 }, (_, i) => Art.star(10 + (i * 53) % 310, 12 + ((i * 37) % 70), 2 + (i % 3), "#ffffff")).join("")}
<path d="M160 150 L120 60 Q160 40 200 60 Z" fill="url(#${g}m)" opacity=".2"/>
<g transform="translate(160 86)"><path d="M0 -40 L46 -10 L28 44 L-28 44 L-46 -10 Z" fill="none" stroke="#fde047" stroke-width="3" opacity=".5"/>
<text x="0" y="-6" font-family="Baloo 2,Arial" font-size="30" font-weight="800" fill="#fde047" text-anchor="middle">🏔️</text>
<text x="0" y="24" font-family="Baloo 2,Arial" font-size="17" font-weight="800" fill="#fff" text-anchor="middle">OLYMPIA</text></g>
${[["#ef4444", 34], ["#3b82f6", 104], ["#22c55e", 216], ["#a855f7", 286]].map(([c, x]) => `<g transform="translate(${x} 150)"><rect x="-16" y="-22" width="32" height="30" rx="6" fill="${c}"/><circle cx="0" cy="-30" r="10" fill="#ffe0c2"/></g>`).join("")}
${Art.star(40, 40, 7, "#fde047")}${Art.star(280, 50, 6, "#fde047")}</svg>`; };

  Art.thumb = (id) => (T[id] ? T[id]() : wrap("", `<rect width="320" height="180" fill="#ddd6fe"/><text x="160" y="104" font-size="48" text-anchor="middle">🎮</text>`));

  /* Cảnh minh hoạ lớn cho Hero trang chủ */
  Art.hero = () => {
    const s = bg("#ffffff", "#f3e8ff");
    return `<svg viewBox="0 0 560 420" xmlns="http://www.w3.org/2000/svg" class="hero-art"><defs>${s.def}
<linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be7ff"/><stop offset="1" stop-color="#e0f7ff"/></linearGradient>
<clipPath id="hclip"><rect x="20" y="20" width="520" height="380" rx="30"/></clipPath></defs>
<g clip-path="url(#hclip)">
<rect x="20" y="20" width="520" height="380" fill="url(#hsky)"/>
<g class="h-clouds">${Art.cloud(60, 50, 1.2)}${Art.cloud(330, 34, 1.5)}${Art.cloud(560, 60, 1.1)}${Art.cloud(800, 40, 1.3)}</g>
<circle cx="460" cy="90" r="34" fill="#fff3a8"/><circle cx="460" cy="90" r="48" fill="#fff3a8" opacity=".35"/>
<path d="M20 180 L80 140 L130 170 L190 120 L260 168 L320 130 L390 170 L450 138 L540 176 V220 H20Z" fill="#b5e48c" opacity=".7"/>
<rect x="20" y="196" width="520" height="70" fill="#4a4f6a"/><rect x="20" y="196" width="520" height="5" fill="#ffd166"/>
<path class="h-road" d="M20 232 H1100" stroke="#fff" stroke-width="4" stroke-dasharray="26 20" opacity=".8"/>
<rect x="20" y="266" width="520" height="134" fill="#38bdf8"/>
<path class="h-wave" d="M20 300 Q45 292 70 300 T120 300 T170 300 T220 300 T270 300 T320 300 T370 300 T420 300 T470 300 T520 300 T570 300 T620 300 T670 300" stroke="#fff" stroke-width="3" fill="none" opacity=".5"/>
<path class="h-wave w2" d="M20 350 Q45 342 70 350 T120 350 T170 350 T220 350 T270 350 T320 350 T370 350 T420 350 T470 350 T520 350 T570 350 T620 350 T670 350" stroke="#fff" stroke-width="3" fill="none" opacity=".4"/>
${Art.flagChecker(500, 196, 22, 70, 6)}
<g class="h-car1">${Art.place(Art.car("#ef4444", 7), 60, 186, 150, 70)}</g>
<g class="h-car2">${Art.place(Art.car("#6c4cf5", 3), 250, 200, 130, 62)}</g>
<g class="h-duck1">${Art.place(Art.duck("#22c55e"), 90, 286, 110, 86)}</g>
<g class="h-duck2">${Art.place(Art.duck("#ec4899"), 300, 314, 96, 76)}</g>
</g>
<rect x="20" y="20" width="520" height="380" rx="30" fill="none" stroke="#fff" stroke-width="8"/>
</svg>`;
  };

  window.Art = Art;
})();
