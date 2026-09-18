#!/usr/bin/env node
/**
 * 墨韵 MoYun · Mermaid 真实渲染检查
 * ---------------------------------------------------------------------------
 * 为什么需要这个检查（它是被一个真实 bug 逼出来的）：
 * 早期版本的「验证台夹具」是手写的静态 SVG，并且用
 *     mermaid.initialize({ theme: 'dark' })
 * 去渲染 —— 而 Obsidian 实际用的是
 *     mermaid.initialize({ startOnLoad:false, securityLevel:'strict',
 *                          themeVariables:{ fontFamily:'var(--font-mermaid)' }, ... })
 * 也就是【不切换明暗主题】。Mermaid 因此在深色模式下仍使用自己的浅色变量
 * （文字固定 #333），主题把节点底色换成深色后，就出现了「文字和背景一个色」。
 * 夹具与真实环境的这一点差异，让上一版检查全绿却漏掉了用户的 bug。
 * 教训：验证工具本身也会说谎，夹具必须复刻真实初始化参数。
 *
 * 本脚本用真实的 Mermaid 包 + Obsidian 的真实初始化参数渲染，然后逐个文字元素
 * 计算「可见文字色 / 有效背景色」的对比度，低于阈值即失败。
 * 注意 fill 与 color 的区分：SVG <text> 看 fill，foreignObject 里的 HTML 看 color，
 * 只看其中一个就会得到「看起来没问题」的假绿。
 *
 * 用法：node tools/check-mermaid.mjs
 *      MOYUN_MERMAID=/path/to/mermaid.min.js node tools/check-mermaid.mjs
 * 退出码：0 通过（或本机没有 mermaid 包而跳过）；1 有对比度不达标。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'preview', 'out');
fs.mkdirSync(OUT, { recursive: true });

/* Mermaid 包不是本主题的依赖（主题零依赖是刻意的），所以按候选路径寻找；
 * 找不到就明确跳过，而不是假装通过。 */
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
  console.log('⚠ 未找到 mermaid 包，跳过真实渲染检查。');
  console.log('  指定路径可启用：MOYUN_MERMAID=/path/to/mermaid.min.js node tools/check-mermaid.mjs');
  process.exit(0);
}

/* 覆盖真实使用场景的六类图；流程图刻意用 <br/> 多行标签 + subgraph，
 * 因为这两种结构在 Mermaid 里走的是 foreignObject（HTML 标签）分支，
 * 正是「只覆盖 fill 不覆盖 color」时会漏掉的那一支。 */
const DIAGRAMS = {
  flowchart: [
    'flowchart LR',
    '    subgraph 管理API',
    '        A1[PUT/POST /api/users<br/>fund_permissions 帶 is_default 標記]',
    '        A2[GET /api/users<br/>條目回顯 is_default]',
    '    end',
    '    subgraph 後端',
    '        B[UserFundPermissionService]',
    '        C[(user_fund_permissions<br/>加 is_default 列)]',
    '    end',
    '    A1 --> B',
    '    A2 --> C',
    '    B <--> C',
    '    C -->|寫入| A1',
  ].join('\n'),
  sequence: [
    'sequenceDiagram',
    '    participant U as 用戶',
    '    participant S as 服務',
    '    U->>S: 登入請求',
    '    Note over U,S: 需要 is_default 標記',
    '    S-->>U: 回傳可操作資料',
  ].join('\n'),
  state: ['stateDiagram-v2', '    [*] --> 待審核', '    待審核 --> 通過: 審批', '    待審核 --> 駁回: 退件', '    通過 --> [*]'].join('\n'),
  class: ['classDiagram', '    class 使用者 {', '      +String 名稱', '      +登入()', '    }', '    使用者 --> 權限 : 擁有'].join('\n'),
  pie: ['pie title 權限分佈', '    "管理" : 30', '    "查詢" : 70'].join('\n'),
  gantt: ['gantt', '    title 投產計畫', '    dateFormat YYYY-MM-DD', '    section 前置', '    確認清單 :a1, 2026-01-01, 3d', '    section 上線', '    灰度 :a2, after a1, 5d'].join('\n'),
  /* 思维导图与时间线是「用图说话」的知识库笔记最常用的两种图，
   * 而它们的文字节点没有 .label 类（mindmap 用 .mindmap-node / section-root，
   * timeline 用 .timeline-node），恰好是「按类名写样式」时会漏掉的一支 ——
   * 所以补进夹具，让主题对它们也有对比度保证。 */
  mindmap: [
    'mindmap',
    '  root((墨韻))',
    '    排版',
    '      首行縮進',
    '      中西文間距',
    '    配色',
    '      八韻',
    '    移動端',
    '      縮放',
  ].join('\n'),
  timeline: [
    'timeline',
    '    title 專案里程碑',
    '    2026-09 : 主題 1.0 : 圖表風格',
    '    2026-09 : 手機適配',
    '    2026-09 : 插件 1.0',
  ].join('\n'),
  /* 下面这些图种各自有【私有的方框类名】，正是「按类名写样式」时成片漏掉的一支：
   * 需求图 .reqBox、git 图 .branchLabelBkg、旅程图 .journey-section、象限图 .quadrant rect、
   * xychart 的 rect.background（一整块纯白）。补进夹具，让「方框里不许铺底」这条契约覆盖到它们。 */
  requirement: [
    'requirementDiagram',
    '    requirement req1 {',
    '      id: 1',
    '      text: verify user permission',
    '      risk: low',
    '      verifymethod: test',
    '    }',
  ].join('\n'),
  /* 这些图种的解析器不接受中文标识（实测：requirement 的 text、git 的分支名、quadrant 的
   * 坐标轴与点标签、xychart 的轴标签都必须是 ASCII 才解析得过），夹具因此用英文标识 ——
   * 这里要检查的是颜色与底色，不是文案。 */
  git: ['gitGraph', '    commit id: "a"', '    branch feature', '    commit id: "b"', '    checkout main', '    merge feature'].join('\n'),
  journey: ['journey', '    title 上線流程', '    section 準備', '    確認清單: 5: 我', '    section 上線', '    灰度: 7: 我'].join('\n'),
  quadrant: ['quadrantChart', '    title Priority', '    x-axis Low --> High', '    y-axis Low --> High', '    Feature A: [0.3, 0.6]', '    Feature B: [0.7, 0.8]'].join('\n'),
  xychart: ['xychart-beta', '    title Usage', '    x-axis [Jan, Feb]', '    y-axis 0 --> 10', '    bar [3, 7]', '    line [4, 6]'].join('\n'),
  block: ['block-beta', '    columns 2', '    a["輸入"] b["輸出"]', '    a --> b'].join('\n'),
  sankey: ['sankey-beta', 'A,B,10', 'A,C,5'].join('\n'),
};

/* 「用颜色或长度编码数据」的图形白名单：填充本身就是信息，抹平等于丢数据。
 * 除此之外，图里【任何】还有底色的形状都算「方框里铺了底」——
 * 这条契约刻意反过来写（枚举全部形状 + 白名单），而不是列举该透明的类名：
 * 上一版就是列举式，结果 mindmap / timeline / 需求图 / git 图 / 旅程图 / 象限图 / xychart
 * 的方框一个都没被抽到，顶着 Mermaid 默认配色却全绿。 */
const DATA_SHAPES = [
  '.pieCircle',                 // 饼图扇区
  'g.legend rect',              // 饼图图例色块
  'rect.task',                  // 甘特条 / 旅程任务条（长度 = 时长）
  'g[class^="bar-plot"] rect',  // xychart 柱
  'g.data-point circle',        // 象限图数据点
  'circle.commit',              // git 提交点（颜色区分分支）
  'path.arrow',                 // git 分支箭头
  'circle.face',                // 旅程心情笑脸
  'path.mouth',
  /* 边标签的底衬：它【必须】不透明，否则从标签下方穿过的连线会把文字切开。
   * 状态图/类图的连线上也有同样一块（Mermaid 不给它类名，只包在 g.edgeLabel / g.label 里），
   * 所以按祖先类名放行。这一条由下面的「边标签底色」契约单独把关。 */
  '.labelBkg',
  'g.edgeLabel rect',
  'g.label rect',
];

/* 两套图表风格都要过检查：风格只该改变观感，不该改变可读性 */
const STYLES = [
  { key: 'ink', cls: 'my-mermaid-ink', label: '墨韵' },
  { key: 'cyber', cls: 'my-mermaid-cyber', label: '赛博·青蓝' },
  { key: 'cyber-matrix', cls: 'my-mermaid-cyber-matrix', label: '赛博·矩阵翠绿' },
  { key: 'cyber-violet', cls: 'my-mermaid-cyber-violet', label: '赛博·紫粉' },
  { key: 'cyber-amber', cls: 'my-mermaid-cyber-amber', label: '赛博·琥珀' },
  { key: 'line', cls: 'my-mermaid-line', label: '极简·黑白线框' },
];

/* 对比度阈值：正文级 4.5（WCAG AA），次级信息 3.0 */
const AA_NORMAL = 4.5;
const AA_SMALL = 3.0;

const { chromium } = loadPlaywright();
const CHROME = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const HARNESS = pathToFileURL(path.join(ROOT, 'tools', 'preview', 'harness.html')).href;

console.log('使用 Mermaid：' + MERMAID);
const failures = [];
const summary = [];

for (const style of STYLES) {
for (const mode of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(HARNESS, { waitUntil: 'load' });
  await page.addScriptTag({ path: MERMAID });
  const rows = await page.evaluate(async ({ diagrams, mode, styleCls, styles }) => {
    document.body.classList.remove('theme-dark', 'theme-light', ...styles.map((s) => s.cls));
    document.body.classList.add('theme-' + mode, styleCls);
    document.documentElement.dataset.theme = mode;
    await new Promise((r) => setTimeout(r, 80));

    /* Obsidian 的真实初始化参数（提取自 obsidian.asar）。
     * 关键：不传 theme —— 于是 Mermaid 永远用它的浅色变量，深色适配必须由 CSS 负责。 */
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      themeVariables: { fontFamily: 'var(--font-mermaid)' },
      flowchart: { useMaxWidth: false },
      sequence: { useMaxWidth: false },
      class: { useMaxWidth: true },
      state: { useMaxWidth: true },
      pie: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    });

    const host = document.querySelector('.markdown-rendered');
    let i = 0;
    for (const [name, def] of Object.entries(diagrams)) {
      const { svg } = await window.mermaid.render('mmdc-' + mode + '-' + (i++), def);
      const wrap = document.createElement('div');
      wrap.className = 'mermaid';
      wrap.dataset.diagram = name;
      wrap.innerHTML = svg;
      host.appendChild(wrap);
    }
    await new Promise((r) => setTimeout(r, 200));

    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const parse = (s) => {
      const m = String(s || '').match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(Number);
      if (p.length > 3 && p[3] === 0) return null;
      return [p[0], p[1], p[2]];
    };
    const ratio = (a, b) => {
      if (!a || !b) return null;
      const l1 = lum(a), l2 = lum(b);
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    /* 有效背景：先找所在图形的形状填充色，再退到最近的实色容器背景 */
    const bgOf = (el) => {
      const group = el.closest('g.node, g.cluster, g.actor, g.note, g.statediagram-state, g.stateGroup, g.classGroup, g.edgeLabel, g.label');
      if (group) {
        const shape = group.querySelector('rect, polygon, circle, ellipse, path');
        if (shape) {
          const c = parse(getComputedStyle(shape).fill);
          if (c) return c;
        }
      }
      /* 向上找真正的背景：HTML 元素看 backgroundColor；
       * SVG 里【只有形状】的 fill 才是背景 —— <g>/<div> 上的 fill 是文字色，
       * 误当背景会算出「文字与背景同色」的假失败（本项目踩过这个坑）。 */
      const SHAPES = ['rect', 'circle', 'ellipse', 'polygon', 'path'];
      let p = el.parentElement;
      while (p) {
        const cs = getComputedStyle(p);
        if (p instanceof SVGElement) {
          /* SVG 元素【不渲染】background-color（Mermaid 却给 .edgeLabel 写了
           * background-color:#ECECFF），把它当背景会算出「浅紫底 + 灰字」的假失败。
           * SVG 里只有形状的 fill 才是真正的背景。 */
          if (SHAPES.includes(p.tagName.toLowerCase())) {
            const f = parse(cs.fill);
            if (f) return f;
          }
        } else {
          const htmlBg = parse(cs.backgroundColor);
          if (htmlBg) return htmlBg;
        }
        p = p.parentElement;
      }
      return parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
    };
    /* 可见文字色：SVG 元素看 fill，HTML 元素看 color —— 只看一个会得到假绿 */
    const isSvgText = (el) => el instanceof SVGElement;
    const fgOf = (el) => {
      const cs = getComputedStyle(el);
      return isSvgText(el) ? (parse(cs.fill) || parse(cs.color)) : parse(cs.color);
    };

    /* 先断言 SVG 没有被施加反相滤镜。
     * Obsidian 原生给深色模式的 Mermaid SVG 加了
     *   filter: invert(100%) hue-rotate(180deg) saturate(1.25)
     * filter 只改像素、不改 getComputedStyle，因此它一旦生效，
     * 下面所有对比度计算都会得出与屏幕相反的结论（本项目就因此漏掉过一个 bug）。
     * 宁可在这里硬失败，也不要让检查在「计算正常、屏幕全错」时说通过。 */
    const filters = [];
    for (const wrap of host.querySelectorAll('.mermaid[data-diagram]')) {
      const svg = wrap.querySelector('svg');
      const f = svg ? getComputedStyle(svg).filter : 'none';
      if (f && f !== 'none') filters.push({ diagram: wrap.dataset.diagram, filter: f });
    }

    const out = [];
    for (const wrap of host.querySelectorAll('.mermaid[data-diagram]')) {
      const seen = new Set();
      for (const el of wrap.querySelectorAll('svg text, svg tspan, svg span, svg p, svg div')) {
        /* 只取真正渲染文字的叶子节点，避免父容器重复计数 */
        const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
        if (!own) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        const fg = fgOf(el);
        if (!fg) continue;
        const bg = bgOf(el);
        const key = own.slice(0, 20) + '|' + cs.color + '|' + cs.fill;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          mode,
          diagram: wrap.dataset.diagram,
          tag: el.tagName.toLowerCase() + (el.getAttribute('class') ? '.' + el.getAttribute('class') : ''),
          text: own.slice(0, 24),
          fg: 'rgb(' + fg.join(',') + ')',
          bg: 'rgb(' + bg.join(',') + ')',
          via: isSvgText(el) ? 'fill' : 'color',
          contrast: ratio(fg, bg),
        });
      }
    }
    return { rows: out, filters };
  }, { diagrams: DIAGRAMS, mode, styleCls: style.cls, styles: STYLES });

  /* —— 像素级校验：计算样式必须与屏幕像素一致 ——
   * 这一条是被「Obsidian 给深色 Mermaid SVG 加 invert 反相滤镜」坑出来的：
   * 当时 getComputedStyle 说「深底浅字」，屏幕上却是「白底深字」，
   * 纯计算样式的检查全绿，用户却看不见字。所以这里直接取样真实像素做对拍。 */
  const probePoints = await page.evaluate(() => {
    const out = [];
    /* 第一张图的若干节点：坐标一律相对该图自身，和元素截图的像素原点一致 */
    const wrap = document.querySelector('.mermaid[data-diagram]');
    if (!wrap) return out;
    const wb = wrap.getBoundingClientRect();
    for (const rect of wrap.querySelectorAll('g.node rect, g.node polygon, .statediagram-state rect')) {
      const rb = rect.getBoundingClientRect();
      if (rb.width < 12 || rb.height < 12) continue;
      out.push({
        diagram: wrap.dataset.diagram,
        x: Math.round(rb.left - wb.left + 6),
        y: Math.round(rb.top - wb.top + rb.height / 2),
        fill: getComputedStyle(rect).fill,
      });
    }
    return out;
  });

  /* 用元素截图而不是 viewport 裁剪：图在笔记的滚动容器底部，
   * getBoundingClientRect 给出的坐标落在视口之外，裁剪会直接报错。
   * 元素截图会自动滚动到目标，且像素坐标以该元素左上角为原点 ——
   * 正好与上面 probePoints 的相对坐标一致。 */
  const firstWrap = await page.$('.mermaid[data-diagram]');
  const shot = await firstWrap.screenshot();
  const shotB64 = shot.toString('base64');
  const painted = await page.evaluate(async ({ b64, pts, dpr }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return pts.map((p) => {
      const d = ctx.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data;
      return { diagram: p.diagram, fill: p.fill, painted: [d[0], d[1], d[2]] };
    });
  }, { b64: shotB64, pts: probePoints, dpr: 2 });

  const parseRgb = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(',').map(Number) : null;
  };
  for (const p of painted) {
    const want = parseRgb(p.fill);
    if (!want) continue;
    /* 透明的填充无法预测像素：屏幕上看到的是它后面的东西。
     * 「极简·黑白线框」风格刻意把节点填充设为 transparent，
     * 若照旧对拍会得到「计算透明、屏幕是纸色」这种假失败。 */
    if (want.length > 3 && want[3] < 1) continue;
    const diff = Math.max(Math.abs(want[0] - p.painted[0]), Math.abs(want[1] - p.painted[1]), Math.abs(want[2] - p.painted[2]));
    if (diff > 16) {
      failures.push({
        style: style.key, styleLabel: style.label, mode, diagram: p.diagram, tag: 'g.node 形状', text: '计算样式与屏幕像素不一致',
        fg: '-', bg: '-', contrast: 0,
        reason: '计算 fill=rgb(' + want.join(',') + ') 但屏幕像素=rgb(' + p.painted.join(',') + ')，差值 ' + diff + ' —— 元素被滤镜/混合模式改写了像素',
      });
    }
  }
  console.log('  像素对拍：' + painted.length + ' 处节点填充，' + painted.map((p) => 'rgb(' + p.painted.join(',') + ')').join(' '));
  /* 逐图截图：图在笔记的滚动容器里，整页截图（fullPage）拍不到它们，
   * 而「肉眼能看见文字」恰恰是这个模块唯一要证明的事，所以必须逐张留证。 */
  for (const name of Object.keys(DIAGRAMS)) {
    const handle = await page.$('.mermaid[data-diagram="' + name + '"]');
    if (!handle) continue;
    await handle.scrollIntoViewIfNeeded();
    await handle.screenshot({ path: path.join(OUT, 'mermaid-' + style.key + '-' + mode + '-' + name + '.png') });
  }
  /* 形状透明度契约（用户明确要求：方框「有颜色」指描边有色，里面不许铺底色）。
   * 写法本身就是一次教训：上一版只按【写死的类名清单】取样
   * （.node rect / .node circle / .actor / .statediagram-state rect / .classGroup rect / .note），
   * 于是 mindmap 的 .node-bkg、timeline 的 .node-bkg、需求图的 .reqBox、git 图的
   * .branchLabelBkg、旅程图的 .journey-section、象限图的 .quadrant rect、xychart 的
   * rect.background 一个都没被抽到 —— 它们顶着 Mermaid 默认的纯蓝 #0000EC、亮黄 #FFFF78、
   * 嫩绿 #D7FF86、淡紫 #ECECFF 和一块 700×500 的纯白，检查却是全绿。
   * 现在反过来：枚举图里【每一个真的会被画出来的形状】，不在数据图形白名单里的，
   * 填充必须透明。宁可疑心，不可漏检。 */
  const fills = await page.evaluate((dataShapes) => {
    const alphaOf = (value) => {
      if (!value) return 1;
      if (value === "none" || value === "transparent") return 0;
      if (value.indexOf("rgba(") === 0) {
        const parts = value.slice(5, -1).split(",");
        return parts.length >= 4 ? parseFloat(parts[3]) : 1;
      }
      return 1;
    };
    /* 所在画布的有效背景：从形状往上找到第一个不透明的容器背景（HTML 用 background-color），
     * 找不到就落到 body。赛博风格把画布色写在 .mermaid 上，所以必须往上走，不能只看 body。 */
    const effectiveBg = (el) => {
      let p = el.parentElement;
      while (p) {
        if (!(p instanceof SVGElement)) {
          const bg = getComputedStyle(p).backgroundColor;
          const a = alphaOf(bg);
          if (a > 0.9) return bg;
        }
        p = p.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };

    const violations = [];
    const labels = [];
    /* 只审计本脚本渲染的图（带 data-diagram）：验证台里那几张手写夹具另有 verify.mjs 管，
     * 混进来会把「夹具自己的形状」误报成主题的问题。 */
    for (const svg of Array.from(document.querySelectorAll(".mermaid[data-diagram] svg"))) {
      const host = svg.closest(".mermaid");
      const diagram = host ? host.getAttribute("data-diagram") : "?";
      for (const el of Array.from(svg.querySelectorAll("rect, circle, ellipse, polygon, path"))) {
        if (el.closest("defs") || el.closest("marker")) continue; /* 箭头定义：不落笔 */
        const fill = getComputedStyle(el).fill;
        const alpha = alphaOf(fill);
        if (alpha <= 0.001) continue;
        const box = el.getBoundingClientRect();
        if (box.width * box.height < 40) continue; /* 极小点（笑脸眼睛等）不参与 */
        if (dataShapes.some((sel) => el.matches(sel) || el.closest(sel))) continue;
        /* 结构方框有两条合法路径：
         *   ① 完全透明（首选）；
         *   ② 「与所在画布同色」的遮线底 —— 思维导图的连线是从父节点画到子节点的粗线，
         *      节点透明了线就从标签上穿过去，只能用同色底挡住（边标签用同一手法）。
         *      同色 = 视觉上与透明无异，所以这里按「颜色与有效背景相等」放行。 */
        if (fill === effectiveBg(el)) continue;
        violations.push({
          diagram: diagram,
          cls: el.tagName.toLowerCase() + (el.getAttribute("class") ? "." + el.getAttribute("class") : ""),
          alpha: alpha,
          fill: fill,
        });
      }
      /* 这里只守【连线上的标签】：它的底衬必须不透明，否则穿过的线会把文字切开。
       * 不能扩到 g.label rect —— 那里面还有节点自己的标签组，它们的 rect 本来就该透明。 */
      for (const el of Array.from(svg.querySelectorAll("g.edgeLabel rect, .labelBkg")).slice(0, 4)) {
        labels.push({ diagram: diagram, alpha: alphaOf(getComputedStyle(el).fill) });
      }
    }
    return { violations: violations, labels: labels };
  }, DATA_SHAPES);
  for (const v of fills.violations) {
    failures.push({ style: style.key, styleLabel: style.label, mode, diagram: v.diagram, tag: v.cls,
      text: "方框里铺了底色", contrast: 0, fg: "-", bg: v.fill,
      reason: "形状 " + v.cls + " 的 fill=" + v.fill + "（不透明）—— 结构方框必须只有描边有色、里面透明；" +
        "若它是【用颜色编码数据】的图形，请加进 DATA_SHAPES 白名单并说明理由" });
  }
  for (const label of fills.labels) {
    if (label.alpha < 0.999) {
      failures.push({ style: style.key, styleLabel: style.label, mode, diagram: label.diagram, tag: "edgeLabel 底",
        text: "边标签底色变透明", contrast: 0, fg: "-", bg: "alpha=" + label.alpha,
        reason: "边标签必须有底色遮住穿过的连线，不能透明" });
    }
  }

  const list = rows.rows;
  const bad = list.filter((r) => r.contrast !== null && r.contrast < AA_NORMAL);
  const worst = list.slice().sort((a, b) => a.contrast - b.contrast).slice(0, 3);
  summary.push({ style: style.key, styleLabel: style.label, mode, total: list.length, bad: bad.length, worst, filters: rows.filters });
  for (const r of bad) failures.push({ ...r, style: style.key, styleLabel: style.label });
  /* 反相滤镜会让「计算样式」与「屏幕像素」相反，必须单独拦下 */
  for (const f of rows.filters) {
    failures.push({ style: style.key, styleLabel: style.label, mode, diagram: f.diagram, tag: 'svg', text: '反相滤镜未关闭', fg: '-', bg: '-', contrast: 0,
      reason: 'SVG 上仍有 filter: ' + f.filter + '（Obsidian 原生为深色模式加的 invert 反相），计算样式与屏幕像素会相反' });
  }
  await page.close();
}
}

await browser.close();

for (const s of summary) {
  console.log('\n【' + s.styleLabel + ' · ' + (s.mode === 'dark' ? '夜间 墨夜' : '日间 宣纸') + '】检查文字元素 ' + s.total + ' 个，低于 ' + AA_NORMAL + ':1 的有 ' + s.bad + ' 个；反相滤镜 ' + (s.filters.length ? '仍存在（' + s.filters.length + ' 处）' : '已关闭'));
  for (const r of s.worst) {
    console.log('   最低 ' + String(r.contrast).padStart(6) + '  ' + r.diagram.padEnd(9) + r.tag.padEnd(24) + ' 文字=' + r.fg.padEnd(18) + ' 背景=' + r.bg.padEnd(18) + '（取 ' + r.via + '）"' + r.text + '"');
  }
}

if (failures.length) {
  console.log('\n✗ 有 ' + failures.length + ' 处问题（文字对比度 / 方框底色 / 反相滤镜）：');
  for (const r of failures.slice(0, 12)) {
    console.log('   ' + (r.styleLabel || '') + ' ' + r.mode + ' / ' + r.diagram + ' / ' + r.tag + (r.reason ? ' → ' + r.reason : ' 对比度 ' + r.contrast + ' 文字=' + r.fg + ' 背景=' + r.bg + ' "' + r.text + '"'));
  }
  console.log('\n截图：tools/preview/out/mermaid-dark.png / mermaid-light.png');
  process.exitCode = 1;
} else {
  console.log('\n✓ Mermaid 全部文字对比度达标（≥ ' + AA_NORMAL + ':1，次级信息允许 ≥ ' + AA_SMALL + ':1，实测均已达正文级）');
  console.log('截图：tools/preview/out/mermaid-dark.png / mermaid-light.png');
}
