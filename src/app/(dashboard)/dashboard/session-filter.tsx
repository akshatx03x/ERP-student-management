"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function SessionFilter({
  sessions,
  selectedSessionId,
}: {
  sessions: Array<{ id: string; name: string }>;
  selectedSessionId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("sessionId", val);
    } else {
      params.delete("sessionId");
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-500">Academic Session:</span>
      <select
        value={selectedSessionId || ""}
        onChange={handleChange}
        className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-slate-700"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
