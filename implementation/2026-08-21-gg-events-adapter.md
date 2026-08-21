# GgEventsAdapter 구현 (Task 8-2, 재개)

## 구현 대상
- `implementation/todo.md` [Task 8-2]: 경기데이터드림(data.gg.go.kr) 공공 수영장 + 물놀이형 수경시설(바닥분수) 통합 수집 어댑터
- 1차 시도(서비스 ID `Cultrsttus`/`Pubchefltswim`)는 `ERROR-310`(서비스를 찾을 수 없음)으로 스킵했었으나, 사용자가 정확한 서비스 ID(`PublicSwimmingPool`, `TBWTRWTRPLYHYDRDTAM`)를 다시 전달해 재개함

## 구현 일시
2026-08-21

## 변경 사항
- `scripts/ingest/adapters/gg-events-adapter.mjs`: `GgEventsAdapter`(`BaseCollectorAdapter` 구현체) — 두 API를 각각 페이지네이션 수집, Kakao 지오코딩으로 좌표 보완 후 `open_spaces`에 매핑
- `scripts/ingest/gg-events.mjs` CLI 진입점 + `package.json`에 `ingest:gg-events` 스크립트 추가
- `scripts/ingest/adapters/gg-events-adapter.test.mjs`: 11개 단위 테스트(User-Agent 헤더, 페이지네이션, INFO-000 에러 처리, 지오코딩 성공/실패/없음, facility_type/is_free/is_kids_friendly 매핑, external_id 결정성)
- `scripts/ingest/lib/ai-tagging.mjs`: `matchesKidsKeyword`(+`NAME_KIDS_KEYWORDS`)를 신설 — 기존 `swimming-pool-adapter.mjs`에 있던 동일 로직을 공용 lib로 이동
- `scripts/ingest/adapters/swimming-pool-adapter.mjs`: 위 공용 함수를 import하도록 리팩터링(동작 변경 없음, `swimming-pool-adapter.test.mjs`가 여전히 `matchesKidsKeyword`를 이 파일에서 import하므로 재-export 유지)

## 검증 결과 (실제 API 호출)
- `PublicSwimmingPool`: User-Agent 헤더로 WAF 우회 후 `RESULT.CODE: 'INFO-000'`, 총 135건
- `TBWTRWTRPLYHYDRDTAM`: 동일하게 `INFO-000`, 총 1,170건
- 두 API 전체 필드를 실측 확인한 결과 위경도/좌표 필드가 전혀 없음(주소 텍스트만 제공)을 확인 — 지오코딩 필수 확정
- `PublicSwimmingPool` 135건 전수의 `POSESN_INST_NM`(소유기관) 값을 실측 확인 — 35개 기관 모두 공공/준공공(시/군청, 국민체육진흥공단, 대한장애인체육회, 한국방송광고진흥공사 등), 민간 사업자 없음
- `gg-events-adapter.test.mjs` 11/11 통과, `swimming-pool-adapter.test.mjs` 회귀 재검증 26/26 통과(공용화 리팩터링 이후)
- `npx tsc --noEmit` / `npm run test`(전체 83/83) / `npm run build`: 모두 통과
- `node scripts/ingest/gg-events.mjs --dry-run` 실행 결과 `KAKAO_REST_API_KEY` 미설정으로 명확한 에러 메시지와 함께 정상 종료(exit 1) 확인 — `NationalParkEcotourAdapter`와 동일한 패턴

## 특이 사항
- **좌표 없음 → 실행 대기**: 두 API 모두 좌표 필드가 없어 `KAKAO_REST_API_KEY`가 채워지기 전까지는 실제 upsert를 실행할 수 없다. 코드/테스트는 완성했으며, 키가 채워지면 `npm run ingest:gg-events -- --dry-run`으로 재검증 후 실제 실행하면 된다.
- **`is_free`(API1) 결정 근거**: 요금 필드가 원본에 없으나, "PublicSwimmingPool"이라는 API 자체가 공공 수영장으로 스코프된 데이터셋임을 전수 조사(135건의 소유기관명)로 확인해 소스 레벨로 `deriveIsFreeFallback({ hasFeeInfo: false, isPublicProvider: true })`를 고정 적용했다 — 추측이 아니라 전수 실측 근거.
- **API2(물놀이형 수경시설) `is_free`/`is_kids_friendly` 고정 true**: Task 지시서에 명시된 사용자 지시를 그대로 반영했다(임의 추정이 아님).
- **facility_type(API2) 고정 '야외'**: 실내/실외 필드가 원본에 없으나, 운영기간 필드(`OPR_PRD`, 예: "3개월(6월~8월)")가 보여주듯 계절 노출형 실외 수경시설이라는 물리적 특성 자체가 명백해 고정했다 — `GoCampingAdapter`/`NationalParkEcotourAdapter`가 물리적 특성으로 시설 유형을 고정한 것과 동일한 논리.
- **UI 카테고리 재판단 없음**: `project/data_sources.md` 2.3에 이미 "1. 물놀이터·바닥분수 → 🌳 야외·자연", "3. 수영장 → 🎡 키즈·액티비티"로 기록돼 있던 매핑을 그대로 따랐다(신규 카테고리 판단이 아님).
- **키워드 매칭 공용화**: `swimming-pool-adapter.mjs`(Task 7-3)에서 처음 정의했던 `matchesKidsKeyword`가 이번 어댑터에도 필요해져 `lib/ai-tagging.mjs`로 이동해 공용화했다. 서로 무관한 두 어댑터 파일이 직접 import하는 것보다 공용 lib 경유가 구조적으로 맞다고 판단(제5장 제4조 기존 구조 우선, 중복 방지). 기존 테스트 파일이 여전히 `swimming-pool-adapter.mjs`에서 `matchesKidsKeyword`를 import하므로 하위 호환을 위해 그 파일에서 재-export를 유지했다.
- **지오코딩 처리량**: API2가 1,170건이라 개별 Kakao 지오코딩 호출이 그만큼 필요하다. `Promise.all`로 동시에 쏘지 않고 `NationalParkEcotourAdapter`와 동일하게 순차(for-await) 처리해 Kakao 쪽 레이트리밋 위험을 피했다.
