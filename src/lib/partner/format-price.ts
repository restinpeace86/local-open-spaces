// [네이버 예약 호환 수동 예약 등록 폼 — 입력 간편화](2026-09-21 사용자 지시):
// "이 필드들을 간편하게 입력하는 법이 없나" — 결제 금액을 숫자만 입력하면
// 큰 금액일수록 자릿수를 세기 어려워 오타가 나기 쉽다. format-phone.ts와 동일한
// 관례로, 입력 중에는 천 단위 콤마가 붙은 표시값을 보여주고 실제 저장값은
// 콤마를 뗀 숫자로 복원한다.
export function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits === '') return '';
  return Number(digits).toLocaleString('ko-KR');
}

// 표시용 문자열("50,000")을 실제 저장값(숫자)으로 되돌린다. 빈 문자열이면
// "입력 안 함"을 뜻하므로 null(선택 입력이라 total_price가 optional).
export function parsePriceInput(displayValue: string): number | null {
  const digits = displayValue.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}
