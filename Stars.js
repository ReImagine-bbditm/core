/* Hero constellation: forms the club name, reacts to the cursor,
   morphs between words, then reveals the headline with a light sweep.
   Lives inside #hero-section only, pauses when scrolled out of view,
   and lowers its own quality on slow devices. */
(function () {
  var c = document.getElementById('stars');
  var slot = document.getElementById('stars-slot');
  if (!c || !slot) return;
  var ctx = c.getContext('2d');
  var root = document.documentElement;
  var hl = document.querySelector('[data-stars-reveal]');

  /* ---------- settings ---------- */
  var WORDS = ['ReImagine', 'Code', 'Design', 'Build', 'Create']; // first = intro word
  var COLORS = ['#ffffff', '#9fd0ff', '#4da3ff'];
  var LINE_COLOR = '140,196,255';
  var MAX_WIDTH = 0.92;     // name may fill this fraction of the hero width
  var OUTLINE_GAP = 38;     // higher = denser outline (lower = fewer stars = faster)
  var FILL_DENSITY = 2.3;   // lower = denser fill (higher = fewer stars = faster)
  var MAX_LINKS = 3;        // lines per star (2 = lighter)
  var SPRING = 14;          // how firmly stars return to their place
  var REPEL = 700;          // how hard the cursor pushes stars away
  var INTRO_SPREAD = 1.8;   // seconds over which stars launch at the start
  var MORPH_SPREAD = 0.7;   // same, when changing words
  var LINE_SWEEP = 1.5;     // seconds for lines to draw across a word
  var SWEEP = 1.4;          // duration of the light sweep / headline reveal
  var HOLD = 1.8;           // pause on each word (seconds)
  var HOME_HOLD = 4;        // pause on the club name

  var lite = window.matchMedia('(max-width: 768px)').matches;   // phones: lighter rendering
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) root.classList.add('stars-js');

  /* ---------- state ---------- */
  var W, H, dpr, cx0, cy0, slotH, fsRef = 200;
  var P = [], E = [], A = [], sparks = [], layouts = {}, curL = null, gen = 0;
  var t = 0, t0 = 0, last = 0, raf = null, started = false, visible = true;
  var wi = 0, phase = 0, tLineOut = 0, tNextMorph = 1e9, lineStart = 0;
  var sweepStart = -1, revealed = false;
  var mx = -9999, my = -9999, mxs = -9999, mys = -9999, mIn = false, mAct = 0;
  var q = 0, slowFrames = 0, winFrames = 0, dprCap = lite ? 1.5 : 2, crc = null;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(x, lo, hi) { return Math.min(hi === undefined ? 1 : hi, Math.max(lo === undefined ? 0 : lo, x)); }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

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

  function star(x, y, size, alpha, sp) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp, x - size, y - size, size * 2, size * 2);
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
  }
  setTimeout(finishReveal, 10000);   // failsafe: never leave the page hidden

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

  /* ---------- layout (star positions for a word) ---------- */
  // Spatial hash with numeric keys (much cheaper than string keys)
  function free(grid, cell, x, y, minD) {
    var gx = (x / cell) | 0, gy = (y / cell) | 0;
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
      var b = grid[(gy + j) * 4096 + gx + i];
      if (b) for (var k = 0; k < b.length; k++) {
        var dx = b[k].tx - x, dy = b[k].ty - y;
        if (dx * dx + dy * dy < minD * minD) return false;
      }
    }
    return true;
  }
  function put(grid, cell, n) {
    var key = ((n.ty / cell) | 0) * 4096 + ((n.tx / cell) | 0);
    (grid[key] = grid[key] || []).push(n);
  }

  var scratch = document.createElement('canvas').getContext('2d');
  function fontStr(s) { return '700 ' + s + 'px Fraunces, Georgia, serif'; }

  function computeLayout(word) {
    var fs = slotH * 0.85;
    scratch.font = fontStr(fs);
    var m = scratch.measureText(word).width;
    if (m > W * MAX_WIDTH) {
      fs *= (W * MAX_WIDTH) / m;
      scratch.font = fontStr(fs);
      m = scratch.measureText(word).width;
    }
    if (word === WORDS[0]) fsRef = fs;

    // only rasterize the area the word occupies
    var rx0 = Math.max(0, Math.floor(cx0 - m / 2 - 12)), rx1 = Math.min(W, Math.ceil(cx0 + m / 2 + 12));
    var ry0 = Math.max(0, Math.floor(cy0 - fs * 0.8)), ry1 = Math.min(H, Math.ceil(cy0 + fs * 0.8));
    var rw = rx1 - rx0, rh = ry1 - ry0;
    if (rw < 3 || rh < 3) return { pts: [], edges: [], minX: 0, maxX: 1 };

    var o = document.createElement('canvas');
    o.width = rw; o.height = rh;
    var oc = o.getContext('2d', { willReadFrequently: true });
    oc.font = fontStr(fs);
    oc.textAlign = 'center'; oc.textBaseline = 'middle'; oc.fillStyle = '#fff';
    oc.fillText(word, cx0 - rx0, cy0 - ry0);
    var d = oc.getImageData(0, 0, rw, rh).data;
    var mask = new Uint8Array(rw * rh), n0;
    for (n0 = 0; n0 < mask.length; n0++) mask[n0] = d[n0 * 4 + 3] > 128 ? 1 : 0;
    function inside(x, y) {
      x = x | 0; y = y | 0;
      return x >= rx0 && x < rx1 && y >= ry0 && y < ry1 && mask[(y - ry0) * rw + (x - rx0)] === 1;
    }

    var outD = Math.max(5, fs / OUTLINE_GAP), fillD = outD * FILL_DENSITY;
    var ssc = clamp(fs / 150, 0.8, 1.6);
    var pts = [], og = {}, fg = {}, x, y, i, j, k, big, n;

    // outline stars: letter edges
    var cand = [], lx, ly, idx;
    for (ly = 1; ly < rh - 1; ly++) for (lx = 1; lx < rw - 1; lx++) {
      idx = ly * rw + lx;
      if (mask[idx] && (!mask[idx - 1] || !mask[idx + 1] || !mask[idx - rw] || !mask[idx + rw])) cand.push(idx);
    }
    for (i = cand.length - 1; i > 0; i--) {
      j = (Math.random() * (i + 1)) | 0;
      var tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp;
    }
    for (i = 0; i < cand.length; i++) {
      x = cand[i] % rw + rx0; y = ((cand[i] / rw) | 0) + ry0;
      if (!free(og, outD, x, y, outD)) continue;
      big = Math.random() < 0.08;
      n = { tx: x, ty: y, big: big, fill: false, size: (big ? rnd(7, 10) : rnd(3.5, 5.5)) * ssc };
      pts.push(n); put(og, outD, n);
    }
    var nOut = pts.length;

    // fill stars: sparse and dim, inside the letters
    for (var tries = 0; tries < 12000; tries++) {
      x = rnd(rx0, rx1); y = rnd(ry0, ry1);
      if (!inside(x, y)) continue;
      if (!free(og, outD, x, y, outD * 1.1) || !free(fg, fillD, x, y, fillD)) continue;
      n = { tx: x, ty: y, big: false, fill: true, size: rnd(2, 3.5) * ssc };
      pts.push(n); put(fg, fillD, n);
    }

    // constellation lines along the outline (neighbours found via a grid, not all-pairs)
    var edges = [], seen = {}, maxL = outD * 2.1, minX = Infinity, maxX = -Infinity, eg = {};
    for (i = 0; i < nOut; i++) {
      minX = Math.min(minX, pts[i].tx); maxX = Math.max(maxX, pts[i].tx);
      var ek = ((pts[i].ty / maxL) | 0) * 4096 + ((pts[i].tx / maxL) | 0);
      (eg[ek] = eg[ek] || []).push(i);
    }
    for (i = 0; i < nOut; i++) {
      var near = [], egx = (pts[i].tx / maxL) | 0, egy = (pts[i].ty / maxL) | 0;
      for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
        var bucket = eg[(egy + b) * 4096 + egx + a];
        if (!bucket) continue;
        for (k = 0; k < bucket.length; k++) {
          j = bucket[k];
          if (j === i) continue;
          var dx = pts[i].tx - pts[j].tx, dy = pts[i].ty - pts[j].ty;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxL) near.push({ j: j, dist: dist });
        }
      }
      near.sort(function (p1, p2) { return p1.dist - p2.dist; });
      for (k = 0; k < Math.min(MAX_LINKS, near.length); k++) {
        var key = Math.min(i, near[k].j) + '_' + Math.max(i, near[k].j);
        if (seen[key]) continue;
        seen[key] = 1;
        var delay = ((pts[i].tx + pts[near[k].j].tx) / 2 - minX) / Math.max(1, maxX - minX) * LINE_SWEEP + rnd(0, 0.3);
        edges.push([i, near[k].j, delay]);
      }
    }
    return { pts: pts, edges: edges, minX: minX, maxX: maxX };
  }
  function getLayout(w) { return layouts[w] || (layouts[w] = computeLayout(w)); }

  // Build the other words one at a time, whenever the browser is idle
  function schedule(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 1500 });
    else setTimeout(fn, 400);
  }
  function precompute(g) {
    var i = 1;
    (function next() {
      if (g !== gen || i >= WORDS.length) return;
      var w = WORDS[i++];
      if (!layouts[w]) layouts[w] = computeLayout(w);
      schedule(next);
    })();
  }

  /* ---------- particles ---------- */
  function newParticle() {
    var x = rnd(0, W), y = rnd(0, H);
    return { x: x, y: y, vx: 0, vy: 0, tx: x, ty: y, px: x, py: y, pend: false, wake: 0,
             size: 2, ts: 2, ba: 0, tba: 1, big: false, free: true, fl: true, h: 0,
             ph: rnd(0, 6.28), s: sprites[(Math.random() * 3) | 0] };
  }

  // Send particles to a layout's points. Matching left-to-right keeps morphs flowing.
  function assign(L, spread) {
    var T = L.pts, tn = T.length, k;
    while (P.length < tn) P.push(newParticle());
    var order = P.slice().sort(function (a, b) { return a.x - b.x; });
    var tord = T.map(function (_, i) { return i; }).sort(function (a, b) { return T[a].tx - T[b].tx; });
    var pn = order.length, map = new Array(tn);
    P.forEach(function (p) { p.free = true; });
    for (k = 0; k < tn; k++) {
      var p = order[Math.floor(k * pn / tn)], ti = tord[k], tg = T[ti];
      p.free = false; map[ti] = p;
      p.px = tg.tx; p.py = tg.ty; p.ts = tg.size; p.tba = tg.fill ? 0.6 : 1; p.big = tg.big; p.fl = tg.fill;
      p.wake = t + rnd(0, spread); p.pend = true;
    }
    order.forEach(function (p) {          // spare stars drift off as background stars
      if (!p.free) return;
      p.px = rnd(0, W); p.py = rnd(0, H); p.ts = rnd(1.5, 3); p.tba = 0.28; p.big = false; p.fl = true;
      p.wake = t + rnd(0, spread); p.pend = true;
    });
    E = L.edges.map(function (e) { return { a: map[e[0]], b: map[e[1]], delay: e[2] }; });
  }
  function snapAll() {
    P.forEach(function (p) {
      p.x = p.tx = p.px; p.y = p.ty = p.py; p.vx = p.vy = 0;
      p.size = p.ts; p.ba = p.tba; p.pend = false;
    });
  }

  function morph() {
    wi = (wi + 1) % WORDS.length;
    curL = getLayout(WORDS[wi]);
    assign(curL, MORPH_SPREAD);
    lineStart = t + MORPH_SPREAD + 0.9;
    phase = 0;
    tNextMorph = lineStart + LINE_SWEEP + 1.0 + (wi === 0 ? HOME_HOLD : HOLD);
  }

  /* ---------- build / run ---------- */
  function build() {
    W = c.clientWidth; H = c.clientHeight;
    resizeCanvas();
    crc = null;
    // slot position relative to the hero canvas
    var cr0 = c.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    cx0 = sr.left - cr0.left + sr.width / 2;
    cy0 = sr.top - cr0.top + sr.height / 2;
    slotH = sr.height;
    gen++; layouts = {};
    A = [];
    var cnt = Math.min(lite ? 90 : 240, Math.round(W * H / 7000));
    for (var i = 0; i < cnt; i++) {
      A.push({ x: rnd(0, W), y: rnd(0, H), size: rnd(1.5, 4), ph: rnd(0, 6.28), v: rnd(2, 8),
               s: Math.random() < 0.8 ? sprites[0] : sprites[(Math.random() * 3) | 0] });
    }
  }

  function run(formed) {
    if (raf) cancelAnimationFrame(raf);
    if (!started) { t0 = performance.now(); t = 0; last = 0; started = true; }
    build();
    P = []; sparks = []; wi = 0; phase = 0;
    curL = getLayout(WORDS[0]);
    if (formed || reduce) {
      assign(curL, 0); snapAll();
      lineStart = -99; sweepStart = -1; tNextMorph = t + 3;
      if (reduce) finishReveal();
    } else {
      assign(curL, INTRO_SPREAD);
      lineStart = t + INTRO_SPREAD + 1.2;
      sweepStart = revealed ? -1 : lineStart + 1.8;
      tNextMorph = lineStart + 1.8 + SWEEP + 0.5 + 2.5;
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

    var i, p, ed, k, cr = crc || (crc = c.getBoundingClientRect());

    // word morph timeline (only starts once the next word's layout is ready)
    if (!reduce) {
      if (phase === 0 && t >= tNextMorph) {
        if (!layouts[WORDS[(wi + 1) % WORDS.length]]) tNextMorph = t + 0.3;
        else { phase = 1; tLineOut = t; }
      }
      if (phase === 1 && t >= tLineOut + 0.35) morph();
    }

    // light sweep + headline reveal
    var bandX = null, hR = 0, rE = 0;
    if (sweepStart >= 0) {
      var s = t - sweepStart;
      var nameR = clamp(s / SWEEP);
      hR = clamp((s - 0.35) / SWEEP);
      rE = ease(hR);
      if (nameR > 0 && nameR < 1) bandX = curL.minX - 80 + nameR * (curL.maxX - curL.minX + 160);
      if (!revealed) {
        setReveal(rE);
        if (hl && hR > 0 && hR < 1) {
          var rc = hl.getBoundingClientRect();
          var fx = rc.left - cr.left + rc.width * clamp(1.3 * rE - 0.15);
          for (k = 0; k < 3; k++) {
            sparks.push({ x: fx + rnd(-6, 6), y: rnd(rc.top - cr.top, rc.bottom - cr.top), vx: rnd(-40, 40),
                          vy: rnd(-60, 20), life: 1, sz: rnd(3, 6), s: sprites[(Math.random() * 3) | 0] });
          }
        }
        if (hR >= 1) finishReveal();
      }
      if (s > SWEEP + 0.6) sweepStart = -1;
    }

    // cursor, relative to the hero canvas
    mAct += ((mIn ? 1 : 0) - mAct) * Math.min(1, dt * 6);
    if (mxs < -5000) { mxs = mx; mys = my; }
    else { var sm = Math.min(1, dt * 18); mxs += (mx - mxs) * sm; mys += (my - mys) * sm; }
    var lmx = mxs - cr.left, lmy = mys - cr.top;
    var R = clamp(fsRef * 0.5, 90, 200);

    // physics: spring to target, pushed away by the cursor
    var D = 2 * 0.7 * Math.sqrt(SPRING);
    for (i = 0; i < P.length; i++) {
      p = P[i];
      if (p.pend && t >= p.wake) { p.tx = p.px; p.ty = p.py; p.pend = false; }
      var ax = (p.tx - p.x) * SPRING - p.vx * D, ay = (p.ty - p.y) * SPRING - p.vy * D;
      p.h = 0;
      if (mAct > 0.01) {
        var ddx = p.x - lmx, ddy = p.y - lmy, d2 = ddx * ddx + ddy * ddy;
        if (d2 < R * R * 1.7) {
          var dd = Math.sqrt(d2) || 0.01, f = 1 - dd / R;
          if (f > 0) { var F = REPEL * f * f * mAct; ax += ddx / dd * F; ay += ddy / dd * F; }
          var hh = clamp(1 - dd / (R * 1.3));
          p.h = hh * hh * mAct;
        }
      }
      p.vx += ax * dt; p.vy += ay * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += (p.ts - p.size) * Math.min(1, dt * 3);
      p.ba += (p.tba - p.ba) * Math.min(1, dt * 2.5);
    }

    // ---- draw ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // background stars (half as many once quality drops)
    for (i = 0; i < A.length; i += (q >= 1 ? 2 : 1)) {
      var a = A[i];
      var ay2 = reduce ? a.y : ((a.y - t * a.v) % H + H) % H;
      star(a.x, ay2, a.size, 0.25 + 0.2 * Math.sin(t * 1.4 + a.ph), a.s);
    }

    // constellation lines: one path, stroked twice (glow, then thin)
    var vis = phase === 1 ? 1 - clamp((t - tLineOut) / 0.35) : 1;
    if (vis > 0 && E.length) {
      var pulse = 0.85 + 0.15 * Math.sin(t * 1.2);
      ctx.beginPath();
      for (i = 0; i < E.length; i++) {
        ed = E[i];
        var g = reduce ? 1 : clamp((t - lineStart - ed.delay) / 0.7);
        if (g <= 0) continue;
        ctx.moveTo(ed.a.x, ed.a.y);
        ctx.lineTo(ed.a.x + (ed.b.x - ed.a.x) * g, ed.a.y + (ed.b.y - ed.a.y) * g);
      }
      ctx.strokeStyle = 'rgb(' + LINE_COLOR + ')';
      if (q === 0) {                       // wide glow pass: first thing dropped on slow devices
        ctx.globalAlpha = 0.16 * pulse * vis;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.globalAlpha = (q === 0 ? 0.7 : 0.85) * pulse * vis;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      if (mAct > 0.02) {                   // lines near the cursor glow brighter
        ctx.beginPath();
        for (i = 0; i < E.length; i++) {
          ed = E[i];
          if (clamp((t - lineStart - ed.delay) / 0.7) < 0.95) continue;
          var mdx = (ed.a.x + ed.b.x) / 2 - lmx, mdy = (ed.a.y + ed.b.y) / 2 - lmy;
          if (mdx * mdx + mdy * mdy < R * R * 2.2) { ctx.moveTo(ed.a.x, ed.a.y); ctx.lineTo(ed.b.x, ed.b.y); }
        }
        ctx.globalAlpha = 0.9 * mAct * vis;
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#cfe6ff';
        ctx.stroke();
      }
    }

    // stars that form the words
    for (i = 0; i < P.length; i++) {
      p = P[i];
      if (q >= 2 && p.fl && p.h < 0.05) continue;     // lowest quality: skip dim fill stars
      var ex = p.tx - p.x, ey = p.ty - p.y;
      var settle = 1 - clamp(Math.sqrt(ex * ex + ey * ey) / 140);
      var tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t * 2 + p.ph);
      var b = (!p.free && bandX !== null) ? Math.exp(-Math.pow((p.x - bandX) / 60, 2)) : 0;
      var al = p.ba * (0.3 + 0.7 * settle) * (1 - settle + settle * tw) * (1 + 1.2 * p.h + 1.2 * b);
      var sz = Math.max(0.5, p.size) * (0.8 + 0.2 * settle) * (1 + 0.7 * p.h + 0.8 * b);
      star(p.x, p.y, sz, Math.min(1, al), p.s);
      if (p.big && !p.free && settle > 0.85) {
        var L2 = p.size * (1.5 + 0.5 * Math.sin(t * 2.4 + p.ph));
        ctx.globalAlpha = 0.6 * tw;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x - L2, p.y); ctx.lineTo(p.x + L2, p.y);
        ctx.moveTo(p.x, p.y - L2); ctx.lineTo(p.x, p.y + L2);
        ctx.stroke();
      }
    }

    // sweep glow on the headline + sparks
    if (hl && !revealed && hR > 0 && hR < 1) {
      var r2 = hl.getBoundingClientRect();
      var bx = r2.left - cr.left + r2.width * clamp(1.3 * rE - 0.15);
      var gr = ctx.createLinearGradient(bx - 40, 0, bx + 40, 0);
      gr.addColorStop(0, 'rgba(159,208,255,0)');
      gr.addColorStop(0.5, 'rgba(159,208,255,0.45)');
      gr.addColorStop(1, 'rgba(159,208,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.fillRect(bx - 40, r2.top - cr.top - 12, 80, r2.height + 24);
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      var sp = sparks[i];
      sp.life -= dt * 1.4;
      if (sp.life <= 0) { sparks.splice(i, 1); continue; }
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      star(sp.x, sp.y, sp.sz * sp.life + 1, sp.life, sp.s);
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