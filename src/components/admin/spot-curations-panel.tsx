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

// [todo.md 개선사항 9](2026-09-03) 실측으로 발견: 후보 목록 조회를 재사용하는
// /api/admin/data-grid는 page_size를 50/100/200 중 하나로만 받고(그 외 값은 조용히
// 기본값 50으로 대체) 다른 값은 무시한다 — 클라이언트가 20을 요청해도 서버는 50건씩
// 내려줘 페이지 수 계산이 서버 실제 동작과 어긋나는 버그가 될 뻔했다. 서버가 실제로
// 허용하는 값 중 하나로 맞춘다.
const PAGE_SIZE = 50;

// [관리자 '스팟 큐레이션' 탭 대상 범위](2026-09-01 사용자 지시): 스팟 큐레이션은
// 애초에 "키즈친화 식당"(gg-kidscafe-adapter.mjs가 적재하는 category_min='놀이방식당')을
// 위해 설계된 기능이라, 후보 목록을 이 중분류로 좁힌다. 하드코딩된 문자열을 새로 만들지
// 않고 CORE_SPOT_CATEGORIES(/nearby 필터 칩과 동일한 단일 출처)에서 찾아 쓴다.
const KIDS_RESTAURANT_CATEGORY_MIN = CORE_SPOT_CATEGORIES.find((c) => c.id === 'kids-restaurant')?.minors[0];

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

// [todo.md 개선사항 9](2026-09-03): 리스트에서 클릭해 들어온 경우(신규든 기존 편집이든)
// 스팟은 항상 이미 정해져 있다 — 모달 내부에서 검색할 일이 없다. isEdit이면
// initial.open_spaces에서, 신규면 presetSpot에서 이름/주소를 읽는다.
function BoundSpotSummary({ name, address }: { name: string; address: string | null }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
      <p className="font-medium text-gray-900">{name}</p>
      <p className="text-xs text-gray-500">{formatShortAddress(address)}</p>
    </div>
  );
}

// 폼 하나(신규 등록/기존 편집 겸용)를 담당하는 하위 컴포넌트 — 목록과 분리해 상태를
// 단순하게 유지한다.
// [todo.md 개선사항 9](2026-09-03): 기존에는 신규 등록 시 이 모달 안에서 2글자 이상
// 타이핑해 스팟을 직접 검색해야 했다("하노 입력 → 검색됨 → 클릭") — 이제는 부모
// (SpotCurationsPanel)가 먼저 키즈친화 식당 전체 목록을 리스트로 보여주고, 관리자가
// 그 리스트에서 항목을 클릭하면 이미 스팟이 정해진 채로(`presetSpot`) 이 모달이 열린다.
// 그래서 모달 자체의 검색 UI(spotQuery/spotResults/자동완성 useEffect 전체)를 들어냈다 —
// 요구사항 원문 "모달 내부는 메뉴/시간 정보만 입력"을 그대로 구현한 것.
function CurationFormModal({
  initial,
  presetSpot,
  onClose,
  onSaved,
}: {
  initial?: SpotCurationItem;
  presetSpot?: SpotSearchResult;
  onClose: () => void;
  onSaved: (item: SpotCurationItem) => void;
}) {
  const isEdit = Boolean(initial);
  const spotId = isEdit ? initial!.spot_id : presetSpot!.id;
  const spotDisplay = isEdit
    ? { name: initial!.open_spaces?.name ?? '(이름 없음)', address: initial!.open_spaces?.address ?? null }
    : { name: presetSpot!.name, address: presetSpot!.address };

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

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const payload = {
        spot_id: spotId,
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
          <BoundSpotSummary name={spotDisplay.name} address={spotDisplay.address} />

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

// [todo.md 개선사항 9](2026-09-03): 후보 목록 조회에 재사용하는 기존 어드민 그리드
// 응답 행 모양 — /api/admin/data-grid?table=open_spaces가 내려주는 실제 컬럼 중 이
// 리스트가 필요로 하는 것만 뽑아 쓴다(전체 AdminOpenSpaceRow 타입을 그대로 끌어오면
// 이 파일이 data-grid-client.tsx의 세부 구현에 과하게 결합된다).
type CandidateSpotRow = { id: string; name: string; address: string };

// 모달을 "기존 큐레이션 수정" 또는 "리스트에서 고른 신규 스팟으로 등록" 중 하나로 연다.
// 자유 검색으로 등록하는 경로는 더 이상 없다 — 리스트의 검색창이 그 역할을 대신한다.
type ModalTarget = SpotCurationItem | { presetSpot: SpotSearchResult } | null;

export function SpotCurationsPanel() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CandidateSpotRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [modalTarget, setModalTarget] = useState<ModalTarget>(null);
  // [todo.md 개선사항 9](2026-09-03): spot_id → 이미 등록된 큐레이션 조회용 맵. 큐레이션
  // 전체 건수(1,700여 건 후보 중 실제 큐레이션은 그보다 훨씬 적을 것으로 예상)는
  // 한 번에 불러와도 무리가 없어(관리자 전용, 페이지당이 아니라 전체 1회 조회) 이미 있는
  // `/api/admin/spot-curations` 목록 API를 page_size만 크게 줘서 그대로 재사용한다
  // (제5장 제4조 기존 구조 우선 — 배치 조회용 새 API를 따로 만들지 않음).
  const [curationsBySpotId, setCurationsBySpotId] = useState<Map<string, SpotCurationItem>>(new Map());
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

  // [todo.md 개선사항 9](2026-09-03): "불러오기"를 누른 최초 한 번만 전체 큐레이션 맵을
  // 채운다 — 이후 등록/수정은 handleSaved가 맵을 직접 갱신하므로 재조회가 필요 없다.
  useEffect(() => {
    if (!hasLoaded) return;
    let cancelled = false;
    fetch('/api/admin/spot-curations?page_size=5000')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '큐레이션 현황 조회에 실패했습니다.');
        return json as { items: SpotCurationItem[] };
      })
      .then((result) => {
        if (cancelled) return;
        setCurationsBySpotId(new Map(result.items.map((item) => [item.spot_id, item])));
      })
      .catch(() => {
        // 큐레이션 현황(뱃지/토글) 조회 실패해도 후보 목록 자체는 그대로 쓸 수 있어야
        // 하므로 화면을 막지 않는다(제5장 제11조 오류 처리 원칙) — 이 경우 모든 후보가
        // "미등록"으로만 보이고, 클릭하면 항상 신규 등록 모달이 열린다.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoaded]);

  // [todo.md 개선사항 9](2026-09-03): 키즈친화 식당(category_min='놀이방식당') 후보를
  // 리스트로 먼저 보여준다 — 기존 관리자 그리드 API(/api/admin/data-grid)를 그대로
  // 재사용해(제5장 제4조) 검색/페이지네이션을 새로 만들지 않는다.
  useEffect(() => {
    if (!hasLoaded || !KIDS_RESTAURANT_CATEGORY_MIN) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    params.set('table', 'open_spaces');
    params.set('category_min', KIDS_RESTAURANT_CATEGORY_MIN);
    if (debouncedQ) params.set('q', debouncedQ);
    params.set('page', String(page));
    params.set('page_size', String(PAGE_SIZE));

    fetch(`/api/admin/data-grid?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '조회에 실패했습니다.');
        return json as { rows: CandidateSpotRow[]; total: number };
      })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
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

  async function handleToggle(curation: SpotCurationItem) {
    setTogglingId(curation.id);
    const nextIsActive = !curation.is_active;
    try {
      const res = await fetch('/api/admin/spot-curations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: curation.id, is_active: nextIsActive }),
      });
      const data: { item?: SpotCurationItem; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '노출 상태 변경에 실패했습니다.');
      setCurationsBySpotId((prev) => new Map(prev).set(data.item!.spot_id, data.item!));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '노출 상태 변경에 실패했습니다.');
    } finally {
      setTogglingId(null);
    }
  }

  function handleSaved(item: SpotCurationItem) {
    setCurationsBySpotId((prev) => new Map(prev).set(item.spot_id, item));
  }

  function handleRowClick(spot: CandidateSpotRow) {
    const existing = curationsBySpotId.get(spot.id);
    setModalTarget(existing ?? { presetSpot: { id: spot.id, name: spot.name, address: spot.address } });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const modalInitial = modalTarget && 'id' in modalTarget ? modalTarget : undefined;
  const modalPresetSpot = modalTarget && 'presetSpot' in modalTarget ? modalTarget.presetSpot : undefined;

  return (
    // [관리자 대시보드 모바일 레이아웃/스크롤 버그 긴급 수정](2026-09-05 사용자
    // 지시): data-grid-client.tsx 루트와 동일한 이유로 min-h-0 추가.
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        {/* [todo.md 개선사항 9](2026-09-03): "등록" 버튼(자유 검색)을 없애고, 이 검색창은
            이제 아래 후보 리스트 자체를 좁히는 용도다 — 원하는 식당을 찾아 바로 클릭하면
            그게 곧 등록/수정 진입이다. */}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="키즈친화 식당 이름/주소 검색"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {!hasLoaded && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-gray-500">키즈친화 식당 목록을 불러와 주세요.</p>
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
          <p className="text-sm text-gray-400">조건에 맞는 키즈친화 식당이 없습니다.</p>
        )}

        {hasLoaded && !isLoading && !errorMessage && rows.length > 0 && (
          <ul className="flex flex-col divide-y divide-gray-100">
            {rows.map((spot) => {
              const curation = curationsBySpotId.get(spot.id);
              return (
                <li key={spot.id} className="flex items-center gap-3 py-3">
                  <button type="button" onClick={() => handleRowClick(spot)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                    {curation?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={curation.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center text-lg">🍽️</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {curation ? (
                          <span className="mr-1.5 inline-block align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            큐레이션됨
                          </span>
                        ) : (
                          <span className="mr-1.5 inline-block align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            미등록
                          </span>
                        )}
                        <span>{spot.name}</span>
                      </p>
                      <p className="text-xs text-gray-500 truncate">{formatShortAddress(spot.address)}</p>
                      {curation && curation.menu_items.length > 0 && (
                        <p className="text-xs text-gray-400">메뉴 {curation.menu_items.length}건</p>
                      )}
                    </div>
                  </button>
                  {curation && (
                    <ToggleSwitch checked={curation.is_active} onToggle={() => handleToggle(curation)} disabled={togglingId === curation.id} />
                  )}
                </li>
              );
            })}
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

      {modalTarget && (
        <CurationFormModal
          initial={modalInitial}
          presetSpot={modalPresetSpot}
          onClose={() => setModalTarget(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
