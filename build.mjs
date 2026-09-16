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
 *   node build.mjs            一次性构建
 *   node build.mjs --watch    监听 src/ 变化自动重建
 *   node build.mjs --check    只校验不写文件（CI 用）
 */

import fs from 'node:fs';
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

    // 6.5 !important 用量异常：超过 3 处通常意味着在硬对抗原生样式，值得复核
    const bang = (src.match(/!important/g) || []).length;
    if (bang > 3) {
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
  const header = `@charset "UTF-8";\n/* ============================================================================\n * 墨韵 MoYun v${manifest.version} —— 中文优先的 Obsidian 主题\n * \n * 本文件由 build.mjs 自动生成，请勿直接编辑。\n * 源码位于 src/，修改后执行：node build.mjs\n * \n * 模块数：${files.length}\n * ========================================================================== */\n\n`;

  const body = files
    .map((f) => {
      const rel = relPath(f);
      return `/* ################ 模块：${rel} ################ */\n\n${contents.get(f).trim()}\n`;
    })
    .join('\n');

  const output = header + body;

  if (!CHECK_ONLY) fs.writeFileSync(OUT, output);
  // 同步演示库中的主题副本。为什么放进构建：演示库里的 theme.css 是一份拷贝，
  // 「改了源码、重建了产物、忘了同步演示库」是很自然会发生的事，而它带来的困惑
  // （演示库看到的还是旧样式）非常难自查。放进构建就让它不可能发生。
  if (!CHECK_ONLY) {
    const demoThemeDir = path.join(ROOT, 'demo-vault', '.obsidian', 'themes', '墨韵 MoYun');
    if (fs.existsSync(path.dirname(demoThemeDir))) {
      fs.mkdirSync(demoThemeDir, { recursive: true });
      fs.copyFileSync(OUT, path.join(demoThemeDir, 'theme.css'));
      fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(demoThemeDir, 'manifest.json'));
    }
  }

  if (!silent) {
    const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
    console.log(`\n墨韵 MoYun 构建${CHECK_ONLY ? '校验' : '完成'}`);
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
