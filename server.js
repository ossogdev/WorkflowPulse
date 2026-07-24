const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3200;
const HOST = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const storePath = path.join(__dirname, 'data', 'store.json');

function readStore() {
  if (!fs.existsSync(storePath)) return { users: [], baseUrls: [], workflows: [], logs: [] };
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

function writeStore(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const store = readStore();
  const user = store.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ ok: false, message: 'Invalid username or password' });
  }
  const { password: _, ...userWithoutPassword } = user;
  res.json({ ok: true, user: userWithoutPassword });
});

app.get('/api/base-urls', (req, res) => {
  const store = readStore();
  res.json({ ok: true, baseUrls: store.baseUrls || [] });
});

app.post('/api/base-urls', (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ ok: false, message: 'Name and URL are required' });
  const store = readStore();
  const newEntry = { id: 'b_' + Date.now(), name, url: url.replace(/\/$/, '') };
  store.baseUrls.push(newEntry);
  writeStore(store);
  res.json({ ok: true, baseUrls: store.baseUrls });
});

app.delete('/api/base-urls/:id', (req, res) => {
  const store = readStore();
  store.baseUrls = (store.baseUrls || []).filter(b => b.id !== req.params.id);
  writeStore(store);
  res.json({ ok: true, baseUrls: store.baseUrls });
});

app.get('/api/workflows', (req, res) => {
  const store = readStore();
  res.json({ ok: true, workflows: store.workflows || [] });
});

app.post('/api/workflows', (req, res) => {
  const { id, displayName, workflowId, companyId, baseUrl, isActive, fields } = req.body;
  if (!displayName || !workflowId || !baseUrl) {
    return res.status(400).json({ ok: false, message: 'Missing required workflow details' });
  }
  const store = readStore();
  if (id) {
    const idx = store.workflows.findIndex(w => w.id === id);
    if (idx !== -1) {
      store.workflows[idx] = { id, displayName, workflowId, companyId, baseUrl: baseUrl.replace(/\/$/, ''), isActive: isActive !== false, fields: fields || [] };
    }
  } else {
    store.workflows.push({
      id: 'wf_' + Date.now(),
      displayName,
      workflowId,
      companyId: companyId || '3a4fc4a1-30ae-4cfd-a352-b1d3039da6c4',
      baseUrl: baseUrl.replace(/\/$/, ''),
      isActive: true,
      fields: fields || []
    });
  }
  writeStore(store);
  res.json({ ok: true, workflows: store.workflows });
});

app.delete('/api/workflows/:id', (req, res) => {
  const store = readStore();
  store.workflows = store.workflows.filter(w => w.id !== req.params.id);
  writeStore(store);
  res.json({ ok: true, workflows: store.workflows });
});

app.post('/api/trigger/single', async (req, res) => {
  const { workflowId, payload, triggeredBy } = req.body;
  const store = readStore();
  const wf = store.workflows.find(w => w.id === workflowId || w.workflowId === workflowId);
  if (!wf) return res.status(404).json({ ok: false, message: 'Workflow not found' });

  const targetUrl = `${wf.baseUrl.replace(/\/$/, '')}/api/v1/workflows/trigger`;
  
  const bodyPayload = {
    company_id: wf.companyId,
    workflow: { workflow_id: wf.workflowId },
    user: {
      name: payload.name || payload.customerName || payload.voterName || 'Customer',
      mobile: payload.mobile || payload.phone || payload.Phone_No || ''
    },
    metadata: payload
  };

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });
    const result = await response.json();
    
    const logEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      workflowName: wf.displayName,
      workflowId: wf.workflowId,
      targetUrl,
      customerPhone: bodyPayload.user.mobile,
      customerName: bodyPayload.user.name,
      status: response.ok ? 'success' : 'failed',
      response: result,
      triggeredBy: triggeredBy || 'anonymous',
      timestamp: new Date().toISOString()
    };
    store.logs.unshift(logEntry);
    if (store.logs.length > 500) store.logs = store.logs.slice(0, 500);
    writeStore(store);

    res.json({ ok: true, result, log: logEntry });
  } catch (err) {
    const logEntry = {
      id: 'log_' + Date.now(),
      workflowName: wf.displayName,
      workflowId: wf.workflowId,
      targetUrl,
      customerPhone: bodyPayload.user.mobile,
      customerName: bodyPayload.user.name,
      status: 'error',
      response: { error: err.message },
      triggeredBy: triggeredBy || 'anonymous',
      timestamp: new Date().toISOString()
    };
    store.logs.unshift(logEntry);
    writeStore(store);
    res.status(500).json({ ok: false, message: err.message, log: logEntry });
  }
});

app.post('/api/trigger/batch', async (req, res) => {
  const { workflowId, items, triggeredBy } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: 'No items provided for batch trigger' });
  }
  const store = readStore();
  const wf = store.workflows.find(w => w.id === workflowId || w.workflowId === workflowId);
  if (!wf) return res.status(404).json({ ok: false, message: 'Workflow not found' });

  const targetUrl = `${wf.baseUrl.replace(/\/$/, '')}/api/v1/workflows/trigger`;
  const results = [];

  for (const item of items) {
    const bodyPayload = {
      company_id: wf.companyId,
      workflow: { workflow_id: wf.workflowId },
      user: {
        name: item.name || item.customerName || item.voterName || item.Full_Name || 'Customer',
        mobile: item.mobile || item.phone || item.Phone_No || item.contact || ''
      },
      metadata: item
    };

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const resData = await response.json();
      results.push({ phone: bodyPayload.user.mobile, status: 'success', data: resData });
    } catch (err) {
      results.push({ phone: bodyPayload.user.mobile, status: 'error', error: err.message });
    }
  }

  const logEntry = {
    id: 'batch_' + Date.now(),
    workflowName: wf.displayName,
    workflowId: wf.workflowId,
    targetUrl,
    totalCount: items.length,
    successCount: results.filter(r => r.status === 'success').length,
    status: 'batch_completed',
    triggeredBy: triggeredBy || 'anonymous',
    timestamp: new Date().toISOString()
  };
  store.logs.unshift(logEntry);
  writeStore(store);

  res.json({ ok: true, total: items.length, results, log: logEntry });
});

app.get('/api/logs', (req, res) => {
  const store = readStore();
  res.json({ ok: true, logs: store.logs || [] });
});

app.listen(PORT, HOST, () => {
  console.log(`WorkflowPulse listening on http://${HOST}:${PORT} (independent product — not under workflow.conversely.in)`);
});
