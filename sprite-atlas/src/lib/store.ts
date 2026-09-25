import { writable } from 'svelte/store';
import { DEFAULT_SETTINGS, type FrameItem, type PackResult, type Settings } from './types';

export const frames = writable<FrameItem[]>([]);
export const settings = writable<Settings>({ ...DEFAULT_SETTINGS });
export const packResult = writable<PackResult | null>(null);
/** 渲染好的图集图片（object URL），供预览/导出/展示 */
export const atlasUrl = writable<string | null>(null);
export const selectedId = writable<string | null>(null);
export const playing = writable<boolean>(true);
/** 预览当前播放到的帧序号（由 Preview 组件回写，用于表格高亮） */
export const currentFrameIndex = writable<number>(-1);
export const projectName = writable<string>('未命名项目');
export const statusMessage = writable<string>('就绪');
export const saveState = writable<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
export const lastSavedAt = writable<number | null>(null);
