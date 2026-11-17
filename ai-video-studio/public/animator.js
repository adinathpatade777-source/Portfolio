// Flat motion-graphics animator: turns a JSON scene list into an animated video on a
// <canvas>, in the style of flat 2D explainer animations (solid backgrounds, small
// palettes, icons in circles, pop-in motion, growing charts, drawn-on paths).
// Everything runs in the browser; recording uses MediaRecorder.

export const PALETTES = {
  purple: { bgs: ["#6C5CE7", "#5B4BD6", "#7A6AF0"], ink: "#1E1E24", text: "#FFFFFF", sub: "#E4E0FF", accent: "#B9B0FF", accent2: "#FFFFFF", card: "#ECEAF7", skin: "#F0956B", shirt: "#4B3CC4", hair: "#1E1E24" },
  clean: { bgs: ["#FFFFFF", "#F7F7F9", "#FFFFFF"], ink: "#1E1E24", text: "#1E1E24", sub: "#6B6B76", accent: "#E3262E", accent2: "#1F6FD1", card: "#F0F0F3", skin: "#E9A37E", shirt: "#E3262E", hair: "#1E1E24" },
  warm: { bgs: ["#F3C66E", "#A8C863", "#FBF1DE"], ink: "#2A2A2A", text: "#2A2A2A", sub: "#5A5242", accent: "#F08A2E", accent2: "#7FA83F", card: "#FFF8EA", skin: "#F2B48A", shirt: "#7FA83F", hair: "#2A2A2A" },
  night: { bgs: ["#252B36", "#2E3542", "#1F242E"], ink: "#0F1218", text: "#FFFFFF", sub: "#B9C2D3", accent: "#4D8FD6", accent2: "#CFE8EC", card: "#3A4252", skin: "#F0B48E", shirt: "#3F78C2", hair: "#14171D" },
  sky: { bgs: ["#ECECEE", "#F4F4F6", "#E6E7EA"], ink: "#2B2B33", text: "#2B2B33", sub: "#6C6F78", accent: "#1A9BDB", accent2: "#F4CC5A", card: "#FFFFFF", skin: "#EAA98A", shirt: "#1A9BDB", hair: "#2B2B33" },
};

const SIZES = { portrait: [1080, 1920], landscape: [1920, 1080], square: [1080, 1080] };

// ---------- easing & timing ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOutBack = (t) => { const c = 1.70158; const x = t - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// progress of an element that starts at `start` seconds and takes `len` seconds
const prog = (t, start, len = 0.5) => clamp((t - start) / len);
const pop = (t, start, len = 0.55) => easeOutBack(prog(t, start, len));

// ---------- script parsing ----------
export function parseScript(text) {
  if (!text) throw new Error("Paste an animation script first.");
  let raw = String(text).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON found. The script must contain { \"scenes\": [...] }.");
  const data = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(data.scenes) || !data.scenes.length) throw new Error("The script has no scenes.");
  data.format = SIZES[data.format] ? data.format : "portrait";
  data.palette = PALETTES[data.palette] ? data.palette : "purple";
  data.scenes = data.scenes.map((s) => ({
    visual: "title",
    duration: 3,
    icons: [],
    items: [],
    ...s,
    duration: clamp(Number(s.duration) || 3, 1.5, 8),
  }));
  return data;
}

export function totalDuration(script) {
  return script.scenes.reduce((sum, s) => sum + s.duration, 0);
}

// ---------- drawing primitives ----------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function withTransform(ctx, x, y, scale, rot, fn) {
  if (scale <= 0.001) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot || 0);
  ctx.scale(scale, scale);
  fn();
  ctx.restore();
}
function wrapLines(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function drawText(ctx, text, x, y, { size, color, weight = 800, maxWidth, align = "center", alpha = 1, rise = 0 }) {
  if (!text || alpha <= 0) return 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.font = `${weight} ${size}px "Poppins", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((l, i) => ctx.fillText(l, x, y + rise + i * size * 1.18));
  ctx.restore();
  return lines.length * size * 1.18;
}

// Animated curvy arrow path that draws itself on (as in the reference videos).
function drawPath(ctx, pts, progress, color, width, arrow = true) {
  if (progress <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  const path = new Path2D();
  path.moveTo(pts[0][0], pts[0][1]);
  path.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
  const len = 4000;
  ctx.setLineDash([len, len]);
  ctx.lineDashOffset = len * (1 - progress);
  ctx.stroke(path);
  if (arrow && progress > 0.97) {
    const [x, y] = pts[3];
    const ang = Math.atan2(pts[3][1] - pts[2][1], pts[3][0] - pts[2][0]);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang - 0.5) * width * 5, y - Math.sin(ang - 0.5) * width * 5);
    ctx.lineTo(x - Math.cos(ang + 0.5) * width * 5, y - Math.sin(ang + 0.5) * width * 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

// Little sparkle stars that twinkle around highlighted objects.
function sparkle(ctx, x, y, s, color, t) {
  const k = 0.6 + 0.4 * Math.sin(t * 6);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? s * 0.25 : s;
    const a = (i * Math.PI) / 4;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------- icon set (original flat icons drawn with shapes, centred at 0,0, size s) ----------
function icon(ctx, name, s, P) {
  const n = String(name || "").toLowerCase();
  const ink = P.ink;
  const white = "#FFFFFF";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stroke = (w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(); };
  if (/coin|money|rupee|dollar|earn|cash|price/.test(n)) {
    circle(ctx, s * 0.08, s * 0.06, s * 0.5, ink);
    circle(ctx, 0, 0, s * 0.5, "#C9C2FF");
    circle(ctx, 0, 0, s * 0.38, "#B3AAF7");
    ctx.fillStyle = white;
    ctx.font = `800 ${s * 0.5}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(/rupee|₹/.test(n) ? "₹" : "$", 0, s * 0.02);
  } else if (/check|done|tick|yes|success/.test(n)) {
    circle(ctx, 0, 0, s * 0.5, "#7DB843");
    ctx.beginPath(); ctx.moveTo(-s * 0.22, 0); ctx.lineTo(-s * 0.05, s * 0.18); ctx.lineTo(s * 0.25, -s * 0.18);
    stroke(s * 0.11, white);
  } else if (/phone|mobile|app/.test(n)) {
    rr(ctx, -s * 0.28, -s * 0.5, s * 0.56, s, s * 0.09); ctx.fillStyle = ink; ctx.fill();
    rr(ctx, -s * 0.23, -s * 0.42, s * 0.46, s * 0.82, s * 0.05); ctx.fillStyle = white; ctx.fill();
    rr(ctx, -s * 0.16, -s * 0.3, s * 0.32, s * 0.08, s * 0.03); ctx.fillStyle = P.accent; ctx.fill();
    rr(ctx, -s * 0.16, -s * 0.16, s * 0.22, s * 0.06, s * 0.03); ctx.fillStyle = "#D8D8DE"; ctx.fill();
  } else if (/laptop|computer|pc|website|online/.test(n)) {
    rr(ctx, -s * 0.45, -s * 0.34, s * 0.9, s * 0.58, s * 0.05); ctx.fillStyle = ink; ctx.fill();
    rr(ctx, -s * 0.39, -s * 0.28, s * 0.78, s * 0.46, s * 0.02); ctx.fillStyle = white; ctx.fill();
    rr(ctx, -s * 0.55, s * 0.24, s * 1.1, s * 0.08, s * 0.03); ctx.fillStyle = ink; ctx.fill();
    circle(ctx, 0, -s * 0.05, s * 0.11, P.accent);
  } else if (/doc|file|note|paper|form|resume/.test(n)) {
    rr(ctx, -s * 0.34, -s * 0.46, s * 0.68, s * 0.92, s * 0.06); ctx.fillStyle = "#FFF7E6"; ctx.fill();
    ctx.fillStyle = P.accent;
    for (let i = 0; i < 4; i++) { rr(ctx, -s * 0.22, -s * 0.26 + i * s * 0.16, i === 3 ? s * 0.26 : s * 0.44, s * 0.06, s * 0.03); ctx.fill(); }
  } else if (/idea|bulb|tip|light|think/.test(n)) {
    circle(ctx, 0, -s * 0.1, s * 0.34, "#FFD45C");
    rr(ctx, -s * 0.15, s * 0.2, s * 0.3, s * 0.2, s * 0.05); ctx.fillStyle = ink; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.05); ctx.lineTo(0, s * 0.08); ctx.lineTo(s * 0.08, -s * 0.05); stroke(s * 0.05, "#E39A1C");
  } else if (/gear|setting|tool|auto|process/.test(n)) {
    ctx.fillStyle = "#B8BCC6";
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const r = i % 2 ? s * 0.38 : s * 0.5; const a = (i * Math.PI) / 8; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    circle(ctx, 0, 0, s * 0.16, white);
  } else if (/chart|graph|growth|grow|stats|data|analytics|sales/.test(n)) {
    const hs = [0.35, 0.55, 0.45, 0.8];
    hs.forEach((h, i) => { rr(ctx, -s * 0.45 + i * s * 0.24, s * 0.4 - s * h, s * 0.16, s * h, s * 0.03); ctx.fillStyle = i === 3 ? P.accent : ink; ctx.fill(); });
  } else if (/heart|love|like|health/.test(n)) {
    ctx.fillStyle = "#F0526A";
    ctx.beginPath(); ctx.moveTo(0, s * 0.42);
    ctx.bezierCurveTo(-s * 0.7, -s * 0.05, -s * 0.3, -s * 0.55, 0, -s * 0.18);
    ctx.bezierCurveTo(s * 0.3, -s * 0.55, s * 0.7, -s * 0.05, 0, s * 0.42); ctx.fill();
  } else if (/star|rating|best|top|review/.test(n)) {
    ctx.fillStyle = "#FFC93C"; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.22 : s * 0.5; const a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  } else if (/clock|time|hour|minute|schedule|fast/.test(n)) {
    circle(ctx, 0, 0, s * 0.48, ink); circle(ctx, 0, 0, s * 0.4, white);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.26); ctx.moveTo(0, 0); ctx.lineTo(s * 0.18, s * 0.08); stroke(s * 0.07, ink);
  } else if (/wallet|save|saving|budget|bank/.test(n)) {
    rr(ctx, -s * 0.48, -s * 0.3, s * 0.96, s * 0.66, s * 0.1); ctx.fillStyle = "#F08A5D"; ctx.fill();
    rr(ctx, -s * 0.36, -s * 0.46, s * 0.62, s * 0.3, s * 0.05); ctx.fillStyle = "#6CC46B"; ctx.fill();
    rr(ctx, s * 0.12, -s * 0.06, s * 0.4, s * 0.22, s * 0.08); ctx.fillStyle = "#D96F45"; ctx.fill();
    circle(ctx, s * 0.26, s * 0.05, s * 0.04, white);
  } else if (/mail|email|message|chat|comment/.test(n)) {
    rr(ctx, -s * 0.48, -s * 0.32, s * 0.96, s * 0.64, s * 0.08); ctx.fillStyle = white; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.44, -s * 0.26); ctx.lineTo(0, s * 0.06); ctx.lineTo(s * 0.44, -s * 0.26); stroke(s * 0.06, P.accent);
  } else if (/user|person|people|team|client|customer|friend/.test(n)) {
    circle(ctx, 0, 0, s * 0.5, P.card);
    circle(ctx, 0, -s * 0.1, s * 0.17, P.skin);
    ctx.beginPath(); ctx.arc(0, s * 0.42, s * 0.3, Math.PI, 0); ctx.fillStyle = P.shirt; ctx.fill();
  } else if (/lock|secure|safe|privacy|password/.test(n)) {
    ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.22, Math.PI, 0); stroke(s * 0.09, ink);
    rr(ctx, -s * 0.34, -s * 0.1, s * 0.68, s * 0.52, s * 0.08); ctx.fillStyle = "#FFC93C"; ctx.fill();
    circle(ctx, 0, s * 0.14, s * 0.07, ink);
  } else if (/calendar|day|date|week|plan/.test(n)) {
    rr(ctx, -s * 0.44, -s * 0.38, s * 0.88, s * 0.82, s * 0.08); ctx.fillStyle = white; ctx.fill();
    rr(ctx, -s * 0.44, -s * 0.38, s * 0.88, s * 0.22, s * 0.08); ctx.fillStyle = P.accent; ctx.fill();
    ctx.fillStyle = "#D8D8DE";
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { rr(ctx, -s * 0.3 + c * s * 0.22, -s * 0.06 + r * s * 0.2, s * 0.14, s * 0.12, s * 0.02); ctx.fill(); }
  } else if (/search|find|research|look/.test(n)) {
    ctx.beginPath(); ctx.arc(-s * 0.08, -s * 0.08, s * 0.28, 0, Math.PI * 2); stroke(s * 0.1, ink);
    ctx.beginPath(); ctx.moveTo(s * 0.13, s * 0.13); ctx.lineTo(s * 0.4, s * 0.4); stroke(s * 0.12, ink);
  } else if (/play|video|youtube|watch|reel/.test(n)) {
    rr(ctx, -s * 0.5, -s * 0.34, s, s * 0.68, s * 0.16); ctx.fillStyle = "#F03E3E"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.16); ctx.lineTo(s * 0.18, 0); ctx.lineTo(-s * 0.1, s * 0.16); ctx.fillStyle = white; ctx.fill();
  } else if (/home|house|room|decor|interior/.test(n)) {
    ctx.beginPath(); ctx.moveTo(-s * 0.48, -s * 0.02); ctx.lineTo(0, -s * 0.46); ctx.lineTo(s * 0.48, -s * 0.02); ctx.closePath(); ctx.fillStyle = P.accent; ctx.fill();
    rr(ctx, -s * 0.36, -s * 0.04, s * 0.72, s * 0.48, s * 0.03); ctx.fillStyle = "#FFF7E6"; ctx.fill();
    rr(ctx, -s * 0.08, s * 0.14, s * 0.16, s * 0.3, s * 0.02); ctx.fillStyle = ink; ctx.fill();
  } else if (/food|cook|recipe|meal|eat/.test(n)) {
    circle(ctx, 0, s * 0.05, s * 0.46, white); circle(ctx, 0, s * 0.05, s * 0.32, "#F7E3C3");
    circle(ctx, -s * 0.1, 0, s * 0.09, "#E8573F"); circle(ctx, s * 0.12, s * 0.08, s * 0.08, "#7DB843"); circle(ctx, 0, s * 0.18, s * 0.06, "#F4CC5A");
  } else if (/gift|holiday|party|celebrat|wedding/.test(n)) {
    rr(ctx, -s * 0.42, -s * 0.12, s * 0.84, s * 0.56, s * 0.05); ctx.fillStyle = P.accent; ctx.fill();
    rr(ctx, -s * 0.48, -s * 0.28, s * 0.96, s * 0.2, s * 0.05); ctx.fillStyle = "#F0526A"; ctx.fill();
    ctx.fillStyle = "#FFD45C"; ctx.fillRect(-s * 0.07, -s * 0.28, s * 0.14, s * 0.72);
  } else if (/rocket|launch|start|boost/.test(n)) {
    ctx.save(); ctx.rotate(Math.PI / 4);
    rr(ctx, -s * 0.16, -s * 0.48, s * 0.32, s * 0.72, s * 0.16); ctx.fillStyle = white; ctx.fill();
    circle(ctx, 0, -s * 0.18, s * 0.08, P.accent);
    ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.26); ctx.lineTo(0, s * 0.5); ctx.lineTo(s * 0.1, s * 0.26); ctx.fillStyle = "#FF9F43"; ctx.fill();
    ctx.restore();
  } else {
    // "ai", "magic", unknown: spark
    ctx.fillStyle = P.accent; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.14 : s * 0.5; const a = (i * Math.PI) / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    circle(ctx, s * 0.32, -s * 0.3, s * 0.08, P.accent2);
  }
}

function iconBadge(ctx, name, x, y, s, P, t, start, ring = true) {
  const k = pop(t, start);
  withTransform(ctx, x, y, k, 0, () => {
    if (ring) {
      circle(ctx, 0, 0, s * 0.72, P.accent2 === "#FFFFFF" ? "rgba(255,255,255,0.22)" : P.accent2);
      // dashed orbit ring
      ctx.save(); ctx.setLineDash([s * 0.08, s * 0.08]); ctx.lineDashOffset = -t * s * 0.3;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.86, 0, Math.PI * 2); ctx.strokeStyle = P.sub; ctx.globalAlpha = 0.5; ctx.lineWidth = s * 0.025; ctx.stroke(); ctx.restore();
    }
    const bob = Math.sin((t - start) * 2.4) * s * 0.04;
    ctx.translate(0, bob);
    icon(ctx, name, s * 0.9, P);
  });
}

// Flat character bust in a tilted card (original design in the spirit of the references).
function character(ctx, x, y, s, P, t, start) {
  const k = pop(t, start, 0.7);
  const bob = Math.sin((t - start) * 2) * s * 0.015;
  withTransform(ctx, x, y + bob, k, -0.08, () => {
    ctx.save();
    rr(ctx, -s * 0.5, -s * 0.55, s, s * 1.1, s * 0.08);
    ctx.fillStyle = P.card; ctx.fill(); ctx.clip();
    // shirt
    ctx.beginPath(); ctx.moveTo(-s * 0.48, s * 0.6); ctx.quadraticCurveTo(-s * 0.4, s * 0.12, 0, s * 0.1); ctx.quadraticCurveTo(s * 0.4, s * 0.12, s * 0.48, s * 0.6); ctx.fillStyle = P.shirt; ctx.fill();
    // neck + head
    rr(ctx, -s * 0.07, -s * 0.02, s * 0.14, s * 0.16, s * 0.04); ctx.fillStyle = P.skin; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -s * 0.17, s * 0.17, s * 0.2, 0, 0, Math.PI * 2); ctx.fillStyle = P.skin; ctx.fill();
    // hair
    ctx.beginPath(); ctx.ellipse(-s * 0.02, -s * 0.33, s * 0.19, s * 0.11, -0.2, 0, Math.PI * 2); ctx.fillStyle = P.hair; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s * 0.15, -s * 0.22, s * 0.06, s * 0.1, 0.2, 0, Math.PI * 2); ctx.fill();
    // glasses + smile (blink every few seconds)
    const blink = ((t - start) % 3.2) < 0.12;
    ctx.strokeStyle = P.ink; ctx.lineWidth = s * 0.012;
    ctx.beginPath(); ctx.arc(-s * 0.05, -s * 0.17, s * 0.045, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.08, -s * 0.17, s * 0.045, 0, Math.PI * 2); ctx.stroke();
    if (!blink) { circle(ctx, -s * 0.05, -s * 0.17, s * 0.012, P.ink); circle(ctx, s * 0.08, -s * 0.17, s * 0.012, P.ink); }
    ctx.beginPath(); ctx.arc(s * 0.02, -s * 0.08, s * 0.04, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  });
}

// ---------- scene renderers ----------
// Each receives (ctx, scene, t, L) where t is seconds since scene start and L is layout info.
const VISUALS = {
  title(ctx, sc, t, L) {
    const { W, H, P, u } = L;
    const icons = sc.icons.length ? sc.icons : ["spark"];
    icons.slice(0, 3).forEach((ic, i, arr) => {
      const x = W / 2 + (i - (arr.length - 1) / 2) * u * 26;
      iconBadge(ctx, ic, x, L.visualY, u * 16, P, t, 0.15 + i * 0.18);
    });
    sparkle(ctx, W / 2 + u * 30, L.visualY - u * 20, u * 3, P.accent2, t);
  },

  character(ctx, sc, t, L) {
    const { W, P, u } = L;
    const cx = W / 2 - u * 12;
    character(ctx, cx, L.visualY, u * 38, P, t, 0.1);
    iconBadge(ctx, sc.icons[0] || "coin", W / 2 + u * 26, L.visualY - u * 6, u * 11, P, t, 0.6, false);
    drawPath(ctx, [[cx - u * 22, L.visualY + u * 34], [cx, L.visualY + u * 30], [W / 2 + u * 16, L.visualY + u * 24], [W / 2 + u * 24, L.visualY + u * 8]], easeInOut(prog(t, 0.8, 1)), P.sub, u * 0.5);
    sparkle(ctx, W / 2 + u * 32, L.visualY - u * 16, u * 2.2, P.accent2, t);
  },

  "bar-chart"(ctx, sc, t, L) {
    const { W, P, u } = L;
    const vals = (sc.items.length ? sc.items.map(Number).filter((n) => !isNaN(n)) : []).slice(0, 7);
    const data = vals.length >= 3 ? vals : [35, 55, 70, 60, 75, 95];
    const max = Math.max(...data);
    const bw = u * 7, gap = u * 4, total = data.length * bw + (data.length - 1) * gap;
    const baseY = L.visualY + u * 22;
    ctx.fillStyle = P.sub; ctx.globalAlpha = 0.6; ctx.fillRect(W / 2 - total / 2 - u * 4, baseY, total + u * 8, u * 0.4); ctx.globalAlpha = 1;
    data.forEach((v, i) => {
      const h = (v / max) * u * 40 * easeOutBack(prog(t, 0.2 + i * 0.12, 0.6));
      const x = W / 2 - total / 2 + i * (bw + gap);
      rr(ctx, x, baseY - h, bw, h, u * 0.8); ctx.fillStyle = P.ink; ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.18; rr(ctx, x, baseY - h, bw * 0.45, h, u * 0.8); ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
    });
    drawPath(ctx, [[W / 2 - total / 2, baseY - u * 44], [W / 2 - u * 6, baseY - u * 56], [W / 2 + u * 6, baseY - u * 50], [W / 2 + total / 2 - u * 4, baseY - u * 50]], easeInOut(prog(t, 0.9, 1)), P.sub, u * 0.45);
    iconBadge(ctx, sc.icons[0] || "coin", W / 2 + total / 2 + u * 2, baseY - u * 58, u * 9, P, t, 1.6, false);
    sparkle(ctx, W / 2 + total / 2 + u * 9, baseY - u * 66, u * 2, P.accent2, t);
  },

  icons(ctx, sc, t, L) {
    const { W, P, u } = L;
    const list = (sc.icons.length ? sc.icons : ["idea", "phone", "coin"]).slice(0, 4);
    const n = list.length;
    const pts = list.map((_, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (n === 2 ? Math.PI / 2 : 0);
      return [W / 2 + Math.cos(a) * u * 26, L.visualY + Math.sin(a) * u * 22];
    });
    // colourful connecting strands
    const colors = [P.accent, P.accent2, "#F4CC5A", "#F0526A"];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if (n === 2 && i === 1) break;
      [0, 1, 2].forEach((k) => drawPath(ctx, [a, [a[0] + u * (8 + k * 3), a[1] + u * 14], [b[0] - u * (8 - k * 3), b[1] - u * 14], b], easeInOut(prog(t, 0.5 + i * 0.25, 0.9)), colors[k % colors.length], u * 0.35, false));
    }
    list.forEach((ic, i) => iconBadge(ctx, ic, pts[i][0], pts[i][1], u * 12, P, t, 0.1 + i * 0.25));
  },

  checklist(ctx, sc, t, L) {
    const { W, P, u } = L;
    const items = (sc.items.length ? sc.items : ["Step one", "Step two", "Step three"]).slice(0, 4);
    const rowH = u * 15;
    const top = L.visualY - ((items.length - 1) * rowH) / 2;
    const left = W / 2 - u * 34;
    items.forEach((it, i) => {
      const st = 0.2 + i * 0.45;
      const k = easeOutCubic(prog(t, st, 0.45));
      const y = top + i * rowH;
      ctx.save(); ctx.globalAlpha = k;
      rr(ctx, left + (1 - k) * u * 10, y - u * 5.5, u * 68, u * 11, u * 5.5); ctx.fillStyle = P.card; ctx.fill(); ctx.restore();
      withTransform(ctx, left + u * 6, y, pop(t, st + 0.25), 0, () => icon(ctx, "check", u * 8, P));
      drawText(ctx, it, left + u * 14, y - u * 3.2, { size: u * 5.4, color: P.ink, weight: 700, maxWidth: u * 52, align: "left", alpha: k });
    });
  },

  phone(ctx, sc, t, L) {
    const { W, P, u } = L;
    const k = easeOutCubic(prog(t, 0.05, 0.7));
    const x = W / 2, y = L.visualY + (1 - k) * u * 40;
    const tilt = -0.12 + Math.sin(t * 1.4) * 0.03;
    withTransform(ctx, x, y, 1, tilt, () => {
      // hand
      ctx.beginPath(); ctx.ellipse(u * 8, u * 24, u * 16, u * 22, -0.3, 0, Math.PI * 2); ctx.fillStyle = P.skin; ctx.fill();
      rr(ctx, -u * 15, -u * 30, u * 30, u * 58, u * 4); ctx.fillStyle = P.ink; ctx.fill();
      rr(ctx, -u * 13, -u * 27, u * 26, u * 52, u * 2.5); ctx.fillStyle = "#FFFFFF"; ctx.fill();
      for (let i = 0; i < 3; i++) { rr(ctx, -u * 9, u * 8 + i * u * 5, u * (i === 2 ? 10 : 18), u * 2.2, u * 1.1); ctx.fillStyle = "#E1E2E8"; ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(-u * 12, u * 6, u * 5, u * 10, 0.4, 0, Math.PI * 2); ctx.fillStyle = P.skin; ctx.fill(); // thumb
    });
    iconBadge(ctx, sc.icons[0] || "check", x, y - u * 10, u * 9, P, t, 0.7, false);
    // ripple rings
    const r = prog(t, 1.1, 1.2);
    if (r > 0 && r < 1) { ctx.save(); ctx.globalAlpha = 1 - r; ctx.beginPath(); ctx.arc(x, y - u * 10, u * (8 + r * 14), 0, Math.PI * 2); ctx.strokeStyle = P.accent; ctx.lineWidth = u * 0.6; ctx.stroke(); ctx.restore(); }
  },

  timeline(ctx, sc, t, L) {
    const { W, P, u } = L;
    const items = (sc.items.length ? sc.items : ["Start", "Learn", "Practice", "Earn"]).slice(0, 4);
    const n = items.length;
    const span = Math.min(u * 70, W * 0.68);
    const left = W / 2 - span / 2;
    const y = L.visualY;
    const lineP = easeInOut(prog(t, 0.2, 1.2));
    ctx.fillStyle = P.sub; ctx.fillRect(left, y - u * 0.4, span * lineP, u * 0.8);
    items.forEach((it, i) => {
      const x = left + (n === 1 ? span / 2 : (i / (n - 1)) * span);
      const st = 0.2 + (i / Math.max(1, n - 1)) * 1.2;
      withTransform(ctx, x, y, pop(t, st), 0, () => {
        circle(ctx, 0, 0, u * 5, i === n - 1 ? P.accent : "#FFFFFF");
        ctx.lineWidth = u * 0.5; ctx.strokeStyle = P.ink; ctx.beginPath(); ctx.arc(0, 0, u * 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = P.ink; ctx.font = `800 ${u * 4.4}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), 0, u * 0.2);
      });
      drawText(ctx, it, x, y + u * 8, { size: u * 3.8, color: P.text, weight: 700, maxWidth: u * 20, alpha: prog(t, st + 0.2, 0.4) });
    });
    if (sc.icons[0]) iconBadge(ctx, sc.icons[0], W / 2, y - u * 22, u * 12, P, t, 0.1);
  },

  stat(ctx, sc, t, L) {
    const { W, P, u } = L;
    const raw = String(sc.value ?? "90%");
    const m = raw.match(/^(\D*)([\d.,]+)(.*)$/);
    let shown = raw;
    if (m) {
      const target = parseFloat(m[2].replace(/,/g, ""));
      const cur = target * easeOutCubic(prog(t, 0.2, 1.3));
      const decimals = (m[2].split(".")[1] || "").length;
      shown = m[1] + cur.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + m[3];
    }
    // fit the number to the frame width (measured on the final value so it doesn't jump)
    let size = u * 22;
    ctx.font = `900 ${size}px system-ui`;
    const widest = ctx.measureText(raw).width;
    if (widest > W * 0.86) size *= (W * 0.86) / widest;
    withTransform(ctx, W / 2, L.visualY, pop(t, 0.1, 0.6), 0, () => {
      ctx.fillStyle = P.text; ctx.font = `900 ${size}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(shown, 0, 0);
    });
    if (sc.icons[0]) iconBadge(ctx, sc.icons[0], W / 2 + u * 30, L.visualY - u * 18, u * 9, P, t, 0.9, false);
    sparkle(ctx, W / 2 - u * 30, L.visualY - u * 14, u * 2.4, P.accent2, t);
  },

  network(ctx, sc, t, L) {
    const { W, P, u } = L;
    const list = (sc.icons.length ? sc.icons : ["user", "user", "user", "user", "user"]).slice(0, 6);
    const cx = W / 2, cy = L.visualY;
    list.forEach((ic, i) => {
      const a = -Math.PI / 2 + (i / list.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * u * 30, y = cy + Math.sin(a) * u * 24;
      const lp = easeInOut(prog(t, 0.3 + i * 0.1, 0.6));
      ctx.save(); ctx.setLineDash([u * 1.2, u * 1.2]); ctx.strokeStyle = P.sub; ctx.lineWidth = u * 0.35;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (x - cx) * lp, cy + (y - cy) * lp); ctx.stroke(); ctx.restore();
      iconBadge(ctx, ic, x, y, u * 7.5, P, t, 0.6 + i * 0.1, false);
    });
    iconBadge(ctx, "user", cx, cy, u * 13, P, t, 0.05);
  },

  laptop(ctx, sc, t, L) {
    const { W, P, u } = L;
    withTransform(ctx, W / 2, L.visualY + u * 4, pop(t, 0.05, 0.6), 0, () => icon(ctx, "laptop", u * 46, P));
    withTransform(ctx, W / 2 - u * 30, L.visualY + u * 8, pop(t, 0.5), t * 0.8, () => icon(ctx, "gear", u * 10, P));
    iconBadge(ctx, sc.icons[0] || "spark", W / 2, L.visualY - u * 2, u * 9, P, t, 0.9, false);
    (sc.icons.slice(1, 3)).forEach((ic, i) => iconBadge(ctx, ic, W / 2 + (i ? 1 : -1) * u * 20, L.visualY - u * 26, u * 7, P, t, 1.2 + i * 0.2, false));
  },

  cta(ctx, sc, t, L) {
    const { W, P, u } = L;
    const k = pop(t, 0.4);
    const pulse = 1 + Math.sin(t * 5) * 0.03 * prog(t, 1);
    withTransform(ctx, W / 2, L.visualY + u * 6, k * pulse, 0, () => {
      rr(ctx, -u * 26, -u * 7.5, u * 52, u * 15, u * 7.5); ctx.fillStyle = "#F03E3E"; ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.font = `800 ${u * 6}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(sc.button || "Follow for more", 0, u * 0.3);
    });
    iconBadge(ctx, sc.icons[0] || "heart", W / 2 + u * 24, L.visualY - u * 10, u * 7, P, t, 0.9, false);
  },
};

// ---------- frame rendering ----------
export function sceneAt(script, time) {
  let acc = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    const d = script.scenes[i].duration;
    if (time < acc + d) return { index: i, t: time - acc };
    acc += d;
  }
  const last = script.scenes.length - 1;
  return { index: last, t: script.scenes[last].duration };
}

export function renderFrame(ctx, script, time) {
  const [W, H] = SIZES[script.format];
  const P = PALETTES[script.palette];
  const u = Math.min(W, H) / 100;
  const { index, t } = sceneAt(script, time);
  const sc = script.scenes[index];
  const bg = sc.bg || P.bgs[index % P.bgs.length];
  const prevBg = index > 0 ? script.scenes[index - 1].bg || P.bgs[(index - 1) % P.bgs.length] : bg;

  // background with circular wipe transition from the previous scene's colour
  ctx.fillStyle = prevBg;
  ctx.fillRect(0, 0, W, H);
  const wipe = index === 0 ? 1 : easeInOut(prog(t, 0, 0.45));
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.6 * wipe, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  // soft floating background dots for depth
  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 6; i++) {
    const x = ((i * 0.173 + 0.08) % 1) * W + Math.sin(time * 0.6 + i) * u * 2;
    const y = ((i * 0.317 + 0.12) % 1) * H + Math.cos(time * 0.5 + i) * u * 2;
    circle(ctx, x, y, u * (0.8 + (i % 3) * 0.5), P.sub);
  }
  ctx.restore();

  // exit: everything scales down slightly and fades in the last 0.3s
  const exit = index === script.scenes.length - 1 ? 0 : prog(t, sc.duration - 0.3, 0.3);
  ctx.save();
  ctx.globalAlpha = 1 - exit;
  const portrait = H > W;
  // Visuals are drawn larger in portrait so they fill the tall frame.
  const L = {
    W, H, P,
    u: portrait ? u * 1.3 : u,
    visualY: portrait ? H * 0.5 : H * 0.52,
  };
  const headlineY = portrait ? H * 0.13 : H * 0.08;
  const rise = (1 - easeOutCubic(prog(t, 0.05, 0.5))) * u * 6;
  const headH = drawText(ctx, sc.headline, W / 2, headlineY, { size: u * (portrait ? 8.2 : 7), color: P.text, weight: 900, maxWidth: W * 0.84, alpha: prog(t, 0.05, 0.4), rise });
  if (sc.subtext) {
    drawText(ctx, sc.subtext, W / 2, headlineY + headH + u * 2, { size: u * 4.6, color: P.sub, weight: 600, maxWidth: W * 0.8, alpha: prog(t, 0.35, 0.4), rise });
  }
  (VISUALS[sc.visual] || VISUALS.title)(ctx, sc, t, L);
  if (sc.caption) {
    const capY = portrait ? H * 0.8 : H * 0.84;
    const capAlpha = prog(t, 0.6, 0.4);
    ctx.save(); ctx.globalAlpha = capAlpha * 0.9;
    ctx.font = `700 ${u * 4.6}px system-ui`;
    const lines = wrapLines(ctx, sc.caption, W * 0.78);
    const boxH = lines.length * u * 5.6 + u * 4;
    rr(ctx, W * 0.08, capY - u * 2, W * 0.84, boxH, u * 3); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fill(); ctx.restore();
    drawText(ctx, sc.caption, W / 2, capY, { size: u * 4.6, color: "#FFFFFF", weight: 700, maxWidth: W * 0.78, alpha: capAlpha });
  }
  ctx.restore();
}

export function canvasSize(script) {
  return SIZES[script.format];
}

export const SAMPLE_SCRIPT = {
  format: "portrait",
  palette: "purple",
  scenes: [
    { visual: "title", duration: 3, headline: "3 free AI tools", subtext: "that save you hours", icons: ["spark", "clock"] },
    { visual: "character", duration: 3.5, headline: "Feeling busy every day?", icons: ["clock"], caption: "Let AI do the boring parts" },
    { visual: "icons", duration: 3.5, headline: "Tool 1: AI notes", subtext: "Record, summarise, done", icons: ["mail", "doc", "check"] },
    { visual: "phone", duration: 3, headline: "Tool 2: Smart calendar", icons: ["calendar"] },
    { visual: "bar-chart", duration: 3.5, headline: "Tool 3: AI budget tracker", icons: ["coin"] },
    { visual: "stat", duration: 3, headline: "Time saved", value: "5 hrs/week", icons: ["clock"] },
    { visual: "checklist", duration: 4, headline: "Try this today", items: ["Pick one tool", "Use it for 7 days", "Keep what works"] },
    { visual: "cta", duration: 3, headline: "Want more AI hacks?", button: "Follow for more", icons: ["heart"] },
  ],
};
