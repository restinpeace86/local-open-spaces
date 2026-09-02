'use client';

import { useUserLocation } from '@/hooks/use-user-location';
import { calculateAgesFromBirthYears } from '@/lib/ai-chat/personalization';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): "유저의 프로필 데이터(region,
// birth_years)를 반영한 맞춤형 환영 문구". profiles 테이블에는 region 컬럼이 없다 —
// 이 앱은 이미 useUserLocation()(LocalStorage 기반 사용자 위치, sigungu_name 포함)을
// "현재 활동 지역"의 단일 출처로 쓰고 있어(스팟픽/AI 챗봇 지역 선택 등), 별도
// profiles.region 컬럼을 새로 만들어 이중 관리하지 않고 그 값을 그대로 재사용한다
// (제5장 제4조 기존 구조 우선). birth_years → 나이 환산은 personalization.ts(AI 챗봇
// 초개인화 작업에서 이미 검증된 로직) 재사용.
export function PersonalizedBanner({ birthYears }: { birthYears: number[] }) {
  const { sigunguName } = useUserLocation();
  const ages = calculateAgesFromBirthYears(birthYears);

  const regionPart = sigunguName ? `${sigunguName}에 사는` : '우리 동네';
  const kidsPart = ages.length > 0 ? `${[...ages].sort((a, b) => a - b).join('살, ')}살 아이와` : '아이와';

  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 p-4 text-white">
      <p className="text-sm font-medium">
        {regionPart} {kidsPart} 이번 주말 여기 어때요? 👀
      </p>
    </div>
  );
}
