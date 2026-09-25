<script lang="ts">
  import { currentFrameIndex, packResult, selectedId } from '../lib/store';

  function fmtRect(x: number, y: number, w: number, h: number): string {
    return `x:${x} y:${y} ${w}×${h}`;
  }
</script>

{#if $packResult && $packResult.frames.length > 0}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>帧名</th>
          <th>时长</th>
          <th>原始尺寸</th>
          <th>裁切区域（相对原图）</th>
          <th>图集中位置/尺寸</th>
        </tr>
      </thead>
      <tbody>
        {#each $packResult.frames as f, i (f.id)}
          <tr
            class:playing={$currentFrameIndex === i}
            class:selected={$selectedId === f.id}
            onclick={() => selectedId.set(f.id)}
          >
            <td class="num">
              {$currentFrameIndex === i ? '▶ ' : ''}{i + 1}
            </td>
            <td class="name-cell" title={f.name}>{f.name}</td>
            <td class="num">{f.duration} ms</td>
            <td class="num">{f.sourceW}×{f.sourceH}</td>
            <td class="num mono">
              {#if f.trim}{fmtRect(f.trim.x, f.trim.y, f.trim.w, f.trim.h)}{:else}—{/if}
            </td>
            <td class="num mono">{fmtRect(f.x, f.y, f.w, f.h)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="table-wrap placeholder">帧位置与尺寸表：导入帧后显示</div>
{/if}
