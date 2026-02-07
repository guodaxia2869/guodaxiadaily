const http = require('http');
const https = require('https');
const url = require('url');

const FIREBASE_PROJECT_ID = 'guodaxia-daily';
const FIREBASE_API_KEY = 'AIzaSyAMdiyfckokXEAQvtJXWnKt-hF0XVelVo0';

const GROUPS = {
  'family': '123456',
  'work': 'work123'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

function firestoreRequest(path, method, data) {
  return new Promise(function(resolve, reject) {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: '/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents' + path + '?key=' + FIREBASE_API_KEY,
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(options, function(res) {
      let body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
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
  for (const key in doc.fields) {
    const value = doc.fields[key];
    if (value.stringValue !== undefined) result[key] = value.stringValue;
    else if (value.booleanValue !== undefined) result[key] = value.booleanValue;
    else if (value.integerValue !== undefined) result[key] = parseInt(value.integerValue);
    else if (value.timestampValue !== undefined) result[key] = new Date(value.timestampValue).getTime();
  }
  return result;
}

function toFirestore(obj) {
  const fields = {};
  for (const key in obj) {
    if (key === 'id') continue;
    const value = obj[key];
    if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else if (typeof value === 'number') fields[key] = { integerValue: value.toString() };
  }
  return { fields: fields };
}

function generateId() {
  return 'schedule-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function getGroupUserId(groupId) {
  return 'group-' + groupId;
}

function filterSchedules(schedules, date) {
  const result = [];
  for (let i = 0; i < schedules.length; i++) {
    if (schedules[i] && schedules[i].date === date) {
      result.push(schedules[i]);
    }
  }
  return result;
}

const server = http.createServer(function(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const query = parsedUrl.query;

  let body = '';
  req.on('data', function(chunk) { body += chunk; });
  req.on('end', function() {
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch (e) { data = null; }

    // GET /api/schedules
    if (path === '/api/schedules' && req.method === 'GET') {
      const groupId = query.groupId;
      const password = query.password;
      
      if (!groupId || !password) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少 groupId 或 password' }));
        return;
      }

      if (GROUPS[groupId] !== password) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: '密码错误' }));
        return;
      }

      const userId = getGroupUserId(groupId);
      firestoreRequest('/users/' + userId + '/schedules', 'GET', null).then(function(result) {
        const docs = result.documents || [];
        const schedules = [];
        for (let i = 0; i < docs.length; i++) {
          const s = fromFirestore(docs[i]);
          if (s) schedules.push(s);
        }
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true, data: schedules }));
      }).catch(function(err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: '数据库错误', message: err.message }));
      });
      return;
    }

    // GET /api/schedules/by-date
    if (path === '/api/schedules/by-date' && req.method === 'GET') {
      const groupId = query.groupId;
      const password = query.password;
      const date = query.date;
      
      if (!groupId || !password || !date) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少参数' }));
        return;
      }

      if (GROUPS[groupId] !== password) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: '密码错误' }));
        return;
      }

      const userId = getGroupUserId(groupId);
      firestoreRequest('/users/' + userId + '/schedules', 'GET', null).then(function(result) {
        const docs = result.documents || [];
        const allSchedules = [];
        for (let i = 0; i < docs.length; i++) {
          const s = fromFirestore(docs[i]);
          if (s) allSchedules.push(s);
        }
        const schedules = filterSchedules(allSchedules, date);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true, data: schedules }));
      }).catch(function(err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: '数据库错误', message: err.message }));
      });
      return;
    }

    // POST /api/schedules
    if (path === '/api/schedules' && req.method === 'POST') {
      const groupId = data ? data.groupId : null;
      const password = data ? data.password : null;
      const schedule = data ? data.schedule : null;
      
      if (!groupId || !password || !schedule) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少参数' }));
        return;
      }

      if (GROUPS[groupId] !== password) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: '密码错误' }));
        return;
      }

      const userId = getGroupUserId(groupId);
      const newSchedule = {
        title: schedule.title || '',
        date: schedule.date || '',
        startTime: schedule.startTime || '',
        endTime: schedule.endTime || '',
        category: schedule.category || 'personal',
        description: schedule.description || '',
        reminder: schedule.reminder || false,
        id: schedule.id || generateId(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      firestoreRequest('/users/' + userId + '/schedules/' + newSchedule.id, 'PATCH', toFirestore(newSchedule)).then(function() {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true, data: newSchedule }));
      }).catch(function(err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: '保存失败', message: err.message }));
      });
      return;
    }

    // PUT /api/schedules/:id
    const putMatch = path.match(/^\/api\/schedules\/([^/]+)$/);
    if (putMatch && req.method === 'PUT') {
      const scheduleId = putMatch[1];
      const groupId = data ? data.groupId : null;
      const password = data ? data.password : null;
      const schedule = data ? data.schedule : null;
      
      if (!groupId || !password || !schedule) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少参数' }));
        return;
      }

      if (GROUPS[groupId] !== password) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: '密码错误' }));
        return;
      }

      const userId = getGroupUserId(groupId);
      const updatedSchedule = {
        title: schedule.title || '',
        date: schedule.date || '',
        startTime: schedule.startTime || '',
        endTime: schedule.endTime || '',
        category: schedule.category || 'personal',
        description: schedule.description || '',
        reminder: schedule.reminder || false,
        id: scheduleId,
        createdAt: schedule.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      firestoreRequest('/users/' + userId + '/schedules/' + scheduleId, 'PATCH', toFirestore(updatedSchedule)).then(function() {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true, data: updatedSchedule }));
      }).catch(function(err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: '更新失败', message: err.message }));
      });
      return;
    }

    // DELETE /api/schedules/:id
    const deleteMatch = path.match(/^\/api\/schedules\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const scheduleId = deleteMatch[1];
      const groupId = query.groupId;
      const password = query.password;
      
      if (!groupId || !password) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: '缺少参数' }));
        return;
      }

      if (GROUPS[groupId] !== password) {
        res.writeHead(401, corsHeaders);
        res.end(JSON.stringify({ error: '密码错误' }));
        return;
      }

      const userId = getGroupUserId(groupId);
      firestoreRequest('/users/' + userId + '/schedules/' + scheduleId, 'DELETE', null).then(function() {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true, message: '删除成功' }));
      }).catch(function(err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: '删除失败', message: err.message }));
      });
      return;
    }

    // GET /api/health
    if (path === '/api/health' && req.method === 'GET') {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ success: true, message: 'API 运行正常' }));
      return;
    }

    // GET /
    if (path === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Schedule API</h1><p>API running</p>');
      return;
    }

    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
