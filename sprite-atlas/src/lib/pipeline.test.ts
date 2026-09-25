import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeTrimBounds, fallbackTrim, type ImageDataLike } from './trim';
import { packRects } from './pack';
import { buildTimeline, frameIndexAt } from './timeline';
import { parseProject, serializeProject } from './json';
import { DEFAULT_SETTINGS, type FrameItem, type PackResult } from './types';

/**
 * 端到端流水线测试：使用 scripts/gen-demo-frames.mjs 生成的真实 PNG
 * 解码 → 透明边缘裁切 → maxrects 打包 → 像素级验证图集内容 → 时长轴 → JSON 往返。
 */
const FRAME_DIR = join(__dirname, '..', '..', 'public', 'demo-frames');

/* ---------- PNG 解码（支持 filter 0-4，8bit RGBA） ---------- */
function decodePNG(buf: Buffer): ImageDataLike {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('bad signature');
  let w = 0,
    h = 0;
  const idat: Buffer[] = [];
  for (let p = 8; p < buf.length; ) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error('仅支持 8bit RGBA');
    }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(stride * h);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
  }
  return {
    width: w,
    height: h,
    data: new Uint8Array(out.buffer, out.byteOffset, out.length),
  };
}

interface DecodedFrame {
  id: string;
  name: string;
  img: ImageDataLike;
  trim: { x: number; y: number; w: number; h: number };
  duration: number;
}

function loadFrames(): DecodedFrame[] {
  return readdirSync(FRAME_DIR)
    .filter((n) => n.endsWith('.png'))
    .sort()
    .map((name, i) => {
      const img = decodePNG(readFileSync(join(FRAME_DIR, name)));
      const trim = computeTrimBounds(img, 1) ?? fallbackTrim(img.width, img.height);
      return { id: `f${i}`, name, img, trim, duration: 100 + i * 20 };
    });
}

describe('真实素材端到端流水线', () => {
  const frames = loadFrames();

  it('8 帧全部解码，不同尺寸与透明边缘符合设计', () => {
    expect(frames).toHaveLength(8);
    expect(frames[0].trim).toEqual({ x: 14, y: 12, w: 36, h: 36 }); // 64x64 圆形
    expect(frames[1].trim).toEqual({ x: 8, y: 13, w: 56, h: 24 }); // 80x48 偏左
    expect(frames[3].trim).toEqual({ x: 86, y: 6, w: 10, h: 10 }); // 100x100 角落小点
    expect(frames[4].trim).toEqual({ x: 5, y: 5, w: 40, h: 60 }); // 5px 均匀边
    expect(frames[6].trim).toEqual({ x: 20, y: 20, w: 1, h: 1 }); // 全透明兜底
    expect(frames[7].trim).toEqual({ x: 4, y: 10, w: 100, h: 20 }); // 120x36 宽条
  });

  it('打包：8 帧全部放置、固定方向不旋转、位置尺寸与裁切框一致', () => {
    const layout = packRects(
      frames.map((f) => ({ id: f.id, width: f.trim.w, height: f.trim.h })),
      { padding: 2, pot: false, maxSize: 4096 },
    );
    expect(layout.rects).toHaveLength(8);
    expect(layout.rects.every((r) => !r.rotated)).toBe(true);
    const byId = new Map(layout.rects.map((r) => [r.id, r]));
    for (const f of frames) {
      const r = byId.get(f.id)!;
      expect(r.w).toBe(f.trim.w);
      expect(r.h).toBe(f.trim.h);
    }
  });

  it('像素级：按打包位置合成图集后，每个位置与原图裁切区域逐像素相同，且留白干净', () => {
    const layout = packRects(
      frames.map((f) => ({ id: f.id, width: f.trim.w, height: f.trim.h })),
      { padding: 2, pot: false, maxSize: 4096 },
    );
    const posOf = new Map(layout.rects.map((r) => [r.id, r]));
    const atlas = new Uint8Array(layout.width * layout.height * 4);
    for (const f of frames) {
      const p = posOf.get(f.id)!;
      for (let y = 0; y < f.trim.h; y++) {
        for (let x = 0; x < f.trim.w; x++) {
          const si = ((f.trim.y + y) * f.img.width + (f.trim.x + x)) * 4;
          const di = ((p.y + y) * layout.width + (p.x + x)) * 4;
          for (let c = 0; c < 4; c++) atlas[di + c] = f.img.data[si + c];
        }
      }
    }
    // 逐帧像素验证
    for (const f of frames) {
      const p = posOf.get(f.id)!;
      for (let y = 0; y < f.trim.h; y++) {
        for (let x = 0; x < f.trim.w; x++) {
          const si = ((f.trim.y + y) * f.img.width + (f.trim.x + x)) * 4;
          const di = ((p.y + y) * layout.width + (p.x + x)) * 4;
          for (let c = 0; c < 4; c++) {
            expect(atlas[di + c], `${f.name} (${x},${y}) c${c}`).toBe(f.img.data[si + c]);
          }
        }
      }
    }
    // 每帧四周 2px 环带内不得有任何非透明像素
    for (const f of frames) {
      const p = posOf.get(f.id)!;
      const x0 = Math.max(0, p.x - 2);
      const y0 = Math.max(0, p.y - 2);
      const x1 = Math.min(layout.width, p.x + p.w + 2);
      const y1 = Math.min(layout.height, p.y + p.h + 2);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const inside = x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
          if (!inside) {
            expect(atlas[(y * layout.width + x) * 4 + 3], `${f.name} 留白 (${x},${y})`).toBe(0);
          }
        }
      }
    }
  });

  it('时长轴：不同帧时长驻留精确、可循环（预览顺序与时长）', () => {
    const tl = buildTimeline(frames.map((f) => f.duration)); // 100,120,...,240
    expect(tl.total).toBe(frames.reduce((s, f) => s + f.duration, 0));
    for (let i = 0; i < frames.length; i++) {
      expect(frameIndexAt(tl, tl.starts[i])).toBe(i);
      expect(frameIndexAt(tl, tl.starts[i] + frames[i].duration - 1)).toBe(i);
    }
    // 顺序：逐时间扫描得到的帧序号构成非递减段序列，且每段长度等于该帧时长
    const seen: number[] = [];
    let last = -1;
    for (let t = 0; t < tl.total; t++) {
      const idx = frameIndexAt(tl, t);
      if (idx !== last) {
        seen.push(idx);
        last = idx;
      }
    }
    expect(seen).toEqual(frames.map((_, i) => i)); // 严格按原顺序 0..7
    expect(frameIndexAt(tl, tl.total)).toBe(0); // 循环回到首帧
  });

  it('JSON 往返：重新导入恢复帧顺序、时长、裁切框与每帧图集位置/尺寸', () => {
    const layout = packRects(
      frames.map((f) => ({ id: f.id, width: f.trim.w, height: f.trim.h })),
      { padding: 2, pot: false, maxSize: 4096 },
    );
    const posOf = new Map(layout.rects.map((r) => [r.id, r]));
    const frameItems: FrameItem[] = frames.map((f) => ({
      id: f.id,
      name: f.name,
      blob: new Blob([], { type: 'image/png' }),
      width: f.img.width,
      height: f.img.height,
      duration: f.duration,
      trim: { ...f.trim },
    }));
    const pack: PackResult = {
      width: layout.width,
      height: layout.height,
      padding: 2,
      trimmed: true,
      frames: frames.map((f) => {
        const r = posOf.get(f.id)!;
        return {
          id: f.id,
          name: f.name,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          trim: { ...f.trim },
          sourceW: f.img.width,
          sourceH: f.img.height,
          duration: f.duration,
        };
      }),
    };
    const urls = new Map(frames.map((f) => [f.id, 'data:image/png;base64,AAAA']));
    const json = serializeProject('集成', frameItems, DEFAULT_SETTINGS, pack, urls);
    const restored = parseProject(JSON.parse(JSON.stringify(json)));

    expect(restored.frames.map((f) => f.id)).toEqual(frames.map((f) => f.id));
    expect(restored.frames.map((f) => f.name)).toEqual(frames.map((f) => f.name));
    expect(restored.frames.map((f) => f.duration)).toEqual(frames.map((f) => f.duration));
    expect(restored.frames.map((f) => f.trim)).toEqual(frames.map((f) => f.trim));
    for (let i = 0; i < frames.length; i++) {
      const p = posOf.get(frames[i].id)!;
      expect(restored.pack.frames[i]).toMatchObject({
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        duration: frames[i].duration,
      });
    }
    expect(restored.pack.width).toBe(layout.width);
    expect(restored.pack.height).toBe(layout.height);
  });
});
