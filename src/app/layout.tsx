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

export const metadata: Metadata = {
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
