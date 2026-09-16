#!/usr/bin/env node
/**
 * 墨韵 MoYun · 模块冲突检查
 * ---------------------------------------------------------------------------
 * 为什么需要它：本主题的 34 个模块是并行开发的，不同模块很容易对同一个选择器
 * 重复声明同一个属性（"两个主人"）。这类冲突不会报错，只会让样式表现变得
 * 不可预测（结果取决于文件拼接顺序），是最难排查的一类问题。
 *
 * 本工具检查四件事：
 *   ① 同一选择器在【不同模块】里重复声明同一属性（潜在冲突，按影响面排序）
 *   ② 全库 !important 使用清单（滥用是主题难以维护的头号原因）
 *   ③ 跨模块重复定义的 CSS 变量（后者覆盖前者，多半是复制粘贴残留）
 *   ④ 对中文无效的声明（text-transform 系列对汉字完全无效）
 *
 * 用法：node tools/check-conflicts.mjs [--strict]
 *   --strict 时高影响冲突或无效声明存在则退出码非 0（供 CI 使用）
 *
 * 解析说明：本工具用【括号感知】的扫描器而不是正则来切规则。原因是最初用正则
 * 实现时，把现代 CSS 的【嵌套语法】误读了——例如
 *     .markdown-rendered { h2 { color: red } }
 * 会被正则拆出一个空的裸选择器 h2，从而产生大量假冲突。扫描器维护选择器栈，
 * 遇到嵌套时把父选择器拼进子选择器，才能得到真实的选择器全名。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const STRICT = process.argv.includes('--strict');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out.sort();
}

/** 判断一个片段是不是 at-rule（@media / @supports / @layer …），它不参与选择器拼接 */
const isAtRule = (s) => s.trim().startsWith('@');

/** 把 at-rule 里的条件（如 @media (hover: hover)）记录下来，用于降低跨条件误报 */
function atCondition(s) {
  return s.trim();
}

/**
 * 括号感知的 CSS 规则扫描器。
 * 返回 [{ file, selector, prop, val, conditions, line }]
 */
function parseRules(css, file) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rel = path.relative(SRC, file);
  const out = [];
  const selStack = [];   // 选择器 / at-rule 栈
  const condStack = [];  // 当前所处的条件上下文（@media 等）
  let cur = '';
  let line = 1;

  const flushDecls = () => {
    const text = cur.trim();
    if (!text) return;
    // 选择器部分 = 栈中所有非 at-rule 项（去除 & 嵌套父引用后拼接）
    const parts = selStack.filter((s) => !isAtRule(s));
    if (!parts.length) return;
    const selector = parts
      .join(' ')
      .replace(/&/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!selector) return;
    const conditions = condStack.join(' && ');
    for (const decl of text.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      const val = decl.slice(i + 1).trim().replace(/\s+/g, ' ');
      if (!prop || prop.startsWith('--') || prop.startsWith('/*')) continue;
      out.push({ file: rel, selector, prop, val, conditions, line });
    }
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '\n') line++;
    if (ch === '{') {
      const head = cur.trim();
      selStack.push(head);
      if (isAtRule(head)) condStack.push(atCondition(head));
      cur = '';
    } else if (ch === '}') {
      // 先结算当前层的声明，再退栈
      const head = selStack[selStack.length - 1] || '';
      if (!isAtRule(head)) flushDecls();
      cur = '';
      const popped = selStack.pop();
      if (popped && isAtRule(popped)) condStack.pop();
    } else if (ch === ';' && selStack.length && !isAtRule(selStack[selStack.length - 1])) {
      cur += ch;
    } else {
      cur += ch;
    }
  }
  return out;
}

const files = walk(SRC);
const allRules = [];
const varDefs = new Map();
const importants = [];
const cjkNoop = [];
let parsedDecls = 0;

for (const f of files) {
  const css = fs.readFileSync(f, 'utf8');
  const rel = path.relative(SRC, f);
  const rules = parseRules(css, f);
  allRules.push(...rules);
  parsedDecls += rules.length;

  for (const m of css.matchAll(/(--my-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (!varDefs.has(m[1])) varDefs.set(m[1], []);
    varDefs.get(m[1]).push({ file: rel, value: m[2].trim() });
  }
  for (const m of css.matchAll(/([^;{}]+:[^;{}]*!important)/g)) {
    importants.push({ file: rel, decl: m[1].trim().slice(0, 90) });
  }
  for (const m of css.matchAll(/text-transform:\s*(uppercase|capitalize|lowercase)/g)) {
    cjkNoop.push({ file: rel, decl: m[0] });
  }
}

/* ① 跨模块重复声明同一属性（同一条件下才算真冲突） */
const byKey = new Map();
for (const r of allRules) {
  const key = r.selector + '||' + r.prop + '||' + r.conditions;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(r);
}
const conflicts = [];
for (const [key, owners] of byKey) {
  const files_ = [...new Set(owners.map((o) => o.file))];
  const vals = [...new Set(owners.map((o) => o.val))];
  // 真正的冲突 = 跨模块 + 值不同 + 同条件上下文
  if (files_.length > 1 && vals.length > 1) {
    const [selector, prop, conditions] = key.split('||');
    conflicts.push({ selector, prop, conditions, owners });
  }
}

/* ③ 跨模块重复定义令牌 */
const dupVars = [];
for (const [name, defs] of varDefs) {
  const byFile = [...new Set(defs.map((d) => d.file))];
  const vals = [...new Set(defs.map((d) => d.value))];
  if (byFile.length > 1 && vals.length > 1) dupVars.push({ name, defs });
}

/* ---------------------------------------------------------------------------
 * 报告
 * ------------------------------------------------------------------------ */
console.log('\n墨韵 MoYun · 模块冲突检查');
console.log('─'.repeat(70));
console.log('  模块 ' + files.length + '   解析出声明 ' + parsedDecls + '   令牌 ' + varDefs.size);

conflicts.sort((a, b) => b.owners.length - a.owners.length);
console.log('\n① 跨模块属性冲突（同选择器 + 同属性 + 同条件，值不同）：' + conflicts.length + ' 组');
for (const c of conflicts.slice(0, 20)) {
  console.log('\n  [' + c.prop + ']  ' + c.selector + (c.conditions ? '   @ ' + c.conditions : ''));
  for (const o of c.owners) console.log('      ' + o.file.padEnd(38) + o.val.slice(0, 40));
}
if (conflicts.length > 20) console.log('\n  … 另有 ' + (conflicts.length - 20) + ' 组');

console.log('\n② !important 使用：' + importants.length + ' 处');
const byImp = new Map();
for (const i of importants) byImp.set(i.file, (byImp.get(i.file) || 0) + 1);
for (const [f, n] of [...byImp].sort((a, b) => b[1] - a[1])) {
  console.log('      ' + f.padEnd(40) + n + ' 处');
}

console.log('\n③ 跨模块重复定义的令牌：' + dupVars.length + ' 个');
for (const d of dupVars.slice(0, 10)) {
  console.log('      ' + d.name);
  for (const def of d.defs) console.log('          ' + def.file.padEnd(36) + def.value.slice(0, 38));
}

console.log('\n④ 对中文无效的声明：' + cjkNoop.length + ' 处');
for (const c of cjkNoop.slice(0, 10)) console.log('      ' + c.file.padEnd(40) + c.decl);

const blocking = conflicts.filter((c) => c.owners.length >= 3);
console.log('\n' + '─'.repeat(70));
console.log('高影响冲突（≥3 个模块争夺同一属性）：' + blocking.length + ' 组');
if (STRICT && (blocking.length || cjkNoop.length)) {
  console.log('✗ --strict 判定不通过');
  process.exitCode = 1;
} else {
  console.log('检查完成');
}
