'use client';

import { useCallback, useEffect, useState } from 'react';

// Task 9-3-1(2026-08-22): 하단 섹션("가성비 행복" 등)을 스크롤로 화면에 들어올 때만
// 지연 페칭하기 위한 범용 가시성 감지 훅. 한 번 화면에 들어오면 계속 true로 유지하고
// 더 이상 관찰하지 않는다(스크롤로 다시 벗어나도 이미 로드한 데이터를 없애지 않기 위함).
// IntersectionObserver를 지원하지 않는 환경에서는 기능 저하 없이 즉시 로드된 것으로 처리한다.
// 콜백 ref로 관찰 대상 노드를 state에 담아둔다 — 일반 useRef라면 대상 엘리먼트가
// 언마운트/재마운트(예: 탭 전환으로 섹션이 트리에서 빠졌다 돌아오는 경우)돼도 effect가 다시
// 돌지 않아 새 노드를 놓칠 수 있다.
export function useInView<T extends HTMLElement>(rootMargin = '200px') {
  const [node, setNode] = useState<T | null>(null);
  const [isInView, setIsInView] = useState(false);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (isInView) return undefined;
    if (!node || typeof IntersectionObserver === 'undefined') {
      if (!node) return undefined;
      setIsInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, isInView, rootMargin]);

  return { ref, isInView };
}
