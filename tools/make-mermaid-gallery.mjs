#!/usr/bin/env node
/**
 * 墨韵 MoYun · 生成「图表风格」展示图（README 用）
 * ---------------------------------------------------------------------------
 * 为什么单独做一个工具：
 *   tools/preview/out/ 是验证产物、被 .gitignore 排除，而 README 需要的是
 *   **可提交、可长期引用**的展示图。两者用途不同，不要混在一起。
 *
 * 做法：用真实 Mermaid 包 + Obsidian 的真实初始化参数渲染同一张流程图，
 * 每种风格各出一张，再借 Chromium 的 canvas 转成 WebP（仓库里不放 1.5 MB 的 PNG）。
 *
 * 用法：node tools/make-mermaid-gallery.mjs
 *      MOYUN_MERMAID=/path/to/mermaid.min.js node tools/make-mermaid-gallery.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'images', 'mermaid');
fs.mkdirSync(OUT, { recursive: true });

function findMermaid() {
  const candidates = [
    process.env.MOYUN_MERMAID,
    path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
    '/home/as-workstation01/Documents/project/Readmdvue/node_modules/mermaid/dist/mermaid.min.js',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}
function loadPlaywright() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'playwright'),
    '/home/as-workstation01/Documents/project/Chrome/node_modules/playwright',
    'playwright',
  ];
  for (const c of candidates) {
    try { return createRequire(import.meta.url)(c); } catch { /* 试下一个 */ }
  }
  throw new Error('未找到 playwright');
}

const MERMAID = findMermaid();
if (!MERMAID) {
  console.log('⚠ 未找到 mermaid 包，跳过展示图生成。');
  process.exit(0);
}

/* 每种风格配一个「最能体现它」的模式：
 * 赛博与极简各有固定取向；墨韵需要出明暗两张，因为它跟随主题明暗。 */
const SHOTS = [
  { key: 'mermaid-ink-dark', cls: 'my-mermaid-ink', mode: 'dark', label: '墨韵 · 夜间' },
  { key: 'mermaid-ink-light', cls: 'my-mermaid-ink', mode: 'light', label: '墨韵 · 日间' },
  { key: 'mermaid-cyber', cls: 'my-mermaid-cyber', mode: 'dark', label: '赛博 · 青蓝' },
  { key: 'mermaid-cyber-matrix', cls: 'my-mermaid-cyber-matrix', mode: 'dark', label: '赛博 · 矩阵翠绿' },
  { key: 'mermaid-cyber-violet', cls: 'my-mermaid-cyber-violet', mode: 'dark', label: '赛博 · 紫粉' },
  { key: 'mermaid-cyber-amber', cls: 'my-mermaid-cyber-amber', mode: 'dark', label: '赛博 · 琥珀' },
  { key: 'mermaid-line-light', cls: 'my-mermaid-line', mode: 'light', label: '极简 · 黑白线框' },
];

/* 展示用图：比测试夹具更贴近真实笔记（子图 + 换行标签 + 带标签的连线） */
const DEF = [
  'flowchart LR',
  '    subgraph 管理API',
  '        A1[PUT /api/users<br/>带 is_default 标记]',
  '        A2[GET /api/users<br/>条目回显 is_default]',
  '    end',
  '    subgraph 後端',
  '        B[UserFundPermissionService]',
  '        C[(user_fund_permissions<br/>加 is_default 列)]',
  '    end',
  '    A1 --> B',
  '    A2 --> C',
  '    B <--> C',
  '    C -->|写入| A1',
].join('\n');

const { chromium } = loadPlaywright();
const CHROME = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const HARNESS = pathToFileURL(path.join(ROOT, 'tools', 'preview', 'harness.html')).href;

console.log('使用 Mermaid：' + MERMAID);
let total = 0;
for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 2 });
  await page.goto(HARNESS, { waitUntil: 'load' });
  await page.addScriptTag({ path: MERMAID });
  await page.evaluate(async ({ DEF, cls, mode }) => {
    document.body.classList.remove('theme-dark', 'theme-light', 'my-mermaid-ink', 'my-mermaid-cyber',
      'my-mermaid-cyber-matrix', 'my-mermaid-cyber-violet', 'my-mermaid-cyber-amber', 'my-mermaid-line');
    document.body.classList.add('theme-' + mode, cls);
    document.documentElement.dataset.theme = mode;
    await new Promise((r) => setTimeout(r, 80));
    /* Obsidian 的真实初始化参数（与 tools/check-mermaid.mjs 保持一致） */
    window.mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict',
      themeVariables: { fontFamily: 'var(--font-mermaid)' },
      flowchart: { useMaxWidth: false },
    });
    const { svg } = await window.mermaid.render('gallery-' + cls, DEF);
    const wrap = document.createElement('div');
    wrap.className = 'mermaid';
    wrap.id = 'gallery-shot';
    wrap.innerHTML = svg;
    /* 放到独立容器里截图：笔记的滚动容器里元素坐标会落在视口外 */
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed; inset:0; z-index:9999; background:' + getComputedStyle(document.body).backgroundColor;
    stage.appendChild(wrap);
    document.body.appendChild(stage);
  }, { DEF, cls: shot.cls, mode: shot.mode });

  const el = await page.$('#gallery-shot');
  const png = await el.screenshot();
  /* 借 Chromium 自己转 WebP：仓库里不放 2x 的 PNG（否则一张就 200 KB+） */
  const webp = await page.evaluate(async ({ b64, w }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const scale = Math.min(1.6, w / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.9).split(',')[1];
  }, { b64: png.toString('base64'), w: 2000 });

  const file = path.join(OUT, shot.key + '.webp');
  fs.writeFileSync(file, Buffer.from(webp, 'base64'));
  const size = fs.statSync(file).size;
  total += size;
  console.log('  ✓ ' + shot.key + '.webp  ' + (size / 1024).toFixed(1) + ' KB   （' + shot.label + '）');
  await page.close();
}

await browser.close();
console.log('\n共 ' + SHOTS.length + ' 张，合计 ' + (total / 1024).toFixed(1) + ' KB → docs/images/mermaid/');
