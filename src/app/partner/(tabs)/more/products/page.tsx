import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ProductsManager, PartnerProduct } from '@/components/partner/products-manager';

// [파트너 상품 관리](2026-09-23 사용자 지시): "더보기에서 화면 하나 만들어서 세팅할 수
// 있게해놓고 거기있는 데이터 가져와서 리스트로 나오게 하고 그중 선택하게해" — 예약
// 추가 화면의 상품명 자유 입력을, 여기서 미리 등록한 상품(이름+가격+가격 기준)
// 카탈로그에서 고르는 방식으로 바꾸기 위한 관리 화면. today/page.tsx와 동일한
// 관례(세션 기반 클라이언트, RLS에 위임).
export default async function PartnerProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from('partner_products')
    .select('id, name, price, pricing_unit')
    .order('created_at', { ascending: true });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href="/partner/more" className="text-sm text-gray-500 hover:text-gray-700">
          ‹ 더보기
        </Link>
        <h1 className="mt-1 text-lg font-bold text-gray-900">상품 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          여기 등록한 상품이 예약 추가 화면의 상품 선택 목록에 그대로 나와요.
        </p>
      </div>
      {/* [pricing_unit 캐스팅] DB 컬럼이 text + check 제약(스키마의
          scripts/migrations/2026-09-23-partner-products.sql 참고)이라 codegen
          타입은 좁은 리터럴 유니언이 아닌 string으로 나온다 — DB가 이미 값
          범위를 강제하므로 여기서 안전하게 좁혀도 된다. */}
      <ProductsManager initialProducts={(products ?? []) as PartnerProduct[]} />
    </div>
  );
}
