import { appConfig } from "../../config/app-config";

export interface DatabaseProviderInfo {
  mode: "offline";
  url: string;
  isPooled: boolean;
  providerName: string;
}

export function getDatabaseConfig(): DatabaseProviderInfo {
  const url = appConfig.databaseUrl;
  return {
    mode: "offline",
    url,
    isPooled: false,
    providerName: "Local Portable SQLite",
  };
}

export function getDatabaseUrl(): string {
  return appConfig.databaseUrl;
}
