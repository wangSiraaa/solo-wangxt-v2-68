<script lang="ts">
  import { get } from 'svelte/store';
  import { atlasUrl, currentFrameIndex, packResult, selectedId } from '../lib/store';

  let canvas: HTMLCanvasElement;
  let img: HTMLImageElement | null = null;
  let imgUrl = '';

  $: {
    void $atlasUrl;
    if ($atlasUrl && $atlasUrl !== imgUrl) {
      imgUrl = $atlasUrl;
      const i = new Image();
      i.onload = () => {
        img = i;
        draw();
      };
      i.src = imgUrl;
    } else if (!$atlasUrl) {
      img = null;
      imgUrl = '';
    }
  }

  // 打包结果 / 选中 / 播放帧变化时重绘框线
  $: {
    void $packResult;
    void $selectedId;
    void $currentFrameIndex;
    draw();
  }

  function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const tile = document.createElement('canvas');
    tile.width = 16;
    tile.height = 16;
    const t = tile.getContext('2d')!;
    t.fillStyle = '#1b2026';
    t.fillRect(0, 0, 16, 16);
    t.fillStyle = '#232932';
    t.fillRect(0, 0, 8, 8);
    t.fillRect(8, 8, 8, 8);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
    ctx.fillRect(0, 0, w, h);
  }

  function draw(): void {
    if (!canvas) return;
    const pack = get(packResult);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!pack || !img) {
      canvas.width = 1;
      canvas.height = 1;
      ctx.clearRect(0, 0, 1, 1);
      return;
    }
    canvas.width = pack.width;
    canvas.height = pack.height;
    drawChecker(ctx, pack.width, pack.height);
    ctx.drawImage(img, 0, 0);
    const sel = get(selectedId);
    const curIdx = get(currentFrameIndex);
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    pack.frames.forEach((f, i) => {
      const isSel = f.id === sel;
      const isCur = i === curIdx;
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.strokeStyle = isSel
        ? '#ffd54a'
        : isCur
          ? '#7bff9e'
          : 'rgba(96,205,255,0.9)';
      ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
      const label = String(i + 1);
      const tw = ctx.measureText(label).width + 6;
      ctx.fillStyle = 'rgba(8,10,13,0.75)';
      ctx.fillRect(f.x, f.y, tw, 13);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, f.x + 3, f.y + 1);
    });
  }

  function onClick(e: MouseEvent): void {
    const pack = get(packResult);
    if (!pack) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width;
    const y = ((e.clientY - r.top) / r.height) * canvas.height;
    // 后遍历：命中最上层
    const hit = [...pack.frames].reverse().find(
      (f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h,
    );
    selectedId.set(hit ? hit.id : null);
  }
</script>

<div class="atlas">
  <div class="bar">
    <span>图集预览</span>
    {#if $packResult}
      <span class="atlas-size">{$packResult.width}×{$packResult.height}</span>
    {/if}
  </div>
  <div class="atlas-scroll">
    {#if $packResult}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <canvas bind:this={canvas} onclick={onClick} aria-label="图集"></canvas>
    {:else}
      <p class="empty">导入帧后在此显示打包结果，点击矩形可选中对应帧。</p>
    {/if}
  </div>
</div>
