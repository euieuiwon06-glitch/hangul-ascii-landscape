// 배경 고르기(점 지구본 → 좌우로 넘기는 카드) · 동물 목록 팝업(letter-zoo 구성)
(() => {
  const Z = window.__zoo, ANIMALS = window.ANIMALS, SIL = window.SIL || {};
  const $ = id => document.getElementById(id);
  const input = $("name");

  // ---------- 배경 고르기 ----------
  const scenes = $("scenes"), track = $("track");
  const cards = Z.ORDER.map((id, k) => {
    const b = document.createElement("button");
    b.className = "card";
    b.setAttribute("aria-label", `배경 ${k + 1}`);
    b.innerHTML = `<img src="thumbs/${id}.jpg?v=202611152316" alt="" draggable="false">`;
    track.appendChild(b);
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
  }
  const isOpen = el => el.classList.contains("open");
  function go(k) { sel = Math.max(0, Math.min(cards.length - 1, k)); dragX = 0; layout(); }
  function closeScenes() { scenes.classList.remove("open"); }
  function pick(k) { Z.show(k); closeScenes(); }
  $("globe").addEventListener("click", () => {
    if (isOpen(scenes)) return closeScenes();
    closeIntro();
    sel = Z.cur; dragX = 0; layout(); scenes.classList.add("open");
  });
  addEventListener("resize", () => isOpen(scenes) && layout());

  // 끌어서 넘기기 · 카드 누르기 · 빈 곳 누르면 닫기
  let down = null;
  scenes.addEventListener("pointerdown", e => {
    down = { x: e.clientX, moved: false, card: e.target.closest(".card") };
    scenes.setPointerCapture(e.pointerId);
  });
  scenes.addEventListener("pointermove", e => {
    if (!down) return;
    dragX = e.clientX - down.x;
    if (Math.abs(dragX) > 6) { down.moved = true; scenes.classList.add("dragging"); }
    if (down.moved) layout();
  });
  scenes.addEventListener("pointerup", () => {
    if (!down) return;
    scenes.classList.remove("dragging");
    const w = cardW() * 1.12;
    if (down.moved) go(sel - Math.round(dragX / w));
    else if (down.card) { const k = cards.indexOf(down.card); k === sel ? pick(k) : go(k); }
    else closeScenes();
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
  const intro = $("intro"), grid = intro.querySelector(".grid");
  const REF = 3.4;   // 우리 도형 1단위 = letter-zoo 기준 3.4px (토끼 높이가 비슷해지도록)
  function ourSvg(a) {
    const w = a.w * REF, h = a.h * REF;
    let body = "";
    for (const s of a.shapes) {
      if (s[0] === "e") body += `<ellipse cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"/>`;
      else if (s[0] === "p") body += `<polygon points="${s[1].map(p => p.join(",")).join(" ")}"/>`;
      else if (s[0] === "l") body += `<polyline points="${s[1].map(p => p.join(",")).join(" ")}" fill="none" stroke-width="${s[2]}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return { w, h, inner: `<g transform="scale(${REF})" stroke="none">${body.replace(/<polyline /g, '<polyline style="stroke:var(--ink)" ')}</g>` };
  }
  function buildMenu() {
    const narrow = matchMedia("(max-width:700px)").matches, u = narrow ? 0.21 : 0.9 * 100 / 991;
    grid.innerHTML = "";
    for (const [key, a] of Object.entries(ANIMALS)) {
      const v = SIL[key];
      const g = v ? { w: v.w, h: v.h, inner: `<path d="${v.d}" stroke="none"/>` } : ourSvg(a);
      const b = document.createElement("button");
      b.className = "tile";
      b.type = "button";
      b.setAttribute("aria-label", a.ko);
      b.innerHTML = `<div class="ic"><svg viewBox="0 0 ${g.w} ${g.h}" style="width:${(g.w * u).toFixed(2)}cqw;height:${(g.h * u).toFixed(2)}cqw" aria-hidden="true">${g.inner}</svg></div><b>${a.ko}</b>`;
      b.addEventListener("click", () => { closeIntro(); Z.add(key); });
      grid.appendChild(b);
    }
  }
  buildMenu();
  matchMedia("(max-width:700px)").addEventListener("change", buildMenu);
  function openIntro() { closeScenes(); intro.classList.add("open"); if (document.activeElement === input) input.blur(); }
  function closeIntro() { intro.classList.remove("open"); }
  $("listBtn").addEventListener("click", () => isOpen(intro) ? closeIntro() : openIntro());
  intro.querySelector(".x").addEventListener("click", closeIntro);
  intro.addEventListener("click", e => { if (e.target === intro) closeIntro(); });

  addEventListener("keydown", e => {
    if (e.key === "Escape") { closeIntro(); closeScenes(); return; }
    if (!isOpen(scenes)) return;
    if (e.key === "ArrowRight") go(sel + 1);
    if (e.key === "ArrowLeft") go(sel - 1);
    if (e.key === "Enter") pick(sel);
  });
})();
