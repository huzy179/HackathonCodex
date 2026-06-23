import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "LC-Vision — Hệ thống thẩm định chứng từ L/C ngân hàng",
  description: "Hệ thống kiểm tra đối chiếu tự động chứng từ Thư tín dụng (L/C) bằng GPT-4o Vision, chuẩn UCP 600. Tích hợp Multi-Agent AI và Human-in-the-Loop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
