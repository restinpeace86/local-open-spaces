// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.4·3-3·3-7: 맘스픽 등급
// 배치 — 달력월 기준으로 열심맘/우수맘/파워맘 승급·강등을 매일 재계산한다. 새싹맘 승급
// (첫 글 작성)은 별도 DB 트리거(promote_to_sprout_on_first_post)가 즉시 처리하므로, 이
// 배치는 이미 sprout 이상인 프로필만 다룬다(signed_up은 아직 한 번도 글을 안 써서 계산할
// 이번 달 실적 자체가 없다).
//
// [파워맘 정원제] 우수맘 조건(당월 5건 이상)을 만족하는 사용자 중 당월 채택 수 상위
// N명(기본 10명, MOM_PICK_POWER_MOM_QUOTA 환경변수로 관리자가 조정 가능 — 제5장 제6조
// 하드코딩 최소화)만 파워맘으로 승급한다. 동점자는 먼저 그 채택을 받은(더 이른 시점에
// 조건을 채운) 사용자를 우선한다 — adopted_count로 정렬 후 author_id 정렬은 결정성만
// 위한 타이브레이커다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { calculateGrade } from './lib/mom-pick-grade-calc.mjs';

const DEFAULT_POWER_MOM_QUOTA = 10;

function getPowerMomQuota() {
  const raw = process.env.MOM_PICK_POWER_MOM_QUOTA;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POWER_MOM_QUOTA;
}

export async function run() {
  const admin = createAdminClient();

  const { data: activity, error: activityError } = await admin.rpc('get_monthly_mom_pick_activity');
  if (activityError) throw new Error(`이번 달 활동 집계 조회 실패: ${activityError.message}`);

  const activityByAuthor = new Map((activity ?? []).map((row) => [row.author_id, row]));

  // sprout 이상(이미 최소 1회 이상 작성한 적 있는) 프로필만 대상 — signed_up은 계산할
  // 실적이 없다(새싹맘 승급은 트리거가 즉시 처리).
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, grade')
    .neq('grade', 'signed_up');
  if (profilesError) throw new Error(`프로필 조회 실패: ${profilesError.message}`);

  // 우수맘 조건(당월 5건 이상)을 만족하는 사용자 중 채택 수 상위 N명만 파워맘.
  const excellentEligible = (profiles ?? [])
    .map((p) => ({ id: p.id, activity: activityByAuthor.get(p.id) }))
    .filter(({ activity: a }) => (a ? Number(a.post_count) : 0) >= 5)
    .sort((a, b) => {
      const adoptedDiff = Number(b.activity?.adopted_count ?? 0) - Number(a.activity?.adopted_count ?? 0);
      return adoptedDiff !== 0 ? adoptedDiff : a.id.localeCompare(b.id);
    });
  const powerMomIds = new Set(excellentEligible.slice(0, getPowerMomQuota()).map((row) => row.id));

  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  for (const profile of profiles ?? []) {
    const activityRow = activityByAuthor.get(profile.id);
    const monthlyPostCount = activityRow ? Number(activityRow.post_count) : 0;
    const nextGrade = calculateGrade({
      hasEverPosted: true, // neq('signed_up')로 이미 필터링됨 — sprout 이상은 반드시 1회 이상 작성한 적 있음
      monthlyPostCount,
      isPowerMomThisMonth: powerMomIds.has(profile.id),
    });

    if (nextGrade !== profile.grade) {
      const { error: updateError } = await admin
        .from('profiles')
        .update({ grade: nextGrade, grade_updated_at: nowIso })
        .eq('id', profile.id);
      if (updateError) {
        console.error(`[MOM_PICK_GRADE_BATCH] ${profile.id} 등급 갱신 실패: ${updateError.message}`);
        continue;
      }
      updatedCount += 1;
      console.log(`[MOM_PICK_GRADE_BATCH] ${profile.id}: ${profile.grade} → ${nextGrade} (이번 달 ${monthlyPostCount}건)`);
    }
  }

  console.log(`[MOM_PICK_GRADE_BATCH] 완료 — 대상 ${profiles?.length ?? 0}명 중 ${updatedCount}명 등급 변경`);
  return { targetCount: profiles?.length ?? 0, updatedCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  run()
    .then(({ updatedCount }) => {
      console.log(`▶▶▶ [MOM_PICK_GRADE_BATCH] 종료: ${updatedCount}명 등급 변경`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [MOM_PICK_GRADE_BATCH] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
