# 롯데마트 문화센터 관리자 검토 탭 추가

## 구현 대상
사용자 지시(2026-10-04): "지금 내가 확인해보려는데 관리자화면에 롯데마트쪽
탭이 안보이는데? 원천데이터에 신청 기간이라던가 없는거야?" — 이마트
컬처클럽(2026-10-03)과 동일하게, 테이블만 만들고 관리자 검토 탭을 빠뜨렸던
것을 발견하고 추가했다.

## 변경 사항
이마트 컬처클럽 관리자 패널(emart-culture-club-panel.tsx / api/admin/emart-
culture-club)과 완전히 동일한 구조로 미러링했다.
- `src/app/api/admin/lottemart-culture-club/route.ts`(신규): GET(대상/상태/
  지점 필터, 최신 1,000건 제한 + total), PATCH(is_excluded 토글).
- `src/components/admin/lottemart-culture-club-panel.tsx`(신규): 자기완결
  패널(마운트 시 자동 조회 안 함), 대상/상태 필터, 테이블(강좌명/지점/대상/
  분류/요일시간/상태/가격/수집시각), 노출 제외 체크박스, 행 클릭 시 상세
  모달.
- `src/components/admin/data-grid-client.tsx`: `AdminTable`/`FilterOptionsByTable`/
  `TAB_LABEL`/`hasLoaded` 초기값/조건부 렌더 6곳에 `lottemart_culture_club`
  추가.
- `src/app/admin/data-grid/page.tsx`: `filterOptions.lottemart_culture_club: {}`
  추가.
- `src/components/admin/raw-data-modal.tsx`: `table` 타입 narrowing 체인에
  `lottemart_culture_club` 제외 조건 추가(타입 에러 수정 — 기능 변경 아님).
- `src/components/admin/data-grid-client.test.tsx`: 공유 `EMPTY_FILTER_OPTIONS`
  픽스처에 필드 추가.
- `src/app/api/admin/lottemart-culture-club/route.test.ts`(신규): PATCH 검증
  4개(이마트 테스트 그대로 미러링).

## 검증
- `npx tsc --noEmit` / `npm run test`(265개 파일 2,770개) / `npm run build`
  전부 통과.
- 개발 서버 + Playwright로 실제 화면 확인: "🏪 롯데마트 문화센터" 탭 클릭 →
  조회하기 → "총 15,111건 중 최신 1,000건 표시" 실데이터 렌더링 확인, 행
  클릭 → 상세 모달에 강좌 전체 필드(지점/대상/분류/연령/강사/개강일/요일/
  시간/수강료/뱃지/좋아요/학기) 정상 표시 확인.

## 사용자 질문에 대한 답
"원천데이터에 신청 기간이라던가 없는거야?" — 맞다, 없다. 관리자 상세 모달에
보이는 날짜 관련 필드는 "개강일/요일/시간"(class_start_date, 강좌가 실제로
시작하는 날)뿐이고, 접수/신청 기간을 나타내는 필드는 리스트 응답 어디에도
없다(2026-10-04 앞선 실측 — 13개 지점 약 220건 전수조사, "접수준비" 상태
사례 0건). 이마트의 register_start_date 같은 컬럼 자체가 롯데마트 쪽엔
존재하지 않는다.
