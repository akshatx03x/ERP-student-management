import fs from "fs";
import path from "path";
import { appConfig } from "../../config/app-config";

export interface StoredFileRef {
  key: string;
  location: string;
  sizeBytes: number;
  mimeType?: string;
  createdAt: Date;
}

export interface IStorageProvider {
  saveFile(key: string, data: Buffer, mimeType?: string): Promise<StoredFileRef>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<boolean>;
  fileExists(key: string): Promise<boolean>;
}

export class LocalFileSystemStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || appConfig.offlinePaths.storageDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolvePath(key: string): string {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.baseDir, sanitizedKey);
  }

  async saveFile(key: string, data: Buffer, mimeType?: string): Promise<StoredFileRef> {
    const filePath = this.resolvePath(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(filePath, data);
    return {
      key,
      location: filePath,
      sizeBytes: data.byteLength,
      mimeType,
      createdAt: new Date(),
    };
  }

  async getFile(key: string): Promise<Buffer> {
    const filePath = this.resolvePath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    return fs.promises.readFile(filePath);
  }

  async deleteFile(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }

  async fileExists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    return fs.existsSync(filePath);
  }
}

export class DatabaseMemoryStorageProvider implements IStorageProvider {
  private inMemoryStore = new Map<string, Buffer>();

  async saveFile(key: string, data: Buffer, mimeType?: string): Promise<StoredFileRef> {
    this.inMemoryStore.set(key, data);
    return {
      key,
      location: `memory://${key}`,
      sizeBytes: data.byteLength,
      mimeType,
      createdAt: new Date(),
    };
  }

  async getFile(key: string): Promise<Buffer> {
    const file = this.inMemoryStore.get(key);
    if (!file) {
      throw new Error(`Memory file not found: ${key}`);
    }
    return file;
  }

  async deleteFile(key: string): Promise<boolean> {
    return this.inMemoryStore.delete(key);
  }

  async fileExists(key: string): Promise<boolean> {
    return this.inMemoryStore.has(key);
  }
}

let storageProviderInstance: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (!storageProviderInstance) {
    if (appConfig.storageProvider === "filesystem") {
      storageProviderInstance = new LocalFileSystemStorageProvider();
    } else {
      storageProviderInstance = new DatabaseMemoryStorageProvider();
    }
  }
  return storageProviderInstance;
}
