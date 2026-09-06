# open_spaces 삭제 기능 (개별 + 일괄)

## 구현 대상
사용자 지시: "혹시 테이블에 데이터 너무많나? 내가 불필요하다고 생각하는건 관리자
화면에서 삭제하는게 더 좋을까?" → 데이터양은 문제가 아니었음을 실측으로 설명한 뒤,
사용자가 "raw_ingest_data 이 데이터 없애는건 아니고.. open_spaces쪽의 데이터"로
범위를 명확히 함. 개별/일괄 삭제 방식 중 "둘 다 필요하다"로 확인.

## 구현 일시
2026-09-06

## 실측으로 먼저 확인한 것 — open_spaces는 삭제가 위험할 수 있음
`service_categories` 삭제(2026-09-05)와 달리, open_spaces(id)를 참조하는 FK
6개를 전부 조회해보니 대부분 `ON DELETE CASCADE`/`SET NULL`이라 **DB가 삭제를
막아주지 않는다** — 그냥 지우면 아래가 조용히 함께 사라진다:

| 참조 테이블 | delete_rule | 의미 |
|---|---|---|
| `reservations.spot_id` | CASCADE | **실제 예약 기록이 통째로 삭제됨** |
| `user_bookmarks.spot_id` | CASCADE | **실제 사용자가 저장한 북마크가 삭제됨** |
| `spot_curations.spot_id` | CASCADE | 관리자가 공들인 큐레이션 데이터 삭제 |
| `spot_weather_caches.spot_id` | CASCADE | 캐시라 무해 |
| `events.space_id` | SET NULL | 행사는 남고 위치 연결만 끊김 |
| `mom_pick_posts.spot_id` | SET NULL | 게시글은 남고 위치 연결만 끊김 |

실제 예약/사용자 북마크처럼 관리자의 정리 의도와 무관하게 실사용자에게 직접
영향을 주는 항목이 있어, 추측으로 "괜찮겠지" 넘기지 않고 명시적인 안전장치를
넣었다.

## 정책
- **실제 예약(`reservations`)이 하나라도 걸려있으면 삭제 자체를 서버가 거부**
  한다(409) — 관리자가 확인창에서 "예" 해도 우회 불가. 예약을 먼저 처리한 뒤
  다시 시도하도록 안내한다.
- 그 외(북마크/큐레이션/캐시/SET NULL 항목)는 삭제 전 정확한 건수를 조회해
  확인창에 보여주고, 관리자가 그 내용을 보고 직접 판단해 진행한다.

## 변경 사항

### 백엔드
- `src/app/api/admin/open-spaces/route.ts`(신규):
  - `GET ?ids=id1,id2,...` — 삭제 영향 범위 미리보기. 6개 참조 테이블의 건수를
    병렬 조회해 `{ impact: { events, reservations, spot_curations,
    spot_weather_caches, mom_pick_posts, user_bookmarks } }`로 반환.
  - `DELETE` (`{ ids: string[] }`) — 서버에서 재차 예약 건수를 확인해 0건이
    아니면 409로 거부. 통과하면 `open_spaces`에서 `.in('id', ids)`로 삭제하고
    `{ deleted_count, impact }` 반환.

### 프론트엔드 — 개별 삭제
`src/components/admin/raw-data-modal.tsx`: open_spaces 탭 상세에 "🗑 이 스팟
삭제" 버튼 추가(이관/블로그 큐레이션 버튼과 같은 위치대). 클릭 시 영향 범위를
조회 → 예약/북마크가 있으면 확인창 문구에 경고로 포함 → 확인 시 삭제 → 성공하면
신규 `onDeleted` prop으로 부모에게 알린다.
`data-grid-client.tsx`: `onDeleted`를 받아 기존 `onMigratedToEvent`와 동일하게
목록/총건수/상세 모달에서 즉시 제거한다.

### 프론트엔드 — 일괄 삭제
`src/components/admin/category-mapping-panel.tsx`(`RowPicker`): 기존 "선택 항목
노출 중분류 매핑" 체크박스 선택 상태를 그대로 재사용해(제5장 제4조 — 새 선택
UI를 만들지 않음) "🗑 선택 N건 삭제" 버튼을 그 아래에 추가했다. 노출 중분류
매핑과 완전히 독립된 액션이라, 중분류를 고르지 않고도 선택한 행만 삭제할 수
있다. 동작(영향 범위 조회 → 확인창 → 삭제 → 목록/총건수 갱신)은 개별 삭제와
동일한 흐름을 따른다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 115개 파일 / 1218개 테스트(기존 1209 + 신규 9: RawDataModal
  개별 삭제 5, RowPicker 일괄 삭제 4) 전체 통과.
- `npm run build` 통과 — `/api/admin/open-spaces`(신규)와 `/api/admin/open-
  spaces/bulk-category-mapping`(기존) 둘 다 정상 등록됨(서로 다른 라우트로
  올바르게 구분).

## 특이 사항
- 테스트 작성 중 실제로 잡은 버그: `vi.spyOn(window, 'confirm')`을 매 테스트마다
  새로 씌우면서 `afterEach`에 `vi.restoreAllMocks()`가 없으면 같은 spy 객체가
  파일 전체에 걸쳐 호출을 누적해, `.mock.calls[0]`으로 확인하는 테스트가 이전
  테스트의 호출 내용을 잘못 읽는 사고가 실제로 재현됐다(raw-data-modal.test.tsx/
  category-mapping-panel.test.tsx 둘 다에서 발견) — 두 파일의 `afterEach`에
  `vi.restoreAllMocks()`를 추가해 근본적으로 고쳤다.
- "삭제"는 되돌릴 수 없는 작업이라, 서버(재검증)와 클라이언트(사전 영향 범위
  안내) 두 군데 모두에 안전장치를 뒀다 — 어느 한쪽만 있으면 클라이언트 우회나
  경합 상태에서 안전하지 않다.
