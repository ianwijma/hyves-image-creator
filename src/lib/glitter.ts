import { GIFEncoder, quantize, applyPalette } from "gifenc";

export type GlitterOptions = {
  /** Target size of the longest side in pixels, or "original" to keep the source size */
  size: number | "original";
  frames: number;
  /** Frame delay in ms */
  delay: number;
};

/** Safety cap for the "original" size option — keeps files and encode time sane */
export const ORIGINAL_MAX = 1920;

export const DEFAULT_OPTIONS: GlitterOptions = {
  size: "original",
  frames: 20,
  delay: 80,
};

const TAU = Math.PI * 2;

/* ---------- deterministic pseudo-random helpers ---------- */

function hash1(n: number): number {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

function rand2(a: number, b: number): number {
  return hash1(a * 127.1 + b * 311.7);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ---------- scene layout ---------- */

type Sequin = {
  x: number;
  y: number;
  r: number;
  hue: number;
  sat: number;
  light: number;
  seed: number;
};

type Sparkle = {
  x: number;
  y: number;
  r: number;
  phase: number;
  cycles: number;
  color: string;
  kind: 0 | 1 | 2; // 0 = 4-point star, 1 = plus, 2 = dot
  seed: number;
};

type Layout = {
  w: number;
  h: number;
  radius: number;
  sequins: Sequin[];
  sparkles: Sparkle[];
};

// [hue, saturation, light, weight] — pink/magenta heavy, orange + purple accents
const SEQUIN_COLORS: Array<[number, number, number, number]> = [
  [330, 92, 62, 5],
  [318, 85, 54, 3],
  [342, 96, 72, 4],
  [280, 72, 60, 2],
  [25, 96, 62, 2],
  [15, 100, 72, 2],
  [330, 60, 88, 2],
];

function pickSequinColor(rng: () => number) {
  const total = SEQUIN_COLORS.reduce((s, c) => s + c[3], 0);
  let roll = rng() * total;
  for (const [hue, sat, light, weight] of SEQUIN_COLORS) {
    roll -= weight;
    if (roll <= 0) {
      return {
        hue: hue + (rng() * 10 - 5),
        sat: clamp(sat + (rng() * 14 - 7), 40, 100),
        light: clamp(light + (rng() * 12 - 6), 20, 90),
      };
    }
  }
  return { hue: 330, sat: 90, light: 62 };
}

function buildLayout(w: number, h: number, seed: number): Layout {
  const rng = mulberry32(seed);
  const radius = Math.min(w, h) * 0.045;
  // Band height scales with the image so the sequin border stays proportional
  // (and glittery) at any size, from 320 px up to full-size renders.
  const bandH = clamp(Math.min(h * 0.11, Math.min(w, h) * 0.12), 22, 160);
  const r = bandH * 0.4;
  const spacing = r * 1.75;

  const sequins: Sequin[] = [];
  let seedIdx = 1;
  for (const top of [true, false]) {
    for (const row of [0, 1]) {
      const yBase = top ? r * 1.05 : h - r * 1.05;
      const y = row === 0 ? yBase : top ? bandH - r * 1.05 : h - bandH + r * 1.05;
      const offset = row === 1 ? spacing / 2 : 0;
      for (let x = -r * 0.4 + offset; x < w + r; x += spacing) {
        const color = pickSequinColor(rng);
        sequins.push({
          x,
          y,
          r: r * (0.92 + rng() * 0.16),
          ...color,
          seed: seedIdx++ * 7.13 + 3.7,
        });
      }
    }
  }

  const sparkles: Sparkle[] = [];
  const count = clamp(Math.round((w * h) / 14000), 10, 90);
  const dots = Math.round(count * 0.5);
  const colors = ["#ffffff", "#ffffff", "#ffd6f2", "#ffb1e6", "#ffe9a8"];
  const mx = r * 0.9;
  const my = r * 0.9;
  for (let i = 0; i < count + dots; i++) {
    const isDot = i >= count;
    const rr = rng();
    sparkles.push({
      x: mx + rng() * (w - mx * 2),
      y: my + rng() * (h - my * 2),
      r: isDot
        ? Math.min(w, h) * (0.006 + rng() * 0.01)
        : Math.min(w, h) * (0.018 + rr * rr * 0.052),
      phase: rng(),
      cycles: rng() < 0.35 ? 2 : 1,
      color: colors[Math.floor(rng() * colors.length)],
      kind: isDot ? 2 : rng() < 0.62 ? 0 : rng() < 0.6 ? 1 : 2,
      seed: i * 3.31 + 1.7,
    });
  }

  return { w, h, radius, sequins, sparkles };
}

/* ---------- drawing ---------- */

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h.toFixed(1)} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}%)`;
}

function drawSequin(ctx: CanvasRenderingContext2D, seq: Sequin, frame: number) {
  const tw = rand2(seq.seed, frame);
  const bright = 0.72 + tw * 0.55;
  const light = clamp(seq.light * bright, 6, 96);
  const hot = tw > 0.88;

  const grd = ctx.createRadialGradient(
    seq.x - seq.r * 0.35,
    seq.y - seq.r * 0.4,
    seq.r * 0.1,
    seq.x,
    seq.y,
    seq.r
  );
  grd.addColorStop(0, hsl(seq.hue, seq.sat, Math.min(97, light + 20)));
  grd.addColorStop(0.55, hsl(seq.hue, seq.sat, light));
  grd.addColorStop(1, hsl(seq.hue, seq.sat * 0.9, Math.max(8, light - 24)));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(seq.x, seq.y, seq.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,0,40,0.18)";
  ctx.lineWidth = Math.max(1, seq.r * 0.045);
  ctx.stroke();

  if (hot) {
    const sx = seq.x - seq.r * 0.3;
    const sy = seq.y - seq.r * 0.3;
    const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, seq.r * 0.8);
    g2.addColorStop(0, "rgba(255,255,255,0.95)");
    g2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(sx, sy, seq.r * 0.8, 0, TAU);
    ctx.fill();
  }
}

function star4Path(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const k = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.closePath();
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  sp: Sparkle,
  frame: number,
  frames: number
) {
  const t = (sp.phase + (frame / frames) * sp.cycles) % 1;
  let a = Math.max(0, Math.sin(t * TAU));
  a = Math.pow(a, 1.35);
  if (a < 0.02) return;

  ctx.save();
  ctx.globalAlpha = a;

  // soft glow
  const glowR = sp.r * (1.7 + 1.1 * a);
  const glow = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, glowR);
  glow.addColorStop(0, sp.color);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = a * 0.45;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, glowR, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = a;

  if (sp.kind === 0) {
    const r = sp.r * (0.4 + 0.8 * a);
    star4Path(ctx, sp.x, sp.y, r);
    ctx.fillStyle = sp.color;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r * 0.18, 0, TAU);
    ctx.fill();
  } else if (sp.kind === 1) {
    const len = sp.r * 2.1 * (0.55 + 0.65 * a);
    ctx.strokeStyle = sp.color;
    ctx.lineWidth = Math.max(1, sp.r * 0.32);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sp.x - len, sp.y);
    ctx.lineTo(sp.x + len, sp.y);
    ctx.moveTo(sp.x, sp.y - len);
    ctx.lineTo(sp.x, sp.y + len);
    ctx.stroke();
  } else {
    ctx.fillStyle = sp.color;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, Math.max(0.8, sp.r * (0.4 + 0.6 * a)), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export type FrameSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export function renderGlitterFrame(
  ctx: CanvasRenderingContext2D,
  img: FrameSource,
  layout: Layout,
  frame: number,
  frames: number
) {
  const { w, h, radius, sequins, sparkles } = layout;

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // white backdrop with rounded corners
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  roundRectPath(ctx, 0, 0, w, h, radius);
  ctx.fill();
  ctx.clip();

  ctx.drawImage(img, 0, 0, w, h);

  // thin frame
  const lw = clamp(w * 0.01, 2.5, 8);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  roundRectPath(ctx, lw / 2 + 0.5, lw / 2 + 0.5, w - lw - 1, h - lw - 1, radius - lw / 2);
  ctx.stroke();

  for (const seq of sequins) drawSequin(ctx, seq, frame);
  for (const sp of sparkles) drawSparkle(ctx, sp, frame, frames);

  ctx.restore();
}

/* ---------- encoding ---------- */

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function encodeGlitterGif(
  source: FrameSource,
  opts: Partial<GlitterOptions> = {},
  onProgress?: (p: number) => void
): Promise<Blob> {
  const frames = opts.frames ?? DEFAULT_OPTIONS.frames;
  const delay = opts.delay ?? DEFAULT_OPTIONS.delay;
  const sizeOpt = opts.size ?? DEFAULT_OPTIONS.size;
  const target = sizeOpt === "original" ? ORIGINAL_MAX : sizeOpt;

  const iw = source.width;
  const ih = source.height;
  if (!iw || !ih) throw new Error("empty-image");

  // Never upscale; only shrink to the target size (or the ORIGINAL_MAX cap)
  const scale = Math.min(1, target / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * scale) & ~1);
  const h = Math.max(2, Math.round(ih * scale) & ~1);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no-canvas");

  const layout = buildLayout(w, h, Math.floor(Math.random() * 2 ** 31));
  const render = (f: number) => renderGlitterFrame(ctx, source, layout, f, frames);

  // Pass 1: sample pixels across all frames to build one shared palette
  const targetSamples = 260000;
  const stride = Math.max(
    2,
    Math.round(Math.sqrt((w * h * frames) / targetSamples))
  );
  const chunks: Uint8Array[] = [];
  for (let f = 0; f < frames; f++) {
    render(f);
    const data = ctx.getImageData(0, 0, w, h).data;
    const n = Math.floor((w * h) / stride);
    const buf = new Uint8Array(n * 4);
    for (let p = 0; p < n; p++) {
      const si = p * stride * 4;
      const di = p * 4;
      buf[di] = data[si];
      buf[di + 1] = data[si + 1];
      buf[di + 2] = data[si + 2];
      buf[di + 3] = 255;
    }
    chunks.push(buf);
    onProgress?.(((f + 1) / frames) * 0.35);
    await yieldToUi();
  }

  let total = 0;
  for (const c of chunks) total += c.length;
  const samples = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    samples.set(c, off);
    off += c.length;
  }
  const palette = quantize(samples, 256, { format: "rgb565" });
  if (!palette || palette.length === 0) throw new Error("quantize-failed");

  // Pass 2: re-render each frame and encode with the shared palette
  const gif = GIFEncoder();
  for (let f = 0; f < frames; f++) {
    render(f);
    const data = ctx.getImageData(0, 0, w, h).data;
    const index = applyPalette(data, palette, "rgb565");
    gif.writeFrame(index, w, h, {
      palette: f === 0 ? palette : undefined,
      delay,
      repeat: f === 0 ? 0 : undefined,
    });
    onProgress?.(0.35 + ((f + 1) / frames) * 0.65);
    await yieldToUi();
  }
  gif.finish();

  return new Blob([gif.bytes() as unknown as BlobPart], { type: "image/gif" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function gifFileName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  return `${base}-glitter.gif`;
}
