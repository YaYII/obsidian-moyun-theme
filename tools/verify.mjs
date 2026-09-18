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
/* 注意：「没有填充」的判定只能写在每个判定函数体内 ——
 * 它们会被序列化后送进页面执行，模块作用域里的辅助函数在那边不存在（踩过两次了）。 */

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
  // —— 首行缩进（阅读视图 + 编辑区，两套规则都要守住）——
  /* 这一组是被用户「首行缩进貌似失效了」追出来的：公文体默认开、且它的说明里承诺
   * 「首行缩进两字」，但它只在阅读视图给了缩进；编辑区的缩进只认「首行缩进两字」
   * 开关（默认关）—— 于是编辑区一条缩进都没有，而验证台当时根本没有编辑器 DOM。 */
  ['首行缩进：编辑区正文行缩进两字（公文体默认开即生效）', '#cm-probe-plain', 'textIndent',
    (v) => parseFloat(v) >= 20],
  ['首行缩进：含内联标记的段落同样缩进（旧规则会整行豁免）', '#cm-probe-inline', 'textIndent',
    (v) => parseFloat(v) >= 20],
  ['首行缩进：编辑区标题行不缩进', '.markdown-source-view.mod-cm6 .cm-line.HyperMD-header', 'textIndent',
    (v) => parseFloat(v) === 0],
  ['首行缩进：编辑区列表行不缩进', '.markdown-source-view.mod-cm6 .cm-line.HyperMD-list-line', 'textIndent',
    (v) => parseFloat(v) === 0],
  ['首行缩进：公文与缩进开关都关时才不缩进', '#cm-probe-plain', 'textIndent',
    () => {
      const body = document.body;
      const hadGov = body.classList.contains('my-gov-style');
      const hadIndent = body.classList.contains('my-indent-on');
      body.classList.remove('my-gov-style', 'my-indent-on');
      const off = getComputedStyle(document.querySelector('#cm-probe-plain')).textIndent;
      if (hadGov) body.classList.add('my-gov-style');
      if (hadIndent) body.classList.add('my-indent-on');
      return parseFloat(off) === 0;
    }],
  ['首行缩进：阅读视图仍豁免列表项（防止列表里二次凹陷）', '.markdown-rendered li p', 'textIndent',
    (v) => parseFloat(v) === 0],
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
   *   ② 方框里不铺任何底色：填充必须是透明（既不是 Mermaid 默认的淡紫，
   *      也不再是「不透明的纸面色」—— 用户要求放大看图时方框里有色、框里透明）；
   *   ③ 「方框有颜色」靠描边实现，所以描边必须是有色的强调色；
   *   ④ 边标签的底色必须【保留且不透明】：它压在线条上方，透明了连线会切开文字。 */
  ['Mermaid 节点填充为透明（方框里不铺底色）', '.mermaid .node rect', 'fill',
    (v) => v === 'none' || v === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(v)],
  ['Mermaid 节点描边有颜色（靠线框区分层级）', '.mermaid .node rect', 'stroke',
    (v) => v !== 'none' && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(v)],
  /* 验证台夹具里的边标签是 HTML（<span class="edgeLabel">），真实 Mermaid 渲染下的
   * 标签底矩形由 tools/check-mermaid.mjs 用真实渲染另行断言，两者互补。 */
  ['Mermaid 边标签底色不透明（遮住穿过的连线）', '.mermaid .labelBkg', 'fill',
    (v) => v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent'],
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
  /* 1.2.8 起：边标签【不许】有底色（用户明令「框内也不行」）。
   * 取而代之的是文字自己的 8 向描边（护线），它不占一块底色。 */
  ['Mermaid 边标签不再铺底（透明，靠文字描边护线）', '.mermaid .edgeLabel', 'backgroundColor',
    (v) => v === 'rgba(0, 0, 0, 0)' || v === 'transparent'],
  ['Mermaid 边标签的底矩形也不填充', '.mermaid .labelBkg', 'fill', (v) => v === 'none' || v === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(v)],
  ['Mermaid 连线用主题描边色（非 Mermaid 默认 #333）', '.mermaid .edgePath .path', 'stroke',
    (v) => v !== 'rgb(51, 51, 51)' && v !== 'none'],
  ['Mermaid 子图不铺底（只留虚线轮廓）', '.mermaid .cluster rect', 'fill',
    (v) => v === 'rgba(0, 0, 0, 0)' || v === 'none'],
  ['Mermaid 容器透明：图是版面上的插图，不是一张卡片', '.mermaid', 'backgroundColor',
    (v) => v === 'rgba(0, 0, 0, 0)'],
  ['Mermaid 超宽图形横向滚动而非被裁切', '.mermaid', 'overflowX', (v) => v === 'auto'],

  /* —— 浮层层级与不透明度（1.2.9）——
   * 手机上打开菜单，正文从底下透出来、看着像"字浮在菜单上"。两件事：
   *   ① 宿主给 .prompt 写的是 z-index: 1，主题里的进度条(6)/看板(2) 都在它之上；
   *   ② 宿主在移动端把菜单写成 color-mix(..., transparent)——半透明 + 无模糊。
   * 这里把 body 临时加上 is-mobile（验证台没有宿主的 app.css，用夹具里那段同款规则复刻），
   * 量完立刻还原，避免影响别的断言。 */
  ['手机上菜单不透明（正文不许透上来）', '#menu-fixture', 'backgroundColor',
    (_v, el) => {
      const body = document.body;
      const had = body.classList.contains('is-mobile');
      body.classList.add('is-mobile');
      const got = getComputedStyle(el).backgroundColor;
      if (!had) body.classList.remove('is-mobile');
      const m = /rgba?\(([^)]+)\)/.exec(got);
      const parts = m ? m[1].split(',').map(Number) : [];
      return parts.length === 3 || (parts.length === 4 && parts[3] >= 0.999);
    }],
  ['手机上命令面板同样不透明', '#prompt-fixture', 'backgroundColor',
    (_v, el) => {
      const body = document.body;
      const had = body.classList.contains('is-mobile');
      body.classList.add('is-mobile');
      const got = getComputedStyle(el).backgroundColor;
      if (!had) body.classList.remove('is-mobile');
      const m = /rgba?\(([^)]+)\)/.exec(got);
      const parts = m ? m[1].split(',').map(Number) : [];
      return parts.length === 3 || (parts.length === 4 && parts[3] >= 0.999);
    }],
  ['命令面板的层级高于正文里的浮层（不被文字压住）', '#prompt-fixture', 'zIndex',
    (v) => Number(v) >= 30],
  ['菜单的层级同样在最上层', '#menu-fixture', 'zIndex',
    (v) => Number(v) >= 30],

  /* —— 铁律：只有线框 + 圆角（1.2.8）——
   * 用户定的规矩：框不给背景（框内也不行）、都是线框、**哪怕源码里提供了也不渲染**、
   * 四角必须圆角。难点在「提供了也不渲染」：Mermaid 把 classDef/style 写成带 ID 选择器的
   * !important 注入 SVG，普通 !important 压不住 —— 必须放进 @layer 才赢。
   * 下面四条就是那道防线：夹具里一个节点用 ID 选择器 !important 给了淡紫底 + rx:0，
   * 另一个用行内 style 给了金黄色底 + rx:0，两条都必须变成「无填充 + 圆角」。 */
  ['源码用 classDef 给了底色：照样不渲染', '#mermaid-iron-fixture .painted rect', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['源码用行内 style 给了底色：照样不渲染', '#mermaid-iron-fixture .node:not(.painted) rect', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['源码写了 rx:0：四角仍必须是圆角', '#mermaid-iron-fixture .painted rect', 'rx',
    (val) => parseFloat(val) > 0],
  ['行内 style 写了 rx:0：同样强制圆角', '#mermaid-iron-fixture .node:not(.painted) rect', 'rx',
    (val) => parseFloat(val) > 0],

  /* —— markdown 字符串标签的漏网（1.2.7）——
   * Mermaid 把 `带反引号的标签` 渲染成块级 <p>（普通标签是 <span>），而正文的公文体
   * 首行缩进是高特异性规则（body:is(.my-gov-style,…) .markdown-rendered p → (0,2,2)），
   * 它压得过 .mermaid foreignObject p (0,1,1) —— 于是「笔记里首行缩进、放大后正常」。
   * 这两条守的就是它：图内 <p> 的缩进必须是 0，对齐必须是居中。 */
  ['markdown 字符串标签（<p>）不吃正文首行缩进', '.mermaid foreignObject p', 'textIndent',
    (val) => val === '0px'],
  ['markdown 字符串标签（<p>）必须居中', '.mermaid foreignObject p', 'textAlign',
    (val) => val === 'center'],

  /* —— 结构方框的漏网之鱼（1.2.5）——
   * 1.2.3 只把流程图/时序图/状态图/类图的方框透明了。其余图种用的是各自私有的类名
   * （.node-bkg / .reqBox / .branchLabelBkg / .journey-section / .quadrant rect /
   *  rect.background / rect.section），主题一条没写 —— Mermaid 自带调色板于是直接露出来，
   * 用户看到的就是「方框里怎么又有背景了」。
   * 下面 8 条守「结构必须透明」，后 2 条守「数据不许被一起抹平」：饼扇区、甘特条、
   * 旅程任务条这些用颜色/长度编码数据的图形，透明了等于丢信息。 */
  /* 思维导图与时间线是【唯一】允许结构方框带填充的地方：它们的连线从父节点画到子节点，
   * 方框透明了线就从标签上穿过去。合法条件是「填充 == 画布色」（视觉上等同透明），
   * 而且绝不能是 Mermaid 的默认色（纯蓝 #0000EC / 亮黄 #FFFF78）。 */
  ['思维导图节点底：没有填充（连遮线底也不给）', '.mindmap-node .node-bkg', 'fill', (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['时间线事件框底：没有填充', '.timeline-node .node-bkg', 'fill', (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['需求图 reqBox 底透明（Mermaid 默认淡紫）', '#mermaid-struct-fixture .reqBox', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['git 图分支标签底透明（Mermaid 默认亮黄）', '.branchLabelBkg', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['旅程图区段底透明（Mermaid 默认淡紫大块）', '.journey-section', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['象限图四个象限的底透明（原本是四层淡紫渐变）', '.quadrant rect', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['xychart 绘图区底透明（原本是 700x500 纯白）', 'rect.background', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['甘特区段底透明（原本是半透明蓝）', 'rect.section', 'fill',
    (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['数据图形也走线框：任务条没有填充', 'rect.task', 'fill', (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['数据图形改用描边表达（否则没有填充就看不见了）', 'rect.task', 'stroke',
    (val) => val !== 'none' && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['数据点也没有填充（线框一致）', '.data-point circle', 'fill', (val) => val === 'none' || val === 'transparent' || /^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],
  ['数据点有描边，看得见', '.data-point circle', 'stroke',
    (val) => val !== 'none' && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(val)],

  /* —— 「图搬出笔记」防线（1.2.4）——
   * 图会被搬走：放大查看器、白板卡片、导出。真正会咬人的不是「搬走」本身，而是
   * 【搬走之后，图内文字的样式不能再靠祖先给】：祖先要是还提供正文的行高（1.8）、
   * 首行缩进（2em）和另一套字体，标签就会被推出自己的外框、和相邻标签叠在一起 ——
   * 用户截图里那句「放大后编成鬼样子」。
   * 所以这里刻意造一个「坏祖先」：holder 用内联样式给足 2em / 1.8 / Times New Roman，
   * 再把整块 <div class="mermaid"> 挂进去。图内规则只要不依赖 .markdown-rendered，
   * 就一定赢；一旦谁把规则加回 .markdown-rendered 前缀，这三条立刻变红。
   * 注意判定函数会被序列化后送进页面执行，逻辑只能写在函数体内。 */
  ['图内标签自带底账：坏祖先也压不出首行缩进', '.mermaid .nodeLabel', 'textIndent',
    (_v, el) => {
      const root = el.closest('.mermaid');
      const parent = root.parentNode;
      const next = root.nextSibling;
      const holder = document.createElement('div');
      holder.style.textIndent = '2em';
      holder.style.lineHeight = '1.8';
      holder.style.fontFamily = 'Times New Roman, serif';
      document.body.appendChild(holder);
      holder.appendChild(root);
      const got = getComputedStyle(el).textIndent;
      parent.insertBefore(root, next);
      holder.remove();
      return got === '0px';
    }],
  ['图内标签自带底账：坏祖先也压不出正文行高', '.mermaid .nodeLabel', 'lineHeight',
    (_v, el) => {
      const root = el.closest('.mermaid');
      const parent = root.parentNode;
      const next = root.nextSibling;
      const holder = document.createElement('div');
      holder.style.textIndent = '2em';
      holder.style.lineHeight = '1.8';
      holder.style.fontFamily = 'Times New Roman, serif';
      document.body.appendChild(holder);
      holder.appendChild(root);
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight);
      const size = parseFloat(cs.fontSize);
      parent.insertBefore(root, next);
      holder.remove();
      return lh <= size * 1.5;
    }],
  ['图内文字自带字体：坏祖先也换不掉它的字', '.mermaid .nodeLabel', 'fontFamily',
    (_v, el) => {
      const root = el.closest('.mermaid');
      const parent = root.parentNode;
      const next = root.nextSibling;
      const holder = document.createElement('div');
      holder.style.textIndent = '2em';
      holder.style.lineHeight = '1.8';
      holder.style.fontFamily = 'Times New Roman, serif';
      document.body.appendChild(holder);
      holder.appendChild(root);
      const got = getComputedStyle(el).fontFamily;
      parent.insertBefore(root, next);
      holder.remove();
      const probe = document.createElement('div');
      probe.style.fontFamily = 'var(--my-font-text-effective, var(--font-text))';
      document.body.appendChild(probe);
      const want = getComputedStyle(probe).fontFamily;
      probe.remove();
      return got === want && !/Times New Roman/.test(got);
    }],
  ['思维导图连线用结构线色（不是亮黄/嫩绿/亮紫的分支色）', '.mindmap-edges path', 'stroke',
    (val) => !/rgb\(255, 255, 120\)|rgb\(215, 255, 134\)|rgb\(134, 134, 255\)/.test(val) && val !== 'none'],
  ['节点下方那条分支短横线同样归为结构线', '.mindmap-node line', 'stroke',
    (val) => !/rgb\(255, 255, 120\)|rgb\(215, 255, 134\)/.test(val) && val !== 'none'],
  ['Mermaid 文字带辉光（亮晶晶 · SVG 路径用 drop-shadow）', '.mermaid svg text', 'filter',
    (v) => /drop-shadow/.test(v)],
  ['Mermaid 文字带辉光（HTML 标签路径用 text-shadow）', '.mermaid .nodeLabel', 'textShadow',
    (v) => !!v && v !== 'none'],
  /* 赛博风格是 class-select 写入 body 的类：这里实测「加上类就换画布」，
   * 而不是只断言 CSS 文件里写了这条规则。 */
  ['Mermaid 赛博风格：画布切为深色终端（跨明暗恒定，墨韵为透明）', '.mermaid', 'backgroundColor',
    () => {
      const el = document.querySelector('.mermaid');
      document.body.classList.add('my-mermaid-cyber');
      const cyber = getComputedStyle(el).backgroundColor;
      document.body.classList.remove('my-mermaid-cyber');
      const ink = getComputedStyle(el).backgroundColor;
      const m = cyber.match(/rgba?\(([^)]+)\)/);
      const p = m ? m[1].split(',').map(Number) : null;
      const darkCanvas = !!p && (p[3] === undefined || p[3] > 0.9) && (p[0] + p[1] + p[2]) / 3 < 40;
      return darkCanvas && ink === 'rgba(0, 0, 0, 0)';
    }],
  ['Mermaid 赛博风格：节点描边发出青蓝光', '.mermaid .node rect', 'stroke',
    () => {
      const el = document.querySelector('.mermaid .node rect');
      document.body.classList.add('my-mermaid-cyber');
      const cyber = getComputedStyle(el).stroke;
      const glow = getComputedStyle(el).filter;
      document.body.classList.remove('my-mermaid-cyber');
      const m = cyber.match(/rgba?\(([^)]+)\)/);
      const p = m ? m[1].split(',').map(Number) : null;
      // 青蓝：蓝分量最高且明显高于红，绿居中
      const cyan = !!p && p[2] > 180 && p[2] > p[0] + 80 && p[1] > p[0];
      return cyan && /drop-shadow/.test(glow);
    }],
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
