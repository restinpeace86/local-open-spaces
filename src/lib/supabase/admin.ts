import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

// [카테고리 정제 & 어드민 확장](2026-08-26): /admin/data-grid의 쓰기 작업(키워드 규칙
// CRUD/일괄 재분류/수동 카테고리 수정)은 이 앱에 아직 로그인/세션 기반 인증이 없어(known gap,
// 이번 작업 범위 밖) 기존처럼 익명 키(@/lib/supabase/server)로는 RLS를 통과하지 못할 수 있다.
// scripts/ingest/lib/supabase-admin.mjs와 동일한 서비스 롤 키 패턴을 Next.js 서버 API 라우트
// 쪽에도 둔다 — 이 파일은 서버 전용 코드에서만 import한다(클라이언트 번들에 노출되지 않음,
// SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두가 아니라 브라우저로 전달되지 않음).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
