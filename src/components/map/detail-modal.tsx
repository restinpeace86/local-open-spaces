'use client';

import { useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getTargetAudienceLabel } from '@/lib/spaces/target-audience-meta';
import { formatDDay } from '@/lib/spaces/d-day';
import { getReservationAvailabilityTag } from '@/lib/spaces/event-status';
import { formatDistance, formatDateRange, formatDateTime } from '@/lib/spaces/format';
import { buildNaverMapDirectionsUrl } from '@/lib/navigation';
import { useUserLocation } from '@/hooks/use-user-location';
import { MiniMap } from '@/components/map/mini-map';
import { MapPreviewModal } from '@/components/map/map-preview-modal';

const NO_INFO_TEXT = '정보 준비 중 (공공 기관 문의)';

// spec/space/space-detail.md, spec/event/event-detail.md: 공간/행사 상세 정보 모달
// 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로 표시한다.
// [상세보기 설명 추가](2026-08-27 사용자 지시): 제목만으로는 무슨 행사인지 알기 어려운
// 경우가 많다는 지적 — 설명이 이 글자 수를 넘으면 기본은 미리보기(line-clamp)로 줄이고
// "더보기" 버튼으로 펼친다. 모바일이 주 사용 환경(Decision 004)이라 터치에서 동작하지 않는
// 마우스 호버 툴팁 대신, 모바일/데스크톱 모두에서 동일하게 동작하는 펼치기 토글을 택했다.
const DESCRIPTION_PREVIEW_THRESHOLD = 60;

export function DetailModal({ item, onClose }: { item: NearbyItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [isMapPreviewOpen, setIsMapPreviewOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  // [실측 디버깅 발견 — 뒤로가기 인터셉트 제거](2026-08-29): 이 모달을 React onClick 경로
  // (리스트/카드 클릭 등)로 열면 useModalBackClose 내부의 history.pushState 호출이 Next.js
  // App Router의 자체 라우팅 감지와 충돌해 모달이 아예 커밋되지 않거나(상태가 조용히
  // 되돌아감) 실제 페이지 네비게이션급 리로드가 발생하는 것을 실측으로 확인했다(Playwright로
  // React Fiber를 직접 조회해 확인 — 클릭 핸들러는 정확히 실행되지만 DOM에 반영되지 않음).
  // 반면 카카오맵 마커 클릭(SDK의 순수 addEventListener 경로)으로 여는 동일 구조의
  // MarkerGroupModal은 정상 동작했다 — 즉 "React onClick으로 이 훅을 쓰는 모달을 여는" 모든
  // 경로에 잠재된 문제였다. DetailModal은 홈 피드/이벤트픽/캘린더/지역별 그리드 등 앱 전역에서
  // 카드 클릭으로 열리므로(전부 React onClick 경로) 사실상 상시 영향을 받고 있었다. 배경
  // 클릭/X 버튼으로는 여전히 정상적으로 닫히므로, 뒤로가기 제스처로 모달만 닫는 편의 기능만
  // 제거하고 핵심 기능(모달 열기/닫기)은 안전하게 복구한다.
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
  // [카드 표준 중분류/연령대상 표시](2026-08-27 사용자 지시): 상세보기에 연령대상(초등학생
  // 이상/미취학/가족/유아 등)을 안내한다. OTHER(수동 검수 대상)나 매핑 안 된 값은 null이라
  // 노출하지 않는다(getTargetAudienceLabel 참고).
  const targetAudienceLabel = isEvent ? getTargetAudienceLabel(item.target_audience) : null;
  const description = isEvent ? item.description : null;
  const isLongDescription = (description?.length ?? 0) > DESCRIPTION_PREVIEW_THRESHOLD;
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
              {/* [카드 표준 중분류 표시](2026-08-27 사용자 지시): event_type 기반 5대 UI
                  카테고리 대신 실제 표준 중분류(category_min)를 보여준다(이벤트 한정 —
                  공간은 이 컬럼을 조회하지 않아 기존 라벨 그대로 유지). */}
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: meta.color }}
              >
                {isEvent ? (item.category_min ?? meta.label) : meta.label}
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

          {/* [상세보기 설명 추가](2026-08-27 사용자 지시): 제목만으로 내용을 파악하기 어려운
              행사가 많아 본문 설명을 보여준다. 짧으면 그대로, 길면(60자 초과) 2줄 미리보기 +
              "더보기/접기" 토글로 감춘다. */}
          {description && (
            <div className="mt-2">
              <p className={`text-sm text-gray-600 whitespace-pre-line ${!isDescriptionExpanded && isLongDescription ? 'line-clamp-2' : ''}`}>
                {description}
              </p>
              {isLongDescription && (
                <button
                  type="button"
                  onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                  className="mt-0.5 text-xs font-semibold text-blue-600"
                >
                  {isDescriptionExpanded ? '접기' : '더보기'}
                </button>
              )}
            </div>
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

            {isEvent && targetAudienceLabel && (
              <div className="flex items-start justify-between gap-2">
                <dt className="text-gray-500 shrink-0">연령대상</dt>
                <dd className="text-right text-gray-900">{targetAudienceLabel}</dd>
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
