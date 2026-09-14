import { createAdminClient } from '@/lib/supabase/admin';
import { MomPickGrade } from './grades';
import { ChecklistAnswers } from './checklist-items';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): 파워맘/우수맘 추천·인기글·실시간 피드
// 3개 섹션은 전부 "다른 사용자의" 글 목록에 "다른 사용자의" 닉네임/등급 배지를 함께
// 보여줘야 한다. 그런데 profiles RLS(Decision 018)는 "본인 행만 SELECT 가능"이라
// 클라이언트 세션으로는 다른 사용자의 nickname/grade를 절대 조회할 수 없다(의도된
// 프라이버시 설계 — birth_years 등 민감 정보를 지키기 위함). profiles RLS를 완화하는
// 대신, 기존 curated_items/spot_curations와 동일한 관례대로 service_role
// (createAdminClient)로 서버에서만 조회하고, 응답에는 안전한 필드(id/nickname/grade)만
// 골라 담아 birth_years 등 민감 정보가 새어나가지 않게 한다.
//
// mom_pick_posts.author_id와 profiles.id는 둘 다 auth.users(id)를 가리키는 형제 FK라
// PostgREST 임베디드 조회(`select *, profiles(...)`)로 자동 연결되지 않는다(실측 확인 —
// push_subscriptions 배치 작업 때와 동일한 문제, mom-pick-push-send-batch.mjs 참고).
// 두 번 조회해 이 파일에서 직접 이어붙인다.
export type DashboardAuthor = { id: string; nickname: string | null; grade: MomPickGrade };

// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1: 'survey_review'
// 타입과 그 전용 필드를 추가한다. spotName은 이름 그대로 두되(호출부를 넓게 건드리지
// 않기 위함 — 제5장 제4조), open_spaces.name 또는 events.title 중 있는 쪽을 담는다
// (survey_review는 스팟 또는 이벤트 중 하나만 가리키므로 항상 둘 중 하나만 채워짐).
// [실시간 피드 조회 실패 버그 수정](2026-09-07 사용자 지시): "column events_1.name
// does not exist" — events 테이블에는 name 컬럼이 없고 title만 있다(실측 확인,
// information_schema 직접 조회). 이 파일이 처음 작성될 때부터 events(name)으로
// 잘못 임베드하고 있었는데, 실제로 이벤트를 가리키는 survey_review 게시글이 생기기
// 전까지는 이 코드 경로가 한 번도 실행되지 않아(항상 open_spaces만 있었음) 지금까지
// 드러나지 않았던 잠재 버그였다.
export type DashboardPost = {
  id: string;
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
  spotName: string | null;
  // [맘스픽 상세 → 스팟픽 이동](2026-09-13 사용자 지시): "맘스픽으로부터 스팟픽의
  // 해당 장소로 갈수 있어야해" — mom_pick_posts.spot_id(open_spaces 참조, 이
  // 테이블 최초 생성 시부터 있던 컬럼)를 그대로 노출해, PostDetailModal이 이
  // id로 /nearby?spot=<id> 딥링크를 만들 수 있게 한다. spotName만으로는(단순
  // 표시 문자열) 정확히 어떤 open_spaces 행인지 특정할 수 없다(이름 중복 가능).
  // 이벤트를 가리키는 글(event_id)은 이번 요청 범위(스팟픽 이동)에 포함되지
  // 않아 event_id는 노출하지 않는다.
  spotId: string | null;
  author: DashboardAuthor;
};

const POST_COLUMNS =
  'id, author_id, post_type, rating, content, checklist_answers, age_groups, visit_environment, satisfaction_points, duration_type, weather_tags, infra_tags, companion_type, photo_urls, like_count, is_adopted, created_at, spot_id, open_spaces(name), events(title)';

type RawPostRow = {
  id: string;
  author_id: string;
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
  spot_id: string | null;
  open_spaces: { name: string } | null;
  events: { title: string } | null;
};

function fallbackAuthor(id: string): DashboardAuthor {
  return { id, nickname: null, grade: 'sprout' };
}

async function attachAuthors(rows: RawPostRow[]): Promise<DashboardPost[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: authorRows, error } = await admin.from('profiles').select('id, nickname, grade').in('id', authorIds);
  if (error) console.error(`[MOM_PICK_DASHBOARD] 작성자 정보 조회 실패: ${error.message}`);

  const authorsById = new Map<string, DashboardAuthor>((authorRows ?? []).map((a) => [a.id, { id: a.id, nickname: a.nickname, grade: a.grade as MomPickGrade }]));

  return rows.map((row) => ({
    id: row.id,
    post_type: row.post_type,
    rating: row.rating,
    content: row.content,
    checklist_answers: row.checklist_answers,
    age_groups: row.age_groups,
    visit_environment: row.visit_environment,
    satisfaction_points: row.satisfaction_points,
    duration_type: row.duration_type,
    weather_tags: row.weather_tags,
    infra_tags: row.infra_tags,
    companion_type: row.companion_type,
    photo_urls: row.photo_urls,
    like_count: row.like_count,
    is_adopted: row.is_adopted,
    created_at: row.created_at,
    spotName: row.open_spaces?.name ?? row.events?.title ?? null,
    spotId: row.spot_id,
    author: authorsById.get(row.author_id) ?? fallbackAuthor(row.author_id),
  }));
}

export type PagedResult<T> = { items: T[]; total: number };

// ① 파워맘/우수맘 추천(Expert Curation) — 상급 등급 작성자의 글 중 관리자가
// "채택"(is_adopted)한 글만, 최신순.
// [Decision — 2026-09-15 사용자 지시] "내가 쓴글 빈약한데 파워만돼서 파워맘
// 추천픽에 노출됐잖아" — 등급은 활동량(이번 달 글쓰기 횟수) 기준 게이미피케이션
// 일 뿐이라, 등급만으로 추천픽을 고르면 내용 품질과 무관하게 노출될 수 있다.
// is_adopted는 관리자가 실제로 글을 검수해 "우수하다"고 수동 지정하는
// 필드(spec/community/mom-pick-grades.md 2.1)로, 원래 이 용도(품질 큐레이션)를
// 위해 만들어졌던 컬럼이다 — 등급(양)과 추천픽 노출(질)을 분리해, 등급이 높아도
// 아직 채택된 글이 없으면 추천픽에 뜨지 않고, 채택되면 뜨도록 한다.
export async function getExpertPosts(limit: number, page = 1): Promise<PagedResult<DashboardPost>> {
  const admin = createAdminClient();
  const { data: expertProfiles, error: profilesError } = await admin
    .from('profiles')
    .select('id')
    .in('grade', ['excellent', 'power']);
  if (profilesError) throw new Error(`파워맘/우수맘 목록 조회 실패: ${profilesError.message}`);

  const expertIds = (expertProfiles ?? []).map((p) => p.id);
  if (expertIds.length === 0) return { items: [], total: 0 };

  const from = (page - 1) * limit;
  const { data, error, count } = await admin
    .from('mom_pick_posts')
    .select(POST_COLUMNS, { count: 'exact' })
    .in('author_id', expertIds)
    .eq('is_adopted', true)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw new Error(`파워맘/우수맘 추천 조회 실패: ${error.message}`);

  return { items: await attachAuthors((data ?? []) as unknown as RawPostRow[]), total: count ?? 0 };
}

// ② 인기/우수글(Trending) — 좋아요(mom_pick_likes → like_count 비정규화 컬럼) 기준.
// [정직한 데이터 한계] 요구사항 원문은 "찜(북마크)이나 좋아요"라고 병기했지만, 찜
// (user_bookmarks)은 스팟/이벤트 전용이고 게시글(mom_pick_posts) 자체에는 찜 기능이
// 없다(Decision 019 스펙에 없는 개념을 추측으로 만들지 않음) — 게시글의 인기도는
// like_count만으로 판단한다.
// [방금 올린 글이 인기글에 바로 뜨는 문제 수정](2026-09-13 사용자 지시): "쓴 글이
// 실시간 라이브라던가 인기 우수글에 바로 뜨는데.. 인기 우수글은 무슨 기준으로
// 바로 뜨는거지?.. 방금올린글이 인기 우수글에 보이는건 아닌거 같아" — 실측 확인:
// like_count가 전부 0(=동률)일 때 2차 정렬(created_at DESC)이 사실상 순위를
// 결정해, 좋아요가 하나도 없는 방금 쓴 글도 최신순으로 상위에 노출되고 있었다.
// "인기"라 부르려면 최소한 좋아요가 1개 이상은 있어야 한다는 최소 기준을 추가한다
// (댓글 기능은 이 앱에 없고, 주간 집계 등은 지금 표본이 1건뿐이라 판단 근거가
// 부족해 이번엔 손대지 않는다 — 제3장 제5조 추측 금지, 필요해지면 별도로 설계).
export async function getTrendingPosts(limit: number, page = 1): Promise<PagedResult<DashboardPost>> {
  const admin = createAdminClient();
  const from = (page - 1) * limit;
  const { data, error, count } = await admin
    .from('mom_pick_posts')
    .select(POST_COLUMNS, { count: 'exact' })
    .gt('like_count', 0)
    .order('like_count', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw new Error(`인기글 조회 실패: ${error.message}`);

  return { items: await attachAuthors((data ?? []) as unknown as RawPostRow[]), total: count ?? 0 };
}

// ③ 실시간 라이브 피드 — 단순 최신순.
export async function getLivePosts(limit: number, page = 1): Promise<PagedResult<DashboardPost>> {
  const admin = createAdminClient();
  const from = (page - 1) * limit;
  const { data, error, count } = await admin
    .from('mom_pick_posts')
    .select(POST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw new Error(`실시간 피드 조회 실패: ${error.message}`);

  return { items: await attachAuthors((data ?? []) as unknown as RawPostRow[]), total: count ?? 0 };
}
