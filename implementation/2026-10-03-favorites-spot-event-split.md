# 마이페이지 찜 목록 스팟/이벤트 구분 (B)

## 구현 대상
사용자 지시(2026-10-03, 4개 기능 중 B): "스팟의 찜과 이벤트의 찜은 기능적으로
다름 명시(마이페이지 탭에서도 구분해서 볼수있도록)." Plan 승인 완료 후 구현.

## 변경 사항
`src/components/favorites/favorites-view.tsx`만 수정 — 스키마/쿼리 변경
없음. `listMyBookmarks()`가 이미 행마다 `spot_id`/`event_id`를 돌려주고
(DB CHECK 제약으로 둘 중 하나만 채워짐) 있어 순수 클라이언트 필터만
추가했다: `activeTab`('spot'|'event') state + 탭 2개(기존 필터 칩 비주얼
재사용) + `bookmarks.filter(b => b.spot_id)`/`filter(b => b.event_id)`.
탭 라벨에 각 건수("찜한 스팟 N", "찜한 이벤트 N")를 표시하고, 빈 상태
문구도 탭별로 다르게("아직 찜한 스팟이 없어요"/"아직 찜한 이벤트가
없어요").

## 검증
- `src/components/favorites/favorites-view.test.tsx`(신규, 3개): 탭 전환
  시 spot_id/event_id 기준으로 목록이 정확히 갈리는지, 탭 라벨 건수가
  맞는지, 빈 상태 문구가 탭별로 올바른지.
- `npx tsc --noEmit` / `npm run test`(259개 파일 2,712개) / `npm run build`
  전부 통과.
