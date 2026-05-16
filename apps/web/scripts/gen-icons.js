#!/usr/bin/env node
/**
 * Generates PWA icon PNGs for Costa Resiliente.
 * Uses only Node.js built-ins (zlib, fs, path).
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

function makeCRCTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC_TABLE = makeCRCTable();
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Draw a simple costa-resiliente icon at given size.
 * Returns raw RGBA pixel buffer (size*size*4 bytes).
 */
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  // Background: #0f172a = 15, 23, 42
  const BG = [15, 23, 42, 255];
  // Wave: #0ea5e9 = 14, 165, 233
  const WAVE = [14, 165, 233, 200];
  // Mountain peak: #38bdf8 = 56, 189, 248
  const MTN = [56, 189, 248, 230];
  // Alert red: #ef4444 = 239, 68, 68
  const RED = [239, 68, 68, 255];
  // Text/accent: #94a3b8 = 148, 163, 184
  const GRAY = [148, 163, 184, 200];

  const s = size;

  function setPixel(x, y, c) {
    if (x < 0 || x >= s || y < 0 || y >= s) return;
    const i = (y * s + x) * 4;
    pixels[i] = c[0];
    pixels[i + 1] = c[1];
    pixels[i + 2] = c[2];
    pixels[i + 3] = c[3];
  }

  function fillRect(x0, y0, x1, y1, c) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) setPixel(x, y, c);
  }

  function fillCircle(cx, cy, r, c) {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPixel(x, y, c);
  }

  function fillTriangle(ax, ay, bx, by, cx2, cy2, c) {
    const minX = Math.max(0, Math.min(ax, bx, cx2));
    const maxX = Math.min(s - 1, Math.max(ax, bx, cx2));
    const minY = Math.max(0, Math.min(ay, by, cy2));
    const maxY = Math.min(s - 1, Math.max(ay, by, cy2));
    function sign(p1x, p1y, p2x, p2y, p3x, p3y) {
      return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
    }
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x, y, ax, ay, bx, by);
        const d2 = sign(x, y, bx, by, cx2, cy2);
        const d3 = sign(x, y, cx2, cy2, ax, ay);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) setPixel(x, y, c);
      }
    }
  }

  // Fill background
  fillRect(0, 0, s - 1, s - 1, BG);

  // Rounded corners (erase to transparent) — approx with circle corners
  const r = Math.floor(s * 0.15);
  function eraseCorner(cx, cy) {
    for (let dy = 0; dy < r; dy++)
      for (let dx = 0; dx < r; dx++) {
        const dist = Math.sqrt((dx - r) ** 2 + (dy - r) ** 2);
        if (dist > r) setPixel(cx + dx, cy + dy, [0, 0, 0, 0]);
      }
  }
  eraseCorner(0, 0); // TL — mirror to quadrant
  // Simple: just erase exact squares at corners, skip complex rounded calc
  // (SVG already has rounded corners — PNG can be square for install purposes)

  // Wave band at bottom third
  const waveY = Math.floor(s * 0.58);
  const waveH = Math.floor(s * 0.28);
  for (let y = waveY; y < waveY + waveH; y++) {
    const progress = (y - waveY) / waveH;
    for (let x = 0; x < s; x++) {
      const wave = Math.sin((x / s) * Math.PI * 3 + Math.PI * 0.3) * 0.05 * s;
      if (y > waveY + wave + s * 0.02) {
        setPixel(x, y, WAVE);
      }
    }
  }

  // Mountain triangle center
  const mCx = Math.floor(s * 0.5);
  const mTop = Math.floor(s * 0.28);
  const mBL = Math.floor(s * 0.3);
  const mBR = Math.floor(s * 0.7);
  const mBase = Math.floor(s * 0.62);
  fillTriangle(mCx, mTop, mBL, mBase, mBR, mBase, MTN);

  // Alert red circle top-right
  const dotCx = Math.floor(s * 0.74);
  const dotCy = Math.floor(s * 0.22);
  const dotR = Math.floor(s * 0.1);
  fillCircle(dotCx, dotCy, dotR, RED);

  // Exclamation mark in red circle (vertical bar + dot)
  const barW = Math.max(2, Math.floor(dotR * 0.2));
  const barX = dotCx - Math.floor(barW / 2);
  fillRect(barX, dotCy - Math.floor(dotR * 0.55), barX + barW - 1, dotCy + Math.floor(dotR * 0.1), [255, 255, 255, 255]);
  fillCircle(dotCx, dotCy + Math.floor(dotR * 0.38), Math.max(1, Math.floor(dotR * 0.15)), [255, 255, 255, 255]);

  // Bottom accent bar "CR" — just a colored rect (no font rendering)
  fillRect(Math.floor(s * 0.3), Math.floor(s * 0.88), Math.floor(s * 0.7), Math.floor(s * 0.92), GRAY);

  return pixels;
}

function buildPNG(size) {
  const pixels = drawIcon(size);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  // Build raw image data with filter bytes
  const rowLen = size * 4;
  const raw = Buffer.alloc(size * (rowLen + 1));
  for (let row = 0; row < size; row++) {
    raw[row * (rowLen + 1)] = 0; // filter: None
    pixels.copy(raw, row * (rowLen + 1) + 1, row * rowLen, (row + 1) * rowLen);
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdrData),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "..", "public");
fs.mkdirSync(outDir, { recursive: true });

const sizes = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-512-maskable.png", 512],
];

for (const [name, size] of sizes) {
  const png = buildPNG(size);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`Generated ${name} (${png.length} bytes)`);
}

// Also write a minimal favicon.ico (16x16 BMP wrapped in ICO — or just copy 192 as fallback)
// Simplest: create a 16x16 PNG as favicon
const fav = buildPNG(32);
fs.writeFileSync(path.join(outDir, "favicon.ico"), fav);
console.log("Generated favicon.ico (32x32 PNG, compatible with most browsers)");
