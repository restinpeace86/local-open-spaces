- [x] [테스트/CI] 핵심 사용자 시나리오 E2E 통합 테스트 스위트 작성 및 CI 연동
  - 최신 원격 변경사항 수신을 위해 `git pull` 우선 수행
  - Playwright 통합 테스트 파일(`tests/e2e/core-scenarios.spec.ts`) 신규 작성/보강
  - **시나리오 1 Verification**: Header 알림 설정 모달 열기/닫기 및 LocalStorage 키-값 상태 변경 검증
  - **시나리오 2 Verification**: Quick 필터 ('👶 키즈', '🎁 무료', '⚡ 오늘/주말') 클릭 시 카드 뱃지와 스크리닝 결과 100% 일치 여부 검증
  - **시나리오 3 Verification**: 필터 미선택 시 20km/30km 클릭 팝업 노출, 필터 선택 후 20km/30km 클릭 시 팝업 미노출 및 지도 클러스터링/자동 줌아웃 동작 검증
  - 모바일(390px) 및 PC(1280px) 뷰포트 환경 각각 수행 검증
  - `package.json`에 `test:e2e` 스크립트 정돈 및 GitHub Actions workflow(`.github/workflows/e2e.yml`) 연동 검토
  - 완료 메모: Zero-Cost 원칙(Decision 001)에 따라 실 Supabase RPC/Kakao Maps SDK 네트워크 호출은
    `tests/e2e/support/mocks.ts`에서 Playwright route 가로채기로 결정론적 픽스처/스텁으로 대체(실 API 키 불필요).
    `next dev`(Turbopack HMR)는 병렬 워커 하에서 청크 로드가 불안정(ERR_ABORTED)해 `playwright.config.ts`의
    webServer를 `npm run build && npm run start` 프로덕션 서버로 고정. Mobile/Desktop 프로젝트 × 3개 시나리오
    = 6개 테스트 로컬에서 2회 연속 전부 통과, CI와 동일한 플레이스홀더 env로도 재검증 완료.
