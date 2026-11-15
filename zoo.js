// 한글 아스키 풍경 + 동물
// 동물은 따로 그리지 않는다: 실루엣이 차지하는 칸의 배경 글자는 그대로 두고 색만 동물 색으로 바꾼다.
// 움직이거나 크기를 바꾸면 떠난 칸은 원래 색으로 돌아가고 새 칸이 동물 색으로 물든다.
(() => {
  const CONFIG = {
    scale: 1.5,          // 처음 나타날 때 크기(도형 단위 → 칸 수)
    scaleMin: 0.6, scaleMax: 2.6, scaleStep: 0.1,   // 누른 채 휠 1칸당
    cover: 0.38,         // 칸이 이 비율 이상 덮이면 동물 칸
    fillChar: "ㅁ",      // 배경 칸이 비어 있을 때만 쓰는 글자
    lineDarken: 0.62,    // 귀·날개 같은 안쪽 선 = 동물색 × 이 값
    rimDarken: 0.6,      // 실루엣 바깥 테두리 한 칸 = 동물색 × 이 값(굴곡이 선으로 보이게)
    thinGlyphs: "ㅣㅡ|-_.,'`:;!?/\\()[]{}<>~^*+=¨˚°´˝·‥…",   // 색이 거의 안 실리는 가는 글자
    denseGlyphs: "ㅁㅂㅍㅎㅌㄹㅊ",   // 동물 칸에서 가는 글자만 이걸로 바꿔 면이 또렷하게
    eyeColor: "#1e1e1e",
    globeColor: "#111111",   // 오른쪽 위 지구본 글자색
    saturate: 1.35,      // 동물색 채도 배율
    darken: 0.86,        // 동물색 밝기 배율(1=그대로)
    animalWeight: 900,   // 동물 칸 글자 굵기(배경은 그대로)
    flowSpeed: 7,        // 글자가 외곽 띠를 따라 흐르는 속도(칸/초)
    flowFps: 14,         // 흐름 갱신 횟수(초당)
  };
  const ORDER = ["32", "30", "25", "31"];   // 맑은 하늘, 먹구름, 산, 노을

  const NS = "http://www.w3.org/2000/svg";
  const CELL = 12;
  const { base, weight, scenes: ALL } = window.ASCII;
  const ANIMALS = window.ANIMALS, ZS = window.ZOO_SCENES;
  const stage = document.getElementById("stage");
  const form = document.getElementById("ask");
  const input = document.getElementById("name");
  const msg = document.getElementById("msg");

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
    const sil = { W, H, cells: out, rings: rings(out) };
    cache.set(id, sil);
    return sil;
  }

  // 채도 올리고 살짝 진하게 (HSL)
  function vivid(hex) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l0 = (mx + mn) / 2, d = mx - mn;
    let h = 0, s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
    if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = Math.min(1, s0 * CONFIG.saturate), l = l0 * CONFIG.darken;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
    const [R, G, B] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const f = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return "#" + f(R) + f(G) + f(B);
  }
  // 외곽에서 안쪽으로 한 칸 두께의 띠(등고선)를 만들고, 각 띠의 칸을 외곽선 방향 순서로 잇는다
  function rings(cells) {
    const key = (r, c) => r * 10000 + c;
    const pos = new Map(cells.map((p, k) => [key(p.r, p.c), k]));
    const depth = new Array(cells.length).fill(-1);
    let q = [];
    cells.forEach((p, k) => {
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => !pos.has(key(p.r + dr, p.c + dc)))) { depth[k] = 0; q.push(k); }
    });
    while (q.length) {
      const nq = [];
      for (const k of q) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = pos.get(key(cells[k].r + dr, cells[k].c + dc));
        if (j !== undefined && depth[j] < 0) { depth[j] = depth[k] + 1; nq.push(j); }
      }
      q = nq;
    }
    const byDepth = new Map();
    cells.forEach((p, k) => {
      if (p.kind === "eye" || p.kind === "line") return;   // 눈·안쪽 선은 제자리
      if (!byDepth.has(depth[k])) byDepth.set(depth[k], []);
      byDepth.get(depth[k]).push(k);
    });
    const out = [];
    for (const [d, list] of [...byDepth].sort((a, b) => a[0] - b[0])) {
      const left = new Set(list), seq = [];
      let cur = list.reduce((a, b) => (cells[b].r < cells[a].r || (cells[b].r === cells[a].r && cells[b].c < cells[a].c)) ? b : a);
      while (cur !== undefined) {
        seq.push(cur); left.delete(cur);
        const p = cells[cur];
        let next, best = 1e9;
        for (const [dr, dc] of [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]) {
          const j = pos.get(key(p.r + dr, p.c + dc));
          if (j === undefined || !left.has(j)) continue;
          // 남은 이웃이 적은 쪽(선의 끝 방향)을 먼저 따라감 → 띠를 한 줄로 이음
          let free = 0;
          for (const [er, ec] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const t = pos.get(key(cells[j].r + er, cells[j].c + ec)); if (t !== undefined && left.has(t)) free++; }
          const cost = free + (dr && dc ? 0.5 : 0);
          if (cost < best) { best = cost; next = j; }
        }
        if (next === undefined && left.size) {   // 끊긴 곳은 가장 가까운 칸으로 건너뜀
          let bd = 1e9;
          for (const j of left) { const dd = Math.abs(cells[j].r - p.r) + Math.abs(cells[j].c - p.c); if (dd < bd) { bd = dd; next = j; } }
        }
        cur = next;
      }
      out.push({ seq, dir: d % 2 ? -1 : 1 });
    }
    return out;
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
    const col = vivid(ANIMALS[an.key].color), line = shade(col, CONFIG.lineDarken), rim = shade(col, CONFIG.rimDarken);
    const map = new Map();
    for (const p of sil.cells) {
      const rr = r0 + p.r, cc = c0 + p.c;
      if (rr < 0 || cc < 0 || rr >= sc.rows || cc >= sc.cols) continue;
      // 글자는 그 칸의 원래 배경 글자 그대로, 색만 동물 색으로
      const i = rr * sc.cols + cc, o = sc.cells[i].ch;
      const ch = o === " " ? CONFIG.fillChar
        : CONFIG.thinGlyphs.includes(o) ? CONFIG.denseGlyphs[(i * 7) % CONFIG.denseGlyphs.length] : o;
      map.set(i, { ch, base: ch, color: p.kind === "eye" ? CONFIG.eyeColor : p.kind === "line" ? line : p.kind === "edge" ? rim : col });
    }
    // 흐름용: 띠마다 (칸 번호, 원래 글자) 순서
    an.flow = sil.rings.map(rg => {
      const ids = rg.seq.map(k => (r0 + sil.cells[k].r) * sc.cols + c0 + sil.cells[k].c).filter(i => map.has(i));
      return { ids, chars: ids.map(i => map.get(i).base), dir: rg.dir };
    });
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
      const gl = sc.globe && sc.globe.get(i);   // 지구본 칸은 동물보다 위
      if (gl) v = gl;
      if (!cell.el) {
        if (v === cell) continue;
        cell.el = makeText(sc.g, Math.floor(i / sc.cols), i % sc.cols, " ", cell.color);
      }
      if (cell.el.textContent !== v.ch) cell.el.textContent = v.ch;
      if (cell.el.getAttribute("fill") !== v.color) cell.el.setAttribute("fill", v.color);
      if (v === cell) cell.el.removeAttribute("font-weight");
      else cell.el.setAttribute("font-weight", v.weight || CONFIG.animalWeight);
      if (v.op) cell.el.setAttribute("fill-opacity", v.op); else cell.el.removeAttribute("fill-opacity");
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
    if (!key) { setMsg("없는 동물이에요 — " + Object.values(ANIMALS).map(x => x.ko).join(" · "), 5000); return; }
    spawn(S[cur], key);
    input.value = "";
    setMsg("");
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

  // ---------- 장면 바꾸기 (장면은 처음 볼 때 만듦) ----------
  let cur = -1;
  const S = ORDER.map(() => null);
  // ---------- 오른쪽 위 작은 원: 그 안의 배경 글자를 검정으로 (배경 고르기 버튼 자리) ----------
  const DOT = 5;   // 원 지름(칸)
  const globeBtn = document.getElementById("globe");
  function placeGlobe(sc) {
    const v = visible(sc), n = DOT, R = n / 2;
    const c0 = v.c1 - n - 1, r0 = v.r0 + 3;   // 위에서 3칸 아래
    const old = sc.globe || new Map(), map = new Map();
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - R, dy = y + 0.5 - R;
        if (dx * dx + dy * dy > R * R) continue;
        const i = (r0 + y) * sc.cols + c0 + x;
        map.set(i, { ch: sc.cells[i].ch === " " ? CONFIG.fillChar : sc.cells[i].ch, color: CONFIG.globeColor });
      }
    sc.globe = map;
    redraw(sc, new Set([...old.keys(), ...map.keys()]));
    // 누르는 영역(보이지 않는 버튼)을 지구본 칸 위에 맞춤
    const m = sc.svg.getScreenCTM();
    globeBtn.style.left = (m.a * c0 * CELL + m.e) + "px";
    globeBtn.style.top = (m.d * r0 * CELL + m.f) + "px";
    globeBtn.style.width = globeBtn.style.height = (m.a * n * CELL) + "px";
  }
  addEventListener("resize", () => { if (S[cur]) placeGlobe(S[cur]); });

  function show(i) {
    i = (i + S.length) % S.length;
    if (i === cur) return;
    end();
    if (!S[i]) S[i] = buildScene(ORDER[i]);
    cur = i;
    S.forEach((s, k) => s && s.svg.classList.toggle("on", k === i));
    placeGlobe(S[i]);
  }
  addEventListener("keydown", e => {
    if (document.activeElement === input || document.querySelector("#scenes.open, #intro.open")) return;
    if (e.key === "ArrowRight") show(cur + 1);
    if (e.key === "ArrowLeft") show(cur - 1);
  });

  // ---------- 흐름: 띠의 글자들이 외곽선 방향을 따라 한 칸씩 이동 ----------
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t0 = performance.now();
  function flowTick() {
    const sc = S[cur];
    if (sc && sc.animals.length) {
      const step = Math.floor((performance.now() - t0) / 1000 * CONFIG.flowSpeed);
      const touched = new Set();
      for (const an of sc.animals) {
        if (!an.flow) continue;
        for (const f of an.flow) {
          const n = f.ids.length;
          if (n < 3) continue;
          const off = ((step * f.dir) % n + n) % n;
          for (let j = 0; j < n; j++) {
            const m = an.map.get(f.ids[j]);
            const ch = f.chars[(j + off) % n];
            if (m && m.ch !== ch) { m.ch = ch; touched.add(f.ids[j]); }
          }
        }
      }
      if (touched.size) redraw(sc, touched);
    }
    setTimeout(flowTick, 1000 / CONFIG.flowFps);
  }

  if (!still) flowTick();
  const P = new URLSearchParams(location.search);
  show(+P.get("s") ? +P.get("s") - 1 : 0);
  input.focus();

  // 확인용: ?demo=rabbit,dog,deer (차례로 등장)
  if (P.get("demo")) for (const k of P.get("demo").split(",")) if (ANIMALS[k]) spawn(S[cur], k);
  window.__zoo = { S, ORDER, spawn, update, show, CONFIG, get cur() { return cur; },
                   add: key => { spawn(S[cur], key); setMsg(""); } };
})();
