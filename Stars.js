
(function () {
  var c = document.getElementById('stars');
  var slot = document.getElementById('stars-slot');
  if (!c || !slot) return;
  var ctx = c.getContext('2d');
  var root = document.documentElement;
  var hl = document.querySelector('[data-stars-reveal]');


  var SEQ = ['Imagine', 'bulb', 'Make', 'hammer', 'Break', 'broken', 'ReImagine', 'logo'];
  var INTRO_WORD = 'ReImagine';
  var REVEAL_FAILSAFE = 45;      // seconds
  var BUTTONS_AT = 1.5;          // seconds
  var STATIC_WORD = 'ReImagine';
  // white, cyan, blue, violet, then the two logo blues (dark wing, light wing)
  var COLORS = ['#ffffff', '#7df9ff', '#3d8bff', '#9b7bff', '#2f78d0', '#4db4ff', '#ff7ac8', '#ffb86b'];
  var RINGS = [
    { r: 1.32, tx: 1.25, tz: 0.35, speed: 0.55, sats: 2, a: 0.30, dash: false },
    { r: 1.52, tx: 0.55, tz: -0.65, speed: -0.35, sats: 1, a: 0.22, dash: true },
    { r: 1.14, tx: 1.5, tz: 1.0, speed: 0.8, sats: 1, a: 0.18, dash: false }
  ];
  var NODES_DESKTOP = 0;     // bright "network" dots joined by thin lines (0 = off)
  var NODES_LITE = 0;
  var SCAN = false;          // hologram scan line (techy; off for a softer look)
  var SCAN_PERIOD = 5.5;     // seconds for the hologram scan line to cross the shape
  var HUD = false;           // corner brackets + tiny readouts around the shape
  var MAX_WIDTH = 0.92;      // word may fill this fraction of the hero width
  var COUNT_DESKTOP = 7000;  // number of dots (lower = faster, higher = denser text)
  var COUNT_LITE = 2600;     // number of dots on phones
  var EDGE_SHARE = 0.55;    // share of dots placed on letter outlines (rest fill the letters)
  var SPRING = 12;           // how firmly dots settle into place
  var CURSOR_PUSH = false;   // true = dots scatter and glow around the cursor (off: only the gentle tilt remains)
  var REPEL = 900;           // how hard the cursor pushes dots away (only if CURSOR_PUSH is true)
  var SPIN = 0.22;           // sphere / torus rotation speed (radians per second)
  var PERSP = 900;           // perspective strength
  var INTRO_SPREAD = 1.8;    // seconds over which dots launch at the start
  var MORPH_SPREAD = 0.8;    // same, when changing shape
  var SWEEP = 1.6;           // seconds for the light band to cross the word; the headline reveal and its sparks follow the same band
  var SPARK_RATE = 2;        // sparks emitted per frame while the band is over the headline
  var SPARK_FADE = 3.2;      // higher = sparks vanish sooner
  var SHAPE_HOLD = 1.9;      // pause on each shape (seconds)
  var WORD_HOLD = 1.3;       // pause on each word
  var HOME_HOLD = 4;         // pause on the logo (the end of the story)

  var lite = window.matchMedia('(max-width: 768px)').matches;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) root.classList.add('stars-js');
  var COUNT = lite ? COUNT_LITE : COUNT_DESKTOP;
  var TAU = Math.PI * 2;

  /* ---------- state ---------- */
  var W, H, dpr, cx0, cy0, slotH, R3 = 160, fsRef = 200;
  var P = [], A = [], sparks = [], layouts = {}, curL = null, gen = 0;
  var t = 0, t0 = 0, last = 0, raf = null, started = false, visible = true;
  var si = 0, tNextMorph = 1e9;
  var ang = 0, spinSpeed = SPIN, wordness = 0, tiltX = 0, tiltY = 0;
  var sweepStart = -1, sweepL = null, revealed = false;
  var mx = -9999, my = -9999, mxs = -9999, mys = -9999, mIn = false, mAct = 0;
  var q = 0, slowFrames = 0, winFrames = 0, dprCap = lite ? 1.5 : 2, crc = null;
  var cA = 1, sA = 0, cB = 1, sB = 0, uiFade = 0, hw = 0, hh = 0, pj = { x: 0, y: 0, f: 1, z: 0 };
  // The frame, label, rings and links follow the shape that has actually formed, not the one just requested
  var hudSi = 0, hudReadyAt = 0, hudWord = 0, hwFrom = 0, hwTo = 0, hwT0 = 0;
  // Small flat pictures (bulb, hammer, logo...) on phones: shrink the dots with the picture, otherwise the glows
  // overlap and the colours burn out to white. dkFlat is the dot scale for a picture; dk eases towards it.
  var flatS = 200, dkFlat = 1, dk = 1, FLAT_REF = 240, FLAT_MIN = 0.38;
  function hwTarget(L) { return clamp(Math.max(R3 * 1.5, (L.maxX - L.minX) / 2 + 50), 60, Math.max(60, W / 2 - 14)); }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(x, lo, hi) { return Math.min(hi === undefined ? 1 : hi, Math.max(lo === undefined ? 0 : lo, x)); }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function is3D(n) { return n === 'sphere' || n === 'helix' || n === 'cube' || n === 'torus' || n === 'galaxy' || n === 'bloom' || n === 'wave'; }
  function isFlat(n) { return n === 'logo' || n === 'bulb' || n === 'hammer' || n === 'broken'; }
  function isWord(n) { return !is3D(n) && !isFlat(n); }

  function makeSprite(hex) {
    var s = document.createElement('canvas');
    s.width = s.height = 64;
    var g = s.getContext('2d'), rgb = hexToRgb(hex).join(',');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(' + rgb + ',0.9)');
    gr.addColorStop(0.35, 'rgba(' + rgb + ',0.25)');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return s;
  }
  var sprites = COLORS.map(makeSprite);

  function dot(x, y, size, alpha, sp) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp, x - size, y - size, size * 2, size * 2);
  }

  // project a 3D point (shape space) to the screen using this frame's rotation
  function project(x, y, z) {
    var x1 = x * cA + z * sA, z1 = -x * sA + z * cA;
    var y1 = y * cB - z1 * sB, z2 = y * sB + z1 * cB;
    var f = PERSP / Math.max(60, PERSP + z2);
    pj.x = cx0 + x1 * f; pj.y = cy0 + y1 * f; pj.f = f; pj.z = z2;
  }
  function ringPoint(rd, u, cta, sta, ctb, stb) {
    var x0 = Math.cos(u) * rd, z0 = Math.sin(u) * rd;
    var y1 = -z0 * sta, z1 = z0 * cta;
    project(x0 * ctb - y1 * stb, x0 * stb + y1 * ctb, z1);
  }

  /* ---------- headline reveal ---------- */
  function setReveal(v) { if (hl) hl.style.setProperty('--r', v.toFixed(3)); }
  function finishReveal() {
    if (revealed) return;
    revealed = true;
    if (hl) {
      setReveal(1);
      hl.style.webkitMaskImage = 'none';
      hl.style.maskImage = 'none';
    }
    root.classList.add('stars-revealed');
    showButtons();
  }
  // Fades in everything marked data-stars-fade (subtitle + buttons). The styles are set directly on the
  // elements, so this works whichever CSS rule (stars-revealed or stars-buttons) your stylesheet uses.
  function showButtons() {
    root.classList.add('stars-buttons');
    var els = document.querySelectorAll('[data-stars-fade]');
    for (var i = 0; i < els.length; i++) { els[i].style.opacity = '1'; els[i].style.transform = 'none'; }
  }
  setTimeout(finishReveal, REVEAL_FAILSAFE * 1000);   // failsafe: never leave the page hidden
  // Buttons do not wait for the headline or the story: show them early
  setTimeout(showButtons, BUTTONS_AT * 1000);

  /* ---------- quality governor ---------- */
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    c.width = W * dpr; c.height = H * dpr;
  }
  function setQuality(n) {
    if (n <= q || n > 2) return;
    q = n;
    if (dprCap > 1) { dprCap = 1; resizeCanvas(); }
  }

  /* ---------- layouts: a 3D target point (relative to the centre) for every dot ---------- */
  var scratch = document.createElement('canvas').getContext('2d');
  function fontStr(s) { return '700 ' + s + 'px Fraunces, Georgia, serif'; }

  function sphereLayout() {
    var pts = [], i, y, r, th, k;
    for (i = 0; i < COUNT; i++) {
      y = 1 - 2 * (i + 0.5) / COUNT;
      r = Math.sqrt(1 - y * y);
      th = i * 2.399963;
      k = R3 * (Math.random() < 0.12 ? rnd(0.3, 0.95) : 1 + rnd(-0.015, 0.015));
      pts.push({ x: Math.cos(th) * r * k, y: y * k, z: Math.sin(th) * r * k });
    }
    return { pts: pts, minX: -R3, maxX: R3 };
  }

  function torusLayout() {
    var pts = [], i, u, v, big = R3 * 0.82, small = R3 * 0.34, x, y, z, ca = Math.cos(0.55), sa = Math.sin(0.55);
    for (i = 0; i < COUNT; i++) {
      u = rnd(0, TAU); v = rnd(0, TAU);
      x = (big + small * Math.cos(v)) * Math.cos(u);
      z = (big + small * Math.cos(v)) * Math.sin(u);
      y = small * Math.sin(v);
      pts.push({ x: x, y: y * ca - z * sa, z: y * sa + z * ca });
    }
    return { pts: pts, minX: -R3 * 1.2, maxX: R3 * 1.2 };
  }

  // Evenly spread n sample points over a mask: outline pixels at a steady stride (no clumps),
  // the rest on a jittered grid inside the shape. Returns pixel indices.
  function sampleMask(mask, rw, rh, n) {
    var edges = [], inside = 0, lx, ly, idx, k, j, out = [], tmp;
    for (ly = 1; ly < rh - 1; ly++) for (lx = 1; lx < rw - 1; lx++) {
      idx = ly * rw + lx;
      if (!mask[idx]) continue;
      inside++;
      if (!mask[idx - 1] || !mask[idx + 1] || !mask[idx - rw] || !mask[idx + rw]) edges.push(idx);
    }
    if (!edges.length) return out;
    var nE = Math.floor(n * EDGE_SHARE), nF = n - nE;
    for (k = 0; k < nE; k++) out.push(edges[Math.floor((k + Math.random()) * edges.length / nE)]);
    var g = Math.max(1.2, Math.sqrt(inside / nF)), gx, gy, fills = [];
    for (gy = 0; gy < rh; gy += g) for (gx = 0; gx < rw; gx += g) {
      lx = (gx + Math.random() * g) | 0; ly = (gy + Math.random() * g) | 0;
      if (lx < rw && ly < rh && mask[ly * rw + lx]) fills.push(ly * rw + lx);
    }
    for (k = fills.length - 1; k > 0; k--) {        // shuffle, then trim to the number we need
      j = (Math.random() * (k + 1)) | 0; tmp = fills[k]; fills[k] = fills[j]; fills[j] = tmp;
    }
    if (fills.length > nF) fills.length = nF;
    for (k = 0; fills.length < nF && k < nF * 6; k++) {
      lx = (Math.random() * rw) | 0; ly = (Math.random() * rh) | 0;
      if (mask[ly * rw + lx]) fills.push(ly * rw + lx);
    }
    while (fills.length < nF) fills.push(edges[(Math.random() * edges.length) | 0]);
    return out.concat(fills);
  }

  function wordLayout(word) {
    var fs = slotH * 0.85;
    scratch.font = fontStr(fs);
    var m = scratch.measureText(word).width;
    if (m > W * MAX_WIDTH) {
      fs *= (W * MAX_WIDTH) / m;
      scratch.font = fontStr(fs);
      m = scratch.measureText(word).width;
    }
    if (word === INTRO_WORD) fsRef = fs;

    var rx0 = Math.max(0, Math.floor(cx0 - m / 2 - 12)), rx1 = Math.min(W, Math.ceil(cx0 + m / 2 + 12));
    var ry0 = Math.max(0, Math.floor(cy0 - fs * 0.8)), ry1 = Math.min(H, Math.ceil(cy0 + fs * 0.8));
    var rw = rx1 - rx0, rh = ry1 - ry0;
    if (rw < 3 || rh < 3) return sphereLayout();

    var o = document.createElement('canvas');
    o.width = rw; o.height = rh;
    var oc = o.getContext('2d', { willReadFrequently: true });
    oc.font = fontStr(fs);
    oc.textAlign = 'center'; oc.textBaseline = 'middle'; oc.fillStyle = '#fff';
    oc.fillText(word, cx0 - rx0, cy0 - ry0);
    var d = oc.getImageData(0, 0, rw, rh).data;
    var mask = new Uint8Array(rw * rh), i, lx, ly, idx;
    for (i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 128 ? 1 : 0;

    var picks = sampleMask(mask, rw, rh, COUNT);
    if (!picks.length) return sphereLayout();

    var pts = [], depth = fs * 0.02, minX = Infinity, maxX = -Infinity, x, y;
    for (i = 0; i < picks.length; i++) {
      idx = picks[i];
      x = idx % rw + rx0 + rnd(-0.5, 0.5); y = ((idx / rw) | 0) + ry0 + rnd(-0.5, 0.5);
      minX = Math.min(minX, x - cx0); maxX = Math.max(maxX, x - cx0);
      pts.push({ x: x - cx0, y: y - cy0, z: rnd(-depth, depth) });
    }
    return { pts: pts, minX: minX, maxX: maxX };
  }

  // DNA double helix: two strands plus rungs
  function helixLayout() {
    var pts = [], i, tt, a, s, k, rh = R3 * 0.45, hh2 = R3 * 2.0, turns = 3, RUNGS = 24, r = Math.random;
    for (i = 0; i < COUNT; i++) {
      if (r() < 0.68) {
        tt = r(); a = tt * turns * TAU + (r() < 0.5 ? 0 : Math.PI);
        k = rh * (1 + rnd(-0.06, 0.06));
        pts.push({ x: Math.cos(a) * k, y: (tt - 0.5) * hh2 + rnd(-1.5, 1.5), z: Math.sin(a) * k });
      } else {
        tt = (Math.floor(r() * RUNGS) + 0.5) / RUNGS; a = tt * turns * TAU; s = rnd(-1, 1) * rh;
        pts.push({ x: Math.cos(a) * s, y: (tt - 0.5) * hh2 + rnd(-1.5, 1.5), z: Math.sin(a) * s });
      }
    }
    return { pts: pts, minX: -rh, maxX: rh };
  }

  // Wireframe cube inside a cube, joined at the corners (a tesseract), with bright corner dots
  function cubeLayout() {
    var ho = R3 * 0.78, hi = ho * 0.5, E = [], tot = 0, i, b, j, n, u, e, v, pts = [];
    function vert(h, m) { return [(m & 1 ? 1 : -1) * h, (m & 2 ? 1 : -1) * h, (m & 4 ? 1 : -1) * h]; }
    function len(a, c) { return Math.sqrt(Math.pow(a[0] - c[0], 2) + Math.pow(a[1] - c[1], 2) + Math.pow(a[2] - c[2], 2)); }
    for (i = 0; i < 8; i++) {
      for (b = 0; b < 3; b++) {
        j = i ^ (1 << b);
        if (j > i) { E.push([vert(ho, i), vert(ho, j)]); E.push([vert(hi, i), vert(hi, j)]); }
      }
      E.push([vert(ho, i), vert(hi, i)]);
    }
    E.forEach(function (x) { tot += len(x[0], x[1]); x.push(tot); });
    var cx = Math.cos(0.5), sx = Math.sin(0.5), cz = Math.cos(0.35), sz = Math.sin(0.35);
    function tilt(p) {
      var y1 = p[1] * cx - p[2] * sx, z1 = p[1] * sx + p[2] * cx;
      return { x: p[0] * cz - y1 * sz, y: p[0] * sz + y1 * cz, z: z1 };
    }
    for (n = 0; n < COUNT; n++) {
      if (Math.random() < 0.1) {                       // corner glow
        v = vert(Math.random() < 0.6 ? ho : hi, (Math.random() * 8) | 0);
        pts.push(tilt([v[0] + rnd(-3, 3), v[1] + rnd(-3, 3), v[2] + rnd(-3, 3)]));
      } else {
        u = Math.random() * tot;
        for (i = 0; i < E.length - 1 && E[i][2] < u; i++) {}
        e = E[i]; b = Math.random();
        pts.push(tilt([e[0][0] + (e[1][0] - e[0][0]) * b + rnd(-1, 1), e[0][1] + (e[1][1] - e[0][1]) * b + rnd(-1, 1),
                       e[0][2] + (e[1][2] - e[0][2]) * b + rnd(-1, 1)]));
      }
    }
    return { pts: pts, minX: -ho, maxX: ho };
  }

  // The club logo (dark wing, light wing, head), sampled from the same shapes as logo.svg
  function logoLayout() {
    var S = Math.max(40, Math.min(Math.ceil(slotH * 0.85), Math.floor(cy0 * 2 - 24)));
    var o = document.createElement('canvas');
    o.width = o.height = S;
    var oc = o.getContext('2d', { willReadFrequently: true });
    oc.scale(S / 100, S / 100);
    oc.lineCap = 'round'; oc.lineJoin = 'round';
    oc.fillStyle = '#17599c'; oc.strokeStyle = '#17599c';
    oc.beginPath(); oc.arc(50, 24, 8.5, 0, TAU); oc.fill();
    oc.lineWidth = 21;
    oc.beginPath(); oc.moveTo(28, 42); oc.lineTo(52, 60); oc.lineTo(28, 78); oc.stroke();
    oc.strokeStyle = '#2a8ded';
    oc.beginPath(); oc.moveTo(72, 42); oc.lineTo(48, 60); oc.lineTo(72, 78); oc.stroke();
    var d = oc.getImageData(0, 0, S, S).data, mask = new Uint8Array(S * S), cls = new Uint8Array(S * S), i, lx, ly, idx;
    for (i = 0; i < mask.length; i++) {
      if (d[i * 4 + 3] > 128) { mask[i] = 1; cls[i] = d[i * 4 + 2] > 200 ? 5 : 4; }
    }
    var picks = sampleMask(mask, S, S, COUNT);
    var pts = [], depth = S * 0.02, h = S / 2;
    for (i = 0; i < picks.length; i++) {
      idx = picks[i];
      pts.push({ x: idx % S - h + rnd(-0.5, 0.5), y: ((idx / S) | 0) - h + rnd(-0.5, 0.5), z: rnd(-depth, depth), c: cls[idx] });
    }
    return { pts: pts, minX: -h, maxX: h };
  }


  /* ---------- flat illustrations: bulb, hammer, broken bulb ---------- */
  // Drawn as vector art on a 100 x 100 canvas, then sampled into dots the same way as the logo.
  // Each dot takes the palette colour nearest to the pixel it came from: [r, g, b, colour index in COLORS].
  var AMBER = 'rgb(255,184,107)', CYAN = 'rgb(125,249,255)', STEEL = 'rgb(77,180,255)', WHITE = 'rgb(255,255,255)';
  var PAL = [[255, 184, 107, 7], [125, 249, 255, 1], [255, 255, 255, 0], [77, 180, 255, 5]];

  function rr(g, x, y, w, h, r) {       // filled rounded rectangle
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath(); g.fill();
  }
  function bulbGlass(g) {               // round glass and the neck below it
    g.fillStyle = AMBER;
    g.beginPath(); g.arc(50, 44, 24, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(38, 60); g.lineTo(62, 60); g.lineTo(57, 72); g.lineTo(43, 72); g.closePath(); g.fill();
  }
  function bulbBase(g) {                // the screw cap
    g.fillStyle = CYAN;
    rr(g, 42, 74, 16, 5, 2); rr(g, 43, 81, 14, 5, 2); rr(g, 47, 88, 6, 5, 2);
  }
  function drawBulb(g) {
    bulbGlass(g); bulbBase(g);
    g.strokeStyle = AMBER; g.lineWidth = 3;           // rays of light: "an idea"
    for (var a = Math.PI; a <= TAU + 0.01; a += Math.PI / 6) {
      g.beginPath();
      g.moveTo(50 + Math.cos(a) * 31, 44 + Math.sin(a) * 31);
      g.lineTo(50 + Math.cos(a) * 38, 44 + Math.sin(a) * 38);
      g.stroke();
    }
    g.strokeStyle = WHITE; g.lineWidth = 2.4;         // filament
    g.beginPath(); g.moveTo(45, 72); g.lineTo(45, 52); g.lineTo(47.5, 45); g.lineTo(50, 51);
    g.lineTo(52.5, 45); g.lineTo(55, 52); g.lineTo(55, 72); g.stroke();
  }
  function drawHammer(g) {
    g.translate(43, 53); g.rotate(0.7);               // tilted, as if mid-swing
    g.fillStyle = AMBER; rr(g, -4.5, -18, 9, 62, 4);  // handle
    g.fillStyle = STEEL; rr(g, -27, -38, 54, 24, 4);  // head
    g.fillStyle = WHITE; rr(g, -27, -38, 9, 24, 3); rr(g, 18, -38, 9, 24, 3);   // bright faces
  }
  function drawBroken(g) {
    bulbBase(g);
    // the jagged stump of glass that stays on the cap
    g.save();
    g.beginPath();
    [[0, 100], [0, 58], [31, 52], [37, 61], [44, 53], [50, 63], [56, 52], [63, 61], [69, 53], [100, 58], [100, 100]]
      .forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath(); g.clip();
    bulbGlass(g);
    g.restore();
    g.strokeStyle = WHITE; g.lineWidth = 2.4;         // snapped filament
    g.beginPath(); g.moveTo(45, 72); g.lineTo(45, 63); g.moveTo(55, 72); g.lineTo(55, 60); g.lineTo(58, 54); g.stroke();
    // shards of the upper glass, each thrown outwards and turned a little
    var N = 8, a0 = -Math.PI - 0.35, span = Math.PI + 0.7, k, s0, s1, m, px, py, j0, j1;
    var DIST = [14, 9, 17, 11, 18, 10, 15, 12], ROT = [-0.5, 0.4, -0.3, 0.6, -0.6, 0.3, 0.5, -0.4];
    var HUB = [10, 4, 12, 5, 11, 3, 12, 6, 9], JIT = [0.12, -0.1, 0.15, -0.12, 0.1, -0.15, 0.12, -0.1, 0.08];
    for (k = 0; k < N; k++) {
      s0 = a0 + span * k / N; s1 = a0 + span * (k + 1) / N; m = (s0 + s1) / 2;
      j0 = s0 + JIT[k]; j1 = s1 + JIT[k + 1];
      px = 50 + Math.cos(m) * 14; py = 44 + Math.sin(m) * 14;
      g.save();
      g.translate(px + Math.cos(m) * DIST[k], py + Math.sin(m) * DIST[k] + 4);
      g.rotate(ROT[k]);
      g.translate(-px, -py);
      g.beginPath();
      g.moveTo(50 + Math.cos(s0) * HUB[k], 44 + Math.sin(s0) * HUB[k]);
      g.lineTo(50 + Math.cos(j0) * 40, 44 + Math.sin(j0) * 40);
      g.lineTo(50 + Math.cos(m) * 40, 44 + Math.sin(m) * 40);
      g.lineTo(50 + Math.cos(j1) * 40, 44 + Math.sin(j1) * 40);
      g.lineTo(50 + Math.cos(s1) * HUB[k + 1], 44 + Math.sin(s1) * HUB[k + 1]);
      g.closePath(); g.clip();
      g.fillStyle = AMBER;
      g.beginPath(); g.arc(50, 44, 24, 0, TAU); g.fill();
      g.restore();
    }
  }

  // Samples a drawing into dots. "scatter" turns that share of the dots into loose debris around the shape.
  function drawnLayout(draw, scatter) {
    var S = Math.max(40, Math.min(Math.ceil(slotH * 0.85), Math.floor(cy0 * 2 - 24)));
    var o = document.createElement('canvas');
    o.width = o.height = S;
    var oc = o.getContext('2d', { willReadFrequently: true });
    oc.scale(S / 100, S / 100);
    oc.lineCap = 'round'; oc.lineJoin = 'round';
    draw(oc);
    var d = oc.getImageData(0, 0, S, S).data, mask = new Uint8Array(S * S), cls = new Uint8Array(S * S);
    var i, k, best, bd, dr, dg, db, dd;
    for (i = 0; i < mask.length; i++) {
      if (d[i * 4 + 3] <= 128) continue;
      mask[i] = 1; best = 0; bd = 1e9;
      for (k = 0; k < PAL.length; k++) {
        dr = d[i * 4] - PAL[k][0]; dg = d[i * 4 + 1] - PAL[k][1]; db = d[i * 4 + 2] - PAL[k][2];
        dd = dr * dr + dg * dg + db * db;
        if (dd < bd) { bd = dd; best = PAL[k][3]; }
      }
      cls[i] = best;
    }
    var picks = sampleMask(mask, S, S, COUNT);
    if (!picks.length) return sphereLayout();
    var pts = [], depth = S * 0.02, h = S / 2, idx, a, r;
    for (i = 0; i < picks.length; i++) {
      idx = picks[i];
      pts.push({ x: idx % S - h + rnd(-0.5, 0.5), y: ((idx / S) | 0) - h + rnd(-0.5, 0.5), z: rnd(-depth, depth), c: cls[idx] });
    }
    if (scatter) {
      for (i = pts.length - 1; i > pts.length * (1 - scatter); i--) {
        a = rnd(0, TAU); r = rnd(0.28, 0.5) * S;
        pts[i] = { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.9 - S * 0.06, z: rnd(-depth * 4, depth * 4), c: Math.random() < 0.7 ? 7 : 0 };
      }
    }
    return { pts: pts, minX: -h, maxX: h };
  }
  function bulbLayout() { return drawnLayout(drawBulb, 0); }
  function hammerLayout() { return drawnLayout(drawHammer, 0); }
  function brokenLayout() { return drawnLayout(drawBroken, 0.06); }


  // Spiral galaxy: three arms, a glowing core, tilted so you see the swirl
  function galaxyLayout() {
    var pts = [], i, arm, r, a, k, x, y, z, ct = Math.cos(0.95), st = Math.sin(0.95), g;
    for (i = 0; i < COUNT; i++) {
      if (Math.random() < 0.16) {                         // bright core
        g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.5;
        r = R3 * 0.3 * Math.random();
        a = Math.random() * TAU;
        x = Math.cos(a) * r; z = Math.sin(a) * r; y = g * R3 * 0.25;
      } else {
        arm = (Math.random() * 3) | 0;
        r = R3 * 1.2 * Math.pow(Math.random(), 0.75);
        a = r / R3 * 3.1 + arm * TAU / 3 + (Math.random() + Math.random() - 1) * (0.55 - 0.25 * r / (R3 * 1.2));
        x = Math.cos(a) * r; z = Math.sin(a) * r; y = rnd(-1, 1) * R3 * 0.04 * (1.2 - r / (R3 * 1.2));
      }
      pts.push({ x: x, y: y * ct - z * st, z: y * st + z * ct });
    }
    return { pts: pts, minX: -R3 * 1.2, maxX: R3 * 1.2 };
  }

  // Bloom: layered petals like a flower or mandala, opening towards you
  function bloomLayout() {
    var pts = [], i, l, th, rho, s, ang0, petal = 6, LAYERS = 5, ct = Math.cos(0.28), st = Math.sin(0.28), x, y, z, r;
    for (i = 0; i < COUNT; i++) {
      l = (Math.random() * LAYERS) | 0;
      s = 1 - l * 0.17;
      ang0 = l * 0.32;
      th = Math.random() * TAU;
      rho = R3 * 1.08 * s * (0.3 + 0.7 * Math.pow(Math.abs(Math.cos(petal * (th + ang0) / 2)), 0.8));
      if (Math.random() > 0.55) rho *= rnd(0.25, 1);       // some dots inside the petals
      x = Math.cos(th) * rho; y = Math.sin(th) * rho;
      z = (l - (LAYERS - 1) / 2) * R3 * 0.13 + (1 - rho / (R3 * 1.08)) * R3 * 0.12;
      pts.push({ x: x, y: y * ct - z * st, z: y * st + z * ct });
    }
    return { pts: pts, minX: -R3 * 1.1, maxX: R3 * 1.1 };
  }

  // Wave: a flowing silk-like sheet
  function waveLayout() {
    var pts = [], i, x, z, y, ct = Math.cos(0.35), st = Math.sin(0.35), hw2 = R3 * 1.35, hd = R3 * 0.62;
    for (i = 0; i < COUNT; i++) {
      x = rnd(-1, 1) * hw2; z = rnd(-1, 1) * hd;
      y = Math.sin(x / R3 * 2.6 + z / R3 * 1.6) * R3 * 0.3 + Math.sin(x / R3 * 1.1 - z / R3 * 2.2) * R3 * 0.12;
      pts.push({ x: x, y: y * ct - z * st, z: y * st + z * ct });
    }
    return { pts: pts, minX: -hw2, maxX: hw2 };
  }

  function computeLayout(name) {
    if (name === 'sphere') return sphereLayout();
    if (name === 'torus') return torusLayout();
    if (name === 'helix') return helixLayout();
    if (name === 'cube') return cubeLayout();
    if (name === 'logo') return logoLayout();
    if (name === 'bulb') return bulbLayout();
    if (name === 'hammer') return hammerLayout();
    if (name === 'broken') return brokenLayout();
    if (name === 'galaxy') return galaxyLayout();
    if (name === 'bloom') return bloomLayout();
    if (name === 'wave') return waveLayout();
    return wordLayout(name);
  }
  function getLayout(n) { return layouts[n] || (layouts[n] = computeLayout(n)); }

  // Build the other shapes one at a time, whenever the browser is idle
  function schedule(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 1500 });
    else setTimeout(fn, 400);
  }
  function precompute(g) {
    var i = 0;
    (function next() {
      if (g !== gen || i >= SEQ.length) return;
      var n = SEQ[i++];
      if (!layouts[n]) layouts[n] = computeLayout(n);
      schedule(next);
    })();
  }

  /* ---------- particles ---------- */
  function newParticle() {
    var r = Math.random();
    return { x: rnd(-W * 0.5, W * 0.5), y: rnd(-H * 0.5, H * 0.5), z: rnd(-400, 400),
             vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, px: 0, py: 0, pz: 0, pend: false, wake: 0,
             ox: 0, oy: 0, ovx: 0, ovy: 0, h: 0,
             sz: rnd(0.8, 1.7) * (lite ? 1.15 : 1), ph: rnd(0, 6.28),
             sx: 0, sy: 0, sf: 1, sd: 1,
             s: sprites[r < 0.36 ? 1 : (r < 0.58 ? 2 : (r < 0.73 ? 3 : (r < 0.85 ? 6 : (r < 0.91 ? 7 : 0))))] };
  }

  // Send dots to a layout's points. Matching left-to-right keeps morphs flowing.
  function assign(L, spread) {
    var T = L.pts, n = T.length, k;
    while (P.length < n) P.push(newParticle());
    var order = P.slice().sort(function (a, b) { return a.x - b.x; });
    var tord = T.slice().sort(function (a, b) { return a.x - b.x; });
    for (k = 0; k < n; k++) {
      var p = order[k], tg = tord[k];
      p.px = tg.x; p.py = tg.y; p.pz = tg.z;
      if (!p.s0) p.s0 = p.s;
      p.ns = tg.c !== undefined ? sprites[tg.c] : p.s0;     // the logo recolours dots, other shapes restore them
      p.wake = t + rnd(0, spread); p.pend = true;
    }
  }
  function snapAll() {
    P.forEach(function (p) {
      p.x = p.tx = p.px; p.y = p.ty = p.py; p.z = p.tz = p.pz;
      p.vx = p.vy = p.vz = 0; p.pend = false; p.s = p.ns;
    });
  }

  // How long each shape stays formed. The intro word stays a bit longer so the
  // light sweep and headline reveal finish before the dots move on.
  function holdFor(name) {
    if (name === 'logo') return HOME_HOLD;
    if (name === INTRO_WORD) return WORD_HOLD + 1.0;
    return isWord(name) ? WORD_HOLD : SHAPE_HOLD;
  }

  function goTo(idx) {
    si = idx % SEQ.length;
    var name = SEQ[si];
    curL = getLayout(name);
    assign(curL, MORPH_SPREAD);
    tNextMorph = t + MORPH_SPREAD + 0.9 + holdFor(name);
    hudReadyAt = t + 1.0;                              // dots have mostly arrived by then
    hwFrom = hw; hwTo = hwTarget(curL); hwT0 = t + 0.15;  // the frame starts resizing with the dots
    if (name === INTRO_WORD && !revealed && sweepStart < 0) {
      sweepStart = t + MORPH_SPREAD + 0.7;
      sweepL = curL;                                   // the light band measures itself against this word
    }
  }

  /* ---------- build / run ---------- */
  function build() {
    W = c.clientWidth; H = c.clientHeight;
    resizeCanvas();
    crc = null;
    var cr0 = c.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    cx0 = sr.left - cr0.left + sr.width / 2;
    cy0 = sr.top - cr0.top + sr.height / 2;
    slotH = sr.height;
    // keep the shape (and its rings and HUD) inside the hero: clear of the navbar above and the headline below
    R3 = clamp(Math.min(slotH * 0.36, W * 0.28, (cy0 - 14) / 1.3), 70, 240);
    flatS = Math.max(40, Math.min(Math.ceil(slotH * 0.85), Math.floor(cy0 * 2 - 24)));   // same size the pictures are drawn at
    dkFlat = clamp(flatS / FLAT_REF, FLAT_MIN, 1);
    hw = 0;
    gen++; layouts = {};
    A = [];
    var cnt = Math.min(lite ? 40 : 90, Math.round(W * H / 18000));
    for (var i = 0; i < cnt; i++) {
      A.push({ x: rnd(0, W), y: rnd(0, H), size: rnd(1.5, 3.5), ph: rnd(0, 6.28), v: rnd(2, 7) });
    }
  }

  function run(formed) {
    if (raf) cancelAnimationFrame(raf);
    if (!started) { t0 = performance.now(); t = 0; last = 0; started = true; }
    build();
    P = []; sparks = []; sweepL = null;
    if (!formed && !reduce) si = 0;
    if (reduce) si = Math.max(0, SEQ.indexOf(STATIC_WORD));
    curL = getLayout(SEQ[si]);
    hudSi = si; hudReadyAt = t + INTRO_SPREAD + 0.5;
    hw = hwFrom = hwTo = hwTarget(curL); hwT0 = 0;
    if (formed || reduce) {
      assign(curL, 0); snapAll();
      wordness = is3D(SEQ[si]) ? 0 : 1;
      hudWord = wordness; hudReadyAt = 0;
      sweepStart = -1; tNextMorph = t + 3;
      if (reduce) finishReveal();
    } else {
      assign(curL, INTRO_SPREAD);
      tNextMorph = t + INTRO_SPREAD + 1.8;
      // Only needed when the story opens on INTRO_WORD (goTo() starts the reveal for every later word).
      if (SEQ[si] === INTRO_WORD && !revealed && sweepStart < 0) {
        sweepStart = t + INTRO_SPREAD + 0.4;
        sweepL = curL;
      }
    }
    if (!reduce) { var g = gen; setTimeout(function () { precompute(g); }, 1200); }
    raf = requestAnimationFrame(draw);
  }

  /* ---------- frame ---------- */
  function draw(now) {
    // at the lowest quality level, draw every other frame (about 30 fps)
    if (q >= 2 && last && now - last < 30) { raf = visible ? requestAnimationFrame(draw) : null; return; }

    t = (now - t0) / 1000;
    var rawDt = last ? now - last : 16.7;
    var dt = Math.min(0.033, rawDt / 1000);
    last = now;

    // governor: if more than half of the last 60 frames were slow, drop a quality level
    if (!reduce && q < 2 && rawDt < 200) {
      winFrames++;
      if (rawDt > 24) slowFrames++;
      if (winFrames >= 60) {
        if (slowFrames > 30) setQuality(q + 1);
        winFrames = 0; slowFrames = 0;
      }
    }

    var i, p, k, cr = crc || (crc = c.getBoundingClientRect());

    // shape timeline (only moves on once the next layout is ready)
    if (!reduce && t >= tNextMorph) {
      if (!layouts[SEQ[(si + 1) % SEQ.length]]) tNextMorph = t + 0.3;
      else goTo(si + 1);
    }

    // light sweep + headline reveal
    // One band drives everything: it crosses the word, and the headline is revealed
    // (with its glow and sparks) in the same screen column as the band, so they stay in sync.
    var bandX = null, glowX = null, glowRc = null;
    if (sweepStart >= 0 && t >= sweepStart) {
      var s = t - sweepStart;
      var sl = sweepL || curL;                          // band is locked to the word it started on
      var nameR = clamp(s / SWEEP);
      if (nameR > 0 && nameR < 1) bandX = cx0 + sl.minX - 80 + nameR * (sl.maxX - sl.minX + 160);
      if (!revealed) {
        if (hl && bandX !== null) {
          var rc = hl.getBoundingClientRect();
          var frac = (bandX - (rc.left - cr.left)) / Math.max(1, rc.width);   // band position along the headline
          setReveal(clamp((frac + 0.15) / 1.3));        // the mask edge sits exactly at the band
          if (frac > -0.05 && frac < 1.05) {            // band is over the headline: glow + sparks
            glowX = bandX; glowRc = rc;
            for (k = 0; k < SPARK_RATE; k++) {
              sparks.push({ x: bandX + rnd(-6, 6), y: rnd(rc.top - cr.top, rc.bottom - cr.top), vx: rnd(-40, 40),
                            vy: rnd(-60, 20), life: 1, sz: rnd(3, 6), s: sprites[(Math.random() * 3) | 0] });
            }
          }
        }
        if (nameR >= 1) finishReveal();                 // band has left the word: headline is fully shown
      }
      if (s > SWEEP + 0.6) sweepStart = -1;
    }

    // cursor, relative to the hero canvas
    mAct += ((mIn ? 1 : 0) - mAct) * Math.min(1, dt * 6);
    if (mxs < -5000) { mxs = mx; mys = my; }
    else { var sm = Math.min(1, dt * 18); mxs += (mx - mxs) * sm; mys += (my - mys) * sm; }
    var lmx = mxs - cr.left, lmy = mys - cr.top;
    var R = clamp(fsRef * 0.45, 80, 180);

    // rotation: spin freely as a 3D shape, ease back upright for words
    var wTarget = is3D(SEQ[si]) ? 0 : 1;
    wordness += (wTarget - wordness) * Math.min(1, dt * 2.5);
    if (!reduce) {
      ang += SPIN * (1 - wordness) * dt;
      ang += (Math.round(ang / TAU) * TAU - ang) * Math.min(1, dt * 3) * wordness;
    }
    var tiltAmt = 0.9 - 0.55 * wordness;               // words tilt less so they stay readable
    var ttY = clamp((lmx - cx0) / Math.max(1, W) * 2, -1, 1) * tiltAmt * mAct;
    var ttX = clamp((lmy - cy0) / Math.max(1, H) * 2, -1, 1) * -tiltAmt * 0.7 * mAct;
    tiltY += (ttY - tiltY) * Math.min(1, dt * 4);
    tiltX += (ttX - tiltX) * Math.min(1, dt * 4);
    var ay = ang + tiltY, ca = Math.cos(ay), sa = Math.sin(ay), cb = Math.cos(tiltX), sb = Math.sin(tiltX);
    cA = ca; sA = sa; cB = cb; sB = sb;
    uiFade = reduce ? 1 : clamp((t - 1.2) / 1.6);      // rings, links and HUD fade in after the intro

    // ---- draw ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // soft glow behind the shape
    var gl = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, R3 * 1.8);
    gl.addColorStop(0, 'rgba(61,139,255,0.12)');
    gl.addColorStop(0.55, 'rgba(155,123,255,0.04)');
    gl.addColorStop(1, 'rgba(61,139,255,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = gl;
    ctx.fillRect(cx0 - R3 * 1.8, cy0 - R3 * 1.8, R3 * 3.6, R3 * 3.6);

    // faint drifting dust
    for (i = 0; i < A.length; i += (q >= 1 ? 2 : 1)) {
      var a = A[i];
      var ay2 = reduce ? a.y : ((a.y - t * a.v) % H + H) % H;
      dot(a.x, ay2, a.size, 0.2 + 0.15 * Math.sin(t * 1.4 + a.ph), sprites[0]);
    }

    // orbital rings with satellites (they fade away while a word is showing)
    if (t >= hudReadyAt) hudSi = si;
    hudWord += ((is3D(SEQ[hudSi]) ? 0 : 1) - hudWord) * Math.min(1, dt * 3);
    dk += ((isFlat(SEQ[hudSi]) ? dkFlat : 1) - dk) * Math.min(1, dt * 3);
    var shapeAmt = (1 - hudWord * 0.85) * uiFade, ri, rr, seg, sat, rd, cta, sta, ctb, stb, u;
    if (shapeAmt > 0.02) {
      ctx.strokeStyle = 'rgb(125,249,255)';
      ctx.lineWidth = 1;
      for (ri = 0; ri < RINGS.length; ri++) {
        rr = RINGS[ri];
        cta = Math.cos(rr.tx); sta = Math.sin(rr.tx); ctb = Math.cos(rr.tz); stb = Math.sin(rr.tz);
        rd = rr.r * R3;
        ctx.beginPath();
        for (seg = 0; seg <= 72; seg++) {
          ringPoint(rd, seg / 72 * TAU, cta, sta, ctb, stb);
          if (seg === 0) ctx.moveTo(pj.x, pj.y); else ctx.lineTo(pj.x, pj.y);
        }
        if (rr.dash) { ctx.setLineDash([2, 7]); ctx.lineDashOffset = -t * rr.speed * 30; }
        ctx.globalAlpha = rr.a * shapeAmt;
        ctx.stroke();
        if (rr.dash) ctx.setLineDash([]);
        for (sat = 0; sat < rr.sats; sat++) {
          u = t * rr.speed + sat * TAU / rr.sats;
          ringPoint(rd, u, cta, sta, ctb, stb);
          dot(pj.x, pj.y, 9 * pj.f, 0.8 * shapeAmt, sprites[1]);
          dot(pj.x, pj.y, 3.5 * pj.f, shapeAmt, sprites[0]);
        }
      }
    }

    // hologram scan line position (dots near it light up)
    var scanY = cy0 - R3 * 1.25 + ((t / SCAN_PERIOD) % 1) * R3 * 2.5;

    // dots: spring to target in 3D, rotate, project, then push away from the cursor
    var D = 2 * 0.7 * Math.sqrt(SPRING);
    var Rz = R3 * 1.2, R2 = R * R * 1.7;
    for (i = 0; i < P.length; i++) {
      p = P[i];
      if (p.pend && t >= p.wake) { p.tx = p.px; p.ty = p.py; p.tz = p.pz; p.pend = false; p.s = p.ns; }
      p.vx += ((p.tx - p.x) * SPRING - p.vx * D) * dt;
      p.vy += ((p.ty - p.y) * SPRING - p.vy * D) * dt;
      p.vz += ((p.tz - p.z) * SPRING - p.vz * D) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

      // rotate about Y, then tilt about X, then project
      var x1 = p.x * ca + p.z * sa, z1 = -p.x * sa + p.z * ca;
      var y1 = p.y * cb - z1 * sb, z2 = p.y * sb + z1 * cb;
      var f = PERSP / Math.max(60, PERSP + z2);
      var sx = cx0 + x1 * f + p.ox, sy = cy0 + y1 * f + p.oy;

      // cursor push (screen space) with a spring back to rest
      var oax = -p.ox * 10 - p.ovx * 5, oay = -p.oy * 10 - p.ovy * 5;
      p.h = 0;
      if (CURSOR_PUSH && mAct > 0.01) {
        var ddx = sx - lmx, ddy = sy - lmy, d2 = ddx * ddx + ddy * ddy;
        if (d2 < R2) {
          var dd = Math.sqrt(d2) || 0.01, fo = 1 - dd / R;
          if (fo > 0) { var F = REPEL * fo * fo * mAct; oax += ddx / dd * F; oay += ddy / dd * F; }
          var hh = clamp(1 - dd / (R * 1.3));
          p.h = hh * hh * mAct;
        }
      }
      p.ovx += oax * dt; p.ovy += oay * dt;
      p.ox += p.ovx * dt; p.oy += p.ovy * dt;

      // look: nearer dots are bigger and brighter; travelling dots are dimmer
      var ex = p.tx - p.x, ey = p.ty - p.y, ez = p.tz - p.z;
      var settle = 1 - clamp(Math.sqrt(ex * ex + ey * ey + ez * ez) / 160);
      var tw = reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 2 + p.ph);
      var dep = clamp(0.72 - 0.5 * z2 / Rz, 0.18, 1);
      var b = bandX !== null ? Math.exp(-Math.pow((sx - bandX) / 60, 2)) : 0;
      var sc = SCAN ? Math.exp(-Math.pow((sy - scanY) / 22, 2)) * uiFade : 0;
      var al = 0.8 * dep * (0.35 + 0.65 * settle) * (1 - settle * 0.25 + settle * 0.25 * tw) * (1 + 1.1 * p.h + 1.3 * b + 1.8 * sc);
      var sz = p.sz * 2.6 * f * dk * (0.85 + 0.15 * settle) * (1 + 0.6 * p.h + 0.7 * b + 0.5 * sc);
      p.sx = sx; p.sy = sy; p.sf = f; p.sd = dep;
      dot(sx, sy, sz, Math.min(1, al * (0.55 + 0.45 * dk)), p.s);
    }

    // network: a handful of bright nodes joined by thin lines when they drift close
    var nNodes = lite ? NODES_LITE : NODES_DESKTOP;
    if (nNodes > 0 && uiFade > 0.02 && q < 2) {
      var ns = [], stp = Math.max(1, Math.floor(P.length / nNodes)), a2, b2, nd;
      for (i = 0; i < P.length && ns.length < nNodes; i += stp) ns.push(P[i]);
      var link = clamp(R3 * 0.4, 45, 95), l2 = link * link;
      ctx.beginPath();
      for (i = 0; i < ns.length; i++) {
        a2 = ns[i];
        for (k = i + 1; k < ns.length; k++) {
          b2 = ns[k];
          var lx = a2.sx - b2.sx, ly = a2.sy - b2.sy;
          if (lx * lx + ly * ly < l2) { ctx.moveTo(a2.sx, a2.sy); ctx.lineTo(b2.sx, b2.sy); }
        }
      }
      ctx.strokeStyle = 'rgb(125,249,255)';
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = (0.14 + 0.1 * (1 - hudWord)) * uiFade;
      ctx.stroke();
      for (i = 0; i < ns.length; i++) {
        nd = ns[i];
        dot(nd.sx, nd.sy, 5.5 * nd.sf, Math.min(1, 0.9 * nd.sd) * uiFade, sprites[1]);
      }
    }

    // scan line
    var curName = SEQ[hudSi], moving = hudSi !== si;
    var hudL = layouts[curName] || curL;
    hh = R3 * 1.2;
    hw = hwFrom + (hwTo - hwFrom) * ease(clamp((t - hwT0) / 0.9));
    if (SCAN && uiFade > 0.02) {
      var sg = ctx.createLinearGradient(cx0 - hw, 0, cx0 + hw, 0);
      sg.addColorStop(0, 'rgba(125,249,255,0)');
      sg.addColorStop(0.5, 'rgba(125,249,255,0.55)');
      sg.addColorStop(1, 'rgba(125,249,255,0)');
      ctx.globalAlpha = 0.6 * uiFade;
      ctx.fillStyle = sg;
      ctx.fillRect(cx0 - hw, scanY - 0.75, hw * 2, 1.5);
    }

    // HUD: corner brackets and tiny readouts
    if (HUD && uiFade > 0.02 && !lite) {
      var bl = 18, hx0 = cx0 - hw, hx1 = cx0 + hw, hy0 = cy0 - hh, hy1 = cy0 + hh;
      ctx.beginPath();
      ctx.moveTo(hx0, hy0 + bl); ctx.lineTo(hx0, hy0); ctx.lineTo(hx0 + bl, hy0);
      ctx.moveTo(hx1 - bl, hy0); ctx.lineTo(hx1, hy0); ctx.lineTo(hx1, hy0 + bl);
      ctx.moveTo(hx0, hy1 - bl); ctx.lineTo(hx0, hy1); ctx.lineTo(hx0 + bl, hy1);
      ctx.moveTo(hx1 - bl, hy1); ctx.lineTo(hx1, hy1); ctx.lineTo(hx1, hy1 - bl);
      ctx.strokeStyle = 'rgb(125,249,255)';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.5 * uiFade;
      ctx.stroke();
      ctx.font = '10px "Courier New", monospace';
      ctx.fillStyle = '#7df9ff';
      ctx.globalAlpha = 0.6 * uiFade;
      var deg = ((((ang + tiltY) * 57.2958) % 360) + 360) % 360;
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText(moving ? '// RECONFIGURING...' : '// ' + (isWord(curName) ? 'WORD: ' : 'FORM: ') + curName.toUpperCase(), hx0 + 8, hy0 + 8);
      ctx.textAlign = 'right';
      ctx.fillText('PTS ' + P.length, hx1 - 8, hy0 + 8);
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      ctx.fillText('ROT ' + deg.toFixed(1) + '\u00B0', hx0 + 8, hy1 - 8);
      ctx.textAlign = 'right';
      ctx.fillText((Math.floor(t * 1.5) % 2 ? '\u25CF ' : '\u25CB ') + 'SYS.ONLINE', hx1 - 8, hy1 - 8);
    }

    // sweep glow on the headline + sparks
    if (glowX !== null && glowRc) {
      var gr = ctx.createLinearGradient(glowX - 40, 0, glowX + 40, 0);
      gr.addColorStop(0, 'rgba(125,249,255,0)');
      gr.addColorStop(0.5, 'rgba(125,249,255,0.45)');
      gr.addColorStop(1, 'rgba(125,249,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.fillRect(glowX - 40, glowRc.top - cr.top - 12, 80, glowRc.height + 24);
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      var sp = sparks[i];
      sp.life -= dt * SPARK_FADE;
      if (sp.life <= 0) { sparks.splice(i, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      dot(sp.x, sp.y, sp.sz * sp.life + 1, sp.life, sp.s);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    raf = (reduce || !visible) ? null : requestAnimationFrame(draw);
  }

  /* ---------- events ---------- */
  var fontReady = (document.fonts && document.fonts.load)
    ? document.fonts.load('700 100px Fraunces') : Promise.resolve();
  fontReady.then(function () { run(false); }, function () { run(false); });

  // Ignore height-only resizes (the mobile address bar showing/hiding while scrolling)
  var lastW = window.innerWidth, timer;
  window.addEventListener('resize', function () {
    crc = null;
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(function () { run(true); }, 200);
  });
  window.addEventListener('scroll', function () { crc = null; }, { passive: true });
  window.addEventListener('load', function () { crc = null; });

  // Stop drawing while the hero is off-screen (saves battery)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && started && !raf && !reduce) { last = 0; raf = requestAnimationFrame(draw); }
    }).observe(c);
  }

  if (!reduce) {
    window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; mIn = true; }, { passive: true });
    window.addEventListener('pointerup', function (e) { if (e.pointerType === 'touch') mIn = false; }, { passive: true });
    window.addEventListener('pointercancel', function () { mIn = false; }, { passive: true });
    root.addEventListener('mouseleave', function () { mIn = false; });
  }
})();