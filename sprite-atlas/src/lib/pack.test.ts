import { describe, expect, it } from 'vitest';
import { candidateSizes, packRects, type PackInput } from './pack';

/** 模拟不同尺寸、含透明边缘素材被裁切后的各种奇形怪状尺寸。 */
function mixedInputs(): PackInput[] {
  return [
    { id: 'a', width: 36, height: 40 }, // 64x64 裁出的内容
    { id: 'b', width: 71, height: 24 }, // 80x48 裁出
    { id: 'c', width: 18, height: 72 }, // 32x96 的高条
    { id: 'd', width: 10, height: 10 }, // 100x100 中角落小点
    { id: 'e', width: 40, height: 60 }, // 50x70 裁掉 5px 边
    { id: 'f', width: 62, height: 62 }, // 64x64 近满幅
    { id: 'g', width: 1, height: 1 }, // 全透明帧的兜底 1x1
    { id: 'h', width: 104, height: 20 }, // 120x36 的宽条
  ];
}

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

describe('packRects', () => {
  it('空输入返回空布局', () => {
    expect(packRects([], { padding: 0, pot: false, maxSize: 4096 })).toEqual({
      width: 0,
      height: 0,
      rects: [],
    });
  });

  it('全部帧都被放置、尺寸不变、固定方向不旋转', () => {
    const inputs = mixedInputs();
    const layout = packRects(inputs, { padding: 4, pot: false, maxSize: 4096 });
    expect(layout.rects).toHaveLength(inputs.length);
    const byId = new Map(layout.rects.map((r) => [r.id, r]));
    for (const inp of inputs) {
      const r = byId.get(inp.id)!;
      expect(r).toBeDefined();
      expect(r.w).toBe(inp.width);
      expect(r.h).toBe(inp.height);
      expect(r.rotated).toBe(false); // 不允许旋转
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(layout.width);
      expect(r.y + r.h).toBeLessThanOrEqual(layout.height);
    }
  });

  it('统一留白：每帧四周至少 padding 像素，含图集边缘', () => {
    const p = 4;
    const inputs = mixedInputs();
    const layout = packRects(inputs, { padding: p, pot: false, maxSize: 4096 });
    for (const r of layout.rects) {
      expect(r.x).toBeGreaterThanOrEqual(p);
      expect(r.y).toBeGreaterThanOrEqual(p);
      expect(layout.width - (r.x + r.w)).toBeGreaterThanOrEqual(p);
      expect(layout.height - (r.y + r.h)).toBeGreaterThanOrEqual(p);
    }
    // 任意两帧的“外扩 padding 矩形”不得相交
    const inflated = layout.rects.map((r) => ({
      id: r.id,
      x0: r.x - p,
      y0: r.y - p,
      x1: r.x + r.w + p,
      y1: r.y + r.h + p,
    }));
    for (let i = 0; i < inflated.length; i++) {
      for (let j = i + 1; j < inflated.length; j++) {
        const a = inflated[i];
        const b = inflated[j];
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap, `${a.id} 与 ${b.id} 的留白区域重叠`).toBe(false);
      }
    }
  });

  it('padding=0 时帧可以紧挨但不出界', () => {
    const layout = packRects(mixedInputs(), { padding: 0, pot: false, maxSize: 4096 });
    expect(layout.rects).toHaveLength(8);
  });

  it('pot 选项下图集宽高均为 2 的幂', () => {
    const layout = packRects(mixedInputs(), { padding: 2, pot: true, maxSize: 4096 });
    expect(isPow2(layout.width)).toBe(true);
    expect(isPow2(layout.height)).toBe(true);
  });

  it('结果确定：同样输入两次打包位置一致', () => {
    const opts = { padding: 2, pot: false, maxSize: 4096 } as const;
    const a = packRects(mixedInputs(), opts);
    const b = packRects(mixedInputs(), opts);
    const key = (l: typeof a) =>
      JSON.stringify(
        l.rects
          .slice()
          .sort((x, y) => x.id.localeCompare(y.id))
          .map((r) => [r.id, r.x, r.y, r.w, r.h]),
      );
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(key(a)).toBe(key(b));
  });

  it('单帧超过最大尺寸抛错', () => {
    expect(() =>
      packRects([{ id: 'big', width: 5000, height: 32 }], {
        padding: 0,
        pot: false,
        maxSize: 4096,
      }),
    ).toThrow(/超过/);
  });

  it('候选尺寸单调递增且都不小于最大单帧', () => {
    const inputs = mixedInputs();
    const sizes = candidateSizes(inputs, { padding: 2, pot: false, maxSize: 4096 });
    expect(sizes.length).toBeGreaterThan(1);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i].width * sizes[i].height).toBeGreaterThanOrEqual(
        sizes[i - 1].width * sizes[i - 1].height,
      );
    }
  });
});
