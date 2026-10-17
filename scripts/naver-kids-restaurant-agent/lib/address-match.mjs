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
// [동(洞) 뒤 "N가" 구역 표기까지 동 이름의 일부로 포함](2026-10-17 실측 발견,
// "매봉산중구/금호산" 사례 검증 중): "금호동3가"처럼 동 이름 뒤에 바로 구역
// 숫자+"가"가 붙는 서울 구주소 표기가 있다 — 이걸 동 이름에 포함하지 않으면
// 그 "3"을 뒤에 올 지번 숫자로 잘못 캡처해버린다(실측: "금호동3가 산2-1"에서
// 번지를 "2-1"이 아니라 "3"으로 잘못 추출함, 우연히 비교 대상 양쪽이 같은
// 문자열이라 결과가 맞게 나왔을 뿐 근본적으로는 오류). "N가"는 동 식별의
// 일부(금호동1가~4가는 서로 다른 행정동)이므로 동 이름에 포함해 정확히 비교한다.
const DONG_LOT_PATTERN = /([가-힣]+(?:동|읍|면|리)(?:\d+가)?)\s*산?\s*(\d+)(?:-(\d+))?/;

function extractDongAndLot(address) {
  if (!address) return null;
  const match = address.match(DONG_LOT_PATTERN);
  if (!match) return null;
  return { dong: match[1], mainLot: match[2], subLot: match[3] ?? null };
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

  // [실측으로 발견한 과잉교정 — 산/공원 시설의 인접 지번 허용](2026-10-17,
  // 사용자 지적: "배봉산근린공원 유아숲체험원 이거는 쳤을때 나오는데?") —
  // 네이버 검색에 정확히 같은 이름("배봉산근린공원 유아숲체험원")으로 결과가
  // 있었는데도(id 615747111, "휘경동 산6-80") 우리 DB 행(휘경동 산6-91)과
  // 번지 끝자리만 달라 매칭되지 않았다. 공원/산림 시설은 하나의 넓은 부지가
  // 여러 인접 지번("산6-80"/"산6-91"/"산6-35" 등, 전부 원 지번 "6"에서 갈라진
  // 하위 구획)에 걸쳐 등재되는 경우가 흔해, 동(洞)과 메인 지번(하이픈 앞)까지
  // 같으면 서브 지번(하이픈 뒤)이 달라도 같은 부지일 가능성이 높다 — 동 자체가
  // 다르면(공릉동/상계동 사례처럼) 여전히 낮은 점수로 걸러낸다.
  const dongLotA = extractDongAndLot(addressA);
  const dongLotB = extractDongAndLot(addressB);
  if (dongLotA && dongLotB) {
    if (dongLotA.dong !== dongLotB.dong) return 0.2;
    if (dongLotA.mainLot !== dongLotB.mainLot) return 0.2;
    return dongLotA.subLot === dongLotB.subLot ? 1 : 0.7;
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

// 포함판정(nameSimilarity의 containment shortcut, 지점명이 덧붙는 경우 등)과
// 구분되는 "완전히 같은 이름"만 본다 — 아래 pickBestCandidate가 "이름이 유일하게
// 정확히 일치하면 주소 확인 없이 확정"할 때 쓰는 더 엄격한 기준.
function isExactNameMatch(nameA, nameB) {
  const a = normalizeText(nameA);
  const b = normalizeText(nameB);
  return Boolean(a) && a === b;
}

// [매칭 기준 — 이름 유일성 우선](2026-10-17 사용자 지시): "이름 검색시 여러개
// 나오는경우.. 이경우 다건에 대하여 우리주소 교차로 봐서 가장 적합한거.. 정확히
// 같은 이름인데 지번이 다르면 지번을 네이버껄로 바꿔" — 주소 교차검증은
// 동명(同名)이 여러 건 나왔을 때 그중 하나를 고르기 위한 도구이고, 이름이
// 정확히 일치하는 후보가 검색 결과 중 유일하면 그 자체로 확정 근거가 충분하다
// (주소/지번 표기 차이로 거부하지 않는다 — 공원/산림 시설은 지번이 여러 개로
// 쪼개져 등재되는 경우가 흔해 우리 쪽 지번이 네이버와 정확히 안 맞을 수 있고,
// 그때는 네이버 쪽 지번이 더 정확한 최신 등록 정보다). 이름이 정확히 같은 후보가
// 여러 개면(동명이인) 그중 주소가 가장 잘 맞는 것을 고르고, 정확히 같은 이름이
// 하나도 없으면 기존처럼 이름+주소 둘 다 최소 기준을 만족하는 것만 고른다.
export function pickBestCandidate(target, candidates) {
  const scored = candidates.map((candidate) => scoreCandidate(target, candidate));
  const exactNameMatches = scored.filter((s) => isExactNameMatch(target.name, s.candidate.name));

  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }
  if (exactNameMatches.length > 1) {
    const withAddress = exactNameMatches.filter((s) => s.addressScore >= MIN_ADDRESS_SIMILARITY);
    if (withAddress.length === 0) return null;
    withAddress.sort((a, b) => b.addressScore - a.addressScore);
    return withAddress[0];
  }

  const fuzzyMatches = scored.filter((s) => s.nameScore >= MIN_NAME_SIMILARITY && s.addressScore >= MIN_ADDRESS_SIMILARITY);
  if (fuzzyMatches.length === 0) return null;

  fuzzyMatches.sort((a, b) => b.nameScore + b.addressScore - (a.nameScore + a.addressScore));
  return fuzzyMatches[0];
}
