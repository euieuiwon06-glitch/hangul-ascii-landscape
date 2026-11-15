// 배경 고르기(지구본 → 좌우로 넘기는 카드) · 동물 목록 팝업
(() => {
  const Z = window.__zoo, ANIMALS = window.ANIMALS;
  const $ = id => document.getElementById(id);
  const input = $("name");

  // ---------- 점으로 된 지구본 아이콘 (육지 = 채운 점, 바다 = 고리) ----------
  const LAND = [
    "....##.....",
    "..#####.#..",
    ".######.##.",
    "##.####..##",
    "#....##....",
    "#.....####.",
    ".#...#####.",
    "..#..####..",
    "...#.###...",
    ".....##....",
    "...........",
  ];
  (function globe() {
    const n = LAND.length, r = n / 2, step = 34 / n;
    let dots = "";
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - r, dy = y + 0.5 - r;
        if (dx * dx + dy * dy > (r - 0.15) * (r - 0.15)) continue;
        const cx = (x + 0.5) * step, cy = (y + 0.5) * step;
        dots += LAND[y][x] === "#"
          ? `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(step * 0.42).toFixed(2)}" fill="#fff"/>`
          : `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(step * 0.3).toFixed(2)}" fill="none" stroke="#fff" stroke-width="${(step * 0.12).toFixed(2)}" opacity=".85"/>`;
      }
    $("globe").innerHTML = `<svg viewBox="0 0 34 34" aria-hidden="true">${dots}</svg>`;
  })();

  // ---------- 겹쳐 뜨는 화면 열고 닫기 ----------
  let opened = null;
  function open(el) { close(); el.classList.add("open"); opened = el; }
  function close() { if (opened) opened.classList.remove("open"); opened = null; }
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
  addEventListener("keydown", e => {
    if (!opened) return;
    if (e.key === "Escape") close();
    if (opened === $("scenes")) {
      if (e.key === "ArrowRight") go(sel + 1);
      if (e.key === "ArrowLeft") go(sel - 1);
      if (e.key === "Enter") pick(sel);
    }
  });

  // ---------- 배경 고르기 ----------
  const scenes = $("scenes"), track = $("track"), dotsBox = $("sceneDots");
  const cards = Z.ORDER.map((id, k) => {
    const b = document.createElement("button");
    b.className = "card";
    b.setAttribute("aria-label", `배경 ${k + 1}`);
    b.innerHTML = `<img src="thumbs/${id}.jpg?v=202611152256" alt="" draggable="false">`;
    track.appendChild(b);
    dotsBox.appendChild(document.createElement("i"));
    return b;
  });
  let sel = 0, dragX = 0;
  const cardW = () => Math.min(innerWidth * 0.56, 960);
  function layout() {
    const w = cardW(), gap = Math.max(40, w * 0.12);
    scenes.style.setProperty("--cw", w + "px");
    cards.forEach((c, k) => {
      const x = (k - sel) * (w + gap) + dragX - w / 2;
      c.style.transform = `translate(${x}px, ${-w * 717 / 1280 / 2}px)`;
      c.classList.toggle("side", k !== sel);
    });
    [...dotsBox.children].forEach((d, k) => d.classList.toggle("on", k === sel));
  }
  function go(k) { sel = Math.max(0, Math.min(cards.length - 1, k)); dragX = 0; layout(); }
  function pick(k) { Z.show(k); close(); }
  $("globe").addEventListener("click", () => { sel = Z.cur; dragX = 0; open(scenes); layout(); });
  addEventListener("resize", () => opened === scenes && layout());

  // 끌어서 넘기기 · 카드 누르기
  let down = null;
  scenes.addEventListener("pointerdown", e => {
    if (e.target.closest(".close")) return;
    down = { x: e.clientX, moved: false, card: e.target.closest(".card") };
    scenes.setPointerCapture(e.pointerId);
  });
  scenes.addEventListener("pointermove", e => {
    if (!down) return;
    dragX = e.clientX - down.x;
    if (Math.abs(dragX) > 6) { down.moved = true; scenes.classList.add("dragging"); }
    layout();
  });
  scenes.addEventListener("pointerup", () => {
    if (!down) return;
    scenes.classList.remove("dragging");
    const w = cardW() * 1.12;
    if (down.moved) go(sel - Math.round(dragX / w));
    else if (down.card) {
      const k = cards.indexOf(down.card);
      k === sel ? pick(k) : go(k);
    } else { dragX = 0; layout(); }
    down = null;
  });
  let wheelLock = 0;
  scenes.addEventListener("wheel", e => {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8 || performance.now() < wheelLock) return;
    wheelLock = performance.now() + 380;
    go(sel + (d > 0 ? 1 : -1));
  }, { passive: false });

  // ---------- 동물 목록 ----------
  const grid = $("grid");
  function icon(a, cv) {
    const dpr = 2, W = 110, H = 76;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext("2d");
    const k = Math.min((W - 8) / a.w, (H - 8) / a.h) * dpr;
    x.translate((W * dpr - a.w * k) / 2, (H * dpr - a.h * k) / 2);
    x.scale(k, k);
    x.fillStyle = x.strokeStyle = getComputedStyle(document.body).getPropertyValue("--ink").trim() || "#1b1b1b";
    x.lineCap = x.lineJoin = "round";
    for (const s of a.shapes) {
      if (s[0] === "s") continue;
      x.beginPath();
      if (s[0] === "e") { x.ellipse(s[1], s[2], s[3], s[4], 0, 0, Math.PI * 2); x.fill(); }
      else if (s[0] === "p") { s[1].forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.fill(); }
      else { x.lineWidth = s[2]; s[1].forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); }
    }
  }
  for (const [key, a] of Object.entries(ANIMALS)) {
    const b = document.createElement("button");
    const cv = document.createElement("canvas");
    icon(a, cv);
    b.append(cv);
    b.insertAdjacentHTML("beforeend", `<b>${key.toUpperCase()}</b><small>${a.ko}</small>`);
    b.addEventListener("click", () => { close(); Z.add(key); });
    grid.appendChild(b);
  }
  $("listBtn").addEventListener("click", () => open($("list")));
  // 패널 밖(흐린 곳)을 누르면 닫힘
  $("list").addEventListener("click", e => { if (e.target === $("list")) close(); });
})();
