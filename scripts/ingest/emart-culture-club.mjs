// [이마트 컬처클럽 강좌 리스트 수집](2026-10-03 사용자 지시): "이마트 문화센터 등
// 다른곳에 대하여 홈플러스처럼 진행할예정이야" — 홈플러스와 달리 로그인/Playwright가
// 필요 없다. 실측 확인(2026-10-03): 사이트 진입 시 reCAPTCHA/NetFunnel이 뜨지만,
// 이건 페이지 로드 보호용이고 실제 강좌 데이터는 공개 AWS AppSync GraphQL API
// (`getClassByFiltering`)를 직접 호출해서 받아온다 — API 키는 이마트 프론트엔드
// JS 번들에 그대로 포함된 공개 키라 로그인/세션/브라우저 자동화 전혀 불필요.
//
// [필터 구성 — 사용자 제공](2026-10-02~03):
// - 지점(storeCode) 64개: 서울11/경기인천20/부산경상16/충청강원11/전라제주6
// - 카테고리(subCategory) 5개: 101=Club Originals, 402=With Mom, 403=With mom(event),
//   404=Kids & Children, 406=Kids & Children(event)
// - 상태(classStatus) 3개: 접수대기/접수중/정원마감(=UI "대기접수", 취소 시 등록
//   가능) — 접수마감은 사용자 지시로 제외("데이터가 너무 많다").
//
// [상태 필드 없음 — 실측 확인] 응답에 등록상태를 직접 나타내는 필드가 없다
// (classStatusBO는 "학기전환" 고정값으로 무관, occupiedFullFlag는 정원마감 여부만
// 구분). 그래서 상태별로 쿼리를 3번 나눠 호출하고, 각 행에 어떤 필터로 수집됐는지
// (filter_status)를 그대로 저장한다.
//
// [매너 있게 수집](2026-10-03 사용자 지시: "요청간격 더 늘려.. 1s 1.5s 사이로"):
// 페이지 요청 사이에 1.0~1.5초 랜덤 딜레이를 둬 짧은 시간에 과도하게 몰아치지
// 않는다(고정 간격이면 기계적인 패턴으로 보일 수 있어 랜덤 범위로 흔든다).
// 개인정보는 전혀 수집하지 않는다(강좌 메타데이터만).
//
// [요청 헤더 — 실제 프론트엔드처럼](2026-10-03 사용자 지시: "어떻게 감지할수도
// 있을거같은데"): 이 API 키는 이마트 프론트엔드가 쓰는 것과 동일한 공개 키라,
// 실제 프론트엔드가 보내는 것과 같은 모양의 요청(Origin/Referer/User-Agent)을
// 그대로 재현한다 — 속이는 게 아니라 "진짜 그 사이트에서 호출하는 요청"과
// 똑같이 만드는 것뿐이다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

const env = loadEnv();
const SOURCE_KEY = 'EMART_CULTURE_CLUB';
const GRAPHQL_URL = 'https://wrihg4edszhmvagptse4t4eggi.appsync-api.ap-northeast-2.amazonaws.com/graphql';
const PAGE_SIZE = 100;
const UPSERT_CHUNK_SIZE = 500;
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
const BROWSER_LIKE_HEADERS = {
  Origin: 'https://www.cultureclub.emart.com',
  Referer: 'https://www.cultureclub.emart.com/enrolment',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

const STORE_CODES = [
  // 서울 11개
  '974', '994', '650', '840', '981', '945', '777', '959', '550', '973', '951',
  // 경기/인천 20개
  '100', '800', '971', '998', '932', '160', '987', '967', '950', '170',
  '985', '996', '982', '410', '979', '983', '975', '993', '954', '960',
  // 부산/경상 16개
  '710', '935', '760', '186', '480', '999', '978', '700', '860', '890',
  '970', '810', '830', '943', '580', '570',
  // 충청/강원 11개
  '680', '939', '530', '964', '977', '620', '490', '984', '980', '989', '180',
  // 전라/제주 6개
  '790', '240', '934', '900', '460', '560',
];

const CATEGORY_CODES = ['101', '402', '403', '404', '406'];
const TARGET_STATUSES = ['접수대기', '접수중', '정원마감'];

const QUERY = `query getClassByFiltering($keyword: String, $filterData: [FilterData], $sortKey: String, $from: Int, $size: Int) {
  getClassByFiltering(keyword: $keyword, filterData: $filterData, sortKey: $sortKey, from: $from, size: $size) {
    total
    data {
      classId
      classTitle
      classDay
      classTime { startTime endTime }
      mainCategory { categoryCode categoryName }
      subCategory { categoryCode categoryName }
      mainStoreInfo { storeName storeCode storeCenter }
      classroom
      minClassCapacity
      classCapacity
      semesterYear
      semester
      classOriginalFee
      classFee
      classMaterialFee
      classType
      occupiedFullFlag
      channel { online offline }
      classDateInfo {
        classStartDate
        classEndDate
        classClosedDate
        classRegisterStartDate
        classRegisterEndDate
      }
    }
  }
}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

function buildFilterData(status) {
  return [
    { type: 'mainStoreInfo.storeCode', data: STORE_CODES },
    { type: 'subCategory', data: CATEGORY_CODES },
    { type: 'classStatus', data: [status] },
  ];
}

async function fetchPage(status, from, size) {
  const apiKey = env.EMART_CULTURE_CLUB_API_KEY;
  if (!apiKey) {
    throw new Error('EMART_CULTURE_CLUB_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const res = await fetchWithTimeout(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, ...BROWSER_LIKE_HEADERS },
    body: JSON.stringify({
      query: QUERY,
      variables: { keyword: '', filterData: buildFilterData(status), sortKey: 'deadline', from, size },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`이마트 컬처클럽 API 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`이마트 컬처클럽 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  if (json.errors) {
    throw new Error(`이마트 컬처클럽 GraphQL 에러: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }

  return json.data.getClassByFiltering;
}

async function fetchAllForStatus(status) {
  const items = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await fetchPage(status, from, PAGE_SIZE);
    items.push(...page.data);
    if (page.data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    await sleep(randomPacingDelay());
  }

  return items;
}

// [실측 확인](2026-10-03) — dry-run 응답에서 발견한 타입 불일치:
// - minClassCapacity/classMaterialFee가 가끔 숫자가 아니라 문자열("1") 또는
//   빈 문자열("")로 온다 — integer 컬럼에 빈 문자열을 그대로 넣으면 postgres가
//   거부한다. 빈 문자열/undefined/null은 전부 null로, 그 외엔 숫자로 변환한다.
function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// channel.online/offline이 boolean이 아니라 "Y"/"N" 문자열로 온다(실측 확인) —
// boolean 컬럼에 "Y"를 그대로 넣으면 postgres가 거부한다.
function toBoolOrNull(value) {
  if (value === 'Y') return true;
  if (value === 'N') return false;
  return null;
}

export function transform(item, filterStatus) {
  if (!item.classId || !item.classTitle) return null;

  return {
    class_id: item.classId,
    class_title: item.classTitle,
    class_day: item.classDay ?? null,
    start_time: item.classTime?.startTime ?? null,
    end_time: item.classTime?.endTime ?? null,
    main_category_code: item.mainCategory?.categoryCode ?? null,
    main_category_name: item.mainCategory?.categoryName ?? null,
    sub_category_code: item.subCategory?.categoryCode ?? null,
    sub_category_name: item.subCategory?.categoryName ?? null,
    store_code: item.mainStoreInfo?.storeCode ?? null,
    store_name: item.mainStoreInfo?.storeName ?? null,
    store_center: item.mainStoreInfo?.storeCenter ?? null,
    classroom: item.classroom ?? null,
    min_class_capacity: toIntOrNull(item.minClassCapacity),
    class_capacity: toIntOrNull(item.classCapacity),
    semester_year: item.semesterYear != null ? String(item.semesterYear) : null,
    semester: item.semester ?? null,
    class_original_fee: toIntOrNull(item.classOriginalFee),
    class_fee: toIntOrNull(item.classFee),
    class_material_fee: toIntOrNull(item.classMaterialFee),
    class_type: item.classType ?? null,
    occupied_full_flag: item.occupiedFullFlag ?? null,
    channel_online: toBoolOrNull(item.channel?.online),
    channel_offline: toBoolOrNull(item.channel?.offline),
    register_start_date: item.classDateInfo?.classRegisterStartDate ?? null,
    register_end_date: item.classDateInfo?.classRegisterEndDate ?? null,
    class_start_date: item.classDateInfo?.classStartDate ?? null,
    class_end_date: item.classDateInfo?.classEndDate ?? null,
    class_closed_date: item.classDateInfo?.classClosedDate ?? null,
    filter_status: filterStatus,
  };
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '이마트 컬처클럽 강좌 리스트 수집(공개 GraphQL API) — 관리자 검토용, open_spaces 아님',
      period: 'daily',
    });
    if (error) {
      console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
    }
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 이마트 컬처클럽 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);

  const allRows = [];
  for (const status of TARGET_STATUSES) {
    console.log(`  [${status}] 수집 시작`);
    const items = await fetchAllForStatus(status);
    console.log(`  [${status}] ${items.length}건 수신`);
    const rows = items.map((item) => transform(item, status)).filter(Boolean);
    allRows.push(...rows);
    await sleep(randomPacingDelay());
  }

  // 동일 classId가 상태 전환 중 두 상태 조회 사이에 걸쳐 중복 수신될 가능성에 대비
  // (실측상 드물지만, 있으면 ON CONFLICT가 배치 전체를 거부하므로 안전하게 처리).
  const rows = [...new Map(allRows.map((row) => [row.class_id, row])).values()];
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false };
  }

  const client = createAdminClient();
  let upsertedCount = 0;
  try {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client.from('emart_culture_club_classes').upsert(chunk, { onConflict: 'class_id' });
      if (error) {
        throw new Error(`emart_culture_club_classes upsert 실패: ${error.message}`);
      }
      upsertedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    throw err;
  }

  console.log(`✅ Supabase(emart_culture_club_classes) upsert 완료: ${upsertedCount}건`);
  await postPipelineLog(client, {
    status: 'OK',
    metaData: { count: upsertedCount, byStatus: TARGET_STATUSES.reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.filter_status === s).length }), {}) },
  });

  return { sourceKey: SOURCE_KEY, count: upsertedCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 이마트 컬처클럽 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
