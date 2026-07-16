"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  listDocumentsAction,
  uploadDocumentAction,
  deleteDocumentAction,
} from "@/server/actions/platform.actions";

type Student = { id: string; fullName: string };
type Doc = {
  id: string;
  fileName: string;
  type: string;
  mimeType: string;
  sizeBytes: number;
};

export function DocumentsClient({ students }: { students: Student[] }) {
  const [pending, startTransition] = useTransition();
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [type, setType] = useState("OTHER");

  function load() {
    startTransition(async () => {
      try {
        const items = await listDocumentsAction("STUDENT", studentId);
        setDocs(items as Doc[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function onFile(file: File | null) {
    if (!file || !studentId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Max 5MB");
      return;
    }
    startTransition(async () => {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        await uploadDocumentAction({
          ownerType: "STUDENT",
          ownerId: studentId,
          type: type as "OTHER" | "BIRTH_CERTIFICATE" | "AADHAAR" | "PHOTO" | "TRANSFER_CERTIFICATE" | "MEDICAL_CERTIFICATE",
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64: btoa(binary),
        });
        toast.success("Uploaded");
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Student documents</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="PHOTO">Photo</option>
              <option value="BIRTH_CERTIFICATE">Birth Certificate</option>
              <option value="AADHAAR">Aadhaar</option>
              <option value="TRANSFER_CERTIFICATE">TC</option>
              <option value="MEDICAL_CERTIFICATE">Medical</option>
              <option value="OTHER">Other</option>
            </Select>
            <Button type="button" variant="outline" disabled={pending} onClick={load}>Load</Button>
          </div>
          <input type="file" disabled={pending || !studentId} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <a className="text-primary hover:underline" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                  {d.fileName} · {d.type} · {(d.sizeBytes / 1024).toFixed(1)} KB
                </a>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => {
                  try {
                    await deleteDocumentAction(d.id);
                    toast.success("Deleted");
                    load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                })}>Delete</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
