// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: "AI 챗봇 관련하여서도
// 비로그인 시 1회 한정". 비로그인 사용자는 서버에서 식별 가능한 계정이 없어 로컬스토리지로만
// 소프트 제한한다(기기 변경/스토리지 삭제로 우회될 수 있음을 인지하고 있는 의도적 설계 —
// 로그인 사용자는 profiles.ai_chat_free_uses_used로 서버에서 확정적으로 카운트한다.
// src/app/api/ai-chat/search/route.ts 참고). notification-storage.ts와 동일한 관례로
// localStorage 키를 상수화한다.
const ANONYMOUS_FREE_USE_KEY = 'ai_chat_anonymous_free_use_consumed';

export function hasConsumedAnonymousFreeUse(): boolean {
  try {
    return localStorage.getItem(ANONYMOUS_FREE_USE_KEY) === 'true';
  } catch {
    return false; // localStorage 접근 불가 환경(SSR/프라이빗 모드 등)에서는 제한하지 않음
  }
}

export function markAnonymousFreeUseConsumed(): void {
  try {
    localStorage.setItem(ANONYMOUS_FREE_USE_KEY, 'true');
  } catch {
    // 저장 실패해도 서비스 중단 없이 조용히 무시(제5장 제11조 오류 처리 원칙)
  }
}
