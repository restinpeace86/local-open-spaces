import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { GRADE_LABEL } from '@/lib/community/grades';
import { CHECKLIST_ITEMS } from '@/lib/community/checklist-items';
import {
  AGE_GROUP_LABELS,
  DURATION_TYPE_LABELS,
  SATISFACTION_POINT_LABELS,
  VISIT_ENVIRONMENT_LABELS,
} from '@/lib/community/survey-options';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): 3개 섹션(파워맘/우수맘 추천, 인기글,
// 실시간 피드) 전체보기 페이지와 메인 미리보기가 공유하는 카드. "작성자의 닉네임과...
// 등급 배지 필수 표시" 요구사항을 그대로 반영한다. 닉네임을 설정하지 않은 사용자는
// 실명/이메일을 노출하지 않고 "이름 없는 맘"으로 안전하게 대체한다.
export function DashboardPostCard({ post, wide = false }: { post: DashboardPost; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${wide ? 'flex flex-col gap-2' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-800">{post.author.nickname ?? '이름 없는 맘'}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            {GRADE_LABEL[post.author.grade]}
          </span>
        </div>
        {post.is_adopted && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">✨ 채택</span>
        )}
      </div>

      <p className="mt-1 text-sm font-medium text-gray-800">{post.spotName ?? '알 수 없는 스팟'}</p>

      {post.post_type === 'micro_review' ? (
        <div className="mt-1">
          <p className="text-yellow-400">
            {'★'.repeat(post.rating ?? 0)}
            {'☆'.repeat(5 - (post.rating ?? 0))}
          </p>
          {post.content && <p className="mt-1 text-sm text-gray-600">{post.content}</p>}
        </div>
      ) : post.post_type === 'checklist' ? (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {CHECKLIST_ITEMS.filter((item) => post.checklist_answers?.[item.key]).map((item) => (
            <li key={item.key} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
              ✓ {item.label}
            </li>
          ))}
        </ul>
      ) : (
        // [Decision 020](2026-09-04) survey_review: 설문 문항 중 대표적인 몇 개(연령대/
        // 방문환경/만족포인트/체류시간)만 뱃지로 요약하고, 나머지(날씨태그/인프라/동반형태)는
        // 카드가 과도하게 길어지지 않도록 상세 화면(마이페이지 등)에서만 전부 보여준다.
        <div className="mt-1 flex flex-col gap-1.5">
          <ul className="flex flex-wrap gap-1.5">
            {(post.age_groups ?? []).map((v) => (
              <li key={v} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                {AGE_GROUP_LABELS[v] ?? v}
              </li>
            ))}
            {post.visit_environment && (
              <li className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                {VISIT_ENVIRONMENT_LABELS[post.visit_environment] ?? post.visit_environment}
              </li>
            )}
            {post.duration_type && (
              <li className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                {DURATION_TYPE_LABELS[post.duration_type] ?? post.duration_type}
              </li>
            )}
            {(post.satisfaction_points ?? []).map((v) => (
              <li key={v} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                {SATISFACTION_POINT_LABELS[v] ?? v}
              </li>
            ))}
          </ul>
          {post.content && <p className="text-sm text-gray-600 line-clamp-2">{post.content}</p>}
          {post.photo_urls && post.photo_urls.length > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.photo_urls[0]} alt="후기 사진" className="h-16 w-16 rounded-lg object-cover" />
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
        <span>❤️ {post.like_count}</span>
      </div>
    </div>
  );
}
