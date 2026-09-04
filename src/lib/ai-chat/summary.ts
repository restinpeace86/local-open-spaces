// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): "최종 데이터 필터링 및 요약
// 답변 생성 시에만 LLM을 최소한으로 호출"(요구사항 2-①)을 구현한다 — 8단계 인터뷰
// 전체에서 이 파일이 유일한 LLM 호출 지점이며, 세션당 정확히 1회만 호출된다. 프롬프트는
// "짧은 소개 문구 하나"만 요청해 출력 토큰을 최소화하고, 장소 개별 정보를 지어내지 않도록
// 명시적으로 지시한다(추측/환각 방지).
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';

const GEMINI_MODEL = 'gemini-flash-lite-latest';
// [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 3: 이전 10초 타임아웃은 결과
// 화면 전체가 그 시간만큼 무한정 로딩 상태로 보일 수 있어 챗봇치고 지나치게 길었다 —
// "엄격한 타임아웃(3~4초)"을 요구사항대로 적용한다. 타임아웃이 나도 아래 catch가 항상
// buildTemplateSummary()로 우아하게 폴백하므로 사용자 경험은 끊기지 않는다.
const GEMINI_TIMEOUT_MS = 3500;

export type SummaryContext = {
  vibeLabel: string;
  whenLabel: string;
  resultCount: number;
  usedFallback: boolean;
  hasKids: boolean;
  // [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 5: "폴백이 일어났을 경우
  // 유저에게 어떤 조건이 조정되었는지 투명하게 안내" — 반경 완화 전/후 값을 요약 문구에
  // 구체적으로 반영한다. usedFallback이 false인 정상 경로에서는 두 값이 같으므로
  // optional로 두고 생략 시 기존처럼 뭉뚱그린 안내를 쓴다(하위 호환).
  originalRadiusMeters?: number;
  finalRadiusMeters?: number;
};

function formatRadiusKm(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(0)}km` : `${meters}m`;
}

// LLM 실패/키 없음 시에도 서비스가 절대 끊기지 않아야 한다(제5장 제11조 오류 처리 원칙) —
// 템플릿 폴백은 항상 자연스러운 한국어 문장을 만든다.
export function buildTemplateSummary(ctx: SummaryContext): string {
  const fallbackNote = ctx.usedFallback
    ? ctx.originalRadiusMeters != null && ctx.finalRadiusMeters != null
      ? ` 처음 조건(반경 ${formatRadiusKm(ctx.originalRadiusMeters)})엔 딱 맞는 곳이 적어서 반경을 ${formatRadiusKm(
          ctx.finalRadiusMeters
        )}까지 살짝 넓혀 찾아봤어요.`
      : ' 조건에 딱 맞는 곳이 적어서 살짝 범위를 넓혀 찾아봤어요.'
    : '';
  const kidsNote = ctx.hasKids ? ' 아이와 함께 가기 좋은 곳들로 골라봤어요.' : '';
  return `${ctx.whenLabel} '${ctx.vibeLabel}' 나들이에 딱 맞는 장소 ${ctx.resultCount}곳을 찾았어요!${fallbackNote}${kidsNote} 마음에 드는 곳을 눌러서 자세히 확인해보세요 😊`;
}

export async function buildFinalSummary(ctx: SummaryContext, apiKey: string | undefined): Promise<string> {
  if (!apiKey) return buildTemplateSummary(ctx);

  // [개선사항5 - 봇 추천 및 페르소나 프롬프트 규칙](2026-09-04 todo.md): "'공원'이라는
  // 단어와 픽스된 제안은 전면 배제, 이벤트픽의 6대 대분류 성격에 맞춰 '야외 이벤트'
  // 또는 '야외 나들이' 위주로 자연스럽게 제안" — 유일한 LLM 호출 지점인 이 프롬프트에
  // 규칙을 명시해 응답 생성 단계에서부터 지키도록 한다.
  const prompt = `당신은 아이와 함께하는 나들이를 추천하는 친근한 어시스턴트입니다.
아래 조건으로 나들이 장소를 찾았습니다. 결과를 소개하는 밝고 짧은 인사말을 1~2문장으로만 작성하세요.
- 특정 장소의 이름이나 세부 정보를 절대 지어내지 마세요(실제 목록은 별도로 표시됩니다).
- '공원'이라는 단어와 공원을 콕 집어 추천하는 표현은 쓰지 마세요. 야외 활동을 언급할
  때는 '야외 이벤트' 또는 '야외 나들이'라는 표현을 자연스럽게 사용하세요.
- 이모지를 1~2개 자연스럽게 섞어도 됩니다.

조건:
- 날짜: ${ctx.whenLabel}
- 성향: ${ctx.vibeLabel}
- 찾은 장소 수: ${ctx.resultCount}곳
- 아이 동반 여부: ${ctx.hasKids ? '예' : '아니오'}
- 조건을 살짝 완화해서 찾았는지: ${ctx.usedFallback ? '예' : '아니오'}${
    ctx.usedFallback && ctx.originalRadiusMeters != null && ctx.finalRadiusMeters != null
      ? ` (반경을 ${formatRadiusKm(ctx.originalRadiusMeters)}에서 ${formatRadiusKm(ctx.finalRadiusMeters)}로 넓힘)`
      : ''
  }`;

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200 },
        }),
      },
      GEMINI_TIMEOUT_MS
    );

    if (!res.ok) return buildTemplateSummary(ctx);

    const data = await res.json();
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return answer ? answer : buildTemplateSummary(ctx);
  } catch {
    return buildTemplateSummary(ctx); // 외부 API 장애가 챗봇 전체를 막지 않도록 우아하게 폴백
  }
}
