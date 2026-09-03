import { BrandSplash } from '@/components/common/brand-splash';

// Task 9-4-1(2026-08-22): Next.js App Router의 루트 loading.tsx — 각 라우트 세그먼트가
// 서버에서 데이터를 로딩하는 동안(Suspense 경계) 자동으로 보여주는 초기 진입 스플래시.
// [로딩 화면 배경색 보정](2026-09-03 사용자 지시): "GIF 배경이 흰색이 아닌 것 같다"는
// 재지적 — 실측 확인(Pillow getpixel) 결과 원본 GIF의 배경은 순백(#ffffff)이 아니라
// 아주 살짝 푸른 기가 도는 #fcfcff(252,252,255)였다. GIF는 반투명을 지원하지 않아
// 투명 처리(이전 작업) 후에도 안티앨리어싱 경계의 미세한 픽셀이 완전히 사라지지
// 않을 수 있는데, 그 잔여 픽셀은 원래 배경색(#fcfcff)에 가깝다 — 순백 배경 위에서는
// 그 잔여 경계가 옅게 도드라져 보이지만, 페이지 배경도 같은 #fcfcff로 맞추면 자연스럽게
// 묻힌다. 앱 전체 배경(globals.css --background)은 순백을 그대로 유지하고, 이 로딩
// 화면에만 국소적으로 적용한다(요청 범위를 벗어난 전역 톤 변경은 하지 않음).
export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#fcfcff]">
      <BrandSplash />
    </div>
  );
}
