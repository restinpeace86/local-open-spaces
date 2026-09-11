# 이벤트픽 블로그 큐레이션 — 가격/타겟 연령 입력 + 아이 취향 키워드 확장 (Step 117)

## 구현 일시
2026-09-11

## 배경 (사용자 지시 원문)
Step 116(하이라이팅 + 줄바꿈)에 이어 사용자가 추가로 지시:

> "어 ... 가격 무료인지.. 유료면 가격 에 대하여 블로그글 복붙하면 파싱할 수 있는거라든지..
> 이런거 적을 수 있는거 줘야지.. 기껏 블로그에서 가격 찾았는데 .. 어디다 반영을 못하네..
> 연령대관련도... 타겟 연령 , INFANT(영유아) / KIDS_PRE(미취학) / KIDS_SCHOOL(취학아동) /
> FAMILY (가족) 혹은 타겟 연령 선택체크 할 수 있도록 해줘.... 그리고 블로그에서 아이 라던가
> 이런 키워드도 색깔칠 해주고.. 분수 , 빛, 불꽃? 등등 ? 아이들이 좋아할만한 공연 단어라던가도
> 키워드로 해서 색칠해줘.. '아이들과 가기 좋은' '아이들이 너무 좋아하는' 과 유사한 문구에도
> 키워드로 해서 .. 색칠해주고.. 이야기라는 단어도 아이들이 좋아하는건가. ? 공연도 .. 동화라던가
> 그런쪽 키워드도 넣고 ?"

Step 116에서 하이라이팅으로 가격/연령 정보를 "찾을 수는" 있게 됐지만, 찾은 정보를 저장할
곳이 없었다. 이번 지시는 "손이 덜 가게"(2026-09-11 이전 지시) 원칙에 따라 그 정보를
바로 그 자리에서 저장까지 끝낼 수 있게 해달라는 것.

## 변경 사항

### 1. 가격 정보 입력 + 자동 채우기
- `src/lib/admin/parse-price-from-text.ts` (신규): `scripts/ingest/adapters/lib/price-parser.mjs`와
  동일한 2단계 정규식(① 라벨(이용료/참가비/요금 등)에 인접한 금액 우선, ② 라벨이 없으면
  대상어(성인/어린이/청소년 등)+금액 조합, 최대 2건)을 TS로 재구현. scripts/(Node 파이프라인)와
  src/(Next.js 앱)는 서로 다른 런타임이라 cross-import하지 않는다는 기존 컨벤션(예:
  region-hierarchy.ts)을 그대로 따름 — 로직 중복은 의도된 것.
  - 테스트: `parse-price-from-text.test.ts` (5개, null/라벨/복수금액/무금액/HTML태그 케이스).
- `src/app/api/admin/events/blog-curation/route.ts`: GET이 `price_text`를 함께 반환하도록,
  PUT이 `price_text`(body에 키가 있을 때만 갱신)를 받아 저장하도록 확장.
- `src/lib/admin/use-event-blog-curation-form.ts`: `priceText`/`initialPriceText` 상태,
  `autoFillPriceFromActiveBlog()`(현재 활성 블로그 탭의 전체 본문이 있으면 본문, 없으면
  요약(description)에서 `parsePriceFromText` 실행 — 못 찾으면 입력란을 건드리지 않고
  `{ found: false }`만 반환해 호출부가 안내 문구를 띄우게 함).
- `src/components/admin/event-blog-curation-modal.tsx`: 가격 입력 `<input>` + "🔍 현재
  블로그에서 자동 채우기" 버튼(블로그 검색 결과가 없으면 비활성화) + 실패 시 amber 안내
  문구("이 블로그에서 가격을 찾지 못했어요 — 직접 입력해주세요.").

### 2. 타겟 연령 선택
- `EVENT_PICK_TARGET_AUDIENCE_OPTIONS` (`use-event-blog-curation-form.ts`): 사용자가 명시한
  4개 값 그대로 — `INFANT`(영유아)/`KIDS_PRE`(미취학)/`KIDS_SCHOOL`(취학아동)/`FAMILY`(가족).
  이는 `src/lib/home/get-home-feed.ts`의 `EVENT_PICK_TARGET_AUDIENCES`와 완전히 동일한
  목록 — 이벤트픽 피드 노출 조건 그 자체이므로 새 값을 만들지 않고 그대로 재사용.
- 단일 선택(하나의 컬럼 값): 이미 선택된 버튼을 다시 누르면 `null`로 되돌아간다
  (`toggleTargetAudience`).
- **기존 `TargetAudienceEditor`(데이터그리드 `RawDataModal`, 11개 값: TEEN/YOUTH/ADULT/
  SENIOR/ALL/FACILITY/OTHER 등 포함)를 재사용하지 않고 별도로 구현**했다 — 두 UI는 서로
  다른 검증 범위(11개 값 전체 분류 vs. 이벤트픽 노출 4대 조건만)를 가진 별개 목적이라
  판단(제5장 제4조는 "동일한 목적"의 중복을 금지하는 것이지, 다른 목적의 기능까지 억지로
  하나로 합치라는 뜻은 아님). `/api/admin/events/blog-curation` PUT 안에 함께 두어 "블로그
  선택 + 가격 + 타겟 연령"을 한 번의 저장으로 끝내는 쪽이 "손이 덜 가게" 원칙에 더 부합.
- `route.ts` PUT: `target_audience`가 4개 값 중 하나가 아니면(그리고 `null`도 아니면) 400
  에러 반환. 저장 시 `target_audience_source: 'MANUAL'`도 함께 기록(값이 `null`이면 이 값도
  `null`) — 기존 `data-grid/target-audience` route가 쓰는 것과 동일한 컬럼/관례.

### 3. 건드리지 않은 필드는 저장하지 않는다 (안전장치)
- `priceText`/`targetAudience` 각각 최초 로드값(`initialPriceText`/`initialTargetAudience`)과
  현재 값을 비교해, 같으면 PUT body에서 그 키 자체를 뺀다. 서버(`route.ts`)는
  `'price_text' in body`/`'target_audience' in body`로 키의 유무를 판단해 없으면 해당 컬럼을
  전혀 건드리지 않는다.
- 이렇게 하지 않으면, 관리자가 "블로그 선택만" 검토하고 저장했을 때 이미 다른 화면
  (`TargetAudienceEditor`)에서 세팅해 둔 값이나 이전에 입력해 둔 `price_text`를 빈 값으로
  실수로 덮어쓸 위험이 있었음.
- 명시적으로 값을 지운 경우(예: 이미 선택된 타겟 연령 버튼을 다시 눌러 해제)는 `null`이
  최초값과 다르므로 정상적으로 body에 포함되어 저장된다(테스트로 검증).

### 4. 아이 취향 키워드 확장
- `src/lib/admin/curation-badges.ts`에 `KID_APPEAL_HINT_KEYWORDS` 추가:
  - 대상 지시어: 아이/아이들/아이랑/아이와/아이 동반/자녀/어린이
  - 감성 문구: 아이들과 가기 좋은/아이랑 가기 좋은/아이들이 좋아하는/아이들이 너무
    좋아하는/가족 나들이/가족과 함께/아이와 함께
  - 볼거리/테마: 분수/불꽃놀이/야경/동화/이야기/공연/인형극/마술쇼/캐릭터
- 사용자가 "이야기라는 단어도 아이들이 좋아하는건가?"처럼 판단을 맡긴 항목(이야기/공연/
  동화)은 아이 대상 콘텐츠에서 실제로 흔히 쓰이는 표현이라 포함하되, "빛"은 사용자가 직접
  언급했지만 단일 글자라 "빛나는"/"불빛" 등과 무관한 문맥에서도 과도하게 매칭될 위험이 커
  대신 더 구체적인 "불꽃놀이"/"야경"으로 대체했다(Step 116에서 "원"을 단일 글자 오탐
  위험으로 제외했던 것과 같은 판단 기준).
- `event-blog-curation-modal.tsx`의 `EVENT_HIGHLIGHT_KEYWORDS`에 병합(`AGE_HINT_KEYWORDS` +
  `PRICE_HINT_KEYWORDS` + `KID_APPEAL_HINT_KEYWORDS`).

## 검증
- `npx tsc --noEmit`: 통과 (Supabase `.update()` 페이로드 타입 오류를 `Record<string, unknown>`
  대신 명시적 객체 타입으로 수정 후 통과).
- `npm run test -- --run`: 134 files / 1550 tests 전체 통과 (신규: `parse-price-from-text.test.ts`
  5개, `event-blog-curation-modal.test.tsx`에 7개 신규 케이스 — 가격 입력 타이핑, 자동 채우기
  성공/실패, 타겟 연령 4버튼 렌더링·단일 선택 토글, 프리필, PUT body 생략/포함 안전장치 2건).
- `npm run build`: 성공 (라우트 목록 기존과 동일, `/api/admin/events/blog-curation` 그대로 유지).

## 특이 사항
- 가격 자동 채우기는 어디까지나 보조 수단이며, 실패 시에도 값을 추측해 채우지 않고
  안내만 한다(제3장 제5조 추측 금지). 관리자가 항상 직접 쓰거나 고쳐 쓸 수 있다.
- 이번 변경은 모두 기존에 승인된 개선사항7-2/8(블로그 큐레이션 관리 UI) 범위 내에서
  사용자가 추가로 구체화한 지시이며, Spec/Decision과 상충하는 부분은 없어 스킵 없이
  전량 구현했다.
