import { Search, BellRing, DoorOpen } from "lucide-react";

/** Welcome slides on the phone (MobileWelcome): drawn scenes kept here because they use fixed artwork colours. */
// Small drawn scenes of the real screens (fixed colours, so they look the same in light and dark mode).
const NAVY = "#1E326D", BLUE = "#3354B5";
const qrCells = "1111111010111111111110101000010000011010101001011101011100010111010101011010111010111010010111010000010101000001111111010101111111".split("");
function MiniQr({ size = 64 }: { size?: number }) {
  return <span className="grid grid-cols-[repeat(11,1fr)] p-1 bg-white rounded-md" style={{ width: size, height: size }} aria-hidden="true">{qrCells.slice(0, 121).map((c, k) => <span key={k} className={c === "1" ? "bg-[#1E326D]" : ""} />)}</span>;
}
function Scene({ n }: { n: number }) {
  const card = "rounded-2xl bg-white shadow-lg border border-[#DCE3F0]";
  switch (n) {
    case 1: return (
      <div className="w-56 space-y-2">
        <div className={`${card} flex items-center gap-2 px-3 py-2 text-[11px] text-[#5B6578]`}><Search size={14} style={{ color: BLUE }} />Noli Me Tangere</div>
        {[["Noli Me Tangere", "3 of 5 on the shelf", "#15803D"], ["El Filibusterismo", "1 of 2 on the shelf", "#15803D"], ["Florante at Laura", "All borrowed", "#C42B2A"]].map(([t, a, c]) => (
          <div key={t} className={`${card} flex items-center gap-2 p-2`}><span className="w-7 h-9 rounded-md shrink-0" style={{ background: `linear-gradient(135deg, ${BLUE}, ${NAVY})` }} /><span className="text-left min-w-0"><span className="block text-[11px] font-bold text-[#202A3B] truncate">{t}</span><span className="block text-[10px] font-semibold" style={{ color: c }}>{a}</span></span></div>
        ))}
      </div>
    );
    case 2: return (
      <div className={`${card} w-52 p-3 text-left relative`}>
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: BLUE }}>Borrowing receipt</p>
        <p className="font-mono text-[11px] font-bold text-[#202A3B]">AK-20261126-7F3A</p>
        <div className="mt-2 flex items-center gap-2"><span className="w-7 h-9 rounded-md" style={{ background: `linear-gradient(135deg, ${BLUE}, ${NAVY})` }} /><span className="text-[11px] font-semibold text-[#202A3B]">Noli Me Tangere</span></div>
        <div className="mt-2 rounded-lg bg-[#EAF0FF] px-2 py-1.5"><p className="text-[9px] font-bold uppercase text-[#5B6578]">Return by</p><p className="text-[12px] font-extrabold" style={{ color: NAVY }}>Dec 3, 2026</p></div>
        <span className="absolute -right-3 -top-3 rotate-12 rounded-lg border-2 border-[#15803D] bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#15803D] shadow">APPROVED</span>
      </div>
    );
    case 3: return (
      <div className="w-60 rounded-xl overflow-hidden shadow-xl border border-[#c9d3ea] bg-[#FAF9F5] text-left">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ background: NAVY }}><img src="/tnhs-logo.png" alt="" className="w-5 h-5 rounded-full bg-white" /><span className="text-[8px] font-bold text-white leading-tight">TAGUMPAY NATIONAL HIGH SCHOOL<br /><span className="text-[#F0F000]">LIBRARY ID</span></span></div>
        <div className="flex items-center gap-2.5 p-2.5"><MiniQr size={60} /><span><span className="block text-[8px] font-semibold text-[#5B6578]">MEMBER ID</span><span className="block font-mono text-[15px] font-extrabold" style={{ color: NAVY }}>JC123456</span><span className="block text-[8px] font-semibold text-[#5B6578] mt-1">GRADE - SECTION</span><span className="block text-[11px] font-bold" style={{ color: NAVY }}>10 - Rizal</span></span></div>
      </div>
    );
    case 4: return (
      <div className="w-60 rounded-xl overflow-hidden shadow-xl bg-white border border-[#DCE3F0]">
        <div className="px-2.5 py-1.5 text-left text-[10px] font-bold text-white" style={{ background: NAVY }}>Visitor's Log · 7:42 AM</div>
        <div className="flex items-center gap-3 p-2.5"><MiniQr size={58} /><span className="flex-1 space-y-1.5 text-left">
          <span className="flex items-center gap-1.5 rounded-lg bg-[#15803D] px-2 py-1 text-[11px] font-extrabold text-white"><DoorOpen size={12} />Time In</span>
          <span className="block text-[10px] text-[#5B6578]">JC123456 · 7:42 AM</span>
          <span className="block text-[10px] text-[#5B6578]">MS654321 · 7:40 AM</span>
        </span></div>
      </div>
    );
    case 5: return (
      <div className="relative">
        <div className={`${card} w-36 -mt-8 overflow-hidden text-center`}>
          <div className="py-1 text-[11px] font-bold text-white" style={{ background: "#C42B2A" }}>DECEMBER</div>
          <p className="text-4xl font-extrabold py-2" style={{ color: NAVY }}>3</p>
          <p className="text-[10px] font-semibold text-[#5B6578] pb-2">Return day</p>
        </div>
        <div className={`${card} absolute -right-20 -bottom-14 w-40 flex items-start gap-1.5 p-2 text-left`}><BellRing size={16} className="shrink-0 text-[#B45309]" /><span className="text-[10px] leading-tight text-[#202A3B]"><b>Return tomorrow</b><br />Noli Me Tangere is due Dec 3.</span></div>
      </div>
    );
    default: return null;
  }
}

/** The picture frame of a slide: the team's picture when there is one, otherwise a drawn scene of the app. */
export function Illustration({ n, active, picture }: { n: number; active: boolean; picture?: string }) {
  return (
    <div className={`relative w-full max-w-xs aspect-[4/3] rounded-[2rem] bg-white shadow-2xl overflow-hidden ${active ? "ak-scale" : ""}`}>
      {picture ? <img src={picture} alt="" className="w-full h-full object-cover" /> : (
        <div className="relative h-full flex items-center justify-center" aria-hidden="true">
          <span className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#EAF0FF]" />
          <span className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-[#FDE047]/50" />
          <img src="/tnhs-logo.png" alt="" className="absolute w-44 opacity-[0.07]" />
          <span className="relative">
            {n === 0 ? (
              <span className="flex items-end">
                <img src="/aklatone-icon.png" alt="AklatOne" className="w-28 h-28 rounded-[1.75rem] bg-white p-2 shadow-xl" />
                <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" className="w-14 h-14 rounded-full bg-white p-0.5 shadow-xl -ml-6" />
              </span>
            ) : <Scene n={n} />}
          </span>
        </div>
      )}
    </div>
  );
}

