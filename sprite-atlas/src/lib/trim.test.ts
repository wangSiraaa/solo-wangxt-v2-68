import { describe, expect, it } from 'vitest';
import { computeTrimBounds, fallbackTrim, type ImageDataLike } from './trim';
import type { Rect } from './types';

/** 造一张 width×height 的 RGBA 图，只在 opaque 指定的像素上写颜色。 */
function makeImage(
  width: number,
  height: number,
  opaque: Array<[number, number, number?]> = [],
): ImageDataLike {
  const data = new Uint8Array(width * height * 4);
  for (const [x, y, alpha = 255] of opaque) {
    const i = (y * width + x) * 4;
    data[i] = 200;
    data[i + 1] = 100;
    data[i + 2] = 50;
    data[i + 3] = alpha;
  }
  return { data, width, height };
}

function fill(
  img: ImageDataLike,
  r: Rect,
  alpha = 255,
): ImageDataLike {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i + 3] = alpha;
    }
  }
  return img;
}

describe('computeTrimBounds', () => {
  it('完全透明返回 null', () => {
    expect(computeTrimBounds(makeImage(64, 48))).toBeNull();
  });

  it('单像素可见返回 1x1 框', () => {
    expect(computeTrimBounds(makeImage(64, 48, [[10, 20]]))).toEqual({
      x: 10,
      y: 20,
      w: 1,
      h: 1,
    });
  });

  it('大块内容外加透明边缘时给出精确包围盒（不同尺寸）', () => {
    const img = makeImage(100, 80);
    fill(img, { x: 30, y: 12, w: 25, h: 40 });
    expect(computeTrimBounds(img)).toEqual({ x: 30, y: 12, w: 25, h: 40 });
  });

  it('非对称留白：内容在右上角', () => {
    const img = makeImage(120, 90);
    fill(img, { x: 105, y: 2, w: 14, h: 9 });
    expect(computeTrimBounds(img)).toEqual({ x: 105, y: 2, w: 14, h: 9 });
  });

  it('满画布不透明时返回整张图', () => {
    const img = makeImage(32, 17);
    fill(img, { x: 0, y: 0, w: 32, h: 17 });
    expect(computeTrimBounds(img)).toEqual({ x: 0, y: 0, w: 32, h: 17 });
  });

  it('Alpha 阈值：半透明像素按阈值取舍', () => {
    // 一个 alpha=128 的像素
    const img = makeImage(16, 16, [[8, 8, 128]]);
    expect(computeTrimBounds(img, 200)).toBeNull();
    expect(computeTrimBounds(img, 100)).toEqual({ x: 8, y: 8, w: 1, h: 1 });
  });

  it('阈值参数夹取到 1-255', () => {
    const img = makeImage(4, 4, [[0, 0, 1]]);
    expect(computeTrimBounds(img, -50)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(computeTrimBounds(makeImage(4, 4, [[0, 0, 255]]), 999)).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it('fallbackTrim 给中心 1x1（全透明帧兜底）', () => {
    expect(fallbackTrim(64, 48)).toEqual({ x: 32, y: 24, w: 1, h: 1 });
  });
});
