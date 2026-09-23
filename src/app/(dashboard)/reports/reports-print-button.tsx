"use client";

import { Button } from "@/components/ui/button";

export function ReportsPrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="no-print">
      Print report
    </Button>
  );
}
