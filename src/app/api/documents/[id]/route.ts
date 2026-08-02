import { NextResponse } from "next/server";
import { getDocument } from "@/server/services/document.service";
import { getUploadProvider } from "@/server/providers/upload.provider";
 
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    // getDocument runs auth + ownership check once.
    const doc = await getDocument(id);
    const uploadProvider = getUploadProvider();
    const { data } = await uploadProvider.getUpload(id);

    return new NextResponse(new Uint8Array(data), {
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

