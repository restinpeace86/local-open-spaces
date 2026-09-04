// [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 2: 로그인
// 유저의 profiles.birth_years(자녀 출생년도 배열, Decision 018)로 나이를 자동 환산해
// "나이 묻는 스텝"을 건너뛴다. 만 나이 계산에 필요한 생일(월/일)은 이 프로젝트 데이터에
// 없어(추측 금지) 정확한 만 나이가 아니라 "연 나이"(현재 연도 - 출생년도)로 계산한다 —
// 실제 나이와 최대 ±1세 오차가 있을 수 있음을 알고 하는 단순화다.
import { KidsAgeGroup } from './search-engine';

export function calculateAgesFromBirthYears(birthYears: number[], now: Date = new Date()): number[] {
  const currentYear = now.getFullYear();
  return birthYears.map((y) => currentYear - y).filter((age) => age >= 0);
}

// 나이 → open_spaces/events의 실제 target_age_group 도메인(영유아/초등/전연령, project/
// database_schema.md 확인된 값)에 매핑한다. "영유아"는 한국 법령(영유아보육법)상 통상
// 취학 전(만 6세 이하)을 가리키는 정의를 그대로 따랐다(임의 경계값이 아님).
export function ageToKidsAgeGroup(age: number): KidsAgeGroup {
  if (age <= 6) return '영유아';
  if (age <= 12) return '초등';
  return '전연령';
}

// 자녀가 여럿이고 나이대가 갈리면(예: 영유아+초등 혼합) '전연령'(다양한 연령이 함께)이
// 의미상 정확히 그 상황을 가리킨다 — 억지로 하나를 고르지 않는다.
export function deriveKidsAgeGroup(ages: number[]): KidsAgeGroup | null {
  if (ages.length === 0) return null;
  const groups = new Set(ages.map(ageToKidsAgeGroup));
  return groups.size === 1 ? [...groups][0] : '전연령';
}

// [개선사항5 - 다자녀/동갑 아이 나이 멘트 최적화](2026-09-04 todo.md): "아이들의
// 출생년도가 같거나 쌍둥이인 경우, '3살, 3살 아이들'처럼 기계적으로 반복하여 출력하지
// 않음 — '3살 두 아이' 형태로 자연스럽게 묶는다." 2~10명까지는 고유어 수 표현으로,
// 그 이상은(현실적으로 거의 없지만 방어적으로) 숫자+'명'으로 표현한다.
const NATIVE_COUNT_WORDS = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
function countWord(count: number): string {
  return NATIVE_COUNT_WORDS[count] ? `${NATIVE_COUNT_WORDS[count]} 아이` : `아이 ${count}명`;
}

// 요구사항 원문 예시("아, OO맘님! 네 살 아이와 함께 나들이 가시는군요!")의 톤 — 출생년도
// 숫자는 절대 그대로 노출하지 않고 환산된 나이만 말한다. displayName은 Supabase Auth
// 제공자(Kakao/Google)가 실제로 내려주는 필드가 서로 달라(추측 금지) 있으면 쓰고 없으면
// 생략한다.
export function buildPersonalizedGreeting(ages: number[], displayName?: string | null): string {
  if (ages.length === 0) return '';

  const namePart = displayName ? `${displayName}님! ` : '';
  const sorted = [...ages].sort((a, b) => a - b);

  let agesLabel: string;
  if (sorted.length === 1) {
    agesLabel = `${sorted[0]}살 아이`;
  } else if (new Set(sorted).size === 1) {
    // 전부 동갑(쌍둥이 포함) — 같은 숫자를 반복 나열하지 않고 자연스럽게 묶는다.
    agesLabel = `${sorted[0]}살 ${countWord(sorted.length)}`;
  } else {
    agesLabel = `${sorted.join('살, ')}살 아이들`;
  }
  return `아, ${namePart}${agesLabel}와 함께 나들이 가시는군요!`;
}
