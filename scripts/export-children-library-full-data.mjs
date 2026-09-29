// [노출중분류 '어린이도서관' 전체 데이터 CSV 내보내기](2026-09-29 사용자
// 지시): "노출중분류 '어린이도서관' 관련하여 전체 데이터 csv파일로 뽑아줘
// 이름하고 주소, 그리고 뱃지들, 그리고 휴관일들 관련.. 지금 이름은 DB에
// 있지만 csv가 적은 지역과 실제 주소 지역이 서로 다르다고 해서 이것들 추려서
// 내가 다시한번 확인할테니" — 지역 불일치로 이번 CSV 뱃지 반영 작업에서
// 스킵된 항목들을 사용자가 직접 재검토할 수 있도록, 노출중분류(service_
// category_id) 기준 전체 대표 스팟의 명칭/주소/뱃지/정기휴무를 한 파일로
// 모은다.
//
// [실행 방법] node scripts/export-children-library-full-data.mjs
import { pathToFileURL } from 'url';
import { loadEnv } from './lib/load-env.mjs';
import { createAdminClient } from './ingest/lib/supabase-admin.mjs';
import fs from 'fs';

loadEnv();

const CHILDREN_LIBRARY_SERVICE_CATEGORY_ID = '22286b2a-b386-4bb6-a853-31b62b3f62c7'; // 어린이 도서관

// src/lib/admin/curation-badges.ts의 CHILDREN_LIBRARY_CONFIG.badgeOptions와
// 동일한 키→라벨 매핑(scripts/는 TS를 직접 import하지 않는 기존 관례상 값만
// 그대로 옮겨온다, 제5장 제4조).
const BADGE_KEY_TO_LABEL = {
  parking: '주차 완비',
  stroller: '유모차 가능',
  nursing_room: '수유실 있음',
  diaper_table: '기저귀 갈이대',
  lib_parking_convenient: '주차 편리',
  kids_chair: '아기의자',
  kids_zone: '키즈존/놀이방',
  floor_seating: '신발벗는 마루방',
  lib_infant_reading_room: '영유아 전용 공간 분리',
  lib_quiet_talk_allowed: '소곤소곤 대화 가능',
  lib_weekend_program: '주말 독서·체험 프로그램',
  lib_english_picture_books: '영어 그림책·원서 특화',
  lib_comics_webtoon: '만화·웹툰 특화',
  reservation_required: '예약 필수',
  reservation_possible: '예약 가능',
};

const WEEKDAY_CODE_TO_KOREAN = { MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토', SUN: '일' };

function formatBadges(keys) {
  if (!keys || keys.length === 0) return '';
  return keys.map((k) => BADGE_KEY_TO_LABEL[k] ?? k).join(', ');
}

function formatExcludedWeekdays(codes) {
  if (!codes || codes.length === 0) return '';
  return codes.map((c) => WEEKDAY_CODE_TO_KOREAN[c] ?? c).join(', ');
}

// "2-MON" -> "매월 2번째 월요일"
function formatExcludedNthWeekdays(tokens) {
  if (!tokens || tokens.length === 0) return '';
  return tokens
    .map((t) => {
      const [ordinal, code] = t.split('-');
      const day = WEEKDAY_CODE_TO_KOREAN[code] ?? code;
      return `매월 ${ordinal}번째 ${day}요일`;
    })
    .join(', ');
}

function csvField(value) {
  const text = value ?? '';
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const PAGE_SIZE = 1000;

async function fetchAllRepresentativeRows(admin) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('open_spaces')
      .select('id, name, display_name, standard_name, address, excluded_weekdays, excluded_nth_weekdays')
      .eq('service_category_id', CHILDREN_LIBRARY_SERVICE_CATEGORY_ID)
      .or('group_id.is.null,is_dedup_representative.eq.true')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchCurationBadgesBySpotId(admin, spotIds) {
  const badgesBySpotId = new Map();
  for (let i = 0; i < spotIds.length; i += PAGE_SIZE) {
    const chunk = spotIds.slice(i, i + PAGE_SIZE);
    const { data, error } = await admin.from('spot_curations').select('spot_id, curation_badges').in('spot_id', chunk);
    if (error) throw new Error(`spot_curations 조회 실패: ${error.message}`);
    for (const row of data) badgesBySpotId.set(row.spot_id, row.curation_badges ?? []);
  }
  return badgesBySpotId;
}

export async function run() {
  const admin = createAdminClient();
  const rows = await fetchAllRepresentativeRows(admin);
  const badgesBySpotId = await fetchCurationBadgesBySpotId(admin, rows.map((r) => r.id));

  const csvLines = ['명칭,주소,뱃지,정기휴무요일,정기휴무N번째요일'];
  for (const row of rows) {
    const name = row.standard_name ?? row.display_name ?? row.name ?? '';
    const badges = formatBadges(badgesBySpotId.get(row.id));
    const weekdays = formatExcludedWeekdays(row.excluded_weekdays);
    const nthWeekdays = formatExcludedNthWeekdays(row.excluded_nth_weekdays);
    csvLines.push([csvField(name), csvField(row.address), csvField(badges), csvField(weekdays), csvField(nthWeekdays)].join(','));
  }

  const filename = '어린이도서관_전체데이터.csv';
  fs.writeFileSync(filename, csvLines.join('\n') + '\n', 'utf8');
  console.log(`[EXPORT_CHILDREN_LIBRARY_FULL] ${filename}: ${rows.length}건 저장`);
  return { filename, count: rows.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(`❌ [EXPORT_CHILDREN_LIBRARY_FULL] 실행 실패: ${err.message}`);
    process.exitCode = 1;
  });
}
