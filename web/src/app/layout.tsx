import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "경매 대시보드 | Auction CRM",
  description: "경매 응찰 현황과 참가자 순위를 확인하는 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
