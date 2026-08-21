# GgEventsAdapter VWorld 지오코딩 전환 + 최종 수집 시도 (Task 8-2 후속)

## 구현 대상
- `GgEventsAdapter`의 지오코딩 유틸리티를 Kakao(`KAKAO_REST_API_KEY`, 미보유)에서 VWorld(`VWORLD_API_KEY`, 보유)로 전환
- 전환 후 `npm run ingest:gg-events -- --dry-run`으로 135건(공공 수영장) + 1,170건(물놀이형 수경시설) 전체 지오코딩 검증 및 실제 upsert 시도

## 구현 일시
2026-08-21

## 변경 사항
- `scripts/ingest/adapters/gg-events-adapter.mjs`: import를 `./lib/kakao-geocoder.mjs`(`geocode`, `hasKakaoRestApiKey`)에서 `./lib/vworld-geocoder.mjs`(`geocode`, `hasVworldApiKey`)로 교체. 생성자의 키 부재 에러 메시지도 VWorld 기준으로 갱신
- 기존에 이미 `cultural-facility-summary-adapter.mjs`가 쓰고 있던 공용 `scripts/ingest/adapters/lib/vworld-geocoder.mjs`를 그대로 재사용(신규 파일 작성 없음 — 제5장 제4조 기존 구조 우선)
- `scripts/ingest/gg-events.mjs`: 진입점 주석의 "KAKAO_REST_API_KEY" → "VWORLD_API_KEY"로 갱신
- `scripts/ingest/adapters/gg-events-adapter.test.mjs`: 모킹 대상을 `./lib/kakao-geocoder.mjs` → `./lib/vworld-geocoder.mjs`로 교체, 생성자 테스트도 VWORLD_API_KEY 기준으로 갱신

## 검증 결과
### 코드/단위 테스트 (모두 통과)
- `gg-events-adapter.test.mjs` 11/11 통과 (VWorld 모킹으로 교체 후)
- `npx tsc --noEmit` / `npm run test`(전체 83/83) / `npm run build`: 모두 통과

### VWorld 실제 API 사전 검증 (와이어링 전)
- ROAD 타입 정상 응답 확인(표본: "경기도 남양주시 다산지금로 91" → `status: OK`, 좌표 반환)
- ROAD → PARCEL 폴백 동작 확인(표본: "경기도 수원시 권선구 세류동 1066-9" → ROAD는 `NOT_FOUND`, PARCEL은 `OK`)
- 에러 응답 형식 확인(`status: ERROR`, `error.code`/`error.text`)

### 실제 `--dry-run` 실행 결과 (핵심 발견 — VWorld 서비스 자체의 간헐적 장애)
1차 시도: 1,304/1,305건 지오코딩 실패(`HTTP 502 Bad Gateway` 또는 `fetch failed`). 2분 대기 후 재시도 시 495건 성공/809건 실패로 일부 개선됐으나 여전히 대량 실패(502 367건, 연결 실패 390건, 정당한 `NOT_FOUND`는 52건뿐).

**요청 속도(레이트리밋) 문제가 아님을 실측으로 확인**:
- 요청 간격을 200ms로 늘려 20건을 연속 호출했으나 20/20 전부 실패
- 그 직후 지연 없이 단일 호출을 재시도해도 502, 5초 간격으로 3회 재시도해도 전부 연결조차 안 됨(`HTTP 000`)
- 즉 내 어댑터의 호출 패턴과 무관하게 VWorld 서버 자체가 현재 간헐적으로 다운되고 있음(같은 세션 안에서 성공→대량실패→완전연결불가로 상태가 계속 변함)

## 결론 및 다음 단계
- **코드는 정상 동작이 실측으로 검증됨**: 495건이 실제로 성공해 정확한 좌표(예: "호평체육문화센터수영장" → 실제 위치와 일치하는 좌표)를 반환했다. ROAD→PARCEL 폴백도 정상 동작한다.
- **실DB 최종 적재는 보류**: 사용자 지시("여전히 502라면 대기 중임을 기록하고 보고")에 따라, VWorld 서비스가 불안정한 현재 상태에서 실제 upsert를 강행하지 않았다. 완전한 135+1,170건 커버리지를 보장할 수 없는 상태에서 실행하면 데이터 누락이 그대로 프로덕션에 반영되기 때문이다.
- **재개 조건**: VWorld(api.vworld.kr)가 안정화된 것을 확인한 후(단일 호출 및 연속 호출 모두 안정적으로 `HTTP 200`) `npm run ingest:gg-events -- --dry-run`을 재실행해 실패율이 정상 범위(순수 `NOT_FOUND`만 소수 남는 수준)인지 확인하고, 확인되면 `npm run ingest:gg-events`로 실제 upsert를 진행한다.
