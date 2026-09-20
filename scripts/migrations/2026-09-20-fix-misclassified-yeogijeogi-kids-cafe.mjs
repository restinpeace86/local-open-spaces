// [예약 오픈 알림 — "여기저기" 오분류 정정](2026-09-20 사용자 지시): 사용자가 제시한
// "여기저기 서울형키즈카페" 공식 30개소 명단을 실제 서울시 API(라이브)와 대조한 결과:
// - 30개소 중 실제로 지금 API에 존재하는 건 11곳뿐이다(나머지 19곳은 아직 온라인
//   예약 자체가 API에 게시되지 않음 — 우리 파이프라인 문제가 아니라 원천 데이터
//   자체에 없음, 실측 확인).
// - 그 11곳 중 9곳은 제목에 "키즈카페"가 없어(예: "마포구 망원한강공원") 우리 카테고리
//   분류 규칙이 건드리지 않고 RAW로 '서울형키즈카페'에 남겨뒀다 — 이미 올바른
//   상태였고 지난 시드에서 9월(월요일) 규칙을 정확히 받았다.
// - 나머지 2곳("서울형 키즈카페 시립 서울식물원점", "서울형 키즈카페 양천구
//   오목공원점")은 제목에 "키즈카페"가 들어있어 카테고리 정제 규칙 엔진이
//   '공공키즈카페'("일반")로 잘못 분류했고, 그 결과 지난 시드에서 4월(화요일)
//   규칙이 잘못 적용됐다 — 이 스크립트가 이 2건만 정확히 정정한다.
//
// [범위] applyCategoryRules(scripts/ingest/lib/category-rules.mjs)는 이미
// category_min_source가 채워진 행은 다시 건드리지 않으므로(실측 확인 — "이미
// RAW/RULE/MANUAL로 채워진 행은 건드리지 않음"), 여기서 한 번 MANUAL로 정정해두면
// 이후 일일 수집 배치가 다시 '공공키즈카페'로 되돌리지 않는다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

// 9월 공지문(오감/체험/모험/성장, 월요일)의 자치구 → 시각(KST) 매핑 — 직전 시드
// 스크립트(2026-09-20-seed-seoul-kids-cafe-next-reservation-open-at.mjs)와 동일.
const DISTRICT_OPEN_HOUR_KST = {
  은평구: 10, 서대문구: 10, 마포구: 10, 강서구: 10,
  용산구: 12, 양천구: 12, 구로구: 12, 금천구: 12, 영등포구: 12,
  성동구: 14, 동대문구: 14, 중랑구: 14, 성북구: 14, 강북구: 14, 도봉구: 14, 노원구: 14,
  광진구: 16, 강남구: 16, 서초구: 16, 송파구: 16, 강동구: 16,
};

function nextMondayAtKstIso(hourKst) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dayOfWeek = kstNow.getUTCDay();
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

// external_id로 정확히 지정한다(제목 중복 legacy 행(SEOUL_RESERVATION_* 접두)까지
// 잘못 건드리지 않기 위해 — 실측 확인: 이 두 건 모두 legacy 중복 행이 남아있으나
// sigungu_name/next_reservation_open_at이 비어 있어 애초에 대상이 아니다).
const TARGETS = [
  { externalId: 'SEOUL_YEYAK_XML-GS260401', district: '강서구', title: '서울형 키즈카페 시립 서울식물원점' },
  { externalId: 'SEOUL_YEYAK_XML-YC231206', district: '양천구', title: '서울형 키즈카페 양천구 오목공원점' },
];

async function main() {
  const supabase = createAdminClient();

  for (const target of TARGETS) {
    const openAt = nextMondayAtKstIso(DISTRICT_OPEN_HOUR_KST[target.district]);
    console.log(`${target.title} (${target.district}) → category_min: 공공키즈카페 → 서울형키즈카페, next_reservation_open_at → ${openAt}`);

    if (dryRun) continue;

    const { error } = await supabase
      .from('events')
      .update({
        category_min: '서울형키즈카페',
        category_min_source: 'MANUAL',
        next_reservation_open_at: openAt,
        reservation_open_reminder_sent_at: null,
      })
      .eq('external_id', target.externalId);
    if (error) {
      console.error(`  ⚠️ update 실패: ${error.message}`);
    } else {
      console.log('  ✅ 반영 완료');
    }
  }

  if (dryRun) console.log('DRY-RUN: 실제 UPDATE 미실행');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
