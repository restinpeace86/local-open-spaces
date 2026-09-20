// [상시 추천 픽 테마별 분류 — 기존 데이터 백필](2026-09-20 사용자 지시): 새로 추가된
// curated_items.themes(2026-09-20-curated-items-themes.sql)를 실제 등록된 40건에
// 채워 넣는다. 제목에 실제로 등장하는 키워드로만 판정한다(추측 금지, 제3장 제5조) —
// 실측(node로 전체 40건 title 직접 조회) 결과 아래 키워드만으로 40건 전부가 애매함
// 없이 분류된다:
//   - '키즈카페' 포함 → KIDS_CAFE (예: "동탄공룡월드&키즈카페"도 실제 이용 형태가
//     키즈카페라 이 하나로 충분, THEME_PARK 중복 태깅 안 함)
//   - '동물원' 또는 '아쿠아리움' 포함 → ANIMAL_AQUARIUM
//   - '어드벤처'(롯데월드) · '서울랜드' · '테마파크'(루덴시아) · '워터파크'(원마운트) ·
//     '원더빌리지'(매직플로우) 포함 → THEME_PARK
//   - '남이섬' · '트리하우스' · '스누피가든' 포함 → NATURE_EXPERIENCE
// 어느 키워드에도 안 걸리는 건("아르떼뮤지엄" 1건) themes를 비워두면 화면에서 이미
// SPECIAL_EXPERIENCE(기타)로 자동 폴백하므로(filterCuratedItemsByTheme) 그대로 둔다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();
const dryRun = process.argv.includes('--dry-run');

const KEYWORD_RULES = [
  { keywords: ['키즈카페'], theme: 'KIDS_CAFE' },
  { keywords: ['동물원', '아쿠아리움'], theme: 'ANIMAL_AQUARIUM' },
  { keywords: ['어드벤처', '서울랜드', '테마파크', '워터파크', '원더빌리지'], theme: 'THEME_PARK' },
  { keywords: ['남이섬', '트리하우스', '스누피가든'], theme: 'NATURE_EXPERIENCE' },
];

function classify(title) {
  const themes = new Set();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => title.includes(kw))) themes.add(rule.theme);
  }
  return [...themes];
}

async function main() {
  const admin = createAdminClient();
  const { data, error } = await admin.from('curated_items').select('id,title,themes');
  if (error) throw new Error(error.message);

  let updated = 0;
  let skippedNoMatch = 0;
  let skippedAlreadySet = 0;

  for (const row of data) {
    if (row.themes && row.themes.length > 0) {
      skippedAlreadySet += 1;
      continue;
    }
    const themes = classify(row.title);
    if (themes.length === 0) {
      console.log(`  (미매칭, 기타로 폴백 유지) ${row.title}`);
      skippedNoMatch += 1;
      continue;
    }
    console.log(`  ${row.title} → ${themes.join(', ')}`);
    if (!dryRun) {
      const { error: updateError } = await admin.from('curated_items').update({ themes }).eq('id', row.id);
      if (updateError) throw new Error(updateError.message);
    }
    updated += 1;
  }

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}총 ${data.length}건 중 ${updated}건 ${dryRun ? '반영 예정' : '반영'}, ` +
      `${skippedAlreadySet}건 이미 설정됨(건너뜀), ${skippedNoMatch}건 미매칭(기타 폴백 유지)`
  );
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
