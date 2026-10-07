// [상태/강사명 정규화](2026-10-06 todo.md 개선사항 5): "강좌 원문 텍스트에서
// ... status/instructor/url/fee/materialFee를 파싱하여 정형화" — 실측
// 확인 결과 url(두 마트 다 프론트엔드에 이미 URL 빌더가 있다 —
// culture-club-tab-view.tsx의 buildClassDetailUrl, culture-club-options.ts의
// buildLottemartDetailUrl)과 fee/materialFee(두 마트 다 이미 정수 컬럼)는
// 이미 해결돼 있어 손대지 않는다(중복 구현 금지, 제5장 제4조). 실제로
// 남은 일:
// ①상태를 공통 3단계 ENUM(OPEN/CLOSED/WAITING)으로 매핑 — 두 마트가 서로
//   다른 상태 모델(이마트 3버킷 vs 롯데마트 6상태)을 쓰고 있어 마트 전체를
//   가로지르는 조회("지금 접수 가능한 거 다 보여줘")를 하려면 공통 값이
//   필요하다.
// ②이마트는 강사명 전용 필드가 없다(class_title에 "~선생님" 식으로 섞여
//   있을 때만 추출 가능 — 없으면 null, 추측하지 않음). 롯데마트는 이미
//   instructor_name이 깨끗한 컬럼이라 그대로 둔다.

// [이마트 상태 매핑 — 실측 확인] emart-culture-club.mjs 주석: "정원마감
// (=UI '대기접수', 취소 시 등록 가능)" — 학부모가 취소 시 등록을 노려볼 수
// 있는 상태라 롯데마트의 '대기자신청'과 동급으로 WAITING 취급한다.
// '접수대기'는 아직 오픈 전(대기자 명단이 아니라 "시작 전")이라 CLOSED로
// 본다 — 롯데마트의 "대기"와 글자는 같지만 실제 의미가 다르다는 걸 혼동하지
// 않기 위해 주석으로 명시해 둔다.
export function normalizeEmartStatus(filterStatus) {
  if (filterStatus === '접수중') return 'OPEN';
  if (filterStatus === '정원마감') return 'WAITING';
  return 'CLOSED'; // 접수대기(오픈 전) / 접수마감
}

export function normalizeLottemartStatus(registrationStatus) {
  if (registrationStatus === '바로신청') return 'OPEN';
  if (registrationStatus === '대기자신청') return 'WAITING';
  return 'CLOSED'; // 접수마감 / 전화문의 / 현장접수 / 접수불가
}

// [이마트 전용 강사명 추출] class_title에 "~선생님"/"~강사" 꼴로 섞여 있을
// 때만 추출한다(실측: "[트니트니] 은하수 선생님(15~24개월)" → "은하수").
// 이 패턴이 없는 제목이 대다수라 null이 정상이다 — 없는 걸 지어내지 않는다.
const INSTRUCTOR_REGEX = /([가-힣]{2,4})\s*(선생님|강사)/;

export function parseInstructorFromTitle(title) {
  if (!title) return null;
  const match = title.match(INSTRUCTOR_REGEX);
  return match ? match[1] : null;
}

// [collected_at 매 실행마다 갱신](2026-10-07 사용자 지적: "왜 수집일자가
// 10/3이지? 10/6이 아니고?") — 이마트/롯데마트 ingest 스크립트의 transform()/
// parseRow()는 collected_at을 돌려주지 않는다(의도적으로 테스트 가능한 순수
// 함수로 유지) — 그래서 upsert payload에 이 컬럼이 아예 없었다. ON CONFLICT
// DO UPDATE는 payload에 없는 컬럼은 건드리지 않으므로, 이미 존재하는 강좌는
// 가격/상태 등은 매일 최신으로 갱신되는데도 collected_at(화면의 "마지막
// 업데이트")만 최초 수집 시각에 영원히 고정돼 있었다(실측 확인 — 이마트
// 전체 6,546건 중 10/4 이후 값을 가진 건 26건뿐). 매 실행마다 이 시점 값을
// 모든 행에 실어 보내 매번 갱신되게 한다(toUnifiedEmartRow/toUnifiedLottemart
// Row가 row.collected_at을 그대로 복사하므로 통합 테이블에도 같은 값이
// 전파된다). 두 브랜드가 동일한 버그/동일한 고침을 가지므로 공유 함수로 둔다.
export function stampCollectedAt(rows, collectedAt) {
  return rows.map((row) => ({ ...row, collected_at: collectedAt }));
}

// [통합 테이블 이중 쓰기 — 상세정보(이미지 등) 유실 버그 수정](2026-10-07
// 사용자 지적: "사진 있는데.. 상세쪽에 있는 사진을 가져와서 썸네일로
// 맞추면 안돼?") — 이마트/롯데마트 둘 다 class_id당 한 번만 상세 페이지를
// 조회해 이미지/소개 등 "정적 콘텐츠"를 원본 테이블에만 채워둔다. 그런데
// 매일 도는 목록 배치는 그 필드를 모르는 채로 raw_extra를 통째로 새로
// 만들어 통합 테이블에 써버려(기존 값과 병합하지 않음), 상세수집이 채운
// 값이 매번 지워지고 있었다. run()이 원본 테이블에서 상세정보를 다시
// 읽어와(fetchDetailEnrichmentByClassId, 브랜드별 테이블/컬럼이 달라 각자
// 구현) 이 함수로 합친 뒤 통합 변환을 돌리면 지워지지 않는다.
export function mergeDetailEnrichment(rows, enrichmentByClassId) {
  return rows.map((row) => {
    const enrichment = enrichmentByClassId.get(row.class_id);
    return enrichment ? { ...row, ...enrichment } : row;
  });
}
