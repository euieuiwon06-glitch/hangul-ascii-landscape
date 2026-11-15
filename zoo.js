// 한글 아스키 풍경 + 동물 등장 인터랙션
// 배경과 동물 모두 같은 SVG · 같은 글꼴 · 같은 칸(CELL) 좌표를 쓴다.
(() => {
  const CONFIG = {
    appearMs: 1000,          // 클릭 후 등장 애니메이션 전체 길이(0.8~1.2초 권장)
    previewOpacity: 0.5,     // 미리보기 동물 투명도
    previewBgOpacity: 0.22,  // 미리보기 중 겹친 배경 글자 투명도
    lineInteriorOpacity: 0.12, // 라인 버전: 동물 안쪽 배경 글자 투명도
    scatterCells: 1.6,       // 배치 순간 배경 글자가 밀려나는 거리(칸)
    animalLightness: 0.22,   // 면 버전 동물 글자색 밝기(밑에 깔린 배경색의 색상은 유지)
    lineLightness: 0.14,     // 라인 버전 외곽선 밝기(가는 기호라 더 진하게)
    haloOpacity: 0.12,       // 실루엣 바로 바깥 한 칸 배경 글자 투명도(형태가 떠 보이게)
    fillChar: "ㅁ",          // 면 버전 안쪽 글자
  };
  const ORDER = [
    { id: "32", mode: "line", label: "라인" },
    { id: "30", mode: "fill", label: "면" },
  ];

  const NS = "http://www.w3.org/2000/svg";
  const CELL = 12;
  const { base, weight, scenes: ALL } = window.ASCII;
  const ANIMALS = window.ANIMALS;
  const ZS = window.ZOO_SCENES;
  const stage = document.getElementById("stage");
  const form = document.getElementById("ask");
  const input = document.getElementById("name");
  const msg = document.getElementById("msg");
  const count = document.getElementById("count");

  // 이름 → 동물 키 (영문·한글, 복수형 s 허용)
  const NAMES = {};
  for (const [k, a] of Object.entries(ANIMALS)) { NAMES[k] = k; NAMES[k + "s"] = k; NAMES[a.ko] = k; }
  NAMES.bunny = "rabbit"; NAMES.puppy = "dog"; NAMES.kitty = "cat"; NAMES["개"] = "dog";

  // ---------- 장면 만들기: 칸마다 <text> 하나 ----------
  function buildScene(def) {
    const s = ALL.find(x => x.id === def.id);
    const W = s.cols * CELL, H = s.rows * CELL;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const mk = cls => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", cls);
      g.setAttribute("font-family", "'Noto Sans KR', sans-serif");
      g.setAttribute("font-size", CELL * 1.22);
      g.setAttribute("font-weight", weight);
      g.setAttribute("text-anchor", "middle");
      svg.appendChild(g);
      return g;
    };
    const bg = mk("bg"), animals = mk("animals"), preview = mk("preview");
    preview.setAttribute("opacity", CONFIG.previewOpacity);
    const cells = new Array(s.cols * s.rows);
    s.chars.forEach((line, r) => {
      const cols = s.colors[r];
      [...line].forEach((ch, c) => {
        const color = "#" + cols.substr(c * 6, 6);
        let el = null;
        if (ch !== " ") {
          el = document.createElementNS(NS, "text");
          el.setAttribute("x", c * CELL + CELL / 2);
          el.setAttribute("y", (r * CELL + base * CELL).toFixed(2));
          el.setAttribute("fill", color);
          el.textContent = ch;
          bg.appendChild(el);
        }
        cells[r * s.cols + c] = { el, ch, color };
      });
    });
    stage.appendChild(svg);
    return {
      def, svg, bg, animals, preview, cells, cols: s.cols, rows: s.rows,
      horizon: ZS[def.id].horizon,
      owned: new Uint8Array(s.cols * s.rows),   // 동물이 차지한 칸(+여백)
      touched: new Map(),                       // 미리보기로 바뀐 배경 칸
    };
  }

  // ---------- 동물 패턴 ----------
  function pattern(key) {
    const a = ANIMALS[key];
    const out = [];
    for (let r = 0; r < a.h; r++)
      for (let c = 0; c < a.w; c++) {
        const o = a.o[r][c], f = a.f[r][c] === "1";
        if (o !== " ") out.push({ r, c, ch: o, edge: true });
        else if (f) out.push({ r, c, ch: null, edge: false });
      }
    return { key, a, cells: out };
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
    return {
      c0: Math.max(0, a.c), r0: Math.max(0, a.r),
      c1: Math.min(sc.cols - 1, b.c), r1: Math.min(sc.rows - 1, b.r),
    };
  }

  // 커서 = 동물 발 가운데. 화면 안·땅 위·다른 동물과 안 겹치게 위치를 정함
  function place(sc, pat, cur) {
    const { a } = pat, v = visible(sc);
    let c0 = cur.c - Math.floor(a.w / 2), r0 = cur.r - (a.h - 1);
    const rMin = a.sky ? v.r0 : Math.max(v.r0, sc.horizon + 1 - (a.h - 1));
    c0 = Math.min(Math.max(c0, v.c0), v.c1 - a.w + 1);
    r0 = Math.min(Math.max(r0, rMin), v.r1 - a.h + 1);
    if (free(sc, pat, r0, c0)) return { r0, c0, ok: true };
    for (let d = 1; d <= 60; d++)
      for (const dc of [-d, d]) {
        const cc = c0 + dc;
        if (cc < v.c0 || cc > v.c1 - a.w + 1) continue;
        if (free(sc, pat, r0, cc)) return { r0, c0: cc, ok: true };
      }
    return { r0, c0, ok: false };
  }
  function free(sc, pat, r0, c0) {
    for (const p of pat.cells) if (sc.owned[(r0 + p.r) * sc.cols + c0 + p.c]) return false;
    return true;
  }

  // 밑에 깔린 배경색의 색상을 살린 진한 색
  function animalColor(sc, pat, r0, c0) {
    let R = 0, G = 0, B = 0, n = 0;
    for (const p of pat.cells) {
      const col = sc.cells[(r0 + p.r) * sc.cols + c0 + p.c].color;
      R += parseInt(col.substr(1, 2), 16); G += parseInt(col.substr(3, 2), 16); B += parseInt(col.substr(5, 2), 16); n++;
    }
    R /= n * 255; G /= n * 255; B /= n * 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = d / (1 - Math.abs(mx + mn - 1));
      h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
      h *= 60;
    }
    s = Math.min(0.65, s * 1.2 + 0.1);
    const L = sc.def.mode === "line" ? CONFIG.lineLightness : CONFIG.animalLightness;
    return `hsl(${(h + 360) % 360} ${(s * 100).toFixed(0)}% ${(L * 100).toFixed(0)}%)`;
  }

  // ---------- 미리보기 ----------
  let cur = -1, S = [], pending = null, last = null;

  function ring(sc, pat, r0, c0) {
    const inside = new Set(pat.cells.map(p => (r0 + p.r) * sc.cols + c0 + p.c));
    const out = new Set();
    for (const i of inside) {
      const r = Math.floor(i / sc.cols), c = i % sc.cols;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= sc.rows || cc >= sc.cols) continue;
        const j = rr * sc.cols + cc;
        if (!inside.has(j)) out.add(j);
      }
    }
    return { inside, out };
  }
  function push(sc, i, cy, cx, dist) {
    const r = Math.floor(i / sc.cols), c = i % sc.cols;
    let dx = c - cx, dy = r - cy;
    const l = Math.hypot(dx, dy) || 1;
    return `translate(${(dx / l * dist * CELL).toFixed(1)}px, ${(dy / l * dist * CELL).toFixed(1)}px)`;
  }

  function showPreview(sc, pat, pos) {
    const { r0, c0 } = pos, { a } = pat;
    const cy = r0 + a.h / 2, cx = c0 + a.w / 2;
    const { inside, out } = ring(sc, pat, r0, c0);
    const next = new Map();
    for (const i of inside) if (!sc.owned[i])
      next.set(i, { op: CONFIG.previewBgOpacity, tf: push(sc, i, cy, cx, 0.25 + ((i * 7) % 5) / 10) });
    for (const i of out) if (!sc.owned[i]) next.set(i, { op: 0.45, tf: push(sc, i, cy, cx, 0.35) });
    for (const [i] of sc.touched) if (!next.has(i)) style(sc, i, "", "");
    for (const [i, v] of next) style(sc, i, v.op, v.tf);
    sc.touched = next;

    // 동물 글자(반투명)
    const color = animalColor(sc, pat, r0, c0);
    sc.preview.replaceChildren();
    sc.preview.setAttribute("opacity", pos.ok ? CONFIG.previewOpacity : CONFIG.previewOpacity * 0.35);
    for (const p of pat.cells) {
      const ch = p.edge ? p.ch : sc.def.mode === "fill" ? CONFIG.fillChar : null;
      if (!ch) continue;
      sc.preview.appendChild(glyph(r0 + p.r, c0 + p.c, ch, color));
    }
  }
  function clearPreview(sc) {
    for (const [i] of sc.touched) style(sc, i, "", "");
    sc.touched = new Map();
    sc.preview.replaceChildren();
  }
  function style(sc, i, op, tf) {
    const el = sc.cells[i].el;
    if (!el || sc.owned[i]) return;
    el.style.opacity = op;
    el.style.transform = tf;
  }
  function glyph(r, c, ch, color) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", c * CELL + CELL / 2);
    t.setAttribute("y", (r * CELL + base * CELL).toFixed(2));
    t.setAttribute("fill", color);
    t.textContent = ch;
    return t;
  }

  // ---------- 배치 ----------
  function commit(sc, pat, pos) {
    const { r0, c0 } = pos, { a } = pat, T = CONFIG.appearMs;
    const cy = r0 + a.h / 2, cx = c0 + a.w / 2;
    const color = animalColor(sc, pat, r0, c0);
    const { inside, out } = ring(sc, pat, r0, c0);
    sc.preview.replaceChildren();
    sc.touched = new Map();

    // 차지한 칸 + 1칸 여백 기록(다음 동물 충돌 판정)
    for (const i of inside) {
      const r = Math.floor(i / sc.cols), c = i % sc.cols;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < sc.rows && cc < sc.cols) sc.owned[rr * sc.cols + cc] = 2;
      }
    }

    // Phase A — 배경 글자 분산
    const dA = T * 0.4;
    const interior = new Set(pat.cells.filter(p => !p.edge).map(p => (r0 + p.r) * sc.cols + c0 + p.c));
    for (const i of inside) {
      const el = sc.cells[i].el;
      if (!el) continue;
      el.style.transition = `opacity ${dA}ms ease-out, transform ${dA}ms ease-out`;
      el.style.opacity = sc.def.mode === "line" && interior.has(i) ? CONFIG.lineInteriorOpacity : 0;
      el.style.transform = push(sc, i, cy, cx, CONFIG.scatterCells * (0.6 + ((i * 13) % 7) / 10));
    }
    for (const i of out) {
      const el = sc.cells[i].el;
      if (!el || sc.owned[i] === 1) continue;
      el.style.transition = `transform ${T * 0.3}ms ease-out`;
      el.style.transform = push(sc, i, cy, cx, 0.5);
    }

    // Phase B — 동물 글자가 아래(발)에서 위로 차오르며 형성
    const g = document.createElementNS(NS, "g");
    sc.animals.appendChild(g);
    const items = [];
    for (const p of pat.cells) {
      const ch = p.edge ? p.ch : sc.def.mode === "fill" ? CONFIG.fillChar : null;
      if (!ch) continue;
      const t = glyph(r0 + p.r, c0 + p.c, ch, color);
      t.style.opacity = 0;
      t.style.transform = `translate(0px, ${(CELL * 0.7).toFixed(1)}px)`;
      g.appendChild(t);
      items.push({ t, k: (a.h - p.r) + Math.abs(p.c - a.w / 2) * 0.25 });
    }
    const kMax = Math.max(...items.map(x => x.k));
    const bStart = T * 0.2, bSpan = T * 0.5, dB = T * 0.3;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const { t, k } of items) {
        t.style.transition = `opacity ${dB}ms ease-out ${bStart + (k / kMax) * bSpan}ms, transform ${dB}ms cubic-bezier(.2,.7,.2,1) ${bStart + (k / kMax) * bSpan}ms`;
        t.style.opacity = 1;
        t.style.transform = "translate(0px, 0px)";
      }
    }));

    // Phase C·D — 밀려난 글자 제자리 + 고정
    setTimeout(() => {
      for (const i of out) {
        const el = sc.cells[i].el;
        if (!el || inside.has(i) || sc.owned[i] === 1) continue;
        el.style.transition = `transform ${T * 0.35}ms ease-in-out, opacity ${T * 0.35}ms`;
        el.style.transform = "";
        el.style.opacity = CONFIG.haloOpacity;
      }
      for (const i of inside) {
        const el = sc.cells[i].el;
        if (!el) continue;
        el.style.transition = `transform ${T * 0.3}ms ease-in-out, opacity ${T * 0.3}ms`;
        el.style.transform = "";
      }
    }, T * 0.55);
    setTimeout(() => {
      for (const i of [...inside, ...out]) { const el = sc.cells[i].el; if (el) el.style.transition = ""; }
      for (const { t } of items) { t.style.transition = ""; t.style.transform = ""; }
    }, T + 200);
    for (const i of inside) sc.owned[i] = 1;
  }

  // ---------- 입력 · 포인터 ----------
  function setMsg(t) { msg.textContent = t; }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = input.value.trim().toLowerCase();
    if (!v) return;
    const key = NAMES[v];
    if (!key) {
      setMsg("없는 동물이에요 — " + Object.keys(ANIMALS).join(" · "));
      return;
    }
    pending = pattern(key);
    setMsg(`${key} · 원하는 곳을 클릭해서 놓기 · Esc 취소`);
    input.blur();
    document.body.classList.add("placing");
    if (last) move(last.x, last.y);
  });

  function move(x, y) {
    last = { x, y };
    if (!pending) return;
    const sc = S[cur];
    const pos = place(sc, pending, toGrid(sc, x, y));
    if (pending.pos && pending.pos.r0 === pos.r0 && pending.pos.c0 === pos.c0 && pending.pos.ok === pos.ok) return;
    pending.pos = pos;
    showPreview(sc, pending, pos);
  }
  function cancel() {
    if (!pending) return;
    clearPreview(S[cur]);
    pending = null;
    document.body.classList.remove("placing");
    setMsg("");
  }

  stage.addEventListener("pointermove", e => { if (e.pointerType === "mouse") move(e.clientX, e.clientY); });
  stage.addEventListener("pointerdown", e => {
    if (!pending) return;
    const sc = S[cur];
    if (e.pointerType !== "mouse") {
      // 터치: 첫 탭은 위치 보기, 같은 자리를 한 번 더 탭하면 놓기
      const before = pending.pos;
      move(e.clientX, e.clientY);
      if (!before || before.r0 !== pending.pos.r0 || before.c0 !== pending.pos.c0) return;
    } else {
      move(e.clientX, e.clientY);
    }
    if (!pending.pos.ok) { setMsg("여기는 자리가 없어요 — 다른 곳을 골라 주세요"); return; }
    commit(sc, pending, pending.pos);
    pending = null;
    document.body.classList.remove("placing");
    setMsg("");
    input.value = "";
    input.focus();
  });
  addEventListener("keydown", e => {
    if (e.key === "Escape") { cancel(); input.focus(); return; }
    if (document.activeElement === input) return;
    if (e.key === "ArrowRight") show(cur + 1);
    if (e.key === "ArrowLeft") show(cur - 1);
  });

  // ---------- 장면 넘기기 ----------
  const pad = n => String(n).padStart(2, "0");
  function show(i) {
    i = (i + S.length) % S.length;
    if (i === cur) return;
    if (cur >= 0) cancel();
    cur = i;
    S.forEach((s, k) => s.svg.classList.toggle("on", k === i));
    count.textContent = `${pad(i + 1)} / ${pad(S.length)} · ${S[i].def.label}`;
  }
  document.getElementById("next").onclick = () => show(cur + 1);
  document.getElementById("prev").onclick = () => show(cur - 1);

  S = ORDER.map(buildScene);
  const q = +new URLSearchParams(location.search).get("s");
  show(q ? q - 1 : 0);
  input.focus();

  // 확인용: ?demo=rabbit@40.80,deer@70.82 (발 위치 = 열.줄) 자동 배치, &pv=fox@100.80 미리보기
  const P = new URLSearchParams(location.search);
  const parse = s => s.split(",").filter(Boolean).map(t => {
    const [k, rc] = t.split("@"); const [c, r] = rc.split(".").map(Number); return { k, c, r };
  });
  if (P.get("demo")) {
    CONFIG.appearMs = +P.get("ms") || CONFIG.appearMs;
    for (const d of parse(P.get("demo"))) {
      const pat = pattern(d.k), sc = S[cur];
      const pos = place(sc, pat, { c: d.c, r: d.r });
      if (pos.ok) commit(sc, pat, pos);
    }
  }
  if (P.get("pv")) {
    const d = parse(P.get("pv"))[0], sc = S[cur];
    const pat = pattern(d.k);
    showPreview(sc, pat, place(sc, pat, { c: d.c, r: d.r }));
  }
})();
