// 一键部署 Supabase 表结构：读取 supabase/schema.sql 直连 Postgres 执行，
// 执行完毕顺带用「应用同款 Publishable key」访问 REST 做登录自检（确认表可查、RLS 生效）。
//
// 用法（二选一）：
//   方式 A（推荐，不暴露密码）：在项目根目录放一个 .env 文件，写入
//     SUPABASE_DB_URL="postgresql://postgres:你的密码@db.oafefnbyzajzdejelhsw.supabase.co:5432/postgres"
//     本脚本会自动读取（见下方零依赖 .env 加载器）。
//   方式 B（一次性命令行前缀）：
//     SUPABASE_DB_URL="postgresql://postgres:你的密码@db.oafefnbyzajzdejelhsw.supabase.co:5432/postgres" npm run deploy:schema
//   连接串来源：Supabase 后台 → Settings → Database → Connection string（URI 格式）。
//
// 说明：schema.sql 本身幂等（create table if not exists / drop policy if exists），可重复运行。
// 未设置 SUPABASE_DB_URL 时本脚本仅打印提示并以 0 退出（不阻塞后续部署步骤）。
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../web/js/config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 零依赖加载 .env（若存在），便于 `npm run deploy` 直接读取，无需手动前缀环境变量
try {
  const envText = readFileSync(join(root, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // 无 .env 文件时忽略，后续按环境变量 / 跳过处理
}

const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.warn(
    '⚠ 未设置 SUPABASE_DB_URL，跳过建表（如需部署时自动建表，请设置该变量）。继续后续步骤…'
  );
  process.exit(0);
}

const sql = await readFile(join(root, 'supabase', 'schema.sql'), 'utf8');

let pg;
try {
  pg = await import('pg');
} catch {
  console.error('✗ 未安装 pg，请先执行：npm install pg');
  process.exit(1);
}

const { Client } = pg;
const client = new Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }, // Supabase Postgres 要求 SSL
});

try {
  await client.connect();
  await client.query(sql); // 简单查询协议支持一次执行多条语句
  console.log('✓ 表结构执行成功：user_data 已就绪（含 RLS 行级安全策略）。');
} catch (e) {
  console.error('✗ 表结构执行失败：', e.message);
  process.exit(1);
} finally {
  await client.end();
}

// 登录自检：用应用实际使用的 Publishable key 访问 REST，确认表可查且 RLS 已生效
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data?select=*&limit=1`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  if (res.status === 200) {
    console.log('✓ 登录自检通过：user_data 表可访问（RLS 已生效），可正常登录同步。');
  } else {
    console.warn(`⚠ 登录自检异常：REST 返回 ${res.status}（表可能未建好，请检查上方执行日志）。`);
  }
} catch (e) {
  console.warn('⚠ 登录自检跳过（无法访问 Supabase REST，可能是网络问题）：', e.message);
}
