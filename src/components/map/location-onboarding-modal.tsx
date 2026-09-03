'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { reverseGeocodeAddress, searchPlaceKeyword, PlaceSearchResult } from '@/lib/kakao/geocode';
import { UserLocation } from '@/lib/location/user-location-storage';
import { extractSigunguName } from '@/lib/spaces/extract-district';
import { getSigunguOptions, SigunguOption } from '@/lib/spaces/get-sigungu-options';

// spec/common/search.md 2.1: 입력 즉시(Debounce 300ms) 검색
const DEBOUNCE_MS = 300;

// [todo.md 개선사항 2-2](2026-09-03) 실측으로 발견한 버그: 이 모달을 AI 챗봇(ai-chat-
// sheet.tsx)처럼 "이미 열려 있는 다른 모달" 안에서 띄우면, 이 모달의 바깥(어두운
// 배경) 영역 클릭이 리액트 트리를 타고 부모 모달의 onClick={onClose}까지 그대로
// 버블링돼 챗봇 전체가 함께 닫혀버렸다(부모 모달 쪽엔 별도 stopPropagation이 없어
// 감지 불가) — "다른 지역 선택 중 배경을 살짝 스치면 챗봇이 통째로 꺼진다"는 형태로
// 나타난다. DOM 트리 자체를 `document.body` 바로 아래로 분리하는 포탈로 렌더링해 어떤
// 부모가 감싸고 있어도 더 이상 그 부모의 클릭 핸들러를 타지 않게 한다 — 스택 순서
// 문제(모달 위에 모달)도 함께 해결된다. 서버 렌더링 시점엔 document가 없어, 마운트
// 이후에만 포탈을 그린다(Next.js 클라이언트 컴포넌트의 표준 포탈 패턴).
function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

// implementation/todo.md Phase 2: GPS 현위치 탐색 + 동네/주소 직접 검색을 지원하는 위치 설정 온보딩
export function LocationOnboardingModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (location: UserLocation) => void;
  onClose: () => void;
}) {
  const [isLocating, setIsLocating] = useState(false);
  const [draft, setDraft] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Task 9-1-8: GPS 실패/권한 거부 시 2단계 Fallback으로 자동 노출하는 수동 시/군/구 선택 시트.
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [sigunguOptions, setSigunguOptions] = useState<SigunguOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const mounted = useIsMounted();

  function openManualPicker() {
    setShowManualPicker(true);
    if (sigunguOptions.length > 0 || isLoadingOptions) return;

    setIsLoadingOptions(true);
    getSigunguOptions()
      .then(setSigunguOptions)
      .catch(() => {
        // 목록 조회 실패해도 GPS/검색 경로는 그대로 살아있으므로 화면을 막지 않는다.
      })
      .finally(() => setIsLoadingOptions(false));
  }

  useEffect(() => {
    const keyword = draft.trim();
    if (!keyword) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setErrorMessage(null);
      try {
        const found = await searchPlaceKeyword(keyword);
        setResults(found);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : '동네/주소 검색에 실패했습니다.');
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft]);

  // Task 9-1-8: GPS 2단계 Fallback — 실패/권한 거부 시 에러 메시지와 동시에 수동 시/군/구
  // 선택 시트를 자동으로 연다(사용자가 다시 시도하거나 텍스트 검색을 직접 할 필요 없이
  // 바로 다음 행동을 이어갈 수 있도록).
  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setErrorMessage('이 브라우저에서는 위치 확인을 지원하지 않습니다.');
      openManualPicker();
      return;
    }

    setIsLocating(true);
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        try {
          const addressName = await reverseGeocodeAddress(lat, lng);
          onConfirm({ lat, lng, address_name: addressName, sigungu_name: extractSigunguName(addressName) });
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : '주소 확인에 실패했습니다.');
          openManualPicker();
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setErrorMessage('위치 권한이 거부되었거나 확인할 수 없습니다.');
        setIsLocating(false);
        openManualPicker();
      },
      { timeout: 5000 }
    );
  }

  if (!mounted) return null;

  // [todo.md 개선사항 2-3](2026-09-03) "너무 세부적이거나 모호했던 선택지 대신
  // [시/도] + [시/군/구] 광역 단위의 명확하고 넓은 선택지 리스트" — sigungu_name은
  // 이미 DB에 "경기도 성남시"처럼 시/도 접두어가 포함돼 저장돼 있다(실측 확인,
  // scripts/migrations/2026-08-22-get-sigungu-options-rpc.sql). 다만 368건이 하나의
  // 평평한 목록으로만 나와 있어 훑어보기 어려웠던 게 진짜 문제라, 시/도 단위로
  // 묶어 소제목을 붙인다(새 데이터/컬럼 없이 문자열의 첫 단어만 그룹 키로 사용 —
  // 제5장 제4조 기존 구조 우선).
  const groupedSigunguOptions = sigunguOptions.reduce<Map<string, SigunguOption[]>>((groups, option) => {
    const province = option.sigungu_name.split(' ')[0] ?? option.sigungu_name;
    const list = groups.get(province) ?? [];
    list.push(option);
    groups.set(province, list);
    return groups;
  }, new Map());

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full md:w-[420px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">동네를 설정해주세요</h2>
            <p className="mt-1 text-sm text-gray-500">
              현재 위치를 찾거나 동네/주소를 검색하면 주변 열린 공간과 행사를 알려드려요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={isLocating}
          className="mt-4 w-full rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-60"
        >
          {isLocating ? '현재 위치 확인 중...' : '📍 현재 위치로 찾기'}
        </button>

        {/* [챗봇 문제점 수정](2026-09-02 사용자 지시) 2: "다른 지역 변경 시 동네 이름을
            정확히 쳐야 해서 너무 국소적으로만 바꿀 수 있다"(예: 경기도 거주자가 서울/
            경기 전역을 폭넓게 찾고 싶어도 정확한 주소를 몰라 못 바꿈) — 기존에도
            시/군/구 목록 선택 기능(getSigunguOptions)은 있었지만 GPS 실패 시에만
            숨겨진 채로 열리는 2차 Fallback이었다. 검색창에 입력하지 않고도 바로 쓸 수
            있도록 상시 노출 버튼으로 승격한다(제5장 제4조 기존 구조 우선 — 새 목록을
            만들지 않고 이미 있던 것을 더 쉽게 찾게 함). */}
        <button
          type="button"
          onClick={openManualPicker}
          className="mt-2 w-full rounded-lg border border-gray-300 text-gray-700 text-sm font-medium py-2.5 hover:bg-gray-50"
        >
          🗺️ 지역 목록에서 선택
        </button>

        <div className="mt-4">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="동네 이름 또는 주소로 검색"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {isSearching && <p className="mt-2 text-sm text-gray-400">검색 중...</p>}
          {errorMessage && <p className="mt-2 text-sm text-red-500">{errorMessage}</p>}

          {/* Task 9-1-8: GPS 실패 시 2단계 Fallback — 시/군/구를 직접 선택하는 수동 선택 시트 */}
          {showManualPicker && (
            <div className="mt-3 rounded-lg border border-gray-100 overflow-hidden">
              <p className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                지역을 직접 선택해주세요
              </p>
              {isLoadingOptions && <p className="px-3 py-2.5 text-sm text-gray-400">목록 불러오는 중...</p>}
              {!isLoadingOptions && sigunguOptions.length > 0 && (
                <div className="max-h-72 overflow-y-auto">
                  {[...groupedSigunguOptions.entries()].map(([province, options]) => (
                    <div key={province}>
                      <p className="sticky top-0 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold text-gray-400">{province}</p>
                      <ul className="flex flex-col divide-y divide-gray-100">
                        {options.map((option) => (
                          <li key={option.sigungu_name}>
                            <button
                              type="button"
                              onClick={() =>
                                onConfirm({
                                  lat: option.lat,
                                  lng: option.lng,
                                  address_name: option.sigungu_name,
                                  sigungu_name: option.sigungu_name,
                                })
                              }
                              className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50"
                            >
                              {option.sigungu_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {results.length > 0 && (
            <ul className="mt-2 flex flex-col divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {results.map((result, index) => (
                <li key={`${result.lat}-${result.lng}-${index}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onConfirm({
                        lat: result.lat,
                        lng: result.lng,
                        address_name: result.addressName,
                        sigungu_name: extractSigunguName(result.addressName),
                      })
                    }
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    {result.addressName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
