import { createClient } from '@/lib/supabase/client';
import { getMyProfile } from '@/lib/auth/profile';
import { canReceivePushNotifications } from '@/lib/community/grades';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.3: 찜(북마크) — 열심맘
// 이상 부여 권한. Decision 003(찜 비노출)이 지정했던 ENABLE_USER_BOOKMARK 플래그를 이번에
// 실제 데이터/화면과 함께 켠다.
// kind 태그 기반 판별 유니온 — 'spotId' in target 같은 옵셔널 프로퍼티 판별은 값이
// undefined일 때도 키 자체는 존재해 타입이 좁혀지지 않는 문제가 있어 명시적 태그를 쓴다.
//
// [이마트 문화센터 클래스 찜 추가](2026-10-03 사용자 지시): "문화센터 데이터는 별도
// 테이블로 관리하고, 찜/알람은 같은 기능이니깐 두 테이블 데이터 전부 참조할 수 있도록
// 확장" — emart_culture_club_classes는 독립 테이블로 그대로 두고(데이터 파이프라인이
// events와 섞이지 않게), user_bookmarks만 세 번째 nullable FK(emart_class_id)로
// 넓혔다(제5장 제4조 기존 구조 우선 — spot_id/event_id와 동일한 패턴).
//
// [롯데마트 문화센터 클래스 찜 추가](2026-10-04 사용자 지시): "우리껀 찜 목록
// 필요해" — 네 번째 nullable FK(lottemart_class_id)로 동일하게 확장. 처음엔
// 롯데마트에 접수 시작 시각 필드가 없어(실측 확인 — "접수준비" 상태 사례가
// 실질적으로 없음) 예약-알람 캡 대상에서 제외했었다. 이후 사용자 지시
// ("찜한거에 대하여서는 동일하게 알람해야하는거 아니야?")로 다른 종류의 알람
// (상태 변화 알림 — lottemart-culture-club-status-watch.mjs)을 붙였으므로,
// 캡의 원래 취지("알람 무분별 등록 방지")가 다시 적용된다 — 아래에서 이벤트/
// 이마트와 동일하게 캡 대상에 포함시킨다.
export type BookmarkTarget =
  | { kind: 'spot'; spotId: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'emart_class'; emartClassId: string }
  | { kind: 'lottemart_class'; lottemartClassId: string };

// [우수맘 전용 예약-알람 슬롯 캡](2026-10-03 사용자 지시): "혜택 제한: 우수회원에게는
// 알림 리마인더 슬롯 최대 20개 제한을 두어 무분별한 등록 방지." 이벤트/문화센터 클래스
// 찜 = 예약 오픈 알람 자동 구독(event-reservation-reminder-hint.tsx, 그리고 문화센터
// 클래스는 register_start_at 기준 — canReceivePushNotifications 기준 우수맘 이상)이라
// 별도 "알람 켜기" 토글이 없다 — 찜 개수 자체를 캡으로 둔다. "찜/알람은 같은 기능"
// (2026-10-03 사용자 확인)이므로 이벤트 찜과 문화센터 클래스 찜을 합산해 하나의 캡을
// 적용한다. 스팟 찜에는 캡이 없다(알람과 무관). 제5장 제6조 하드코딩 최소화 —
// mom-pick-grade-batch.mjs의 파워맘 정원제(DEFAULT_POWER_MOM_QUOTA) 상수 패턴과
// 동일하게 env override를 둔다.
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

  if (target.kind === 'event' || target.kind === 'emart_class' || target.kind === 'lottemart_class') {
    const profile = await getMyProfile();
    if (profile && canReceivePushNotifications(profile.grade)) {
      // 이벤트/이마트/롯데마트 문화센터 클래스 찜을 합산한 개수(셋 다 알람 대상이라 같은 캡 적용).
      const { count, error: countError } = await supabase
        .from('user_bookmarks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userData.user.id)
        .or('event_id.not.is.null,emart_class_id.not.is.null,lottemart_class_id.not.is.null');
      if (countError) throw new Error(`찜 개수 확인 실패: ${countError.message}`);
      const cap = getEventBookmarkCap();
      if ((count ?? 0) >= cap) {
        throw new BookmarkCapExceededError(`예약 알람은 최대 ${cap}개까지 찜할 수 있어요. 기존 찜을 해제하고 다시 시도해 주세요.`);
      }
    }
  }

  const row: {
    user_id: string;
    spot_id: string | null;
    event_id: string | null;
    emart_class_id: string | null;
    lottemart_class_id: string | null;
  } = {
    user_id: userData.user.id,
    spot_id: target.kind === 'spot' ? target.spotId : null,
    event_id: target.kind === 'event' ? target.eventId : null,
    emart_class_id: target.kind === 'emart_class' ? target.emartClassId : null,
    lottemart_class_id: target.kind === 'lottemart_class' ? target.lottemartClassId : null,
  };

  const { error } = await supabase.from('user_bookmarks').insert(row);
  if (error) throw new Error(`찜 추가 실패: ${error.message}`);
}

export async function removeBookmark(target: BookmarkTarget): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('로그인이 필요합니다.');

  let query = supabase.from('user_bookmarks').delete().eq('user_id', userData.user.id);
  if (target.kind === 'spot') query = query.eq('spot_id', target.spotId);
  else if (target.kind === 'event') query = query.eq('event_id', target.eventId);
  else if (target.kind === 'emart_class') query = query.eq('emart_class_id', target.emartClassId);
  else query = query.eq('lottemart_class_id', target.lottemartClassId);

  const { error } = await query;
  if (error) throw new Error(`찜 삭제 실패: ${error.message}`);
}

export type MyBookmark = {
  id: string;
  created_at: string;
  spot_id: string | null;
  event_id: string | null;
  emart_class_id: string | null;
  lottemart_class_id: string | null;
  open_spaces: { id: string; name: string; address: string | null; category: string } | null;
  events: { id: string; title: string; venue_name: string | null; thumbnail_url: string | null } | null;
  emart_culture_club_classes: { class_id: string; class_title: string; store_name: string | null } | null;
  lottemart_culture_club_classes: { class_id: string; class_title: string; store_name: string | null } | null;
};

export async function listMyBookmarks(): Promise<MyBookmark[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_bookmarks')
    .select(
      'id, created_at, spot_id, event_id, emart_class_id, lottemart_class_id, open_spaces(id, name, address, category), events(id, title, venue_name, thumbnail_url), emart_culture_club_classes(class_id, class_title, store_name), lottemart_culture_club_classes(class_id, class_title, store_name)'
    )
    .order('created_at', { ascending: false });

  if (error) throw new Error(`찜 목록 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as MyBookmark[];
}

export async function getMyBookmarkedIds(): Promise<{
  spotIds: Set<string>;
  eventIds: Set<string>;
  emartClassIds: Set<string>;
  lottemartClassIds: Set<string>;
}> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { spotIds: new Set(), eventIds: new Set(), emartClassIds: new Set(), lottemartClassIds: new Set() };

  const { data, error } = await supabase
    .from('user_bookmarks')
    .select('spot_id, event_id, emart_class_id, lottemart_class_id')
    .eq('user_id', userData.user.id);
  if (error) throw new Error(`찜 상태 조회 실패: ${error.message}`);

  const spotIds = new Set<string>();
  const eventIds = new Set<string>();
  const emartClassIds = new Set<string>();
  const lottemartClassIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.spot_id) spotIds.add(row.spot_id);
    if (row.event_id) eventIds.add(row.event_id);
    if (row.emart_class_id) emartClassIds.add(row.emart_class_id);
    if (row.lottemart_class_id) lottemartClassIds.add(row.lottemart_class_id);
  }
  return { spotIds, eventIds, emartClassIds, lottemartClassIds };
}
