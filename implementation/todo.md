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


[개선사항 1] [완료 — 2026-10-08, implementation/2026-10-08-culture-club-core-data-caching.md 참고]

# [프로젝트 맥락]
현재 Next.js와 Supabase를 기반으로 개발 중인 '문화센터 통합 플랫폼'에서, 공식 앱 대비 초기 로딩 및 조건 변경(필터링) 속도가 느린 문제를 해결하고 아키텍처를 최적화하려고 합니다. 다음 분석과 개선 사항을 바탕으로 코드를 진단하고 수정해주세요.

---

# [핵심 아키텍처 전략: '코어 데이터 캐싱 & 로컬 필터링']
1. **DB 조회 대상 (서버 쿼리 필수):**
   - 오직 **'사용자의 위치 반경(예: 10km)'**이 변경되거나, 사용자가 현재 위치 재탐색하거나,  **'아이의 나이(온보딩 정보)'**가 바뀔 때(ex. 아이 2명일 경우 첫째아이 둘째아이 스위칭) 만 Supabase로 가서 새로운 기본 데이터 풀(Base Pool)을 새로 조회해 옵니다.
2. **로컬 필터링 대상 (클라이언트 메모리 처리):**
   - 위에서 가져온 기본 데이터 풀은 프론트엔드 상태(메모리)에 캐싱해 둡니다.
   - 이후 유저가 요일을 바꾸거나, 반경 내에서 특정 지점(예: 롯데마트 XX점만 보기)을 켜고 끄거나, 키워드를 검색하는 등의 **2차 필터링은 서버를 타지 않고 이미 캐싱된 데이터에서 즉시 로컬 필터링**하여 체감 속도를 '0초'로 만듭니다.

# [점검 및 수정 요청 사항]

### 1. 성능 병목 진단 (아래 체크리스트를 기준으로 코드 점검)
다음 4가지 포인트에서 병목이 발생하고 있는지 면밀히 진단하고 문제점을 찾아주세요.
- **① 무거운 페이로드 (`SELECT *` 및 JSONB):** 리스트를 뿌릴 때 불필요하게 거대한 `JSONB` 메타데이터나 안 쓰는 컬럼까지 `SELECT *`로 통째로 끌어오고 있는지 확인해주세요.
- **② 페이징(Pagination) 처리 방식:** 조건에 맞는 데이터를 전부 다(수백~수천 개) 일단 메모리로 불러온 뒤 자바스크립트(`.slice()`)로 끊고 있는지, 아니면 Supabase 쿼리 레벨(`LIMIT`, `range`)에서 애초에 필요한 만큼만 끊어오고 있는지 확인해주세요.
- **③ 거리순 정렬(Sorting) 부하:** 초기 로딩이나 조회 시 "가까운 거리순" 정렬이 매번 무거운 연산을 유발하고 있는지 확인해주세요.
- **④ DB 인덱스(Index) 부재:** Supabase(PostgreSQL)에서 WHERE 조건으로 자주 쓰는 필터 컬럼(`branch_id`, 개월 수 관련 컬럼, `brand`)에 인덱스가 제대로 걸려있는지 점검해주세요.

### 2. 스마트 캐싱 & 로컬 필터링 상태 관리 구현
- React 상태(State) 또는 React Query/Zustand 등을 활용하여, **위치나 아이 나이가 바뀔 때만 서버 API(DB)를 호출**하고, 요일 선택이나 지점 토글 같은 세부 필터는 **메모리에 캐싱된 데이터 내에서 즉각 필터링**되도록 리팩토링 코드를 제안해주세요.

위 내용을 바탕으로 현재 코드에서 어떤 부분을 고쳐야 하는지 진단하고 구체적인 코드를 작성해주세요.

---

[개선사항 2] [조사 완료, 구현은 보류 — 2026-10-08, 아래 "조사 결과" 참고. targetCode만 재확인 필요해 전체 연동은 아직 시작하지 않음]

신세계 문화센터의 url 이야 이것도 다른 문화센터처럼 주기적으로 데이터 가져오기 위한 연동 작업 점검해줘.
- storeCode는 지점 Code임. 이걸 전체 지점으로 해서 데이터 가져올 수 있는지.. storeCode에 지점코드 안넣었을경우.. 혹은 배열로 ON,01,03,14, ... 이렇게 해서 가져올수 있는지 여부
- rcptStat는 상태코드임RC는 접수마감을 의미하여 제외하고 PR RT ST인데 이3개 한번에 요청할 수 있는지도 확인할 것
- targetCode는 연령대상임 . 위드맘(대디), 패밀리, 키즈인데 이것도 마찬가지로 한번에 가져올수 있는지 확인할 것
Request URL   https://sacademy.shinsegae.com/sdotcom/web/HP0010P0/getLectList.do
Request method   POST
Status code   200 OK
Remote address   202.3.19.35:443
Referrer policy   strict-origin-when-cross-origin

accept   application/json, text/javascript, */*; q=0.01
accept-encoding   gzip, deflate, br, zstd
accept-language   ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6
connection   keep-alive
content-length   317
content-type   application/x-www-form-urlencoded; charset=UTF-8
cookie   cookLectGrType=; cookLectGrCode=; cookRcptStat=; cookDayCode=; cookLectTimeCode=; cookTchName=; cookLectName=; cookSrchCndCd=01; cookCurPage=1; cook_dtl=N; cookOrdKey=; cookSrchWrd=; cookTargetCode=B1; JSESSIONID=VFUfcmHg2sFWyCpGeNbGECRSG1tQS1U63b8uznb4skpUbS1pTvPoq6f3mQlOp6WX.c2Ftc19kb21haW4vc2RvdGNvbTJfMg==; _ga=GA1.1.1488620935.1791446880; _ga_K1NBN99SFR=GS2.1.s1791446880$o1$g0$t1791446880$j60$l0$h0; _ga_FN49J2HYEX=GS2.1.s1791446880$o1$g1$t1791446988$j60$l0$h0; store_code=ON
host   sacademy.shinsegae.com
origin   https://sacademy.shinsegae.com
referer   https://sacademy.shinsegae.com/sdotcom/web/HP0010P0/HP0010P0.do
sec-ch-ua   "Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"
sec-ch-ua-mobile   ?0
sec-ch-ua-platform   "Windows"
sec-fetch-dest   empty
sec-fetch-mode   cors
sec-fetch-site   same-origin
user-agent    Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36
x-requested-with   XMLHttpRequest

ordKey
curPage		1
vipUseFlag
prmStoreCode
prmYearCode
prmSmstCode
prmLectCode
yearCode
smstCode
sttlmBtnYn		Y
adminFlag
autoSeachYn		Y
search			Y
storeCode		  ON   01   03  14  15 16 18 19 37 40 70 90 D1
onOffCode
onlineStoreCode
lectGrType
lectGrCode
schSmstCode		S3
rcptStat		   PR  RT  ST  (RC는 접수마감 제외)
dayCode
lectTimeCode
targetCode		B1 B2 C1
tchName
lectName
srchCndCd		01
srchWrd

---

### 조사 결과(2026-10-08, 실측 — 실제 엔드포인트에 직접 요청해 확인)

**1. storeCode — 다중값 불가, 단건만 지원.**
공백 구분("01 03")도 콤마 구분("01,03")도 둘 다 `totalCount=0`으로 깨진다
(요청 자체는 200으로 성공하지만 매칭이 전부 사라짐 — 롯데마트와 동일한
실패 패턴). 단건으로는 12개 지점 전부 정상 동작 확인(본점=208건,
타임스퀘어&ON=400건, 강남점=230건, 마산점=177건, 사우스시티=371건,
센텀시티=485건, 의정부점=331건, 김해점=117건, 스타필드하남점=339건,
천안아산점=288건, 대구신세계=519건, 대전신세계=361건). 캡처된 요청의
`storeCode`값 맨 앞 "ON"은 13번째 지점이 아니다 — `storeCode=ON` 단독은
0건이고, 오히려 `onlineStoreCode=ON`이 유효한 값으로 보인다(온라인/
오프라인 구분용 별도 필드로 추정, "타임스퀘어 & ON"이라는 지점명 자체에
온라인몰이 통합돼 있는 것과 연관된 것으로 보임 — 확실친 않아 추측으로
단정하지 않음). **결론: 지점은 12개를 하나씩 순회해야 한다**(이마트
64개/롯데마트 60개 순회와 동일한 구조).

**2. rcptStat — 다중값도 불가지만, 더 쉬운 우회로가 있다.**
"PR RT ST" 공백 결합은 역시 0건으로 깨진다. 그런데 **`rcptStat`을 아예
안 보내면(빈 값) PR+RT+RC+ST 전부의 합집합을 한 번에 돌려준다**(실측:
본점 기준 빈값=208건, 개별 합산 RC(94)+RT(103)+ST(11)+PR(0)=208건으로
정확히 일치). 즉 매 지점마다 상태값 3번 나눠 조회할 필요 없이 **지점당
1번만** 조회하고, 응답에서 `lectStat==='RC'`(접수마감)인 행만 우리 쪽에서
걸러내면 된다 — 사용자가 원하는 "RC 제외"를 요청 단계가 아니라 응답
후처리 단계에서 하면 되므로 오히려 이마트/롯데마트보다 가볍다.

**3. targetCode — 미해결, 재확인 필요.**
캡처값(B1/B2/C1) 전부 단건으로도 0건이었다. 12개 지점 전체(수백~수천
페이지)를 실측으로 훑어봐도 응답에 등장하는 대상 코드가 `01:대중`
(일반/대중) 하나뿐이라 — 지금 이 가을학기(schSmstCode=S3) 데이터 안에
"위드맘/패밀리/키즈" 계열 강좌가 아예 안 보인다. 두 가지 가능성이 있는데
추측으로 단정하지 않는다(제3장 제5조):
  - (a) 이 `sacademy.shinsegae.com` 도메인 자체가 일반 성인 대상
    아카데미(요리/자격증/어학 등) 위주라, 캡처하신 B1/B2/C1(아이 동반
    강좌) 카테고리는 현재 이 학기엔 지점별로 개설분이 없을 수 있다.
  - (b) targetCode가 실제로 작동하려면 `lectGrCode`/`lectGrType`(강좌
    분류) 같은 다른 파라미터와 같이 넘겨야만 의미가 생기는 구조일 수
    있는데, 그 조합을 아직 못 찾았다.
  **다음에 실제로 "위드맘/패밀리/키즈" 강좌가 목록에 떠 있는 화면에서
  네트워크 캡처(이번과 같은 방식)를 다시 떠주시면, 그 요청의 전체
  파라미터를 보고 정확한 조합을 찾을 수 있다.** 그 전까지는 연동 스크립트
  작성을 보류한다(제대로 안 되는 필터를 가진 채 "일단 전체"로 긁으면
  나중에 "위드맘/패밀리/키즈만 가져온다"는 원래 목적과 안 맞는 데이터가
  쌓일 수 있어서다).
