import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
}

// 1. Supabase - REST 엔드포인트 reachability (anon key)
async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return record('Supabase (REST)', 'MISSING', '환경변수 없음');
  try {
    const res = await fetch(`${url}/rest/v1/open_spaces?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (res.ok) {
      record('Supabase (REST)', 'OK', `open_spaces 테이블 조회 성공 (HTTP ${res.status})`);
    } else {
      record('Supabase (REST)', 'FAIL', `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    record('Supabase (REST)', 'ERROR', e.message);
  }
}

// 2. Supabase Management API (access token) - 마이그레이션에 사용
async function checkSupabaseManagement() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !url) return record('Supabase (Management API)', 'MISSING', '환경변수 없음');
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'select 1;' }),
    });
    if (res.ok) {
      record('Supabase (Management API)', 'OK', 'SQL 실행 권한 확인됨 (마이그레이션 적용 가능)');
    } else {
      record('Supabase (Management API)', 'FAIL', `HTTP ${res.status}`);
    }
  } catch (e) {
    record('Supabase (Management API)', 'ERROR', e.message);
  }
}

// 3. Gemini API
async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return record('Gemini API', 'MISSING', '환경변수 없음');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    if (res.ok) {
      const data = await res.json();
      record('Gemini API', 'OK', `사용 가능 모델 ${data.models?.length ?? 0}개 조회됨`);
    } else {
      record('Gemini API', 'FAIL', `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    record('Gemini API', 'ERROR', e.message);
  }
}

// 4. Kakao Maps (JS key) - 도메인 제한 키라 서버에서 직접 호출 검증 불가, 존재 여부만 확인
async function checkKakao() {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;
  if (!key) return record('Kakao Maps (JS key)', 'MISSING', '환경변수 없음');
  record(
    'Kakao Maps (JS key)',
    'SKIP',
    '값 존재 확인됨. JS key는 Referer(도메인) 제한이 걸려 있어 서버 curl로 검증 불가 — localhost:3000 브라우저에서 지도 렌더링으로 확인 필요'
  );
}

// 5. 서울 열린데이터광장 - 문화행사정보 엔드포인트로 실제 호출 검증 (spec/data/data_sources.md #05)
async function checkSeoulOpenData() {
  const key = process.env.SEOUL_OPEN_DATA_KEY;
  if (!key) return record('서울 열린데이터광장', 'MISSING', '환경변수 없음');
  try {
    const res = await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/culturalEventInfo/1/1/`);
    const text = await res.text();
    const json = JSON.parse(text);
    const result = json.culturalEventInfo?.RESULT ?? json.RESULT;
    if (result?.CODE === 'INFO-000') {
      record('서울 열린데이터광장', 'OK', 'culturalEventInfo 호출 성공');
    } else {
      record('서울 열린데이터광장', 'FAIL', `${result?.CODE} ${result?.MESSAGE}`);
    }
  } catch (e) {
    record('서울 열린데이터광장', 'ERROR', e.message);
  }
}

// 6. 한국관광공사 TourAPI - searchFestival2로 실제 호출 검증 (spec/data/data_sources.md #06)
async function checkTourApi() {
  const key = process.env.TOUR_API_KEY;
  if (!key) return record('한국관광공사 TourAPI', 'MISSING', '환경변수 없음');
  try {
    const today = new Date();
    const d = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const url = `https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${encodeURIComponent(key)}&MobileOS=ETC&MobileApp=local-open-spaces&_type=json&eventStartDate=${d}&numOfRows=1&pageNo=1`;
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok) {
      const json = JSON.parse(text);
      record('한국관광공사 TourAPI', 'OK', `searchFestival2 호출 성공 (전체 ${json.response?.body?.totalCount ?? '?'}건)`);
    } else {
      const json = JSON.parse(text);
      const msg = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
      record(
        '한국관광공사 TourAPI',
        'FAIL',
        `HTTP ${res.status} ${msg?.errMsg ?? ''} — data.go.kr 마이페이지에서 TourAPI 4.0 활용신청 승인 상태 확인 필요`
      );
    }
  } catch (e) {
    record('한국관광공사 TourAPI', 'ERROR', e.message);
  }
}

// 7. 공공데이터포털 - 도시공원/체육시설/문화기반시설 정확한 엔드포인트 미확정으로 존재 여부만 확인
async function checkPresenceOnly(envKey, label) {
  const value = process.env[envKey];
  if (!value) return record(label, 'MISSING', '환경변수 없음');
  record(label, 'SKIP', '값 존재 확인됨. 실제 호출 테스트는 정확한 엔드포인트 스펙 확정 후 추가 예정');
}

async function main() {
  await checkSupabase();
  await checkSupabaseManagement();
  await checkGemini();
  await checkKakao();
  await checkSeoulOpenData();
  await checkTourApi();
  await checkPresenceOnly('PUBLIC_DATA_API_KEY', '공공데이터포털 (data.go.kr - 도시공원/체육시설/문화기반시설)');

  console.log('\n=== API 키 연결 상태 점검 결과 ===\n');
  const iconOf = { OK: '✅', FAIL: '❌', ERROR: '❌', MISSING: '⚠️', SKIP: '⏭️' };
  for (const r of results) {
    console.log(`${iconOf[r.status]} [${r.status}] ${r.name} — ${r.detail}`);
  }

  const hasFailure = results.some((r) => r.status === 'FAIL' || r.status === 'ERROR' || r.status === 'MISSING');
  process.exit(hasFailure ? 1 : 0);
}

main();
