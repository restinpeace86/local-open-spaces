// [잘못 연결된 물리적 캠핑장 space_id 해제/재연결](2026-09-19 사용자 지시): "그룹핑
// 키에 대하여 서로다른 물리적 캠핑장 잘못연결되어 있는건 해제해줘" — 직전 작업
// (이벤트픽 space_id 그룹핑)의 조사 과정에서 발견: "서천 금빛노을 서울캠핑장"
// (open_spaces id 7fc60d00-59c2-4fd9-877c-448cd7112b6c)에 event
// 63f34608-7171-4474-aca1-9e935951012b("(텐트 설치, 전국민 예약)포천 서울캠핑장
// (2026년 9월)", venue_name="경기 포천 자연마을 서울캠핑장")가 space_id로 연결돼
// 있었는데, 실제 좌표 거리가 235,884m(약 236km, 경기 포천 vs 충남 서천)로 완전히
// 다른 물리적 장소다.
//
// [전수 감사](실측): is_active=true AND space_id IS NOT NULL인 692건 전체를 좌표
// 거리로 재검증한 결과, 1km 초과 불일치는 이 건 포함 2건뿐이었다(나머지 하나는
// "탄천양재천 방문자센터" ↔ "양재천 근린공원", 3.9km, 캠핑장이 아니고 이번 요청
// 범위 밖이라 손대지 않았다 — 필요하면 별도로 다뤄야 한다).
//
// [단순 해제(null)가 아니라 재연결한 이유]: open_spaces에 실제로 "포천 자연마을
// 서울캠핑장"(id 446caf63-fe3e-4661-afdf-c8609a5d1778, GO_CAMPING 소스)이 존재하고,
// 이벤트 좌표와의 거리가 3m로 사실상 정확히 일치한다 — match_events_to_open_spaces
// RPC의 현재(2026-09-18 개정) 매칭 기준(30m 이내 + 이름 부분일치)으로도 이 쌍은
// 정확히 통과한다("경기 포천 자연마을 서울캠핑장" venue_name이 "포천 자연마을
// 서울캠핑장" spot명을 부분 포함). 즉 이 이벤트는 애초에 그 RPC의 더 느슨했던
// 구버전(2026-09-11 최초 버전)이 잘못 연결해뒀던 것으로 보이고, RPC는
// space_id IS NULL인 행만 다시 매칭하므로(이미 연결된 행은 재검증 안 함) 그 이후
// 개정에서도 자동으로 고쳐지지 않고 남아 있었다 — null로 풀기만 하면 오히려
// 이미 알고 있는 정답을 버리는 셈이라, 검증된 올바른 스팟으로 직접 재연결한다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();
const dryRun = process.argv.includes('--dry-run');

const EVENT_ID = '63f34608-7171-4474-aca1-9e935951012b';
const WRONG_SPACE_ID = '7fc60d00-59c2-4fd9-877c-448cd7112b6c'; // 서천 금빛노을 서울캠핑장
const CORRECT_SPACE_ID = '446caf63-fe3e-4661-afdf-c8609a5d1778'; // 포천 자연마을 서울캠핑장

async function main() {
  const client = createAdminClient();

  const { data: before, error: beforeError } = await client
    .from('events')
    .select('id, title, venue_name, space_id')
    .eq('id', EVENT_ID)
    .single();
  if (beforeError) throw new Error(beforeError.message);

  console.log('반영 전:', before);
  if (before.space_id !== WRONG_SPACE_ID) {
    throw new Error(`예상한 잘못된 space_id(${WRONG_SPACE_ID})와 다릅니다 — 이미 다른 작업으로 바뀐 것일 수 있어 중단합니다: 현재 ${before.space_id}`);
  }

  if (dryRun) {
    console.log(`[dry-run] space_id를 ${CORRECT_SPACE_ID}(포천 자연마을 서울캠핑장)로 재연결 예정`);
    return;
  }

  const { data: after, error } = await client
    .from('events')
    .update({ space_id: CORRECT_SPACE_ID })
    .eq('id', EVENT_ID)
    .select('id, title, venue_name, space_id')
    .single();
  if (error) throw new Error(error.message);

  console.log('반영 후:', after);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
