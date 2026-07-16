import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { writeAuditLog } from "@/server/services/audit.service";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { parseOrThrow } from "@/server/validators/common";
import {
  updateBrandingSchema,
  type UpdateBrandingInput,
} from "@/server/validators/branding.validator";

export async function getSchoolBranding(schoolId?: string) {
  const { user } = await requirePermission("settings.view");
  const sid = schoolId ?? schoolIdFromUser(user);
  return getBrandingBySchoolId(sid);
}

/** Internal branding lookup (no permission check) for receipts/report cards. */
export async function getBrandingBySchoolId(schoolId: string) {
  const branding = await prisma.schoolBranding.findUnique({
    where: { schoolId },
  });

  if (!branding) {
    const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    return prisma.schoolBranding.create({
      data: {
        schoolId,
        schoolName: school.name,
      },
    });
  }

  return branding;
}

export async function updateBranding(input: UpdateBrandingInput) {
  const { user } = await requirePermission("settings.update");
  const schoolId = schoolIdFromUser(user);
  const data = parseOrThrow(updateBrandingSchema, input);

  const existing = await getSchoolBranding(schoolId);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.schoolBranding.update({
      where: { id: existing.id },
      data: {
        schoolName: data.schoolName,
        address: data.address,
        phone: data.phone,
        email: data.email,
        website: data.website === "" ? null : data.website,
        principalName: data.principalName,
        logoDocumentId: data.logoDocumentId,
        principalSignatureDocumentId: data.principalSignatureDocumentId,
        schoolStampDocumentId: data.schoolStampDocumentId,
        qrCodeDocumentId: data.qrCodeDocumentId,
        receiptFooter: data.receiptFooter,
        reportCardFooter: data.reportCardFooter,
      },
    });

    await writeAuditLog(
      {
        schoolId,
        userId: user.id,
        action: "update",
        module: "settings",
        entityType: "SchoolBranding",
        entityId: result.id,
        oldValue: existing,
        newValue: result,
      },
      tx,
    );

    return result;
  });

  return updated;
}
