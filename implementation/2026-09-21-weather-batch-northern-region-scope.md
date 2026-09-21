# [기상청 날씨 배치 — 북부 지역으로 스팟 범위 추가 축소]

## 구현 대상
`implementation/2026-09-21-weather-batch-quota-exceeded-fix.md`가 남긴 "잔여
위험"(하루 4회로 줄여도 여전히 약 15,784건/일 필요, 공공데이터포털 미승인
개발계정 한도를 넘을 수 있음)에 대한 후속 조치. 사용자 지시(2026-09-21):
"일단 그러면 api 트래픽 한도 관련 10000건으로 보고 더 줄여보자 스팟을 일단
서울 경기 강원 쪽하고 그 아래까지 해서 북부쪽으로 해봐.."

## 실측
운영 DB(`open_spaces`, `location_precision='EXACT')`를 직접 조회해 확인:

| 구분 | 스팟 수 |
|---|---|
| 전국 EXACT 스팟 | 140,757 |
| 북부(서울/인천/경기/강원/충북/충남/대전/세종) | 86,667 |
| 남부(그 외 8개 광역) | 53,223 |
| 판별 불가(주소 이상값 — 안전하게 제외) | 867 |

"서울 경기 강원 쪽하고 그 아래까지"(사용자 원문)를 강원 바로 아래 광역인
충청권(충북/충남/대전/세종)까지 포함하는 것으로 해석했다.

- 북부만 대상으로 하면 고유 5km 격자가 3,946개 → **1,740개**로 감소.
- 하루 4회(직전 조치로 이미 감축된 빈도) 기준 API 호출량이 약 15,784건 →
  **약 6,960건**으로 감소 — 사용자가 이번에 가정한 일일 한도(10,000건)에
  약 30% 여유를 두고 들어온다.

## 변경 사항

### `scripts/ingest/lib/province-region.mjs` (신규)
`src/lib/spaces/province.ts`(스팟픽 지도 도 단위 필터)의 광역 접두어
정규화 규칙(`PROVINCE_PREFIXES`)을 그대로 복제했다 — `scripts/`는 `src/`를
import할 수 없어 부득이한 중복이며, 파일 상단에 "province.ts를 고치면 이
파일도 함께 고칠 것"이라는 동기화 관례 주석을 남겼다(`category-maj-
taxonomy.mjs`와 동일 패턴).

**의도적으로 반대로 뒤집은 기본값**: `province.ts`의 `isSpotInProvinces`는
도 단위 판별이 불가능하면 "포함"을 기본값으로 한다(콘텐츠를 근거 없이
숨기지 않기 위함, 원본 주석: "사용자에게 보여야 할 스팟을 근거 없이 숨기지
않는다"). 이번 `isNorthernRegionSpot`은 반대로 판별 불가 시 **제외**를
기본값으로 했다 — 이 배치의 목적이 "API 호출량을 확실히 줄이는 것"이라
콘텐츠 노출 극대화와는 정반대 방향의 안전값이 맞기 때문이다. 실측상 판별
불가 스팟은 867건/140,757건(약 0.6%)로 소수라 영향은 미미하다.

### `scripts/ingest/adapters/kma-weather-adapter.mjs`
- `fetchAllExactSpots(client, { regionScope })`: `select`에 `address,
  sigungu_name`을 추가하고, `regionScope === 'northern'`(기본값)이면
  `isNorthernRegionSpot`으로 페이지네이션 중 걸러낸다. 반환값을 배열에서
  `{ spots, excludedByRegion }` 객체로 바꿔 제외 건수를 상위로 전달한다
  (기존 호출부/테스트는 이 시그니처 변경에 맞춰 함께 수정).
- `run()`: `WEATHER_BATCH_REGION_SCOPE` env var(`'northern'`|`'nationwide'`,
  기본 `'northern'`)로 범위를 읽고, 콘솔 로그에 "지역 범위: northern"과
  "지역 범위 밖 제외 N건"을 남겨 GitHub Actions 실행 로그만 봐도 이번 실행이
  몇 건을 제외했는지 바로 알 수 있게 했다(요구사항: 실행 로깅에 필요한
  수치를 투명하게 남길 것).
- CLI `--nationwide` 플래그 추가(로컬 수동 검증용, env var와 동일 효과).

**되돌리기 쉽게 설계한 이유**: 이 축소는 사용자가 명시한 "즉시 완화" 조치이지
영구적인 제품 범위 결정이 아니다(제3장 제5조 추측 금지 — "남부 스팟엔 날씨를
영구히 안 보여줘도 된다"는 판단은 임의로 내리지 않았다). 공공데이터포털에서
한도 증량이 승인되는 등 사정이 바뀌면, `.github/workflows/ingest-weather.yml`의
`WEATHER_BATCH_REGION_SCOPE: northern`을 `nationwide`로 한 줄만 바꿔 코드
배포 없이 전국 범위로 되돌릴 수 있다.

### `.github/workflows/ingest-weather.yml`
새 주석 블록 추가(위 실측 수치 요약 + 되돌리는 방법) + 스텝 env에
`WEATHER_BATCH_REGION_SCOPE: northern` 명시. cron 빈도(하루 4회, `47
2,8,14,20 * * *`)는 이번 변경과 무관해 그대로 유지.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 193개 파일 2232개 통과(신규 8개 — `province-region.test.mjs`
  6개 + `kma-weather-adapter.test.mjs`에 지역 필터 테스트 1개 추가 + 기존
  2개 테스트를 새 반환 시그니처(`{ spots }`)와 `regionScope: 'nationwide'`
  명시로 수정).
- `npm run build` 통과.
- 실측 수치(86,667/53,223/867, 1,740격자, 6,960건/일)는 위 "실측" 절 참고 —
  운영 DB에 대해 직접 쿼리한 임시 진단 스크립트로 확인 후 삭제했다(영구
  코드베이스에는 포함하지 않음).

## 특이 사항
- 이번 변경으로 **남부 지역 스팟(53,223건)은 당분간 `spot_weather_caches`가
  갱신되지 않는다** — 기존에 캐시가 있던 스팟은 마지막 값이 그대로 남고,
  캐시가 없던 스팟은 계속 비어 있다. 사용자 화면(날씨 위젯)에 미치는 영향은
  이번 작업 범위에서 별도로 검토하지 않았다 — 필요하면 알려주면 된다.
- 6,960건/일도 여전히 추정치(사용자가 가정한 10,000건 한도 자체가 실제
  승인된 한도인지는 공공데이터포털 콘솔에서 직접 확인해야 확실하다).
