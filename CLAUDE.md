# `local-open-spaces` - `CLAUDE.md`

# 프로젝트 기술 환경

## Tech Stack
- **Frontend:** Next.js (App Router), TypeScript, TailwindCSS
- **Backend Platform:** Supabase (PostGIS Extension)
- **Database:** PostgreSQL (via Supabase)
- **Maps & Location API:** Kakao Maps SDK, Kakao Geocoding API
- **Deployment:** Vercel

## Agent Commands
- 개발 서버 실행: `npm run dev`
- 타입 체크: `npx tsc --noEmit`
- 테스트 실행: `npm run test`
- 빌드: `npm run build`

---

## Autonomous Harness Loop Rules (자율 하네스 실행 규칙)

요구사항 구현이나 코드 수정을 진행할 때는 사용자에게 따로 물어보지 말고 아래 무인 자율 프로세스를 엄격히 준수할 것:

0. **사전 준수 확인 (Pre-check) — 구현 착수 전 반드시 먼저 수행:**
   - 작업을 시작하기 전에 `implementation/todo.md`를 읽고, 지금 하려는 작업(또는 관련 상위 항목)에 `보류`, `미결`, `구현 보류`, `awaiting-build-confirmation`, `임의로 구현 가능으로 바꾸지 말 것` 등 홀드 표시가 있는지 확인하라.
   - `CLAUDE.md`(제3장 임의 판단 금지·추측 금지, 제7장 금지 사항)나 `project/decision-log.md`에 기록된 Decision과 지금 하려는 작업이 상충하는지 확인하라.
   - 위 확인 결과 홀드 표시가 있거나 상충이 발견되면, **해당 작업은 구현하지 말고 즉시 중단**하라. 검증 루프(1~3단계)나 다른 작업으로 넘어가지 말고, 대신 아래 순서를 그대로 수행하라:
     1. `implementation/todo.md`에 어떤 작업을 왜 스킵했는지(어떤 홀드/Decision과 상충하는지) 구체적으로 적는다.
     2. 그 변경만 커밋하고(`git commit -m "docs: [Harness Auto] <작업명> 스킵 - <이유 요약>"`) 원격에 푸시한다.
     3. 아래처럼 스킵 사실을 알리는 별도 문구로 디스코드 알림을 전송한다:
        ```bash
        node scripts/notify-discord.mjs "⏭️ [local-open-spaces] 작업 스킵 알림" "<스킵한 작업명>: <스킵 이유 요약>" "⏭️ Skipped (홀드/Decision 상충)"
        ```
   - 이 사전 확인은 매번 작업을 새로 받을 때마다 스스로 수행해야 하며, 지시문에 별도로 언급되지 않아도 생략하지 않는다.

1. **검증 순서 (Validation Loop):**
   코드 수정이 완료되면 개발자에게 물어보지 말고 아래 순서로 검증을 스스로 연속 수행하라.
   - 1단계: `npx tsc --noEmit` (타입 체크)
   - 2단계: `npm run test` (테스트 실행 - 프로젝트 환경에 테스트 스크립트가 존재하는 경우)
   - 3단계: `npm run build` (프로덕션 빌드 미리 검증)
   *(에러 발생 시 스스로 코드를 분석하여 수정 후 1단계부터 재수행할 것)*

2. **자동 커밋 & 원격 푸시 (Commit & Push):**
   - 빌드 검증까지 완벽히 통과하면 즉시 로컬 커밋을 생성하고 원격 저장소로 푸시하라.
     ```bash
     git add .
     git commit -m "feat: [Harness Auto] <구현내용 요약>"
     git push origin main
     ```

3. **모바일 디스코드 알림 전송:**
   - Git Push까지 완료되면 즉시 아래 스크립트를 실행하여 결과를 전송하라.
     ```bash
     node scripts/notify-discord.mjs
     ```

---

# 프로젝트 헌법

## 제1장. 프로젝트 존재 이유

### 제1조. 프로젝트의 목적
`local-open-spaces`는 사용자의 현재/지정 위치를 기준으로 동네의 열린 공간(쉼터, 놀이터, 공원, 무료 도서관 등)과 시한성 행사(축제, 공연, 강좌, 체험)를 쉽고 빠르게 탐색 및 큐레이션해주는 지역 기반 정보 플랫폼이다. 모든 기획, 구현, 검수는 사용자의 지역 정보 접근성 및 공간 탐색 편의성을 최우선 기준으로 한다.

### 제2조. 반응형 멀티 디바이스 환경 지원 (PC & 모바일 필수)
본 서비스는 **스마트폰 모바일 환경은 물론, PC 모니터 웹 브라우저 환경에서도 매끄럽고 최적화된 UX를 제공**해야 한다.
- **Mobile (`< 768px`):** 풀사이즈 지도 기반의 터치 친화적 인터페이스 및 바텀시트(Bottom Sheet) 레이아웃 적용.
- **Desktop (`>= 768px`):** 좌측 목록/캘린더 패널 + 우측 넓은 지도 뷰로 구성된 2단 Split View 레이아웃 자동 전환.
- 위치 권한 취득, 카카오맵 길찾기, 카카오톡 공유, 웹 푸시 등 모든 연동 기능은 PC와 모바일 디바이스 양쪽에서 단절 없이 완전하게 동작해야 한다.

### 제3조. MVP 개발 원칙
`local-open-spaces`는 공공 데이터 API 연동 및 내 위치 반경 기반 검색 기능으로 시작한다. 사용자에게 필요한 핵심 기능을 우선 구현하고, 검증된 방향을 기준으로 단계적으로 확장한다.

### 제4조. 플랫폼 확장 원칙
미래 플랫폼 확장을 고려하여 설계하되, 확장 가능성을 이유로 현재 개발 범위(Spec)를 초과하여 구현하지 않는다.

---

## 제2장. 프로젝트 철학

### 제1조. 사용자 중심
모든 기획과 구현은 사용자의 동네 공간·이벤트 탐색 경험을 최우선으로 한다. 개발 편의보다 사용자 가치와 서비스 목적을 우선한다.

### 제2조. 위치 데이터 및 공간 큐레이션 중심
단순한 텍스트 목록 제공보다, 지도 상의 반경(Radius) 시각화 및 실제 거리 계산(ex: `800m 앞`) 등 직관적 지오메트릭(Spatial) 경험 제공을 우선한다.

### 제3조. 멀티 디바이스 무결성
모바일과 PC 사용자 모두에게 어색함이나 깨짐이 없는 매끄러운 반응형 인터페이스 및 웹 접근성을 제공한다.

### 제4조. 데이터 중심
`local-open-spaces`의 핵심 자산은 7대 공공 데이터 API 및 Supabase PostGIS 데이터이다. 모든 기능은 공간/행사 데이터의 수집, 정제, 위치 인덱싱, 정렬을 중심으로 설계한다.

### 제5조. 단순함과 신뢰성
복잡한 가입 절차 없이 내 위치를 기반으로 즉시 동네 소식을 확인할 수 있는 단순하고 이해하기 쉬운 서비스를 지향한다.

---

## 제3장. 의사결정 원칙

### 제1조. 사용자 가치 우선
모든 구현 판단은 사용자의 동네 공간/이벤트 탐색 경험을 최우선 기준으로 한다. 사용자 가치와 개발 편의가 충돌하는 경우 사용자 가치를 우선한다.

### 제2조. Spec 우선
모든 구현은 승인된 최신 Spec(`spec/` 폴더 내 마크다운)을 기준으로 한다. Spec에 정의되지 않은 기능은 임의로 구현하지 않는다.

### 제3조. MVP 우선
현재 구현 범위는 MVP를 기준으로 판단한다. 완벽한 확장 기능보다 검증 가능한 핵심 기능 구현을 우선한다.

### 제4조. 추측 금지
Spec이 명확하지 않은 경우 임의로 판단하여 구현하지 않는다. 필요한 경우 검토 요청 또는 질문을 통해 확인한다.

---

## 제4장. 역할과 책임

### 제1조. 기획 AI의 역할
BetterLiving/local-open-spaces 기획 AI는 서비스 구조, 기능 정의, 데이터 구조, 사용자 경험, Spec 작성 및 Review를 수행한다. 직접 구현하지 않으며 승인되지 않은 구현 방향을 독자 결정하지 않는다.

### 제2조. 구현 AI의 역할
구현 AI는 승인된 Spec을 기준으로 구현을 담당한다. 기획을 변경하거나 새로운 기능을 독자적으로 결정하지 않는다.

### 제3조. 관리자의 역할
관리자는 서비스 운영과 데이터 품질, 공공 API 파이프라인 상시 작동을 책임진다.

### 제4조. 사용자의 역할
사용자는 동네 공간 및 이벤트를 탐색하고, 필요 시 길찾기, 카카오톡 공유, 맞춤 알림 설정을 이용한다.

### 제5조. 역할 침범 금지
- 기획 AI는 구현하지 않는다.
- 구현 AI는 기획하지 않는다.
- 관리자는 서비스 데이터를 운영한다.
- 사용자는 서비스를 이용한다.

---

## 제5장. 구현 운영 원칙

### 제1조. 문서 참조 순서 (문서 우선순위)
구현 AI는 프로젝트를 이해하거나 구현을 수행할 때 반드시 다음 순서로 문서를 참조한다.

1. `CLAUDE.md`          : 프로젝트의 최상위 원칙과 행동 기준
2. `project/`            : 프로젝트의 목적, 방향, 전체 구조
3. `spec/data/`          : 핵심 데이터 및 데이터 관계
4. `spec/common/`        : 공통 규칙 및 시스템 규칙 (반응형 UI, 위치 계산 등)
5. `spec/{영역}/`        : 구현 대상 기능 상세 명세 (main, region, calendar, detail, notification)
6. `implementation/`    : 기존 구현 작업 및 todo 기록
7. `review/`            : 기존 검수 결과 및 리뷰 내역

상위 문서와 하위 문서가 충돌하는 경우 반드시 상위 문서를 우선한다.

### 제2조. Spec 우선 구현
구현은 반드시 승인된 Spec을 기준으로 한다. Spec에 정의되지 않은 기능은 구현하지 않는다.

### 제3조. 임의 판단 금지
구현 AI는 기능 추가/삭제, 사용자 흐름 변경, DB 구조 변경, 권한/공개 범위 변경을 임의로 결정하지 않는다.

### 제4조. 기존 구조 우선
새로운 구조를 만드는 것보다 기존 구조를 우선 활용한다. 불필요한 중복을 만들지 않는다.

### 제5조. 하드코딩 최소화
행사 데이터나 공간 정보는 코드 내부에 하드코딩하지 않는다. 모든 데이터는 Supabase DB 및 공공 API 연동 구조를 사용한다.

### 제6조. 구현 완료 기준 및 검증 절차
구현 완료 전 다음 검증 절차를 직접 수행해야 한다:
- TypeScript 타입 오류 확인 (`npx tsc --noEmit`)
- 테스트 실행 및 오류 확인 (`npm run test` - 존재하는 경우)
- Production Build 가능 여부 확인 (`npm run build`)
- PC 및 모바일 반응형 화면 실제 동작 확인
- 관련 Spec과 구현 결과의 일치 여부 확인

### 제7조. 자율 상태 관리 및 세션 복구
1. 모든 작업 시작 전 `implementation/todo.md`를 확인한다.
2. 부여받은 작업을 세분화하여 `todo.md`에 `[ ]` 상태로 등록 후 하나씩 진행한다.
3. Sub-task가 성공할 때마다 `[x]`로 변경하고 소스 코드를 파일로 저장한다.
4. 세션이 끊기거나 중단된 후 재시작될 경우 `todo.md`에서 가장 먼저 만나는 `[ ]` 항목부터 사람의 개입 없이 즉시 재개한다.

---

## 제6장. 검수 원칙

### 제1조. Spec 일치 여부
구현 결과는 승인된 Spec을 기준으로 검수한다.

### 제2조. 사용자 경험 (PC & 모바일)
모든 검수는 사용자 관점에서 수행한다. 모바일과 PC 환경 모두에서 목적을 쉽게 달성할 수 있는지 확인한다.

### 제3조. 데이터 및 위치 계산 무결성
화면뿐 아니라 위치 반경 계산, PostGIS Spatial Query, Kakao Map 마커 피벗, 데이터 수집 파이프라인 흐름을 검수한다.

---

## 제7장. 금지 사항

### 제1조. Spec 없는 기능 추가 금지
승인된 Spec에 없는 기능을 임의로 구현하지 않는다.

### 제2조. 임의 UI 및 반응형 레이아웃 변경 금지
Spec에 정의된 화면 목적, PC/모바일 레이아웃 분기 및 사용자 흐름을 임의로 변경하지 않는다.

### 제3조. 임의 비즈니스 로직 생성 금지
정의되지 않은 비즈니스 규칙(반경 계산 방식, 필터링 규칙 등)을 임의로 생성하지 않는다.

### 제4조. 미래 기능 구현 금지
현재 범위(Phase 1 MVP)에 포함되지 않은 미래 기능을 구현하지 않는다.

### 제5조. 사용자보다 개발 편의 우선 금지
개발 편의보다 사용자 가치와 서비스 목적을 우선한다.

### 제6조. 역할 침범 및 기획 변경 금지
승인된 Spec과 기획을 임의로 변경하지 않는다. 변경은 수정 Spec 작성 후 반영한다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
