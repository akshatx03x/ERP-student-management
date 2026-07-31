import fs from "fs";
import path from "path";
import { appConfig } from "../../config/app-config";
import { prisma } from "../lib/prisma";

export interface SaveUploadParams {
  documentId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface UploadRetrievalResult {
  data: Buffer;
  source: "database" | "filesystem";
}

export interface IUploadProvider {
  name: "database" | "filesystem";
  saveUpload(params: SaveUploadParams): Promise<void>;
  getUpload(documentId: string): Promise<UploadRetrievalResult>;
  deleteUpload(documentId: string): Promise<void>;
}

export class DatabaseUploadProvider implements IUploadProvider {
  readonly name = "database";

  async saveUpload(params: SaveUploadParams): Promise<void> {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const bytes: any = params.buffer;
    await prisma.documentBlob.upsert({
      where: { documentId: params.documentId },
      create: {
        documentId: params.documentId,
        data: bytes,
      },
      update: {
        data: bytes,
      },
    });
  }

  async getUpload(documentId: string): Promise<UploadRetrievalResult> {
    const blob = await prisma.documentBlob.findUnique({
      where: { documentId },
    });
    if (!blob) {
      throw new Error(`Document blob not found in database for documentId: ${documentId}`);
    }
    return {
      data: Buffer.from(blob.data),
      source: "database",
    };
  }

  async deleteUpload(documentId: string): Promise<void> {
    await prisma.documentBlob.deleteMany({
      where: { documentId },
    });
  }
}

export class LocalFileSystemUploadProvider implements IUploadProvider {
  readonly name = "filesystem";
  private uploadsDir: string;

  constructor(uploadsDir?: string) {
    this.uploadsDir = uploadsDir || appConfig.offlinePaths.uploadsDir;
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private getFilePath(documentId: string): string {
    return path.join(this.uploadsDir, `${documentId}.bin`);
  }

  async saveUpload(params: SaveUploadParams): Promise<void> {
    const filePath = this.getFilePath(params.documentId);
    await fs.promises.writeFile(filePath, params.buffer);
    
    // Also save in DocumentBlob for backup consistency if database is accessible
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const bytes: any = params.buffer;
      await prisma.documentBlob.upsert({
        where: { documentId: params.documentId },
        create: {
          documentId: params.documentId,
          data: bytes,
        },
        update: {
          data: bytes,
        },
      });
    } catch (err) {
      console.warn(`[LocalUploadProvider] Could not sync blob to database:`, err);
    }
  }

  async getUpload(documentId: string): Promise<UploadRetrievalResult> {
    const filePath = this.getFilePath(documentId);
    if (fs.existsSync(filePath)) {
      const data = await fs.promises.readFile(filePath);
      return { data, source: "filesystem" };
    }

    // Fallback to database blob if local file missing
    const blob = await prisma.documentBlob.findUnique({
      where: { documentId },
    });
    if (blob) {
      return { data: Buffer.from(blob.data), source: "database" };
    }

    throw new Error(`Document upload file not found locally or in database for: ${documentId}`);
  }

  async deleteUpload(documentId: string): Promise<void> {
    const filePath = this.getFilePath(documentId);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    await prisma.documentBlob.deleteMany({
      where: { documentId },
    });
  }
}

let uploadProviderInstance: IUploadProvider | null = null;

export function getUploadProvider(): IUploadProvider {
  if (!uploadProviderInstance) {
    if (appConfig.uploadProvider === "filesystem") {
      uploadProviderInstance = new LocalFileSystemUploadProvider();
    } else {
      uploadProviderInstance = new DatabaseUploadProvider();
    }
  }
  return uploadProviderInstance;
}
