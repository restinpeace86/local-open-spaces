import { parse } from 'node-html-parser';

// [롯데백화점 문화센터 강좌 파싱](2026-10-09 사용자 캡처 기반): "이거
// 롯데마트꺼랑 다른거가?" — 실측 확인(culture.lotteshopping.com은
// culture.lottemart.com과 완전히 다른 도메인/조직의 별개 시스템, 서버
// 렌더 HTML 카드 목록을 돌려준다 — JSON 아님, node-html-parser로 파싱).
//
// [지점 — 31개, 전용 지점 페이지에서 직접 확인](index.do의 "/application/
// search/list.do?type=branch&brchCd=NNNN" 링크 텍스트 그대로).
export const LOTTE_DEPARTMENT_STORES = [
  ['0001', '본점'],
  ['0002', '잠실점'],
  ['0004', '청량리점'],
  ['0005', '부산본점'],
  ['0006', '관악점'],
  ['0007', '광주점'],
  ['0010', '영등포점'],
  ['0011', '일산점'],
  ['0012', '대전점'],
  ['0013', '강남점'],
  ['0014', '포항점'],
  ['0015', '울산점'],
  ['0016', '동래점'],
  ['0017', '창원점'],
  ['0022', '노원점'],
  ['0023', '대구점'],
  ['0024', '상인점'],
  ['0025', '전주점'],
  ['0026', '미아점'],
  ['0027', '센텀시티점'],
  ['0028', '건대스타시티점'],
  ['0333', '광복점'],
  ['0334', '중동점'],
  ['0335', '구리점'],
  ['0336', '안산점'],
  ['0340', '김포공항점'],
  ['0341', '평촌점'],
  ['0344', '인천점'],
  ['0349', '타임빌라스 수원'],
  ['0350', '롯데몰광명점'],
  ['0399', '동탄점'],
];

// [대분류(lrclsCtegryCd) — 메인 화면 "성인강좌"/"영·유아강좌"/"아동강좌"
// 라벨로 확정](실측 확인) 01=성인(제외, 사용자 지시: "아동/영유아만") /
// 02=영유아 / 03=아동. 이 두 코드만 수집한다.
export const LOTTE_DEPARTMENT_LARGE_CATEGORY_CODES = ['02', '03'];
export const LOTTE_DEPARTMENT_LARGE_CATEGORY_LABELS = { 2: '영유아', 3: '아동' };

// [중분류(mdclsCtegryCd) 비우기 — 대분류 전체를 한 번에](실측 확인)
// mdclsCtegryCd를 비우면 그 대분류 밑 모든 소분류가 합쳐져서 한 응답에
// 나온다(02 전체 6,709건 확인) — 소분류별로 따로 돌 필요 없음.
// [brchCdList 비우기 — 전체 지점을 한 번에](실측 확인) 다중값(콤마)도
// 정상 동작하지만, 비워두면 전체 지점이 합쳐져서 나온다 — 지점 순회
// 자체가 필요 없음.
// [listCnt를 크게 — 페이지네이션 없이 전량 한 번에](실측 확인:
// listCnt=10000으로 6,709건을 정말로 한 응답에 전부 받음, 7.5MB/5초) —
// 다른 6개 브랜드와 달리 대분류 2개 × 요청 1번씩, 총 2번의 HTTP 요청
// 만으로 전체 수집이 가능하다.
export const LARGE_LIST_CNT = 10000;

// [상태값 — 코드가 아니라 사람이 읽는 텍스트 그대로](실측 확인: 뱃지
// 라벨 전체 7종) 접수중=OPEN / 대기접수=WAITING / 나머지(접수예정·
// 접수마감·접수불가·강의종료·지점문의)=CLOSED(안전하게 묵음 — "지점문의"
// 는 전화로만 신청 가능해 보여 온라인 "접수 가능"으로 잘못 분류하지
// 않는다, 추측 금지).
export function normalizeLotteDepartmentStatus(statusText) {
  if (statusText === '접수중') return 'OPEN';
  if (statusText === '대기접수') return 'WAITING';
  return 'CLOSED';
}

// [응답이 예상과 다름 — 봇 차단/정책 변경 의심 감지](2026-10-09 사용자
// 지시: "차단 정책이 바뀌면 나한테 알려줘서 내가 인지할수있게해줘") 이
// 사이트는 NetFunnel(대기열)+Incapsula(WAF) 보호가 걸려있다(실측 확인:
// 홈페이지에 netfunnel.js + _Incapsula_Resource 스크립트 — 지금은
// list.ajax/view.do 요청이 그 챌린지 없이 바로 응답하지만, 나중에 정책이
// 바뀌어 이 엔드포인트들도 막히기 시작할 수 있다).
//
// [실측으로 발견한 버그 — 상세 페이지에서 오탐](2026-10-09) 처음엔
// list/detail 양쪽에 똑같이 "data-tot-cnt 없으면 차단 의심" + "NetFunnel_
// Action 포함되면 차단 의심"을 적용했는데, 실제 상세 페이지(view.do)를
// 1,679건 전부 돌려보니 전부 "차단 의심"으로 실패했다 — 원인은 두 가지
// 전제가 전부 틀렸기 때문: ① data-tot-cnt는 목록 응답에만 있는 속성이라
// 상세 페이지엔 원래부터 없다(차단과 무관). ② NetFunnel_Action 스크립트는
// 홈페이지·상세 페이지 등 "완전한 HTML 페이지"엔 표준 템플릿으로 항상
// 포함돼 있다(실측 확인: 정상적인 상세 페이지 82,757바이트 응답에도 그대로
// 있었음) — list.ajax(완전한 페이지가 아닌 가벼운 fragment 응답)에만 없는
// 것일 뿐, "차단됐다"는 신호가 아니다. 그래서 두 엔드포인트에 맞는 서로
// 다른 "정상 응답이면 반드시 있어야 할 것"을 각각 확인한다 — 평범한 파싱
// 실패(응답 구조가 바뀜)와 봇 차단 의심을 구분해, 호출부가 디스코드 알림
// 문구에 명확히 다른 원인임을 알릴 수 있게 한다.
export function looksLikeListBotBlocked(html) {
  if (typeof html !== 'string') return true;
  if (html.includes('_Incapsula_Resource')) return true;
  if (!html.includes('data-tot-cnt=')) return true;
  return false;
}

// 상세 페이지는 data-tot-cnt가 없는 게 정상이라 대신 <dt> 태그(지점/
// 강좌구분/강사명 등 13개 쌍 — 실측 확인) 존재 여부로 "정상적인 상세
// 페이지인지"를 판단한다 — 진짜 차단/에러 페이지엔 이 태그가 없다.
export function looksLikeDetailBotBlocked(html) {
  if (typeof html !== 'string') return true;
  if (html.includes('_Incapsula_Resource')) return true;
  if (!html.includes('<dt>')) return true;
  return false;
}

export function getTotalCount(html) {
  const match = /data-tot-cnt="(\d+)"/.exec(html);
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

// [카드 1건 파싱 — node-html-parser 사용](2026-10-09 실측 확인: 이
// 목록 HTML엔 <table>이 전혀 없어 AK플라자에서 겪은 table 파싱 버그가
// 재현되지 않는다 — div/a 구조라 안전함을 확인했다). 지점 코드/연도/
// 학기/강좌코드는 상세 페이지 링크(href)의 쿼리스트링에서 그대로 가져
// 온다 — 이 네 값을 합쳐야 상세 페이지를 다시 조회할 수 있고, lectCd
// 하나만으로는 지점/학기를 가로질러 유일하지 않다(실측상 짧은 4자리
// 숫자라 다른 지점에서 같은 값이 재사용될 가능성이 높음 — 추측이 아니라
// 안전하게 복합키로 묶는다).
export function parseLectureCard(anchorEl) {
  const href = anchorEl.getAttribute('href') ?? '';
  const match = /brchCd=(\w+)&yy=(\d+)&lectSmsterCd=(\w+)&lectCd=(\w+)/.exec(href);
  if (!match) return null;
  const [, brchCd, yy, lectSmsterCd, lectCd] = match;

  const titleEl = anchorEl.querySelector('p.tit');
  const classTitle = titleEl?.text.replace(/\s+/g, ' ').trim();
  if (!classTitle) return null;

  const labels = anchorEl.querySelectorAll('.label_div p.label');
  const statusText = labels[0]?.text.trim() ?? null;
  const storeName = labels[1]?.text.replace(/\s+/g, ' ').trim() ?? null;

  const imgEl = anchorEl.querySelector('img');
  const imageSrc = imgEl?.getAttribute('src') ?? null;

  return {
    // [복합 키](위 주석 참고) brand 스코프 안에서 유일하면 되므로 '_'로 합친다.
    class_id: `${brchCd}_${yy}_${lectSmsterCd}_${lectCd}`,
    brch_cd: brchCd,
    yy,
    lect_smster_cd: lectSmsterCd,
    lect_cd: lectCd,
    class_title: classTitle,
    store_code: brchCd,
    store_name: storeName,
    raw_status: statusText,
    normalized_status: normalizeLotteDepartmentStatus(statusText),
    main_image_url: imageSrc,
  };
}

export function parseLectureListResponse(html) {
  const root = parse(html);
  const anchors = root.querySelectorAll('a.lec_list');
  const items = anchors.map(parseLectureCard).filter(Boolean);
  return { items, totalCount: getTotalCount(html) };
}
