'use client';

import { useRef } from 'react';

// [블로그 큐레이션 팝업 드래그 시 창 닫힘 버그 수정](2026-09-05 사용자 지시):
// "마우스로 살짝 드래그&드롭하면 팝업창이 그냥 꺼져버려.."
//
// 실측 원인: 이 프로젝트의 배경 클릭 닫기 모달들은 전부 "배경 div에
// onClick={onClose} + 콘텐츠 카드 div에 onClick={(e) => e.stopPropagation()}"
// 패턴을 쓴다. 이 방식은 클릭이 "시작부터 끝까지" 콘텐츠 카드 안에서만 일어날 때만
// 안전하다 — 카드 안에서 텍스트를 드래그로 선택하다가(예: 블로그 요약 텍스트
// 드래그) 마우스가 카드 경계를 살짝 벗어난 채로 버튼을 떼면, 브라우저는 그
// click 이벤트를 "mousedown 지점과 mouseup 지점의 가장 가까운 공통 조상"에서
// 발생시킨다 — 이 경우 공통 조상이 배경 div 자신이 되어, 콘텐츠 카드의
// stopPropagation을 아예 거치지 않고 배경의 onClose가 바로 실행된다.
//
// 해결: "배경을 클릭해서 닫는다"는 mousedown과 click(mouseup) 둘 다 배경 자기
// 자신에서 시작/종료했을 때만 인정한다. 카드 안에서 드래그를 시작했다면(mousedown
// 시점에 이미 카드 안이었다면) 마우스가 나중에 배경으로 삐져나가도 닫지 않는다.
export function useBackdropDismiss(onClose: () => void) {
  const mouseDownOnBackdrop = useRef(false);

  return {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
      mouseDownOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLDivElement>) => {
      if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
        onClose();
      }
      mouseDownOnBackdrop.current = false;
    },
  };
}
