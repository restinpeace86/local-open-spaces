import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { Database } from '@/types/database.types';
import { applyStrictFilters, assembleResults, ChatAnswers, nextRadiusTier, SearchResultItem } from '@/lib/ai-chat/search-engine';
import { buildFinalSummary } from '@/lib/ai-chat/summary';
import { canUseUnlimitedChatbot, FREE_CHATBOT_USES_BEFORE_SPROUT, MomPickGrade } from '@/lib/community/grades';

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

    // [Decision 019](2026-09-02): "AI 챗봇 관련하여서도 비로그인 시 1회 한정" / 새싹맘
    // 이상은 무제한. 비로그인(anon) 사용자는 이 서버 라우트가 식별할 수 있는 계정이 없어
    // 클라이언트(localStorage, src/lib/ai-chat/free-trial.ts)로만 소프트 제한하고, 로그인은
    // 했지만 아직 새싹맘 조건(첫 후기/체크리스트)을 못 채운 'signed_up' 사용자만 여기서
    // profiles.ai_chat_free_uses_used로 확정적으로 막는다(새로고침/기기 변경으로 우회 불가).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let freeTrialGate: { grade: MomPickGrade; freeUsesUsed: number } | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('grade, ai_chat_free_uses_used')
        .eq('id', user.id)
        .single();
      if (profile) freeTrialGate = { grade: profile.grade as MomPickGrade, freeUsesUsed: profile.ai_chat_free_uses_used };
    }
    const needsFreeUseTracking = freeTrialGate != null && !canUseUnlimitedChatbot(freeTrialGate.grade);
    if (needsFreeUseTracking && freeTrialGate!.freeUsesUsed >= FREE_CHATBOT_USES_BEFORE_SPROUT) {
      return NextResponse.json({
        limitReached: true,
        message: '무료 체험을 이미 사용하셨어요. 맘스픽에 첫 후기나 체크리스트를 남기면 챗봇을 무제한으로 이용할 수 있어요!',
      });
    }

    // [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 3: 로그인
    // 사용자의 찜(user_bookmarks, Decision 019)/방문 이력(mom_pick_posts)을 함께 조회한다.
    // 둘 다 auth.uid() 기반 RLS라 이 세션(supabase)으로 조회하면 자동으로 본인 것만 온다 —
    // 비로그인이면 빈 Set을 써서 기존 동작(북마크/이력 없음)과 완전히 동일하게 동작한다.
    let bookmarkedSpotIds = new Set<string>();
    let visitedSpotIds = new Set<string>();
    if (user) {
      const [bookmarksResult, visitedResult] = await Promise.all([
        supabase.from('user_bookmarks').select('spot_id').eq('user_id', user.id).not('spot_id', 'is', null),
        supabase.from('mom_pick_posts').select('spot_id').eq('author_id', user.id).not('spot_id', 'is', null),
      ]);
      if (bookmarksResult.error) console.error(`[AI_CHAT_SEARCH] 찜 목록 조회 실패: ${bookmarksResult.error.message}`);
      if (visitedResult.error) console.error(`[AI_CHAT_SEARCH] 방문 이력 조회 실패: ${visitedResult.error.message}`);
      bookmarkedSpotIds = new Set((bookmarksResult.data ?? []).map((r) => r.spot_id as string));
      visitedSpotIds = new Set((visitedResult.data ?? []).map((r) => r.spot_id as string));
    }
    // 결과가 나오든(성공/0건) 무료 체험을 1회 소진한 것으로 기록한다 — 인터뷰 자체는
    // 정상 진행됐으므로 사용자 입장에서 "체험 1회"를 쓴 것이 맞다. try/catch로 잡히는
    // 서버 내부 오류(사용자 잘못이 아님)는 아래에서 별도로 처리해 소진하지 않는다.
    async function consumeFreeUseIfNeeded() {
      if (needsFreeUseTracking && user) {
        await supabase
          .from('profiles')
          .update({ ai_chat_free_uses_used: freeTrialGate!.freeUsesUsed + 1 })
          .eq('id', user.id);
      }
    }

    // [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 5: 폴백이 "정확히 1회만"
    // 동작함을 코드 구조로 보장한다 — 아래는 `if`문 하나뿐이라 조건을 완화해 재조회하는
    // 경로는 물리적으로 한 번만 존재하고(반복문/재귀 없음), 두 번째 시도까지 0건이면
    // 즉시 종료한다(무한 완화 불가능). 어떤 조건이 조정됐는지 서버 로그와 사용자 응답
    // 양쪽에 원래/최종 반경을 그대로 남겨 투명하게 안내한다.
    const originalRadiusMeters = answers.transportRadiusMeters;
    let radiusMeters = originalRadiusMeters;
    let candidates = await fetchCandidatesAtRadius(supabase, lat, lng, radiusMeters);
    let pool = applyStrictFilters(candidates, answers, radiusMeters, visitedSpotIds);
    let usedFallback = false;

    console.log(`[AI_CHAT_SEARCH] 1차 조회(반경 ${radiusMeters}m): 후보 ${candidates.length}건 → 필터 통과 ${pool.length}건`);

    if (pool.length === 0) {
      const fallbackRadius = nextRadiusTier(radiusMeters);
      if (fallbackRadius != null) {
        console.log(`[AI_CHAT_SEARCH] 1차 0건 — 반경을 ${radiusMeters}m → ${fallbackRadius}m로 1회 완화해 재조회`);
        radiusMeters = fallbackRadius;
        candidates = await fetchCandidatesAtRadius(supabase, lat, lng, radiusMeters);
        pool = applyStrictFilters(candidates, answers, radiusMeters, visitedSpotIds);
        usedFallback = pool.length > 0;
        console.log(`[AI_CHAT_SEARCH] 2차 조회(반경 ${radiusMeters}m): 후보 ${candidates.length}건 → 필터 통과 ${pool.length}건`);
      } else {
        console.log(`[AI_CHAT_SEARCH] 1차 0건이고 더 넓힐 반경 티어가 없어(이미 최대 반경) 완화를 시도하지 않음`);
      }
    }

    if (pool.length === 0) {
      console.log('[AI_CHAT_SEARCH] 완화 1회까지 시도했지만 0건 — 검색 중단');
      await consumeFreeUseIfNeeded();
      return NextResponse.json({
        exhausted: true,
        message: '차선책까지 가격/거리를 조정하여 찾아보았으나 조건에 맞는 적합한 곳을 찾지 못했습니다.',
      });
    }

    const curatedItem = await fetchActiveCuratedItem();
    const results: SearchResultItem[] = assembleResults(pool, answers, curatedItem, bookmarkedSpotIds);

    // [Step 3-①] 결과에 찜한 장소가 있으면 그중 최상위 1곳의 이름만 뽑아 채팅 말풍선용
    // 하이라이트 멘트를 만든다 — LLM이 지어내는 게 아니라 실제로 이 요청에서 조회된
    // 이름을 그대로 쓰므로 환각 위험이 없다.
    const topBookmarkedResult = results.find((r) => r.kind === 'SPOT' && r.isBookmarked);
    const bookmarkedSpotName = topBookmarkedResult && topBookmarkedResult.kind === 'SPOT' ? topBookmarkedResult.item.name : null;

    const summaryText = await buildFinalSummary(
      {
        whenLabel: whenLabel ?? '오늘',
        vibeLabel: vibeLabel ?? '나들이',
        resultCount: results.length,
        usedFallback,
        originalRadiusMeters,
        finalRadiusMeters: radiusMeters,
        hasKids: answers.kidsCount > 0,
      },
      process.env.GEMINI_API_KEY
    );

    await consumeFreeUseIfNeeded();
    return NextResponse.json({
      exhausted: false,
      usedFallback,
      originalRadiusMeters,
      finalRadiusMeters: radiusMeters,
      results,
      summaryText,
      bookmarkedSpotName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 추천 검색 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
