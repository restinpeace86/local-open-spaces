'use client';

import { useEffect, useState } from 'react';
import { Pagination } from '@/components/admin/pagination';
import { CuratedItemFormModal, CuratedItemFormValue } from '@/components/admin/curated-item-form-modal';

// [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
// 사용자 지시): curated_items 전용 관리 패널. open_spaces/events/raw_ingest_data 3개
// 탭을 다루는 AdminDataGridClient(표준 중분류/타겟 연령 체계에 깊게 결합된 1000행+
// 컴포넌트)와는 데이터 모양이 근본적으로 다르고(제휴 상품 vs 위치 기반 시설/행사),
// create/edit/toggle처럼 그 3개 탭에는 없는 동작까지 필요해 별도 컴포넌트로 분리했다 —
// 기존 3개 탭의 코드는 전혀 건드리지 않는다(제5장 제4조 기존 구조 우선의 취지는 "동일
// 목적 중복 방지"이지 "다른 목적을 억지로 통합"이 아니라고 판단, deals-collector.mjs를
// BaseCollectorAdapter와 분리했던 것과 동일한 근거). 다만 요구사항 "기존에 잘 작동하던
// 상품명 키워드 검색창과 등록일 기준 필터는 절대 삭제하지 말고 유지"는 AdminDataGridClient
// 본체의 검색창/등록일(created_at) 필터를 가리키므로, 여기서도 동일한 UX 패턴(디바운스
// 검색, 등록일 Date Range)을 그대로 재사용한다.
const PAGE_SIZE = 20;

const CATEGORY_LABEL: Record<string, string> = {
  ticket: 'ticket (티켓/체험)',
  coupang: 'coupang (쿠팡 등 커머스)',
};

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// 요구사항 "원클릭 노출 토글": 스위치 형태 버튼 — 누르면 즉시 PATCH가 나가고, 성공하면
// 로컬 상태만 갱신한다(목록을 통째로 다시 불러오지 않아 체감 속도를 유지 — 어드민
// 예약 대시보드 상태 변경과 동일한 관례).
function ToggleSwitch({
  checked,
  onToggle,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function CuratedItemsPanel() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  // 요구사항: "기존에 잘 작동하던... 등록일(created_at) 기준 필터는 절대 삭제하지 말고
  // 그대로 유지" — AdminDataGridClient의 등록일 Date Range와 동일한 UX(단축 버튼 +
  // 달력)를 그대로 재사용한다.
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  // 요구사항 "신규 필터 추가(기간 필터)": 운영/예약 가능 기간 기준 Date Range.
  const [operationFrom, setOperationFrom] = useState('');
  const [operationTo, setOperationTo] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<CuratedItemFormValue[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시) 요구사항 3: 이 탭도 마운트 시
  // 자동 조회하지 않는다 — AdminDataGridClient의 3개 탭과 동일한 게이트를 이 자기완결적
  // 패널에도 별도로 적용한다(CuratedItemsPanel은 그 컴포넌트의 fetch effect를 타지 않는
  // 별도 컴포넌트라 게이트도 독립적으로 필요).
  const [hasLoaded, setHasLoaded] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'create' | CuratedItemFormValue | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, createdFrom, createdTo, operationFrom, operationTo]);

  useEffect(() => {
    if (!hasLoaded) return;

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    if (createdFrom) params.set('created_from', createdFrom);
    if (createdTo) params.set('created_to', createdTo);
    if (operationFrom) params.set('operation_from', operationFrom);
    if (operationTo) params.set('operation_to', operationTo);
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));

    fetch(`/api/admin/curated-items?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '조회에 실패했습니다.');
        return json as { items: CuratedItemFormValue[]; total: number };
      })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items);
        setTotal(result.total);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasLoaded, debouncedQ, createdFrom, createdTo, operationFrom, operationTo, page]);

  async function handleToggle(row: CuratedItemFormValue) {
    setTogglingId(row.id);
    const nextIsActive = !row.is_active;
    try {
      const res = await fetch('/api/admin/curated-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, is_active: nextIsActive }),
      });
      const data: { item?: CuratedItemFormValue; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '노출 상태 변경에 실패했습니다.');

      setRows((prev) => prev.map((r) => (r.id === row.id ? data.item! : r)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '노출 상태 변경에 실패했습니다.');
    } finally {
      setTogglingId(null);
    }
  }

  function handleSaved(item: CuratedItemFormValue) {
    setRows((prev) => {
      const exists = prev.some((r) => r.id === item.id);
      return exists ? prev.map((r) => (r.id === item.id ? item : r)) : [item, ...prev];
    });
    setTotal((prev) => (rows.some((r) => r.id === item.id) ? prev : prev + 1));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900">🏷️ 큐레이션/제휴 상품 (curated_items)</h2>
          <button
            type="button"
            onClick={() => setModalMode('create')}
            className="text-xs font-semibold text-white bg-blue-600 rounded-full px-3 py-1.5 hover:bg-blue-700"
          >
            + 신규 상품 등록
          </button>
        </div>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="상품명 키워드 검색"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500 shrink-0">등록일(created_at)</span>
          <button
            type="button"
            onClick={() => {
              setCreatedFrom(todayDateStr());
              setCreatedTo(todayDateStr());
            }}
            className="rounded-full px-2.5 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            오늘 등록건 보기
          </button>
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
          />
          {(createdFrom || createdTo) && (
            <button
              type="button"
              onClick={() => {
                setCreatedFrom('');
                setCreatedTo('');
              }}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              날짜 초기화
            </button>
          )}
        </div>

        {/* 요구사항 "신규 필터 추가(기간 필터)": 운영/예약 가능 기간 기준 Date Range. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500 shrink-0">운영/예약 가능 기간</span>
          <input
            type="date"
            value={operationFrom}
            onChange={(e) => setOperationFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            value={operationTo}
            onChange={(e) => setOperationTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
          />
          {(operationFrom || operationTo) && (
            <button
              type="button"
              onClick={() => {
                setOperationFrom('');
                setOperationTo('');
              }}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              날짜 초기화
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!hasLoaded && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-gray-500">필터를 설정한 뒤 불러오기를 눌러주세요.</p>
            <button
              type="button"
              onClick={() => setHasLoaded(true)}
              className="rounded-full bg-blue-600 text-white text-sm font-semibold px-5 py-2 hover:bg-blue-700"
            >
              📥 불러오기
            </button>
          </div>
        )}

        {hasLoaded && isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {hasLoaded && errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {hasLoaded && !isLoading && !errorMessage && rows.length === 0 && (
          <p className="text-sm text-gray-400">조건에 맞는 상품이 없습니다.</p>
        )}

        {hasLoaded && !isLoading && !errorMessage && rows.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2.5 pr-3">이미지</th>
                <th className="py-2.5 pr-3">상품명</th>
                <th className="py-2.5 pr-3">카테고리</th>
                <th className="py-2.5 pr-3">운영/예약 가능 기간</th>
                <th className="py-2.5 pr-3">등록일</th>
                <th className="py-2.5 pr-3">노출</th>
                <th className="py-2.5 pr-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={index % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}>
                  <td className="py-2 pr-3">
                    {row.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-sm" aria-hidden>
                        🧭
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-medium text-gray-900 max-w-[240px] truncate">{row.title}</td>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{CATEGORY_LABEL[row.category] ?? row.category}</td>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap text-xs">
                    {row.operation_start_date || row.operation_end_date
                      ? `${row.operation_start_date ?? '~'} ~ ${row.operation_end_date ?? '~'}`
                      : '상시'}
                  </td>
                  <td className="py-2 pr-3 text-gray-400 whitespace-nowrap text-xs">
                    {new Date(row.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="py-2 pr-3">
                    <ToggleSwitch
                      checked={row.is_active}
                      disabled={togglingId === row.id}
                      onToggle={() => handleToggle(row)}
                    />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => setModalMode(row)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-100 p-3">
        <span className="text-xs text-gray-500">
          총 {total.toLocaleString('ko-KR')}건 · {page} / {totalPages} 페이지
        </span>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {modalMode && (
        <CuratedItemFormModal
          initial={modalMode === 'create' ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
