import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const yml = fs.readFileSync('.github/workflows/release.yml', 'utf8');
const lines = yml.split(String.fromCharCode(10));

/* 提取所有 `run: |` 多行块的内容，逐段用 bash -n 做语法检查。
 * 为什么需要这一步：workflow 的 shell 只在 GitHub 上执行，本地不校验就会
 * 出现「推了 tag 才发现语法错」的情况 —— 本项目刚因此失败过一次。 */
const blocks = [];
let cur = null;
for (const line of lines) {
  if (/^\s+run: \|\s*$/.test(line)) { cur = []; continue; }
  if (cur) {
    if (/^\s{10,}\S/.test(line) || line.trim() === '') cur.push(line.replace(/^\s{10}/, ''));
    else { if (cur.length) blocks.push(cur.join(String.fromCharCode(10))); cur = null; }
  }
}
if (cur && cur.length) blocks.push(cur.join(String.fromCharCode(10)));

console.log('提取到 ' + blocks.length + ' 段 shell');
let bad = 0;
blocks.forEach((b, i) => {
  try {
    execFileSync('bash', ['-n'], { input: b, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log('  ✓ 第 ' + (i + 1) + ' 段语法正确');
  } catch (e) {
    bad++;
    console.log('  ✗ 第 ' + (i + 1) + ' 段语法错误：' + String(e.stderr || e.message).trim().split(String.fromCharCode(10))[0]);
    console.log('    内容：' + b.replace(/\n/g, ' | '));
  }
});

if (bad) { console.log(String.fromCharCode(10) + '✗ ' + bad + ' 段有语法错误，不要推送'); process.exit(1); }
console.log(String.fromCharCode(10) + '✓ 全部 shell 段语法正确，可以推送');