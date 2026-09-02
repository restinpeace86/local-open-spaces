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

export type DashboardPost = {
  id: string;
  post_type: 'micro_review' | 'checklist';
  rating: number | null;
  content: string | null;
  checklist_answers: ChecklistAnswers | null;
  like_count: number;
  is_adopted: boolean;
  created_at: string;
  spotName: string | null;
  author: DashboardAuthor;
};

const POST_COLUMNS = 'id, author_id, post_type, rating, content, checklist_answers, like_count, is_adopted, created_at, open_spaces(name)';

type RawPostRow = {
  id: string;
  author_id: string;
  post_type: 'micro_review' | 'checklist';
  rating: number | null;
  content: string | null;
  checklist_answers: ChecklistAnswers | null;
  like_count: number;
  is_adopted: boolean;
  created_at: string;
  open_spaces: { name: string } | null;
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
    like_count: row.like_count,
    is_adopted: row.is_adopted,
    created_at: row.created_at,
    spotName: row.open_spaces?.name ?? null,
    author: authorsById.get(row.author_id) ?? fallbackAuthor(row.author_id),
  }));
}

export type PagedResult<T> = { items: T[]; total: number };

// ① 파워맘/우수맘 추천(Expert Curation) — 상급 등급 작성자의 글만, 최신순.
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
export async function getTrendingPosts(limit: number, page = 1): Promise<PagedResult<DashboardPost>> {
  const admin = createAdminClient();
  const from = (page - 1) * limit;
  const { data, error, count } = await admin
    .from('mom_pick_posts')
    .select(POST_COLUMNS, { count: 'exact' })
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
