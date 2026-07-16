"use client";

import { Button } from "@/components/ui/button";

export function ReportsPrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      Print report
    </Button>
  );
}
