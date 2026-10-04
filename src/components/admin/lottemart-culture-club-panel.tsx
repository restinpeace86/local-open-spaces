'use client';

import { useEffect, useState } from 'react';
import { LOTTEMART_TARGET_OPTIONS } from '@/lib/home/culture-club-options';
import { StoreMultiSelect, StoreOption } from '@/components/admin/store-multiselect';

// [롯데마트 문화센터 강좌 리스트 — data-grid 탭](2026-10-04 사용자 지시): "지금 내가
// 확인해보려는데 관리자화면에 롯데마트쪽 탭이 안보이는데?" — 이마트 컬처클럽 탭
// (emart-culture-club-panel.tsx)과 동일한 패턴(자기완결 패널, 마운트 시 자동 조회
// 안 함, '조회하기' 버튼으로 시작). 전체 15,000건+ 규모라 대상/상태/지점 필터로
// 좁혀 쓰는 게 기본 — 필터 없이 조회하면 최신 1,000건만 보이고 "총 N건 중 M건
// 표시"로 안내한다.

type ClassRow = {
  id: number;
  class_id: string;
  class_title: string;
  store_code: string;
  store_name: string;
  main_category_name: string | null;
  sub_category_name: string | null;
  age_range_text: string | null;
  instructor_name: string | null;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  class_start_date: string | null;
  session_count: number | null;
  class_original_fee: number | null;
  class_fee: number | null;
  class_material_fee: number | null;
  discount_badge_text: string | null;
  is_closing_soon: boolean;
  is_new: boolean;
  like_count: number | null;
  registration_status: '바로신청' | '대기자신청' | '접수마감' | '전화문의' | '현장접수';
  semester_code: string;
  target_code: string;
  target_name: string;
  is_excluded: boolean;
  collected_at: string;
  // [상세정보 1회성 수집](2026-10-04 사용자 지시): "상세정보 롯데마트 문화센터는
  // 클래스 상세정보같은거왜 안나와?.. 강좌코드나 강의실이나 강좌소개나 강좌수강
  // Tip이랄던가" — lottemart-culture-club-detail.mjs가 채워주는 컬럼들.
  class_code: string | null;
  classroom: string | null;
  class_intro: string | null;
  class_tip: string | null;
  detail_fetched_at: string | null;
};

const STATUS_OPTIONS: ClassRow['registration_status'][] = ['바로신청', '대기자신청', '접수마감', '전화문의', '현장접수'];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDate(raw: string | null) {
  if (!raw || raw.length !== 8) return raw ?? '-';
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

// [상세보기 모달 — 강좌코드/강의실/소개/Tip 추가](2026-10-04 사용자 지시):
// "상세정보 롯데마트 문화센터는 클래스 상세정보같은거왜 안나와?.. 강좌코드나
// 강의실이나 강좌소개나 강좌수강 Tip이랄던가 상세들어가면 다 있던데" —
// lottemart-culture-club-detail.mjs가 class_id당 한 번만 채우는 정적 필드.
// 이마트의 class_detail_content/detail_fetched_at 안내 패턴과 동일하게,
// 아직 상세정보가 안 채워진 행(detail_fetched_at null)에는 안내 문구를
// 보여준다.
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

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
          <dt className="text-gray-400">지점</dt>
          <dd>{row.store_name}</dd>
          <dt className="text-gray-400">대상</dt>
          <dd>{row.target_name}</dd>
          <dt className="text-gray-400">분류</dt>
          <dd>
            {row.main_category_name ?? '-'}
            {row.sub_category_name ? ` > ${row.sub_category_name}` : ''}
          </dd>
          <dt className="text-gray-400">연령</dt>
          <dd>{row.age_range_text ?? '-'}</dd>
          <dt className="text-gray-400">강사</dt>
          <dd>{row.instructor_name ?? '-'}</dd>
          <dt className="text-gray-400">강좌코드</dt>
          <dd>{row.class_code ?? '-'}</dd>
          <dt className="text-gray-400">강의실</dt>
          <dd>{row.classroom ?? '-'}</dd>
          <dt className="text-gray-400">개강일/요일/시간</dt>
          <dd>
            {formatDate(row.class_start_date)} ({(row.class_day ?? []).join(',')}) {row.start_time ?? '-'}~{row.end_time ?? '-'}
          </dd>
          <dt className="text-gray-400">수강료</dt>
          <dd>
            {row.session_count != null ? `${row.session_count}회 ` : ''}
            {row.class_original_fee != null && <span className="line-through mr-1">{row.class_original_fee.toLocaleString('ko-KR')}원</span>}
            {row.class_fee != null ? `${row.class_fee.toLocaleString('ko-KR')}원` : '-'}
            {row.class_material_fee != null ? ` (+재료비 ${row.class_material_fee.toLocaleString('ko-KR')}원 별도)` : ''}
          </dd>
          <dt className="text-gray-400">뱃지</dt>
          <dd>
            {row.discount_badge_text ?? ''} {row.is_closing_soon ? '마감임박' : ''} {row.is_new ? '신설' : ''}
            {!row.discount_badge_text && !row.is_closing_soon && !row.is_new && '-'}
          </dd>
          <dt className="text-gray-400">좋아요</dt>
          <dd>{row.like_count ?? '-'}</dd>
          <dt className="text-gray-400">학기</dt>
          <dd>{row.semester_code}</dd>
        </dl>

        {row.detail_fetched_at ? (
          <div className="mt-4 flex flex-col gap-3">
            {row.class_intro && (
              <div>
                <p className="text-xs font-semibold text-gray-900 mb-1">강좌소개</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{row.class_intro}</p>
              </div>
            )}
            {row.class_tip && (
              <div>
                <p className="text-xs font-semibold text-gray-900 mb-1">강좌 수강 Tip</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{row.class_tip}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-gray-400">
            아직 상세정보가 수집되지 않았습니다(scripts/ingest/lottemart-culture-club-detail.mjs가 매일 새벽 증분 수집합니다).
          </p>
        )}
      </div>
    </div>
  );
}

export function LottemartCultureClubPanel() {
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [targetFilter, setTargetFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [storeFilter, setStoreFilter] = useState<Set<string>>(new Set());
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedRow, setSelectedRow] = useState<ClassRow | null>(null);

  // [지점별 다중선택 필터](2026-10-04) — 기존 공개 지점 목록 API를 그대로
  // 재사용한다(제5장 제4조).
  useEffect(() => {
    fetch('/api/culture-club/lottemart-stores')
      .then((res) => res.json())
      .then((data: { stores?: StoreOption[] }) => setStores(data.stores ?? []))
      .catch(() => setStores([]));
  }, []);

  function loadRows() {
    setIsLoading(true);
    setErrorMessage(null);
    const params = new URLSearchParams();
    if (targetFilter) params.set('target_code', targetFilter);
    if (statusFilter) params.set('registration_status', statusFilter);
    if (storeFilter.size > 0) params.set('store_code', [...storeFilter].join(','));

    fetch(`/api/admin/lottemart-culture-club?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { rows?: ClassRow[]; total?: number; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }

  function toggleExcluded(classId: string, nextExcluded: boolean) {
    setRows((prev) => prev?.map((r) => (r.class_id === classId ? { ...r, is_excluded: nextExcluded } : r)) ?? null);

    fetch('/api/admin/lottemart-culture-club', {
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
        롯데마트 문화센터 강좌 리스트(검토용 — searchList.do HTML 파싱으로 매일 자동 수집,
        scripts/ingest/lottemart-culture-club.mjs). 전체 15,000건+ 규모라 대상/상태로 좁혀서 조회하는 걸 권장합니다.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="rounded-lg border border-gray-300 text-xs px-2 py-1.5"
        >
          <option value="">전체 대상</option>
          {LOTTEMART_TARGET_OPTIONS.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
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
              {s}
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
        <p className="text-sm text-gray-400">대상/상태/지점을 선택하고 &apos;조회하기&apos;를 눌러 수집 결과를 불러오세요.</p>
      )}

      {rows !== null && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2 px-3">노출 제외</th>
                <th className="py-2 px-3">강좌명</th>
                <th className="py-2 px-3">지점</th>
                <th className="py-2 px-3">대상</th>
                <th className="py-2 px-3">분류</th>
                <th className="py-2 px-3">요일/시간</th>
                <th className="py-2 px-3">상태</th>
                <th className="py-2 px-3">가격</th>
                <th className="py-2 px-3">수집 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row)}
                  className={`cursor-pointer hover:bg-blue-50/50 ${row.is_excluded ? 'bg-gray-100 opacity-60' : row.registration_status === '바로신청' ? 'bg-emerald-50' : 'bg-white'}`}
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
                  <td className="py-2 px-3 whitespace-nowrap">{row.store_name}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">{row.target_name}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">{row.sub_category_name ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {(row.class_day ?? []).join(',')} {row.start_time ?? '-'}~{row.end_time ?? '-'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        row.registration_status === '바로신청'
                          ? 'bg-emerald-600 text-white'
                          : row.registration_status === '대기자신청'
                            ? 'bg-amber-500 text-white'
                            : row.registration_status === '전화문의' || row.registration_status === '현장접수'
                              ? 'bg-gray-500 text-white'
                              : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {row.registration_status}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {row.class_fee != null ? `${row.class_fee.toLocaleString('ko-KR')}원` : '-'}
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
