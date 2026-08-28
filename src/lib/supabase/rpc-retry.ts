// [Admin 필터 체크박스 렌더링 안정성 확보](2026-08-28): 실측 근본 원인 — Supabase RPC
// 호출(예: get_category_min_options)이 대량 UPDATE 직후 일시적 DB 콜드 캐시/락 경합(이
// 세션에서 이미 여러 차례 실측된 것과 같은 종류)으로 드물게 statement timeout을 낸다.
// 짧은 재시도로 이 일시적 실패를 흡수한다(이 세션 실측상 재시도 시 거의 항상 즉시 해소됨).
export type RpcResult<T> = { data: T | null; error: { message: string } | null };

export async function rpcWithRetry<T>(
  fn: () => Promise<RpcResult<T>>,
  retries = 2,
  delayMs = 300
): Promise<RpcResult<T>> {
  let last: RpcResult<T> = { data: null, error: { message: '알 수 없는 오류' } };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    last = await fn();
    if (!last.error) return last;
    if (attempt < retries) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return last;
}
