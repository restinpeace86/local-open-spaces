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
