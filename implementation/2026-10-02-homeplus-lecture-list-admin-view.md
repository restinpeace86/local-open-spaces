# 홈플러스 문화센터 강좌 리스트 수집 + 관리자 화면 노출(LectureMasterID 전단계)

## 구현 대상
사용자 지시(2026-10-02): "LectureMasterID 가져오기 전단계로 이 리스트 관련
우리쪽 관리자 화면에서 볼수 있게해줘" — 검색 조건: 1차(Kids/Baby 전체 +
서울/인천,부천/수원,화성/경기/대전,세종/충청/광주,전라/강원 각 전체, 지역
8개+대상 2개=10개 조건), 2차(Kids/Baby 전체 + 대구/울산/경북/경남/부산 각
전체, 지역 5개+대상 2개=7개 조건) — 한 번에 선택 가능한 검색조건이 최대
10개라 지역을 2그룹으로 나눔. 정렬은 "개강임박순"(사용자 실측: 최신 날짜가
위로 오는 정렬). 페이지네이션 종료 조건: "페이지네이션 다음페이지 검색에
대한 선제조건은 마감항목이 있느냐 없느냐" — 새로 로드된 묶음에 마감이
하나라도 있으면 그 묶음까지만 가져오고 멈추고, 마감이 전혀 없으면 다음
페이지로 계속 진행.

## 실측 확인
- 홈플러스 문화센터 검색/결과 페이지 실제 HTML·JS(`/Lecture/Search`,
  `/Scripts/Views/Lecture.Search.js`)를 로그인 없이 직접 받아 필터 UI
  구조(지역/대상 선택 버튼, "강좌검색" 버튼, "더보기" 페이지네이션 메커니즘)
  를 확인했다.
- 사용자가 실제 화면에서 장바구니 버튼의 마감 마크업
  (`<button class="btn_class_cart" disabled="">...<span>마감</span></button>`)
  을 직접 캡처해줘서 마감 판정 로직을 정확히 구현할 수 있었다.
- 사용자가 스크롤만으로도 추가 로드되는 것 같다고 알려줘서, 스크롤+버튼
  클릭을 모두 시도하는 방어적 구현으로 처리했다(둘 중 뭐가 실제 트리거인지
  로그인 세션 없이는 확정할 수 없었음).
- 정렬 드롭다운(`#sel_sort`)의 실제 `<option>` value 매핑은 확인할 방법이
  없어서, Playwright의 `select_option(label=...)`로 **라벨 텍스트
  "개강임박순"을 직접 선택**하는 방식으로 값 매핑을 몰라도 되게 우회했다.

## 변경 사항
### 1. `scripts/migrations/2026-10-02-homeplus-lecture-list-table.sql` (신규, 적용 완료)
`pipeline_logs`와 동일한 패턴(서비스롤 전용 RLS)의 신규 테이블
`homeplus_lecture_list`(search_batch/store_name/date_range_text/is_closed/
raw_text/collected_at). LectureMasterID는 이번 지시 범위가 아니라 컬럼에
포함하지 않았다(제5장 제7조 — 당장 안 쓰는 확장 컬럼 미리 안 만듦).

### 2. `src/app/api/admin/homeplus-lecture-list/route.ts` (신규)
서비스롤 클라이언트로 `homeplus_lecture_list`를 최신순 1,000건까지 조회하는
단순 GET 라우트(`pipeline-logs` 라우트와 동일 패턴).

### 3. `src/app/admin/homeplus-lectures/page.tsx` (신규)
읽기 전용 테이블 화면(`/admin/pipeline`과 동일 패턴 — 이 앱은 아직 로그인
인증이 없어 별도 접근 제어 없이 기존 관례를 따름). 마감/신청가능 필터
토글, raw_text 전체 노출.

### 4. `src/types/database.types.ts` (재생성)
`npm run gen:types`로 신규 테이블 타입 반영.

### 5. `scripts/python/homeplus-collect-lecture-list.py` (신규)
2차 검색(지역 2그룹) + "개강임박순" 정렬 적용 + 스크롤/더보기 혼합
페이지네이션 + 마감 판정(묶음에 마감 1건이라도 있으면 그 묶음까지만
수집하고 중단) + Supabase REST API 직접 insert(이 프로젝트 최초의
Python→Supabase 직접 연동, `.env.local`의 서비스롤 키를 직접 읽어 사용).
store_name/date_range_text는 카드 텍스트에서 휴리스틱 추출(첫 줄 / 날짜
정규식), raw_text에 카드 전체 텍스트를 항상 함께 저장해 추출이 부족해도
원본으로 확인 가능하게 했다.

### 6. 기존 Python 스크립트 2개 버그 수정(실측 중 발견)
- **`str | None` 타입 힌트가 Python 3.9에서 런타임 에러**(PEP 604 유니언
  문법은 3.10+ 전용, 사용자 환경은 Python 3.9.11): `from __future__ import
  annotations`를 추가해 3.9에서도 안전하게 동작하도록 수정
  (`homeplus-collect-lecture-list.py`).
- **윈도우 콘솔 기본 인코딩(cp949)에서 이모지(✅/❌/⚠️) print가
  UnicodeEncodeError로 죽는 문제**를 실제 실행 테스트 중 발견 — 4개 파이썬
  스크립트 전부에 `sys.stdout/stderr.reconfigure(encoding="utf-8")`를
  추가했다.

### 7. `.gitignore`
`/state.json`(로그인 세션 쿠키 원본), `/lecture_ids.json`을 추가했다 —
`state.json`이 그동안 추적 대상에서 빠져있었던 걸 이번에 발견해 즉시
커밋 대상에서 제외시켰다(커밋 전 발견 — 실제 유출은 없었음).

## 검증
- `npx tsc --noEmit` / `npm run test`(전체 247개 파일 2,622개) / `npm run build`
  모두 통과(신규 라우트 `/api/admin/homeplus-lecture-list`, 신규 페이지
  `/admin/homeplus-lectures` 둘 다 빌드 결과물에 정상 포함 확인).
- Python 스크립트 4개 전부 `py_compile` 통과.
- `homeplus-collect-lecture-list.py`의 `load_env()`/`insert_rows()`를 실제로
  호출해 Supabase REST API 연결·insert·조회·delete를 전부 실측 확인(테스트
  행 삽입 후 정상 삭제, 최종 테이블 빈 상태로 복구).

## 특이 사항
- 정렬("개강임박순") 선택이 실제로 결과 재로딩까지 트리거하는지는 로그인
  세션이 없어 끝까지 확인하지 못했다 — 스크립트가 선택된 라벨을 터미널에
  출력하니, 첫 실행 때는 실제 화면과 같이 보고 정상 작동하는지 확인하는
  걸 권장한다(스크립트 docstring에도 명시).
- store_name/date_range_text 구조화 추출은 카드 1개 텍스트 샘플만 보고
  만든 휴리스틱이라 완벽을 보장하지 않는다 — raw_text가 항상 함께 저장되니
  관리자 화면에서 원본으로 대조 가능하다.
- 이번 결과는 "전부 마감" 전제로 인해(사용자 보고) 1차/2차 각각 첫 묶음
  (20건)에서 바로 멈출 가능성이 높아 최대 40건 수준으로 예상된다.

## 후속 변경(2026-10-02) — 독립 페이지 → `/admin/data-grid` 탭으로 전환
사용자 지시: "아.. 이거 .. /admin/data-grid쪽에 tab 하나 더 만들어서 하는건
안돼 ?" — 위 3번 항목(`src/app/admin/homeplus-lectures/page.tsx`, 독립
페이지)을 삭제하고, 기존 data-grid의 "자기완결 패널" 탭 관례(spot_notices
탭과 동일한 패턴)를 그대로 따라 신규 탭으로 재구성했다. 2번 API 라우트
(`/api/admin/homeplus-lecture-list`)는 그대로 재사용한다.

### 변경 파일
- `src/components/admin/homeplus-lecture-list-panel.tsx` (신규) — 독립
  페이지였던 내용을 자기완결 패널로 옮김. data-grid의 "탭 전환 시 자동
  데이터 로딩 금지"(2026-08-30 결정) 관례에 따라 마운트 시 자동 조회하지
  않고 "조회하기" 버튼 클릭으로 시작. 마감/신청가능 필터 토글 포함.
- `src/components/admin/data-grid-client.tsx` — 신규 탭 등록에 필요한
  5개 지점 전부 수정: import, `AdminTable` union, FilterOptions 타입,
  `TAB_LABEL`('🏫 홈플러스 강좌 리스트'), `hasLoaded` 초기값, 렌더 분기.
- `src/app/admin/data-grid/page.tsx` — filterOptions 객체에
  `homeplus_lecture_list: {}` 추가(다른 자기완결 탭들과 동일하게 빈 객체).
- `src/app/admin/homeplus-lectures/page.tsx` 및 디렉터리 삭제.
- `src/components/admin/data-grid-client.test.tsx` — 공유 상수
  `EMPTY_FILTER_OPTIONS`에 `homeplus_lecture_list: {}` 한 줄 추가(이 한
  곳만 고치면 되는 이유: 이 테스트 파일 전체가 탭별로 상수를 따로 두지
  않고 이 공유 상수 하나를 재사용하는 구조였기 때문 — grep으로 확인).
- `src/components/admin/raw-data-modal.tsx` — `CategoryMinEditor` 렌더
  조건의 타입 내로잉 제외 체인에 `table !== 'homeplus_lecture_list'`
  추가(다른 자기완결 탭들과 동일하게 제외 — 이 패널은 애초에 그 모달을
  열지 않으므로 동작 변화는 없고 타입 에러만 해소).
- `src/components/admin/homeplus-lecture-list-panel.test.tsx` (신규,
  3개) — `spot-notices-panel.test.tsx`와 동일한 패턴(자동 조회 안 함,
  필터 토글, 에러 메시지). 필터 토글 버튼("마감"/"신청가능")과 상태
  배지(`<span>마감</span>`)가 같은 텍스트라 `getByText`가 모호하게
  매치되는 문제가 있어 `getByRole('button', { name: ... })`로 버튼만
  정확히 선택하도록 작성했다.

### 발견한 문제와 수정
- 독립 페이지 삭제 직후 `npx tsc --noEmit`이 `.next/types/validator.ts`가
  삭제된 페이지를 여전히 참조해 실패 — `rm -rf .next`는 Bash 도구의
  파괴적 명령 차단에 걸려 대신 `npm run build`를 먼저 실행해 `.next`를
  새로 생성한 뒤 `tsc --noEmit`을 재실행해 해결했다.
- `data-grid-client.test.tsx`에서 신규 탭 누락으로 TS2741 에러 40개 이상
  발생 — 전부 공유 상수 `EMPTY_FILTER_OPTIONS` 하나가 원인이라 그 한
  줄만 고쳐서 일괄 해결했다.

## 검증(2026-10-02 탭 전환 후)
- `npx tsc --noEmit` 통과.
- `npm run test` 전체 248개 파일 2,625개 테스트 통과.
- `npm run build` 통과(신규 페이지 없이 기존 `/admin/data-grid` 라우트
  그대로, 독립 페이지 라우트는 빌드 결과물에서 제거 확인).

## 후속 실측 — 사용자 대신 실제 수집 실행(2026-10-02)
사용자 지시: "대신실행해줘" — `homeplus-collect-lecture-list.py`를 실제
로그인 세션(`state.json`)으로 처음 실행해보니, 로그인 세션 없이 추측으로
작성했던 선택자 2곳이 실제 마크업과 달라 즉시 실패했다. 임시 진단
스크립트(`homeplus-debug-search-result.py`, 실측 후 삭제)로 실제 검색
결과 페이지 HTML을 직접 덤프해 원인을 확인하고 수정했다:
- **정렬 드롭다운 id 오류**: `#sel_sort`로 추측했으나 실제는 `#selSort`
  (언더스코어 없음). `apply_sort_order()` 수정.
- **결과 리스트 컨테이너 선택자 오류**: `#lecture_textlist`로 추측했으나
  실제는 `div.search_result_list`이고, 개별 카드는
  `<li id="liLecture_{LectureMasterID}">` 형태였다. `collect_batch_rows()`
  수정.
- **(발견, 이번 범위 아님)** 카드 안에
  `<input type="hidden" name="LectureMasterID" value="...">`가 이미 있어
  나중 LectureMasterID 추출 단계에서 `li` id 파싱이나 정규식 없이 바로
  읽어올 수 있다 — 지금은 손대지 않고 기록만 남긴다(제5장 제7조,
  "확장 기능 자체를 구현하지는 않는다").
- **store_name 추출 개선**: 실제 카드에 `<span class="office_name">`이
  있는 것을 확인해, 기존 "카드 텍스트 첫 줄" 휴리스틱을 정확한 선택자
  기반 추출로 교체(마크업이 없는 예외 케이스만 기존 휴리스틱으로 폴백).

수정 후 재실행 결과: 1차(서울 등 8개 지역) 20건, 2차(대구 등 5개 지역)
20건, 총 40건 전부 `is_closed=true`로 수집·Supabase 저장 성공 —
사용자가 미리 예상했던 "전부 마감이면 최대 40건" 수치와 정확히 일치한다.
`/admin/data-grid`의 "🏫 홈플러스 강좌 리스트" 탭에서 확인 가능.

### 검증
- 수정 후 `python -m py_compile` 통과, 실제 실행 성공(위 결과).
- Supabase REST API로 직접 재조회해 40건 전부 저장된 것 확인.
- `npx tsc --noEmit` / `npm run test`(248개 파일 2,625개) / `npm run build`
  재실행 — 전부 통과(이번 변경은 Python 전용이라 영향 없음을 재확인).

## 후속 — 일일 배치 자동화 + 세션 만료 배너(2026-10-02)
사용자 지시: "매일 배치 돌려서 하루에 한번 확인은 못하는구조야?" → (GitHub
Secret 저장 방식에 동의 확인 후) "새기기 로그인 알림뜨는건 어쩔 수 없지.
그건 문제없지않나? 그리고 세션 만료 관련해서는 홈플러스 강좌리스트
보는곳에 세션 만료되었다고 다시 카카오폰 로그인 해달라는거랑 해당
관리자쪽의 홈플러스 강좌 리스트에서 진행할수있게 해줘."

### 설계 확인(AskUserQuestion)
1. 로그인 세션(state.json 내용)을 GitHub Actions Secret으로 저장해 CI가
   매일 접근 → **동의**.
2. 세션 만료 시 관리자 화면에 보여줄 "마지막 실행 상태"를 어디에
   기록할지 → **기존 `pipeline_logs` 테이블 재사용**(신규 테이블 대신,
   제5장 제4조 기존 구조 우선).

### 핵심 제약(사용자에게 사전 설명) — "완전 무인"은 아님
`state.json`은 API 키가 아니라 사용자의 실제 카카오 로그인 세션 쿠키다.
세션은 언젠가 만료되고, 만료되면 카카오 로그인(폰 앱 승인)을 사용자가
직접 다시 해야 한다 — 그래서 "평소엔 자동, 세션 만료 시에만 수동 갱신"
구조로 설계했다. GitHub Actions 러너의 IP가 바뀌는 데서 오는 "새로운
환경에서 로그인" 카카오 알림은 사용자가 이미 감수하기로 확인했다.

### 변경 파일
- `scripts/python/homeplus-collect-lecture-list.py`:
  - `IS_CI`(env `CI=true`) 기준으로 `headless` 결정, 성공/실패 후
    `input()` 대기를 CI에서는 스킵.
  - `load_env()`: OS 환경변수(GitHub Actions secrets) 우선, 없으면
    `.env.local` 폴백 — 기존 로컬 실행 방식은 그대로 유지.
  - `check_session_valid()`: 검색을 시도하기 **전에** 세션 유효성을 먼저
    확인(`homeplus-check-session.py`와 동일한 판정 기준: 로그인 페이지
    리다이렉트 또는 "로그인해주세요" 문구). 무효면 검색을 시작하지도
    않고 `pipeline_logs`에 `FAILED` + `meta_data.reason:
    "session_expired"`를 남기고 조용히 종료(워크플로 자체를 실패로 보지
    않음 — 버그가 아니라 예상된 상황이라서).
  - `post_pipeline_log()`: 성공 시 `OK` + `meta_data:{collected, closed}`,
    그 외 예외 발생 시 `FAILED` + `error_message`를 남기고 예외를
    재전파(CI 잡 자체는 실패로 표시되어야 진짜 버그를 놓치지 않음).
  - `agent_name='HOMEPLUS_LECTURE_LIST'`, `period='daily'` — Node 배치와
    동일한 `pipeline_logs` 스키마를 그대로 따른다.
- `scripts/ingest/lib/pipeline-agent-registry.mjs`: `HOMEPLUS_LECTURE_LIST`
  항목 등록(관리자 `/admin/pipeline` 현황판에서 다른 소스와 동일하게 보이게
  — 이 소스는 Python이라 이 레지스트리를 직접 import하지 못해, 동일한
  description 문자열을 Python 쪽에도 그대로 복제해뒀다. 바꿀 때 두 곳
  함께 수정 필요).
- `scripts/python/requirements.txt`(신규): `playwright==1.60.0`,
  `requests==2.32.5`(로컬 설치 버전과 고정).
- `.github/workflows/homeplus-lecture-list-batch.yml`(신규): 매일 KST
  03:20(UTC 18:20, 기존 daily 17:47/monthly 18:52와 겹치지 않게 분산)
  cron + `workflow_dispatch`. `secrets.HOMEPLUS_STATE_JSON`을
  `state.json`으로 복원 → Python 스크립트 실행(가벼운 1회 재시도, 2분
  대기) → 세션 파일 정리(`if: always()`).
- `src/components/admin/homeplus-lecture-list-panel.tsx`:
  `BatchStatusBanner`(신규) — `TodayBatchSummary`와 동일하게 마운트 시
  자동 조회(메인 데이터 테이블의 "조회하기" 버튼 관례와는 별개 — 가벼운
  보조 상태 지표라 예외). `/api/admin/pipeline-logs?agent_name=
  HOMEPLUS_LECTURE_LIST`(기존 라우트 그대로 재사용, 수정 없음)의 최신
  1건을 읽어 OK → 초록 성공 배너, FAILED+session_expired → 빨간 "세션
  만료, 재로그인 필요" 배너(homeplus-save-login-session.py 재실행 +
  GitHub secret 갱신 안내 문구 포함), FAILED(그 외) → 일반 에러 배너.
- `src/components/admin/homeplus-lecture-list-panel.test.tsx`: URL 기준
  분기 mock(`mockFetchRouter`)으로 교체(패널이 이제 pipeline-logs/
  lecture-list 두 엔드포인트를 호출하므로), 배너 3종(성공/세션만료/일반
  실패) 신규 테스트 3개 추가(기존 3개 + 3개 = 6개).

### 검증
- `npx vitest run .../homeplus-lecture-list-panel.test.tsx` 6개 전부 통과.
- `python -m py_compile` 통과, 실제 재실행(로컬, state.json 유효한 상태)
  성공 — `pipeline_logs`에 `agent_name=HOMEPLUS_LECTURE_LIST, status=OK,
  meta_data={collected:40, closed:40}` 행이 정확히 기록된 것을 Supabase
  REST API로 직접 재조회해 확인.
- `npx tsc --noEmit` / `npm run test`(248개 파일 2,628개) / `npm run build`
  전부 통과.
- GitHub Actions 워크플로 자체(cron 트리거 실제 발화, secret 등록 후 첫
  실행)는 이 세션에서 실측하지 못했다 — `secrets.HOMEPLUS_STATE_JSON`을
  사용자가 직접 등록해야 하고(제가 `gh` CLI 접근 권한이 없음, `gh: command
  not found` 확인), 그 이후 `workflow_dispatch`로 수동 1회 트리거하거나
  다음 cron까지 기다려 실제 성공 여부를 확인해야 한다.

### 특이 사항 / 남은 리스크
- 세션 만료 감지는 "로그인 페이지로 리다이렉트/로그인 안내 문구"만
  확인한다 — 홈플러스가 캡차나 2차 인증을 요구하는 다른 종류의 차단을
  걸 경우 이 로직이 "유효함"으로 오판할 수 있다(실측된 적 없는 리스크,
  사용자에게 투명하게 남겨둠).
- GitHub Actions 러너는 매 실행마다 다른 IP를 쓰므로, 홈플러스/카카오
  쪽에서 세션을 더 자주(로컬보다) 강제로 끊을 가능성도 배제 못 한다 —
  실제 빈도는 운영하면서 지켜봐야 한다.
