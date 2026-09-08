'use client';

import { useEffect, useState } from 'react';
import { ServiceCategory } from '@/lib/admin/service-category';
import { GroupDetailModal } from '@/components/admin/spot-dedup-panel';

// [open_spaces 상세에서 중복 스팟 검토](2026-09-09 사용자 지시): "8월 일반캠핑존
// C형.. 장소기준으로는 난지캠핑장 하나 아니야?" → "중복스팟 검수 및 매핑 있는데
// 이 탭에 있는 것을 스팟 큐레이션 옮긴 것처럼 해당 스팟 상세에 대하여 버튼
// 만들어서.." — MobileCurationWorkbench의 "1단: 중복 장소 검수 배너"(2026-09-05)를
// 그대로 재사용하되(제5장 제4조 기존 구조 우선), 그 배너는 후보 하나씩만 "합치기"
// 하는 pair-wise UX라 서울시 공공예약 소스처럼 한 장소에 수십 건이 겹치는 경우
// (실측: 한강공원 난지캠핑장 42건)에는 비효율적이다. 여기서는 체크박스로 여러
// 후보를 한 번에 선택해 한 번의 "합치기"로 전부(GroupDetailModal이 이미
// N건짜리 그룹을 지원 — apply API가 spot_ids 배열을 그대로 받음) 묶을 수 있게
// 한다.
type NearbySpot = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
  address: string | null;
  distance_m: number;
};

export function SpotDedupQuickModal({
  spot,
  serviceCategories,
  onClose,
}: {
  spot: { id: string; name: string; category: string; category_min: string | null; address: string | null };
  serviceCategories: ServiceCategory[];
  onClose: () => void;
}) {
  const [nearby, setNearby] = useState<NearbySpot[] | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/spot-dedup/nearby?spot_id=${encodeURIComponent(spot.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '주변 유사 장소 조회에 실패했습니다.');
        if (!cancelled) setNearby(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) setNearbyError(err instanceof Error ? err.message : '주변 유사 장소 조회에 실패했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [spot.id]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // "유지(다른 장소임)" — 기존 중복 검수 탭/워크벤치와 동일하게 임시 저장
  // 테이블(spot_dedup_pending_groups)에 무시 판단을 남긴다(제5장 제4조).
  function dismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    fetch('/api/admin/spot-dedup/pending-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_spot_ids: [spot.id, id], status: 'ignored' }),
    }).catch(() => {
      // 부가적인 이력 저장 실패가 검수 흐름 자체를 막지 않는다(제5장 제11조).
    });
  }

  const visibleNearby = (nearby ?? []).filter((n) => !dismissedIds.has(n.id));
  const selectedSpots = visibleNearby.filter((n) => selectedIds.has(n.id));

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center">
        <div className="w-full md:w-[520px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">🔗 중복 스팟 검토</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>
          <p className="text-xs text-gray-500">
            &quot;{spot.name}&quot;과(와) 30m 이내에 있는 유사 장소예요. 같은 장소면 체크해서 합쳐주세요.
          </p>

          {successMessage && (
            <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">
              {successMessage}
            </p>
          )}
          {nearbyError && <p className="text-xs text-red-600">{nearbyError}</p>}
          {nearby === null && !nearbyError && <p className="text-xs text-gray-400">주변 유사 장소를 찾는 중...</p>}
          {nearby !== null && visibleNearby.length === 0 && (
            <p className="text-xs text-gray-400">30m 이내에 유사한 장소가 없습니다.</p>
          )}

          {visibleNearby.length > 0 && (
            <ul className="flex flex-col gap-2">
              {visibleNearby.map((n) => (
                <li key={n.id} className="rounded-xl border border-gray-200 p-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                    className="mt-0.5 shrink-0"
                    aria-label={`${n.name} 선택`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{n.name}</p>
                    <p className="text-xs text-gray-500">
                      {n.distance_m}m · {n.address ?? '주소 없음'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(n.id)}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500"
                  >
                    다른 장소임
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => setIsMergeOpen(true)}
              disabled={selectedSpots.length === 0}
              className="flex-[2] rounded-full bg-amber-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50 hover:bg-amber-700"
            >
              선택한 {selectedSpots.length}건 합치기
            </button>
          </div>
        </div>
      </div>

      {isMergeOpen && (
        <GroupDetailModal
          group={{
            groupKey: [spot.id, ...selectedSpots.map((s) => s.id)].join('-'),
            members: [
              {
                id: spot.id,
                name: spot.name,
                category: spot.category,
                category_min: spot.category_min,
                address: spot.address,
                normalized_address: '',
                lat: null,
                lng: null,
              },
              ...selectedSpots.map((s) => ({
                id: s.id,
                name: s.name,
                category: s.category,
                category_min: s.category_min,
                address: s.address,
                normalized_address: '',
                lat: null,
                lng: null,
              })),
            ],
          }}
          serviceCategories={serviceCategories}
          onClose={() => setIsMergeOpen(false)}
          onSaved={(memberIds) => {
            setDismissedIds((prev) => {
              const next = new Set(prev);
              memberIds.forEach((id) => next.add(id));
              return next;
            });
            setSelectedIds(new Set());
            setSuccessMessage(`✅ ${memberIds.length}건을 하나로 합쳤습니다.`);
            setIsMergeOpen(false);
          }}
        />
      )}
    </>
  );
}
