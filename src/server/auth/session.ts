  import { cache } from "react";
  import { headers } from "next/headers";
  import { redirect } from "next/navigation";
  import type { Role } from "@prisma/client";
  import { auth } from "@/server/auth/auth";
  import { prisma } from "@/server/lib/prisma";
  import { unstable_cache } from "next/cache";

  /**
   * Cached per-request session fetch.
   * React cache() deduplicates this across the layout + page + any server
   * component that calls it within the same request — zero extra DB hits.
   */
  export const getSession = cache(async function getSession() {
    if (process.env.NODE_ENV !== "development") {
      return auth.api.getSession({ headers: await headers() });
    }
    const t0 = performance.now();
    const t1 = performance.now();
    const hdrs = await headers();
    const tH = (performance.now() - t1).toFixed(1);
    const t2 = performance.now();
    const session = await auth.api.getSession({ headers: hdrs });
    const tA = (performance.now() - t2).toFixed(1);
    console.log(`[perf] getSession  headers=${tH}ms  auth.api.getSession=${tA}ms  TOTAL=${(performance.now()-t0).toFixed(1)}ms`);
    return session;
  });

  export async function requireSession() {
    const session = await getSession();
    if (!session?.user) {
      redirect("/login");
    }
    if (session.user.isActive === false) {
      redirect("/login?error=inactive");
    }
    return session;
  }

  // Cache school branding separately as it changes very rarely
  export const getCachedSchoolBranding = cache(async function getCachedSchoolBranding(schoolId: string) {
    const fetchBranding = unstable_cache(
      async (sId: string) => {
        const branding = await prisma.schoolBranding.findUnique({
          where: { schoolId: sId },
        });
        if (!branding) {
          const school = await prisma.school.findUnique({ where: { id: sId }, select: { name: true } });
          if (!school) return null;
          return {
            schoolName: school.name,
            address: null,
            phone: null,
            email: null,
            website: null,
            principalName: null,
            logoDocumentId: null,
            principalSignatureDocumentId: null,
            schoolStampDocumentId: null,
            qrCodeDocumentId: null,
            receiptFooter: null,
            reportCardFooter: null,
          };
        }
        return branding;
      },
      [`school-branding-${schoolId}`],
      { revalidate: 3600, tags: [`branding-${schoolId}`] }
    );
    return fetchBranding(schoolId);
  });

  // Cache basic school info as it changes rarely
  export const getCachedSchoolInfo = cache(async function getCachedSchoolInfo(schoolId: string) {
    const fetchSchool = unstable_cache(
      async (sId: string) => {
        return prisma.school.findUnique({
          where: { id: sId },
          select: { id: true, name: true },
        });
      },
      [`school-info-${schoolId}`],
      { revalidate: 3600, tags: [`school-${schoolId}`] }
    );
    return fetchSchool(schoolId);
  });

  /**
   * Cached per-request optimized user fetch.
   * Loads only user database fields directly. Sub-relations are loaded lazily.
   */
  export const getCurrentUser = cache(async function getCurrentUser() {
    const session = await requireSession();
    const t0 = process.env.NODE_ENV === "development" ? performance.now() : 0;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        loginIdentifier: true,
        schoolId: true,
        staffProfileId: true,
        studentId: true,
      },
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`[perf] getCurrentUser (Optimized Select): ${(performance.now() - t0).toFixed(1)}ms`);
    }

    if (!user || !user.isActive) {
      redirect("/login?error=inactive");
    }

    // Lazily resolve staffProfile and student/school metadata when accessed
    const userWithGetters = {
      ...user,
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      get staffProfile(): Promise<any> {
        return prisma.staffProfile.findUnique({ where: { id: this.staffProfileId || undefined } });
      },
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      get student(): Promise<any> {
        return prisma.student.findUnique({
          where: { id: this.studentId || undefined },
          include: {
            family: true,
            enrollments: {
              include: { class: true, section: true, session: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });
      },
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      get school(): Promise<any> {
        if (!this.schoolId) return Promise.resolve(null);
        return getCachedSchoolInfo(this.schoolId).then(async (sch) => {
          if (!sch) return null;
          const branding = await getCachedSchoolBranding(this.schoolId!);
          return {
            ...sch,
            branding,
          };
        });
      },
    };

    return userWithGetters;
  });

  export type AppUser = Awaited<ReturnType<typeof getCurrentUser>>;

  export function isPrincipal(role: Role) {
    return role === "PRINCIPAL";
  }

