"use client";

import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

interface ExportButtonProps {
  title: string;
  data: any[];
  filename?: string;
}

export function ReportExportButton({ title, data, filename = "financial_report" }: ExportButtonProps) {
  const exportCSV = () => {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]);
    const header = keys.join(",");
    const rows = data.map((item) =>
      keys.map((k) => `"${String(item[k] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 text-xs">
        <Download className="w-3.5 h-3.5" /> Export CSV
      </Button>
      <Button variant="secondary" size="sm" onClick={handlePrint} className="gap-2 text-xs">
        <Printer className="w-3.5 h-3.5" /> Print
      </Button>
    </div>
  );
}
