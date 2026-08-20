import { createAdminClient, upsertRows } from '../lib/supabase-admin.mjs';

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
  // eslint-disable-next-line class-methods-use-this
  transform(_rawItems) {
    throw new Error(`${this.constructor.name}.transform()이 구현되지 않았습니다.`);
  }

  async run({ dryRun = false } = {}) {
    console.log(`▶ [${this.sourceKey}] 수집 시작 (dry-run: ${dryRun})`);

    const raw = await this.fetch();
    console.log(`  raw 데이터 ${Array.isArray(raw) ? raw.length : '?'}건 수신`);

    const rows = this.transform(raw).filter(Boolean);
    console.log(`  표준 스키마 변환 완료: ${rows.length}건 (유효성 검증 통과분만)`);

    if (dryRun) {
      console.log(JSON.stringify(rows.slice(0, 3), null, 2));
      return { count: rows.length, upserted: false };
    }

    if (rows.length === 0) {
      console.log('  upsert할 유효 행이 없어 종료합니다.');
      return { count: 0, upserted: true };
    }

    const client = createAdminClient();
    const { count } = await upsertRows(client, this.targetTable, rows);
    console.log(`✅ [${this.sourceKey}] Supabase ${this.targetTable} upsert 완료: ${count}건`);
    return { count, upserted: true };
  }
}
