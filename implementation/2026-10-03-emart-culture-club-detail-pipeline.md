# 이마트 컬처클럽 강좌 상세정보(설명/이미지) 1회성 수집 파이프라인

## 구현 대상
사용자 지시(2026-10-03) 연속 대화로 확정된 설계:
1. "이마트 강좌를 클릭했을때 그 클래스id로 보는 api로 해서 상세페이지도
   긁어오자" — 목록 배치(emart-culture-club.mjs)가 이미 수집한 `class_id`로
   상세설명/이미지를 추가로 가져온다.
2. "상세페이지도 접수마감인거 빼고 배치로 하루에 한번씩 가져오는건?" → (전체
   6,500건을 매일 다시 긁으면 1초 간격만 줘도 100분 넘게 걸린다는 지적 후)
   "하나의 강좌에 대하여 한번만 상세페이지꺼 가져와서 채우면돼.. 중요한거
   변해야하고 캐치해야하는게 그 status 이거 하나야" — **상세정보는 class_id당
   딱 한 번만** 수집하고(정적 콘텐츠), **상태(접수중/정원마감 등)는 이미 매일
   도는 목록 배치가 계속 갱신**하므로 이 파이프라인과는 무관하다는 역할 분리를
   명확히 했다.
3. "단건조회도 마찬가지로... 랜덤으로 좀 변폭을 줘 300ms ~ 1s 라던가" — 목록
   배치(1.0~1.5초)보다 짧지만 여전히 랜덤 범위를 둔 간격.

## 설계 배경 — 전체 재수집이 아니라 증분 수집인 이유
전체 6,520건을 매일 다시 긁으면(300ms~1초 간격 기준) 1~2시간이 걸려 부담이라는
사용자 지적에 따라, 상세설명/이미지가 **한 번 등록되면 거의 안 바뀌는 정적
콘텐츠**라는 점에 착안해 `detail_fetched_at`이 `null`인(아직 시도한 적 없는)
행만 대상으로 하는 증분 수집으로 설계했다. 첫 실행만 전체 백필(6,520건, 1~2시간
소요 예상)이고, 둘째 날부터는 그날 새로 추가된 강좌만 대상이라 훨씬 빠르다.

유저가 실제로 강좌를 클릭해서 보는 상세페이지 기능 자체(인앱)는 아직 없다 —
이번 범위는 어디까지나 관리자 검토용 데이터를 미리 채워두는 것이고, 실제 유저
대상 상세페이지는 "유저가 클릭하는 순간 classId 단건 조회로 가벼운 상태만
실시간 확인 + 미리 채워둔 설명/이미지는 DB에서 바로 표시"하는 구조로 나중에
별도 작업할 예정(이번 범위 밖, 대화로 합의됨).

## 변경 사항
### 1. `scripts/migrations/2026-10-03-emart-culture-club-detail-columns.sql`(적용 완료)
`emart_culture_club_classes`에 컬럼 추가: `class_detail_title`,
`class_detail_content`, `main_image_bucket/region/key`, `detail_fetched_at`.
`detail_fetched_at`을 "이미 시도했는지" 판정 기준으로 쓴다 — 실측 확인 결과
상세 내용이 정상적으로 빈 문자열("")인 케이스가 있어, content가 null/empty인
것만으로는 "아직 시도 안 함"과 "시도했는데 원래 비어있음"을 구분할 수 없기
때문이다.

### 2. `scripts/ingest/emart-culture-club-detail.mjs` + 테스트(신규, 5개)
`detail_fetched_at is null`인 행을 전부 조회(페이지네이션 — 아래 버그 수정
참고) → 각 `class_id`로 `classId` 필터 단건 조회(`getClassByFiltering`,
목록 배치와 동일한 API) → `classDetail`/`mainImage` 받아서 해당 행에 업데이트.
요청 사이 300ms~1초 랜덤 딜레이, 목록 배치와 동일한 브라우저 모사 헤더
(Origin/Referer/User-Agent/Accept-Language) 적용. 강좌가 그 사이 API에서
사라진 경우(드문 케이스)도 `detail_fetched_at`만 채우고 넘어가 무한 재시도를
막는다(에러로 처리하지 않음).

**실측으로 발견/수정한 버그**: 처음엔 `.limit(1000)`으로 대상을 조회했는데,
dry-run 결과가 정확히 1000건으로 나와 의심 — PostgREST 기본 max-rows(1,000)에
걸려 실제 6,520건 중 1,000건만 보이고 있었다(이 프로젝트에서 이미 여러 번
겪은 동일한 문제, `get-nearby.ts`의 `getSpotsByServiceCategory`와 동일한
`.range()` 페이지네이션 패턴으로 수정). 수정 후 dry-run이 정확히 6,520건을
보고하는 것으로 확인했다 — "첫날 전체 백필"이 실제로 하루 안에 끝나려면 이
수정이 필수였다.

### 3. 레지스트리/배치 자동화
- `scripts/ingest/lib/pipeline-agent-registry.mjs`: `EMART_CULTURE_CLUB_DETAIL` 등록.
- `.github/workflows/emart-culture-club-detail-batch.yml`(신규): 매일 KST 새벽
  5시(UTC 20:00, 목록 배치 KST 04:00 이후 1시간 뒤) + workflow_dispatch.
- `package.json`: `ingest:emart-culture-club-detail` 스크립트 추가.

## 검증
- `npx vitest run emart-culture-club-detail.test.mjs` 5개 통과.
- 실제 API로 dry-run 검증: 수정 전 1,000건(버그) → 수정 후 6,520건(정상) 확인.
- `npx tsc --noEmit` / `npm run test`(255개 파일 2,678개) / `npm run build`
  전부 통과.
- 실제 전체 백필 실행은 1~2시간 소요 예상이라 커밋/검증과 별도로 백그라운드
  실행 후 결과를 후속 기록한다(아래 참고).

## 특이 사항 / 남은 작업
- 유저가 실제로 보는 상세페이지(인앱 클릭 → classId 단건 실시간 조회 + 캐시된
  설명/이미지 표시) 기능 자체는 이번 범위 밖 — 다음에 별도 작업 필요.
- GitHub Secret(`EMART_CULTURE_CLUB_API_KEY`)은 이미 등록됨(사용자 확인,
  2026-10-03) — 이 신규 워크플로도 같은 secret을 그대로 재사용한다.
