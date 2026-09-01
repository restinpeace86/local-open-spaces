import { NextRequest, NextResponse } from 'next/server';

// [배치 수집 안정성 고도화](2026-08-30 사용자 지시) 요구사항 "관리자 수동 재수집 트리거":
// 관리자 화면에서 실패한 특정 API 소스 하나만 지정해 즉시 재수집을 실행한다.
// scripts/ingest/run-daily.mjs / run-monthly.mjs가 이미 export하는 runSingleDailySource/
// runSingleMonthlySource를 그대로 재사용한다(같은 STEPS 배열, 같은 실행 경로 — 제5장
// 제4조 기존 구조 우선, CLI의 `--only=` 플래그와 완전히 동일한 코드를 탄다).
//
// 주의(실측 확인 필요, 운영 참고): 이 라우트는 Vercel 서버리스 함수 안에서 어댑터의
// fetch()~upsert()를 동기적으로 끝까지 실행한다. 페이지네이션이 많은 원본 API(예:
// 12만 건 규모)는 플랫폼의 함수 실행 시간 제한을 초과할 수 있다 — 더 근본적인 해결은
// GitHub Actions workflow_dispatch로 위임하는 것이나, 그러려면 새 PAT 시크릿 발급이
// 필요해(이 세션이 직접 발급할 수 없음) 이번에는 즉시 쓸 수 있는 인라인 실행으로
// 구현한다. 실행 시간이 오래 걸리는 소스는 현재도 존재하는 CLI(`node scripts/ingest/
// run-daily.mjs --only=<소스>`)로 직접 실행하는 편이 더 안전하다.
const KNOWN_BATCHES = ['daily', 'monthly'] as const;
type BatchName = (typeof KNOWN_BATCHES)[number];

// [외부 공공 API 배치 수집 안정성 및 독립 실행 구조 고도화](2026-09-01 사용자 지시)
// 항목 4 "버튼 UI": 관리자 화면의 재수집 소스 목록을 하드코딩하지 않고, run-daily.mjs/
// run-monthly.mjs의 실제 STEPS 배열에서 그대로 읽어온다 — 목록이 어긋날 위험(새 소스
// 추가 시 관리자 화면 갱신을 깜빡하는 것) 자체를 없앤다(제5장 제6조 하드코딩 최소화).
export async function GET() {
  try {
    const [daily, monthly] = await Promise.all([
      import('../../../../../../scripts/ingest/run-daily.mjs'),
      import('../../../../../../scripts/ingest/run-monthly.mjs'),
    ]);
    return NextResponse.json({
      daily: daily.STEPS.map((s: { label: string }) => s.label),
      monthly: monthly.STEPS.map((s: { label: string }) => s.label),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '소스 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const batch = body.batch as string;
    const sourceKey = typeof body.sourceKey === 'string' ? body.sourceKey.trim() : '';

    if (!KNOWN_BATCHES.includes(batch as BatchName)) {
      return NextResponse.json({ error: `batch는 ${KNOWN_BATCHES.join(' 또는 ')} 중 하나여야 합니다.` }, { status: 400 });
    }
    if (!sourceKey) {
      return NextResponse.json({ error: 'sourceKey는 필수입니다.' }, { status: 400 });
    }

    // scripts/ 는 src/ 밖에 있어 상대 경로 동적 import로 불러온다(Node 런타임 API
    // 라우트에서만 동작 — edge 런타임이 아님을 이 파일이 fs/net을 쓰는 스크립트를 그대로
    // 불러온다는 사실 자체로 전제한다).
    const result =
      batch === 'daily'
        ? await (await import('../../../../../../scripts/ingest/run-daily.mjs')).runSingleDailySource(sourceKey, { dryRun: false })
        : await (await import('../../../../../../scripts/ingest/run-monthly.mjs')).runSingleMonthlySource(sourceKey, { dryRun: false });

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '개별 재수집 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
