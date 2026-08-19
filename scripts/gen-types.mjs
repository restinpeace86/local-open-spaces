import { execSync } from 'child_process';
import { loadEnv } from './lib/load-env.mjs';

const env = loadEnv();

const ref = env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!ref) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL에서 project ref를 추출할 수 없습니다.');
  process.exit(1);
}

execSync(`npx supabase gen types typescript --project-id ${ref} > src/types/database.types.ts`, {
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN },
});

console.log('✅ src/types/database.types.ts 갱신 완료');
