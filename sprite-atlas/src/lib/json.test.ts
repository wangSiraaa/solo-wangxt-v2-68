import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from './json';
import { DEFAULT_SETTINGS, type FrameItem, type PackResult } from './types';

function makeFrames(): FrameItem[] {
  return [
    {
      id: 'f1',
      name: 'run_00.png',
      blob: new Blob(['x'], { type: 'image/png' }),
      width: 64,
      height: 64,
      duration: 120,
      trim: { x: 14, y: 12, w: 36, h: 40 },
    },
    {
      id: 'f2',
      name: 'run_01.png',
      blob: new Blob(['yy'], { type: 'image/png' }),
      width: 80,
      height: 48,
      duration: 80,
      trim: null,
    },
    {
      id: 'f3',
      name: 'empty.png',
      blob: new Blob(['z'], { type: 'image/png' }),
      width: 32,
      height: 32,
      duration: 200,
      trim: { x: 16, y: 16, w: 1, h: 1 },
    },
  ];
}

function makePack(): PackResult {
  return {
    width: 128,
    height: 96,
    padding: 2,
    trimmed: true,
    frames: [
      {
        id: 'f1',
        name: 'run_00.png',
        x: 2,
        y: 2,
        w: 36,
        h: 40,
        trim: { x: 14, y: 12, w: 36, h: 40 },
        sourceW: 64,
        sourceH: 64,
        duration: 120,
      },
      {
        id: 'f2',
        name: 'run_01.png',
        x: 40,
        y: 2,
        w: 80,
        h: 48,
        trim: null,
        sourceW: 80,
        sourceH: 48,
        duration: 80,
      },
      {
        id: 'f3',
        name: 'empty.png',
        x: 2,
        y: 44,
        w: 1,
        h: 1,
        trim: { x: 16, y: 16, w: 1, h: 1 },
        sourceW: 32,
        sourceH: 32,
        duration: 200,
      },
    ],
  };
}

describe('JSON 往返', () => {
  it('序列化再解析后：帧顺序、时长、裁切、打包位置全部一致', () => {
    const frames = makeFrames();
    const pack = makePack();
    const urls = new Map([
      ['f1', 'data:image/png;base64,AAAA'],
      ['f2', 'data:image/png;base64,BBBB'],
      ['f3', 'data:image/png;base64,CCCC'],
    ]);
    const json = serializeProject('测试项目', frames, DEFAULT_SETTINGS, pack, urls);
    // 真实流程会 JSON.stringify → 存储/下载 → JSON.parse
    const parsed = parseProject(JSON.parse(JSON.stringify(json)));

    expect(parsed.frames.map((f) => f.id)).toEqual(['f1', 'f2', 'f3']);
    expect(parsed.frames.map((f) => f.name)).toEqual(['run_00.png', 'run_01.png', 'empty.png']);
    expect(parsed.frames.map((f) => f.duration)).toEqual([120, 80, 200]);
    expect(parsed.frames.map((f) => [f.width, f.height])).toEqual([
      [64, 64],
      [80, 48],
      [32, 32],
    ]);
    expect(parsed.frames[0].trim).toEqual({ x: 14, y: 12, w: 36, h: 40 });
    expect(parsed.frames[1].trim).toBeNull();
    expect(parsed.frames[2].trim).toEqual({ x: 16, y: 16, w: 1, h: 1 });
    expect(parsed.frames.map((f) => f.dataUrl)).toEqual([
      'data:image/png;base64,AAAA',
      'data:image/png;base64,BBBB',
      'data:image/png;base64,CCCC',
    ]);

    expect(parsed.pack.width).toBe(128);
    expect(parsed.pack.height).toBe(96);
    expect(parsed.pack.frames).toHaveLength(3);
    expect(parsed.pack.frames[0]).toMatchObject({
      x: 2,
      y: 2,
      w: 36,
      h: 40,
      duration: 120,
    });
    expect(parsed.pack.frames[2]).toMatchObject({ x: 2, y: 44, w: 1, h: 1 });
    expect(parsed.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('meta 记录帧数与总时长', () => {
    const urls = new Map([
      ['f1', 'data:image/png;base64,A'],
      ['f2', 'data:image/png;base64,B'],
      ['f3', 'data:image/png;base64,C'],
    ]);
    const json = serializeProject('p', makeFrames(), DEFAULT_SETTINGS, makePack(), urls);
    expect(json.meta.frameCount).toBe(3);
    expect(json.meta.totalDuration).toBe(400);
    expect(json.version).toBe(1);
  });

  it('非法输入给出明确错误', () => {
    expect(() => parseProject({ app: 'other', version: 1 })).toThrow(/app 标识/);
    expect(() => parseProject({ app: 'svelte-sprite-atlas', version: 9 })).toThrow(
      /版本/,
    );
    const urls = new Map([
      ['f1', 'data:image/png;base64,A'],
      ['f2', 'data:image/png;base64,B'],
      ['f3', 'data:image/png;base64,C'],
    ]);
    const json = serializeProject('p', makeFrames(), DEFAULT_SETTINGS, makePack(), urls);
    const broken = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
    delete broken.meta;
    expect(() => parseProject(broken)).toThrow(/meta/);
    const badImage = JSON.parse(JSON.stringify(json));
    badImage.frames[0].image = 'http://example.com/a.png';
    expect(() => parseProject(badImage)).toThrow(/data URL/);
  });
});
