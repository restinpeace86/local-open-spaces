# [개선사항6/7 재개] 설문형 스마트 리뷰 폼 + 마이페이지 C영역

## 구현 대상
사용자가 2026-09-04에 스킵됐던 두 항목을 다시 진행하도록 명시적으로 지시했다:
1. 충돌이 났던 `spec/community/mom-pick-grades.md` §3-4/3-5를 설문형 스마트 리뷰
   폼 구조에 맞게 개정.
2. 개정된 스펙을 바탕으로 [설문형 스마트 리뷰 폼]과 마이페이지 [C 영역: 내가 쓴
   후기 리스트(설문 결과 및 사진 연동)]를 구현.

## 구현 일시
2026-09-04 (같은 날 재개 — 최초 스킵과 동일 세션 연속)

## 1. 스펙/Decision 개정
- `spec/community/mom-pick-grades.md` 2.1(데이터 모델)·2.6(신규 — 인기 스팟 피커
  규칙)·3-4·3-5(확정된 결정) 개정. 기존 마이크로 리뷰/체크리스트 구조는 삭제하지
  않고 과거 데이터 조회용으로 유지, `post_type='survey_review'`를 새 값으로 추가.
- `project/decision-log.md`에 **Decision 020**으로 개정 배경/결정/이유/영향 기록.

## 2. DB 변경 (라이브 적용 완료, SQL로 직접 확인)
- `scripts/migrations/2026-09-04-mom-pick-survey-review-schema.sql`: `mom_pick_posts`에
  `event_id`(이벤트픽 참조, `user_bookmarks`와 동일한 spot/event 이원 참조 패턴) +
  `survey_review` 전용 컬럼 8종(age_groups/visit_environment/satisfaction_points/
  duration_type/weather_tags/infra_tags/companion_type/photo_urls) 추가.
  `post_type` CHECK 제약을 `'survey_review'` 포함하도록 확장. `spot_id`와 `event_id`가
  동시에 채워지는 것만 막는 교차 제약 추가(과거처럼 둘 다 null인 체크리스트 글은
  계속 허용).
- `scripts/migrations/2026-09-04-create-mom-pick-post-images-bucket.mjs`: 사진 업로드용
  Storage 버킷(`mom-pick-post-images`, `spot-curation-images`와 동일 패턴) 생성 —
  실행 완료, 라이브 확인.
- `src/types/database.types.ts` 재생성(`npx supabase gen types typescript --linked`,
  순수 추가분만 발생, 기존 타입 변경 없음 — git diff로 확인).

## 3. 백엔드
- `src/lib/community/survey-options.ts`(신규): 2단계 설문 문항 7종의 고정 선택지
  상수(`checklist-items.ts`와 동일한 패턴). age_groups는 이 프로젝트 기존 관례
  (`target_age_group`)를 따라 한글 리터럴을 저장값으로 그대로 쓴다.
- `src/lib/community/posts.ts`: `MomPickPost` 타입에 신규 컬럼 반영,
  `createSurveyReview()` 추가(스팟/이벤트 중 하나 필수, 설문/사진은 전부 선택).
- `GET /api/mom-pick/popular-spots`(신규): 반경 30km, spec 2.6이 확정한
  category_min 목록으로 기존 `get_nearby_spaces_and_events` RPC를 SPACE/EVENT
  두 번 호출해 병합 — 새 RPC를 만들지 않았다(제5장 제4조). 랭킹은 거리 오름차순
  기본 + 이미 리뷰가 있는 스팟/이벤트를 동일 거리대에서 우선(가벼운 실제 신호,
  없는 지표를 지어내지 않음).
- `POST /api/mom-pick/upload-image`(신규): 로그인 확인 후 service_role로 Storage에
  업로드(`/api/admin/spot-curations/upload-image`와 동일 패턴, 사용자별 폴더 분리).

## 4. 프런트엔드
- `src/components/community/survey-review-composer.tsx`(신규): 3단계 위저드
  (① 장소 선택 — 인기 스팟 목록 + 검색 폴백 ② 설문 7문항 ③ 자유글+사진). 기존
  `post-composer.tsx`(마이크로 리뷰/체크리스트 탭)를 대체 — 더 이상 어디서도 쓰이지
  않아 파일을 삭제했다(과거 데이터/렌더링에는 영향 없음, "새 글을 쓰는 화면"만 교체).
- `mom-pick-view.tsx`: `PostComposer` → `SurveyReviewComposer` 교체, 관련 주석 갱신.
- `dashboard-post-card.tsx`: `survey_review` 렌더링 분기 추가(연령대/방문환경/
  체류시간/만족포인트 요약 뱃지 + 자유글 + 사진 1장 미리보기). 기존 micro_review/
  checklist 분기는 그대로 보존.
- `mom-pick-dashboard.ts`: `DashboardPost`/`RawPostRow`/`POST_COLUMNS`에 신규 컬럼과
  `events(name)` 조인 반영, `spotName`이 스팟/이벤트 이름 중 있는 쪽을 담도록 확장.
- `src/components/my/my-reviews-section.tsx`(신규, todo.md 개선사항7 C영역):
  "내가 쓴 후기 (총 N건)" 컴팩트 리스트 + 클릭 시 상세 모달(전체 설문 결과 + 사진).
  과거 마이크로 리뷰/체크리스트 데이터도 같은 목록에 섞여 나오면 그 타입에 맞는
  상세 렌더링을 제공한다(하위 호환). `my-page-view.tsx`의 로그인 화면 하단에 배치.

## 특이 사항 (정직하게 기록)
- **A/B 영역(프로필&등급 카드, 찜한 스팟)은 이번 요청 범위 밖이라 착수하지 않았다** —
  사용자가 이번에 명시적으로 요청한 것은 [설문형 스마트 리뷰 폼]과 [C 영역]뿐이다.
  스킵 당시 남겨둔 제안(A/B는 승인된 기존 데이터만으로 구현 가능)은 여전히 유효하며,
  필요 시 별도로 진행을 제안한다.
- **"운영진 검증/큐레이션 스팟" 해석**: `spot_curations` 테이블을 문자 그대로
  가리키지 않고, 요구된 대상 분류로 좁혀진 `open_spaces`/`events` 자체로 해석했다
  (spec 2.6에 근거 명시 — `spot_curations`는 키즈친화 식당 전용으로 설계 목적이
  달라 이 대상 분류와 겹치는 행이 사실상 없다).
- **"인기순" 랭킹의 한계**: 별도 조회수 집계가 없어, 기존 리뷰 존재 여부만 가벼운
  신호로 반영했다 — 완전한 "인기도" 지표는 아니며, 이는 데이터가 없는 현실을
  반영한 정직한 근사치다.
- **event_id 참조 대상**: `mom_pick_posts.event_id`는 `events` 테이블을 참조한다
  (`user_bookmarks`와 동일 패턴). 검색 폴백(`SpotPicker`)은 스팟만 지원 —
  이벤트 검색까지 확장하는 것은 이번 범위를 넘어서는 별도 작업으로 남겨둔다(1단계
  기본 경로인 "인기 스팟 목록"에서는 이벤트도 이미 노출됨).
- 검증: `npx tsc --noEmit` 통과, `npm run test`(105개 파일/1097개 테스트, 기존
  1079개 + 신규 18개) 전체 통과, `npm run build` 프로덕션 빌드 통과(신규 라우트
  `/api/mom-pick/popular-spots`, `/api/mom-pick/upload-image` 정상 등록 확인).
  카테고리 실측 확인: 대상 10개 category_min 전부 실제 데이터 보유(146~25,531건).
