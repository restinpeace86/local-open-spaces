# 문화센터 Branch-First 반경 필터 + 계층형 지점 다중선택 + 이마트 배치 디스코드 알림

## 구현 대상
- `todo.md` [개선사항 1]: 위치 기반 성능 최적화(Branch-First + 반경 필터),
  계층형 지점 선택 UI/UX(다중선택).
- `todo.md` [개선사항 2]-4: 이마트 배치 결과 디스코드 웹훅 알림.

## 구현 일시
2026-10-07

## 변경 사항

### 1. Branch-First 성능 최적화 + 반경 필터
`/api/culture-club/search`를 재구성했다. 기존엔 (나이/브랜드 등으로)
필터링된 강좌 전체를 안전상한(5,000건)까지 끌어와 메모리에서 거리를
계산해 정렬했다. 이제는 반대 순서다:
1. 지점(124개뿐)의 좌표를 먼저 전부 가져와 거리를 계산한다.
2. 반경(`radius_km`, 기본 10km, 선택 가능 5/10/20km) 밖의 지점은 제외한다.
3. 브랜드/선택된 지점(`store_codes`)으로 한 번 더 좁힌다.
4. 남은 지점들에 소속된 강좌만 `culture_club_classes`에서 조회한다
   (brand+store_code를 OR로 묶은 추가 필터).

반경이 좁을수록 조회 대상 강좌 수 자체가 줄어 훨씬 빠르다(실측: 반경
10km에서 1,471건, 5km에서 124건으로 줄었다 — 서울시청 기준).

반경을 벗어나 후보 지점이 0개면 DB를 아예 조회하지 않고 즉시 빈 결과를
반환한다. 지점 좌표가 없는 지점(아직 지오코딩 안 된 지점)은 "가깝다"고
추측하지 않고 애초에 후보에서 빠진다(이전엔 null 거리로 맨 뒤에 노출됐으나,
이제는 필터링 자체가 지점 좌표 기준이라 보이지 않는다 — 의도된 동작 변경).

버그 수정: `Number(searchParams.get('lat'))`가 파라미터 부재 시 `null`을
`0`으로 바꿔버려(`Number.isFinite(0)===true`) 위치를 안 보낸 요청도
"위치 있음"으로 잘못 판별되는 숨은 버그를 발견해 고쳤다(실측 — 단위
테스트에서 발견).

### 2. 계층형 지점 선택 — 다중선택으로 전환
기존 단일 `<select>`(첫 지점을 자동 선택)를 반경 내 지점만 보여주는
다중선택 뱃지로 바꿨다. 아무 지점도 선택하지 않으면 "반경 내 전체 지점"과
동일하게 취급한다(자동으로 첫 지점을 골라두지 않음).

`/api/culture-club/stores`, `/api/culture-club/lottemart-stores`가
`lat`/`lng`/`radius_km`을 받아 반경 내 지점만 거리순으로 돌려주도록
확장했다(`distanceMeters` 포함, UI에서 "고양점 · 3.2km"처럼 보여줄 수
있게). 공통 로직은 `src/lib/home/culture-club-nearby-stores.ts`로 분리해
검색 API의 Branch-First 거리 계산과 같은 RPC(`get_culture_club_store_
coordinates`)를 재사용한다.

반경 선택 pill(5/10/20km, 기본 10km)은 검색창 위쪽, 아이 연령 배너
바로 아래에 배치했다(지점을 먼저 좁히는 기준이라 브랜드 선택과 무관하게
항상 보인다).

### 3. 이마트 배치 — 디스코드 결과 알림
`scripts/notify-discord.mjs`를 CLI 전용에서 재사용 가능한
`sendDiscordNotification()` export 함수로 리팩터링했다(기존 하네스
CLI 호출 방식은 그대로 유지, 하위 호환). `scripts/ingest/emart-culture-
club.mjs`의 `run()`이 성공/실패 시 각각 수집 건수(상태별 집계)와 소요
시간을 담아 전송하도록 연결했다. 알림 전송 자체가 실패해도 배치 결과에는
영향을 주지 않는다(`postPipelineLog`와 동일한 "부가 작업" 패턴).

## 스킵된 항목 (todo.md에 상세 기록)
- "아이 이름"을 selectBox에 표시: `profiles`에 아이 이름 컬럼이 없어
  스킵(온보딩 Spec 변경 선행 필요).
- Node.js 내장 cron(node-cron/setInterval)으로 주기 실행: 이미 Windows
  작업 스케줄러로 해결돼 있어 스킵(중복 실행 방지).
- 지점별 순차 루프+딜레이: 2026-10-06에 "로컬 PC는 WAF에 안 막힌다"는
  실측으로 이미 되돌린 결정과 충돌해 스킵.

## 검증
- `npx tsc --noEmit` / `npm run test`(279개 파일 2,883개) / `npm run build`
  전부 통과.
- 개발 서버에서 실제 curl로 확인: 반경 10km→1,471건, 5km→124건(컷오프
  정상 동작), `store_codes` 필터가 선택한 지점으로만 좁히는지, 위치 없는
  요청은 기존 날짜순 폴백 그대로인지 모두 실측 확인.
- `node scripts/ingest/emart-culture-club.mjs --dry-run`으로 import 변경이
  정상 동작하는지(실제 이마트 API 호출까지) 확인.
