'use client';

import { useState } from 'react';
import { useEventBlogCurationForm, EVENT_PICK_TARGET_AUDIENCE_OPTIONS } from '@/lib/admin/use-event-blog-curation-form';
import { BlogReferenceViewer } from '@/components/admin/blog-reference-viewer';
import {
  AGE_HINT_KEYWORDS,
  KID_APPEAL_HINT_KEYWORDS,
  PRICE_AMOUNT_PATTERN,
  PRICE_HINT_KEYWORDS,
} from '@/lib/admin/curation-badges';

// [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, implementation/todo.md
// 개선사항7-2): "관리자 화면 Events 탭 개별 이벤트 항목의 상세 팝업 내부에 블로그
// 큐레이션 버튼을 추가... 등록·수정·삭제할 수 있는 관리 UI". open_spaces의
// BlogCurationModal(Decision 021)과 검색/본문 뷰어(BlogReferenceViewer)는 그대로
// 재사용하되(제5장 제4조), 뱃지/노출 중분류 같은 스팟 전용 폼 없이 "검색 결과 중
// 체크박스로 최대 3개 선택 → 저장"만 한다.
//
// [블로그 하이라이팅](2026-09-11 사용자 지시): "블로그 1,2,3에서 가격이나 연령과
// 관련된 단어들을.. 아이/분수/빛/불꽃 등 아이들이 좋아할만한 단어·문구도.." —
// curationCategoryId를 넘기지 않아 BlogReferenceViewer가 카테고리 뱃지 키워드 없이
// 이 키워드/패턴만으로 하이라이트한다(highlightKeywordsOnly).
const EVENT_HIGHLIGHT_KEYWORDS = [...AGE_HINT_KEYWORDS, ...PRICE_HINT_KEYWORDS, ...KID_APPEAL_HINT_KEYWORDS];
const EVENT_HIGHLIGHT_PATTERNS = [PRICE_AMOUNT_PATTERN];
export function EventBlogCurationModal({
  event,
  onClose,
  onSaved,
}: {
  event: { id: string; title: string; sigunguName?: string | null };
  onClose: () => void;
  onSaved?: (eventId: string, urls: string[]) => void;
}) {
  const form = useEventBlogCurationForm(event);
  const [autoFillNotice, setAutoFillNotice] = useState<string | null>(null);

  async function handleSave() {
    const ok = await form.save();
    if (!ok) return;
    onSaved?.(event.id, form.selectedUrls);
    onClose();
  }

  function handleAutoFillPrice() {
    const { found } = form.autoFillPriceFromActiveBlog();
    if (!found) setAutoFillNotice('이 블로그에서 가격을 찾지 못했어요 — 직접 입력해주세요.');
    else setAutoFillNotice(null);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center">
      <div className="w-full md:w-[560px] max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">🔍 블로그 큐레이션</h2>
            <p className="text-xs text-gray-500">{event.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <BlogReferenceViewer
          searchQuery={form.searchQuery}
          onSearchQueryChange={form.setSearchQuery}
          onSearch={form.runSearch}
          isSearching={form.isSearching}
          searchError={form.searchError}
          blogItems={form.blogItems}
          hasRecentReview={form.hasRecentReview}
          hasNoResults={form.hasNoResults}
          activeTab={form.activeTab}
          onActiveTabChange={form.setActiveTab}
          activeBody={form.activeBody}
          onOverrideUrl={form.overrideActiveUrl}
          sortOption={form.sortOption}
          onSortOptionChange={form.setSortOption}
          extraHighlightKeywords={EVENT_HIGHLIGHT_KEYWORDS}
          extraHighlightPatterns={EVENT_HIGHLIGHT_PATTERNS}
        />

        {/* [체크박스로 후보 선택](요구사항 원문 "블로그 후보 3개 중 체크"): 검색
            결과가 있으면 각 후보 옆에 체크박스를 둔다 — 유저 화면에 노출될 최종
            방문 후기/추천 블로그 목록이 된다(최대 3개). */}
        {form.blogItems && form.blogItems.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-500">유저 화면에 노출할 블로그 선택 (최대 3개)</p>
            {form.blogItems.map((item, i) => {
              const checked = form.selectedUrls.includes(item.link);
              return (
                <label key={`${item.link}-${i}`} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && form.selectedUrls.length >= 3}
                    onChange={() => form.toggleUrl(item.link)}
                  />
                  <span className="truncate">블로그 {i + 1} · {item.title}</span>
                </label>
              );
            })}
            {form.selectedUrls.length >= 3 && (
              <p className="text-[11px] text-gray-400">최대 3개까지 선택할 수 있어요.</p>
            )}
          </div>
        )}

        {/* [블로그 검수 결과 반영 — 가격](2026-09-11 사용자 지시): "기껏 블로그에서
            가격 찾았는데.. 어디다 반영을 못하네.. 블로그글 복붙하면 파싱할 수
            있는거라든지.. 적을 수 있는거 줘야지" — 자유 텍스트 입력란 + 현재 보고
            있는 블로그에서 자동으로 찾아 채우는 버튼. 자동 채우기는 보조 수단일
            뿐, 관리자가 직접 쓰거나 고쳐 쓸 수 있다(추측 결과를 강제하지 않음). */}
        <div className="rounded-xl border border-gray-200 p-3 flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-500" htmlFor="event-price-text">
            가격 정보(무료면 비워두거나 &quot;무료&quot;라고 적어주세요)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="event-price-text"
              type="text"
              value={form.priceText}
              onChange={(e) => {
                form.setPriceText(e.target.value);
                setAutoFillNotice(null);
              }}
              placeholder="예: 성인 15,000원 어린이 10,000원"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={handleAutoFillPrice}
              disabled={!form.blogItems || form.blogItems.length === 0}
              className="shrink-0 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              🔍 현재 블로그에서 자동 채우기
            </button>
          </div>
          {autoFillNotice && <p className="text-[11px] text-amber-600">{autoFillNotice}</p>}
        </div>

        {/* [타겟 연령 체크](2026-09-11 사용자 지시): "타겟 연령, INFANT(영유아) /
            KIDS_PRE(미취학) / KIDS_SCHOOL(취학아동) / FAMILY(가족) 혹은 타겟 연령
            선택 체크할 수 있도록 해줘" — 이벤트픽 노출 4대 조건과 동일한 목록.
            단일 선택(하나의 컬럼)이라 이미 선택된 것을 다시 누르면 미선택으로
            되돌아간다. */}
        <div className="rounded-xl border border-gray-200 p-3 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-gray-500">타겟 연령 (이벤트픽 노출 조건)</p>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_PICK_TARGET_AUDIENCE_OPTIONS.map((opt) => {
              const isActive = form.targetAudience === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => form.toggleTargetAudience(opt.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {form.saveError && <p className="text-xs text-red-600">{form.saveError}</p>}

        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={form.isSaving || form.isLoadingExisting}
            className="flex-1 rounded-full bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
          >
            {form.isSaving ? '저장 중...' : '저장 및 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
