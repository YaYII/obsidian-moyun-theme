<div align="center">

# MoYun

**A Chinese-first theme for Obsidian — typography rebuilt for Han characters**

# 墨韵 MoYun

**一个中文优先的 Obsidian 主题 —— 为汉字的阅读与写作重新设计排版**

> In the community directory the theme is called **MoYun** (the directory only allows
> Basic Latin in theme names). 墨韵 is its Chinese name: 墨 *ink*, 韵 *resonance*.
> 在社区目录里名为 **MoYun**（官方要求主题名只用基本拉丁字符），中文名「墨韵」。

![MoYun theme preview](./screenshot.png)

![version](https://img.shields.io/badge/version-1.1.6-3a6ea5)
![Obsidian](https://img.shields.io/badge/Obsidian-1.6.0%2B-477a5b)
![license](https://img.shields.io/badge/license-MIT-8a8170)
![modules](https://img.shields.io/badge/modules-36-7159a3)

</div>

---

<a id="sponsor"></a>

## Sponsor / 赞助

**English** — MoYun is a spare-time project: reading standards, measuring real browser
behaviour, and writing the checks that keep it honest. If it makes reading Chinese in
Obsidian a little more comfortable, you can buy me a cup of tea. **Entirely optional —
every feature stays free.**

**中文** —— 墨韵是业余时间的作品：查规范、实测浏览器行为、写检查脚本，
光是为了搞清「为什么 Mermaid 图里的字会隐形」就翻过 Obsidian 的 asar 包。
如果它让你的中文阅读舒服了一点，欢迎扫码请我喝杯茶 —— **完全自愿，不影响任何功能**。

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/sponsor/wechat-pay.jpg" alt="WeChat Pay QR code / 微信支付收款码" width="260" />
      <br /><b>WeChat Pay / 微信支付</b>
    </td>
    <td align="center" width="50%">
      <img src="docs/sponsor/alipay.jpg" alt="Alipay QR code / 支付宝收款码" width="260" />
      <br /><b>Alipay / 支付宝</b>
    </td>
  </tr>
</table>

Three things that help just as much as money / 不花钱也能帮上忙：

1. Star or vote for it in the [community directory](https://community.obsidian.md/themes) /
   在社区目录里给它点个赞；
2. Report what is broken — the dark-mode table and the invisible Mermaid text were both
   found by users / 提 Issue 告诉我哪里不好用；
3. Recommend it to anyone who writes Chinese in Obsidian / 推荐给身边用中文写笔记的人。

---

## English

### Why another theme?

Obsidian has many excellent themes, but almost all of them are designed for English prose.
The problem is not colour — it is that the typographic rules simply do not hold for Chinese.
Take the six issues that matter most when reading Han characters on screen:

| Issue | What English defaults do | What Chinese needs |
|---|---|---|
| Line height | 1.3–1.4 is comfortable | Han glyphs are dense squares; 1.4 feels cramped, 1.7–1.9 reads well |
| Script mixing | No spacing rule between scripts | A quarter-em gap between Chinese and Latin/digits |
| Punctuation | Full-width marks keep their full box | Consecutive full-width marks should compress |
| Paragraphs | Block paragraphs, blank line between | First-line indent of two characters, no blank line |
| Line breaking | Breaks at spaces | Must not start a line with closing punctuation, nor end with opening punctuation |
| Headings | Weight 700+ reads as "bold" | At 700+ Chinese strokes bleed together; 650 plus whitespace reads better |

MoYun rebuilds all six from the ground up, on top of the CSS Text Level 4 features that
Chromium gained recently (`text-autospace`, `text-wrap: pretty`, `line-break: strict`) —
no plugin, no JavaScript, no changes to your notes.

### What it does differently

1. **Chinese typography as the default, not a preset.** Inter-script spacing, orphan control,
   1.8 line height, two-character first-line indent (with a careful exemption list for lists,
   quotes, tables, code, maths and image-only paragraphs), weight 650 headings, and no fake
   italics — Chinese has no true italic, so emphasis uses weight and colour instead.
2. **Government-document mode, on by default.** A faithful implementation of GB/T 9704-2012
   (the Chinese official-document standard): FangSong body text, SimHei for first-level and
   KaiTi for second-level headings, justified text, full-grid tables, and A4 page rules when
   printing. Prefer general-purpose typography? Turn it off in Style Settings. Dark mode
   changes only the paper and ink colours — the document rules stay intact.
3. **Eight accent colours** drawn from traditional Chinese pigments — 青花 qinghua (blue),
   朱砂 zhusha (cinnabar), 竹青 zhuqing (bamboo), 藤紫 tengzi (wisteria), 秋香 qiuxiang
   (olive), 黛青 daiqing (dark cyan), 胭脂 yanzhi (rouge), 松烟 songyan (ink grey) — each
   calibrated against WCAG AA contrast in both light and dark mode.
4. **Paper-white day mode, ink-black night mode.** The dark theme is not an inversion: it uses
   warm off-white text on deep ink instead of pure white on pure black, which is far easier on
   the eyes over a long evening.
5. **Resolution-adaptive sizing.** Font size and measure scale with window width, so text stays
   comfortable on a 4K display instead of shrinking into unreadability. Obsidian's own font
   size and font-family settings are respected rather than overridden — themes should not fight
   the host.
6. **Mermaid diagrams are themed too**, in six selectable styles: ink (follows the accent
   colour), four neon variants (cyan, matrix green, violet, amber, each on its own dark canvas),
   and a print-friendly black-and-white line style.

### Install

1. **Settings → Appearance → Themes → Manage**, search for `MoYun`, install, then select it.
2. Install the **Style Settings** community plugin — it unlocks the theme's 36 options.
3. Restart Obsidian or switch theme once after updating, so the new CSS is picked up.

Manual install: copy `theme.css` and `manifest.json` into `<vault>/.obsidian/themes/MoYun/`.

### Settings

Style Settings exposes 36 options in eight groups, all documented — each one explains the
trade-off rather than just offering a slider:

| Group | What is in it |
|---|---|
| 📄 Document tone | Government style (on), justify, indent |
| 🎨 Colours | The eight accent colours |
| 🀄 Chinese typography | Line height, paragraph spacing, letter spacing, indent, punctuation |
| 🔤 Fonts | Body / heading / code families, font size tuning |
| 📐 Line & measure | Measure (characters per line), editor padding, adaptive sizing |
| 🖥 Interface | Compact UI, tab and sidebar details |
| ✨ Content | Diagram style, heading numbers, rainbow folders, image grid and more |
| ⚙️ Advanced | Print, immersive mode, plugin compatibility |

### Development

The theme is modular source plus a build step, not one huge CSS file:

```
src/ (36 modules)  →  node build.mjs  →  theme.css (~262 KB)
```

- **Build-time checks (`node build.mjs`)**: brace pairing, comment integrity, undefined design
  tokens, palette-layer misuse, invalid colour functions, self-referencing custom properties,
  Style Settings block structure (duplicate keys in that YAML block once broke the whole
  settings panel), and whether the committed `theme.css` is stale.
- **Visual verification (`node tools/verify.mjs`)**: renders the real Obsidian DOM with the real
  `app.css` in Chromium and asserts **59 computed styles in both light and dark mode** —
  including contrast ratios against WCAG AA, and that the editor and reading views agree.
- **Mermaid verification (`node tools/check-mermaid.mjs`)**: renders real diagrams with
  Obsidian's own initialisation arguments, checks every text element's contrast, asserts no
  inversion filter is applied, and cross-checks computed styles against real screenshot pixels.
- **Tests**: `npm test` (28 assertions over the project's own contracts).
- **Lean artifact**: the shipped `theme.css` carries no explanatory comments — they are
  nearly half the source and would be parsed by the browser on every load. Module banners and
  the Style Settings block are preserved. Run `node build.mjs --comments` if you want the
  fully annotated build to read alongside the source.

### Honest limitations

- Two of the six typographic features depend on fairly recent Chromium versions; on older
  Obsidian builds they degrade gracefully rather than breaking the layout.
- `text-spacing-trim` (punctuation compression) is currently a no-op with Noto Sans CJK: it
  needs the font's `chws` feature, which that family does not ship. There is a setting that
  uses `halt` instead.
- The theme is opinionated: it is built for reading and writing Chinese. If you mostly write
  English, plenty of other themes will suit you better.

### License

MIT. See [LICENSE](LICENSE).

---

## 中文说明

完整的简体中文文档（含设计取舍、定制指南、能力边界与致谢）在 **[docs/zh/README.md](docs/zh/README.md)**，
下面是速览。

### 它解决什么

英文主题默认的行高、字距、断行与标点规则都是为拉丁文字设计的，直接套到中文上就是「挤」。
墨韵在 Chromium 原生的 CSS Text Level 4 能力（`text-autospace` / `text-wrap: pretty` /
`line-break: strict`）之上，逐条重做了中文排版：中西文自动间距、行高 1.8、首行缩进两字
（列表 / 引用 / 表格 / 代码 / 公式 / 纯图片段落自动豁免）、标题字重 650、不用伪斜体。

### 六项特性

1. **公文风格默认开启** —— 依据 GB/T 9704-2012：仿宋正文、黑体与楷体分级标题、两端对齐、
   全框线表格，打印时回到 A4 页边距；不需要可在设置里关掉。深色模式只换纸墨颜色，
   排版规范不变。
2. **八大韵色** —— 青花 / 朱砂 / 竹青 / 藤紫 / 秋香 / 黛青 / 胭脂 / 松烟，明暗两模式都按
   对比度标准校准过。
3. **日间宣纸 / 夜间墨夜** —— 夜间是暖白压在深墨上，不是纯白配纯黑。
4. **分辨率自适应字号** —— 字号与版心随窗口宽度缩放，4K 屏不再逼着眼睛看小字；
   同时尊重 Obsidian 自带的字体与字号设置。
5. **Mermaid 图表六种风格** —— 墨韵（跟随主题色）、赛博霓虹四套配色、极简黑白线框。
6. **全中文的设置面板** —— 36 个选项分八组，每一项都写清取舍而不只是给个滑杆。

### 安装

1. **设置 → 外观 → 主题 → 管理**，搜索 `MoYun` 安装并启用；
2. 安装 **Style Settings** 社区插件，才能打开主题的 36 个选项；
3. 更新主题后重启 Obsidian 或切换一次主题，让新样式生效。

手动安装：把 `theme.css` 与 `manifest.json` 放进 `<库>/.obsidian/themes/MoYun/`。

### 开发与验证

```
src/（36 个模块）  →  node build.mjs  →  theme.css（约 262 KB）
```

构建期会做括号配对、注释结构、未定义令牌、无效颜色函数、设置面板 YAML 结构、
产物是否陈旧等检查；`node tools/verify.mjs` 用真实 Obsidian DOM 断言 **59 项计算样式 ×
明暗两模式**；`node tools/check-mermaid.mjs` 用真实 Mermaid 渲染六类图并逐元素校验对比度。

### 许可

MIT，详见 [LICENSE](LICENSE)。
