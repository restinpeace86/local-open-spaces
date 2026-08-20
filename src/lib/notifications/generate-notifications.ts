import { getNearbySpacesAndEvents } from '@/lib/spaces/get-nearby';
import { formatDDay } from '@/lib/spaces/d-day';
import { NotificationItem, NotificationRadius, NotificationSettings } from './notification-storage';

// spec/notification/notification-settings.md 3.1 radius 옵션 → PostGIS RPC 반경(m) 매핑.
// 'all'은 별도 광역 그리드 API가 없어(project/database_schema.md 4.1 RPC는 반경 파라미터 기반) 국내 전역을 포괄하는
// 실용적 상한값을 사용한다.
const RADIUS_METERS: Record<NotificationRadius, number> = {
  '10km': 10000,
  '20km': 20000,
  '30km': 30000,
  all: 300000,
};

// spec/notification/notification-settings.md 3.1은 `target_ages`를 알림 설정 항목으로 정의하지만,
// project/database_schema.md의 `open_spaces`/`events`에는 연령대 데이터 컬럼이 없어 실제 데이터 매칭에 사용할 수 없다.
// 값은 설정으로 저장/표시만 하고, 아래 추출 로직은 스펙에 근거가 있는 반경(radius)과 예약 마감 D-1(d_minus_one_alert)만 사용한다.
export async function generateNotifications(
  center: { lat: number; lng: number },
  settings: NotificationSettings
): Promise<NotificationItem[]> {
  if (!settings.enabled || !settings.d_minus_one_alert) return [];

  const items = await getNearbySpacesAndEvents(center.lng, center.lat, RADIUS_METERS[settings.radius]);

  return items
    .filter(
      (item) =>
        item.item_type === 'EVENT' &&
        item.is_reservation_required &&
        formatDDay(item.reservation_end_date) === 'D-1'
    )
    .map((item) => ({
      id: `d1-${item.id}`,
      title: '예약 마감 D-1',
      message: `${item.name} 예약이 내일 마감돼요.`,
      created_at: new Date().toISOString(),
      is_read: false,
      // 개별 장소/행사 상세 페이지 라우트가 아직 없어(상세는 지도 화면의 모달로만 노출) 지도 홈으로 연결한다.
      link: '/',
    }));
}
