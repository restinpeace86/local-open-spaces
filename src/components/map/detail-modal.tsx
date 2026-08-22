'use client';

import { useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDDay } from '@/lib/spaces/d-day';
import { formatDistance, formatDateRange, formatDateTime } from '@/lib/spaces/format';
import { buildNaverMapDirectionsUrl } from '@/lib/navigation';
import { useUserLocation } from '@/hooks/use-user-location';
import { MiniMap } from '@/components/map/mini-map';
import { MapPreviewModal } from '@/components/map/map-preview-modal';

const NO_INFO_TEXT = '정보 준비 중 (공공 기관 문의)';

// spec/space/space-detail.md, spec/event/event-detail.md: 공간/행사 상세 정보 모달
// 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로 표시한다.
export function DetailModal({ item, onClose }: { item: NearbyItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [isMapPreviewOpen, setIsMapPreviewOpen] = useState(false);
  // Task 9-5-1(2026-08-22): 유저가 이미 설정해 둔 전역 위치(온보딩에서 저장한 좌표, 미설정
  // 시 기본값)를 그대로 "내 위치" 출발지로 쓴다 — 별도 GPS 권한 요청 없이 서비스가 이미 아는
  // 값을 재사용해, 네이버 지도 앱이 열리자마자 출발지 ➔ 목적지 경로가 바로 뜨도록 한다.
  const { center: userLocation } = useUserLocation();
  const meta = getCategoryMeta(item.category);
  const isEvent = item.item_type === 'EVENT';

  const dDay = isEvent ? formatDDay(item.reservation_end_date ?? item.end_date) : null;
  const period = isEvent ? formatDateRange(item.start_date, item.end_date) : null;
  const reservationDeadline = isEvent && item.is_reservation_required
    ? formatDateTime(item.reservation_end_date)
    : null;

  const directionsUrl = buildNaverMapDirectionsUrl({ name: item.name, lat: item.lat, lng: item.lng }, userLocation);
  const externalUrl = isEvent ? item.reservation_url : item.info_url;
  const externalLabel = isEvent ? '예약하기' : '상세 정보 보기';

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

            {isEvent && item.is_reservation_required && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">예약 안내</dt>
                <dd className="text-right text-gray-900">
                  사전 예약 필수
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
              "🔍 크게보기"로 풀스크린 지도 모달을 띄운다. */}
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

          <div className="mt-5 flex gap-2">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center rounded-lg bg-gray-900 text-white text-sm font-medium py-2.5 hover:bg-gray-800"
            >
              🚗 네이버 지도로 길안내
            </a>
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-lg text-white text-sm font-medium py-2.5"
                style={{ backgroundColor: meta.color }}
              >
                {externalLabel}
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
