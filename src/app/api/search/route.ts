import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { prisma } from "@/server/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // better-auth stores custom fields (including schoolId) on the session user
  // object, so we read it directly instead of making a separate DB query.
  const schoolId = (session.user as { schoolId?: string | null }).schoolId;
  if (!schoolId) {
    return NextResponse.json({ results: [] });
  }

  const [students, families, payments] = await Promise.all([
    prisma.student.findMany({
      where: {
        schoolId,
        OR: [
          { fullName: { contains: q } },
          { admissionNo: { contains: q } },
        ],
      },
      take: 8,
      select: { id: true, fullName: true, admissionNo: true },
    }),
    prisma.family.findMany({
      where: {
        schoolId,
        OR: [
          { fatherName: { contains: q } },
          { motherName: { contains: q } },
          { primaryPhone: { contains: q } },
        ],
      },
      take: 5,
      select: { id: true, fatherName: true, motherName: true, primaryPhone: true },
    }),
    prisma.familyPayment.findMany({
      where: {
        receiptNo: { contains: q },
        family: { schoolId },
      },
      take: 5,
      select: { id: true, receiptNo: true },
    }),
  ]);

  const results = [
    ...students.map((s) => ({
      type: "student",
      id: s.id,
      label: `${s.fullName} (${s.admissionNo})`,
      href: `/students/${s.id}`,
    })),
    ...families.map((f) => ({
      type: "family",
      id: f.id,
      label: [f.fatherName, f.motherName, f.primaryPhone].filter(Boolean).join(" · "),
      href: `/students?q=${encodeURIComponent(f.primaryPhone || f.fatherName || "")}`,
    })),
    ...payments.map((p) => ({
      type: "receipt",
      id: p.id,
      label: `Receipt ${p.receiptNo}`,
      href: `/fees?receipt=${p.receiptNo}`,
    })),
  ];

  return NextResponse.json({ results });
}
