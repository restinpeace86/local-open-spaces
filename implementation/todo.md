## 🚨 자율 실행 및 작업 진행 지침 (Strict Execution Rules)

1. **GitHub `todo.md` 기반 작업 수행**: 본 문서에 명시된 Task 목록과 세부 작업 지시를 최우선 가이드라인으로 삼아 순차적으로 작업을 진행한다.
2. **충돌 발생 시 즉시 스킵 (Skip on Conflict)**:
   - 기존 Spec 문서 (`spec/`), Decision Log (`project/decision-log.md`), 또는 기존 모듈과 구조적/논리적 충돌이 발생하는 경우, 절대로 무리하게 코드를 수정하지 말고 즉시 **[스킵 (보류)]** 처리한다.
3. **스킵 처리 시 필수 기록 사항**:
   - 충돌로 인해 작업을 스킵할 경우, 해당 Task 하단에 **① 상세 스킵 사유**를 명확히 기록한다.
   - 해당 Task를 재개하기 위해 **② 선행되어야 할 작업**(예: 신규 Decision 기록 필요, Spec 문서 선행 수정 필요 등)을 구체적인 가이드로 명시한다.
4. **원격 문서 갱신 반영 및 동기화**:
   - 원격 저장소의 `project/decision-log.md` (Decision 010) 및 `spec/map/spatial-search.md` (2.2 레이어 분리) 변경 내역을 확인하고, 충돌이 해소된 상태에서 안전하게 다음 Task를 진행한다.
5. **결과 업데이트 및 정합성 유지**:
   - 작업 완료 시 관련 테스트/빌드를 검증하고 `todo.md` 내 체크박스(`[x]`) 및 진행 상태를 최신화한다.

---


[x] [개선사항 1] — 완료(2026-09-29). data-grid-client.tsx의 open_spaces/events
탭 주소 컬럼 헤더를 클릭하면 오름차순→내림차순→기본 정렬 순으로 토글되도록
구현했다(클라이언트 측 localeCompare, 서버 재조회 없음). events는 행 단위
상세 주소가 없어 화면에 실제로 보이는 sigungu_name(시군구명)을 정렬
기준으로 썼다. 상세: implementation/2026-09-29-data-grid-address-sort.md

# Role
당신은 Next.js와 React, Tailwind CSS를 활용한 프론트엔드 개발 전문가입니다.

# Task
현재 개발 중인 관리자 페이지(Admin Dashboard)의 **`open_spaces` 탭**과 **`events` 탭**에 있는 데이터 그리드(테이블)에 **'주소(address)' 기준 정렬(Sorting) 기능**을 추가해 주세요.

# Requirements
1. **정렬 UI 추가:** 주소 컬럼 헤더(또는 정렬 버튼)를 클릭했을 때, 주소를 기준으로 **오름차순(ASC) ➔ 내림차순(DESC) ➔ 기본 정렬(None)** 순으로 토글되도록 구현해 주세요.
2. **상태 관리:** 현재 어떤 정렬 상태인지 직관적으로 알 수 있도록 아이콘(예: ↕, ▲, ▼)이나 텍스트 인디케이터를 시각적으로 표시해 주세요.
3. **데이터 정렬 로직:** 클라이언트 측 상태(State)에서 주소 문자열(`address`)을 기준으로 안정적으로 정렬(`localeCompare` 등 활용)되도록 처리해 주세요.
4. **적용 범위:** `open_spaces` 컴포넌트와 `events` 컴포넌트 양쪽 모두에 동일한 패턴으로 적용해 주세요.

# Code
[여기에 수정이 필요한 open_spaces 및 events 탭 관련 관리자 페이지 코드를 붙여넣으세요]


[x] [개선사항 2] — 완료(2026-09-29). scripts/export-museum-name-address.mjs로
과학관(138건)/역사박물관(325건)/종합·기타박물관(1,388건) 명칭+주소 CSV
3개를 생성했다. "어린이천문대" 사설 교육기관 예시는 실측 확인 결과 전국
18곳에 동일 이름 패턴(OO어린이천문대)으로 퍼져 있어 그 패턴만 확실한
근거로 제외했고, 그 밖의 잠재적 사설 시설은 구분 근거가 없어 추측으로
빼지 않았다(전부 CSV에 남김). 상세:
implementation/2026-09-29-export-museum-name-address-csv.md

# Role
당신은 Node.js, Supabase, PostgreSQL 백엔드 개발 전문가입니다.

# Task
Supabase DB의 `open_spaces` 테이블에서 특정 표준중분류(`category_sub`) 필터링을 거쳐, 각 카테고리별로 `명칭(제목)`과 `주소` 컬럼만 추출하여 개별 CSV 파일로 저장하는 Node.js 스크립트를 작성해 주세요.

# Target Categories & Output Filenames
1. `과학관` ➔ `과학관.csv`
2. `역사박물관` ➔ `역사박물관.csv`
3. `종합/기타박물관` ➔ `종합기타박물관.csv`

# Requirements
1. **Supabase 연동:** `@supabase/supabase-js` 라이브러리를 사용하여 `.env` 파일의 환경변수(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등)를 로드해 연결해 주세요.
2. **데이터 추출:** `open_spaces` 테이블에서 `category_sub`가 위 세 가지 조건에 각각 해당하는 행들을 조회하고, 출력 필드는 오직 `name`(또는 title)과 `address`만 가져오도록 쿼리를 구성해 주세요.
3. **CSV 파일 생성:** Node.js 기본 내장 모듈(`fs`) 또는 가벼운 로직을 활용하여, 쌍따옴표(`"`) 처리 등으로 주소나 명칭에 콤마(,)가 포함되어도 CSV 포맷이 깨지지 않도록 안전하게 각각 파일(`과학관.csv`, `역사박물관.csv`, `종합기타박물관.csv`)로 저장해 주세요.
4. **실행 방법 안내:** 스크립트 실행을 위해 필요한 패키지 설치 명령어와 실행 방법(`node export-museums.js` 등)을 간단히 주석이나 설명으로 덧붙여 주세요.

# DB Schema Reference (참고용)
- 테이블명: `open_spaces`
- 주요 컬럼명: `name` (또는 title), `address`, `category_sub`

- [제외 조건 예시]

정규 기수제 수강료를 내고 다니는 학원형/멤버십형 민간 시설(예: 어린이천문대 등 사설 교육기관)은 **is_target: false**로 제외해 주세요.

대중이 상시(또는 일반 예약으로) 가볍게 방문할 수 있는 공공 및 일반 상설 박물관·과학관 위주로 골라주세요.
