import fs from 'node:fs';
import path from 'node:path';

const VAULT = 'demo-vault';
const THEME_DIR = path.join(VAULT, '.obsidian', 'themes', '墨韵 MoYun');
fs.mkdirSync(THEME_DIR, { recursive: true });

/* 把构建产物安装进演示库，这样用 Obsidian 打开 demo-vault 就能直接看到主题效果 */
fs.copyFileSync('theme.css', path.join(THEME_DIR, 'theme.css'));
fs.copyFileSync('manifest.json', path.join(THEME_DIR, 'manifest.json'));

/* 库级配置：指定使用本主题 */
fs.writeFileSync(
  path.join(VAULT, '.obsidian', 'appearance.json'),
  JSON.stringify({ cssTheme: '墨韵 MoYun', theme: 'obsidian', accentColor: '', baseFontSize: 16 }, null, 2) + '\n'
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
