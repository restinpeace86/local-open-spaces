'use client';

import { useState } from 'react';
import { AdminTable, AdminRow, AdminOpenSpaceRow, AdminEventRow, AdminRawIngestRow } from '@/components/admin/data-grid-client';

// [개편] 행 클릭 시 해당 행의 전체 원천 컬럼(구조화된 값) + raw_data/raw_payload 원문 JSON을
// 함께 보여주는 Read-Only 뷰어. 3개 탭(open_spaces/events/raw_ingest_data) 행 형태가 서로
// 달라 탭별로 제목/부제/원문 필드를 분기한다. 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로
// 표시해 spec/common의 모달 관례를 따른다(기존 구현 유지).
// [상세 모달 URL/이미지 UX 개선](2026-08-29 사용자 지시): "전체 컬럼" 목록의 URL 값이
// 그냥 텍스트라 오퍼레이터가 매번 복사해서 새 탭에 붙여넣어야 했다. http(s) URL은 클릭 시
// 새 창으로 열리는 링크로, 그중 이미지 URL(썸네일 등)은 실제 미리보기 이미지로 렌더링한다.
function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isImageUrlField(key: string, value: string): boolean {
  if (key === 'thumbnail_url') return true;
  return /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(value);
}

function getModalContent(table: AdminTable, row: AdminRow): { title: string; subtitle: string; raw: unknown } {
  if (table === 'raw_ingest_data') {
    const r = row as AdminRawIngestRow;
    return { title: r.source_id, subtitle: `${r.source} · ${new Date(r.fetched_at).toLocaleString('ko-KR')}`, raw: r.raw_payload };
  }
  if (table === 'events') {
    const r = row as AdminEventRow;
    // [0순위 우선 요청](2026-08-26): 검수 효율성을 위해 행사 기간(start_date~end_date)을
    // 상세 패널에서도 곧바로 보이도록 부제에 포함한다(기존에는 "전체 컬럼" 목록에 묻혀 있었음).
    return {
      title: r.title,
      subtitle: `${r.source ?? '(source 미표기)'} · ${r.external_id} · 📅 ${r.start_date} ~ ${r.end_date}${
        r.is_active === false ? ' · 비활성' : ''
      }`,
      raw: r.raw_data,
    };
  }
  const r = row as AdminOpenSpaceRow;
  return { title: r.name, subtitle: `${r.source_type} · ${r.external_id}`, raw: r.raw_data };
}

// [카테고리 정제 & 어드민 확장](2026-08-26): 상세 모달에서 category_min을 직접 선택해
// 수동 수정할 수 있다(open_spaces/events 탭 전용, raw_ingest_data에는 이 컬럼 자체가 없음).
// 저장 시 category_min_source가 항상 'MANUAL'로 바뀐다(서버 규약 — PATCH /api/admin/data-grid/category-min).
function CategoryMinEditor({
  table,
  row,
  categoryMinOptions,
  onUpdated,
}: {
  table: 'open_spaces' | 'events';
  row: AdminOpenSpaceRow | AdminEventRow;
  categoryMinOptions: string[];
  onUpdated: (id: string, nextCategoryMin: string | null, nextSource: string | null) => void;
}) {
  const [value, setValue] = useState(row.category_min ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/data-grid/category-min', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id: row.id, category_min: value || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '수동 수정 실패');
      onUpdated(row.id, json.row.category_min, json.row.category_min_source);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '수동 수정 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        표준 중분류(category_min) 수동 수정
        {row.category_min_source && (
          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            현재: {row.category_min_source}
          </span>
        )}
      </h3>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs flex-1"
        >
          <option value="">(미분류)</option>
          {categoryMinOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장(MANUAL)'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

// [10대 타겟 분류 체계 실제 적용](2026-08-27): 상세 모달에서 target_audience를 직접 선택해
// 수동 수정할 수 있다(events 탭 전용 — target_audience는 events에만 있는 컬럼).
// CategoryMinEditor와 동일 관례: 저장 시 target_audience_source가 항상 'MANUAL'로 바뀐다.
function TargetAudienceEditor({
  row,
  targetAudienceOptions,
  onUpdated,
}: {
  row: AdminEventRow;
  targetAudienceOptions: string[];
  onUpdated: (id: string, nextTargetAudience: string | null, nextSource: string | null) => void;
}) {
  const [value, setValue] = useState(row.target_audience ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/data-grid/target-audience', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, target_audience: value || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '수동 수정 실패');
      onUpdated(row.id, json.row.target_audience, json.row.target_audience_source);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '수동 수정 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        타겟 연령(target_audience) 수동 수정
        {row.target_audience_source && (
          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            현재: {row.target_audience_source}
          </span>
        )}
      </h3>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs flex-1"
        >
          <option value="">(미분류)</option>
          {targetAudienceOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장(MANUAL)'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

export function RawDataModal({
  table,
  row,
  categoryMinOptions,
  targetAudienceOptions = [],
  onClose,
  onCategoryMinUpdated,
  onTargetAudienceUpdated,
}: {
  table: AdminTable;
  row: AdminRow;
  categoryMinOptions: string[];
  targetAudienceOptions?: string[];
  onClose: () => void;
  onCategoryMinUpdated?: (id: string, nextCategoryMin: string | null, nextSource: string | null) => void;
  onTargetAudienceUpdated?: (id: string, nextTargetAudience: string | null, nextSource: string | null) => void;
}) {
  const { title, subtitle, raw } = getModalContent(table, row);
  const prettyJson = JSON.stringify(raw ?? null, null, 2);

  const structuredEntries = Object.entries(row).filter(([key]) => key !== 'raw_data' && key !== 'raw_payload');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[720px] max-h-[85vh] md:max-h-[80vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-400">{subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
              ✕
            </button>
          </div>

          {table !== 'raw_ingest_data' && table !== 'curated_items' && onCategoryMinUpdated && (
            <CategoryMinEditor
              table={table}
              row={row as AdminOpenSpaceRow | AdminEventRow}
              categoryMinOptions={categoryMinOptions}
              onUpdated={onCategoryMinUpdated}
            />
          )}

          {table === 'events' && onTargetAudienceUpdated && (
            <TargetAudienceEditor
              row={row as AdminEventRow}
              targetAudienceOptions={targetAudienceOptions}
              onUpdated={onTargetAudienceUpdated}
            />
          )}

          <h3 className="mt-4 text-xs font-semibold text-gray-500">전체 컬럼</h3>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {structuredEntries.map(([key, value]) => {
              const isUrl = isHttpUrl(value);
              return (
                <div key={key} className="flex gap-1.5 overflow-hidden">
                  <span className="shrink-0 text-gray-400">{key}:</span>
                  {isUrl && isImageUrlField(key, value) ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={value}
                        alt={key}
                        className="h-14 w-14 object-cover rounded border border-gray-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </a>
                  ) : isUrl ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline truncate hover:text-blue-700"
                    >
                      {value}
                    </a>
                  ) : (
                    <span className="text-gray-700 truncate">{value === null || value === undefined ? 'NULL' : String(value)}</span>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="mt-4 text-xs font-semibold text-gray-500">
            {table === 'raw_ingest_data' ? 'raw_payload (원문 JSON)' : 'raw_data (원문 JSON)'}
          </h3>
          <pre className="mt-1.5 rounded-lg bg-gray-900 text-gray-100 text-xs p-3 overflow-x-auto whitespace-pre-wrap break-words">
            {prettyJson}
          </pre>
        </div>
      </div>
    </div>
  );
}
