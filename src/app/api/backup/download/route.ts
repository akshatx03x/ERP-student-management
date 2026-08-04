import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSession } from "@/server/auth/session";
import { resolveEffectivePermissions } from "@/server/permissions/guard";
import { getBackupProvider } from "@/server/providers/backup.provider";
import { writeAuditLog, requestMeta } from "@/server/services/audit.service";
import { prisma } from "@/server/lib/prisma";

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, schoolId: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perms = await resolveEffectivePermissions(user.id, user.role);
  if (!perms.has("settings.update")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Param ─────────────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing backup id parameter" }, { status: 400 });
  }

  // ── List and find matching backup ─────────────────────────────────────────
  const provider = getBackupProvider();
  const backups = await provider.listBackups();
  const backup = backups.find((b) => b.id === id || b.filename === id);

  if (!backup) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  if (!fs.existsSync(backup.filePath)) {
    return NextResponse.json({ error: "Backup file missing from disk" }, { status: 404 });
  }

  // ── Audit ─────────────────────────────────────────────────────────────────
  try {
    const meta = requestMeta(request.headers);
    await writeAuditLog({
      schoolId: user.schoolId,
      userId: user.id,
      action: "BACKUP_DOWNLOADED",
      module: "BACKUP",
      entityType: "Database",
      entityId: backup.filename,
      newValue: {
        filename: backup.filename,
        sizeBytes: backup.sizeBytes,
      },
      ...meta,
    });
  } catch (auditErr) {
    console.warn("[BackupDownload] Audit log write failed (non-fatal):", auditErr);
  }

  // ── Stream file ───────────────────────────────────────────────────────────
  const fileBuffer = await fs.promises.readFile(backup.filePath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${backup.filename}"`,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "no-store",
    },
  });
}
