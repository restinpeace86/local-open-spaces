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
  spotDisplayName,
  spotAddress,
  onClose,
  onSaved,
  onDisplayNameUpdated,
}: {
  spotId: string;
  spotName: string;
  // [OPEN_SPACES 노출 이름 수동 수정](2026-09-20 사용자 지시): 이미 설정된 override가
  // 있으면 신규 등록 모드로 열 때도 그 값을 프리필해야 한다(원본 name만 보내면
  // CurationFormModal이 override를 모른 채 다시 원본으로 덮어써 보일 수 있음).
  spotDisplayName: string | null;
  spotAddress: string | null;
  onClose: () => void;
  onSaved: (item: SpotCurationItem) => void;
  // [실사용 버그 제보](2026-09-20 사용자 지시, "편백회관 장곡점" 사례): 이 모달이
  // 스팟 큐레이션 저장과 함께 open_spaces.display_name도 반영하는데, 그 사실을
  // open_spaces 상세 모달(RawDataModal)의 SpotDisplayNameEditor는 모른 채로 있었다
  // — 이미 열려 있던 화면의 로컬 state(rows/selectedRow)가 새 값을 모르니 다시
  // 열어도 예전 값이 보였다. onServiceCategoryUpdated(BlogCurationModal)와 동일한
  // 관례로, 저장된 최신 display_name을 부모(raw-data-modal.tsx)에 직접 알린다.
  onDisplayNameUpdated?: (id: string, nextDisplayName: string | null) => void;
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
      presetSpot={
        existingCuration ? undefined : { id: spotId, name: spotName, display_name: spotDisplayName, address: spotAddress }
      }
      onClose={onClose}
      onSaved={(item) => {
        onDisplayNameUpdated?.(item.spot_id, item.open_spaces?.display_name ?? null);
        onSaved(item);
      }}
    />
  );
}
