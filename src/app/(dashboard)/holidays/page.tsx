import { listHolidays } from "@/server/services/holiday.service";
import { PageHeader } from "@/components/shared/states";
import { HolidaysClient } from "./holidays-client";

export default async function HolidaysPage() {
  const holidays = await listHolidays({ pageSize: 100 });
  return (
    <div>
      <PageHeader title="Holidays" description="Holiday calendar used by attendance reports." />
      <HolidaysClient holidays={holidays.items} />
    </div>
  );
}
