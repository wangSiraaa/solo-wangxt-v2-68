<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { Application, Container, Graphics, Sprite, Texture, type Ticker } from 'pixi.js';
  import { currentFrameIndex, frames, packResult, playing } from '../lib/store';
  import { buildTimeline, frameIndexAt, type Timeline } from '../lib/timeline';
  import type { FrameItem } from '../lib/types';

  let host: HTMLDivElement;
  let app: Application | null = null;
  let scene: Container | null = null;
  let guide: Graphics | null = null;

  let sprites: Sprite[] = [];
  let spriteFrames: FrameItem[] = [];
  let timeline: Timeline = buildTimeline([]);
  let elapsed = 0;
  let current = -1;
  let gen = 0;
  let destroyed = false;

  /** 只有当帧的裁切区域/原始尺寸发生变化时才重建纹理；改时长不重建。 */
  function signature(fs: FrameItem[]): string {
    return fs
      .map((f) => {
        const t = f.trim;
        return `${f.id}:${t ? `${t.x},${t.y},${t.w},${t.h}` : 'full'}:${f.width}x${f.height}`;
      })
      .join('|');
  }
  let lastSig = '';

  async function rebuild(fs: FrameItem[]): Promise<void> {
    if (!app || !scene) return;
    const myGen = ++gen;
    const next: Sprite[] = [];
    for (const f of fs) {
      const bmp = await createImageBitmap(f.blob);
      const t = f.trim ?? { x: 0, y: 0, w: f.width, h: f.height };
      const c = document.createElement('canvas');
      c.width = t.w;
      c.height = t.h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
      bmp.close();
      const tex = Texture.from(c);
      tex.source.scaleMode = 'nearest';
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.visible = false;
      next.push(sp);
    }
    if (destroyed || myGen !== gen) {
      next.forEach((s) => s.destroy({ texture: true }));
      return;
    }
    scene.removeChildren().forEach((c) => c.destroy({ texture: true }));
    for (const s of next) scene.addChild(s);
    sprites = next;
    spriteFrames = fs;
    current = -1;
    layout();
  }

  function layout(): void {
    if (!app || !guide) return;
    if (spriteFrames.length === 0) {
      guide.clear();
      return;
    }
    const w = app.screen.width;
    const h = app.screen.height;
    const maxW = Math.max(...spriteFrames.map((f) => f.width));
    const maxH = Math.max(...spriteFrames.map((f) => f.height));
    const scale = Math.max(1, Math.min((w - 56) / maxW, (h - 72) / maxH, 10));
    const cx = w / 2;
    const cy = h / 2;
    guide.clear();
    guide
      .rect(cx - (maxW * scale) / 2, cy - (maxH * scale) / 2, maxW * scale, maxH * scale)
      .stroke({ width: 1, color: 0x394452 });
    guide
      .moveTo(cx - 10, cy)
      .lineTo(cx + 10, cy)
      .moveTo(cx, cy - 10)
      .lineTo(cx, cy + 10)
      .stroke({ width: 1, color: 0x394452 });
    spriteFrames.forEach((f, i) => {
      const t = f.trim ?? { x: 0, y: 0, w: f.width, h: f.height };
      // 裁切后内容中心相对原始中心的偏移，保证各帧按原坐标系对齐（类似 pivot 锚点）
      const dx = t.x + t.w / 2 - f.width / 2;
      const dy = t.y + t.h / 2 - f.height / 2;
      const sp = sprites[i];
      sp.scale.set(scale);
      sp.position.set(cx + dx * scale, cy + dy * scale);
    });
  }

  function tick(t: Ticker): void {
    if (get(playing)) elapsed += t.deltaMS;
    const idx = frameIndexAt(timeline, elapsed);
    if (idx !== current) {
      current = idx;
      sprites.forEach((s, i) => {
        s.visible = i === idx;
      });
      currentFrameIndex.set(idx);
    }
  }

  function reset(): void {
    elapsed = 0;
    current = -1;
  }

  onMount(() => {
    const unsubs: Array<() => void> = [];
    (async () => {
      app = new Application();
      await app.init({ background: 0x14181d, antialias: false, resizeTo: host });
      if (destroyed) {
        app.destroy();
        app = null;
        return;
      }
      host.appendChild(app.canvas);
      guide = new Graphics();
      scene = new Container();
      app.stage.addChild(guide);
      app.stage.addChild(scene);
      app.renderer.on('resize', layout);
      app.ticker.add(tick);

      unsubs.push(
        frames.subscribe((fs) => {
          timeline = buildTimeline(fs.map((f) => f.duration));
          const s = signature(fs);
          if (s !== lastSig) {
            lastSig = s;
            void rebuild(fs);
          }
        }),
      );
    })();
    return () => {
      destroyed = true;
      unsubs.forEach((u) => u());
      if (app) {
        try {
          app.canvas.remove();
          app.destroy(true);
        } catch {
          /* 已销毁则忽略 */
        }
        app = null;
      }
    };
  });

  $: idx = $currentFrameIndex;
  $: curInfo =
    idx >= 0 && $packResult
      ? (() => {
          const pf = $packResult.frames[idx];
          if (!pf) return '';
          return `#${idx + 1} ${pf.name} · ${pf.duration}ms · 图集位置 (${pf.x}, ${pf.y}) · 尺寸 ${pf.w}×${pf.h} · 原图 ${pf.sourceW}×${pf.sourceH}`;
        })()
      : '';
</script>

<div class="preview">
  <div class="bar">
    <span>动画预览（PixiJS，按序列顺序循环）</span>
    <span class="controls">
      <button onclick={() => playing.set(!$playing)}>{$playing ? '暂停' : '播放'}</button>
      <button onclick={reset}>回到第 1 帧</button>
    </span>
  </div>
  <div class="canvas-host" bind:this={host}></div>
  <div class="info">
    {#if $frames.length === 0}暂无帧{:else}{curInfo}{/if}
  </div>
</div>
