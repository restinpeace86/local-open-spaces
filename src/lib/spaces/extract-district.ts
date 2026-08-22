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

// Task 9-1-12(2026-08-22): 특별시/광역시 8곳의 공식 명칭 → 표기용 축약 명칭.
// "동구"/"북구"/"중구" 등은 서울·부산·대구·인천·광주·대전·울산에 전부 존재해 시/군/구
// 단독 표기만으로는 어느 도시인지 알 수 없다(실측 확인 — 사용자 지적). 이 표는 대한민국
// 공식 행정구역 명칭을 그대로 축약한 것이라 추측이 아니다.
const METRO_CITY_SHORT_NAME: Record<string, string> = {
  서울특별시: '서울시',
  부산광역시: '부산시',
  대구광역시: '대구시',
  인천광역시: '인천시',
  광주광역시: '광주시',
  대전광역시: '대전시',
  울산광역시: '울산시',
  세종특별자치시: '세종시',
};

// Task 9-1-3(2026-08-22): "[장소명] · [시/군/구]" 카드 표기 및 위치 우선 정렬용 시/군/구 추출.
// extractDistrict와 달리 "경기도 성남시 분당구"처럼 시(市) 아래 구(區)가 있는 2단 구조를
// 온전히 합쳐서 반환한다(scripts/ingest/adapters/lib/schema-mapper.mjs의 동일 로직과 짝을 이룸 —
// 백엔드는 .mjs, 프론트는 .ts라 직접 공유할 수 없어 같은 규칙을 각자 구현).
// "장소명 (도로명주소)" 형태(키워드 검색 결과)도 지원하기 위해 괄호 안 주소를 우선 파싱한다.
// Task 9-1-12 보완: 특별시/광역시는 1번째 토큰(시/도)의 축약명을 항상 앞에 붙인다
// (예: "울산시 동구", "광주시 북구", "서울시 강남구") — 단독 "동구"/"북구" 표기가 여러
// 도시에 겹쳐 실제로 헷갈린다는 지적을 반영.
export function extractSigunguName(addressName: string | null): string | null {
  if (!addressName) return null;

  const parenMatch = addressName.match(/\(([^)]+)\)/);
  const address = parenMatch ? parenMatch[1] : addressName;
  const tokens = address.trim().split(/\s+/);
  const province = tokens[0];
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
    const shortCity = METRO_CITY_SHORT_NAME[province];
    return shortCity ? `${shortCity} ${first}` : first;
  }

  return null;
}
