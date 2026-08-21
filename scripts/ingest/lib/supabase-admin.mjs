import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// 원본 데이터에 완전히 동일한 external_id(예: 동일 시설명+주소)를 가진 행이 두 건 이상
// 섞여 있으면 Postgres가 "ON CONFLICT DO UPDATE command cannot affect row a second time"로
// 배치 전체를 거부한다(실측 확인: GgEventsAdapter의 TBWTRWTRPLYHYDRDTAM 원본에 완전히 동일한
// 시설명+주소 레코드가 중복 등재된 사례, 2026-08-21). 같은 external_id는 같은 물리적 대상을
// 가리키므로 마지막 값으로 병합해 배치를 한 번만 보내도 안전하게 한다 — 이 방어는 어떤
// 어댑터든 원본에 완전 중복 레코드가 섞여 있을 수 있는 일반적인 경우라 공용 upsertRows에 둔다.
function dedupeByExternalId(rows) {
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.external_id, row);
  }
  return [...byId.values()];
}

// project/database_schema.md: external_id 기준 Upsert
export async function upsertRows(client, table, rows) {
  if (rows.length === 0) return { count: 0 };

  const dedupedRows = dedupeByExternalId(rows);

  const { error } = await client.from(table).upsert(dedupedRows, { onConflict: 'external_id' });
  if (error) throw new Error(`${table} upsert 실패: ${error.message}`);

  return { count: dedupedRows.length };
}
