import { createClient } from '@/lib/supabase/client';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.3: 찜(북마크) — 열심맘
// 이상 부여 권한. Decision 003(찜 비노출)이 지정했던 ENABLE_USER_BOOKMARK 플래그를 이번에
// 실제 데이터/화면과 함께 켠다.
export type BookmarkTarget = { spotId: string; eventId?: never } | { spotId?: never; eventId: string };

export async function addBookmark(target: BookmarkTarget): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  const row: { user_id: string; spot_id: string | null; event_id: string | null } =
    'spotId' in target && target.spotId
      ? { user_id: userData.user.id, spot_id: target.spotId, event_id: null }
      : { user_id: userData.user.id, spot_id: null, event_id: (target as { eventId: string }).eventId };

  const { error } = await supabase.from('user_bookmarks').insert(row);
  if (error) throw new Error(`찜 추가 실패: ${error.message}`);
}

export async function removeBookmark(target: BookmarkTarget): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  let query = supabase.from('user_bookmarks').delete().eq('user_id', userData.user.id);
  query = 'spotId' in target && target.spotId ? query.eq('spot_id', target.spotId) : query.eq('event_id', (target as { eventId: string }).eventId);

  const { error } = await query;
  if (error) throw new Error(`찜 삭제 실패: ${error.message}`);
}

export type MyBookmark = {
  id: string;
  created_at: string;
  spot_id: string | null;
  event_id: string | null;
  open_spaces: { id: string; name: string; address: string | null; category: string } | null;
  events: { id: string; title: string; venue_name: string | null; thumbnail_url: string | null } | null;
};

export async function listMyBookmarks(): Promise<MyBookmark[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_bookmarks')
    .select('id, created_at, spot_id, event_id, open_spaces(id, name, address, category), events(id, title, venue_name, thumbnail_url)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`찜 목록 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as MyBookmark[];
}

export async function getMyBookmarkedIds(): Promise<{ spotIds: Set<string>; eventIds: Set<string> }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { spotIds: new Set(), eventIds: new Set() };

  const { data, error } = await supabase.from('user_bookmarks').select('spot_id, event_id').eq('user_id', userData.user.id);
  if (error) throw new Error(`찜 상태 조회 실패: ${error.message}`);

  const spotIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.spot_id) spotIds.add(row.spot_id);
    if (row.event_id) eventIds.add(row.event_id);
  }
  return { spotIds, eventIds };
}
