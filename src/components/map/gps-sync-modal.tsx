'use client';

// [실시간 위치 싱크(GPS Sync 팝업)](2026-09-08 사용자 지시, todo.md 개선사항3-3):
// "'현재 위치({동네 이름})로 위치를 변경할까요?' 형태의 팝업을 띄우고, 수락 시
// 기본 위치 설정을 현재 GPS 기준으로 업데이트합니다." — LocationOnboardingModal과
// 동일한 바텀시트형 레이아웃(모바일 우선, Decision 004)을 재사용한다(제5장 제4조).
export function GpsSyncModal({
  neighborhoodName,
  onConfirm,
  onDismiss,
}: {
  neighborhoodName: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[75] flex items-end md:items-center justify-center">
      <div className="w-full md:w-96 bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            현재 위치({neighborhoodName})로 위치를 변경할까요?
          </p>
          <p className="mt-1 text-xs text-gray-500">
            설정하신 동네와 실제 GPS 위치가 달라 보여요. 변경하면 이 위치를 기준으로 주변 공간을 찾아드려요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-full border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            아니요
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-blue-600 text-white text-sm font-semibold py-2.5 hover:bg-blue-700"
          >
            변경하기
          </button>
        </div>
      </div>
    </div>
  );
}
