import { appConfig } from "../../config/app-config";

export interface DatabaseProviderInfo {
  mode: "cloud" | "offline";
  url: string;
  isPooled: boolean;
  providerName: string;
}

export function getDatabaseConfig(): DatabaseProviderInfo {
  const url = appConfig.databaseUrl;
  const isPooled = url.includes("pgbouncer=true") || url.includes("pooler");
  const providerName = appConfig.isOffline ? "Local PostgreSQL" : "Supabase PostgreSQL";

  return {
    mode: appConfig.appMode,
    url,
    isPooled,
    providerName,
  };
}

export function getDatabaseUrl(): string {
  return appConfig.databaseUrl;
}
