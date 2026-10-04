# 이마트 배치 랜덤 시작 지연 적용 + 예약-알람 캡 20→10 하향

## 구현 대상
사용자 지시(2026-10-04): "어 같이 적용해. 그리고 이렇게 되면 찜한도를 일단
20개에서 10개로 줄이는게 좋을꺼같아 우수맘 대상으로"

## 변경 사항
- `scripts/ingest/emart-culture-club.mjs` / `emart-culture-club-detail.mjs`:
  롯데마트 배치들에 먼저 적용한 `applyRandomStartupDelay`(최대 10분, 일 1회
  배치)를 동일하게 적용.
- `src/lib/community/bookmarks.ts`: `DEFAULT_EVENT_BOOKMARK_CAP` 20 → 10.
  맥락: 롯데마트 찜-상태감시 배치가 찜된 class_id 수만큼 개별 조회하므로,
  유저 1인당 알람 슬롯을 줄이면 전체 찜 총량의 상한도 같이 낮아져 그 배치의
  장기적 요청량 증가 폭을 줄일 수 있다.
- `src/lib/community/bookmarks.test.ts` / `bookmark-button.test.tsx`: 캡
  경계값 테스트를 10 기준으로 재조정(19→9, 20→10), 메시지 텍스트 갱신.
- `src/components/home/culture-club-tab-view.tsx`: 주석의 캡 숫자 갱신.

## 검증
- `npx tsc --noEmit` / `npm run test`(270개 파일 2,806개) / `npm run build`
  전부 통과.
