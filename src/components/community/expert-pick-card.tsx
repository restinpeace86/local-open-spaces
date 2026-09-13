import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { GRADE_LABEL } from '@/lib/community/grades';

// [파워맘·우수맘 추천 영역 리디자인](2026-09-13 사용자 지시): "비주얼 컨셉: 신뢰감과
// 특별함(골드/퍼플 톤). 형태: 작성자 프로필 사진이 큼직하게 들어간 원형 아바타 중심의
// 가로 카드(누가 썼는지 사람이 먼저 보이게). 터치 시 이동: 우수맘들이 작성한 큐레이션
// 리스트 목록 화면으로 즉시 이동." — 이 앱 profiles 테이블에는 프로필 사진(avatar_url)
// 컬럼 자체가 없다(2026-09-02 create-profiles-table.sql 실측 확인, 소셜 로그인 사진을
// 저장/노출하는 기능이 스펙에 없음 — 제3장 제5조 추측 금지로 새 업로드 기능을 임의로
// 만들지 않는다). 대신 닉네임 첫 글자를 골드→퍼플 그라데이션 원형 배지에 채워
// "사람이 먼저 보이게"라는 의도는 유지한다. 카드 전체가 링크라 어디를 눌러도
// 전체보기(/mom-pick/expert)로 즉시 이동한다(개별 글 상세 모달을 열지 않음).
export function ExpertPickCard({ post }: { post: DashboardPost }) {
  const nickname = post.author.nickname ?? '이름 없는 맘';

  return (
    <Link
      href="/mom-pick/expert"
      className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-purple-50 p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-purple-500 text-lg font-bold text-white shadow-sm">
        {nickname[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-gray-900">{nickname}</span>
          <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
            {GRADE_LABEL[post.author.grade]}
          </span>
        </div>
        <p className="truncate text-xs text-gray-500">
          {post.is_adopted && <span className="mr-0.5">✨</span>}
          {post.spotName ?? '알 수 없는 스팟'}
        </p>
        {post.content && <p className="mt-0.5 line-clamp-1 text-xs text-gray-600">{post.content}</p>}
      </div>
    </Link>
  );
}
