import { PrismaClient } from "@prisma/client";

async function testPasswords() {
  const candidates = ["postgres", "admin", "root", "123456", "Akshat@1909", "password", ""];
  for (const pwd of candidates) {
    const url = `postgresql://postgres:${encodeURIComponent(pwd)}@localhost:5432/postgres`;
    console.log(`Testing password: "${pwd}" ...`);
    const p = new PrismaClient({ datasources: { db: { url } } });
    try {
      await p.$connect();
      console.log(`\n🎉 SUCCESS! Local PostgreSQL password for user "postgres" is: "${pwd}"\n`);
      await p.$disconnect();
      return pwd;
    } catch (e: any) {
      console.log(`   Failed: ${e.message.split("\n")[0]}`);
      await p.$disconnect();
    }
  }
  console.log("None of the standard passwords worked.");
}

testPasswords();
