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
export type Profile = {
  id: string;
  birth_years: number[];
  grade: MomPickGrade;
  nickname: string | null;
  ai_chat_free_uses_used: number;
  created_at: string;
  updated_at: string;
};

// 로그인하지 않은 상태면 null을 반환한다(에러가 아님 — 호출부가 "로그인 필요" 화면을
// 보여줄 수 있는 정상적인 상태).
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw new Error(`프로필 조회 실패: ${error.message}`);
  return data as Profile;
}

// birthYears: 자녀 출생년도 배열 그대로(정렬/중복 제거는 호출부 UI 책임 — 이 함수는
// 저장만 담당).
export async function updateBirthYears(birthYears: number[]): Promise<Profile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('profiles')
    .update({ birth_years: birthYears, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw new Error(`프로필 저장 실패: ${error.message}`);
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
  return data as Profile;
}
