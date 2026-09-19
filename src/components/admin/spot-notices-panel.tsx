'use client';

import { useState } from 'react';

// [네이버 플레이스 공지 온디맨드 레이더 — 관리자 스테이징함](2026-09-19 사용자 지시):
// "관리자 대시보드의 '임시 보관함(Staging)' 테이블에.. 관리자는.. 검수하고, 자체
// 제작 썸네일과 요약 텍스트로 가공.. 발행하면 status: 'published'" — 다른 자기완결
// 패널(MomPickPostsPanel 등)과 동일한 관례: 마운트 시 자동 조회하지 않고, 상태
// 탭(pending/published/archived) + 페이지네이션 + 행별 인라인 편집 폼.
type SpotNoticeRow = {
  id: string;
  spot_id: string;
  raw_title: string | null;
  raw_content: string | null;
  raw_image_url: string | null;
  raw_category: string | null;
  raw_posted_at: string | null;
  curated_title: string | null;
  curated_content: string | null;
  curated_image_url: string | null;
  status: 'pending' | 'published' | 'archived';
  created_at: string;
  published_at: string | null;
  open_spaces: { name: string; address: string | null } | null;
};

const PAGE_SIZE = 20;
const STATUS_TABS: { key: SpotNoticeRow['status']; label: string }[] = [
  { key: 'pending', label: '검수 대기' },
  { key: 'published', label: '발행됨' },
  { key: 'archived', label: '보관됨' },
];

function EditForm({ row, onSaved }: { row: SpotNoticeRow; onSaved: (updated: SpotNoticeRow) => void }) {
  const [title, setTitle] = useState(row.curated_title ?? row.raw_title ?? '');
  const [content, setContent] = useState(row.curated_content ?? row.raw_content ?? '');
  const [imageUrl, setImageUrl] = useState(row.curated_image_url ?? '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function save(nextStatus?: SpotNoticeRow['status']) {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/spot-notices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          curated_title: title,
          curated_content: content,
          curated_image_url: imageUrl || null,
          ...(nextStatus ? { status: nextStatus } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      onSaved(data.item);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setIsSaving(false);
    }
  }

  // [저작권 문제 없는 자체 제작 썸네일](요청 원문) — 원본(raw_image_url)은 네이버
  // 소유 CDN이라 참고용으로만 보여주고, 실제 발행에 쓰는 이미지는 관리자가 직접
  // 업로드한다. 기존 스팟 큐레이션 업로드 엔드포인트를 그대로 재사용한다(제5장 제4조).
  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/spot-curations/upload-image', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? '이미지 업로드 실패');
      setImageUrl(data.url);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '이미지 업로드 실패');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-col gap-1 text-xs text-gray-500">
        <p>
          원문(네이버, {row.raw_category ?? '분류 없음'} · {row.raw_posted_at ?? '작성일 미상'})
        </p>
        <p className="text-gray-700">{row.raw_title}</p>
        {row.raw_content && <p className="whitespace-pre-wrap text-gray-600">{row.raw_content}</p>}
        {row.raw_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.raw_image_url} alt="" className="mt-1 h-24 w-24 rounded-lg object-cover" />
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">발행 제목</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">발행 내용</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">발행 이미지(선택, 자체 업로드)</span>
        <input type="file" accept="image/*" onChange={handleUploadImage} disabled={isUploading} className="text-xs" />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="mt-1 h-24 w-24 rounded-lg object-cover" />
        )}
      </label>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save()}
          disabled={isSaving || isUploading}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
        >
          임시 저장
        </button>
        {row.status !== 'published' && (
          <button
            type="button"
            onClick={() => save('published')}
            disabled={isSaving || isUploading}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            🚀 발행
          </button>
        )}
        {row.status !== 'archived' && (
          <button
            type="button"
            onClick={() => save('archived')}
            disabled={isSaving || isUploading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-500 disabled:opacity-50"
          >
            보관
          </button>
        )}
        {row.status === 'archived' && (
          <button
            type="button"
            onClick={() => save('pending')}
            disabled={isSaving || isUploading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-500 disabled:opacity-50"
          >
            검수 대기로 되돌리기
          </button>
        )}
      </div>
    </div>
  );
}

export function SpotNoticesPanel() {
  const [status, setStatus] = useState<SpotNoticeRow['status']>('pending');
  const [items, setItems] = useState<SpotNoticeRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchItems(targetStatus = status, targetPage = 1) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/spot-notices?status=${targetStatus}&page=${targetPage}&page_size=${PAGE_SIZE}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '조회 실패');
      setItems(data.items);
      setTotal(data.total);
      setStatus(targetStatus);
      setPage(targetPage);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '공지 스테이징 목록 조회 실패');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSaved(updated: SpotNoticeRow) {
    // 상태가 바뀌어 현재 탭 조건에서 벗어났으면(예: pending → published) 목록에서
    // 사라진다 — 다시 조회하지 않고 로컬에서 걸러내는 게 즉각적이라 그대로 반영한다.
    setItems((prev) => (prev ? prev.filter((r) => r.id !== updated.id || updated.status === status) : prev));
    setExpandedId(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => fetchItems(tab.key, 1)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              items !== null && status === tab.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {items === null && (
          <button
            type="button"
            onClick={() => fetchItems('pending', 1)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            불러오기
          </button>
        )}
        {isLoading && <span className="text-xs text-gray-400">불러오는 중...</span>}
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      {items && (
        <>
          <p className="text-xs text-gray-400">총 {total}건</p>
          {items.length === 0 && <p className="text-sm text-gray-400">해당 상태의 공지가 없습니다.</p>}
          <div className="flex flex-col gap-2">
            {items.map((row) => (
              <div key={row.id} className="rounded-lg border border-gray-200 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{row.open_spaces?.name ?? '(스팟 정보 없음)'}</p>
                    <p className="mt-0.5 truncate text-sm text-gray-600">{row.curated_title ?? row.raw_title}</p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {new Date(row.created_at).toLocaleString('ko-KR')} · {row.raw_category ?? '분류 없음'}
                    </p>
                  </div>
                  <span className="shrink-0 text-gray-400">{expandedId === row.id ? '접기 ▲' : '펼치기 ▼'}</span>
                </button>
                {expandedId === row.id && <EditForm row={row} onSaved={handleSaved} />}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <button type="button" disabled={page <= 1} onClick={() => fetchItems(status, page - 1)} className="disabled:opacity-30">
                이전
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchItems(status, page + 1)}
                className="disabled:opacity-30"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
