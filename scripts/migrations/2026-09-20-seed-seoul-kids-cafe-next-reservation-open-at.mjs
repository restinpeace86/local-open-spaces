// [예약 오픈 알림 — 1회성 시드](2026-09-20 사용자 지시): "아까 입력한 정보로 일단 오픈
// 시각 지정하면 안돼?" — 사용자가 제시한 서울시 공지문(2026-09-14(월) 시행, "서울형
// 키즈카페 예약 순차적 개시 안내")의 자치구별 그룹 시간표를 이번 한 번 그대로 적용해
// 기존 서울형키즈카페 이벤트의 next_reservation_open_at을 채운다.
//
// [의도적으로 하지 않은 것] 이 규칙을 seoul-yeyak-adapter.mjs나 발송 배치에 하드코딩해
// "매주 자동으로 다음 주 시각을 계산"하도록 만들지 않았다 — 사용자가 4월/9월 두 시점의
// 서로 다른 공지문을 이미 제시했고(그룹 구성 자체가 바뀐 전례가 있음), 서울시가 또
// 바꾸면 조용히 틀린 시각이 계산된다(제3장 제5조 추측 금지). 이 스크립트는 "지금 알고
// 있는 규칙으로 딱 한 번 채워두는" 용도이고, 다음 주 이후 회차는 관리자가 상세 팝업의
// ReservationOpenAtEditor로 직접 갱신해야 한다(또는 규칙이 바뀌지 않았다면 이 스크립트를
// 다시 실행해도 된다 — 매번 "다음 돌아오는 월요일"을 다시 계산하므로 재실행 안전).
//
// [매칭 범위] 이 공지문은 21개 자치구(오감/체험/모험/성장놀이터 4개 그룹)만 다루고
// 있어(실측: 4+5+7+5=21개구), 나머지 자치구(종로구/중구/관악구/동작구 등)에 서울형
// 키즈카페가 있어도 이 공지문 범위 밖이라 추측으로 시각을 넣지 않고 건너뛴다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const CATEGORY_MIN = '서울형키즈카페';

// 자치구명(접미사 "구" 포함) → 매주 월요일 KST 오픈 시각(0~23시).
const DISTRICT_OPEN_HOUR_KST = {
  // 1. 오감놀이터
  은평구: 10,
  서대문구: 10,
  마포구: 10,
  강서구: 10,
  // 2. 체험놀이터
  용산구: 12,
  양천구: 12,
  구로구: 12,
  금천구: 12,
  영등포구: 12,
  // 3. 모험놀이터
  성동구: 14,
  동대문구: 14,
  중랑구: 14,
  성북구: 14,
  강북구: 14,
  도봉구: 14,
  노원구: 14,
  // 4. 성장놀이터
  광진구: 16,
  강남구: 16,
  서초구: 16,
  송파구: 16,
  강동구: 16,
};

function findDistrict(sigunguName) {
  if (!sigunguName) return null;
  return Object.keys(DISTRICT_OPEN_HOUR_KST).find((district) => sigunguName.endsWith(district)) ?? null;
}

// "다음으로 돌아오는 월요일의 KST hour:00" 시각을 UTC ISO로 계산한다. 이미 지난
// 이번 주 월요일 해당 시각이면 다음 주로 넘어간다(추측 없이 순수 날짜 계산).
function nextMondayAtKstIso(hourKst) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC getter로 KST 벽시계를 읽기 위한 shift.
  const dayOfWeek = kstNow.getUTCDay(); // 0=일 ... 1=월 ... 6=토 (KST 기준).
  let daysUntilMonday = (1 - dayOfWeek + 7) % 7;
  if (daysUntilMonday === 0 && kstNow.getUTCHours() >= hourKst) daysUntilMonday = 7;
  const targetAsIfUtc = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + daysUntilMonday,
    hourKst,
    0,
    0
  );
  return new Date(targetAsIfUtc - 9 * 60 * 60 * 1000).toISOString();
}

async function main() {
  const supabase = createAdminClient();

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, sigungu_name, next_reservation_open_at')
    .eq('category_min', CATEGORY_MIN);
  if (error) throw new Error(`조회 실패: ${error.message}`);

  console.log(`▶ ${CATEGORY_MIN} 이벤트 ${events.length}건 조회`);

  const toUpdate = [];
  const skipped = [];
  for (const event of events) {
    const district = findDistrict(event.sigungu_name);
    if (!district) {
      skipped.push(event);
      continue;
    }
    const openAt = nextMondayAtKstIso(DISTRICT_OPEN_HOUR_KST[district]);
    toUpdate.push({ id: event.id, title: event.title, district, openAt });
  }

  console.log(`  적용 대상: ${toUpdate.length}건`);
  for (const row of toUpdate) {
    console.log(`   - [${row.district}] ${row.title} → ${row.openAt}`);
  }
  console.log(`  공지문 범위 밖(건너뜀): ${skipped.length}건`);
  for (const row of skipped) {
    console.log(`   - ${row.title} (sigungu_name=${row.sigungu_name ?? 'null'})`);
  }

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const row of toUpdate) {
    const { error: updateError } = await supabase
      .from('events')
      .update({ next_reservation_open_at: row.openAt, reservation_open_reminder_sent_at: null })
      .eq('id', row.id);
    if (updateError) {
      failed += 1;
      console.error(`  ⚠️ update 실패(${row.id}): ${updateError.message}`);
    } else {
      done += 1;
    }
  }
  console.log(`✅ 완료: 성공 ${done}건, 실패 ${failed}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
