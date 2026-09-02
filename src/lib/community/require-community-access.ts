import { createClient } from '@/lib/supabase/server';
import { canAccessCommunityFeed, MomPickGrade } from './grades';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시) API 라우트 공용 가드: 대시보드/전체보기
// 라우트는 service_role(createAdminClient)로 RLS를 우회해 조회하므로, 로그인·등급
// 검증을 라우트 레벨에서 직접 해야 한다(Decision 019 "맘스픽 커뮤니티는 새싹맘 이상만").
export async function requireCommunityAccess(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: '로그인이 필요합니다.' };

  const { data: profile } = await supabase.from('profiles').select('grade').eq('id', user.id).single();
  if (!canAccessCommunityFeed((profile?.grade as MomPickGrade | undefined) ?? null)) {
    return { ok: false, status: 403, message: '맘스픽 커뮤니티는 새싹맘 이상만 이용할 수 있어요.' };
  }
  return { ok: true };
}
