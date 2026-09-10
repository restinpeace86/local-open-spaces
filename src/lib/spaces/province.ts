// [스팟픽 지도 — 노출 중분류 선택 시 현재 위치의 도(道) 단위 노출](2026-09-10
// 사용자 지시, project/decision-log.md): "반경 컷오프(10/20/30km) 폐지는 유지하되,
// 노출 중분류를 선택해서 보여주는 데이터는 현재 설정한 위치가 포함하는 도 단위로
// 제한한다. 판교원로 68(경기도 성남시 분당구) → 경기도 + 서울시. 강릉 → 강원도."
//
// 데이터의 주소 광역 표기가 제각각이라("경기도"/"경기", "강원특별자치도"/"강원도"/
// "강원", "인천광역시"/"인천" 등 — 실측) DB의 public.normalize_address_region_prefix
// 와 동일한 정규화를 TS로도 둔다(제5장 제4조 — 같은 규약 재사용).

export const CANONICAL_PROVINCES = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const;
export type Province = (typeof CANONICAL_PROVINCES)[number];

// 접두어(긴 것 먼저 — "강원특별자치도"가 "강원도"보다 먼저 매칭되도록).
const PROVINCE_PREFIXES: Array<[string, Province]> = [
  ['서울특별시', '서울'], ['서울시', '서울'], ['서울', '서울'],
  ['부산광역시', '부산'], ['부산시', '부산'], ['부산', '부산'],
  ['대구광역시', '대구'], ['대구시', '대구'], ['대구', '대구'],
  ['인천광역시', '인천'], ['인천시', '인천'], ['인천', '인천'],
  ['광주광역시', '광주'],
  ['대전광역시', '대전'], ['대전시', '대전'], ['대전', '대전'],
  ['울산광역시', '울산'], ['울산시', '울산'], ['울산', '울산'],
  ['세종특별자치시', '세종'], ['세종시', '세종'], ['세종', '세종'],
  ['경기도', '경기'], ['경기', '경기'],
  ['강원특별자치도', '강원'], ['강원도', '강원'], ['강원', '강원'],
  ['충청북도', '충북'], ['충북', '충북'],
  ['충청남도', '충남'], ['충남', '충남'],
  ['전북특별자치도', '전북'], ['전라북도', '전북'], ['전북', '전북'],
  // "전남광주통합특별시"(실측된 이상 데이터) — "광주"가 들어가므로 광주로 본다.
  ['전남광주', '광주'],
  ['전라남도', '전남'], ['전남', '전남'],
  ['경상북도', '경북'], ['경북', '경북'],
  ['경상남도', '경남'], ['경남', '경남'],
  ['제주특별자치도', '제주'], ['제주도', '제주'], ['제주', '제주'],
];

// 주소/시군구명 문자열의 맨 앞(공백 무시)에서 광역(도/광역시)을 뽑는다. 못 찾으면 null.
export function getProvinceFromText(text: string | null | undefined): Province | null {
  if (!text) return null;
  const head = text.trim().replace(/^\s+/, '');
  const compact = head.replace(/\s+/g, '');
  for (const [prefix, province] of PROVINCE_PREFIXES) {
    if (compact.startsWith(prefix)) return province;
  }
  return null;
}

// [도 단위 노출 범위](사용자 지시): 경기 ↔ 서울은 서로 포함한다(판교 사례 —
// "경기도 + 서울시"). 그 외 도는 자기 자신만.
export function getVisibleProvinces(province: Province | null): Province[] | null {
  if (!province) return null; // 판별 실패 → 필터하지 않음(안전 폴백: 전부 노출)
  if (province === '경기') return ['경기', '서울'];
  if (province === '서울') return ['서울', '경기'];
  return [province];
}

// 스팟이 주어진 광역 목록에 속하는지 — 주소 우선, 없으면 시군구명으로 판정.
// 광역을 아예 못 뽑으면(주소 이상 등) 보수적으로 포함시킨다(사용자에게 보여야 할
// 스팟을 근거 없이 숨기지 않는다 — 제3장 제5조).
export function isSpotInProvinces(
  address: string | null | undefined,
  sigunguName: string | null | undefined,
  provinces: Province[]
): boolean {
  const p = getProvinceFromText(address) ?? getProvinceFromText(sigunguName);
  if (!p) return true;
  return provinces.includes(p);
}
