<script lang="ts">
  import { frames, settings } from '../lib/store';
  import { applyDurationToAll, updateSettings } from '../lib/actions';

  function num(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value);
  }
  function checked(e: Event): boolean {
    return (e.currentTarget as HTMLInputElement).checked;
  }
</script>

<div class="panel">
  <h2>打包设置</h2>
  <label class="row check">
    <input
      type="checkbox"
      checked={$settings.trim}
      onchange={(e) => updateSettings({ trim: checked(e) })}
    />
    裁切透明边缘
  </label>
  <label class="row" class:disabled={!$settings.trim}>
    Alpha 阈值（{$settings.alphaThreshold}）
    <input
      type="range"
      min="1"
      max="254"
      value={$settings.alphaThreshold}
      disabled={!$settings.trim}
      oninput={(e) => updateSettings({ alphaThreshold: num(e) })}
    />
  </label>
  <label class="row">
    统一留白（{$settings.padding}px）
    <input
      type="range"
      min="0"
      max="32"
      value={$settings.padding}
      oninput={(e) => updateSettings({ padding: num(e) })}
    />
  </label>
  <label class="row check">
    <input
      type="checkbox"
      checked={$settings.pot}
      onchange={(e) => updateSettings({ pot: checked(e) })}
    />
    图集尺寸取 2 的幂
  </label>
  <label class="row">
    图集最大边长
    <select
      value={$settings.maxSize}
      onchange={(e) => updateSettings({ maxSize: num(e) })}
    >
      <option value={1024}>1024</option>
      <option value={2048}>2048</option>
      <option value={4096}>4096</option>
      <option value={8192}>8192</option>
    </select>
  </label>
  <label class="row">
    默认帧时长（ms）
    <input
      type="number"
      min="1"
      step="10"
      value={$settings.defaultDuration}
      onchange={(e) => updateSettings({ defaultDuration: Math.max(1, num(e)) })}
    />
  </label>
  <button
    class="wide"
    disabled={$frames.length === 0}
    onclick={() => applyDurationToAll($settings.defaultDuration)}
  >
    将默认时长应用到全部 {$frames.length} 帧
  </button>
  <p class="hint">打包使用 MaxRects 算法，固定方向（不旋转）；留白作用于每个精灵的四周，含图集边缘。</p>
</div>
