import { appConfig } from "../../config/app-config";

export interface ChangeLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  payload: Record<string, any>;
  timestamp: Date;
  synced: boolean;
}

export interface SyncManifest {
  lastSyncedAt: Date | null;
  pendingChangesCount: number;
  syncStatus: "idle" | "syncing" | "error" | "disabled";
  cloudEndpoint: string | null;
}

export interface ISyncProvider {
  getManifest(): Promise<SyncManifest>;
  recordChange(entry: Omit<ChangeLogEntry, "id" | "timestamp" | "synced">): Promise<void>;
  triggerSync(): Promise<{ success: boolean; syncedCount: number; message: string }>;
}

export class OfflineSyncArchitectureStub implements ISyncProvider {
  async getManifest(): Promise<SyncManifest> {
    return {
      lastSyncedAt: null,
      pendingChangesCount: 0,
      syncStatus: appConfig.isOffline ? "idle" : "disabled",
      cloudEndpoint: process.env.CLOUD_SYNC_ENDPOINT || null,
    };
  }

  async recordChange(entry: Omit<ChangeLogEntry, "id" | "timestamp" | "synced">): Promise<void> {
    if (appConfig.isOffline) {
      console.log(`[SyncArchitecture] Tracked change for future sync: ${entry.entityType} ${entry.operation} (${entry.entityId})`);
    }
  }

  async triggerSync(): Promise<{ success: boolean; syncedCount: number; message: string }> {
    if (appConfig.isCloud) {
      return {
        success: true,
        syncedCount: 0,
        message: "Application is running in Cloud Mode. Offline sync is not required.",
      };
    }

    return {
      success: true,
      syncedCount: 0,
      message: "Sync architecture initialized. Ready for future cloud sync plugin module.",
    };
  }
}

let syncProviderInstance: ISyncProvider | null = null;

export function getSyncProvider(): ISyncProvider {
  if (!syncProviderInstance) {
    syncProviderInstance = new OfflineSyncArchitectureStub();
  }
  return syncProviderInstance;
}
