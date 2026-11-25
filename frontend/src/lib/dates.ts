// All staff dates are shown in Philippine time, whatever the computer's own time zone is set to.
export const TZ = "Asia/Manila";

const fmtDate = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
const fmtTime = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const fmtLong = new Intl.DateTimeFormat("en-PH", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });

type In = string | number | Date | null | undefined;
const ok = (v: In): v is string | number | Date => v !== null && v !== undefined && v !== "" && !Number.isNaN(new Date(v).getTime());

/** "Nov 20, 2026" */
export const phDate = (v: In) => (ok(v) ? fmtDate.format(new Date(v)) : "—");
/** "9:54 AM" */
export const phTime = (v: In) => (ok(v) ? fmtTime.format(new Date(v)) : "—");
/** "Nov 20, 2026, 9:54 AM" */
export const phDateTime = (v: In) => (ok(v) ? `${phDate(v)}, ${phTime(v)}` : "—");
/** "Friday, November 20, 2026" */
export const phLongDate = (v: In = Date.now()) => (ok(v) ? fmtLong.format(new Date(v)) : "—");
/** Hour of day (0-23) in Philippine time, for greetings. */
export const phHour = (v: In = Date.now()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(ok(v) ? v : Date.now())));
/** "2026-11-20" in Philippine time, for <input type="date"> (toISOString would give the UTC day, i.e. yesterday before 8 AM). */
export const phISODate = (v: In = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ok(v) ? v : Date.now()));
/** Start / end of a Philippine calendar day as an absolute timestamp for the API. */
export const phDayStart = (isoDay: string) => `${isoDay}T00:00:00+08:00`;
export const phDayEnd = (isoDay: string) => `${isoDay}T23:59:59.999+08:00`;
