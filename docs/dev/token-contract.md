# 墨韵 MoYun · 开发契约（Token Contract）

> 本文件是主题源码的**唯一接口约定**。所有组件模块必须遵守，构建脚本会强制校验。

## 一、分层铁律

```
src/00-tokens/palette.css      第一层：原始色板（--my-ink-*、--my-qinghua-* …）—— 组件层【禁止】使用
src/00-tokens/tokens.css       第二层：语义令牌（--my-surface-*、--my-text-*、--my-accent …）—— 组件层【应当】使用
src/00-tokens/obsidian-map.css 第三层：Obsidian 原生变量映射 —— 组件层【可以】使用
src/10-foundation/**           基础排版
src/20-layout/**               布局外壳（组件层，消费令牌）
src/30-editor/**               编辑器内容（组件层）
src/40-components/**           通用组件（组件层）
src/50-features/**             增强特性（组件层）
src/60-plugins/**              插件适配（组件层）
```

**组件层的正确写法**（优先级从高到低）：

1. 优先直接消费 `obsidian-map.css` 已映射好的 Obsidian 原生变量，例如
   `color: var(--text-normal);` `background: var(--background-secondary);`
   这样能自动跟随主题切换与用户的「设置 → 外观」调整。
2. 需要主题独有的概念时，使用语义令牌 `var(--my-*)`。
3. **绝对禁止**在组件层写死颜色（`#333`、`rgb(0,0,0)`）或直接引用原始色板。

## 二、可用的语义令牌（组件层白名单）

### 尺寸与节奏
```

```

完整清单（117 个）：

```
--my-accent
--my-accent-active
--my-accent-hover
--my-accent-rgb
--my-accent-soft
--my-border
--my-border-strong
--my-border-subtle
--my-border-width
--my-border-width-accent
--my-border-width-thick
--my-caret
--my-code-border
--my-code-comment
--my-code-function
--my-code-keyword
--my-code-number
--my-code-operator
--my-code-property
--my-code-string
--my-code-surface
--my-code-tag
--my-content-width
--my-content-width-full
--my-content-width-wide
--my-danger
--my-danger-rgb
--my-divider
--my-duration-fast
--my-duration-normal
--my-duration-slow
--my-ease-in-out
--my-ease-out
--my-ease-spring
--my-editor-padding-x
--my-editor-padding-y
--my-font-heading
--my-font-heading-serif
--my-font-mono
--my-font-size-2xl
--my-font-size-3xl
--my-font-size-base
--my-font-size-l
--my-font-size-m
--my-font-size-s
--my-font-size-scale
--my-font-size-xl
--my-font-size-xs
--my-font-text
--my-font-ui
--my-font-weight-bold
--my-font-weight-heading
--my-font-weight-medium
--my-font-weight-normal
--my-h1-size
--my-h2-size
--my-h3-size
--my-h4-size
--my-h5-size
--my-h6-size
--my-indent-cjk
--my-info
--my-info-rgb
--my-letter-spacing-cjk
--my-letter-spacing-code
--my-line-height-loose
--my-line-height-normal
--my-line-height-relaxed
--my-line-height-snug
--my-line-height-tight
--my-quote
--my-radius-full
--my-radius-l
--my-radius-m
--my-radius-s
--my-radius-xl
--my-radius-xs
--my-selection-bg
--my-shadow-color
--my-shadow-l
--my-shadow-m
--my-shadow-s
--my-shadow-xl
--my-shadow-xs
--my-space-0
--my-space-1
--my-space-10
--my-space-11
--my-space-12
--my-space-2
--my-space-3
--my-space-4
--my-space-5
--my-space-6
--my-space-7
--my-space-8
--my-space-9
--my-success
--my-success-rgb
--my-surface-active
--my-surface-app
--my-surface-elevated
--my-surface-hover
--my-surface-primary
--my-surface-secondary
--my-surface-selected
--my-surface-sunken
--my-surface-tertiary
--my-text-faint
--my-text-faintest
--my-text-inverse
--my-text-on-accent
--my-text-primary
--my-text-secondary
--my-text-tertiary
--my-warning
--my-warning-rgb
```

### 关键令牌速查
| 令牌 | 用途 |
|---|---|
| `--my-surface-app / -primary / -secondary / -tertiary / -elevated / -sunken` | 表面层级，由低到高 |
| `--my-surface-hover / -active / -selected` | 交互态底色 |
| `--my-text-primary / -secondary / -tertiary / -faint / -faintest` | 文字层级 |
| `--my-text-on-accent` | 强调色底上的文字（恒为白色） |
| `--my-border / -strong / -subtle`、`--my-divider` | 描边与分隔 |
| `--my-accent / -hover / -active / -soft`、`--my-accent-rgb` | 强调色四态 + RGB 三元组 |
| `--my-success / -info / -warning / -danger / -quote` (+ `-rgb`) | 语义色 |
| `--my-mark-yellow / -green / -blue / -pink / -purple / -gray` | 高亮底色 |
| `--my-code-surface / -border / -keyword / -string / -number / -comment / -function / -tag / -property / -operator` | 代码配色 |
| `--my-space-1 … --my-space-12` | 4px 基准栅格（2/4/6/8/10/12/16/20/24/32/40/56） |
| `--my-radius-xs / -s / -m / -l / -xl / -full` | 圆角（3/5/8/12/16/999） |
| `--my-shadow-xs / -s / -m / -l / -xl` | 阴影（已随明暗模式切换） |
| `--my-font-text / -ui / -heading / -heading-serif / -mono` | 字体族 |
| `--my-font-size-base` | 正文字号（用户可调，默认 16px） |
| `--my-font-size-xs / -s / -m / -l / -xl / -2xl / -3xl` | 字阶 |
| `--my-font-weight-normal / -medium / -bold / -heading` | 字重（400/500/650/650） |
| `--my-line-height-tight / -snug / -normal / -relaxed / -loose` | 行高（1.3/1.45/1.65/1.8/2.0） |
| `--my-content-width` | 正文行宽（默认 46rem，用户可调） |
| `--my-ease-out / -in-out / -spring`、`--my-duration-fast / -normal / -slow` | 动效 |

### 已映射的 Obsidian 原生变量（优先使用）
共 778 个，按前缀分组：
`--background-*`、`--text-*`、`--color-base-*`、`--color-accent*`、`--interactive-*`、
`--font-*`、`--line-height-*`、`--p-spacing`、`--h1..h6-*`、`--file-*`、`--inline-title-*`、
`--link-*`、`--code-*`、`--blockquote-*`、`--callout-*`、`--list-*`、`--indent*`、
`--table-*`、`--nav-*`、`--tab-*`、`--titlebar-*`、`--ribbon-*`、`--status-bar-*`、
`--sidebar-*`、`--vault-*`、`--icon-*`、`--input-*`、`--dropdown-*`、`--toggle-*`、
`--slider-*`、`--checkbox-*`、`--modal-*`、`--menu-*`、`--prompt-*`、`--popover-*`、
`--scrollbar-*`、`--tag-*`、`--pill-*`、`--embed-*`、`--metadata-*`、`--divider-*`、
`--hr-*`、`--image-radius`、`--canvas-*`、`--graph-*`、`--bases-*`、`--button-*`、`--search-*`

> 完整变量名清单见 `docs/reference/obsidian-variables.txt`
> （该文件由 `node tools/extract-obsidian-reference.mjs` 从你本机的 Obsidian 提取，
>   仓库中已包含一份 1096 个变量的清单可直接查阅。）

## 三、编码规范

1. **注释一律中文**，说明「为什么这么写」而非「这行做了什么」。
2. 每个文件顶部写模块说明块（用途、依赖、注意事项），格式与现有文件保持一致。
3. 选择器**从窄到宽**书写，避免 `!important`；确需覆盖 Obsidian 内联样式时才用，且必须加注释说明原因。
4. 不要重复定义 `obsidian-map.css` 已映射的变量。
5. 必须同时适配 **阅读视图**（`.markdown-rendered` / `.markdown-preview-view`）与
   **实时预览**（`.markdown-source-view.mod-cm6`）两套 DOM，注意它们的选择器差异。
6. 支持 `body.theme-light` 与 `body.theme-dark` 双模式；用令牌即可自动适配，不要写死。
7. 尊重 `prefers-reduced-motion`：涉及动画时加 `@media (prefers-reduced-motion: reduce)`。
8. 文件命名用英文小写连字符；注释用中文。

## 四、构建与校验

```bash
node build.mjs          # 构建并校验
node build.mjs --check  # 只校验
```

校验会拦截：
- 花括号不配对
- 引用了未定义的 `--my-*` 令牌（拼写错误）
- 缺少 `@settings` 块
- 组件层直接引用原始色板（警告）
