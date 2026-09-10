import { createClient } from '@/lib/supabase/server';
import { canAccessCommunityFeed, MomPickGrade } from './grades';

// [맘스픽 전체보기(full list) API 가드](2026-09-02 도입 / 2026-09-11 사용자 지시로
// 강화): "로그인 안 했거나 아직 가입맘이면 맘스픽을 볼 수는 있지만 '전체보기' 같은
// 건 못 눌러야 한다 — 뭔가 눌러서 보려고 하면 로그인/첫 글 쓰기로 가야 한다."
//
// 역할 분담:
//  - 메인 미리보기(`/api/mom-pick/dashboard`, 3~5건): 게이팅하지 않는다(게스트도
//    배경으로 볼 수 있어야 함 — todo.md 개선사항4 투명 오버레이 온보딩).
//  - 전체보기 목록(`/api/mom-pick/{expert,trending,live}`): 이 함수로 **새싹맘
//    이상만** 허용한다. 클라이언트(mom-pick-view.tsx)의 투명 인터셉트 레이어가
//    UI에서 먼저 막지만, 직접 URL 접근/우회를 대비한 서버 측 방어선이다
//    (라우트는 service_role로 RLS를 우회해 조회하므로 인증·등급 검증을 라우트
//    레벨에서 직접 해야 한다). Decision 019 "맘스픽 커뮤니티는 새싹맘 이상만"과
//    spec/community/mom-pick-grades.md 1절(등급표)에 부합한다.
export async function requireCommunityAccess(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: '로그인하고 후기를 남기면 맘스픽 전체보기를 이용할 수 있어요.' };
  }

  const { data: profile } = await supabase.from('profiles').select('grade').eq('id', user.id).single();
  if (!canAccessCommunityFeed((profile?.grade as MomPickGrade | undefined) ?? null)) {
    return { ok: false, status: 403, message: '첫 후기를 남겨 새싹맘이 되면 맘스픽 전체보기를 이용할 수 있어요.' };
  }
  return { ok: true };
}
