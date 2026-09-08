'use client';

import { ParsedMenuItem } from '@/lib/admin/spot-curation-parsers';

// [키즈카페/실내놀이터 팝업 기본 입력 필드](2026-09-08 사용자 지시, todo.md
// 개선사항1): "관리자 워크벤치 내에 [키즈카페 / 실내놀이터] 카테고리를 위한
// 스팟 큐레이션 팝업 UI... 기존 '키즈친화 식당' 팝업의 컴포넌트 구조를 베이스로
// 재사용" — SpotCurationsPanel(식당 팝업)의 대표 이미지/영업시간/메뉴 UI
// 패턴을 그대로 가져오고(제5장 제4조 기존 구조 우선), 신규 요구사항인 가격/
// 입장료 스마트 파싱만 추가한 컴포넌트다. 호출부(BlogCurationModal/
// MobileCurationWorkbench)가 curationCategoryId === 'kids_cafe'일 때만
// 렌더링해 "키즈카페 카테고리를 위한" 범위를 지킨다.
export function KidsCafeDetailsForm({
  imageUrl,
  onImageUrlChange,
  isUploadingImage,
  onPasteImage,
  hoursRaw,
  onHoursRawChange,
  openTime,
  onOpenTimeChange,
  closeTime,
  onCloseTimeChange,
  breakStart,
  onBreakStartChange,
  breakEnd,
  onBreakEndChange,
  lastOrder,
  onLastOrderChange,
  onParseHours,
  feeRaw,
  onFeeRawChange,
  childFee,
  onChildFeeChange,
  guardianFee,
  onGuardianFeeChange,
  onParseFee,
  menuRaw,
  onMenuRawChange,
  menuItems,
  onParseMenu,
  onRemoveMenuItem,
}: {
  imageUrl: string;
  onImageUrlChange: (value: string) => void;
  isUploadingImage: boolean;
  onPasteImage: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  hoursRaw: string;
  onHoursRawChange: (value: string) => void;
  openTime: string;
  onOpenTimeChange: (value: string) => void;
  closeTime: string;
  onCloseTimeChange: (value: string) => void;
  breakStart: string;
  onBreakStartChange: (value: string) => void;
  breakEnd: string;
  onBreakEndChange: (value: string) => void;
  lastOrder: string;
  onLastOrderChange: (value: string) => void;
  onParseHours: () => void;
  feeRaw: string;
  onFeeRawChange: (value: string) => void;
  childFee: number | null;
  onChildFeeChange: (value: number | null) => void;
  guardianFee: number | null;
  onGuardianFeeChange: (value: number | null) => void;
  onParseFee: () => void;
  menuRaw: string;
  onMenuRawChange: (value: string) => void;
  menuItems: ParsedMenuItem[];
  onParseMenu: () => void;
  onRemoveMenuItem: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* [대표 이미지 등록](개선사항1-2) — SpotCurationsPanel과 동일한 클립보드
          붙여넣기 업로드 UX(제5장 제4조). */}
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">대표 이미지</span>
        <div
          tabIndex={0}
          onClick={(e) => e.currentTarget.focus()}
          onPaste={onPasteImage}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-24 w-24 rounded-lg object-cover" />
          ) : (
            <span>여기를 클릭한 뒤 이미지를 복사해 Ctrl+V로 붙여넣으세요</span>
          )}
          {isUploadingImage && <span className="text-blue-600">업로드 중...</span>}
        </div>
        <input
          type="text"
          value={imageUrl}
          onChange={(e) => onImageUrlChange(e.target.value)}
          placeholder="또는 이미지 URL 직접 입력"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* [영업시간 및 휴무일 정보](개선사항1-2) — 붙여넣은 원문(operating_hours_raw)에
          휴무일 문구가 포함돼 있어도 그대로 보존되며, 자동 파싱은 시간 범위만
          구조화한다(SpotCurationsPanel과 동일한 필드 구성 — 제5장 제4조). */}
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">영업시간 및 휴무일(텍스트 붙여넣기)</span>
        <textarea
          value={hoursRaw}
          onChange={(e) => onHoursRawChange(e.target.value)}
          placeholder={'예: 매일\n11:00 - 21:00\n15:00 - 17:00 브레이크타임\n20:30 라스트오더\n매주 월요일 휴무'}
          rows={5}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onParseHours}
          className="self-start rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 hover:bg-gray-700"
        >
          ⚡ 자동 파싱
        </button>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <input
            type="text"
            value={openTime}
            onChange={(e) => onOpenTimeChange(e.target.value)}
            placeholder="오픈(예: 10:00)"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={closeTime}
            onChange={(e) => onCloseTimeChange(e.target.value)}
            placeholder="마감(예: 22:00)"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={breakStart}
            onChange={(e) => onBreakStartChange(e.target.value)}
            placeholder="브레이크 시작"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={breakEnd}
            onChange={(e) => onBreakEndChange(e.target.value)}
            placeholder="브레이크 종료"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={lastOrder}
            onChange={(e) => onLastOrderChange(e.target.value)}
            placeholder="라스트오더"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs col-span-2"
          />
        </div>
      </div>

      {/* [가격 및 입장료 스마트 파싱](개선사항1-3 신규) — "네이버 플레이스 등의
          가격 텍스트를 그대로 복사·붙여넣기할 수 있는 [가격 스마트 입력창]" */}
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">입장료(텍스트 붙여넣기 — 어린이/보호자 요금 자동 인식)</span>
        <textarea
          value={feeRaw}
          onChange={(e) => onFeeRawChange(e.target.value)}
          placeholder={'예: 아동 12,000원\n보호자 5,000원'}
          rows={3}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onParseFee}
          className="self-start rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 hover:bg-gray-700"
        >
          ⚡ 자동 파싱
        </button>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <input
            type="number"
            value={childFee ?? ''}
            onChange={(e) => onChildFeeChange(e.target.value === '' ? null : Number(e.target.value))}
            placeholder="어린이 요금(원)"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          />
          <input
            type="number"
            value={guardianFee ?? ''}
            onChange={(e) => onGuardianFeeChange(e.target.value === '' ? null : Number(e.target.value))}
            placeholder="보호자 요금(원)"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* [식음료 및 메뉴 정보(옵셔널)](개선사항1-4) — 비워둬도 에러 없이 저장된다
          (menuItems 기본값이 빈 배열). */}
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">식음료/메뉴(선택 — "이름 가격원" 한 줄씩)</span>
        <textarea
          value={menuRaw}
          onChange={(e) => onMenuRawChange(e.target.value)}
          placeholder={'예: 아메리카노 4,500원\n딸기주스 6,000원'}
          rows={4}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onParseMenu}
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
                <button type="button" onClick={() => onRemoveMenuItem(i)} className="text-gray-400 hover:text-red-500">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
