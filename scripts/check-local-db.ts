import { Client } from "pg";

async function checkLocalDb() {
  const localUrl = process.env.DATABASE_URL_LOCAL || "postgresql://postgres:Akshat%401909@localhost:5432/postgres";
  console.log("[DB Check] Testing connection to:", localUrl);

  const client = new Client({ connectionString: localUrl });
  try {
    await client.connect();
    console.log("[DB Check] ✅ Connected successfully to local PostgreSQL server!");

    const res = await client.query("SELECT datname FROM pg_database WHERE datname = 'school_erp_offline'");
    if (res.rows.length === 0) {
      console.log("[DB Check] Database 'school_erp_offline' does not exist. Creating database...");
      await client.query("CREATE DATABASE school_erp_offline");
      console.log("[DB Check] ✅ Database 'school_erp_offline' created successfully!");
    } else {
      console.log("[DB Check] ✅ Database 'school_erp_offline' exists.");
    }
    await client.end();
  } catch (err: any) {
    console.error("[DB Check] ❌ Failed to connect to local PostgreSQL:", err.message);
  }
}

checkLocalDb();
