# Kakao Maps SDK 도메인 이슈 해결 및 지도 뷰 최종 검증

## 구현 대상
- 지도 뷰 1단계(`implementation/2026-08-21-map-view-phase1.md`)에서 미해결이었던 Kakao 지도 타일 렌더링 실패 원인 최종 확인

## 구현 일시
2026-08-21

## 변경 사항
- 코드 변경 없음. Kakao Developers 콘솔 설정 위치 확인 및 실브라우저 재검증만 수행

## 검증 결과
- 직접 fetch: `https://dapi.kakao.com/v2/maps/sdk.js?appkey=...` (Referer: `http://localhost:3000/`) → `200 OK`, 실제 SDK JS 반환 확인
- Playwright 실브라우저(`npm run dev` 완전 재시작 후):
  - Kakao 지도 타일 26개 정상 렌더링
  - 카테고리별 커스텀 마커(SVG) 65개 정상 렌더링 (반경 5km, 서울시청 기준)
  - 마커 클릭 → 정보카드 정상 표시 ("예약형 행사", "D-10", "(토) 내 친구 서울 전시관 도슨트 프로그램", "25m 거리")
  - 좌측 리스트에서 해당 항목 하이라이트 동기화 확인
  - 모바일 뷰포트(390x844)에서도 동일하게 정상 렌더링
  - 콘솔 에러 0건
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과 (기존과 동일, 코드 변경 없어 재확인 목적)

## 특이 사항
- **최종 원인**: Kakao Developers 콘솔에서 Maps JavaScript SDK가 실제로 검사하는 Referer 화이트리스트는 **[JavaScript 키 수정] > [JavaScript SDK 도메인]**이었음. 총 3번의 다른 위치("[제품 링크 관리]>[웹 도메인]", 재확인, "[앱 설정]>[플랫폼]>[Web]" 가설)를 거친 뒤에야 정확한 위치를 찾음 — Kakao Developers 콘솔에 도메인 등록 항목이 여러 개 존재해 혼동하기 쉬운 구조임을 확인
- 이번 이슈는 코드가 원인이 아니었으나, 트러블슈팅 과정에서 실질적 개선 2가지를 얻음:
  1. `scripts/lib/load-env.mjs`의 따옴표 미처리 버그 발견 (별도 기록: `2026-08-19-data-ingestion-pipeline.md`)
  2. Kakao SDK 로드 URL을 프로토콜 상대경로에서 `https://`로 명시 (`2026-08-21-map-view-phase1.md` 이후 커밋)
- 지도 뷰 1단계가 이제 완전히 검증됨 — Phase 2의 다음 항목(검색바/카테고리 칩, 상세 모달 등)으로 진행 가능
