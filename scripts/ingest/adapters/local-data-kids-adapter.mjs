// LOCAL_DATA_KIDS: 행정안전부 지방행정인허가 데이터(localdata.go.kr) — 기타유원시설업 등
// 키즈카페/실내놀이터 인허가 목록. 배치 CSV 파일을 HTTP GET으로 수집한다.
//
// 주의: localdata.go.kr은 업종(opnSvcId)별로 별도의 CSV 다운로드 URL을 발급하며,
// 이 URL은 임의로 추정하지 않는다 (spec/data/ai-rule.md 4.1, 제3장 제5조 추측 금지).
// 사용자가 localdata.go.kr에서 대상 업종의 실제 CSV URL을 확인해
// LOCAL_DATA_KIDS_CSV_URL 환경변수로 제공해야 동작한다.
import crypto from 'crypto';
import { BaseCollectorAdapter } from './base-collector-adapter.mjs';
import { buildOpenSpaceRow, UI_CATEGORY } from './lib/schema-mapper.mjs';
import { parseCsv } from './lib/csv-parser.mjs';
import { convertEpsg5174ToWgs84 } from './lib/epsg5174.mjs';

const ACTIVE_STATUS_KEYWORDS = ['영업/정상', '영업', '정상'];
const CLOSED_STATUS_KEYWORDS = ['폐업', '휴업'];

// LocalData 인허가 CSV는 업종 무관하게 아래 표준 컬럼명을 공통으로 사용한다
// (localdata.go.kr 공식 데이터 명세 기준). 실제 응답에 없을 경우를 대비해
// 후보 컬럼명 목록으로 유연하게 탐색한다.
const COLUMN_CANDIDATES = {
  name: ['사업장명'],
  address: ['도로명전체주소', '소재지전체주소'],
  status: ['영업상태명', '상세영업상태명'],
  x: ['좌표정보x(epsg5174)', '좌표정보(x)', 'X좌표'],
  y: ['좌표정보y(epsg5174)', '좌표정보(y)', 'Y좌표'],
  phone: ['소재지전화'],
};

function pickColumn(record, candidates) {
  for (const key of candidates) {
    if (record[key] !== undefined && record[key] !== '') return record[key];
  }
  return null;
}

function isActive(statusValue) {
  if (!statusValue) return false;
  if (CLOSED_STATUS_KEYWORDS.some((kw) => statusValue.includes(kw))) return false;
  return ACTIVE_STATUS_KEYWORDS.some((kw) => statusValue.includes(kw));
}

export class LocalDataKidsAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'LOCAL_DATA_KIDS', targetTable: 'open_spaces' });

    this.csvUrl = process.env.LOCAL_DATA_KIDS_CSV_URL;
    if (!this.csvUrl) {
      throw new Error(
        'LOCAL_DATA_KIDS_CSV_URL 환경변수가 설정되지 않았습니다. localdata.go.kr에서 대상 업종(기타유원시설업 등)의 실제 CSV 다운로드 URL을 확인해 .env.local에 추가하세요.'
      );
    }
  }

  async fetch() {
    const res = await fetch(this.csvUrl);
    if (!res.ok) {
      throw new Error(`LocalData CSV 다운로드 실패 (HTTP ${res.status})`);
    }
    const text = await res.text();
    return parseCsv(text);
  }

  // eslint-disable-next-line class-methods-use-this
  transform(rawItems) {
    return rawItems.map((record) => {
      const status = pickColumn(record, COLUMN_CANDIDATES.status);
      if (!isActive(status)) return null; // 영업/정상만 필터링, 폐업/휴업 제외

      const name = pickColumn(record, COLUMN_CANDIDATES.name);
      const address = pickColumn(record, COLUMN_CANDIDATES.address);
      const xRaw = pickColumn(record, COLUMN_CANDIDATES.x);
      const yRaw = pickColumn(record, COLUMN_CANDIDATES.y);

      if (!name || !xRaw || !yRaw) return null;

      const coords = convertEpsg5174ToWgs84(Number(xRaw), Number(yRaw));
      if (!coords) return null;

      // 원본 CSV에 업종별 고유 관리번호 컬럼명이 통일되어 있지 않아,
      // 사업장명+주소 조합의 결정적 해시를 external_id로 사용한다 (행 순서가
      // 바뀌어도 동일 업체는 같은 external_id를 유지해 upsert가 정확히 동작함).
      const hash = crypto.createHash('sha1').update(`${name}|${address}`).digest('hex').slice(0, 16);
      const externalId = `LOCAL_DATA_KIDS_${hash}`;

      return buildOpenSpaceRow({
        externalId,
        sourceType: 'LOCAL_DATA_KIDS',
        name,
        uiCategory: UI_CATEGORY.KIDS_ACTIVITY,
        address: address || '',
        lng: coords.lng,
        lat: coords.lat,
        isFree: null, // 원본에 요금 정보 없음 — 임의 추정하지 않음
        facilityType: '실내',
        rawData: record,
      });
    });
  }
}
