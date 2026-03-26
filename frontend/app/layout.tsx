import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import ReduxProvider from "@/lib/redux/ReduxProvider";
import { Toaster } from "react-hot-toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import HeartbeatHandler from "../components/HeartbeatHandler";

const poppins = Poppins({
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HireIt",
  description: "AI-powered hiring and assessment platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${poppins.variable} antialiased font-poppins`}
      >
        <ErrorBoundary>
          <ReduxProvider>
            <AuthProvider>
              <ToastProvider>
                <HeartbeatHandler />
                {children}
                <Toaster position="top-right" />
              </ToastProvider>
            </AuthProvider>
          </ReduxProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
