import { describe, expect, it } from 'vitest';
import { buildTimeline, frameIndexAt } from './timeline';

describe('buildTimeline', () => {
  it('空时间轴 total 为 0', () => {
    expect(buildTimeline([])).toEqual({ starts: [], total: 0 });
  });

  it('累计起始时刻与总时长', () => {
    const tl = buildTimeline([100, 200, 150]);
    expect(tl.starts).toEqual([0, 100, 300]);
    expect(tl.total).toBe(450);
  });

  it('时长最小值夹取为 1', () => {
    const tl = buildTimeline([0, -5]);
    expect(tl.total).toBe(2);
  });
});

describe('frameIndexAt', () => {
  const tl = buildTimeline([100, 200, 150]); // [0,100,300), [100,300), [300,450)

  it('空时间轴返回 -1', () => {
    expect(frameIndexAt(buildTimeline([]), 0)).toBe(-1);
  });

  it('边界时刻落在正确帧', () => {
    expect(frameIndexAt(tl, 0)).toBe(0);
    expect(frameIndexAt(tl, 99)).toBe(0);
    expect(frameIndexAt(tl, 100)).toBe(1);
    expect(frameIndexAt(tl, 299)).toBe(1);
    expect(frameIndexAt(tl, 300)).toBe(2);
    expect(frameIndexAt(tl, 449)).toBe(2);
  });

  it('循环取模：450 回到第 0 帧', () => {
    expect(frameIndexAt(tl, 450)).toBe(0);
    expect(frameIndexAt(tl, 550)).toBe(1);
    expect(frameIndexAt(tl, 900)).toBe(0);
  });

  it('非等时长帧的驻留时间与设定一致', () => {
    // 统计一轮 0..449 中每帧出现次数，应分别为 100/200/150
    const counts = [0, 0, 0];
    for (let t = 0; t < tl.total; t++) counts[frameIndexAt(tl, t)]++;
    expect(counts).toEqual([100, 200, 150]);
  });
});
