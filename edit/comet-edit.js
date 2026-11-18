/*
 * Comet Edit — a procedural, beat-synced "aesthetic anime edit" engine.
 *
 * Recreates the editing STYLE of vertical anime edits (sideways 16:9 shots in a
 * 9:16 frame, hard cut on every beat, slow push-ins, bloom, vignette, grain,
 * flash hits) using only original, code-drawn scenery. No external footage.
 *
 * Usage:
 *   const edit = new CometEdit(canvas, { bpm: 120, sideways: true, title: 'NAME' });
 *   edit.play();            // realtime loop
 *   edit.renderFrame(t);    // deterministic frame at time t (seconds) — used for export
 */
(function (global) {
  'use strict';

  const LW = 1280, LH = 720;              // landscape "footage" size
  const TAU = Math.PI * 2;

  // ---------- utils ----------
  function rng(seed) {                     // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function softDot(ctx, x, y, r, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Anime-style cumulus: shadowed body + lit crown, built from overlapping puffs.
  function cloud(ctx, r, x, y, w, h, body, lit, rim) {
    const puffs = [];
    const n = Math.round(14 + w / 18);
    for (let i = 0; i < n; i++) {
      const u = r();
      const px = x + (u - 0.5) * w;
      const bulge = Math.sin(u * Math.PI);
      const py = y - r() * h * bulge;
      const pr = (h * 0.28 + r() * h * 0.35) * (0.55 + bulge * 0.6);
      puffs.push([px, py, pr]);
    }
    // flat-ish base
    ctx.fillStyle = body;
    puffs.forEach(([px, py, pr]) => { ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill(); });
    ctx.fillRect(x - w * 0.45, y - h * 0.1, w * 0.9, h * 0.18);
    // lit crowns, offset toward light (up)
    ctx.fillStyle = lit;
    puffs.forEach(([px, py, pr]) => {
      ctx.beginPath(); ctx.arc(px - pr * 0.12, py - pr * 0.28, pr * 0.72, 0, TAU); ctx.fill();
    });
    if (rim) {
      ctx.fillStyle = rim;
      puffs.forEach(([px, py, pr]) => {
        ctx.beginPath(); ctx.arc(px - pr * 0.2, py - pr * 0.5, pr * 0.42, 0, TAU); ctx.fill();
      });
    }
  }
  function cloudLayer(seed, count, yMin, yMax, sMin, sMax, body, lit, rim, w = LW * 1.3, h = LH * 1.3) {
    const c = mk(w, h), x = c.getContext('2d'), r = rng(seed);
    for (let i = 0; i < count; i++) {
      const cw = lerp(sMin, sMax, r());
      cloud(x, r, r() * w, lerp(yMin, yMax, r()) * h, cw, cw * (0.35 + r() * 0.25), body, lit, rim);
    }
    return c;
  }
  function starField(seed, n, w = LW * 1.3, h = LH * 1.3, maxY = 1) {
    const c = mk(w, h), x = c.getContext('2d'), r = rng(seed);
    for (let i = 0; i < n; i++) {
      const sx = r() * w, sy = Math.pow(r(), 1.4) * h * maxY, s = r();
      x.fillStyle = `rgba(${220 + s * 35},${225 + s * 30},255,${0.35 + s * 0.65})`;
      x.fillRect(sx, sy, s > 0.92 ? 2 : 1, s > 0.92 ? 2 : 1);
      if (s > 0.97) softDot(x, sx, sy, 6, 'rgba(200,210,255,0.6)');
    }
    return c;
  }

  // ---------- scenes (all drawn in landscape LW x LH space) ----------
  // Each factory returns draw(ctx, p, t, opt) — p = 0..1 progress through the shot.
  const SCENES = {};

  // 1. Starry night + comet splitting across the sky
  SCENES.cometNight = function () {
    const sky = mk(LW, LH), s = sky.getContext('2d');
    s.fillStyle = grad(s, 0, 0, 0, LH, [[0, '#040817'], [0.55, '#0b1634'], [1, '#22325e']]);
    s.fillRect(0, 0, LW, LH);
    const stars = starField(11, 900);
    const clouds = cloudLayer(21, 9, 0.55, 1.05, 160, 360, '#1d2b55', '#33477e', 'rgba(150,170,230,0.55)');
    return function (ctx, p, t, o) {
      ctx.drawImage(sky, 0, 0);
      ctx.drawImage(stars, -p * 30, -20);
      comet(ctx, p, o.flip);
      ctx.drawImage(clouds, -120 - p * 60, -LH * 0.15);
    };
  };
  function comet(ctx, p, flip) {
    ctx.save();
    if (flip) { ctx.translate(LW, 0); ctx.scale(-1, 1); }
    const head = 0.45 + p * 0.25;
    const P = u => {                       // quadratic path
      const x0 = -100, y0 = 40, cx = 700, cy = 60, x1 = 1350, y1 = 760;
      const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1];
    };
    const trail = (off, width, color, blur, len) => {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = head - len + (len * i) / 40;
        const [x, y] = P(u);
        i ? ctx.lineTo(x + off * (1 - i / 40) * 40, y - off * (1 - i / 40) * 10)
          : ctx.moveTo(x + off * 40, y - off * 10);
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
      if (blur) {                          // cheap glow: wider, fainter passes instead of a blur filter
        ctx.globalAlpha = 0.35; ctx.lineWidth = width + blur * 1.2; ctx.stroke();
        ctx.globalAlpha = 0.15; ctx.lineWidth = width + blur * 2.6; ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };
    ctx.globalCompositeOperation = 'lighter';
    trail(0, 46, 'rgba(90,70,255,0.25)', 18, 0.45);
    trail(0, 14, 'rgba(140,150,255,0.6)', 5, 0.42);
    trail(0, 3, 'rgba(235,240,255,1)', 0, 0.4);
    trail(0.9, 6, 'rgba(170,120,255,0.45)', 4, 0.22);     // the split fragment
    trail(0.9, 1.5, 'rgba(255,230,255,0.9)', 0, 0.2);
    const [hx, hy] = P(head);
    softDot(ctx, hx, hy, 26, 'rgba(255,255,255,0.9)');
    const [fx, fy] = P(head - 0.02);
    softDot(ctx, fx + 0.9 * 40 * 0.05, fy, 10, 'rgba(255,90,110,0.95)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // 2. Golden-hour sea of clouds with a faint halo ring
  SCENES.goldenHalo = function () {
    const sky = mk(LW, LH), s = sky.getContext('2d');
    s.fillStyle = grad(s, 0, 0, 0, LH, [[0, '#4b3a6b'], [0.35, '#c77a74'], [0.6, '#f0a46a'], [1, '#f7c88e']]);
    s.fillRect(0, 0, LW, LH);
    const sea = cloudLayer(31, 26, 0.55, 1.1, 220, 420, '#b5647a', '#ef9e78', 'rgba(255,214,160,0.8)');
    const high = cloudLayer(32, 6, 0.05, 0.3, 200, 380, 'rgba(120,80,130,0.5)', 'rgba(230,150,140,0.6)', null);
    return function (ctx, p, t, o) {
      ctx.drawImage(sky, 0, 0);
      ctx.drawImage(high, -p * 40, -60);
      softDot(ctx, LW * 0.7, LH * 0.52, 360, 'rgba(255,220,170,0.75)');
      ctx.drawImage(sea, -150 + p * 70, -LH * 0.2);
      // halo ring
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,190,255,0.35)';
      ctx.beginPath(); ctx.ellipse(LW * 0.62, LH * 0.5, 330 + p * 30, 330 + p * 30, 0, 0, TAU);
      ctx.lineWidth = 4; ctx.stroke(); ctx.lineWidth = 12; ctx.globalAlpha = 0.3; ctx.stroke();
      ctx.restore();
    };
  };

  // 3. Overhead city — dense blocks, long shadows, slow pan
  SCENES.cityAerial = function () {
    const W = LW * 1.5, H = LH * 1.5;
    const c = mk(W, H), x = c.getContext('2d'), r = rng(41);
    x.fillStyle = '#7c838d'; x.fillRect(0, 0, W, H);
    for (let gx = 0; gx < W; gx += 120) for (let gy = 0; gy < H; gy += 110) {
      for (let k = 0; k < 6; k++) {
        const bw = 18 + r() * 46, bh = 16 + r() * 40, tall = r();
        const bx = gx + 8 + r() * (100 - bw), by = gy + 8 + r() * (92 - bh);
        const sh = 6 + tall * 34;
        x.fillStyle = 'rgba(30,34,46,0.55)';                 // shadow
        x.fillRect(bx + sh * 0.6, by + sh, bw, bh);
        const tone = 170 + r() * 70;
        x.fillStyle = r() < 0.08 ? '#c95c4f' : `rgb(${tone},${tone + 4},${tone + 10})`;
        x.fillRect(bx, by, bw, bh);
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(bx, by, bw, 2);
      }
      if (r() < 0.1) { x.fillStyle = '#5f7a4c'; x.fillRect(gx + 10, gy + 10, 90, 80); }
    }
    x.fillStyle = '#5a6069';
    for (let gx = 0; gx < W; gx += 120) x.fillRect(gx, 0, 6, H);
    for (let gy = 0; gy < H; gy += 110) x.fillRect(0, gy, W, 6);
    return function (ctx, p) {
      ctx.drawImage(c, -p * 140 - 60, -p * 60 - 80);
      ctx.fillStyle = grad(ctx, 0, 0, LW, 0, [[0, 'rgba(255,240,220,0.25)'], [1, 'rgba(120,150,200,0.15)']]);
      ctx.fillRect(0, 0, LW, LH);
    };
  };

  // 4. Night skyline under the comet
  SCENES.cityNight = function () {
    const sl = mk(LW * 1.2, LH), x = sl.getContext('2d'), r = rng(51);
    let bx = 0;
    while (bx < sl.width) {
      const bw = 30 + r() * 80, bh = 60 + Math.pow(r(), 2) * 280;
      x.fillStyle = '#0a0f22';
      x.fillRect(bx, LH - bh, bw, bh);
      for (let wy = LH - bh + 8; wy < LH; wy += 9) for (let wx = bx + 4; wx < bx + bw - 4; wx += 7)
        if (r() < 0.28) { x.fillStyle = r() < 0.7 ? 'rgba(255,214,150,0.85)' : 'rgba(170,200,255,0.8)'; x.fillRect(wx, wy, 3, 4); }
      bx += bw + r() * 6;
    }
    const night = SCENES.cometNight();
    return function (ctx, p, t, o) {
      night(ctx, p, t, o);
      ctx.fillStyle = grad(ctx, 0, LH * 0.5, 0, LH, [[0, 'rgba(120,90,200,0)'], [1, 'rgba(120,90,200,0.45)']]);
      ctx.fillRect(0, 0, LW, LH);
      ctx.drawImage(sl, -p * 50, 30);
    };
  };

  // 5. Twilight ridge — two silhouettes against a violet horizon
  SCENES.twilight = function () {
    const c = mk(LW, LH), x = c.getContext('2d');
    x.fillStyle = grad(x, 0, 0, 0, LH, [[0, '#1b1d52'], [0.42, '#6c46a0'], [0.6, '#e49aa6'], [0.66, '#ffd2b0'], [0.7, '#7b5a96'], [1, '#2b2350']]);
    x.fillRect(0, 0, LW, LH);
    const sea = cloudLayer(61, 18, 0.72, 1.05, 200, 380, '#4a3a78', '#8a68a8', 'rgba(255,180,200,0.35)');
    const fig = (ctx, cx, base, s, lean) => {
      ctx.fillStyle = '#120f22';
      ctx.save(); ctx.translate(cx, base); ctx.rotate(lean);
      ctx.beginPath(); ctx.arc(0, -s * 1.62, s * 0.17, 0, TAU); ctx.fill();        // head
      ctx.beginPath(); ctx.roundRect(-s * 0.2, -s * 1.44, s * 0.4, s * 0.72, s * 0.08); ctx.fill(); // torso
      ctx.fillRect(-s * 0.16, -s * 0.76, s * 0.12, s * 0.76);                       // legs
      ctx.fillRect(s * 0.04, -s * 0.76, s * 0.12, s * 0.76);
      ctx.restore();
    };
    return function (ctx, p) {
      ctx.drawImage(c, 0, 0);
      ctx.drawImage(sea, -100 - p * 50, -LH * 0.15);
      ctx.fillStyle = '#17132c';
      ctx.beginPath(); ctx.moveTo(0, LH); ctx.quadraticCurveTo(LW * 0.5, LH * 0.78, LW, LH * 0.9); ctx.lineTo(LW, LH); ctx.fill();
      fig(ctx, LW * 0.44 + p * 10, LH * 0.84, 150, -0.02);
      fig(ctx, LW * 0.58 - p * 10, LH * 0.83, 140, 0.03);
    };
  };

  // 6. Bright summer sky over water, rooftop edge in foreground
  SCENES.summerSky = function () {
    const c = mk(LW, LH), x = c.getContext('2d');
    x.fillStyle = grad(x, 0, 0, 0, LH, [[0, '#2f6fcf'], [0.6, '#7fb8ee'], [0.75, '#cfe7fb'], [1, '#a9cde8']]);
    x.fillRect(0, 0, LW, LH);
    const big = cloudLayer(71, 7, 0.35, 0.75, 260, 520, '#b9c9e2', '#ffffff', null);
    const r = rng(72);
    const water = mk(LW * 1.2, LH * 0.25), w = water.getContext('2d');
    w.fillStyle = grad(w, 0, 0, 0, water.height, [[0, '#6aa3d6'], [1, '#2f5f96']]);
    w.fillRect(0, 0, water.width, water.height);
    for (let i = 0; i < 400; i++) { w.fillStyle = `rgba(255,255,255,${r()})`; w.fillRect(r() * water.width, r() * water.height, 2 + r() * 6, 1); }
    return function (ctx, p) {
      ctx.drawImage(c, 0, 0);
      ctx.drawImage(big, -200 - p * 80, -LH * 0.15);
      ctx.drawImage(water, -p * 30, LH * 0.78);
      ctx.fillStyle = '#c99c86'; ctx.fillRect(0, LH * 0.9, LW, LH * 0.1);   // rooftop ledge
      ctx.fillStyle = '#7a5a52'; ctx.fillRect(0, LH * 0.9, LW, 6);
    };
  };

  // 7. Golden street — sunlit tower facade, light leak
  SCENES.goldenStreet = function () {
    const c = mk(LW, LH), x = c.getContext('2d'), r = rng(81);
    x.fillStyle = grad(x, 0, 0, LW, LH, [[0, '#f6d3a0'], [0.6, '#d98a6b'], [1, '#6a4a6a']]);
    x.fillRect(0, 0, LW, LH);
    cloud(x, r, LW * 0.75, LH * 0.35, 520, 200, 'rgba(200,120,120,0.6)', 'rgba(255,220,180,0.7)', null);
    x.fillStyle = '#cfa27e'; x.fillRect(LW * 0.08, LH * 0.12, LW * 0.4, LH);
    for (let wy = LH * 0.15; wy < LH; wy += 22) for (let wx = LW * 0.1; wx < LW * 0.46; wx += 26) {
      x.fillStyle = r() < 0.2 ? '#fff1cf' : '#9d7468'; x.fillRect(wx, wy, 18, 12);
    }
    x.fillStyle = '#2b2233'; x.fillRect(LW * 0.55, LH * 0.25, 10, LH);   // signal pole
    x.fillRect(LW * 0.5, LH * 0.25, 70, 26);
    softDot(x, LW * 0.515, LH * 0.25 + 13, 14, '#ff3b3b');
    softDot(x, LW * 0.545, LH * 0.25 + 13, 9, 'rgba(80,255,170,0.7)');
    return function (ctx, p) {
      ctx.drawImage(c, 0, 0);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      softDot(ctx, LW * (0.95 - p * 0.1), LH * 0.1, 500, 'rgba(255,190,120,0.55)');
      ctx.restore();
    };
  };

  // 8. Night road — dashes rushing, sunset line on the horizon
  SCENES.nightRoad = function () {
    return function (ctx, p, t) {
      ctx.fillStyle = grad(ctx, 0, 0, 0, LH, [[0, '#0b0d1e'], [0.42, '#3a2a4a'], [0.46, '#e08a6a'], [0.5, '#1a1424'], [1, '#08080e']]);
      ctx.fillRect(0, 0, LW, LH);
      const vx = LW * 0.5, vy = LH * 0.48;
      ctx.fillStyle = '#16141f';
      ctx.beginPath(); ctx.moveTo(vx - 6, vy); ctx.lineTo(vx + 6, vy); ctx.lineTo(LW * 0.95, LH); ctx.lineTo(LW * 0.05, LH); ctx.fill();
      for (let i = 0; i < 10; i++) {
        const z = ((i / 10) + t * 1.6) % 1, z2 = z + 0.04;
        const y1 = lerp(vy, LH, z * z), y2 = lerp(vy, LH, z2 * z2);
        ctx.fillStyle = 'rgba(255,230,190,0.85)';
        ctx.beginPath(); ctx.moveTo(vx - z * 4, y1); ctx.lineTo(vx + z * 4, y1); ctx.lineTo(vx + z2 * 6, y2); ctx.lineTo(vx - z2 * 6, y2); ctx.fill();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      softDot(ctx, vx, vy, 260, 'rgba(255,140,100,0.35)');
      softDot(ctx, LW * 0.3, LH * 0.85, 220, 'rgba(255,220,160,0.35)');
      ctx.restore();
    };
  };

  // 9. Green hills, lake glint, out-of-focus foreground leaves
  SCENES.meadow = function () {
    const c = mk(LW * 1.2, LH), x = c.getContext('2d'), r = rng(91);
    x.fillStyle = grad(x, 0, 0, 0, LH, [[0, '#b7a7d6'], [0.35, '#f1c2c7'], [0.55, '#d7d6e6'], [1, '#9db4c6']]);
    x.fillRect(0, 0, c.width, LH);
    const hill = (y, amp, col, seed) => {
      const rr = rng(seed); x.fillStyle = col; x.beginPath(); x.moveTo(0, LH);
      for (let i = 0; i <= 24; i++) x.lineTo((c.width * i) / 24, y + Math.sin(i * 0.7 + rr() * 2) * amp - rr() * amp);
      x.lineTo(c.width, LH); x.fill();
    };
    hill(LH * 0.5, 30, '#8a97b8', 1);
    x.fillStyle = '#c6d3e8'; x.fillRect(0, LH * 0.58, c.width, LH * 0.06);      // lake
    hill(LH * 0.62, 40, '#6f8f5a', 2);
    hill(LH * 0.75, 50, '#4e7a3a', 3);
    for (let i = 0; i < 200; i++) softDot(x, r() * c.width, LH * (0.66 + r() * 0.34), 6 + r() * 14, `rgba(${40 + r() * 60},${90 + r() * 70},${40 + r() * 30},0.8)`);
    const fg = mk(LW, LH), f = fg.getContext('2d');
    f.filter = 'blur(14px)';
    for (let i = 0; i < 40; i++) { f.fillStyle = `rgba(${30 + r() * 40},${80 + r() * 60},40,0.9)`; f.beginPath(); f.arc(r() * LW * 0.35, LH * (0.65 + r() * 0.4), 40 + r() * 70, 0, TAU); f.fill(); }
    return function (ctx, p) {
      ctx.drawImage(c, -p * 60, 0);
      ctx.drawImage(fg, -p * 160, 0);
    };
  };

  // 10. Glass skyline — window mullions framing a lattice tower
  SCENES.glassTower = function () {
    const c = mk(LW, LH), x = c.getContext('2d'), r = rng(101);
    x.fillStyle = grad(x, 0, 0, 0, LH, [[0, '#4b8de0'], [0.6, '#bfdcf6'], [1, '#e9f2fb']]);
    x.fillRect(0, 0, LW, LH);
    cloud(x, r, LW * 0.8, LH * 0.62, 420, 140, '#c9d7ec', '#ffffff', null);
    let bx = 0;
    while (bx < LW) {
      const bw = 20 + r() * 50, bh = 40 + r() * 170, tone = 150 + r() * 70;
      x.fillStyle = `rgb(${tone},${tone + 6},${tone + 14})`; x.fillRect(bx, LH - bh, bw, bh);
      bx += bw + 2;
    }
    // lattice tower
    const tx = LW * 0.4, base = LH * 0.82, top = LH * 0.12;
    x.strokeStyle = '#d8412f'; x.lineWidth = 3;
    for (let i = 0; i <= 14; i++) {
      const y = lerp(base, top, i / 14), w = lerp(70, 6, Math.pow(i / 14, 0.7));
      x.strokeStyle = i % 2 ? '#f2f2f2' : '#d8412f';
      x.beginPath(); x.moveTo(tx - w, y); x.lineTo(tx + w, y); x.stroke();
      const y2 = lerp(base, top, (i + 1) / 14), w2 = lerp(70, 6, Math.pow((i + 1) / 14, 0.7));
      if (i < 14) { x.beginPath(); x.moveTo(tx - w, y); x.lineTo(tx + w2, y2); x.moveTo(tx + w, y); x.lineTo(tx - w2, y2); x.stroke(); }
    }
    x.beginPath(); x.moveTo(tx - 70, base); x.lineTo(tx - 6, top); x.moveTo(tx + 70, base); x.lineTo(tx + 6, top); x.stroke();
    return function (ctx, p) {
      ctx.drawImage(c, -p * 40, 0);
      ctx.fillStyle = '#1d2a33';                                  // window frame
      for (let mx = 0; mx < LW; mx += 160) ctx.fillRect(mx, 0, 8, LH * 0.42);
      ctx.fillRect(0, LH * 0.14, LW, 6); ctx.fillRect(0, LH * 0.28, LW, 6); ctx.fillRect(0, LH * 0.42, LW, 12);
      ctx.fillStyle = 'rgba(40,70,90,0.35)'; ctx.fillRect(0, 0, LW, LH * 0.42);
    };
  };

  // ---------- the edit (shot list) ----------
  // One shot per beat. `flash` = white hit on the cut, `zoom` = push-in amount.
  const SHOTS = [
    ['cometNight', { zoom: 0.10 }], ['cometNight', { zoom: 0.22, from: 1.12 }],
    ['goldenHalo', { flash: 1 }], ['goldenHalo', { zoom: 0.18, flip: 1 }],
    ['cityNight', {}], ['cityAerial', { zoom: 0.06 }], ['cityAerial', { zoom: 0.14, from: 1.1 }],
    ['meadow', { flash: 1 }], ['summerSky', {}],
    ['cometNight', { flip: 1, from: 1.2, zoom: 0.15 }], ['cometNight', { flip: 1, from: 1.4, zoom: 0.15 }],
    ['goldenStreet', { flash: 1 }], ['goldenStreet', { zoom: 0.16, from: 1.08 }],
    ['meadow', { zoom: 0.1 }], ['twilight', { flash: 1 }], ['twilight', { zoom: 0.14, from: 1.1 }],
    ['summerSky', { zoom: 0.08 }], ['cityAerial', { from: 1.25 }], ['cityAerial', { from: 1.4 }],
    ['nightRoad', {}], ['glassTower', { flash: 1 }], ['glassTower', { zoom: 0.12, from: 1.1 }],
    ['twilight', { from: 1.3 }], ['cometNight', { zoom: 0.3, flash: 1 }],
  ];

  class CometEdit {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ bpm: 120, sideways: true, title: '', subtitle: '', bloom: 0.55, grain: 0.06 }, opts);
      this.beat = 60 / this.o.bpm;
      this.duration = SHOTS.length * this.beat;
      this.buf = mk(LW, LH); this.b = this.buf.getContext('2d');
      this.small = mk(LW / 4, LH / 4); this.s = this.small.getContext('2d');
      this.scenes = {};
      for (const k in SCENES) this.scenes[k] = SCENES[k]();
      this.noise = mk(256, 256);
      const n = this.noise.getContext('2d'), id = n.createImageData(256, 256), r = rng(7);
      for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      n.putImageData(id, 0, 0);
      this._raf = null;
    }

    renderFrame(t) {
      t = ((t % this.duration) + this.duration) % this.duration;
      const idx = Math.floor(t / this.beat);
      const p = (t - idx * this.beat) / this.beat;
      const [name, so] = SHOTS[idx];
      const b = this.b;

      // --- shot, with push-in and a decaying cut-shake ---
      const from = so.from || 1.0, zoom = so.zoom != null ? so.zoom : 0.08;
      const sc = from + zoom * easeOut(p);
      const kick = Math.max(0, 1 - p * 6);
      const r = rng(idx * 97 + Math.floor(p * 60));
      b.save();
      b.translate(LW / 2 + (r() - 0.5) * 14 * kick, LH / 2 + (r() - 0.5) * 14 * kick);
      b.scale(sc, sc);
      b.translate(-LW / 2, -LH / 2);
      this.scenes[name](b, p, t, so);
      b.restore();

      // --- bloom: blurred downsample added back on top ---
      if (this.o.bloom) {
        this.s.filter = 'blur(6px)';
        this.s.drawImage(this.buf, 0, 0, this.small.width, this.small.height);
        this.s.filter = 'none';
        b.save(); b.globalCompositeOperation = 'screen'; b.globalAlpha = this.o.bloom;
        b.drawImage(this.small, 0, 0, LW, LH); b.restore();
      }
      // --- pink/violet halation tint + vignette ---
      b.save(); b.globalCompositeOperation = 'soft-light';
      b.fillStyle = 'rgba(255,170,210,0.25)'; b.fillRect(0, 0, LW, LH); b.restore();
      const v = b.createRadialGradient(LW / 2, LH / 2, LH * 0.35, LW / 2, LH / 2, LW * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,5,25,0.55)');
      b.fillStyle = v; b.fillRect(0, 0, LW, LH);
      // --- flash hit on the cut ---
      if (so.flash && p < 0.25) {
        b.fillStyle = `rgba(255,248,255,${(1 - p / 0.25) * 0.85})`; b.fillRect(0, 0, LW, LH);
      }
      // --- grain ---
      if (this.o.grain) {
        b.save(); b.globalAlpha = this.o.grain; b.globalCompositeOperation = 'overlay';
        b.fillStyle = b.createPattern(this.noise, 'repeat');
        b.translate(r() * 256, r() * 256); b.fillRect(-256, -256, LW + 512, LH + 512); b.restore();
      }

      // --- composite to output (sideways 9:16, or upright crop) ---
      const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
      c.save();
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      if (this.o.sideways && H > W) {
        c.translate(W, 0); c.rotate(Math.PI / 2);
        c.drawImage(this.buf, 0, 0, H, W);
      } else {
        const s2 = Math.max(W / LW, H / LH);
        c.drawImage(this.buf, (W - LW * s2) / 2, (H - LH * s2) / 2, LW * s2, LH * s2);
      }
      c.restore();
      this._title(t);
      return idx;
    }

    _title(t) {
      if (!this.o.title) return;
      const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
      const end = this.duration, inT = end - this.beat * 4;
      if (t < inT) return;
      const a = clamp((t - inT) / (this.beat * 1.5), 0, 1);
      c.save();
      c.globalAlpha = a;
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      c.shadowColor = 'rgba(180,140,255,0.9)'; c.shadowBlur = 24;
      const fs = Math.round(W * 0.085);
      c.font = `700 ${fs}px "Segoe UI", system-ui, sans-serif`;
      c.letterSpacing = `${Math.round(fs * 0.12)}px`;
      c.fillText(this.o.title, W / 2, H * 0.5);
      if (this.o.subtitle) {
        c.font = `400 ${Math.round(fs * 0.38)}px "Segoe UI", system-ui, sans-serif`;
        c.letterSpacing = `${Math.round(fs * 0.2)}px`;
        c.fillText(this.o.subtitle, W / 2, H * 0.5 + fs * 0.9);
      }
      c.restore();
    }

    play() {
      if (this._raf) return;
      const start = performance.now() - (this._t || 0) * 1000;
      const loop = now => {
        this._t = (now - start) / 1000;
        this.renderFrame(this._t);
        if (this.onFrame) this.onFrame(this._t);
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    pause() { cancelAnimationFrame(this._raf); this._raf = null; }
    get playing() { return !!this._raf; }
  }

  CometEdit.SHOTS = SHOTS;
  CometEdit.SCENES = Object.keys(SCENES);
  global.CometEdit = CometEdit;
})(typeof window !== 'undefined' ? window : globalThis);
