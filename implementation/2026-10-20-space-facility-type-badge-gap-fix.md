# 스팟(SPACE) 상세에도 실내/야외 뱃지 노출

## 구현 대상
`todo.md` 개선사항 2 중: "가격 정보라던가도 야외인지 실내인지 이런것도
확실히 나오고 이에 대하여 추천쪽에 할수있게"

## 구현 일시
2026-10-20

## 진단
가격 정보는 이미 `formatEntranceFee`/`<dl>` 가격 행으로 조건부 노출되고
있었다(2026-09-25 결정: 정보 없으면 행 자체를 숨김). 실내/야외
(`facility_type`)는 실측 확인 결과 **EVENT 상세 분기(`eventExtraBadges`,
`getParentalBadges`에서 뽑음)에만 있고 SPACE(스팟) 상세 분기에는 전혀
없었다** — 같은 `NearbyItem.facility_type` 필드인데 분기별로 따로
렌더링하는 구조라 한쪽만 빠진 것.

## 변경 사항
`src/components/map/detail-modal.tsx`: SPACE 분기의 공통 뱃지 줄(무료/
유료 뱃지 옆)에 `item.facility_type`이 '실내'/'야외'일 때 뱃지를
추가(EVENT 분기와 동일한 라벨/스타일).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(337 파일 3,357개, 신규 1개
  포함) / `npm run build` 전부 통과.
- `detail-modal.test.tsx`에 "SPACE에도 실내/야외 뱃지" 테스트 추가.

## 특이 사항
- "추천쪽에 할수있게"(가격/실내외 정보를 추천 로직에 연동) 부분은 어떤
  추천 기능을 가리키는지(AI 챗봇 추천? 메인 피드 필터?) 불명확해 이번엔
  진행하지 않았다 — 구체적인 대상이 확인되면 별도로 진행.
