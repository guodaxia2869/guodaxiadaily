const http = require('http');
const https = require('https');
const url = require('url');

const FIREBASE_PROJECT_ID = 'guodaxia-daily';
const FIREBASE_API_KEY = 'AIzaSyAMdiyfckokXEAQvtJXWnKt-hF0XVelVo0';

// 共享组配置
const GROUPS = {
  'family': { password: '123456', name: '家庭组' },
  'work': { password: 'work123', name: '工作组' }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
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

function verifyPassword(groupId, password) {
  const group = GROUPS[groupId];
  if (!group) return false;
  return group.password === password;
}

function getGroupUserId(groupId) {
  return `group-${groupId}`;
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
    if (path === '/api/groups' && req.method === 'GET') {
      const groupList = Object.entries(GROUPS).map(([id, info]) => ({ id, name: info.name }));
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, data: groupList }));
      return;
    }

    if (path === '/api/schedules' && req.method === 'GET') {
      const groupId = query.groupId;
      const password = query.password;
      
      if (!groupId || !password) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少 groupId 或 password 参数' }));
        return;
      }

      if (!verifyPassword(groupId, password)) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: '密码错误' }));
        return;
      }

      const userId = getGroupUserId(groupId);
      const result = await firestoreRequest(`/users/${userId}/schedules`);
      const schedules = (result.documents || []).map(fromFirestore).filter(Boolean);
      
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, data: schedules }));
      return;
    }

    if (path === '/api/schedules/by-date' && req.method === 'GET') {
      const groupId = query.groupId;
      const password = query.password;
      const date = query.date;
      
      if (!groupId || !password || !date) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少参数' }));
        return;
      }

      if (!verifyPassword(groupId, password)) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: '密码错误' }));
        return;
      }

      const userId = getGroupUserId(groupId);
      const result = await firestoreRequest(`/users/${userId}/schedules`);
      const schedules
