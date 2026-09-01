// [외부 공공 API 배치 수집 안정성 및 독립 실행 구조 고도화](2026-09-01 사용자 지시)
// 항목 1: "gg_public이나 tour_api 같은 대분류/그룹 루프 안에서... 각각의 개별 API
// 엔드포인트는 완전히 독립된 개별 try-catch로 감싸기". 실측 확인 결과 여러 어댑터가
// 서로 독립된 2개 이상의 외부 API를 `Promise.all([a(), b()])`로 한꺼번에 기다리고
// 있었다 — 이 방식은 하나만 실패해도 Promise.all 전체가 즉시 reject되어(1) 이미
// 성공했을 수도 있는 다른 API의 결과까지 버려지고 (2) 상위 withRetry가 "전체 fetch()"를
// 재시도해 이미 성공한 API까지 불필요하게 다시 호출하게 된다.
//
// Promise.allSettled 기반으로 각 작업을 개별 결과로 분리하고, 실패한 것만 로그로
// 남기며 null로 대체한다(호출부가 `result.name ?? []`처럼 안전하게 폴백). 모든 작업이
// 전부 실패했을 때만 예외를 던져 상위(withRetry)가 재시도 여부를 판단할 수 있게 한다.
export async function settleGroupFetches(sourceLabel, tasks) {
  const settled = await Promise.allSettled(tasks.map((t) => t.run()));

  const results = {};
  const failures = [];
  settled.forEach((outcome, i) => {
    const { name } = tasks[i];
    if (outcome.status === 'fulfilled') {
      results[name] = outcome.value;
    } else {
      results[name] = null;
      const message = outcome.reason?.message ?? String(outcome.reason);
      failures.push({ name, message });
      console.warn(`⚠️ [${sourceLabel}] ${name} 수집 실패(다른 항목은 계속 진행): ${message}`);
    }
  });

  if (failures.length === tasks.length) {
    throw new Error(
      `${sourceLabel}: 전체(${tasks.map((t) => t.name).join(', ')}) 수집 실패 — ${failures
        .map((f) => `${f.name}:${f.message}`)
        .join(' | ')}`
    );
  }
  if (failures.length > 0) {
    console.warn(
      `⚠️ [${sourceLabel}] 일부만 실패, 나머지 ${tasks.length - failures.length}/${tasks.length}건은 정상 수집됨: ${failures
        .map((f) => f.name)
        .join(', ')}`
    );
  }

  return results;
}
