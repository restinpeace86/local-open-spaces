// scripts/check-db.mjs
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL 환경 변수가 .env.local에 존재하지 않습니다.');
    process.exitCode = 1;
    return;
  }

  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
    });

    if (res.status >= 200 && res.status < 500) {
      console.log(`✅ Supabase DB 연결 정상 확인 (Status: ${res.status})`);
      process.exitCode = 0;
    } else {
      console.error(`❌ Supabase 서버 응답 이상 (Status: ${res.status})`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Supabase 네트워크 연결 실패:', err.message);
    process.exitCode = 1;
  }
}

checkSupabase();
