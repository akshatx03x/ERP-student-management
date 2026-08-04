import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSession } from "@/server/auth/session";
import { resolveEffectivePermissions } from "@/server/permissions/guard";
import { isPrincipal } from "@/server/auth/session";
import { getBackupProvider } from "@/server/providers/backup.provider";
import { writeAuditLog, requestMeta } from "@/server/services/audit.service";
import { prisma } from "@/server/lib/prisma";
import { appConfig } from "@/config/app-config";

/**
 * POST /api/backup/restore/confirm
 *
 * Executes the actual database restore.
 * The client sends the tempDbPath returned by /api/backup/restore.
 *
 * This endpoint:
 * 1. Re-validates auth + PRINCIPAL role + permission
 * 2. Performs the atomic database swap
 * 3. Writes a RESTORE_EXECUTED audit log entry
 * 4. Returns success/failure to the client
 *
 * The client is expected to force-reload the page on success so that
 * no stale in-memory state remains.
 */
export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, schoolId: true, isActive: true, name: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // PRINCIPAL only
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

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { tempDbPath?: string; backupFilename?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { tempDbPath, backupFilename } = body;
  if (!tempDbPath || typeof tempDbPath !== "string") {
    return NextResponse.json(
      { error: "Missing required field: tempDbPath" },
      { status: 400 },
    );
  }

  // Safety: tempDbPath must be in the temp directory (prevent path traversal)
  const tempDir = appConfig.offlinePaths.tempDir;
  const resolvedTempPath = path.resolve(tempDbPath);
  const resolvedTempDir = path.resolve(tempDir);
  if (!resolvedTempPath.startsWith(resolvedTempDir)) {
    return NextResponse.json(
      { error: "Invalid tempDbPath: path is outside the allowed temp directory." },
      { status: 400 },
    );
  }

  // ── Execute restore ───────────────────────────────────────────────────────
  const provider = getBackupProvider();
  const result = await provider.executeRestore(tempDbPath);

  // ── Audit ─────────────────────────────────────────────────────────────────
  try {
    const meta = requestMeta(request.headers);
    // Note: after restore, the DB may have changed — we write audit log regardless
    await writeAuditLog({
      schoolId: user.schoolId,
      userId: user.id,
      action: result.success ? "RESTORE_EXECUTED" : "RESTORE_FAILED",
      module: "BACKUP",
      entityType: "Database",
      entityId: backupFilename ?? "unknown",
      newValue: {
        success: result.success,
        message: result.message,
        executedBy: user.name,
        executedAt: new Date().toISOString(),
      },
      ...meta,
    });
  } catch (auditErr) {
    console.warn("[BackupRestoreConfirm] Audit log write failed (non-fatal):", auditErr);
  }

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
