'use client';

import { useEffect, useState } from 'react';
import { parseMenuText, parseOperatingHoursText, ParsedMenuItem } from '@/lib/admin/spot-curation-parsers';
import { CORE_SPOT_CATEGORIES } from '@/lib/spaces/spot-category-groups';

// [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
// 섹션 2: 관리자 전용 "스팟 큐레이션" 탭. curated_items(제휴 상품, booking_url 외부 링크
// 중심)와는 데이터 모양·목적이 달라 자기완결적인 별도 패널로 분리했다(CuratedItemsPanel과
// 동일한 근거 — 제5장 제4조 기존 구조 우선의 취지는 "다른 목적을 억지로 통합"이 아님).
// 관리자 페이지 성능 최적화(섹션 3)와 동일하게 마운트 시 자동 조회하지 않는다.
type SpotCurationItem = {
  id: string;
  spot_id: string;
  is_active: boolean;
  image_url: string | null;
  operating_hours_raw: string | null;
  open_time: string | null;
  close_time: string | null;
  break_start: string | null;
  break_end: string | null;
  last_order: string | null;
  menu_items: ParsedMenuItem[];
  naver_booking_url: string | null;
  curation_note: string | null;
  created_at: string;
  updated_at: string;
  open_spaces: { name: string; address: string | null; category: string } | null;
};

type SpotSearchResult = { id: string; name: string; address: string | null };

const PAGE_SIZE = 20;

// [관리자 '스팟 큐레이션' 탭 장소 검색 자동완성](2026-09-01 사용자 지시): 스팟 큐레이션은
// 애초에 "키즈친화 식당"(gg-kidscafe-adapter.mjs가 적재하는 category_min='놀이방식당')을
// 위해 설계된 기능이라, 검색 대상을 이 중분류로 좁힌다. 하드코딩된 문자열을 새로 만들지
// 않고 CORE_SPOT_CATEGORIES(/nearby 필터 칩과 동일한 단일 출처)에서 찾아 쓴다.
const KIDS_RESTAURANT_CATEGORY_MIN = CORE_SPOT_CATEGORIES.find((c) => c.id === 'kids-restaurant')?.minors[0];
const SPOT_SEARCH_MIN_LENGTH = 2;

// 요구사항 "[장소명 + 주소(동/읍/면)]": 도로명 주소 끝에 "...(가능동)"처럼 법정동/읍/면이
// 괄호로 붙어 있으면 그 부분만 짧게 뽑아 보여준다(실측 확인: 이 표기가 실제 데이터의
// 표준 형태). 괄호 표기가 없는 주소는 완벽히 파싱할 근거가 없어(추측 금지) 시/군/구까지만
// 간략히 보여주는 것으로 안전하게 폴백한다.
function formatShortAddress(address: string | null): string {
  if (!address) return '';
  const dongMatch = address.match(/\(([^)]*[동읍면])\)/);
  if (dongMatch) return dongMatch[1];
  return address.split(' ').filter(Boolean).slice(0, 3).join(' ');
}

function ToggleSwitch({ checked, onToggle, disabled }: { checked: boolean; onToggle: () => void; disabled?: boolean }) {
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

// 폼 하나(신규 등록/기존 편집 겸용)를 담당하는 하위 컴포넌트 — 목록과 분리해 상태를
// 단순하게 유지한다.
function CurationFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: SpotCurationItem;
  onClose: () => void;
  onSaved: (item: SpotCurationItem) => void;
}) {
  const isEdit = Boolean(initial);
  const [selectedSpot, setSelectedSpot] = useState<SpotSearchResult | null>(
    initial?.open_spaces ? { id: initial.spot_id, name: initial.open_spaces.name, address: initial.open_spaces.address } : null
  );
  const [spotQuery, setSpotQuery] = useState('');
  const [spotResults, setSpotResults] = useState<SpotSearchResult[]>([]);
  const [isSearchingSpot, setIsSearchingSpot] = useState(false);

  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [hoursRaw, setHoursRaw] = useState(initial?.operating_hours_raw ?? '');
  const [openTime, setOpenTime] = useState(initial?.open_time ?? '');
  const [closeTime, setCloseTime] = useState(initial?.close_time ?? '');
  const [breakStart, setBreakStart] = useState(initial?.break_start ?? '');
  const [breakEnd, setBreakEnd] = useState(initial?.break_end ?? '');
  const [lastOrder, setLastOrder] = useState(initial?.last_order ?? '');
  const [menuRaw, setMenuRaw] = useState('');
  const [menuItems, setMenuItems] = useState<ParsedMenuItem[]>(initial?.menu_items ?? []);
  const [naverBookingUrl, setNaverBookingUrl] = useState(initial?.naver_booking_url ?? '');
  const [curationNote, setCurationNote] = useState(initial?.curation_note ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // [관리자 '스팟 큐레이션' 탭 장소 검색 자동완성](2026-09-01 사용자 지시): 이미 구축된
  // 전국구 서버사이드 검색(/api/spots/search)을 그대로 재사용하되(제5장 제4조 기존
  // 구조 우선 — 새 검색 엔드포인트를 또 만들지 않음), 이 탭은 "키즈친화 식당"
  // (category_min='놀이방식당') 전용이라 그 범위로 좁히고, 2글자 미만은 조회하지
  // 않는다(1,700여 건 중 1글자로는 결과가 너무 많아 자동완성 의미가 없음).
  useEffect(() => {
    // [실사용 버그 제보](2026-09-02) 재확인: 스팟을 이미 선택한 뒤에는 재검색할 필요가
    // 없다 — 이전에는 이 가드가 없어 선택 직후 spotQuery가 선택된 이름으로 바뀌면서
    // 불필요한 재검색이 한 번 더 나갔다(결과는 화면에 안 보이게만 막아뒀을 뿐 API 호출
    // 자체는 낭비됐음).
    if (isEdit || selectedSpot) return;
    const trimmed = spotQuery.trim();
    if (trimmed.length < SPOT_SEARCH_MIN_LENGTH) {
      setSpotResults([]);
      return;
    }
    let cancelled = false;
    // AbortController로 새 검색이 시작되면 이전 요청 자체를 확실히 취소해 느린 응답이
    // 뒤섞여 보일 가능성을 막는다(방어적 강화).
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setIsSearchingSpot(true);
      const params = new URLSearchParams({ q: trimmed });
      if (KIDS_RESTAURANT_CATEGORY_MIN) params.set('category_min', KIDS_RESTAURANT_CATEGORY_MIN);
      fetch(`/api/spots/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { items?: Array<{ id: string; name: string; address: string | null }> }) => {
          if (cancelled) return;
          setSpotResults((data.items ?? []).slice(0, 10).map((i) => ({ id: i.id, name: i.name, address: i.address })));
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return; // 새 검색으로 대체된 정상적인 취소
        })
        .finally(() => {
          if (!cancelled) setIsSearchingSpot(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [spotQuery, isEdit, selectedSpot]);

  async function handlePasteImage(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    setIsUploadingImage(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/spot-curations/upload-image', { method: 'POST', body: formData });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? '이미지 업로드에 실패했습니다.');
      setImageUrl(data.url);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setIsUploadingImage(false);
    }
  }

  function handleParseHours() {
    const parsed = parseOperatingHoursText(hoursRaw);
    setOpenTime(parsed.openTime ?? '');
    setCloseTime(parsed.closeTime ?? '');
    setBreakStart(parsed.breakStart ?? '');
    setBreakEnd(parsed.breakEnd ?? '');
    setLastOrder(parsed.lastOrder ?? '');
  }

  function handleParseMenu() {
    setMenuItems(parseMenuText(menuRaw));
  }

  function handleRemoveMenuItem(index: number) {
    setMenuItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (!isEdit && !selectedSpot) {
      setErrorMessage('먼저 스팟을 검색해서 선택해 주세요.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const payload = {
        spot_id: isEdit ? initial!.spot_id : selectedSpot!.id,
        is_active: isActive,
        image_url: imageUrl.trim() || null,
        operating_hours_raw: hoursRaw || null,
        open_time: openTime || null,
        close_time: closeTime || null,
        break_start: breakStart || null,
        break_end: breakEnd || null,
        last_order: lastOrder || null,
        menu_items: menuItems,
        naver_booking_url: naverBookingUrl.trim() || null,
        curation_note: curationNote || null,
      };
      const res = isEdit
        ? await fetch('/api/admin/spot-curations', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: initial!.id, ...payload }),
          })
        : await fetch('/api/admin/spot-curations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data: { item?: SpotCurationItem; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '저장에 실패했습니다.');

      onSaved(data.item);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  // [실사용 버그 제보](2026-09-02) "영역을 벗어날 경우(실수로) 팝업이 닫힘 — 등록하거나
  // 닫기 버튼 눌렀을 때만 닫히도록": 이 모달은 텍스트 붙여넣기/이미지 업로드/자동 파싱
  // 등 입력량이 많은 등록 폼이라, 다른 가벼운 브라우즈용 바텀시트(AiRecommendSheet 등,
  // 배경 클릭으로 닫히는 기존 관례)와 달리 실수로 배경을 클릭했을 때 작성 중이던 내용을
  // 통째로 잃는 리스크가 훨씬 크다 — 배경 클릭으로는 닫히지 않게 하고, ✕ 버튼과 저장
  // 성공(handleSubmit의 onClose() 호출) 두 경로로만 닫히게 한다.
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center">
      <div className="w-full md:w-[520px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">{isEdit ? '스팟 큐레이션 수정' : '+ 스팟 큐레이션 등록'}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isEdit ? (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <p className="font-medium text-gray-900">{initial!.open_spaces?.name}</p>
              <p className="text-xs text-gray-500">{initial!.open_spaces?.address}</p>
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">스팟 검색(키즈친화 식당 · 2글자 이상)</span>
              {/* [실사용 버그 재제보](2026-09-02) "검색결과를 눌렀을 때 입력칸에 그 데이터가
                  들어가야 하는데 안 들어간다": 이전에는 선택 시 입력란 자체를 완전히
                  다른 요약 카드로 바꿔버려 "이름이 입력칸에 들어갔다"는 기대와 어긋났다
                  — 이제는 입력란을 그대로 유지하고, 선택되면 그 입력란의 값 자체를
                  선택한 이름으로 채운다(요청 원문의 "하노 입력 → 하노이진영 검색됨 →
                  클릭 → 입력칸에 하노이진영" 흐름 그대로). 다시 수정하고 싶으면 그
                  입력란을 직접 편집하면 되므로 별도 "읽기 전용" 처리는 하지 않는다. */}
              <input
                type="text"
                value={selectedSpot ? selectedSpot.name : spotQuery}
                onChange={(e) => {
                  if (selectedSpot) setSelectedSpot(null); // 직접 수정하면 선택을 해제하고 다시 검색한다.
                  setSpotQuery(e.target.value);
                }}
                placeholder="장소명 2글자 이상 입력(예: 키즈)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {selectedSpot && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500 truncate">✅ {formatShortAddress(selectedSpot.address)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSpot(null);
                      setSpotQuery('');
                    }}
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                  >
                    변경
                  </button>
                </div>
              )}
              {/* [실사용 버그 제보](2026-09-02): 검색이 콜드 스타트 시 수 초까지도
                  걸릴 수 있는데(라이브 실측 확인), 회색 잔글씨 안내만으로는 "아직
                  찾는 중"임이 잘 눈에 띄지 않아 결과가 없다고 오해하기 쉬웠다 —
                  파란색 강조로 눈에 띄게 한다. */}
              {!selectedSpot && isSearchingSpot && (
                <p className="text-xs font-medium text-blue-600">🔍 검색 중이에요, 잠시만 기다려주세요...</p>
              )}
              {!selectedSpot && spotResults.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {spotResults.map((spot) => (
                    <li key={spot.id}>
                      <button
                        type="button"
                        // [실사용 버그 재제보](2026-09-02) "선택했지만 아무 반응 없었음":
                        // 스크롤 가능한 목록(overflow-y-auto)에서는 클릭 도중 마우스가
                        // 미세하게 움직이면(트랙패드 등) 브라우저가 이를 "드래그"로 판단해
                        // click 이벤트 자체를 발생시키지 않을 수 있다 — mousedown은
                        // 드래그 여부와 무관하게 버튼을 누르는 즉시 발생해 이 문제를
                        // 피한다(자동완성 위젯들이 흔히 쓰는 방식). preventDefault로
                        // 입력란의 포커스가 흔들리는 것도 막는다.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedSpot(spot);
                          setSpotQuery(spot.name);
                          setSpotResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        <p className="font-medium text-gray-900">{spot.name}</p>
                        <p className="text-xs text-gray-500">{formatShortAddress(spot.address)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="font-medium text-gray-700">노출 활성화(is_active)</span>
          </label>

          {/* 요구사항 "클립보드 이미지 Ctrl+V 바로 업로드": 이 영역에 포커스하고 이미지를
              복사한 상태에서 Ctrl+V 하면 클립보드 이미지를 즉시 가로채 업로드한다. */}
          {/* [실사용 버그 제보](2026-09-02) "누르라는곳을 클릭하고 있는상태에서 ctrl+V해야
              붙여넣기가 됨" — 근본 원인 확정: 이 구역 전체가 하나의 `<label>`로 감싸져
              있었고, 그 안에 실제 폼 컨트롤이 "붙여넣기 대상 div"와 "URL 직접 입력
              input" 두 개나 들어 있었다. HTML의 `<label>`은 클릭하면 그 안의 연관된
              폼 컨트롤로 브라우저가 자동으로 포커스를 옮기는 내장 동작이 있는데, 이
              동작이 내가 div에 직접 호출한 `.focus()`보다 우선해 URL input으로 포커스를
              가로채고 있었다(Playwright로 직접 확인: 클릭 후 document.activeElement가
              항상 그 input이었음) — 그래서 "클릭하고 있는 상태에서"(포커스가 계속
              input에 있는 채로) Ctrl+V해야만 지금까지는 어쩌다 되던 것이다. `<label>`을
              평범한 `<div>`로 바꿔 이 자동 포커스 위임 자체를 없앴다.
              */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">대표 이미지</span>
            <div
              tabIndex={0}
              onClick={(e) => e.currentTarget.focus()}
              onPaste={handlePasteImage}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
              ) : (
                <span>여기를 클릭한 뒤(테두리가 파랗게 바뀌는지 확인) 이미지를 복사해 Ctrl+V로 붙여넣으세요</span>
              )}
              {isUploadingImage && <span className="text-blue-600">업로드 중...</span>}
            </div>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="또는 이미지 URL 직접 입력"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 요구사항 "스마트 텍스트 파서(영업시간)" */}
          {/* [실사용 버그 제보](2026-09-02) "화면이 좀 작다해야하나? 잘붙여넣는지 확인어렵네":
              2줄짜리 textarea에 여러 줄을 붙여넣으면 스크롤 없이는 전체를 확인할 수 없었다
              — 기본 노출 줄 수를 늘리고(rows), 필요하면 직접 더 늘려볼 수 있게
              resize-y를 허용한다. */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">영업시간(텍스트 붙여넣기)</span>
            <textarea
              value={hoursRaw}
              onChange={(e) => setHoursRaw(e.target.value)}
              placeholder={'예: 매일\n11:00 - 21:00\n15:00 - 17:00 브레이크타임\n20:30 라스트오더'}
              rows={5}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleParseHours}
              className="self-start rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 hover:bg-gray-700"
            >
              ⚡ 자동 파싱
            </button>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <input
                type="text"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                placeholder="오픈(예: 10:00)"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                placeholder="마감(예: 22:00)"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                value={breakStart}
                onChange={(e) => setBreakStart(e.target.value)}
                placeholder="브레이크 시작"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                value={breakEnd}
                onChange={(e) => setBreakEnd(e.target.value)}
                placeholder="브레이크 종료"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              />
              <input
                type="text"
                value={lastOrder}
                onChange={(e) => setLastOrder(e.target.value)}
                placeholder="라스트오더"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs col-span-2"
              />
            </div>
          </div>

          {/* 요구사항 "스마트 텍스트 파서(메뉴)" */}
          {/* [실사용 버그 제보](2026-09-02) "메뉴도 이런식으로 긁어와서 복붙하는데 제대로
              파싱안되고": "이름" / (빈 줄) / "가격만 있는 줄" / (빈 줄) / "설명" 반복 형식
              (배달앱/홈페이지 메뉴판을 그대로 긁어온 형태)을 파서가 지원하도록 고쳤다 —
              라벨/플레이스홀더에도 두 형식 모두 안내한다. */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">
              메뉴 — "이름 가격원" 한 줄씩, 또는 이름/가격/설명이 줄바꿈으로 나뉜 형식도 지원
            </span>
            <textarea
              value={menuRaw}
              onChange={(e) => setMenuRaw(e.target.value)}
              placeholder={'짜장면 7,000원\n짬뽕 9,000원\n\n또는\n\n하노이 쌀국수\n\n12,000원\n\n(설명은 무시됩니다)'}
              rows={8}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleParseMenu}
              className="self-start rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 hover:bg-gray-700"
            >
              ⚡ 자동 파싱
            </button>
            {menuItems.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1">
                {menuItems.map((item, i) => (
                  <li key={`${item.name}-${i}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                    <span>
                      {item.name} · {item.price.toLocaleString()}원
                    </span>
                    <button type="button" onClick={() => handleRemoveMenuItem(i)} className="text-gray-400 hover:text-red-500">
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* [예약 및 링크 폴백 체인](2026-09-01 사용자 지시) 3순위: 공공예약/원본 링크가
              없는 민간 스팟인데 실제로 네이버 예약이 연동돼 있음을 관리자가 직접 확인한
              경우에만 입력한다 — 확인 없이 임의로 채우지 않는다. */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">네이버 예약 링크(선택 — 실제 연동 확인된 경우만)</span>
            <input
              type="text"
              value={naverBookingUrl}
              onChange={(e) => setNaverBookingUrl(e.target.value)}
              placeholder="https://booking.naver.com/..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">큐레이션 메모(선택)</span>
            <input
              type="text"
              value={curationNote}
              onChange={(e) => setCurationNote(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isSaving}
            className="mt-2 rounded-lg bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '저장 중...' : isEdit ? '수정 저장' : '등록하기'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function SpotCurationsPanel() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SpotCurationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'create' | SpotCurationItem | null>(null);
  // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시): 다른 탭과 동일하게 마운트 시
  // 자동 조회하지 않는다.
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  useEffect(() => {
    if (!hasLoaded) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));

    fetch(`/api/admin/spot-curations?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '조회에 실패했습니다.');
        return json as { items: SpotCurationItem[]; total: number };
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
  }, [hasLoaded, debouncedQ, page]);

  async function handleToggle(row: SpotCurationItem) {
    setTogglingId(row.id);
    const nextIsActive = !row.is_active;
    try {
      const res = await fetch('/api/admin/spot-curations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, is_active: nextIsActive }),
      });
      const data: { item?: SpotCurationItem; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '노출 상태 변경에 실패했습니다.');
      setRows((prev) => prev.map((r) => (r.id === row.id ? data.item! : r)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '노출 상태 변경에 실패했습니다.');
    } finally {
      setTogglingId(null);
    }
  }

  function handleSaved(item: SpotCurationItem) {
    setRows((prev) => {
      const exists = prev.some((r) => r.id === item.id);
      return exists ? prev.map((r) => (r.id === item.id ? item : r)) : [item, ...prev];
    });
    setTotal((prev) => (prev === 0 || rows.some((r) => r.id === item.id) ? prev : prev + 1));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="스팟 이름/주소 검색"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => setModalMode('create')}
            className="shrink-0 text-xs font-semibold text-white bg-blue-600 rounded-full px-3 py-1.5 hover:bg-blue-700"
          >
            + 스팟 큐레이션 등록
          </button>
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
          <p className="text-sm text-gray-400">등록된 스팟 큐레이션이 없습니다.</p>
        )}

        {hasLoaded && !isLoading && !errorMessage && rows.length > 0 && (
          <ul className="flex flex-col divide-y divide-gray-100">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                {row.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center text-lg">🏷️</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{row.open_spaces?.name}</p>
                  <p className="text-xs text-gray-500 truncate">{row.open_spaces?.address}</p>
                  {row.menu_items.length > 0 && (
                    <p className="text-xs text-gray-400">메뉴 {row.menu_items.length}건</p>
                  )}
                </div>
                <ToggleSwitch checked={row.is_active} onToggle={() => handleToggle(row)} disabled={togglingId === row.id} />
                <button type="button" onClick={() => setModalMode(row)} className="text-xs text-blue-600 hover:underline">
                  수정
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasLoaded && total > PAGE_SIZE && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-100 p-3">
          <span className="text-xs text-gray-500">
            총 {total}건 · {page} / {totalPages} 페이지
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {modalMode && (
        <CurationFormModal
          initial={modalMode === 'create' ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
