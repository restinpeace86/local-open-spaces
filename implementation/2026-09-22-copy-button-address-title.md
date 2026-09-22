# [개선사항 2] 상세 팝업 주소/제목 원클릭 복사

## 구현 대상
todo.md [개선사항 2]: "events나 open_spaces의 상세 팝업에서 address 컬럼
및 제목에 대하여 원클릭으로 복사할 수 있도록 옆에 복사버튼? 링크같은걸
작게 만들어주세요."

## 조사
`DetailModal`(`src/components/map/detail-modal.tsx`)이 스팟(open_spaces)과
이벤트(events) 상세를 모두 담당하는 컴포넌트다. 조사 결과 **주소 복사
버튼은 스팟 분기에 이미 있었다**(`handleCopyAddress`, "주소" 행) — 없던 건
제목 복사와, 이벤트 분기에서의 동등한 기능이었다.

## 변경 사항
- `copied`(boolean) 상태를 `copiedField: 'address' | 'title' | null`로
  확장 — 복사 대상이 둘로 늘어 어느 쪽이 방금 복사됐는지 구분해야 했다.
- `handleCopyAddress()`를 범용 `handleCopy(text, field)`로 일반화.
- 스팟/이벤트 두 분기의 제목(`<h2>{item.name}</h2>`) 옆에 "복사"/"복사됨"
  버튼 추가(기존 주소 복사 버튼과 동일한 스타일 — 일관성 유지).
- 기존 주소 복사 버튼은 그대로 유지, 새 `copiedField` 상태를 쓰도록만 배선.

## 범위에 포함하지 않은 것
`CuratedItemDetailModal`(제휴 상품 상세)은 요청 원문이 "events나
open_spaces"로 명시했고 이 두 데이터 타입은 전부 `DetailModal`이 담당하므로
범위에 넣지 않았다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test -- detail-modal.test.tsx`: 93개 통과(신규 4개 — 주소 복사,
  스팟 제목 복사, 이벤트 제목 복사, 주소 없을 때 버튼 미노출).
