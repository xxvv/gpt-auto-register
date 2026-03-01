let isRunning = false;
let logIndex = 0;
let pollInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    switchTab('dashboard');
    startPolling();
    loadProviders();
    loadSettings();
});

// 切换视图
function switchTab(tabName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${tabName}`).classList.add('active');

    const navIndex = tabName === 'dashboard' ? 0 : 1;
    document.querySelectorAll('.nav-item')[navIndex].classList.add('active');

    if (tabName === 'accounts') {
        loadAccounts();
    }
}

// 轮询状态
function startPolling() {
    pollStatus();
    pollInterval = setInterval(pollStatus, 1000);
}

async function pollStatus() {
    try {
        const res = await fetch(`/api/status?log_index=${logIndex}`);
        const data = await res.json();
        updateUI(data);
    } catch (e) {
        console.error("Polling error:", e);
    }
}

function updateUI(data) {
    document.getElementById('valAction').textContent = data.current_action;
    document.getElementById('valSuccess').textContent = data.success;
    document.getElementById('valFail').textContent = data.fail;
    document.getElementById('valInventory').textContent = data.total_inventory;

    isRunning = data.is_running;
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (isRunning) {
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
        statusDot.classList.add('running');
        statusText.textContent = "运行中";
    } else {
        btnStart.classList.remove('hidden');
        btnStop.classList.add('hidden');
        statusDot.classList.remove('running');
        statusText.textContent = "系统空闲";
    }

    const monitorImg = document.getElementById('liveMonitor');
    const noSignal = document.getElementById('noSignal');
    const monitorStatus = document.getElementById('monitorStatus');

    if (isRunning) {
        monitorImg.classList.remove('hidden');
        noSignal.classList.add('hidden');

        if (!monitorImg.src || monitorImg.src.indexOf('/video_feed') === -1) {
            monitorImg.src = "/video_feed";
        }

        monitorStatus.textContent = "LIVE";
        monitorStatus.classList.remove('neutral');
        monitorStatus.classList.add('success');
    } else {
        monitorStatus.textContent = "OFFLINE";
        monitorStatus.classList.remove('success');
        monitorStatus.classList.add('neutral');
    }

    if (data.logs && data.logs.length > 0) {
        const container = document.getElementById('logContainer');

        const placeholder = container.querySelector('.log-placeholder');
        if (placeholder) placeholder.remove();

        data.logs.forEach(logLine => {
            const div = document.createElement('div');
            div.className = 'log-entry';
            div.textContent = logLine;
            container.appendChild(div);
        });

        container.scrollTop = container.scrollHeight;
        logIndex += data.logs.length;
    }
}

// ==========================================
// 📬 邮箱提供商管理
// ==========================================

async function loadProviders() {
    try {
        const res = await fetch('/api/providers');
        const providers = await res.json();
        renderProviders(providers);
    } catch (e) {
        console.error("加载提供商失败:", e);
    }
}

function renderProviders(providers) {
    const container = document.getElementById('providerList');
    container.innerHTML = '';

    providers.forEach(p => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; gap:8px; padding:5px 0; cursor:pointer; font-size:13px; color:#ccc;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = p.id;
        checkbox.checked = p.selected;
        checkbox.style.cssText = 'width:14px; height:14px; cursor:pointer; accent-color:#7c6af7;';
        checkbox.addEventListener('change', onProviderToggle);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(p.name));
        container.appendChild(label);
    });
}

async function onProviderToggle() {
    const checkboxes = document.querySelectorAll('#providerList input[type=checkbox]');
    const selected = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);

    if (selected.length === 0) {
        // 至少保留一个，恢复刚才取消的
        this.checked = true;
        return;
    }

    try {
        await fetch('/api/providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected })
        });
    } catch (e) {
        console.error("更新提供商失败:", e);
    }
}

// ==========================================
// ⚙️ 高级设置
// ==========================================

async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        document.getElementById('parallelCount').value = data.parallel ?? 1;
        document.getElementById('headlessMode').checked = data.headless ?? false;
    } catch (e) {
        console.error("加载设置失败:", e);
    }
}

async function saveSettings() {
    const parallel = parseInt(document.getElementById('parallelCount').value) || 1;
    const headless = document.getElementById('headlessMode').checked;
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parallel, headless })
        });
    } catch (e) {
        console.error("保存设置失败:", e);
    }
}

// ==========================================
// 🚀 任务控制
// ==========================================

async function startTask() {
    const count = parseInt(document.getElementById('targetCount').value) || 1;

    clearLogs();

    try {
        const res = await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: count })
        });

        if (!res.ok) {
            alert("启动失败: " + await res.text());
        }
    } catch (e) {
        alert("请求失败: " + e);
    }
}

async function stopTask() {
    if (!confirm("确定要停止当前任务吗？")) return;

    try {
        await fetch('/api/stop', { method: 'POST' });
    } catch (e) {
        console.error(e);
    }
}

function clearLogs() {
    document.getElementById('logContainer').innerHTML = '<div class="log-placeholder">等待任务启动...</div>';
}

// ==========================================
// 👥 账号管理
// ==========================================

async function loadAccounts() {
    const tbody = document.getElementById('accountTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">加载中...</td></tr>';

    try {
        const res = await fetch('/api/accounts');
        const accounts = await res.json();
        renderAccounts(accounts);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red">加载失败: ${e}</td></tr>`;
    }
}

function renderAccounts(accounts) {
    const tbody = document.getElementById('accountTableBody');
    tbody.innerHTML = '';

    if (accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#666">暂无数据</td></tr>';
        return;
    }

    accounts.forEach(acc => {
        let statusClass = '';
        if (acc.status.includes('成功') || acc.status.includes('已注册')) statusClass = 'success';
        if (acc.status.includes('失败')) statusClass = 'fail';

        // 构造临时邮箱收件箱单元格
        let inboxCell;
        const providerLabel = acc.provider_name || acc.provider;

        if (acc.has_password && acc.temp_credential) {
            // 有密码的服务（mail.tm, mail.gw）
            inboxCell = `
                <span style="font-size:11px;color:#aaa">[${providerLabel}]</span><br>
                <span style="font-family:monospace;font-size:11px">${acc.email}</span><br>
                <span style="font-family:monospace;font-size:11px;color:#888">密码: ${acc.temp_credential}</span><br>
                <a href="${acc.inbox_url}" target="_blank" class="action-btn" style="font-size:11px;margin-top:2px;display:inline-block">打开收件箱</a>`;
        } else if (!acc.has_password && acc.temp_credential) {
            // 基于 token 的服务（tempmail.lol, guerrillamail）
            const shortToken = acc.temp_credential.length > 20
                ? acc.temp_credential.substring(0, 20) + '...'
                : acc.temp_credential;
            inboxCell = `
                <span style="font-size:11px;color:#aaa">[${providerLabel}]</span><br>
                <span style="font-family:monospace;font-size:10px;color:#666">Token(已过期): ${shortToken}</span><br>
                <a href="${acc.inbox_url}" target="_blank" class="action-btn" style="font-size:11px;margin-top:2px;display:inline-block">打开收件箱</a>`;
        } else {
            inboxCell = `
                <span style="font-size:11px;color:#aaa">[${providerLabel}]</span><br>
                <a href="${acc.inbox_url}" target="_blank" class="action-btn" style="font-size:11px">打开收件箱</a>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${acc.email}</td>
            <td style="font-family:monospace">${acc.password}</td>
            <td><span class="status-tag ${statusClass}">${acc.status}</span></td>
            <td>${acc.time}</td>
            <td>${inboxCell}</td>
        `;
        tbody.appendChild(tr);
    });

    window.allAccounts = accounts;
}

function filterAccounts() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    if (!window.allAccounts) return;

    const filtered = window.allAccounts.filter(acc =>
        acc.email.toLowerCase().includes(term)
    );
    renderAccounts(filtered);
}
