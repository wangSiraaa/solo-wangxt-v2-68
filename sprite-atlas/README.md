# 精灵图集工具（Sprite Atlas）

纯 Web 的序列帧 → 精灵图集工具。**所有图片处理都在浏览器本地完成，不离开浏览器。**

- **Svelte 5 + TypeScript**：帧序列与项目状态管理
- **PixiJS 8**：动画预览（按导入顺序循环播放，裁切后按原图坐标系对齐，不抖动）
- **maxrects-packer**：矩形装箱，**固定方向（不旋转）**
- **IndexedDB**：项目自动保存，刷新页面自动恢复

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
```

进入页面后点「**加载示例帧**」即可看到 8 个不同尺寸、含透明边缘的示例帧
（由 `npm run demo-frames` 生成于 `public/demo-frames/`）的完整效果。

## 功能

| 功能 | 说明 |
| --- | --- |
| 导入 PNG 帧 | 多选导入，保持导入顺序；列表内可上移/下移/删除 |
| 帧时长 | 每帧独立毫秒时长；默认时长可一键应用到全部帧 |
| 透明边缘裁切 | 按 Alpha 阈值（1–254）裁切；全透明帧兜底为中心 1×1 |
| 统一留白 | 每个精灵四周（含图集边缘）统一 padding 像素 |
| 打包 | MaxRects，固定方向不旋转；可选 2 的幂尺寸；最大边长可配 |
| 预览 | PixiJS 按序列顺序循环播放，显示当前帧在图集中的位置/尺寸 |
| 图集视图 | 棋盘格底 + 每帧编号框，点击矩形选中对应帧 |
| 帧信息表 | 每帧的原始尺寸、裁切区域、图集中位置/尺寸，播放行高亮 |
| 导出 | 图集 PNG + JSON（JSON 内嵌每帧原始 PNG 的 data URL） |
| 导入 JSON | 完整恢复帧列表、顺序、时长、裁切与打包结果 |
| 本地持久化 | 任何修改 800ms 防抖后自动写入 IndexedDB |

## 导出的 JSON 格式（version 1）

```jsonc
{
  "app": "svelte-sprite-atlas",
  "version": 1,
  "meta": { "atlasWidth": 238, "atlasHeight": 65, "frameCount": 8, "totalDuration": 800, "...": "…" },
  "settings": { "trim": true, "alphaThreshold": 1, "padding": 2, "pot": false, "maxSize": 4096, "defaultDuration": 100 },
  "frames": [
    {
      "id": "…", "name": "run_01.png", "duration": 100,
      "sourceSize": { "w": 64, "h": 64 },          // 原始尺寸
      "trim": { "x": 14, "y": 12, "w": 36, "h": 36 }, // 裁切区域（相对原图），未裁切为 null
      "frame": { "x": 62, "y": 26, "w": 36, "h": 36 }, // 在图集中的位置/尺寸
      "image": "data:image/png;base64,…"            // 原始 PNG，重导入时据此恢复
    }
  ]
}
```

重新导入该 JSON 即可恢复整个项目（帧、顺序、时长、裁切、打包位置），
无需也不依赖外部图片文件。

## 验证

```bash
npm test           # Vitest：31 个单元/流水线测试
npm run check      # svelte-check 类型检查（0 错误 0 警告）
npm run build      # 生产构建
npm run e2e        # Playwright 真实浏览器端到端（需先 npx playwright install chromium）
```

- **单元测试**：裁切边界（含全透明、Alpha 阈值）、时间轴时长映射、
  装箱（不旋转、留白不重叠、确定性、POT、超限报错）、JSON 往返与非法输入。
- **流水线测试**（`src/lib/pipeline.test.ts`）：用真实生成的 8 个不同尺寸、
  含透明边缘的 PNG，解码 → 裁切 → 打包 → **逐像素**验证图集内容与留白，
  并验证时长轴顺序与 JSON 恢复一致性。
- **E2E**（`e2e/app.spec.ts`）：浏览器中加载示例帧 → 打包 → 预览播放 →
  导出 PNG/JSON → 篡改并清空 → 重导入 JSON 恢复 → 刷新页面验证 IndexedDB 持久化。

## 目录结构

```
src/
  lib/
    types.ts      数据模型（帧/打包结果/设置）
    trim.ts       透明边缘裁切（纯函数，可单测）
    pack.ts       maxrects 装箱（固定方向、统一留白、自动选图集尺寸）
    timeline.ts   帧时长 → 播放时间轴
    json.ts       导出 JSON 的序列化/解析校验
    db.ts         IndexedDB 读写
    store.ts      Svelte stores
    actions.ts    导入/打包/渲染/导出/持久化动作
  components/     SettingsPanel / FrameList / Preview(PixiJS) / AtlasView / FrameTable
scripts/gen-demo-frames.mjs   生成验证用示例帧（无依赖手写 PNG 编码器）
e2e/app.spec.ts               Playwright 端到端
```
