import { Suspense } from 'react';
import { MyPageView } from '@/components/my/my-page-view';

// [Decision 018](2026-09-02): 하단 탭 "마이"는 Task 9-6-10부터 인증 시스템 부재로 계속
// 비활성화돼 있었다(bottom-tabs.tsx의 ENABLE_MY_PAGE 플래그) — 이 Decision이 그 사유를
// 해소했으므로 화면을 실제로 구현한다.
// MyPageView가 useSearchParams()(콜백 리다이렉트의 ?auth_error= 확인용)를 쓰므로
// map-explorer.tsx와 동일하게 Suspense 경계로 감싼다(Next.js 정적 프리렌더 요구사항).
export default function MyPage() {
  return (
    <Suspense>
      <MyPageView />
    </Suspense>
  );
}
