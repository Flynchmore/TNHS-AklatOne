import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { useToast } from "../Toast";
import { focusRing, mobileApi } from "./ui";

/**
 * Heart toggle for a book. Updates at once, then saves; a failed save puts it back.
 * Adding plays a pop with a small burst of dots. Shows a toast either way.
 */
export function FavouriteButton({ bookId, title, favourite, onChange, size = "md", className = "" }: {
  bookId: string; title: string; favourite: boolean; onChange?: (fav: boolean) => void; size?: "md" | "lg"; className?: string;
}) {
  const auth = useAuth();
  const toast = useToast();
  const [on, setOn] = useState(favourite);
  const [burst, setBurst] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOn(favourite); }, [favourite]);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    const next = !on;
    setOn(next);
    if (next) setBurst(b => b + 1);
    setBusy(true);
    const r = next
      ? await mobileApi("/api/v1/favourites", { method: "POST", body: JSON.stringify({ bookId }), token: auth.token })
      : await mobileApi(`/api/v1/favourites/${bookId}`, { method: "DELETE", token: auth.token });
    setBusy(false);
    if (!r.ok) {
      setOn(!next);
      toast({ tone: "error", title: "Favourites not updated", message: r.message ?? "Please try again." });
      return;
    }
    onChange?.(next);
    toast(next
      ? { tone: "success", title: "Added to Favourites", message: `"${title}" is in My Books › Favourites.` }
      : { tone: "info", title: "Removed from Favourites", message: `"${title}" was removed.` });
  };

  const box = size === "lg" ? "w-11 h-11" : "w-10 h-10";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Remove ${title} from favourites` : `Add ${title} to favourites`}
      className={`relative ${box} shrink-0 rounded-full flex items-center justify-center motion-safe:transition-colors motion-safe:duration-200 active:scale-90 ${on ? "bg-danger-soft text-danger" : "bg-surface/90 text-ink-muted border border-line hover:text-danger"} ${focusRing} ${className}`}
    >
      <Heart key={on ? `on-${burst}` : "off"} size={size === "lg" ? 22 : 20} fill={on ? "currentColor" : "none"} strokeWidth={2.2} className={on ? "ak-heart-pop" : ""} aria-hidden="true" />
      {on && burst > 0 && (
        <span key={burst} className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="ak-heart-dot absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-danger" style={{ "--a": `${i * 60}deg` } as React.CSSProperties} />
          ))}
        </span>
      )}
    </button>
  );
}
