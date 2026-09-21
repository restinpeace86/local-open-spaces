// [HQ 전체 파트너 데이터 열람/삭제 권한](2026-09-22 사용자 지시): "관리자에 대하여는
// 기존 데이터 다 보여야하고 삭제할 수 있는 권한도 있어야돼" — 지금까지 /hq/*는 "로그인
// 여부"만 확인하고 "이 계정이 실제로 본사 운영진인지"는 확인하지 않았다(2026-09-20
// partner-pms-schema.sql 주석: "본사 운영진 계정을 어떻게 식별할지 아직 정해지지 않아
// 추측 금지"). 이번에 사용자가 방식을 확정: 이메일 화이트리스트(env var).
// 별도 테이블 대신 env var를 선택한 이유(사용자 확인): "코드 배포 없이 env만 바꿀 수
// 있고, 지금 단계에서 관리 UI가 필요 없을 만큼 소수 인원이라 가장 빠름".
//
// env var를 모듈 로드 시 한 번만 파싱해 상수로 캐싱하지 않고 매 호출마다 다시 읽는다
// — 캐싱하면 테스트에서 process.env를 바꿔도 이미 평가된 상수가 안 바뀌는 문제가
// 실제로 발생했다(vitest 여러 테스트 파일이 같은 모듈 인스턴스를 공유). 호출 빈도가
// 낮고(로그인 시/삭제 액션 실행 시) 문자열 하나 split하는 비용도 무시할 수준이라
// 캐싱 이점보다 정확성이 우선이다.
function getHqStaffEmails(): string[] {
  return (process.env.HQ_STAFF_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// email이 없으면(예: 이메일 동의 안 한 카카오 로그인) 무조건 거부 — 화이트리스트
// 매칭이 불가능한 경우의 안전한 기본값은 "차단"이다(전체 고객 PII를 다루는 권한이라,
// 판별 불가 시 포함하는 다른 곳의 기본값과 반대 방향이 맞다).
export function isHqStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getHqStaffEmails().includes(email.trim().toLowerCase());
}
