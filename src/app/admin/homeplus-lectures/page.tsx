'use client';

import { useEffect, useMemo, useState } from 'react';

// [홈플러스 문화센터 강좌 리스트 수집 — 관리자 화면](2026-10-02 사용자 지시):
// "LectureMasterID 가져오기 전단계로 이 리스트 관련 우리쪽 관리자 화면에서
// 볼수 있게해줘" — scripts/python/homeplus-collect-lecture-list.py가
// Supabase에 직접 적재한 homeplus_lecture_list 테이블을 그대로 보여주는
// 단순 읽기 전용 화면이다(/admin/pipeline과 동일한 관례 — 이 앱은 아직
// 로그인/세션 인증이 없어 별도 접근 제어 없이 기존 관례를 그대로 따른다).

type LectureListRow = {
  id: number;
  search_batch: 1 | 2;
  store_name: string | null;
  date_range_text: string | null;
  is_closed: boolean;
  raw_text: string;
  collected_at: string;
};

const SEARCH_BATCH_LABEL: Record<number, string> = {
  1: '1차(서울/인천·부천/수원·화성/경기/대전·세종/충청/광주·전라/강원)',
  2: '2차(대구/울산/경북/경남/부산)',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminHomeplusLecturesPage() {
  const [rows, setRows] = useState<LectureListRow[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [closedFilter, setClosedFilter] = useState<'all' | 'open' | 'closed'>('all');

  useEffect(() => {
    fetch('/api/admin/homeplus-lecture-list')
      .then((res) => res.json())
      .then((data: { rows?: LectureListRow[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
      })
      .catch((err: Error) => setErrorMessage(err.message));
  }, []);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    if (closedFilter === 'open') return rows.filter((r) => !r.is_closed);
    if (closedFilter === 'closed') return rows.filter((r) => r.is_closed);
    return rows;
  }, [rows, closedFilter]);

  const closedCount = rows?.filter((r) => r.is_closed).length ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-lg font-bold text-gray-900">🏫 홈플러스 문화센터 강좌 리스트</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Kids/Baby 전체 대상, 전국 지점 검색 결과 수집본(검토용 — LectureMasterID 추출 전단계).
      </p>

      {errorMessage && <p className="text-sm text-red-500 mb-3">{errorMessage}</p>}
      {rows === null && !errorMessage && <p className="text-sm text-gray-400">불러오는 중...</p>}

      {rows !== null && (
        <>
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="text-gray-500">
              총 {rows.length}건 (마감 {closedCount}건 / 신청가능 {rows.length - closedCount}건)
            </span>
            <div className="ml-auto flex gap-1">
              {(['all', 'open', 'closed'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClosedFilter(key)}
                  className={`rounded-full px-3 py-1 font-semibold ${
                    closedFilter === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {key === 'all' ? '전체' : key === 'open' ? '신청가능' : '마감'}
                </button>
              ))}
            </div>
          </div>

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
        </>
      )}
    </div>
  );
}
