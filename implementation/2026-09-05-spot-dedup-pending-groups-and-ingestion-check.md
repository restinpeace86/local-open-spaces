# 중복 스팟 검수 진행 상태 임시 저장 기능 + 오늘자 신규 수집 0건 원인 실측 확인

## 구현 대상
사용자 지시 4건 중 실제 코드/DB 변경이 필요했던 2건:
1. "geohash 정렬로 그룹핑된 것에 대하여.. 임시테이블로써.. 수정 다하고 등록하면 임시테이블에서
   진짜 테이블로 옮겨가고 임시테이블에서는 해당 row들 삭제된다거나?" — 중복 검수 진행 상태를
   임시 테이블에 저장하는 기능 신규 구현.
2. "오늘 신규 반영건은 open_spaces / events 둘다 0건이네 진짜 0건인지 못가져온건지 확인해봐." —
   실측 조사(코드 변경 없음, 조사 결과만 기록).

나머지 2건(노출 중분류가 원본을 덮어쓰지 않는지 확인 / 지오코딩 파이프라인 설계 확인 질문)은
이미 그렇게 구현돼 있음을 코드로 확인해 답변만 하고 별도 변경은 하지 않았다(제3장 제5조 —
이미 맞게 동작하는 것을 임의로 바꾸지 않음).

## 구현 일시
2026-09-05

## 변경 사항

### 1. 중복 스팟 검수 진행 상태 임시 저장
- `scripts/migrations/2026-09-05-spot-dedup-pending-groups.sql`(라이브 반영 완료): 신규 테이블
  `spot_dedup_pending_groups`(id, group_key unique, member_spot_ids uuid[], status
  `in_progress`|`ignored`, created_at, updated_at).
- `src/lib/admin/spot-dedup-pending-key.ts`(신규): `buildPendingGroupKey(memberSpotIds)` —
  구성원 id를 정렬해 이어붙인 결정적 키. 기존 `DedupGroup.groupKey`(유니온파인드 루트 id)는
  스캔마다 달라질 수 있어 임시 저장 식별자로 쓸 수 없어 새로 도입했다.
- `src/app/api/admin/spot-dedup/pending-groups/route.ts`(신규): GET(목록 + open_spaces 조인),
  POST(upsert — group_key 충돌 시 갱신), DELETE(수동 삭제/무시 취소).
- `src/app/api/admin/spot-dedup/apply/route.ts`: 그룹을 최종 저장(open_spaces 반영 +
  spot_dedup_groups 이력 기록)한 직후, 같은 group_key의 임시 저장 행을 서버에서 자동
  삭제한다 — "등록하면 임시테이블에서 삭제" 요구사항 그대로. 정리 실패는 핵심 저장 성공
  응답을 막지 않는다(부수 효과).
- `src/components/admin/spot-dedup-panel.tsx`:
  - 그룹을 열어 검수를 시작하면(`handleOpenGroup`) 자동으로 `in_progress`로 임시 저장한다.
  - 그룹 목록에 "🙈 중복 아님" 버튼을 추가 — 누르면 `ignored`로 저장하고, 같은 구성원 집합의
    그룹은 다음 스캔에서도 계속 다시 목록에 걸러낸다(`ignoredGroupKeys`로 필터링 — open_spaces
    데이터 자체는 그대로라 재스캔 시 union-find가 매번 똑같이 묶기 때문에, 저장해두지 않으면
    "무시했는데도 계속 다시 나타나는" 문제가 생긴다).
  - 새 섹션 "📌 진행 중 저장된 그룹" — 서버에 저장된 in_progress/ignored 그룹을 보여주고,
    "이어서 검수"로 기존 모달을 다시 열거나 "삭제"로 임시 저장을 취소할 수 있다.
- `src/types/database.types.ts`: 재생성(순수 반영).
- 테스트: `spot-dedup-panel.test.tsx`에 4개 신규 테스트 추가(그룹 열면 in_progress 저장,
  "중복 아님" 클릭 시 ignored 저장 + 즉시 목록에서 제거, 진행 중 그룹 목록 표시 + "이어서
  검수", 삭제) + 기존 1개 테스트를 새 섹션 추가로 늘어난 "📥 불러오기" 버튼 개수(2→3)에 맞게
  수정.

### 2. 오늘(2026-09-05) 신규 수집 0건 — 실측 확인 결과
**DB에 직접 SQL로 확인 — 표시 버그가 아니라 실제로 0건이 맞다.**
```sql
select 'open_spaces', count(*), max(created_at) from open_spaces where created_at >= 오늘(KST) 00:00
union all
select 'events', count(*), max(created_at) from events where created_at >= 오늘(KST) 00:00
-- 결과: 둘 다 count=0, max(created_at)=null
```
원인은 두 갈래로 서로 다르다(추측 없이 각각 실측):
- **open_spaces**: 이 테이블은 애초에 Daily가 아니라 Monthly 배치(매월 1일 새벽) 전용
  대상이다(docs/pipeline-log.md 2026-08-26 기록 — "open_spaces 전용 배치는 Weekly→Monthly로
  전환"). 오늘(9/5)은 매월 1일이 아니므로 이 배치 경로로는 원래도 0건이 정상이다.
- **events**: GitHub Actions API로 직접 조회한 결과(`gh` CLI 미설치라 REST API로 직접 확인),
  일일 배치(`ingest-daily.yml`, KST 02:47 실행)의 가장 최근 실행이 **`in_progress` 상태로
  3시간 넘게 멈춰 있다**(2026-09-04 19:54 UTC 시작 → 확인 시점 23:13 UTC까지도 완료 안 됨).
  job 단계를 보면 "Daily Events Batch(GG_CULTURE_EVENTS, ...)" 스텝에서 멈춰 있고, 이후
  단계(로그 커밋 등)는 전부 대기(pending) 상태 — `docs/pipeline-log.md`에도 9/4 08:28(KST) 이후
  신규 기록이 없다(git log로 확인).
  - fetch 타임아웃(`fetchWithTimeout`, AbortController 30초)과 재시도(`withRetry`, 최대
    4회 시도·5s/10s/20s 백오프)는 코드상 정상적으로 각 요청을 30초~수십 초 내로 제한하고
    있어, 정상적인 경우라면 이 정도로 오래 걸릴 수 없다 — 그런데도 실제로는 3시간 넘게
    멈춰 있다는 게 이번에 새로 발견된 사실이다.
  - **다만 정확히 어느 지점에서 왜 멈췄는지는 이번에 확정하지 못했다** — GitHub Actions의
    실제 job 로그를 받으려면 저장소에 admin 권한이 있는 토큰이 필요한데(REST API가
    403 "Must have admin rights to Repository" 반환), 이 환경에는 `gh` CLI도 설치돼 있지
    않고 인증된 토큰도 없어 로그 원문을 직접 볼 수 없었다. 코드만 봐서는 fetch 타임아웃/
    재시도 로직 자체에 명백한 결함을 찾지 못했다 — 확인되지 않은 원인을 추측으로 "고쳤다"고
    기록하지 않는다(제3장 제5조 추측 금지).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 105개 파일 / 1111개 테스트(기존 1107개 + 신규 4개) 전체 통과.
- `npm run build`: 프로덕션 빌드 통과, `/api/admin/spot-dedup/pending-groups` 라우트 정상 등록
  확인.
- 신규 테이블 마이그레이션 라이브 반영 확인(`node scripts/apply-sql.mjs`로 직접 적용).
- 오늘자 신규 수집 0건은 DB에 직접 SQL을 실행해 실측 확인(표시 문제가 아님을 확정).
- GitHub Actions REST API로 최근 워크플로 실행 이력을 직접 조회해 "멈춰 있는 실행"을
  실측으로 특정했다(추측이 아니라 실행 ID·타임스탬프·job 단계까지 확인).

## 특이 사항
- **events 배치가 멈춘 근본 원인은 미해결 상태로 남아 있다.** 이 작업에서는 "0건이 진짜인지"
  확인하는 데까지만 실측했고, 코드 레벨 결함을 찾지 못한 채 "고쳤다"고 보고하지 않는다.
  사용자가 GitHub Actions 화면에서 해당 실행(2026-09-04 19:54 UTC 시작)을 직접 취소하고
  `workflow_dispatch`로 수동 재실행하거나, 이 세션에 `actions:read` 권한이 있는 토큰을
  제공하면 실제 job 로그 원문으로 정확한 멈춤 지점을 추가로 특정할 수 있다.
- **노출 중분류(service_category_id)는 원본 중분류(category, category_min)를 덮어쓰지 않는다** —
  `bulk-category-mapping/route.ts`와 `spot-dedup/apply/route.ts` 둘 다 `service_category_id`
  컬럼만 UPDATE하고 `category`/`category_min`은 건드리지 않는 것을 코드로 재확인했다(이미
  그렇게 구현돼 있어 변경 없음).
- **지오코딩 파이프라인 설계 질문에 대한 답변**: 사용자가 설명한 "주소 없으면 URL 크롤링 →
  홀/실 파싱 → 카카오맵에서 건물 주소 찾기 → 그 주소로 지오코딩" 흐름은
  `gg-culture-location-enrichment.mjs`에 이미 구현된 패턴과 큰 틀에서 일치하지만, 2가지는
  다르다: ① 이건 **모든 데이터가 아니라 GG_CULTURE_EVENTS(API1) 이벤트 소스 하나**에만
  해당한다(이 소스만 구조적으로 원본에 주소/장소 필드가 없어 크롤링이 필요 — 대다수 다른
  어댑터는 원본 API 응답에 주소가 이미 있어 바로 지오코딩한다). ② 카카오 단계는 "건물 주소를
  찾은 뒤 그 주소를 다시 지오코더에 넣는" 2단계가 아니라, 카카오 "키워드 장소 검색"이 장소명
  텍스트를 받아 위경도를 **1단계로 바로** 반환한다(`kakao-geocoder.mjs`) — 또한 실/층 단위를
  제거하는 것은 "먼저 반드시 거치는 전처리"가 아니라, 원문 그대로 먼저 지오코딩을 시도하고
  실패했을 때만 시도하는 **폴백**이다.
