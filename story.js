/* TIAN homepage: scroll-driven architecture story.
   Dependency-free canvas 2D with a small perspective projection. Scroll position is the
   only input; the camera flies Device -> Entry -> Exit -> open internet. The scene shows
   information roles (what each shield can see), not packet-by-packet routing. Each chapter
   is framed in the part of the screen the text leaves free, so words never sit behind a shield. */
(() => {
  'use strict';
  const root = document.querySelector('[data-story]');
  if (!root) return;
  const body = document.body;
  const canvas = root.querySelector('.story-canvas');
  const stage = root.querySelector('.story-sticky');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx || reduced.matches) { body.classList.add('story-static'); return; }
  body.classList.add('story-live');

  const chapters = [...root.querySelectorAll('.chapter')];
  const dots = [...root.querySelectorAll('.story-dot')];
  const header = document.querySelector('.header');
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const fade = (p, a, b, e) => smooth(clamp((p - a) / e)) * smooth(clamp((b - p) / e));
  const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const COL = { blue: [126, 200, 255], mint: [100, 244, 172], ice: [205, 234, 255], cyan: [92, 225, 230], white: [255, 255, 255] };
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';

  // ---- vector helpers -------------------------------------------------------------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- world ----------------------------------------------------------------------
  const DEVICE = [0, 0.15, 0];
  const ENTRY = [-2.5, 0.2, -16];
  const EXIT = [3.5, -0.4, -34];
  const GROUND = -3.2;
  const CONTROL = [
    [0.2, 0.9, -0.7], [0, 1.7, -2.6], [-0.6, 1.2, -7], [-1.6, 0.3, -12], ENTRY, [0.4, 0, -25], EXIT,
    [4.4, -3.4, -40], [2.2, -9, -46], [0, -13.5, -50]
  ];
  const ENTRY_INDEX = 4;
  const EXIT_INDEX = 6;

  // Camera keyframes. Positions and look targets are blended with a non-uniform cardinal spline so
  // the camera keeps moving between chapters. Chapters that need a precise composition are then
  // refined by fitting (see pose) so the subject lands in the area the text leaves free.
  const KEYS = [
    { p: 0.00, pos: [0.5, 0.9, 7.5], look: [0, 0.1, 0] },
    { p: 0.08, pos: [0.2, 0.8, 6.8], look: [0, 0.2, -0.3] },
    { p: 0.19, pos: [2.4, 1.5, 7.0], look: [-0.6, 0.5, -9] },
    { p: 0.25, pos: [1.5, 1.3, 1.5], look: [-1.5, 0.4, -11] },
    { p: 0.35, pos: [0.6, 1.0, -3.5], look: [-2.5, 0.2, -16] },
    { p: 0.42, pos: [0.0, 1.0, -4.0], look: [-2.5, 0.2, -16.2] },
    { p: 0.50, pos: [12, 6, -8], look: [0, -0.3, -22] },
    { p: 0.55, pos: [22, 9, -2], look: [0.5, -0.3, -26] },
    { p: 0.61, pos: [24, 9.5, -3], look: [0.5, -0.3, -26] },
    { p: 0.68, pos: [12, 3, -24], look: [3.5, -0.4, -32] },
    { p: 0.73, pos: [7.5, 1.4, -26], look: [3.2, -0.3, -34] },
    { p: 0.79, pos: [7, 1.2, -26.5], look: [3.4, -0.4, -34] },
    { p: 0.87, pos: [7, -3, -38], look: [1, -11, -48] },
    { p: 0.93, pos: [5, -8, -36], look: [0, -15, -50] },
    { p: 1.00, pos: [2, -9.5, -34], look: [0, -16, -52] }
  ];
  const CENTERS = [0.04, 0.22, 0.385, 0.56, 0.74, 0.92];
  const SHIFT_X = [0.2, -0.2, 0.17, -0.2, 0.2, 0];
  const SHIFT_Y = [0, 0, 0, 0, 0, 0.06];
  const NARROW_Y = [-0.26, -0.15, -0.15, -0.15, -0.15, -0.1];
  const RANGES = [0.14, 0.3, 0.47, 0.65, 0.83];

  function hermite(p, pick) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const k0 = KEYS[Math.max(i - 1, 0)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(i + 2, KEYS.length - 1)];
    const dp = k2.p - k1.p;
    const u = clamp((p - k1.p) / dp), u2 = u * u, u3 = u2 * u;
    const a = pick(k0), b = pick(k1), c = pick(k2), d = pick(k3);
    const out = [0, 0, 0];
    for (let n = 0; n < 3; n++) {
      const m1 = (c[n] - a[n]) / (k2.p - k0.p) * dp;
      const m2 = (d[n] - b[n]) / (k3.p - k1.p) * dp;
      out[n] = (2 * u3 - 3 * u2 + 1) * b[n] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * c[n] + (u3 - u2) * m2;
    }
    return out;
  }

  // Smooth path through the control points, resampled to even arc length.
  const SAMPLES = 480;
  const path = [];
  let sEntry = 0, sExit = 0, totalLength = 0;
  (() => {
    const raw = [];
    const marks = [];
    for (let i = 0; i < CONTROL.length - 1; i++) {
      const p0 = CONTROL[Math.max(i - 1, 0)], p1 = CONTROL[i], p2 = CONTROL[i + 1], p3 = CONTROL[Math.min(i + 2, CONTROL.length - 1)];
      marks[i] = raw.length;
      for (let s = 0; s < 24; s++) {
        const u = s / 24, u2 = u * u, u3 = u2 * u;
        const pt = [0, 0, 0];
        for (let n = 0; n < 3; n++) pt[n] = 0.5 * (2 * p1[n] + (-p0[n] + p2[n]) * u + (2 * p0[n] - 5 * p1[n] + 4 * p2[n] - p3[n]) * u2 + (-p0[n] + 3 * p1[n] - 3 * p2[n] + p3[n]) * u3);
        raw.push(pt);
      }
    }
    raw.push(CONTROL[CONTROL.length - 1]);
    marks[CONTROL.length - 1] = raw.length - 1;
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum[i] = cum[i - 1] + len(sub(raw[i], raw[i - 1]));
    totalLength = cum[cum.length - 1];
    sEntry = cum[marks[ENTRY_INDEX]];
    sExit = cum[marks[EXIT_INDEX]];
    let j = 0;
    for (let n = 0; n < SAMPLES; n++) {
      const target = totalLength * n / (SAMPLES - 1);
      while (j < cum.length - 2 && cum[j + 1] < target) j++;
      const t = (target - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      path.push(mix(raw[j], raw[j + 1], clamp(t)));
    }
  })();
  const pathAt = s => {
    const f = clamp(s / totalLength) * (SAMPLES - 1);
    const i = Math.min(SAMPLES - 2, Math.floor(f));
    return mix(path[i], path[i + 1], f - i);
  };
  const pathColour = s => (s < sEntry ? COL.blue : s > sExit ? COL.mint : COL.ice);

  // Stars and the open-internet lattice are seeded so the scene is identical on every visit.
  const rand = rng(20261108);
  const stars = Array.from({ length: 260 }, () => ({ p: [lerp(-70, 70, rand()), lerp(-45, 22, rand()), lerp(-95, 18, rand())], s: lerp(0.5, 1.5, rand()), a: lerp(0.35, 1, rand()) }));
  const net = Array.from({ length: 90 }, () => ({ p: [lerp(-36, 36, rand()), lerp(-23, -10, rand()), lerp(-64, -40, rand())], tw: rand() * TAU }));
  const edges = [];
  net.forEach((n, i) => {
    const near = net.map((m, j) => ({ j, d: len(sub(n.p, m.p)) })).filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
    near.forEach(o => { if (!edges.some(e => (e[0] === i && e[1] === o.j) || (e[0] === o.j && e[1] === i))) edges.push([i, o.j]); });
  });
  const pulses = Array.from({ length: 22 }, () => ({ e: Math.floor(rand() * edges.length), o: rand(), v: lerp(0.2, 0.5, rand()) }));
  const EXIT_POINT = [EXIT[0] + 0.4, EXIT[1] - 0.8, EXIT[2] - 2.6];
  const targets = net.map((n, i) => ({ i, d: len(sub(n.p, EXIT_POINT)) })).sort((a, b) => a.d - b.d).slice(0, 7).map(o => o.i);
  const siteLabels = ['WEBSITES', 'APPS', 'SERVICES'];

  // ---- camera ---------------------------------------------------------------------
  const NEAR = 0.35;
  const cam = { pos: [0, 0, 8], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1], focal: 700, cx: 0, cy: 0 };
  let W = 0, H = 0, dpr = 1, narrow = false;
  const free = [];   // per chapter: the rectangle the text leaves free for the scene

  function setBasis(pos, look) {
    cam.pos = pos;
    cam.f = norm(sub(look, pos));
    cam.r = norm(cross(cam.f, [0, 1, 0]));
    cam.u = cross(cam.r, cam.f);
  }
  const toCam = p => { const d = sub(p, cam.pos); return [dot(d, cam.r), dot(d, cam.u), dot(d, cam.f)]; };
  const proj = c => { const k = cam.focal / c[2]; return [cam.cx + c[0] * k, cam.cy - c[1] * k, k]; };
  const P = p => { const c = toCam(p); return c[2] < NEAR ? null : proj(c); };
  const offsetOf = p => { const c = toCam(p); if (c[2] < NEAR) return null; const k = cam.focal / c[2]; return [c[0] * k, -c[1] * k, k]; };

  // Fit one subject (gate or phone) so it fills the free rectangle at a sensible size.
  function fitNode(pos0, look, node, R, fr) {
    setBasis(pos0, look);
    const c = toCam(node);
    if (c[2] < NEAR) return null;
    const rPx = Math.min((fr.x1 - fr.x0) * 0.5, (fr.y1 - fr.y0) * 0.5) * 0.86;
    const wantK = Math.min(rPx, 320) / R;
    const f = clamp((cam.focal / c[2]) / wantK, 0.3, 4);
    const pos = add(node, mul(sub(pos0, node), f));
    setBasis(pos, look);
    const o = offsetOf(node);
    return o ? { pos, cx: (fr.x0 + fr.x1) / 2 - o[0], cy: (fr.y0 + fr.y1) / 2 + (narrow ? 8 : 26) - o[1] } : null;
  }
  // Fit both shields so they sit side by side inside the free rectangle.
  function fitTwo(pos0, look, a, b, fr) {
    setBasis(pos0, look);
    const pivot = mix(a, b, 0.5);
    const oa = offsetOf(a), ob = offsetOf(b);
    if (!oa || !ob) return null;
    const span = Math.max(30, Math.abs(ob[0] - oa[0]));
    const f = clamp(span / ((fr.x1 - fr.x0) * (narrow ? 0.62 : 0.6)), 0.3, 5);
    const pos = add(pivot, mul(sub(pos0, pivot), f));
    setBasis(pos, look);
    const pa = offsetOf(a), pb = offsetOf(b);
    if (!pa || !pb) return null;
    return { pos, cx: (fr.x0 + fr.x1) / 2 - (pa[0] + pb[0]) / 2, cy: lerp(fr.y0, fr.y1, narrow ? 0.62 : 0.6) - (pa[1] + pb[1]) / 2 };
  }

  function pose(p) {
    const pos0 = hermite(p, k => k.pos);
    const look = hermite(p, k => k.look);
    let i = 0;
    while (i < CENTERS.length - 2 && p > CENTERS[i + 1]) i++;
    const t = smooth(clamp((p - CENTERS[i]) / (CENTERS[i + 1] - CENTERS[i])));
    let sx = lerp(SHIFT_X[i], SHIFT_X[i + 1], t);
    let sy = lerp(SHIFT_Y[i], SHIFT_Y[i + 1], t);
    if (narrow) { sx = 0; sy = lerp(NARROW_Y[i], NARROW_Y[i + 1], t); }
    const cx0 = W / 2 + sx * W, cy0 = H / 2 + sy * H;
    const weights = [
      1 - smooth(clamp((p - 0.08) / 0.08)),
      0,
      smooth(clamp((p - 0.26) / 0.08)) * (1 - smooth(clamp((p - 0.42) / 0.08))),
      smooth(clamp((p - 0.42) / 0.08)) * (1 - smooth(clamp((p - 0.60) / 0.08))),
      smooth(clamp((p - 0.60) / 0.08)) * (1 - smooth(clamp((p - 0.80) / 0.07)))
    ];
    const total = weights.reduce((s, w) => s + w, 0);
    const scale = total > 1 ? 1 / total : 1;
    let pos = [0, 0, 0], cx = 0, cy = 0, used = 0;
    const fits = [
      () => fitNode(pos0, look, DEVICE, 1.9, free[0]), null,
      () => fitNode(pos0, look, ENTRY, 3.1, free[2]),
      () => fitTwo(pos0, look, ENTRY, EXIT, free[3]),
      () => fitNode(pos0, look, EXIT, 3.1, free[4])
    ];
    weights.forEach((w, n) => {
      if (w * scale < 0.002 || !fits[n] || !free[n]) return;
      const fit = fits[n]();
      if (!fit) return;
      const k = w * scale;
      pos = add(pos, mul(fit.pos, k)); cx += fit.cx * k; cy += fit.cy * k; used += k;
    });
    pos = add(pos, mul(pos0, 1 - used));
    cx += cx0 * (1 - used); cy += cy0 * (1 - used);
    setBasis(pos, look);
    cam.cx = cx; cam.cy = cy;
    return weights.map(w => w * scale);
  }

  // ---- drawing primitives -----------------------------------------------------------
  function seg(a, b) {
    let ca = toCam(a), cb = toCam(b);
    if (ca[2] < NEAR && cb[2] < NEAR) return null;
    if (ca[2] < NEAR) ca = mix(ca, cb, (NEAR - ca[2]) / (cb[2] - ca[2]));
    else if (cb[2] < NEAR) cb = mix(ca, cb, (NEAR - ca[2]) / (cb[2] - ca[2]));
    return [proj(ca), proj(cb)];
  }
  function line(a, b, colour, alpha, width = 1) {
    if (alpha <= 0.003) return;
    const s = seg(a, b);
    if (!s) return;
    ctx.strokeStyle = rgba(colour, alpha);
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); ctx.stroke();
  }
  function trace(points, close) {
    ctx.beginPath();
    let pen = false;
    const n = points.length;
    for (let i = 0; i < n + (close ? 1 : 0); i++) {
      const q = P(points[i % n]);
      if (!q) { pen = false; continue; }
      if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; }
    }
  }
  function polyline(points, colour, alpha, width = 1, close = false) {
    if (alpha <= 0.003) return;
    ctx.strokeStyle = rgba(colour, alpha);
    ctx.lineWidth = width;
    trace(points, close);
    ctx.stroke();
  }
  // Circle facing the stream (xy plane), rotated by rotY and tilted by tiltX.
  function ringPoints(centre, radius, steps, rotY, tiltX, from = 0, to = TAU) {
    const out = [];
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(tiltX), sx = Math.sin(tiltX);
    for (let i = 0; i <= steps; i++) {
      const a = from + (i / steps) * (to - from);
      let x = Math.cos(a) * radius, y = Math.sin(a) * radius, z = 0;
      const y2 = y * cx - z * sx, z2 = y * sx + z * cx; y = y2; z = z2;
      const x2 = x * cy + z * sy, z3 = -x * sy + z * cy; x = x2; z = z3;
      out.push([centre[0] + x, centre[1] + y, centre[2] + z]);
    }
    return out;
  }
  const ringClosed = (centre, radius, steps, rotY, tiltX) => ringPoints(centre, radius, steps, rotY, tiltX).slice(0, -1);
  // Circle lying flat on the ground (xz plane).
  const flatRing = (centre, radius, steps = 56) => Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * TAU;
    return [centre[0] + Math.cos(a) * radius, GROUND, centre[2] + Math.sin(a) * radius];
  });
  function glow(q, radius, colour, alpha) {
    if (radius < 0.5 || alpha <= 0.003) return;
    const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], radius);
    g.addColorStop(0, rgba(colour, alpha));
    g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(q[0], q[1], radius, 0, TAU); ctx.fill();
  }
  function roundedPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  }

  // ---- information cards (screen space) ---------------------------------------------
  function layoutCards(list, fr) {
    const fs = narrow ? 10 : 11;
    list.forEach(c => {
      ctx.font = `700 ${fs}px ${MONO}`;
      let w = ctx.measureText(c.title).width;
      ctx.font = `500 ${fs + 1}px ${SANS}`;
      c.lines.forEach(l => { w = Math.max(w, ctx.measureText(l.text).width + 14); });
      c.w = Math.ceil(w + 26);
      c.h = Math.ceil(27 + fs + c.lines.length * (fs + 7));
      c.fs = fs;
      c.x = clamp(c.ax - c.w / 2, fr.x0, Math.max(fr.x0, fr.x1 - c.w));
      c.y = Math.max(fr.y0 + 4, c.ay - c.h - (narrow ? 14 : 22));
    });
    if (list.length === 2) {
      const [a, b] = list[0].ax <= list[1].ax ? list : [list[1], list[0]];
      const gap = 10, over = a.x + a.w + gap - b.x;
      if (over > 0) {
        a.x = Math.max(fr.x0, a.x - over / 2);
        b.x = Math.min(Math.max(fr.x0, fr.x1 - b.w), b.x + over / 2);
        if (a.x + a.w + gap > b.x) b.y = Math.max(fr.y0 + 4, a.y - b.h - 10);
      }
    }
  }
  function drawCard(c, alpha) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    // leader line from the card down to the shield
    const lx = clamp(c.ax, c.x + 14, c.x + c.w - 14);
    ctx.strokeStyle = rgba(c.colour, 0.75); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx, c.y + c.h); ctx.lineTo(c.ax, c.ay); ctx.stroke();
    ctx.fillStyle = rgba(c.colour, 1);
    ctx.beginPath(); ctx.arc(c.ax, c.ay, 3, 0, TAU); ctx.fill();
    roundedPath(ctx, c.x, c.y, c.w, c.h, 10);
    ctx.fillStyle = 'rgba(5,13,26,0.9)'; ctx.fill();
    ctx.strokeStyle = rgba(c.colour, 0.65); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = rgba(c.colour, 1);
    ctx.fillRect(c.x + 1, c.y + 10, 3, c.h - 20);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${c.fs}px ${MONO}`;
    ctx.fillText(c.title, c.x + 14, c.y + 8 + c.fs + 4);
    c.lines.forEach((l, i) => {
      ctx.font = `${l.dim ? 400 : 600} ${c.fs + 1}px ${SANS}`;
      ctx.fillStyle = l.dim ? 'rgba(168,190,210,0.85)' : 'rgba(236,246,255,0.97)';
      ctx.fillText(l.text, c.x + 14, c.y + 8 + c.fs + 4 + 7 + (i + 1) * (c.fs + 7) - 2);
    });
    ctx.restore();
  }
  function drawBracket(a, b, y, alpha) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(205,234,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a, y - 7); ctx.lineTo(a, y); ctx.lineTo(b, y); ctx.lineTo(b, y - 7);
    ctx.stroke();
    const text = narrow ? 'ONE CONNECTION' : 'ONE SEAMLESS CONNECTION';
    ctx.font = `700 ${narrow ? 9 : 10}px ${MONO}`;
    const w = ctx.measureText(text).width + 22;
    const x = (a + b) / 2 - w / 2;
    roundedPath(ctx, x, y - 11, w, 22, 11);
    ctx.fillStyle = 'rgba(5,13,26,0.94)'; ctx.fill();
    ctx.strokeStyle = 'rgba(205,234,255,0.5)'; ctx.stroke();
    ctx.fillStyle = 'rgba(214,236,255,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, (a + b) / 2, y + 0.5);
    ctx.restore();
  }
  function label(text, at, colour, alpha) {
    const q = P(at);
    if (!q || alpha <= 0.02) return;
    ctx.font = `700 ${clamp(q[2] * 0.8, 9, 13)}px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(colour, alpha);
    ctx.fillText(text, q[0], q[1]);
  }

  // ---- scene pieces -----------------------------------------------------------------
  function backdrop(p) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(14,33,60,0)');
    g.addColorStop(1, rgba(COL.mint, 0.06 * smooth(clamp((p - 0.8) / 0.2))));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawStars() {
    for (const s of stars) {
      const c = toCam(s.p);
      if (c[2] < NEAR) continue;
      const q = proj(c);
      if (q[0] < -4 || q[0] > W + 4 || q[1] < -4 || q[1] > H + 4) continue;
      const a = clamp(1.1 - c[2] / 130) * s.a * 0.75;
      ctx.fillStyle = `rgba(190,224,255,${a})`;
      ctx.fillRect(q[0], q[1], s.s, s.s);
    }
  }
  function drawGrid(p) {
    const fadeOut = clamp((cam.pos[1] + 2) / 3) * (1 - smooth(clamp((p - 0.82) / 0.1)));
    if (fadeOut <= 0.01) return;
    const y = GROUND;
    for (let z = 8; z >= -60; z -= 4) {
      for (let x = -40; x < 40; x += 4) {
        const d = len(sub([x + 2, y, z], cam.pos));
        line([x, y, z], [x + 4, y, z], COL.blue, 0.2 * Math.pow(clamp(1 - d / 58), 1.5) * fadeOut);
      }
    }
    for (let x = -40; x <= 40; x += 4) {
      for (let z = 8; z > -60; z -= 4) {
        const d = len(sub([x, y, z - 2], cam.pos));
        line([x, y, z], [x, y, z - 4], COL.blue, 0.2 * Math.pow(clamp(1 - d / 58), 1.5) * fadeOut);
      }
    }
  }
  function drawFans(p, t) {
    const eAmt = fade(p, 0.47, 0.65, 0.05), xAmt = eAmt;
    const fan = (apex, corners, colour, amt) => {
      if (amt <= 0.01) return;
      const pts = corners.map(P);
      const a = P(apex);
      if (!a || pts.some(q => !q)) return;
      const mid = pts.reduce((m, q) => [m[0] + q[0] / pts.length, m[1] + q[1] / pts.length], [0, 0]);
      const g = ctx.createLinearGradient(a[0], a[1], mid[0], mid[1]);
      g.addColorStop(0, rgba(colour, 0.2 * amt));
      g.addColorStop(1, rgba(colour, 0.015 * amt));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      pts.forEach(q => ctx.lineTo(q[0], q[1]));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(colour, 0.34 * amt); ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = -t * 14;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(pts[0][0], pts[0][1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke();
      ctx.setLineDash([]);
    };
    fan(ENTRY, [add(ENTRY, [-4, 3, 7.5]), add(ENTRY, [4, 3, 7.5]), add(ENTRY, [4, -3, 7.5]), add(ENTRY, [-4, -3, 7.5])], COL.blue, eAmt);
    fan(EXIT, [add(EXIT, [-4, 3, -8]), add(EXIT, [4, 3, -8]), add(EXIT, [4, -3, -8]), add(EXIT, [-4, -3, -8])], COL.mint, xAmt);
  }
  function drawPathLine() {
    const cut = (from, to) => path.filter((_, i) => { const s = (i / (SAMPLES - 1)) * totalLength; return s >= from && s <= to; });
    ctx.setLineDash([2, 9]);
    polyline(cut(0, sEntry), COL.blue, 0.5, 1.4);
    polyline(cut(sEntry, sExit), COL.ice, 0.32, 1.4);
    polyline(cut(sExit, totalLength), COL.mint, 0.5, 1.4);
    ctx.setLineDash([]);
  }

  // A shield gate: segmented ring, glass lens, crystal core, orbiting satellites, ground pedestal.
  const OCT = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const OCT_FACES = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
  function drawShield(pos, colour, t, show, seed, entry) {
    const c = toCam(pos);
    if (c[2] < NEAR || show < 0.01) return;
    const q = proj(c);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + seed);
    const dir = seed ? -1 : 1;
    // pedestal on the ground and a light column up to the gate
    const gp = [pos[0], GROUND, pos[2]];
    const gq = P(gp);
    if (gq) {
      ctx.save();
      ctx.translate(gq[0], gq[1]); ctx.scale(1, 0.32);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 4.2 * gq[2]);
      g.addColorStop(0, rgba(colour, 0.34 * show)); g.addColorStop(1, rgba(colour, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 4.2 * gq[2], 0, TAU); ctx.fill();
      ctx.restore();
    }
    [1.4, 2.4, 3.4].forEach((r, i) => polyline(flatRing(pos, r), colour, (0.7 - i * 0.18) * show, i === 0 ? 1.6 : 1, true));
    const col = P([pos[0], GROUND, pos[2]]);
    if (col) {
      const g = ctx.createLinearGradient(col[0], col[1], q[0], q[1]);
      g.addColorStop(0, rgba(colour, 0.5 * show)); g.addColorStop(1, rgba(colour, 0));
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, 0.1 * q[2]);
      ctx.beginPath(); ctx.moveTo(col[0], col[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(q, 3.8 * q[2], colour, 0.26 * show);
    ctx.restore();
    // glass lens
    const lens = ringClosed(pos, 2.2, 56, 0, 0).map(P);
    if (lens.every(Boolean)) {
      const g = ctx.createRadialGradient(q[0] - 0.5 * q[2], q[1] - 0.7 * q[2], 0, q[0], q[1], 2.4 * q[2]);
      g.addColorStop(0, rgba(COL.white, 0.14 * show)); g.addColorStop(0.55, rgba(colour, 0.08 * show)); g.addColorStop(1, rgba(colour, 0.02 * show));
      ctx.beginPath(); lens.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
    }
    // outer ring with soft halo, thin inner rings
    polyline(ringClosed(pos, 2.6, 80, 0, 0), colour, 0.2 * show, 5, true);
    polyline(ringClosed(pos, 2.6, 80, 0, 0), colour, 0.95 * show, 1.6, true);
    polyline(ringClosed(pos, 2.2, 64, 0, 0), colour, 0.35 * show, 1, true);
    ctx.setLineDash([3, 8]); ctx.lineDashOffset = -t * 10 * dir;
    polyline(ringClosed(pos, 1.75, 56, 0, 0), COL.ice, 0.4 * show, 1, true);
    ctx.setLineDash([]);
    // three rotating arc segments and four data modules
    for (let i = 0; i < 3; i++) {
      const a0 = t * 0.35 * dir + (i * TAU) / 3;
      polyline(ringPoints(pos, 2.95, 18, 0, 0, a0, a0 + 0.9), colour, 0.9 * show, 2.6);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI / 4 - t * 0.12 * dir;
      line([pos[0] + Math.cos(a) * 2.45, pos[1] + Math.sin(a) * 2.45, pos[2]], [pos[0] + Math.cos(a) * 3.35, pos[1] + Math.sin(a) * 3.35, pos[2]], COL.ice, 0.85 * show, 3);
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU - t * 0.08 * dir;
      const r1 = i % 3 === 0 ? 2.5 : 2.42;
      line([pos[0] + Math.cos(a) * 2.28, pos[1] + Math.sin(a) * 2.28, pos[2]], [pos[0] + Math.cos(a) * r1, pos[1] + Math.sin(a) * r1, pos[2]], colour, 0.5 * show, 1);
    }
    // entry takes connections in (rings shrink toward the gate); exit sends them onward (rings expand away)
    for (let i = 0; i < 3; i++) {
      const age = (t * 0.28 + i / 3) % 1;
      const z = entry ? 3.6 * (1 - age) : -3.6 * age;
      const r = entry ? 3.4 - 1.5 * age : 1.8 + 1.5 * age;
      polyline(ringClosed([pos[0], pos[1], pos[2] + z], r, 56, 0, 0), colour, 0.35 * show * (entry ? age : 1 - age), 1, true);
    }
    // crystal core
    const rot = t * 0.8 * dir + seed;
    const V = OCT.map(v => {
      const x = v[0] * Math.cos(rot) + v[2] * Math.sin(rot), z = -v[0] * Math.sin(rot) + v[2] * Math.cos(rot);
      return [pos[0] + x * 0.85, pos[1] + v[1] * 1.15, pos[2] + z * 0.85];
    });
    const faces = OCT_FACES.map(f => ({ f, d: len(sub(mix(mix(V[f[0]], V[f[1]], 0.5), V[f[2]], 0.34), cam.pos)) })).sort((a, b) => b.d - a.d);
    faces.forEach(({ f }, i) => {
      const pts = f.map(k => P(V[k]));
      if (pts.some(v => !v)) return;
      ctx.beginPath(); pts.forEach((v, n) => (n ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
      ctx.fillStyle = rgba(mix(colour, COL.white, i / 14), (0.16 + (i / 8) * 0.22) * show); ctx.fill();
      ctx.strokeStyle = rgba(COL.white, 0.75 * show); ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(q, 1.3 * q[2] * (1.8 + pulse * 0.5), colour, 0.5 * show);
    ctx.restore();
    // tilted orbits with satellites
    [[1.3, 1.15, 0.5], [1.7, 0.55, -0.35]].forEach(([r, tilt, spd], n) => {
      polyline(ringClosed(pos, r, 56, t * spd + seed, tilt), colour, 0.4 * show, 1, true);
      for (let k = 0; k < 2; k++) {
        const a = t * (n ? -0.9 : 1.2) + k * Math.PI;
        const sp = ringPoints(pos, r, 1, t * spd + seed, tilt, a, a)[0];
        const sq = P(sp);
        if (sq) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          glow(sq, Math.max(3, 0.2 * sq[2]), COL.ice, 0.8 * show);
          ctx.restore();
          ctx.fillStyle = rgba(COL.white, 0.95 * show);
          ctx.beginPath(); ctx.arc(sq[0], sq[1], Math.max(1.4, 0.06 * sq[2]), 0, TAU); ctx.fill();
        }
      }
    });
  }

  // ---- the phone ----------------------------------------------------------------------
  const PH = { w: 1.38, h: 2.82, d: 0.17, r: 0.3, bezel: 0.06 };
  const outline = (hw, hh, r, seg = 8) => {
    const out = [];
    const corners = [[hw - r, hh - r, 0], [-hw + r, hh - r, 90], [-hw + r, -hh + r, 180], [hw - r, -hh + r, 270]];
    corners.forEach(([cx, cy, a0]) => {
      for (let i = 0; i <= seg; i++) {
        const a = ((a0 + (i / seg) * 90) * Math.PI) / 180;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    });
    return out;
  };
  const shell = outline(PH.w / 2, PH.h / 2, PH.r);
  const TW = 360, TH = 780;
  const tex = document.createElement('canvas');
  tex.width = TW; tex.height = TH;
  const tg = tex.getContext('2d');
  const logo = new Image();
  let logoReady = false;
  logo.onload = () => { logoReady = true; };
  logo.src = 'assets/tian-logo.png';

  function drawScreen(t) {
    const g = tg;
    g.clearRect(0, 0, TW, TH);
    const bg = g.createLinearGradient(0, 0, 0, TH);
    bg.addColorStop(0, '#0d2748'); bg.addColorStop(0.55, '#07162c'); bg.addColorStop(1, '#040b17');
    g.fillStyle = bg; g.fillRect(0, 0, TW, TH);
    const halo = g.createRadialGradient(180, 360, 10, 180, 360, 250);
    halo.addColorStop(0, 'rgba(70,150,230,0.42)'); halo.addColorStop(1, 'rgba(70,150,230,0)');
    g.fillStyle = halo; g.fillRect(0, 0, TW, TH);
    // status bar and dynamic island
    g.fillStyle = '#eaf4ff'; g.font = `600 17px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('9:41', 30, 34);
    g.fillStyle = '#000'; roundedPath(g, 125, 14, 110, 34, 17); g.fill();
    g.fillStyle = '#eaf4ff';
    for (let i = 0; i < 4; i++) g.fillRect(278 + i * 7, 40 - i * 4 - 4, 4, 4 + i * 4);
    roundedPath(g, 314, 28, 26, 13, 4); g.strokeStyle = 'rgba(234,244,255,0.8)'; g.lineWidth = 1.5; g.stroke();
    g.fillRect(317, 31, 17, 7);
    // brand
    if (logoReady) { const lh = 54, lw = (logo.width / logo.height) * lh; g.drawImage(logo, 36, 92, lw, lh); }
    g.fillStyle = '#eaf4ff'; g.font = `600 26px ${SANS}`; g.textAlign = 'left';
    g.fillText('TIAN', logoReady ? 36 + (logo.width / logo.height) * 54 + 12 : 36, 120);
    // connection orb
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    for (let i = 3; i >= 0; i--) {
      g.beginPath(); g.arc(180, 350, 62 + i * 24 + pulse * 4, 0, TAU);
      g.strokeStyle = `rgba(126,200,255,${0.14 + (3 - i) * 0.05})`; g.lineWidth = 1.5; g.stroke();
    }
    const orb = g.createRadialGradient(165, 335, 4, 180, 350, 66);
    orb.addColorStop(0, '#ffffff'); orb.addColorStop(0.3, '#9ad4ff'); orb.addColorStop(1, '#2468b8');
    g.beginPath(); g.arc(180, 350, 58, 0, TAU); g.fillStyle = orb; g.fill();
    g.beginPath();
    g.moveTo(180, 318); g.lineTo(207, 328); g.lineTo(207, 354); g.quadraticCurveTo(207, 376, 180, 386);
    g.quadraticCurveTo(153, 376, 153, 354); g.lineTo(153, 328); g.closePath();
    g.fillStyle = 'rgba(8,28,58,0.88)'; g.fill();
    g.strokeStyle = '#d8efff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#eaf4ff'; g.font = `600 22px ${SANS}`; g.textAlign = 'center';
    g.fillText('Connected', 180, 468);
    g.fillStyle = 'rgba(168,196,222,0.9)'; g.font = `500 14px ${SANS}`;
    g.fillText('Private network', 180, 494);
    // route chips
    const chip = (x, label, colour) => {
      roundedPath(g, x, 540, 124, 40, 20); g.fillStyle = 'rgba(14,34,62,0.95)'; g.fill();
      g.strokeStyle = 'rgba(126,200,255,0.4)'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.arc(x + 22, 560, 6, 0, TAU); g.fillStyle = colour; g.fill();
      g.fillStyle = '#d6ecff'; g.font = `700 13px ${MONO}`; g.textAlign = 'left'; g.fillText(label, x + 38, 561);
    };
    chip(40, 'ENTRY', '#7ec8ff'); chip(196, 'EXIT', '#64f4ac');
    g.strokeStyle = 'rgba(205,234,255,0.5)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(166, 560); g.lineTo(194, 560); g.stroke(); g.setLineDash([]);
    // bottom bar
    roundedPath(g, 40, 640, 280, 56, 28);
    const btn = g.createLinearGradient(40, 640, 320, 696);
    btn.addColorStop(0, '#c0e5ff'); btn.addColorStop(1, '#8fe3d4');
    g.fillStyle = btn; g.fill();
    g.fillStyle = '#0b1d32'; g.font = `700 17px ${SANS}`; g.textAlign = 'center'; g.fillText('Disconnect', 180, 669);
    roundedPath(g, 130, 746, 100, 5, 2.5); g.fillStyle = 'rgba(234,244,255,0.7)'; g.fill();
  }

  function drawDevice(t, show) {
    if (show < 0.01) return;
    const bob = Math.sin(t * 0.9) * 0.05;
    const ry = -0.34 + Math.sin(t * 0.55) * 0.06, rx = 0.05;
    const cyy = Math.cos(ry), syy = Math.sin(ry), cxx = Math.cos(rx), sxx = Math.sin(rx);
    const xf = (x, y, z) => {
      const y2 = y * cxx - z * sxx, z2 = y * sxx + z * cxx;
      const x2 = x * cyy + z2 * syy, z3 = -x * syy + z2 * cyy;
      return [DEVICE[0] + x2, DEVICE[1] + bob + y2, DEVICE[2] + z3];
    };
    const centre = xf(0, 0, 0);
    const cq = P(centre);
    if (!cq) return;
    const hd = PH.d / 2;
    const frontN = sub(xf(0, 0, 1), centre);
    const frontVisible = dot(frontN, sub(cam.pos, centre)) > 0;
    ctx.save();
    ctx.globalAlpha = show;
    // glow, floor shadow
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(cq, 3.4 * cq[2], COL.blue, 0.2); ctx.restore();
    const fq = P([centre[0], GROUND, centre[2]]);
    if (fq) {
      ctx.save(); ctx.translate(fq[0], fq[1]); ctx.scale(1, 0.28);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 2.3 * fq[2]);
      g.addColorStop(0, 'rgba(126,200,255,0.3)'); g.addColorStop(1, 'rgba(126,200,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 2.3 * fq[2], 0, TAU); ctx.fill(); ctx.restore();
    }
    // titanium side walls, shaded by a fixed light
    const L = norm([-0.5, 0.6, 0.7]);
    const walls = [];
    for (let i = 0; i < shell.length; i++) {
      const a = shell[i], b = shell[(i + 1) % shell.length];
      const p0 = xf(a[0], a[1], hd), p1 = xf(b[0], b[1], hd), p2 = xf(b[0], b[1], -hd), p3 = xf(a[0], a[1], -hd);
      let n = norm(cross(sub(p1, p0), sub(p3, p0)));
      const mid = mix(mix(p0, p1, 0.5), mix(p3, p2, 0.5), 0.5);
      if (dot(n, sub(mid, centre)) < 0) n = mul(n, -1);
      if (dot(n, sub(cam.pos, mid)) <= 0) continue;
      walls.push({ q: [p0, p1, p2, p3].map(P), n, d: len(sub(mid, cam.pos)) });
    }
    walls.sort((a, b) => b.d - a.d).forEach(w => {
      if (w.q.some(v => !v)) return;
      const b = clamp(dot(w.n, L) * 0.5 + 0.5);
      const c = mix([26, 38, 56], [190, 214, 238], Math.pow(b, 1.6));
      ctx.beginPath(); w.q.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
      ctx.fillStyle = rgba(c, 1); ctx.fill();
      ctx.strokeStyle = rgba(c, 1); ctx.lineWidth = 0.6; ctx.stroke();
    });
    // side buttons
    [[-PH.w / 2, 0.55, 0.78, -1], [-PH.w / 2, 0.2, 0.44, -1], [-PH.w / 2, -0.15, 0.18, -1], [PH.w / 2, 0.35, 0.82, 1]].forEach(([x, y0, y1, s]) => {
      const a = P(xf(x + s * 0.02, y0, 0)), b = P(xf(x + s * 0.02, y1 - 0.0, 0));
      if (a && b) { ctx.strokeStyle = 'rgba(150,176,204,0.95)'; ctx.lineWidth = Math.max(2, 0.05 * a[2]); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.lineCap = 'butt'; }
    });
    if (frontVisible) {
      const frame = shell.map(v => P(xf(v[0], v[1], hd)));
      if (frame.every(Boolean)) {
        ctx.beginPath(); frame.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
        const g = ctx.createLinearGradient(frame[0][0], frame[0][1], frame[Math.floor(frame.length / 2)][0], frame[Math.floor(frame.length / 2)][1]);
        g.addColorStop(0, '#c9dcef'); g.addColorStop(0.5, '#7b93ad'); g.addColorStop(1, '#3b4d63');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(235,246,255,0.95)'; ctx.lineWidth = 1.1; ctx.stroke();
      }
      // black glass bezel then the screen
      const inner = outline(PH.w / 2 - 0.035, PH.h / 2 - 0.035, PH.r - 0.035).map(v => P(xf(v[0], v[1], hd + 0.002)));
      if (inner.every(Boolean)) {
        ctx.beginPath(); inner.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
        ctx.fillStyle = '#02050a'; ctx.fill();
      }
      const sw = PH.w - PH.bezel * 2, sh = PH.h - PH.bezel * 2, z = hd + 0.004;
      const o = P(xf(-sw / 2, sh / 2, z)), ux = P(xf(sw / 2, sh / 2, z)), vy = P(xf(-sw / 2, -sh / 2, z));
      if (o && ux && vy && cq[2] * PH.h > 40) {
        drawScreen(t);
        ctx.save();
        ctx.setTransform(dpr * (ux[0] - o[0]) / TW, dpr * (ux[1] - o[1]) / TW, dpr * (vy[0] - o[0]) / TH, dpr * (vy[1] - o[1]) / TH, dpr * o[0], dpr * o[1]);
        roundedPath(ctx, 0, 0, TW, TH, 46); ctx.clip();
        ctx.drawImage(tex, 0, 0);
        // soft glass sheen
        const sheen = ctx.createLinearGradient(0, 0, TW, TH * 0.6);
        sheen.addColorStop(0, 'rgba(255,255,255,0.20)'); sheen.addColorStop(0.35, 'rgba(255,255,255,0.04)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen; ctx.fillRect(0, 0, TW, TH);
        ctx.restore();
      } else if (inner.every(Boolean)) {
        ctx.beginPath(); inner.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
        ctx.fillStyle = '#0c2a4e'; ctx.fill();
      }
    } else {
      // glass back with a camera plateau
      const back = shell.map(v => P(xf(v[0], v[1], -hd)));
      if (back.every(Boolean)) {
        ctx.beginPath(); back.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
        const g = ctx.createLinearGradient(back[0][0], back[0][1], back[Math.floor(back.length / 2)][0], back[Math.floor(back.length / 2)][1]);
        g.addColorStop(0, '#2a3b52'); g.addColorStop(1, '#0d1726');
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(205,234,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
        [[0.28, 1.0], [0.28, 0.62], [0.58, 0.82]].forEach(([x, y]) => {
          const lens = ringClosed([0, 0, 0], 0.12, 20, 0, 0).map(v => P(xf(-PH.w / 2 + x - 0.08 + v[0], y + v[1], -hd - 0.003)));
          if (lens.every(Boolean)) { ctx.beginPath(); lens.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath(); ctx.fillStyle = '#05080e'; ctx.fill(); ctx.strokeStyle = '#8aa5c2'; ctx.stroke(); }
        });
      }
    }
    ctx.restore();
  }
  function drawPulses(t, show) {
    // Rings leaving the device along the stream: the connection starting.
    for (let i = 0; i < 4; i++) {
      const age = ((t * 0.22 + i / 4) % 1);
      const pos = [DEVICE[0] - age * 0.4, DEVICE[1] + 0.2 + age * 0.1, -0.5 - age * 7];
      polyline(ringClosed(pos, 0.5 + age * 1.1, 40, 0, 0), COL.blue, (1 - age) * 0.5 * show, 1.4, true);
    }
  }
  function drawPackets(t) {
    const N = 40, speed = 3.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const s0 = (t * speed + (i * totalLength) / N) % totalLength;
      for (let j = 0; j < 6; j++) {
        const s = s0 - j * 0.24;
        if (s < 0) continue;
        const q = P(pathAt(s));
        if (!q) continue;
        const colour = pathColour(s);
        const a = (1 - j / 6) * 0.95;
        const r = clamp((j === 0 ? 0.085 : 0.06) * q[2], j === 0 ? 1.4 : 1, 5);
        if (j === 0) glow(q, r * 3.2, colour, 0.3);
        ctx.fillStyle = rgba(colour, a);
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawInternet(p, t) {
    const amt = smooth(clamp((p - 0.7) / 0.14));
    if (amt <= 0.01) return;
    const fadeD = (pt, a) => a * Math.pow(clamp(1 - len(sub(pt, cam.pos)) / 70), 1.2);
    edges.forEach(([i, j]) => line(net[i].p, net[j].p, COL.mint, fadeD(net[i].p, 0.22 * amt)));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    pulses.forEach(pl => {
      const e = edges[pl.e], f = (t * pl.v + pl.o) % 1;
      const q = P(mix(net[e[0]].p, net[e[1]].p, f));
      if (q) glow(q, Math.max(3, 0.28 * q[2]), COL.mint, 0.7 * amt);
    });
    net.forEach(n => {
      const q = P(n.p);
      if (!q) return;
      const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + n.tw);
      ctx.fillStyle = rgba(COL.mint, fadeD(n.p, 0.95 * amt) * tw);
      ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1, 0.13 * q[2]), 0, TAU); ctx.fill();
    });
    targets.forEach((idx, k) => {
      const end = net[idx].p;
      const ctrl = [lerp(EXIT_POINT[0], end[0], 0.35), EXIT_POINT[1] - 3, lerp(EXIT_POINT[2], end[2], 0.4)];
      const pts = [];
      for (let s = 0; s <= 16; s++) {
        const u = s / 16, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        pts.push([a * EXIT_POINT[0] + b * ctrl[0] + c * end[0], a * EXIT_POINT[1] + b * ctrl[1] + c * end[1], a * EXIT_POINT[2] + b * ctrl[2] + c * end[2]]);
      }
      polyline(pts, COL.mint, 0.28 * amt, 1);
      const f = (t * 0.28 + k / targets.length) % 1;
      const q = P(pts[Math.floor(f * 16)]);
      if (q) glow(q, Math.max(3, 0.3 * q[2]), COL.cyan, 0.85 * amt);
    });
    ctx.restore();
    targets.slice(0, 3).forEach((idx, k) => label(siteLabels[k], add(net[idx].p, [0, 1.6, 0]), COL.mint, 0.85 * amt));
  }

  // ---- frame ----------------------------------------------------------------------------
  function draw(p, t) {
    ctx.clearRect(0, 0, W, H);
    const w = pose(p);
    backdrop(p);
    drawStars();
    drawGrid(p);
    drawInternet(p, t);
    drawFans(p, t);
    drawPathLine();
    const showEntry = smooth(clamp((p - 0.1) / 0.14));
    const showExit = smooth(clamp((p - 0.28) / 0.2));
    drawPulses(t, 1 - smooth(clamp((p - 0.14) / 0.1)));
    drawPackets(t);
    [
      { d: len(sub(EXIT, cam.pos)), run: () => drawShield(EXIT, COL.mint, t, showExit, 2, false) },
      { d: len(sub(ENTRY, cam.pos)), run: () => drawShield(ENTRY, COL.blue, t, showEntry, 0, true) },
      { d: len(sub(DEVICE, cam.pos)), run: () => drawDevice(t, 1) }
    ].sort((a, b) => b.d - a.d).forEach(i => i.run());

    // information cards, placed in the free area and anchored to each shield
    const eAlpha = Math.max(fade(p, 0.3, 0.47, 0.05), fade(p, 0.47, 0.65, 0.05));
    const xAlpha = Math.max(fade(p, 0.47, 0.65, 0.05), fade(p, 0.65, 0.83, 0.05));
    const eq = P(ENTRY), xq = P(EXIT);
    const cards = [];
    if (eq && eAlpha > 0.02 && free[3]) {
      cards.push({ key: 'e', ax: eq[0], ay: eq[1] - 3.15 * eq[2], title: 'ENTRY SHIELD', colour: COL.blue, alpha: eAlpha,
        lines: [{ text: 'Sees your IP' }, { text: 'Not where you go', dim: true }] });
    }
    if (xq && xAlpha > 0.02 && free[3]) {
      cards.push({ key: 'x', ax: xq[0], ay: xq[1] - 3.15 * xq[2], title: 'EXIT SHIELD', colour: COL.mint, alpha: xAlpha,
        lines: [{ text: 'Sees where you go' }, { text: 'Not your IP', dim: true }] });
    }
    if (cards.length) {
      const fr = p < 0.47 ? free[2] : p < 0.65 ? free[3] : free[4];
      layoutCards(cards, fr || free[3]);
      cards.forEach(c => drawCard(c, c.alpha));
      if (w[3] > 0.05 && eq && xq) drawBracket(eq[0], xq[0], Math.max(eq[1], xq[1]) + 3.4 * Math.max(eq[2], xq[2]) + 24, w[3]);
    }
    const dq = P([DEVICE[0], DEVICE[1] - 2.15, DEVICE[2]]);
    if (dq) {
      const a = 1 - smooth(clamp((p - 0.08) / 0.1));
      if (a > 0.02) label('YOUR DEVICE', [DEVICE[0], DEVICE[1] - 2.0, DEVICE[2]], COL.ice, 0.9 * a);
    }
  }

  // ---- layout, scroll and loop ------------------------------------------------------
  function measure() {
    const bar = header ? header.querySelector('.header-inner') : null;
    document.documentElement.style.setProperty('--header-h', ((bar ? bar.offsetHeight : 96) + 1) + 'px');
    const rect = stage.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    narrow = W < 700;
    cam.focal = Math.min(W, H * 1.15) * 0.95;
    // The part of the stage each chapter's text leaves free for the scene.
    chapters.forEach((el, i) => {
      const l = el.offsetLeft, tp = el.offsetTop, w = el.offsetWidth;
      let r;
      if (narrow) r = { x0: 12, x1: W - 40, y0: 12, y1: Math.max(120, tp - 14) };
      else if (l + w / 2 < W / 2) r = { x0: l + w + 36, x1: W - 80, y0: 24, y1: H - 64 };
      else r = { x0: 28, x1: l - 36, y0: 24, y1: H - 64 };
      if (r.x1 - r.x0 < 160) { r.x0 = Math.min(r.x0, W * 0.35); r.x1 = Math.max(r.x1, r.x0 + 160); }
      free[i] = r;
    });
  }
  function readProgress() {
    const rect = root.getBoundingClientRect();
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 97;
    const span = Math.max(1, root.offsetHeight - stage.offsetHeight);
    return clamp((barH - rect.top) / span);
  }
  const chapterOf = p => { let i = 0; while (i < RANGES.length && p >= RANGES[i]) i++; return i; };
  let activeChapter = -1;
  function updateUi(p) {
    const idx = chapterOf(p);
    if (idx !== activeChapter) {
      activeChapter = idx;
      root.dataset.chapter = String(idx);
      chapters.forEach((el, n) => el.classList.toggle('is-active', n === idx));
      dots.forEach((el, n) => { if (n === idx) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
    }
    root.style.setProperty('--story-progress', p.toFixed(4));
  }
  function scrollForProgress(p) {
    const rect = root.getBoundingClientRect();
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 97;
    const span = root.offsetHeight - stage.offsetHeight;
    return window.scrollY + rect.top - barH + p * span;
  }
  // Own eased scroll so chapter jumps and the magnet feel the same in every browser.
  let anim = 0, animCancel = false;
  const stopAnim = () => { animCancel = true; if (anim) cancelAnimationFrame(anim); anim = 0; };
  function scrollToY(y) {
    stopAnim();
    const y0 = window.scrollY, d = y - y0;
    if (Math.abs(d) < 2) return;
    const dur = clamp(380 + Math.abs(d) * 0.3, 420, 1100), t0 = performance.now();
    animCancel = false;
    const step = now => {
      if (animCancel) { anim = 0; return; }
      const k = clamp((now - t0) / dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      window.scrollTo({ top: y0 + d * e, left: 0, behavior: 'instant' });
      anim = k < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  }
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(type => window.addEventListener(type, () => { if (anim) stopAnim(); }, { passive: true }));
  const goTo = index => scrollToY(scrollForProgress(CENTERS[index]));
  dots.forEach((el, n) => el.addEventListener('click', () => goTo(n)));
  root.querySelectorAll('[data-story-next]').forEach(el => el.addEventListener('click', event => {
    event.preventDefault(); goTo(Math.min(CENTERS.length - 1, Math.max(1, activeChapter + 1)));
  }));

  // Camera follows the scroll with a critically damped spring: quick to respond, no wobble.
  const vel = { v: 0 };
  function smoothDamp(current, target, smoothTime, dt) {
    const omega = 2 / smoothTime, x = omega * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (vel.v + omega * change) * dt;
    vel.v = (vel.v - omega * temp) * e;
    let out = target + (change + temp) * e;
    if ((target - current > 0) === (out > target)) { out = target; vel.v = 0; }
    return out;
  }
  let cur = readProgress(), time = 0, last = performance.now(), raf = 0, onScreen = true;
  const isPaused = () => body.classList.contains('motion-paused');
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (!isPaused()) time += dt;
    const target = readProgress();
    cur = smoothDamp(cur, target, 0.11, dt);
    if (Math.abs(target - cur) < 0.00006 && Math.abs(vel.v) < 0.0005) { cur = target; vel.v = 0; }
    draw(cur, time);
    updateUi(cur);
    const moving = cur !== target;
    if (onScreen && !document.hidden && (!isPaused() || moving)) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  // Gentle magnet: when scrolling stops close to a chapter, ease onto it.
  let touching = false, snapTimer = 0, snapping = false;
  const snapCheck = () => {
    if (touching || snapping) return;
    const p = readProgress();
    if (p < 0.012 || p > 0.985) return;
    let best = 0;
    CENTERS.forEach((c, i) => { if (Math.abs(c - p) < Math.abs(CENTERS[best] - p)) best = i; });
    const d = Math.abs(CENTERS[best] - p);
    if (d > 0.004 && d < 0.035) {
      snapping = true;
      goTo(best);
      setTimeout(() => { snapping = false; }, 600);
    }
  };
  const armSnap = () => { clearTimeout(snapTimer); snapTimer = setTimeout(snapCheck, 240); };
  window.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  window.addEventListener('touchend', () => { touching = false; armSnap(); }, { passive: true });
  window.addEventListener('touchcancel', () => { touching = false; armSnap(); }, { passive: true });

  measure();
  window.addEventListener('scroll', () => { kick(); armSnap(); }, { passive: true });
  window.addEventListener('resize', () => { measure(); kick(); });
  window.addEventListener('load', () => { measure(); kick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); kick(); });
  document.addEventListener('visibilitychange', kick);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; if (onScreen) kick(); }, { rootMargin: '120px' }).observe(root);
  }
  new MutationObserver(kick).observe(body, { attributes: true, attributeFilter: ['class'] });
  const reducedChanged = () => {
    if (reduced.matches) { body.classList.remove('story-live'); body.classList.add('story-static'); if (raf) cancelAnimationFrame(raf); raf = 0; }
  };
  if (reduced.addEventListener) reduced.addEventListener('change', reducedChanged);
  else if (reduced.addListener) reduced.addListener(reducedChanged);
  kick();
})();
