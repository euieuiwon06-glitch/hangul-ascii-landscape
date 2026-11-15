// 한글 아스키 풍경 + 동물
// 동물은 따로 그리지 않는다: 실루엣이 차지하는 칸의 배경 글자는 그대로 두고 색만 동물 색으로 바꾼다.
// 움직이거나 크기를 바꾸면 떠난 칸은 원래 색으로 돌아가고 새 칸이 동물 색으로 물든다.
(() => {
  const CONFIG = {
    scale: 1.3,          // 처음 나타날 때 크기(도형 단위 → 칸 수)
    scaleMin: 0.6, scaleMax: 2.6, scaleStep: 0.1,   // 누른 채 휠 1칸당
    cover: 0.38,         // 칸이 이 비율 이상 덮이면 동물 칸
    fillChar: "ㅁ",      // 배경 칸이 비어 있을 때만 쓰는 글자
    lineDarken: 0.62,    // 귀·날개 같은 안쪽 선 = 동물색 × 이 값
    eyeColor: "#1e1e1e",
  };
  const ORDER = ["32", "30"];

  const NS = "http://www.w3.org/2000/svg";
  const CELL = 12;
  const { base, weight, scenes: ALL } = window.ASCII;
  const ANIMALS = window.ANIMALS, ZS = window.ZOO_SCENES;
  const stage = document.getElementById("stage");
  const form = document.getElementById("ask");
  const input = document.getElementById("name");
  const msg = document.getElementById("msg");
  const count = document.getElementById("count");

  const NAMES = {};
  for (const [k, a] of Object.entries(ANIMALS)) { NAMES[k] = k; NAMES[k + "s"] = k; NAMES[a.ko] = k; }
  Object.assign(NAMES, { bunny: "rabbit", puppy: "dog", kitty: "cat", "개": "dog", "강아지": "dog" });

  // ---------- 장면: 칸마다 <text> ----------
  function buildScene(id) {
    const s = ALL.find(x => x.id === id);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${s.cols * CELL} ${s.rows * CELL}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const g = document.createElementNS(NS, "g");
    g.setAttribute("font-family", "'Noto Sans KR', sans-serif");
    g.setAttribute("font-size", CELL * 1.22);
    g.setAttribute("font-weight", weight);
    g.setAttribute("text-anchor", "middle");
    svg.appendChild(g);
    const cells = new Array(s.cols * s.rows);
    s.chars.forEach((line, r) => {
      [...line].forEach((ch, c) => {
        const color = "#" + s.colors[r].substr(c * 6, 6);
        cells[r * s.cols + c] = { ch, color, el: ch === " " ? null : makeText(g, r, c, ch, color) };
      });
    });
    stage.appendChild(svg);
    return { id, svg, g, cells, cols: s.cols, rows: s.rows, horizon: ZS[id].horizon, animals: [] };
  }
  function makeText(g, r, c, ch, color) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", c * CELL + CELL / 2);
    t.setAttribute("y", (r * CELL + base * CELL).toFixed(2));
    t.setAttribute("fill", color);
    t.textContent = ch;
    g.appendChild(t);
    return t;
  }

  // ---------- 도형 → 칸 실루엣 (크기·반전마다 다시 계산) ----------
  const cache = new Map();
  function silhouette(key, scale, flip) {
    const id = `${key}|${scale.toFixed(2)}|${flip ? 1 : 0}`;
    if (cache.has(id)) return cache.get(id);
    const a = ANIMALS[key], R = 8;
    const W = Math.max(3, Math.round(a.w * scale)), H = Math.max(3, Math.round(a.h * scale));
    const draw = (onlyLines) => {
      const cv = document.createElement("canvas");
      cv.width = W * R; cv.height = H * R;
      const x = cv.getContext("2d", { willReadFrequently: true });
      x.scale(scale * R, scale * R);
      x.fillStyle = x.strokeStyle = "#000";
      x.lineCap = x.lineJoin = "round";
      for (const s of a.shapes) {
        if (onlyLines !== (s[0] === "s")) continue;
        x.beginPath();
        if (s[0] === "e") { x.ellipse(s[1], s[2], s[3], s[4], 0, 0, Math.PI * 2); x.fill(); }
        else if (s[0] === "p") { s[1].forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.fill(); }
        else { x.lineWidth = s[0] === "l" ? s[2] : 0.5; s[1].forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); }
      }
      const d = x.getImageData(0, 0, W * R, H * R).data;
      const cov = new Float32Array(W * H);
      for (let py = 0; py < H * R; py++)
        for (let px = 0; px < W * R; px++) cov[((py / R) | 0) * W + ((px / R) | 0)] += d[(py * W * R + px) * 4 + 3] / 255;
      for (let i = 0; i < cov.length; i++) cov[i] /= R * R;
      return cov;
    };
    const cov = draw(false), lcov = draw(true);
    const at = (arr, r, c) => (r < 0 || c < 0 || r >= H || c >= W) ? 0 : arr[r * W + c];
    const inM = (r, c) => at(cov, r, c) >= CONFIG.cover;
    const dirChar = (arr, r, c) => {
      // 칸 덮임 비율의 기울기(안쪽 방향) → 윤곽선 방향 기호
      const gx = at(arr, r - 1, c + 1) + 2 * at(arr, r, c + 1) + at(arr, r + 1, c + 1) - at(arr, r - 1, c - 1) - 2 * at(arr, r, c - 1) - at(arr, r + 1, c - 1);
      const gy = at(arr, r + 1, c - 1) + 2 * at(arr, r + 1, c) + at(arr, r + 1, c + 1) - at(arr, r - 1, c - 1) - 2 * at(arr, r - 1, c) - at(arr, r - 1, c + 1);
      if (Math.abs(gx) + Math.abs(gy) < 1e-3) return "-";
      const ang = ((Math.atan2(-gy, gx) * 180 / Math.PI) + 360) % 180;   // 기울기 방향(수학 좌표)
      if (ang < 22.5 || ang >= 157.5) return "|";       // 좌우로 바뀜 → 세로 선
      if (ang < 67.5) return "\\";
      if (ang < 112.5) return gy > 0 ? "-" : "_";       // 아래가 안쪽 → 윗변
      return "/";
    };
    const out = [];
    const eyes = new Set(a.eyes.map(([ex, ey]) => `${Math.floor(ey * scale)},${Math.floor(ex * scale)}`));
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        if (!inM(r, c)) continue;
        const edge = !inM(r - 1, c) || !inM(r + 1, c) || !inM(r, c - 1) || !inM(r, c + 1);
        let ch, kind;
        if (eyes.has(`${r},${c}`)) { ch = "*"; kind = "eye"; }
        else if (edge) { ch = dirChar(cov, r, c); kind = "edge"; }
        else if (lcov[r * W + c] > 0.12) { ch = dirChar(lcov, r, c); kind = "line"; }
        else { ch = CONFIG.fillChar; kind = "fill"; }
        let cc = c;
        if (flip) { cc = W - 1 - c; ch = ch === "/" ? "\\" : ch === "\\" ? "/" : ch; }
        out.push({ r, c: cc, ch, kind });
      }
    const sil = { W, H, cells: out };
    cache.set(id, sil);
    return sil;
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.round(v * k).toString(16).padStart(2, "0");
    return "#" + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
  }

  // ---------- 좌표 ----------
  function toGrid(sc, x, y) {
    const pt = sc.svg.createSVGPoint();
    pt.x = x; pt.y = y;
    const p = pt.matrixTransform(sc.svg.getScreenCTM().inverse());
    return { c: Math.floor(p.x / CELL), r: Math.floor(p.y / CELL) };
  }
  function visible(sc) {
    const a = toGrid(sc, 0, 0), b = toGrid(sc, innerWidth - 1, innerHeight - 1);
    return { c0: Math.max(0, a.c), r0: Math.max(0, a.r), c1: Math.min(sc.cols - 1, b.c), r1: Math.min(sc.rows - 1, b.r) };
  }

  // ---------- 동물 = 바꿔 끼운 칸들 ----------
  // an: { key, scale, flip, fc(발 가운데 열), fr(발 줄), map: Map(칸 → {ch, color}) }
  function layout(sc, an) {
    const sil = silhouette(an.key, an.scale, an.flip);
    const v = visible(sc);
    let c0 = an.fc - Math.floor(sil.W / 2), r0 = an.fr - sil.H + 1;
    c0 = Math.min(Math.max(c0, v.c0), Math.max(v.c0, v.c1 - sil.W + 1));
    r0 = Math.min(Math.max(r0, v.r0), Math.max(v.r0, v.r1 - sil.H + 1));
    an.fc = c0 + Math.floor(sil.W / 2); an.fr = r0 + sil.H - 1;
    const col = ANIMALS[an.key].color, line = shade(col, CONFIG.lineDarken);
    const map = new Map();
    for (const p of sil.cells) {
      const rr = r0 + p.r, cc = c0 + p.c;
      if (rr < 0 || cc < 0 || rr >= sc.rows || cc >= sc.cols) continue;
      // 글자는 그 칸의 원래 배경 글자 그대로, 색만 동물 색으로
      const i = rr * sc.cols + cc, ch = sc.cells[i].ch === " " ? CONFIG.fillChar : sc.cells[i].ch;
      map.set(i, { ch, color: p.kind === "eye" ? CONFIG.eyeColor : p.kind === "line" ? line : col });
    }
    return map;
  }
  function update(sc, an) {
    const old = an.map || new Map();
    an.map = layout(sc, an);
    redraw(sc, new Set([...old.keys(), ...an.map.keys()]));
  }
  // 칸마다: 맨 위 동물 글자, 없으면 원래 배경 글자 — 글자와 색만 바뀜(흐림·이동 없음)
  function redraw(sc, idx) {
    for (const i of idx) {
      const cell = sc.cells[i];
      let v = cell;
      for (const an of sc.animals) { const m = an.map && an.map.get(i); if (m) v = m; }
      if (!cell.el) {
        if (v === cell) continue;
        cell.el = makeText(sc.g, Math.floor(i / sc.cols), i % sc.cols, " ", cell.color);
      }
      if (cell.el.textContent !== v.ch) cell.el.textContent = v.ch;
      if (cell.el.getAttribute("fill") !== v.color) cell.el.setAttribute("fill", v.color);
    }
  }
  function hit(sc, i) {
    for (let k = sc.animals.length - 1; k >= 0; k--) if (sc.animals[k].map.has(i)) return sc.animals[k];
    return null;
  }

  // 처음 나올 자리: 땅 위 가운데부터, 다른 동물과 안 겹치는 곳
  function spawn(sc, key) {
    const v = visible(sc);
    const sky = ANIMALS[key].sky;
    const fr = sky ? Math.round(v.r0 + (sc.horizon - v.r0) * 0.45)
                   : Math.min(v.r1 - 1, sc.horizon + Math.round((v.r1 - sc.horizon) * 0.55));
    const mid = Math.round((v.c0 + v.c1) / 2);
    let best = null;
    search: for (let d = 0; d <= (v.c1 - v.c0) / 2; d += 2)
      for (const fc of [mid - d, mid + d]) {
        const an = { key, scale: CONFIG.scale, flip: false, fc, fr };
        const m = layout(sc, an);
        let overlap = 0;
        for (const i of m.keys()) if (hit(sc, i)) overlap++;
        if (!best || overlap < best.overlap) best = { an, overlap };
        if (overlap === 0) break search;
      }
    const an = { ...best.an };
    sc.animals.push(an);
    update(sc, an);
    return an;
  }

  // ---------- 입력 ----------
  let hintTimer = 0;
  function setMsg(t, ms = 0) {
    msg.textContent = t;
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(() => (msg.textContent = ""), ms);
  }
  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = input.value.trim().toLowerCase();
    if (!v) return;
    const key = NAMES[v];
    if (!key) { setMsg("없는 동물이에요 — " + Object.keys(ANIMALS).join(" · "), 5000); return; }
    spawn(S[cur], key);
    input.value = "";
    setMsg("꾹 눌러 끌기 · 누른 채 휠로 크기 · 더블클릭 좌우반전", 5000);
  });

  // ---------- 끌기 · 크기 · 반전 ----------
  let drag = null;   // { sc, an, dc, dr }
  stage.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    const sc = S[cur], g = toGrid(sc, e.clientX, e.clientY);
    const an = hit(sc, g.r * sc.cols + g.c);
    if (!an) return;
    e.preventDefault();
    sc.animals.splice(sc.animals.indexOf(an), 1);   // 잡은 동물을 맨 위로
    sc.animals.push(an);
    redraw(sc, new Set(an.map.keys()));
    drag = { sc, an, dc: an.fc - g.c, dr: an.fr - g.r };
    stage.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
  });
  stage.addEventListener("pointermove", e => {
    const sc = S[cur], g = toGrid(sc, e.clientX, e.clientY);
    if (!drag) {
      document.body.classList.toggle("over-animal", !!hit(sc, g.r * sc.cols + g.c));
      return;
    }
    const fc = g.c + drag.dc, fr = g.r + drag.dr;
    if (fc === drag.an.fc && fr === drag.an.fr) return;
    drag.an.fc = fc; drag.an.fr = fr;
    update(drag.sc, drag.an);
  });
  const end = () => { drag = null; document.body.classList.remove("dragging"); };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  addEventListener("wheel", e => {
    if (!drag) return;
    e.preventDefault();
    const an = drag.an;
    const s = Math.min(CONFIG.scaleMax, Math.max(CONFIG.scaleMin, an.scale + (e.deltaY < 0 ? 1 : -1) * CONFIG.scaleStep));
    if (Math.abs(s - an.scale) < 1e-6) return;
    an.scale = Math.round(s * 10) / 10;
    update(drag.sc, an);
  }, { passive: false });

  stage.addEventListener("dblclick", e => {
    const sc = S[cur], g = toGrid(sc, e.clientX, e.clientY);
    const an = hit(sc, g.r * sc.cols + g.c);
    if (!an) return;
    // 제자리에서 뒤집히도록 실제 칸들의 가운데를 맞춤
    const mid = m => { const c = [...m.keys()].map(i => i % sc.cols); return (Math.min(...c) + Math.max(...c)) / 2; };
    const before = mid(an.map);
    an.flip = !an.flip;
    update(sc, an);
    const shift = Math.round(before - mid(an.map));
    if (shift) { an.fc += shift; update(sc, an); }
  });

  // ---------- 장면 넘기기 ----------
  const pad = n => String(n).padStart(2, "0");
  let cur = -1, S = [];
  function show(i) {
    i = (i + S.length) % S.length;
    if (i === cur) return;
    end();
    cur = i;
    S.forEach((s, k) => s.svg.classList.toggle("on", k === i));
    count.textContent = `${pad(i + 1)} / ${pad(S.length)}`;
  }
  document.getElementById("next").onclick = () => show(cur + 1);
  document.getElementById("prev").onclick = () => show(cur - 1);
  addEventListener("keydown", e => {
    if (document.activeElement === input) return;
    if (e.key === "ArrowRight") show(cur + 1);
    if (e.key === "ArrowLeft") show(cur - 1);
  });

  S = ORDER.map(buildScene);
  const P = new URLSearchParams(location.search);
  show(+P.get("s") ? +P.get("s") - 1 : 0);
  input.focus();

  // 확인용: ?demo=rabbit,dog,deer (차례로 등장)
  if (P.get("demo")) for (const k of P.get("demo").split(",")) if (ANIMALS[k]) spawn(S[cur], k);
  window.__zoo = { S, spawn, update, CONFIG };
})();
