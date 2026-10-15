// [네이버 플레이스 __APOLLO_STATE__ 파싱](src/lib/admin/naver-place-crawler.ts와 동일 로직 —
// 실측 확인(2026-09-18): pcmap.place.naver.com/map.naver.com의 검색·상세·리뷰 페이지 전부
// Next.js + Apollo Client 서버 렌더링이라 데이터가 정적 HTML의 window.__APOLLO_STATE__에
// 완전한 JSON으로 들어있다 — 헤드리스 브라우저 불필요). 이 에이전트는 todo.md 개선사항4
// 지시("나드리픽 로직과 별도로 독립적으로")에 따라 src/를 import하지 않으므로, 동일한
// 파싱 함수를 이 디렉토리 안에 독립적으로 복제해 둔다(제5장 제4조 기존 구조 우선 — 로직은
// 그대로 재사용하되 모듈 경계만 분리).
export function parseApolloState(html) {
  if (!html) return null;
  const match = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|<\/script>)/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function denormalizeApolloValue(state, value, seen = new Set()) {
  if (Array.isArray(value)) return value.map((v) => denormalizeApolloValue(state, v, seen));
  if (value && typeof value === 'object') {
    const ref = value.__ref;
    if (typeof ref === 'string') {
      if (seen.has(ref)) return null;
      const target = state[ref];
      if (target === undefined) return null;
      return denormalizeApolloValue(state, target, new Set(seen).add(ref));
    }
    const result = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = denormalizeApolloValue(state, v, seen);
    }
    return result;
  }
  return value;
}

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// 네이버 WAF가 IP 단위로 429 레이트리밋을 건다는 사실이 이미 이 세션에서
// 실측 확인됐다(src/app/api/admin/spot-curations/naver-crawl/route.ts 주석,
// 2026-09-27) — 상태 코드를 그대로 돌려줘 호출부가 429를 네트워크 오류/
// 데이터 없음과 구분해 재시도 여부를 판단할 수 있게 한다.
export async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: DEFAULT_HEADERS });
    if (!res.ok) return { html: null, status: res.status };
    return { html: await res.text(), status: res.status };
  } catch {
    return { html: null, status: null };
  }
}
