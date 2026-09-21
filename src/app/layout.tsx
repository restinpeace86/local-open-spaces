import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomTabs } from "@/components/nav/bottom-tabs";
import { ProfileCompletionGuard } from "@/components/auth/profile-completion-guard";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// [커스텀 도메인 전환](2026-09-21 사용자 지시): vercel.app → nadri-pick.com.
// metadataBase가 없으면 Next.js가 요청 헤더로 상대 경로를 추론해 대부분은 그냥
// 동작하지만, OG 이미지/카카오톡 공유 미리보기처럼 서버가 미리 절대 URL을
// 만들어야 하는 경우 배포 프리뷰 URL(*.vercel.app)이 새어 나갈 수 있다 —
// NEXT_PUBLIC_SITE_URL(.env.local, Vercel 프로덕션에도 동일하게 등록 필요)로
// 명시한다.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://nadri-pick.com"),
  title: "local-open-spaces",
  description: "내 동네 열린 공간 & 시한성 이벤트 큐레이션",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-dvh flex flex-col overflow-hidden">
        {children}
        <BottomTabs />
        <ProfileCompletionGuard />
      </body>
    </html>
  );
}
