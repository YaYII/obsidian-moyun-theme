#!/usr/bin/env node
/**
 * 墨韵 MoYun · 从本机 Obsidian 提取开发参考资料
 * ---------------------------------------------------------------------------
 * 为什么需要这个脚本、而不是直接把 app.css 放进仓库：
 *   Obsidian 是闭源商业软件，其 app.css 属于 Obsidian 的版权资源。
 *   本主题是 MIT 开源项目，把别人的专有样式表一起分发是不合适的。
 *   但主题开发确实需要知道 Obsidian 定义了哪些 CSS 变量与选择器，
 *   因此改为「让每位贡献者从自己合法安装的 Obsidian 里提取」。
 *
 * 提取出来的文件只供本地开发参考，已在 .gitignore 中排除。
 *
 * 用法：
 *   node tools/extract-obsidian-reference.mjs
 *
 * 产出：
 *   docs/reference/obsidian-app.css          Obsidian 原生样式表（已 gitignore）
 *   docs/reference/obsidian-variables.txt    原生 CSS 变量名清单（随仓库分发）
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'reference');

/** 各平台常见的 Obsidian 资源目录候选 */
function candidates() {
  const home = os.homedir();
  return [
    // Linux：deb / AppImage 解包 / 手动解压
    path.join(home, 'bin', 'obsidian-deb', 'opt', 'Obsidian', 'resources'),
    '/opt/Obsidian/resources',
    '/usr/lib/obsidian/resources',
    path.join(home, 'bin', 'obsidian-appimage', 'resources'),
    // Linux：snap
    '/snap/obsidian/current/resources',
    // macOS
    '/Applications/Obsidian.app/Contents/Resources',
    path.join(home, 'Applications', 'Obsidian.app', 'Contents', 'Resources'),
    // Windows
    path.join(process.env.LOCALAPPDATA || '', 'Obsidian', 'resources'),
    path.join(process.env.PROGRAMFILES || '', 'Obsidian', 'resources'),
  ].filter((p) => p && p !== 'resources' && fs.existsSync(p));
}

/** asar 是「16 字节头 + JSON 目录树 + 顺序拼接的文件内容」，这里按需读单个条目 */
function extractFromAsar(asarPath, matchName) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(12);
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 16);
    const header = JSON.parse(headerBuf.toString('utf8').replace(/\0+$/, ''));
    const baseOffset = 16 + headerSize;

    let found = null;
    const walk = (node, prefix) => {
      for (const [name, val] of Object.entries(node.files || {})) {
        const p = prefix ? prefix + '/' + name : name;
        if (val.files) walk(val, p);
        else if (name === matchName && val.size) found = { p, size: val.size, offset: parseInt(val.offset, 10) };
      }
    };
    walk(header, '');
    if (!found) return null;

    const buf = Buffer.alloc(found.size);
    fs.readSync(fd, buf, 0, found.size, baseOffset + found.offset);
    return { name: found.p, data: buf };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 推断 Obsidian 版本号。目录路径里通常不含版本（deb 解包目录就是这样），
 * 因此按可靠性依次尝试：
 *   ① 命令行传入 --version=x.y.z
 *   ② Obsidian 自己的日志（里面会写 "Latest version is x.y.z"）
 *   ③ 目录路径中的版本片段
 *   ④ 兜底为 unknown（不阻断提取，只是文件名不带版本）
 */
function detectVersion(dir) {
  const fromArg = (process.argv.find((a) => a.startsWith('--version=')) || '').split('=')[1];
  if (fromArg) return fromArg;

  const logPaths = [
    path.join(os.homedir(), '.config', 'obsidian', 'obsidian.log'),
    path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.log'),
    path.join(process.env.APPDATA || '', 'obsidian', 'obsidian.log'),
  ].filter(Boolean);
  for (const lp of logPaths) {
    if (!fs.existsSync(lp)) continue;
    const txt = fs.readFileSync(lp, 'utf8');
    const m = txt.match(/Latest version is (\d+\.\d+\.\d+)/);
    if (m) return m[1];
  }

  const fromDir = dir.match(/(\d+\.\d+\.\d+)/);
  return fromDir ? fromDir[1] : 'unknown';
}

/** 从 app.css 里抽出 Obsidian 定义的 CSS 变量名（用于对照维护） */
function extractVariables(cssText) {
  const set = new Set();
  for (const m of cssText.matchAll(/^\s*(--[a-zA-Z][a-zA-Z0-9-]*)\s*:/gm)) set.add(m[1]);
  return [...set].sort();
}

/* ---------------------------------------------------------------------------
 * 主流程
 * ------------------------------------------------------------------------ */
const dirs = candidates();
if (!dirs.length) {
  console.error('✗ 未能找到本机的 Obsidian 资源目录。');
  console.error('  请手动指定，例如：');
  console.error('    mkdir -p docs/reference && \\');
  console.error('    /path/to/Obsidian.AppImage --appimage-extract resources/obsidian.asar');
  process.exit(1);
}

let done = false;
for (const dir of dirs) {
  // 资源目录里通常有 obsidian.asar（主体）与 app.asar（壳）；样式表在 obsidian.asar 里
  for (const asarName of ['obsidian.asar', 'app.asar']) {
    const asar = path.join(dir, asarName);
    if (!fs.existsSync(asar)) continue;
    const hit = extractFromAsar(asar, 'app.css');
    if (!hit) continue;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const cssText = hit.data.toString('utf8');
    const ver = detectVersion(dir);
    /* 刻意使用【固定文件名】而不是带版本号的文件名：
     *   · tools/preview/harness.html 与文档都引用它，带版本号会导致每次
     *     升级 Obsidian 都要改引用；
     *   · .gitignore 也只需排除一个确定的路径。
     * 版本信息写进文件头注释，需要核对时看头部即可。 */
    const cssOut = path.join(OUT_DIR, 'obsidian-app.css');
    const varOut = path.join(OUT_DIR, 'obsidian-variables.txt');
    const banner = `/* 提取自 Obsidian ${ver}（本地开发参考，勿提交、勿再分发）\n` +
      ' * 提取方式：node tools/extract-obsidian-reference.mjs\n' +
      ' * 版权说明：本文件是 Obsidian 的专有样式表，仅在你的本机作为开发参考使用。 */\n';
    fs.writeFileSync(cssOut, banner + hit.data.toString('utf8'));
    const vars = extractVariables(cssText);
    fs.writeFileSync(varOut,
      `# 提取自 Obsidian ${ver} 的原生 CSS 变量名清单\n` +
      `# 提取方式：node tools/extract-obsidian-reference.mjs\n` +
      `# 用途：开发本主题时核对变量名，避免拼写错误。共 ${vars.length} 个变量。\n\n` +
      vars.join('\n') + '\n');

    console.log('✓ 提取完成');
    console.log('  来源    ：' + asar);
    console.log('  样式表  ：' + path.relative(ROOT, cssOut) + '  (' + (hit.data.length / 1024).toFixed(0) + ' KB)');
    console.log('  变量清单：' + path.relative(ROOT, varOut) + '  (' + vars.length + ' 个变量)');
    console.log('');
    console.log('  提示：这些文件已在 .gitignore 中排除，仅供本地开发参考。');
    console.log('        请不要把它们提交或再分发 —— 它们属于 Obsidian 的版权资源。');
    done = true;
    break;
  }
  if (done) break;
}

if (!done) {
  console.error('✗ 在以下目录中未找到含 app.css 的 asar 包：');
  for (const d of dirs) console.error('    ' + d);
  process.exit(1);
}
