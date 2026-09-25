/** 一个轴对齐矩形（像素单位）。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 导入的一帧。blob 始终保留原始 PNG，裁切只影响打包与预览时的采样区域。 */
export interface FrameItem {
  id: string;
  name: string;
  blob: Blob;
  /** 原始（未裁切）尺寸 */
  width: number;
  height: number;
  /** 帧时长（毫秒） */
  duration: number;
  /** 透明边缘裁切后的有效区域（相对原始图坐标）；null 表示未启用裁切 */
  trim: Rect | null;
}

/** 打包结果中的单帧信息。 */
export interface PackedFrame {
  id: string;
  name: string;
  /** 在图集中的位置与尺寸（裁切后的内容区域） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 裁切区域（相对原始图坐标），null 表示未裁切 */
  trim: Rect | null;
  /** 原始尺寸，预览对齐与 JSON 导出需要 */
  sourceW: number;
  sourceH: number;
  duration: number;
}

export interface PackResult {
  width: number;
  height: number;
  /** 统一留白（每个精灵四周的间距，像素） */
  padding: number;
  trimmed: boolean;
  frames: PackedFrame[];
}

export interface Settings {
  /** 是否裁切透明边缘 */
  trim: boolean;
  /** alpha 阈值：alpha >= threshold 视为可见（1-255） */
  alphaThreshold: number;
  /** 统一留白：每个精灵四周的间距（像素） */
  padding: number;
  /** 图集尺寸是否取 2 的幂 */
  pot: boolean;
  /** 图集最大边长 */
  maxSize: number;
  /** 新导入帧的默认时长（毫秒） */
  defaultDuration: number;
}

export const DEFAULT_SETTINGS: Settings = {
  trim: true,
  alphaThreshold: 1,
  padding: 2,
  pot: false,
  maxSize: 4096,
  defaultDuration: 100,
};
