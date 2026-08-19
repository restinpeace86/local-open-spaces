import fs from 'fs';
import path from 'path';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!accessToken || !supabaseUrl) {
  console.error('❌ SUPABASE_ACCESS_TOKEN 또는 NEXT_PUBLIC_SUPABASE_URL이 .env.local에 없습니다.');
  process.exit(1);
}

const refMatch = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
if (!refMatch) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL에서 project ref를 추출할 수 없습니다.');
  process.exit(1);
}
const projectRef = refMatch[1];

const filePath = process.argv[2];
if (!filePath) {
  console.error('사용법: node scripts/apply-sql.mjs <SQL 파일 경로>');
  process.exit(1);
}

const sql = fs.readFileSync(filePath, 'utf8');

async function run() {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    console.error(`❌ SQL 실행 실패 (${response.status}):`, text.slice(0, 1000));
    process.exit(1);
  }

  console.log(`✅ ${path.basename(filePath)} 적용 완료`);
  if (text && text !== '[]') {
    console.log(text.slice(0, 500));
  }
}

run();
