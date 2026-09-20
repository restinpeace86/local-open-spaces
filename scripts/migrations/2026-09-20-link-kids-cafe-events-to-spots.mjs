// [키즈카페 이벤트 ↔ 스팟 연결](2026-09-20 사용자 지시): "이 스팟에 대하여 현재
// 공공키즈카페나 서울형키즈카페들은 스팟연결해줄래? 만약 스팟이 딱 맞는게 없으면
// 유사한 위치 하는게 아니라 그냥 비워둬 수동으로 하게" — events.space_id를 통해
// 물리적 장소(open_spaces)와 연결해 두면, 이벤트가 매주/매월 갱신돼도(같은 행이
// 그대로 유지됨, 아래 참고) 스팟 단위로 찜/알림을 걸 수 있게 된다.
//
// [매칭 방법과 그 한계 — 정직한 기록] 좌표 50m 이내 단일 후보를 1차로 뽑았지만
// (사용자 확인 필요), 표본을 직접 확인해보니 거리만으로는 전혀 다른 시설(교회/
// 유치원/도서관 등이 우연히 같은 건물에 있는 경우)이 다수 섞여 있었다. 그래서
// 거리만 보고 자동 연결하지 않고, "이벤트 제목과 스팟 이름이 실질적으로 같은
// 시설을 가리키는지"를 이 스크립트 작성자(AI)가 143+27건 전체를 하나씩 직접
// 검토해 확정한 목록만 연결한다(추측 금지, 제3장 제5조) — 목록에 없는 건 전부
// 의도적으로 비워 둔 것이다(관리자 수동 연결 대상).
//
// [재수집돼도 다시 연결할 필요 없음 — 실측 확인] 이 소스(SEOUL_YEYAK)는
// upsertRowsSafeMerge를 써서 같은 external_id(SVCID)는 같은 행을 그대로
// 갱신한다(생성일 2026-08-25인 행이 오늘도 예약기간만 갱신되고 있음을 실측
// 확인) — space_id는 ALWAYS_REFRESH_FIELDS에 없어 한 번 채우면 재수집으로
// 지워지지 않는다. 단, SVCID 자체가 바뀌는 경우(드묾, 시설 재등록 등)는 새 행이
// 생겨 다시 연결이 필요하다.
//
// [마포구/도봉구 — 확인 못함] open_spaces 조회가 이 두 자치구에서 반복적으로
// statement timeout이 나 후보군을 확인하지 못했다(원인 미상 — 다른 24개 자치구는
// 정상). 이 두 구의 키즈카페 이벤트는 이번 스크립트 대상에서 제외했다(빈 채로
// 남음, 별도로 재확인 필요).
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from '../ingest/lib/supabase-admin.mjs';

loadEnv();

const dryRun = process.argv.includes('--dry-run');

// [eventTitle, spotName] — 143+27건 전수 검토로 확정한 목록(위 주석 참고).
const CONFIRMED_LINKS = [
  ['서울형 키즈카페 시립 서울가족플라자점', '서울가족플라자'],
  ['서울형 키즈카페 시립 1호점', '서울가족플라자'],
  ['서울형 키즈카페 동작구 신대방2동점(동작키즈카페)', '동작키즈카페 신대방2동점'],
  ['서울형 키즈카페 관악구 신사동점', '서울형 키즈카페 관악구 신사동점'],
  ['서울형 키즈카페 동작구 대방동점(동작키즈카페)', '서울형키즈카페 동작구 대방동점'],
  ['서울형 키즈카페 강서구 발산1동점', '서울강서구육아종합지원센터 내 2층 서울형키즈카페강서구발산1동점'],
  ['서울형 키즈카페 시립 보라매공원점', '보라매공원'],
  ['서울형 키즈카페 중랑구 면목5동점 (중랑실내놀이터 늘푸른공원점)', '중랑실내놀이터 늘푸른공원점'],
  ['서울형 키즈카페 중구 신당동점(노리몽땅)', '서울형키즈카페 노리몽땅 신당점'],
  ['서울형 키즈카페 동작구 상도3동점(동작키즈카페)', '서울형키즈카페 동작구 상도3동점'],
  ['서울형 키즈카페 동작구 흑석동점(동작키즈카페)', '서울형키즈카페 동작구 흑석동점'],
  ['서울형 키즈카페 양천구 신트리공원점', '신트리공원(서울)'],
  ['양천공원 키지트 온라인 사전예약 (0922~0927)', '양천공원'],
  ['서울형 키즈카페 양천구 오목공원점', '오목공원'],
];

async function main() {
  const supabase = createAdminClient();
  const results = [];

  for (const [eventTitle, spotName] of CONFIRMED_LINKS) {
    const { data: eventRows, error: eventError } = await supabase
      .from('events')
      .select('id, space_id')
      .eq('title', eventTitle)
      .in('category_min', ['공공키즈카페', '서울형키즈카페'])
      .eq('is_active', true);
    if (eventError) throw new Error(`이벤트 조회 실패(${eventTitle}): ${eventError.message}`);
    if (eventRows.length !== 1) {
      console.warn(`⚠️ 스킵 — 이벤트 "${eventTitle}" 조회 결과 ${eventRows.length}건(1건이어야 함)`);
      continue;
    }

    const { data: spotRows, error: spotError } = await supabase
      .from('open_spaces')
      .select('id, category_min, service_category_id')
      .eq('name', spotName);
    if (spotError) throw new Error(`스팟 조회 실패(${spotName}): ${spotError.message}`);
    if (spotRows.length !== 1) {
      console.warn(`⚠️ 스킵 — 스팟 "${spotName}" 조회 결과 ${spotRows.length}건(1건이어야 함)`);
      continue;
    }

    results.push({ eventId: eventRows[0].id, eventTitle, spotId: spotRows[0].id, spotName, spot: spotRows[0] });
  }

  console.log(`▶ 연결 대상 확정: ${results.length}건 / ${CONFIRMED_LINKS.length}건`);
  for (const r of results) {
    console.log(`   - [${r.eventTitle}] → [${r.spotName}]`);
  }

  if (dryRun) {
    console.log('DRY-RUN: 실제 UPDATE 미실행');
  } else {
    let done = 0;
    for (const r of results) {
      const { error } = await supabase.from('events').update({ space_id: r.spotId }).eq('id', r.eventId);
      if (error) console.error(`  ⚠️ update 실패(${r.eventTitle}): ${error.message}`);
      else done += 1;
    }
    console.log(`✅ 연결 완료: ${done}건`);
  }

  // [노출 중분류 없는 스팟 알림](2026-09-20 사용자 지시): "스팟에 대하여 연결했을때
  // 노출중분류가 아직없는것도 관리자한테 좀 알수있게해줄래" — 기존 관리자 화면의
  // SpotServiceCategoryCheck(raw-data-modal.tsx)가 이미 이벤트 상세를 열면 자동으로
  // 이 경고를 보여주지만, 이 스크립트는 그 화면을 거치지 않고 DB에 바로 쓰므로
  // 관리자가 일일이 열어보기 전엔 알 수 없다 — 여기서 명시적으로 목록을 뽑아준다.
  const missingServiceCategory = results.filter((r) => !r.spot.service_category_id);
  console.log(`\n⚠️ 노출 중분류(service_category_id) 없는 연결 스팟: ${missingServiceCategory.length}건`);
  for (const r of missingServiceCategory) {
    console.log(`   - "${r.spotName}"(category_min=${r.spot.category_min ?? '없음'}) — 관리자 화면에서 이 이벤트를 열어 지정해 주세요: "${r.eventTitle}"`);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
