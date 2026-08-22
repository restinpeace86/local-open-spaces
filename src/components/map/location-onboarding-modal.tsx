'use client';

import { useEffect, useState } from 'react';
import { reverseGeocodeAddress, searchPlaceKeyword, PlaceSearchResult } from '@/lib/kakao/geocode';
import { UserLocation } from '@/lib/location/user-location-storage';
import { extractSigunguName } from '@/lib/spaces/extract-district';
import { getSigunguOptions, SigunguOption } from '@/lib/spaces/get-sigungu-options';

// spec/common/search.md 2.1: 입력 즉시(Debounce 300ms) 검색
const DEBOUNCE_MS = 300;

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

  return (
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
                <ul className="max-h-56 overflow-y-auto flex flex-col divide-y divide-gray-100">
                  {sigunguOptions.map((option) => (
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
    </div>
  );
}
