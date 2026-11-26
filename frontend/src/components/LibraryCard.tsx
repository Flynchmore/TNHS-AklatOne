import { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface CardMember { id: string; maskedId?: string | null; memberType?: string | null; gradeSection?: string | null; department?: string | null; position?: string | null }

/** The line under the Member ID: "Grade 10 - Rizal" for students, the department for teachers. */
export const cardDetail = (m: CardMember) => (m.memberType === "Teacher" ? [m.department, m.position].filter(Boolean).join(" · ") || "Teacher" : m.gradeSection || "Student");

/**
 * Front of the Library ID card at the standard ID size (85.6 x 54 mm, like an ATM card).
 * Only the QR code, the Member ID and grade/section (or department) are printed: no name, LRN, address or birthday.
 * The QR holds just the Member ID, so a phone camera, a USB scanner or typing it all give the same code.
 */
export function LibraryCard({ m }: { m: CardMember }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    if (m.maskedId) void QRCode.toString(m.maskedId, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then((s) => { if (live) setSvg(s); });
    return () => { live = false; };
  }, [m.maskedId]);
  return (
    <div className="ak-id-card relative overflow-hidden bg-[#FAF9F5] text-[#1E326D] border border-[#c9d3ea] break-inside-avoid" style={{ width: "85.6mm", height: "54mm", borderRadius: "3mm" }}>
      <div className="relative z-10 flex items-center gap-[2mm] px-[3mm] h-[11mm] bg-[#1E326D] text-white">
        <img src="/tnhs-logo.png" alt="" className="h-[8mm] w-[8mm] rounded-full bg-white object-contain" />
        <div className="leading-tight min-w-0">
          <p className="text-[2.6mm] font-bold uppercase truncate">Tagumpay National High School</p>
          <p className="text-[2.1mm] text-[#F0F000] font-semibold tracking-wide">SCHOOL LIBRARY · LIBRARY ID</p>
        </div>
        <img src="/aklatone-icon.png" alt="" className="ml-auto h-[7mm] w-[7mm] rounded-[1.5mm] bg-white p-[0.4mm]" />
      </div>
      {/* Ivory body; the school seal shows faintly around the QR code. The QR sits on its own white square with a quiet
          zone, so the seal never touches it and scanners read it as before. */}
      <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="absolute opacity-[0.10] pointer-events-none" style={{ width: "44mm", height: "44mm", left: "-3.5mm", top: "10.5mm" }} />
      <div className="relative flex items-center gap-[3.5mm] px-[3.5mm] h-[43mm]">
        <span className="block h-[33mm] w-[33mm] shrink-0 bg-white rounded-[1.5mm] p-[1.5mm] shadow-[0_0_0_0.3mm_#DCE3F0] [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR code ${m.maskedId ?? ""}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="min-w-0">
          <p className="text-[2.3mm] font-semibold uppercase tracking-wider text-[#5B6578]">Member ID</p>
          <p className="text-[6mm] font-extrabold font-mono tracking-wide leading-none mt-[0.5mm]">{m.maskedId ?? "—"}</p>
          <p className="text-[2.3mm] font-semibold uppercase tracking-wider text-[#5B6578] mt-[3mm]">{m.memberType === "Teacher" ? "Department / Designation" : "Grade level - Section"}</p>
          <p className="text-[3.4mm] font-bold leading-tight mt-[0.5mm] break-words">{cardDetail(m)}</p>
        </div>
      </div>
    </div>
  );
}

/** Dashed scissor line around a card or label: a guide for cutting (and laminating) it. */
export function CutLine({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center border border-dashed border-[#7B88A1]" style={{ width: `${w}mm`, height: `${h}mm` }}>
      <span className="absolute -top-[2.4mm] left-[2mm] bg-white px-[0.6mm] text-[3.2mm] leading-none text-[#5B6578]" aria-hidden="true">✂</span>
      {children}
    </div>
  );
}
