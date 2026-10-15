# 네이버 플레이스 키즈친화 스크래핑 에이전트 3단계: 정보/리뷰 LLM 속성 추출 (todo.md 개선사항4 4~6단계)

## 구현 대상
`implementation/todo.md` 개선사항4 4~6단계 — 확정된 네이버플레이스ID마다
정보 탭(편의시설)과 "아이와 가기 좋아요" 태그 리뷰를 수집해 LLM으로
키즈친화 속성(아기의자/유아식기/키즈메뉴)을 추출하고 식당.csv에 반영한다.
이것으로 개선사항4의 1~6단계 전체 파이프라인이 완성된다.

## 구현 일시
2026-10-15

## 변경 사항
### `scripts/naver-kids-restaurant-agent/lib/`(신규)
- `naver-place-detail.mjs` + 테스트(4개): home 페이지의 `PlaceDetailBase.
  conveniences`(네이버 등록 편의시설 목록) 추출.
- `naver-reviews.mjs` + 테스트(4개): 실측 확인(아웃백스테이크하우스 판교점,
  2026-10-15) — 네이버 리뷰 코드 `kid_good`(표시명 "아이와 가기 좋아요")가
  todo.md가 말한 "아이와 함께가기좋아요" 뱃지에 해당함을 확인. 리뷰 탭
  정적 페이지의 개별 `VisitorReview` 엔티티 중 `votedKeywords`에 이 코드가
  있는 것만 본문을 추린다. **알려진 한계**: 정적 페이지에는 최근 리뷰
  일부(실측 기준 약 20건)만 포함돼, 그 안에 kid_good 태그 리뷰가 없으면
  빈 배열을 반환한다(전체 리뷰를 다 훑는 추가 페이지네이션은 이번 범위
  밖, 구현 기록 및 결정 로그에 명시).
- `kids-friendly-extraction.mjs` + 테스트(4개): 편의시설 목록 + kid_good
  리뷰 본문을 Gemini에 던져 아기의자/유아식기/키즈메뉴 각각의 존재 여부와
  근거를 구조화 출력으로 받는다. 근거 불충분 시 false로 떨어지도록
  프롬프트에 명시(추측 금지).

### `scripts/naver-kids-restaurant-agent/scrape-kids-attributes.mjs` + 테스트(6개)
네이버플레이스ID가 유효한(숫자, NOT_FOUND 아님) 행만 대상으로 위 3개
모듈을 순서대로 호출해 `아기의자`/`아기의자_근거`/`유아식기`/`유아식기_근거`/
`키즈메뉴`/`키즈메뉴_근거` 6개 컬럼을 CSV에 추가한다. search-and-match.mjs와
동일한 재시작 가능 설계(이미 분석된 행 건너뛰기, 429는 분석실패와 구분,
20건마다 중간 저장).

### `scripts/naver-kids-restaurant-agent/lib/csv.mjs`
**실측으로 발견한 데이터 손실 버그 수정**: 기존엔 각 단계(search-and-match.mjs/
scrape-kids-attributes.mjs)가 자기 컬럼만 아는 고정 HEADER로 `writeCsvUtf8`을
불렀다 — 두 단계를 순서대로 실행하면 2단계가 추가한 네이버플레이스ID 컬럼이
있는 CSV를 3단계가 다시 저장할 때는 문제없지만, **반대로 3단계 실행 후
2단계를 다시 실행하면(예: 매칭 실패 건 재시도) 3단계가 채워둔 6개 컬럼이
통째로 사라진다**(write가 고정 header에 없는 키를 버림). `mergeHeader(
existingRows, requiredColumns)`를 추가해 기존 CSV에 있던 컬럼 순서를
보존하고 이번 단계가 요구하는 컬럼만 없을 때 뒤에 추가하도록 두 orchestrator
모두 수정했다. 테스트(csv.test.mjs, 4개)로 라운드트립 보존을 확인.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(330개 파일 3,287개 테스트) /
  `npm run build` 전부 통과.
- **실제 실행**(실제 매칭된 플레이스 ID 2건으로 라이브 테스트): 원조남원추어탕
  (추어탕집, kid_good 리뷰 없음)과 아웃백스테이크하우스 판교점(kid_good 리뷰
  1건 있으나 특정 아이템 언급 없이 서비스 칭찬만 담김) 모두 LLM이 3개 속성
  전부 "없음"으로 정직하게 판단함을 확인 — 근거 없는 긍정 추측(할루시네이션)을
  하지 않음을 실측으로 검증했다.

## 특이 사항
- 전체 1,594건에 대한 풀 파이프라인 실행(2~3단계 검색/매칭 + 4~6단계 속성
  추출)은 이번 구현에서는 하지 않았다 — 1건당 최대 4회 네트워크 요청(검색
  최대 2회 + 상세 1회 + 리뷰 1회) × 500ms 간격 기준 전체 약 1~2시간 소요
  예상. 사용자가 필요 시 `node scripts/naver-kids-restaurant-agent/
  search-and-match.mjs` → `node scripts/naver-kids-restaurant-agent/
  scrape-kids-attributes.mjs` 순서로 직접 실행(또는 로컬 PC 스케줄러 등록)
  하면 된다 — 두 스크립트 모두 재시작 가능해 중간에 중단해도 이어서 실행
  가능하다.
- "아이와 가기 좋아요" 태그 리뷰가 정적 페이지의 최근 ~20건 안에 없는
  식당은 리뷰 근거 없이 편의시설 목록만으로 판단하게 된다 — 이는 네이버가
  정적으로 공개하는 리뷰 범위의 구조적 한계이고, 더 깊은 리뷰 전체를
  훑으려면 Playwright로 스크롤/페이지네이션을 흉내내야 한다(Decision 037에서
  이미 "필요해지면 그 지점에서만 Playwright를 쓴다"고 명시한 대상).
