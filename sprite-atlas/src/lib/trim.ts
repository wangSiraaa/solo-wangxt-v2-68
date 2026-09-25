import type { Rect } from './types';

/** 与浏览器 ImageData 结构兼容的最小接口，便于在 Node 中单测。 */
export interface ImageDataLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/**
 * 计算透明边缘裁切框。
 * alpha >= threshold 的像素视为可见；返回包围所有可见像素的最小矩形。
 * 完全透明的图返回 null，由调用方决定兜底策略。
 */
export function computeTrimBounds(img: ImageDataLike, threshold = 1): Rect | null {
  const { data, width, height } = img;
  const thr = Math.max(1, Math.min(255, Math.round(threshold)));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const alpha = data[(row + x) * 4 + 3];
      if (alpha >= thr) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * 完全透明帧的兜底裁切框：取中心 1x1，避免打包出 0 尺寸矩形，
 * 同时让预览时该帧仍对齐在原图中心。
 */
export function fallbackTrim(width: number, height: number): Rect {
  return { x: Math.floor(width / 2), y: Math.floor(height / 2), w: 1, h: 1 };
}

/** 浏览器环境：把 PNG Blob 解码为 ImageData。 */
export async function imageDataFromBlob(blob: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 2D 上下文');
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}
