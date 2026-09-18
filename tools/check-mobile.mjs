#!/usr/bin/env node
/**
 * 墨韵 MoYun · 移动端实测台（手机 / 平板视口）
 * ---------------------------------------------------------------------------
 * 为什么需要它（它是被一句用户反馈逼出来的）：
 * 「手机上字很大、一屏放不下多少内容，还不能双指缩放」——
 * 这句话里混着三件不同的事：Obsidian 移动端自己的行为、用户手机的系统字号、
 * 以及主题是否真的改了度量。只读 CSS 分不清，所以这里做【差分实测】：
 *   同一份 Obsidian 真实 DOM + 真实 app.css，在同一个手机视口下分别加载
 *     ① 不加载主题  = Obsidian 原生移动端基线
 *     ② 加载主题    = 墨韵之后的样子
 * 逐项对比字号 / 版心宽度 / 每行字数 / 理论满屏行数 / 横向溢出，把责任分开。
 *
 * 另有两条移动端专属检查，都是「主题不该做的事」：
 *   · text-size-adjust 必须显式声明（否则 WebView 的文本自动放大可能生效）
 *   · touch-action 不得声明成 none（那会吃掉双指缩放/滑动的手势）
 *
 * 用法：node tools/check-mobile.mjs
 * 退出码：0 全部通过；1 有断言失败。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tools", "preview", "out");
fs.mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const candidates = [
    path.join(ROOT, "node_modules", "playwright"),
    "/home/as-workstation01/Documents/project/Chrome/node_modules/playwright",
    "playwright",
  ];
  for (const c of candidates) {
    try { return createRequire(import.meta.url)(c); } catch { /* 试下一个 */ }
  }
  throw new Error("未找到 playwright，请先安装：npm i -D playwright");
}

const { chromium } = loadPlaywright();

/* 本机 Playwright 没有下载自带内核，系统 Chrome 是现成的（其它脚本也这么做） */
const CHROME = ["/usr/bin/google-chrome", "/opt/google/chrome/chrome", "/usr/bin/chromium"]
  .find((p) => fs.existsSync(p));

/* 验证台 HTML 从磁盘读入后按变体改写：注入移动端 viewport 声明、加 is-mobile 类，
 * 并在「原生基线」变体里摘掉 theme.css。改写结果写到与 harness.html 【同目录】的临时文件——
 * 这样 ../../theme.css 这类相对路径仍然解析正确（file:// 下无法用 route.fetch 拦截）。 */
const HARNESS_SRC = fs.readFileSync(path.join(ROOT, "tools", "preview", "harness.html"), "utf8");
const FIXTURE = path.join(ROOT, "tools", "preview", ".mobile-fixture.html");

/* 视口清单：覆盖常见手机宽度与平板，桌面宽度作为对照（主题的自适应字号只在宽屏生效） */
const DEVICES = [
  { id: "phone-360", width: 360, height: 800, dpr: 3, kind: "phone" },
  { id: "phone-390", width: 390, height: 844, dpr: 3, kind: "phone" },
  { id: "phone-430", width: 430, height: 932, dpr: 3, kind: "phone" },
  { id: "tablet-768", width: 768, height: 1024, dpr: 2, kind: "tablet" },
  { id: "desktop-1440", width: 1440, height: 900, dpr: 1, kind: "desktop" },
];

/* Obsidian 移动端的 viewport 声明：宽度跟随设备、禁用手势缩放（这是移动端框架自己写的，
 * 主题无法改变它——实测台把它复刻出来，正是为了证明「不能双指缩放」的出处）。 */
const VIEWPORT_META =
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />';

const VARIANTS = [
  { id: "vanilla-dark", theme: false, cls: "theme-dark", label: "Obsidian 原生（深）" },
  { id: "moyun-dark", theme: true, cls: "theme-dark", label: "墨韵（深）" },
  { id: "moyun-light", theme: true, cls: "theme-light", label: "墨韵（浅）" },
];

function collect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  function pathOf(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 5) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(s + "#" + cur.id); break; }
      if (cur.classList.length) s += "." + Array.from(cur.classList).slice(0, 3).join(".");
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((x) => x.tagName === cur.tagName);
        if (same.length > 1) s += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
      }
      parts.unshift(s);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function hasScroller(el) {
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      if (/auto|scroll/.test(cs.overflowX)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  const rendered = document.querySelector(".markdown-rendered");
  const p = document.querySelector(".markdown-rendered p");
  const csP = p ? getComputedStyle(p) : null;
  const csR = rendered ? getComputedStyle(rendered) : null;
  const fontSize = csP ? parseFloat(csP.fontSize) : 0;
  const lineHeight = csP ? parseFloat(csP.lineHeight) : 0;

  let contentWidth = 0;
  let sizerWidth = 0;
  if (rendered) {
    const r = rendered.getBoundingClientRect();
    contentWidth = r.width - parseFloat(csR.paddingLeft) - parseFloat(csR.paddingRight);
  }
  /* Obsidian 把 --file-margins 作为内边距画在版心元素上；验证台没有单独的
   * .markdown-preview-sizer，内边距就在 .markdown-preview-view.markdown-rendered 上
   * （实测左右各 24px = --my-editor-padding-x），因此两者都兜住。 */
  const sizer = document.querySelector(".markdown-preview-sizer") || rendered;
  if (sizer) sizerWidth = sizer.getBoundingClientRect().width;
  const sizerCs = sizer ? getComputedStyle(sizer) : null;

  /* 越界分两个方向看，因为它们的危害完全不同：
   *   右侧越界 = 内容放不下（手机上是真问题，会读不到）；
   *   左侧越界 = 图标贴着窗口边溢出几像素（实测侧栏折叠图标 left:-4px），
   *              被父容器裁掉、肉眼不可见，只作为信息记录，不当作失败。 */
  const bleedRight = [];
  const bleedLeft = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (hasScroller(el)) continue;
    const item = {
      sel: pathOf(el),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
    };
    if (r.right > vw + 1) bleedRight.push(item); else bleedLeft.push(item);
  }
  bleedRight.sort((a, b) => b.right - a.right);
  bleedLeft.sort((a, b) => a.left - b.left);

  const htmlCs = getComputedStyle(document.documentElement);
  const bodyCs = getComputedStyle(document.body);

  /* 「一屏能放多少行」必须量真正的滚动容器，而不是浏览器视口：
   * 手机上视口被状态栏、标签栏、工具栏吃掉一大截，用视口高度算出来的数字
   * 会比用户真实看到的多好几行。 */
  const hostCandidates = [".markdown-preview-view", ".markdown-reading-view", ".view-content", ".cm-scroller"];
  let host = null;
  for (const sel of hostCandidates) {
    const el = document.querySelector(sel);
    if (el && el.clientHeight > 40) { host = { sel: sel, h: el.clientHeight }; break; }
  }
  /* 验证台是静态 DOM，.markdown-preview-view 的高度没有被约束（实测 3664px），
   * 直接拿它算「一屏行数」会得到一百多行的假数字。取【可见高度】= 容器高度与
   * 视口高度的较小值：真机上容器高度就是视口高度，这里用 min 保证两头都对。 */
  const hostH = Math.min(host ? host.h : vh, vh);

  /* 宽图（900px 夹具）：手机上它是否被压扁，是「图看不清楚」的直接量化指标。
   * 压扁 = svg 渲染宽度 ≈ 版心宽度（340px）→ 图内 14px 文字实际只剩 5.3px。 */
  const wideBox = document.querySelector("#mermaid-wide");
  const wideSvg = wideBox ? wideBox.querySelector("svg") : null;

  /* Canvas 卡片里的图（白板场景）：卡片窄、内部不能平移，但画布可双指缩放，
   * 所以这里应当【缩放进屏】—— 与版心内的策略正好相反。 */
  const canvasBox = document.querySelector("#mermaid-in-canvas");
  const canvasSvg = canvasBox ? canvasBox.querySelector("svg") : null;

  const headingSel = [["h1", "h1"], ["h2", "h2"], ["h3", "h3"], ["h4", "h4"]];
  const headings = {};
  for (const pair of headingSel) {
    const el = document.querySelector(".markdown-rendered " + pair[1]);
    headings[pair[0]] = el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  }

  return {
    vw: vw,
    vh: vh,
    fontSize: fontSize,
    lineHeight: lineHeight,
    contentWidth: Math.round(contentWidth),
    sizerWidth: Math.round(sizerWidth),
    charsPerLine: fontSize ? contentWidth / fontSize : 0,
    linesPerScreen: lineHeight ? hostH / lineHeight : 0,
    hostHeight: hostH,
    hostSel: host ? host.sel : "(视口)",
    sizerPaddingTop: sizerCs ? parseFloat(sizerCs.paddingTop) : -1,
    sizerPaddingLeft: sizerCs ? parseFloat(sizerCs.paddingLeft) : -1,
    wideBox: wideBox ? Math.round(wideBox.clientWidth) : -1,
    wideSvg: wideSvg ? Math.round(wideSvg.getBoundingClientRect().width) : -1,
    wideScrollable: wideBox ? wideBox.scrollWidth > wideBox.clientWidth + 1 : false,
    canvasBox: canvasBox ? Math.round(canvasBox.clientWidth) : -1,
    canvasSvg: canvasSvg ? Math.round(canvasSvg.getBoundingClientRect().width) : -1,
    headings: headings,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    /* text-size-adjust 是继承属性，且 Obsidian 只在 body.is-mobile 上声明，
     * 因此必须先看 body：html 上读到的是默认值 auto，会把「已声明」误报成「未声明」。 */
    textSizeAdjustHtml: htmlCs.webkitTextSizeAdjust,
    textSizeAdjustBody: bodyCs.webkitTextSizeAdjust,
    touchAction: bodyCs.touchAction,
    themeLoaded: !!document.querySelector('link[href*="theme.css"]'),
    offenders: bleedRight.slice(0, 6),
    offenderCount: bleedRight.length,
    bleedLeftCount: bleedLeft.length,
    bleedLeft: bleedLeft.slice(0, 3),
  };
}

function fmt(n, d) {
  const p = Math.pow(10, d === undefined ? 2 : d);
  return String(Math.round(n * p) / p);
}

const findings = [];
function assert(cond, label, detail) {
  findings.push({ ok: !!cond, label: label, detail: detail || "" });
  console.log((cond ? "  ✓ " : "  ✗ ") + label + (detail ? " — " + detail : ""));
}

const report = { generatedAt: new Date().toISOString(), devices: {} };

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  for (const device of DEVICES) {
    console.log("\n=== " + device.id + "  " + device.width + "x" + device.height + " @" + device.dpr + "x ===");
    const results = {};

    for (const variant of VARIANTS) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.dpr,
        isMobile: device.kind !== "desktop",
        hasTouch: device.kind !== "desktop",
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));

      let html = HARNESS_SRC.replace("</head>", VIEWPORT_META + "</head>");
      if (!variant.theme) html = html.replace(/<link[^>]*theme\.css[^>]*>\s*/i, "");
      /* 只有手机/平板视口才打 is-mobile：桌面视口是【对照组】，
       * 给它打上移动端类会让「宽屏自适应字号」被移动端分支覆盖，测出来的是假数据。 */
      const mobileCls = device.kind === "desktop" ? "" : " is-mobile is-phone";
      html = html.replace(/<body class="([^"]*)"/, function (m, cls) {
        /* 必须【先摘掉】验证台自带的 theme-dark，否则明暗两个类同时在身上、
         * 谁赢取决于 app.css 的书写顺序 —— 「浅色」变体会渲染成深色，
         * 两张截图逐字节相同（本脚本踩过：两个 PNG 都是 508979 字节）。 */
        const base = cls.replace(/\btheme-(dark|light)\b/g, "").replace(/\s+/g, " ").trim();
        return '<body class="' + base + mobileCls + " " + variant.cls + '"';
      });
      /* is-phone 下 app.css 会隐藏「未标记为可见」的标签组：
       *   .is-phone .mod-root .workspace-tabs:not(.mod-visible) { display: none }
       * 验证台的静态 DOM 没有这个类，主编辑区会整块消失（实测内容宽度 0px、版心 -48px，
       * 数据全是假的）。按 Obsidian 的真实做法给根标签组补上 mod-visible。 */
      const rootAt = html.indexOf("workspace-split mod-root");
      if (rootAt >= 0) {
        html = html.slice(0, rootAt) +
          html.slice(rootAt).replace(/<div class="workspace-tabs">/g, '<div class="workspace-tabs mod-visible">');
      }
      fs.writeFileSync(FIXTURE, html);
      await page.goto(pathToFileURL(FIXTURE).href + "?mobile=" + variant.id, { waitUntil: "load" });
      await page.waitForTimeout(150);

      if (variant.theme && (device.id === "phone-390" || device.id === "tablet-768")) {
        await page.screenshot({ path: path.join(OUT, "mobile-" + device.id + "-" + variant.id + ".png") });
      }

      const m = await page.evaluate(collect);
      m.pageErrors = pageErrors;

      /* 「手机字号微调」旋钮的连通性：Style Settings 写的是 --my-mobile-font-delta，
       * 主题侧必须真的读它。这里手写该变量再量一次字号——出现「设置项存在但没人读」
       * 是这类主题最常见的静默失效，所以把它变成断言而不是信任。 */
      if (variant.id === "moyun-dark" && device.kind === "phone") {
        await page.evaluate(() => document.body.style.setProperty("--my-mobile-font-delta", "2px"));
        const bumped = await page.evaluate(collect);
        m.knobBase = m.fontSize;
        m.knobBumped = bumped.fontSize;
      }
      /* 图表在手机上的两种模式都要量：默认「原始尺寸 + 可横向滑动」，
       * 设置项 my-mobile-diagram-fit 打开后「缩放进屏」（回到老行为）。 */
      if (variant.id === "moyun-dark" && device.kind !== "desktop") {
        await page.evaluate(() => document.body.classList.add("my-mobile-diagram-fit"));
        const fitted = await page.evaluate(collect);
        m.diagramFitWidth = fitted.wideSvg;
        m.diagramFitScrollable = fitted.wideScrollable;
        await page.evaluate(() => document.body.classList.remove("my-mobile-diagram-fit"));
      }
      results[variant.id] = m;

      console.log(
        "  · " + variant.label.padEnd(18) +
        " 字号 " + fmt(m.fontSize, 1) + "px" +
        " | 行高 " + fmt(m.lineHeight, 1) +
        " | 版心 " + m.contentWidth + "px" +
        " | 每行 " + fmt(m.charsPerLine, 1) + " 字" +
        " | 一屏 " + fmt(m.linesPerScreen, 1) + " 行(" + m.hostSel + " " + m.hostHeight + "px)" +
        " | 溢出 " + m.overflow + "px"
      );
      if (m.offenders.length) {
        for (const o of m.offenders) {
          console.log("      右侧越界: " + o.sel + "  right=" + o.right + " width=" + o.width);
        }
      }
      if (m.bleedLeftCount) {
        console.log("      左侧贴边溢出（信息，不计失败）: " + m.bleedLeftCount + " 个，最小 left=" + m.bleedLeft[0].left);
      }
      await context.close();
    }

    const base = results["vanilla-dark"];
    report.devices[device.id] = { device: device, results: results };

    for (const id of ["moyun-dark", "moyun-light"]) {
      const m = results[id];
      const tag = device.id + " / " + id;

      assert(m.overflow <= 1, tag + " 手机视口无横向溢出", "溢出 " + m.overflow + "px");
      /* 溢出分两级判定：
       *   手机/平板 —— 主题不许有任何越界元素（横向溢出的代价在窄屏上最高）；
       *   桌面    —— 只要求「不比原生更差」，因为验证台的静态 DOM 本身就会让
       *             侧栏文件树出现 2 处越界（不是主题造成的，已与原生基线对比确认）。 */
      if (device.kind === "desktop") {
        assert(m.offenderCount <= base.offenderCount,
          tag + " 未引入新的越界元素（≤ 原生基线）",
          "原生 " + base.offenderCount + " 个 → 主题 " + m.offenderCount + " 个");
      } else {
        assert(m.offenderCount === 0, tag + " 无元素越出视口（可滚动容器除外）",
          m.offenderCount ? m.offenderCount + " 个，最宽 " + m.offenders[0].sel : "0 个");
      }
      /* 桌面端的自适应字号是刻意功能（宽屏放大 +6px 封顶），
       * 移动端则必须与原生一致：窄屏上任何放大都是纯粹的损失。 */
      if (device.kind === "desktop") {
        assert(m.fontSize <= base.fontSize + 6.5,
          tag + " 宽屏自适应字号在上限内（≤ 原生 +6.5px）",
          "原生 " + fmt(base.fontSize, 1) + "px → 主题 " + fmt(m.fontSize, 1) + "px");
      } else {
        assert(m.fontSize <= base.fontSize * 1.02 + 0.05,
          tag + " 移动端正文没有被主题放大",
          "原生 " + fmt(base.fontSize, 1) + "px → 主题 " + fmt(m.fontSize, 1) + "px");
      }
      /* 一屏行数：主题把中文行高从原生的 1.5 提到 1.8（中文排版刻意的取舍），
       * 行数必然少于原生，因此这里断言的是【绝对下限】而不是「不劣于原生」——
       * 否则等于要求主题放弃中文行高。 */
      const floor = device.kind === "phone" ? 26 : 30;
      assert(m.linesPerScreen >= floor,
        tag + " 一屏行数不低于 " + floor + " 行（含界面元素前）",
        "原生 " + fmt(base.linesPerScreen, 1) + " → 主题 " + fmt(m.linesPerScreen, 1) +
        "（行高 " + fmt(base.lineHeight, 1) + " → " + fmt(m.lineHeight, 1) + "）");
      assert(m.contentWidth <= device.width,
        tag + " 版心不超过视口宽度",
        m.contentWidth + " ≤ " + device.width);
    }

    const mine = results["moyun-dark"];
    if (mine.knobBase && device.kind === "phone") {
      assert(Math.abs((mine.knobBumped - mine.knobBase) - 2) < 0.15,
        device.id + " 「手机字号微调」旋钮接通（+2px 生效）",
        "字号 " + fmt(mine.knobBase, 1) + "px → " + fmt(mine.knobBumped, 1) + "px");
    }
    /* 移动端正文的文本自动放大开关：Obsidian 自己在 body.is-mobile 上写了
     * -webkit-text-size-adjust: 100%（见 app.css:18884），主题不得把它关掉或漏掉。
     * body 的计算值才是生效值，html 上永远是默认 auto。 */
    /* 桌面端 Obsidian 本来就不声明它（实测 auto），这条契约只对移动端成立。 */
    if (device.kind !== "desktop") {
      assert(String(mine.textSizeAdjustBody).replace(/\s/g, "") === "100%",
        device.id + " text-size-adjust 生效值 = 100%",
        "body " + mine.textSizeAdjustBody + " / html " + mine.textSizeAdjustHtml);
    }
    assert(mine.touchAction !== "none",
      device.id + " 未用 touch-action 吃掉手势", "body touch-action = " + mine.touchAction);
    /* 手机屏上标题最容易「一看就很大」。这里用【相对正文的倍数】而不是与原生比：
     * 公文模式（验证台默认开启）本来是刻意用 2em 的标题，与原生 1.618em 不可比；
     * 真正要守住的移动端契约是「标题不许超过正文的 1.9 倍」。 */
    if (device.kind !== "desktop") {
      const limits = { h1: 1.9, h2: 1.6, h3: 1.4, h4: 1.3 };
      for (const h of Object.keys(limits)) {
        const t = mine.headings[h];
        if (!t) continue;
        const ratio = t / mine.fontSize;
        assert(ratio <= limits[h], device.id + " " + h + " ≤ 正文 " + limits[h] + " 倍",
          "实测 " + fmt(ratio, 2) + " 倍（" + fmt(t, 1) + "px / 正文 " + fmt(mine.fontSize, 1) + "px）");
      }
      /* 版面留白：桌面 40px 的上下留白在手机上等于白扔两行，这里守住 16px。 */
      assert(mine.sizerPaddingTop >= 0 && mine.sizerPaddingTop <= 20,
        device.id + " 版心上下留白收敛（≤ 20px）", "实测 " + fmt(mine.sizerPaddingTop, 1) + "px");

      /* 图表可读性（手机端核心契约）：900px 的图不许被压扁到版心宽度以内，
       * 必须保持原始尺寸并允许横向滑动；打开设置项后才允许缩放进屏。 */
      assert(mine.wideSvg >= 880,
        device.id + " 宽图不被压扁（保持原始尺寸 ~900px）",
        "版心 " + mine.wideBox + "px，图渲染 " + mine.wideSvg + "px");
      assert(mine.wideScrollable === true,
        device.id + " 宽图容器可横向滑动",
        "scrollWidth > clientWidth = " + mine.wideScrollable);
      /* 白板（Canvas）卡片里的策略相反：缩放进屏，因为缩放能力在画布那边。 */
      assert(mine.canvasSvg > 0 && mine.canvasSvg <= mine.canvasBox + 2,
        device.id + " Canvas 卡片里的图缩放进屏（放大交给画布缩放）",
        "卡片 " + mine.canvasBox + "px，图渲染 " + mine.canvasSvg + "px");
      if (typeof mine.diagramFitWidth === "number") {
        assert(mine.diagramFitWidth <= mine.wideBox + 2,
          device.id + " 设置项「图表缩放进屏」生效（图收进版心）",
          "图渲染 " + mine.diagramFitWidth + "px ≤ 版心 " + mine.wideBox + "px");
      }
    }
    if (device.kind === "phone") {
      assert(mine.charsPerLine >= 14,
        device.id + " 每行可容纳的汉字数达标（≥14）", fmt(mine.charsPerLine, 1) + " 字/行");
    }
    for (const id of ["moyun-dark", "moyun-light"]) {
      assert(!results[id].pageErrors.length, device.id + " / " + id + " 无页面脚本错误",
        results[id].pageErrors.slice(0, 2).join(" | ") || "无");
    }

  }
} finally {
  await browser.close();
}

fs.rmSync(FIXTURE, { force: true });
fs.writeFileSync(path.join(OUT, "mobile-report.json"), JSON.stringify(report, null, 2));
const failed = findings.filter((f) => !f.ok);
console.log("\n断言 " + (findings.length - failed.length) + "/" + findings.length + " 通过");
console.log("报告：tools/preview/out/mobile-report.json");
if (failed.length) {
  console.log("\n未通过：");
  for (const f of failed) console.log("  ✗ " + f.label + (f.detail ? " — " + f.detail : ""));
  process.exit(1);
}
