// [open_spaces 정기휴무 자동 채우기](2026-09-27 사용자 지시): "이거 아까 38건인가
// 있다고 했지? 이거 이미 있는건 자동으로 채워넣을수 있나?" — 방금 백필한
// operating_hours의 "휴관일 {텍스트}" 부분을 파싱해 새 구조화 컬럼
// (excluded_weekdays/excluded_nth_weekdays)을 자동으로 채운다.
//
// [설계 — 추측 금지] 원본 텍스트가 자유 형식이라 모든 패턴을 완벽히 파싱할 수는
// 없다. 확실하게 매칭되는 패턴(요일명/N번째 요일/토+일 식 bare 토큰/주말/연중무휴)만
// 채우고, 그 외(임시휴관일/기관장이 정한 날 등 텍스트 설명)는 무시한다 — 잘못
// 추측해서 틀린 요일을 채우는 것보다, 못 채우는 게 안전하다(제3장 제5조).
// "일요일을 제외한 법정공휴일"처럼 "제외" 문구가 붙은 요일은 정기 휴무가 아니라
// "법정공휴일 중 일요일은 제외"라는 뜻이라 반드시 걸러낸다(실측 21건 중 6건에서
// 발견된 패턴).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

const WEEKDAY_CHAR_TO_CODE = { 일: 'SUN', 월: 'MON', 화: 'TUE', 수: 'WED', 목: 'THU', 금: 'FRI', 토: 'SAT' };
const ORDINAL_WORD_TO_NUM = {
  첫째: 1,
  첫번째: 1,
  둘째: 2,
  두번째: 2,
  셋째: 3,
  세번째: 3,
  넷째: 4,
  네번째: 4,
  다섯째: 5,
  다섯번째: 5,
};
const ORDINAL_ALTERNATION = Object.keys(ORDINAL_WORD_TO_NUM).join('|');

function uniq(arr) {
  return Array.from(new Set(arr));
}

// [매월 N주차 요일](2026-09-27): "둘째 주 월요일+넷째 주 월요일" — 각 순번이 자기
// 요일과 "주"로 직접 묶인 패턴. 실측: 어린이생태학습도서관동아리방 사례.
const NTH_WITH_JU_RE = new RegExp(`(${ORDINAL_ALTERNATION})\\s*주\\s*(일|월|화|수|목|금|토)요일`, 'g');
// [매월 N,M째 요일](2026-09-27): "매월 둘째·넷째 월요일", "매월 첫째, 셋째 월요일",
// "매월두번째월요일"(공백 없음) — 순번 여러 개가 요일 하나 앞에 몰려 있는 패턴.
const NTH_CLUSTER_RE = new RegExp(`((?:(?:${ORDINAL_ALTERNATION})[·,및\\s]*)+)(일|월|화|수|목|금|토)요일`, 'g');
// [요일명 + "제외" 감지](2026-09-27): "일요일을 제외한 법정공휴일"은 "그 요일은
// 정기휴무가 아니다"라는 뜻이라 절대 휴무로 넣으면 안 된다(실측 6건).
const WEEKDAY_WITH_EXCLUDE_RE = /(일|월|화|수|목|금|토)요일(을\s*제외한|\s*제외)/g;
const PLAIN_WEEKDAY_RE = /(일|월|화|수|목|금|토)요일/g;

const WEEKDAY_CANONICAL_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function sortWeekdays(codes) {
  return uniq(codes).sort((a, b) => WEEKDAY_CANONICAL_ORDER.indexOf(a) - WEEKDAY_CANONICAL_ORDER.indexOf(b));
}

export function parseClosureText(operatingHours) {
  if (typeof operatingHours !== 'string') return { excludedWeekdays: null, excludedNthWeekdays: null, matched: false };
  const marker = operatingHours.indexOf('휴관일');
  if (marker === -1) return { excludedWeekdays: null, excludedNthWeekdays: null, matched: false };
  // "휴관일" 표지어 자체는 요일이 아니므로 즉시 제거한다 — 안 지우면 "휴관일 월+..."의
  // 첫 "+" 조각이 "휴관일 월"이 돼 bare 한 글자 판정("길이 1")에서 누락된다.
  let text = operatingHours.slice(marker).replace(/^휴관일\s*/, '');

  if (text.trim() === '연중무휴') {
    return { excludedWeekdays: null, excludedNthWeekdays: null, matched: true }; // 확정: 정기휴무 없음.
  }

  const nthTokens = [];

  for (const match of [...text.matchAll(NTH_WITH_JU_RE)]) {
    nthTokens.push(`${ORDINAL_WORD_TO_NUM[match[1]]}-${WEEKDAY_CHAR_TO_CODE[match[2]]}`);
  }
  text = text.replace(NTH_WITH_JU_RE, ' ');

  for (const match of [...text.matchAll(NTH_CLUSTER_RE)]) {
    const weekdayCode = WEEKDAY_CHAR_TO_CODE[match[2]];
    for (const ordinalMatch of match[1].matchAll(new RegExp(ORDINAL_ALTERNATION, 'g'))) {
      nthTokens.push(`${ORDINAL_WORD_TO_NUM[ordinalMatch[0]]}-${weekdayCode}`);
    }
  }
  text = text.replace(NTH_CLUSTER_RE, ' ');

  // ["...겹칠 경우 휴관" 같은 조건부 문구 제거](2026-09-27 실측: 서울특별시교육청
  // 어린이도서관 "일요일과 공휴일이 겹칠 경우 휴관") — "이 요일에 항상 쉰다"가 아니라
  // "특정 조건이 겹치면 쉰다"는 예외 설명이라, 그 안에 있는 요일명을 확정 휴무로
  // 넣으면 안 된다(제3장 제5조 추측 금지) — "경우"가 포함된 괄호 구간은 통째로
  // 무시한다.
  text = text.replace(/\([^)]*경우[^)]*\)/g, ' ');

  // "제외" 붙은 요일은 먼저 지워서(공백 치환) 아래 PLAIN_WEEKDAY_RE가 다시 잡지 않게 한다.
  text = text.replace(WEEKDAY_WITH_EXCLUDE_RE, ' ');

  const weeklyCodes = [];
  for (const match of [...text.matchAll(PLAIN_WEEKDAY_RE)]) {
    weeklyCodes.push(WEEKDAY_CHAR_TO_CODE[match[1]]);
  }
  text = text.replace(PLAIN_WEEKDAY_RE, ' ');

  // 남은 텍스트에서 "+"로 나눈 조각 중 bare 요일 한 글자("토+일") 또는 "주말"만 인정한다
  // (근거 없는 다른 한글 한 글자를 요일로 오인하지 않기 위해 정확히 이 두 형태만 허용).
  for (const segment of text.split('+')) {
    const trimmed = segment.trim();
    if (trimmed === '주말') {
      weeklyCodes.push('SAT', 'SUN');
    } else if (trimmed.length === 1 && WEEKDAY_CHAR_TO_CODE[trimmed]) {
      weeklyCodes.push(WEEKDAY_CHAR_TO_CODE[trimmed]);
    }
  }

  const excludedWeekdays = weeklyCodes.length > 0 ? sortWeekdays(weeklyCodes) : null;
  const excludedNthWeekdays = nthTokens.length > 0 ? uniq(nthTokens) : null;
  const matched = excludedWeekdays !== null || excludedNthWeekdays !== null;
  return { excludedWeekdays, excludedNthWeekdays, matched };
}

async function main() {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('open_spaces')
    .select('id, name, operating_hours, excluded_weekdays, excluded_nth_weekdays')
    .eq('category_min', '도서관')
    .in('source', ['public_facility_open', 'seoul_public_culture']);
  if (error) throw new Error(`조회 실패: ${error.message}`);

  const targets = (rows ?? []).filter((row) => /어린이|아동/.test(row.name) && !/자료실/.test(row.name));
  console.log(`▶ 대상(순수 어린이도서관, public_facility_open/seoul_public_culture) ${targets.length}건 조회`);

  const toUpdate = [];
  const unparsed = [];
  for (const row of targets) {
    if ((row.excluded_weekdays ?? []).length > 0 || (row.excluded_nth_weekdays ?? []).length > 0) continue; // 이미 값 있음(관리자 수동 입력 보존).
    const parsed = parseClosureText(row.operating_hours);
    if (!parsed.matched && parsed.excludedWeekdays === null && parsed.excludedNthWeekdays === null) {
      // "연중무휴"(matched=true, 값 null)와 진짜 파싱 실패(matched=false)를 구분해 리포트한다.
      if (!/휴관일\s*연중무휴/.test(row.operating_hours ?? '') && (row.operating_hours ?? '').includes('휴관일')) {
        unparsed.push(row);
      }
      continue;
    }
    toUpdate.push({ id: row.id, name: row.name, excludedWeekdays: parsed.excludedWeekdays, excludedNthWeekdays: parsed.excludedNthWeekdays });
  }

  console.log(`  채울 대상: ${toUpdate.length}건 / 파싱 실패(수동 확인 필요): ${unparsed.length}건`);
  for (const row of toUpdate) {
    console.log(`   - ${row.name}: 요일=${JSON.stringify(row.excludedWeekdays)}, N번째요일=${JSON.stringify(row.excludedNthWeekdays)}`);
  }
  if (unparsed.length > 0) {
    console.log('  파싱 실패 목록:');
    for (const row of unparsed) console.log(`   - ${row.name}: "${row.operating_hours}"`);
  }

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const row of toUpdate) {
    const { error: updateError } = await supabase
      .from('open_spaces')
      .update({ excluded_weekdays: row.excludedWeekdays, excluded_nth_weekdays: row.excludedNthWeekdays })
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  });
}
