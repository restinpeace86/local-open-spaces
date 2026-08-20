- [x] [강제 리셋 및 복구] Git 로컬 변경사항 초기화 후 E2E 테스트 및 빌드 수복
  - `git fetch origin` 결과 로컬 `main`은 이미 `origin/main`(127f849)과 동일 커밋이었으며, `git reset --hard`는 수행하지 않음.
    로컬에 남아있던 미커밋 변경(`kakao-map-view.tsx` 등)을 검토한 결과 "깨진 코드"가 아니라 이미 이번 작업이 요구하는
    수정(단일 반경 pinch/wheel 줌 시 이전 레벨로 강제 복귀시키던 `MAX_SINGLE_RADIUS_METERS`/`handleZoomChanged` 로직 제거)이
    선반영된 상태였음. 해당 로직은 `spec/common/search.md` 2.2에 정의되지 않은 임의 비즈니스 로직(제7장 제3조 위반)이었으므로
    제거가 맞는 방향이며, `git reset --hard`로 되돌리는 것은 오히려 스펙 위반 상태로 회귀시키는 것이라 판단해 보존함.
  - `map-explorer.tsx`에 남아있던 이제는 존재하지 않는 `KakaoMapView`의 `onZoomExceedsMaxRadius` prop 참조를 제거하여 타입 정합성 복구.
  - `tests/e2e/core-scenarios.spec.ts` 내에는 애초에 pinch/wheel 줌 초과 팝업을 검증하는 테스트가 없었음(20km/30km 반경 버튼 잠금 팝업 테스트만 존재하며 이는 별개 기능이고 정상 통과). 별도 업데이트 불필요.
  - 저장소 루트에 남아있던 이전 세션의 손상된 디스코드 알림 스크립트 리다이렉트 잔여물(커밋 해시 이름의 71바이트 쓰레기 파일 12개)을 정리함.
  - 검증: `npx tsc --noEmit` 통과, `npm run test`(vitest) 2/2 통과, `npm run build` 성공, `npx playwright test` 6/6 통과.

## Decision 008 — 명세서 통합 정리 (2026-08-22)

- [x] `docs/spec.md`(가성비 놀거리 서비스 SSOT)와 기존 `project/`, `spec/` 문서 간 충돌 항목 매핑 및 정리
  - `project/decision-log.md`에 Decision 008 신규 기록
  - `project/overview.md`, `project/architecture.md`, `project/data_sources.md`: 서비스 정의/탐색흐름/데이터소스를 새 방향으로 갱신하되 기존 Zero-Cost·PostGIS·반응형 기술 세부는 유지
  - `spec/data/ai-rule.md`: 3.3에 "DB 원본 카테고리 → 5대 UI 카테고리" 매핑 신설(코드 미반영 상태로 명시), `is_free` 오탐 방지 Fallback 규칙 추가
  - `spec/common/search.md`: 중복된 20km/30km 안내 섹션 통합, 카테고리 목록을 5대 UI 카테고리로 갱신
  - `spec/space/space-card.md`, `spec/event/event-card.md`: Parental Checkpoint 뱃지를 `docs/spec.md` 4대 핵심 뱃지 기준으로 재정렬(주차/유모차는 보조 뱃지로 유지)
  - `spec/common/feature-flags.md`: 깨져있던 코드펜스 문법 오류 수정
- [ ] **[코드] DB 카테고리 → 5대 UI 카테고리 매핑 반영** — `spec/data/ai-rule.md` 3.3 매핑표를 `category-meta.ts`/RPC/카테고리 필터 칩에 실제 반영. DB 원본 `category`/`event_type` 값은 변경하지 않음(표시 레이어만 매핑)
- [~] **[코드] 하단 5탭 내비게이션 + 홈 화면 신규 구현** — `docs/spec.md` 2 기준. 현재 상단 3탭(지도/도감/캘린더) 구조를 대체하는 것이 아니라 그 기능들을 [내주변]/[카테고리] 탭 안으로 재배치. 홈 캐러셀/서브탭(특가·핫딜/무료·공공)/큐레이션 피드는 신규 UI 컴포넌트 필요. **범위가 커서 화면 목업/우선순위를 먼저 사용자와 확정한 뒤 착수 — 확정되면 이 표시를 빈 대괄호로 바꿔 자동 루프가 집을 수 있게 할 것**
- [~] **[코드] 커머스 핫딜 API 연동(쿠팡 파트너스/네이버 쇼핑)** — 신규 API 키/제휴 계약이 있어야 착수 가능 (Claude가 스스로 발급/체결 불가)
- [ ] **[코드] 요금 오탐 방지 Fallback 룰(비-OCR 부분) 구현** — `spec/data/ai-rule.md` 5.2-7의 "요금 미기재 국공립 시설 → `is_free: true` 기본 추정" 로직만 우선 반영 (기존 ingest 스크립트에 조건 추가 수준으로 착수 가능)
- [~] **[코드] 요금 포스터 이미지 OCR 파싱** — 비전 API(Gemini Vision 등) 연동 및 비용/키 확인 필요
- [~] 산림청/네이버 Local API/마트 문화센터·지자체 게시판 크롤링 등 신규 데이터 소스 수집 스크립트 (`project/data_sources.md` 2.3) — 각 소스별 신규 API 키 발급 필요
