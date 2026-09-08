'use client';

import { useEffect, useState } from 'react';
import { CurationFormModal, SpotCurationItem } from '@/components/admin/spot-curations-panel';

// [open_spaces 상세에서 스팟 큐레이션 바로 열기](2026-09-08 사용자 지시): "스팟큐레이션
// (가격, 메뉴 등 입력)도 블로그 큐레이션처럼 open_spaces 에서 데이터 상세 열었을때
// 블로그 큐레이션 하고 같은 레벨로 해당 버튼 아래에 스팟 큐레이션 버튼 만들어서
// 그 버튼 누르면 스팟큐레이션 팝업가서 입력하도록 해줘" — SpotCurationsPanel('스팟
// 큐레이션' 탭)은 원래 "먼저 후보 목록에서 골라 여는" 흐름(2026-09-03 개선사항9)
// 이라, 목록 자체가 이미 "이 스팟에 큐레이션이 있는지"를 알고 있어 CurationFormModal
// 에 initial(수정) 또는 presetSpot(신규) 중 맞는 쪽을 확실히 골라 넘겼다. 여기서는
// open_spaces 상세에서 spot_id 하나만 가지고 곧장 여는 것이라, 그 판단을 이 컴포넌트가
// 대신 한다 — 마운트 시 딱 한 번 조회해 있으면 편집 모드로, 없으면 신규 등록 모드로
// 같은 CurationFormModal을 그대로 재사용한다(제5장 제4조 기존 구조 우선 — 새 폼을
// 만들지 않음).
export function SpotCurationQuickModal({
  spotId,
  spotName,
  spotAddress,
  onClose,
  onSaved,
}: {
  spotId: string;
  spotName: string;
  spotAddress: string | null;
  onClose: () => void;
  onSaved: (item: SpotCurationItem) => void;
}) {
  // undefined = 조회 중, null = 큐레이션 없음(신규 등록), 객체 = 기존 큐레이션(수정).
  const [existingCuration, setExistingCuration] = useState<SpotCurationItem | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/spot-curations?spot_id=${encodeURIComponent(spotId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '스팟 큐레이션 조회에 실패했습니다.');
        if (!cancelled) setExistingCuration(data.item ?? null);
      })
      .catch(() => {
        // 조회 실패해도 신규 등록으로 계속 진행 가능하므로 화면을 막지 않는다(제5장
        // 제11조) — 실제로 이미 큐레이션이 있었다면 저장 시 서버가 409로 명확히
        // 안내하고, 그 경우 관리자가 SpotCurationsPanel에서 정식으로 다시 열면 된다.
        if (!cancelled) setExistingCuration(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  if (existingCuration === undefined) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl px-6 py-5 text-sm text-gray-500">불러오는 중...</div>
      </div>
    );
  }

  return (
    <CurationFormModal
      initial={existingCuration ?? undefined}
      presetSpot={existingCuration ? undefined : { id: spotId, name: spotName, address: spotAddress }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
