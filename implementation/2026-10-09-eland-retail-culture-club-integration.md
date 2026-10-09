# 이랜드리테일 문화센터 연동 — 8번째 브랜드

## 구현 대상
사용자 요청(2026-10-09): "erand etail 꺼고 지점은 6개 있어. LecTypeID가
B, C , D, F , K,J , L, M 인게 우리 연령대상꺼인거 같아." +
`https://www.elandretail.com/m/culture/culture02.do` 캡처 → 조사 결과
공유(J/K 불확실성 보고) → "K 중도수강도 포함해 이거 연령이 성인꺼도
나와있는데 아이꺼도 있는거 확인했어. J도 뭐 일단은 포함시켜 나도 0건이라
확인은 못했어"로 포함 확정 → 구현.

Decision 028(5개 브랜드) → AK플라자/스타필드로 6개 → 롯데백화점으로
7개 → 이번이 **8번째**(scripts/migrations/2026-10-09-eland-retail-
brand-and-category.sql).

## 구현 일시
2026-10-09

## 실측 확인 — 조사 결과

### 지점 — 6개, 전용 select 옵션에서 직접 확인
`culture02.do`의 `<select id="StoreID">` 옵션 텍스트로 6개 전체
코드-이름 확보: 8202(야탑)/8205(평촌아울렛)/8206(강남패션)/8212(순천)/
8222(부천)/8224(송파). 내부 명칭이 실제 건물명과 다른 경우가 있어(아래
"지점 지오코딩" 참고) 실측으로 건물명을 따로 확인했다.

### LecTypeID — select 옵션 전부 확인, A/E/G/X는 성인·미술관 라벨로 제외
`<select id="LecTypeID">` 옵션 라벨 전부 확인: A=성인/E=성인단기/
G=성인일일/X=미술관은 라벨 자체가 비아동 대상이라 제외(추측이 아니라
라벨로 확정). 사용자가 지정한 B/C/D/F/K/J/L/M 8개를 그대로 채택.
B/C/D/F/L/M은 실제 강좌 제목에 연령이 명확히 박혀있어 확인됨(예:
"(11-20개월)"). J/K는 사용자 지시로 포함 확정 — K는 성인/아동 강좌가
섞여 있음을 사용자가 직접 확인했고(제목 기반 연령 필터가 사후에 자연히
걸러줌, 별도 특수처리 불필요), J는 조사 시점 기준 0건이라 양쪽 다 확인은
못 했지만 사용자 지시대로 포함.

### LecTypeID 다중값 — 콤마로 묶으면 깨짐, 8번 따로 요청
실측 확인: `LecTypeID=B,C` → 0건. 8개 코드를 전부 따로 조회해야 한다.
단 `StoreID`는 비우면 6개 지점 전체가 합쳐져 나오고(지점별 순회 불필요),
`PageSize=1000`으로 페이지네이션 없이 전량 한 번에 수신된다 — 총
8번의 HTTP 요청으로 전량 수집(다른 브랜드들보다 적음).

### 상태값 — "신청현황" select 옵션에서 코드/라벨 전부 확인
03=수강신청/04=대기신청/01=현장문의/05=온라인 접수마감/02=마감. 목록
응답의 `<mark>` 텍스트는 코드가 아니라 이 라벨 그대로 나온다.

**실측 특이사항**: 조사~구현 시점 기준 전체 지점·전체 카테고리를 통틀어
수강신청/대기신청 상태인 강좌가 하나도 없었다(상세 페이지의 "온라인
수강신청 접수 가능시간이 아닙니다" 안내로 보아 온라인 접수가 상시가 아니라
특정 시간대에만 열리는 구조로 보인다 — 추측 금지, 실측 사실만 기록). 이
때문에 실제 배치 실행에서 `저장 대상 0건`이 나왔는데, 이는 파싱 버그가
아니라 사이트 자체의 현재 상태다 — 다른 브랜드와 동일한 "비활성 제외"
정책(`splitOpenAndClosedRows`)이 그대로 적용된 결과이며, 접수가 열리는
시간대에 예약 배치가 돌면 자연히 채워진다(자가 치유).

### 목록이 상세보다 충분히 풍부 — 롯데백화점과 반대 설계
목록 카드(`<li><a onclick="culture04(storeId,semNum,lecTypeId,seq)">`)
안에 요일·시간·가격·지점명·제목(연령 포함)이 전부 들어있어, 대부분의
다른 브랜드(AK플라자/스타필드/현대/신세계)와 같은 "목록이 주 데이터
소스, 상세는 보조 enrichment" 설계를 그대로 따른다. 상세 페이지
(`culture04.do?storeid=...&semnum=...&lectypeid=...&seq=...`)는
강의실/정확한 강의 시작·종료일/정원/재료비/교재비/첫시간 준비물/강좌
소개만 추가로 제공 — `instructor_name`(강사명)은 목록·상세 모두
"전문강사" 플레이스홀더뿐이라 실제 강사명을 전혀 알 수 없어 항상 `null`
로 고정(지어내지 않음).

### 지점 지오코딩 — 내부 명칭이 실제 건물명과 달라 수동 매핑
"평촌아울렛"/"강남패션" 같은 내부 명칭으로 카카오 검색하면 0건 또는
오매칭이 나와(실측 확인), 실제 건물명을 직접 찾아 지점별 전용 검색어를
하드코딩했다: 8202→"NC백화점 야탑점", 8205→"뉴코아아울렛 평촌점",
8206→"뉴코아아울렛 강남점", 8212→"NC백화점 순천점", 8222→"NC백화점
부천점", 8224→"NC백화점 송파점".

## DB 변경
`scripts/migrations/2026-10-09-eland-retail-brand-and-category.sql`
(적용 완료): `culture_club_classes_brand_check` 제약에
`'eland_retail'` 추가 + 신규 카테고리 `아울렛문화센터` 생성(백화점/
쇼핑몰과 다른 유통 포맷이라 재사용 대신 신규 — 2026-10-08 백화점문화센터
생성 전례와 동일 기준) + `get_culture_club_store_coordinates()` RPC에
신규 카테고리 반영.

## 변경 사항
- `scripts/ingest/lib/eland-retail-culture-club-parser.mjs`(신규): 지점
  6개, LecTypeID 8개 코드/라벨, 상태 정규화, 요일/시간/가격/연령 파싱,
  카드 파싱(class_id = "storeId_semNum_lecTypeId_seq").
- `scripts/ingest/eland-retail-culture-club.mjs`(신규): LecTypeID 8개
  × 요청 1번씩(StoreID 비움, PageSize=1000), `splitOpenAndClosedRows()`,
  확장된 `fetchDetailEnrichmentByClassId()`(classroom/schedule_start_
  date/schedule_end_date/class_material_fee). 봇 차단 신호가 발견되지
  않아 롯데백화점처럼 4~6시간 랜덤 다중시간 주기를 두지 않고 표준 일일
  배치 지연(`MAX_STARTUP_DELAY_MS=10분`)만 적용.
- `scripts/ingest/eland-retail-culture-club-detail.mjs`(신규): th/dd
  파싱(강의실/정확한 일정/정원/재료비/교재비/준비물/소개 텍스트), 핵심
  컬럼 UPDATE + 나머지는 raw_extra merge.
- `scripts/ingest/eland-retail-culture-club-stores.mjs`(신규): 6개
  지점을 실제 건물명 검색어로 `open_spaces`(아울렛문화센터)에 지오코딩
  등록.
- `scripts/ingest/lib/culture-club-unified-row.mjs`: `toUnifiedElandRetailRow`
  추가(목록-중심 설계, instructor_name 항상 null 고정).
- 프론트엔드/관리자 화면: `culture-club-options.ts`(브랜드 옵션,
  `buildElandRetailDetailUrl` — class_id를 분해해 딥링크 재구성),
  `culture-club-tab-view.tsx`, `search/route.ts`(VALID_BRANDS +
  `EXTERNAL_ID_BRAND_ALIASES`에 `eland → eland_retail` 처음부터 등록 —
  AK플라자 때 겪은 브랜드명 불일치 버그를 재현하지 않기 위해 선제 대응),
  `culture-club-panel.tsx`(브랜드 pill + 지점 목록 Promise.all 확장) +
  `eland-retail-stores/route.ts`(신규).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(314개 파일 **3,169개**,
  이랜드리테일 신규 테스트 전부 포함) / `npm run build` 전부 통과.
- 지점 지오코딩 실제 upsert: 6/6 성공.
- 목록 배치 실제 실행: B/C/D/F/J/K/L/M 합산 590건 수신 → 중복 제거
  590건 → **전체 비활성(현재 전 지점·전 카테고리 접수 미오픈) → 저장
  대상 0건**(위 "실측 특이사항" 참고 — 버그 아님, 접수 오픈 시 자가
  치유).
- 상세정보 수집: 저장된 행이 없어 처리 대상 0건(정상 동작 확인).
- 라이브 API 호출로 end-to-end 확인(에러 없음, 데이터는 현재 0건으로
  일치): `/api/culture-club/eland-retail-stores` → 6개 지점 정상 노출,
  `/api/culture-club/search?brand=eland_retail&store_code=8222` →
  `{"items":[],"total":0}`, `/api/admin/culture-club?brand=eland_retail`
  → `{"rows":[],"total":0}`.

## 특이 사항
- 현재 DB에 활성 강좌가 0건인 상태로 커밋된다 — 사이트의 온라인 접수가
  상시가 아니라 특정 시간대에만 열리는 것으로 보이며, 예약 배치가 접수
  오픈 시간대에 걸리면 자연히 채워진다(설계상 자가 치유, 추가 조치 불필요).
- 강사명(`instructor_name`)은 목록·상세 모두 "전문강사" 플레이스홀더뿐이라
  항상 null — 지어내지 않음.
- 재료비/교재비/준비물은 `raw_extra`에만 보관(구조화 컬럼 없음, 다른
  브랜드와 동일 기준).
- 이 브랜드는 롯데백화점과 달리 봇 차단/WAF 신호가 발견되지 않아 표준
  일일 배치 지연만 적용했다(별도 Windows 작업 스케줄러 다중시간 랜덤
  주기 미등록 — 기존 7개 브랜드의 일일 배치와 동일한 스케줄 체계를 그대로
  사용한다는 전제, 별도 스케줄러 등록은 이번 범위에서 진행하지 않음).
- 지점 뱃지 드릴다운(사용자 노출 화면)은 Decision 029 범위에 따라 아직
  미구현 — 다른 신규 브랜드와 동일.
