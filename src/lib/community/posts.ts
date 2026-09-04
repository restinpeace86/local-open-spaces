import { createClient } from '@/lib/supabase/client';
import { ChecklistAnswers } from './checklist-items';
import { SurveyAnswers } from './survey-options';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 후기/체크리스트
// 작성 및 커뮤니티 피드 조회. profiles/birth_years와 동일하게 API 라우트 없이 클라이언트
// supabase 세션으로 직접 CRUD한다 — RLS(mom_pick_posts_*)가 소유자 검증을 대신한다.
//
// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1: 'survey_review'
// 타입과 그 전용 컬럼(event_id + 설문 7종 + photo_urls)을 추가한다. 기존
// 'micro_review'/'checklist' 값과 컬럼은 과거 데이터 조회용으로 그대로 남긴다.
export type MomPickPost = {
  id: string;
  author_id: string;
  spot_id: string | null;
  event_id: string | null;
  post_type: 'micro_review' | 'checklist' | 'survey_review';
  rating: number | null;
  content: string | null;
  checklist_answers: ChecklistAnswers | null;
  age_groups: string[] | null;
  visit_environment: string | null;
  satisfaction_points: string[] | null;
  duration_type: string | null;
  weather_tags: string[] | null;
  infra_tags: string[] | null;
  companion_type: string | null;
  photo_urls: string[] | null;
  like_count: number;
  is_adopted: boolean;
  created_at: string;
  open_spaces: { name: string } | null;
  events: { name: string } | null;
};

const POST_SELECT = '*, open_spaces(name), events(name)';

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

// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1·3-4: [설문형
// 스마트 리뷰 폼] 등록. target은 1단계에서 고른 스팟 또는 이벤트 중 정확히 하나
// (spotId/eventId 중 하나만 채워 호출 — 둘 다 없으면 저장하지 않는다, "장소 없는
// 후기"는 이 새 흐름에서는 허용하지 않는다). 설문/사진은 전부 선택 사항이라
// SurveyAnswers 필드가 비어 있어도(빈 배열/null) 그대로 저장한다.
export async function createSurveyReview(input: {
  spotId?: string | null;
  eventId?: string | null;
  survey: SurveyAnswers;
  content?: string;
  photoUrls?: string[];
}): Promise<MomPickPost> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');
  if (!input.spotId && !input.eventId) throw new Error('먼저 스팟이나 이벤트를 선택해주세요.');

  const { data, error } = await supabase
    .from('mom_pick_posts')
    .insert({
      author_id: userData.user.id,
      spot_id: input.spotId || null,
      event_id: input.eventId || null,
      post_type: 'survey_review',
      content: input.content?.trim() || null,
      age_groups: input.survey.ageGroups,
      visit_environment: input.survey.visitEnvironment,
      satisfaction_points: input.survey.satisfactionPoints,
      duration_type: input.survey.durationType,
      weather_tags: input.survey.weatherTags,
      infra_tags: input.survey.infraTags,
      companion_type: input.survey.companionType,
      photo_urls: input.photoUrls && input.photoUrls.length > 0 ? input.photoUrls : null,
    })
    .select(POST_SELECT)
    .single();

  if (error) throw new Error(`후기 작성 실패: ${error.message}`);
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
