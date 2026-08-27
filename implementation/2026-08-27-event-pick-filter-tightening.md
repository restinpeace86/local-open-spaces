# [이벤트픽 노출 필터 강화 — 중분류 16종 배제 + 타겟 연령 4종 제한]

## 구현 대상
1. `EXCLUDED_CATEGORY_MIN`(기존 4종)을 16종으로 확장 — 시설 대관류(강당/강의실/골프장/
   다목적실/녹화장소/청년공간/회의실/주민공유공간)와 의료·행정 시설류(보건소/장애인버스/
   서북병원/어린이병원) 12종 추가.
2. `EVENT_PICK_TARGET_AUDIENCES`를 기존 5종(INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY/ALL)에서
   `INFANT`/`KIDS_PRE`/`KIDS_SCHOOL`/`FAMILY` 4종으로 축소(`ALL` 제외).

## 구현 일시
2026-08-27

## 실측 확인 (구현 전, 영향 규모 파악)

| 항목 | 건수 |
| :--- | ---: |
| `is_active=true` 전체 | 3,463건 |
| 신규 16종 중분류 배제 대상 | 409건(강의실 57/회의실 50/주민공유공간 47/녹화장소 48/다목적실 56/청년공간 43/청년정보 29/강당 38/골프장 11/장애인버스 8/서북병원 8/정보통신 6/전문·자격증 3/어린이병원 3/단체봉사 1/보건소 1) |
| 이벤트픽 노출 대상(기존, target_audience 5종 허용) | 1,947건 |
| 이벤트픽 노출 대상(변경 후, target_audience 4종만 허용) | 939건 |

## 변경 사항 (`src/lib/home/get-home-feed.ts`)
- `EXCLUDED_CATEGORY_MIN`을 4종→16종으로 확장. 데이터 자체(`category_min` 값)나 수집/표준
  분류 로직은 전혀 건드리지 않고, 이벤트픽에 노출되는 쿼리들의 배제 필터 값만 확장했다
  (기존 8곳의 `.not('category_min', 'in', EXCLUDED_CATEGORY_MIN_FILTER)` 호출부는 상수만
  참조하므로 코드 수정 없이 자동 반영).
- `EVENT_PICK_TARGET_AUDIENCES`에서 `'ALL'` 제거. 이벤트픽을 유아/어린이/가족 대상 콘텐츠
  전용으로 좁히려는 명시적 지시에 따른 것으로, TEEN/YOUTH/ADULT/SENIOR/FACILITY/OTHER는
  물론 ALL(제한없음)까지 전부 제외한다.
- 두 상수 모두 8곳의 이벤트픽 쿼리(getTodayEvents/getReservationOpenEvents 2개 하위쿼리/
  searchEvents/getProvinceWideEvents/getFreeFeed(events)/getThemeSpotFeed(events)/
  getCategoryFeed)에 공통 적용되므로 별도 쿼리별 수정 없이 상수 변경만으로 전부 반영됐다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 44 파일 480건 통과(순수 상수 변경이라 회귀 없음).
- `npm run build`: 성공.
- `npm run dev` 로컬 서버로 `/api/home/feed`(200), `/api/home/search?q=스포츠` 실측 확인 —
  반환된 항목이 전부 유아/어린이 대상 콘텐츠(예: `target_age_group=초등`,
  `category=KIDS_ACTIVITY`)로 정상 필터링됨을 확인.

## 특이 사항
- 이번 변경은 데이터를 바꾸지 않는 순수 노출 필터 조정이라 실제 DB UPDATE는 없었다.
- `ALL` 태그가 제외됨에 따라 이벤트픽 노출 대상이 1,947건→939건으로 크게 줄어든다(사용자
  명시적 지시에 따른 의도된 변경).
