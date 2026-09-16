/**
 * 墨韵 MoYun · Style Settings 配置块校验（零依赖）
 * ---------------------------------------------------------------------------
 * 为什么需要它（一次真实的翻车）：
 * 给「内容增强」分组插一个新设置项时，插入点选在了分组头和它的后续键之间，
 * 于是分组头的 description / type / level / collapsed 被挂到了新项上，
 * 同一个映射里出现两个 description、两个 type。YAML 不允许重复键，
 * Style Settings 解析时直接抛：
 *     YAMLException: duplicated mapping key in "MoYun（墨韵）"
 * 整个设置面板变成「No style settings found」—— 主题的 36 个设置项全废。
 *
 * 而当时的构建脚本只检查了「@settings 块存在」「有 name/id」这两条，
 * 对块内部的语法一无所知，所以全绿放行。**检查的粒度必须跟得上改动的手脚。**
 *
 * 本模块只做一件事：把这个配置块按 YAML 的映射规则扫一遍，抓出会让
 * Style Settings 直接报错的写法。刻意不引入 js-yaml —— 主题的构建与静态校验
 * 保持零依赖，任何机器上 node 一跑就有结果。
 *
 * 抓什么（error，会中断构建）：
 *   · 同一映射内重复键（本次翻车的直接原因）
 *   · 设置项缺 id / 缺 type / type 不在已知取值内
 *   · id 重复
 *   · class-select 缺 options
 *   · 数值型设置的 default 缺失、非数字、或落在 min/max 之外
 * 提示什么（warning）：
 *   · 无法解析的行、未知字段名（多为拼写错误）、设置项缺 title
 */

/** Style Settings 支持的全部设置类型（见 obsidian-style-settings 的 he 枚举） */
export const SETTING_TYPES = new Set([
  'heading',
  'info-text',
  'class-toggle',
  'class-select',
  'variable-text',
  'variable-number',
  'variable-number-slider',
  'variable-select',
  'variable-color',
  'variable-themed-color',
  'color-gradient',
]);

/** 配置块里允许出现的字段名 */
const KNOWN_KEYS = new Set([
  'id', 'title', 'description', 'type', 'default', 'min', 'max', 'step', 'format',
  'options', 'allowEmpty', 'collapsed', 'level', 'quoted', 'addCommand',
  'default-light', 'default-dark', 'opacity', 'alt-format',
]);

/** 取出 /* @settings ... *\/ 块（含其在整个文件中的起始行号，便于报错定位） */
export function extractSettingsBlock(source) {
  const start = source.indexOf('/* @settings');
  if (start < 0) return null;
  const end = source.indexOf('*/', start);
  if (end < 0) return null;
  return {
    text: source.slice(start, end),
    startLine: source.slice(0, start).split('\n').length,
  };
}

/**
 * 校验配置块。
 * @param {string} source 任意包含 @settings 块的 CSS 文本
 * @returns {{ errors: string[], warnings: string[], count: number }}
 */
export function validateSettings(source) {
  const errors = [];
  const warnings = [];
  const block = extractSettingsBlock(source);
  if (!block) {
    return { errors: ['缺少 /* @settings 配置块，Style Settings 插件将无法识别主题设置'], warnings, count: 0 };
  }

  const lines = block.text.split('\n');

  /* 设置项是序列里最外层的那批元素；嵌套的 options 项缩进更深。
   * 用「最浅的 - 缩进」识别设置项，才不会把 options 里的 value/label 当设置项。 */
  const dashIndents = [];
  for (const line of lines) {
    const m = line.match(/^(\s*)-(?:\s|$)/);
    if (m) dashIndents.push(m[1].length);
  }
  if (!dashIndents.length) {
    return { errors: ['@settings 块里没有任何设置项（每项应以 - 开头）'], warnings, count: 0 };
  }
  const topIndent = Math.min(...dashIndents);

  /* 重复键检测：按缩进分层记录已出现的键。
   * 遇到新的列表项时要先清掉更深的层级 —— 否则两个 option 里的 value 会被误判重复。 */
  const seenByIndent = new Map();
  const resetDeeper = (indent) => {
    for (const k of [...seenByIndent.keys()]) if (k > indent) seenByIndent.delete(k);
  };
  const note = (indent, key, lineNo) => {
    if (!seenByIndent.has(indent)) seenByIndent.set(indent, new Map());
    const bucket = seenByIndent.get(indent);
    if (bucket.has(key)) {
      errors.push(
        '@settings 第 ' + lineNo + ' 行：键 ' + key + ' 重复（第 ' + bucket.get(key) +
        ' 行已出现过）。YAML 不允许同一映射内重复键，Style Settings 会抛 YAMLException 并让整个设置面板失效。'
      );
    } else {
      bucket.set(key, lineNo);
    }
  };

  const settings = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = block.startLine + i;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^\/\*\s*@settings/.test(trimmed)) continue;   // 块首标记行不是 YAML

    const dash = line.match(/^(\s*)-\s*(.*)$/);
    if (dash) {
      const indent = dash[1].length;
      resetDeeper(indent);
      const rest = dash[2];
      // 形如「- id: foo」的一行式写法：键实际归属该列表项
      const inline = rest.match(/^([A-Za-z][A-Za-z0-9_.-]*)\s*:/);
      if (inline) note(indent + 2, inline[1], lineNo);
      if (indent === topIndent) {
        current = { line: lineNo, id: null, type: null, keys: new Set(), kv: {} };
        settings.push(current);
      }
      continue;
    }

    const kv = line.match(/^(\s*)([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(.*)$/);
    if (!kv) {
      warnings.push('@settings 第 ' + lineNo + ' 行无法解析：' + trimmed.slice(0, 48));
      continue;
    }
    const indent = kv[1].length;
    const key = kv[2];
    const value = kv[3].trim();
    note(indent, key, lineNo);
    if (current && indent === topIndent + 2) {
      current.keys.add(key);
      current.kv[key] = value;
    }
  }

  /* 语义检查 */
  const ids = new Map();
  for (const s of settings) {
    const { kv, line } = s;
    const label = kv.id ? 'id: ' + kv.id : '（无 id）';
    if (!kv.id) errors.push('@settings 第 ' + line + ' 行：设置项缺少 id');
    if (!kv.type) {
      errors.push('@settings 第 ' + line + ' 行（' + label + '）：设置项缺少 type');
    } else if (!SETTING_TYPES.has(kv.type)) {
      errors.push('@settings 第 ' + line + ' 行（' + label + '）：未知的 type: ' + kv.type);
    }
    if (kv.id) {
      if (ids.has(kv.id)) {
        errors.push('@settings 第 ' + line + ' 行：id ' + kv.id + ' 重复（第 ' + ids.get(kv.id) + ' 行已出现过）');
      } else {
        ids.set(kv.id, line);
      }
    }
    if (kv.type === 'class-select' && !s.keys.has('options')) {
      errors.push('@settings 第 ' + line + ' 行（' + label + '）：class-select 必须提供 options');
    }
    if (kv.type === 'variable-number' || kv.type === 'variable-number-slider') {
      if (kv.default === undefined) {
        errors.push('@settings 第 ' + line + ' 行（' + label + '）：数值型设置缺少 default');
      } else if (Number.isNaN(Number(kv.default))) {
        errors.push('@settings 第 ' + line + ' 行（' + label + '）：default 不是数字（' + kv.default + '）');
      } else {
        const d = Number(kv.default);
        if (kv.min !== undefined && d < Number(kv.min)) {
          errors.push('@settings 第 ' + line + ' 行（' + label + '）：default ' + d + ' 小于 min ' + kv.min);
        }
        if (kv.max !== undefined && d > Number(kv.max)) {
          errors.push('@settings 第 ' + line + ' 行（' + label + '）：default ' + d + ' 大于 max ' + kv.max);
        }
        if (kv.min !== undefined && kv.max !== undefined && Number(kv.min) > Number(kv.max)) {
          errors.push('@settings 第 ' + line + ' 行（' + label + '）：min ' + kv.min + ' 大于 max ' + kv.max);
        }
      }
    }
    if (!kv.title && kv.type !== 'info-text') {
      warnings.push('@settings 第 ' + line + ' 行（' + label + '）：缺少 title');
    }
    for (const key of s.keys) {
      if (!KNOWN_KEYS.has(key) && !/^(title|description)\.[A-Za-z-]+$/.test(key)) {
        warnings.push('@settings 第 ' + line + ' 行（' + label + '）：未知字段 ' + key + '，可能是拼写错误');
      }
    }
  }

  return { errors, warnings, count: settings.length };
}
