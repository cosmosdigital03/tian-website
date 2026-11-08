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
    { p: 0.93, pos: [3, -2, -21], look: [0, -16, -53] },
    { p: 1.00, pos: [-2, -3, -19], look: [0, -16.5, -53] }
  ];
  const CENTERS = [0.04, 0.22, 0.385, 0.56, 0.74, 0.92];
  const SHIFT_X = [0.2, -0.2, 0.17, -0.2, 0.2, -0.16];
  const SHIFT_Y = [0, 0, 0, 0, 0, 0.06];
  const NARROW_Y = [-0.26, -0.15, -0.15, -0.15, -0.15, -0.2];
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
  // Open internet: a clustered network of nodes joined by curved links. Signals fire along the links
  // and light each node they reach, cascading onward like activity in a brain.
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand());
  const NET_CENTER = [0, -16.5, -53];
  const clusterCentres = Array.from({ length: 11 }, () => [NET_CENTER[0] + gauss() * 11, NET_CENTER[1] + gauss() * 3.2, NET_CENTER[2] + gauss() * 4.5]);
  const NET_COLOURS = [COL.blue, COL.cyan, COL.mint];
  const net = Array.from({ length: 230 }, (_, i) => {
    const c = i % clusterCentres.length, cc = clusterCentres[c];
    return { p: [cc[0] + gauss() * 3.6, cc[1] + gauss() * 2.4, cc[2] + gauss() * 3.4], tw: rand() * TAU, c, colour: NET_COLOURS[c % 3], deg: 0 };
  });
  const edges = [];
  const edgeKey = new Set();
  const addEdge = (i, j) => {
    const key = i < j ? i * 1000 + j : j * 1000 + i;
    if (i === j || edgeKey.has(key)) return;
    edgeKey.add(key);
    const a = net[i].p, b = net[j].p, m = mix(a, b, 0.5), d = sub(b, a), l = len(d) || 1;
    const side = norm(cross(d, [0, 1, 0]));
    const bend = mul(side, (rand() - 0.5) * l * 0.3);
    edges.push({ a: i, b: j, ctrl: [m[0] + bend[0], m[1] + bend[1] + (rand() - 0.5) * l * 0.18, m[2] + bend[2]], len: l });
    net[i].deg++; net[j].deg++;
  };
  net.forEach((n, i) => {
    net.map((m, j) => ({ j, d: len(sub(n.p, m.p)) })).filter(o => o.j !== i).sort((x, y) => x.d - y.d).slice(0, 3).forEach(o => addEdge(i, o.j));
  });
  for (let k = 0; k < 26; k++) {
    const i = Math.floor(rand() * net.length);
    const near = net.map((m, j) => ({ j, d: len(sub(net[i].p, m.p)) })).filter(o => o.j !== i && o.d > 8 && o.d < 16);
    if (near.length) addEdge(i, near[Math.floor(rand() * near.length)].j);
  }
  const adj = net.map(() => []);
  edges.forEach((e, k) => { adj[e.a].push(k); adj[e.b].push(k); });
  const edgeAt = (e, u) => {
    const a = net[e.a].p, b = net[e.b].p, q = 1 - u;
    return [q * q * a[0] + 2 * q * u * e.ctrl[0] + u * u * b[0], q * q * a[1] + 2 * q * u * e.ctrl[1] + u * u * b[1], q * q * a[2] + 2 * q * u * e.ctrl[2] + u * u * b[2]];
  };
  const EXIT_POINT = [EXIT[0] + 0.4, EXIT[1] - 0.8, EXIT[2] - 2.6];
  const targets = net.map((n, i) => ({ i, d: len(sub(n.p, EXIT_POINT)) })).sort((a, b) => a.d - b.d).slice(0, 7).map(o => o.i);
  const hubs = [];
  net.map((n, i) => i).sort((a, b) => net[b].deg - net[a].deg).forEach(i => { if (hubs.length < 3 && hubs.every(h => len(sub(net[h].p, net[i].p)) > 12)) hubs.push(i); });
  const siteLabels = ['WEBSITES', 'APPS', 'SERVICES'];
  const act = new Float32Array(net.length);
  const signals = [];
  const simRand = rng(97);
  let spawnIn = 0;
  function fire(node, gen, from = -1) {
    act[node] = 1;
    const out = adj[node].filter(k => k !== from);
    for (let n = Math.min(out.length, gen === 0 ? 3 : 2); n > 0 && signals.length < 120; n--) {
      const k = out.splice(Math.floor(simRand() * out.length), 1)[0];
      signals.push({ e: k, fwd: edges[k].a === node, u: 0, gen, speed: 6 + simRand() * 5 });
    }
  }
  function stepNet(dt) {
    if (dt <= 0) return;
    for (let i = 0; i < act.length; i++) act[i] *= Math.exp(-dt * 1.8);
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnIn = 0.12 + simRand() * 0.22;
      fire(simRand() < 0.55 ? targets[Math.floor(simRand() * targets.length)] : Math.floor(simRand() * net.length), 0);
    }
    for (let i = signals.length - 1; i >= 0; i--) {
      const s = signals[i], e = edges[s.e];
      s.u += (dt * s.speed) / e.len;
      if (s.u >= 1) {
        signals.splice(i, 1);
        const node = s.fwd ? e.b : e.a;
        act[node] = 1;
        if (s.gen < 5 && simRand() < 0.82 - s.gen * 0.1) fire(node, s.gen + 1, s.e);
      }
    }
  }
  for (let i = 0; i < 120; i++) stepNet(0.05);

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
  // Bracket that rises from the foot of each shield's pedestal and joins them underneath.
  function drawBracket(a, b, yLine, alpha) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(205,234,255,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + 5); ctx.lineTo(a.x, yLine); ctx.lineTo(b.x, yLine); ctx.lineTo(b.x, b.y + 5);
    ctx.stroke();
    [a, b].forEach(e => { ctx.fillStyle = 'rgba(214,236,255,0.95)'; ctx.beginPath(); ctx.arc(e.x, e.y + 5, 2.6, 0, TAU); ctx.fill(); });
    const text = narrow ? 'ONE CONNECTION' : 'ONE SEAMLESS CONNECTION';
    ctx.font = `700 ${narrow ? 9 : 10}px ${MONO}`;
    const w = ctx.measureText(text).width + 24;
    const x = (a.x + b.x) / 2 - w / 2;
    roundedPath(ctx, x, yLine - 11, w, 22, 11);
    ctx.fillStyle = 'rgba(5,13,26,0.96)'; ctx.fill();
    ctx.strokeStyle = 'rgba(205,234,255,0.6)'; ctx.stroke();
    ctx.fillStyle = 'rgba(214,236,255,0.97)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, (a.x + b.x) / 2, yLine + 0.5);
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

  // The phone shows TIAN's Home screen in the protected state, laid out from the iOS app
  // (header, status row, globe, headline, route labels, destination card, action, tab bar).
  // Illustration only: the address and timer are examples, not live values.
  const INK = '#e8f2fa', MUTED = '#9eb0c7', CYAN = '#9ccfff', GREEN = '#34c759';
  const LAND = [[-100, 45, 38, 24], [-60, -15, 15, 30], [-102, 20, 16, 10], [12, 50, 18, 10], [22, 4, 22, 32], [90, 48, 48, 24], [78, 22, 16, 12], [135, -26, 16, 10], [-45, 72, 18, 8]];
  const isLand = (lon, lat) => LAND.some(([a, b, rx, ry]) => {
    const dl = ((lon - a + 540) % 360) - 180;
    return (dl * dl) / (rx * rx) + ((lat - b) * (lat - b)) / (ry * ry) < 1 + 0.28 * Math.sin(lon * 0.37 + lat * 0.51);
  });
  const globeDots = [];
  for (let lat = -78; lat <= 78; lat += 4) {
    const step = 4 / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
    for (let lon = -180; lon < 180; lon += step) if (isLand(lon, lat)) globeDots.push([lon, lat]);
  }
  const GLOBE_NODES = [[-80, 34], [-97, 40], [-74, 41]];
  function spaced(g, text, x, y, gap, align) {
    const chars = [...text];
    const widths = chars.map(ch => g.measureText(ch).width);
    const total = widths.reduce((s, w) => s + w, 0) + gap * (chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    g.textAlign = 'left';
    chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + gap; });
  }
  function glass(g, x, y, w, h, r, accent) {
    roundedPath(g, x, y, w, h, r);
    if (accent) {
      const f = g.createLinearGradient(x, y, x + w, y + h);
      f.addColorStop(0, 'rgba(60,140,240,0.85)'); f.addColorStop(1, 'rgba(20,50,120,0.9)');
      g.fillStyle = f;
    } else g.fillStyle = 'rgba(255,255,255,0.055)';
    g.fill();
    const hi = g.createLinearGradient(x, y, x, y + h);
    hi.addColorStop(0, 'rgba(255,255,255,0.14)'); hi.addColorStop(0.4, 'rgba(255,255,255,0.02)'); hi.addColorStop(1, 'rgba(255,255,255,0.06)');
    g.strokeStyle = hi; g.lineWidth = 1.2; g.stroke();
  }
  function icon(g, kind, cx, cy, r, colour, lw = 1.5) {
    g.save(); g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    if (kind === 'power') {
      g.arc(cx, cy + 0.5, r, -Math.PI * 0.32, Math.PI * 1.32, false); g.moveTo(cx, cy - r - 1); g.lineTo(cx, cy - 1.5); g.stroke();
    } else if (kind === 'clock') {
      g.arc(cx, cy, r, 0, TAU); g.moveTo(cx, cy - r * 0.55); g.lineTo(cx, cy); g.lineTo(cx + r * 0.45, cy + r * 0.25); g.stroke();
    } else if (kind === 'chevron') {
      g.moveTo(cx - r * 0.7, cy - r * 0.3); g.lineTo(cx, cy + r * 0.4); g.lineTo(cx + r * 0.7, cy - r * 0.3); g.stroke();
    } else if (kind === 'globe') {
      g.arc(cx, cy, r, 0, TAU); g.moveTo(cx - r, cy); g.quadraticCurveTo(cx, cy - r * 0.5, cx + r, cy);
      g.moveTo(cx - r * 0.4, cy - r * 0.9); g.quadraticCurveTo(cx - r * 0.1, cy, cx - r * 0.5, cy + r * 0.8); g.stroke();
    } else if (kind === 'home') {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.stroke(); g.beginPath(); g.arc(cx, cy, 1.6, 0, TAU); g.fill();
    } else if (kind === 'shield') {
      g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.85, cy - r * 0.55); g.lineTo(cx + r * 0.85, cy + r * 0.15);
      g.quadraticCurveTo(cx + r * 0.85, cy + r * 0.8, cx, cy + r); g.quadraticCurveTo(cx - r * 0.85, cy + r * 0.8, cx - r * 0.85, cy + r * 0.15);
      g.lineTo(cx - r * 0.85, cy - r * 0.55); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx - r * 0.85, cy - r * 0.55); g.lineTo(cx - r * 0.85, cy + r * 0.15); g.quadraticCurveTo(cx - r * 0.85, cy + r * 0.8, cx, cy + r); g.closePath(); g.fill();
    } else if (kind === 'chart') {
      [[-0.65, 0.2], [0, -0.35], [0.65, 0.55]].forEach(([x, h]) => { g.moveTo(cx + x * r, cy + r * 0.8); g.lineTo(cx + x * r, cy - h * r - r * 0.1); });
      g.stroke();
    } else if (kind === 'sliders') {
      g.moveTo(cx - r, cy - r * 0.45); g.lineTo(cx + r, cy - r * 0.45); g.moveTo(cx - r, cy + r * 0.45); g.lineTo(cx + r, cy + r * 0.45); g.stroke();
      g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.45, r * 0.28, 0, TAU); g.arc(cx + r * 0.4, cy + r * 0.45, r * 0.28, 0, TAU); g.fill();
    }
    g.restore();
  }
  function drawGlobe(g, cx, cy, r, t) {
    const tilt = 0.32, rot = t * 0.12;
    const body = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    body.addColorStop(0, '#0e3260'); body.addColorStop(0.7, '#071d3a'); body.addColorStop(1, '#040f1f');
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = body; g.fill();
    const view = (lon, lat) => {
      const lo = ((lon * Math.PI) / 180) + rot, la = (lat * Math.PI) / 180;
      const x = Math.cos(la) * Math.sin(lo);
      const y = Math.sin(la) * Math.cos(tilt) - Math.cos(la) * Math.cos(lo) * Math.sin(tilt);
      const z = Math.sin(la) * Math.sin(tilt) + Math.cos(la) * Math.cos(lo) * Math.cos(tilt);
      return [cx + x * r, cy - y * r, z];
    };
    g.strokeStyle = 'rgba(126,190,255,0.14)'; g.lineWidth = 1;
    [-30, 0, 30].forEach(lat => { g.beginPath(); let pen = false; for (let lon = -180; lon <= 180; lon += 6) { const q = view(lon - (rot * 180) / Math.PI, lat); if (q[2] > 0) { if (pen) g.lineTo(q[0], q[1]); else { g.moveTo(q[0], q[1]); pen = true; } } else pen = false; } g.stroke(); });
    const offset = -(rot * 180) / Math.PI;
    globeDots.forEach(([lon, lat]) => {
      const q = view(lon + offset, lat);
      if (q[2] <= 0.02) return;
      g.fillStyle = `rgba(150,198,250,${0.18 + q[2] * 0.62})`;
      const s = 0.8 + q[2] * 1.1;
      g.fillRect(q[0] - s / 2, q[1] - s / 2, s, s);
    });
    const pts = GLOBE_NODES.map(([lon, lat]) => view(lon + offset, lat));
    [[0, 1], [1, 2]].forEach(([i, j]) => {
      const a = pts[i], b = pts[j];
      if (a[2] <= 0 || b[2] <= 0) return;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - r * 0.28;
      g.strokeStyle = 'rgba(150,205,255,0.8)'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(mx, my, b[0], b[1]); g.stroke();
    });
    pts.forEach(q => {
      if (q[2] <= 0) return;
      const halo = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], 9);
      halo.addColorStop(0, 'rgba(150,205,255,0.55)'); halo.addColorStop(1, 'rgba(150,205,255,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(q[0], q[1], 9, 0, TAU); g.fill();
      g.fillStyle = '#d8efff'; g.beginPath(); g.arc(q[0], q[1], 2.4, 0, TAU); g.fill();
    });
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.strokeStyle = 'rgba(126,190,255,0.55)'; g.lineWidth = 1.4; g.stroke();
  }

  function drawScreen(t) {
    const g = tg;
    g.clearRect(0, 0, TW, TH);
    g.fillStyle = '#030c17'; g.fillRect(0, 0, TW, TH);
    let atm = g.createRadialGradient(TW, 0, 0, TW, 0, 430);
    atm.addColorStop(0, 'rgba(41,122,240,0.17)'); atm.addColorStop(1, 'rgba(41,122,240,0)');
    g.fillStyle = atm; g.fillRect(0, 0, TW, TH);
    atm = g.createRadialGradient(0, TH, 0, 0, TH, 360);
    atm.addColorStop(0, 'rgba(156,207,255,0.07)'); atm.addColorStop(1, 'rgba(156,207,255,0)');
    g.fillStyle = atm; g.fillRect(0, 0, TW, TH);
    g.textBaseline = 'alphabetic';
    // status bar and dynamic island
    g.fillStyle = INK; g.font = `600 16px ${SANS}`; g.textAlign = 'left';
    g.fillText('9:41', 30, 38);
    g.fillStyle = '#000'; roundedPath(g, 125, 14, 110, 32, 16); g.fill();
    g.fillStyle = INK;
    for (let i = 0; i < 4; i++) g.fillRect(272 + i * 6.5, 36 - i * 3.5 - 4, 4, 4 + i * 3.5);
    roundedPath(g, 310, 24, 26, 13, 4); g.strokeStyle = 'rgba(232,242,250,0.75)'; g.lineWidth = 1.4; g.stroke();
    g.fillRect(312.5, 26.5, 18, 8);
    // header: spaced wordmark and account avatar
    g.fillStyle = INK; g.font = `500 18px ${SANS}`;
    spaced(g, 'T I Λ N', 24, 92, 2.2, 'left');
    const av = g.createLinearGradient(310, 70, 342, 102);
    av.addColorStop(0, '#3a6fb5'); av.addColorStop(1, '#16335c');
    g.beginPath(); g.arc(326, 86, 15, 0, TAU); g.fillStyle = av; g.fill();
    g.fillStyle = 'rgba(232,242,250,0.9)'; g.beginPath(); g.arc(326, 81, 4.6, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(326, 95, 8, 5.5, 0, Math.PI, TAU); g.fill();
    // status row: label on the left, address on the right
    g.fillStyle = GREEN; g.beginPath(); g.arc(28, 124, 2.6, 0, TAU); g.fill();
    g.fillStyle = MUTED; g.font = `600 9px ${SANS}`;
    spaced(g, 'PROTECTED', 38, 127.5, 2, 'left');
    g.font = `500 7px ${SANS}`; spaced(g, 'EXIT IP', TW - 24, 118, 1.2, 'right');
    g.fillStyle = GREEN; g.beginPath(); g.arc(TW - 98, 130, 2.6, 0, TAU); g.fill();
    g.fillStyle = INK; g.font = `400 10px ${MONO}`; g.textAlign = 'right'; g.fillText('203.0.113.24', TW - 24, 133.5);
    // globe
    drawGlobe(g, TW / 2, 262, 104, t);
    // connected for
    icon(g, 'clock', 112, 389, 5.2, CYAN, 1.2);
    g.fillStyle = MUTED; g.font = `400 11px ${SANS}`; g.textAlign = 'left'; g.fillText('Connected for', 124, 393);
    g.fillStyle = INK; g.font = `500 12.5px ${MONO}`; g.fillText('00:12:41', 204, 393.5);
    // headline and subtitle
    g.fillStyle = INK; g.font = `500 22px ${SANS}`; g.textAlign = 'center';
    g.fillText('Encrypted and Hidden.', TW / 2, 432);
    g.fillStyle = MUTED; g.font = `400 12px ${SANS}`;
    g.fillText('Your encrypted connection through', TW / 2, 454);
    g.fillText('both relays is verified.', TW / 2, 470);
    // route labels
    g.font = `400 9.5px ${SANS}`;
    g.fillStyle = GREEN; g.beginPath(); g.arc(52, 503, 2.4, 0, TAU); g.fill(); g.beginPath(); g.arc(TW - 118, 503, 2.4, 0, TAU); g.fill();
    g.fillStyle = MUTED; g.textAlign = 'left'; g.fillText('Identity Shield', 60, 506.5); g.fillText('Destination Shield', TW - 110, 506.5);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(144, 503.5); g.lineTo(TW - 130, 503.5); g.stroke();
    // destination card
    glass(g, 22, 522, TW - 44, 56, 17, false);
    icon(g, 'globe', 48, 550, 10, CYAN, 1.1);
    g.fillStyle = INK; g.font = `500 13.5px ${SANS}`; g.textAlign = 'left'; g.fillText('United States', 70, 546);
    g.fillStyle = MUTED; g.font = `400 10px ${SANS}`; g.fillText('New York · Two relays', 70, 562);
    icon(g, 'chevron', TW - 44, 551, 5, MUTED, 1.4);
    // action
    glass(g, 22, 592, TW - 44, 50, 17, false);
    g.fillStyle = INK; g.font = `600 14.5px ${SANS}`; g.textAlign = 'center'; g.fillText('Disconnect', TW / 2, 622);
    icon(g, 'power', TW - 50, 617, 6.5, INK, 1.5);
    // native tab bar
    glass(g, 18, 664, TW - 36, 64, 32, false);
    const names = ['Home', 'Protection', 'Activity', 'Settings'], kinds = ['home', 'shield', 'chart', 'sliders'];
    const tw = (TW - 36) / 4;
    roundedPath(g, 22, 668, tw - 8, 56, 28); g.fillStyle = 'rgba(255,255,255,0.11)'; g.fill();
    names.forEach((name, i) => {
      const x = 18 + tw * i + tw / 2, on = i === 0;
      icon(g, kinds[i], x, 689, 8, on ? CYAN : MUTED, 1.4);
      g.fillStyle = on ? CYAN : MUTED; g.font = `500 8.5px ${SANS}`; g.textAlign = 'center'; g.fillText(name, x, 712);
    });
    roundedPath(g, 130, 756, 100, 5, 2.5); g.fillStyle = 'rgba(232,242,250,0.7)'; g.fill();
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
    const near = pt => clamp(1 - len(sub(pt, cam.pos)) / 78);
    // links, batched by brightness so each batch is one stroke
    const buckets = [[], [], [], []];
    edges.forEach(e => {
      const a = net[e.a].p, b = net[e.b].p;
      const pa = P(a), pb = P(b), pc = P(e.ctrl);
      if (!pa || !pb || !pc) return;
      const k = near(mix(a, b, 0.5));
      buckets[Math.min(3, Math.floor(k * 4))].push([pa, pc, pb]);
    });
    ctx.lineWidth = 1;
    buckets.forEach((list, i) => {
      if (!list.length) return;
      ctx.strokeStyle = rgba(COL.cyan, (0.05 + i * 0.06) * amt);
      ctx.beginPath();
      list.forEach(([a, c, b]) => { ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); });
      ctx.stroke();
    });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // neurons: dim at rest, flaring when a signal arrives
    net.forEach((n, i) => {
      const q = P(n.p);
      if (!q) return;
      const k = near(n.p), a = act[i];
      const tw = 0.7 + 0.3 * Math.sin(t * 1.1 + n.tw);
      const r = clamp((0.09 + a * 0.12) * q[2], 0.9, 3.6);
      if (a > 0.06) glow(q, clamp(q[2] * (0.3 + a * 0.7), 3, 20), n.colour, 0.75 * a * amt * (0.4 + k));
      ctx.fillStyle = rgba(a > 0.3 ? COL.white : n.colour, clamp((0.25 + 0.55 * k) * tw + a, 0, 1) * amt);
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
    });
    // signals travelling along the links, with short fading tails
    signals.forEach(s => {
      const e = edges[s.e], col = net[s.fwd ? e.b : e.a].colour;
      for (let j = 0; j < 5; j++) {
        const u = clamp(s.fwd ? s.u - j * 0.045 : 1 - s.u + j * 0.045);
        if ((s.fwd && s.u - j * 0.045 < 0) || (!s.fwd && 1 - s.u + j * 0.045 > 1)) continue;
        const q = P(edgeAt(e, u));
        if (!q) continue;
        const a = (1 - j / 5) * 0.95 * amt;
        if (j === 0) glow(q, clamp(0.35 * q[2], 4, 14), col, 0.7 * amt);
        ctx.fillStyle = rgba(COL.white, a * (j === 0 ? 1 : 0.55));
        ctx.beginPath(); ctx.arc(q[0], q[1], clamp((j === 0 ? 0.1 : 0.07) * q[2], 0.9, 3), 0, TAU); ctx.fill();
      }
    });
    // the Destination Shield feeding the network
    targets.forEach((idx, k) => {
      const end = net[idx].p;
      const ctrl = [lerp(EXIT_POINT[0], end[0], 0.35), EXIT_POINT[1] - 3, lerp(EXIT_POINT[2], end[2], 0.4)];
      const pts = [];
      for (let s = 0; s <= 16; s++) {
        const u = s / 16, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        pts.push([a * EXIT_POINT[0] + b * ctrl[0] + c * end[0], a * EXIT_POINT[1] + b * ctrl[1] + c * end[1], a * EXIT_POINT[2] + b * ctrl[2] + c * end[2]]);
      }
      polyline(pts, COL.mint, 0.3 * amt, 1);
      const f = (t * 0.28 + k / targets.length) % 1;
      const q = P(pts[Math.floor(f * 16)]);
      if (q) glow(q, Math.max(3, 0.3 * q[2]), COL.cyan, 0.85 * amt);
    });
    // hubs
    hubs.forEach(i => {
      const q = P(net[i].p);
      if (!q) return;
      const a = 0.5 + 0.5 * Math.sin(t * 1.6 + net[i].tw);
      glow(q, clamp(0.9 * q[2], 8, 30), COL.mint, (0.3 + 0.2 * a) * amt);
      ctx.strokeStyle = rgba(COL.mint, 0.75 * amt); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(q[0], q[1], clamp(0.3 * q[2], 4, 12), 0, TAU); ctx.stroke();
    });
    ctx.restore();
    hubs.forEach((idx, k) => {
      const q = P(net[idx].p);
      if (!q) return;
      ctx.font = `700 ${clamp(q[2] * 0.7, 9, 12)}px ${MONO}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(COL.mint, 0.9 * amt);
      ctx.fillText(siteLabels[k], q[0], q[1] - Math.max(9, 0.5 * q[2]));
    });
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
      if (w[3] > 0.05 && eq && xq) {
        const foot = pos => { let best = null; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; const q = P([pos[0] + Math.cos(a) * 3.4, GROUND, pos[2] + Math.sin(a) * 3.4]); if (q && (!best || q[1] > best[1])) best = q; } return best; };
        const ge = P([ENTRY[0], GROUND, ENTRY[2]]), gx = P([EXIT[0], GROUND, EXIT[2]]), fe = foot(ENTRY), fx = foot(EXIT);
        if (ge && gx && fe && fx) {
          const yLine = Math.min(Math.max(fe[1], fx[1]) + 26, (free[3] ? free[3].y1 : H) - 4);
          drawBracket({ x: ge[0], y: fe[1] }, { x: gx[0], y: fx[1] }, yLine, w[3]);
        }
      }
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
    if (!isPaused()) { time += dt; stepNet(dt); }
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
