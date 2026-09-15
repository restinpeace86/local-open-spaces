import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { cleanNaverText, isWithinRecentWindow } from '@/lib/admin/naver-blog-search';
import {
  buildNoSnippetsResult,
  buildQueryVariants,
  buildVerificationPrompt,
  parseLlmVerificationResponse,
  BlogSnippetInput,
} from '@/lib/admin/llm-blog-verification';

// [LLM 기반 블로그 큐레이션 매장 검증](2026-09-15 사용자 지시, implementation/todo.md
// [개선사항 8]): 상호명 입력 → 3개 쿼리 조합(아기의자/아기식기/테라스 마당)×2개씩
// (총 6개) 블로그 스니펫 수집 → 1년 이내 필터링 → Gemini 분석 → 구조화된 결과 반환.
// "화면 현시는 하지 않음"(요청 원문) — 개별 블로그 검색 결과 자체는 응답에 담지 않고
// 최종 분석 결과만 반환한다.
const NAVER_BLOG_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';
const DISPLAY_PER_QUERY = 2;
const GEMINI_MODEL = 'gemini-flash-lite-latest';
// [실측 타임아웃 장애 수정](2026-09-16 사용자 보고: "라라코스트 부천"으로 분석 시
// "fetch timeout after 8000ms" 발생): 정상 응답은 1~1.5초 내외였지만(직접 재현
// 호출로 확인), 이 모델은 답변 전 내부 추론(thinking)을 거쳐 응답 시간 편차가 커서
// 드물게 8초를 넘길 수 있다. 이 버튼은 실시간 채팅과 달리 관리자가 한 번 클릭하고
// 기다리는 단발성 액션이라 응답을 조금 더 기다리는 편이 하드 실패보다 낫다고
// 판단해 여유를 넉넉히 뒀다.
const GEMINI_TIMEOUT_MS = 20000;
const NAVER_TIMEOUT_MS = 8000;

type NaverBlogApiItem = { title: string; description: string; bloggername: string; postdate: string };

// [기존 구조 재사용 범위] /api/admin/spot-curations/blog-search와 동일한 Naver 호출
// 방식(엔드포인트/인증 헤더)이지만, display=2(요청 원문 "2개씩")가 기존 라우트의
// 고정값(3)과 달라 그 라우트를 그대로 호출하지 않고 이 라우트 안에 짧게(약 15줄)
// 다시 구현한다 — 기존 라우트를 건드리면 이미 동작 중인 BlogReferenceViewer 쪽
// 화면에 영향이 갈 위험이 있어(제5장 제4조의 "기존 구조 우선"은 "다른 용도로
// 억지로 재사용"이 아니라 "동일 목적 중복 방지"를 뜻한다고 판단).
async function fetchNaverBlogSnippets(query: string, clientId: string, clientSecret: string): Promise<NaverBlogApiItem[]> {
  const url = `${NAVER_BLOG_SEARCH_URL}?${new URLSearchParams({ query, display: String(DISPLAY_PER_QUERY), sort: 'date' }).toString()}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret } },
    NAVER_TIMEOUT_MS
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: NaverBlogApiItem[] };
  return json.items ?? [];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { store_name?: string; store_address?: string | null };
    const storeName = body.store_name?.trim();
    if (!storeName) {
      return NextResponse.json({ error: '상호명(store_name)이 필요합니다.' }, { status: 400 });
    }

    const naverClientId = process.env.NAVER_CLIENT_ID;
    const naverClientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!naverClientId || !naverClientSecret) {
      return NextResponse.json({ error: 'NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    // [멀티 쿼리 병렬 수집](요청 원문 "A/B/C 3개 키워드 조합×2개씩=총 6개"): 3개
    // 쿼리를 병렬로 호출한다 — 한 쿼리가 실패해도(개별 fetchNaverBlogSnippets가 빈
    // 배열로 우아하게 처리) 나머지 쿼리 결과는 그대로 살아남는다(제5장 제11조).
    const variants = buildQueryVariants(storeName);
    const resultsByVariant = await Promise.all(variants.map((q) => fetchNaverBlogSnippets(q, naverClientId, naverClientSecret)));
    const allItems = resultsByVariant.flat();

    // [1년 이내 최신성 필터링] 요청 원문 "코드 레벨"에서 필터링 — LLM에게 오래된 글까지
    // 넘기지 않는다(정책이 이미 바뀐 오래된 정보로 오판할 위험을 코드 단계에서 차단).
    const recentSnippets: BlogSnippetInput[] = allItems
      .filter((item) => isWithinRecentWindow(item.postdate))
      .map((item) => ({
        title: cleanNaverText(item.title),
        description: cleanNaverText(item.description),
        bloggername: cleanNaverText(item.bloggername),
        postdate: item.postdate,
      }));

    // [수집 0건 시 LLM 호출 생략](2026-09-16 사용자 지시): 분석할 근거가 아예 없으면
    // 결과는 항상 결정적으로 "불일치/데이터 없음"이라 LLM에 물어볼 필요가 없다 —
    // 불필요한 지연·비용·타임아웃 위험을 감수하지 않고 즉시 반환한다.
    if (recentSnippets.length === 0) {
      return NextResponse.json({ result: buildNoSnippetsResult(storeName), collectedSnippetCount: 0 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const prompt = buildVerificationPrompt(storeName, body.store_address ?? null, recentSnippets);

    const geminiRes = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, responseMimeType: 'application/json' },
        }),
      },
      GEMINI_TIMEOUT_MS
    );
    if (!geminiRes.ok) {
      return NextResponse.json({ error: `LLM 분석 요청 실패 (HTTP ${geminiRes.status})` }, { status: 502 });
    }
    const geminiJson = await geminiRes.json();
    const answerText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof answerText !== 'string') {
      return NextResponse.json({ error: 'LLM 응답에서 분석 결과를 찾지 못했습니다.' }, { status: 502 });
    }

    const result = parseLlmVerificationResponse(answerText, storeName);
    if (!result) {
      return NextResponse.json({ error: 'LLM 응답을 해석하지 못했습니다(형식 오류). 다시 시도해주세요.' }, { status: 502 });
    }

    return NextResponse.json({ result, collectedSnippetCount: recentSnippets.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LLM 블로그 검증 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
