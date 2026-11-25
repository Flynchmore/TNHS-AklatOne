import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/auth";

/** Signed-in screens of the phone app. RBAC: members get the member app, librarians/admins the librarian scanner. */
export function MobileProtected({ children, staff = false }: { children: React.ReactNode; staff?: boolean }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  // Remember where the member was going, so sign-in (or session restore) returns them there.
  if (!user) return <Navigate to="/m/login" replace state={{ from: location.pathname + location.search }} />;
  const isMember = user.role === "MEMBER";
  if (!staff && !isMember) return <Navigate to="/m/staff" replace />;
  if (staff && isMember) return <Navigate to="/m" replace />;
  return <>{children}</>;
}
