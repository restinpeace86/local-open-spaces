// [검증 단계 — 상호명/주소 교차 확인](todo.md 개선사항4 3단계): "우리 데이터의 주소와
// 검색 결과의 주소가 일치하는지 비교.. 동명이인(다른 지역의 동명 식당)인 경우.. 주소로도
// 검색하여 확인." 결정적 문자열 유사도로 비교한다(matchParking의 "LLM 대신 결정적 비교"
// 결정과 같은 이유 — scripts/ingest/match-parking-to-spots.mjs 주석 참고, 같은 알고리즘
// 형태를 재사용하되 그 파일을 직접 import하지는 않는다: STRIP_WORDS가 주차장 전용 어휘
// (주차장/공영/지하 등)라 식당명에 그대로 적용하면 의미가 안 맞고, 그 파일은 모듈
// 최상단에서 loadEnv/DB 클라이언트를 생성해 순수 문자열 비교만 쓰려는 이 모듈에 불필요한
// 결합이 생긴다).
export function normalizeText(text) {
  if (!text) return '';
  return text.replace(/[\s()·\-,]/g, '');
}

// 둘 중 짧은 쪽이 긴 쪽에 완전히 포함되면 1.0, 아니면 공통 2-gram 비율로 점수화
// (match-parking-to-spots.mjs의 nameSimilarity와 동일한 알고리즘 형태).
function bigramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 1;

  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const g of setA) if (setB.has(g)) common += 1;
  return common / Math.min(setA.size, setB.size);
}

export function nameSimilarity(nameA, nameB) {
  return bigramSimilarity(normalizeText(nameA), normalizeText(nameB));
}

// [주소 비교는 "포함" 단축판정을 쓰지 않는다] bigramSimilarity의 containment
// 단축판정(짧은 쪽이 긴 쪽에 포함되면 1.0)은 상호명에는 맞지만(지점명이 덧붙는
// 경우가 많음) 주소에는 위험하다 — 번지 없는 짧은 도로명 조각("동서로10번길")은
// 항상 완전한 주소("경기도 시흥시 동서로10번길 3")의 부분 문자열이라 번지 일치
// 여부와 무관하게 무조건 1.0이 나와, 실제로 번지까지 정확히 일치하는 주소와
// 구분이 안 되는 버그가 생긴다(실측: pickBestCandidate 테스트로 발견). 대신 두
// 문자열 길이 차이에 민감한 Dice 계수(공통 2-gram의 2배 / 두 2-gram 집합 크기의
// 합)를 쓴다 — 한쪽이 훨씬 짧으면 점수가 낮아진다.
function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const g of setA) if (setB.has(g)) common += 1;
  return (2 * common) / (setA.size + setB.size);
}

// 도로명 + 건물번호(예: "동서로10번길 3", "분당내곡로 131-1")를 뽑는다 — 시/군/구 등
// 행정구역 표기 차이(예: "경기도"//"경기")에 흔들리지 않고 핵심 위치 식별자만 비교하기
// 위함. 못 찾으면 null(추측 금지 — 이 경우 호출부가 전체 주소 유사도로 대체 비교한다).
const ROAD_NUMBER_PATTERN = /([가-힣0-9]+(?:로|길|대로)\s*\d+(?:-\d+)?)/;

export function extractRoadAndNumber(address) {
  if (!address) return null;
  const match = address.match(ROAD_NUMBER_PATTERN);
  return match ? match[1] : null;
}

// [실측으로 발견한 지번 주소 오탐](2026-10-16, 유아숲체험원 매칭 중 발견):
// 도로명이 없는 지번(산 번지) 주소는 둘 다 extractRoadAndNumber가 null을
// 반환해 전체 문자열 Dice 유사도로 대체되는데, "서울특별시 노원구"처럼 공유되는
// 시/구 접두어가 길어서 동(洞) 이름과 번지가 완전히 다른데도 0.5를 넘어 오탐이
// 났다(실측: "노원구 공릉동 산223-1"과 "노원구 상계동 산59-2"가 서로 다른
// 산/시설인데 0.52로 통과해 전혀 다른 "수락산 생태 노원골 유아숲체험원"에
// 잘못 매칭됨). 도로명과 동일한 원칙으로, 동 이름+번지를 먼저 추출해 그게
// 다르면 낮은 점수로 명확히 구분한다.
const DONG_LOT_PATTERN = /([가-힣]+(?:동|읍|면|리))\s*산?\s*(\d+(?:-\d+)?)/;

function extractDongAndLot(address) {
  if (!address) return null;
  const match = address.match(DONG_LOT_PATTERN);
  return match ? `${match[1]}${match[2]}` : null;
}

// "경기도 성남시 분당구 ..."처럼 맨 앞에 오는 시/도·시/군/구 토큰(최대 2개)을
// 뗀다 — 두 주소의 동/번지/도로명이 전혀 달라도 이 접두어를 공유한다는 이유만
// 으로 Dice 유사도가 부풀려지는 걸 막기 위함(아래 addressSimilarity 마지막
// 분기 전용 전처리).
function stripLeadingAdminTokens(address) {
  if (!address) return '';
  const tokens = address.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && i < 2 && /[시도군구]$/.test(tokens[i])) i += 1;
  return tokens.slice(i).join(' ');
}

// 1) 도로명+번지가 양쪽에서 추출되면: 정확히 같으면 1.0, 다르면 0.2.
// 2) 도로명이 없으면(지번 주소) 동 이름+번지로 같은 방식 재시도.
// 3) 둘 다 추출 실패하면 전체 주소의 Dice 유사도로 대체한다(최후의 수단 —
//    이 경로는 동/도로명 토큰 자체가 없는 매우 짧거나 비정형인 주소에만 탄다).
export function addressSimilarity(addressA, addressB) {
  const roadA = extractRoadAndNumber(addressA);
  const roadB = extractRoadAndNumber(addressB);
  if (roadA && roadB) {
    return normalizeText(roadA) === normalizeText(roadB) ? 1 : 0.2;
  }

  const dongLotA = extractDongAndLot(addressA);
  const dongLotB = extractDongAndLot(addressB);
  if (dongLotA && dongLotB) {
    return normalizeText(dongLotA) === normalizeText(dongLotB) ? 1 : 0.2;
  }

  // [실측으로 발견한 "시/구 접두어 공유로 인한 오탐" — 2단계로 발견된 같은 근본
  // 원인](2026-10-16, 유아숲체험원 참고 목록 매칭 중) — "서울특별시 구로구"처럼
  // 두 주소가 공유하는 시/도+시/군/구 접두어가, 그 뒤의 동/번지가 전혀 다른데도
  // 전체 문자열 Dice 비율을 끌어올렸다. 1차로는 "한쪽이 시/구까지만 있는
  // 극단적으로 짧은 경우"만 길이로 걸러냈는데, 그 다음 재검증에서 "양쪽 다
  // 어느 정도 길어도 같은 시/구 접두어 때문에 여전히 0.5를 넘는" 사례를 추가로
  // 발견했다(실측: "오리로 1102-4, 천왕동"과 전혀 다른 동인 "개봉동 416-102"가
  // 같은 "서울특별시 구로구"를 공유한다는 이유만으로 통과). 근본 원인 자체를
  // 없애기 위해 Dice 비교 전에 선행 시/도+시/군/구 토큰(최대 2개)을 떼고 그
  // 뒤쪽(동/번지/상세) 부분만 비교한다 — 공유 접두어가 비교에 전혀 기여하지
  // 않게 된다.
  const tailA = stripLeadingAdminTokens(addressA);
  const tailB = stripLeadingAdminTokens(addressB);
  const normTailA = normalizeText(tailA);
  const normTailB = normalizeText(tailB);
  if (normTailA && normTailA === normTailB) return 1;

  // 접두어를 뗀 뒤 남는 부분이 너무 짧으면(동/번지 정보가 거의 없음) 근거가
  // 부족하므로 매칭하지 않는다(추측 금지, 제3장 제5조) — 위 사례처럼 시/구까지
  // 밖에 없는 주소는 접두어를 떼면 빈 문자열이 돼 자연히 여기서 걸린다.
  const MIN_MEANINGFUL_ADDRESS_TAIL_LENGTH = 4;
  if (normTailA.length < MIN_MEANINGFUL_ADDRESS_TAIL_LENGTH || normTailB.length < MIN_MEANINGFUL_ADDRESS_TAIL_LENGTH) {
    return 0;
  }

  return diceSimilarity(normTailA, normTailB);
}

// [매칭 기준](todo.md 3단계 "일치하는 경우 ➔ 네이버 place 고유 ID를 발췌"):
// 상호명 유사도와 주소 유사도를 둘 다 어느 정도 만족해야 확정한다 — 이름만 맞고
// 주소가 완전히 다르면 동명이인(다른 지역의 동명 식당)일 수 있고, 주소만 맞고
// 이름이 영 다르면 바로 옆 다른 가게일 수 있다. 두 임계값 모두 match-parking-
// to-spots.mjs의 MIN_SIMILARITY(0.5)와 같은 보수적 기준(오탐이 미탐보다 나쁨)을
// 그대로 적용한다.
export const MIN_NAME_SIMILARITY = 0.5;
export const MIN_ADDRESS_SIMILARITY = 0.5;

export function scoreCandidate(target, candidate) {
  const nameScore = nameSimilarity(target.name, candidate.name);
  const addressScore = Math.max(
    addressSimilarity(target.address, candidate.fullAddress),
    addressSimilarity(target.address, candidate.roadAddress)
  );
  return { nameScore, addressScore, candidate };
}

// 후보 중 이름/주소 유사도 모두 임계값을 넘는 것 중 (이름+주소 합산) 최고점 하나를
// 고른다. 없으면 null(추측 금지 — 애매하면 매칭하지 않고 그대로 "미매칭"으로 남긴다).
export function pickBestCandidate(target, candidates) {
  const scored = candidates
    .map((candidate) => scoreCandidate(target, candidate))
    .filter((s) => s.nameScore >= MIN_NAME_SIMILARITY && s.addressScore >= MIN_ADDRESS_SIMILARITY);

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.nameScore + b.addressScore - (a.nameScore + a.addressScore));
  return scored[0];
}
