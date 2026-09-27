// [어린이도서관 중복 스팟 그룹 — 정기휴관일 통합](2026-09-28 사용자 지시): "지금
// 어린이도서관 관련 중복 스팟 검수 및 매핑으로 동일 장소는 그룹으로 묶었는데
// 그룹으로 묶으면서 정기 휴관일 같은게 없는쪽이 대표가 되게 묶인게 있는지 확인해주고
// .. 정기휴관일 관련하여서도 둘중 하나가 값이 있으면 있는것 기준으로 통합되게 해줘..
// 동일한 그룹내 빈쪽에도 동일하게 채워주던가" — naver_place_id 백필(2026-09-27,
// dedup-merge-naver-place-id-migration)과 달리 excluded_weekdays/excluded_nth_
// weekdays는 unique 제약이 없어(같은 물리적 장소라면 모든 멤버가 동일한 값을 가져야
// 자연스러움) 대표 1건에만 옮기지 않고 그룹 내 비어있는 모든 멤버에 채운다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

function sortedJson(arr) {
  return JSON.stringify([...arr].sort());
}

// 그룹 내 이 필드의 non-null 값들이 전부 서로 같으면 그 값을, 하나도 없으면 null을,
// 서로 다른 값이 섞여 있으면(진짜 충돌) null과 함께 conflict:true를 반환한다(추측
// 금지 — 충돌은 그대로 두고 관리자 확인 대상으로 남긴다).
export function mergeGroupArrayField(memberRows, field) {
  const nonNullValues = memberRows.map((r) => r[field]).filter((v) => Array.isArray(v) && v.length > 0);
  if (nonNullValues.length === 0) return { value: null, conflict: false };
  const serialized = nonNullValues.map(sortedJson);
  const allSame = serialized.every((s) => s === serialized[0]);
  if (!allSame) return { value: null, conflict: true };
  return { value: nonNullValues[0], conflict: false };
}

async function main() {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('open_spaces')
    .select('id, name, group_id, is_dedup_representative, excluded_weekdays, excluded_nth_weekdays')
    .eq('category_min', '어린이도서관')
    .not('group_id', 'is', null);
  if (error) throw new Error(`조회 실패: ${error.message}`);

  const groups = new Map();
  for (const row of rows ?? []) {
    if (!groups.has(row.group_id)) groups.set(row.group_id, []);
    groups.get(row.group_id).push(row);
  }
  console.log(`▶ 그룹 ${groups.size}개(어린이도서관) 조회`);

  const toUpdate = [];
  const conflicts = [];
  for (const [groupId, memberRows] of groups) {
    const weekdays = mergeGroupArrayField(memberRows, 'excluded_weekdays');
    const nthWeekdays = mergeGroupArrayField(memberRows, 'excluded_nth_weekdays');
    if (weekdays.conflict || nthWeekdays.conflict) {
      conflicts.push({ groupId, memberRows });
      continue;
    }
    if (!weekdays.value && !nthWeekdays.value) continue; // 그룹 전체가 비어있음 — 채울 근거 없음.

    for (const row of memberRows) {
      const needsWeekdays = weekdays.value && sortedJson(row.excluded_weekdays ?? []) !== sortedJson(weekdays.value);
      const needsNth = nthWeekdays.value && sortedJson(row.excluded_nth_weekdays ?? []) !== sortedJson(nthWeekdays.value);
      if (!needsWeekdays && !needsNth) continue;
      toUpdate.push({
        id: row.id,
        name: row.name,
        isRepresentative: row.is_dedup_representative,
        excluded_weekdays: weekdays.value ?? row.excluded_weekdays ?? null,
        excluded_nth_weekdays: nthWeekdays.value ?? row.excluded_nth_weekdays ?? null,
      });
    }
  }

  console.log(`  채울 대상: ${toUpdate.length}건 / 충돌(수동 확인 필요): ${conflicts.length}건`);
  for (const row of toUpdate) {
    console.log(
      `   - ${row.name}${row.isRepresentative ? '(대표)' : ''}: 요일=${JSON.stringify(row.excluded_weekdays)}, N번째요일=${JSON.stringify(row.excluded_nth_weekdays)}`
    );
  }
  if (conflicts.length > 0) {
    console.log('  충돌 그룹:');
    for (const { groupId, memberRows } of conflicts) {
      console.log(`   - group ${groupId}:`);
      for (const row of memberRows) {
        console.log(`      · ${row.name}: 요일=${JSON.stringify(row.excluded_weekdays)}, N번째요일=${JSON.stringify(row.excluded_nth_weekdays)}`);
      }
    }
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
      .update({ excluded_weekdays: row.excluded_weekdays, excluded_nth_weekdays: row.excluded_nth_weekdays })
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
