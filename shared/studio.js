/* =====================================================================
   Sketch-to-Chemistry studio engine
   ---------------------------------------------------------------------
   Shared by every lesson in the guide. A lesson page loads this file
   (classic <script>, so it works from file://) and calls
   Studio.lesson({...config}). The engine owns:
     · the page layout (stage + side panel), built from the config
     · the desk / paper / window-light look and the pencil + eraser props
     · pencil-sketch and handwriting primitives (Studio.draw)
     · the guided tour: chapters, timeline, captions, voice, camera
     · the lab: controls, stats, live notes, challenges, quiz
   A lesson supplies only its story (chapters, camera keys, tourState),
   its drawing (draw(env)) and its dashboard (controls, stats, now()).
   World coordinates: the paper is 1600 × 1000, origin top-left.
   ===================================================================== */
(function () {
'use strict';

// ------------------------------------------------------------ helpers
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const clamp01 = x => clamp(x, 0, 1);
const S = (t, a, b) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };   // smoothstep
const Lr = (t, a, b) => clamp01((t - a) / (b - a));                                               // linear ramp
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = x => 1 - Math.pow(1 - x, 3);
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const wob = n => hash(n) - 0.5;
const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
function sci(c, d = 2) {
  if (c === 0) return '0';
  if (Math.abs(c) >= 1e-4 && Math.abs(c) < 1e4) return Math.abs(c) >= 1 ? c.toFixed(2) : String(+c.toPrecision(3));
  let e = Math.floor(Math.log10(Math.abs(c))), m = c / Math.pow(10, e);
  if (Math.abs(m) >= 9.95) { m /= 10; e++; }
  return m.toFixed(d - 1) + '×10' + String(e).split('').map(ch => SUP[ch]).join('');
}
const sgn = (x, d) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(hex, toward, k) { const a = hexRgb(hex), b = hexRgb(toward); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`; }
const U = { clamp, clamp01, S, Lr, lerp, easeOut, hash, wob, sci, sgn, mix, hexRgb, SUP };

const C = {
  INK: '#34302c', GRAY: '#8a8278', ORANGE: '#d9722b', BLUE: '#2f55c8', GREEN: '#4f8a63', RED: '#a8433a',
  ZN: '#59616d', CU: '#b8612f', PAPER: '#f3f0e8',
  HAND: '"Caveat", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  SANS: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  MONO: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
};

let ctx = null;
const Studio = window.Studio = { U, C, pencilTip: null };

// ------------------------------------------------------------ geometry helpers
function mkPath(pts) {
  const segs = []; let tot = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], l = Math.hypot(x1 - x0, y1 - y0);
    if (l < 0.01) continue;
    segs.push({ x0, y0, x1, y1, l, s: tot }); tot += l;
  }
  return { len: tot, pts, at(u, wrap = true) {
    u = wrap ? ((u % 1) + 1) % 1 : clamp01(u); const d = u * tot;
    for (const s of segs) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return [s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k]; }
    const s = segs[segs.length - 1]; return [s.x1, s.y1];
  } };
}
const bez = (p, k) => { const u = 1 - k; return [0, 1].map(i => u * u * u * p[0][i] + 3 * u * u * k * p[1][i] + 3 * u * k * k * p[2][i] + k * k * k * p[3][i]); };
const bezPts = (p, N = 24) => Array.from({ length: N + 1 }, (_, i) => bez(p, i / N));
const ellipsePts = (cx, cy, rx, ry, N = 26, a0 = 0, a1 = Math.PI * 2 + 0.25) =>
  Array.from({ length: N + 1 }, (_, i) => { const a = lerp(a0, a1, i / N); return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });

// ------------------------------------------------------------ pencil primitives
// sk: a pencil stroke along a polyline. prog 0..1 animates the drawing; the tip is
// recorded in Studio.pencilTip so the engine can place the drawing pencil there.
function sk(pts, seed, prog = 1, o = {}) {
  if (prog <= 0 || pts.length < 2) return;
  const lens = []; let tot = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); tot += l; }
  const amp = o.amp ?? 1.3, base = ctx.globalAlpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = o.color || C.INK;
  if (o.dash) ctx.setLineDash(o.dash);
  for (let pass = 0; pass < (o.single ? 1 : 2); pass++) {
    ctx.beginPath(); let left = tot * prog;
    for (let i = 0; i < lens.length && left > 0; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = lens[i] || 1;
      const k = Math.min(1, left / len); left -= len;
      const ex = lerp(x0, x1, k), ey = lerp(y0, y1, k);
      const j = q => wob(seed + pass * 31 + i * 3 + q) * amp;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len, bow = wob(seed + pass * 17 + i * 5) * Math.min(5, len * 0.02);
      if (i === 0 || pass === 1) ctx.moveTo(x0 + j(0), y0 + j(1)); else ctx.lineTo(x0 + j(0) * 0.3, y0 + j(1) * 0.3);
      ctx.quadraticCurveTo((x0 + ex) / 2 + nx * bow, (y0 + ey) / 2 + ny * bow, ex + j(2), ey + j(3));
      if (k < 1) Studio.pencilTip = [ex, ey];
    }
    ctx.globalAlpha = base * (pass ? 0.35 : 0.85);
    ctx.lineWidth = (o.w || 1.8) * (pass ? 0.7 : 1);
    ctx.stroke();
  }
  ctx.globalAlpha = base; ctx.setLineDash([]);
}
// diagonal pencil hatching inside a clip path
function hatch(clipPath, x0, y0, x1, y1, gap, seed, prog = 1, alpha = 0.22, color = C.INK) {
  if (prog <= 0) return;
  ctx.save(); clipPath(); ctx.clip();
  const h = y1 - y0, lines = [];
  for (let d = x0 - h; d < x1; d += gap) lines.push(d);
  const nShow = Math.floor(lines.length * prog);
  ctx.strokeStyle = color; ctx.lineWidth = 1.1; ctx.globalAlpha *= alpha;
  ctx.beginPath();
  for (let i = 0; i < nShow; i++) { const d = lines[i], j = wob(seed + i) * 3; ctx.moveTo(d + j, y1); ctx.lineTo(d + h + j * 0.5, y0); }
  ctx.stroke(); ctx.restore();
}
// handwriting (Caveat) with real superscripts for ²⁺ ⁻ etc. and a typewriter reveal.
// Returns the full width so callers can underline / circle it.
const SUPMAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '−' };
const SUBMAP = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₒ': 'o' };
function hand(str, x, y, o = {}) {
  const prog = o.prog ?? 1;
  if (prog <= 0) return 0;
  const size = o.size || 30, w8 = o.weight || 600;
  const fN = `${w8} ${size}px ${C.HAND}`, fS = `${w8} ${size * 0.62}px ${C.HAND}`;
  const runs = [];
  for (const ch of String(str)) {
    const mode = SUPMAP[ch] !== undefined ? 1 : SUBMAP[ch] !== undefined ? -1 : 0;
    const c = mode === 1 ? SUPMAP[ch] : mode === -1 ? SUBMAP[ch] : ch, last = runs[runs.length - 1];
    if (last && last.mode === mode) last.t += c; else runs.push({ t: c, mode });
  }
  let full = 0;
  for (const r of runs) { ctx.font = r.mode ? fS : fN; r.w = ctx.measureText(r.t).width; full += r.w; }
  let sx = x;
  if (o.align === 'center') sx = x - full / 2; else if (o.align === 'right') sx = x - full;
  ctx.save();
  if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot); sx -= x; y = 0; }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = o.color || C.INK;
  let left = Math.ceil([...String(str)].length * prog), cx = sx;
  for (const r of runs) {
    if (left <= 0) break;
    const part = r.t.slice(0, left); left -= r.t.length;
    ctx.font = r.mode ? fS : fN;
    ctx.fillText(part, cx, r.mode === 1 ? y - size * 0.38 : r.mode === -1 ? y + size * 0.16 : y);
    cx += ctx.measureText(part).width;
  }
  ctx.restore();
  if (prog < 1 && !o.rot) Studio.pencilTip = [cx, y - size * 0.3];
  return full;
}
function arrowSk(x1, y1, x2, y2, seed, prog = 1, color = C.ORANGE, bend = 0.2) {
  if (prog <= 0) return;
  const mx = (x1 + x2) / 2 + (y2 - y1) * bend, my = (y1 + y2) / 2 - (x2 - x1) * bend;
  const pts = Array.from({ length: 13 }, (_, i) => { const k = i / 12, u = 1 - k; return [u * u * x1 + 2 * u * k * mx + k * k * x2, u * u * y1 + 2 * u * k * my + k * k * y2]; });
  sk(pts, seed, prog, { color, w: 2 });
  if (prog >= 1) {
    const a = Math.atan2(y2 - my, x2 - mx);
    sk([[x2 - Math.cos(a - 0.45) * 14, y2 - Math.sin(a - 0.45) * 14], [x2, y2], [x2 - Math.cos(a + 0.45) * 14, y2 - Math.sin(a + 0.45) * 14]], seed + 5, 1, { color, w: 2 });
  }
}
// soft contact shadow on the paper
function softEllipse(cx, cy, rx, ry, alpha = 0.25) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(50,30,10,${alpha})`); g.addColorStop(1, 'rgba(50,30,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
// matte sphere lit from the upper left (atoms, ions, molecules, beads). No glow.
function sphere(x, y, r, color, label, o = {}) {
  const base = ctx.globalAlpha;
  if (o.shadow !== false) { ctx.fillStyle = 'rgba(60,40,20,0.2)'; ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.45, r * 1.02, r * 0.78, 0, 0, Math.PI * 2); ctx.fill(); }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, mix(color, '#ffffff', 0.62)); g.addColorStop(0.5, mix(color, '#ffffff', 0.08)); g.addColorStop(1, mix(color, '#000000', 0.32));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (label) {
    ctx.fillStyle = o.labelColor || '#1f1b17';
    ctx.font = `700 ${o.labelSize || Math.round(r * 0.72)}px ${C.SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
  }
  ctx.globalAlpha = base;
}
const bead = (x, y, r, label) => sphere(x, y, r, '#d4a24c', label, { labelColor: '#4a3310', labelSize: Math.round(r * 1.3) });
function ringFx(x, y, k, color, r = 18) {
  if (k <= 0 || k >= 1) return;
  const b = ctx.globalAlpha; ctx.globalAlpha = b * (1 - k);
  ctx.beginPath(); ctx.arc(x, y, 5 + k * r, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.globalAlpha = b;
}
// small printed label (mono) on a white card, optional pencil leader line
function tag(x, y, text, o = {}) {
  const a = o.alpha ?? 1; if (a <= 0) return;
  const b = ctx.globalAlpha; ctx.globalAlpha = b * a;
  if (o.leader) sk([o.leader, [x, y + (o.leader[1] > y ? 14 : -18)]], x + y, 1, { w: 1.2, color: C.GRAY, single: true });
  const size = o.size || 17;
  ctx.font = `600 ${size}px ${C.MONO}`;
  const w = ctx.measureText(text).width + 22, h = size + 15;
  ctx.fillStyle = 'rgba(40,20,5,0.12)'; ctx.beginPath(); ctx.roundRect(x - w / 2 + 3, y - h / 2 + 3, w, h, 7); ctx.fill();
  ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = '#d8d0c2'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = o.color || C.INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
  ctx.globalAlpha = b;
}
function pencilSprite(x, y, ang, shadowK = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.save(); ctx.translate(10 * shadowK, 14 * shadowK); ctx.globalAlpha *= 0.18;
  ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(44, -8); ctx.lineTo(372, -8); ctx.lineTo(372, 8); ctx.lineTo(44, 8); ctx.closePath(); ctx.fill();
  ctx.restore();
  const body = ctx.createLinearGradient(0, -8, 0, 8);
  body.addColorStop(0, '#e7c796'); body.addColorStop(0.5, '#caa06a'); body.addColorStop(1, '#a87e4e');
  ctx.fillStyle = body; ctx.fillRect(44, -8, 318, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(44, -6, 318, 3);
  ctx.fillStyle = '#e9d2aa'; ctx.beginPath(); ctx.moveTo(10, -2.5); ctx.lineTo(44, -8); ctx.lineTo(44, 8); ctx.lineTo(10, 2.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a3633'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, -2.8); ctx.lineTo(11, 2.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3b2b22'; ctx.fillRect(362, -8, 12, 16);
  ctx.restore();
}
function eraser(x, y, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(40,20,5,0.18)'; ctx.fillRect(-22, -5, 60, 32);
  ctx.fillStyle = '#f7f7f4'; ctx.fillRect(-30, -15, 60, 30);
  ctx.fillStyle = '#2446a8'; ctx.fillRect(-14, -16, 34, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-9, -3, 24, 2); ctx.fillRect(-9, 3, 16, 2);
  ctx.restore();
}
// hand-drawn graph axes helper: returns {X, Y} mappers. Everything in pencil.
function sketchAxes(box, dom, o = {}) {
  const { x0, y0, x1, y1 } = box, { xmin, xmax, ymin, ymax } = dom;
  const X = v => x0 + (v - xmin) / (xmax - xmin) * (x1 - x0), Y = v => y1 - (v - ymin) / (ymax - ymin) * (y1 - y0);
  const prog = o.prog ?? 1;
  sk([[x0, y0 - 10], [x0, y1], [x1 + 10, y1]], o.seed || 777, prog, { w: 1.6 });
  if (prog >= 1) {
    if (o.xlabel) hand(o.xlabel, x1, y1 + 50, { size: 24, color: C.GRAY, align: 'right' });
    if (o.ylabel) hand(o.ylabel, x0 - 10, y0 - 18, { size: 24, color: C.GRAY, align: 'center' });
    const xt = o.xticks || [], yt = o.yticks || [];
    for (const v of xt) { sk([[X(v), y1], [X(v), y1 + 8]], 60 + v * 7, 1, { w: 1.2, single: true }); hand(o.xfmt ? o.xfmt(v) : String(v), X(v), y1 + 28, { size: 20, color: C.GRAY, align: 'center' }); }
    for (const v of yt) { sk([[x0 - 8, Y(v)], [x0, Y(v)]], 90 + v * 7, 1, { w: 1.2, single: true }); hand(o.yfmt ? o.yfmt(v) : String(v), x0 - 12, Y(v) + 7, { size: 20, color: C.GRAY, align: 'right' }); }
  }
  return { X, Y };
}
Studio.draw = { sk, hatch, hand, arrowSk, softEllipse, sphere, bead, ringFx, tag, pencilSprite, eraser, sketchAxes, mkPath, bezPts, ellipsePts };

// ------------------------------------------------------------ textures
let deskImg, paperImg;
function buildTextures() {
  let c = document.createElement('canvas'); c.width = 1500; c.height = 1100;
  let g = c.getContext('2d');
  const plank = 136, tones = [[188, 138, 92], [198, 149, 101], [178, 128, 85], [192, 142, 96]];
  for (let p = 0; p * plank < c.height; p++) {
    const y = p * plank, b = tones[p % 4];
    const grad = g.createLinearGradient(0, y, 0, y + plank);
    grad.addColorStop(0, `rgb(${b.map(v => v + 6)})`); grad.addColorStop(1, `rgb(${b.map(v => v - 8)})`);
    g.fillStyle = grad; g.fillRect(0, y, c.width, plank);
    for (let i = 0; i < 80; i++) {
      const yy = y + hash(p * 100 + i) * plank, amp = 2 + hash(i + p * 7) * 4;
      g.beginPath(); g.moveTo(0, yy);
      for (let x = 0; x <= c.width; x += 30) g.lineTo(x, yy + Math.sin(x * 0.003 + i + p * 3) * amp + Math.sin(x * 0.011 + i * 2) * 1.2);
      g.strokeStyle = `rgba(${90 + hash(i * 3 + p) * 40},${55 + hash(i * 5) * 25},30,${0.05 + hash(i + p * 9) * 0.12})`;
      g.lineWidth = 0.6 + hash(i * 5 + p) * 1.6; g.stroke();
    }
    g.fillStyle = 'rgba(60,35,15,0.45)'; g.fillRect(0, y, c.width, 2.5);
    g.fillStyle = 'rgba(255,230,190,0.18)'; g.fillRect(0, y + 2.5, c.width, 1.5);
  }
  deskImg = c;
  c = document.createElement('canvas'); c.width = 1600; c.height = 1000; g = c.getContext('2d');
  g.fillStyle = C.PAPER; g.fillRect(0, 0, 1600, 1000);
  const img = g.getImageData(0, 0, 1600, 1000), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const nz = (Math.random() - 0.5) * 9; d[i] += nz; d[i + 1] += nz; d[i + 2] += nz * 1.1; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 1600, y = Math.random() * 1000, a = Math.random() * 6.28, l = 4 + Math.random() * 10;
    g.strokeStyle = `rgba(120,105,85,${0.03 + Math.random() * 0.04})`; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const edge = g.createRadialGradient(800, 500, 300, 800, 500, 1000);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(120,95,60,0.10)');
  g.fillStyle = edge; g.fillRect(0, 0, 1600, 1000);
  paperImg = c;
}

// ------------------------------------------------------------ page layout
function buildDOM(L, nav) {
  const esc = s => String(s);
  document.body.innerHTML = `
<div class="app">
  <div class="stage" id="stage">
    <canvas id="cv" aria-label="${esc(L.title)}: animated pencil sketch"></canvas>
    <div class="nav glass">
      <a href="${nav.home}">← Guide</a><span class="sep"></span>
      <span class="eyebrow">${esc(L.unit || '')}</span>
      <a class="arrow ${nav.prev ? '' : 'off'}" href="${nav.prev || '#'}" title="Previous question">‹</a>
      <a class="arrow ${nav.next ? '' : 'off'}" href="${nav.next || '#'}" title="Next question">›</a>
    </div>
    <div class="intro glass" id="intro">
      <div class="top"><span class="eyebrow">${esc(L.eyebrow || 'Sketch to chemistry')}</span><span class="eyebrow">Class 12</span></div>
      <h1>${esc(L.title)}</h1>
      <p>${esc(L.intro || '')}</p>
      <div style="display:flex;gap:8px">
        <button class="btn dark" id="bTour">Play the tour</button>
        <button class="btn" id="bLab">Try it yourself</button>
      </div>
    </div>
    <div class="caption glass hide" id="caption"></div>
    <div class="timeline glass hide" id="timeline">
      <button class="tl-btn" id="tPlay" title="Play / pause (space)">❚❚</button>
      <div class="track" id="track"><div class="rail"></div><div class="fill" id="tFill"></div><div class="knob" id="tKnob"></div></div>
      <span class="tl-time" id="tTime"></span>
      <button class="tl-btn" id="tVoice" title="Read captions aloud">🔇</button>
      <button class="tl-btn" id="tClose" title="Skip to the lab">✕</button>
    </div>
  </div>
  <aside class="panel" id="panel">
    <div class="phead">
      <div><div class="eyebrow">${esc(L.panelEyebrow || 'Lab')}</div><h2>${esc(L.headline || L.title)}</h2></div>
      <span class="tag" id="modeTag">READY</span>
    </div>
    <div class="stats" style="margin-bottom:12px;grid-template-columns:repeat(${L.stats.length},1fr)">
      ${L.stats.map(s => `<div class="stat"><b id="st_${s.id}">–</b><span>${esc(s.label)}</span></div>`).join('')}
    </div>
    <div class="card now">
      <div class="eyebrow" id="nowTag">Welcome</div>
      <h3 id="nowTitle">${esc(L.welcome?.title || 'Ready when you are')}</h3>
      <p id="nowText">${esc(L.welcome?.text || 'Press Play the tour for a short guided story, or jump straight into the lab.')}</p>
      <div class="formula" id="nowFormula">${esc(L.welcome?.formula || '')}</div>
    </div>
    <div class="card problem">
      <div class="eyebrow">The class problem</div>
      ${L.problem.html}
      <div class="reveal" id="reveal"><span class="hidden">Answer revealed in the tour${L.problem.revealChapter ? ` (chapter ${L.problem.revealChapter})` : ''}</span></div>
    </div>
    <div class="card controls locked" id="controls">
      <div class="lock"><span>Controls unlock after the tour</span><button class="btn" id="bSkip">Try it now →</button></div>
      <div class="phead" style="margin-bottom:6px"><div class="eyebrow">${esc(L.controlsTitle || 'Build it yourself')}</div></div>
      <div id="ctlHost"></div>
      <div class="two"><button class="btn" id="bReset">Reset</button><button class="btn" id="bReplay">Replay tour</button></div>
    </div>
    <div class="card">
      <div class="phead" style="margin-bottom:0"><div class="eyebrow">Challenges</div><span class="tag" id="chalCount">0 / ${L.challenges.length}</span></div>
      <ul class="chal" id="chal"></ul>
    </div>
    ${L.quiz ? `<div class="card quiz">
      <div class="eyebrow">Predict first</div>
      <p>${L.quiz.question}</p>
      <div class="opts" id="quiz">${L.quiz.options.map((o, i) => `<button data-k="${i}">${o}</button>`).join('')}</div>
      <div class="fb" id="quizFb"></div>
    </div>` : ''}
  </aside>
</div>`;
}

// ------------------------------------------------------------ reuse outside lessons (the guide home page)
Studio.useContext = c => { ctx = c; Studio.ctx = c; };
Studio.textures = () => { if (!deskImg) buildTextures(); return { desk: deskImg, paper: paperImg }; };

// ------------------------------------------------------------ the lesson runner
Studio.lesson = function (L) {
  document.title = `${L.title} · Sketch to Chemistry`;
  // guide navigation from the catalog (shared/catalog.js)
  const cat = (window.CATALOG || []).filter(q => q.status !== 'soon');
  const idx = cat.findIndex(q => q.id === L.id);
  const rel = f => '../' + f;
  const nav = { home: '../index.html', prev: idx > 0 ? rel(cat[idx - 1].file) : null, next: idx >= 0 && idx < cat.length - 1 ? rel(cat[idx + 1].file) : null };
  buildDOM(L, nav);
  buildTextures();

  const $ = id => document.getElementById(id);
  const cv = $('cv'); ctx = cv.getContext('2d'); Studio.ctx = ctx;
  let VW = 1, VH = 1, DPR = 1;
  function resize() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2); VW = r.width; VH = r.height;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  }
  new ResizeObserver(resize).observe(cv); resize();

  const CH = L.chapters, TOUR_END = L.tourEnd;
  const chapterAt = t => { let i = 0; CH.forEach((c, k) => { if (t >= c.t) i = k; }); return i; };
  const CAM = L.camera || [[0, 800, 500, 1], [999, 800, 500, 1]];
  function camAt(t) {
    for (let i = 0; i < CAM.length - 1; i++) {
      const a = CAM[i], b = CAM[i + 1];
      if (t <= b[0]) { const k = S(t, a[0], b[0]); return { x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k), z: lerp(a[3], b[3], k) }; }
    }
    const l = CAM[CAM.length - 1]; return { x: l[1], y: l[2], z: l[3] };
  }

  // ---- state
  let mode = 'intro', tourT = 0, playing = false, clock = 0, snap = true, lastCh = -1, voice = false;
  let lab = L.initLab();
  const cam = { x: 800, y: 510, z: 1 };
  const introT = L.introT ?? (CH[1] ? CH[1].t : 0);
  const api = { get mode() { return mode; }, get lab() { return lab; }, snap: () => { snap = true; }, syncControls: () => syncControls(true) };

  // ---- timeline
  const track = $('track');
  CH.forEach((c, i) => {
    const el = document.createElement('span'); el.className = 'ch'; el.textContent = c.key;
    el.style.left = (c.t / TOUR_END * 100) + '%'; track.appendChild(el);
  });
  const chEls = [...track.querySelectorAll('.ch')];
  track.addEventListener('pointerdown', e => {
    const seekTo = ev => { const r = track.getBoundingClientRect(); tourT = clamp((ev.clientX - r.left) / r.width, 0, 1) * TOUR_END; snap = true; };
    seekTo(e);
    const mv = ev => seekTo(ev), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  function speak(text) {
    if (!voice || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[⁺⁻²³]/g, m => ({ '⁺': ' plus', '⁻': ' minus', '²': ' 2', '³': ' 3' })[m])); u.rate = 1.05; speechSynthesis.speak(u);
  }
  $('tVoice').onclick = () => { voice = !voice; $('tVoice').textContent = voice ? '🔊' : '🔇'; if (!voice && window.speechSynthesis) speechSynthesis.cancel(); else if (mode === 'tour') speak(CH[chapterAt(tourT)].text); };
  function setPlaying(p) { playing = p; $('tPlay').textContent = playing ? '❚❚' : '▶'; }
  $('tPlay').onclick = () => { if (tourT >= TOUR_END) tourT = 0; setPlaying(!playing); };
  $('tClose').onclick = () => enterLab();

  function enterTour(t = 0, play = true) {
    mode = 'tour'; tourT = t; snap = true; lastCh = -1; setPlaying(play);
    $('intro').classList.add('hide'); $('timeline').classList.remove('hide'); $('caption').classList.remove('hide');
    $('controls').classList.add('locked'); $('stage').classList.add('touring');
    $('modeTag').textContent = 'TOUR'; $('modeTag').classList.remove('live');
    L.onEnterTour?.(api);
  }
  function enterLab() {
    mode = 'lab'; playing = false; snap = true;
    lab = L.initLab();
    if (window.speechSynthesis) speechSynthesis.cancel();
    $('intro').classList.add('hide'); $('timeline').classList.add('hide'); $('caption').classList.add('hide');
    $('controls').classList.remove('locked'); $('stage').classList.remove('touring');
    $('modeTag').textContent = 'LIVE LAB'; $('modeTag').classList.add('live');
    revealAnswer(); syncControls(true);
    L.onEnterLab?.(lab, api);
    $('controls').classList.remove('pulse'); void $('controls').offsetWidth; $('controls').classList.add('pulse');
  }
  $('bTour').onclick = () => enterTour(0, true);
  $('bLab').onclick = () => enterLab();
  $('bSkip').onclick = () => enterLab();
  $('bReplay').onclick = () => enterTour(0, true);
  $('bReset').onclick = () => { lab = L.initLab(); snap = true; L.onReset?.(lab, api); syncControls(true); };
  $('stage').addEventListener('click', e => { if (mode === 'tour' && e.target === cv) $('tPlay').onclick(); });
  addEventListener('keydown', e => {
    if (mode !== 'tour' || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); $('tPlay').onclick(); }
    if (e.code === 'ArrowRight') { tourT = Math.min(TOUR_END, tourT + 3); snap = true; }
    if (e.code === 'ArrowLeft') { tourT = Math.max(0, tourT - 3); snap = true; }
  });
  function revealAnswer() { $('reveal').innerHTML = `Answer: <span class="ans">${L.problem.answer}</span>`; }

  // ---- controls built from config
  const host = $('ctlHost'), updaters = [];
  for (const c of L.controls) {
    const box = document.createElement('div'); box.className = 'ctl'; host.appendChild(box);
    if (c.type === 'slider') {
      box.innerHTML = `<div class="row"><span class="eyebrow">${c.label}</span><span class="val"></span></div>
        <input type="range" min="${c.min}" max="${c.max}" step="${c.step || 0.01}">
        ${c.ends ? `<div class="ends"><span>${c.ends[0]}</span><span>${c.ends[1]}</span></div>` : ''}`;
      const inp = box.querySelector('input'), val = box.querySelector('.val');
      inp.oninput = () => { c.set(lab, +inp.value, api); };
      updaters.push(force => {
        if (force || document.activeElement !== inp) inp.value = c.get(lab);
        const t = c.show ? c.show(lab) : ''; if (val.textContent !== t) val.textContent = t;
      });
    } else if (c.type === 'button') {
      box.innerHTML = `<button class="btn ${c.dark === false ? '' : 'dark'} wide"></button>`;
      const b = box.querySelector('button');
      b.onclick = () => { c.onClick(lab, api); syncControls(true); };
      updaters.push(() => { const t = typeof c.label === 'function' ? c.label(lab) : c.label; if (b.textContent !== t) b.textContent = t; b.disabled = !!(c.disabled && c.disabled(lab)); });
      if (c.chips) {
        const wrap = document.createElement('div'); wrap.className = 'chips'; box.appendChild(wrap);
        for (const ch of c.chips) addChip(wrap, ch);
      }
    } else if (c.type === 'chips') {
      if (c.label) box.innerHTML = `<div class="eyebrow">${c.label}</div>`;
      const wrap = document.createElement('div'); wrap.className = 'chips'; box.appendChild(wrap);
      for (const ch of c.items) addChip(wrap, ch);
    } else if (c.type === 'segment') {
      box.innerHTML = `<div class="eyebrow">${c.label}</div><div class="seg" style="grid-template-columns:repeat(${c.options.length},1fr)">${c.options.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>${c.note ? `<div class="ends" style="margin-top:6px"><span>${c.note}</span></div>` : ''}`;
      box.querySelectorAll('button').forEach(b => b.onclick = () => { lab[c.key] = b.dataset.v; c.onChange?.(lab, b.dataset.v, api); syncControls(true); });
      updaters.push(() => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(lab[c.key]) === b.dataset.v)));
    } else if (c.type === 'html') {
      box.innerHTML = c.html;
      if (c.update) updaters.push(() => c.update(box, lab));
    }
  }
  function addChip(wrap, ch) {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = ch.label; wrap.appendChild(b);
    b.onclick = () => { lab[ch.key] = !lab[ch.key]; ch.onToggle?.(lab, api); syncControls(true); };
    updaters.push(() => b.classList.toggle('on', !!lab[ch.key]));
  }
  function syncControls(force) { for (const u of updaters) u(force); }

  // ---- challenges + quiz
  const done = {};
  $('chal').innerHTML = L.challenges.map(c => `<li id="chal_${c.id}"><span class="box">✓</span><span>${c.text}<small>${c.hint || ''}</small></span></li>`).join('');
  function checkChallenges(st) {
    if (mode !== 'lab') return;
    let k = 0;
    for (const c of L.challenges) {
      if (!done[c.id]) { try { if (c.test(lab, st)) { done[c.id] = true; $('chal_' + c.id).classList.add('done'); } } catch (e) { /* ignore */ } }
      if (done[c.id]) k++;
    }
    const t = `${k} / ${L.challenges.length}`; if ($('chalCount').textContent !== t) $('chalCount').textContent = t;
  }
  if (L.quiz) document.querySelectorAll('#quiz button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#quiz button').forEach(x => x.classList.remove('right', 'wrong'));
    const ok = +b.dataset.k === L.quiz.correct;
    b.classList.add(ok ? 'right' : 'wrong');
    $('quizFb').innerHTML = ok ? L.quiz.right : L.quiz.wrong;
  });

  // ---- panel refresh (cached writes)
  const cache = {};
  const put = (id, v, html) => { if (cache[id] === v) return; cache[id] = v; const el = $(id); if (el) html ? (el.innerHTML = v) : (el.textContent = v); };
  function updatePanel(st) {
    const sv = L.statValues(st, mode, lab);
    for (const s of L.stats) put('st_' + s.id, sv[s.id] ?? '–', true);
    if (mode === 'tour') {
      const i = chapterAt(tourT), c = CH[i];
      put('nowTag', `Now · ${String(i + 1).padStart(2, '0')} ${c.key}`);
      put('nowTitle', c.title); put('nowText', c.text); put('nowFormula', c.formula || '');
      put('caption', c.text);
      chEls.forEach((el, k) => el.classList.toggle('on', k === i));
      if (i !== lastCh) { lastCh = i; if (playing) speak(c.text); }
      if (L.problem.revealAt !== undefined && tourT >= L.problem.revealAt) revealAnswer();
      const pct = tourT / TOUR_END * 100;
      $('tFill').style.width = pct + '%'; $('tKnob').style.left = pct + '%';
      const fmt = x => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
      put('tTime', `<b>${c.key}</b>${fmt(tourT)} / ${fmt(TOUR_END)}`, true);
    } else if (mode === 'lab') {
      const nw = L.now(st, lab);
      put('nowTag', 'Live · what is happening');
      put('nowTitle', nw.title); put('nowText', nw.text, true); put('nowFormula', nw.formula || '');
    }
    syncControls(false);
  }

  // ---- render
  function render(adt, dt) {
    const TT = mode === 'lab' ? null : (mode === 'intro' ? introT : tourT);
    const st = mode === 'lab' ? (L.labState ? L.labState(lab) : lab) : L.tourState(TT);
    // camera
    if (mode === 'lab') {
      const tgt = typeof L.labCamera === 'function' ? L.labCamera(lab) : (L.labCamera || { x: 800, y: 510, z: 1 });
      const k = snap ? 1 : 1 - Math.exp(-dt * 3);
      cam.x = lerp(cam.x, tgt.x, k); cam.y = lerp(cam.y, tgt.y, k); cam.z = lerp(cam.z, tgt.z, k);
    } else Object.assign(cam, camAt(TT));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const SC = Math.min(VW / 1760, (VH - 70) / 1120) * cam.z, s = DPR * SC;
    ctx.setTransform(s, 0, 0, s, DPR * (VW / 2 - cam.x * SC), DPR * ((VH - 50) / 2 - cam.y * SC));
    ctx.drawImage(deskImg, -700, -600, 3000, 2200);
    ctx.save(); ctx.shadowColor = 'rgba(40,20,5,0.35)'; ctx.shadowBlur = 40 * s; ctx.shadowOffsetX = 10 * s; ctx.shadowOffsetY = 16 * s;
    ctx.fillStyle = C.PAPER; ctx.fillRect(0, 0, 1600, 1000); ctx.restore();
    ctx.drawImage(paperImg, 0, 0);

    Studio.pencilTip = null;
    const env = { ctx, st, lab, mode, TT, P: (a, b) => TT === null ? 1 : Lr(TT, a, b), dt: adt, rawDt: dt, clock, snap, api };
    ctx.save(); L.draw(env); ctx.restore();
    ctx.globalAlpha = 1;
    const tip = Studio.pencilTip;

    // props
    const pe = L.props?.eraser || [1380, 74, 0.14], pr = L.props?.pencil || [830, 70, -0.05], sp = L.sketchPencil || [0.3, 6.2];
    if (pe) eraser(...pe);
    if (mode === 'tour' && TT > sp[0] && TT < sp[1]) {
      const k = S(TT, sp[1] - 0.9, sp[1]), t0 = tip || [pr[0], pr[1]];
      pencilSprite(lerp(t0[0], pr[0], k), lerp(t0[1], pr[1], k), lerp(-0.95, pr[2], k), lerp(2.2, 1, k));
    } else pencilSprite(pr[0], pr[1], pr[2], 1);

    // window-blind light + vignette (screen space)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.translate(VW * 0.5, VH * 0.5); ctx.rotate(-0.42);
    const bandW = Math.max(VW, VH) * 0.12, drift = (clock * 4) % (bandW * 2.6);
    for (let i = -6; i <= 6; i++) {
      const x = i * bandW * 2.6 + drift, g = ctx.createLinearGradient(x - bandW, 0, x + bandW, 0);
      g.addColorStop(0, 'rgba(105,72,40,0)'); g.addColorStop(0.5, 'rgba(105,72,40,0.30)'); g.addColorStop(1, 'rgba(105,72,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x - bandW, -VH * 1.5, bandW * 2, VH * 3);
    }
    ctx.restore();
    const vg = ctx.createRadialGradient(VW * 0.45, VH * 0.42, Math.min(VW, VH) * 0.35, VW * 0.5, VH * 0.5, Math.max(VW, VH) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,5,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = 'rgba(255,190,120,0.05)'; ctx.fillRect(0, 0, VW, VH);
    snap = false;
    return st;
  }

  // ---- main loop
  let last = null;
  function frame(now) {
    if (last === null) last = now;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'tour' && playing) {
      tourT += dt;
      if (tourT >= TOUR_END) { tourT = TOUR_END; setPlaying(false); setTimeout(() => { if (mode === 'tour' && tourT >= TOUR_END) enterLab(); }, 900); }
    }
    const slow = mode === 'lab' && lab.slow ? 0.35 : 1;
    const paused = mode === 'tour' && !playing;
    const adt = paused ? 0 : dt * slow;
    clock += adt;
    if (mode === 'lab' && L.step) L.step(lab, dt * slow, api);
    const st = render(adt, dt);
    updatePanel(st);
    checkChallenges(st);
    requestAnimationFrame(frame);
  }
  syncControls(true);

  // deep links: #t=20 opens the tour paused there; #lab opens the lab; #lab&view=graph sets lab keys
  const h = decodeURIComponent(location.hash);
  const mt = h.match(/t=([\d.]+)/);
  if (mt) enterTour(+mt[1], false);
  else if (h.includes('lab')) {
    enterLab();
    for (const [, k, v] of h.matchAll(/[&#]([a-zA-Z]\w*)=([^&]+)/g)) if (k in lab) lab[k] = isNaN(+v) ? (v === 'true' ? true : v === 'false' ? false : v) : +v;
    syncControls(true);
  }
  // start drawing once the bundled fonts are ready (never wait more than 1.5 s)
  const fontsReady = document.fonts ? Promise.race([Promise.all(['600 30px Caveat', '700 30px Caveat', '600 16px "JetBrains Mono"', '500 16px Inter', '700 16px Inter'].map(f => document.fonts.load(f))).catch(() => {}), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
  fontsReady.then(() => requestAnimationFrame(frame));
};
})();
