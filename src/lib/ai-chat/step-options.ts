// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): 1~8단계 인터뷰의 칩 선택지와
// AI 말풍선 문구를 정의한다. 요구사항 2-① "LLM을 전혀 호출하지 않음. 프론트엔드 상태
// 관리와 백엔드 템플릿 리터럴 조합으로 처리"를 그대로 구현한다 — 이 파일 전체가 결정적
// 문자열 조합 함수로만 구성된다.
import { Budget, KidsAgeGroup, OutdoorPreference, Vibe } from './search-engine';
import { WhenChoice } from './date-resolver';

export const WHEN_OPTIONS: { id: WhenChoice; label: string }[] = [
  { id: 'TODAY', label: '오늘' },
  { id: 'TOMORROW', label: '내일' },
  { id: 'THIS_SATURDAY', label: '이번 주 토요일' },
  { id: 'THIS_SUNDAY', label: '이번 주 일요일' },
  { id: 'CUSTOM', label: '직접 선택할게요' },
];

// [챗봇 개선](2026-09-04 사용자 지시) 1: "날씨 알아보기 전에 현재 시간을 먼저 파악해줘 —
// 늦은 오후/저녁이면 오늘 나갈 계획을 생각하지 말고 그냥 내일 갈 건지 다른 날 갈 건지만
// 물어보도록." 이미 늦은 시간(date-resolver.ts isLateInDay)이면 "오늘"은 물론
// "이번 주 토/일요일"도 오늘일 수 있어(오늘이 토/일요일이면) 함께 제외하고, 내일과
// "다른 날 직접 선택" 두 가지만 남긴다.
export const WHEN_OPTIONS_WHEN_LATE: { id: WhenChoice; label: string }[] = [
  { id: 'TOMORROW', label: '내일' },
  { id: 'CUSTOM', label: '다른 날 선택할게요' },
];

export type TimeSlotId = 'BEFORE_LUNCH' | 'AFTER_LUNCH' | 'AFTERNOON' | 'EVENING';
export const TIME_OPTIONS: { id: TimeSlotId; label: string; hour: number }[] = [
  { id: 'BEFORE_LUNCH', label: '점심 전', hour: 10 },
  { id: 'AFTER_LUNCH', label: '점심 먹고', hour: 13 },
  { id: 'AFTERNOON', label: '오후', hour: 15 },
  { id: 'EVENING', label: '저녁', hour: 18 },
];

export type TransportId = 'WALK' | 'DRIVE_10' | 'DRIVE_30' | 'DRIVE_60_PLUS';
export const TRANSPORT_OPTIONS: { id: TransportId; label: string; radiusMeters: number }[] = [
  { id: 'WALK', label: '도보 가능한 가까운 곳', radiusMeters: 1000 },
  { id: 'DRIVE_10', label: '차로 10분 이내', radiusMeters: 5000 },
  { id: 'DRIVE_30', label: '차로 30분 이내', radiusMeters: 15000 },
  { id: 'DRIVE_60_PLUS', label: '1시간 이상', radiusMeters: 40000 },
];

export const OUTDOOR_PREFERENCE_OPTIONS: { id: OutdoorPreference; label: string }[] = [
  { id: 'OUTDOOR', label: '야외로 갈래요' },
  { id: 'INDOOR', label: '실내가 좋아요' },
  { id: 'EITHER', label: '둘 다 보여주세요' },
];

// [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 1: 챗봇 실행
// 시 먼저 던지는 날씨 기반 선제적 제안에 대한 3지 선다 — 요구사항 원문 선택지 포맷 그대로.
export type WeatherIntroChoice = 'ACCEPT' | 'CUSTOM' | 'MIX';
export const WEATHER_INTRO_CHOICE_OPTIONS: { id: WeatherIntroChoice; label: string }[] = [
  { id: 'ACCEPT', label: '네, 제안대로 볼래요 👍' },
  { id: 'CUSTOM', label: '아니요, 다른 스타일로 고를래요 🏛️' },
  { id: 'MIX', label: '상관없어요, 전체 다 믹스 ✨' },
];

// [Step 1 지역 선택 분기]: 매번 검색하게 하지 않고 프로필 기본 지역(우리 동네)을 원클릭으로
// 쓸 수 있게 한다.
export const REGION_OPTIONS: { id: 'DEFAULT' | 'OTHER'; label: string }[] = [
  { id: 'DEFAULT', label: '네, 우리 동네 근처로 볼래요 📍' },
  { id: 'OTHER', label: '다른 지역으로 바꿀래요 🗺️' },
];

export function buildRegionQuestion(sigunguName: string | null): string {
  return sigunguName
    ? `오늘 나들이 가실 지역은 평소 동네(${sigunguName}) 근처로 잡아드릴까요?`
    : '오늘 나들이 가실 지역은 평소 보시던 곳 근처로 잡아드릴까요?';
}

// [챗봇 문제점 수정](2026-09-02 사용자 지시) 3 → (2026-09-03 후속 결정) "1만원 이하가
// 인당인지 가족 전체인지 모호하다"는 지적에 라벨만 고쳤었는데, 사용자와 함께 원천
// 데이터를 직접 조사한 결과 open_spaces 142,109건 중 실제 이용료 숫자를 파싱할 수 있는
// 소스는 0.76%뿐임을 확인했다 — "1만원 이하/2~3만원 이하"는 걸러낼 근거 데이터가
// 사실상 없는 가짜 정밀도였다(search-engine.ts matchesBudget 주석 참고). 거의 전체
// 데이터에 안정적으로 채워진 `is_free`만으로 판단 가능한 무료/유료/상관없음 3단계로
// 되돌린다(제3장 제5조 추측 금지 — 실제로 못 거르는 옵션을 보여주지 않는다).
// [챗봇 개선](2026-09-04 사용자 지시) 4: "우리 예산 선택지는 완전무료/유료밖에 없으니
// 혹시 무료인 곳들 위주로 알아볼까요? 하고 질문을 바꿔" — 실제로 가진 데이터(is_free)로
// 걸러낼 수 있는 것은 여전히 무료/유료/상관없음 3단계뿐이라 Budget 타입과 필터 로직은
// 그대로 두고(matchesBudget), "예산은 어느 정도로 생각하세요?"라는 중립적 설문 톤 대신
// "무료 위주로 볼까요?"라고 먼저 제안하는 톤으로 질문/라벨만 바꾼다.
export const BUDGET_OPTIONS: { id: Budget; label: string }[] = [
  { id: 'FREE', label: '네, 무료인 곳 위주로 볼래요' },
  { id: 'PAID', label: '아니요, 유료도 괜찮아요' },
  { id: 'ANY', label: '상관없어요' },
];

// [챗봇 문제점 수정](2026-09-02 사용자 지시) 4: "연령대에 4~6세가 빠졌다" — 실제로는
// target_age_group(open_spaces 실제 컬럼값 도메인: 영유아/초등/전연령) 자체가 3개
// 값만 존재해 빠진 게 아니라, 라벨 문구("0~3세")가 실제 판정 기준과 달라 혼동을 줬다.
// personalization.ts의 나이 자동 매핑(ageToKidsAgeGroup)이 이미 영유아보육법 정의를
// 따라 "0~6세(미취학)"로 판정하는데, 이 수동 선택 라벨만 옛 문구를 쓰고 있었다 —
// 두 로직이 실제로는 항상 같은 기준을 썼으므로 라벨만 실제 기준에 맞게 고친다(로직
// 변경 없음). "전연령"은 "특정 연령 제한 없이 온 가족이 함께"라는 뜻임을 괄호로 명시.
export const KIDS_AGE_OPTIONS: { id: KidsAgeGroup; label: string }[] = [
  { id: '영유아', label: '영유아 (0~6세, 미취학)' },
  { id: '초등', label: '초등 (7~12세, 취학)' },
  { id: '전연령', label: '전연령 (특정 연령 없이 온 가족 함께)' },
];

export const KIDS_COUNT_OPTIONS = [1, 2, 3] as const; // 3은 "3명 이상"을 의미

// [챗봇 카테고리 체계 동기화](2026-09-03 사용자 지시): "대분류를 이벤트픽 기준인 자연/캠핑,
// 키즈카페, 체험/농장, 축제/이벤트, 문화/전시, 배움/클래스 6가지로 확정" — 라벨/이모지를
// category-maj-meta.ts의 CATEGORY_MAJ_OPTIONS(이벤트픽 홈 화면 대분류)와 동일하게 맞춘다
// (스포츠 대여만 제외 — 이 챗봇의 검색 도메인인 open_spaces에 그에 대응하는 나들이 목적
// 데이터가 없어 원래도 다루지 않던 영역). 실제 category_min 매핑은 search-engine.ts의
// VIBE_CATEGORY_MINS 참고(라벨은 이벤트픽과 동기화하되, open_spaces 실측 데이터 기준으로
// 새로 구성했다 — 자세한 근거는 그 파일 주석 참고).
// [챗봇 문제점 수정](2026-09-02 사용자 지시) 5: "이게 대분류 기준이야? 여러 개 고를 수
// 있게 하거나 전체도 고를 수 있게 해달라" — 맞다, 대분류 기준이었고 단일 선택만
// 가능했다. 이제 여러 개를 토글해서 고르거나(ai-chat-sheet.tsx가 다중 선택 UI 담당),
// 분위기 상관없이 전체를 보고 싶으면 vibes를 빈 배열로 보내면 된다(matchesVibe가
// 빈 배열을 "필터링 안 함"으로 해석).
export const VIBE_OPTIONS: { id: Vibe; label: string; emoji: string }[] = [
  { id: 'NATURE_CAMPING', label: '자연 / 캠핑', emoji: '🏕️' },
  // [이벤트픽 대분류 개편](2026-09-05 사용자 지시): "공공 키즈카페" → "키즈놀이터" 개명.
  { id: 'KIDS_CAFE', label: '키즈놀이터', emoji: '🧸' },
  { id: 'FARM_EXPERIENCE', label: '체험 / 농장', emoji: '🌱' },
  { id: 'FESTIVAL_EVENT', label: '축제 / 이벤트', emoji: '🎉' },
  { id: 'CULTURE_EXHIBITION', label: '문화 / 전시', emoji: '🖼️' },
  { id: 'LEARNING_CLASS', label: '배움 / 클래스', emoji: '📚' },
];

// vibes: 다중 선택 결과 → 메시지/요약에 쓸 표시용 라벨. 빈 배열("전체")은 "전체"로 표시.
export function buildVibeLabel(vibes: Vibe[]): string {
  if (vibes.length === 0) return '전체';
  return vibes.map((v) => VIBE_OPTIONS.find((o) => o.id === v)?.label ?? v).join(' · ');
}

// 요구사항 3의 예시("점심 전에 나가시네요, 밖에서 식사도 함께 하실 예정인가요?")를 그대로
// 템플릿화하되, 4개 시간대 전부에 자연스럽게 대응하도록 확장한다.
export function buildMealQuestion(timeSlotLabel: string): string {
  return `${timeSlotLabel}에 나가시는군요! 혹시 밖에서 식사도 함께 하실 예정인가요?`;
}

// 각 단계 진입 직전, 이전 답변을 받아치는 짧은 리액션(단순 설문조사처럼 보이지 않게 하는
// 요구사항 2-①의 취지) — 날씨 리액션은 weather-reaction.ts가 별도로 더 풍부하게 담당한다.
export function buildTimeAck(): string {
  return '좋아요! 언제쯤 출발하실 예정인가요?';
}

export function buildTransportAck(): string {
  return '좋아요! 이제 얼마나 멀리까지 움직일 수 있으신지 알려주세요.';
}

export function buildBudgetAck(): string {
  return '취향을 확실히 알려주셔서 감사해요! 혹시 무료인 곳들 위주로 알아볼까요?';
}

export function buildKidsAck(): string {
  return '거의 다 왔어요! 함께 가는 아이는 몇 명이고, 연령대는 어떻게 되나요?';
}

export function buildVibeAck(): string {
  return '마지막 질문이에요! 오늘 나들이는 어떤 분위기를 원하세요? 여러 개 골라도 되고, 상관없으면 "전체"를 눌러주세요.';
}
