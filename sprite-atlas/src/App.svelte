<script lang="ts">
  import { onMount } from 'svelte';
  import {
    frames,
    lastSavedAt,
    packResult,
    projectName,
    saveState,
    statusMessage,
  } from './lib/store';
  import {
    clearAll,
    exportJson,
    exportPng,
    importFiles,
    importJsonFile,
    initFromDB,
    loadDemoFrames,
    startAutosave,
  } from './lib/actions';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import FrameList from './components/FrameList.svelte';
  import Preview from './components/Preview.svelte';
  import AtlasView from './components/AtlasView.svelte';
  import FrameTable from './components/FrameTable.svelte';

  let pngInput: HTMLInputElement;
  let jsonInput: HTMLInputElement;

  onMount(() => {
    startAutosave();
    void initFromDB();
  });

  function onPngPicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files?.length) void importFiles(Array.from(input.files));
    input.value = '';
  }

  function onJsonPicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void importJsonFile(file);
    input.value = '';
  }

  $: saveText =
    $saveState === 'saving'
      ? '保存中…'
      : $saveState === 'dirty'
        ? '有未保存修改…'
        : $saveState === 'error'
          ? '保存失败'
          : $lastSavedAt
            ? `已自动保存 ${new Date($lastSavedAt).toLocaleTimeString()}`
            : '本地自动保存已开启';
</script>

<div class="app">
  <header>
    <h1>精灵图集工具</h1>
    <input
      class="name"
      bind:value={$projectName}
      placeholder="项目名（用于导出文件名）"
      spellcheck="false"
    />
    <div class="actions">
      <button onclick={() => pngInput.click()}>导入 PNG 帧</button>
      <button onclick={() => void loadDemoFrames()}>加载示例帧</button>
      <button onclick={() => void exportPng()} disabled={!$packResult}>导出图集 PNG</button>
      <button onclick={() => void exportJson()} disabled={!$packResult}>导出 JSON</button>
      <button onclick={() => jsonInput.click()}>导入 JSON</button>
      <button class="danger" onclick={clearAll} disabled={$frames.length === 0}>清空</button>
    </div>
    <span class="save" class:error={$saveState === 'error'}>{saveText}</span>
  </header>

  <main>
    <aside>
      <SettingsPanel />
      <FrameList />
    </aside>
    <section class="preview-pane">
      <Preview />
    </section>
    <section class="atlas-pane">
      <AtlasView />
    </section>
  </main>

  <footer>
    <FrameTable />
    <div class="status">{$statusMessage}</div>
  </footer>

  <input
    type="file"
    accept="image/png,.png"
    multiple
    bind:this={pngInput}
    onchange={onPngPicked}
    hidden
  />
  <input type="file" accept=".json,application/json" bind:this={jsonInput} onchange={onJsonPicked} hidden />
</div>
