# 기술 스택 설치 및 Core DB 스키마 연동

## 구현 대상
- Next.js/TypeScript/Tailwind/Supabase 기술 스택 초기 설치
- `project/database_schema.md` 기준 Supabase PostGIS 스키마(`open_spaces`, `events`, `get_nearby_spaces_and_events` RPC) 원격 DB 적용
- API 키 연결 상태 점검 스크립트

## 구현 일시
2026-08-19

## 변경 사항
- 프로젝트 골격 설치 (package.json, tsconfig, next.config, tailwind/postcss, eslint, vitest)
- `supabase/migrations/20260819210000_init_core_schema.sql`: extensions(uuid-ossp, postgis), `open_spaces`, `events` 테이블, GIST/날짜 인덱스, `get_nearby_spaces_and_events` RPC 함수
- `scripts/apply-sql.mjs`: Supabase Management API(`SUPABASE_ACCESS_TOKEN`)로 SQL 파일을 원격 DB에 적용하는 스크립트. DB 비밀번호 없이도 마이그레이션 적용 가능
- `scripts/gen-types.mjs`: `NEXT_PUBLIC_SUPABASE_URL`에서 project ref를 자동 추출해 `src/types/database.types.ts` 재생성
- `scripts/check-api-keys.mjs`: Supabase(REST/Management API), Gemini API는 실제 호출로 검증. Kakao Maps(JS key)는 도메인 제한으로 존재 여부만 확인. 공공데이터포털/TourAPI/서울 열린데이터광장은 정확한 엔드포인트 스펙 확인 전까지 존재 여부만 확인
- `scripts/notify-discord.mjs` 포팅 (하네스 알림 규칙용)
- `package.json` 스크립트: `db:migrate`, `gen:types`, `check:api-keys` 추가

## 검증 결과
- `npx tsc --noEmit`: 통과
- `npm run test`: 통과 (smoke test 1건)
- `npm run build`: 통과
- `node scripts/check-api-keys.mjs`: Supabase REST/Management API, Gemini API 실제 호출 성공 확인. 원격 DB에 `open_spaces`/`events` 테이블 및 RPC 함수 생성 확인 완료 (information_schema 조회로 재확인)

## 특이 사항
- **Kakao Maps API 키**는 Referer(도메인) 제한이 걸린 JS key라 서버 curl로는 검증 불가. 실제 검증은 `npm run dev` 후 브라우저(`localhost:3000`)에서 지도 렌더링 확인이 필요함 (다음 단계 UI 작업에서 확인 예정)
- **7대 공공 API(공공데이터포털/TourAPI/서울 열린데이터광장)의 정확한 엔드포인트/파라미터 스펙**은 `spec/data/data_sources.md`에 상위 수준(데이터셋명, 제공기관, 수집 항목, 주기)만 정의되어 있고 실제 REST 엔드포인트 URL/파라미터는 명시되어 있지 않음. 추측 구현을 금지하는 원칙(제3장 제5조)에 따라, 공식 문서 조사를 별도로 수행 중이며 결과 확정 후 `data-relation.md` 및 개별 수집 스크립트로 이어서 구현 예정 (`implementation/todo.md` 참고)
- `supabase db push`(CLI 표준 방식)는 DB 비밀번호가 `.env.local`에 없어 사용 불가 상태 → Management API 기반 `scripts/apply-sql.mjs`로 대체 적용. DB 비밀번호가 추후 등록되면 `supabase link` + `supabase db push`로 전환 가능
