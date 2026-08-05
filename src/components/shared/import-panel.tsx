"use client";

import { useState, useTransition } from "react";
import { ImportType } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  executeImportAction,
  getImportTemplateAction,
  previewImportAction,
} from "@/server/actions/import.actions";

const TYPES: ImportType[] = [
  "FAMILIES",
  "STUDENTS",
  "TEACHERS",
  "CLASSES",
  "SECTIONS",
  "SUBJECTS",
];

type PreviewResult = {
  jobId: string;
  total: number;
  validCount: number;
  failCount: number;
  errors: Array<{ row: number; message: string }>;
  preview: Array<Record<string, string>>;
};

export function ImportPanel() {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<ImportType>("FAMILIES");
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  function downloadTemplate() {
    startTransition(async () => {
      try {
        const base64 = await getImportTemplateAction(type);
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type.toLowerCase()}-template.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to download template");
      }
    });
  }

  function onFile(file: File | null) {
    if (!file) return;
    startTransition(async () => {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
        const base64 = btoa(binary);
        const result = await previewImportAction(type, base64);
        setPreview(result);
        toast.success(`Validated ${result.total} rows`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Validation failed");
      }
    });
  }

  function commit() {
    if (!preview) return;
    startTransition(async () => {
      try {
        const result = await executeImportAction(preview.jobId);
        toast.success(`Imported ${result.successCount} rows`);
        setPreview(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  return (
    <Card>
      
    </Card>
  );
}
