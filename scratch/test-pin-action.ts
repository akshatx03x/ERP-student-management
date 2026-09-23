import { signInWithPinAction } from "@/server/actions/pin-auth.actions";

async function test() {
  process.env.DATABASE_URL = "file:./desktop/data/school.db";
  try {
    const res = await signInWithPinAction({ username: "Principal", pin: "0396" });
    console.log("signInWithPinAction result:", res);
  } catch (e: any) {
    console.error("signInWithPinAction error:", e);
  }
}

test();
