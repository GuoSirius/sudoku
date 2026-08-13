// 从 CHANGELOG.md 提取指定版本的发布说明（用于 GitHub Actions 创建 release）。
// 用法：node tools/extract-release-notes.mjs v1.2.3
import { readFile } from 'node:fs/promises';

const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
if (!tag) {
  console.error('Usage: node tools/extract-release-notes.mjs <tag>');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
const md = await readFile('CHANGELOG.md', 'utf8');

// 匹配 ## [x.y.z] - YYYY-MM-DD 到下一个 ## [ 或文件末尾之间的内容
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp(
  `##\\s*\\[${escaped}\\]\\s*-\\s*\\d{4}-\\d{2}-\\d{2}\\s*\\n([\\s\\S]*?)(?=\\n##\\s*\\[|$)`,
  'm'
);

const m = md.match(regex);
if (!m) {
  console.error(`Version ${version} not found in CHANGELOG.md`);
  process.exit(1);
}

console.log(m[1].trim());
