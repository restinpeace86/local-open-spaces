# 홈플러스 탭 제거 + 이마트 컬처클럽 상세보기 모달

## 구현 대상
사용자 지시(2026-10-03), 4개 요청 중 2개:
1. "관리자 화면의 홈플러스 강좌 리스트는 이제 없애줘" — 서비스 중단으로 배치는
   이미 멈춰있었지만(2026-10-02), 관리자 화면 탭 자체를 제거한다.
2. "이마트 컬처클럽에서 상세데이터 가져왔다는데 상세데이터 볼수가없네 .. ? 각
   row 누르면 상세데이터 볼수있도록 해줘" — 이미 수집해둔 `class_detail_title`/
   `class_detail_content`/`main_image_*`를 보여주는 모달 추가.

(나머지 2개 요청 — E-mart 지점 위치 데이터 확인 후 open_spaces 등록, 지점별
강좌 수 집계 — 은 조사 결과만 보고하고 구현은 사용자 확인 후 별도 진행 예정,
아래 "조사 결과" 참고.)

## 변경 사항
### 1. 홈플러스 탭 제거
`src/components/admin/data-grid-client.tsx`/`page.tsx`/`raw-data-modal.tsx`/
`data-grid-client.test.tsx`에서 `homeplus_lecture_list` 관련 등록 6개 지점
전부 제거. `homeplus-lecture-list-panel.tsx`/`.test.tsx` 파일 삭제. 테이블
(`homeplus_lecture_list`)과 수집 스크립트/배치는 그대로 남겨둔다(제거 요청은
"관리자 화면"에 한정 — 데이터 삭제는 요청받지 않음).

### 2. 이마트 컬처클럽 상세보기 모달
`src/components/admin/emart-culture-club-panel.tsx`: 행을 클릭하면
`DetailModal`이 열려 상세설명/수강료/정원/기간 등을 보여준다. 체크박스
클릭은 `stopPropagation`으로 모달이 안 열리게 분리.

**이미지 미노출 — 실측 확인**: `mainImage`(S3 bucket/region/key)의 기본 S3
URL(`https://{bucket}.s3.{region}.amazonaws.com/{key}`)로 직접 접근해보니
403(비공개 버킷 또는 별도 CDN 경로 필요)이라, 추측으로 다른 CDN 도메인을
지어내지 않고 원본 참조값만 텍스트로 표시했다(실제 이미지 URL 패턴을 찾으면
`<img>`로 교체 가능).

## 검증
- `npx vitest run emart-culture-club-panel.test.tsx` 12개(상세모달 4개 포함) 통과.
- `npx tsc --noEmit` / `npm run test`(255개 파일 2,683개) / `npm run build`
  전부 통과.

## 조사 결과 — 나머지 2개 요청에 대한 사전 확인
### 3. "이마트 지점 위치 데이터 있어?" → 없음(실측 확인)
`emart_culture_club_classes`에는 `store_code`/`store_name`(예: "울산",
"트레이더스킨텍스")/`store_center`(항상 "emart" 고정값)만 있고, 주소나
좌표는 전혀 없다. GraphQL 스키마 자체(`mainStoreInfo { storeName
storeNickName storeCode storeCenter }`)에 주소 필드가 없다 — open_spaces에
등록하려면 지점명 기반 키워드 검색(예: "이마트 울산점")으로 별도 지오코딩이
필요하다(일반 주소 지오코더가 아니라 장소/키워드 검색 방식이 더 적합 —
`kakao-geocoder.mjs`의 `geocodeKeyword` 재사용 가능할 듯).

### 4. 지점별 강좌 수(전체 6,520건, 64개 지점) 실측 집계
- 평균 **101.9건** / 중앙값 98건 / 최대 225건(트레이더스킨텍스) / 최소
  25건(여수)
- 상위 10개 지점: 트레이더스킨텍스(225), 하남(225), 스타필드시티위례(220),
  양재(168), 춘천(168), 의정부(167), 월계(158), 제주(151), 트레이더스김포
  (141), 둔산(139)
- 하위 10개 지점: 이천(58), 안동(56), 구로(56), 포항인덕(46), 상주(45),
  충주(44), 반야월(44), 순천(43), 서산(37), 여수(25)

**시사점**: 한 지점당 평균 100건 안팎이라, 스팟 상세에 강좌 목록을 그대로
다 나열하면 확실히 너무 많다 — 카테고리/요일/상태로 걸러서 보여주거나,
"N건 보기" 식으로 별도 화면(아코디언이 아니라 전용 리스트 페이지 수준)으로
빼는 게 나을 것으로 보인다. 다음 단계 진행 여부/방향은 사용자 확인 후
결정한다.
