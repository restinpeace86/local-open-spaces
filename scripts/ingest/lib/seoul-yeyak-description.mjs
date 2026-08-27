// [상세보기 설명 누락 수정](2026-08-27): SEOUL_YEYAK(source='seoul_public_reservation')은
// 이 세션 초반 본문 백필(backfill-contents.mjs) 대상에서 빠져 있어 description이 전량 NULL이었다
// (실측 확인: is_active=true 2,760건 전부 NULL). 이 소스의 실제 상세 설명은 raw_data.DTLCONT에
// 있지만 두 가지 문제가 있다:
// 1. 모든 레코드에 공통으로 붙는 정형 안내문("1. 공공시설 예약서비스 이용시 필수 준수사항"~
//    "2. 시설예약")이 앞에 붙어 있다 — 실측 확인(여러 샘플 대조) 결과 토씨 하나 다르지 않게
//    완전히 동일한 문구라 레코드별 실질 정보가 아니다. "3. 상세내용"부터가 실제 내용이다.
// 2. 원본이 HWP/CKEditor로 작성된 원시 HTML이라(<span style="...">, <table> 등) 그대로
//    보여주면 태그가 그대로 노출된다.
export function extractYeyakDescription(dtlcont) {
  if (!dtlcont || typeof dtlcont !== 'string') return null;

  // 실측 확인: "3. 상세내용"이 실질 정보의 시작, "4. 주의사항"(취소/환불 등 부가 안내)부터는
  // 우선순위가 낮아 제외한다. 두 마커 모두 없으면(드문 변형 포맷) 원문 전체를 그대로 쓴다 —
  // 마커가 없다고 내용 자체를 통째로 버리지 않는다(제3장 제5조 추측 금지 — 마커 존재를
  // 임의로 가정하지 않음).
  const startMarker = '3. 상세내용';
  const endMarker = '4. 주의사항';
  const startIdx = dtlcont.indexOf(startMarker);
  const afterStart = startIdx >= 0 ? dtlcont.slice(startIdx + startMarker.length) : dtlcont;
  const endIdx = afterStart.indexOf(endMarker);
  const body = endIdx >= 0 ? afterStart.slice(0, endIdx) : afterStart;

  const HTML_ENTITY_MAP = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&rarr;': '→', '&hellip;': '…', '&crarr;': '',
  };

  const withLineBreaks = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  const decoded = withLineBreaks.replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITY_MAP[entity] ?? '');

  const cleaned = decoded
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  return cleaned || null;
}
