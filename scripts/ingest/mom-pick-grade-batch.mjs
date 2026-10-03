// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.4·3-3·3-7: 맘스픽 등급
// 배치 — 우수맘/파워맘(당월 5개 스팟 사진 리뷰 기준)만 달력월 기준으로 매일 재계산한다.
// 새싹맘 승급(평생 1회)은 promote_to_sprout_on_first_post 트리거가, 열심맘 승급(평생
// 누적 2건)은 promote_to_active_on_lifetime_second_post 트리거가 각각 즉시 처리하므로,
// 이 배치는 이미 sprout 이상인 프로필만 다룬다(signed_up은 아직 한 번도 글을 안 써서
// 계산할 실적 자체가 없다).
//
// [Decision 027 — 열심맘 영구 달성](2026-10-03 사용자 지시): "우수맘 빼고는 그냥 매월
// 안하고 한번만 횟수채워도 되는거 아니야?" — 열심맘은 더 이상 매월 재충족이 필요
// 없고(위 트리거가 평생 누적 2건째에 영구 승급시킴), 이 배치는 열심맘을 다시 새싹맘으로
// 강등시키지 않는다(calculateGrade가 hasReachedActiveLifetime을 그대로 참조해 매번
// 같은 결론을 낸다 — 배치가 이걸 따로 보호할 필요 없이 자연히 그렇게 동작함). 우수맘/
// 파워맘만 매일 재평가해 조건 미달 시 열심맘으로 돌아간다(새싹맘으로는 안 내려감).
//
// [파워맘 정원제] 우수맘 조건(당월 5개 스팟 사진 리뷰 이상)을 만족하는 사용자 중 당월
// 채택 수 상위 N명(기본 10명, MOM_PICK_POWER_MOM_QUOTA 환경변수로 관리자가 조정 가능 —
// 제5장 제6조 하드코딩 최소화)만 파워맘으로 승급한다. 동점자는 먼저 그 채택을 받은
// (더 이른 시점에 조건을 채운) 사용자를 우선한다 — adopted_count로 정렬 후 author_id
// 정렬은 결정성만 위한 타이브레이커다.
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

  const { data: activity, error: activityError } = await admin.rpc('get_mom_pick_activity_summary');
  if (activityError) throw new Error(`활동 집계 조회 실패: ${activityError.message}`);

  const activityByAuthor = new Map((activity ?? []).map((row) => [row.author_id, row]));

  // sprout 이상(이미 최소 1회 이상 작성한 적 있는) 프로필만 대상 — signed_up은 계산할
  // 실적이 없다(새싹맘 승급은 트리거가 즉시 처리).
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, grade')
    .neq('grade', 'signed_up');
  if (profilesError) throw new Error(`프로필 조회 실패: ${profilesError.message}`);

  // 우수맘 조건(당월 5개 스팟 사진 리뷰 이상)을 만족하는 사용자 중 채택 수 상위 N명만 파워맘.
  const excellentEligible = (profiles ?? [])
    .map((p) => ({ id: p.id, activity: activityByAuthor.get(p.id) }))
    .filter(({ activity: a }) => (a ? Number(a.spot_photo_review_count) : 0) >= 5)
    .sort((a, b) => {
      const adoptedDiff = Number(b.activity?.adopted_count ?? 0) - Number(a.activity?.adopted_count ?? 0);
      return adoptedDiff !== 0 ? adoptedDiff : a.id.localeCompare(b.id);
    });
  const powerMomIds = new Set(excellentEligible.slice(0, getPowerMomQuota()).map((row) => row.id));

  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  for (const profile of profiles ?? []) {
    const activityRow = activityByAuthor.get(profile.id);
    const lifetimePostCount = activityRow ? Number(activityRow.lifetime_post_count) : 0;
    const monthlySpotPhotoReviewCount = activityRow ? Number(activityRow.spot_photo_review_count) : 0;
    const nextGrade = calculateGrade({
      hasEverPosted: true, // neq('signed_up')로 이미 필터링됨 — sprout 이상은 반드시 1회 이상 작성한 적 있음
      hasReachedActiveLifetime: lifetimePostCount >= 2,
      monthlySpotPhotoReviewCount,
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
      console.log(
        `[MOM_PICK_GRADE_BATCH] ${profile.id}: ${profile.grade} → ${nextGrade} (평생 글 ${lifetimePostCount}건, 이번 달 사진 포함 스팟 리뷰 ${monthlySpotPhotoReviewCount}곳)`
      );
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
