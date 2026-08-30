// [핵심 events 수집 파이프라인 장애 점검](2026-08-30 사용자 지시): 2026-08-29 01:59 UTC
// GitHub Actions 실행에서 NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY를 포함한
// 필수 환경변수 전체가 비어 있어, Daily 배치의 11개 단계가 각자 다른 형태(외부 API 키
// 누락 예외, Supabase 클라이언트 생성 실패, 원본 서버의 "인증키 무효" 응답 등)로 실패한
// 것을 docs/pipeline-log.md에서 실측 확인했다(git log 상 유일한 github-actions[bot] 커밋).
// 로컬에서 동일 코드를 실제 .env.local로 dry-run하면 11/11 단계 전부 성공해(2026-08-30
// 검증) 코드/어댑터 자체의 문제가 아니라 그 실행 시점의 환경변수 주입 문제로 추정된다.
//
// 재발 시 카스케이드 에러를 하나하나 해석하지 않고 즉시 원인을 알 수 있도록, 배치 시작
// 시점에 필수 환경변수 존재 여부를 한 번에 검사하는 헬퍼. VWORLD_API_KEY처럼 없어도
// 어댑터가 경고만 남기고 계속 진행하는(지오코딩 생략 등) 키는 여기 포함하지 않는다 —
// "없으면 해당 단계가 반드시 throw하는" 키만 대상으로 한다(각 어댑터 소스 코드의
// `throw new Error('... 환경변수가 설정되지 않았습니다.')` 가드를 기준으로 조사함).
export function getMissingEnvVars(requiredKeys) {
  return requiredKeys.filter((key) => !process.env[key]);
}

export function formatMissingEnvVarsMessage(missingKeys) {
  return `필수 환경변수 누락: ${missingKeys.join(', ')} — GitHub Actions Secrets 설정 또는 .env.local을 확인하세요.`;
}
