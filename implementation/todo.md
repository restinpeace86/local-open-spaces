
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [ ] **[Task 9-1-1] 메인 홈 위치 기반 30km 필터링, 장소명(venue_name) 백필, 캐러셀 Auto-play 구현** 🔄
  - **작업 목표**: 유저 위치 기준 반경 30km 이내 당일 행사 큐레이션 및 `[장소명] · [거리 km]` 카드 UI 완결성 확보
  - **세부 작업 지시**:
    1. **DB 장소명(`venue_name`) 추출 및 백필**:
       - `events` 테이블에 `venue_name` 컬럼 추가 마이그레이션 작성 (`scripts/migrations/`).
       - 원본 `raw_data` 내 장소명 텍스트(`PLACENM` 등)를 추출하여 `events.venue_name` 데이터 백필 진행.
       - 수집 어댑터(`seoul-culture-events.mjs`, `seoul-yeyak-adapter.mjs` 등)의 `buildEventRow`에 `venue_name` 매핑 추가.
    2. **위치 기반 반경 30km 피드 쿼리 연동**:
       - `/api/home/feed` 및 `get-home-feed.ts`가 유저 위경도 좌표(기본값: 성남시 분당구)를 전달받아 Haversine 공식 기반 반경 30km 이내 데이터만 조회하도록 보완.
       - `EventCard` 및 `SpaceGridCard` UI 하단에 `[장소명] · [거리 km]` (예: `율동공원 야외무대 · 3.2km`) 형태로 직관적 표시.
    3. **Hero Carousel 5초 Auto-play 구현**:
       - `hero-carousel.tsx` 컴포넌트에 5초 간격 자동 슬라이드 전환(`setInterval`) 타이머 추가.
       - 모바일 터치 스와이프 및 마우스 호버 시 자동 전환 일시정지 UX 적용.
  - **검증 기준**:
    - `npx tsc --noEmit` 및 `npm run test` (기존 수트 포함) 전원 통과.
    - 카드 UI 내 "장소정보 없음" 문구 완전 제거 및 실제 장소명 + 거리 표기 확인.
    - `npm run dev` 기동 후 `/api/home/feed` 응답 내 반경 30km 이내 데이터 필터링 정상 동작 확인.
