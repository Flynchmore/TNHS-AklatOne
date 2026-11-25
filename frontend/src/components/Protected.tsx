import { Navigate } from "react-router-dom";
import { Smartphone, LogOut } from "lucide-react";
import { useAuth } from "../features/auth/auth";

/** Guard for the Staff Web / Desktop screens. Members use the phone app, so they get a notice instead of a half-empty portal. */
export function Protected({ children, roles, kiosk = false }: { children: React.ReactNode; roles?: string[]; kiosk?: boolean }) {
  const { user, ready, logout } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  // While the Visitor's Log runs, only the kiosk screen opens (Back or a typed address lead back to it).
  if (user.role === "KIOSK" && !kiosk) return <Navigate to="/kiosk" replace />;
  if (kiosk && user.role !== "KIOSK") return <Navigate to="/visitors" replace />;
  if (user.role === "MEMBER" || (roles && !roles.some(r => r.toUpperCase() === user.role.toUpperCase()))) {
    return (
      <main className="min-h-[calc(100dvh-var(--ak-titlebar,0px))] flex items-center justify-center p-6 bg-page">
        <div role="alert" className="max-w-md w-full bg-surface rounded-3xl border border-line shadow-lg p-8 text-center space-y-4">
          <img src="/aklatone-icon.png" alt="AklatOne" className="w-16 h-16 mx-auto rounded-2xl" />
          <h1 className="text-xl font-bold text-primary-strong">This portal is for the library staff</h1>
          <p className="text-ink-muted">Students and teachers use the <b className="text-ink">AklatOne app</b> on their phone to search books, borrow and see their records. Ask the librarian for the app, or use your Library ID card at the desk.</p>
          <p className="flex items-center justify-center gap-2 text-sm text-ink-muted"><Smartphone size={16} aria-hidden="true" />Signed in as {user.displayName || user.username}</p>
          <button type="button" onClick={() => logout()} className="inline-flex items-center gap-2 min-h-11 px-5 rounded-2xl font-semibold text-on-primary bg-gradient-to-br from-primary to-primary-strong"><LogOut size={18} aria-hidden="true" />Sign out</button>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
