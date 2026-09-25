<script lang="ts">
  import { onDestroy } from 'svelte';
  import { frames, selectedId } from '../lib/store';
  import { moveFrame, removeFrame, setFrameDuration } from '../lib/actions';
  import type { FrameItem } from '../lib/types';

  const urls = new Map<string, string>();
  function thumb(f: FrameItem): string {
    let u = urls.get(f.id);
    if (!u) {
      u = URL.createObjectURL(f.blob);
      urls.set(f.id, u);
    }
    return u;
  }
  onDestroy(() => urls.forEach((u) => URL.revokeObjectURL(u)));

  function onDuration(e: Event, id: string) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(v)) setFrameDuration(id, v);
  }
</script>

<div class="panel grow">
  <h2>帧序列（{$frames.length}）<span class="sub">按导入顺序播放</span></h2>
  {#if $frames.length === 0}
    <p class="empty">尚未导入帧。点击顶部「导入 PNG 帧」或「加载示例帧」。</p>
  {:else}
    <ul class="frames">
      {#each $frames as f, i (f.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <li
          class="frame-row"
          class:selected={$selectedId === f.id}
          onclick={() => selectedId.set(f.id)}
        >
          <div class="idx">{i + 1}</div>
          <img src={thumb(f)} alt={f.name} draggable="false" />
          <div class="meta">
            <div class="name" title={f.name}>{f.name}</div>
            <div class="size">
              {f.width}×{f.height}
              {#if f.trim}
                <span class="trim-badge">裁 {f.trim.w}×{f.trim.h}</span>
              {/if}
            </div>
            <input
              class="dur"
              type="number"
              min="1"
              step="10"
              value={f.duration}
              title="帧时长（毫秒）"
              onclick={(e) => e.stopPropagation()}
              onchange={(e) => onDuration(e, f.id)}
            />
            <span class="ms">ms</span>
          </div>
          <div class="ops">
            <button title="上移" disabled={i === 0} onclick={(e) => { e.stopPropagation(); moveFrame(f.id, -1); }}>↑</button>
            <button title="下移" disabled={i === $frames.length - 1} onclick={(e) => { e.stopPropagation(); moveFrame(f.id, 1); }}>↓</button>
            <button
              class="danger"
              title="删除"
              onclick={(e) => { e.stopPropagation(); removeFrame(f.id); }}
            >✕</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
