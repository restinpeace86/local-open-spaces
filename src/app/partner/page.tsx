import { redirect } from 'next/navigation';

// [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md 5절):
// "기본 홈 디폴트"는 오늘(일간) 탭 — /partner 자체는 화면이 없고 곧바로 그리로 보낸다.
export default function PartnerRootPage() {
  redirect('/partner/today');
}
