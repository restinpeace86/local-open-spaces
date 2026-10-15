# 네이버 플레이스 키즈친화 에이전트 — 임의 CSV 경로 수동 실행 지원

## 구현 대상
사용자 지시(2026-10-15): "이건 주기적으로 할건 아니고.. 내가 비주기적으로
돌리거나 아니면 새로운 식당들에 대하여 csv파일로 추출하면 그 파일에 대하여
수동으로 돌릴수있도록 해놔." — `search-and-match.mjs`/`scrape-kids-
attributes.mjs`를 `pipeline-agent-registry.mjs`(일일/월간 자동배치)에
등록하지 않고, 임의의 CSV 파일 경로를 인자로 받아 수동 실행할 수 있게 한다.

## 구현 일시
2026-10-15

## 변경 사항
### `scripts/naver-kids-restaurant-agent/search-and-match.mjs`,
### `scrape-kids-attributes.mjs`
CLI 실행부를 `node <script>.mjs [csvPath] [limit]`로 변경 — 기존에는
`[limit]`만 위치 인자로 받아 항상 고정된 `metadata/식당.csv`만 처리했다.
인자 없이 실행하면 기존과 동일하게 `metadata/식당.csv`를 쓴다(하위 호환).
`run()` 함수 자체는 이미 `csvPath` 파라미터를 받고 있었으므로(2026-10-15
앞선 구현), CLI 인자 파싱만 추가했다 — `classify-unassigned-category-
min.mjs`의 "위치 인자 + 기본값" 관례를 그대로 따른다(제5장 제4조).

### 사용 예
```bash
# 기존 metadata/식당.csv 그대로
node scripts/naver-kids-restaurant-agent/search-and-match.mjs

# 새로 추출한 다른 CSV 파일 지정
node scripts/naver-kids-restaurant-agent/search-and-match.mjs metadata/신규식당.csv
node scripts/naver-kids-restaurant-agent/scrape-kids-attributes.mjs metadata/신규식당.csv

# 테스트용으로 앞 5건만
node scripts/naver-kids-restaurant-agent/search-and-match.mjs metadata/신규식당.csv 5
```

## 검증
- `npx tsc --noEmit` / `npm run test -- --run` / `npm run build` 전부 통과
  (CLI 인자 파싱부는 각 run() 함수에 이미 있던 csvPath 파라미터를 그대로
  연결한 것이라 기존 단위 테스트가 그대로 커버한다 — CLI 글루 자체는 이
  프로젝트의 다른 스크립트들(apply-sql.mjs 등)과 동일하게 별도 테스트를
  두지 않는 관례를 따른다).

## 특이 사항
- 이 에이전트는 애초에 `pipeline-agent-registry.mjs`에 등록하지 않았다
  (export-restaurants.mjs 구현 당시부터 "독립적으로 돌아가야 한다"는
  지시에 따라 일일/월간 자동배치 대상에서 제외돼 있었음) — 이번 변경은
  그 비주기적 실행 방식에 맞춰 입력 파일 경로까지 유연하게 만든 것뿐이고,
  자동화 스케줄에 새로 편입하지는 않았다.
