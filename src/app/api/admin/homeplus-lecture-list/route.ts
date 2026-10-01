import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [홈플러스 문화센터 강좌 리스트 수집 — 관리자 화면 노출](2026-10-02 사용자
// 지시): pipeline_logs 라우트와 동일한 패턴(서비스롤 전용 RLS 테이블이라
// 서비스롤 클라이언트로 조회) — homeplus-collect-lecture-list.py가 Supabase
// REST API로 직접 적재한 행을 그대로 최신순으로 보여준다.
const ROWS_LIMIT = 1000;

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('homeplus_lecture_list')
    .select('*')
    .order('collected_at', { ascending: false })
    .limit(ROWS_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
