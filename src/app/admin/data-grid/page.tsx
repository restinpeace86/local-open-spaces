import { createClient } from '@/lib/supabase/server';
import { AdminDataGridClient } from '@/components/admin/data-grid-client';

// implementation/todo.md Task 6: 개발자 전용 Read-Only 데이터 점검 도구.
// 필터 옵션(출처/카테고리)은 하드코딩하지 않고 DB의 실제 값을 조회해 구성한다.
export default async function AdminDataGridPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('open_spaces').select('source_type, category');

  if (error) {
    return (
      <div className="p-6 text-sm text-red-500">필터 옵션 조회 실패: {error.message}</div>
    );
  }

  const sourceTypeOptions = Array.from(new Set((data ?? []).map((row) => row.source_type))).sort();
  const categoryOptions = Array.from(new Set((data ?? []).map((row) => row.category))).sort();

  return (
    <AdminDataGridClient sourceTypeOptions={sourceTypeOptions} categoryOptions={categoryOptions} />
  );
}
