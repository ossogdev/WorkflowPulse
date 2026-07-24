let currentUser = null;
let workflows = [];
let baseUrls = [];
let selectedWorkflow = null;
let csvData = [];
let selectedRowIndices = new Set();

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
    triggerSingleCall();
  });

  const dropzone = document.getElementById('csvDropzone');
  const fileInput = document.getElementById('csvFileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--bg-card-border)';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--bg-card-border)';
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
  document.getElementById('triggerSelectedBtn').addEventListener('click', triggerSelectedBatch);
  document.getElementById('triggerFullBatchBtn').addEventListener('click', triggerFullBatch);
  document.getElementById('refreshLogsBtn').addEventListener('click', loadLogs);

  document.getElementById('addWorkflowBtn').addEventListener('click', () => openWorkflowModal());
  document.getElementById('closeWfModalBtn').addEventListener('click', closeWorkflowModal);
  document.getElementById('cancelWfModalBtn').addEventListener('click', closeWorkflowModal);
  document.getElementById('workflowForm').addEventListener('submit', handleSaveWorkflow);

  document.getElementById('addBaseUrlBtn').addEventListener('click', openBaseUrlModal);
  document.getElementById('closeBaseUrlModalBtn').addEventListener('click', closeBaseUrlModalBtn);
  document.getElementById('cancelBaseUrlModalBtn').addEventListener('click', closeBaseUrlModalBtn);
  document.getElementById('baseUrlForm').addEventListener('submit', handleAddBaseUrl);
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
      showError(data.message || 'Login failed');
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
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

  if (tabId === 'historyTab') loadLogs();
}

async function loadBaseUrls() {
  try {
    const res = await fetch('/api/base-urls');
    const data = await res.json();
    if (data.ok) {
      baseUrls = data.baseUrls;
      renderAdminBaseUrls();
      populateModalBaseUrlDropdown();
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadWorkflows() {
  try {
    const res = await fetch('/api/workflows');
    const data = await res.json();
    if (data.ok) {
      workflows = data.workflows;
      renderWorkflowSelect();
      renderAdminWorkflows();
    }
  } catch (err) {
    console.error(err);
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
  const badgeText = document.getElementById('envBadgeText');
  if (selectedWorkflow) {
    badgeText.textContent = selectedWorkflow.baseUrl;
  } else {
    badgeText.textContent = 'No Workflow Selected';
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
      <label>${f.label} ${f.required ? '<span style="color:var(--danger)">*</span>' : ''}</label>
      <input type="${f.type === 'phone' ? 'tel' : 'text'}" name="${f.key}" placeholder="Enter ${f.label}" ${f.required ? 'required' : ''}>
    `;
    form.appendChild(fieldDiv);
  });
}

async function triggerSingleCall() {
  const form = document.getElementById('dynamicSingleForm');
  const formData = new FormData(form);
  const payload = {};
  formData.forEach((val, key) => payload[key] = val);

  const resDiv = document.getElementById('singleDispatchResult');
  resDiv.classList.remove('hidden');
  resDiv.className = 'dispatch-result alert success-alert';
  resDiv.textContent = 'Triggering call...';

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
      resDiv.textContent = `Call triggered successfully! Journey ID: ${data.result?.journeyId || 'N/A'}`;
    } else {
      resDiv.className = 'dispatch-result alert error-alert';
      resDiv.textContent = `Trigger failed: ${data.message}`;
    }
  } catch (err) {
    resDiv.className = 'dispatch-result alert error-alert';
    resDiv.textContent = `Error: ${err.message}`;
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

function parseAndRenderCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return;

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  csvData = [];
  selectedRowIndices.clear();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length >= headers.length) {
      const row = { _status: 'Pending' };
      headers.forEach((h, idx) => row[h] = parts[idx]);
      csvData.push(row);
    }
  }

  renderCsvTable(headers);
}

function renderCsvTable(headers) {
  const container = document.getElementById('batchTableContainer');
  container.classList.remove('hidden');

  document.getElementById('rowCountBadge').textContent = `${csvData.length} Rows Loaded`;

  const headerRow = document.getElementById('tableHeaderRow');
  headerRow.innerHTML = `<th><input type="checkbox" id="headerCheckbox"></th><th>#</th>`;
  headers.forEach(h => {
    headerRow.innerHTML += `<th>${h}</th>`;
  });
  headerRow.innerHTML += `<th>Status</th><th>Action</th>`;

  document.getElementById('headerCheckbox').addEventListener('change', (e) => {
    if (e.target.checked) {
      csvData.forEach((_, idx) => selectedRowIndices.add(idx));
    } else {
      selectedRowIndices.clear();
    }
    updateTableCheckboxStates();
  });

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
    tr.innerHTML += `
      <td><span class="status-badge status-${row._status.toLowerCase()}">${row._status}</span></td>
      <td><button class="btn primary-btn sm-btn call-row-btn" data-idx="${idx}">📞 Call</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const index = parseInt(e.target.getAttribute('data-idx'));
      if (e.target.checked) selectedRowIndices.add(index);
      else selectedRowIndices.delete(index);
      updateSelectedCount();
    });
  });

  tbody.querySelectorAll('.call-row-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-idx'));
      triggerRowCall(index);
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

async function triggerSelectedBatch() {
  const items = Array.from(selectedRowIndices).map(idx => csvData[idx]);
  await executeBatch(items);
}

async function triggerFullBatch() {
  await executeBatch(csvData);
}

async function executeBatch(items) {
  if (items.length === 0) return;
  alert(`Starting batch execution for ${items.length} items...`);

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
    if (data.ok) {
      alert(`Batch dispatch completed! Total: ${data.total}`);
    } else {
      alert(`Batch error: ${data.message}`);
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
      renderLogsTable(data.logs);
    }
  } catch (err) {
    console.error(err);
  }
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logsTableBody');
  tbody.innerHTML = '';
  logs.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(l.timestamp).toLocaleString()}</td>
      <td><strong>${l.workflowName}</strong></td>
      <td><code>${l.targetUrl}</code></td>
      <td>${l.customerPhone || l.customerName || 'Batch (' + l.totalCount + ')'}</td>
      <td><span class="status-badge status-${(l.status || 'success').toLowerCase()}">${l.status}</span></td>
      <td>${l.triggeredBy}</td>
    `;
    tbody.appendChild(tr);
  });
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
