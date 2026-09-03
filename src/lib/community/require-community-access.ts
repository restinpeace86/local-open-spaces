import { createClient } from '@/lib/supabase/server';
import { canAccessCommunityFeed, MomPickGrade } from './grades';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시) API 라우트 공용 가드: 대시보드/전체보기
// 라우트는 service_role(createAdminClient)로 RLS를 우회해 조회하므로, 로그인·등급
// 검증을 라우트 레벨에서 직접 해야 한다(Decision 019 "맘스픽 커뮤니티는 새싹맘 이상만").
//
// [todo.md 개선사항 10](2026-09-03): "비로그인 사용자도 맘스픽 메인 화면(피드 열람)에
// 접근 허용, 상세 진입/글쓰기만 로그인 체크(Soft-wall)"에 따라 비로그인 게스트는 더 이상
// 여기서 막지 않는다 — 이 함수를 쓰는 4개 라우트(dashboard/expert/trending/live)는 전부
// 읽기 전용 목록/미리보기 조회라 글쓰기와 무관하다(글쓰기 자체는 posts.ts의 별도 인증
// 검사가 담당, 이 함수의 책임 밖). 로그인은 했지만 아직 새싹맘이 아닌 사용자에 대한
// 기존 정책(Decision 019)은 이번 지시 범위 밖이라 그대로 유지한다.
export async function requireCommunityAccess(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true };

  const { data: profile } = await supabase.from('profiles').select('grade').eq('id', user.id).single();
  if (!canAccessCommunityFeed((profile?.grade as MomPickGrade | undefined) ?? null)) {
    return { ok: false, status: 403, message: '맘스픽 커뮤니티는 새싹맘 이상만 이용할 수 있어요.' };
  }
  return { ok: true };
}
