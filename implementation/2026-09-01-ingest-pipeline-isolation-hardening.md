# [개발 요청] 외부 공공 API 배치 수집 안정성 및 독립 실행(Isolation) 구조 고도화

## 구현 일시
2026-09-01

## 배경
2026-08-30 "배치 수집 안정성 고도화" 작업에서 `TourApiV4AreaBasedAdapter`(KorTour/
KorWithTour/KorPetTour 공유) 1곳에만 그룹 루프 격리/30초 타임아웃을 적용했고, 나머지
20여 개 어댑터는 후속 작업으로 남겨뒀다. 이번 지시서로 그 후속 작업을 완료했다.

## 1. 개별 API 에러 격리(Isolation) — 신규 발견 및 수정

전수 조사(`grep -rn "Promise.all" scripts/ingest/`) 결과, 서로 완전히 독립된 외부
API 2개 이상을 `Promise.all([...])`로 묶어 놓은 어댑터가 **5개** 더 있었다 — 하나만
실패해도 `Promise.all` 전체가 즉시 reject되어 이미 성공했을 다른 API의 데이터까지
버려지고, 상위 `withRetry`가 이미 성공한 API까지 포함해 `fetch()` 전체를 재시도하는
동일한 구조적 결함이었다:

- `cultural-facility-summary-adapter.mjs`: 8개 시설유형(박물관/미술관/공공도서관/
  생활문화센터/문화의집/문학관/문예회관/국립도서관) — `Promise.all(ENDPOINTS.map(...))`.
  사용자가 예시로 든 "그룹 루프"에 가장 정확히 들어맞는 사례.
- `gg-culture-events-adapter.mjs`: 문화행사(API1)/문화재단행사(API2) 2개.
- `gg-events-adapter.mjs`: 수영장/물놀이형 수경시설 2개.
- `gg-kidscafe-adapter.mjs`: 키즈카페/휴게음식점(놀이방식당) 2개.
- `swimming-pool-adapter.mjs`: API1/API2 2개.

신규 공유 유틸 `scripts/ingest/lib/settle-group-fetches.mjs`(`Promise.allSettled` 기반,
유닛 테스트 4건)를 만들어 5곳 모두 동일한 방식으로 고쳤다 — 하나(또는 일부)가 실패해도
나머지는 정상적으로 데이터를 받고, **전부** 실패했을 때만 예외를 던져 상위 재시도가
의미 있게 동작한다. 5개 어댑터의 기존 테스트 중 "한쪽이 에러면 fetch() 전체가
reject된다"를 검증하던 5건은 이제 성립하지 않는(정확히는 고쳐야 할) 낡은 기대값이라,
"한쪽만 실패해도 다른 쪽은 정상 수집" + "양쪽 다 실패하면 예외"로 재작성했다.

## 2. 30초 타임아웃 + 지수 백오프 재시도 — 전면 확대 적용

- `fetch-with-timeout.mjs`가 기존 진단 유틸 `fetch-with-cause.mjs`(2026-08-30, err.cause
  enrichment)를 내부적으로 거치도록 통합했다 — 이제 하나만 쓰면 30초 타임아웃과 원인
  진단을 동시에 얻는다(신규 유닛 테스트 4건).
- **전수 조사**(`grep -rn "await fetch("`) 결과 남아있던 raw `fetch()` 호출 17곳
  (어댑터 15개 + `lib/kakao-geocoder.mjs`/`lib/vworld-geocoder.mjs`/`lib/ai-tagging.mjs`
  지오코딩·AI 유틸 3곳 포함)을 전부 `fetchWithTimeout`으로 교체했다. `fetch-with-cause.mjs`
  를 직접 쓰던 `gg-culture-events-adapter.mjs`/`tour-api-festival.mjs`도 `fetchWithTimeout`
  으로 통일했다(하위 호환 — 원인 진단 기능은 그대로 유지됨). 이제 이 파이프라인 안에서
  외부 API를 직접 호출하는 지점은 예외 없이 30초 타임아웃이 걸린다.
- `vworld-geocoder.mjs`의 기존 세밀한 재시도 루프(주소 1건당 최대 3회, 고정 1초 간격 —
  대량 지오코딩용으로 이미 튜닝된 값)는 그대로 두고 타임아웃만 추가했다 — retry.mjs의
  5초/10초 지수 백오프(어댑터 전체 fetch() 단위 재시도용)를 여기 그대로 적용하면
  수천 건 규모 지오코딩이 지나치게 느려지기 때문이다(타임아웃과 재시도 간격은 서로
  다른 관심사로 판단).
- `retry.mjs`의 백오프는 이미 2026-08-30에 5초/10초(×2배)로 조정돼 있어 이번엔
  변경하지 않았다(문서화만).

## 3. Stale Data 방어 — 이미 충족(코드 변경 없음)

`BaseCollectorAdapter.run()`이 이미 `upsertRowsSafeMerge()`(COALESCE 기반, 기존 값이
있으면 새 값이 NULL이어도 덮어쓰지 않음)만 쓰고, 수집 실패 시에는 로그만 남기고
throw할 뿐 기존 행을 지우거나 비우는 코드 경로가 전혀 없다 — 2026-08-30에 이미 확인한
내용을 재확인했다.

## 4. 관리자 수동 재수집 — API에 이어 UI 버튼 완성

2026-08-30에 API(`POST /api/admin/ingest/rerun`)까지만 만들고 UI는 미룬 상태였다.
이번에 완성했다:
- `GET /api/admin/ingest/rerun` 신규 — run-daily.mjs/run-monthly.mjs의 실제 STEPS
  배열에서 소스 목록을 그대로 읽어온다(하드코딩 금지 — 새 소스 추가 시 관리자 화면이
  자동으로 최신 목록을 반영).
- `/admin/data-grid` 상단에 `IngestRerunPanel` 신규 — 배치(Daily/Monthly) 선택 →
  소스 선택 → [재수집 실행] 버튼. 결과(수신/반영 건수 또는 실패 사유)를 그 자리에
  바로 보여준다.

## 5. Cron 스케줄 2~4시대 분산

기존 03:07(daily)/03:13(monthly) KST는 이미 정각은 피했지만 서로 6분 차이라 "분산"
취지에는 부족했다 — 사용자가 명시한 "2~4시 사이 애매한 시간"에 맞춰 daily를 **02:47
KST**, monthly를 **03:52 KST**로 멀리 떨어뜨렸다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(75파일 769건 — `settle-group-fetches.test.mjs` 4건, `fetch-with-
  timeout.test.mjs` 4건 신규, 5개 어댑터의 격리 관련 테스트 갱신/추가) 통과.
- `npm run build` 통과. `/api/admin/ingest/rerun`(GET 추가) 정상 등록 확인.

### 실측 검증(로컬 개발 서버)
- `GET /api/admin/ingest/rerun` → daily 4건/monthly 16건 소스 목록이 실제 STEPS
  배열 그대로 반환됨을 확인.
- Playwright로 `/admin/data-grid` 실제 화면에서 "🔁 개별 소스 수동 재수집" 패널이
  노출되고, 소스 드롭다운이 실제 API가 반환한 4개 daily 소스로 채워짐을 확인.

## 특이 사항
- `gg-culture-events-adapter.mjs`의 `transform()` 단계(`Promise.all([transformCulture
  Events, transformFoundationEvents])`)는 이번에 손대지 않았다 — 두 transform 함수
  모두 항목 단위 try-catch가 이미 있어(파싱 오류 시 해당 행만 건너뜀) 외부 API
  안정성과는 다른 성격(코드 버그 레벨)의 위험이라 이번 지시서(외부 API 격리) 범위
  밖으로 판단했다.
