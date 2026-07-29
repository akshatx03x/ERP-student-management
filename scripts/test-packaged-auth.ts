import http from "http";

async function makeRequest(options: http.RequestOptions, postData?: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, headers: res.headers, body });
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function testAuth() {
  console.log("=========================================");
  console.log(" Testing Packaged Server Auth Endpoints  ");
  console.log("=========================================");

  // 1. Health check
  try {
    const health = await makeRequest({
      hostname: "127.0.0.1",
      port: 3000,
      path: "/api/health",
      method: "GET",
    });
    console.log(`[Health Check] Status: ${health.status}, Body: ${health.body}`);
  } catch (err: any) {
    console.error("[Health Check Failed]:", err.message);
    return;
  }

  // 2. Test GET session before sign-in
  try {
    const sessionRes = await makeRequest({
      hostname: "127.0.0.1",
      port: 3000,
      path: "/api/auth/get-session",
      method: "GET",
    });
    console.log(`[GET Session before login] Status: ${sessionRes.status}, Body: ${sessionRes.body}`);
  } catch (err: any) {
    console.error("[GET Session Failed]:", err.message);
  }

  // 3. Test POST /api/auth/sign-in/email
  const payload = JSON.stringify({
    email: "principal@vidhyanjali.edu",
    password: "Principal@123",
  });

  try {
    const loginRes = await makeRequest(
      {
        hostname: "127.0.0.1",
        port: 3000,
        path: "/api/auth/sign-in/email",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      payload
    );

    console.log(`[POST sign-in/email] Status: ${loginRes.status}`);
    console.log(`[POST sign-in/email] Headers:`, loginRes.headers);
    console.log(`[POST sign-in/email] Body: ${loginRes.body}`);

    const cookies = loginRes.headers["set-cookie"];
    if (cookies) {
      console.log(`[POST sign-in/email] Received Set-Cookie:`, cookies);

      // 4. Test GET session WITH cookie after sign-in
      const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
      const authenticatedSessionRes = await makeRequest({
        hostname: "127.0.0.1",
        port: 3000,
        path: "/api/auth/get-session",
        method: "GET",
        headers: {
          Cookie: cookieHeader,
        },
      });
      console.log(`[GET Session WITH cookie] Status: ${authenticatedSessionRes.status}`);
      console.log(`[GET Session WITH cookie] Body: ${authenticatedSessionRes.body}`);
    }
  } catch (err: any) {
    console.error("[POST sign-in Failed]:", err.message);
  }
}

testAuth();
