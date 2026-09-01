// LOCALDATA_PLAYGROUND: 행정안전부 전국어린이놀이시설정보 (End Point 1, 시설 기본정보)
// (apis.data.go.kr/1741000/pfc3/getPfctInfo3)
//
// 2026-08-21 재확인: implementation/todo.md 이전 스킵 로그(Task 7-1)는 실 호출 결과 HTTP 403
// SERVICE_KEY_IS_NOT_REGISTERED_ERROR를 근거로 "서비스키 미승인"으로 판단했었으나, 오늘 동일
// 서비스키로 재호출한 결과 resultCode '00' NORMAL SERVICE로 정상 응답(실데이터 85,291건)을
// 확인했다 — data.go.kr의 개별 API 활용신청 승인이 완료된 것으로 판단해 구현을 재개한다.
//
// 응답 봉투: 이 API 계열(1741000, 행정안전부 어린이놀이시설)은 성공 시 resultCode가 '00'
// (다른 신규 어댑터들이 쓰는 '0'이 아님)이며, 서비스키 미등록 등 공통 오류는 amusement-park와
// 동일하게 OpenAPI_ServiceResponse.cmmMsgHeader 봉투로 내려온다. items는 `body.items`에 배열로
// 직접 내려오며(`.item` 래핑 없음), 총 건수는 `body.totalCnt`(대문자 C, totalCount 아님)이다.
//
// 좌표: latCrtsVl/lotCrtsVl 필드가 이미 WGS84 십진 위경도임을 실측으로 확인했다(표본: 경기 안산시
// 단원구 안산천서로 23 → latCrtsVl 37.3182363/lotCrtsVl 126.8419032로 실제 위치와 일치). 별도
// 좌표계 변환이 필요 없다. 좌표가 비어있는 레코드(1000건 표본 중 9건)는 buildOpenSpaceRow가
// lng/lat 누락 시 자동으로 null 처리하므로 그대로 전달한다.
//
// 고유 ID: pfctSn(시설일련번호)이 전국 단위로 유일한 값임을 실측으로 확인해 external_id에 그대로
// 사용한다(타 어댑터처럼 해시 생성 불필요).
//
// is_kids_friendly: 이 API 자체가 "전국어린이놀이시설정보"로, 데이터 소스 전체가 정의상 어린이
// 놀이시설이다(개별 레코드 명칭에 '어린이'/'유아' 키워드가 없어도 마찬가지, 예: "대호랑이 놀이터").
// ai-tagging.mjs의 deriveIsFreeFallback이 소스 전체가 공공기관 확정인 경우 개별 텍스트 근거 없이
// is_free:true로 떨어뜨리는 것과 동일한 논리로(ai-rule.md 5.2-7 준용), is_kids_friendly는
// 키워드 매칭이 아닌 소스 레벨 확정 사실로 true 고정한다.
//
// is_free: 원본에 요금 필드가 없으나, 레코드별로 prvtPblcYnCdNm('공공'/'민간')이 실제로 내려와
// 운영주체를 개별 건마다 판별할 수 있다(amusement-park처럼 소스 전체가 민간이라 판별 불가했던
// 경우와 다름). deriveIsFreeFallback을 레코드 단위로 적용해 공공 운영 시설만 true, 민간은 null.
//
// uiCategory: docs/spec.md 5대 UI 카테고리 중 🎡 키즈·액티비티(KIDS_ACTIVITY)로 직접 매핑한다.
// instlPlaceCdNm이 도시공원/아동복지시설/유치원/식품접객업소 등으로 다양해 ai-rule.md 3.1의
// PARK(어린이공원 등) 하나로 단정할 수 없으나, "어린이 놀이시설"이라는 소스 성격 자체가 5대 UI
// 카테고리 중 키즈·액티비티에 예외 없이 부합해 임의 추측이 아닌 직접 매핑으로 판단했다.
//
// End Point 2 (놀이기구 정보, getRide4) 미통합: pfctSn 단위로 개별 호출 시 정상 동작함을
// 실측 확인했으나(예: pfctSn=999 → 놀이기구 4건), open_spaces 스키마에는 시설 1건당 놀이기구
// N건을 저장할 컬럼/테이블이 없다(신규 컬럼·테이블 추가는 CLAUDE.md 제5장 제3조 "DB 구조 변경
// 임의 결정 금지" 대상). 전체 8만 5천여 시설에 대해 놀이기구 정보를 수집하려면 시설당 1회씩
// 별도 API 호출이 추가로 필요해(N+1) 현재 스키마로 저장할 곳이 없는 데이터를 위해 8만 건 이상의
// 추가 호출을 감행하는 것은 근거 없는 과잉 구현으로 판단해(CLAUDE.md 제1장 제4조 MVP 우선)
// 이번 어댑터에는 포함하지 않는다.
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';
import { buildOpenSpaceRow } from './lib/schema-mapper.mjs';
import { deriveIsFreeFallback } from '../lib/ai-tagging.mjs';
import { INSTALL_PLACE_CODE_TO_CATEGORY_MIN } from '../lib/localdata-playground-install-place-mapping.mjs';

const BASE_URL = 'https://apis.data.go.kr/1741000/pfc3/getPfctInfo3';
const PAGE_SIZE = 1000;
const SUCCESS_RESULT_CODE = '00';
const CLOSED_FLAG = 'Y';
const SOURCE = 'localdata_playground';

// [행안부 놀이시설 설치장소코드 매핑](2026-08-29 사용자 지시): 이 API는 "어린이놀이시설
// 자체"가 아니라 "어린이놀이시설이 설치된 장소"를 instlPlaceCd로 분류한다(실측 확인 —
// 예: instlPlaceCd='A013'/instlPlaceCdNm='놀이제공영업소'인 레코드는 "서울형 키즈카페
// 마포구 서교동2호점"처럼 실제로 키즈카페 자체가 시설명인 경우가 많고, 'A022'/박물관인
// 레코드는 "국회 어린이박물관"처럼 박물관 내부에 설치된 놀이시설이다). 나들이 스팟픽
// 핵심 중분류 칩(src/lib/spaces/spot-category-groups.ts)과 대응시켜, 지정된 설치장소
// 코드에 한해 category_min을 직접 매핑한다(RAW — 소스 자체가 가진 분류 정보를 그대로
// 사용, 키워드 추측 아님). 매핑 대상이 아닌 코드는 기존과 동일하게 null로 남아 배치
// 후처리(category-rules.mjs)의 이름 키워드 매칭에 맡긴다 — 기존에 수집되던 다른
// 설치장소코드의 데이터를 드롭하지 않는다(범위 축소 없음).
//
// 매핑 테이블 자체는 scripts/ingest/lib/localdata-playground-install-place-mapping.mjs에
// 정의돼 있다(이 어댑터는 신규/upsert 시점에, 그 파일은 기존 행 백필 시점에 같은 테이블을
// 공유한다 — 값이 갈라지면 안 되므로 단일 출처로 관리한다). upsertRowsSafeMerge()의
// COALESCE 안전 병합 특성상 이미 category_min이 채워진 기존 행에는 여기서 준 값이 반영되지
// 않는다(실측 확인) — 그 경우를 위한 명시적 덮어쓰기 백필은 run-monthly.mjs의
// PLAYGROUND_INSTALL_PLACE_MAPPING 단계가 담당한다.

export class PlaygroundAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'LOCALDATA_PLAYGROUND', targetTable: 'open_spaces', source: SOURCE });

    this.apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!this.apiKey) {
      throw new Error('PUBLIC_DATA_API_KEY 환경변수가 설정되지 않았습니다.');
    }
  }

  // [전체 파이프라인 일괄 가동] RAW 레이어 opt-in. pfctSn(시설일련번호)은 전국 단위로 유일함을
  // 실측 확인했다(위 헤더 주석) — external_id와 동일하게 그대로 사용한다.
  // eslint-disable-next-line class-methods-use-this
  getRawRows(rawItems) {
    return rawItems.filter((item) => item.pfctSn).map((item) => ({ sourceId: String(item.pfctSn), payload: item }));
  }

  async fetchPage(pageIndex) {
    const params = new URLSearchParams({
      serviceKey: this.apiKey,
      pageIndex: String(pageIndex),
      recordCountPerPage: String(PAGE_SIZE),
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const res = await fetchWithTimeout(url);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`Playground 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Playground 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
    }

    const errHeader = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (errHeader) {
      throw new Error(
        `Playground 에러 응답: ${errHeader.returnReasonCode} ${errHeader.errMsg} (${errHeader.returnAuthMsg})`
      );
    }

    const header = json.response?.header;
    if (header?.resultCode !== SUCCESS_RESULT_CODE) {
      throw new Error(`Playground 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
    }

    const items = json.response?.body?.items ?? [];
    return {
      items: Array.isArray(items) ? items : [items],
      totalCount: Number(json.response?.body?.totalCnt ?? 0),
    };
  }

  async fetch() {
    const items = [];
    let pageIndex = 1;
    let totalCount = Infinity;

    while ((pageIndex - 1) * PAGE_SIZE < totalCount) {
      const result = await this.fetchPage(pageIndex);
      totalCount = result.totalCount;
      items.push(...result.items);
      pageIndex += 1;
    }

    return items;
  }

  // eslint-disable-next-line class-methods-use-this
  transform(rawItems) {
    return rawItems
      .filter((item) => item.exfcYn !== CLOSED_FLAG && !(item.clsgYmd && item.clsgYmd.trim()))
      .map((item) => {
        const name = item.pfctNm;
        const address = item.ronaAddr || item.lotnoAddr || '';
        const lat = Number(item.latCrtsVl);
        const lng = Number(item.lotCrtsVl);

        if (!name || !address || !item.latCrtsVl || !item.lotCrtsVl) return null;

        const isPublicProvider = item.prvtPblcYnCdNm === '공공';
        const categoryMin = INSTALL_PLACE_CODE_TO_CATEGORY_MIN[item.instlPlaceCd] ?? null;

        return buildOpenSpaceRow({
          externalId: `LOCALDATA_PLAYGROUND_${item.pfctSn}`,
          sourceType: 'LOCALDATA_PLAYGROUND',
          source: SOURCE,
          name,
          uiCategory: 'KIDS_ACTIVITY',
          address,
          lng,
          lat,
          isFree: deriveIsFreeFallback({ hasFeeInfo: false, isPublicProvider }),
          isKidsFriendly: true,
          facilityType: item.idrodrCdNm === '실내' ? '실내' : item.idrodrCdNm === '실외' ? '야외' : '복합',
          rawData: item,
          categoryMin,
          categoryMinSource: categoryMin ? 'RAW' : null,
        });
      })
      .filter(Boolean);
  }
}
