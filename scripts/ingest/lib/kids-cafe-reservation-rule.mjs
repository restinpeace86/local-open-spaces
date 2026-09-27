// [예약 오픈 알림 — 공공키즈카페/서울형키즈카페 자동 주간 재계산](2026-09-27 사용자
// 지시): "이거는 일단 매주 발생하는거니깐 예약시간을 규칙안내화면과 같이 매주
// 화요일로 해줄래?" — 실측 확인 결과 이 두 카테고리는 raw_data.RCPTBGNDT/RCPTENDDT가
// 매번 갱신되는 값이 아니라(2주 접수기간이 이미 끝난 뒤에도 그대로 남아있음, 실측
// 확인) 관리자가 매주 수동으로 next_reservation_open_at을 갱신해야 했다. 서울시
// 공지문(자치구별 그룹 요일/시각)은 이미 사용자가 확정해 admin 화면 참고표
// (src/components/admin/data-grid-client.tsx의 RESERVATION_OPEN_RULE_REFERENCE)로도
// 노출해뒀다 — 이번엔 그 규칙을 매 배치마다 그대로 재계산해 next_reservation_open_at을
// 자동으로 "다음 돌아오는 요일:시각"으로 채운다.
//
// [중요] 이 매핑표는 admin 참고표와 완전히 동일한 값이어야 한다 — 서울시가 그룹
// 구성을 바꾸면 이 파일과 data-grid-client.tsx의 RESERVATION_OPEN_RULE_REFERENCE를
// 함께 갱신해야 한다(자동으로 서로 동기화되지 않음, 두 파일이 서로 다른 런타임
// 이라 공유 모듈로 묶지 않았다 — scripts/*.mjs는 Node 직접 실행, src/*.tsx는
// Next.js 빌드 대상이라 이 코드베이스에서 이 둘을 가로질러 import하는 전례가 없다).
//
// [주의 — 관리자 수동 입력과의 관계] 이 배치가 매일 실행되므로, 두 카테고리에
// 대해서는 이제 상세 팝업(ReservationOpenAtEditor)으로 수동 입력해도 다음 배치가
// 실행되면 이 규칙으로 다시 덮어쓴다. 규칙이 바뀌면 개별 행이 아니라 이 매핑표를
// 고쳐야 한다.

const TUESDAY = 2; // Date.getUTCDay() 기준(0=일요일).
const MONDAY = 1;

// 2026-04-14(화) 시행 공지문 — 화요일, 25개 자치구(6+6+6+7).
const GONGGONG_KIDS_CAFE_DISTRICT_OPEN_HOUR_KST = {
  강남구: 9,
  강동구: 9,
  강북구: 9,
  강서구: 9,
  광진구: 9,
  구로구: 9,
  관악구: 11,
  금천구: 11,
  노원구: 11,
  도봉구: 11,
  동대문구: 11,
  동작구: 11,
  마포구: 13,
  서대문구: 13,
  서초구: 13,
  성동구: 13,
  성북구: 13,
  송파구: 13,
  양천구: 15,
  영등포구: 15,
  용산구: 15,
  은평구: 15,
  종로구: 15,
  중구: 15,
  중랑구: 15,
};

// 2026-09-14(월) 시행 공지문 — 월요일, 21개 자치구(오감/체험/모험/성장, 4+5+7+5).
const SEOUL_KIDS_CAFE_DISTRICT_OPEN_HOUR_KST = {
  은평구: 10,
  서대문구: 10,
  마포구: 10,
  강서구: 10,
  용산구: 12,
  양천구: 12,
  구로구: 12,
  금천구: 12,
  영등포구: 12,
  성동구: 14,
  동대문구: 14,
  중랑구: 14,
  성북구: 14,
  강북구: 14,
  도봉구: 14,
  노원구: 14,
  광진구: 16,
  강남구: 16,
  서초구: 16,
  송파구: 16,
  강동구: 16,
};

const CATEGORY_RULES = {
  공공키즈카페: { weekday: TUESDAY, districtHours: GONGGONG_KIDS_CAFE_DISTRICT_OPEN_HOUR_KST },
  서울형키즈카페: { weekday: MONDAY, districtHours: SEOUL_KIDS_CAFE_DISTRICT_OPEN_HOUR_KST },
};

export const KIDS_CAFE_RESERVATION_CATEGORY_MINS = Object.keys(CATEGORY_RULES);

function findDistrict(districtHours, sigunguName) {
  if (!sigunguName) return null;
  return Object.keys(districtHours).find((district) => sigunguName.endsWith(district)) ?? null;
}

// "다음으로 돌아오는 {targetDayOfWeek}요일의 KST hour:00" 시각을 UTC ISO로 계산한다.
// 이미 지난 이번 주 해당 요일/시각이면 다음 주로 넘어간다(추측 없이 순수 날짜 계산,
// 두 1회성 시드 스크립트의 nextWeekdayAtKstIso/nextMondayAtKstIso와 동일한 로직).
function nextWeekdayAtKstIso(targetDayOfWeek, hourKst, now = new Date()) {
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

// categoryMin/sigunguName으로부터 "다음 예약 오픈 시각"을 계산한다. 규칙 범위 밖
// (매핑에 없는 카테고리, 또는 sigungu_name으로 자치구를 특정할 수 없는 행)이면
// null(추측으로 채우지 않음).
export function computeNextReservationOpenAt(categoryMin, sigunguName, now = new Date()) {
  const rule = CATEGORY_RULES[categoryMin];
  if (!rule) return null;
  const district = findDistrict(rule.districtHours, sigunguName);
  if (!district) return null;
  return nextWeekdayAtKstIso(rule.weekday, rule.districtHours[district], now);
}

// [공공키즈카페/서울형키즈카페 next_reservation_open_at 매일 재계산](위 설명 참고)
// 페이지네이션으로 전건 조회 후, 계산값이 현재 저장된 값과 실제로 다를 때만 UPDATE한다
// (문자열 포맷 차이로 인한 오탐을 피하려고 getTime()으로 비교) — 값이 그대로면
// reservation_open_reminder_sent_at을 건드리지 않아, 이미 발송한 회차가 매일
// 재실행마다 다시 "미발송"으로 리셋되는 사고를 막는다(값이 실제로 바뀔 때만,
// 곧 새 회차라는 뜻이므로 리셋).
export async function refreshKidsCafeReservationOpenAt(client, now = new Date()) {
  const rows = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('events')
      .select('id, sigungu_name, category_min, next_reservation_open_at')
      .in('category_min', KIDS_CAFE_RESERVATION_CATEGORY_MINS)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const openAt = computeNextReservationOpenAt(row.category_min, row.sigungu_name, now);
    if (!openAt) {
      skipped += 1;
      continue;
    }
    const currentTime = row.next_reservation_open_at ? new Date(row.next_reservation_open_at).getTime() : null;
    if (currentTime === new Date(openAt).getTime()) continue; // 이미 최신 회차 — 건드리지 않음.

    const { error: updateError } = await client
      .from('events')
      .update({ next_reservation_open_at: openAt, reservation_open_reminder_sent_at: null })
      .eq('id', row.id);
    if (updateError) throw new Error(`update 실패(${row.id}): ${updateError.message}`);
    updated += 1;
  }

  return { scanned: rows.length, updated, skipped };
}
