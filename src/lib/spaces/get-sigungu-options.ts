import { createClient } from '@/lib/supabase/client';

// Task 9-1-8: GPS 실패 시 수동 선택 시트가 보여줄 시/군/구 목록. 하드코딩된 전국 행정구역
// 목록 대신, 실제 DB에 sigungu_name이 채워진 데이터가 있는 지역만(대표 좌표 포함) 그대로
// 노출한다 — 데이터가 없는 지역을 골라도 피드가 비는 상황을 막는다.
export type SigunguOption = {
  sigungu_name: string;
  lng: number;
  lat: number;
};

export async function getSigunguOptions(): Promise<SigunguOption[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('get_sigungu_options');
  if (error) throw new Error(`시/군/구 목록 조회 실패: ${error.message}`);

  return (data ?? []) as SigunguOption[];
}
