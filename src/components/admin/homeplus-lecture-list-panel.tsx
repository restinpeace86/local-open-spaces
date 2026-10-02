'use client';

import { useEffect, useMemo, useState } from 'react';

// [홈플러스 문화센터 강좌 리스트 — data-grid 탭으로 통합](2026-10-02 사용자
// 지시): "/admin/data-grid쪽에 tab 하나 더 만들어서 하는건 안돼?" — 처음엔
// 독립 페이지(/admin/homeplus-lectures)로 만들었다가, 다른 자기완결 탭들
// (curated_items/spot_curations/spot_notices 등)과 동일한 패턴으로
// data-grid 안에 편입했다. "탭 전환 시 자동 데이터 로딩 금지"(2026-08-30
// 사용자 지시, data-grid-client.tsx 상단 코멘트) 관례를 그대로 따라 마운트
// 시 자동 조회하지 않고 '조회하기' 버튼을 눌러야 가져온다(메인 데이터
// 테이블만 해당 — 아래 배치 상태 배너는 TodayBatchSummary와 동일하게
// 가벼운 보조 지표라 자동 조회한다).

type LectureListRow = {
  id: number;
  search_batch: 1 | 2;
  store_name: string | null;
  date_range_text: string | null;
  is_closed: boolean;
  raw_text: string;
  collected_at: string;
};

type PipelineLogRow = {
  status: 'OK' | 'FAILED';
  executed_at: string;
  error_message: string | null;
  meta_data: { reason?: string; collected?: number; closed?: number } | null;
};

const SEARCH_BATCH_LABEL: Record<number, string> = {
  1: '1차(서울/인천·부천/수원·화성/경기/대전·세종/충청/광주·전라/강원)',
  2: '2차(대구/울산/경북/경남/부산)',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

// [일일 배치 자동화](2026-10-02 사용자 지시: "매일 배치 돌려서 하루에 한번
// 확인은 못하는구조야?") GitHub Actions(.github/workflows/
// homeplus-lecture-list-batch.yml)가 매일 pipeline_logs에 OK/FAILED 1건을
// 남긴다. 세션이 만료되면 FAILED + meta_data.reason === 'session_expired'로
// 기록되는데(homeplus-collect-lecture-list.py), 이 경우만 "재로그인 필요"로
// 사용자가 바로 알아차리고 행동할 수 있게 전용 배너를 보여준다 — 그 외
// 실패는 일반 에러 메시지로 구분한다.
function BatchStatusBanner() {
  const [log, setLog] = useState<PipelineLogRow | null | 'loading' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/pipeline-logs?agent_name=HOMEPLUS_LECTURE_LIST')
      .then((res) => res.json())
      .then((data: { history?: PipelineLogRow[] }) => {
        if (!cancelled) setLog(data.history?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLog('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (log === 'loading') return null;
  if (log === 'error' || log === null) return null;

  if (log.status === 'OK') {
    return (
      <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">
        ✅ 마지막 자동 수집 성공: {formatDateTime(log.executed_at)} (총 {log.meta_data?.collected ?? '?'}건, 마감{' '}
        {log.meta_data?.closed ?? '?'}건)
      </p>
    );
  }

  const isSessionExpired = log.meta_data?.reason === 'session_expired';
  return (
    <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
      {isSessionExpired
        ? `🔒 세션 만료(${formatDateTime(log.executed_at)}) — 로컬에서 homeplus-save-login-session.py를 다시 실행해 카카오 로그인 후, GitHub Actions secret HOMEPLUS_STATE_JSON을 갱신해주세요.`
        : `⚠️ 마지막 자동 수집 실패(${formatDateTime(log.executed_at)}): ${log.error_message ?? '(사유 미기록)'}`}
    </p>
  );
}

export function HomeplusLectureListPanel() {
  const [rows, setRows] = useState<LectureListRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [closedFilter, setClosedFilter] = useState<'all' | 'open' | 'closed'>('all');

  function loadRows() {
    setIsLoading(true);
    setErrorMessage(null);
    fetch('/api/admin/homeplus-lecture-list')
      .then((res) => res.json())
      .then((data: { rows?: LectureListRow[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    if (closedFilter === 'open') return rows.filter((r) => !r.is_closed);
    if (closedFilter === 'closed') return rows.filter((r) => r.is_closed);
    return rows;
  }, [rows, closedFilter]);

  const closedCount = rows?.filter((r) => r.is_closed).length ?? 0;

  return (
    // [2026-10-02 실측 수정] "스크롤이 안되네 3건밖에안보여" — data-grid 전체
    // 레이아웃(flex-col + overflow-hidden, 2026-09-05 결정)에서 각 탭 콘텐츠가
    // 자기 몫의 스크롤 영역을 직접 가져야 하는데(spot-notices-panel.tsx와
    // 동일한 패턴: flex-1 min-h-0 overflow-y-auto) 이 패널은 그냥 p-4만 줘서
    // 넘치는 부분이 조상의 overflow-hidden에 그대로 잘려나가고 있었다.
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <p className="text-sm text-gray-500 mb-3">
        Kids/Baby 전체 대상, 전국 지점 검색 결과 수집본(검토용 — LectureMasterID 추출 전단계).
      </p>
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
        ⏸️ 홈플러스가 문화센터 서비스를 중단해(2026-10-02 확인) 자동 수집을 중단했습니다. 아래는 과거 수집본입니다.
      </p>

      <BatchStatusBanner />

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={loadRows}
          disabled={isLoading}
          className="rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          {isLoading ? '불러오는 중...' : '조회하기'}
        </button>
        {rows !== null && (
          <>
            <span className="text-xs text-gray-500">
              총 {rows.length}건 (마감 {closedCount}건 / 신청가능 {rows.length - closedCount}건)
            </span>
            <div className="ml-auto flex gap-1">
              {(['all', 'open', 'closed'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClosedFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    closedFilter === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {key === 'all' ? '전체' : key === 'open' ? '신청가능' : '마감'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {errorMessage && <p className="text-sm text-red-500 mb-3">{errorMessage}</p>}
      {rows === null && !errorMessage && !isLoading && <p className="text-sm text-gray-400">'조회하기'를 눌러 수집 결과를 불러오세요.</p>}

      {rows !== null && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2 px-3">검색차수</th>
                <th className="py-2 px-3">지점</th>
                <th className="py-2 px-3">기간</th>
                <th className="py-2 px-3">상태</th>
                <th className="py-2 px-3">원본 텍스트</th>
                <th className="py-2 px-3">수집 시각</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className={row.is_closed ? 'bg-red-50' : 'bg-white'}>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">{SEARCH_BATCH_LABEL[row.search_batch]}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{row.store_name ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">{row.date_range_text ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        row.is_closed ? 'bg-red-500 text-white' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {row.is_closed ? '마감' : '신청가능'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-600 max-w-md whitespace-pre-line">{row.raw_text}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-400">{formatDateTime(row.collected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 && <p className="text-sm text-gray-400 text-center py-6">조건에 맞는 데이터가 없습니다.</p>}
        </div>
      )}
    </div>
  );
}
