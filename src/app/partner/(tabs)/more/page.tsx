import { SignOutButton } from '@/components/auth/sign-out-button';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "[⚙️ 더보기] (노쇼 방지 리마인드 템플릿 설정 / 프로필·정산 정보 / 네이버 연동 상태 /
// 고객센터 / 로그아웃)". 로그아웃은 이미 검증된 공용 컴포넌트(sign-out-button.tsx,
// 소비자 로그인/로그아웃 왕복 검증용으로 이미 존재)를 그대로 재사용해 실제로 동작하게
// 하고(제5장 제4조), 로그아웃 성공 시 이 페이지가 미들웨어 보호 구역이라 다음 새로고침에
// /partner/login으로 자동 리다이렉트된다(middleware.ts 참고). 나머지 항목은 각자
// 별도 데이터/UI가 필요한 다음 단계 작업이라 지금은 목록만 보여준다(가짜 기능처럼
// 클릭되게 만들지 않도록 버튼이 아닌 텍스트로만 표기).
const COMING_SOON_ITEMS = [
  { icon: '💬', label: '노쇼 방지 리마인드 템플릿 설정' },
  { icon: '🏡', label: '농장 프로필 및 정산 정보 관리' },
  { icon: '🔗', label: '네이버 연동 상태 및 메일함 스캔' },
  { icon: '☎️', label: '고객센터 · 1분 사용 가이드' },
];

export default function PartnerMorePage() {
  return (
    <div className="flex flex-col gap-1 p-4">
      <h1 className="px-2 pb-2 text-base font-bold text-gray-900">더보기</h1>
      <ul className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {COMING_SOON_ITEMS.map((item) => (
          <li key={item.label} className="flex items-center gap-3 px-4 py-3.5 text-sm text-gray-400">
            <span aria-hidden>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            <span className="text-xs text-gray-300">준비 중</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-center">
        <SignOutButton />
      </div>
    </div>
  );
}
