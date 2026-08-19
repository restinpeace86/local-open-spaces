// 도로명/지번 주소 문자열에서 자치구(시/군/구) 단위를 추출한다.
// 주소는 보통 "{시/도} {시/군/구} {상세주소...}" 순서이므로 두 번째 토큰을 사용한다.
// 예: "서울특별시 중구 세종대로 110" -> "중구", "경기도 고양시 일산서구 대화동" -> "고양시"
export function extractDistrict(address: string | null): string {
  if (!address) return '기타';

  const tokens = address.trim().split(/\s+/);
  const candidate = tokens[1];

  if (candidate && /(구|군|시)$/.test(candidate)) {
    return candidate;
  }

  return '기타';
}
