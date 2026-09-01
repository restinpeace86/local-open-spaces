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

export const BUDGET_OPTIONS: { id: Budget; label: string }[] = [
  { id: 'FREE', label: '완전 무료' },
  { id: 'UNDER_10K', label: '1만 원 이하' },
  { id: 'UNDER_30K', label: '2~3만 원 이하' },
  { id: 'ANY', label: '상관없어요' },
];

// target_age_group(open_spaces 실제 컬럼값 도메인: 영유아/초등/전연령)과 정확히 일치시켜야
// 필터/스코어링이 실제로 작동한다 — 존재하지 않는 연령대 값을 임의로 추가하지 않는다.
export const KIDS_AGE_OPTIONS: { id: KidsAgeGroup; label: string }[] = [
  { id: '영유아', label: '영유아 (0~3세)' },
  { id: '초등', label: '초등 (7~12세)' },
  { id: '전연령', label: '다양한 연령이 함께' },
];

export const KIDS_COUNT_OPTIONS = [1, 2, 3] as const; // 3은 "3명 이상"을 의미

// 대분류를 부모 친화적 말투로 변환(요구사항 8단계) — CORE_SPOT_CATEGORIES(spot-category-
// groups.ts)의 나들이 전용 핵심 중분류를 키즈친화 식당(Meal 단계가 별도 처리) 제외하고
// 정확히 4개 성향으로 나눈 것과 1:1 대응한다(search-engine.ts의 VIBE_CATEGORY_MINS).
export const VIBE_OPTIONS: { id: Vibe; label: string; emoji: string }[] = [
  { id: 'ACTIVE', label: '신나게 뛰어놀기', emoji: '🏃' },
  { id: 'EDUCATION', label: '교육 및 체험', emoji: '🎨' },
  { id: 'NATURE', label: '힐링 자연', emoji: '🌳' },
  { id: 'CULTURE', label: '문화 즐기기', emoji: '🎭' },
];

// 요구사항 3의 예시("점심 전에 나가시네요, 밖에서 식사도 함께 하실 예정인가요?")를 그대로
// 템플릿화하되, 4개 시간대 전부에 자연스럽게 대응하도록 확장한다.
export function buildMealQuestion(timeSlotLabel: string): string {
  return `${timeSlotLabel}에 나가시는군요! 혹시 밖에서 식사도 함께 하실 예정인가요?`;
}

// 각 단계 진입 직전, 이전 답변을 받아치는 짧은 리액션(단순 설문조사처럼 보이지 않게 하는
// 요구사항 2-①의 취지) — 날씨(5단계) 리액션은 weather-reaction.ts가 별도로 더 풍부하게
// 담당하므로 여기서는 그 앞 단계들만 다룬다.
export function buildWhenAck(whenLabel: string): string {
  return `${whenLabel} 나들이 계획이시군요! 언제쯤 출발하실 예정인가요?`;
}

export function buildTransportAck(): string {
  return '좋아요! 이제 얼마나 멀리까지 움직일 수 있으신지 알려주세요.';
}

export function buildBudgetAck(): string {
  return '취향을 확실히 알려주셔서 감사해요! 예산은 어느 정도로 생각하고 계세요?';
}

export function buildKidsAck(): string {
  return '거의 다 왔어요! 함께 가는 아이는 몇 명이고, 연령대는 어떻게 되나요?';
}

export function buildVibeAck(): string {
  return '마지막 질문이에요! 오늘 나들이는 어떤 분위기를 원하세요?';
}
