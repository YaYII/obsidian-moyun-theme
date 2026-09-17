/**
 * 墨韵 MoYun · 主题契约回归测试
 * ---------------------------------------------------------------------------
 * 为什么 CSS 项目也需要测试：主题没有编译器。构建脚本只做「括号配对 / 未定义令牌 /
 * 颜色函数类型 / 自我引用」这类静态校验，挡不住「中文排版关键属性被删」「明暗模式
 * 只改了一边」「组件层写死颜色」这类回归 —— 而它们恰恰是中文主题最容易退化的地方。
 *
 * 本文件把《开发契约》里可机检的条款固化成断言，共 28 项，分五组：
 *   一、构建产物完整性 —— theme.css 是否真的包含各部分
 *   二、清单一致性     —— manifest 与 package.json、演示库副本是否同步
 *   三、中文排版防线   —— 关键属性与豁免规则是否还在（本主题的核心价值）
 *   四、设计令牌纪律   —— 令牌引用、无效写法、明暗对称、动效降级
 *   五、设置面板结构   —— 配置块 YAML 重复键/未知类型等（曾经整块失效过）
 *
 * 运行：npm test          （需要先 npm install，仅测试需要依赖）
 * 范围：脚本用 --dir tests 把扫描范围钉在 tests/。
 *       不要改成 vitest run tests/ —— 位置参数是【子串匹配】，会连本目录下另一个
 *       独立仓库（obsidian-vault-bridge/tests/）一起跑进来，实测让门禁从
 *       「1 个文件 28 项」变成「9 个文件、3 个文件失败」。
 * 说明：构建与两类静态校验（build.mjs / check-conflicts.mjs）刻意保持【零依赖】，
 *       任何人在任何机器上都能直接 node 运行；只有测试使用标准工具链。
 */

import { describe, it, expect } from 'vitest';
import { validateSettings } from '../tools/lib/settings-parse.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const THEME = read('theme.css');
const MANIFEST = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

/** 递归收集 src/ 下的 CSS 文件 */
function collect(dir = SRC, base = SRC) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(full, base));
    else if (e.name.endsWith('.css')) {
      out.push({ rel: path.relative(base, full), css: fs.readFileSync(full, 'utf8') });
    }
  }
  return out;
}
const MODULES = collect();

/** 取出 @media print 块的真实范围（靠花括号配对，不能切到文件末尾） */
function printBlock() {
  const start = THEME.indexOf('@media print');
  let depth = 0;
  for (let i = THEME.indexOf('{', start); i < THEME.length; i++) {
    if (THEME[i] === '{') depth++;
    else if (THEME[i] === '}') { depth--; if (depth === 0) return THEME.slice(start, i + 1); }
  }
  return '';
}

/* ==========================================================================
 * 一、构建产物完整性
 * ======================================================================== */
describe('一、构建产物完整性', () => {
  it('theme.css 存在且以 @charset 开头', () => {
    expect(THEME.length, '构建产物过小，可能未正确构建').toBeGreaterThan(100_000);
    expect(THEME.startsWith('@charset'), 'theme.css 必须以 @charset "UTF-8" 开头').toBe(true);
  });

  it('theme.css 含且仅含一个 Style Settings 配置块', () => {
    const n = (THEME.match(/\/\* @settings/g) || []).length;
    expect(n, '应恰好有一个 @settings 块').toBe(1);
  });

  it('theme.css 包含 src/ 下的全部模块', () => {
    /* 刻意不硬编码模块数量：数量会随开发变化，写死只会制造无意义的失败。
     * 真正需要守住的是「src/ 里每个模块都出现在产物中」——
     * 这能抓住「新增了文件但没被构建脚本收集」这类真实问题。 */
    const missing = MODULES.filter((m) => !THEME.includes('模块：' + m.rel));
    expect(missing.map((m) => m.rel), '以下模块未进入构建产物').toEqual([]);
    expect(MODULES.length, '模块数不应为 0').toBeGreaterThan(0);
  });

  it('每个模块都带有中文说明注释', () => {
    for (const m of MODULES) {
      expect(/[\u4e00-\u9fa5]/.test(m.css.slice(0, 800)), m.rel + ' 开头缺少中文说明').toBe(true);
    }
  });

  it('花括号配对（逐模块）', () => {
    for (const m of MODULES) {
      const clean = m.css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''");
      let depth = 0;
      for (const ch of clean) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      expect(depth, m.rel + ' 花括号不配对').toBe(0);
    }
  });
});

/* ==========================================================================
 * 二、清单一致性
 * ======================================================================== */
describe('二、清单一致性', () => {
  it('manifest.json 具备 Obsidian 主题必需字段', () => {
    for (const k of ['name', 'version', 'minAppVersion', 'author']) {
      expect(MANIFEST[k], 'manifest 缺少字段 ' + k).toBeTruthy();
    }
  });

  it('manifest 与 package.json 版本一致', () => {
    expect(MANIFEST.version, '两处版本号不一致').toBe(PKG.version);
  });

  it('版本号符合语义化版本格式', () => {
    expect(MANIFEST.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('演示库中的主题副本与构建产物一致', () => {
    const p = path.join(ROOT, 'demo-vault', '.obsidian', 'themes', MANIFEST.name, 'theme.css');
    if (!fs.existsSync(p)) return; // 演示库未生成时跳过
    expect(fs.readFileSync(p, 'utf8'), '演示库副本过期，请重新运行 node build.mjs')
      .toBe(THEME);
  });
});

/* ==========================================================================
 * 三、中文排版防线（本主题的核心价值，最不能被回归破坏）
 * ======================================================================== */
describe('三、中文排版防线', () => {
  it('声明了中西文自动间距，且默认生效（不是加了类才开）', () => {
    expect(/text-autospace:\s*normal/.test(THEME), '缺少 text-autospace: normal').toBe(true);
    // 反向断言：不能写成"加了类才生效"，那会让未打开设置面板的用户静默失效
    expect(/body:not\(\.[a-z-]+\)[^{]*\{[^}]*text-autospace:\s*normal/.test(THEME),
      'text-autospace 不应依赖「加了类才生效」的写法').toBe(false);
  });

  it('首行缩进使用 2em（汉字宽度）而不是 2ch（数字宽度）', () => {
    expect(/--my-indent-cjk:\s*2em/.test(THEME), '缩进令牌应为 2em').toBe(true);
    expect(/text-indent:\s*2ch/.test(THEME),
      '2ch 是数字 0 的宽度，中文下只有约 1.1 个汉字').toBe(false);
  });

  it('首行缩进的豁免清单完整', () => {
    const need = [
      ['列表项', /li[\s\S]{0,90}?text-indent:\s*0/],
      ['引用块', /blockquote[\s\S]{0,90}?text-indent:\s*0/],
      ['标注', /callout[\s\S]{0,90}?text-indent:\s*0/],
      ['表格', /(td|th)[\s\S]{0,90}?text-indent:\s*0/],
      ['代码块', /pre[\s\S]{0,90}?text-indent:\s*0/],
      ['图片段落', /:has\(> img/],
      ['标题', /h6[\s\S]{0,90}?text-indent:\s*0/],
    ];
    for (const [name, re] of need) {
      expect(re.test(THEME), '首行缩进缺少对「' + name + '」的豁免').toBe(true);
    }
  });

  it('标题字重不超过 680（避免汉字笔画粘连）', () => {
    expect(THEME).toMatch(/--my-font-weight-heading:\s*6[0-7]\d/);
  });

  it('中文不使用伪斜体', () => {
    expect(/font-style:\s*normal/.test(THEME), '应显式关闭中文的伪斜体').toBe(true);
  });

  it('正文行高不低于 1.7（汉字方块密度高）', () => {
    const m = THEME.match(/--my-line-height-relaxed:\s*([\d.]+)/);
    expect(m, '缺少正文行高令牌').toBeTruthy();
    expect(parseFloat(m[1]), '正文行高偏低，中文应在 1.7 以上').toBeGreaterThanOrEqual(1.7);
  });

  it('中文字距默认为 0（字距会破坏右边缘对齐）', () => {
    const m = THEME.match(/--my-letter-spacing-cjk:\s*([\d.]+)(em)?/);
    expect(m, '缺少中文字距令牌').toBeTruthy();
    expect(parseFloat(m[1]), '中文字距偏大').toBeLessThanOrEqual(0.02);
  });

  it('打印媒体使用纯黑而非主题墨色', () => {
    expect(/--my-print-text:\s*#000/.test(THEME), '打印文本色应为纯黑').toBe(true);
    const block = printBlock();
    expect(block.length, '未取到 @media print 块').toBeGreaterThan(100);
    expect(/color:\s*var\(--my-text-primary\)/.test(block),
      '打印块中不应使用屏幕墨色，纸上会偏灰').toBe(false);
  });
});

/* ==========================================================================
 * 四、设计令牌纪律
 * ======================================================================== */
describe('四、设计令牌纪律', () => {
  it('所有引用的 --my-* 令牌都有定义（或来自设置面板与白名单）', () => {
    const defined = new Set();
    for (const m of THEME.matchAll(/(--my-[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
    // 设置面板的 id 会在运行时写成 CSS 变量
    const settings = THEME.slice(THEME.indexOf('/* @settings'));
    for (const m of settings.matchAll(/^\s+id:\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*$/gm)) {
      defined.add('--' + m[1]);
    }
    // 由外部提供的令牌（扩展点 / Obsidian 本体）登记在白名单里
    const extFile = path.join(ROOT, 'tools', 'external-tokens.txt');
    if (fs.existsSync(extFile)) {
      for (const line of fs.readFileSync(extFile, 'utf8').split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#')) defined.add(t);
      }
    }
    const missing = new Set();
    for (const m of THEME.matchAll(/var\(\s*(--my-[a-z0-9-]+)/g)) {
      if (!defined.has(m[1])) missing.add(m[1]);
    }
    expect([...missing], '存在未定义的令牌引用').toEqual([]);
  });

  it('不存在 hsl(var(--my-*-rgb) / α) 这类无效写法', () => {
    expect(/hsl\(\s*var\(--my-[a-z-]*-rgb\)/.test(THEME),
      'RGB 三元组不能用于 hsl()，该声明会被浏览器静默丢弃').toBe(false);
  });

  it('不存在自定义属性自我引用（会导致该变量整体失效）', () => {
    // 必须先剔除注释：文档里会刻意写出反例作为警示，那是说明文字而非真实声明
    const code = THEME.replace(/\/\*[\s\S]*?\*\//g, '');
    const hits = [...code.matchAll(/(--my-[a-z0-9-]+)\s*:\s*var\(--[a-z-]*,\s*var\(\1\)\)/g)]
      .map((m) => m[0]);
    expect(hits, '存在自我引用的自定义属性').toEqual([]);
  });

  it('明暗双模式都定义了全部语义色彩令牌', () => {
    const need = ['--my-surface-primary', '--my-text-primary', '--my-accent',
      '--my-success', '--my-danger', '--my-border'];
    // 语义色彩令牌只在 tokens.css 中按模式定义，故直接检查该源文件：
    // 在拼接后的 theme.css 里切片会被 obsidian-map.css 更早出现的同名规则干扰
    const tokens = read('src/00-tokens/tokens.css');
    const li = tokens.indexOf('.theme-light');
    const di = tokens.indexOf('.theme-dark');
    expect(li >= 0 && di > li, 'tokens.css 中未按预期出现明暗模式块').toBe(true);
    const light = tokens.slice(li, di);
    const dark = tokens.slice(di);
    for (const t of need) {
      expect(light.includes(t + ':'), '明色模式缺少 ' + t).toBe(true);
      expect(dark.includes(t + ':'), '暗色模式缺少 ' + t).toBe(true);
    }
  });

  it('八大韵色全部就位', () => {
    for (const tone of ['qinghua', 'zhusha', 'zhuqing', 'tengzi',
      'qiuxiang', 'daiqing', 'yanzhi', 'songyan']) {
      expect(THEME.includes('my-tone-' + tone), '缺少韵色 ' + tone).toBe(true);
    }
  });

  it('每个含动效的模块都提供 prefers-reduced-motion 兜底', () => {
    for (const m of MODULES) {
      if (m.rel.startsWith('00-tokens')) continue;
      const hasMotion = /transition\s*:/.test(m.css) || /animation\s*:/.test(m.css);
      if (hasMotion) {
        expect(/prefers-reduced-motion/.test(m.css), m.rel + ' 含动效但缺少兜底').toBe(true);
      }
    }
  });

  it('组件层不写死颜色（令牌层除外）', () => {
    const offenders = [];
    for (const m of MODULES) {
      if (m.rel.startsWith('00-tokens')) continue;
      const clean = m.css.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const hit of clean.matchAll(/(?:^|[\s:(,])(#[0-9a-fA-F]{3,8})\b/g)) {
        offenders.push(m.rel + ' → ' + hit[1]);
      }
    }
    expect(offenders, '组件层出现写死颜色').toEqual([]);
  });
});

describe('五、设置面板 YAML 结构（一次真实事故的回归防线）', () => {
  /* 事故回顾：给「内容增强」分组插新设置项时，插入点落在分组头与它的后续键之间，
   * 于是分组头的 description/type/level/collapsed 被挂到了新项上 —— 同一映射里
   * 出现重复键。Style Settings 抛 YAMLException，整个设置面板变成
   * 「No style settings found」，主题 36 个设置项全部失效。
   * 当时构建全绿，因为它只查了「块存在 + 有 name/id」。 */
  const BROKEN = [
    '/* @settings',
    'name: 墨韵（MoYun）',
    'id: moyun',
    'settings:',
    '  -',
    '    id: group-enhance',
    '    title: "内容增强"',
    '  -',
    '    id: my-mermaid-style',
    '    title: 图表风格',
    '    description: 新加的说明',
    '    type: class-select',
    '    default: my-mermaid-ink',
    '    options:',
    '      - value: my-mermaid-ink',
    '        label: 墨韵',
    '      - value: my-mermaid-cyber',
    '        label: 赛博',
    '    description: 以下均为可选特性，按需开启。',
    '    type: heading',
    '    level: 1',
    '    collapsed: true',
    '*/',
  ].join('\n');

  it('真实主题的 @settings 块结构合法（无重复键、无未知类型）', () => {
    const r = validateSettings(THEME);
    expect(r.errors).toEqual([]);
    expect(r.count).toBeGreaterThan(30);
  });

  it('能抓出「切断分组头」造成的重复键（本条若失效，事故会重演）', () => {
    const r = validateSettings(BROKEN);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.join('\n')).toMatch(/键 description 重复/);
    expect(r.errors.join('\n')).toMatch(/键 type 重复/);
  });

  it('不会把嵌套 options 里重复出现的 - value 误判为重复键', () => {
    const nested = [
      '/* @settings',
      'name: x', 'id: y', 'settings:', '  -', '    id: a', '    title: A',
      '    type: class-select', '    default: a1', '    options:',
      '      - value: a1', '        label: 一',
      '      - value: a2', '        label: 二',
      '      - value: a3', '        label: 三',
      '*/',
    ].join('\n');
    expect(validateSettings(nested).errors).toEqual([]);
  });

  it('能抓出 default 落在 min/max 之外这类静默失效', () => {
    const bad = [
      '/* @settings', 'name: x', 'id: y', 'settings:', '  -',
      '    id: a', '    title: A', '    type: variable-number-slider',
      '    default: 99', '    min: 0', '    max: 10',
      '*/',
    ].join('\n');
    expect(validateSettings(bad).errors.join('\n')).toMatch(/大于 max/);
  });
});
