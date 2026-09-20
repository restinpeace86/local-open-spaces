// [예약 오픈 알림 — 1회성 시드, 공공키즈카페(일반)](2026-09-20 사용자 지시):
// "여기저기 서울형 키즈카페랑 일반키즈카페랑 기준 다른건 알지?" — 실측 확인 결과
// 우리 DB의 '서울형키즈카페'(category_min, RAW 9건)는 전부 한강공원/근린공원 등
// 야외 팝업형("여기저기") 시설이고, 이번에 사용자가 제시한 2026-04-14(화) 시행
// 공지문(그룹1~4, 화요일 09/11/13/15시)은 "서울형 키즈카페 {구}점"처럼 동네별 상설
// 지점("일반") 시설을 가리킨다 — 우리 DB에서는 이 지점들이 카테고리 정제 규칙
// 엔진(category-rules-engine)에 의해 이미 '공공키즈카페'(category_min_source=RULE,
// 265건)로 분류돼 있다(직전 시드 스크립트가 처리한 '서울형키즈카페' 9건과는 다른
// 대상 — 그쪽은 건드리지 않는다).
//
// [의도적으로 하지 않은 것] 직전 시드와 동일한 이유로 이 규칙을 어댑터/배치에
// 하드코딩하지 않았다 — 1회성 시드일 뿐이며, 재실행해도 안전(매번 "다음 돌아오는
// 화요일"을 다시 계산)하다.
//
// [매칭 범위] 이 공지문은 서울 25개 전 자치구를 4그룹으로 커버한다(6+6+6+7=25,
// 실측 확인). sigungu_name이 없는 행(실측 133건, 대부분 위치 좌표만 있고 주소 문자열이
// 없는 레거시 데이터)은 자치구를 알 수 없어 추측하지 않고 건너뛴다(제3장 제5조).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');
const CATEGORY_MIN = '공공키즈카페';
const TUESDAY = 2; // Date.getUTCDay() 기준(0=일요일).

// 자치구명(접미사 "구" 포함) → 매주 화요일 KST 오픈 시각(0~23시).
const DISTRICT_OPEN_HOUR_KST = {
  // 1그룹
  강남구: 9,
  강동구: 9,
  강북구: 9,
  강서구: 9,
  광진구: 9,
  구로구: 9,
  // 2그룹
  관악구: 11,
  금천구: 11,
  노원구: 11,
  도봉구: 11,
  동대문구: 11,
  동작구: 11,
  // 3그룹
  마포구: 13,
  서대문구: 13,
  서초구: 13,
  성동구: 13,
  성북구: 13,
  송파구: 13,
  // 4그룹
  양천구: 15,
  영등포구: 15,
  용산구: 15,
  은평구: 15,
  종로구: 15,
  중구: 15,
  중랑구: 15,
};

function findDistrict(sigunguName) {
  if (!sigunguName) return null;
  return Object.keys(DISTRICT_OPEN_HOUR_KST).find((district) => sigunguName.endsWith(district)) ?? null;
}

// "다음으로 돌아오는 {targetDayOfWeek}요일의 KST hour:00" 시각을 UTC ISO로 계산한다.
function nextWeekdayAtKstIso(targetDayOfWeek, hourKst) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();
  let daysUntilTarget = (targetDayOfWeek - dayOfWeek + 7) % 7;
  if (daysUntilTarget === 0 && kstNow.getUTCHours() >= hourKst) daysUntilTarget = 7;
  const targetAsIfUtc = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + daysUntilTarget,
    hourKst,
    0,
    0
  );
  return new Date(targetAsIfUtc - 9 * 60 * 60 * 1000).toISOString();
}

async function main() {
  const supabase = createAdminClient();

  const rows = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, sigungu_name, next_reservation_open_at')
      .eq('category_min', CATEGORY_MIN)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`▶ ${CATEGORY_MIN} 이벤트 ${rows.length}건 조회`);

  const toUpdate = [];
  const skipped = [];
  for (const event of rows) {
    const district = findDistrict(event.sigungu_name);
    if (!district) {
      skipped.push(event);
      continue;
    }
    const openAt = nextWeekdayAtKstIso(TUESDAY, DISTRICT_OPEN_HOUR_KST[district]);
    toUpdate.push({ id: event.id, title: event.title, district, openAt });
  }

  console.log(`  적용 대상: ${toUpdate.length}건`);
  console.log(`  자치구 정보 없어 건너뜀: ${skipped.length}건`);

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행 — 대상 5건 예시:');
    for (const row of toUpdate.slice(0, 5)) {
      console.log(`   - [${row.district}] ${row.title} → ${row.openAt}`);
    }
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
