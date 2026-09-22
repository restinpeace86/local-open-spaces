# [개선사항 3] 스팟 상세 뱃지 수동 입력 ↔ 블로그 큐레이션 연동 오류 수정

## 구현 대상
todo.md [개선사항 3]: "스팟 큐레이션 → 블로그로 큐레이션" 순서로 작업하면
블로그 키워드 기반 뱃지 자동 추가가 동작하지 않음(반대 순서는 정상 동작).

## 원인
`src/lib/admin/use-spot-curation-form.ts`의 블로그 본문 키워드 자동 뱃지
체크 effect가 `existingCuration`(이미 저장된 `spot_curations` 행이
있는지)이 truthy면 자동 체크 전체를 건너뛰도록 가드돼 있었다 — 원래 의도는
"신규 등록일 때만" 자동 체크해 탭 전환 등으로 재실행될 때 관리자가 수동
해제한 뱃지를 되살리지 않기 위함이었다. 하지만 이 가드는 "이미 저장된
큐레이션이 하나라도 있으면"이라는 훨씬 넓은 조건이라, **스팟 큐레이션
화면(SpotCurationsPanel)에서 수동으로 뱃지를 먼저 저장해두면, 그 이후로는
순서와 무관하게 블로그 자동 체크 기능 자체가 이 스팟에 대해 영원히 죽어
버렸다** — 반대 순서(블로그 먼저)가 "정상 동작"한 건 그 시점엔 아직
`spot_curations` 행이 없어서(existingCuration=null) 우연히 가드를 피해간
것일 뿐이었다.

이 코드베이스의 다른 자동 체크 기능(`spot-curations-panel.tsx`의
`handleCrawlNaverPlace` 편의시설 뱃지 자동 체크)은 이미 "매칭된 것만
추가하고(합집합), 기존에 체크돼 있던 건 절대 건드리지 않는다"는 다른 패턴을
쓰고 있었다 — 블로그 자동 체크만 "존재 여부로 전체를 스킵"이라는 다른(더
거친) 방식을 쓰고 있던 것이 불일치의 근본 원인.

## 변경 사항
`src/lib/admin/use-spot-curation-form.ts`:
- 자동 체크 effect의 조건에서 `existingCuration` 검사를 제거 — 이제 기존
  큐레이션 유무와 무관하게 블로그 본문이 도착하면 항상 한 번(`hasAutoCheckedBadges`
  가드는 그대로 유지 — 탭 재전환으로 재실행되어 관리자가 방금 수동 해제한
  뱃지를 되살리는 것은 여전히 막아야 함) 자동 체크를 수행한다.
- 결과 반영을 `setSelectedBadges(aggregated)`(덮어쓰기)에서
  `setSelectedBadges((prev) => new Set([...prev, ...aggregated]))`(합집합)로
  변경 — 기존에 저장돼 있던 뱃지(수동 입력이든 이전 자동 체크든)는 그대로
  유지되고, 이번 블로그 본문에서 새로 매칭된 뱃지만 추가된다.

## 검증
- `npx tsc --noEmit` / `npm run test`(197개 파일 2270개, 회귀 없음 —
  기존에 "existingCuration이 있으면 자동 체크를 건너뛴다"는 옛 동작을
  검증하던 테스트 1개를 "기존 뱃지 유지 + 새 뱃지 합집합 추가" 검증으로
  교체) / `npm run build` 모두 통과.
- 지역명 하이라이팅/미스매치 판정(regionKeywords, hasRegionMismatch)은 이번
  변경과 무관한 별개 로직이라 그대로 유지했다 — 관련 기존 테스트 전부 통과
  확인.
