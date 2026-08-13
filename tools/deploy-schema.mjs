// 一键部署 Supabase 表结构：读取 supabase/schema.sql 并执行到你的 Supabase Postgres。
//
// 用法：
//   1) 拿数据库连接串：Supabase 后台 → Settings → Database → Connection string（URI 格式）
//   2) 设置环境变量后运行：
//      SUPABASE_DB_URL="postgresql://postgres:你的密码@db.oafefnbyzajzdejelhsw.supabase.co:5432/postgres" npm run deploy:schema
//
// 说明：schema.sql 本身幂等（create table if not exists / drop policy if exists），
// 重复执行不会报错，可放心多次运行。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('✗ 未检测到 SUPABASE_DB_URL');
  console.error('  请到 Supabase 后台 → Settings → Database → Connection string 复制 URI，然后执行：');
  console.error(
    '  SUPABASE_DB_URL="postgresql://postgres:<密码>@db.oafefnbyzajzdejelhsw.supabase.co:5432/postgres" npm run deploy:schema'
  );
  process.exit(1);
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
  console.log('✓ 执行成功：user_data 表已就绪（含 RLS 行级安全策略），可正常登录同步。');
} catch (e) {
  console.error('✗ 执行失败：', e.message);
  process.exit(1);
} finally {
  await client.end();
}
