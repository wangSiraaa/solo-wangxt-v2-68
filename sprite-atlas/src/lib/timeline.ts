/**
 * 动画时间轴：把每帧时长（毫秒）转成累计起始时间，支持按时间查询帧序号。
 * 纯函数，便于单测；预览循环播放时对 total 取模。
 */
export interface Timeline {
  /** 每帧的起始时刻（与输入等长） */
  starts: number[];
  /** 一轮动画总时长 */
  total: number;
}

export function buildTimeline(durations: number[]): Timeline {
  const starts: number[] = [];
  let t = 0;
  for (const d of durations) {
    starts.push(t);
    t += Math.max(1, Math.round(d));
  }
  return { starts, total: t };
}

/** 给定时刻（毫秒，可超过一轮总长），返回应显示的帧序号；空时间轴返回 -1。 */
export function frameIndexAt(tl: Timeline, timeMs: number): number {
  const n = tl.starts.length;
  if (n === 0 || tl.total <= 0) return -1;
  const t = ((timeMs % tl.total) + tl.total) % tl.total;
  // 帧数通常不多，线性扫描足够；从后往前找第一个 start <= t
  for (let i = n - 1; i >= 0; i--) {
    if (t >= tl.starts[i]) return i;
  }
  return 0;
}
