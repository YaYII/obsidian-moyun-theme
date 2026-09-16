#!/usr/bin/env node
/**
 * MoYun · 主题名合规性自查
 * ---------------------------------------------------------------------------
 * 提交到 Obsidian 社区目录时，name 字段有严格限制。规则来自官方 manifest 规范
 * （Reference/Manifest，name 一节），本脚本把它逐条固化成可执行的检查，
 * 避免"提交后被拒、再改、再发版"的往返。
 *
 * 官方原文要点：
 *   - Prefer English names and use Basic Latin characters only.
 *   - No punctuation (except hyphens, plus sign, and parenthesis), emoji,
 *     or special characters are allowed.
 *   - Do not include the word "Obsidian" or variations like "Obsi-" and "-sidian".
 *   - Themes may not contain the word "Theme".
 *   - Every plugin and theme must have a unique name.
 *   - Theme names cannot be changed once the theme has been submitted.
 *
 * 用法：node tools/check-name.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const name = manifest.name ?? '';

const checks = [];
const add = (label, pass, detail = '') => checks.push({ label, pass, detail });

/* ① 只用 Basic Latin（U+0020–U+007E，即可打印 ASCII） */
add('仅使用 Basic Latin 字符（无中文/emoji/特殊符号）',
  /^[\x20-\x7E]+$/.test(name),
  name === name.normalize('NFKD') ? '' : '含非 ASCII 字符');

/* ② 标点限制：允许连字符、加号、括号，其余标点一律不允许 */
const stripped = name.replace(/[-+()]/g, '');
add('无标点（连字符、加号、括号除外）',
  !/[!"#$%&'*,.\/:;<=>?@\[\]^_`{|}~]/.test(stripped));

/* ③ 不含 "Obsidian" 及其变体 */
add('不含 "Obsidian"（含 Obsi- / -sidian 变体）',
  !/obsidian|obsi-|-sidian/i.test(name));

/* ④ 主题名不得含 "Theme" */
add('不含 "Theme"（官方对主题的明令）',
  !/theme/i.test(name));

/* ⑤ 简短：官方建议 short and descriptive */
add('长度合理（1–30 字符）', name.length >= 1 && name.length <= 30, '长度 ' + name.length);

/* ⑥ 非空、非纯空白 */
add('非空且非纯空白', name.trim().length > 0);

/* ⑦ 版本号符合 x.y.z */
add('version 符合语义化格式 x.y.z', /^\d+\.\d+\.\d+$/.test(manifest.version ?? ''), manifest.version);

/* ⑧ 必填字段齐全 */
for (const k of ['name', 'version', 'minAppVersion', 'author']) {
  add('必填字段 ' + k + ' 存在且非空', Boolean(manifest[k]));
}

/* ---------------------------------------------------------------------------
 * 报告
 * ------------------------------------------------------------------------ */
const failed = checks.filter((c) => !c.pass);
console.log('\nMoYun · 主题名合规性自查');
console.log('─'.repeat(58));
console.log('  name    = ' + JSON.stringify(name));
console.log('  version = ' + JSON.stringify(manifest.version));
console.log('  author  = ' + JSON.stringify(manifest.author));
console.log('─'.repeat(58));
for (const c of checks) {
  console.log('  ' + (c.pass ? '✓' : '✗') + ' ' + c.label + (c.detail ? '  （' + c.detail + '）' : ''));
}
console.log('─'.repeat(58));
console.log(failed.length ? '✗ ' + failed.length + ' 项不合规，提交社区目录会被拒' : '✓ 全部合规，可提交社区目录');
console.log('  提示：官方规定主题名一旦提交到目录就不可更改，提交前请确认。');
process.exitCode = failed.length ? 1 : 0;
