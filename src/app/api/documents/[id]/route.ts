import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/prisma";
import { getDocument } from "@/server/services/document.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    // getDocument runs auth + ownership check once.
    // Then we fetch the blob directly — avoids the double-call that previously
    // occurred when the route called getDocument() AND getDocumentBlob()
    // (getDocumentBlob internally called getDocument a second time).
    const [doc, blob] = await Promise.all([
      getDocument(id),
      prisma.documentBlob.findUnique({ where: { documentId: id } }),
    ]);
    if (!blob) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 });
    }
    const body = Buffer.from(blob.data);
    return new NextResponse(body, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.fileName}"`,
        "Content-Length": String(doc.sizeBytes),
        // Documents are immutable once uploaded — cache indefinitely in browser & CDN
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Not found" },
      { status: 404 },
    );
  }
}

