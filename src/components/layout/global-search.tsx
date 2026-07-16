"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

type SearchHit = {
  type: string;
  id: string;
  label: string;
  href: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (!res.ok) {
          setHits([]);
          return;
        }
        const data = (await res.json()) as { results: SearchHit[] };
        setHits(data.results ?? []);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="relative w-full">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search students, families, receipts…"
        aria-label="Global search"
        className="h-9 bg-background"
      />
      {open && hits.length > 0 ? (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card shadow-md">
          {hits.map((hit) => (
            <button
              key={`${hit.type}-${hit.id}`}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={() => {
                router.push(hit.href);
                setOpen(false);
                setQ("");
              }}
            >
              <span className="text-xs text-muted-foreground uppercase">{hit.type}</span>
              <div>{hit.label}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
