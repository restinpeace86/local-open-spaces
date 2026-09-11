# Event↔Spot 양방향 링킹 (+ 개선사항9 스킵 기록) — Step 114

## 개선사항9 — 스킵(보류) 기록
`implementation/todo.md` 개선사항9: "체육시설 대분류와 축구장/농구장 등 시설 대관
예약관련 seoul_public_reservation 원천 데이터가 open_spaces에 보이는데 events로
이관해달라."

### 스킵 사유
`project/decision-log.md` **Decision 017**(2026-08-25, 상태: 승인) 2항이 이미
"데이터 속성에 따라 `open_spaces`(공간/시설: `체육시설`/`공간시설`) 및
`events`(행사/체험/클래스: `문화체험`/`교육강좌`) 테이블로 적합 매핑"을 명시적으로
결정했고, `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`의 `MAXCLASSNM_TABLE`
매핑(체육시설→open_spaces, 공간시설→open_spaces, 문화체험→events, 교육강좌→events)이
그 결정을 정확히 구현하고 있다(실측 확인). 오늘 지시는 그중 체육시설/공간시설
분류만 뒤집어 events로 보내라는 것이라 **승인된 아키텍처 결정과 직접 상충**한다.

### 처리 근거
- CLAUDE.md 제0조(사전 준수 확인): "Decision과 지금 하려는 작업이 상충하면 즉시
  중단하고 스킵 처리하라."
- 이 저장소에는 이미 동일한 상황의 선례가 있다 — **Decision 022**는 앞서
  "반경 컷오프 폐지"/"노출 중분류 전면 전환"이 각각 `spec/map/spatial-search.md`
  및 실측 데이터 커버리지와 충돌해 먼저 스킵됐다가, 사용자가 직접 재확인 후
  새 Decision으로 명시적으로 재승인한 절차를 따랐다. 임의 판단으로 기존 승인
  결정을 뒤집지 않는다(제5장 제3조 임의 판단 금지 — 데이터 구조/공개 범위 변경).

### 재개 조건
사용자가 Decision 017의 체육시설/공간시설 분류를 재검토하고 명시적으로
재승인(새 Decision 기록)하면, `MAXCLASSNM_TABLE`의 `체육시설`/`공간시설` 매핑을
`'open_spaces'` → `'events'`로 바꾸고, 기존에 이미 적재된 seoul_public_reservation
체육시설/공간시설 레코드의 재배치(마이그레이션) 작업을 진행한다.

---

## 개선사항10: Event↔Spot 양방향 링킹

### 구현 대상
`events` 테이블에 `open_spaces` FK를 추가하고, 자동 매칭 + 관리자 수동 지정 +
유저 화면 양방향 네비게이션을 구현한다.

### 구현 일시
2026-09-11

### 실측 확인 — FK 컬럼은 이미 존재함
`information_schema.columns`/`pg_constraint`를 프로덕션 DB에 직접 조회해 확인:
`events.space_id`(uuid) 컬럼과 `events_space_id_fkey`(`FOREIGN KEY (space_id)
REFERENCES open_spaces(id) ON DELETE SET NULL`) 제약이 **이미 존재**했다
(project/database_schema.md 3.2에도 문서화돼 있었음). 다만 어떤 수집 어댑터도
이 컬럼을 채운 적이 없어(실측: scripts/ingest 전체 grep 결과 0건) 전량 NULL이었다.
요구사항 원문의 컬럼명(`open_space_id`)과 실제 컬럼명(`space_id`)이 다르지만,
동일한 목적의 기존 컬럼을 재사용하는 것이 제5장 제4조(기존 구조 우선)에 부합해
새 컬럼을 추가하지 않고 그대로 썼다.

### 변경 사항

#### `scripts/migrations/2026-09-11-match-events-to-open-spaces.sql` (적용 완료)
- 일회성 배치 매칭: `space_id IS NULL`인 이벤트만 대상으로, 좌표 30m 이내(기존
  `find_nearby_open_spaces` RPC의 "중복 스팟 검토" 반경과 동일 기준 재사용) +
  `venue_name`↔`open_spaces.name` 양방향 부분 문자열 일치를 모두 만족할 때만
  연결한다(잘못된 링크가 링크 없음보다 나쁘다는 원칙 — 관리자 수동 지정이 이미
  최종 폴백으로 준비돼 있음). `space_id IS NULL` 조건 덕분에 몇 번을 재실행해도
  이미 연결된 것을 건드리지 않는다(멱등 — 신규 이벤트 유입 시 재실행 가능).
- **실측 검증**: 프로덕션에 적용 전 SELECT로 건수(11,977건)와 샘플 40건을 직접
  확인 — "노원문화원 1층 다목적공연장"↔"노원문화원", "청계천박물관 로비전시실"
  ↔"청계천박물관"처럼 대부분 거리 0m의 정확한 건물 단위 매칭이었다. 적용 후
  `events.space_id IS NOT NULL` 카운트가 11,977건으로 정확히 일치함을 재확인.

#### `src/lib/home/get-home-feed.ts`
- `EVENT_COLUMNS`/`EventRow`/`toEventItem`, `SPACE_COLUMNS`/`SpaceRow`/
  `toSpaceItem`을 export로 전환 — 새 링크 조회 라우트가 단일 행을 NearbyItem으로
  매핑할 때 필드 목록을 다시 베끼지 않고 재사용한다(제5장 제4조).

#### `src/app/api/admin/data-grid/space-link/route.ts` (신규)
- `PATCH { id, space_id }` — events.space_id를 직접 갱신(service_role). 기존
  `/api/admin/data-grid/location` 라우트와 동일 관례.

#### `src/app/api/admin/data-grid/route.ts` / `data-grid-client.tsx`
- `EVENTS_COLUMNS`/`AdminEventRow`에 `space_id` 추가(목록·상세 조회 모두 반영).

#### `src/components/admin/raw-data-modal.tsx` (신규 `SpaceLinkEditor`)
- events 탭 상세 팝업에 "연결된 스팟" 편집기 추가 — 기존 `SpotPicker`(맘스픽
  글쓰기 스팟 검색: 내부 DB→카카오 로컬 Fallback→미등록 장소 Auto-Upsert)를
  그대로 재사용해 "관리자가 수동으로 스팟을 지정하거나 신규 등록"을 한 번에
  만족시켰다(제5장 제4조 — 검색/신규 등록 로직을 다시 만들지 않음).

#### `src/app/api/events/linked-spot/route.ts` / `src/app/api/spots/linked-events/route.ts` (신규, 공개 조회)
- 각각 이벤트→연결된 스팟 1건, 스팟→연결된 진행중/예정 이벤트 목록(최대 10건,
  `is_active=true` + `end_date >= 오늘`)을 조회한다. NearbyItem/RPC에 필드를
  얹지 않고 DetailModal이 필요할 때만 조회하는 기존 패턴(개선사항8 큐레이션
  블로그와 동일)을 그대로 따른다.

#### `src/components/map/detail-modal.tsx`
- `linkedSpot`/`linkedEvents`/`linkedDetailItem` state + 조회 effect 2개 추가.
- 이벤트 분기: 미니맵(7단) 바로 위에 "📍 연결된 장소: {이름} ›" 탭 가능한 행
  (연결 없으면 렌더링 안 함).
- 스팟 분기: 상세 정보(`<dl>`) 바로 아래·미니맵 위에 "🎪 진행 중인 이벤트" 목록
  (0건이면 섹션 전체 숨김, 요구사항 원문).
- 둘 다 탭하면 `linkedDetailItem`을 설정해 **`DetailModal`이 자기 자신을 중첩
  렌더링**한다 — `DetailModal`을 쓰는 15개 이상의 부모 화면 각각에 네비게이션
  콜백을 추가하는 대신, 완전히 자기완결적인 방법을 택했다(제5장 제4조 —
  최소 변경 범위로 요구사항 충족).

### 건드리지 않은 것
- 자동 매칭은 라이브 수집 파이프라인(20개 이상 어댑터)에 넣지 않고 별도
  일회성/재실행 가능 배치 스크립트로 뒀다 — 매 어댑터를 개별 수정하는 회귀
  위험을 피하고, 신규 이벤트가 쌓이면 이 스크립트를 다시 돌려 채우는 구조다.

### 검증
- 프로덕션 DB 직접 조회로 매칭 결과(건수+샘플) 실측 확인.
- `npx tsc --noEmit` 통과.
- `npm run test`: 130 파일 1508건 통과 — 신규 8건(DetailModal 양방향 링킹 4건,
  RawDataModal 연결된 스팟 편집기 4건).
- `npm run build`: Compiled successfully. 신규 라우트
  `/api/admin/data-grid/space-link`, `/api/events/linked-spot`,
  `/api/spots/linked-events` 정상 등록 확인.

### 특이 사항
- todo.md의 모든 개선사항(1~10)에 대한 조치가 이번 스텝으로 완료됐다(개선사항7-1
  가격 크롤링은 별도 어댑터 조사가 선행돼야 함을 확인 후 보류, 개선사항9는
  Decision 017 충돌로 스킵). 다음 자율 실행 사이클은 todo.md에 새 지시가
  추가되기를 기다리거나, 사용자가 보류 항목(7-1 어댑터 조사, 9 재승인)에 대한
  의사결정을 내려주면 그에 따라 진행한다.
