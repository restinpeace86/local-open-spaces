// RURAL_EDUCATION_FARM: 농촌진흥청 농촌교육농장 (농사로 api.nongsaro.go.kr, 서비스명
// fmlgEdcFarmm, 오퍼레이션 fmlgEdcFarmmList).
//
// [2026-08-29 라이브 검증 완료] 사용자가 실제 NONGSARO_API_KEY를 발급받아 .env.local에
// 채운 뒤, 그 키로 직접 호출해 실제 XML 응답을 확인했다 — 아래 필드 매핑과 파싱 로직
// (`items` 내부에 `item[]`/`numOfRows`/`totalCount`/`pageNo`가 함께 온다는 것 포함)이
// reference/농촌교육농장/샘플소스/rest/php/fmlgEdcFarmmList.php의 필드 접근 경로와
// 정확히 일치함을 실측으로 확인했다(총 253건, resultCode='00'). 실제 프로덕션 DB에도
// 250건 upsert 완료(지오코딩 실패 3건은 원본 주소 자체의 오탈자 — 아래 참고).
//
// 응답 형식: 이 API는 JSON을 지원하지 않고 XML만 반환한다(실측 확인 — `type=json`을
// 붙여도 무시되고 XML이 그대로 온다). Node에 내장 XML 파서가 없어 fast-xml-parser를
// 신규 의존성으로 추가했다(이 프로젝트에서 XML 응답을 쓰는 유일한 소스).
//
// 리스트 필드(샘플 코드 기준): cntntsNo(콘텐츠 고유번호, external_id로 사용) / cntntsSj
// (제목) / adstrdName(지역명) / locplc(소재지 주소) / thema(주제) / telno(연락처) /
// thumbImgUrl / imgUrl. 좌표 필드는 리스트/상세 어느 쪽에도 없다(샘플 코드에 전혀 언급되지
// 않음) — 전량 VWorld 지오코딩이 필요하다(gg-events-adapter.mjs와 동일한 "전량 지오코딩"
// 패턴, Kidscafe류의 "결측 시에만" 패턴이 아님).
//
// 링크 정보(사용자 지시 "공식 홈페이지... 있다면 반영"): 홈페이지 URL(`url` 필드)은 상세
// 조회(fmlgEdcFarmmDtl, cntntsNo별 개별 호출)에만 있고 목록에는 없다. 실제 키 없이는 상세
// 조회 1건당 호출 횟수·응답 시간·요청 제한을 검증할 수 없어(전건 상세 조회 시 목록의 N배
// 호출이 필요), 이번 구현 범위에서는 목록 조회만으로 완성하고 info_url은 null로 둔다 —
// 실제 키 확보 후 상세 조회 추가를 별도 후속 작업으로 남긴다(제3장 제5조 추측 금지:
// 검증 못한 API 호출 패턴을 무작정 늘리지 않는다).
//
// 카테고리: 사용자 지시에 따라 5대 UI 카테고리 "체험·클래스"(EXPERIENCE_CLASS)로 묶고,
// category_min은 '교육농장'으로 RAW 태깅한다(체험휴양마을과 구분).
//
// 데이터 품질 특이사항(라이브 검증 중 실측 확인, 원본 데이터 자체의 특성이라 어댑터에서
// 보정하지 않음): (1) 좌표 지오코딩 253건 중 3건 실패 — locplc 원본에 오탈자("와부음"→
// 정확히는 "와부읍") 또는 시/도명 오기("전남광주통합특별시"라는 실재하지 않는 행정구역명)가
// 있어 VWorld가 매칭하지 못함, 해당 건은 정상적으로 skip된다. (2) locplc가 시/도 접두어
// 없이 시/군/구부터 시작하는 경우가 잦아(예: "함양군 안의면...", 250건 중 48건) 공용
// extractSigunguName()가 시/군/구를 식별하지 못해 sigungu_name이 null로 남는다 — 이는
// schema-mapper.mjs의 기존 정의된 동작(판별 불가 시 임의로 만들어내지 않고 null)이며 이
// 어댑터만의 문제가 아니라 원본 주소 표기 자체의 특성이다.
//
// is_kids_friendly: "농촌교육농장"은 농촌진흥청이 학생 현장체험학습·자유학기제 대상으로
// 품질인증하는 시설이라는 것이 이 소스 자체의 정의이자 정체성이다(매뉴얼 제목 및
// 상세조회의 "품질인증연도" 필드가 이를 뒷받침) — playground-adapter.mjs/
// gg-kidscafe-adapter.mjs와 동일한 논리로 개별 텍스트 근거 없이 true로 고정한다.
import { XMLParser } from 'fast-xml-parser';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { geocode, hasVworldApiKey } from './lib/vworld-geocoder.mjs';

const BASE_URL = 'https://api.nongsaro.go.kr/service/fmlgEdcFarmm';
const GEOCODE_PACING_MS = 250;
const GEOCODE_MAX_ATTEMPTS = 3;
const SOURCE = 'rural_education_farm';

export const RURAL_EDUCATION_FARM_CATEGORY_MIN = '교육농장';

const xmlParser = new XMLParser({ isArray: (name) => name === 'item' });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveName(item) {
  return item.cntntsSj;
}

function resolveAddress(item) {
  return item.locplc;
}

export class RuralEducationFarmAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'RURAL_EDUCATION_FARM', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.NONGSARO_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        'NONGSARO_API_KEY 환경변수가 설정되지 않았습니다. 농사로(https://www.nongsaro.go.kr)에서 Open API 인증키를 발급받아 설정하세요(data.go.kr의 PUBLIC_DATA_API_KEY와는 별개 키입니다).'
      );
    }
    if (!hasVworldApiKey()) {
      throw new Error(
        'VWORLD_API_KEY 환경변수가 설정되지 않았습니다. 농촌교육농장 API는 좌표를 전혀 제공하지 않아 전량 지오코딩이 필요합니다.'
      );
    }
  }

  async fetchPage(pageNo) {
    const params = new URLSearchParams({ apiKey: this.apiKey, pageNo: String(pageNo) });
    const url = `${BASE_URL}/fmlgEdcFarmmList?${params.toString()}`;
    const res = await fetchWithTimeout(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`RuralEducationFarm 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let parsed;
    try {
      parsed = xmlParser.parse(text);
    } catch {
      throw new Error(`RuralEducationFarm 응답이 XML이 아닙니다: ${text.slice(0, 300)}`);
    }

    const response = parsed?.response;
    if (!response) {
      throw new Error(`RuralEducationFarm 응답 형식이 올바르지 않습니다: ${text.slice(0, 300)}`);
    }

    // 실측 확인(더미 키 호출): 에러 응답은 <body> 없이 <header>만 온다(예: "인증키가
    // 등록되지 않았습니다"). 정상 응답의 <header> 유무/resultCode 값은 참고 샘플 코드가
    // 검사하지 않아 확인하지 못했다 — body 유무로 성공/실패를 가른다.
    if (!response.body) {
      const header = response.header ?? {};
      throw new Error(`RuralEducationFarm 에러 응답: ${header.resultCode ?? '?'} ${header.resultMsg ?? '(메시지 없음)'}`);
    }

    const itemsNode = response.body.items ?? {};
    const items = itemsNode.item ?? [];
    return {
      items,
      totalCount: Number(itemsNode.totalCount ?? items.length),
    };
  }

  // numOfRows 파라미터는 참고 샘플 코드가 아예 쓰지 않아(서버 기본 페이지 크기를 그대로
  // 따름으로 추정) 임의로 지정하지 않는다 — 응답이 알려주는 totalCount까지 pageNo를
  // 늘리며 순회하고, 빈 페이지를 만나면 안전하게 중단한다(totalCount 오기재 대비).
  async fetch() {
    const items = [];
    let pageNo = 1;
    let totalCount = Infinity;

    while (items.length < totalCount) {
      const page = await this.fetchPage(pageNo);
      if (page.items.length === 0) break;
      totalCount = page.totalCount;
      items.push(...page.items);
      pageNo += 1;
    }

    return items;
  }

  // eslint-disable-next-line class-methods-use-this
  buildExternalId(cntntsNo) {
    return `RURAL_EDU_FARM_${cntntsNo}`;
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. cntntsNo가 원본 고유 콘텐츠번호라
  // external_id 구성에도 그대로 재사용한다.
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems.filter((item) => item.cntntsNo).map((item) => ({ sourceId: String(item.cntntsNo), payload: item }));
  }

  async geocodeOrSkip(name, address) {
    for (let attempt = 1; attempt <= GEOCODE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const coords = await geocode(address);
        await sleep(GEOCODE_PACING_MS);

        if (!coords) {
          console.warn(`⚠️ 지오코딩 결과 없음 [${name}] "${address}" — 건너뜀`);
          return null;
        }
        return coords;
      } catch (err) {
        if (attempt < GEOCODE_MAX_ATTEMPTS) {
          const backoffMs = GEOCODE_PACING_MS * 2 ** attempt;
          console.warn(
            `⚠️ 지오코딩 일시 실패 [${name}] "${address}" (시도 ${attempt}/${GEOCODE_MAX_ATTEMPTS}): ${err.message} — ${backoffMs}ms 후 재시도`
          );
          await sleep(backoffMs);
        } else {
          console.warn(`⚠️ 지오코딩 최종 실패 [${name}] "${address}": ${err.message}`);
          return null;
        }
      }
    }
    return null;
  }

  async transformItem(item) {
    const name = resolveName(item);
    const address = resolveAddress(item);
    const cntntsNo = item.cntntsNo;
    if (!name || !address || !cntntsNo) return null;

    const coords = await this.geocodeOrSkip(name, address);
    if (!coords) return null;

    return buildOpenSpaceRow({
      externalId: this.buildExternalId(cntntsNo),
      sourceType: 'RURAL_EDUCATION_FARM',
      source: SOURCE,
      name,
      uiCategory: UI_CATEGORY.EXPERIENCE_CLASS,
      address,
      lng: coords.lng,
      lat: coords.lat,
      isFree: null,
      // 홈페이지 링크는 상세조회 전용 필드라 이번 범위에서는 조회하지 않는다(파일 상단
      // 주석 참고) — null로 둔다.
      infoUrl: null,
      operatingHours: null,
      isKidsFriendly: true,
      facilityType: '복합',
      rawData: item,
      categoryMin: RURAL_EDUCATION_FARM_CATEGORY_MIN,
      categoryMinSource: 'RAW',
    });
  }

  // 지오코딩은 전량 필요하므로(좌표 필드 자체가 없음) gg-events-adapter.mjs와 동일하게
  // 순차 호출한다(Promise.all 동시 호출로 인한 레이트리밋 위험 회피).
  async transform(rawItems) {
    const rows = [];
    for (const item of rawItems) {
      const row = await this.transformItem(item);
      if (row) rows.push(row);
    }
    return rows;
  }
}
