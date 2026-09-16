#!/usr/bin/env node
/**
 * 墨韵 MoYun · 生成主题商店封面图
 * ---------------------------------------------------------------------------
 * Obsidian 官方要求提交主题时，仓库根目录需放一张商店展示截图，
 * 推荐尺寸 512×288。本脚本用真实 app.css + 真实 theme.css 渲染封面页并出图。
 *
 * 产出（写到仓库根目录，官方从根目录读取）：
 *   screenshot.png        夜间「墨夜」，512×288 的 2 倍图（1024×576，展示更清晰）
 *   screenshot-light.png  日间「宣纸」，同上
 *
 * 用法：node tools/make-screenshot.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const c of ['playwright', '/home/as-workstation01/Documents/project/Chrome/node_modules/playwright']) {
    try { return req(c); } catch { /* 继续 */ }
  }
  throw new Error('未找到 playwright');
}
const { chromium } = loadPlaywright();

const COVER = pathToFileURL(path.join(ROOT, 'tools', 'preview', 'cover.html')).href;
const CHROME = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/usr/bin/chromium']
  .find((p) => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* 512×288 的 2 倍图：展示端会缩回 512×288，因此比直接出 512 宽更清晰 */
const SIZE = { width: 512, height: 288 };
const shots = [
  { mode: 'dark', out: 'screenshot.png' },
  { mode: 'light', out: 'screenshot-light.png' },
];

for (const { mode, out } of shots) {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
  await page.goto(COVER);
  await page.evaluate((m) => {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add('theme-' + m);
    document.documentElement.dataset.theme = m;
  }, mode);
  await page.waitForTimeout(250);
  const target = path.join(ROOT, out);
  await page.screenshot({ path: target });
  const kb = (fs.statSync(target).size / 1024).toFixed(1);
  console.log('✓ ' + out + '  (' + SIZE.width + '×' + SIZE.height + ' 的 2 倍图 = 1024×576,  ' + kb + ' KB)');
  await page.close();
}

await browser.close();
console.log('\n封面图已写入仓库根目录（Obsidian 官方从根目录读取）。');
