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

// project/database_schema.md: external_id 기준 Upsert
export async function upsertRows(client, table, rows) {
  if (rows.length === 0) return { count: 0 };

  const { error } = await client.from(table).upsert(rows, { onConflict: 'external_id' });
  if (error) throw new Error(`${table} upsert 실패: ${error.message}`);

  return { count: rows.length };
}
