import { createClient } from '@/lib/supabase/client';
import { ChecklistAnswers } from './checklist-items';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 후기/체크리스트
// 작성 및 커뮤니티 피드 조회. profiles/birth_years와 동일하게 API 라우트 없이 클라이언트
// supabase 세션으로 직접 CRUD한다 — RLS(mom_pick_posts_*)가 소유자 검증을 대신한다.
export type MomPickPost = {
  id: string;
  author_id: string;
  spot_id: string | null;
  post_type: 'micro_review' | 'checklist';
  rating: number | null;
  content: string | null;
  checklist_answers: ChecklistAnswers | null;
  like_count: number;
  is_adopted: boolean;
  created_at: string;
  open_spaces: { name: string } | null;
};

const POST_SELECT = '*, open_spaces(name)';

export async function createMicroReview(input: { spotId: string; rating: number; content?: string }): Promise<MomPickPost> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('mom_pick_posts')
    .insert({
      author_id: userData.user.id,
      spot_id: input.spotId,
      post_type: 'micro_review',
      rating: input.rating,
      content: input.content?.trim() || null,
    })
    .select(POST_SELECT)
    .single();

  if (error) throw new Error(`후기 작성 실패: ${error.message}`);
  return data as MomPickPost;
}

export async function createChecklistPost(input: { spotId: string; answers: ChecklistAnswers }): Promise<MomPickPost> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('mom_pick_posts')
    .insert({
      author_id: userData.user.id,
      spot_id: input.spotId,
      post_type: 'checklist',
      checklist_answers: input.answers,
    })
    .select(POST_SELECT)
    .single();

  if (error) throw new Error(`체크리스트 작성 실패: ${error.message}`);
  return data as MomPickPost;
}

export async function listCommunityFeed(limit = 30): Promise<MomPickPost[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('mom_pick_posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`맘스픽 피드 조회 실패: ${error.message}`);
  return (data ?? []) as MomPickPost[];
}

export async function listMyPosts(userId: string): Promise<MomPickPost[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('mom_pick_posts')
    .select(POST_SELECT)
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`내 활동 조회 실패: ${error.message}`);
  return (data ?? []) as MomPickPost[];
}

export async function toggleLike(postId: string, currentlyLiked: boolean): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  if (currentlyLiked) {
    const { error } = await supabase
      .from('mom_pick_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userData.user.id);
    if (error) throw new Error(`좋아요 취소 실패: ${error.message}`);
  } else {
    const { error } = await supabase.from('mom_pick_likes').insert({ post_id: postId, user_id: userData.user.id });
    if (error) throw new Error(`좋아요 실패: ${error.message}`);
  }
}

export async function getMyLikedPostIds(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new Set();

  const { data, error } = await supabase
    .from('mom_pick_likes')
    .select('post_id')
    .eq('user_id', userData.user.id)
    .in('post_id', postIds);

  if (error) throw new Error(`좋아요 상태 조회 실패: ${error.message}`);
  return new Set((data ?? []).map((row) => row.post_id));
}
