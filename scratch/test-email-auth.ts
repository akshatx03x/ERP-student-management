import { auth } from "@/server/auth/auth";

async function test() {
  process.env.DATABASE_URL = "file:./desktop/data/school.db";
  try {
    const res = await auth.api.signInEmail({
      body: {
        email: "principal@vidyanjali.edu.in",
        password: "vidyanjalierp@890",
      },
      asResponse: false,
    });
    console.log("Email signin result:", res);
  } catch (e: any) {
    console.error("Email signin error:", e);
  }
}

test();
