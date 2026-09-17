import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { buildFacilityClassificationPrompt, parseFacilityClassificationResponse } from '@/lib/admin/llm-facility-classification';

// [실내/야외 분류 LLM 파이프라인](2026-09-17 사용자 지시): "공공데이터 및 외부
// 제휴 API에서 수집된 아이와 함께 가기 좋은 나들이/체험 상품 데이터(타이틀 및
// 상세 설명)를 분석하여, 해당 장소의 환경 속성을 자동으로 분류" — 제목+설명만
// 받으면 되는 범용 라우트라 특정 테이블(events/curated_items)에 묶지 않는다.
// 관리자화면 이벤트 탭 상세팝업(FacilityTypeEditor)과 제휴 상품 등록 폼 둘 다
// 이 하나의 라우트를 공유한다(제5장 제4조 — 같은 목적을 두 곳에 따로 만들지 않음).
// Gemini 호출 패턴은 기존 /api/admin/spot-curations/llm-verify와 동일하게 맞춘다.
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_TIMEOUT_MS = 20000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { title?: string; description?: string | null };
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: '제목(title)이 필요합니다.' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
    }

    const prompt = buildFacilityClassificationPrompt(title, body.description ?? null);

    const geminiRes = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, responseMimeType: 'application/json' },
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

    const result = parseFacilityClassificationResponse(answerText);
    if (!result) {
      return NextResponse.json({ error: 'LLM 응답을 해석하지 못했습니다(형식 오류). 다시 시도해주세요.' }, { status: 502 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '실내/야외 분류 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
