let currentUser = null;
let workflows = [];
let baseUrls = [];
let selectedWorkflow = null;
let csvData = [];
let selectedRowIndices = new Set();
let allLogs = [];
let currentLogFilter = 'all';
let pendingTriggerAction = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  const savedUser = localStorage.getItem('wp_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showAppLayout();
  } else {
    showLoginLayout();
  }
  setupEventListeners();
}

function setupEventListeners() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = e.currentTarget.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  document.getElementById('workflowSelect').addEventListener('change', (e) => {
    const wfId = e.target.value;
    selectedWorkflow = workflows.find(w => w.id === wfId);
    renderWorkflowForm();
    updateEnvBadge();
  });

  document.getElementById('modeSingleBtn').addEventListener('click', () => {
    document.getElementById('modeSingleBtn').classList.add('active');
    document.getElementById('modeBatchBtn').classList.remove('active');
    document.getElementById('singleCallSection').classList.remove('hidden');
    document.getElementById('batchCallSection').classList.add('hidden');
  });

  document.getElementById('modeBatchBtn').addEventListener('click', () => {
    document.getElementById('modeBatchBtn').classList.add('active');
    document.getElementById('modeSingleBtn').classList.remove('active');
    document.getElementById('batchCallSection').classList.remove('hidden');
    document.getElementById('singleCallSection').classList.add('hidden');
  });

  document.getElementById('dynamicSingleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    attemptSingleCall();
  });

  document.getElementById('triggerSingleBtn').addEventListener('click', () => {
    attemptSingleCall();
  });

  const dropzone = document.getElementById('csvDropzone');
  const fileInput = document.getElementById('csvFileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--saffron)';
    dropzone.style.background = 'var(--saffron-soft)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--line-2)';
    dropzone.style.background = 'var(--surface-2)';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--line-2)';
    dropzone.style.background = 'var(--surface-2)';
    if (e.dataTransfer.files.length > 0) {
      handleCsvFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleCsvFile(e.target.files[0]);
    }
  });

  document.getElementById('selectAllBtn').addEventListener('click', toggleSelectAll);
  document.getElementById('triggerSelectedBtn').addEventListener('click', () => attemptBatchCall('selected'));
  document.getElementById('triggerFullBatchBtn').addEventListener('click', () => attemptBatchCall('full'));
  document.getElementById('refreshLogsBtn').addEventListener('click', loadLogs);

  document.getElementById('addWorkflowBtn').addEventListener('click', () => openWorkflowModal());
  document.getElementById('closeWfModalBtn').addEventListener('click', closeWorkflowModal);
  document.getElementById('cancelWfModalBtn').addEventListener('click', closeWorkflowModal);
  document.getElementById('workflowForm').addEventListener('submit', handleSaveWorkflow);

  document.getElementById('addBaseUrlBtn').addEventListener('click', openBaseUrlModal);
  document.getElementById('closeBaseUrlModalBtn').addEventListener('click', closeBaseUrlModalBtn);
  document.getElementById('cancelBaseUrlModalBtn').addEventListener('click', closeBaseUrlModalBtn);
  document.getElementById('baseUrlForm').addEventListener('submit', handleAddBaseUrl);

  // Production Caution Modal Handlers
  document.getElementById('closeProdModalBtn').addEventListener('click', closeProdModal);
  document.getElementById('cancelProdModalBtn').addEventListener('click', closeProdModal);
  document.getElementById('confirmProdModalBtn').addEventListener('click', () => {
    closeProdModal();
    if (pendingTriggerAction) {
      pendingTriggerAction();
      pendingTriggerAction = null;
    }
  });

  // Payload Viewer Modal Handlers
  document.getElementById('closePayloadModalBtn').addEventListener('click', closePayloadModal);
  document.getElementById('closePayloadBtn').addEventListener('click', closePayloadModal);

  // Log Search and Filter Handlers
  document.getElementById('logSearchInput').addEventListener('input', filterAndRenderLogs);
  document.querySelectorAll('#logFilterPills .filter-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#logFilterPills .filter-pill').forEach(p => p.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentLogFilter = e.currentTarget.getAttribute('data-filter');
      filterAndRenderLogs();
    });
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value;
  const p = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (data.ok) {
      currentUser = data.user;
      localStorage.setItem('wp_user', JSON.stringify(currentUser));
      showAppLayout();
    } else {
      showError(data.message || 'Invalid username or password');
    }
  } catch (err) {
    showError(err.message);
  }
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('wp_user');
  showLoginLayout();
}

function showLoginLayout() {
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('appSection').classList.add('hidden');
}

async function showAppLayout() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');

  document.getElementById('userName').textContent = currentUser.name || currentUser.username;
  document.getElementById('userRole').textContent = currentUser.role;
  document.getElementById('userAvatar').textContent = (currentUser.name || currentUser.username)[0].toUpperCase();

  if (currentUser.role === 'admin') {
    document.getElementById('adminNavBtn').classList.remove('hidden');
  } else {
    document.getElementById('adminNavBtn').classList.add('hidden');
  }

  await loadBaseUrls();
  await loadWorkflows();
  await loadLogs();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-page').forEach(page => page.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

  document.getElementById(tabId).classList.remove('hidden');
  const navBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (tabId === 'historyTab') loadLogs();
}

async function loadBaseUrls() {
  try {
    const res = await fetch('/api/base-urls');
    const data = await res.json();
    if (data.ok) {
      baseUrls = data.baseUrls || [];
      renderAdminBaseUrls();
      populateModalBaseUrlDropdown();
    }
  } catch (err) {
    console.error('Failed to load base URLs:', err);
  }
}

async function loadWorkflows() {
  try {
    const res = await fetch('/api/workflows');
    const data = await res.json();
    if (data.ok) {
      workflows = data.workflows || [];
      renderWorkflowSelect();
      renderAdminWorkflows();
    }
  } catch (err) {
    console.error('Failed to load workflows:', err);
  }
}

function renderWorkflowSelect() {
  const select = document.getElementById('workflowSelect');
  select.innerHTML = '';
  workflows.forEach(wf => {
    const opt = document.createElement('option');
    opt.value = wf.id;
    opt.textContent = wf.displayName;
    select.appendChild(opt);
  });
  if (workflows.length > 0) {
    selectedWorkflow = workflows[0];
    renderWorkflowForm();
    updateEnvBadge();
  }
}

function updateEnvBadge() {
  const envBadge = document.getElementById('envBadge');
  const badgeText = document.getElementById('envBadgeText');
  const prodBanner = document.getElementById('prodWarningBanner');

  if (selectedWorkflow) {
    const isProd = selectedWorkflow.baseUrl.includes('production.conversely.in');
    badgeText.textContent = selectedWorkflow.baseUrl;
    
    if (isProd) {
      envBadge.classList.add('prod-env');
      if (prodBanner) prodBanner.classList.remove('hidden');
    } else {
      envBadge.classList.remove('prod-env');
      if (prodBanner) prodBanner.classList.add('hidden');
    }
  } else {
    badgeText.textContent = 'No Workflow Selected';
    envBadge.classList.remove('prod-env');
    if (prodBanner) prodBanner.classList.add('hidden');
  }
}

function renderWorkflowForm() {
  const form = document.getElementById('dynamicSingleForm');
  form.innerHTML = '';
  if (!selectedWorkflow || !selectedWorkflow.fields) return;

  selectedWorkflow.fields.forEach(f => {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-group';
    fieldDiv.innerHTML = `
      <label for="field_${f.key}">${f.label} ${f.required ? '<span style="color:var(--bad)">*</span>' : ''}</label>
      <input type="${f.type === 'phone' ? 'tel' : 'text'}" id="field_${f.key}" name="${f.key}" placeholder="Enter ${f.label}" ${f.required ? 'required' : ''}>
    `;
    form.appendChild(fieldDiv);
  });
}

function attemptSingleCall() {
  if (!selectedWorkflow) return;
  const isProd = selectedWorkflow.baseUrl.includes('production.conversely.in');
  if (isProd) {
    pendingTriggerAction = triggerSingleCall;
    openProdModal(selectedWorkflow.baseUrl);
  } else {
    triggerSingleCall();
  }
}

async function triggerSingleCall() {
  const form = document.getElementById('dynamicSingleForm');
  const formData = new FormData(form);
  const payload = {};
  formData.forEach((val, key) => payload[key] = val);

  const resDiv = document.getElementById('singleDispatchResult');
  const statusPill = document.getElementById('singleStatusPill');
  resDiv.classList.remove('hidden');
  resDiv.className = 'dispatch-result alert info-alert';
  resDiv.textContent = 'Dispatching call to target engine...';
  if (statusPill) statusPill.textContent = 'Dispatching...';

  try {
    const res = await fetch('/api/trigger/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: selectedWorkflow.id,
        payload,
        triggeredBy: currentUser.username
      })
    });
    const data = await res.json();
    if (data.ok) {
      resDiv.className = 'dispatch-result alert success-alert';
      resDiv.innerHTML = `<strong>Call Triggered Successfully!</strong> Log ID: <code>${data.log?.id || 'N/A'}</code>`;
      if (statusPill) statusPill.textContent = 'Ready';
    } else {
      resDiv.className = 'dispatch-result alert error-alert';
      resDiv.textContent = `Dispatch Failed: ${data.message}`;
      if (statusPill) statusPill.textContent = 'Error';
    }
  } catch (err) {
    resDiv.className = 'dispatch-result alert error-alert';
    resDiv.textContent = `Execution Error: ${err.message}`;
    if (statusPill) statusPill.textContent = 'Error';
  }
}

function handleCsvFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    parseAndRenderCsv(text);
  };
  reader.readAsText(file);
}

// RFC 4180 Compliant CSV Parser
function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseAndRenderCsv(text) {
  const rawLines = text.split(/\r?\n/).filter(l => l.trim());
  if (rawLines.length === 0) return;

  const headers = parseCsvLine(rawLines[0]).map(h => h.replace(/^"|"$/g, ''));
  csvData = [];
  selectedRowIndices.clear();

  for (let i = 1; i < rawLines.length; i++) {
    const parts = parseCsvLine(rawLines[i]).map(p => p.replace(/^"|"$/g, ''));
    if (parts.length > 0 && parts.some(p => p !== '')) {
      const row = { _status: 'Pending' };
      headers.forEach((h, idx) => row[h] = parts[idx] || '');
      csvData.push(row);
    }
  }

  renderCsvTable(headers);
}

function renderCsvTable(headers) {
  const container = document.getElementById('batchTableContainer');
  container.classList.remove('hidden');

  document.getElementById('rowCountBadge').textContent = `${csvData.length} Records Loaded`;

  const headerRow = document.getElementById('tableHeaderRow');
  headerRow.innerHTML = `<th><input type="checkbox" id="headerCheckbox"></th><th>#</th>`;
  headers.forEach(h => {
    headerRow.innerHTML += `<th>${h}</th>`;
  });
  headerRow.innerHTML += `<th>Status</th><th>Action</th>`;

  const headerCb = document.getElementById('headerCheckbox');
  if (headerCb) {
    headerCb.checked = selectedRowIndices.size === csvData.length && csvData.length > 0;
    headerCb.addEventListener('change', (e) => {
      if (e.target.checked) {
        csvData.forEach((_, idx) => selectedRowIndices.add(idx));
      } else {
        selectedRowIndices.clear();
      }
      updateTableCheckboxStates();
    });
  }

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  csvData.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="row-checkbox" data-idx="${idx}"></td>
      <td>${idx + 1}</td>
    `;
    headers.forEach(h => {
      tr.innerHTML += `<td>${row[h] || ''}</td>`;
    });
    const statusLower = (row._status || 'pending').toLowerCase();
    tr.innerHTML += `
      <td><span class="status-pill ${statusLower}">${row._status}</span></td>
      <td><button class="btn secondary-btn sm-btn call-row-btn" data-idx="${idx}">Call</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.row-checkbox').forEach(cb => {
    const idx = parseInt(cb.getAttribute('data-idx'));
    cb.checked = selectedRowIndices.has(idx);
    cb.addEventListener('change', (e) => {
      if (e.target.checked) selectedRowIndices.add(idx);
      else selectedRowIndices.delete(idx);
      updateSelectedCount();
    });
  });

  tbody.querySelectorAll('.call-row-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'));
      attemptSingleRowCall(idx);
    });
  });

  updateSelectedCount();
}

function updateTableCheckboxStates() {
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    const idx = parseInt(cb.getAttribute('data-idx'));
    cb.checked = selectedRowIndices.has(idx);
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = selectedRowIndices.size;
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('triggerSelectedBtn').disabled = count === 0;
}

function toggleSelectAll() {
  if (selectedRowIndices.size === csvData.length) {
    selectedRowIndices.clear();
  } else {
    csvData.forEach((_, idx) => selectedRowIndices.add(idx));
  }
  updateTableCheckboxStates();
}

function attemptSingleRowCall(index) {
  if (!selectedWorkflow) return;
  const isProd = selectedWorkflow.baseUrl.includes('production.conversely.in');
  if (isProd) {
    pendingTriggerAction = () => triggerRowCall(index);
    openProdModal(selectedWorkflow.baseUrl);
  } else {
    triggerRowCall(index);
  }
}

async function triggerRowCall(index) {
  const row = csvData[index];
  row._status = 'Calling...';
  renderCsvTable(Object.keys(csvData[0]).filter(k => k !== '_status'));

  try {
    const res = await fetch('/api/trigger/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: selectedWorkflow.id,
        payload: row,
        triggeredBy: currentUser.username
      })
    });
    const data = await res.json();
    row._status = data.ok ? 'Success' : 'Failed';
  } catch (err) {
    row._status = 'Failed';
  }
  renderCsvTable(Object.keys(csvData[0]).filter(k => k !== '_status'));
}

function attemptBatchCall(mode) {
  if (!selectedWorkflow) return;
  const isProd = selectedWorkflow.baseUrl.includes('production.conversely.in');
  const items = mode === 'selected' ? Array.from(selectedRowIndices).map(idx => csvData[idx]) : csvData;

  if (items.length === 0) return;

  if (isProd) {
    pendingTriggerAction = () => executeBatch(items);
    openProdModal(selectedWorkflow.baseUrl);
  } else {
    executeBatch(items);
  }
}

async function executeBatch(items) {
  if (items.length === 0) return;
  
  const progressWrapper = document.getElementById('batchProgressWrapper');
  const progressFill = document.getElementById('batchProgressFill');
  const progressPercent = document.getElementById('batchProgressPercent');
  
  if (progressWrapper) progressWrapper.classList.remove('hidden');
  if (progressFill) progressFill.style.width = '10%';
  if (progressPercent) progressPercent.textContent = '10%';

  try {
    const res = await fetch('/api/trigger/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: selectedWorkflow.id,
        items,
        triggeredBy: currentUser.username
      })
    });
    const data = await res.json();
    
    if (progressFill) progressFill.style.width = '100%';
    if (progressPercent) progressPercent.textContent = '100%';

    if (data.ok) {
      setTimeout(() => {
        if (progressWrapper) progressWrapper.classList.add('hidden');
      }, 1500);
      loadLogs();
    } else {
      alert(`Batch execution failed: ${data.message}`);
    }
  } catch (err) {
    alert(`Batch error: ${err.message}`);
  }
}

async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    if (data.ok) {
      allLogs = data.logs || [];
      filterAndRenderLogs();
    }
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

function filterAndRenderLogs() {
  const searchVal = document.getElementById('logSearchInput').value.toLowerCase().trim();
  
  let filtered = allLogs.filter(l => {
    if (currentLogFilter !== 'all') {
      const statusLower = (l.status || '').toLowerCase();
      if (statusLower !== currentLogFilter) return false;
    }
    if (!searchVal) return true;
    
    const wfName = (l.workflowName || '').toLowerCase();
    const recipient = (l.customerPhone || l.customerName || '').toLowerCase();
    const url = (l.targetUrl || '').toLowerCase();
    const by = (l.triggeredBy || '').toLowerCase();

    return wfName.includes(searchVal) || recipient.includes(searchVal) || url.includes(searchVal) || by.includes(searchVal);
  });

  renderLogsTable(filtered);
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:2rem;">No matching audit logs found.</td></tr>`;
    return;
  }

  logs.forEach(l => {
    const tr = document.createElement('tr');
    const statusClass = (l.status || 'success').toLowerCase();
    const recipient = l.customerPhone ? `${l.customerName ? l.customerName + ' (' + l.customerPhone + ')' : l.customerPhone}` : (l.totalCount ? `Batch (${l.successCount}/${l.totalCount})` : '—');
    
    tr.innerHTML = `
      <td>${new Date(l.timestamp).toLocaleString()}</td>
      <td><strong>${l.workflowName || l.workflowId}</strong></td>
      <td><code>${l.targetUrl}</code></td>
      <td>${recipient}</td>
      <td><span class="status-pill ${statusClass}">${l.status}</span></td>
      <td>${l.triggeredBy}</td>
      <td><button class="btn secondary-btn sm-btn view-json-btn">Payload</button></td>
    `;

    tr.querySelector('.view-json-btn').addEventListener('click', () => {
      openPayloadModal(l);
    });

    tbody.appendChild(tr);
  });
}

function openPayloadModal(log) {
  const modal = document.getElementById('payloadModal');
  const pre = document.getElementById('payloadJsonPre');
  const title = document.getElementById('payloadModalTitle');
  if (title) title.textContent = `Payload Details — ${log.workflowName}`;
  if (pre) pre.textContent = JSON.stringify(log, null, 2);
  if (modal) modal.classList.remove('hidden');
}

function closePayloadModal() {
  const modal = document.getElementById('payloadModal');
  if (modal) modal.classList.add('hidden');
}

function openProdModal(url) {
  const modal = document.getElementById('prodConfirmModal');
  const urlText = document.getElementById('prodConfirmUrlText');
  if (urlText) urlText.textContent = url;
  if (modal) modal.classList.remove('hidden');
}

function closeProdModal() {
  const modal = document.getElementById('prodConfirmModal');
  if (modal) modal.classList.add('hidden');
}

function renderAdminWorkflows() {
  const tbody = document.getElementById('workflowsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  workflows.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.displayName}</strong></td>
      <td><code>${w.workflowId}</code></td>
      <td><code>${w.baseUrl}</code></td>
      <td>
        <button class="btn secondary-btn sm-btn edit-wf-btn" data-id="${w.id}">Edit</button>
        <button class="btn secondary-btn sm-btn del-wf-btn" data-id="${w.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.edit-wf-btn').forEach(b => {
    b.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const wf = workflows.find(w => w.id === id);
      if (wf) openWorkflowModal(wf);
    });
  });

  tbody.querySelectorAll('.del-wf-btn').forEach(b => {
    b.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm('Delete this workflow configuration?')) {
        await fetch('/api/workflows/' + id, { method: 'DELETE' });
        await loadWorkflows();
      }
    });
  });
}

function renderAdminBaseUrls() {
  const tbody = document.getElementById('baseUrlsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  baseUrls.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${b.name}</strong></td>
      <td><code>${b.url}</code></td>
      <td>
        <button class="btn secondary-btn sm-btn del-url-btn" data-id="${b.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.del-url-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm('Remove this Target Base URL?')) {
        await fetch('/api/base-urls/' + id, { method: 'DELETE' });
        await loadBaseUrls();
      }
    });
  });
}

function populateModalBaseUrlDropdown() {
  const select = document.getElementById('wfModalBaseUrlSelect');
  if (!select) return;
  select.innerHTML = '';
  baseUrls.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.url;
    opt.textContent = `${b.name} (${b.url})`;
    select.appendChild(opt);
  });
}

function openWorkflowModal(wf = null) {
  document.getElementById('workflowModal').classList.remove('hidden');
  populateModalBaseUrlDropdown();
  if (wf) {
    document.getElementById('modalTitle').textContent = 'Edit Workflow';
    document.getElementById('wfModalId').value = wf.id;
    document.getElementById('wfModalDisplayName').value = wf.displayName;
    document.getElementById('wfModalWorkflowId').value = wf.workflowId;
    document.getElementById('wfModalCompanyId').value = wf.companyId;
    document.getElementById('wfModalBaseUrlSelect').value = wf.baseUrl;
  } else {
    document.getElementById('modalTitle').textContent = 'Add Workflow';
    document.getElementById('wfModalId').value = '';
    document.getElementById('wfModalDisplayName').value = '';
    document.getElementById('wfModalWorkflowId').value = '';
    document.getElementById('wfModalCompanyId').value = '3a4fc4a1-30ae-4cfd-a352-b1d3039da6c4';
  }
}

function closeWorkflowModal() {
  document.getElementById('workflowModal').classList.add('hidden');
}

async function handleSaveWorkflow(e) {
  e.preventDefault();
  const id = document.getElementById('wfModalId').value;
  const displayName = document.getElementById('wfModalDisplayName').value;
  const workflowId = document.getElementById('wfModalWorkflowId').value;
  const companyId = document.getElementById('wfModalCompanyId').value;
  const baseUrl = document.getElementById('wfModalBaseUrlSelect').value;

  try {
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id || undefined, displayName, workflowId, companyId, baseUrl })
    });
    const data = await res.json();
    if (data.ok) {
      closeWorkflowModal();
      await loadWorkflows();
    }
  } catch (err) {
    alert(err.message);
  }
}

function openBaseUrlModal() {
  document.getElementById('baseUrlModal').classList.remove('hidden');
}

function closeBaseUrlModalBtn() {
  document.getElementById('baseUrlModal').classList.add('hidden');
}

async function handleAddBaseUrl(e) {
  e.preventDefault();
  const name = document.getElementById('baseUrlName').value;
  const url = document.getElementById('baseUrlUrl').value;

  try {
    const res = await fetch('/api/base-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url })
    });
    const data = await res.json();
    if (data.ok) {
      closeBaseUrlModalBtn();
      document.getElementById('baseUrlName').value = '';
      document.getElementById('baseUrlUrl').value = '';
      await loadBaseUrls();
    }
  } catch (err) {
    alert(err.message);
  }
}

function showError(msg) {
  const errDiv = document.getElementById('loginError');
  errDiv.textContent = msg;
  errDiv.classList.remove('hidden');
}
