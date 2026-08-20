// spec/data/ai-rule.md 2. AI 파이프라인 역할 및 처리 범위 구현
// - 비정형 텍스트 정제 (2.1): HTML 태그/특수문자/중복 공백 제거 — 결정적 규칙이라 AI 호출 없이 처리
// - 표준 카테고리 자동 태깅 (2.2): 규칙 기반 매핑표(category-map.mjs)에 없는 애매한 값만 Gemini로 보조 분류
//
// Decision 005 / ai-rule.md 4.1 준수: AI가 불확실하면 임의 생성하지 않고 기본값(ETC)으로 떨어뜨리고 경고 로그를 남긴다.

const GEMINI_MODEL = 'gemini-flash-lite-latest';

export function cleanText(raw) {
  if (!raw) return '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// spec/data/ai-rule.md 5.2 Tagging Logic & Fallback Rules 구현
// - 근거 텍스트(원본 API 응답의 description/use_target/fee_info에 해당하는 실제 문자열)에서
//   키워드 매칭으로만 판단하는 결정적 규칙이라 AI 호출 없이 처리한다.
// - sourceText는 호출부에서 해당 공공 API 원본 item의 실제 텍스트 필드를 모아 전달한다
//   (Decision 005: 근거 없는 값은 임의 생성하지 않고 기본값으로 떨어뜨림).
export function deriveParentalTags(sourceText) {
  const text = sourceText || '';
  const includesAny = (keywords) => keywords.some((k) => text.includes(k));

  const isAdultOnly = includesAny(['성인 전용', '성인전용', '성인만']);
  const isKidsFriendly =
    !isAdultOnly && includesAny(['어린이', '유아', '키즈', '아이', '가족', '영유아']);

  const isParkingUnavailable = text.includes('주차 불가');
  const hasParking = !isParkingUnavailable && includesAny(['주차장', '주차', '파킹']);

  const strollerAccessible = includesAny(['유모차', '휠체어', '베리어프리', '엘리베이터']);

  const isIndoor = includesAny(['실내', '체육관', '박물관', '미술관', '전시관']);
  const isOutdoor = includesAny(['야외', '실외', '공원', '광장', '체험장']);
  let facilityType = '복합';
  if (isIndoor && !isOutdoor) facilityType = '실내';
  else if (isOutdoor && !isIndoor) facilityType = '야외';

  let targetAgeGroup = null;
  if (text.includes('영유아')) targetAgeGroup = '영유아';
  else if (text.includes('초등')) targetAgeGroup = '초등';
  else if (text.includes('전연령') || text.includes('전 연령')) targetAgeGroup = '전연령';

  return {
    is_kids_friendly: isKidsFriendly,
    has_parking: hasParking,
    stroller_accessible: strollerAccessible,
    facility_type: facilityType,
    target_age_group: targetAgeGroup,
  };
}

// spec/data/ai-rule.md 5.2.6 구현: booking_status는 예약 접수 정보/일정이라는
// 객관적 구조화 데이터(날짜)만으로 판별 가능한 경우에만 값을 부여하고,
// '주말예약'처럼 판별 기준이 Spec에 명확히 정의되지 않은 값은 임의 추측하지 않고
// null로 둔다 (ai-rule.md 4.1 분류 불확실성 대응 / CLAUDE.md 제3장 제4조 추측 금지).
export function deriveBookingStatus({ isReservationRequired, reservationEndDate, startDate, endDate }, now = new Date()) {
  if (isReservationRequired) {
    if (!reservationEndDate) return '접수중';
    const diffDays = Math.floor((new Date(reservationEndDate).getTime() - now.getTime()) / 86400000);
    if (diffDays < 0) return null;
    if (diffDays <= 1) return 'D-1 마감임박';
    return '접수중';
  }

  if (startDate && endDate) {
    const today = now.toISOString().slice(0, 10);
    if (today >= startDate && today <= endDate) return '오늘방문';
  }

  return null;
}

// spec/data/ai-rule.md 3.2 표준 이벤트 유형 중 하나로만 응답하도록 강제한다.
const EVENT_TYPES = ['FESTIVAL', 'EXHIBITION', 'PERFORMANCE', 'POPUP', 'ETC'];

export async function classifyEventTypeWithAI({ title, rawLabel, apiKey }) {
  if (!apiKey) {
    console.warn(`⚠️ GEMINI_API_KEY 없음 → "${rawLabel}"(${title}) ETC로 분류`);
    return 'ETC';
  }

  const prompt = `당신은 지역 행사 정보를 표준 카테고리로 분류하는 데이터 정제 도구입니다.
아래 행사의 원본 분류명과 제목을 보고, 반드시 다음 5개 값 중 하나만 선택하세요: ${EVENT_TYPES.join(', ')}.
- FESTIVAL: 지역 축제, 문화 제전
- EXHIBITION: 미술 전시, 박람회, 역사 전시
- PERFORMANCE: 야외 공연, 음악회, 연극
- POPUP: 단기 팝업스토어, 체험 행사
- ETC: 위 4개 중 명확히 판단할 수 없는 경우

원본 분류명: ${rawLabel || '(없음)'}
제목: ${title || '(없음)'}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'text/x.enum',
            responseSchema: { type: 'STRING', enum: EVENT_TYPES },
          },
        }),
      }
    );

    if (!res.ok) {
      console.warn(`⚠️ Gemini 분류 실패 (HTTP ${res.status}) → "${rawLabel}"(${title}) ETC로 분류`);
      return 'ETC';
    }

    const data = await res.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!EVENT_TYPES.includes(answer)) {
      console.warn(`⚠️ Gemini 응답이 허용된 카테고리가 아님("${answer}") → "${rawLabel}"(${title}) ETC로 분류`);
      return 'ETC';
    }

    if (answer !== 'ETC') {
      console.log(`  🤖 AI 분류: "${rawLabel}"(${title}) → ${answer}`);
    }
    return answer;
  } catch (e) {
    console.warn(`⚠️ Gemini 호출 오류(${e.message}) → "${rawLabel}"(${title}) ETC로 분류`);
    return 'ETC';
  }
}
