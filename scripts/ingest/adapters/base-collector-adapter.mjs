import {
  createAdminClient,
  upsertRows,
  upsertRowsSafeMerge,
  upsertRawIngestData,
  fetchRawIngestData,
} from '../lib/supabase-admin.mjs';
import { countRawItems, recordPipelineRun } from '../lib/pipeline-log.mjs';

// 모든 소스 어댑터가 상속받는 추상 베이스 클래스.
// fetch()/transform()은 서브클래스가 반드시 구현해야 하며, run()이 공통 오케스트레이션
// (fetch → transform → 검증 로그 → upsert)을 담당한다.
export class BaseCollectorAdapter {
  constructor({ sourceKey, targetTable }) {
    if (new.target === BaseCollectorAdapter) {
      throw new Error('BaseCollectorAdapter는 직접 인스턴스화할 수 없습니다. 서브클래스를 사용하세요.');
    }
    if (!sourceKey || !targetTable) {
      throw new Error('sourceKey와 targetTable은 필수입니다.');
    }
    if (targetTable !== 'open_spaces' && targetTable !== 'events') {
      throw new Error(`targetTable은 'open_spaces' 또는 'events'여야 합니다: ${targetTable}`);
    }

    this.sourceKey = sourceKey;
    this.targetTable = targetTable;
  }

  // 원본 API/파일로부터 raw 데이터를 가져온다. 서브클래스 필수 구현.
  // eslint-disable-next-line class-methods-use-this
  async fetch() {
    throw new Error(`${this.constructor.name}.fetch()가 구현되지 않았습니다.`);
  }

  // raw 데이터를 표준 스키마 행 배열로 변환한다 (schema-mapper.mjs 사용). 서브클래스 필수 구현.
  // 지오코딩 등 네트워크 보강이 필요한 경우 async로 구현해도 된다 (run()이 await로 처리).
  // eslint-disable-next-line class-methods-use-this
  transform(_rawItems) {
    throw new Error(`${this.constructor.name}.transform()이 구현되지 않았습니다.`);
  }

  // [긴급 아키텍처 개편] RAW 레이어 opt-in 훅. 서브클래스가 구현하면(선택) fetch()가 반환한
  // raw 데이터에서 "원본 그대로 보존할 (source_id, payload) 쌍" 목록([{sourceId, payload}])을
  // 뽑아낸다. transform()과 달리 유효성 검증/드롭이 전혀 없어야 한다 — 여기서 거르면 RAW
  // 레이어의 존재 의미(무오염 보존)가 없어진다. 구현하지 않으면(기존 어댑터 전부) run()이
  // 기존과 완전히 동일하게 동작한다 — 하위 호환, 기존 예약된 워크플로우에 영향 없음.
  // eslint-disable-next-line class-methods-use-this
  getRawRows(_rawItems) {
    return null;
  }

  // [긴급 아키텍처 개편] runServiceTransformFromRaw()가 raw_ingest_data에서 읽어온 raw_payload
  // 배열을 다시 fetch()가 반환했을 형태로 복원한다. fetch()가 단순 배열을 반환하는 대다수
  // 어댑터는 기본 구현(항등 함수)으로 충분하다. gg-culture-events-adapter.mjs처럼 fetch()가
  // { cultureEventItems, foundationEventItems } 같은 복합 객체를 반환하는 어댑터는 이 메서드를
  // 오버라이드해야 한다(아직 이 방식으로 RAW 레이어에 편입되지 않아 당장은 해당 없음).
  // eslint-disable-next-line class-methods-use-this
  reconstructFromRawPayloads(payloads) {
    return payloads;
  }

  async run({ dryRun = false } = {}) {
    console.log(`▶ [${this.sourceKey}] 수집 시작 (dry-run: ${dryRun})`);

    try {
      const raw = await this.fetch();
      const rawCount = countRawItems(raw);
      console.log(`  raw 데이터 ${rawCount ?? '?'}건 수신`);

      const rawRows = this.getRawRows(raw);
      let rawArchivedCount;
      if (rawRows && !dryRun) {
        const client = createAdminClient();
        const result = await upsertRawIngestData(client, this.sourceKey, rawRows);
        rawArchivedCount = result.count;
        console.log(`  RAW 레이어(raw_ingest_data) 무오염 보존 완료: ${rawArchivedCount}건`);
      }

      const rows = (await this.transform(raw)).filter(Boolean);
      console.log(`  표준 스키마 변환 완료: ${rows.length}건 (유효성 검증 통과분만)`);

      if (dryRun) {
        console.log(JSON.stringify(rows.slice(0, 3), null, 2));
        return { count: rows.length, upserted: false };
      }

      if (rows.length === 0) {
        console.log('  upsert할 유효 행이 없어 종료합니다.');
        recordPipelineRun({ sourceKey: this.sourceKey, rawCount, rawArchivedCount, count: 0, status: 'OK', note: '유효 행 0건' });
        return { count: 0, upserted: true };
      }

      const client = createAdminClient();
      const { count } = await upsertRows(client, this.targetTable, rows);
      console.log(`✅ [${this.sourceKey}] Supabase ${this.targetTable} upsert 완료: ${count}건`);
      recordPipelineRun({ sourceKey: this.sourceKey, rawCount, rawArchivedCount, count, status: 'OK' });
      return { count, upserted: true };
    } catch (err) {
      if (!dryRun) {
        recordPipelineRun({ sourceKey: this.sourceKey, rawCount: null, count: 0, status: 'FAILED', note: err.message });
      }
      throw err;
    }
  }

  // [긴급 아키텍처 개편] 2단계 단독 재실행 — fetch()를 다시 호출하지 않고 이미 raw_ingest_data에
  // 보존된 원본을 읽어 transform()만 다시 돌린다. 원본 API가 일시 장애거나 파서 로직만 고쳤을
  // 때 재수집 없이 재가공할 수 있다는 게 RAW 레이어를 두는 핵심 이유다. getRawRows()를 구현한
  // 어댑터만 의미가 있다(구현 안 했으면 raw_ingest_data에 애초에 아무것도 없으므로 0건 반환).
  async runServiceTransformFromRaw({ dryRun = false } = {}) {
    console.log(`▶ [${this.sourceKey}] RAW→Service 재가공 시작 (dry-run: ${dryRun})`);
    const client = createAdminClient();
    const rawRows = await fetchRawIngestData(client, this.sourceKey);

    if (rawRows.length === 0) {
      console.log(`  raw_ingest_data에 [${this.sourceKey}] 보존된 원본이 없습니다.`);
      return { count: 0, upserted: false };
    }

    const raw = this.reconstructFromRawPayloads(rawRows.map((row) => row.raw_payload));
    const rows = (await this.transform(raw)).filter(Boolean);
    console.log(`  RAW→Service 재가공 완료: ${rows.length}건 (원본 ${rawRows.length}건 중)`);

    if (dryRun) {
      console.log(JSON.stringify(rows.slice(0, 3), null, 2));
      return { count: rows.length, upserted: false };
    }

    if (rows.length === 0) {
      console.log('  upsert할 유효 행이 없어 종료합니다.');
      return { count: 0, upserted: true };
    }

    // 2단계(RAW→Service) 재가공은 일반 upsertRows()가 아니라 upsertRowsSafeMerge()를 쓴다 —
    // 재가공 시점의 파서가 일부 컬럼을 못 채워 NULL로 보내도, 기존에 이미 채워진 실데이터를
    // 덮어써 되돌리면 안 되기 때문이다(COALESCE(existing, incoming) — 기존 NULL 항목만 병합).
    const { count } = await upsertRowsSafeMerge(client, this.targetTable, rows);
    console.log(`✅ [${this.sourceKey}] RAW→Service 재적재 완료: ${count}건`);
    return { count, upserted: true };
  }
}
