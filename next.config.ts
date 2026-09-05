import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [블로그 큐레이션 전체 본문 보기 — 프로덕션 500 오류 수정](2026-09-06 사용자
  // 지시): "글이 잘려서 안 보인다"는 재현을 위해 로컬 dev/build/start 모두 정상
  // 동작해 원인을 못 찾다가, 사용자가 실제로 보고 있는 배포된 사이트를 직접 호출해
  // /api/admin/spot-curations/blog-body가 0.44초 만에 500을 내는 것을 확인했다 —
  // 네트워크 요청(수 초 소요)조차 시작되기 전에 죽었다는 뜻이라 jsdom import 자체가
  // 실패하는 것으로 추정했다. jsdom은 내부적으로 동적 require를 쓰는 파일이 있어
  // Vercel 서버리스 함수의 정적 트레이싱(어떤 파일을 함수에 포함시킬지 자동 분석)이
  // 이를 놓쳐, 로컬(전체 node_modules 존재)에서는 멀쩡히 빌드/실행되지만 배포된
  // 함수(트레이싱된 일부 파일만 존재)에서만 죽는 전형적인 사례다. serverExternalPackages에
  // 등록하면 이 패키지를 번들링하지 않고 런타임에 그대로 require하게 해 이 문제를
  // 피한다(sharp/canvas 등 네이티브·동적 require 패키지에 흔히 쓰는 표준 해법).
  serverExternalPackages: ['jsdom'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
