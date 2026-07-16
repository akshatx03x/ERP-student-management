import { NextResponse } from "next/server";
import { getDocument, getDocumentBlob } from "@/server/services/document.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const [doc, blob] = await Promise.all([getDocument(id), getDocumentBlob(id)]);
    const body = Buffer.from(blob.data);
    return new NextResponse(body, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.fileName}"`,
        "Content-Length": String(doc.sizeBytes),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Not found" },
      { status: 404 },
    );
  }
}
