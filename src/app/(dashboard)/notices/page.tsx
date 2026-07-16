import { listNotices } from "@/server/services/notice.service";
import { PageHeader } from "@/components/shared/states";
import { NoticesClient } from "./notices-client";

export default async function NoticesPage() {
  const notices = await listNotices({ pageSize: 50 });
  return (
    <div>
      <PageHeader title="Notice Board" description="School notices. SMS/WhatsApp/Email channels reserved for later." />
      <NoticesClient notices={notices.items} />
    </div>
  );
}
