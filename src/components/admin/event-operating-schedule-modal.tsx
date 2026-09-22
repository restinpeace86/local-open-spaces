'use client';

import { OperatingScheduleEditor, OperatingScheduleRow, OperatingScheduleUpdatedHandler } from '@/components/admin/operating-schedule-editor';
import { OperatingExceptionsEditor } from '@/components/admin/operating-exceptions-editor';

// [운영 요일/반복 규칙을 블로그 큐레이션 밖으로 다시 분리](2026-09-22 사용자 지시):
// "현재 블로그로 큐레이션인가 이벤트쪽에 거기에 이벤트 일자 주기적인거 주말만
// 체크라던가 있던데 그거 한단계 밖으로 빼.. 상세 팝업에서 블로그로 큐레이션
// 진입하는 버튼이랑 같은곳으로 빼줘" — 2026-09-12에 "블로그 보고 파악하는데"라는
// 이유로 EventBlogCurationModal 안으로 옮겼던 OperatingScheduleEditor/
// OperatingExceptionsEditor를, 블로그 큐레이션 버튼과 같은 레벨의 독립 버튼/모달로
// 다시 분리한다. 편집기 컴포넌트 자체(operating-schedule-editor.tsx,
// operating-exceptions-editor.tsx)는 그대로 재사용한다(제5장 제4조).
export function EventOperatingScheduleModal({
  event,
  onClose,
  onOperatingScheduleUpdated,
}: {
  event: OperatingScheduleRow & { title: string };
  onClose: () => void;
  onOperatingScheduleUpdated: OperatingScheduleUpdatedHandler;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center">
      <div className="w-full md:w-[480px] max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">📅 운영 요일 / 반복 규칙</h2>
            <p className="text-xs text-gray-500">{event.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <OperatingScheduleEditor row={event} onUpdated={onOperatingScheduleUpdated} />
        <OperatingExceptionsEditor eventId={event.id} startDate={event.start_date} endDate={event.end_date} />

        <button
          type="button"
          onClick={onClose}
          className="mt-1 rounded-full border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
