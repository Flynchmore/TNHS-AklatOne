import { Newspaper, ExternalLink, FileText } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { isDesktop } from "../lib/offline";

// Desktop and the phone app hand a plain link to the computer's / phone's browser; only the website opens a new tab.
const newTab = !isDesktop && !Capacitor.isNativePlatform();

/** The school's two student publications (Facebook pages; the developer gave these links on 2026-11-24). */
export const NEWSPAPERS = [
  { name: "The Victor", url: "https://www.facebook.com/TagumpayNHSTheVictor" },
  { name: "Masid", url: "https://www.facebook.com/profile.php?id=100089962866153" },
] as const;

/**
 * School Newspaper links (Web, Desktop and the member app). The Desktop app opens them in the computer's browser
 * (desktop-tauri/src/lib.rs allows only these Facebook pages); the website opens a new tab and the phone app opens the browser.
 */
export function SchoolNewspaper({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4">
      <ul className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        {NEWSPAPERS.map(n => (
          <li key={n.name}>
            <a href={n.url} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 shadow-sm hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-strong text-on-primary flex items-center justify-center shrink-0" aria-hidden="true"><Newspaper size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-ink">{n.name}</span>
                <span className="block text-sm text-ink-muted">Student publication · Facebook page</span>
              </span>
              <ExternalLink size={18} className="text-ink-muted group-hover:text-primary shrink-0" aria-label="Opens outside AklatOne" />
            </a>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4 rounded-3xl border border-dashed border-line-strong bg-page p-4">
        <span className="w-12 h-12 rounded-2xl bg-accent-soft text-on-accent flex items-center justify-center shrink-0" aria-hidden="true"><FileText size={22} /></span>
        <div>
          <p className="font-bold text-ink">Online newspaper (PDF) <span className="ml-1 text-xs font-bold px-3 py-1 leading-tight rounded-full bg-warning-soft text-warning align-middle">Coming soon</span></p>
          <p className="text-sm text-ink-muted">Issues of The Victor and Masid will be readable here once they are published online.</p>
        </div>
      </div>
    </div>
  );
}
