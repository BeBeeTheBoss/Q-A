const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const PORT = Number(process.env.PORT) || 2233;
// Change this value to set the password for /report.
const ADMIN_PASSWORD = 'sdteam2026';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const INDEX_FILE = path.join(ROOT, 'index.html');
const REPORT_FILE = path.join(ROOT, 'report.html');
const activeSessions = new Set();

async function readResponses() {
  try {
    const value = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeResponses(responses) {
  const temporaryFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(responses, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, DATA_FILE);
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function getCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').map((item) => {
    const [key, ...value] = item.trim().split('=');
    return [key, decodeURIComponent(value.join('='))];
  }).filter(([key]) => key));
}

function isAdmin(request) {
  return activeSessions.has(getCookies(request).sd_report_session);
}

function requireAdmin(request, response) {
  if (isAdmin(request)) return true;
  sendJson(response, 401, { error: 'Authentication required.' });
  return false;
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function createRecord(input) {
  const rating = (field) => {
    const value = Number.parseInt(input[field], 10);
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
  };
  const text = (field) => typeof input[field] === 'string' && input[field].trim() ? input[field].trim() : '-';

  return {
    id: `RESP-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
    timestamp: formatTimestamp(),
    q1: rating('q1'), q2: rating('q2'), q3: rating('q3'), q4: rating('q4'),
    q6: text('q6'), q7: rating('q7'), q8: text('q8'), q9: text('q9'),
    q14: text('q14'), q18: text('q18'), q20: text('q20')
  };
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      const { password } = await readBody(request);
      if (password !== ADMIN_PASSWORD) return sendJson(response, 401, { error: 'Incorrect password.' });
      const sessionId = randomUUID();
      activeSessions.add(sessionId);
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `sd_report_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`
      });
      return response.end(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/api/admin/session' && request.method === 'GET') {
      return sendJson(response, 200, { authenticated: isAdmin(request) });
    }

    if (url.pathname === '/api/responses' && request.method === 'GET') {
      if (!requireAdmin(request, response)) return;
      return sendJson(response, 200, await readResponses());
    }

    if (url.pathname === '/api/responses' && request.method === 'POST') {
      const input = await readBody(request);
      const record = createRecord(input);
      if (!record.q1 || !record.q2 || !record.q3 || !record.q4 || !record.q7 || record.q6 === '-' || record.q8 === '-' || record.q14 === '-') {
        return sendJson(response, 400, { error: 'Please complete all required survey fields.' });
      }
      const responses = await readResponses();
      responses.push(record);
      await writeResponses(responses);
      return sendJson(response, 201, record);
    }

    if (url.pathname === '/api/responses' && request.method === 'DELETE') {
      if (!requireAdmin(request, response)) return;
      await writeResponses([]);
      return sendJson(response, 200, { success: true });
    }

    if (url.pathname === '/report' && request.method === 'GET') {
      const html = await fs.readFile(REPORT_FILE);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(html);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      const html = await fs.readFile(INDEX_FILE);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(html);
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    sendJson(response, error instanceof SyntaxError ? 400 : 500, { error: 'Server error. Please try again.' });
  }
});

function getNetworkUrls() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === 'IPv4' && !network.internal)
    .map((network) => `http://${network.address}:${PORT}`);
  return addresses.length ? addresses : [`http://localhost:${PORT}`];
}

// 0.0.0.0 accepts connections from this computer and devices on the same network.
server.listen(PORT, '0.0.0.0', () => {
  console.log('Survey app is running at:');
  console.log(`  Local:   http://localhost:${PORT}`);
  getNetworkUrls().forEach((url) => console.log(`  Network: ${url}`));
});
