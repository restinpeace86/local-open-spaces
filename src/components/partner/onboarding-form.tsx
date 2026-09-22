'use client';

import { useState } from 'react';
import { SpotPicker, SpotOption } from '@/components/community/spot-picker';
import { submitPartnerOnboarding } from '@/actions/partner/onboarding';

// [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시, docs/partner_spec.md):
// "모바일 퍼스트 UI/UX... 사장님들이 쓰기 편하게 직관적이고 큰 폼 요소 배치" — 다른
// 관리자 폼(spot-curations-panel.tsx 등, text-sm/py-2)보다 한 단계 큰 터치 타깃
// (text-base/py-3)을 쓴다. 대상 사용자가 IT에 익숙하지 않을 수 있는 농장 사장님이라는
// 점을 반영했다.
export function OnboardingForm() {
  const [farmName, setFarmName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [selectedSpot, setSelectedSpot] = useState<SpotOption | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // [농장 위치 주소 및 스팟 연동](요구사항 2): 스팟을 고르면 그 스팟의 주소를 우선
  // 채워준다(직접 다시 타이핑하지 않아도 되게) — 다만 이후에도 자유롭게 고쳐 쓸 수
  // 있어야 하므로(주소가 항상 스팟 주소와 완전히 같으리라는 보장은 없음, 추측 금지)
  // 값을 강제로 잠그지 않는다.
  function handleSelectSpot(spot: SpotOption | null) {
    setSelectedSpot(spot);
    if (spot?.address && !address.trim()) {
      setAddress(spot.address);
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImagePreview(URL.createObjectURL(file));
    setIsUploadingImage(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/partner/upload-farm-image', { method: 'POST', body: formData });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? '이미지 업로드에 실패했습니다.');
      setImageUrl(data.url);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.');
      setImagePreview(null);
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting || isUploadingImage) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await submitPartnerOnboarding({
        farm_name: farmName,
        owner_name: ownerName,
        phone,
        image_url: imageUrl,
        address,
        spot_id: selectedSpot?.id ?? '',
      });
      // 성공 시 서버 액션 내부의 redirect()가 페이지 이동을 처리하므로(Next.js가
      // 예외를 가로채 처리) 이 지점에 도달하는 건 항상 실패한 경우뿐이다.
      if ('error' in result) {
        setErrorMessage(result.error);
      }
    } catch (err) {
      // redirect()가 던지는 NEXT_REDIRECT는 Next.js 런타임이 자체적으로 처리하고 이
      // catch까지 오지 않는다 — 여기 걸리는 건 진짜 예외뿐이다.
      setErrorMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    // [개선사항 4](2026-09-22 사용자 지시, todo.md): "모바일/반응형 여백 확보..
    // 폼 상하단에 적절한 패딩을 주어 맨 아래에 꽉 껴서 잘리지 않고" — 스크롤
    // 가능해진 뒤에도(위 page.tsx 수정) 등록 버튼이 화면/기기 하단 안전 영역에
    // 바짝 붙지 않도록, add-booking-fab.tsx의 기존 안전영역 패딩 관례를 재사용한다.
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-3xl"
          aria-hidden
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="" className="h-full w-full object-cover" />
          ) : (
            '🌾'
          )}
        </div>
        <label className="text-sm font-semibold text-blue-600">
          {isUploadingImage ? '업로드 중...' : '대표 이미지 선택(선택)'}
          <input type="file" accept="image/*" onChange={handleImageChange} disabled={isUploadingImage} className="hidden" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        농장 이름
        <input
          type="text"
          value={farmName}
          onChange={(e) => setFarmName(e.target.value)}
          required
          placeholder="예: 나드리 딸기농장"
          className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        대표자 성함
        <input
          type="text"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          placeholder="예: 김나드"
          className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        연락처
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="010-0000-0000"
          className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        나드리픽 스팟 연동
        <SpotPicker selected={selectedSpot} onSelect={handleSelectSpot} />
        <span className="text-xs font-normal text-gray-400">우리 농장이 나드리픽에 이미 등록돼 있으면 검색해서 연결해 주세요.</span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
        농장 위치 주소
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          placeholder="스팟을 연동하면 자동으로 채워져요"
          className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={isSubmitting || isUploadingImage}
        className="mt-2 rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white disabled:opacity-50"
      >
        {isSubmitting ? '저장 중...' : '등록 완료'}
      </button>
    </form>
  );
}
