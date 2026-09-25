import { expect, test, type Page } from '@playwright/test';

/** 从表格读取所有帧的文本（去掉播放中的 ▶ 标记），用于对比重导入前后是否一致。 */
async function readTable(page: Page): Promise<string[]> {
  const rows = await page.locator('tbody tr').allTextContents();
  return rows.map((t) => t.replaceAll('▶ ', ''));
}

test('完整流程：导入示例帧 → 裁切打包 → 预览 → 导出 → 重导入恢复 → IndexedDB 持久化', async ({
  page,
}) => {
  await page.goto('/');

  // 1) 加载 8 个不同尺寸、含透明边缘的示例帧
  await page.getByRole('button', { name: '加载示例帧' }).click();
  await expect(page.locator('.status')).toContainText('打包完成', { timeout: 15000 });
  await expect(page.locator('.frame-row')).toHaveCount(8);
  await expect(page.locator('tbody tr')).toHaveCount(8);

  // 2) 裁切结果符合素材设计（第一帧 64x64 → 36x36；全透明帧兜底 1x1）
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0).locator('td').nth(3)).toHaveText('64×64');
  await expect(rows.nth(0).locator('td').nth(4)).toHaveText('x:14 y:12 36×36');
  await expect(rows.nth(3).locator('td').nth(4)).toHaveText('x:86 y:6 10×10');
  await expect(rows.nth(6).locator('td').nth(4)).toHaveText('x:20 y:20 1×1');
  // 每帧都有图集位置（最后一列形如 x:… y:… w×h）
  for (let i = 0; i < 8; i++) {
    await expect(rows.nth(i).locator('td').nth(5)).toContainText(/x:\d+ y:\d+ \d+×\d+/);
  }

  // 3) 预览在播放：信息栏出现帧信息，且帧序号随时间推进（时长 100ms/帧）
  const info = page.locator('.preview .info');
  await expect(info).toContainText(/#1 run_01\.png · 100ms · 图集位置/, { timeout: 5000 });
  const infoA = await info.textContent();
  await page.waitForTimeout(260);
  const infoB = await info.textContent();
  expect(infoB).not.toBe(infoA);
  expect(infoB).toMatch(/#\d+ run_\d+\.png · 100ms · 图集位置 \(\d+, \d+\) · 尺寸 \d+×\d+/);
  // Pixi 画布已挂载
  await expect(page.locator('.canvas-host canvas')).toBeVisible();

  // 4) 导出图集 PNG 与 JSON
  const [pngDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出图集 PNG' }).click(),
  ]);
  expect(pngDl.suggestedFilename()).toMatch(/\.png$/);

  const before = await readTable(page);
  const [jsonDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 JSON' }).click(),
  ]);
  expect(jsonDl.suggestedFilename()).toMatch(/\.json$/);
  const jsonPath = await jsonDl.path();
  expect(jsonPath).toBeTruthy();

  // 5) 导出后篡改时长并清空，验证 JSON 能完整恢复
  await page.locator('.frame-row .dur').first().fill('999');
  await page.keyboard.press('Tab'); // 触发 change 提交
  await page.getByRole('button', { name: '清空' }).click();
  await expect(page.locator('.frame-row')).toHaveCount(0);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles(jsonPath!);
  await expect(page.locator('.status')).toContainText('已从 JSON 恢复 8 帧', {
    timeout: 15000,
  });
  await expect(page.locator('.frame-row')).toHaveCount(8);
  // 时长恢复为导出时的 100ms（而非篡改后的 999）
  await expect(page.locator('.frame-row .dur').first()).toHaveValue('100');
  // 打包结果（每帧位置/尺寸）与导出前完全一致
  expect(await readTable(page)).toEqual(before);

  // 6) IndexedDB 持久化：刷新页面后项目自动恢复
  await page.waitForTimeout(1200); // 等自动保存落库
  await page.reload();
  await expect(page.locator('.status')).toContainText('已从 IndexedDB 恢复项目（8 帧）', {
    timeout: 15000,
  });
  await expect(page.locator('.frame-row')).toHaveCount(8);
  expect(await readTable(page)).toEqual(before);
});

test('直接导入 PNG 文件并调整设置', async ({ page }) => {
  await page.goto('/');
  // 通过文件选择器导入 3 个示例 PNG
  await page
    .locator('input[type="file"][accept*="png"]')
    .setInputFiles([
      'public/demo-frames/run_01.png',
      'public/demo-frames/run_04.png',
      'public/demo-frames/run_08.png',
    ]);
  await expect(page.locator('.status')).toContainText('打包完成', { timeout: 15000 });
  await expect(page.locator('.frame-row')).toHaveCount(3);

  // 关闭裁切 → 打包尺寸应使用原始尺寸
  await page.getByLabel('裁切透明边缘').uncheck();
  await expect(page.locator('.status')).toContainText('打包完成', { timeout: 15000 });
  const rows = page.locator('tbody tr');
  await expect(rows.nth(0).locator('td').nth(4)).toHaveText('—'); // 无裁切
  await expect(rows.nth(0).locator('td').nth(5)).toContainText('64×64'); // 图集中为原尺寸

  // 修改单帧时长 → 表格同步
  await page.locator('.frame-row .dur').first().fill('250');
  await page.keyboard.press('Tab');
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('250 ms');
});
