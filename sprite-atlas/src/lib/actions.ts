import { get } from 'svelte/store';
import {
  atlasUrl,
  currentFrameIndex,
  frames,
  lastSavedAt,
  packResult,
  projectName,
  saveState,
  settings,
  statusMessage,
} from './store';
import type { FrameItem, PackResult, PackedFrame, Rect, Settings } from './types';
import { computeTrimBounds, fallbackTrim, imageDataFromBlob } from './trim';
import { packRects } from './pack';
import { parseProject, serializeProject } from './json';
import { loadProject, saveProject, toStoredProject } from './db';
import { blobToDataUrl, downloadBlob } from './fileutil';

/* ---------------- 缓存 ---------------- */

const bitmapCache = new Map<string, ImageBitmap>();
/** 按 `id:alpha阈值` 缓存裁切框，改留白/顺序时不必重算像素 */
const trimCache = new Map<string, Rect>();

async function getBitmap(f: FrameItem): Promise<ImageBitmap> {
  let bmp = bitmapCache.get(f.id);
  if (!bmp) {
    bmp = await createImageBitmap(f.blob);
    bitmapCache.set(f.id, bmp);
  }
  return bmp;
}

function forgetFrame(id: string) {
  bitmapCache.get(id)?.close();
  bitmapCache.delete(id);
  for (const key of [...trimCache.keys()]) {
    if (key.startsWith(`${id}:`)) trimCache.delete(key);
  }
}

/* ---------------- 导入 ---------------- */

export async function importFiles(files: File[]): Promise<void> {
  const list = files.filter(
    (f) => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png'),
  );
  if (list.length === 0) {
    statusMessage.set('未找到 PNG 文件');
    return;
  }
  const s = get(settings);
  const newFrames: FrameItem[] = [];
  for (const file of list) {
    const bmp = await createImageBitmap(file);
    newFrames.push({
      id: crypto.randomUUID(),
      name: file.name,
      blob: file,
      width: bmp.width,
      height: bmp.height,
      duration: s.defaultDuration,
      trim: null,
    });
    bmp.close();
  }
  frames.update((fs) => [...fs, ...newFrames]);
  statusMessage.set(`已导入 ${newFrames.length} 帧`);
  await repack();
}

export async function loadDemoFrames(): Promise<void> {
  try {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}demo-frames/manifest.json`);
    const names = (await res.json()) as string[];
    const files: File[] = [];
    for (const n of names) {
      const r = await fetch(`${base}demo-frames/${n}`);
      const b = await r.blob();
      files.push(new File([b], n, { type: 'image/png' }));
    }
    await importFiles(files);
  } catch (e) {
    statusMessage.set(`示例帧加载失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ---------------- 帧操作 ---------------- */

export function removeFrame(id: string): void {
  frames.update((fs) => fs.filter((f) => f.id !== id));
  forgetFrame(id);
  scheduleRepack();
}

export function moveFrame(id: string, dir: -1 | 1): void {
  frames.update((fs) => {
    const i = fs.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fs.length) return fs;
    const next = [...fs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  // 顺序不影响已算好的打包位置，无需重新打包
}

export function setFrameDuration(id: string, ms: number): void {
  const v = Math.max(1, Math.round(ms));
  if (!Number.isFinite(v)) return;
  frames.update((fs) => fs.map((f) => (f.id === id ? { ...f, duration: v } : f)));
  packResult.update((p) =>
    p ? { ...p, frames: p.frames.map((f) => (f.id === id ? { ...f, duration: v } : f)) } : p,
  );
}

export function applyDurationToAll(ms: number): void {
  const v = Math.max(1, Math.round(ms));
  frames.update((fs) => fs.map((f) => ({ ...f, duration: v })));
  packResult.update((p) =>
    p ? { ...p, frames: p.frames.map((f) => ({ ...f, duration: v })) } : p,
  );
  statusMessage.set(`全部帧时长已设为 ${v}ms`);
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.update((s) => ({ ...s, ...patch }));
  scheduleRepack();
}

export function clearAll(): void {
  for (const f of get(frames)) forgetFrame(f.id);
  frames.set([]);
  packResult.set(null);
  currentFrameIndex.set(-1);
  setAtlasUrl(null);
  statusMessage.set('已清空');
}

/* ---------------- 打包 ---------------- */

let repackTimer: ReturnType<typeof setTimeout> | undefined;
let repacking = false;
let repackAgain = false;

export function scheduleRepack(): void {
  clearTimeout(repackTimer);
  repackTimer = setTimeout(() => void repack(), 200);
}

export async function repack(): Promise<void> {
  if (repacking) {
    repackAgain = true;
    return;
  }
  repacking = true;
  try {
    do {
      repackAgain = false;
      await repackOnce();
    } while (repackAgain);
  } finally {
    repacking = false;
  }
}

async function repackOnce(): Promise<void> {
  const s = get(settings);
  const fs = get(frames);
  if (fs.length === 0) {
    packResult.set(null);
    setAtlasUrl(null);
    return;
  }
  // 1) 透明边缘裁切（结果缓存，设置不变时直接复用）
  const updated = await Promise.all(
    fs.map(async (f) => {
      if (!s.trim) return f.trim === null ? f : { ...f, trim: null };
      const key = `${f.id}:${s.alphaThreshold}`;
      let trim = trimCache.get(key);
      if (!trim) {
        const img = await imageDataFromBlob(f.blob);
        trim =
          computeTrimBounds(img, s.alphaThreshold) ?? fallbackTrim(img.width, img.height);
        trimCache.set(key, trim);
      }
      const same =
        f.trim && f.trim.x === trim.x && f.trim.y === trim.y &&
        f.trim.w === trim.w && f.trim.h === trim.h;
      return same ? f : { ...f, trim };
    }),
  );
  frames.set(updated);

  // 2) maxrects 打包（固定方向，不旋转）
  const layout = packRects(
    updated.map((f) => ({
      id: f.id,
      width: f.trim ? f.trim.w : f.width,
      height: f.trim ? f.trim.h : f.height,
    })),
    { padding: s.padding, pot: s.pot, maxSize: s.maxSize },
  );
  const byId = new Map(layout.rects.map((r) => [r.id, r]));
  const packedFrames: PackedFrame[] = updated.map((f) => {
    const r = byId.get(f.id)!;
    return {
      id: f.id,
      name: f.name,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      trim: f.trim,
      sourceW: f.width,
      sourceH: f.height,
      duration: f.duration,
    };
  });
  const pack: PackResult = {
    width: layout.width,
    height: layout.height,
    padding: s.padding,
    trimmed: s.trim,
    frames: packedFrames,
  };
  packResult.set(pack);

  // 3) 渲染图集图片
  const blob = await renderAtlas(updated, pack);
  setAtlasUrl(URL.createObjectURL(blob));
  statusMessage.set(`打包完成：${pack.width}×${pack.height}，共 ${pack.frames.length} 帧`);
}

/** 按打包结果把各帧（裁切区域）绘制到一张图集画布上。 */
export async function renderAtlas(fs: FrameItem[], pack: PackResult): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = pack.width;
  canvas.height = pack.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 上下文');
  for (const pf of pack.frames) {
    const f = fs.find((x) => x.id === pf.id);
    if (!f) continue;
    const bmp = await getBitmap(f);
    const sx = pf.trim ? pf.trim.x : 0;
    const sy = pf.trim ? pf.trim.y : 0;
    ctx.drawImage(bmp, sx, sy, pf.w, pf.h, pf.x, pf.y, pf.w, pf.h);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图集编码失败'))),
      'image/png',
    ),
  );
}

function setAtlasUrl(url: string | null): void {
  const old = get(atlasUrl);
  if (old) URL.revokeObjectURL(old);
  atlasUrl.set(url);
}

/* ---------------- 导出 ---------------- */

export async function exportPng(): Promise<void> {
  const pack = get(packResult);
  if (!pack) {
    statusMessage.set('没有打包结果，请先导入帧');
    return;
  }
  const blob = await renderAtlas(get(frames), pack);
  downloadBlob(blob, `${get(projectName) || 'atlas'}.png`);
  statusMessage.set('已导出图集 PNG');
}

export async function exportJson(): Promise<void> {
  const pack = get(packResult);
  if (!pack) {
    statusMessage.set('没有打包结果，请先导入帧');
    return;
  }
  const fs = get(frames);
  const dataUrls = new Map<string, string>();
  for (const f of fs) dataUrls.set(f.id, await blobToDataUrl(f.blob));
  const json = serializeProject(get(projectName), fs, get(settings), pack, dataUrls);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${get(projectName) || 'atlas'}.json`);
  statusMessage.set('已导出 JSON（内嵌帧图像，可完整恢复项目）');
}

/** 导入先前导出的 JSON：恢复帧列表、顺序、时长、裁切与打包结果。 */
export async function importJsonFile(file: File): Promise<void> {
  let parsed;
  try {
    parsed = parseProject(JSON.parse(await file.text()));
  } catch (e) {
    statusMessage.set(`JSON 导入失败：${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const f of get(frames)) forgetFrame(f.id);
  const newFrames: FrameItem[] = [];
  for (const pf of parsed.frames) {
    const blob = await (await fetch(pf.dataUrl)).blob();
    newFrames.push({
      id: pf.id,
      name: pf.name,
      duration: pf.duration,
      blob,
      width: pf.width,
      height: pf.height,
      trim: pf.trim,
    });
  }
  settings.set(parsed.settings);
  frames.set(newFrames);
  packResult.set(parsed.pack);
  const blob = await renderAtlas(newFrames, parsed.pack);
  setAtlasUrl(URL.createObjectURL(blob));
  statusMessage.set(
    `已从 JSON 恢复 ${newFrames.length} 帧（图集 ${parsed.pack.width}×${parsed.pack.height}）`,
  );
}

/* ---------------- IndexedDB 持久化 ---------------- */

export async function initFromDB(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const rec = await loadProject();
    if (!rec || rec.frames.length === 0) return;
    settings.set(rec.settings);
    frames.set(
      rec.frames.map((f) => ({
        id: f.id,
        name: f.name,
        duration: f.duration,
        blob: f.blob,
        width: f.width,
        height: f.height,
        trim: f.trim,
      })),
    );
    if (rec.pack && rec.pack.frames.length === rec.frames.length) {
      packResult.set(rec.pack);
      const blob = await renderAtlas(get(frames), rec.pack);
      setAtlasUrl(URL.createObjectURL(blob));
    } else {
      await repack();
    }
    lastSavedAt.set(rec.savedAt);
    saveState.set('saved');
    statusMessage.set(`已从 IndexedDB 恢复项目（${rec.frames.length} 帧）`);
  } catch (e) {
    console.warn('恢复本地项目失败', e);
  }
}

let autosaveStarted = false;

export function startAutosave(): void {
  if (autosaveStarted || typeof indexedDB === 'undefined') return;
  autosaveStarted = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dirty = () => {
    saveState.set('dirty');
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), 800);
  };
  frames.subscribe(dirty);
  settings.subscribe(dirty);
  packResult.subscribe(dirty);
}

async function saveNow(): Promise<void> {
  saveState.set('saving');
  try {
    await saveProject(toStoredProject(get(settings), get(frames), get(packResult)));
    lastSavedAt.set(Date.now());
    saveState.set('saved');
  } catch (e) {
    console.warn('自动保存失败', e);
    saveState.set('error');
  }
}
