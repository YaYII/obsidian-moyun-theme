# 变更日志

本项目的版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.3] - 2026-09-16

### 主题改名（为符合官方目录的命名规范）

提交到 Obsidian 社区目录时被拒：`This name is not allowed in the directory.`
查官方 manifest 规范后确认原因 —— 规范原文要求：

> - Prefer English names and use **Basic Latin** characters only. No punctuation
>   (except hyphens, plus sign, and parenthesis), emoji, or special characters are allowed.
> - **Theme names cannot be changed once the theme has been submitted** to the community directory.

原名称「墨韵 MoYun」含中文字符，不合规。现改为 **MoYun**（拼音，保留品牌发音；
「墨韵」作为中文名保留在 README 与文档中）。

> 这一条不可逆：官方规定主题一旦提交到目录就不能再改名，所以名称必须一次选对。

### 工程改进：主题名收敛为单一事实源

改名过程中发现主题名被硬编码在 4 个地方（构建产物头部、演示库目录名、
`cssTheme` 配置、脚本与测试里的路径），漏掉任何一处都会导致主题失联。现已全部改为
从 `manifest.json` 读取：

- `build.mjs` 的产物头部与日志输出读 `manifest.name`
- 演示库的主题目录名与 `appearance.json` 的 `cssTheme` 由构建同步（新增，此前会漏）
- `tools/make-demo-vault.mjs` 与 `tests/` 不再硬编码路径
- `make-demo-vault.mjs` 的路径改为基于脚本位置推导，不再依赖当前工作目录

### 数据

- 官方目录 758 个主题中名称含中文的为 **0 个**，本主题原先会是唯一一个（现已改为拼音）。

## [1.0.2] - 2026-09-16

### 为提交官方社区目录做准备

- **主题商店封面图**：新增 `screenshot.png`（夜间）与 `screenshot-light.png`（日间），
  均为官方向导推荐的 512×288 的 2 倍图。官方要求提交时仓库根目录必须有展示截图。
  配套新增 `tools/preview/cover.html` 与 `tools/make-screenshot.mjs`，主题改版后可一键重出。
- **manifest 精简**：移除值为空字符串的 `fundingUrl`。
  官方目录里已收录的 758 个主题无一把该字段留空 —— 省略优于空值。
- README 顶部接入封面图，徽章版本号同步。

### 兼容性说明（本次核查结论）

- 主题未使用 CSS 嵌套语法，全部现代特性均为优雅降级：
  `:has()`、`color-mix()` 在 Obsidian 1.6（Chromium 120）即可用；
  仅 `text-autospace`（中西文自动间距）需要 Obsidian 1.13+，低版本会静默忽略该属性，
  其余排版特性不受影响。故 `minAppVersion` 保持 `1.6.0`。

## [1.0.1] - 2026-09-16

### 元数据修正

- **作者归属**：`manifest.json` 的 `author` 改为实际维护者 `YaYII`，并补上 `authorUrl`。
  v1.0.0 里是占位文本「墨韵主题项目」。
- 主题的功能与样式与 v1.0.0 **完全一致**（`theme.css` 内容仅有头部版本号变化）。

### 构建流程（仓库维护相关，不影响使用者）

- 移除产物头部的生成时间戳，使构建**可复现**：相同源码现在产出逐字节相同的文件。
  此前 CI 构建的产物与本地永远无法对上，也无法用哈希校验发布资产。
- 模块排序从 `localeCompare`（依赖运行环境 ICU 版本，跨 Node 版本可能乱序）
  改为码位序直接比较，消除 CI 与本地分叉的隐患。
- 补充发布后校验流程文档：用 GitHub API 的 `digest` 字段校验资产一致性，
  而不是用 `/releases/latest/download/` 下载链接（该路径有 CDN 缓存，会拿到旧文件）。

## [1.0.0] - 2026-09-16

首个正式版本。

### 中文排版（本主题的核心）

- **中西文自动间距**：基于 CSS Text Level 4 的 `text-autospace`，在中文与英文、数字之间自动插入约 1/8 全角间隙。零 JS、不污染原文。
- **首行缩进**：`text-indent: 2em`（不是社区常见的 `2ch` —— 实测 `2ch` 在 16px 下只有 1.11 个汉字宽，缩进明显不足）。精确豁免列表、引用、标注、表格、代码、数学块、图片段落、脚注、嵌入笔记与所有标题，并单独处理实时预览的 CodeMirror 行语义类。
- **行高与版心**：默认行高 1.8、版心 46rem，可在设置中调整。
- **标题字重 650**：避免汉字笔画在 700 以上字重时粘连；标题使用 `text-wrap: balance` 平衡折行。
- **不用伪斜体**：汉字无真斜体，改用「变色 + 半粗」，并提供中文传统的**着重号**（`text-emphasis: dot`）作为可选方案。
- **段落寡行控制**：`text-wrap: pretty`（实测对中文有效，可把尾行孤字上移一行）。
- **六种中文排版模式**：`my-govdoc` 公文（参照 GB/T 9704-2012）、`my-poetry` 诗词、`my-thesis` 论文、`my-letter` 信纸、`my-bigscreen` 大字投屏、`my-immersive` 沉浸写作。

### 配色

- **八大韵色**：青花（默认）、朱砂、竹青、藤紫、秋香、黛青、胭脂、松烟。全部取自中国传统色并按对比度校准。
- **日间「宣纸」**：底色不用纯白，用带暖调的宣纸色。
- **夜间「墨夜」**：正文不用纯白，用宣纸色文字压在深墨底上，降低夜间阅读的对比冲击。
- **三层设计令牌**：原始色板 → 语义令牌 → Obsidian 原生变量映射（覆盖 778 个原生变量）。

### 组件与界面

- 标注（Callout）：全部内置类型配色，含折叠态、嵌套层级，以及可选的扁平样式。
- 表格：表头底色、极轻斑马纹、更大的中文单元格内边距、悬停行高亮。
- 代码块：语法高亮配色随明暗模式成对切换，复制按钮与语言标签。
- 列表：项目符号降尺寸、等宽有序编号、缩进引导线、任务复选框完整状态。
- 布局：三层表面层次（应用底 / 侧栏 / 纸面），标签页与内容区「无缝连通」以消除视觉断层，拖拽分隔条高亮反馈。
- 设置界面：说明文字提高对比度（中文用户最需要读这里的字），Style Settings 多层折叠用缩进与色条建立纵深。
- 增强特性：彩虹文件夹、卡片化列表、图片自动网格、专注模式、标题自动编号、六色高亮、`is-flashing` 柔和渐隐。
- 插件适配：Dataview、Tasks、Kanban、Excalidraw、Canvas、Calendar、Charts、Admonition、Style Settings 等。

### 设置面板

- 30 多个选项，**全部中文说明**，并且每组都写清取舍而不只是给个滑杆。
- 六组分类：配色 / 中文排版 / 字体 / 行距与版心 / 界面细节 / 内容增强。
- 附带五套预设（宣纸、墨夜、竹简、秋香、素笺）。

### 工程化

- **模块化源码**：34 个模块，构建产出单一 `theme.css`。
- **构建期校验**：花括号配对、未定义令牌、原始色板越界引用、Style Settings 格式、中文字距过大提醒。
- **模块冲突检查**：检测「同一属性有两个主人」、`!important` 使用清单、跨模块重复令牌、对中文无效的声明。
- **视觉验证台**：用 Obsidian 真实 DOM 与真实 `app.css` 渲染主题，断言 28 项计算后样式（含 WCAG AA 对比度）并输出明暗双模式截图。
- **CI 与发布**：GitHub Actions 构建、校验、并在推 tag 时发布 Release 资产供 BRAT 使用。
- **演示库**：`demo-vault/` 可直接用 Obsidian 打开验收。

### 已知边界（不假装支持）

- `text-spacing-trim`（标点挤压）在思源黑体 / Noto Sans CJK 上**实际无效果** —— 依赖字体的 `chws` 特性，这些字体只提供 `halt` / `palt`。保留声明以便将来受益，并提供基于 `halt` 的「紧凑标点」开关。
- `hanging-punctuation`（标点悬挂）在 Chromium 上**从未实现**，无法支持。
- 避头尾无需 CSS 干预 —— Chromium 默认已强制；`line-break: strict` 仅为防御性声明。
- `word-break: auto-phrase`（按词组断行）**仅对日文有效**，Chromium 只随附日文词典，故只对 `lang="ja"` 启用。
- 实时预览下**不做**标题自动编号 —— CodeMirror 虚拟滚动会让 CSS 计数器随滚动跳变。

### 修复记录（开发过程中发现并修正的真实缺陷）

- 修正 `hsl(var(--my-*-rgb) / α)` 的错误用法：RGB 三元组不能用于 `hsl()`，该写法导致 13 处声明被浏览器静默丢弃（标签底色、选中态、语义色浮层等全部失效）。改为空格分隔三元组配合 `rgb(var(--…-rgb) / α)`。
- 修正 `--my-accent: var(--my-accent-custom, var(--my-accent))` 的**自我引用** —— 按 CSS 规范这会让该自定义属性在计算值阶段失效，整套强调色体系会静默崩塌。改为把「自定义色」下沉到每个基色定义中。
- 修正三级文字对比度不足：实测日间 4.33:1、夜间 4.47:1，均低于 WCAG AA 的 4.5:1，已调整至 5.78:1 / 5.10:1。
- 修正正文图片无圆角：Obsidian 原生只给内嵌图片与选中态加圆角，正文裸图是直角，本主题补齐。
- 修正字距默认值：`letter-spacing` 会在**最后一个字符之后也追加空隙**，破坏右边缘对齐，中文默认应为 0（原为 0.01em）。
- 消除两处重复实现：标题自动编号（`headings.css` 与 `heading-numbers.css` 争同一属性）、搜索命中高亮（`sidebar.css` 与 `reading-extras.css`），统一为「一个属性一个主人」。