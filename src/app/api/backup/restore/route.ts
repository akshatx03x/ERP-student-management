import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSession } from "@/server/auth/session";
import { resolveEffectivePermissions } from "@/server/permissions/guard";
import { isPrincipal } from "@/server/auth/session";
import { getBackupProvider, BACKUP_EXTENSION, BackupError } from "@/server/providers/backup.provider";
import { writeAuditLog, requestMeta } from "@/server/services/audit.service";
import { prisma } from "@/server/lib/prisma";
import { appConfig } from "@/config/app-config";

/**
 * POST /api/backup/restore
 *
 * Accepts a multipart/form-data upload of a .erpbackup file.
 * Validates the archive (format, version, integrity) and writes the
 * extracted DB to a temp path.
 *
 * Returns validation metadata to the client for display in the
 * confirmation dialog.  The actual swap happens in /api/backup/restore/confirm.
 */
export async function POST(request: NextRequest) {
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

  // Extra safety layer: PRINCIPAL only
  if (!isPrincipal(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: Only the Principal can restore the ERP database." },
      { status: 403 },
    );
  }

  const perms = await resolveEffectivePermissions(user.id, user.role);
  if (!perms.has("settings.update")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Read multipart upload ─────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request: could not parse form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No backup file uploaded. Expected a file field named 'file'." }, { status: 400 });
  }

  // Validate extension
  const originalName: string = (file as File).name ?? "backup.erpbackup";
  if (!originalName.endsWith(BACKUP_EXTENSION)) {
    return NextResponse.json(
      { error: `Invalid file type. Only ${BACKUP_EXTENSION} files are accepted.` },
      { status: 400 },
    );
  }

  // ── Save upload to temp directory ─────────────────────────────────────────
  const tempDir = appConfig.offlinePaths.tempDir;
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const uploadTempPath = path.join(tempDir, `upload_${Date.now()}${BACKUP_EXTENSION}`);
  try {
    const arrayBuf = await (file as File).arrayBuffer();
    await fs.promises.writeFile(uploadTempPath, Buffer.from(arrayBuf));
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Failed to save uploaded file: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // ── Validate archive ──────────────────────────────────────────────────────
  try {
    const provider = getBackupProvider();
    const validation = await provider.validateAndPrepareRestore(uploadTempPath);

    // Audit — validation event
    try {
      const meta = requestMeta(request.headers);
      await writeAuditLog({
        schoolId: user.schoolId,
        userId: user.id,
        action: "RESTORE_VALIDATED",
        module: "BACKUP",
        entityType: "Database",
        entityId: originalName,
        newValue: {
          filename: originalName,
          backupCreatedAt: validation.metadata.createdAt,
          backupSchoolName: validation.metadata.schoolName,
          backupErpVersion: validation.metadata.erpVersion,
          integrityVerified: true,
        },
        ...meta,
      });
    } catch (auditErr) {
      console.warn("[BackupRestore] Audit log write failed (non-fatal):", auditErr);
    }

    return NextResponse.json({
      valid: true,
      tempDbPath: validation.tempDbPath,
      metadata: {
        schoolName: validation.metadata.schoolName,
        createdAt: validation.metadata.createdAt,
        erpVersion: validation.metadata.erpVersion,
        backupFormatVersion: validation.metadata.backupFormatVersion,
        label: validation.metadata.label,
        sha256: validation.metadata.sha256,
      },
    });
  } catch (err: unknown) {
    // Clean up upload temp file on failure
    try { await fs.promises.unlink(uploadTempPath); } catch { /* ignore */ }

    if (err instanceof BackupError) {
      const statusByCode: Record<string, number> = {
        FILE_NOT_FOUND: 404,
        INVALID_FORMAT: 400,
        CORRUPT_ARCHIVE: 400,
        INTEGRITY_MISMATCH: 422,
        VERSION_INCOMPATIBLE: 422,
        DB_NOT_FOUND: 500,
        RESTORE_FAILED: 500,
        PERMISSION_DENIED: 403,
      };
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: statusByCode[err.code] ?? 400 },
      );
    }

    return NextResponse.json(
      { error: `Validation failed: ${(err as Error).message}` },
      { status: 500 },
    );
  } finally {
    // Always clean up the uploaded temp file after validation (tempDbPath is different)
    try { await fs.promises.unlink(uploadTempPath); } catch { /* ignore */ }
  }
}
