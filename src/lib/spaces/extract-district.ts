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

// Task 9-1-3(2026-08-22): "[장소명] · [시/군/구]" 카드 표기 및 위치 우선 정렬용 시/군/구 추출.
// extractDistrict와 달리 "경기도 성남시 분당구"처럼 시(市) 아래 구(區)가 있는 2단 구조를
// 온전히 합쳐서 반환한다(scripts/ingest/adapters/lib/schema-mapper.mjs의 동일 로직과 짝을 이룸 —
// 백엔드는 .mjs, 프론트는 .ts라 직접 공유할 수 없어 같은 규칙을 각자 구현).
// "장소명 (도로명주소)" 형태(키워드 검색 결과)도 지원하기 위해 괄호 안 주소를 우선 파싱한다.
export function extractSigunguName(addressName: string | null): string | null {
  if (!addressName) return null;

  const parenMatch = addressName.match(/\(([^)]+)\)/);
  const address = parenMatch ? parenMatch[1] : addressName;
  const tokens = address.trim().split(/\s+/);
  const first = tokens[1];
  if (!first) return null;

  if (/(시|군)$/.test(first)) {
    const second = tokens[2];
    if (second && /구$/.test(second)) {
      return `${first} ${second}`;
    }
    return first;
  }

  if (/구$/.test(first)) {
    return first;
  }

  return null;
}
