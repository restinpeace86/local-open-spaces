'use client';

import { useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDDay } from '@/lib/spaces/d-day';
import { getReservationAvailabilityTag } from '@/lib/spaces/event-status';
import { formatDistance, formatDateRange, formatDateTime } from '@/lib/spaces/format';
import { buildNaverMapDirectionsUrl } from '@/lib/navigation';
import { useUserLocation } from '@/hooks/use-user-location';
import { useModalBackClose } from '@/hooks/use-modal-back-close';
import { MiniMap } from '@/components/map/mini-map';
import { MapPreviewModal } from '@/components/map/map-preview-modal';

const NO_INFO_TEXT = '정보 준비 중 (공공 기관 문의)';

// spec/space/space-detail.md, spec/event/event-detail.md: 공간/행사 상세 정보 모달
// 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로 표시한다.
export function DetailModal({ item, onClose }: { item: NearbyItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [isMapPreviewOpen, setIsMapPreviewOpen] = useState(false);
  useModalBackClose(onClose);
  // Task 9-5-1(2026-08-22): 유저가 이미 설정해 둔 전역 위치(온보딩에서 저장한 좌표, 미설정
  // 시 기본값)를 그대로 "내 위치" 출발지로 쓴다 — 별도 GPS 권한 요청 없이 서비스가 이미 아는
  // 값을 재사용해, 네이버 지도 앱이 열리자마자 출발지 ➔ 목적지 경로가 바로 뜨도록 한다.
  const { center: userLocation } = useUserLocation();
  const meta = getCategoryMeta(item.category);
  const isEvent = item.item_type === 'EVENT';
  // Task 9-6-2(2026-08-23, Decision 009): location_precision이 없으면(SPACE, 기존 EXACT 전용
  // 경로) EXACT로 간주한다. CITY_APPROX/UNKNOWN은 정확한 행사장 위치가 아니므로 지도/길찾기를
  // 보여주면 사용자를 오도한다 — 근사·미상 좌표를 정확한 핀처럼 그리지 않는다.
  const hasExactLocation = (item.location_precision ?? 'EXACT') === 'EXACT';

  const dDay = isEvent ? formatDDay(item.reservation_end_date ?? item.end_date) : null;
  const period = isEvent ? formatDateRange(item.start_date, item.end_date) : null;
  const reservationDeadline = isEvent && item.is_reservation_required
    ? formatDateTime(item.reservation_end_date)
    : null;
  // Task 9-6-13: reservation_url이 없는 이벤트는 무조건 "길찾기"로만 폴백되어 예약 필요
  // 여부를 알 수 없었다 — 예약불필요/현장방문 vs 사전예약필요(링크미제공)를 구분해 안내한다.
  const reservationTag = isEvent ? getReservationAvailabilityTag(item) : null;

  const directionsUrl = buildNaverMapDirectionsUrl({ name: item.name, lat: item.lat, lng: item.lng }, userLocation);
  // Task 9-6-11(2026-08-25, Decision 011): 상세 CTA 조건부 3분류 —
  // 1) 공공/무료(is_free=true 또는 reservation_url 존재) → 공공 예약하기
  // 2) 유료/민간 제휴(is_free=false 및 affiliate_url 존재) → 할인 예매하기
  // 3) 그 외(위 링크 미존재) → 길찾기(정확한 좌표가 있을 때만)
  // 공간은 reservation_url 컬럼이 없어(project/database_schema.md 3.1) 늘 null이므로,
  // is_free=true인데 reservation_url이 없는 공간은 기존처럼 info_url을 공식 링크로 대신 쓴다.
  const publicReservationUrl = item.reservation_url ?? (isEvent ? null : item.info_url);
  const cta = (item.is_free === true || !!item.reservation_url) && publicReservationUrl
    ? { label: '🏛️ 공공 예약하기', href: publicReservationUrl }
    : item.is_free === false && item.affiliate_url
    ? { label: '🎟️ 할인 예매하기', href: item.affiliate_url }
    : hasExactLocation
    ? { label: '🗺️ 길찾기', href: directionsUrl }
    : null;

  async function handleCopyAddress() {
    if (!item.address) return;
    try {
      await navigator.clipboard.writeText(item.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근이 차단된 환경에서는 조용히 무시한다.
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[480px] max-h-[85vh] md:max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isEvent && item.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt={item.name}
            className="w-full h-40 object-cover rounded-t-2xl md:rounded-t-2xl"
          />
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: meta.color }}
              >
                {meta.label}
              </span>
              {dDay && <span className="text-xs font-semibold text-red-600">{dDay}</span>}
              {!isEvent && item.is_free !== null && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  {item.is_free ? '무료' : '유료'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          <h2 className="mt-2 text-lg font-bold text-gray-900">{item.name}</h2>
          {item.distance_meters >= 0 && (
            <p className="text-sm text-gray-400">현재 위치에서 {formatDistance(item.distance_meters)}</p>
          )}

          <dl className="mt-4 flex flex-col gap-3 text-sm">
            {!isEvent && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">주소</dt>
                <dd className="text-right text-gray-900 flex items-center gap-2">
                  <span>{item.address || NO_INFO_TEXT}</span>
                  {item.address && (
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="shrink-0 text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      {copied ? '복사됨' : '복사'}
                    </button>
                  )}
                </dd>
              </div>
            )}

            {!isEvent && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">운영시간</dt>
                <dd className="text-right text-gray-900">{item.operating_hours || NO_INFO_TEXT}</dd>
              </div>
            )}

            {isEvent && period && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">행사 기간</dt>
                <dd className="text-right text-gray-900">{period}</dd>
              </div>
            )}

            {isEvent && (item.is_reservation_required || reservationTag) && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">예약 안내</dt>
                <dd className="text-right text-gray-900">
                  {reservationTag ? (
                    <span className={reservationTag.tone === 'warn' ? 'text-amber-600 font-medium' : 'text-gray-700'}>
                      {reservationTag.label}
                    </span>
                  ) : (
                    '사전 예약 필수'
                  )}
                  {reservationDeadline && (
                    <span className="block text-red-600 font-medium">
                      마감: {reservationDeadline}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {/* Task 9-5-1: 콤팩트 인앱 미니맵 — 상세 화면을 벗어나지 않고 위치를 바로 확인하고,
              "🔍 크게보기"로 풀스크린 지도 모달을 띄운다.
              Task 9-6-2: 근사/미상 좌표(CITY_APPROX/UNKNOWN)는 정확한 위치가 아니므로 지도 대신
              안내 문구만 보여준다(정확한 핀처럼 오인시키지 않기 위함). */}
          {hasExactLocation ? (
            <div className="mt-4 relative rounded-xl overflow-hidden border border-gray-200">
              <MiniMap lat={item.lat} lng={item.lng} name={item.name} className="w-full h-40" />
              <button
                type="button"
                onClick={() => setIsMapPreviewOpen(true)}
                className="absolute bottom-2 right-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white"
              >
                🔍 크게보기
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              📍 {item.sigungu_name ? `${item.sigungu_name} 일대 (정확한 위치 정보 없음)` : '정확한 위치 정보가 없는 행사입니다'}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            {cta && (
              <a
                href={cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg text-white text-sm font-medium py-2.5"
                style={{ backgroundColor: meta.color }}
              >
                {cta.label}
              </a>
            )}
          </div>
        </div>
      </div>

      {isMapPreviewOpen && (
        <MapPreviewModal
          lat={item.lat}
          lng={item.lng}
          name={item.name}
          onClose={() => setIsMapPreviewOpen(false)}
        />
      )}
    </div>
  );
}
