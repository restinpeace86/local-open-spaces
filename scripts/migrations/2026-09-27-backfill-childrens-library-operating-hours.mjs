// [어린이도서관 후보 검수 — 휴관일 활용, 기존 행 백필](2026-09-27 사용자 지시):
// "38건의 휴관일, 운영시간을 실제로 뽑아 쓰는 작업까지 해" — 어댑터 코드
// (public-facility-open-adapter.mjs, cultural-spaces.mjs)는 이번에 CLOSEDAY/rstde를
// operating_hours에 포함하도록 고쳤지만, 이미 적재된 행은 다음 재수집 전까지
// 반영되지 않는다(open_spaces는 ALWAYS_REFRESH_FIELDS 대상이 아니라 "기존 값이
// 있으면 유지" 규칙이 적용됨).
//
// [설계 결정 — 전체 재계산이 아니라 휴관일만 덧붙인다] 처음엔 각 소스의 (수정된)
// buildOperatingHours(raw_data)를 그대로 재실행해 operating_hours 전체를 다시
// 계산하려 했으나, 실측 확인 결과 "남가좌새롬어린이도서관" 1건에서 현재
// raw_data.OPENHOUR가 빈 문자열인데 저장된 operating_hours 컬럼엔 "연 2회
// (4~5월, 9~10월)10:30~17:00"라는 더 구체적인 값이 남아있었다(open_spaces는
// raw_data도 "기존 값 유지" 규칙 대상이라 이 값이 언제 어떻게 들어왔는지 이
// 스크립트만으로는 알 수 없다 — 제3장 제5조 추측 금지). 전체 재계산은 이런
// 케이스에서 이미 있던 더 나은 정보를 휴관일 문구로 덮어써 정보를 잃을 위험이
// 있다 — 그래서 기존 operating_hours 값은 절대 지우지 않고, 원본의 휴관일
// 필드(rstde/CLOSEDAY)만 뒤에 이어붙이는 방식으로 바꿨다(이미 그 문구가 포함돼
// 있으면 건드리지 않아 재실행해도 안전/멱등).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

const CLOSED_DAY_EXTRACTORS = {
  public_facility_open: (raw) => (raw?.rstde ? `휴관일 ${raw.rstde}` : null),
  seoul_public_culture: (raw) => (raw?.CLOSEDAY ? `휴관일 ${raw.CLOSEDAY}` : null),
};

export function computeAppendedOperatingHours(source, currentOperatingHours, rawData) {
  const extractor = CLOSED_DAY_EXTRACTORS[source];
  if (!extractor) return null;
  const closedDayText = extractor(rawData ?? {});
  if (!closedDayText) return null;
  if (currentOperatingHours && currentOperatingHours.includes(closedDayText)) return null; // 이미 반영됨(멱등)
  return currentOperatingHours ? `${currentOperatingHours}, ${closedDayText}` : closedDayText;
}

async function main() {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('open_spaces')
    .select('id, name, source, operating_hours, raw_data')
    .eq('category_min', '도서관')
    .in('source', Object.keys(CLOSED_DAY_EXTRACTORS));
  if (error) throw new Error(`조회 실패: ${error.message}`);

  const targets = (rows ?? []).filter((row) => /어린이|아동/.test(row.name) && !/자료실/.test(row.name));
  console.log(`▶ 대상(순수 어린이도서관, public_facility_open/seoul_public_culture) ${targets.length}건 조회`);

  const toUpdate = [];
  let noClosedDay = 0;
  let alreadyApplied = 0;
  for (const row of targets) {
    const after = computeAppendedOperatingHours(row.source, row.operating_hours, row.raw_data);
    if (after === null) {
      const extractor = CLOSED_DAY_EXTRACTORS[row.source];
      if (extractor(row.raw_data ?? {})) alreadyApplied += 1;
      else noClosedDay += 1;
      continue;
    }
    toUpdate.push({ id: row.id, name: row.name, before: row.operating_hours, after });
  }

  console.log(`  갱신 대상: ${toUpdate.length}건 / 이미 반영됨: ${alreadyApplied}건 / 원본에 휴관일 없음: ${noClosedDay}건`);
  for (const row of toUpdate) {
    console.log(`   - ${row.name}: ${JSON.stringify(row.before)} → ${JSON.stringify(row.after)}`);
  }

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행');
    return;
  }

  let done = 0;
  let failed = 0;
  for (const row of toUpdate) {
    const { error: updateError } = await supabase.from('open_spaces').update({ operating_hours: row.after }).eq('id', row.id);
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
