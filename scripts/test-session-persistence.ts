import http from "http";

async function testSessionPersistence() {
  console.log("=================================================");
  console.log(" Testing Session Persistence Across App Restart  ");
  console.log("=================================================");

  const sessionToken = "gAAULX8memqiy5D9L14BR94ZbgdmZeEs";
  const cookieHeader = `better-auth.session_token=${sessionToken}.8JdF7ttVExRwzuiHhC4HveAg4%2B5dX9NsWCzTDQbkupc%3D`;

  return new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 3000,
        path: "/api/auth/get-session",
        method: "GET",
        headers: {
          Cookie: cookieHeader,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          console.log(`[GET /api/auth/get-session after restart] Status: ${res.statusCode}`);
          console.log(`[GET /api/auth/get-session after restart] Body: ${body}`);
          resolve();
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

testSessionPersistence();
