// [이벤트 큐레이션 — 블로그에서 가격 자동 채우기](2026-09-11 사용자 지시):
// "블로그글 복붙하면 파싱할 수 있는거라든지.. 이런거 적을 수 있는거 줘야지" —
// 관리자가 블로그 본문을 읽으며(하이라이트로 강조된 가격 단어 참고) "자동 채우기"
// 버튼을 누르면 그 블로그 텍스트에서 가격 정보를 뽑아 입력란에 채워준다. 관리자는
// 이 값을 그대로 저장하거나 직접 고쳐 쓸 수 있다(추측 결과를 강제하지 않음).
//
// scripts/ingest/adapters/lib/price-parser.mjs와 로직이 동일하다 — 이 저장소는
// scripts/(Node 수집 파이프라인)와 src/(Next.js 앱)가 서로 import하지 않는 관례를
// 유지해(제5장 제4조 기존 구조 우선 — 두 빌드 타깃의 분리 유지) TS로 그대로 옮겨왔다.
export function parsePriceFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&middot;/g, ' ');

  // 1순위: "이용료/요금/참가비/입장료/사용료/수강료/관람료" 등 명시적 라벨 근처의
  // 금액만 신뢰한다 — 라벨 없이 "[0-9,]+원"만 찾으면 전화번호/규정 조항 번호 등과
  // 혼동될 위험이 있어(제3장 제5조 추측 금지) 라벨을 요구한다.
  const labeled = plain.match(/(이용료|요금|참가비|입장료|사용료|수강료|관람료)\s*[:：]?\s*([0-9][0-9,]{2,}\s*원)/);
  if (labeled) return `${labeled[1]} ${labeled[2]}`;

  // 2순위: 라벨은 없지만 "전석 10,000원", "성인 15,000원 어린이 10,000원"처럼
  // 대상어 + 금액 조합이 뚜렷한 경우 — 최대 2개까지만(복수 요금 지원) 이어붙인다.
  const targeted = [...plain.matchAll(/[가-힣]{1,6}\s*[0-9][0-9,]{2,}\s*원/g)].map((m) => m[0].trim());
  if (targeted.length > 0) return targeted.slice(0, 2).join(' ');

  return null;
}
