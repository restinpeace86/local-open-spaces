# [/admin/data-grid "표준 중분류" 필터 옵션이 실제 데이터와 불일치한 문제 수정]

## 문제 제보
대표가 `/admin/data-grid`에서 "표준 중분류" 체크박스로 "서울형키즈카페"를 선택하니 0건이
나오고, 반대로 실제로 존재해야 할 "공공키즈카페"/"어린이실내놀이터"/"기타" 등은 체크박스
목록 자체에 없다고 지적.

## 근본 원인 (실측 확인)
`get_category_min_options()` RPC(`scripts/migrations/2026-08-26-category-rules-engine.sql`)가
`events`/`open_spaces`의 실제 `category_min` 컬럼이 아니라 `category_rules`(키워드 규칙
관리용 별도 설정 테이블)에서 distinct 값을 뽑고 있었다. 도입 당시 의도는 "실제 데이터에
0건인 카테고리도 필터 옵션에 항상 노출"이었으나, 그 이후 여러 차례의 분류 체계 개편(7대
대분류, 36종 중분류, FACILITY 10대 타겟 재배정, MINCLASSNM 0순위 RAW 직접 매핑 등)이
`category_rules` 테이블은 갱신하지 않은 채 실제 `category_min` 값만 바꿔 두 테이블이
어긋났다.

실측 비교 결과:

| 구분 | `category_rules`에만 있고 실제 데이터엔 없음(0건 필터) | 실제 데이터엔 있지만 목록에서 빠짐 |
| :--- | :--- | :--- |
| `events` | `서울형키즈카페`(1개) | 33개(`공공키즈카페`/`어린이실내놀이터`/`기타`/각종 FACILITY류 등) |
| `open_spaces` | 없음 | 2개(`민원 등 기타` 등) |

## 수정 (`scripts/migrations/2026-08-27-fix-category-min-options-source.sql`)
`get_category_min_options(p_target_table)`를 `category_rules` 대신 실제 `events`/
`open_spaces.category_min` 컬럼에서 직접 distinct를 뽑도록 재정의했다. plpgsql `if/elsif`로
`target_table`별로 분기해, 관련 없는 테이블(예: `events` 조회 시 `open_spaces` 12만 건)을
불필요하게 스캔하지 않도록 했다. `category_rules`는 "키워드 규칙 관리"(재분류 자동화)
기능에는 계속 유효하게 쓰이므로 그대로 두고, 이 필터 옵션 조회 목적에서만 근거를 바꿨다
(화면보다 데이터를 우선한다는 원칙에 따라 실제 데이터를 Source of Truth로 되돌림).

적용 직후 `open_spaces` 쪽 RPC가 `statement timeout`으로 실패해 `ANALYZE
public.open_spaces;`로 플래너 통계를 갱신해 해결했다(이 세션에서 반복 확인된 패턴 —
대량 UPDATE/함수 재정의 직후 플래너가 기존 통계로 잘못된 실행계획을 선택할 수 있음).

## 실측 검증
- 수정 후 `events`: 52종 정상 반환, `서울형키즈카페` 사라짐, `공공키즈카페`/
  `어린이실내놀이터`/`기타` 정상 포함.
- 수정 후 `open_spaces`: 31종 정상 반환(타임아웃 해소).
- API 실측: `category_min=공공키즈카페` → 265건 정상 반환(더 이상 0건 아님).

## 부수 발견 (이번 작업 범위 밖, 조치하지 않음)
`open_spaces` 실제 데이터 중 1건(`id=58957d18-...`, `서울생활문화센터 체부`, source=
`cultural_facility_summary`)의 `category_min` 값이 유니코드 대체 문자(U+FFFD)로 손상돼
있다 — 수집 당시 인코딩 문제로 원본 텍스트 자체가 유실된 것으로 보인다. 원래 값을 추측해
임의로 복구하지 않았다(제3장 제5조 추측 금지). 필요 시 별도 작업으로 원본 소스 재확인 후
수동 정정을 제안한다.

## 검증
- 이번 수정은 SQL 함수 재정의만이라 애플리케이션 TypeScript 코드 변경 없음.
- `npx tsc --noEmit`: clean. `npm run test`: 44 파일 473건 통과. `npm run build`: 성공.
- `npm run dev` 로컬 서버로 RPC/API 실측 재확인(위 참고).
