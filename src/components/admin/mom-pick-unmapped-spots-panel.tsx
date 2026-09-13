'use client';

import { useEffect, useState } from 'react';
import { ServiceCategory } from '@/lib/admin/service-category';
import { MobileCurationWorkbench, CurationQueueItem } from '@/components/admin/mobile-curation-workbench';
import { MomPickUnmappedSpot } from '@/lib/admin/mom-pick-unmapped-spots';

const POST_TYPE_LABEL: Record<MomPickUnmappedSpot['posts'][number]['post_type'], string> = {
  micro_review: '마이크로 리뷰',
  checklist: '체크리스트',
  survey_review: '설문형 리뷰',
};

// [관리자 화면 — 노출 중분류 미지정 + 맘스픽 글 있음 우선순위 큐](2026-09-13 사용자
// 지시): "맘스픽 글이 올라왔고 장소연결됐는데 노출중분류가 안되어 있다.. 그 탭에
// 그런게 수시로 올라올수 있으니 탭 자체에 1건이라도 있을경우 표시.. 그 표시 보고
// 관리자가 파악하고 탭 열고 작업" — 다른 자기완결 패널(MomPickPostsPanel 등)과
// 달리, 이 패널은 마운트되자마자 자동으로 조회한다("클릭해야 불러오기" 관례를
// 의도적으로 벗어남) — 애초에 이 탭을 여는 이유가 "탭 뱃지를 보고 확인하러
// 들어왔다"이므로, 들어오자마자 또 한 번 눌러야 하면 배지의 의미가 없다. 데이터
// 규모도 "맘스픽 글이 실제로 달린, 아직 미지정인 스팟"만이라 원래도 작고 무겁지
// 않다.
export function MomPickUnmappedSpotsPanel() {
  const [spots, setSpots] = useState<MomPickUnmappedSpot[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [workbenchSpotId, setWorkbenchSpotId] = useState<string | null>(null);

  function fetchSpots() {
    setErrorMessage(null);
    fetch('/api/admin/mom-pick-unmapped-spots')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '조회 실패');
        setSpots(Array.isArray(data.spots) ? data.spots : []);
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : '조회 실패');
        setSpots([]);
      });
  }

  useEffect(() => {
    fetchSpots();
    // [기존 구조 우선] category-mapping-panel.tsx의 RowPicker/CategoryMappingPanel과
    // 동일하게 워크벤치 저장 폼이 필요로 하는 노출 중분류 목록을 함께 불러온다.
    fetch('/api/admin/service-categories')
      .then((res) => res.json())
      .then((data: { items?: ServiceCategory[] }) => setServiceCategories(data.items ?? []))
      .catch(() => {
        // 실패해도 목록/워크벤치 진입 자체는 가능하고, 워크벤치 안에서 노출
        // 중분류 선택지만 비어 보일 뿐이다(제5장 제11조).
      });
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800">
          🚩 노출 중분류 미지정 + 맘스픽 글 있는 장소
          {spots && <span className="ml-1.5 font-normal text-gray-400">({spots.length}건)</span>}
        </p>
        <button type="button" onClick={fetchSpots} className="text-xs font-medium text-indigo-600 hover:underline">
          새로고침
        </button>
      </div>
      <p className="text-xs text-gray-400">
        맘스픽에 글이 달렸지만 아직 노출 중분류가 지정되지 않아 스팟픽 화면(지도/목록)에는 보이지 않는 장소입니다.
        글 내용과 기존 블로그 큐레이션을 확인하고 노출 중분류를 지정해 주세요.
      </p>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      {spots == null ? (
        <p className="text-xs text-gray-400">불러오는 중...</p>
      ) : spots.length === 0 ? (
        <p className="text-xs text-gray-400">노출 중분류 지정이 필요한 장소가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {spots.map((spot) => (
            <div key={spot.id} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{spot.name}</p>
                  <p className="text-xs text-gray-500">
                    {spot.address ?? '주소 없음'}
                    {spot.category_min ? ` · 표준 중분류: ${spot.category_min}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkbenchSpotId(spot.id)}
                  className="shrink-0 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  노출 중분류 지정하기
                </button>
              </div>

              {spot.curatedBlogUrls.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] font-semibold text-gray-500">📝 이미 등록된 블로그 큐레이션</p>
                  {spot.curatedBlogUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[11px] text-indigo-600 hover:underline"
                    >
                      {url}
                    </a>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-gray-500">✍️ 맘스픽 글 {spot.posts.length}건</p>
                {spot.posts.map((post) => (
                  <div key={post.id} className="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700">
                    <p className="text-[10px] text-gray-400">
                      {POST_TYPE_LABEL[post.post_type]} · {post.author_nickname ?? '이름 없는 맘'} ·{' '}
                      {new Date(post.created_at).toLocaleDateString('ko-KR')}
                      {post.rating != null ? ` · ${'★'.repeat(post.rating)}${'☆'.repeat(5 - post.rating)}` : ''}
                    </p>
                    {post.content && <p className="mt-0.5 line-clamp-2">{post.content}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {workbenchSpotId &&
        (() => {
          const workbenchSpot = spots?.find((s) => s.id === workbenchSpotId);
          if (!workbenchSpot) return null;
          return (
            <MobileCurationWorkbench
              key={workbenchSpot.id}
              spot={workbenchSpot}
              serviceCategories={serviceCategories}
              queue={(spots ?? []) as CurationQueueItem[]}
              onClose={() => setWorkbenchSpotId(null)}
              onAdvance={(nextId) => setWorkbenchSpotId(nextId)}
              onServiceCategoryUpdated={(id, next) => {
                // 노출 중분류가 채워지면 이 큐(=미지정 목록)의 정의상 더 이상 여기
                // 속하지 않으므로, RowPicker처럼 값만 갱신하지 않고 목록에서 완전히
                // 제거한다.
                if (next) setSpots((prev) => prev?.filter((s) => s.id !== id) ?? prev);
              }}
            />
          );
        })()}
    </div>
  );
}
