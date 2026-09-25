import { MaxRectsPacker } from 'maxrects-packer';
import type { Rect } from './types';

export interface PackInput {
  id: string;
  /** 待打包内容（裁切后）的宽高 */
  width: number;
  height: number;
}

export interface PackOptions {
  /** 统一留白：每个精灵四周各留出的像素数 */
  padding: number;
  /** 图集尺寸取 2 的幂 */
  pot: boolean;
  /** 图集最大边长 */
  maxSize: number;
}

export interface PackedRect extends Rect {
  id: string;
  /** 固定方向打包，恒为 false；保留字段便于校验 */
  rotated: boolean;
}

export interface PackLayout {
  width: number;
  height: number;
  rects: PackedRect[];
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * 生成候选图集尺寸（从小到大）。
 * 以内容总面积的平方根为起点，按几种常见宽高比逐步放大，命中即停。
 */
export function candidateSizes(
  inputs: PackInput[],
  opts: PackOptions,
): { width: number; height: number }[] {
  const pad = Math.max(0, opts.padding);
  const inflated = inputs.map((i) => ({
    w: i.width + pad * 2,
    h: i.height + pad * 2,
  }));
  const maxW = Math.max(...inflated.map((i) => i.w), 1);
  const maxH = Math.max(...inflated.map((i) => i.h), 1);
  const area = inflated.reduce((s, i) => s + i.w * i.h, 0);

  const seen = new Set<string>();
  const out: { width: number; height: number }[] = [];
  const push = (w: number, h: number) => {
    w = Math.ceil(w);
    h = Math.ceil(h);
    if (opts.pot) {
      w = nextPow2(w);
      h = nextPow2(h);
    }
    if (w < maxW || h < maxH) return;
    if (w > opts.maxSize || h > opts.maxSize) return;
    const key = `${w}x${h}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ width: w, height: h });
  };

  const base = Math.max(Math.ceil(Math.sqrt(area * 1.15)), Math.min(maxW, maxH));
  const aspects = [1, 4 / 3, 3 / 4, 2, 1 / 2, 4, 1 / 4];
  // 逐档放大，直到达到最大尺寸
  for (let scale = 1; ; scale *= 1.3) {
    const before = out.length;
    for (const a of aspects) {
      push(base * scale * Math.sqrt(a), base * scale / Math.sqrt(a));
    }
    // 保证最大单帧一定能被某个候选容纳
    push(maxW, Math.max(maxH, base * scale));
    push(Math.max(maxW, base * scale), maxH);
    if (out.some((s) => s.width >= opts.maxSize && s.height >= opts.maxSize)) break;
    if (out.length === before && scale > 64) break; // 兜底，理论不会触发
    if (scale > 1e6) break;
  }
  push(opts.maxSize, opts.maxSize);
  out.sort((a, b) => a.width * a.height - b.width * b.height || a.width - b.width);
  return out;
}

/**
 * 用 maxrects-packer 打包，固定方向（不旋转）。
 * 统一留白通过“把每帧宽高各加 2*padding 再打包、结果再减回来”实现，
 * 保证每个精灵四周都有恰好 padding 像素的间距（含图集边缘）。
 */
export function packRects(inputs: PackInput[], opts: PackOptions): PackLayout {
  if (inputs.length === 0) return { width: 0, height: 0, rects: [] };
  const pad = Math.max(0, Math.floor(opts.padding));
  for (const i of inputs) {
    if (i.width + pad * 2 > opts.maxSize || i.height + pad * 2 > opts.maxSize) {
      throw new Error(`帧 ${i.id}（${i.width}x${i.height}）超过图集最大尺寸 ${opts.maxSize}`);
    }
  }

  const inflated = inputs.map((i) => ({
    id: i.id,
    width: i.width + pad * 2,
    height: i.height + pad * 2,
  }));

  for (const size of candidateSizes(inputs, opts)) {
    const packer = new MaxRectsPacker(size.width, size.height, 0, {
      smart: true,
      pot: opts.pot,
      square: false,
      allowRotation: false, // 固定方向，不旋转
      tag: false,
      border: 0,
    });
    // 最长边降序，大矩形先放（MaxRects 常用启发式，提升装箱率）
    const ordered = inflated
      .slice()
      .sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
    for (const item of ordered) {
      packer.add(item.width, item.height, item.id);
    }
    if (packer.bins.length !== 1) continue;
    const bin = packer.bins[0];
    if (bin.rects.length !== inputs.length) continue;
    const rects: PackedRect[] = bin.rects.map((r) => ({
      id: r.data as string,
      x: r.x + pad,
      y: r.y + pad,
      w: r.width - pad * 2,
      h: r.height - pad * 2,
      rotated: r.rot,
    }));
    return { width: bin.width, height: bin.height, rects };
  }
  throw new Error(`无法在 ${opts.maxSize}x${opts.maxSize} 内打包全部 ${inputs.length} 帧`);
}
