/* TIAN homepage: scroll-driven architecture story.
   Dependency-free canvas 2D with a small perspective projection. Scroll position is the
   only input; the camera flies Device -> Entry -> Exit -> open internet. The scene shows
   information roles (what each shield can see), not packet-by-packet routing. */
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
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const COL = { blue: [126, 200, 255], mint: [100, 244, 172], ice: [205, 234, 255], cyan: [92, 225, 230] };

  // ---- vector helpers -------------------------------------------------------------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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
  const CONTROL = [
    [0.2, 0.9, -0.7], [0, 1.7, -2.6], [-0.6, 1.2, -7], [-1.6, 0.3, -12], ENTRY, [0.4, 0, -25], EXIT,
    [4.4, -3.4, -40], [2.2, -9, -46], [0, -13.5, -50]
  ];
  const ENTRY_INDEX = 4;
  const EXIT_INDEX = 6;

  // Camera keyframes. Positions and look targets are blended with a non-uniform cardinal spline so
  // the camera keeps moving between chapters while dwelling near each chapter's subject.
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
  // Horizontal lens shift per chapter so the subject sits opposite the text.
  const CENTERS = [0.04, 0.22, 0.385, 0.56, 0.74, 0.92];
  const SHIFT_X = [0.2, -0.2, 0.17, -0.25, 0.2, 0];
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
  let W = 0, H = 0, dpr = 1, narrow = false, tagAmt = 1;

  function pose(p) {
    cam.pos = hermite(p, k => k.pos);
    const look = hermite(p, k => k.look);
    // Narrow screens pull the wide two-points shot back so both shields fit beside the text.
    const dolly = lerp(1, narrow ? 1.2 : clamp(1300 / W, 1, 2.2), fade(p, 0.46, 0.66, 0.06));
    cam.pos = add(look, [(cam.pos[0] - look[0]) * dolly, (cam.pos[1] - look[1]) * dolly, (cam.pos[2] - look[2]) * dolly]);
    cam.f = norm(sub(look, cam.pos));
    cam.r = norm(cross(cam.f, [0, 1, 0]));
    cam.u = cross(cam.r, cam.f);
    let sx = 0, sy = 0;
    let i = 0;
    while (i < CENTERS.length - 2 && p > CENTERS[i + 1]) i++;
    const t = smooth(clamp((p - CENTERS[i]) / (CENTERS[i + 1] - CENTERS[i])));
    sx = lerp(SHIFT_X[i], SHIFT_X[i + 1], t);
    sy = lerp(SHIFT_Y[i], SHIFT_Y[i + 1], t);
    if (narrow) { sx = 0; sy = lerp(NARROW_Y[i], NARROW_Y[i + 1], t); }
    cam.cx = W / 2 + sx * W;
    cam.cy = H / 2 + sy * H;
  }
  const toCam = p => { const d = sub(p, cam.pos); return [dot(d, cam.r), dot(d, cam.u), dot(d, cam.f)]; };
  const proj = c => { const k = cam.focal / c[2]; return [cam.cx + c[0] * k, cam.cy - c[1] * k, k]; };
  const P = p => { const c = toCam(p); return c[2] < NEAR ? null : proj(c); };

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
  function polyline(points, colour, alpha, width = 1, close = false) {
    if (alpha <= 0.003) return;
    ctx.strokeStyle = rgba(colour, alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    let pen = false;
    const n = points.length;
    for (let i = 0; i < n + (close ? 1 : 0); i++) {
      const q = P(points[i % n]);
      if (!q) { pen = false; continue; }
      if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; }
    }
    ctx.stroke();
  }
  function ringPoints(centre, radius, steps, rotY, tiltX) {
    const out = [];
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(tiltX), sx = Math.sin(tiltX);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      let x = Math.cos(a) * radius, y = Math.sin(a) * radius, z = 0;
      const y2 = y * cx - z * sx, z2 = y * sx + z * cx; y = y2; z = z2;
      const x2 = x * cy + z * sy, z3 = -x * sy + z * cy; x = x2; z = z3;
      out.push([centre[0] + x, centre[1] + y, centre[2] + z]);
    }
    return out;
  }
  function glow(q, radius, colour, alpha) {
    if (radius < 0.5 || alpha <= 0.003) return;
    const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], radius);
    g.addColorStop(0, rgba(colour, alpha));
    g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(q[0], q[1], radius, 0, TAU); ctx.fill();
  }
  function label(text, at, colour, alpha, size = 11) {
    const q = P(at);
    if (!q || alpha <= 0.02) return;
    const px = clamp(q[2] * size * 0.075, 9, 14);
    ctx.font = `600 ${px}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(colour, alpha);
    ctx.fillText(text, q[0], q[1]);
  }

  // ---- scene pieces -----------------------------------------------------------------
  function backdrop(p) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const deep = smooth(clamp((p - 0.8) / 0.2));
    g.addColorStop(0, `rgba(${Math.round(lerp(14, 6, deep))},${Math.round(lerp(33, 22, deep))},${Math.round(lerp(60, 36, deep))},0.0)`);
    g.addColorStop(1, rgba(COL.mint, 0.06 * deep));
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
    const y = -3.2;
    for (let z = 8; z >= -60; z -= 4) {
      for (let x = -40; x < 40; x += 4) {
        const mid = [x + 2, y, z];
        const d = len(sub(mid, cam.pos));
        const a = 0.2 * Math.pow(clamp(1 - d / 58), 1.5) * fadeOut;
        line([x, y, z], [x + 4, y, z], COL.blue, a);
      }
    }
    for (let x = -40; x <= 40; x += 4) {
      for (let z = 8; z > -60; z -= 4) {
        const mid = [x, y, z - 2];
        const d = len(sub(mid, cam.pos));
        const a = 0.2 * Math.pow(clamp(1 - d / 58), 1.5) * fadeOut;
        line([x, y, z], [x, y, z - 4], COL.blue, a);
      }
    }
  }
  function drawFans(p, t) {
    const eAmt = Math.max(fade(p, 0.3, 0.47, 0.05), fade(p, 0.47, 0.65, 0.05));
    const xAmt = Math.max(fade(p, 0.47, 0.65, 0.05), fade(p, 0.65, 0.83, 0.05));
    const fan = (apex, corners, colour, amt) => {
      if (amt <= 0.01) return;
      const pts = corners.map(P);
      const a = P(apex);
      if (!a || pts.some(q => !q)) return;
      const mid = pts.reduce((m, q) => [m[0] + q[0] / pts.length, m[1] + q[1] / pts.length], [0, 0]);
      const g = ctx.createLinearGradient(a[0], a[1], mid[0], mid[1]);
      g.addColorStop(0, rgba(colour, 0.2 * amt));
      g.addColorStop(1, rgba(colour, 0.02 * amt));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      pts.forEach(q => ctx.lineTo(q[0], q[1]));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(colour, 0.34 * amt); ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = -t * 14;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(pts[0][0], pts[0][1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke();
      ctx.setLineDash([]);
    };
    fan(ENTRY, [add(ENTRY, [-5.5, 3.4, 10]), add(ENTRY, [5.5, 3.4, 10]), add(ENTRY, [5.5, -3.4, 10]), add(ENTRY, [-5.5, -3.4, 10])], COL.blue, eAmt);
    fan(EXIT, [add(EXIT, [-6, 3.6, -11]), add(EXIT, [6, 3.6, -11]), add(EXIT, [6, -3.6, -11]), add(EXIT, [-6, -3.6, -11])], COL.mint, xAmt);
    label('ENTRY SEES YOUR IP', add(ENTRY, [0, 3.8, 0]), COL.blue, fade(p, 0.47, 0.65, 0.05) * 0.9);
    label('EXIT SEES THE DESTINATION', add(EXIT, [0, 3.8, 0]), COL.mint, fade(p, 0.47, 0.65, 0.05) * 0.9);
  }
  function drawPathLine(p) {
    const cut = (from, to) => path.filter((_, i) => { const s = (i / (SAMPLES - 1)) * totalLength; return s >= from && s <= to; });
    ctx.setLineDash([2, 9]);
    polyline(cut(0, sEntry), COL.blue, 0.5, 1.4);
    polyline(cut(sEntry, sExit), COL.ice, 0.32, 1.4);
    polyline(cut(sExit, totalLength), COL.mint, 0.5, 1.4);
    ctx.setLineDash([]);
  }
  function drawNode(pos, colour, tag, t, show, seed) {
    const c = toCam(pos);
    if (c[2] < NEAR || show < 0.01) return;
    const q = proj(c);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + seed);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(q, 3.8 * q[2], colour, 0.28 * show);
    ctx.restore();
    // gate rings facing the stream
    const outer = ringPoints(pos, 2.6, 72, 0, 0);
    polyline(outer, colour, 0.85 * show, 1.6, true);
    polyline(ringPoints(pos, 2.2, 64, 0, 0), colour, 0.35 * show, 1, true);
    ctx.setLineDash([3, 8]); ctx.lineDashOffset = -t * 10;
    polyline(ringPoints(pos, 1.7, 56, 0, 0), COL.ice, 0.4 * show, 1, true);
    ctx.setLineDash([]);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + t * 0.12 * (seed ? -1 : 1);
      const r0 = 2.6, r1 = i % 3 === 0 ? 3.05 : 2.85;
      line([pos[0] + Math.cos(a) * r0, pos[1] + Math.sin(a) * r0, pos[2]], [pos[0] + Math.cos(a) * r1, pos[1] + Math.sin(a) * r1, pos[2]], colour, 0.6 * show, 1);
    }
    // tilted orbits
    polyline(ringPoints(pos, 1.25, 56, t * 0.5 + seed, 1.15), colour, 0.55 * show, 1.2, true);
    polyline(ringPoints(pos, 1.6, 64, -t * 0.35 + seed, 0.55), colour, 0.35 * show, 1, true);
    // core
    const r = 0.6 * q[2];
    const g = ctx.createRadialGradient(q[0] - r * 0.3, q[1] - r * 0.3, r * 0.1, q[0], q[1], r);
    g.addColorStop(0, rgba([255, 255, 255], 0.95 * show));
    g.addColorStop(0.35, rgba(colour, 0.9 * show));
    g.addColorStop(1, rgba(colour, 0.12 * show));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(q, r * (2.2 + pulse * 0.6), colour, 0.35 * show);
    ctx.restore();
    label(tag, add(pos, [0, 3.7, 0]), colour, 0.95 * show * tagAmt * clamp((c[2] - 2) / 4));
  }
  function drawDevice(t, show) {
    if (show < 0.01) return;
    const ry = -0.32 + Math.sin(t * 0.6) * 0.07, rx = 0.06;
    const hx = 0.66, hy = 1.32, hz = 0.07;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const xf = v => {
      let [x, y, z] = v;
      const y2 = y * cx - z * sx, z2 = y * sx + z * cx; y = y2; z = z2;
      const x2 = x * cy + z * sy, z3 = -x * sy + z * cy;
      return [DEVICE[0] + x2, DEVICE[1] + y, DEVICE[2] + z3];
    };
    const V = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]].map(xf);
    const faces = [[4, 5, 6, 7, 'front'], [1, 0, 3, 2, 'back'], [0, 4, 7, 3, 'side'], [5, 1, 2, 6, 'side'], [3, 7, 6, 2, 'side'], [0, 1, 5, 4, 'side']];
    const centre = xf([0, 0, 0]);
    ctx.save();
    ctx.globalAlpha = show;
    const cq = P(centre);
    if (cq) { ctx.globalCompositeOperation = 'lighter'; glow(cq, 2.6 * cq[2], COL.blue, 0.22); ctx.globalCompositeOperation = 'source-over'; }
    for (const f of faces) {
      const pts = f.slice(0, 4).map(i => V[i]);
      const mid = pts.reduce((m, q) => add(m, [q[0] / 4, q[1] / 4, q[2] / 4]), [0, 0, 0]);
      const n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
      if (dot(n, sub(cam.pos, mid)) <= 0) continue;
      const q = pts.map(P);
      if (q.some(v => !v)) continue;
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(v => ctx.lineTo(v[0], v[1])); ctx.closePath();
      ctx.fillStyle = f[4] === 'front' ? 'rgba(8,19,36,0.97)' : 'rgba(13,30,52,0.97)';
      ctx.fill();
      ctx.strokeStyle = rgba(COL.ice, 0.85); ctx.lineWidth = 1.4; ctx.stroke();
      if (f[4] === 'front') {
        const inset = (a, b, u, v) => mix(mix(a, b, u), mix(pts[3], pts[2], u), v);
        const s0 = inset(pts[0], pts[1], 0.08, 0.05), s1 = inset(pts[0], pts[1], 0.92, 0.05), s2 = inset(pts[0], pts[1], 0.92, 0.95), s3 = inset(pts[0], pts[1], 0.08, 0.95);
        const sq = [s0, s1, s2, s3].map(P);
        if (sq.every(v => v)) {
          const g = ctx.createLinearGradient(sq[0][0], sq[0][1], sq[2][0], sq[2][1]);
          g.addColorStop(0, 'rgba(46,118,196,0.78)'); g.addColorStop(0.55, 'rgba(14,44,84,0.95)'); g.addColorStop(1, 'rgba(8,24,48,0.98)');
          ctx.beginPath(); ctx.moveTo(sq[0][0], sq[0][1]); sq.slice(1).forEach(v => ctx.lineTo(v[0], v[1])); ctx.closePath();
          ctx.fillStyle = g; ctx.fill();
          const sc = mix(mix(s0, s2, 0.5), [0, 0, 0], 0);
          const ring = ringPoints(add(sc, mix([0, 0, 0], sub(n, [0, 0, 0]), 0.02)), 0.38, 48, ry, rx);
          polyline(ring, COL.ice, 0.95, 2, true);
          polyline(ringPoints(add(sc, [0, 0, 0]), 0.2, 40, ry, rx), COL.blue, 0.8, 1.4, true);
        }
      }
    }
    ctx.restore();
    label('YOUR DEVICE', add(DEVICE, [0, -2.0, 0]), COL.ice, 0.9 * show);
  }
  function drawPulses(t, show) {
    // Rings leaving the device along the stream: the connection starting.
    for (let i = 0; i < 4; i++) {
      const age = ((t * 0.22 + i / 4) % 1);
      const pos = [DEVICE[0] - age * 0.4, DEVICE[1] + 0.2 + age * 0.1, -0.5 - age * 7];
      polyline(ringPoints(pos, 0.5 + age * 1.1, 40, 0, 0), COL.blue, (1 - age) * 0.5 * show, 1.4, true);
    }
  }
  function drawPackets(t, p) {
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
      if (q) { glow(q, Math.max(3, 0.28 * q[2]), COL.mint, 0.7 * amt); }
    });
    net.forEach(n => {
      const q = P(n.p);
      if (!q) return;
      const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + n.tw);
      ctx.fillStyle = rgba(COL.mint, fadeD(n.p, 0.95 * amt) * tw);
      ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1, 0.13 * q[2]), 0, TAU); ctx.fill();
    });
    // The Destination Shield fanning out to the open internet.
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

  function draw(p, t) {
    ctx.clearRect(0, 0, W, H);
    pose(p);
    tagAmt = 1 - fade(p, 0.47, 0.65, 0.05);
    backdrop(p);
    drawStars();
    drawGrid(p);
    drawInternet(p, t);
    drawFans(p, t);
    drawPathLine(p);
    const show = {
      device: 1 - smooth(clamp((p - 0.26) / 0.1)) * 0.0,
      entry: smooth(clamp((p - 0.1) / 0.14)) * (1 - 0.0),
      exit: smooth(clamp((p - 0.28) / 0.2))
    };
    const items = [
      { d: len(sub(EXIT, cam.pos)), run: () => drawNode(EXIT, COL.mint, 'EXIT · DESTINATION', t, show.exit, 2) },
      { d: len(sub(ENTRY, cam.pos)), run: () => drawNode(ENTRY, COL.blue, 'ENTRY · IDENTITY', t, show.entry, 0) },
      { d: len(sub(DEVICE, cam.pos)), run: () => drawDevice(t, show.device) }
    ].sort((a, b) => b.d - a.d);
    drawPulses(t, 1 - smooth(clamp((p - 0.14) / 0.1)));
    drawPackets(t, p);
    items.forEach(i => i.run());
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
  function goTo(index) {
    const rect = root.getBoundingClientRect();
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 97;
    const span = root.offsetHeight - stage.offsetHeight;
    const y = window.scrollY + rect.top - barH + CENTERS[index] * span;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
  dots.forEach((el, n) => el.addEventListener('click', () => goTo(n)));
  root.querySelectorAll('[data-story-next]').forEach(el => el.addEventListener('click', event => {
    event.preventDefault(); goTo(Math.min(CENTERS.length - 1, Math.max(1, activeChapter + 1)));
  }));

  let cur = readProgress(), time = 0, last = performance.now(), raf = 0, onScreen = true;
  const isPaused = () => body.classList.contains('motion-paused');
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!isPaused()) time += dt;
    const target = readProgress();
    cur += (target - cur) * (1 - Math.exp(-dt * 7));
    if (Math.abs(target - cur) < 0.00008) cur = target;
    draw(cur, time);
    updateUi(cur);
    const moving = cur !== target;
    if (onScreen && !document.hidden && (!isPaused() || moving)) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  measure();
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', () => { measure(); kick(); });
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
