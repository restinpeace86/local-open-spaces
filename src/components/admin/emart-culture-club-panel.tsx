'use client';

import { useEffect, useState } from 'react';
import { StoreMultiSelect, StoreOption } from '@/components/admin/store-multiselect';

// [이마트 컬처클럽 강좌 리스트 — data-grid 탭](2026-10-03 사용자 지시): "이마트
// 문화센터 등 다른곳에 대하여 홈플러스처럼 진행할예정이야" — 홈플러스 탭
// (homeplus-lecture-list-panel.tsx)과 동일한 패턴(자기완결 패널, 마운트 시 자동
// 조회 안 함, '조회하기' 버튼으로 시작). 전체 6,500건+ 규모라 카테고리/상태
// 필터로 좁혀 쓰는 게 기본 — 필터 없이 조회하면 최신 1,000건만 보이고
// "총 N건 중 1,000건 표시"로 안내한다.

type ClassRow = {
  id: number;
  class_id: string;
  class_title: string;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  sub_category_name: string | null;
  store_name: string | null;
  class_fee: number | null;
  class_material_fee: number | null;
  class_capacity: number | null;
  min_class_capacity: number | null;
  occupied_full_flag: boolean | null;
  semester: string | null;
  semester_year: string | null;
  register_start_date: string | null;
  register_end_date: string | null;
  class_start_date: string | null;
  class_end_date: string | null;
  filter_status: '접수대기' | '접수중' | '정원마감';
  is_excluded: boolean;
  collected_at: string;
  // [상세보기](2026-10-03 사용자 지시): "상세데이터 가져왔다는데 볼수가없네..
  // 각 row 누르면 상세데이터 볼수있도록 해줘" — emart-culture-club-detail.mjs가
  // 채워주는 컬럼들.
  class_detail_title: string | null;
  class_detail_content: string | null;
  main_image_bucket: string | null;
  main_image_region: string | null;
  main_image_key: string | null;
  detail_fetched_at: string | null;
};

const CATEGORY_OPTIONS: { code: string; label: string }[] = [
  { code: '101', label: 'Club Originals' },
  { code: '402', label: 'With Mom' },
  { code: '403', label: 'With mom(event)' },
  { code: '404', label: 'Kids & Children' },
  { code: '406', label: 'Kids & Children(event)' },
];

const STATUS_OPTIONS: ClassRow['filter_status'][] = ['접수대기', '접수중', '정원마감'];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatTimeRange(start: string | null, end: string | null) {
  const fmt = (t: string | null) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t ?? '-');
  return `${fmt(start)} ~ ${fmt(end)}`;
}

// [상세보기 모달](2026-10-03 사용자 지시) — row를 누르면 상세설명/이미지를
// 보여준다. 이미지는 S3 bucket/region/key만 저장돼 있는데, 기본 S3 URL
// (https://{bucket}.s3.{region}.amazonaws.com/{key})로 실제 접근해보니
// 403(비공개 버킷 또는 별도 CDN 경로 필요)이라 <img>로 바로 띄우지 못한다 —
// 추측으로 다른 CDN 도메인을 지어내지 않고, 원본 참조값만 텍스트로 보여준다
// (나중에 실제 이미지 URL 패턴을 확인하면 교체).
function DetailModal({ row, onClose }: { row: ClassRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-gray-900">{row.class_title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 shrink-0">
            ✕
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 mb-4">
          <dt className="text-gray-400">지점</dt>
          <dd>{row.store_name ?? '-'}</dd>
          <dt className="text-gray-400">카테고리</dt>
          <dd>{row.sub_category_name ?? '-'}</dd>
          <dt className="text-gray-400">요일/시간</dt>
          <dd>
            {(row.class_day ?? []).join(',')} {formatTimeRange(row.start_time, row.end_time)}
          </dd>
          <dt className="text-gray-400">수강료</dt>
          <dd>
            {row.class_fee != null ? `${row.class_fee.toLocaleString('ko-KR')}원` : '-'}
            {row.class_material_fee ? ` (+재료비 ${row.class_material_fee.toLocaleString('ko-KR')}원)` : ''}
          </dd>
          <dt className="text-gray-400">정원</dt>
          <dd>
            {row.min_class_capacity ?? '-'} ~ {row.class_capacity ?? '-'}명
          </dd>
          <dt className="text-gray-400">강좌 기간</dt>
          <dd>
            {row.class_start_date ?? '-'} ~ {row.class_end_date ?? '-'}
          </dd>
          <dt className="text-gray-400">접수 기간</dt>
          <dd>
            {row.register_start_date ?? '-'} ~ {row.register_end_date ?? '-'}
          </dd>
        </dl>

        {row.detail_fetched_at ? (
          <>
            {row.class_detail_title && <p className="text-sm font-semibold text-gray-900 mb-1">{row.class_detail_title}</p>}
            {row.class_detail_content ? (
              <p className="text-sm text-gray-700 whitespace-pre-line">{row.class_detail_content}</p>
            ) : (
              <p className="text-sm text-gray-400">상세설명이 등록되어 있지 않은 강좌입니다.</p>
            )}
            {row.main_image_key && (
              <p className="text-xs text-gray-400 mt-3 break-all">
                🖼️ 이미지 참조(공개 URL 미확인): {row.main_image_bucket}/{row.main_image_key}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">
            아직 상세정보가 수집되지 않았습니다(scripts/ingest/emart-culture-club-detail.mjs가 매일 새벽 증분 수집합니다).
          </p>
        )}
      </div>
    </div>
  );
}

export function EmartCultureClubPanel() {
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [storeFilter, setStoreFilter] = useState<Set<string>>(new Set());
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedRow, setSelectedRow] = useState<ClassRow | null>(null);

  // [지점별 다중선택 필터](2026-10-04) — 기존 공개 지점 목록 API를 그대로
  // 재사용한다(제5장 제4조 — 지점 데이터를 또 조회하는 경로를 새로 안 만듦).
  useEffect(() => {
    fetch('/api/culture-club/stores')
      .then((res) => res.json())
      .then((data: { stores?: StoreOption[] }) => setStores(data.stores ?? []))
      .catch(() => setStores([]));
  }, []);

  function loadRows() {
    setIsLoading(true);
    setErrorMessage(null);
    const params = new URLSearchParams();
    if (categoryFilter) params.set('sub_category_code', categoryFilter);
    if (statusFilter) params.set('filter_status', statusFilter);
    if (storeFilter.size > 0) params.set('store_code', [...storeFilter].join(','));

    fetch(`/api/admin/emart-culture-club?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { rows?: ClassRow[]; total?: number; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }

  // [수동 노출 제외](2026-10-03 사용자 지시): "화면에 노출 배제할꺼 수동으로
  // 체크할수 있어? ... Club Original은 섞여있어서 어른께 더 많은편이야" —
  // Club Originals 카테고리에 섞인 성인 전용 강좌를 관리자가 리뷰하며 개별
  // 체크로 제외 처리한다. 낙관적 업데이트 후 실패하면 되돌린다.
  function toggleExcluded(classId: string, nextExcluded: boolean) {
    setRows((prev) => prev?.map((r) => (r.class_id === classId ? { ...r, is_excluded: nextExcluded } : r)) ?? null);

    fetch('/api/admin/emart-culture-club', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: classId, is_excluded: nextExcluded }),
    })
      .then((res) => res.json())
      .then((data: { error?: string }) => {
        if (data.error) throw new Error(data.error);
      })
      .catch((err: Error) => {
        setErrorMessage(`노출 제외 처리 실패: ${err.message}`);
        setRows((prev) => prev?.map((r) => (r.class_id === classId ? { ...r, is_excluded: !nextExcluded } : r)) ?? null);
      });
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <p className="text-sm text-gray-500 mb-3">
        이마트 컬처클럽 강좌 리스트(검토용 — 공개 GraphQL API로 매일 자동 수집,
        scripts/ingest/emart-culture-club.mjs). 전체 6,500건+ 규모라 카테고리/상태로 좁혀서 조회하는 걸 권장합니다.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 text-xs px-2 py-1.5"
        >
          <option value="">전체 카테고리</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 text-xs px-2 py-1.5"
        >
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === '정원마감' ? '정원마감(대기접수 가능)' : s}
            </option>
          ))}
        </select>
        <StoreMultiSelect stores={stores} selected={storeFilter} onChange={setStoreFilter} />
        <button
          type="button"
          onClick={loadRows}
          disabled={isLoading}
          className="rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          {isLoading ? '불러오는 중...' : '조회하기'}
        </button>
        {rows !== null && (
          <span className="text-xs text-gray-500">
            총 {total.toLocaleString('ko-KR')}건{total > rows.length ? ` 중 최신 ${rows.length.toLocaleString('ko-KR')}건 표시` : ''}
          </span>
        )}
      </div>

      {errorMessage && <p className="text-sm text-red-500 mb-3">{errorMessage}</p>}
      {rows === null && !errorMessage && !isLoading && (
        <p className="text-sm text-gray-400">카테고리/상태/지점을 선택하고 &apos;조회하기&apos;를 눌러 수집 결과를 불러오세요.</p>
      )}

      {rows !== null && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2 px-3">노출 제외</th>
                <th className="py-2 px-3">강좌명</th>
                <th className="py-2 px-3">지점</th>
                <th className="py-2 px-3">카테고리</th>
                <th className="py-2 px-3">요일/시간</th>
                <th className="py-2 px-3">상태</th>
                <th className="py-2 px-3">가격</th>
                <th className="py-2 px-3">정원</th>
                <th className="py-2 px-3">접수 기간</th>
                <th className="py-2 px-3">수집 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row)}
                  className={`cursor-pointer hover:bg-blue-50/50 ${row.is_excluded ? 'bg-gray-100 opacity-60' : row.filter_status === '정원마감' ? 'bg-amber-50' : 'bg-white'}`}
                >
                  <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={row.is_excluded}
                      onChange={(e) => toggleExcluded(row.class_id, e.target.checked)}
                      aria-label={`${row.class_title} 노출 제외`}
                    />
                  </td>
                  <td className={`py-2 px-3 max-w-xs truncate ${row.is_excluded ? 'line-through' : ''}`} title={row.class_title}>
                    {row.class_title}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{row.store_name ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">{row.sub_category_name ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {(row.class_day ?? []).join(',')} {formatTimeRange(row.start_time, row.end_time)}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        row.filter_status === '정원마감'
                          ? 'bg-amber-500 text-white'
                          : row.filter_status === '접수중'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.filter_status === '정원마감' ? '대기접수 가능' : row.filter_status}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {row.class_fee != null ? `${row.class_fee.toLocaleString('ko-KR')}원` : '-'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">{row.class_capacity ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">
                    {row.register_start_date ?? '-'} ~ {row.register_end_date ?? '-'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-400">{formatDateTime(row.collected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-gray-400 text-center py-6">조건에 맞는 데이터가 없습니다.</p>}
        </div>
      )}

      {selectedRow && <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
