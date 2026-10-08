# 신세계 아카데미 문화센터 통합(6번째 브랜드)

## 구현 대상
`implementation/todo.md` [개선사항 2](2026-10-08, 사용자 캡처 요청): "신세계
문화센터의 url이야 이것도 다른 문화센터처럼 주기적으로 데이터 가져오기
위한 연동 작업 점검해줘" — storeCode/rcptStat/targetCode 다중값 배치
가능 여부 조사 후 실제 연동 구현.

## 구현 일시
2026-10-08

## 조사 과정에서의 실수와 정정
최초 조사에서 `targetCode`(수강대상: 위드맘/패밀리/키즈)를 매장 01(본점)
로만 테스트해 전부 0건이 나와 "미해결"로 잘못 보고했다. 사용자가 "그렇게
조회되던데?"라며 실제 화면 캡처(`reference/sinsegae.png`)를 제공해줘서
재확인한 결과, storeCode=03(타임스퀘어 & ON) + targetCode=C1(수강대상
드롭다운 "패밀리" 선택) 조합으로 실측하니 캡처와 정확히 동일한 강좌가
재현됐다 — 본점이 애초에 그 계열 강좌를 운영하지 않는 매장이었을 뿐,
필터 자체는 문제 없었다. 상세 경위는 `implementation/todo.md`의 [개선사항
2] 블록에 그대로 남겨뒀다(틀렸던 조사 과정도 지우지 않고 정정 섹션을
덧붙임).

## 정정 2 — B1/B2 라벨도 확정(연동 구현 완료 이후 추가 조사)
연동을 완료한 뒤 사용자가 "상세쪽에 수강대상이 있고 목록 리스트쪽엔
없네"라며 `https://sacademy.shinsegae.com/sdotcom/cmmn/code/
getCommCode.do`라는 새 엔드포인트를 알려줬다. 이건 사이트 전역에서 쓰는
공용 코드 조회 API였다 — `userdefHeaderCode`로 코드 그룹을 지정하면
`{detailCode, detailName}` 목록을 돌려준다. 범위를 좁혀가며 스캔한 끝에
`userdefHeaderCode="0025"`(headName: "수강대상")에서 B1/B2/C1을 포함한
전체 그룹을 찾았다: B1=위드맘(대디), B2=키즈, C1=패밀리, A3=임산부,
A4=시니어, A5=남성, A9=기타, D1=커플, Z1=성인. 처음에 "B1/B2는 라벨
미확정"이라고 남겼던 코드 주석과 `null` 처리를 전부 확정 라벨로 교체했다
(`sub_category_name`에 반영 — 다른 브랜드의 카테고리 뱃지와 같은 자리에
"위드맘(대디)"/"키즈"/"패밀리" 뱃지가 카드에 그대로 노출된다). 같은
엔드포인트로 학기 코드(headCode="0009") 전체 목록도 확인해 S3(가을)만
현재 활성 학기임을 재검증했다.

## 실측으로 확정한 구조
- 엔드포인트: `POST sacademy.shinsegae.com/sdotcom/web/HP0010P0/
  getLectList.do`, x-www-form-urlencoded, **JSON을 직접 응답**(HTML 파싱
  불필요 — 다른 브랜드 중 가장 가벼운 구조).
- **storeCode/targetCode 다중값 전부 불가**(공백/콤마 둘 다 0건으로 깨짐,
  실측 확인) — 12개 지점(01 본점/03 타임스퀘어 & ON/14 강남점/15 마산점/
  16 사우스시티/18 센텀시티/19 의정부점/37 김해점/40 스타필드 하남점/
  70 천안아산점/90 대구신세계/D1 대전신세계) × 3개 수강대상(B1/B2/C1) =
  36개 조합을 전부 순회한다.
- **rcptStat만 예외**: 빈 값으로 보내면 PR(접수전)/RT(접수중)/RC(접수마감)/
  ST(대기등록) 전부의 합집합을 한 번에 돌려준다(실측: 빈값 totalCount가
  개별 상태 합과 정확히 일치) — 응답의 `lectStat` 필드로 각 행의 실제
  상태를 알 수 있어, 36개 조합마다 상태별로 또 나눠 조회할 필요가 없다
  (한 조합당 1회 조회 + 사후 분류).
- 접수상태 라벨은 HP0010P0.do 원문 HTML의 라디오 버튼 title 속성에서 전부
  확정(PR=접수전/RT=접수중/RC=접수마감/ST=대기등록).
- **수강대상(targetCode) 라벨도 전부 확정**(추가 조사, 아래 "정정 2" 참고):
  사용자가 "상세쪽에 수강대상이 있고 목록 리스트쪽엔 없네"라며 찾아준
  공용 코드 조회 엔드포인트(POST sacademy.shinsegae.com/sdotcom/cmmn/
  code/getCommCode.do, userdefHeaderCode="0025")로 B1=위드맘(대디)/
  B2=키즈/C1=패밀리를 확정했다(같은 그룹의 A3=임산부/A4=시니어/A5=남성/
  A9=기타/D1=커플/Z1=성인은 전부 성인 대상이라 수집 범위 밖). 같은
  엔드포인트의 headCode="0009"(학기)로 S1=봄/S2=여름/S3=가을/S4=겨울도
  확인, 실측상 S1/S2/S4는 전부 0건·S3만 활성 학기임을 재확인해 기존
  선택이 맞았음을 검증했다.
- 연령은 제목에 "(22년생이상, 성인)"처럼 년생 기준 표기가 있는데, 기존
  공유 유틸(`age-range-parser.mjs`)이 "년생" 패턴을 이미 지원하고 있어
  새 파싱 로직이 필요 없었다(제5장 제4조 기존 구조 우선).
- 날짜는 `lectPeriod`("2026.11.28~2026.11.28", 수업 기간)/`inetLectPeriod`
  ("2026.07.22~2026.11.27", 온라인 접수 기간) 둘 다 구조화돼 있다. 접수
  기간은 날짜만 있고 시각이 없어(다른 브랜드의 `register_start_at`처럼
  정밀 시각 알림엔 못 쓴다) `register_start_at`은 null로 두고, 표시용
  날짜 문자열만 `raw_extra`에 보존한다.

## 변경 사항
- `scripts/ingest/lib/shinsegae-culture-club-parser.mjs`(신규): 순수
  파싱 함수(날짜/시간/연령/상태). 13개 테스트, 실측 샘플 1건을 정확히
  검증.
- `scripts/ingest/shinsegae-culture-club.mjs`(신규): 12개 지점 × 3개
  대상코드 순회, 상태는 조합당 1회만 조회(빈 값) 후 응답의 `lectStat`로
  정규화, 중복 제거, 통합 테이블(`culture_club_classes`) 직접 upsert
  (별도 원본 스테이징 테이블 없음 — 현대백화점과 동일하게 목록에 필요한
  필드가 다 있어 상세수집 단계 자체가 불필요).
- `culture-club-unified-row.mjs`: `toUnifiedShinsegaeRow()` 추가, 테스트
  포함.
- 프론트엔드(`culture-club-tab-view.tsx`, `culture-club-options.ts`):
  brand 유니온/`BRAND_LABELS`/브랜드 필터 pill에 신세계 아카데미 추가.
  썸네일(목록에 이미지 필드 없음)·찜(Decision 028 — 브랜드별 쓰기 확장은
  당장 미룸)·외부 신청 딥링크(아래 "특이 사항" 참고)는 기존 브랜드들의
  "확인 안 된 건 안전한 기본값"(null → UI가 자동으로 생략/비활성 처리)
  패턴을 그대로 따른다 — 새 조건 분기를 추가하지 않고 기존 함수들의
  기본 fallthrough만으로 전부 자연히 처리됐다.

## 검증
- `npx tsc --noEmit` / `npm run test`(287개 파일 2,971개, 신규 파서
  테스트 14개 + unified-row 테스트 1개 + 프론트엔드 3개 포함) /
  `npm run build` 전부 통과.
- `--dry-run`으로 실제 12개 지점 × 3개 대상코드(36조합) 전체를 순회해
  실측 확인: **전체 수신 1,930건**(본점/강남점은 실제로 0건 — 해당
  계열 강좌를 운영하지 않는 매장으로 확인, 나머지 10개 지점은 전부
  실데이터 반환). 파싱 결과(연령 "37~50개월"/"13~20개월" 등, 회차,
  요일/시간, 접수기간, 수강대상 라벨)도 전부 정상.
- 라벨 확정 이후 실제 라이브 배치를 한 번 더 돌려 기존 1,930건에 확정
  라벨(`sub_category_name`)을 반영(upsert는 멱등 — 같은 `source_class_id`
  는 덮어쓰기).

## 정정 3 — 외부 신청 딥링크도 확정(사용자 제공 URL)
"특이 사항"에 보류로 남겨뒀던 외부 신청 딥링크도 사용자가 실제 상세
페이지 URL(`HP0010P0/HP0010P1.do?yearCode=2026&smstCode=S3&storeCode=
03&lectCode=T2694782`)을 직접 제공해 확정됐다. 실측으로 해당 URL이 실제
강좌 상세 페이지(제목/수강대상 정보 포함)를 정상 반환함을 확인했다.
`yearCode`/`smstCode`/`storeCode`/`lectCode` 4개 파라미터 중
`smstCode`(semester_code)/`storeCode`/`lectCode`(source_class_id)는 이미
저장돼 있었고, `yearCode`만 새로 파싱해 `raw_extra.year_code`에 보존하도록
추가했다. `buildShinsegaeDetailUrl()`(`culture-club-options.ts`)을
다른 브랜드의 딥링크 빌더와 동일한 패턴으로 추가하고,
`buildExternalApplyUrl()`에 분기를 연결했다 — 이제 카드 상세 시트에
"접수 페이지로 가기" 버튼이 정상적으로 뜬다. 기존 1,930건도 재실행해
`year_code`를 전부 반영(누락 0건 확인). **딥링크가 확정됨에 따라 보류했던
Windows 작업 스케줄러 등록도 완료했다**(`LocalOpenSpaces-ShinsegaeBatch`,
매일 09:30).

## 정정 4 — RC(접수마감) 제외
사용자 지시: "우리가 필요한 데이터만 남기고 제거하고? RC(접수마감)인거
제외시키고?" — 확인해보니 RC를 전혀 제외하지 않고 있었다(원래
rcptStat을 빈 값으로 보내 한 번에 받는 경량화를 택하면서, 응답에 섞여
있는 RC도 그대로 함께 저장하고 있었음). 실제로 당시 전체 1,930건 중
**1,269건(66%)이 이미 RC(접수마감)** 였다. `splitOpenAndClosedRows()`를
새로 빼서 RC가 아닌 행만 upsert하고, RC인 class_id는 "이미 저장된 강좌가
오늘 RC로 바뀐 경우"에만 상태 갱신(신규 insert 아님, 2026-10-08 롯데마트
접수불가 동기화 버그 수정과 동일한 패턴)에 쓴다. 기존에 잘못 쌓여있던
RC 1,269건은 일회성으로 삭제했다 — 보정 후 661건(진짜 open/waiting/
pre-registration)만 남음을 확인.

## 정정 5 — 상세정보(이미지/소개) 수집 추가
사용자 지시: "현재 접수중인거 강의 상세내용도 긁어오는거지? 그리고
이미지도 마찬가지고?" — 애초에 "목록에 다 있으니 상세수집 단계가
필요 없다"(현대백화점과 동일 패턴으로 가정)고 설계했는데, 이는 **이미지/
강좌소개에 대해서는 틀린 가정이었다.** 목록 응답(getLectList.do)엔 둘 다
전혀 없고, 상세 페이지(HP0010P1.do — 외부 신청 딥링크로 이미 확정된 그
URL)에만 있다(실측 확인: `.slider-for img`에 메인 이미지, `<h3>강좌소개
</h3>` 바로 다음 `<ul>`의 `<p>`에 소개 텍스트).

- `scripts/ingest/shinsegae-culture-club-detail.mjs`(신규): 롯데마트
  상세수집과 동일한 설계 — `detail_fetched_at`이 null인 행만 class_id당
  한 번씩 채운다. 다만 신세계는 별도 원본 테이블이 없어 통합 테이블
  (`culture_club_classes`) 자신에 직접 merge-update한다(raw_extra를
  통째로 덮어쓰지 않고 기존 값에 main_image_url/class_intro만 합침).
- `shinsegae-culture-club.mjs`(메인 목록 배치)에 `fetchDetailEnrichmentByClassId`
  + `mergeDetailEnrichment`를 **처음부터** 적용해 — 상세수집 스크립트가
  채운 값을 메인 배치가 매일 돌 때 지워버리는 "이중 쓰기" 버그(2026-10-07
  이마트/롯데마트에서 겪음)를 애초에 겪지 않도록 설계했다.
- 이미지/소개는 전부 `raw_extra.main_image_url`/`raw_extra.class_intro`에
  저장되는데, 프론트엔드(`culture-club-tab-view.tsx`)의 썸네일/소개
  로직이 이미 "이마트가 아니면 이 두 필드를 그대로 쓴다"는 일반 분기라
  **프론트엔드 코드 변경이 전혀 필요 없었다**(기존 구조 재사용).
- `LocalOpenSpaces-ShinsegaeDetailFetch`(작업 스케줄러, 매일 10:10) 신규
  등록.
- 실제 라이브 실행: 661건 전부 성공(실패 0건), 실제 이미지/소개 텍스트
  정상 수집 확인(예: "어린이 뮤지컬" 강좌의 실제 삽화 이미지, "디지털
  시대의 기본 단위인 픽셀을 매개로..." 같은 실제 소개 문구).

## 정정 6 — 썸네일 재호스팅(우리 규격으로 통일)
사용자 지시: "이미지 긁어오는거 우리 썸네일 규격이라던가 우리쪽 규격에
맞추는것도 하는거지?" — 아니었다. 원천 URL을 그대로 저장만 하고 있었다
(롯데마트/현대백화점도 이미 같은 상태였음 — 신세계만의 문제가 아니라
"이미지 재호스팅" 자체가 culture_club_classes 전체에서 빠져 있었다).
`events.thumbnail_url`에 이미 적용 중인 재호스팅 파이프라인(2026-09-15,
rehost-event-thumbnails.mjs — 다운로드→400px 리사이징→우리 Storage
업로드→URL 교체)과 동일한 설계를 `culture_club_classes.raw_extra.
main_image_url`에도 적용했다. 별도 문서로 자세히 기록함:
`implementation/2026-10-08-culture-club-thumbnail-rehost.md` 참고
(브랜드 공통 기능이라 신세계 전용 문서가 아니라 별도 문서로 분리).

## 특이 사항(여전히 범위에서 제외한 것 — 추측 금지로 보류)
- **학기 코드 1개(S3, 가을)만 지원**: `getCommCode.do`(headCode="0009")로
  학기 코드 전체 목록(S1~S4)은 확인했지만, 드롭다운 자체는 여전히 JS
  동적 생성이라 "지금 몇 개가 동시에 열려있는지"는 실측으로만 알 수
  있다 — 실측 결과 S3만 활성(S1/S2/S4는 전부 0건)이라 지금은 문제
  없지만, 학기가 바뀌는 시점엔 다시 확인이 필요하다.
