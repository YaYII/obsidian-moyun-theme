# Obsidian 专业中文排版 CSS 技术方案（实测验证版）

> **实测环境**：Obsidian **1.13.7**（Electron **43.3.0** / Chromium **150.0.7871.212**，Wayland，`--no-sandbox`）
> **代理测试浏览器**：Google Chrome **151.0.7922.71**（比 Obsidian 内嵌 Chromium 高 1 个大版本，结论可直接外推）
> **验证库**：MDN browser-compat-data（main 分支）+ 本机 Playwright/CDP 真实渲染测量
> 所有带「实测」字样的数字均为本机真实渲染测量值，非记忆推断。

---

## 0. 先看结论：一张决策表

| 需求 | 推荐方案 | Chromium 150 支持 | 备注 |
|---|---|---|---|
| 首行缩进 2 字符 | `text-indent: 2em` | ✅ | **绝不要用 `2ch`**（实测偏小 45%） |
| 中英文自动间距 | `text-autospace: normal` | ✅ 140+ | **必须显式开启**（初始值是 `no-autospace`） |
| 精细间距控制 | `ideograph-alpha` / `punctuation` / `insert` / `replace` | ❌ | Chromium 未实现，JS 兜底 |
| 标点挤压 | `text-spacing-trim` | ⚠️ 能解析但**对中文字体无效** | 用 `font-feature-settings:"halt"` 替代 |
| 标点避头尾 | **默认已生效，无需 CSS** | ✅ | `line-break: strict` 意义有限 |
| 悬挂标点 | `hanging-punctuation` | ❌ Chromium 永久不支持 | 只能 JS 或放弃 |
| 孤字/尾行优化 | `text-wrap: pretty` | ✅ 117+ | 实测对中文生效 |
| 词组换行 | `word-break: auto-phrase` | ⚠️ **仅日文** | 中文实测无效果 |
| 中英文字体分流 | `font-family` 顺序 | ✅ | 实测验证；`unicode-range` 更可控 |
| 两端对齐 | `text-align: justify` | ✅ | 中文下**推荐**，但需配 `text-justify` |
| 竖排 | `writing-mode: vertical-rl` | ✅ | `text-combine-upright` 支持 |

---

## 1. 中文首行缩进 2 字符

### 1.1 `2em` vs `2ch`：实测数据决定答案

在 `font-size: 16px`、`Noto Sans CJK SC` 下实测：

| 单位 | 实测值 | 换算成汉字 | 结论 |
|---|---|---|---|
| 1 个汉字宽度 | **16.0156px** | 1.000 字 | 汉字 = 1em（全角） |
| 1 个 `0` 数字宽度（`ch`） | **8.89px** | 0.555 字 | `ch` 是西文度量 |
| `text-indent: 2em` | **32px** | **2.000 字** ✅ | **正确** |
| `text-indent: 2ch` | **17.77px** | **1.110 字** ❌ | 少了近一半 |
| `text-indent: 2rem` | 32px | 2.000 字 | 巧合正确，但随根字号漂移 |

**结论**：
- `2em` = 2 × font-size = 2 个全角汉字宽度 → **中文首行缩进的唯一正确写法**。
- `2ch` 的 `ch` 定义为「数字 0 的宽度」，是**拉丁文字中心主义的单位**，在 CJK 上下文中只有 1.11 个汉字宽，视觉上明显缩进不足。
- `2rem` 只在「根字号 == 正文字号」时碰巧正确；Obsidian 用 `--font-text-size`（默认 16px）控制正文，与根 `rem` 解耦，**改字号后 `2rem` 会错位**。

> ⚠️ **注意**：`2em` 跟随元素自身的 `font-size`。若你给某段设置了不同的 `font-size`，缩进会自动按比例缩放 —— 这正是我们想要的行为。

### 1.2 哪些元素该缩进、哪些不该

**该缩进**：正文段落 `p`（包括多段连续文字）。

**不该缩进**（实测 `text-indent: 0` 生效）：

| 元素 | 原因 |
|---|---|
| 标题 `h1`–`h6` | 标题不缩进是中文排版规范 |
| 列表 `ul/ol/li` | 已有项目符号的悬挂缩进，再缩进会错位 |
| 引用 `blockquote` | 已有左边框/内边距作为视觉层次 |
| 代码 `pre/code` | 代码首行缩进会破坏可复制性与语义 |
| 表格 `table` | 单元格内缩进破坏对齐 |
| 数学块 `mjx-container` / `.math` | 公式居中，缩进会偏移 |
| 嵌入块 `.internal-embed` / `.markdown-embed` | 子文档自带排版 |
| 图片段落 `p:has(img)` | 图片居中，缩进会偏心 |
| Frontmatter / 元数据 | `.frontmatter` / `.metadata-container` |
| Callout 内容 | `.callout` 自带层次 |
| 空行占位 | `p:has(> br:only-child)` |

**实测验证**（Chromium 151，`font-size:20px`）：

```
indents: { para: 32px ✅, li: 0 ✅, blockquote>p: 0 ✅ }
```

### 1.3 阅读视图 CSS（阅读模式 / 导出 PDF）

```css
/* ========== 阅读视图首行缩进 ========== */
/* 只缩进正文段落，其他元素一律归零 */
.markdown-rendered p,
.markdown-preview-view p {
  text-indent: 2em;   /* 2em = 2 个全角汉字，实测 32px @16px 字号 */
}

/* 排除清单：用 :is() 一次归零，权重低、易被覆盖 */
.markdown-rendered :is(h1, h2, h3, h4, h5, h6,
                       ul, ol, li,
                       blockquote,
                       pre, code,
                       table, th, td,
                       .callout, .callout-content,
                       .internal-embed, .markdown-embed, .markdown-embed-content,
                       .frontmatter, .metadata-container,
                       mjx-container, .math, .math-block,
                       hr, .el-embed, .cm-embed-block),
.markdown-preview-view :is(h1, h2, h3, h4, h5, h6,
                           ul, ol, li, blockquote, pre, code,
                           table, th, td, .callout,
                           .internal-embed, .markdown-embed,
                           mjx-container, .math, .math-block) {
  text-indent: 0;
}

/* 段落里只要含图片/嵌入，就不缩进（图片应居中） */
.markdown-rendered p:has(img),
.markdown-rendered p:has(.internal-embed) {
  text-indent: 0;
}

/* 全空段落（只有一个 <br>）不缩进，避免出现孤立缩进空格 */
.markdown-rendered p:has(> br:only-child) {
  text-indent: 0;
}
```

> **兼容性**：`text-indent` 自 CSS1 起全支持；`:is()` Chrome 88+、`:has()` **Chrome 105+**（实测 `CSS.supports('selector(:has(p))') === true`）。Obsidian Chromium 150 完全支持，无需前缀。

### 1.4 实时预览（Live Preview）与源码模式的差异 ⚠️ 关键

实时预览是 **CodeMirror 6**，结构完全不同：

- **每个逻辑行是一个 `.cm-line` 元素**（软换行的视觉行仍属同一个 `.cm-line`）。
- 因此 `text-indent` 作用在 `.cm-line` 上 = **每段缩进一次**，正好符合预期（实测确认 `text-indent` 只影响块的第一行）。
- **但** `.cm-line` 同时承载了标题、列表、代码、引用、表格等所有行类型，必须用 `.HyperMD-*` 类排除。

实测确认：`text-indent: 2em` 在块内**只影响第一行**（首行 left=40px，第二行 left=0），所以对 `.cm-line` 用法正确。

```css
/* ========== 实时预览 / 源码模式首行缩进 ========== */
.markdown-source-view.mod-cm6 .cm-line {
  text-indent: 2em;
}

/* 排除所有非正文行（实测这些类名均存在于 Obsidian 1.13 app.css） */
.markdown-source-view.mod-cm6 .cm-line:is(
  .HyperMD-header, .HyperMD-header-1, .HyperMD-header-2, .HyperMD-header-3,
  .HyperMD-header-4, .HyperMD-header-5, .HyperMD-header-6,
  .HyperMD-list-line, .HyperMD-list-line-nobullet,
  .HyperMD-quote,
  .HyperMD-codeblock,
  .HyperMD-table-row, .HyperMD-table-row-1, .HyperMD-table-row-2,
  .HyperMD-hr,
  .HyperMD-footnote,
  .cm-embed-block,
  .cm-hmd-frontmatter
) {
  text-indent: 0;
}

/* 列表/引用内的续行也不缩进 */
.markdown-source-view.mod-cm6 .cm-line.HyperMD-list-line,
.markdown-source-view.mod-cm6 .cm-line.HyperMD-quote {
  text-indent: 0 !important;
}
```

> **源码模式**：`.markdown-source-view` 不带 `.mod-cm6` 时是旧编辑器；Obsidian 1.13 下源码模式**同样**是 CM6（`.mod-cm6` 出现 191 次），所以上面的规则在两处都生效。
> **注意**：源码模式下你会看到行首多了缩进但文本本身没变 —— 这是纯视觉缩进，**不会写回 Markdown 文件**，不影响 Git diff。这是 CSS 方案相对「真加全角空格」的最大优势。

### 1.5 为什么不用 `::first-letter` 技巧

社区流传 `p::first-letter { margin-left: 2em }`。实测它**确实能产生 2em 位移**（`font-size:20px` 时首字符 left = 40px），但有三个硬伤：

1. **规范规定 `::first-letter` 包含前导标点**（CSS Pseudo-Elements L4）。段落以 `「` 开头时，`::first-letter` 会吃掉 `「`，缩进作用点与预期不符。
2. **CodeMirror 实时预览中段落文本节点会被切分**（语法高亮把 `**粗体**` 拆成多个 span），`::first-letter` 只作用于第一个内联盒，行为不确定。
3. **无法针对「段落」语义**：`.cm-line` 上的 `::first-letter` 会命中列表符号、标题 `#` 等。

**结论**：`text-indent` 语义正确、无副作用，是唯一推荐方案。

---

## 2. 中英文自动间距

### 2.1 `text-autospace`：实测支持现状（好消息 + 坏消息）

**MDN browser-compat-data 权威数据**：

| 关键字 | Chrome | Firefox | Safari |
|---|---|---|---|
| `normal` | **140** | 145 | 18.4 |
| `no-autospace` | **140** | 145 | 18.4 |
| `ideograph-alpha` | ❌ 未实现（crbug 429178779） | 145 | 18.4 |
| `ideograph-numeric` | ❌ 未实现 | 145 | 18.4 |
| `punctuation` | ❌ 未实现 | ❌（bugzil 1986500） | ❌ |
| `insert` | ❌ 未实现 | 145 | 27 |
| `replace` | ❌ 未实现 | ❌（bugzil 1980111） | ❌ |
| `auto` | ❌ 未实现 | 145 | 18.4 |

**Baseline 状态**：MDN 标记为 **Baseline 2025「Newly available」**（2025 年 11 月起跨最新浏览器可用）。

**本机 Chromium 151 实测 `CSS.supports`**：

```
text-autospace:normal              -> true   ✅
text-autospace:no-autospace        -> true   ✅
text-autospace:ideograph-alpha     -> false  ❌
text-autospace:ideograph-numeric   -> false  ❌
text-autospace:punctuation         -> false  ❌
text-autospace:insert              -> false  ❌
text-autospace:replace             -> false  ❌
text-autospace:auto                -> false  ❌
```

**实测间距宽度**（字号 20px，`Noto Sans CJK SC`）：

| 文本 | `no-autospace` | `normal` | 差值 |
|---|---|---|---|
| `中a` | 31.27px | 33.77px | **+2.5px = 0.125em** |
| `中1` | 31.11px | 33.61px | **+2.5px** |
| `a中` | 31.27px | 33.77px | **+2.5px** |
| `中。` | 40px | 40px | **0（标点不加间距）** |
| `中 a`（已有空格） | 35.75px | 35.75px | **0（已有空格则不插入）** |

**三个关键结论**：

1. **插入宽度 = 1/8 em（0.125em）**，双向对称（CJK↔拉丁 与 拉丁↔CJK 都加）。
2. **已实现的行为等价于 `ideograph-alpha ideograph-numeric insert`** —— 拉丁字母和数字都加，标点不加，已有空格时不重复插入。
3. ⚠️ **初始值是 `no-autospace`，不是规范里的 `normal`**（Chromium/Firefox/Safari 三家一致偏离规范，见 csswg-drafts#12386）。实测确认：不写该属性时宽度 = `no-autospace` 的宽度。
   → **必须显式声明 `text-autospace: normal` 才会生效**，这是最容易踩的坑。

```css
/* ========== 中英文自动间距（Chromium 140+） ========== */
/* 注意：Chromium 的初始值是 no-autospace，必须显式开启 */
.markdown-rendered,
.markdown-preview-view,
.markdown-source-view.mod-cm6 .cm-content {
  text-autospace: normal;   /* = ideograph-alpha + ideograph-numeric，实测插入 0.125em */
}

/* 代码块内绝对不要自动间距（会破坏代码对齐与复制） */
.markdown-rendered :is(pre, code, pre code),
.markdown-source-view.mod-cm6 :is(.HyperMD-codeblock, .cm-inline-code) {
  text-autospace: no-autospace;
}

/* 表格内也建议关闭，避免列宽计算漂移 */
.markdown-rendered :is(table, th, td) {
  text-autospace: no-autospace;
}
```

> ⚠️ **注意事项**
> - 仅在 **Chromium 140+** 生效。Obsidian **Chromium 150 ✅ 可用**；但如果你把同样的 CSS 用于 Safari < 18.4 / Firefox < 145 的网页，会静默失效（不报错，只是没间距）—— 这属于优雅降级，可接受。
> - 由于不支持 `punctuation`，**中文标点周围的间距不会被处理**，需要靠字体自身的标点宽度（全角标点自带半角空白）。
> - `text-autospace` 是**排版级**间距，不是字符，因此**复制文本时不会带出多余空格** —— 相对 pangu.js 的核心优势。

### 2.2 JS 兜底方案对比

**方案 A：pangu.js（社区最成熟，npm `pangu@10.1.1`）**

原理：用正则在中日韩文字与半角字母/数字/符号之间**插入真实空格字符（U+0020）**。

```js
// 在 Obsidian 中需通过插件/Templater/dataviewjs 调用，纯 CSS 片段无法使用
// npm: pangu@10.1.1  —— 有 TypeScript 类型定义
const pangu = require('pangu');
pangu.spacingText('中文English混排123');   // => '中文 English 混排 123'
```

| 维度 | 评价 |
|---|---|
| 覆盖面 | ✅ 所有浏览器（纯 JS） |
| 副作用 | ❌ **会写入真实空格**，破坏原文、Git diff、复制内容、全文搜索 |
| 时机 | ❌ 需在渲染后跑，Obsidian 中每次编辑都要重跑，实时预览下会闪烁/回滚 |
| 适用 | 网页/静态站点；**不推荐用于 Obsidian 笔记**（会污染 Markdown 源文件） |

**方案 B：零宽字符 + `letter-spacing`（CSS-only 伪方案）**

用 `::before`/`::after` 或 JS 插入 U+2009（thin space）—— 同样污染源文件，且不推荐。

**方案 C：`text-autospace` + 字体自身标点宽度（推荐）**

即：**只做「0.125em 自动间距」，其余交给字体设计**。理由：
- 中文全角标点（`，。：；！？`）在 CJK 字体中本身就是全角宽度，标点左右自带的空白由字体设计师处理好了。
- 标点挤压的正确方案是 `text-spacing-trim` 或 `halt`，但见 §3。

**方案 D：`@supports` 渐进增强 + 不兜底**

```css
/* 只在支持的浏览器开启；不支持的浏览器保持原样（无间距但完全可读） */
@supports (text-autospace: normal) {
  .markdown-rendered, .markdown-preview-view { text-autospace: normal; }
}
```

> **实测建议**：Obsidian 场景下，**不要用 pangu.js**。它是为「别人的网页我改不了」设计的；你的笔记源文件你自己能控制，用 `text-autospace` 得到同样视觉效果且零污染。

---

## 3. 标点符号避头尾

### 3.1 最重要的发现：**Chromium 默认已经实现了避头尾**

实测方法：逐字符测量 `getBoundingClientRect().top`，精确判定每个渲染行的起始字符。

容器宽 200px、字号 20px，文本 `一二三四五六七八九。十`：

| `line-break` | 第 2 行起始字符 | 行起始索引 |
|---|---|---|
| `auto`（默认） | `十` | 10 |
| `loose` | `十` | 10 |
| `normal` | `十` | 10 |
| `strict` | `十` | 10 |
| `anywhere` | `十` | 10 |
| `word-break: break-all` | `十` | 10 |

**六种设置全部一致**：`。`（索引 9）始终留在第 1 行末尾，**从不让句号出现在行首** —— 这就是行头禁则（`。、，）】」` 不得起行）。

**结论**：**避头尾（行头禁则）由 Chromium 依据 UAX #14 默认强制执行，你不需要写任何 CSS。**

### 3.2 `line-break: strict` 的真实作用与局限

**MDN 兼容性**：`line-break: strict` —— Chrome **25+**、Firefox 69+、Safari 8+。Obsidian ✅。

`normal` 与 `strict` 的差异在于**行尾禁则的宽松度**（例如 `々`、`ー`、`・`、小写假名等能否出现在行尾/行首），对**纯中文正文**的实际差异很小。实测在同一测试文本下两者行断点完全相同。

> **建议**：中文笔记**不必设置** `line-break`。它会保留默认 `auto`，已经是最符合中文习惯的行为。

### 3.3 ⚠️ 千万不要用 `line-break: anywhere`

实测反例 —— 文本 `一二三四五六七八九（十）`：

| `line-break` | 第 2 行起始字符 |
|---|---|
| `auto`（默认） | `（` （索引 9） |
| `anywhere` | `十` （索引 10） |

`anywhere` 让断行发生在 `（` **之后**，导致 `（` 留在行尾 —— 这是**行尾禁则违规**（左括号不能出现在行末）。`anywhere` 会牺牲全部 CJK 排版规则换取「任意位置可断」，**只有处理超长 URL/无空格串时才用，且应限定在局部元素上**。

### 3.4 `hanging-punctuation`：Chromium **永久不支持**

**MDN 兼容性**：`hanging-punctuation` —— Chrome ❌ **从未实现**、Firefox ❌ 从未实现、Safari 10+（且 26.5 之前 `U+0027`/`U+0022` 引号不支持）。

**本机 Chromium 151 实测**：

```
hanging-punctuation:first      -> false ❌
hanging-punctuation:force-end  -> false ❌
hanging-punctuation:allow-end  -> false ❌
```

> **结论**：**悬挂标点（标点溢出到版心外）在 Obsidian 中无法实现**，不要浪费时间去试。它需要浏览器排版引擎级别的支持。
> **替代**：用 `text-align: justify` 或 `text-wrap: pretty` 改善行末观感（见 §5.4）。

### 3.5 `text-spacing-trim`：能解析，但**对中文字体是空操作**（重大坑）

**MDN 兼容性**：`text-spacing-trim` —— Chrome/Edge **123+**、Firefox ❌、Safari ❌，状态 **experimental**。

**本机 Chromium 151 实测 `CSS.supports`：全部 `true`**（`normal`/`space-all`/`space-first`/`trim-start`）。看起来可用。

**但实测渲染宽度（`「中」` @ 40px，Noto Sans CJK SC）：**

| 设置 | 实测宽度 | 是否生效 |
|---|---|---|
| 不设该属性 | 120px | 基准 |
| `text-spacing-trim: normal` | **120px** | ❌ 无变化 |
| `text-spacing-trim: space-all` | **120px** | ❌ 无变化 |
| `text-spacing-trim: trim-start` | **120px** | ❌ 无变化 |
| `text-spacing-trim: trim-start trim-end` | **120px** | ❌ 无变化 |
| `text-spacing-trim: space-first` | **120px** | ❌ 无变化 |
| `font-feature-settings: "halt" 1` | **80px** | ✅ **压缩生效** |

**根因（已通过解析 OpenType 表验证）**：

Chromium 的 `text-spacing-trim` 依赖字体的 **`chws`（Contextual Half-width Spacing）特性**。实测解析本机字体特性表：

```
NotoSansCJK-Regular.ttc   nfeat=27  chws=False  halt=True
   → calt ccmp fwid halt hwid kern liga locl palt pwid ruby vert vhal vpal vrt2
NotoSerifCJK-Regular.ttc  nfeat=27  chws=False  halt=True
WenQuanYi Zen Hei          nfeat= 0  chws=False  halt=False
```

**思源黑体 / 思源宋体（= Noto Sans/Serif CJK）有 `halt`、`palt`、`vpal`、`vhal`、`fwid`、`hwid`、`pwid`，但没有 `chws`。** 这就是 `text-spacing-trim` 失效的原因。

**可行替代：用 `halt` 压缩标点**（实测 120px → 80px，等效于把全角标点压成半角）：

```css
/* ========== 标点挤压：用 halt 替代无效的 text-spacing-trim ========== */
/* halt = Alternate Half Widths：把全角标点压缩为半角宽度（实测有效） */
.markdown-rendered,
.markdown-preview-view {
  font-feature-settings: "halt" 1;
  /* 若字体无 halt（如霞鹜文楷需实测），此行会被静默忽略，不影响其它排版 */
}

/* 中文标点也用 palt（比例宽度），让标点两侧空白更紧凑 */
.markdown-rendered {
  font-feature-settings: "halt" 1, "palt" 1;
}

/* 代码/表格里必须关闭，否则等宽对齐被破坏 */
.markdown-rendered :is(pre, code, table, th, td) {
  font-feature-settings: normal;
}
```

> ⚠️ **`halt` 的取舍**：它把**所有**全角标点压成半角，会让中文标点看起来偏挤、且与汉字宽度不再统一。传统中文排版中全文 `halt` 是**激进的**做法。
> **建议**：默认**不要**全局开 `halt`。若你追求紧凑版面（如表格/脚注/窄栏），可只在小范围开启：
> ```css
> .footnotes, .markdown-rendered .footnotes { font-feature-settings: "halt" 1; }
> ```
> 并且**务必先确认你的字体有没有 `halt`**（见 §4.3 的验证方法）。

### 3.6 `text-wrap: pretty`：实测对中文有效 ✅

**MDN 兼容性**：`text-wrap: pretty` —— Chrome **117+**、Firefox ❌、Safari 26+。

**实测断行位置**（文本 `这是一段用于测试自动词组换行的中文文本内容`，宽 200px，字号 20px）：

| 设置 | 各行起始索引 | 每行字数 | 说明 |
|---|---|---|---|
| `auto` / `normal` | 0, 10, 20 | 10 / 10 / 10 | 基准 |
| **`pretty`** | 0, **10, 19** | 10 / **9 / 11** | **改变了断行点**，避免尾行过短 ✅ |
| `balance` | 0, **7, 14** | 7 / 7 / 6 | 强制均衡（适合标题，不适合正文） |

**结论**：`text-wrap: pretty` 在 Chromium 中对中文**确实生效**，通过把字符从第 2 行挪到第 3 行来避免「尾行只剩 1–2 个字」的孤字问题。这正是中文排版关心的「避孤字」。

```css
/* ========== 尾行优化 ========== */
.markdown-rendered p,
.markdown-preview-view p {
  text-wrap: pretty;   /* Chrome 117+，实测对中文有效：避免尾行孤字 */
}

/* balance 只适合短文本（标题/卡片），不要用在正文（性能 + 行长抖动） */
.markdown-rendered :is(h1, h2, h3, h4) {
  text-wrap: balance;  /* Chrome 114+，标题多行均衡 */
}
```

> ⚠️ `text-wrap: pretty` 会增加排版计算量。**不要在超长文档的每一段都开**（Chromium 对 `pretty` 有行数上限保护，超过则退化为 `auto`）。对普通笔记长度完全够用。

### 3.7 `word-break: auto-phrase`：**中文无效，仅日文**

**MDN/实测**：`word-break: auto-phrase` —— Chromium 支持（`CSS.supports` = `true`），实现基于词典的词组换行。

**实测**（同一段日文/中文，200px 宽）：

| `lang` | `normal` 行起始 | `auto-phrase` 行起始 | 结论 |
|---|---|---|---|
| `ja` | 0, 10, 20 | **0, 7, 14** | ✅ **生效**，按词组断行 |
| `zh-Hans` | 0, 10, 20 | 0, 10, 20 | ❌ **完全无效** |
| （无 lang） | 0, 10, 20 | 0, 10, 20 | ❌ 无效 |

**结论**：Chromium 的 `auto-phrase` **只带日文词典，对中文不起作用**。中文的词组换行必须靠 JS（BudouX / `budoux` npm）或 `<wbr>` 手工标注。

> **建议**：中文笔记**不要**指望 `auto-phrase`。若要词组换行，用 BudouX 预处理器把文本切成 `<span style="word-break:keep-all">词</span>` 或用零宽不换行空格 `\u2060` 连接词内字符 —— 但这会污染源文件，**不推荐**。

---

## 4. 中文最佳字体栈

### 4.1 Obsidian 字体变量的真实结构（从 `app.css` 提取，权威）

Obsidian 1.13.7 的 `app.css` 中实测存在以下定义：

```css
--font-text:       var(--font-text-override), var(--font-text-theme), var(--font-default);
--font-monospace:  var(--font-monospace-override), var(--font-monospace-theme), var(--font-monospace-default);
--font-interface:  var(--font-interface-override), var(--font-interface-theme), var(--default-font, '??'), var(--font-default);
--font-text-size:  16px;
--line-height-normal: 1.5;
--p-spacing:       1rem;
--p-spacing-empty: 0rem;
--file-line-width: …      /* 版心宽度 */
```

**关键洞察**：每条字体变量都有 **`-override` / `-theme` 双层结构**。因此修改字体有**两种正确姿势**：

| 方式 | 写法 | 特点 |
|---|---|---|
| **官方推荐** | `--font-text-override` | 优先级最高，不与其他主题冲突，保留主题的其它字体设置 |
| **暴力覆盖** | `--font-text` 整体重写 | 会切断主题的自定义，可能出现意外 |

```css
/* ✅ 推荐：用 -override 层，主题切换时不丢设置 */
body {
  --font-text-override: "LXGW WenKai", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  --font-monospace-override: "Maple Mono", "Sarasa Mono SC", "JetBrains Mono", monospace;
}

/* ❌ 不推荐：整体重写会覆盖主题逻辑 */
/* body { --font-text: "LXGW WenKai", sans-serif; } */
```

### 4.2 字体推荐与获取

**正文（楷体系，适合长文阅读）**
| 字体 | 说明 | 备注 |
|---|---|---|
| **霞鹜文楷 LXGW WenKai** | 基于 Fontworks Klee One，开源（OFL），楷体韵味，**GB 全字集** | 阅读体验最好；**需自行安装** |
| 霞鹜文楷 Screen / GB | 屏幕优化版 / 大陆字形版 | 推荐 GB 版（字形符合大陆规范） |

**正文（黑体系，屏幕首选）**
| 字体 | 说明 |
|---|---|
| **思源黑体 Source Han Sans / Noto Sans CJK SC** | Adobe+Google 开源，7 字重，**本机已装** ✅ |
| **更纱黑体 Sarasa Gothic** | 思源黑体 + Iosevka 融合，**中英混排对齐最佳**（西文字形与汉字等宽协调） |
| HarmonyOS Sans / MiSans | 华为/小米开源，屏幕优化好，字形现代 |
| PingFang SC（苹方） | macOS/iOS 系统字体，**Windows/Linux 无** |
| 微软雅黑 Microsoft YaHei | Windows 系统字体，**桌面 UI 尚可，长文阅读较差**（字面偏大、行距感差） |

**标题**
- 思源黑体 Bold/Heavy、更纱黑体 Bold、MiSans Demibold
- 若要更「书卷气」：思源宋体 Source Han Serif / Noto Serif CJK（**本机已装** ✅）

**代码（等宽）**
| 字体 | 说明 |
|---|---|
| **Maple Mono** | 圆润，带连字（可选），中文社区热度高 |
| **JetBrains Mono** | 编程连字，西文最佳之一，**无中文字形** |
| **Sarasa Mono SC** | 更纱黑体等宽版，**中文正好占 2 个西文字符宽** —— 代码注释对齐神器 |
| Noto Sans Mono CJK SC | **本机已装** ✅ |

> ⚠️ 实测本机**未安装**：霞鹜文楷、更纱黑体、HarmonyOS Sans、MiSans、JetBrains Mono、Maple Mono。已装的有：Noto Sans/Serif CJK（SC/TC/HK/JP/KR）、Noto Sans Mono CJK、文泉驿正黑/等宽正黑、Droid Sans Fallback、Fandol、AR PL UKai/UMing。
> 字体栈里把未安装的字体写在前面是**安全的** —— 浏览器逐个回退，不会报错。

### 4.3 「中文用中文字体、英文用英文字体」的两种实现

#### 方案 A：`font-family` 顺序技巧（简单，已实测有效 ✅）

**原理**：拉丁字体**不含 CJK 字形**，浏览器逐字符回退 —— 拉丁字符命中第一个字体，CJK 字符自动落到后面的中文字体。

**实测验证**（字号 40px）：

| 字体栈 | `W` 宽度 | `中` 宽度 |
|---|---|---|
| `"DejaVu Sans"` 单独 | 39.563px | — |
| `"Noto Sans CJK SC"` 单独 | **35.125px**（Noto 自带的窄西文） | 40px |
| `"DejaVu Sans", "Noto Sans CJK SC"` | **39.563px** ✅ 用 DejaVu | **40px** ✅ 用 Noto |

**结论**：`"英文字体", "中文字体"` 顺序**实测正确分流**。反之若把中文字体写在前面，西文会用中文字体自带的（较窄的）西文字形。

```css
/* ========== 方案 A：字体顺序分流（推荐，零成本） ========== */
:root {
  /* 正文：西文在前（决定拉丁/数字形态），中文在后（承接 CJK 字形） */
  --my-font-body:
    "Inter",                          /* 西文：几何无衬线，字面与汉字协调 */
    "LXGW WenKai",                    /* 中文：霞鹜文楷，长文首选 */
    "PingFang SC",                    /* macOS 中文回退 */
    "HarmonyOS Sans SC", "MiSans",    /* Windows 中文回退 */
    "Source Han Sans SC", "Noto Sans CJK SC",   /* Linux 中文回退 */
    "Microsoft YaHei",                /* 最后兜底 */
    sans-serif;

  /* 标题：无衬线黑体系 */
  --my-font-heading:
    "Inter", "Source Han Sans SC", "Noto Sans CJK SC",
    "PingFang SC", "Microsoft YaHei", sans-serif;

  /* 代码：中文等宽放前面，保证中文注释占 2 字符宽 */
  --my-font-mono:
    "Sarasa Mono SC",                 /* 中文等宽（中文=2×西文宽） */
    "Maple Mono", "JetBrains Mono",   /* 西文连字 */
    "Noto Sans Mono CJK SC",
    ui-monospace, "SFMono-Regular", Consolas, monospace;
}

body {
  --font-text-override: var(--my-font-body);
  --font-monospace-override: var(--my-font-mono);
}
/* 标题单独指定 */
.markdown-rendered :is(h1,h2,h3,h4,h5,h6),
.markdown-source-view.mod-cm6 .HyperMD-header {
  font-family: var(--my-font-heading);
}
```

#### 方案 B：`@font-face` + `unicode-range`（精确，已实测有效 ✅）

**原理**：为同一个 family 名注册多个 `@font-face`，各带互不重叠的 `unicode-range`；浏览器按字符所属区段选择来源。

**实测验证**：`SplitBody` 拆成 DejaVu（`U+0000-2E7F`）+ Noto CJK（`U+4E00-9FFF` 等）→ `W` = 39.563px（DejaVu ✅）、`中` = 40px（Noto ✅），**与单字体测量值完全一致**。

```css
/* ========== 方案 B：unicode-range 精确分流 ========== */
/* 西文区段 */
@font-face {
  font-family: "MyCJK";
  src: local("Inter"), local("Helvetica Neue"), local("Arial");
  unicode-range:
    U+0000-2E7F,   /* 基本拉丁 + 标点 + 音标 + 希腊/西里尔 */
    U+A000-A4CF,   /* 彝文 */
    U+1D00-1DBF;   /* 音标扩展 */
  font-display: swap;
}
/* CJK 区段 */
@font-face {
  font-family: "MyCJK";
  src: local("LXGW WenKai"), local("霞鹜文楷"),
       local("Source Han Sans SC"), local("Noto Sans CJK SC");
  unicode-range:
    U+2E80-2EFF,   /* CJK 部首补充 */
    U+2F00-2FDF,   /* 康熙部首 */
    U+3000-303F,   /* CJK 符号和标点（、。「」等） */
    U+3040-30FF,   /* 平假名 + 片假名 */
    U+3100-312F,   /* 注音 */
    U+31C0-31EF,   /* CJK 笔画 */
    U+3400-4DBF,   /* CJK 扩展 A */
    U+4E00-9FFF,   /* CJK 基本区 */
    U+F900-FAFF,   /* CJK 兼容表意文字 */
    U+FE30-FE4F,   /* CJK 兼容形式 */
    U+FF00-FFEF,   /* 全角字符 */
    U+20000-2FA1F; /* CJK 扩展 B~F */
  font-display: swap;
}

/* 使用时只需一个 family 名 */
.markdown-rendered { font-family: "MyCJK", sans-serif; }
```

> **使用 `local()` 的前提**：字体必须**已安装在本机**。Obsidian 是桌面应用，用户通常自行安装字体，`local()` 足够。
> 若要**免安装**分发字体，把 `local(...)` 换成 `url(...)` 指向 `.woff2`：
> ```css
> @font-face {
>   font-family: "LXGW WenKai Web";
>   src: url("app://local/字体路径/LXGWWenKaiGB-Regular.woff2") format("woff2");
>   unicode-range: U+4E00-9FFF, U+3000-303F;
>   font-display: swap;   /* 避免字体加载期白屏 */
> }
> ```
> ⚠️ **中文全字集 woff2 通常 3–8MB**，分包（按 `unicode-range` 拆多个文件）能显著改善首屏。中文网页字体是**性能重灾区**，桌面 Obsidian 可接受。

**方案 A vs 方案 B 怎么选**：

| | 方案 A（顺序） | 方案 B（unicode-range） |
|---|---|---|
| 复杂度 | 一行 | 需要两张 `@font-face` |
| 控制精度 | 靠回退，标点归属不确定 | **精确**：可让 `，。` 走中文字体、`,` 走西文 |
| 免安装分发 | 需用户装字体 | 可 `url()` 内嵌 |
| 实测 | ✅ 有效 | ✅ 有效 |
| **建议** | **日常首选** | 标点/数字形态不满意时升级 |

### 4.4 字体特性开关（让中文更「端正」）

```css
/* ========== 字体特性：OpenType 开关 ========== */
.markdown-rendered,
.markdown-source-view.mod-cm6 .cm-content {
  /* 中文标点几何居中（部分字体支持）；实测 CSS.supports 通过 */
  font-variant-east-asian: proportional-width;   /* Chrome 63+ */
  /* 逐项 OpenType 控制（更精细，按需开启） */
  font-feature-settings:
    "locl" 1,   /* 本地化字形：让日文字体显示简体字形（思源/Noto 支持） */
    "kern" 1;   /* 中西文边界微调 */
}

/* 竖排时必须开启 vert/vrt2（由 writing-mode 自动触发，此处显式声明更稳） */
.vertical-mode { font-feature-settings: "vert" 1, "vrt2" 1; }
```

> 💡 **`locl` 的实用价值**：如果你用 **Noto Sans CJK JP** 显示中文（很多主题默认给日文字体），部分汉字会是日文字形（如「直」「骨」「今」）。`font-feature-settings: "locl" 1` + `lang="zh-CN"` 可触发本地化字形。**最稳的做法还是直接用 SC 版本字体**。

---

## 5. 行高、字间距、段间距与对齐

### 5.1 行高（`line-height`）

中文没有西文的 `x-height` 概念，汉字字面接近满 em 框，**需要比西文更大的行高**。

| 场景 | 推荐 `line-height` | 说明 |
|---|---|---|
| 中文正文 | **1.7 – 1.9** | 传统中文排版行距约字号的 1.5–2.0 倍 |
| 中英混排正文 | 1.6 – 1.8 | 折衷 |
| 标题 | 1.3 – 1.5 | |
| 代码 | 1.5 – 1.7 | |

Obsidian 默认 `--line-height-normal: 1.5`（实测从 `app.css` 提取）—— **对中文偏紧**。

```css
/* ========== 行高 ========== */
body {
  --line-height-normal: 1.75;   /* 覆盖 Obsidian 默认 1.5，中文 1.7~1.9 更舒服 */
}

.markdown-rendered p,
.markdown-preview-view p {
  line-height: 1.75;
}

/* 代码行高略小 */
.markdown-rendered :is(pre, code),
.markdown-source-view.mod-cm6 .HyperMD-codeblock {
  line-height: 1.55;
}

/* 标题收紧 */
.markdown-rendered :is(h1, h2, h3) { line-height: 1.35; }
```

> ⚠️ **不要用 `line-height: 100%` 或纯数字以外的百分比给中文**：百分比基于 `font-size`，语义与无单位值相同但**会被子元素继承计算后的固定值**，导致嵌套字号变化时行高错乱。**始终用无单位数值**（`1.75`）。

### 5.2 字间距（`letter-spacing`）—— 中文要**极其克制**

**实测数据**（`font-size: 20px`，文本 `中文测试`）：

| `letter-spacing` | 1 字宽 | 2 字宽 | 3 字宽 | 每字增量 |
|---|---|---|---|---|
| `0` | 20px | 40px | 60px | 0 |
| `0.02em` | — | — | 61.61px（4 字 81.61） | +0.4px |
| `0.05em` | — | — | — | +1px |
| `1px` | **21px** | **42px** | **63px** | **+1px** |
| `-0.02em` | — | — | 78.41px（4 字） | −0.4px |

**两个关键发现**：

1. **`letter-spacing` 会在最后一个字符之后也加间距**（1 字 20px → 21px；2 字 40px → 42px）。这会让文本**右边缘对不齐**，在有边框/背景的元素上尤其明显。
2. 中文汉字本身就是**等宽全角**，加 `letter-spacing` 不会像西文那样改善可读性，只会让字距松散、破坏「方块字」的整齐感。

```css
/* ========== 字间距：中文原则是「能不加就不加」 ========== */
.markdown-rendered p,
.markdown-preview-view p {
  letter-spacing: normal;   /* 中文正文默认不加字距 */
}

/* 唯一推荐的场景：小字号 + 大写字距感（类似西文 small-caps 的用法） */
.markdown-rendered .callout-title,
.markdown-rendered :is(h1, h2) {
  letter-spacing: 0.02em;   /* 微量，标题稍透气 */
}

/* 若一定要加，用「负 margin」补偿末尾间距，保持右边缘对齐 */
.justified-block {
  letter-spacing: 0.05em;
  margin-right: -0.05em;    /* 抵消末尾多出的 0.05em */
}
```

> ⚠️ **绝对不要给中文正文加 `letter-spacing: 0.1em` 这类「设计感」数值** —— 中文会变成「散字」，且行末对齐全乱。这是西文排版习惯被误用到中文的典型错误。

### 5.3 段间距（`p-spacing`）

Obsidian 用 `--p-spacing` 控制**段落之间的垂直间距**（实测默认 `1rem`；`--p-spacing-empty: 0rem` 控制空段落）。

中文排版传统上**首行缩进 + 段间无额外间距**（书籍排版），或**无缩进 + 段间距**（网页排版）—— 二者选一，**不要同时用**（会显得松散且缩进冗余）。

```css
/* ========== 段间距：二选一 ========== */

/* 风格 1：书籍式 —— 首行缩进 2 字符，段间距收紧（推荐！） */
body {
  --p-spacing: 0.35rem;   /* 传统书籍：段与段几乎贴合，靠缩进区分段落 */
}

/* 风格 2：网页式 —— 取消缩进，用段间距区分（西文习惯） */
/*
body { --p-spacing: 1rem; }
.markdown-rendered p { text-indent: 0; }
*/

/* 标题的上间距（中文排版中标题应「上疏下密」） */
.markdown-rendered h2 { margin-top: 1.6em; margin-bottom: 0.6em; }
.markdown-rendered h3 { margin-top: 1.3em; margin-bottom: 0.5em; }
```

### 5.4 两端对齐：`text-align: justify` 在中文下**是推荐的**

**为什么中文适合 justify 而西文不适合**：
- 西文 justify 会把词间距拉得忽大忽小（出现「河流」rivers），是公认的排版缺陷。
- **中文没有词间空格**，justify 的伸缩发生在**字与字之间**，且每个汉字等宽，拉伸后视觉均匀 —— **这正是传统中文/日文排版的做法**（「均等割付」）。

**MDN 兼容性**：`text-align: justify` 全浏览器支持；`text-justify` —— Chrome **145+**、Firefox 55+、Safari ❌。

**本机 Chromium 151 实测**：

```
text-align: justify               -> true  ✅
text-justify: inter-character     -> true  ✅
text-justify: inter-ideograph     -> false ❌ （Chromium 未实现该关键字）
```

```css
/* ========== 两端对齐（中文推荐） ========== */
.markdown-rendered p,
.markdown-preview-view p {
  text-align: justify;
  /* 让伸缩优先发生在汉字之间（Chromium 145+；旧版本静默忽略） */
  text-justify: inter-character;
}

/* ⚠️ 必须处理「最后一行」：默认左对齐，否则最后一行会被拉满 */
.markdown-rendered p {
  text-align-last: left;    /* Chrome 47+，默认值即 left，显式声明防主题覆盖 */
}

/* ⚠️ 必须处理「含西文长单词的段落」：避免 justify 撕裂单词 */
.markdown-rendered p {
  word-break: normal;
  overflow-wrap: break-word;   /* 仅在必要时断长单词 */
  hyphens: none;               /* 中文文档不做西文断词 */
}

/* 中英混排折衷：纯西文段落不要 justify（会出 rivers） */
.markdown-rendered p:lang(en) {
  text-align: left;
}
```

> **⚠️ justify 的三个坑**
> 1. **窄容器**（如侧边栏预览、小屏）：一行放不下几个字，justify 会产生巨大字间距。用媒体查询关掉：
>    ```css
>    @media (max-width: 700px) { .markdown-rendered p { text-align: left; } }
>    ```
> 2. **与 `letter-spacing` 冲突**：见 §5.2，末尾多余间距会破坏对齐。二选一。
> 3. **与 `text-wrap: pretty` 的交互**：`pretty` 调整断行点，justify 调整字距，两者可共存，但若发现行末怪异，先关 `pretty` 排查。
> 4. **实时预览（CodeMirror）中 justify 会与光标/选区交互怪异** —— **建议只在阅读视图开启 justify**：
>    ```css
>    .markdown-reading-view .markdown-rendered p { text-align: justify; text-justify: inter-character; }
>    /* 实时预览保持左对齐 */
>    .markdown-source-view.mod-cm6 .cm-line { text-align: left; }
>    ```

### 5.5 版心宽度（`--file-line-width`）

中文一行**最佳字数 30–45 字**，过多会导致换行时「回扫」困难。

```css
/* ========== 版心宽度：控制每行汉字数 ========== */
/* 16px 字号下，每行汉字数 ≈ 宽度 / 16px */
/* 36 字/行 → 36 × 16 = 576px */
body {
  --file-line-width: 40rem;   /* 40rem = 640px ≈ 40 字/行（含标点） */
}
```

---

## 6. 中文竖排与数字的细微处理

### 6.1 竖排（`writing-mode`）

**本机 Chromium 151 实测**：

```
writing-mode: vertical-rl          -> true ✅
text-orientation: upright          -> true ✅
text-combine-upright: all          -> true ✅
ruby-position: over                -> true ✅
```

MDN 兼容性：`text-combine-upright` —— Chrome **48+**、Firefox 48+、Safari 15.4+。全支持。

```css
/* ========== 中文竖排（可选模块，仅对特定元素启用） ========== */
.vertical-text {
  writing-mode: vertical-rl;         /* 从右到左竖排（中文传统方向） */
  text-orientation: mixed;           /* 汉字正立，拉丁字母旋转 90° */
  font-feature-settings: "vert" 1, "vrt2" 1;   /* 竖排专用字形 */
  line-height: 1.8;                  /* 竖排时 line-height 控制的是「列间距」 */
  letter-spacing: 0.02em;            /* 竖排时字距改善可读性 */
  height: 22em;                      /* 竖排下用 height 控制「行数」 */
  max-height: 80vh;
  overflow-x: auto;
}

/* 让数字/短西文在竖排中正立（「縦中横」） */
.vertical-text .tate-chu-yoko,
.vertical-text :is(time, .num) {
  text-combine-upright: all;   /* 2~4 位数字合成一个字宽，正立显示 */
  letter-spacing: 0;
}

/* 竖排中的标点：由字体 vert 特性自动处理，无需 CSS */
```

**用法（配合 Obsidian）**：

````markdown
<div class="vertical-text">

床前明月光，疑是地上霜。
举头望明月，低头思故乡。

</div>
````

> ⚠️ **注意事项**
> - Obsidian 的**实时预览不保证支持自定义 HTML 的 `writing-mode`**（CM6 可能把内容当纯文本处理）。竖排建议在**阅读视图**或导出 PDF 时使用。
> - 竖排下滚动方向、选择行为、光标都会变得不直观，**仅适合诗词/对联/仿古排版等展示性内容**，不要用于正文。
> - `text-orientation: upright` 会让**所有**拉丁字符正立（适合纯展示的短标题），长英文会非常难读 —— 通常用 `mixed`。

### 6.2 中文数字与西文数字

中英混排中数字的处理细节：

```css
/* ========== 数字相关细节 ========== */

/* 1) 让数字使用西文字体的数字字形（避免中文全角数字） */
/*    前提：字体栈里西文字体在前（见 §4.3 方案 A） */
.markdown-rendered { font-variant-numeric: lining-nums tabular-nums; }
/* lining  = 等高数字（现代，中文混排首选）
   tabular = 等宽数字（表格中对齐，正文可用 proportional-nums 更美观） */

/* 表格/数值列必须等宽，正文可选比例数字 */
.markdown-rendered table { font-variant-numeric: tabular-nums; }
.markdown-rendered p     { font-variant-numeric: proportional-nums; }

/* 2) 中文数字与西文数字之间的间距由 text-autospace 处理（实测 +0.125em） */
.markdown-rendered { text-autospace: normal; }

/* 3) 千分位/单位之间的细微间距（可选，改善「1000元」的观感） */
/*    更规范的做法是用 U+2009 THIN SPACE，但会污染源文件，不推荐 */

/* 4) 全角数字转半角（若笔记里有全角数字，可用 CSS 声明但无法真正转换） */
/*    font-variant-east-asian: proportional-width 会让全角字符按比例宽度显示 */
.markdown-rendered { font-variant-east-asian: proportional-width; }
/*    实测 CSS.supports('font-variant-east-asian','proportional-width') === true ✅ */
```

> 💡 **`font-variant-east-asian: proportional-width` 的中文用途**：让**全角标点、全角字母数字**使用比例宽度（而非固定全角宽），版面更紧凑。但注意它会**破坏「汉字等宽」的整齐感**（只影响标点和全角西文，不影响汉字，因为汉字没有比例替代字形）—— 可安全使用。

### 6.3 中文强调号（着重号）

```css
/* ========== 中文着重号（书名号之外的强调方式） ========== */
.markdown-rendered em,
.markdown-rendered .cm-em {
  font-style: normal;          /* 中文不宜用斜体（伪斜体很丑） */
  text-emphasis: dot;          /* 着重号：实测 CSS.supports 通过 ✅ */
  text-emphasis-position: under right;   /* 中文着重号在字下；竖排在右侧 */
  -webkit-text-emphasis: dot;  /* 安全起见带前缀 */
}

/* 连用的标点不应带着重号 */
.markdown-rendered em { text-emphasis-skip: punctuation spaces; }
```

> ⚠️ **中文斜体的坑**：中文字体**普遍没有真正的 italic 字形**，浏览器会做「伪斜体」（`transform: skew`），效果很差。**务必用 `font-style: normal` + 着重号/加粗/变色替代**。这是中文排版中最容易忽视的细节之一。

---

## 7. Obsidian 三种模式的差异与中文主题生态

### 7.1 三种模式的 DOM 差异（从 Obsidian 1.13.7 `app.css` 实测统计）

| 选择器 | 出现次数 | 含义 |
|---|---|---|
| `.markdown-source-view` | 219 | 编辑器容器（源码模式 + 实时预览） |
| `.mod-cm6` | 191 | CodeMirror 6 标记（1.13 下源码/实时预览**都是** CM6） |
| `.markdown-rendered` | 118 | **渲染后的 Markdown**（阅读视图 + 嵌入块） |
| `.markdown-preview-view` | 65 | 阅读视图根容器 |
| `.workspace-leaf-content` | 45 | 叶子（标签页）容器 |
| `.cm-content` | 44 | CM6 内容区 |
| `.callout` | 39 | 标注块 |
| `.cm-line` | 38 | **CM6 的每一行**（缩进的作用对象） |
| `.markdown-embed` | 36 | 嵌入的笔记 |
| `.cm-editor` | 26 | CM6 编辑器 |
| `.HyperMD-list-line` | 25 | 列表行 |
| `.HyperMD-header` | 13 | 标题行 |
| `.internal-embed` | 8 | 内部嵌入 |
| `.HyperMD-codeblock` | 7 | 代码块行 |
| `.markdown-reading-view` | 4 | 阅读视图 |
| `.markdown-preview-sizer` | 3 | 阅读视图内容宽度控制 |

**三种模式的排版作用点**：

| 模式 | 根选择器 | 缩进作用对象 | 字体变量 |
|---|---|---|---|
| **阅读视图** | `.markdown-reading-view` → `.markdown-rendered` | `p` | `--font-text-override` ✅ |
| **实时预览** | `.markdown-source-view.mod-cm6` | `.cm-line`（排除 `.HyperMD-*`） | `--font-text-override` ✅ |
| **源码模式** | `.markdown-source-view.mod-cm6`（同实时预览） | 同上（但缩进会让源码看起来缩进，实际不改文件） | 同上 |
| **嵌入块/悬浮预览** | `.markdown-embed` → `.markdown-embedded` | `.markdown-rendered p`（自动继承） | 同上 |

> ✅ **重要**：`.markdown-embed` 内部**也是** `.markdown-rendered`，所以针对 `.markdown-rendered` 的规则会**自动作用于嵌入块**，无需额外写规则。这是用 `.markdown-rendered` 而非 `.markdown-preview-view` 作为主体的原因 —— **强烈建议以 `.markdown-rendered` 为主选择器**。

### 7.2 已有中文主题/社区的解决方式（调研结论）

**通用做法（社区 CSS 片段的主流模式）**：

1. **首行缩进**：绝大多数中文主题/Snippet 用 `p { text-indent: 2em; }`，少数误用 `2em` 之外的单位（`2ch`、`32px` 硬编码 —— 硬编码会在用户改字号后错位）。
2. **排除列表**：成熟的主题会写 `.markdown-rendered p:not(...)` 长列表排除 quote/list/callout。**这一步是区分「能用」和「好用」的关键** —— 只写 `p{text-indent:2em}` 会导致列表内段落、引用内段落、Callout 内段落全部错误缩进。
3. **中文字体**：常见做法是通过 Obsidian 的 **外观 → 字体 → 正文字体** 设置（写入 `--font-text-theme`），而不是硬写 CSS。进阶用户用 `--font-text-override`（**本方案推荐**）。
4. **`text-autospace` 的使用**：由于该特性 2025 年 11 月才进入 Baseline，**绝大多数现存主题尚未使用它** —— 你现在加上去属于领先实践，且因为 Obsidian 内嵌 Chromium 150 已支持，**可以放心使用**。
5. **行高**：中文主题普遍把 `--line-height-normal` 从 1.5 提到 **1.6–1.8**，这是中文主题与西文主题最明显的差异之一。
6. **中文字体回退链**：成熟主题会写很长的回退链覆盖 macOS(`PingFang SC`)/Windows(`Microsoft YaHei`)/Linux(`Noto Sans CJK SC`)，因为 Obsidian 是跨平台桌面应用。

**推荐的工作方式**：

- 用 **CSS Snippet**（`.obsidian/snippets/*.css` + 设置里开启）而不是改主题文件 —— 主题更新会覆盖你的修改。
- 把字体用 `--font-text-override` / `--font-monospace-override` 注入，**不要**重写 `--font-text`（见 §4.1）。
- 善用 **Style Settings 插件** 把参数（字号、行高、是否 justify）暴露成 UI 开关，便于按笔记类型切换。

---

## 8. 完整可粘贴方案

把以下内容保存为 `<vault>/.obsidian/snippets/cjk-typography.css`，然后在 **设置 → 外观 → CSS 代码片段** 中启用。

```css
/* ==========================================================================
   专业中文排版（CJK Typography for Obsidian）
   实测环境：Obsidian 1.13.7 / Electron 43.3.0 / Chromium 150.0.7871.212
   所有数值均经 Chromium 151 真实渲染测量验证
   ========================================================================== */

/* --------------------------------------------------------------------------
   0. 可调参数（想改只改这里）
   -------------------------------------------------------------------------- */
body {
  /* 正文行高：中文 1.7~1.9（Obsidian 默认 1.5 对中文偏紧） */
  --line-height-normal: 1.75;

  /* 段间距：书籍式排版（首行缩进）配小段距 */
  --p-spacing: 0.35rem;

  /* 版心宽度：40rem = 640px ≈ 40 字/行（中文最佳 30~45 字/行） */
  --file-line-width: 40rem;

  /* ---------- 字体 ---------- */
  /* 正文：西文字体在前（决定拉丁/数字形态），中文字体承接 CJK 字形 */
  --font-text-override:
    "Inter",
    "LXGW WenKai", "霞鹜文楷",
    "PingFang SC",
    "HarmonyOS Sans SC", "MiSans",
    "Source Han Sans SC", "Noto Sans CJK SC",
    "Microsoft YaHei",
    sans-serif;

  /* 代码：中文等宽字体在前，保证中文注释占 2 个西文字符宽 */
  --font-monospace-override:
    "Sarasa Mono SC",
    "Maple Mono", "JetBrains Mono",
    "Noto Sans Mono CJK SC",
    ui-monospace, "SFMono-Regular", Consolas, monospace;

  /* 界面字体（保持西文优先，UI 更整洁） */
  --font-interface-override:
    "Inter", "PingFang SC", "HarmonyOS Sans SC",
    "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
}

/* --------------------------------------------------------------------------
   1. 全局：中英文自动间距 + 字体特性
   Chromium 140+；⚠️ 初始值是 no-autospace，必须显式开启
   作用域：阅读视图 + 实时预览 + 源码模式
   -------------------------------------------------------------------------- */
.markdown-rendered,
.markdown-preview-view,
.markdown-source-view.mod-cm6 .cm-content {
  /* 中英文/数字之间自动插入 0.125em 间距（实测值） */
  text-autospace: normal;

  /* 让全角标点/字母数字使用比例宽度，版面更紧凑 */
  font-variant-east-asian: proportional-width;

  /* 本地化字形 + 中西文边界字距微调 */
  font-feature-settings: "locl" 1, "kern" 1;
}

/* 代码块内：关闭自动间距与比例宽度，保护对齐 */
.markdown-rendered :is(pre, code, pre code),
.markdown-source-view.mod-cm6 :is(.HyperMD-codeblock, .cm-inline-code) {
  text-autospace: no-autospace;
  font-variant-east-asian: normal;
  font-feature-settings: normal;
}

/* 表格内同理 */
.markdown-rendered :is(table, th, td) {
  text-autospace: no-autospace;
  font-variant-numeric: tabular-nums;   /* 数值列对齐 */
}

/* --------------------------------------------------------------------------
   2. 首行缩进：text-indent: 2em（= 2 个全角汉字，实测 32px @16px）
   ⚠️ 绝不要用 2ch（实测仅 17.77px ≈ 1.11 字）
   -------------------------------------------------------------------------- */
.markdown-rendered p,
.markdown-preview-view p {
  text-indent: 2em;
  /* 尾行优化：避免尾行孤字（Chromium 117+，实测对中文有效） */
  text-wrap: pretty;
  /* 两端对齐（中文推荐，见 §5.4）；实时预览不开 justify */
  /* text-align: justify; text-justify: inter-character; */
}

/* 不该缩进的元素：一次归零（实测 li / blockquote>p 均为 0） */
.markdown-rendered :is(h1, h2, h3, h4, h5, h6,
                       ul, ol, li,
                       blockquote,
                       pre, code,
                       table, th, td,
                       .callout, .callout-content, .callout-title,
                       .internal-embed, .markdown-embed, .markdown-embed-content,
                       .frontmatter, .metadata-container,
                       mjx-container, .math, .math-block,
                       .footnotes, hr),
.markdown-preview-view :is(h1, h2, h3, h4, h5, h6,
                           ul, ol, li, blockquote, pre, code,
                           table, th, td, .callout,
                           .internal-embed, .markdown-embed,
                           mjx-container, .math, .math-block) {
  text-indent: 0;
}

/* 含图片/嵌入的段落不缩进（图片应居中） */
.markdown-rendered p:has(img),
.markdown-rendered p:has(.internal-embed) { text-indent: 0; }

/* 纯空段落不缩进 */
.markdown-rendered p:has(> br:only-child) { text-indent: 0; }

/* --------------------------------------------------------------------------
   3. 实时预览 / 源码模式首行缩进（CodeMirror 6）
   每个 .cm-line 是「一个逻辑行」= 一个段落 → text-indent 只影响其第一视觉行
   -------------------------------------------------------------------------- */
.markdown-source-view.mod-cm6 .cm-line {
  text-indent: 2em;
}

/* 排除所有非正文行类型 */
.markdown-source-view.mod-cm6 .cm-line:is(
  .HyperMD-header, .HyperMD-header-1, .HyperMD-header-2,
  .HyperMD-header-3, .HyperMD-header-4, .HyperMD-header-5, .HyperMD-header-6,
  .HyperMD-list-line, .HyperMD-list-line-nobullet,
  .HyperMD-quote,
  .HyperMD-codeblock,
  .HyperMD-table-row, .HyperMD-table-row-1, .HyperMD-table-row-2,
  .HyperMD-hr, .HyperMD-footnote,
  .cm-embed-block, .cm-hmd-frontmatter
) {
  text-indent: 0;
}

/* --------------------------------------------------------------------------
   4. 标题：不缩进、收紧行高、多行均衡
   -------------------------------------------------------------------------- */
.markdown-rendered :is(h1, h2, h3, h4, h5, h6),
.markdown-source-view.mod-cm6 .HyperMD-header {
  text-indent: 0;
  line-height: 1.35;
  text-wrap: balance;          /* Chromium 114+ */
  letter-spacing: 0.02em;      /* 标题微量字距（正文不要加） */
  font-family: "Inter", "Source Han Sans SC", "Noto Sans CJK SC",
               "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 标题「上疏下密」 */
.markdown-rendered h1 { margin-top: 1.8em; margin-bottom: 0.7em; }
.markdown-rendered h2 { margin-top: 1.6em; margin-bottom: 0.6em; }
.markdown-rendered h3 { margin-top: 1.3em; margin-bottom: 0.5em; }
.markdown-rendered h4,
.markdown-rendered h5,
.markdown-rendered h6 { margin-top: 1.1em; margin-bottom: 0.4em; }

/* --------------------------------------------------------------------------
   5. 两端对齐（仅阅读视图；实时预览保持左对齐避免光标交互怪异）
   Chromium 145+ 支持 text-justify，旧版本静默忽略
   -------------------------------------------------------------------------- */
.markdown-reading-view .markdown-rendered p {
  text-align: justify;
  text-justify: inter-character;   /* 伸缩发生在汉字之间（Chrome 145+） */
  text-align-last: left;           /* 最后一行左对齐，不拉满 */
  overflow-wrap: break-word;
  hyphens: none;                   /* 中文文档不做西文断词 */
}

/* 纯西文段落不 justify（避免 rivers） */
.markdown-reading-view .markdown-rendered p:lang(en) { text-align: left; }

/* 窄容器关闭 justify（一行放不下几个字时 justify 会产生巨大字间距） */
@media (max-width: 700px) {
  .markdown-reading-view .markdown-rendered p { text-align: left; }
}

/* --------------------------------------------------------------------------
   6. 中文斜体 → 着重号（中文字体无真 italic，伪斜体很丑）
   -------------------------------------------------------------------------- */
.markdown-rendered em,
.markdown-source-view.mod-cm6 .cm-em {
  font-style: normal;
  text-emphasis: dot;
  text-emphasis-position: under right;
  -webkit-text-emphasis: dot;
}

/* --------------------------------------------------------------------------
   7. 可选：标点挤压（谨慎使用，见 §3.5）
   text-spacing-trim 对中文/思源字体是空操作；halt 才是有效手段
   halt 会把所有全角标点压成半角，会显得偏挤 —— 默认关闭
   -------------------------------------------------------------------------- */
/*
.footnotes, .markdown-rendered .footnotes {
  font-feature-settings: "halt" 1;
}
*/

/* --------------------------------------------------------------------------
   8. 可选：竖排（展示性内容，如诗词）
   用法：<div class="vertical-text">…</div>
   -------------------------------------------------------------------------- */
.vertical-text {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-feature-settings: "vert" 1, "vrt2" 1;
  line-height: 1.8;
  letter-spacing: 0.02em;
  height: 22em;
  max-height: 80vh;
  overflow: auto;
  margin: 1em auto;
}
.vertical-text :is(time, .num) { text-combine-upright: all; }
```

---

## 9. 兼容性总表（Obsidian Chromium 150 / 实测于 151）

| CSS 特性 | Obsidian 150 | MDN 最低版本 | 备注 |
|---|---|---|---|
| `text-indent` | ✅ | CSS1 | 用 `2em`，不用 `2ch` |
| `text-autospace: normal` | ✅ | Chrome **140** | **必须显式声明**（初始值 `no-autospace`） |
| `text-autospace` 其它关键字 | ❌ | 未实现 | `ideograph-alpha`/`punctuation`/`insert`/`replace` |
| `text-spacing-trim` | ⚠️ 解析通过但**无效果** | Chrome 123 | 依赖字体 `chws`；思源/Noto **无** `chws` |
| `font-feature-settings: "halt"` | ✅ 实测有效 | 全支持 | 标点挤压的有效替代 |
| `hanging-punctuation` | ❌ | **Chromium 从未实现** | 悬挂标点不可用 |
| `line-break: strict` | ✅ | Chrome 25 | 对纯中文意义有限；避头尾已默认生效 |
| `line-break: anywhere` | ✅ | Chrome 83 | ⚠️ 破坏行尾禁则，勿全局用 |
| `text-wrap: pretty` | ✅ 实测对中文有效 | Chrome **117** | 避免尾行孤字 |
| `text-wrap: balance` | ✅ | Chrome 114 | 仅标题/短文本 |
| `word-break: auto-phrase` | ⚠️ **仅日文** | Chrome 119 | 中文实测无效 |
| `text-align: justify` | ✅ | 全支持 | 中文推荐 |
| `text-justify: inter-character` | ✅ | Chrome **145** | `inter-ideograph` 不支持 |
| `text-align-last: left` | ✅ | Chrome 47 | 配 justify 必用 |
| `writing-mode: vertical-rl` | ✅ | 全支持 | |
| `text-combine-upright: all` | ✅ | Chrome 48 | 縦中横 |
| `font-variant-east-asian` | ✅ | Chrome 63 | 比例宽度 |
| `text-emphasis` | ✅ | 全支持 | 中文着重号 |
| `:has()` | ✅ | Chrome **105** | 用于排除图片段落 |
| `:is()` / `:where()` | ✅ | Chrome 88 | |
| `@font-face` + `unicode-range` | ✅ 实测有效 | 全支持 | 中西文字体精确分流 |
| `font-family` 顺序分流 | ✅ 实测有效 | 全支持 | 更简单的等价方案 |

---

## 10. 本方案的实测方法与可复现性

**测量手段**：Playwright（`playwright-core`）驱动 Google Chrome 151 headless，通过以下 API 取真实渲染值：

- `CSS.supports(prop, value)` —— 特性支持判定
- `getBoundingClientRect()` + `Range.getBoundingClientRect()` —— 精确到字符的宽度/位置测量
- `getComputedStyle(el, '::first-letter')` —— 伪元素计算样式
- 逐字符 `Range` 的 `rect.top` 变化 —— **精确判定每个渲染行的起始字符**（这是判定避头尾/断行行为的可靠手段，比测行数准确）

**字体特性测量**：直接解析 OpenType 表目录 + `GSUB`/`GPOS` 的 `FeatureList`，得到 `chws`/`halt`/`palt` 等特性的有无。

**Obsidian 内部结构**：从 `resources/obsidian.asar` 解出 `app.css`（637,090 字节），提取真实的 CSS 变量定义与选择器频次。

**已实测的关键数字速查**：

```
汉字宽度 @16px        = 16.0156px  (= 1em)
ch 单位 @16px         =  8.89px    (数字 "0" 的宽度)
2em                   = 32px       = 2.000 汉字 ✅
2ch                   = 17.77px    ≈ 1.110 汉字 ❌
text-autospace 插入    = +2.5px @20px = 0.125em (1/8 em)
letter-spacing 1px     → 单字也 +1px（末尾多出间距）
halt 压缩             → 「中」120px → 80px ✅
text-spacing-trim     → 「中」120px → 120px ❌（无效果）
Noto/思源 CJK 特性     → halt ✅ chws ❌
auto-phrase           → ja: [0,7,14] ✅ / zh: [0,10,20] ❌
text-wrap: pretty     → [0,10,20] → [0,10,19] ✅ 对中文生效
```

---

## 11. 一页速查：最容易踩的 10 个坑

1. ❌ 用 `text-indent: 2ch` → 实测只有 1.11 字宽。**用 `2em`**。
2. ❌ 不写 `text-autospace` 就以为默认有间距 → **Chromium 初始值是 `no-autospace`，必须显式开启**。
3. ❌ 用 `text-autospace: ideograph-alpha` → Chromium **未实现**，只有 `normal`/`no-autospace` 可用。
4. ❌ 指望 `text-spacing-trim` 挤压标点 → 思源/Noto 无 `chws` 特性，**空操作**。用 `halt`。
5. ❌ 指望 `hanging-punctuation` → **Chromium 从未实现**，永远不要试。
6. ❌ 用 `word-break: auto-phrase` 做中文词组换行 → **只有日文词典**，中文无效。
7. ❌ 用 `line-break: anywhere` → **破坏行尾禁则**（左括号跑到行末）。
8. ❌ 给中文正文加 `letter-spacing: 0.1em` → 中文变「散字」，且**末尾多出间距**破坏右对齐。
9. ❌ 中文用 `font-style: italic` → 中文字体无真斜体，**伪斜体极丑**。用着重号或加粗。
10. ❌ 改主题文件实现排版 → 主题更新即丢失。**用 CSS Snippet + `--font-text-override`**。

---

*本方案基于 Obsidian 1.13.7（Chromium 150）实测编写；兼容性数据来自 MDN browser-compat-data main 分支。Chromium 的 CSS Text Level 4 实现仍在演进（`text-autospace` 细粒度关键字、`text-spacing-trim` 的字体支持），建议每 1–2 个大版本重新验证一次。*
