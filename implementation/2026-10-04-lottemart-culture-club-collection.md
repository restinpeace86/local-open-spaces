# 롯데마트 문화센터 강좌 리스트 수집 (신규 독립 테이블)

## 구현 대상
사용자 지시(2026-10-04): "롯데마트 문화센터 확인좀 해줘" + URL/쿠키/payload
필드 목록/지역코드 제공, 이어서 "search_term_cd는 202603이나 202604 ... 03은
가을학기 04는 겨울학기, 정기 단기 일일은 search_cls_fg로 01,02,04 ... search_cls_target
성인이 1, 어린이/청소년이 2, 유아가 3, 엄마와 함께가 4 ... 성인 1은 확실히
안가져와도돼". 이어서 아키텍처 질문("테이블을 이마트문화센터랑 같이 가는게
좋을까 따로가는게 좋을까?")에 분리 테이블을 추천하고, 사용자 확인: "어 그러자
... 이 데이터 자체의 저장 틀을 같은 규격으로 할 필요없을거같아" — 이마트
컬처클럽(2026-10-03)과 동일한 "관리자 검토용 독립 테이블" 패턴이지만 스키마는
실측된 롯데마트 구조 그대로 설계했다(이마트와 맞추지 않음).

## 실측으로 확인한 사실 (추측 없이 직접 확인)
- 실제 목록 API는 `courselist.do`(페이지 쉘)가 아니라 그 안의 JS가 호출하는
  `searchList.do`(POST, form-urlencoded, `X-Requested-With: XMLHttpRequest`) —
  JSON이 아니라 서버 렌더링된 `<tr>` HTML 조각을 돌려준다.
- 쿠키/세션 불필요(사용자가 준 JSESSIONID 포함/제외 모두 동일 응답 확인).
- 콤마로 여러 값을 한 번에 조회하는 배치가 안 된다(실측: 빈/깨진 응답) — 지점×대상×
  학기를 하나씩 순회해야 해서 이마트보다 요청 수가 훨씬 많다.
- `search_cls_fg` 코드는 사용자가 준 추정과 실측이 달랐다(사용자: 01=정기 추정,
  실측: 01=단기/02=정규/04=일일) — 어느 쪽을 쓸지 임의로 정하지 않고 실측값으로
  교정했음을 명시한다. 다만 이 값은 목록 행에 식별 필드로 노출되지 않아 수집
  차원으로 쓰지 않았다(빈 값=전체로 한 번에 받음).
- 목록 응답에 `<img>` 태그가 전혀 없다(여러 지점/대상 조합으로 4회 실측 확인) —
  이마트처럼 썸네일 CDN을 찾을 필요가 없다.
- 등록상태 필터 파라미터가 없다 — 행마다 상태 버튼의 onclick으로 직접 판별
  (바로신청/대기자신청/전화문의/접수마감). 한 행에 "접수마감"(비활성 라벨)과
  "대기자 신청"(활성 버튼)이 동시에 존재하는 경우를 실측으로 확인해, 우선순위
  판별 로직(바로신청 > 대기자신청 > 전화문의 > 접수마감)으로 처리했다.
- 60개 지점 코드→지점명을 직접 스크레이핑으로 추출(courselist.do의 지점 선택
  팝업 마크업) — 사용자가 준 지역별 코드 목록과 정확히 일치 확인.
- 재료비/할인 뱃지가 둘 다 `ico_sale` 클래스를 쓰고(텍스트로만 구분해야 함),
  할인 뱃지와 "마감임박"(`ico_hit`) 뱃지가 동시에 붙는 행도 실측으로 확인.

## 변경 사항
- `scripts/migrations/2026-10-04-lottemart-culture-club-table.sql`(신규, 적용
  완료): `lottemart_culture_club_classes` 테이블. service_role 전용 RLS(이마트와
  동일한 "관리자 검토용, 아직 공개 안 함" 상태).
- `scripts/ingest/lottemart-culture-club.mjs`(신규): 60개 지점 × 대상{2,3,4}
  (성인=1 제외) × 학기{202603,202604} 순회 수집. `node-html-parser` 사용(이
  프로젝트 기존 관례 — `naver-blog-body.ts`에 jsdom이 Vercel 프로덕션에서
  ESM/CJS 충돌로 500 에러를 낸 전례가 남아있어 그걸 피하는 이미 검증된 선택).
  요청 간 1.0~1.5초 랜덤 페이싱(이마트와 동일한 "매너 있게 수집" 관례).
- `scripts/ingest/lottemart-culture-club.test.mjs`(신규): 실측 표본 HTML을
  그대로 fixture로 써서 `parseRow()` 6개 테스트(재료비/할인+마감임박 동시/
  접수마감+대기자신청 동시/전화문의/이미지 없음 전제/class_id 없을 때 null).
- `.github/workflows/lottemart-culture-club-batch.yml`(신규): 매일 KST 01:00
  (2026-10-04 사용자 지시로 최초 04:00에서 변경 — 기존 배치 전체의 UTC 크론을
  KST로 환산해 겹치지 않는 자리로 재배치), timeout 45분(요청량이 더 많아 이마트의
  기본 타임아웃보다 넉넉히 둠), 1회 재시도.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test`: 264개 파일 2,763개 테스트 전부 통과(신규 6개 포함).
- `npm run build`: 통과.
- 실제 라이브 사이트로 dry-run 실측 2회(지점 2개 한정 409건, 지점 3개 혼합
  샘플 40건) — 재료비/할인/마감임박/신설/대기자신청/전화문의/좋아요 등 모든
  변형이 기대대로 파싱됨을 직접 확인(테스트 작성 전 실측 선행).

## 추가 확인 (2026-10-04, 사용자 제공 상세 URL 기반)
- 사용자 지시: "목록에 썸네일 없더라. 하기가 상세 url이야 여기에는 이미지
  나와" + `courseview.do` URL 제공. 실측 확인: `courseview.do?...&cls_cd=
  {class_id}&...`(목록과 동일한 파라미터 세트 + cls_cd) 응답의
  `div.lct-visual img`에 실제 강좌 이미지가 있다(정적 경로 `https://
  culture.lottemart.com/files/culture/LMC/Storage/attach/Lecture/...`,
  `onerror`로 카테고리별 기본 이미지 폴백). 이미지는 class_id로 바로 구성 불가 —
  상세 페이지를 직접 불러와 파싱해야 한다(이마트의 list+detail 2단계 수집
  패턴, emart-culture-club-detail.mjs와 구조적으로 유사). 이번 커밋에는 아직
  반영하지 않음 — 이미지 수집을 실제로 추가할지는 사용자의 후속 지시를
  기다린다(제3장 제5조).
- 사용자가 접수마감+대기자신청 동시 노출 행의 실물을 확인하려 함 — 실측 재확인
  결과(2026-10-04, 여전히 동일 상태): 고양점(455) / "[8주]랄랄라 코알라" /
  class_id `20260345524010` / 대상=엄마와함께(4) / 학기=202603. 확인용 URL:
  `https://culture.lottemart.com/cu/gus/course/courseinfo/courseview.do?currPageNo=1&search_list_type=&search_str_cd=455&search_order_gbn=&search_reg_status=&is_category_open=N&search_child_age=&from_fg=&cls_cd=20260345524010&fam_no=&wish_typ=&search_term_cd=202603&search_cls_fg=&search_fee_min=&search_fee_max=&search_day_fg=&search_cls_time=&search_cls_target=4&search_birth_date=&search_cls_nm=&search_cat_cd=&search_opt_cd=&search_tit_cd=`

## 특이 사항
- **접수마감을 기본 제외하지 않음**: 이마트는 사용자가 "데이터가 너무 많다"며
  명시적으로 접수마감 제외를 지시했지만, 롯데마트는 그런 지시가 없었다 —
  추측으로 데이터를 버리지 않는다(제3장 제5조). 전부 수집하며, 수집량이 실제로
  문제가 되면 후속 지시로 좁힌다.
- `search_cls_fg`(단기/정규/일일) 차원은 수집하지 않는다 — 목록 행에 노출되는
  필드가 아니라 수집 차원으로 추가하려면 요청량이 3배로 늘어난다. 필요해지면
  별도 지시로 추가.
- 공개 화면/찜 기능 연동, 관리자 검토 패널은 이번 범위에 포함하지 않았다(이마트
  패턴을 따라 추후 필요시 진행 — 아직 사용자가 명시적으로 요청하지 않음).
- 이마트처럼 `user_bookmarks`에 `lottemart_class_id` FK를 확장하는 것은 사용자가
  "같은기능이니깐 ... 참조할수있도록 확장"이라는 취지로 이미 동의한 방향이지만,
  이번 커밋에는 포함하지 않았다 — 먼저 실제 수집 데이터가 쌓이는 걸 확인한 뒤
  진행하는 게 안전하다(이마트도 테이블 수집 먼저, 찜 확장은 별도 커밋이었음).
