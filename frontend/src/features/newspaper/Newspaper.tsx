import { Newspaper as NewspaperIcon } from "lucide-react";
import { PageHeader } from "../../components/staff/ui";
import { ScreenShell } from "../../components/mobile/ui";
import { SchoolNewspaper } from "../../components/SchoolNewspaper";

/** Staff Web / Desktop: School Newspaper. */
export function Newspaper() {
  return (
    <div className="space-y-6">
      <PageHeader icon={NewspaperIcon} title="School Newspaper" subtitle="Tagumpay National High School's student publications." />
      <SchoolNewspaper />
    </div>
  );
}

/** Member app: School Newspaper. */
export function MobileNewspaper() {
  return (
    <ScreenShell title="School Newspaper" subtitle="The Victor and Masid" icon={NewspaperIcon} back="/m">
      <SchoolNewspaper compact />
    </ScreenShell>
  );
}
