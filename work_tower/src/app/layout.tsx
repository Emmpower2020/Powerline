import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  // v3.3.0: نام برنامه به «سیستم مدیریت خطوط ایلیا» تغییر کرد + آیکون اختصاصی دکل انتقال
  title: {
    default: "سیستم مدیریت خطوط ایلیا",
    template: "%s | سیستم مدیریت خطوط ایلیا",
  },
  description: "پلتفرم یکپارچه مدیریت دارایی و تعمیرات خطوط انتقال و فوق‌انتقال برق",
  keywords: ["خطوط انتقال", "مدیریت", "تعمیرات", "EAM", "CMMS", "ایلیا"],
  authors: [{ name: "Ilya Powerline Team" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className={`${vazirmatn.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
