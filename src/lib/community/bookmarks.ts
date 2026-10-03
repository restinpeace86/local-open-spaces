import { createClient } from '@/lib/supabase/client';
import { getMyProfile } from '@/lib/auth/profile';
import { canReceivePushNotifications } from '@/lib/community/grades';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.3: 찜(북마크) — 열심맘
// 이상 부여 권한. Decision 003(찜 비노출)이 지정했던 ENABLE_USER_BOOKMARK 플래그를 이번에
// 실제 데이터/화면과 함께 켠다.
// kind 태그 기반 판별 유니온 — 'spotId' in target 같은 옵셔널 프로퍼티 판별은 값이
// undefined일 때도 키 자체는 존재해 타입이 좁혀지지 않는 문제가 있어 명시적 태그를 쓴다.
export type BookmarkTarget = { kind: 'spot'; spotId: string } | { kind: 'event'; eventId: string };

// [우수맘 전용 예약-알람 슬롯 캡](2026-10-03 사용자 지시): "혜택 제한: 우수회원에게는
// 알림 리마인더 슬롯 최대 20개 제한을 두어 무분별한 등록 방지." 이벤트 찜 = 예약 오픈
// 알람 자동 구독(event-reservation-reminder-hint.tsx, canReceivePushNotifications 기준
// 우수맘 이상)이라 별도 "알람 켜기" 토글이 없다 — 이벤트 찜 개수 자체를 캡으로 둔다.
// 스팟 찜에는 캡이 없다(알람과 무관). 제5장 제6조 하드코딩 최소화 — mom-pick-grade-
// batch.mjs의 파워맘 정원제(DEFAULT_POWER_MOM_QUOTA) 상수 패턴과 동일하게 env override를
// 둔다.
const DEFAULT_EVENT_BOOKMARK_CAP = 20;

function getEventBookmarkCap(): number {
  const raw = process.env.NEXT_PUBLIC_EVENT_BOOKMARK_CAP;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EVENT_BOOKMARK_CAP;
}

// [에러 구분](2026-10-03): bookmark-button.tsx가 지금 모든 addBookmark 실패를 조용히
// 삼키고 있다(제5장 제11조 "서비스 중단 금지" 취지) — 캡 초과처럼 사용자가 알아야 하는
// 예상된 거부는 그 조용한 처리에서 제외해야 해서, instanceof로 구분 가능한 전용 에러
// 타입을 둔다.
export class BookmarkCapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookmarkCapExceededError';
  }
}

export async function addBookmark(target: BookmarkTarget): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  if (target.kind === 'event') {
    const profile = await getMyProfile();
    if (profile && canReceivePushNotifications(profile.grade)) {
      const { count, error: countError } = await supabase
        .from('user_bookmarks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userData.user.id)
        .not('event_id', 'is', null);
      if (countError) throw new Error(`찜 개수 확인 실패: ${countError.message}`);
      const cap = getEventBookmarkCap();
      if ((count ?? 0) >= cap) {
        throw new BookmarkCapExceededError(`예약 알람은 최대 ${cap}개까지 찜할 수 있어요. 기존 찜을 해제하고 다시 시도해 주세요.`);
      }
    }
  }

  const row: { user_id: string; spot_id: string | null; event_id: string | null } =
    target.kind === 'spot'
      ? { user_id: userData.user.id, spot_id: target.spotId, event_id: null }
      : { user_id: userData.user.id, spot_id: null, event_id: target.eventId };

  const { error } = await supabase.from('user_bookmarks').insert(row);
  if (error) throw new Error(`찜 추가 실패: ${error.message}`);
}

export async function removeBookmark(target: BookmarkTarget): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  let query = supabase.from('user_bookmarks').delete().eq('user_id', userData.user.id);
  query = target.kind === 'spot' ? query.eq('spot_id', target.spotId) : query.eq('event_id', target.eventId);

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
