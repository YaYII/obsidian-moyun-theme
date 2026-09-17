#!/usr/bin/env node
/**
 * 墨韵 MoYun · 构建脚本
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 按编号顺序拼接 src/ 下的模块化 CSS，产出可直接安装的 theme.css；
 *   2. 做静态校验（括号配对、未知令牌、Style Settings 块、禁用词）；
 *   3. 输出体积与模块明细报告，并支持 --watch 增量构建。
 *
 * 用法：
 *   node build.mjs              一次性构建（产物剥离说明性注释）
 *   node build.mjs --comments   构建带完整注释的版本（便于对照阅读）
 *   node build.mjs --watch      监听 src/ 变化自动重建
 *   node build.mjs --check      只校验不写文件（CI 用）
 */

import fs from 'node:fs';
/* 零依赖的 Style Settings 配置块校验器（构建与测试共用同一份实现） */
import { validateSettings } from './tools/lib/settings-parse.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'theme.css');

/* 相对路径缓存。
 * 性能剖析显示 path.relative 及其内部的路径规范化合计占构建 CPU 的 14%，
 * 而同一批文件在多个校验环节里被反复取相对路径，因此这里缓存一次。 */
const relCache = new Map();
const relPath = (file) => {
  let v = relCache.get(file);
  if (v === undefined) { v = path.relative(SRC, file); relCache.set(file, v); }
  return v;
};

const args = new Set(process.argv.slice(2));
const WATCH = args.has('--watch');
const CHECK_ONLY = args.has('--check');
/* 产物默认剥离说明性注释：它们占了近一半体积，而浏览器每次加载都要解析一遍。
 * 想读带注释的版本（比如对照源码学习）加 --comments。 */
const KEEP_COMMENTS = args.has('--comments');

/* ---------------------------------------------------------------------------
 * 工具：递归收集 CSS 文件，并按「目录名 + 文件名」排序，保证构建可复现。
 * ------------------------------------------------------------------------ */
function collectCss(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectCss(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  /* 用【码位序】而不是 localeCompare 排序。
   * localeCompare 的结果取决于运行环境的 ICU/语言数据版本，不同 Node 版本或
   * 不同 locale 下，对含连字符与数字前缀的文件名可能给出不同顺序 —— 那会让
   * CI 构建出的 theme.css 与本地不同（内容顺序变了，hash 就不一样）。
   * 直接比较字符串走的是码位序，跨平台、跨 Node 版本完全确定。 */
  return out.sort((a, b) => {
    const ra = path.relative(SRC, a);
    const rb = path.relative(SRC, b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
}

/* ---------------------------------------------------------------------------
 * 注释剥离（产物瘦身）
 * ---------------------------------------------------------------------------
 * 动机：theme.css 曾达 487 KB，其中注释占 241 KB（49.6%）。注释对读源码的人有价值，
 * 但对最终产物没有意义 —— 浏览器每次加载都要完整解析一遍，用户也不会去读它。
 * 目录校验也会因此提示「Theme CSS file is larger than recommended」。
 *
 * 三类注释必须保命（剥离时会漏功能或漏测试）：
 *   ① Style Settings 配置块 —— 它本身就是一条注释，插件靠它识别主题设置；漏了整个
 *      设置面板就空了；
 *   ② 模块横幅 —— 用来在产物里定位模块归属，测试也靠它断言「src 里每个模块都进了产物」；
 *   ③ 文件头 —— 由 header 单独拼接，本来就不经过这里。
 *
 * 实现要点：必须区分「字符串里的 /*」与真实注释。CSS 的 content 属性里可能出现任意
 * 字符，用正则一把梭会误伤；这里用状态机逐字符走。
 * ------------------------------------------------------------------------ */
function stripComments(css) {
  const parts = [];
  let inComment = false;
  let inString = null;
  let buf = '';
  let comment = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];
    if (inComment) {
      comment += ch;
      if (ch === '*' && next === '/') {
        comment += next;
        i++;
        inComment = false;
        /* 保命注释原样留下，其余丢弃 */
        if (comment.includes('@settings') || comment.includes('模块：')) {
          buf += comment;
        } else if (!comment.includes('@settings')) {
          /* 丢掉注释后可能留下孤立的空行，压一压 */
        }
        comment = '';
      }
      continue;
    }
    if (inString) {
      buf += ch;
      if (ch === '\\') { buf += css[i + 1] ?? ''; i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '/' && next === '*') { inComment = true; comment = '/*'; i++; continue; }
    if (ch === '"' || ch === "'") { inString = ch; buf += ch; continue; }
    buf += ch;
  }
  return buf
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------------------------------------------------------------------------
 * 校验器：在写盘前把问题挡下来。
 * ------------------------------------------------------------------------ */
function validate(files, contents) {
  const errors = [];
  const warnings = [];
  /* 预计算相对路径：validate 内部多处需要它，反复调用 path.relative 会在
   * 路径规范化上浪费可观 CPU（实测占构建 CPU 的 14%）。 */

  // 1. 括号配对（忽略字符串与注释内的括号，避免误报）
  for (const f of files) {
    const src = contents.get(f);
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"(?:[^"\\\\]|\\\\.)*"/g, '""')
      .replace(/'(?:[^'\\\\]|\\\\.)*'/g, "''");
    let depth = 0;
    let minDepth = 0;
    for (const ch of stripped) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth < minDepth) minDepth = depth; }
    }
    if (depth !== 0) {
      errors.push(`[${path.relative(ROOT, f)}] 花括号不配对，多余 ${depth > 0 ? '未闭合 {' : '多余的 }'} 共 ${Math.abs(depth)} 个`);
    }
  }

  /* 1.5 注释结构检查（硬错误）
   * 规则来源：一次真实打回 —— 插入新模块时吃掉了某个注释块的开头标记，
   * 只剩悬挂的一行「星号 + 九、打印：…」和一个孤立的结束标记。CSS 解析器把
   * 它当成选择器的一部分，Obsidian 目录校验直接报 CSS parse error，整个提交被拒。
   * 花括号配对检查发现不了它（花括号仍然成对），所以这里用状态机单独扫一遍：
   *   · 不在注释里却遇到结束标记 → 多余的注释结束符
   *   · 文件结束时仍在注释里     → 注释未闭合
   * 说明：本段注释刻意不写出那两个标记的字面形式 —— 写出来会把这段注释提前结束
   * （同一类错误，只是发生在 JS 里）。 */
  for (const f of files) {
    const src = contents.get(f);
    let inComment = false;
    let line = 1;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\n') { line++; continue; }
      if (!inComment && ch === '/' && src[i + 1] === '*') { inComment = true; i++; continue; }
      if (inComment && ch === '*' && src[i + 1] === '/') { inComment = false; i++; continue; }
      if (!inComment && ch === '*' && src[i + 1] === '/') {
        errors.push(`[${path.relative(ROOT, f)}] 第 ${line} 行有多余的注释结束符 */（缺少配对的 /*），CSS 解析会失败`);
      }
    }
    if (inComment) {
      errors.push(`[${path.relative(ROOT, f)}] 注释块未闭合（缺少 */），CSS 解析会失败`);
    }
  }

  // 2. 收集全部已定义令牌，找出被引用但从未定义的 --my-*（拼写错误的主要来源）
  //    注意：Style Settings 面板里的 setting id 会在运行时写成 CSS 变量，
  //    它们不在源码中定义，必须先登记为"外部提供"，否则会误报。
  const defined = new Set();
  const allSource = [...contents.values()].join('\n');
  const settingsBlock = allSource.includes('/* @settings')
    ? allSource.slice(allSource.indexOf('/* @settings'))
    : '';
  for (const m of settingsBlock.matchAll(/^\s+id:\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*$/gm)) {
    defined.add('--' + m[1]);
  }
  // 构建期允许声明"由外部（样式设置 / 用户 style 标签）提供"的令牌白名单
  const externalFile = path.join(ROOT, 'tools', 'external-tokens.txt');
  if (fs.existsSync(externalFile)) {
    for (const line of fs.readFileSync(externalFile, 'utf8').split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) defined.add(t);
    }
  }

  const usedRaw = new Map();
  for (const f of files) {
    const src = contents.get(f);
    for (const m of src.matchAll(/(--my-[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
    for (const m of src.matchAll(/var\(\s*(--my-[a-z0-9-]+)/g)) {
      if (!usedRaw.has(m[1])) usedRaw.set(m[1], []);
      usedRaw.get(m[1]).push(path.relative(ROOT, f));
    }
  }
  const undefinedTokens = [...usedRaw.keys()].filter((t) => !defined.has(t));
  for (const t of undefinedTokens) {
    const where = [...new Set(usedRaw.get(t))].join(', ');
    errors.push(`引用了未定义的令牌 ${t}（出现在 ${where}）`);
  }

  /* 2.5 同一规则内重复声明同一属性（提示级）
   * 规则来源：Obsidian 目录校验报了一处 "Unexpected duplicate line-height" ——
   * 公文表格里同时写了 1.6 与 1.5，后者生效、前者白写，属于改样式时的残留。
   * 这类问题不报错、不影响解析，只会让人以为写的值生效了，所以留在提示级。 */
  for (const f of files) {
    const body = contents.get(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = body.split('\n');
    let block = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('{')) { block = { line: i + 1, props: new Map() }; continue; }
      if (line.includes('}')) {
        if (block) {
          for (const [prop, at] of block.props) {
            if (at.length > 1) {
              warnings.push(`[${path.relative(ROOT, f)}] 第 ${block.line} 行起的规则里，${prop} 被声明了 ${at.length} 次（行 ${at.join('、')}），只有最后一次生效`);
            }
          }
        }
        block = null;
        continue;
      }
      if (!block) continue;
      const m = line.match(/^\s*(--[a-zA-Z0-9-]+|[a-z-]+)\s*:/);
      if (!m) continue;
      const prop = m[1];
      if (!block.props.has(prop)) block.props.set(prop, []);
      block.props.get(prop).push(i + 1);
    }
  }

  // 3. 组件层禁止直接使用原始色板（必须经语义令牌）
  const paletteOnly = ['--my-ink-', '--my-slate-', '--my-qinghua-', '--my-zhusha-',
    '--my-zhuqing-', '--my-tengzi-', '--my-qiuxiang-', '--my-daiqing-',
    '--my-yanzhi-', '--my-songyan-', '--my-tone-'];
  for (const f of files) {
    const rel = relPath(f);
    // 令牌层允许直接用原始色板；组件层不允许
    if (rel.startsWith('00-tokens')) continue;
    const src = contents.get(f);
    for (const m of src.matchAll(/var\(\s*(--my-[a-z0-9-]+)/g)) {
      const tok = m[1];
      if (paletteOnly.some((p) => tok.startsWith(p))) {
        warnings.push(`[${rel}] 直接引用了原始色板 ${tok}，建议改用语义令牌`);
      }
    }
  }

  // 4. Style Settings 配置块必须存在且格式正确
  const all = [...contents.values()].join('\n');
  if (!all.includes('/* @settings')) {
    errors.push('缺少 /* @settings 配置块，Style Settings 插件将无法识别主题设置');
  } else {
    const block = all.slice(all.indexOf('/* @settings'), all.indexOf('*/', all.indexOf('/* @settings')));
    if (!/^\s*name:/m.test(block)) errors.push('@settings 块缺少 name 字段');
    if (!/^\s*id:/m.test(block)) errors.push('@settings 块缺少 id 字段');
    /* 结构校验：重复键会让 Style Settings 抛 YAMLException，整个设置面板失效。
     * 这是真发生过的事故 —— 插新设置项时切断了分组头，它的后续键被挂到新项上，
     * 同一映射里出现两个 description / 两个 type。当时只查「块存在 + 有 name/id」，
     * 粒度太粗，全绿放行。详见 tools/lib/settings-parse.mjs 的说明。 */
    const report = validateSettings(all);
    errors.push(...report.errors);
    warnings.push(...report.warnings);
  }

  // 5. 中文主题不应出现会破坏 CJK 排版的禁用写法
  for (const f of files) {
    const src = contents.get(f);
    const rel = path.relative(ROOT, f);
    // letter-spacing 大正值（>0.15em）会把汉字拉开成散字
    for (const m of src.matchAll(/letter-spacing:\s*([0-9.]+)em/g)) {
      if (parseFloat(m[1]) > 0.15) {
        warnings.push(`[${rel}] letter-spacing ${m[1]}em 偏大，汉字会被拉开`);
      }
    }
    if (/text-transform:\s*uppercase/.test(src) && !rel.includes('code')) {
      warnings.push(`[${rel}] text-transform: uppercase 对中文无效，请确认是有意为之`);
    }
  }


  // 6. 开发契约校验（把「可机检的约定」固化进构建，避免后续改动悄悄破坏）
  //    为什么放进构建而不是单独的测试文件：本主题刻意保持零依赖，任何需要先
  //    npm install 才能跑的检查都有「忘了跑」的风险。
  const contractErrors = [];
  const contractWarns = [];
  for (const f of files) {
    const rel = relPath(f);
    const raw = contents.get(f);
    /* 先剔除注释再做契约统计 —— 否则注释里「说明 Obsidian 硬编码了 #FAFAFA」
     * 这类解释性文字会被误判成真的写死了颜色，产生假告警。 */
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const isTokens = rel.startsWith('00-tokens');

    // 6.1 每个模块开头必须有中文说明注释块（本项目要求注释一律中文）
    const head = raw.slice(0, 800);
    if (!/[\u4e00-\u9fa5]/.test(head)) {
      contractErrors.push('[' + rel + '] 文件开头缺少中文说明注释块');
    }

    // 6.2 组件层禁止写死颜色（令牌层是颜色值的唯一出处，允许字面量）
    if (!isTokens) {
      for (const m of src.matchAll(/(?:^|[\s:(,])(#[0-9a-fA-F]{3,8})\b/g)) {
        contractWarns.push('[' + rel + '] 出现写死的十六进制颜色 ' + m[1] + '，请改用语义令牌');
      }
      for (const m of src.matchAll(/\b(?:rgb|rgba|hsl|hsla)\(\s*[0-9]/g)) {
        contractWarns.push('[' + rel + '] 出现写死的颜色函数 ' + m[0] + '，请改用语义令牌');
      }
    }

    // 6.3 有过渡或动画的模块必须提供 prefers-reduced-motion 兜底
    const hasMotion = /transition\s*:/.test(src) || /animation\s*:/.test(src);
    if (hasMotion && !/prefers-reduced-motion/.test(src) && !isTokens) {
      contractWarns.push('[' + rel + '] 含 transition/animation 但缺少 @media (prefers-reduced-motion: reduce) 兜底');
    }

    // 6.4 对中文完全无效的声明
    for (const m of src.matchAll(/text-transform:\s*(uppercase|capitalize|lowercase)/g)) {
      contractWarns.push('[' + rel + '] ' + m[0] + ' 对汉字无效');
    }

    /* 6.5 !important 用量：默认 3 处以内。
     * 个别模块面对的是【第三方注入到 DOM 内部的 ID 选择器样式】（典型是 Mermaid
     * 把配色写进 SVG 内部的 <style>#mermaid-1 .node rect{...}</style>），外部选择器
     * 无论怎么写都赢不了，!important 是唯一手段。这类模块可以在文件头用一行 CSS
     * 注释申请预算，写法是 @important-budget 后面跟数字，破折号后写理由（不少于
     * 10 个字）。申请了预算就按预算判定；写了标记但理由不完整则直接报错 ——
     * 不允许无理由开口子。 */
    const bang = (src.match(/!important/g) || []).length;
    const budgetDecl = raw.match(/@important-budget\s+(\d+)\s*[—–-]\s*([^\n*]{10,})/);
    if (/@important-budget/.test(raw) && !budgetDecl) {
      contractErrors.push('[' + rel + '] @important-budget 声明不完整，应为「@important-budget 数字 — 理由」');
    } else if (budgetDecl) {
      const limit = Number(budgetDecl[1]);
      if (bang > limit) {
        contractWarns.push('[' + rel + '] 使用了 ' + bang + ' 处 !important，超出已声明预算 ' + limit + ' 处');
      }
    } else if (bang > 3) {
      contractWarns.push('[' + rel + '] 使用了 ' + bang + ' 处 !important，请确认无法用更具体的选择器替代');
    }
  }

  // 7. 颜色函数与令牌类型必须匹配（硬错误）
  //    --my-*-rgb 是【空格分隔的 RGB 三元组】（如 "58 110 165"），只能用于
  //    rgb(var(--x) / α)。写成 hsl(var(--x) / α) 会因参数个数不符被浏览器
  //    【静默丢弃整条声明】—— 不报错、不警告，只是样式没生效，是最难排查的一类缺陷。
  //    （本项目开发期就曾因此让 15 处强调色浮层集体失效。）
  for (const f of files) {
    const rel = relPath(f);
    const src = contents.get(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/hsl\(\s*var\((--my-[a-z-]*-rgb)\)/g)) {
      errors.push('[' + rel + '] ' + m[1] + ' 是 RGB 三元组，不能用于 hsl()，该声明会被静默丢弃；请改用 rgb(var(...) / α)');
    }
    for (const m of src.matchAll(/rgba\(\s*var\((--my-[a-z-]*-rgb)\)\s*,/g)) {
      errors.push('[' + rel + '] ' + m[1] + ' 是空格分隔三元组，不能用于逗号形式的 rgba()；请改用 rgb(var(...) / α)');
    }
  }

  // 8. 自定义属性自我引用（硬错误）
  //    --x: var(--y, var(--x)) 这类写法会让 --x 在计算值阶段失效（CSS 规范），
  //    且不报任何错。必须连同注释一起剔除后再检查 —— 注释里会写反例做说明。
  for (const f of files) {
    const rel = relPath(f);
    const code = contents.get(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/(--my-[a-z0-9-]+)\s*:\s*var\(--[a-z-]*,\s*var\(\1\)\)/g)) {
      errors.push('[' + rel + '] 存在自我引用：' + m[0] + '，该变量会在计算值阶段失效');
    }
  }

  // 9. 颜色值变量不得被 rgb()/hsl() 包裹（硬错误）
  //    规则来源：本项目先后踩过两次同类坑 ——
  //      ① hsl(var(--my-accent-rgb) / α)：三元组误用于 hsl()，15 处声明失效；
  //      ② rgb(var(--callout-color))：颜色值误套 rgb()，六种标注全部失去颜色。
  //    判定：以 -rgb 结尾的是三元组（合法）；以 -hsl 结尾的是 Obsidian 原生的
  //    HSL 三元组（合法）；其余颜色变量都是完整颜色值，套 rgb()/hsl() 会静默失效。
  for (const f of files) {
    const rel = relPath(f);
    const src = contents.get(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/(?:rgb|hsl|rgba|hsla)\(\s*var\((--[a-z0-9-]+)/g)) {
      const v = m[1];
      if (v.endsWith('-rgb') || v.endsWith('-hsl')) continue;
      errors.push('[' + rel + '] ' + v + ' 是颜色值而非三元组，不能被 rgb()/hsl() 包裹（会导致声明静默失效）');
    }
  }
  errors.push(...contractErrors);
  warnings.push(...contractWarns);
  return { errors, warnings };
}

/* ---------------------------------------------------------------------------
 * 构建主流程
 * ------------------------------------------------------------------------ */
function build({ silent = false } = {}) {
  const files = collectCss(SRC);
  if (files.length === 0) {
    console.error('✗ src/ 下没有找到任何 CSS 文件');
    process.exitCode = 1;
    return false;
  }

  const contents = new Map();
  for (const f of files) contents.set(f, fs.readFileSync(f, 'utf8'));

  const { errors, warnings } = validate(files, contents);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

  /* 产物头部刻意【不含时间戳】。
   * 原因：一旦写入生成时间，相同源码每次构建都会产出不同文件，导致
   *   ① 构建不可复现，无法用 sha256 校验 Release 资产与本地是否一致；
   *   ② 每次构建都在 git 里产生无意义的 diff。
   * 可追溯性由 git tag 与 manifest.json 的版本号提供，不需要时间戳。 */
  const header = `@charset "UTF-8";\n/* ============================================================================\n * ${manifest.name} v${manifest.version} —— 中文优先的 Obsidian 主题\n * \n * 本文件由 build.mjs 自动生成，请勿直接编辑。\n * 源码位于 src/，修改后执行：node build.mjs\n * \n * 说明：为控制体积，说明性注释未进入产物；需要带注释的版本请运行\n *       node build.mjs --comments\n * \n * 模块数：${files.length}\n * ========================================================================== */\n\n`;

  const body = files
    .map((f) => {
      const rel = relPath(f);
      const src = contents.get(f).trim();
      /* 说明性注释默认剥离（占近一半体积）。模块横幅与 @settings 块由 stripComments 保命。 */
      const code = KEEP_COMMENTS ? src : stripComments(src);
      return `/* ################ 模块：${rel} ################ */\n\n${code}\n`;
    })
    .join('\n');

  const output = header + body;

  if (!CHECK_ONLY) fs.writeFileSync(OUT, output);
  // 同步演示库中的主题副本。为什么放进构建：演示库里的 theme.css 是一份拷贝，
  // 「改了源码、重建了产物、忘了同步演示库」是很自然会发生的事，而它带来的困惑
  // （演示库看到的还是旧样式）非常难自查。放进构建就让它不可能发生。
  if (!CHECK_ONLY) {
    const demoThemeDir = path.join(ROOT, 'demo-vault', '.obsidian', 'themes', manifest.name);
    if (fs.existsSync(path.dirname(demoThemeDir))) {
      fs.mkdirSync(demoThemeDir, { recursive: true });
      fs.copyFileSync(OUT, path.join(demoThemeDir, 'theme.css'));
      fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(demoThemeDir, 'manifest.json'));

      /* 同时校正演示库的 cssTheme。它必须与 manifest.name 完全一致，否则 Obsidian
       * 打开演示库时会认为该主题不存在，直接回退到默认外观 —— 而主题改名是很自然
       * 会发生的事，放进构建就让它不可能漏掉。 */
      const appearancePath = path.join(ROOT, 'demo-vault', '.obsidian', 'appearance.json');
      if (fs.existsSync(appearancePath)) {
        const appearance = JSON.parse(fs.readFileSync(appearancePath, 'utf8'));
        if (appearance.cssTheme !== manifest.name) {
          appearance.cssTheme = manifest.name;
          fs.writeFileSync(appearancePath, JSON.stringify(appearance, null, 2) + String.fromCharCode(10));
        }
      }
    }
  }

  /* 产物陈旧检查（仅 --check 模式，即 CI 跑的那条）
   * 规则来源：本主题把构建产物 theme.css 一起提交（方便用户直接下载）。
   * 有一次改了 manifest 的版本号却忘了重新构建，于是提交上去的 theme.css 头部
   * 仍写着上一个版本号，仓库里的产物与清单对不上 —— 直到比对 Release 资产才暴露。
   * 这里把「源码 + 清单」与「已提交的产物」绑在一起：不一致就报错，提示重新构建。 */
  if (CHECK_ONLY && fs.existsSync(OUT)) {
    const onDisk = fs.readFileSync(OUT, 'utf8');
    if (onDisk !== output) {
      const at = [...onDisk].findIndex((ch, i) => ch !== output[i]);
      errors.push(`theme.css 与源码/清单不一致（产物陈旧，首个差异在第 ${at + 1} 个字符附近），请重新执行 node build.mjs`);
    }
  }

  if (!silent) {
    const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
    console.log(`\n${manifest.name} 构建${CHECK_ONLY ? '校验' : '完成'}`);
    console.log('─'.repeat(58));
    for (const f of files) {
      const rel = relPath(f).padEnd(38);
      const lines = contents.get(f).split('\n').length;
      console.log(`  ${rel} ${String(lines).padStart(5)} 行`);
    }
    console.log('─'.repeat(58));
    console.log(`  共 ${files.length} 个模块，输出 ${kb} KB → theme.css`);

    if (warnings.length) {
      console.log(`\n⚠ ${warnings.length} 条提醒：`);
      for (const w of warnings.slice(0, 30)) console.log('  · ' + w);
      if (warnings.length > 30) console.log(`  … 另有 ${warnings.length - 30} 条`);
    }
  }

  if (errors.length) {
    console.error(`\n✗ 构建失败，${errors.length} 个错误：`);
    for (const e of errors) console.error('  · ' + e);
    process.exitCode = 1;
    return false;
  }

  if (!silent) console.log('\n✓ 校验通过\n');
  return true;
}

build();

/* ---------------------------------------------------------------------------
 * 监听模式
 * ------------------------------------------------------------------------ */
if (WATCH) {
  console.log('监听 src/ 变化中…（Ctrl+C 退出）');
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log('\n检测到改动，重新构建…');
      build({ silent: false });
    }, 120);
  });
}
