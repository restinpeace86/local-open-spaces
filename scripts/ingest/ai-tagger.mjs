// implementation/todo.md 파이프라인 자동화: 태깅 미완료 항목을 감지해 재정제한다.
//
// 감지 기준은 spec/data/ai-rule.md를 그대로 따른다:
// - open_spaces: 5.3에 따르면 false/'복합'/null은 근거 불명확 시 부여하는 "정상 확정값"이다.
//   따라서 개별 필드 하나가 기본값이라고 해서 미완료로 볼 수 없다. raw_data가 있음에도
//   5개 파생 태그가 "동시에 모두" 기본값인 경우만 태깅이 정상적으로 산출되지 않은 것으로 보고
//   deriveParentalTags를 저장된 raw_data로 재적용한다.
// - events: 4.1에 따르면 event_type='ETC'는 AI가 분류를 확정하지 못했을 때 경고와 함께 남기는
//   기본값이다(seoul-culture-events.mjs → classifySeoulCultureEvent → classifyEventTypeWithAI
//   가 Gemini 키 부재/호출 실패 시에만 남김). 재실행 시점에 키가 채워졌거나 API가 복구됐다면
//   재분류를 시도한다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { deriveParentalTags, classifyEventTypeWithAI } from './lib/ai-tagging.mjs';
import { logIngest } from './lib/log.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');

async function retagIncompleteOpenSpaces(client) {
  const { data, error } = await client
    .from('open_spaces')
    .select('id, raw_data')
    .eq('is_kids_friendly', false)
    .eq('has_parking', false)
    .eq('stroller_accessible', false)
    .eq('facility_type', '복합')
    .is('target_age_group', null)
    .not('raw_data', 'is', null)
    .limit(500);

  if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);

  let checked = 0;
  let updated = 0;

  for (const row of data ?? []) {
    checked += 1;
    const tags = deriveParentalTags(JSON.stringify(row.raw_data));
    const changed =
      tags.is_kids_friendly !== false ||
      tags.has_parking !== false ||
      tags.stroller_accessible !== false ||
      tags.facility_type !== '복합' ||
      tags.target_age_group !== null;

    if (!changed) continue;
    updated += 1;

    if (!dryRun) {
      const { error: updateError } = await client.from('open_spaces').update(tags).eq('id', row.id);
      if (updateError) throw new Error(`open_spaces(${row.id}) 갱신 실패: ${updateError.message}`);
    }
  }

  return { checked, updated };
}

async function retagIncompleteEvents(client) {
  const { data, error } = await client.from('events').select('id, title').eq('event_type', 'ETC').limit(500);

  if (error) throw new Error(`events 조회 실패: ${error.message}`);

  let checked = 0;
  let updated = 0;

  for (const row of data ?? []) {
    checked += 1;
    const eventType = await classifyEventTypeWithAI({
      title: row.title,
      rawLabel: null,
      apiKey: env.GEMINI_API_KEY,
    });
    if (eventType === 'ETC') continue;
    updated += 1;

    if (!dryRun) {
      const { error: updateError } = await client.from('events').update({ event_type: eventType }).eq('id', row.id);
      if (updateError) throw new Error(`events(${row.id}) 갱신 실패: ${updateError.message}`);
    }
  }

  return { checked, updated };
}

async function main() {
  logIngest(`▶ ai-tagger 시작 (dry-run: ${dryRun})`);
  const client = createAdminClient();

  const spaces = await retagIncompleteOpenSpaces(client);
  logIngest(
    `  open_spaces: 검사 ${spaces.checked}건 중 ${spaces.updated}건 재태깅${dryRun ? ' 대상(dry-run)' : ' 완료'}`
  );

  const events = await retagIncompleteEvents(client);
  logIngest(
    `  events: 검사 ${events.checked}건 중 ${events.updated}건 재분류${dryRun ? ' 대상(dry-run)' : ' 완료'}`
  );

  logIngest('✅ ai-tagger 종료');
}

main().catch((err) => {
  logIngest(`❌ ai-tagger 실패: ${err.message}`);
  process.exitCode = 1;
});
