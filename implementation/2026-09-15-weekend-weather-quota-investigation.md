# [주말 날씨 미노출 원인 조사 및 에러 구분 보완]

## 조사 대상
사용자 지시(2026-09-15): "근데 왜 주말꺼 날씨는없지 ? 몇일 뒤 날씨나 미세먼지도
받아올텐데 ?? 한번 확인해줘봐..."

## 조사 일시
2026-09-15 ~ 2026-09-16

## 결론
어제(2026-09-15, 화요일) 주말(토/일) 탭에 날씨가 안 뜬 것은 **KMA(기상청)
`getVilageFcst`(단기예보) API의 `PUBLIC_DATA_API_KEY` 일일 호출 한도가 그 시점에
이미 소진되어 있었기 때문**이다. 실측으로 직접 원본 API를 호출해 확인했다:

```
HTTP 429
{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{
  "errMsg":"LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
  "returnAuthMsg":"일일 서비스 요청제한 횟수 초과 에러","returnReasonCode":"22"}}}
```

이는 "그 날짜가 예보 가능 범위 밖이라 데이터가 없는" 정상 상황(HTTP 200 +
빈 슬롯)과는 원인이 완전히 다른 별도 장애다. 날짜가 바뀐 오늘(2026-09-16) 같은
호출을 다시 해보니 한도가 초기화되어 정상 응답(HTTP 200)으로 돌아온 것도
확인했다 — 즉 "자정(KST) 기준 일일 한도 초기화 후 자연 해소"라는 진단이 맞다.

### 별개로 확인한 사실: KMA 단기예보 자체의 데이터 범위 한계
한도 소진과는 별도로, KMA `getVilageFcst`는 원래도 발표 시점 기준 **최대 약
3일치**만 예보 슬롯을 내려준다. 화요일에 요청하면 최신 발표에 토/일 슬롯이 아직
없을 수 있어, 한도가 정상이었어도 주 초반에는 주말 예보가 비어 보일 수 있다.
즉 이번 화요일 사례는 **① 한도 소진 + ② 원래도 요일에 따라 발생 가능한 예보
범위 한계**가 함께 작용했을 가능성이 높다 — 어느 한 쪽이 100% 원인이라고
단정할 근거(요청 시점 로그)는 없었으므로 둘 다 사실 그대로 기록한다(제3장
제5조 추측 금지).

### 미세먼지(에어코리아)는 원래 구조적으로 미래 예보가 없음
`resolveWeatherSnapshot`(`src/lib/ai-chat/weather-reaction.ts`)은 오늘이 아닌
날짜에는 애초에 `pm10Grade`/`pm25Grade`를 항상 `null`로 둔다 — 에어코리아
`getCtprvnRltmMesureDnsty`는 "실시간 측정" 전용 API라 미래 미세먼지 예보 자체가
존재하지 않기 때문이다(2026-09-01 구현 당시부터의 의도된 설계, 버그 아님).
따라서 "몇일 뒤 미세먼지"는 이번 원인 소진과 무관하게 **어떤 국내 공공 API로도
근본적으로 제공 불가능**하다 — 이 서비스만의 제약이 아니라 데이터 자체가 없다.

## 발견된 부가 문제: 원인이 로그에 전혀 남지 않음
`resolveWeatherSnapshot`의 기존 코드는 외부 API 실패를 완전히 침묵 삼켰다:
```ts
try { forecast = await fetchLiveForecastForDate(...); }
catch { forecast = null; } // 원인 정보 전부 소실
```
그 결과 "한도 초과로 실패"와 "네트워크 오류로 실패"와 "정상적으로 예보 범위
밖"이 전부 사용자에게는 물론 서버 로그에도 동일하게 `available:false`로만
보여 이번처럼 원인 파악에 API를 직접 재현 호출해야 했다.

## 변경 사항 (원인 재발 시 재조사 없이 바로 진단 가능하도록)
### `src/lib/ai-chat/kma-forecast.ts`
`fetchVilageFcstRaw`가 data.go.kr의 한도 초과 전용 에러 봉투
(`OpenAPI_ServiceResponse.cmmMsgHeader`, 일반 `{response:{header,body}}` 형태와
다름)를 HTTP 상태와 무관하게 우선 검사해 `"KMA getVilageFcst 일일 호출 한도
초과(...)"`라는 명확히 구분되는 메시지로 던지도록 수정.

### `src/lib/ai-chat/weather-reaction.ts`
`resolveWeatherSnapshot`의 catch 블록에서 에러를 완전히 삼키지 않고
`console.error`로 원인을 남기도록 수정. 사용자 응답(`available:false`)은
그대로 유지 — 제5장 제11조(서비스 중단 없이 우아하게 처리)는 그대로 지키되,
운영 로그에서는 원인이 보이게 했다.

## 이번 범위에서 의도적으로 손대지 않은 것
- **KMA 중기예보(`getMidLandFcst`/`getMidTa`, 4~10일 후, 기온/하늘상태만,
  미세먼지 없음) 연동은 이번에 구현하지 않았다.** 이는 새로운 외부 API를 추가로
  연동하는 신규 기능 범위라 승인된 Spec에 없는 임의 기능 추가 금지(제7장
  제1조)에 해당한다 — 필요하면 제안으로 남기고 승인 후 별도 작업으로 진행한다.
- 다른 인제스트 어댑터(`scripts/ingest/adapters/*.mjs`, TourAPI/AirKorea/
  GoCamping 등)도 전부 동일한 `PUBLIC_DATA_API_KEY`를 공유해 같은 한도 소진의
  영향을 받을 수 있음을 확인했으나, 이번 사용자 질문 범위(주말 날씨 위젯)를
  벗어나므로 해당 스크립트들은 수정하지 않았다 — 별도 확인이 필요하면 후속
  지시로 진행한다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1780개, 신규 1개 포함), `npm run build`
  모두 통과.
- 신규 단위 테스트로 한도 초과 응답(HTTP 429 + `OpenAPI_ServiceResponse` 봉투)이
  `/일일 호출 한도 초과/` 메시지로 구분되어 던져지는 것을 확인.
- 실측: 2026-09-15 원본 API 호출 시 HTTP 429 + 한도 초과 봉투 확인 → 2026-09-16
  같은 호출 재현 시 HTTP 200 정상 응답으로 복귀 확인(자정 기준 자연 해소).
