const http = require('http');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function get(url, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'GET',
      headers: {
        'Cookie': cookie
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    console.log("Signing in...");
    const loginRes = await post('http://127.0.0.1:3000/api/auth/sign-in/email', {
      email: 'teacher@vidyanjali.edu.in',
      password: 'vidyanjalierp@890'
    });

    console.log("Login Status:", loginRes.statusCode);
    const cookies = loginRes.headers['set-cookie'];
    if (!cookies) {
      console.log("No cookies received. Response:", loginRes.body);
      return;
    }

    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
    console.log("Cookies:", cookieStr);

    console.log("\nRequesting /attendance...");
    const attendanceRes = await get('http://127.0.0.1:3000/attendance', cookieStr);
    console.log("Attendance Status:", attendanceRes.statusCode);
    console.log("Attendance Body length:", attendanceRes.body.length);
    console.log("Attendance Body start:", attendanceRes.body.slice(0, 200));

    console.log("\nRequesting /students/tc...");
    const tcRes = await get('http://127.0.0.1:3000/students/tc', cookieStr);
    console.log("TC Status:", tcRes.statusCode);
    console.log("TC Body length:", tcRes.body.length);
    console.log("TC Body start:", tcRes.body.slice(0, 200));

    console.log("\nRequesting /dashboard...");
    const dashboardRes = await get('http://127.0.0.1:3000/dashboard', cookieStr);
    console.log("Dashboard Status:", dashboardRes.statusCode);
    console.log("Dashboard Body length:", dashboardRes.body.length);
    console.log("Dashboard Body start:", dashboardRes.body.slice(0, 200));

  } catch (err) {
    console.error("Error running script:", err);
  }
}

run();
