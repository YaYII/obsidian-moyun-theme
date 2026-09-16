import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 全部路径基于脚本自身位置推导，而不是当前工作目录 ——
 * 否则从别的目录调用（例如 CI 里 node ./tools/…）会找不到文件。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = path.join(ROOT, 'demo-vault');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const THEME_DIR = path.join(VAULT, '.obsidian', 'themes', MANIFEST.name);
fs.mkdirSync(THEME_DIR, { recursive: true });

/* 把构建产物安装进演示库，这样用 Obsidian 打开 demo-vault 就能直接看到主题效果 */
fs.copyFileSync(path.join(ROOT, 'theme.css'), path.join(THEME_DIR, 'theme.css'));
fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(THEME_DIR, 'manifest.json'));

/* 库级配置：指定使用本主题 */
fs.writeFileSync(
  path.join(VAULT, '.obsidian', 'appearance.json'),
  JSON.stringify({ cssTheme: MANIFEST.name, theme: 'obsidian', accentColor: '', baseFontSize: 16 }, null, 2) + '\n'
);
fs.writeFileSync(
  path.join(VAULT, '.obsidian', 'core-plugins.json'),
  JSON.stringify({
    'file-explorer': true, 'global-search': true, switcher: true, graph: true,
    backlink: true, canvas: true, 'outgoing-link': true, tag: true,
    properties: true, 'page-preview': true, outline: true, wordcount: true,
    'command-palette': true, 'editor-status': true, 'file-recovery': true,
  }, null, 2) + '\n'
);
console.log('演示库配置与主题副本已就绪');
