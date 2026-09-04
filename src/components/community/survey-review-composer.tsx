'use client';

import { useEffect, useState } from 'react';
import { useUserLocation } from '@/hooks/use-user-location';
import { createSurveyReview, MomPickPost } from '@/lib/community/posts';
import { formatDistance } from '@/lib/spaces/format';
import { SpotPicker, SpotOption } from './spot-picker';
import {
  AGE_GROUP_OPTIONS,
  COMPANION_TYPE_OPTIONS,
  DURATION_TYPE_OPTIONS,
  emptySurveyAnswers,
  INFRA_TAG_OPTIONS,
  SATISFACTION_POINT_OPTIONS,
  SurveyAnswers,
  VISIT_ENVIRONMENT_OPTIONS,
  WEATHER_TAG_OPTIONS,
} from '@/lib/community/survey-options';

// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1·2.6·3-4: [설문형
// 스마트 리뷰 폼] 3단계 위저드 — 기존 PostComposer(마이크로 리뷰/체크리스트 탭)를
// 대체하는 새 글쓰기 화면. 1단계 장소 선택 → 2단계 설문 → 3단계 자유글+사진 순서로,
// 뒤로/다음 버튼으로 이동한다. 모든 설문 문항은 선택 사항이라 언제든 마지막 단계까지
// 건너뛰어 등록할 수 있다(장소 선택만 필수).
type PopularItem = {
  id: string;
  name: string;
  item_type: 'SPACE' | 'EVENT';
  category_min: string | null;
  address: string | null;
  distance_meters: number;
};

type SelectedTarget = { id: string; name: string; itemType: 'SPACE' | 'EVENT' };

const MAX_PHOTOS = 5;

function ChipToggle<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly { key: T; label: string }[];
  selected: T[];
  onToggle: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isActive = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(opt.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function RadioChips<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: readonly { key: T; label: string }[];
  value: T | null;
  onSelect: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((opt) => {
        const isActive = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(opt.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function SurveyReviewComposer({ onPosted }: { onPosted: (post: MomPickPost) => void }) {
  const { center } = useUserLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // 1단계: 장소 선택
  const [popularItems, setPopularItems] = useState<PopularItem[] | null>(null);
  const [popularError, setPopularError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchSpot, setSearchSpot] = useState<SpotOption | null>(null);

  // 2단계: 설문
  const [survey, setSurvey] = useState<SurveyAnswers>(emptySurveyAnswers());

  // 3단계: 자유글 + 사진
  const [content, setContent] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mom-pick/popular-spots?lat=${center.lat}&lng=${center.lng}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '주변 인기 스팟을 불러오지 못했습니다.');
        if (!cancelled) setPopularItems(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) setPopularError(err instanceof Error ? err.message : '주변 인기 스팟을 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng]);

  function selectPopularItem(item: PopularItem) {
    setSelected({ id: item.id, name: item.name, itemType: item.item_type });
  }

  function selectSearchSpot(spot: SpotOption | null) {
    setSearchSpot(spot);
    setSelected(spot ? { id: spot.id, name: spot.name, itemType: 'SPACE' } : null);
  }

  function toggleArrayValue<T extends string>(field: keyof SurveyAnswers, key: T) {
    setSurvey((prev) => {
      const list = prev[field] as T[];
      const next = list.includes(key) ? list.filter((v) => v !== key) : [...list, key];
      return { ...prev, [field]: next };
    });
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photoUrls.length);
    e.target.value = ''; // 같은 파일을 다시 골라도 onChange가 또 발생하도록 초기화
    if (files.length === 0) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch('/api/mom-pick/upload-image', { method: 'POST', body: formData });
        // eslint-disable-next-line no-await-in-loop
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '사진 업로드에 실패했습니다.');
        setPhotoUrls((prev) => [...prev, data.url]);
      }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.');
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  function resetForm() {
    setStep(1);
    setSelected(null);
    setSearchSpot(null);
    setIsSearchMode(false);
    setSurvey(emptySurveyAnswers());
    setContent('');
    setPhotoUrls([]);
  }

  async function handleSubmit() {
    if (!selected) {
      setErrorMessage('먼저 장소를 선택해주세요.');
      setStep(1);
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const post = await createSurveyReview({
        spotId: selected.itemType === 'SPACE' ? selected.id : null,
        eventId: selected.itemType === 'EVENT' ? selected.id : null,
        survey,
        content,
        photoUrls,
      });
      resetForm();
      onPosted(post);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '작성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4">
      {/* 진행 표시 */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className={step === 1 ? 'font-bold text-indigo-600' : ''}>① 장소</span>
        <span>—</span>
        <span className={step === 2 ? 'font-bold text-indigo-600' : ''}>② 설문</span>
        <span>—</span>
        <span className={step === 3 ? 'font-bold text-indigo-600' : ''}>③ 소감/사진</span>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-800">어느 스팟인가요?</p>

          {selected && (
            <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
              <span className="text-sm text-indigo-900">{selected.name}</span>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setSearchSpot(null);
                }}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                변경
              </button>
            </div>
          )}

          {!selected && (
            <>
              {popularError && <p className="text-xs text-red-600">{popularError}</p>}
              {!popularError && popularItems === null && <p className="text-xs text-gray-400">내 주변 인기 스팟을 찾는 중...</p>}
              {popularItems && popularItems.length === 0 && (
                <p className="text-xs text-gray-400">주변 30km 이내에 추천할 스팟이 아직 없어요. 검색으로 직접 찾아보세요.</p>
              )}
              {popularItems && popularItems.length > 0 && (
                <ul className="flex max-h-64 flex-col divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
                  {popularItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => selectPopularItem(item)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-gray-800">
                            {item.item_type === 'EVENT' && <span className="mr-1">🎪</span>}
                            {item.name}
                          </span>
                          <span className="block truncate text-xs text-gray-400">{item.category_min ?? item.address}</span>
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">{formatDistance(item.distance_meters)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => setIsSearchMode((v) => !v)}
                className="self-start text-xs font-medium text-blue-600 hover:underline"
              >
                {isSearchMode ? '목록에서 고르기' : '🔍 이름으로 직접 검색'}
              </button>
              {isSearchMode && <SpotPicker selected={searchSpot} onSelect={selectSearchSpot} />}
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">이 장소는 몇 세 아이와 가기 가장 좋았나요?</p>
            <ChipToggle
              options={AGE_GROUP_OPTIONS}
              selected={survey.ageGroups}
              onToggle={(key) => toggleArrayValue('ageGroups', key)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">방문 환경은 어땠나요?</p>
            <RadioChips
              options={VISIT_ENVIRONMENT_OPTIONS}
              value={survey.visitEnvironment}
              onSelect={(key) => setSurvey((prev) => ({ ...prev, visitEnvironment: key }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">부모 입장에서 가장 만족스러웠던 점은?</p>
            <ChipToggle
              options={SATISFACTION_POINT_OPTIONS}
              selected={survey.satisfactionPoints}
              onToggle={(key) => toggleArrayValue('satisfactionPoints', key)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">체류 시간(소요 시간)은 얼마나 됐나요?</p>
            <RadioChips
              options={DURATION_TYPE_OPTIONS}
              value={survey.durationType}
              onSelect={(key) => setSurvey((prev) => ({ ...prev, durationType: key }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">날씨/상황별로 추천한다면?</p>
            <ChipToggle
              options={WEATHER_TAG_OPTIONS}
              selected={survey.weatherTags}
              onToggle={(key) => toggleArrayValue('weatherTags', key)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">영유아 부모를 위한 인프라는 어땠나요?</p>
            <ChipToggle
              options={INFRA_TAG_OPTIONS}
              selected={survey.infraTags}
              onToggle={(key) => toggleArrayValue('infraTags', key)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">누구와 갔나요?</p>
            <RadioChips
              options={COMPANION_TYPE_OPTIONS}
              value={survey.companionType}
              onSelect={(key) => setSurvey((prev) => ({ ...prev, companionType: key }))}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-800">생생 꿀팁과 소감을 남겨주세요</p>
            <p className="text-xs text-gray-400">
              다른 부모님들에게 전할 나만의 꿀팁이나 주의할 점이 있다면 남겨주세요! (선택, 길게도 짧게도 괜찮아요)
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="예: 주차장은 넓은데 주말 오전에는 붐벼요. 그늘이 많아서 여름에도 괜찮았어요."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-gray-800">사진 (선택, 최대 {MAX_PHOTOS}장)</p>
            <div className="flex flex-wrap gap-2">
              {photoUrls.map((url) => (
                <div key={url} className="relative h-16 w-16 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    aria-label="사진 삭제"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {photoUrls.length < MAX_PHOTOS && (
                <label className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-400 hover:bg-gray-50">
                  {isUploadingPhoto ? '업로드 중...' : '+ 추가'}
                  <input type="file" accept="image/*" multiple onChange={handlePhotoSelect} disabled={isUploadingPhoto} className="hidden" />
                </label>
              )}
            </div>
            {photoError && <p className="text-xs text-red-600">{photoError}</p>}
          </div>
        </div>
      )}

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      <div className="flex gap-2">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            이전
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 1 && !selected) {
                setErrorMessage('먼저 장소를 선택해주세요.');
                return;
              }
              setErrorMessage(null);
              setStep((s) => (s + 1) as 2 | 3);
            }}
            className="flex-1 rounded-full bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            다음
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-full bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? '등록 중...' : '등록하기'}
          </button>
        )}
      </div>
    </div>
  );
}
