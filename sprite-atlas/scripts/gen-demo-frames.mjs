/**
 * 生成用于验证的示例序列帧（纯 Node，无第三方依赖）。
 * 8 帧刻意使用不同画布尺寸与不同大小/位置的透明边缘：
 *   1 64x64   圆形角色，四周约 14px 透明
 *   2 80x48   内容偏左，非对称留白
 *   3 32x96   高条画布，内容靠近底部
 *   4 100x100 右上角 10x10 小点（极端裁切）
 *   5 50x70   恰好 5px 均匀透明边
 *   6 64x64   仅 1px 透明边（近满幅）
 *   7 40x40   完全透明（验证全透明兜底）
 *   8 120x36  宽条画布，内容左对齐
 * 每帧角色有上下跳动，预览时可据此判断裁切后的对齐是否正确。
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo-frames');
mkdirSync(outDir, { recursive: true });

/* ---------- 极简 RGBA 画布 ---------- */
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  px(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    // 简单覆盖（素材没有半透明叠加需求）
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }
  fillRect(x, y, w, h, color, alpha = 255) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, color, alpha);
  }
  fillCircle(cx, cy, rad, color) {
    for (let yy = Math.floor(cy - rad); yy <= cy + rad; yy++)
      for (let xx = Math.floor(cx - rad); xx <= cx + rad; xx++) {
        const dx = xx + 0.5 - cx;
        const dy = yy + 0.5 - cy;
        if (dx * dx + dy * dy <= rad * rad) this.px(xx, yy, color);
      }
  }
  /** 画一个带眼睛的“小角色”，锚点为脚底中心 (feetX, feetY)，用于统一运动对齐感。 */
  character(cx, feetY, bodyW, bodyH, color) {
    const x0 = Math.round(cx - bodyW / 2);
    const y0 = Math.round(feetY - bodyH);
    // 身体（矩形即可，关键是各帧之间的相对位置）
    this.fillRect(x0, y0, bodyW, bodyH, color);
    // 眼睛（深色，固定在身体右上区域，帮助辨认方向）
    this.fillRect(x0 + bodyW - Math.max(3, Math.round(bodyW * 0.28)), y0 + 2, 2, 2, [
      20,
      24,
      30,
    ]);
    // 脚（亮色）
    this.fillRect(x0, feetY - 2, 3, 2, [240, 240, 240]);
    this.fillRect(x0 + bodyW - 3, feetY - 2, 3, 2, [240, 240, 240]);
  }
}

/* ---------- 极简 PNG 编码（8bit RGBA, filter 0, zlib deflate） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([len, name, data, crc]);
}
function encodePNG(canvas) {
  const { w, h, data } = canvas;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = chunk('IDAT', deflateSync(raw, { level: 9 }));
  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 8 帧 ---------- */
const hue = (i) => {
  // 从蓝紫到橙红，每帧颜色不同便于辨认
  const palette = [
    [94, 168, 255],
    [120, 190, 255],
    [150, 210, 250],
    [180, 225, 220],
    [220, 230, 160],
    [255, 214, 120],
    [255, 178, 96],
    [255, 140, 80],
  ];
  return palette[i % palette.length];
};
const bounce = [0, -3, -5, -3, 0, 2, 4, 2]; // 上下跳动

function build(i) {
  const c = hue(i);
  const dy = bounce[i];
  switch (i) {
    case 0: {
      const cv = new Canvas(64, 64);
      cv.fillCircle(32, 30 + dy, 18, c);
      cv.fillRect(44, 26 + dy, 3, 3, [20, 24, 30]); // 眼睛
      return cv;
    }
    case 1: {
      const cv = new Canvas(80, 48);
      cv.character(36, 40 + dy, 56, 24, c); // 内容偏左
      return cv;
    }
    case 2: {
      const cv = new Canvas(32, 96);
      cv.character(16, 90 + dy, 20, 26, c); // 靠近底部
      return cv;
    }
    case 3: {
      const cv = new Canvas(100, 100);
      cv.fillRect(86, 4 + dy + 5, 10, 10, c); // 右上角小点
      return cv;
    }
    case 4: {
      const cv = new Canvas(50, 70);
      cv.character(25, 65 + dy, 40, 60, c); // 5px 均匀边
      return cv;
    }
    case 5: {
      const cv = new Canvas(64, 64);
      cv.character(32, 63 + dy, 62, 62, c); // 1px 边
      return cv;
    }
    case 6: {
      return new Canvas(40, 40); // 完全透明
    }
    case 7: {
      const cv = new Canvas(120, 36);
      cv.character(54, 28 + dy, 100, 20, c); // 宽条、左对齐
      return cv;
    }
  }
}

const names = [];
for (let i = 0; i < 8; i++) {
  const name = `run_${String(i + 1).padStart(2, '0')}.png`;
  writeFileSync(join(outDir, name), encodePNG(build(i)));
  names.push(name);
  console.log('wrote', name);
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(names, null, 2) + '\n');
console.log('manifest:', names.join(', '));
