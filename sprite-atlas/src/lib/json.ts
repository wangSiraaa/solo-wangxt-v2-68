import type { FrameItem, PackResult, PackedFrame, Rect, Settings } from './types';

/**
 * 导出的 JSON 格式（版本 1）。
 * 每帧内嵌原始 PNG 的 data URL，因此仅凭该 JSON 即可完整恢复
 * 帧列表、顺序、时长、裁切与打包结果，图片不离开浏览器。
 */
export interface AtlasJSON {
  app: 'svelte-sprite-atlas';
  version: 1;
  meta: {
    name: string;
    exportedAt: string;
    atlasWidth: number;
    atlasHeight: number;
    frameCount: number;
    totalDuration: number;
  };
  settings: Settings;
  frames: AtlasJSONFrame[];
}

export interface AtlasJSONFrame {
  id: string;
  name: string;
  duration: number;
  sourceSize: { w: number; h: number };
  /** 裁切区域（相对原始图坐标），null 表示未裁切 */
  trim: Rect | null;
  /** 在图集中的位置与尺寸 */
  frame: Rect;
  /** 原始 PNG 的 data URL */
  image: string;
}

export const JSON_APP_ID = 'svelte-sprite-atlas' as const;

export function serializeProject(
  name: string,
  frames: FrameItem[],
  settings: Settings,
  pack: PackResult,
  dataUrls: Map<string, string>,
): AtlasJSON {
  const byId = new Map(pack.frames.map((f) => [f.id, f]));
  return {
    app: JSON_APP_ID,
    version: 1,
    meta: {
      name,
      exportedAt: new Date().toISOString(),
      atlasWidth: pack.width,
      atlasHeight: pack.height,
      frameCount: frames.length,
      totalDuration: frames.reduce((s, f) => s + f.duration, 0),
    },
    settings: { ...settings },
    frames: frames.map((f) => {
      const p = byId.get(f.id);
      if (!p) throw new Error(`帧 ${f.name} 缺少打包结果，请先重新打包`);
      const image = dataUrls.get(f.id);
      if (!image) throw new Error(`帧 ${f.name} 缺少图像数据`);
      return {
        id: f.id,
        name: f.name,
        duration: f.duration,
        sourceSize: { w: f.width, h: f.height },
        trim: f.trim ? { ...f.trim } : null,
        frame: { x: p.x, y: p.y, w: p.w, h: p.h },
        image,
      };
    }),
  };
}

export interface ParsedProject {
  settings: Settings;
  frames: {
    id: string;
    name: string;
    duration: number;
    width: number;
    height: number;
    trim: Rect | null;
    dataUrl: string;
  }[];
  pack: PackResult;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`JSON 字段 ${field} 应为数字`);
  }
  return v;
}
function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`JSON 字段 ${field} 应为字符串`);
  return v;
}
function rect(v: unknown, field: string): Rect {
  if (!isObj(v)) throw new Error(`JSON 字段 ${field} 应为矩形对象`);
  return {
    x: num(v.x, `${field}.x`),
    y: num(v.y, `${field}.y`),
    w: num(v.w, `${field}.w`),
    h: num(v.h, `${field}.h`),
  };
}
function rectOrNull(v: unknown, field: string): Rect | null {
  if (v === null) return null;
  return rect(v, field);
}

/** 解析并校验导出的 JSON；格式非法时抛出带说明的错误。 */
export function parseProject(raw: unknown): ParsedProject {
  if (!isObj(raw)) throw new Error('不是有效的 JSON 对象');
  if (raw.app !== JSON_APP_ID) throw new Error('不是本工具导出的 JSON（app 标识不符）');
  if (raw.version !== 1) throw new Error(`不支持的 JSON 版本：${String(raw.version)}`);
  if (!isObj(raw.settings)) throw new Error('缺少 settings');
  const s = raw.settings;
  const settings: Settings = {
    trim: Boolean(s.trim),
    alphaThreshold: num(s.alphaThreshold, 'settings.alphaThreshold'),
    padding: num(s.padding, 'settings.padding'),
    pot: Boolean(s.pot),
    maxSize: num(s.maxSize, 'settings.maxSize'),
    defaultDuration: num(s.defaultDuration, 'settings.defaultDuration'),
  };
  if (!Array.isArray(raw.frames)) throw new Error('缺少 frames 数组');

  const frames: ParsedProject['frames'] = [];
  const packed: PackedFrame[] = [];
  raw.frames.forEach((fv, i) => {
    if (!isObj(fv)) throw new Error(`frames[${i}] 应为对象`);
    const src = isObj(fv.sourceSize) ? fv.sourceSize : {};
    const width = num(src.w, `frames[${i}].sourceSize.w`);
    const height = num(src.h, `frames[${i}].sourceSize.h`);
    const trim = rectOrNull(fv.trim ?? null, `frames[${i}].trim`);
    const frame = rect(fv.frame, `frames[${i}].frame`);
    const dataUrl = str(fv.image, `frames[${i}].image`);
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error(`frames[${i}].image 不是图片 data URL`);
    }
    const id = str(fv.id, `frames[${i}].id`);
    const name = str(fv.name, `frames[${i}].name`);
    const duration = num(fv.duration, `frames[${i}].duration`);
    frames.push({ id, name, duration, width, height, trim, dataUrl });
    packed.push({
      id,
      name,
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      trim,
      sourceW: width,
      sourceH: height,
      duration,
    });
  });
  if (!isObj(raw.meta)) throw new Error('缺少 meta');
  const pack: PackResult = {
    width: num(raw.meta.atlasWidth, 'meta.atlasWidth'),
    height: num(raw.meta.atlasHeight, 'meta.atlasHeight'),
    padding: settings.padding,
    trimmed: settings.trim,
    frames: packed,
  };
  return { settings, frames, pack };
}
