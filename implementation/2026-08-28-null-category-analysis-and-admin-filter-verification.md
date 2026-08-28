# [open_spaces 중분류 NULL 그룹핑 분석] + [Admin 다중 검색 필터 검증]

## 요구사항
1. `category_min IS NULL`인 open_spaces 행의 source_type별 분포/샘플을 분석해 새로운
   중분류 후보를 제안하는 문서(`docs/null-category-analysis.md`) 작성.
2. `/admin/data-grid`의 open_spaces 탭에 기존 중분류 전체 + `[NULL(미분류)]`를 포함한
   멀티 체크박스 검색 필터(22개 이상) 추가, 백엔드 다중 값 + NULL 쿼리 지원.
3. 검증 후 커밋/푸시.

## 구현 일시
2026-08-28

## 1. NULL 그룹핑 분석 (신규 문서)
`docs/null-category-analysis.md` 작성. 남은 NULL 16,344건 전량이 [open_spaces 세부
중분류 매핑](2026-08-28) 작업에서 의도적으로 범위 밖으로 둔 4개 source_type
(`LOCALDATA_PLAYGROUND`/`LOCALDATA_AMUSEMENT`/`SWIMMING_POOL`/`GG_EVENTS`)뿐임을 확인하고,
소스별로 분석·제안했다:

| source_type | 건수 | 제안 | 신뢰도 |
| :--- | ---: | :--- | :--- |
| LOCALDATA_PLAYGROUND | 13,103 | `어린이놀이시설(야외)`/`어린이놀이시설(실내)`(신규, facility_type 기반) | 높음 |
| SWIMMING_POOL | 715 | 기존 `수영장` 재사용(소스 도메인 기반) | 높음 |
| LOCALDATA_AMUSEMENT | 262/2,039 | `키즈카페`(신규, 이름 키워드) | 높음(부분) |
| GG_EVENTS | 163/487 | `바닥분수/물놀이시설`(신규, 이름 키워드) | 높음(부분) |

적용 가능 14,183건(86.8%), 근거 부족으로 보류 2,161건(13.2%). **이 문서는 제안만 하며
실제 DB 반영은 하지 않았다** — 요구사항 1의 scope가 "분석 결과 문서 작성"까지였다.

부가 발견: `category_min` 옵션 46종을 실측하던 중 문자 인코딩이 손상된 기존 값 1건
(`id=58957d18...`, `category_min_source='MANUAL'`)을 발견해 문서에 참고용으로 기록했다
(임의 수정하지 않음 — 추측 금지).

## 2. Admin 다중 검색 필터 — 이미 구현되어 있음을 확인(코드 변경 없음)

`/admin/data-grid`의 `open_spaces`/`events` 탭 category_min 필터는 [행사 데이터 수집/정제
파이프라인 및 홈 피드 필터링 개선](2026-08-27)에서 이미 다중 선택 체크박스 +
`[미지정(NULL)]` 옵션으로 구현되어 있었다(`src/components/admin/data-grid-client.tsx`의
`CheckboxMultiSelect` + `includeNullOption`, `src/app/api/admin/data-grid/route.ts`의
`applyMultiValueOrNullFilter` — `column.in.(...)`와 `column.is.null`을 `.or()`로 결합).

실측 확인 결과:
- `get_category_min_options('open_spaces')` RPC가 실제 46종을 반환(+ NULL 체크박스 =
  47개 옵션) — 요구사항의 "22개 이상"을 이미 충족.
- 다중 값 + NULL 동시 선택(예: 도서관+미술관+NULL) 쿼리가 정상 작동함을 `curl`로 직접
  확인(`category_min=도서관,미술관,__NULL__` → 정상 응답).

**코드 변경은 하지 않았다** — 이미 존재하는 기능을 중복 구현하지 않기 위함(제5장 제4조
기존 구조 우선).

### 실측 중 발견한 이슈와 진단
검증 중 이 조합 쿼리가 두 차례 연속 `statement timeout`(500 에러)으로 실패하는 것을
발견했다. 근본 원인을 좁혀나간 결과:
- Admin 서비스 롤 클라이언트, 익명 키 클라이언트, SSR 래퍼 클라이언트 전부로 동일 쿼리를
  독립적으로 재현 시도 → 모두 정상(수백 ms).
- 실패는 오직 실행 중이던 Next.js dev 서버의 실제 라우트 호출에서만, 그것도 "첫 호출"에서만
  발생했고 재시도하자 곧바로 정상화됨(같은 패턴이 NULL 단독 필터에서도 관찰됨: 3.5s→1.3s→
  274ms로 점차 빨라짐).
- **결론**: [open_spaces 세부 중분류 매핑](2026-08-28)에서 방금 27,101건(6,982+20,119)의
  `category_min`을 대량 UPDATE한 직후라, 관련 페이지가 OS/DB 캐시에서 아직 식은 상태였던
  것으로 판단된다(코드 결함이 아니라 대량 데이터 변경 직후의 일시적 콜드 캐시 현상). 이후
  실제 관리자 사용이 누적되면 자연히 해소되는 종류의 문제이며, `analyze_open_spaces()`를
  추가로 1회 실행해 플래너 통계도 최신 상태로 갱신해 두었다.

## 검증
- `npx tsc --noEmit`: clean(변경 없음).
- `npm run test`: 51개 파일 536건 통과(변경 없음, 회귀 없음 확인).
- `npm run build`: 성공(변경 없음).
- `/admin/data-grid` 다중 체크박스 + NULL 조합 필터 실측 정상 동작 확인(캐시 워밍 후
  0.34초).

## 특이 사항
- 이번 작업은 문서 1건(`docs/null-category-analysis.md`) 추가만 있고 코드 변경은 없다 —
  요구사항 2의 기능이 이미 완성되어 있음을 확인했기 때문이다.
- 3절 "보류" 항목(2,161건)과 4절 인코딩 손상 값 1건은 이번 작업 범위 밖으로 명시적으로
  남겨뒀다 — 추가 조사나 승인 없이 임의로 처리하지 않았다.
