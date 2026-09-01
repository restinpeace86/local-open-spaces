import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { Database } from '@/types/database.types';
import { applyStrictFilters, assembleResults, ChatAnswers, nextRadiusTier, SearchResultItem } from '@/lib/ai-chat/search-engine';
import { buildFinalSummary } from '@/lib/ai-chat/summary';

// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 4단계(검색 결과 도출 및 예외
// 처리): 8단계 인터뷰가 끝난 뒤 딱 한 번 호출되는 최종 검색 엔드포인트. 필터/점수/믹스
// 로직은 search-engine.ts(순수 함수, 단위 테스트 완료)에 있고, 이 라우트는 DB 조회 +
// "선택 반경 → (0건일 때만) 다음 반경" 2단계 왕복만 담당한다. LLM은 요약 문구 생성
// 1회에만 쓴다(요구사항 2-①).
//
// [실측으로 발견한 성능 함정] 처음에는 "폴백 대비 가장 넓은 반경(40km)으로 미리 넉넉히
// 조회"했으나, 141,980행 규모에서 40km 반경 조회가 PostgREST의 8초 statement_timeout에
// 실제로 걸렸다(라이브 서버로 직접 확인 — `supabase db query` 관리자 연결에서는 7.9초로
// 통과했지만 anon 키 PostgREST 경로는 매번 안정적으로 통과를 보장할 수 없는 위험 수준).
// 사용자가 실제로 선택한 반경으로 먼저 조회하고, 그 결과가 0건일 때만 다음 반경으로 딱
// 한 번 더 조회하도록 바꿔 대부분의 요청은 좁은/중간 반경만 조회하게 했다(요구사항 4의
// "1회성 완화"와도 정확히 일치하는 설계).
async function fetchCandidatesAtRadius(
  supabase: SupabaseClient<Database>,
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<NearbyItem[]> {
  const { data, error } = await supabase.rpc('get_nearby_spaces_and_events', {
    user_lng: lng,
    user_lat: lat,
    radius_meters: radiusMeters,
    p_item_type: 'SPACE',
  });
  if (error) throw new Error(`주변 스팟 조회 실패: ${error.message}`);
  return (data ?? []) as NearbyItem[];
}

// [/api/curated-items/route.ts와 동일한 관례] 요청마다 계산해야 날짜 경계에서 stale해지지
// 않는다.
async function fetchActiveCuratedItem() {
  const today = new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('curated_items')
    .select('id, title, image_url, booking_url, category')
    .eq('is_active', true)
    .or(`operation_start_date.is.null,operation_start_date.lte.${today}`)
    .or(`operation_end_date.is.null,operation_end_date.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`제휴 상품 조회 실패: ${error.message}`);
  return data?.[0] ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { answers, lat, lng, whenLabel, vibeLabel } = body as {
      answers?: ChatAnswers;
      lat?: number;
      lng?: number;
      whenLabel?: string;
      vibeLabel?: string;
    };

    if (!answers || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: '필수 파라미터(answers, lat, lng)가 없습니다.' }, { status: 400 });
    }

    const supabase = await createClient();

    let radiusMeters = answers.transportRadiusMeters;
    let candidates = await fetchCandidatesAtRadius(supabase, lat, lng, radiusMeters);
    let pool = applyStrictFilters(candidates, answers, radiusMeters);
    let usedFallback = false;

    if (pool.length === 0) {
      const fallbackRadius = nextRadiusTier(radiusMeters);
      if (fallbackRadius != null) {
        radiusMeters = fallbackRadius;
        candidates = await fetchCandidatesAtRadius(supabase, lat, lng, radiusMeters);
        pool = applyStrictFilters(candidates, answers, radiusMeters);
        usedFallback = pool.length > 0;
      }
    }

    if (pool.length === 0) {
      return NextResponse.json({
        exhausted: true,
        message: '차선책까지 가격/거리를 조정하여 찾아보았으나 조건에 맞는 적합한 곳을 찾지 못했습니다.',
      });
    }

    const curatedItem = await fetchActiveCuratedItem();
    const results: SearchResultItem[] = assembleResults(pool, answers, curatedItem);

    const summaryText = await buildFinalSummary(
      {
        whenLabel: whenLabel ?? '오늘',
        vibeLabel: vibeLabel ?? '나들이',
        resultCount: results.length,
        usedFallback,
        hasKids: answers.kidsCount > 0,
      },
      process.env.GEMINI_API_KEY
    );

    return NextResponse.json({ exhausted: false, usedFallback, results, summaryText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 추천 검색 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
