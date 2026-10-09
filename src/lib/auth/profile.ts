import { createClient } from '@/lib/supabase/client';
import { MomPickGrade } from '@/lib/community/grades';

// [Decision 018](2026-09-02) / spec/common/auth-user-profile.md: "birth_years(자녀
// 출생년도 배열) 필드 포함". 로그인 시 DB 트리거(2026-09-02-create-profiles-table.sql의
// handle_new_user)가 이미 빈 배열로 프로필 행을 만들어두므로, 여기서는 조회/수정만
// 담당한다(행 생성 자체를 클라이언트가 다시 시도하지 않음 — 중복 로직 방지).
// [Decision 019](2026-09-02): grade/ai_chat_free_uses_used 컬럼 추가(맘스픽 등급/챗봇
// 무료 체험 카운터).
// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): nickname 컬럼 추가 — 파워맘/우수맘
// 추천 카드에 "작성자의 닉네임" 표시가 필수라 실명/이메일 대신 쓸 공개 식별자가
// 필요했다. 설정 전에는 null(호출부가 "이름 없는 맘" 등으로 안전하게 폴백).
// [출생 연+월 정밀화](2026-10-06 todo.md 개선사항 4): "기존 '출생 연도'만
// 수집하던 입력을 '몇 년 몇 월생'까지" — birth_years와 같은 인덱스로
// 대응하는 birth_months를 병렬 배열로 추가(기존 birth_years 자체는 여러
// 파일이 "연 나이" 계산에 그대로 쓰고 있어 그대로 둔다, 제5장 제4조).
export type Profile = {
  id: string;
  birth_years: number[];
  birth_months: number[];
  grade: MomPickGrade;
  nickname: string | null;
  ai_chat_free_uses_used: number;
  created_at: string;
  updated_at: string;
};

// [프로필 캐싱 — 중복 왕복 제거](2026-10-09 사용자 질문: "위치설정이라던가
// 온보딩때의 애 나이같은거는 바로바로 세션으로 가지고 있는거야?") 실측
// 확인: getMyProfile()이 15곳에서 호출되는데 캐시가 전혀 없어 매번
// auth.getUser()+profiles select 2왕복(왕복 1회 ~70~180ms, 같은 세션에서
// 이미 실측)을 새로 한다 — 특히 리스트 카드마다 하나씩 렌더되는
// BookmarkButton처럼 "같은 화면에 여러 개" 뜨는 컴포넌트는 그 개수만큼
// 중복 조회가 발생한다. culture-club-store-coordinates-cache.ts와 동일한
// 패턴(짧은 TTL + 진행 중인 요청을 공유해 동시 호출을 중복시키지 않음)
// 으로 중복을 없앤다(제5장 제4조 기존 구조 우선) — 호출부 15곳은 전혀
// 안 바뀐다(이 파일 내부만 바뀜).
//
// [무효화가 필요한 지점] updateNickname/updateBirthYearsAndMonths(이
// 파일)가 직접 바꾸는 경우는 즉시 invalidateMyProfileCache()로 무효화한다.
// 로그인/로그아웃(다른 사용자로 전환)도 onAuthStateChange로 감지해
// 무효화한다 — 안 그러면 로그아웃 후 다른 계정으로 로그인해도 이전
// 사용자의 캐시된 프로필을 잠깐 돌려주는 사고가 날 수 있다. 반면 서버
// 쪽에서 바뀌는 경우(DB 트리거로 등급 승급, /api/ai-chat/search의 무료
// 횟수 소진 등)는 이 클라이언트 캐시가 알 방법이 없어 TTL(30초)이 지나야
// 반영된다 — "글쓰기 직후 즉시 등급이 바뀌어야 하는" 케이스(2026-09-13에
// 고친 버그, mom-pick-view.tsx의 refreshProfileAfterPost)는 TTL을
// 기다리지 않도록 그 호출부가 invalidateMyProfileCache()를 직접 부른다.
const CACHE_TTL_MS = 30 * 1000;
let cachedResult: { profile: Profile | null; fetchedAt: number } | null = null;
let pendingRequest: Promise<Profile | null> | null = null;
let hasSubscribedToAuthChanges = false;

export function invalidateMyProfileCache(): void {
  cachedResult = null;
  pendingRequest = null;
}

function ensureAuthInvalidationSubscribed(supabase: ReturnType<typeof createClient>): void {
  if (hasSubscribedToAuthChanges) return;
  hasSubscribedToAuthChanges = true;
  supabase.auth.onAuthStateChange(() => {
    invalidateMyProfileCache();
  });
}

// 로그인하지 않은 상태면 null을 반환한다(에러가 아님 — 호출부가 "로그인 필요" 화면을
// 보여줄 수 있는 정상적인 상태).
export async function getMyProfile(): Promise<Profile | null> {
  if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL_MS) {
    return cachedResult.profile;
  }
  if (pendingRequest) return pendingRequest;

  const supabase = createClient();
  ensureAuthInvalidationSubscribed(supabase);

  pendingRequest = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      cachedResult = { profile: null, fetchedAt: Date.now() };
      return null;
    }

    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (error) throw new Error(`프로필 조회 실패: ${error.message}`);
    cachedResult = { profile: data as Profile, fetchedAt: Date.now() };
    return cachedResult.profile;
  })();

  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}

// birthYears/birthMonths: 같은 인덱스로 대응하는 자녀 출생년도/출생월 배열
// 그대로(정렬/중복 제거, 두 배열 길이 일치는 호출부 UI 책임 — 이 함수는
// 저장만 담당). 항상 함께 갱신해 두 배열이 서로 어긋나지 않게 한다.
export async function updateBirthYearsAndMonths(birthYears: number[], birthMonths: number[]): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('profiles')
    .update({ birth_years: birthYears, birth_months: birthMonths, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw new Error(`프로필 저장 실패: ${error.message}`);
  invalidateMyProfileCache();
  return data as Profile;
}

// nickname: 공백만 있으면 null로 저장한다(설정 안 함과 동일 취급 — 빈 문자열이 화면에
// 어색하게 노출되는 것을 방지).
export async function updateNickname(nickname: string): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const trimmed = nickname.trim();
  const { data, error } = await supabase
    .from('profiles')
    .update({ nickname: trimmed || null, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw new Error(`닉네임 저장 실패: ${error.message}`);
  invalidateMyProfileCache();
  return data as Profile;
}
