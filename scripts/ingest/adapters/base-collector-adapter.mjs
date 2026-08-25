import {
  createAdminClient,
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
    if (!['open_spaces', 'events', 'multi'].includes(targetTable)) {
      throw new Error(`targetTable은 'open_spaces', 'events' 또는 'multi'여야 합니다: ${targetTable}`);
    }

    this.sourceKey = sourceKey;
    this.targetTable = targetTable;
  }

  // 원본 API/파일로부터 raw 데이터를 가져온다. 서브클래스 필수 구현.
  // eslint-disable-next-line class-methods-use-this
  async fetch() {
    throw new Error(`${this.constructor.name}.fetch()가 구현되지 않았습니다.`);
  }

  // raw 데이터를 표준 스키마 행 배열로 변환한다 (schema-mapper.mjs 사용). targetTable이
  // 'open_spaces'/'events'인 어댑터는 필수 구현. targetTable: 'multi'인 어댑터는 이 대신
  // transformSplit()을 구현한다(테이블별로 행을 나눠야 하므로 단일 배열 반환으로는 부족함).
  // 지오코딩 등 네트워크 보강이 필요한 경우 async로 구현해도 된다 (run()이 await로 처리).
  // eslint-disable-next-line class-methods-use-this
  transform(_rawItems) {
    throw new Error(`${this.constructor.name}.transform()이 구현되지 않았습니다.`);
  }

  // Decision 017(2026-08-25): targetTable이 'multi'인 어댑터가 구현하는 훅. 하나의 원본
  // 엔드포인트가 성격이 다른 데이터(예: 서울시 예약 통합 API의 체육시설/공간시설 ↔ open_spaces,
  // 문화체험/교육강좌 ↔ events)를 함께 내려줄 때, transform() 하나로는 두 테이블에 나눠 적재할
  // 수 없어 별도 훅으로 분리했다. 항목 1건 단위 try-catch로 무중단 수집을 보장해야 하고
  // (제7항 무중단 예외 처리), 위치/요금/URL 등이 없다는 이유로 행을 드롭해서는 안 된다(제4항
  // Null-safe 원본 적재) — 진짜로 적재 불가능한 경우(식별자 없음, DB NOT NULL 제약을 만족할
  // 실데이터가 없는 경우)만 errorCounts에 원인별로 집계하고 skip한다.
  // 반환 형태: { open_spaces: Row[], events: Row[], errorCounts: {TYPE: count}, excludedCount }
  // eslint-disable-next-line class-methods-use-this
  transformSplit(_rawItems) {
    throw new Error(`${this.constructor.name}.transformSplit()이 구현되지 않았습니다.`);
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

      if (this.targetTable === 'multi') {
        return await this.runMultiTableUpsert({ raw, rawCount, rawArchivedCount, dryRun });
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
      // [전체 파이프라인 일괄 가동](2026-08-25): 서울시 수집기(SeoulYeyakAdapter)에서 검증된
      // COALESCE Safe UPSERT를 모든 소스 공통 기본값으로 승격한다. 기존 upsertRows()는 충돌 시
      // 새 값으로 무조건 덮어썼는데, 재수집 때 원본 API가 일시적으로 일부 필드를 비워 보내면
      // 이미 채워져 있던 실데이터가 NULL로 되돌아가는 문제가 있었다 — upsertRowsSafeMerge()는
      // 기존 행의 컬럼이 NULL일 때만 새 값으로 채우고 이미 값이 있으면 보존한다.
      const { count } = await upsertRowsSafeMerge(client, this.targetTable, rows);
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

  // Decision 017: targetTable === 'multi' 어댑터 전용 오케스트레이션. transformSplit()의
  // { open_spaces, events } 각각을 upsertRowsSafeMerge()로 적재한다 — SVCID 중복 시 컬럼별
  // NULL 병합이 이 요구사항의 핵심이라(제3항), 일반 upsertRows()가 아니라 처음부터
  // upsertRowsSafeMerge()를 쓴다(단일 테이블 어댑터 25종의 run()은 이 메서드를 타지 않으므로
  // 기존 동작에 영향 없음).
  async runMultiTableUpsert({ raw, rawCount, rawArchivedCount, dryRun }) {
    const {
      open_spaces: spaceRows = [],
      events: eventRows = [],
      errorCounts = {},
      excludedCount = 0,
    } = await this.transformSplit(raw);

    const totalErrorCount = Object.values(errorCounts).reduce((sum, n) => sum + n, 0);
    console.log(
      `  표준 스키마 변환 완료: open_spaces ${spaceRows.length}건 / events ${eventRows.length}건 ` +
        `(범위 제외 ${excludedCount}건, 에러 ${totalErrorCount}건)`
    );

    if (dryRun) {
      console.log(JSON.stringify({ open_spaces: spaceRows.slice(0, 2), events: eventRows.slice(0, 2) }, null, 2));
      return {
        count: spaceRows.length + eventRows.length,
        upserted: false,
        perTable: { open_spaces: spaceRows.length, events: eventRows.length },
        errorCounts,
        excludedCount,
      };
    }

    const client = createAdminClient();
    const perTableResult = {};
    if (spaceRows.length > 0) {
      perTableResult.open_spaces = await upsertRowsSafeMerge(client, 'open_spaces', spaceRows);
    }
    if (eventRows.length > 0) {
      perTableResult.events = await upsertRowsSafeMerge(client, 'events', eventRows);
    }

    const totalCount = (perTableResult.open_spaces?.count ?? 0) + (perTableResult.events?.count ?? 0);
    console.log(
      `✅ [${this.sourceKey}] 다중 테이블 upsert 완료: open_spaces ${perTableResult.open_spaces?.count ?? 0}건 / ` +
        `events ${perTableResult.events?.count ?? 0}건`
    );

    recordPipelineRun({
      sourceKey: this.sourceKey,
      rawCount,
      rawArchivedCount,
      count: totalCount,
      status: 'OK',
      detail: {
        perTable: {
          open_spaces: {
            fetched: spaceRows.length,
            inserted: perTableResult.open_spaces?.count ?? 0,
            duplicateWithinBatch: perTableResult.open_spaces?.duplicateWithinBatch ?? 0,
            mergedWithExisting: perTableResult.open_spaces?.mergedWithExisting ?? 0,
          },
          events: {
            fetched: eventRows.length,
            inserted: perTableResult.events?.count ?? 0,
            duplicateWithinBatch: perTableResult.events?.duplicateWithinBatch ?? 0,
            mergedWithExisting: perTableResult.events?.mergedWithExisting ?? 0,
          },
        },
        excludedCount,
        errorCounts,
      },
    });

    return {
      count: totalCount,
      upserted: true,
      perTable: { open_spaces: perTableResult.open_spaces?.count ?? 0, events: perTableResult.events?.count ?? 0 },
      errorCounts,
      excludedCount,
    };
  }

  // [긴급 아키텍처 개편] 2단계 단독 재실행 — fetch()를 다시 호출하지 않고 이미 raw_ingest_data에
  // 보존된 원본을 읽어 transform()만 다시 돌린다. 원본 API가 일시 장애거나 파서 로직만 고쳤을
  // 때 재수집 없이 재가공할 수 있다는 게 RAW 레이어를 두는 핵심 이유다. getRawRows()를 구현한
  // 어댑터만 의미가 있다(구현 안 했으면 raw_ingest_data에 애초에 아무것도 없으므로 0건 반환).
  async runServiceTransformFromRaw({ dryRun = false } = {}) {
    if (this.targetTable === 'multi') {
      throw new Error(
        `${this.constructor.name}: targetTable 'multi' 어댑터는 runServiceTransformFromRaw()를 아직 지원하지 않습니다(transformSplit() 기반 재가공은 별도 구현 필요).`
      );
    }

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
