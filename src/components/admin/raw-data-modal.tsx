'use client';

import { AdminSpaceRow } from '@/components/admin/data-grid-client';

// implementation/todo.md Task 6: 행 클릭 시 원문 raw_data JSON을 확인하는 Read-Only 뷰어.
// 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로 표시해 spec/common의 모달 관례를 따른다.
export function RawDataModal({ row, onClose }: { row: AdminSpaceRow; onClose: () => void }) {
  const prettyJson = JSON.stringify(row.raw_data ?? null, null, 2);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[640px] max-h-[85vh] md:max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{row.name}</h2>
              <p className="text-xs text-gray-400">
                {row.source_type} · {row.external_id}
              </p>
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

          <h3 className="mt-4 text-xs font-semibold text-gray-500">raw_data (원문 JSON)</h3>
          <pre className="mt-1.5 rounded-lg bg-gray-900 text-gray-100 text-xs p-3 overflow-x-auto whitespace-pre-wrap break-words">
            {prettyJson}
          </pre>
        </div>
      </div>
    </div>
  );
}
