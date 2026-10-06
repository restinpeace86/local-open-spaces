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
