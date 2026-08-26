'use client';

// [7대 대분류 및 37종 중분류 체계 도입 & 어드민 개편](2026-08-26): 단순 이전/다음 대신
// 번호 선택 + 첫/끝 페이지 직접 이동이 가능한 표준 페이지네이션. 페이지 수가 많을 때는
// 현재 페이지 주변 번호만 보여주고 나머지는 "…"으로 생략한다(전형적인 관리자 그리드 UX).
export function buildPageNumbers(currentPage: number, totalPages: number): (number | '…')[] {
  const SIBLINGS = 1;
  const pages: (number | '…')[] = [];

  let rangeStart = Math.max(2, currentPage - SIBLINGS);
  let rangeEnd = Math.min(totalPages - 1, currentPage + SIBLINGS);

  // 생략 부호(…)가 페이지 번호 딱 1개만 대신하는 건 어색하다(예: [1,2,…,4]) — 그 경우
  // 생략 없이 번호를 그대로 이어붙인다(표준 페이지네이션 관례).
  if (rangeStart === 3) rangeStart = 2;
  if (rangeEnd === totalPages - 2) rangeEnd = totalPages - 1;

  pages.push(1);
  if (rangeStart > 2) pages.push('…');
  for (let p = rangeStart; p <= rangeEnd; p += 1) pages.push(p);
  if (rangeEnd < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  return pages;
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (nextPage: number) => void;
}) {
  const pageNumbers = buildPageNumbers(page, totalPages);

  const buttonClass = (isActive: boolean) =>
    `min-w-[28px] rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
      isActive
        ? 'bg-gray-900 border-gray-900 text-white'
        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={page <= 1}
        aria-label="첫 페이지로 이동"
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
      >
        «
      </button>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label="이전 페이지"
        className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
      >
        이전
      </button>

      {pageNumbers.map((p, idx) =>
        p === '…' ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`ellipsis-${idx}`} className="px-1 text-xs text-gray-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={buttonClass(p === page)}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        aria-label="다음 페이지"
        className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
      >
        다음
      </button>
      <button
        type="button"
        onClick={() => onChange(totalPages)}
        disabled={page >= totalPages}
        aria-label="마지막 페이지로 이동"
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
      >
        »
      </button>
    </div>
  );
}
