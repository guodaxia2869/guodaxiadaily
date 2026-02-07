const http = require('http');
const https = require('https');
const url = require('url');

const FIREBASE_PROJECT_ID = 'guodaxia-daily';
const FIREBASE_API_KEY = 'AIzaSyAMdiyfckokXEAQvtJXWnKt-hF0XVelVo0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function firestoreRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents${path}?key=${FIREBASE_API_KEY}`,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function fromFirestore(doc) {
  if (!doc || !doc.fields) return null;
  const result = { id: doc.name.split('/').pop() };
  for (const [key, value] of Object.entries(doc.fields)) {
    if (value.stringValue !== undefined) result[key] = value.stringValue;
    else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
    else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
    else if (value.timestampValue !== undefined) result[key] = new Date(value.timestampValue).getTime();
  }
  return result;
}

function toFirestore(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'id') continue;
    if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else if (typeof value === 'number') fields[key] = { integerValue: value.toString() };
  }
  return { fields };
}

function generateId() {
  return `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const query = parsedUrl.query;

  let body = '';
  req.on('data', chunk => body += chunk);
  await new Promise(resolve => req.on('end', resolve));
  
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch (e) { data = null; }

  try {
    if (path === '/api/schedules' && req.method === 'GET') {
      const userId = query.userId;
      if (!userId) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少 userId 参数' }));
        return;
      }
      const result = await firestoreRequest(`/users/${userId}/schedules`);
      const schedules = (result.documents || []).map(fromFirestore).filter(Boolean);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, data: schedules }));
      return;
    }

    if (path === '/api/schedules/by-date' && req.method === 'GET') {
      const userId = query.userId;
      const date = query.date;
      if (!userId || !date) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少 userId 或 date 参数' }));
        return;
      }
      const result = await firestoreRequest(`/users/${userId}/schedules`);
      const schedules = (result.documents || []).map(fromFirestore).filter(s => s && s.date === date);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, data: schedules }));
      return;
    }

    if (path === '/api/schedules' && req.method === 'POST') {
      const { userId, schedule } = data || {};
      if (!userId || !schedule) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少 userId 或 schedule 参数' }));
        return;
      }
      const newSchedule = { ...schedule, id: schedule.id || generateId(), createdAt: Date.now(), updatedAt: Date.now() };
      await firestoreRequest(`/users/${userId}/schedules/${newSchedule.id}`, 'PATCH', toFirestore(newSchedule));
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, data: newSchedule }));
      return;
    }

    if (path.match(/^\/api\/schedules\/[^/]+$/) && req.method === 'PUT') {
      const scheduleId = path.split('/').pop();
      const { userId, schedule } = data || {};
      if (!userId || !schedule) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少 userId 或 schedule 参数' }));
        return;
      }
      const updatedSchedule = { ...schedule, updatedAt: Date.now() };
      await firestoreRequest(`/users/${userId}/schedules/${scheduleId}`, 'PATCH', toFirestore(updatedSchedule));
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, data: updatedSchedule }));
      return;
    }

    if (path.match(/^\/api\/schedules\/[^/]+$/) && req.method === 'DELETE') {
      const scheduleId = path.split('/').pop();
      const userId = query.userId;
      if (!userId) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少 userId 参数' }));
        return;
      }
      await firestoreRequest(`/users/${userId}/schedules/${scheduleId}`, 'DELETE');
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, message: '删除成功' }));
      return;
    }

    if (path === '/api/health' && req.method === 'GET') {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, message: 'API 运行正常' }));
      return;
    }

    if (path === '/' && req.method === 'GET') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>📅 Schedule API</h1><p>API 运行正常</p><p><a href="/api/health">测试</a></p>');
      return;
    }

    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: '接口不存在' }));

  } catch (error) {
    console.error('API 错误:', error);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: '服务器内部错误', message: error.message }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Schedule API 运行在端口 ${PORT}`);
});
