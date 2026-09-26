# 스팟 큐레이션 — 노출 이름/네이버 ID 저장 실패가 조용히 묻히던 버그 수정

## 구현 대상
사용자 제보(2026-09-27): "어뮤즈사파 진주점 이거 내가 그룹으로 묶었어 중복이
있어서.. 그랬는데 이거는 스팟 큐레이션으로 네이버 id 가져와도 저장이
안되는거 같은데?"

## 원인 (실측 확인)
운영 DB를 직접 조회해 확인 — "어뮤즈스파 진주점" 중복 그룹(2건)에서:
- 비대표 행(`is_dedup_representative=false`, "...실내 물놀이장")에
  `naver_place_id="1688445701"`이 이미 저장돼 있었음.
- 대표 행(`is_dedup_representative=true`, "...사우나&찜질방" — 실제로 화면에
  보이고 관리자가 편집하는 행)의 `naver_place_id`는 여전히 `null`.

즉 이 네이버 ID를 대표 행에 저장하려 하면 `open_spaces.naver_place_id`의
unique 제약이 정확히 걸린다 — `/api/admin/data-grid/naver-place-id`
라우트는 이 경우 409("이 네이버 플레이스는 이미 다른 스팟에 연동되어
있습니다.")를 정확히 반환하고 있었다. 그런데 `spot-curations-panel.tsx`의
저장 로직이 이 PATCH를 `try { await fetch(...) } catch { /* 조용히 무시 */ }`
로만 감싸고 있어서, `fetch()`는 HTTP 에러 응답에도 예외를 던지지 않으므로
(`res.ok=false`일 뿐) catch가 전혀 발동하지 않고, 응답 자체를 확인하지도
않아 실패가 관리자에게 전혀 안 보였다 — 큐레이션 저장은 성공해 모달이
바로 닫혀버려 "저장이 안 되는 것 같은데"라는 증상 그대로였다. 노출 이름
저장(`/api/admin/data-grid/display-name`) 경로도 동일한 패턴이라 함께
고쳤다.

## 변경 사항
### 데이터 수정(운영 DB, 이 사례 1건)
`scripts/migrations` 없이 1회성 UPDATE로 처리(스키마 변경이 아니라 잘못
분산된 값 이동): 비대표 행의 `naver_place_id`를 null로 비우고, 대표 행에
그 값(`1688445701`)을 옮겼다.

### 코드: `src/components/admin/spot-curations-panel.tsx`
- 노출 이름/네이버 ID PATCH 둘 다 이제 `res.ok`를 확인하고, 실패하면
  `secondaryWarning`에 서버가 반환한 실제 에러 메시지를 모아둔다(예: "네이버
  ID 저장 실패: 이 네이버 플레이스는 이미 다른 스팟에 연동되어 있습니다.").
- 큐레이션 저장 자체를 되돌리지 않는 기존 원칙(제5장 제11조)은 그대로
  유지 — `onSaved(data.item)`은 여전히 호출해 실제로 성공한 부분은 목록에
  반영한다.
- 다만 `secondaryWarning`이 있으면 더 이상 자동으로 `onClose()`를 호출하지
  않고 `setErrorMessage`로 화면에 보여준 채 모달을 열어둔다 — 관리자가
  실패 사실을 인지하고 대응(예: 그룹의 다른 행을 확인)할 수 있게 한다.
- `data.item.open_spaces`에 낙관적으로 반영하던 `display_name`/
  `naver_place_id`도 실제로 저장에 성공한 필드만 반영하도록 고쳤다(이전엔
  실패해도 성공한 것처럼 화면에 흘려보내고 있었음).

## 검증
- `src/components/admin/spot-curations-panel.test.tsx`에 신규 테스트: 네이버
  ID PATCH가 409로 실패하면 에러 문구가 보이고 모달이 안 닫히는지 확인.
  기존 30개 테스트는 전부 `ok: true` 모킹이라 회귀 없이 그대로 통과.
- `npx tsc --noEmit` / `npm run test`(203개 파일 2,375개) / `npm run build`
  모두 통과.

## 특이 사항
- 이 버그는 dedup 그룹 기능과 naver_place_id 저장 기능이 서로 몰랐던 상호작용
  이다 — 그룹으로 묶기 전에 비대표가 될 행에 naver_place_id를 먼저 저장해둔
  적이 있으면 항상 이 문제가 재현된다. 앞으로 그룹 병합 시 비대표 행에
  naver_place_id가 남아있는 경우를 자동으로 감지/이전하는 기능은 이번 범위
  밖이다(이번엔 에러를 "보이게"만 고쳤다 — 근본적인 자동 이전은 별도 논의 필요).
