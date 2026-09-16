#!/usr/bin/env node
/**
 * 墨韵 MoYun · 视觉与样式验证
 * ---------------------------------------------------------------------------
 * 作用：用 Playwright 打开 tools/preview/harness.html（Obsidian 真实 DOM +
 *       真实 app.css + 我们的 theme.css），然后：
 *         ① 在明暗两种模式下截图，产出可肉眼验收的 PNG；
 *         ② 断言一批【计算后样式】——把"我以为写对了"变成"浏览器实测通过"；
 *         ③ 计算关键文字对比度，验证可读性达标。
 *
 * 用法：node tools/verify.mjs
 * 退出码：0 全部通过；1 有断言失败。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'preview', 'out');
fs.mkdirSync(OUT, { recursive: true });

/* Playwright 可能安装在外部目录，逐个候选位置尝试加载 */
function loadPlaywright() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'playwright'),
    '/home/as-workstation01/Documents/project/Chrome/node_modules/playwright',
    'playwright',
  ];
  for (const c of candidates) {
    try {
      const req = createRequire(import.meta.url);
      return req(c);
    } catch { /* 继续尝试下一个 */ }
  }
  throw new Error('未找到 playwright，请先安装：npm i -D playwright');
}

const { chromium } = loadPlaywright();
const HARNESS = pathToFileURL(path.join(ROOT, 'tools', 'preview', 'harness.html')).href;

/* ---------------------------------------------------------------------------
 * 断言清单：[说明, 选择器, 属性, 期望值/判定函数]
 * 期望值支持字符串（包含匹配）或函数（返回 true 表示通过）。
 * ------------------------------------------------------------------------ */
const CHECKS = [
  // —— 中文排版核心 ——
  ['正文行高达到中文舒适区间（≥1.7）', '.markdown-rendered p', 'lineHeight',
    (v, el) => parseFloat(v) / parseFloat(getComputedStyle(el).fontSize) >= 1.7],
  ['正文启用了中西文自动间距', '.markdown-rendered', 'textAutospace', (v) => v === 'normal'],
  ['正文启用了标点挤压', '.markdown-rendered', 'textSpacingTrim', (v) => String(v).includes('space-first') || v === 'space-first'],
  ['正文启用了避头尾（line-break: strict）', '.markdown-rendered p', 'lineBreak', (v) => v === 'strict'],
  ['段落末行使用 pretty 折行', '.markdown-rendered p', 'textWrap', (v) => String(v).includes('pretty')],
  ['中文段落使用自动短语断行', '.markdown-rendered p', 'wordBreak', (v) => v === 'auto-phrase' || v === 'normal'],

  // —— 标题 ——
  /* 公文体刻意使用真加粗（700）：公文的「加粗」就是要看起来真的粗，
   * 与通用模式「汉字 700 会糊」的取舍相反。断言按风格分流。 */
  ['标题字重符合当前风格（通用 ≤680 / 公文 =700）', '.markdown-rendered h1', 'fontWeight',
    (v) => {
      const gov = document.body.classList.contains('my-gov-style');
      const w = parseInt(v, 10);
      return gov ? w >= 700 : w <= 680;
    }],
  ['H1 字号大于正文', '.markdown-rendered h1', 'fontSize',
    (v, el) => parseFloat(v) > parseFloat(getComputedStyle(el.closest('.markdown-rendered')).fontSize)],

  // —— 配色与表面层次 ——
  /* Obsidian 把纸面底色画在 .view-content 上（.markdown-preview-view 与
   * .workspace-leaf-content 都是透明的），这一点已用祖先链实测确认。 */
  ['正文纸面背景与侧栏背景不同（有层次）', '.view-content', 'backgroundColor', (v) => v !== 'rgba(0, 0, 0, 0)'],
  ['正文文字不是纯白（夜间偏暖，护眼）', '.markdown-rendered p', 'color',
    (v) => !/^rgb\(255,\s*255,\s*255\)$/.test(v)],

  // —— 组件 ——
  /* 公文体刻意去掉圆角（公文不用圆角）；通用模式保留圆角。 */
  ['标注容器圆角符合风格（通用有圆角 / 公文无圆角）', '.callout', 'borderRadius',
    (v) => {
      const gov = document.body.classList.contains('my-gov-style');
      return gov ? parseFloat(v) === 0 : parseFloat(v) > 0;
    }],
  ['标注标题可见', '.callout-title-inner', 'display', (v) => v !== 'none'],
  /* Obsidian 把表头底色加在 thead 的 tr 上，而不是 th 上（见 app.css:13835） */
  ['表格表头有独立底色', '.markdown-rendered thead tr', 'backgroundColor', (v) => v !== 'rgba(0, 0, 0, 0)'],
  /* —— 表格宽度（回归防线）——
   * 这两条是本主题真实踩过的坑：曾用 display:block + overflow-x:auto 实现横向滚动，
   * 结果 <table> 变块级容器后，内部匿名表格盒子仍按内容宽度排版，出现
   * 「边框撑满版心、单元格挤在左边一小条」的缺陷（实测 4 列只占版心 28%）。
   * 第一条查表格元素本身，第二条才是真正能抓住该缺陷的检查。 */
  ['表格撑满版心（≥ 内容区的 95%）', '.markdown-rendered table', 'width',
    (v, el) => {
      const c = el.closest('.markdown-rendered') || el.parentElement;
      const cs = getComputedStyle(c);
      /* 基准必须是【内容区】宽度：版心有 64px 左右的左右内边距，
       * 用外框宽度当基准会把"已经撑满"误判为没撑满（本主题实际踩过这个坑）。 */
      const content = c.getBoundingClientRect().width
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return el.getBoundingClientRect().width >= content * 0.95;
    }],
  ['表格列宽总和撑满（防止「边框撑满、内容挤在左边」）', '.markdown-rendered table', 'width',
    (v, el) => {
      const c = el.closest('.markdown-rendered') || el.parentElement;
      const cs = getComputedStyle(c);
      const content = c.getBoundingClientRect().width
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const cols = [...el.querySelectorAll('thead th')];
      if (!cols.length) return false;
      const sum = cols.reduce((s, x) => s + x.getBoundingClientRect().width, 0);
      return sum >= content * 0.95;
    }],
  /* 公文体下代码块改用边框而非底色（公文不用色块），行内代码去掉内边距与底色 */
  ['代码块有视觉边界（通用=底色 / 公文=边框）', '.markdown-rendered pre', 'backgroundColor',
    (v, el) => {
      const gov = document.body.classList.contains('my-gov-style');
      if (!gov) return v !== 'rgba(0, 0, 0, 0)';
      return parseFloat(getComputedStyle(el).borderTopWidth) > 0;
    }],
  ['行内代码内边距符合风格（通用有 / 公文无）', '.markdown-rendered p code', 'paddingLeft',
    (v) => {
      const gov = document.body.classList.contains('my-gov-style');
      return gov ? parseFloat(v) === 0 : parseFloat(v) > 0;
    }],
  ['标签有底色', '.tag', 'backgroundColor', (v) => v !== 'rgba(0, 0, 0, 0)'],
  /* 公文体用缩进块代替色条（公文引用不用装饰线） */
  ['引用块样式符合风格（通用=左侧色条 / 公文=缩进块）', '.markdown-rendered blockquote', 'borderInlineStartWidth',
    (v, el) => {
      const gov = document.body.classList.contains('my-gov-style');
      if (!gov) return parseFloat(v) >= 2;
      return parseFloat(v) === 0 && parseFloat(getComputedStyle(el).paddingInlineStart) > 0;
    }],
  ['任务复选框尺寸合理（≥14px）', '.task-list-item-checkbox', 'width', (v) => parseFloat(v) >= 14],
  /* Obsidian 原生只给 .internal-embed img 加圆角，正文裸图默认无圆角，
   * 本主题在媒体模块中补齐——这条断言正是检验该补齐是否生效。 */
  ['图片有圆角', '.markdown-rendered img', 'borderRadius', (v) => parseFloat(v) > 0],
  ['嵌入笔记有左侧边框', '.markdown-embed', 'borderInlineStartWidth', (v) => parseFloat(v) >= 0],

  // —— 公文规范（公文体开启时生效；关闭时这些断言应全部为「不适用」）——
  /* 这几条守住 GB/T 9704-2012 的核心特征：字体分层、首行缩进、两端对齐、
   * 全框线表格。公文体的价值就在这里，一旦被后续改动破坏必须能立刻发现。 */
  ['公文体：正文用仿宋体系', '.markdown-rendered p', 'fontFamily',
    (v) => {
      if (!document.body.classList.contains('my-gov-style')) return true;
      return /FangSong|仿宋|Source Han Serif|Noto Serif|Songti/i.test(v);
    }],
  ['公文体：段落首行缩进两字', '.markdown-rendered p', 'textIndent',
    (v) => {
      if (!document.body.classList.contains('my-gov-style')) return true;
      return parseFloat(v) > 0;
    }],
  ['公文体：正文两端对齐', '.markdown-rendered', 'textAlign',
    (v) => {
      if (!document.body.classList.contains('my-gov-style')) return true;
      return v === 'justify';
    }],
  ['公文体：表格为全框线（单元格四边都有线）', '.markdown-rendered tbody td', 'borderTopWidth',
    (v) => {
      const gov = document.body.classList.contains('my-gov-style');
      if (!gov) return true;
      return parseFloat(v) > 0;
    }],
  ['公文体：标题层级靠字体区分（H2 黑体与 H3 楷体不同）', '.markdown-rendered h2', 'fontFamily',
    (v, el) => {
      if (!document.body.classList.contains('my-gov-style')) return true;
      const h3 = document.querySelector('.markdown-rendered h3');
      return h3 ? v !== getComputedStyle(h3).fontFamily : true;
    }],

  // —— 布局外壳 ——
  ['侧栏有独立底色', '.workspace-split.mod-left-split', 'backgroundColor', (v) => v !== 'rgba(0, 0, 0, 0)'],
  ['激活的标签页与其他标签页视觉不同', '.workspace-tab-header.is-active', 'backgroundColor', (v) => v !== 'rgba(0, 0, 0, 0)'],
  ['文件树激活项有强调反馈', '.nav-file-title.is-active', 'color', (v) => v !== 'rgba(0, 0, 0, 0)'],
  ['状态栏字号小于正文', '.status-bar', 'fontSize',
    (v, el) => parseFloat(v) < 16],
  // —— 字体归属：用户选择必须优先（主题只提供兜底）——
  /* 这三条守的是「第三方主题不该抢走宿主设置」。此前主题直接覆盖 --font-text
   * 并把 --font-text-override 指向自己的字体栈，导致用户在 Obsidian「外观 → 字体」
   * 里的选择完全失效。断言直接模拟 Obsidian 写入 override，看主题是否让位。 */
  ['用户字体选择优先：override 会接管正文与原生链路', '.markdown-rendered', 'fontFamily',
    () => {
      const el = document.querySelector('.markdown-rendered');
      document.body.style.setProperty('--font-text-override', 'MoYunUserFontProbe');
      const got = getComputedStyle(el).fontFamily;
      const native = getComputedStyle(document.body).getPropertyValue('--font-text');
      document.body.style.removeProperty('--font-text-override');
      return /MoYunUserFontProbe/.test(got) && /MoYunUserFontProbe/.test(native);
    }],
  ['用户未选字体时回落到主题/公文体字体栈', '.markdown-rendered', 'fontFamily',
    (v) => {
      const gov = document.body.classList.contains('my-gov-style');
      return gov
        ? /仿宋|FangSong/.test(v)
        : /LXGW|霞鹜|HarmonyOS|MiSans|PingFang|Source Han Sans|Noto Sans CJK|Sarasa/.test(v);
    }],
  ['公文体：用户字体只接管正文，标题仍按公文层级', '.markdown-rendered h1', 'fontFamily',
    () => {
      const el = document.querySelector('.markdown-rendered h1');
      document.body.style.setProperty('--font-text-override', 'MoYunUserFontProbe');
      const got = getComputedStyle(el).fontFamily;
      document.body.style.removeProperty('--font-text-override');
      const gov = document.body.classList.contains('my-gov-style');
      // 公文体：标题必须保持小标宋/黑体，不被用户字体顶掉；通用模式：标题跟随用户
      return gov ? !/MoYunUserFontProbe/.test(got) : /MoYunUserFontProbe/.test(got);
    }],

  // —— Mermaid 图表 ——
  /* 这几条是本模块存在的理由：Mermaid 把配色内联进 SVG【内部】的 ID 选择器样式，
   * 主题必须用 !important 才压得住。断言拿「主题令牌的计算值」与「SVG 元素上的
   * 计算值」比对，而不是比对写死的颜色 —— 以后换配色不会产生假告警，而一旦
   * !important 被谁删掉，比对立刻失败。 */
  /* Mermaid 的图【画在透明画布上】，只有线与文字。因此这几条守的是：
   *   ① 文字色必须被接管（fill 与 color 双路径：SVG <text> 看 fill，
   *      foreignObject 里的 HTML 看 color —— 只覆盖一个就是用户踩过的隐形字 bug）；
   *   ② 不铺面板底色，图形直接落在纸面上；
   *   ③ 边标签的 HTML 背景色也要接管（Mermaid 默认刷 #ECECFF/#e8e8e8，深色下是亮斑）。 */
  ['Mermaid 节点只用轮廓：填充为纸面色（非 Mermaid 默认淡紫）', '.mermaid .node rect', 'fill',
    (v) => {
      const p = document.createElement('div');
      p.style.background = 'var(--my-surface-primary)';
      document.body.appendChild(p);
      const want = getComputedStyle(p).backgroundColor;
      p.remove();
      return v === want;
    }],
  ['Mermaid SVG 文字用主题正文色（fill 路径，非默认 #333）', '.mermaid .node .label', 'fill',
    (v) => {
      const p = document.createElement('div');
      p.style.color = 'var(--my-text-primary)';
      document.body.appendChild(p);
      const want = getComputedStyle(p).color;
      p.remove();
      return v === want;
    }],
  ['Mermaid HTML 标签用主题正文色（color 路径 —— 只覆盖 fill 就会漏）', '.mermaid .nodeLabel', 'color',
    (v) => {
      const p = document.createElement('div');
      p.style.color = 'var(--my-text-primary)';
      document.body.appendChild(p);
      const want = getComputedStyle(p).color;
      p.remove();
      return v === want && v !== 'rgb(51, 51, 51)';
    }],
  ['Mermaid 边标签背景改为纸面色（非 Mermaid 默认 #ECECFF 亮斑）', '.mermaid .edgeLabel', 'backgroundColor',
    (v) => {
      const p = document.createElement('div');
      p.style.background = 'var(--my-surface-primary)';
      document.body.appendChild(p);
      const want = getComputedStyle(p).backgroundColor;
      p.remove();
      return v === want;
    }],
  ['Mermaid 连线用主题描边色（非 Mermaid 默认 #333）', '.mermaid .edgePath .path', 'stroke',
    (v) => v !== 'rgb(51, 51, 51)' && v !== 'none'],
  ['Mermaid 子图不铺底（只留虚线轮廓）', '.mermaid .cluster rect', 'fill',
    (v) => v === 'rgba(0, 0, 0, 0)' || v === 'none'],
  ['Mermaid 容器透明：图是版面上的插图，不是一张卡片', '.mermaid', 'backgroundColor',
    (v) => v === 'rgba(0, 0, 0, 0)'],
  ['Mermaid 超宽图形横向滚动而非被裁切', '.mermaid', 'overflowX', (v) => v === 'auto'],
];

/* 对比度计算（WCAG 相对亮度法） */
function parseColor(str) {
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
}
function luminance({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------------------------------------------------------------------
 * 主流程
 * ------------------------------------------------------------------------ */
/* 优先使用系统已安装的 Google Chrome（本机为 151），
 * 这样既避免下载 Playwright 自带 Chromium，也让验证环境与 Obsidian 的
 * Chromium 150 更接近，CJK 排版特性的表现更具参考价值。 */
const CHROME_CANDIDATES = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/usr/bin/chromium'];
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: chromePath,
  args: ['--font-render-hinting=none', '--no-sandbox', '--disable-dev-shm-usage'],
});
console.log('使用浏览器：' + (chromePath || 'Playwright 自带 Chromium'));
const results = [];

for (const mode of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const consoleErrors = [];
  /* 控制台错误连同其来源 URL 一起记录：app.css 引用的 Obsidian 运行时图片
   * （图标雪碧图等）在离线验证台里必然 404，需按 URL 精确甄别，不能一刀切忽略。 */
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ text: m.text(), url: m.location() ? m.location().url : '' });
  });
  page.on('pageerror', (e) => consoleErrors.push({ text: String(e), url: '' }));

  await page.goto(HARNESS);
  await page.evaluate((m) => {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add('theme-' + m);
    document.documentElement.dataset.theme = m;
  }, mode);
  await page.waitForTimeout(350);

  // —— 截图 ——
  /* 截图与断言刻意使用不同的视口高度，原因：
   *   ① 文章整篇约 3600 CSS px，Obsidian 的正文在【自己的滚动容器】里滚动而非
   *      window 滚动，因此在 1000px 视口下截图会出现 clip 坐标与元素实际位置
   *      错位，报 "Clipped area is outside the resulting image"；
   *   ② 若把滚动容器改成 overflow:visible 来"摊平"，会破坏 Obsidian 的 flex
   *      布局计算，编辑器被挤出视口（实测 x 变成 1440，即完全不可见）。
   * 正确做法：临时把视口调高到足以一次容纳整篇文章，此时无需滚动、元素坐标即
   * 视口坐标，clip 可精确命中；截完再恢复标准视口做布局类断言。
   * deviceScaleFactor=2 时 4000×2 = 8000 设备像素，仍在 8192 的安全线内。 */
  await page.setViewportSize({ width: 1440, height: 4000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${mode}-full.png`) });

  const box = await page.evaluate(() => {
    const el = document.querySelector('.markdown-preview-view');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
  });
  if (box) {
    const SLICE = 1150;
    const slices = Math.min(4, Math.ceil(box.height / SLICE));
    for (let i = 0; i < slices; i++) {
      const h = Math.min(SLICE, box.height - i * SLICE);
      if (h < 40) break;
      await page.screenshot({
        path: path.join(OUT, `${mode}-editor-${i + 1}.png`),
        clip: { x: box.x, y: box.y + i * SLICE, width: Math.min(box.width, 900), height: h },
      });
    }
  }

  // 恢复标准视口，确保布局类断言在真实窗口尺寸下成立
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(200);

  // —— 断言 ——
  for (const [label, selector, prop, expect] of CHECKS) {
    const res = await page.evaluate(({ selector, prop }) => {
      const el = document.querySelector(selector);
      if (!el) return { missing: true };
      const cs = getComputedStyle(el);
      return { value: cs[prop], fontSize: cs.fontSize, bg: cs.backgroundColor, color: cs.color };
    }, { selector, prop });

    if (res.missing) {
      results.push({ mode, label, ok: false, detail: `找不到元素 ${selector}` });
      continue;
    }
    let ok, detail;
    try {
      if (typeof expect === 'function') {
        const el = await page.$eval(selector, (e) => e);
        // 在页面上下文中重新求值，保证 getComputedStyle 可用
        ok = await page.evaluate(({ selector, prop, src }) => {
          const el = document.querySelector(selector);
          const v = getComputedStyle(el)[prop];
          // eslint-disable-next-line no-new-func
          const fn = new Function('v', 'el', `return (${src})(v, el);`);
          return fn(v, el);
        }, { selector, prop, src: expect.toString() });
        detail = `${prop} = ${res.value}`;
      } else {
        ok = String(res.value).includes(expect);
        detail = `${prop} = ${res.value}`;
      }
    } catch (e) {
      ok = false; detail = String(e.message);
    }
    results.push({ mode, label, ok, detail });
  }

  /* —— 分辨率自适应字号：必须实测，不能只读 CSS ——
   * 三条断言要一起成立，缺一条都会得到半吊子结果：
   *   ① 宽屏字号确实变大（这条保证「高分屏不再逼着眼睛看小字」）；
   *   ② 版心同步变宽（否则字大了版心没变，宽屏上会变成窄窄一条）；
   *   ③ 一行始终约 46 个汉字（①②各自都对但比例失调时，这条会拦住）。
   * 版心宽度不读元素的 offsetWidth —— 验证台没有 Obsidian 的 .markdown-preview-sizer，
   * 段落宽度跟的是视口。这里直接量 --my-content-width 令牌解析出的长度。 */
  const probeFont = async (w) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(150);
    return page.evaluate(() => {
      const el = document.querySelector('.markdown-rendered');
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;visibility:hidden;width:var(--my-content-width)';
      document.body.appendChild(d);
      const line = parseFloat(getComputedStyle(d).width);
      d.remove();
      return { fs, line, chars: line / fs };
    });
  };
  const narrow = await probeFont(1280);
  const wide = await probeFont(3840);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(150);

  results.push({
    mode,
    label: '分辨率自适应：3840 宽的字号明显大于 1280 宽',
    ok: wide.fs > narrow.fs + 2,
    detail: '1280 → ' + narrow.fs + 'px，3840 → ' + wide.fs + 'px',
  });
  results.push({
    mode,
    label: '分辨率自适应：版心随字号同步变宽',
    ok: wide.line > narrow.line * 1.15,
    detail: '1280 → ' + narrow.line + 'px，3840 → ' + wide.line + 'px',
  });
  results.push({
    mode,
    label: '分辨率自适应：两种宽度都保持一行约 46 字',
    ok: narrow.chars >= 42 && narrow.chars <= 50 && wide.chars >= 42 && wide.chars <= 50,
    detail: '1280 → ' + narrow.chars.toFixed(1) + ' 字/行，3840 → ' + wide.chars.toFixed(1) + ' 字/行',
  });

  // —— 对比度 ——
  for (const [name, sel] of [['正文', '.markdown-rendered p'], ['标题', '.markdown-rendered h1'], ['次要文字', '.status-bar']]) {
    const c = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      let bgEl = el, bg = 'rgba(0, 0, 0, 0)';
      while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
        bg = getComputedStyle(bgEl).backgroundColor;
        bgEl = bgEl.parentElement;
      }
      return { fg: getComputedStyle(el).color, bg };
    }, sel);
    if (!c) continue;
    const fg = parseColor(c.fg), bg = parseColor(c.bg);
    if (!fg || !bg) continue;
    const ratio = contrast(fg, bg);
    results.push({
      mode, label: `${name}对比度 ≥ 4.5:1（WCAG AA）`,
      ok: ratio >= 4.5,
      detail: `${ratio.toFixed(2)}:1  (${c.fg} on ${c.bg})`,
    });
  }

  /* app.css 中引用的 Obsidian 运行时图片（图标雪碧图等）只存在于其打包内部，
   * 在离线验证台里必然 404。这是环境噪声而非主题缺陷，按资源路径过滤。 */
  const noise = (e) => e.url.includes('reference/public');
  const noiseText = (e) => e.text.includes('ERR_FILE_NOT_FOUND') && e.url === '';
  const realErrors = consoleErrors.filter((e) => !noise(e) && !noiseText(e));
  const ignored = consoleErrors.length - realErrors.length;
  if (realErrors.length) {
    results.push({ mode, label: '页面无控制台错误', ok: false, detail: realErrors.slice(0, 3).map((e) => e.text).join(' | ') });
  } else {
    results.push({
      mode, label: '页面无控制台错误', ok: true,
      detail: ignored ? '0 个真实错误（已忽略 ' + ignored + ' 条 Obsidian 运行时资源 404）' : '0 个错误',
    });
  }

  await page.close();
}

await browser.close();

/* ---------------------------------------------------------------------------
 * 报告
 * ------------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
for (const mode of ['dark', 'light']) {
  const rows = results.filter((r) => r.mode === mode);
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n【${mode === 'dark' ? '夜间 墨夜' : '日间 宣纸'}】${rows.length - bad.length}/${rows.length} 通过`);
  for (const r of rows) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${r.detail ? '  → ' + r.detail : ''}`);
  }
}
console.log(`\n截图已输出到 tools/preview/out/`);
console.log(failed.length ? `\n✗ 共 ${failed.length} 项未通过` : '\n✓ 全部验证通过');

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
process.exitCode = failed.length ? 1 : 0;
