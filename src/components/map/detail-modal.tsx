'use client';

import { useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDDay } from '@/lib/spaces/d-day';
import { formatDistance, formatDateRange, formatDateTime } from '@/lib/spaces/format';
import { buildKakaoDirectionsUrl } from '@/lib/kakao/directions-url';

const NO_INFO_TEXT = '정보 준비 중 (공공 기관 문의)';

// spec/space/space-detail.md, spec/event/event-detail.md: 공간/행사 상세 정보 모달
// 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로 표시한다.
export function DetailModal({ item, onClose }: { item: NearbyItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const meta = getCategoryMeta(item.category);
  const isEvent = item.item_type === 'EVENT';

  const dDay = isEvent ? formatDDay(item.reservation_end_date ?? item.end_date) : null;
  const period = isEvent ? formatDateRange(item.start_date, item.end_date) : null;
  const reservationDeadline = isEvent && item.is_reservation_required
    ? formatDateTime(item.reservation_end_date)
    : null;

  const directionsUrl = buildKakaoDirectionsUrl(item.name, item.lat, item.lng);
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
          <p className="text-sm text-gray-400">현재 위치에서 {formatDistance(item.distance_meters)}</p>

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

          <div className="mt-5 flex gap-2">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center rounded-lg bg-gray-900 text-white text-sm font-medium py-2.5 hover:bg-gray-800"
            >
              길찾기
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
    </div>
  );
}
