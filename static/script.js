let isRunning = false;
let logIndex = 0;
let pollInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    switchTab('dashboard');
    startPolling();
    loadProviders();
    loadSettings();
    loadTokenImportSettings();
    loadUsProxyPool();
});

// 切换视图
function switchTab(tabName) {
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const section = document.getElementById(`view-${tabName}`);
    if (section) {
        section.classList.add('active');
        section.classList.remove('hidden');
    }
    const activeNav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (activeNav) activeNav.classList.add('active');

    if (tabName === 'accounts') {
        loadAccounts();
    }
    if (tabName === 'tokens') {
        loadTokenImportSettings();
    }
    if (tabName === 'proxies') {
        loadUsProxyPool();
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
    const progress = data.progress || {};
    const currentProxy = data.current_proxy || {};

    document.getElementById('valAction').textContent = data.current_action;
    document.getElementById('valSuccess').textContent = data.success;
    document.getElementById('valFail').textContent = data.fail;
    document.getElementById('valInventory').textContent = data.total_inventory;
    document.getElementById('valTaskTotal').textContent = progress.total ?? 0;
    document.getElementById('valCompleted').textContent = progress.completed ?? 0;
    document.getElementById('valSkipped').textContent = progress.skipped ?? 0;
    document.getElementById('valRemaining').textContent = progress.remaining ?? 0;
    document.getElementById('tokenTotal').textContent = progress.total ?? 0;
    document.getElementById('tokenCompleted').textContent = progress.completed ?? 0;
    document.getElementById('tokenFail').textContent = data.fail ?? 0;
    document.getElementById('tokenSkipped').textContent = progress.skipped ?? 0;
    document.getElementById('tokenRemaining').textContent = progress.remaining ?? 0;
    const proxyCurrentSetting = document.getElementById('proxyCurrentSetting');
    if (proxyCurrentSetting) {
        proxyCurrentSetting.textContent = renderCurrentProxy(currentProxy);
    }

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
// 📬 邮箱域名管理
// ==========================================

async function loadProviders() {
    try {
        const res = await fetch('/api/email-domains');
        const domains = await res.json();
        renderProviders(domains);
    } catch (e) {
        console.error("加载邮箱域名失败:", e);
    }
}

function renderProviders(domains) {
    const container = document.getElementById('providerList');
    container.innerHTML = '';

    domains.forEach(p => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; gap:8px; padding:5px 0; cursor:pointer; font-size:13px; color:#ccc;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = p.domain;
        checkbox.checked = p.selected;
        checkbox.style.cssText = 'width:14px; height:14px; cursor:pointer; accent-color:#7c6af7;';
        checkbox.addEventListener('change', onProviderToggle);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(p.domain));
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
        await fetch('/api/email-domains', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected })
        });
    } catch (e) {
        console.error("更新邮箱域名失败:", e);
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

async function loadTokenImportSettings() {
    try {
        const res = await fetch('/api/token-import/settings');
        const data = await res.json();
        document.getElementById('tokenAccountsFile').value = data.accounts_file || '';
        document.getElementById('tokenOutputDir').value = data.output_dir || '';
    } catch (e) {
        console.error("加载 Token 设置失败:", e);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatLocalDateTime(value) {
    if (!value) return '未刷新';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function renderCurrentProxy(proxy) {
    if (!proxy || !proxy.enabled || !proxy.host) {
        return '未启用';
    }
    return `${proxy.type || 'http'}://${proxy.host}:${proxy.port}`;
}

function buildProxyProbeLabel(proxy) {
    const parts = [];
    if (proxy.detected_ip) parts.push(proxy.detected_ip);

    const location = [proxy.detected_country_code || proxy.detected_country, proxy.detected_city]
        .filter(Boolean)
        .join(' / ');
    if (location) parts.push(location);

    if (proxy.latency_ms !== null && proxy.latency_ms !== undefined) {
        parts.push(`${proxy.latency_ms} ms`);
    }

    return parts.join(' | ') || '未返回出口详情';
}

async function loadUsProxyPool() {
    try {
        const res = await fetch('/api/us-proxies');
        const data = await res.json();
        renderUsProxyPool(data);
    } catch (e) {
        console.error('加载本地代理池失败:', e);
    }
}

async function refreshUsProxyPool() {
    const btn = document.getElementById('btnRefreshUsProxies');
    const status = document.getElementById('proxyPoolStatus');

    btn.disabled = true;
    status.textContent = '刷新中';
    status.className = 'status-pill neutral';

    try {
        const res = await fetch('/api/us-proxies/refresh', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || '刷新失败');
            return;
        }
        renderUsProxyPool(data);
    } catch (e) {
        alert(`刷新失败: ${e}`);
    } finally {
        btn.disabled = false;
    }
}

function renderUsProxyPool(data) {
    const proxies = Array.isArray(data.proxies) ? data.proxies : [];
    const currentProxy = data.current_proxy || {};

    document.getElementById('proxyRawCount').textContent = data.raw_row_count ?? 0;
    document.getElementById('proxyWorkingCount').textContent = proxies.length;
    document.getElementById('proxyFetchedAt').textContent = formatLocalDateTime(data.fetched_at);
    document.getElementById('proxyCurrentSetting').textContent = renderCurrentProxy(currentProxy);

    const status = document.getElementById('proxyPoolStatus');
    if (proxies.length > 0) {
        status.textContent = `可用 ${proxies.length}`;
        status.className = 'status-pill success';
    } else if (data.fetched_at) {
        status.textContent = '无可用代理';
        status.className = 'status-pill error';
    } else {
        status.textContent = '未刷新';
        status.className = 'status-pill neutral';
    }

    const tbody = document.getElementById('proxyTableBody');
    tbody.innerHTML = '';

    if (proxies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666">当前没有可用代理，请手动刷新</td></tr>';
        return;
    }

    proxies.forEach(proxy => {
        const tr = document.createElement('tr');
        const proxyType = String(proxy.type || 'http').toLowerCase();
        const proxyLabel = `${escapeHtml(proxyType)}://${escapeHtml(proxy.host)}:${escapeHtml(proxy.port)}`;
        const authInfo = proxy.use_auth && proxy.username
            ? `<div class="subtle-text">鉴权: ${escapeHtml(proxy.username)}</div>`
            : '';
        const sourceCheck = proxy.last_checked ? `<div class="subtle-text">源站: ${escapeHtml(proxy.last_checked)}</div>` : '';
        const checkedAt = proxy.checked_at ? `<div class="subtle-text">本地: ${escapeHtml(formatLocalDateTime(proxy.checked_at))}</div>` : '';
        const isCurrent = Boolean(
            currentProxy.enabled &&
            String(currentProxy.type || 'http').toLowerCase() === proxyType &&
            currentProxy.host === proxy.host &&
            Number(currentProxy.port) === Number(proxy.port)
        );

        tr.innerHTML = `
            <td style="font-family:monospace">${proxyLabel}${authInfo}${sourceCheck}</td>
            <td>${escapeHtml(proxy.anonymity || '-')}</td>
            <td>${escapeHtml((proxy.https || '').toUpperCase() || '-')}</td>
            <td>${escapeHtml(buildProxyProbeLabel(proxy))}</td>
            <td>${checkedAt}</td>
            <td></td>
        `;

        const actionCell = tr.lastElementChild;
        const button = document.createElement('button');
        button.className = 'action-btn';
        button.textContent = isCurrent ? '当前代理' : '设为起始代理';
        button.disabled = isCurrent;
        button.addEventListener('click', () => applyUsProxy(proxy.host, proxy.port, proxyType));
        actionCell.appendChild(button);
        tbody.appendChild(tr);
    });
}

async function applyUsProxy(host, port, type = 'http') {
    if (!confirm(`将 ${type}://${host}:${port} 设为下次任务的起始代理？`)) return;

    try {
        const res = await fetch('/api/us-proxies/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port, type })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || '应用失败');
            return;
        }
        renderUsProxyPool({
            ...(await (await fetch('/api/us-proxies')).json())
        });
    } catch (e) {
        alert(`应用失败: ${e}`);
    }
}

async function startTokenImportTask() {
    const accountsFile = document.getElementById('tokenAccountsFile').value.trim();
    const outputDir = document.getElementById('tokenOutputDir').value.trim();

    if (!accountsFile || !outputDir) {
        alert('请填写 TXT 路径和输出目录');
        return;
    }

    clearLogs();

    try {
        const res = await fetch('/api/token-import/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accounts_file: accountsFile,
                output_dir: outputDir
            })
        });

        if (!res.ok) {
            const data = await res.text();
            alert("启动失败: " + data);
            return;
        }

        switchTab('dashboard');
    } catch (e) {
        alert("请求失败: " + e);
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
            // 有独立密码的邮箱服务
            inboxCell = `
                <span style="font-size:11px;color:#aaa">[${providerLabel}]</span><br>
                <span style="font-family:monospace;font-size:11px">${acc.email}</span><br>
                <span style="font-family:monospace;font-size:11px;color:#888">密码: ${acc.temp_credential}</span><br>
                <a href="${acc.inbox_url}" target="_blank" class="action-btn" style="font-size:11px;margin-top:2px;display:inline-block">打开收件箱</a>`;
        } else if (!acc.has_password && acc.temp_credential) {
            // 基于邮箱地址或 token 的服务
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
