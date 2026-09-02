import { createClient } from '@/lib/supabase/client';

// [Decision 018](2026-09-02) / spec/common/auth-user-profile.md: "birth_years(자녀
// 출생년도 배열) 필드 포함". 로그인 시 DB 트리거(2026-09-02-create-profiles-table.sql의
// handle_new_user)가 이미 빈 배열로 프로필 행을 만들어두므로, 여기서는 조회/수정만
// 담당한다(행 생성 자체를 클라이언트가 다시 시도하지 않음 — 중복 로직 방지).
export type Profile = {
  id: string;
  birth_years: number[];
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
  return data;
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
  return data;
}
