// [나드리픽 파트너 PMS — 수기 예약 등록](2026-09-20 사용자 지시): "연락처 입력 시
// 하이픈 자동 포맷팅". 이 코드베이스에 전화번호 포맷터 전례가 없어 새로 만든다.
// 숫자만 남긴 뒤 자릿수에 따라 3-3-4/3-4-4(휴대폰 010 등)로 묶는다 — 완벽한 국번
// 규칙(서울 02 지역번호의 2자리 앞자리 등)까지는 다루지 않는다(추측 금지, 요구사항
// 원문도 "권장" 수준이라 완전한 전화번호 검증기가 아닌 입력 편의 도구로 충분하다).
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
