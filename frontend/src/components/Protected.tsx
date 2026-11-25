import { Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/auth";

export function Protected({ children, roles, kiosk = false }: { children: React.ReactNode; roles?: string[]; kiosk?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  // While the Visitor's Log runs, only the kiosk screen opens (Back or a typed address lead back to it).
  if (user.role === "KIOSK" && !kiosk) return <Navigate to="/kiosk" replace />;
  if (kiosk && user.role !== "KIOSK") return <Navigate to="/visitors" replace />;
  if (roles && !roles.some(r => r.toUpperCase() === user.role.toUpperCase())) return <div className="p-6 text-red-600">Access denied (prototype).</div>;
  return <>{children}</>;
}