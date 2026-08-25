'use client';

import { useEffect, useRef } from 'react';

// Task 9-6-17: 모달이 열려 있는 동안 히스토리에 더미 state를 쌓아, 모바일 물리/제스처
// 뒤로가기가 이전 페이지(지도 등)로 이동해버리지 않고 이 모달만 닫도록 가로챈다.
// X/배경 클릭 등 다른 방식으로 닫힐 때는 쌓아뒀던 더미 state를 history.back()으로 다시
// 걷어내 히스토리 스택이 계속 쌓이지 않게 한다.
export function useModalBackClose(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let closedByPopState = false;
    window.history.pushState({ __modal: true }, '');

    const handlePopState = () => {
      closedByPopState = true;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!closedByPopState) {
        window.history.back();
      }
    };
  }, []);
}
