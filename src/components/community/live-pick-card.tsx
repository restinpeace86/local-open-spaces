import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [실시간 라이브 영역 리디자인](2026-09-13 사용자 지시): "비주얼 컨셉: 긴박감과
// 현장감(레드/그린 톤의 라이브 뱃지). 형태: 반짝이는 라이브 아이콘과 함께 현재
// 진행 중인 이벤트/스팟을 보여주는 타임라인형 가로 카드. 터치 시 이동: 실시간
// 진행 중인 이벤트 전체 목록으로 이동." — 이 섹션의 실제 데이터는
// getLivePosts()(mom-pick-dashboard.ts, 단순 최신순 게시글 피드, 2026-09-02
// 기획 그대로 유지)이므로 문구도 그 성격에 맞게 "얼마 전에 올라온 글"임을
// 보여준다(존재하지 않는 실시간 진행중 이벤트 상태를 새로 만들지 않음 —
// 제3장 제5조 추측 금지).
function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${Math.floor(diffHours / 24)}일 전`;
}

// [실시간 라이브 카드 한 줄 압축](2026-09-13 사용자 지시): "하린맘 이건 빼고..
// 제목하고 3시간 전 이라는 시간하고.. 내용글? 조금? 그 옆에 남는 공간만..
// 내용으로 채우는거.. 한줄로 돼?" — 작성자 닉네임 줄을 없애고, 제목/시간은
// 고정 너비로 유지한 채 내용글이 한 줄 안에서 남는 공간을 그대로 채우다가
// 넘치면 말줄임표로 잘리도록 한다(두 번째 줄 없이 전부 한 줄).
export function LivePickCard({ post }: { post: DashboardPost }) {
  return (
    <Link
      href="/mom-pick/live"
      className="flex items-center gap-3 rounded-xl border border-red-100 bg-gradient-to-r from-red-50 to-white p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative flex h-3 w-3 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="shrink-0 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold tracking-wide text-red-600">
          LIVE
        </span>
        <span className="max-w-[40%] shrink-0 truncate text-sm font-semibold text-gray-800">
          {post.is_adopted && <span className="mr-0.5">✨</span>}
          {post.spotName ?? '알 수 없는 스팟'}
        </span>
        <span className="shrink-0 text-xs font-medium text-emerald-600">{formatTimeAgo(post.created_at)}</span>
        {post.content && <span className="min-w-0 flex-1 truncate text-xs text-gray-500">· {post.content}</span>}
      </div>
    </Link>
  );
}
