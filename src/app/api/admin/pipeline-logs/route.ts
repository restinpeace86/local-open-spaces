import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [파이프라인 로그 DB화](2026-09-15 사용자 지시, implementation/todo.md [개선사항 3]):
// 관리자 [파이프라인 관리] 탭의 "현황판" 데이터 소스. pipeline_logs는 실행마다 새 행이
// append되는 로그 테이블이라(수정 없음), "에이전트별 최신 상태"는 조회 시점에 계산한다.
// Supabase JS 클라이언트가 DISTINCT ON을 지원하지 않아 별도 RPC를 새로 만드는 대신
// (제1장 제3조 MVP 우선 — 에이전트 수가 수십 개 수준이라 이 정도 스캔은 가볍다), 최근
// 실행분을 넉넉히 가져와 클라이언트 측(이 라우트)에서 agent_name별 최신 1건만 남긴다.
const RECENT_ROWS_LIMIT = 500;
// agent_name별 상세 이력 조회(history 파라미터) 시 반환할 최대 건수.
const HISTORY_LIMIT = 20;

export async function GET(request: NextRequest) {
  // pipeline_logs는 서비스 롤 전용 RLS 정책만 있다(운영 내부 로그, 일반 사용자 노출
  // 불필요) — 관리자 API 라우트라 서비스 롤 클라이언트로 조회한다.
  const supabase = createAdminClient();
  const agentName = request.nextUrl.searchParams.get('agent_name');

  if (agentName) {
    const { data, error } = await supabase
      .from('pipeline_logs')
      .select('*')
      .eq('agent_name', agentName)
      .order('executed_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ history: data ?? [] });
  }

  const { data, error } = await supabase
    .from('pipeline_logs')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(RECENT_ROWS_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type PipelineLogRow = {
    agent_name: string;
    status: string;
    executed_at: string;
    error_message: string | null;
    description: string | null;
    period: string | null;
    meta_data: Record<string, unknown> | null;
  };

  const latestByAgent = new Map<string, PipelineLogRow>();
  for (const row of (data ?? []) as PipelineLogRow[]) {
    if (!latestByAgent.has(row.agent_name)) {
      latestByAgent.set(row.agent_name, row);
    }
  }

  const agents = [...latestByAgent.values()].sort((a, b) => {
    if (a.period !== b.period) return (a.period ?? '').localeCompare(b.period ?? '');
    return a.agent_name.localeCompare(b.agent_name);
  });

  return NextResponse.json({ agents });
}
