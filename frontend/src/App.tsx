import { MobileSettings } from "./features/mobile/MobileSettings";
import { MobileWelcome, hasConsented } from "./features/mobile/MobileWelcome";
import { applyTheme } from "./components/mobile/theme";
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./features/auth/auth";
import { Protected } from "./components/Protected";
import { Layout } from "./components/Layout";
import { MobileLayout } from "./components/mobile/MobileLayout";
import { MobileProtected } from "./components/mobile/MobileProtected";
import { Login } from "./features/auth/Login";
import { LibrarianSetup } from "./features/auth/LibrarianSetup";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Catalog } from "./features/catalog/Catalog";
import { Borrowing } from "./features/circulation/Borrowing";
import { Members } from "./features/members/Members";
import { Reports } from "./features/reports/Reports";
import { Printing } from "./features/printing/Printing";
import { Inventory } from "./features/inventory/Inventory";
import { MobileSuggestions } from "./features/mobile/MobileSuggestions";
import { Visitors } from "./features/visits/Visitors";
import { Suggestions } from "./features/suggestions/Suggestions";
import { Newspaper, MobileNewspaper } from "./features/newspaper/Newspaper";
import { Kiosk } from "./features/visits/Kiosk";
import { ChooseApp } from "./features/visits/ChooseApp";
import { MobileStaff } from "./features/mobile/MobileStaff";
import { MobileVisit } from "./features/mobile/MobileVisit";
import { Settings } from "./features/settings/Settings";
import { Upload } from "./features/upload/Upload";
import { TitleBar, ResizeEdges } from "./components/staff/TitleBar";
import { isDesktop } from "./lib/offline";
import { MobileLogin } from "./features/mobile/MobileLogin";
import { MobileHome } from "./features/mobile/MobileHome";
import { MobileCatalog } from "./features/mobile/MobileCatalog";
import { MobileHistory } from "./features/mobile/MobileHistory";
import { MobileProfile } from "./features/mobile/MobileProfile";
import { MobileOpenLibrary } from "./features/mobile/MobileOpenLibrary";
import { MobileForgotPassword } from "./features/mobile/MobileForgotPassword";
import { ToastProvider } from "./components/Toast";
import { MobileLoans } from "./features/mobile/MobileLoans";
import { MobileReceipt } from "./features/mobile/MobileReceipt";
import { MobileNotifications } from "./features/mobile/MobileNotifications";

const qc = new QueryClient();
export const detectNative = () => {
  if (typeof window === "undefined") return false;
  const w = window as any;
  if (w.androidBridge) return true;
  if (w.webkit?.messageHandlers?.bridge) return true;
  if (typeof w.Capacitor?.isNativePlatform === "function" && w.Capacitor.isNativePlatform()) return true;
  if (/; wv\)/.test(navigator.userAgent) || /Android.*WebView/.test(navigator.userAgent)) return true;
  return false;
};

/** First screen of every app (Web, Desktop, Mobile) while the saved session is checked: the AklatOne logo. */
function LoadingScreen() {
  return (
    <div role="status" aria-label="Loading AklatOne" className="min-h-[calc(100vh-var(--ak-titlebar,0px))] bg-page flex flex-col items-center justify-center px-6">
      <div className="relative w-28 h-28 ak-scale">
        <span className="absolute inset-0 rounded-[2rem] bg-primary/20 motion-safe:animate-ping" aria-hidden="true" />
        <span className="relative w-28 h-28 rounded-[2rem] bg-white shadow-xl shadow-primary/20 ring-1 ring-line flex items-center justify-center">
          <img src="/aklatone-icon.png" alt="" className="w-20 h-20 object-contain" />
        </span>
      </div>
      <h1 className="mt-6 text-3xl font-bold text-primary-strong tracking-tight ak-slide">AklatOne</h1>
      <p className="text-sm text-ink-muted mt-1 ak-slide" style={{ animationDelay: ".08s" }}>Library Management System · Tagumpay National High School</p>
      <div className="mt-8 h-1.5 w-40 rounded-full bg-primary-soft overflow-hidden" aria-hidden="true">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-primary-strong ak-loading-bar" />
      </div>
    </div>
  );
}

function AppRoutes() {
  const { ready } = useAuth();
  const isNative = detectNative();
  // Member app: walkthrough + Terms/storage consent on first launch (and again when the terms change).
  const [consented, setConsented] = useState(hasConsented);
  // Mobile-only theme tweaks (off-white surfaces) are scoped to this class. The saved light/dark theme applies to both apps.
  useEffect(() => { document.documentElement.classList.toggle("ak-mobile", isNative); document.documentElement.classList.toggle("ak-desktop", isDesktop); applyTheme(true); }, [isNative]);
  if (!ready) return <LoadingScreen />;
  return (
    <BrowserRouter>
      <Routes>
        {isNative && !consented ? (
          <>
            <Route path="/m/welcome" element={<MobileWelcome onDone={() => setConsented(true)} />} />
            <Route path="*" element={<Navigate to="/m/welcome" replace />} />
          </>
        ) : isNative ? (
          <>
            <Route path="/m/login" element={<MobileLogin />} />
            <Route path="/m/forgot-password" element={<MobileForgotPassword />} />
            <Route element={<MobileProtected><MobileLayout /></MobileProtected>}>
              <Route path="/m" element={<MobileHome />} />
              <Route path="/m/catalog" element={<MobileCatalog />} />
              <Route path="/m/history" element={<MobileHistory />} />
              <Route path="/m/profile" element={<MobileProfile />} />
              <Route path="/m/settings" element={<MobileSettings />} />
              <Route path="/m/settings/:page" element={<MobileSettings />} />
              <Route path="/m/openlibrary" element={<MobileOpenLibrary />} />
              <Route path="/m/loans" element={<MobileLoans />} />
              <Route path="/m/receipt/:id" element={<MobileReceipt />} />
              <Route path="/m/notifications" element={<MobileNotifications />} />
              <Route path="/m/suggestions" element={<MobileSuggestions />} />
              <Route path="/m/newspaper" element={<MobileNewspaper />} />
              <Route path="/m/visit" element={<MobileVisit />} />
            </Route>
            <Route path="/m/staff" element={<MobileProtected staff><div className="min-h-screen bg-page"><MobileStaff /></div></MobileProtected>} />
            <Route path="*" element={<Navigate to="/m/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<LibrarianSetup />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/borrowing" element={<Borrowing />} />
              {/* The Desktop app used to call this page "Transactions". */}
              <Route path="/transactions" element={<Navigate to="/borrowing" replace />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/members" element={<Members />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/printing" element={<Printing />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/visitors" element={<Visitors />} />
              <Route path="/suggestions" element={<Suggestions />} />
              <Route path="/newspaper" element={<Newspaper />} />
              <Route path="/settings" element={<Settings />} />
              {/* Old addresses (before Catalog/Borrowing were merged). */}
              <Route path="/copies" element={<Navigate to="/catalog" replace />} />
              <Route path="/requests" element={<Navigate to="/borrowing" replace />} />
              <Route path="/loans" element={<Navigate to="/borrowing?tab=borrowed" replace />} />
              <Route path="/users" element={<Navigate to="/members" replace />} />
            </Route>
            <Route path="/kiosk" element={<Protected kiosk><Kiosk /></Protected>} />
            <Route path="/choose" element={<Protected><ChooseApp /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          {isDesktop && <><TitleBar /><ResizeEdges /></>}
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}