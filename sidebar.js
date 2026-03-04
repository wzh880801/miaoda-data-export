// 妙搭数据导出助手 - 侧边栏脚本

// DOM 元素
const workspaceInput = document.getElementById('workspace');
const appIdInput = document.getElementById('appId');
const tableSelect = document.getElementById('tableSelect');
const tableInfo = document.getElementById('tableInfo');
const expandUserFieldsCheckbox = document.getElementById('expandUserFields');
const fieldPreview = document.getElementById('fieldPreview');
const fieldList = document.getElementById('fieldList');
const exportDataBtn = document.getElementById('exportData');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const status = document.getElementById('status');
const toastStatus = document.getElementById('toastStatus');

// 全局状态
let tableSchemas = {}; // 存储表结构信息
let capturedListTableRequest = null; // 捕获的表列表请求
let hasAutoFetched = false; // 是否已经自动获取过表列表

// 缓存上次获取的表列表信息，用于变化检测
let cachedTableList = {
  workspace: '',
  appId: '',
  tablesHash: '' // 表列表的哈希值，用于快速比较
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 加载保存的配置
  loadSavedConfig();
  
  // 开始轮询检查捕获的请求
  startRequestPolling();
});

// 加载保存的配置
function loadSavedConfig() {
  chrome.storage.local.get(['miaodaConfig'], (result) => {
    if (result.miaodaConfig) {
      workspaceInput.value = result.miaodaConfig.workspace || '';
      appIdInput.value = result.miaodaConfig.appId || '';
    }
  });
}

// 保存配置
function saveConfig() {
  chrome.storage.local.set({
    miaodaConfig: {
      workspace: workspaceInput.value,
      appId: appIdInput.value
    }
  });
}

// 捕获状态 DOM 元素
const captureStatus = document.getElementById('captureStatus');
const captureText = document.getElementById('captureText');

// 轮询检查捕获的请求
function startRequestPolling() {
  checkCapturedRequests();
  // 每2秒检查一次
  setInterval(checkCapturedRequests, 2000);
}

// 计算表列表的哈希值（用于变化检测）
function calculateTablesHash(tables) {
  if (!tables || tables.length === 0) return '';
  
  // 构建特征字符串：表名+字段数量+字段名列表
  const features = tables.map(table => {
    const fieldNames = table.fields ? table.fields.map(f => f.fieldName).join(',') : '';
    return `${table.tableName}:${table.fields ? table.fields.length : 0}:${fieldNames}`;
  }).sort().join('|');
  
  // 简单的哈希计算
  let hash = 0;
  for (let i = 0; i < features.length; i++) {
    const char = features.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转为32位整数
  }
  return hash.toString(16);
}

// 检查是否需要刷新表列表
function shouldRefreshTableList(workspace, appId, newHash) {
  // 如果 workspace 或 appId 变化，需要刷新
  if (cachedTableList.workspace !== workspace || cachedTableList.appId !== appId) {
    return true;
  }
  // 如果哈希值变化，说明表结构有变化，需要刷新
  if (cachedTableList.tablesHash !== newHash) {
    return true;
  }
  return false;
}

// 检查捕获的请求
async function checkCapturedRequests() {
  try {
    const requests = await chrome.runtime.sendMessage({ action: 'getRequests' });
    
    // 查找 listTableView 请求
    const listTableRequest = requests.find(r => r.type === 'listTableView' && r.headers);
    
    if (listTableRequest && (!capturedListTableRequest || capturedListTableRequest.requestId !== listTableRequest.requestId)) {
      capturedListTableRequest = listTableRequest;
      
      // 自动从 URL 提取 workspace 和 appId
      const urlMatch = listTableRequest.url.match(/\/app\/([^\/]+)\/workspaces\/([^\/]+)\/listTableView/);
      let currentAppId = '';
      let currentWorkspace = '';
      if (urlMatch) {
        [, currentAppId, currentWorkspace] = urlMatch;
        appIdInput.value = currentAppId;
        workspaceInput.value = currentWorkspace;
        saveConfig();
      }
      
      // 更新捕获状态 UI
      captureStatus.classList.add('ready');
      
      // 自动获取表列表（只自动执行一次或检测到变化时）
      if (!hasAutoFetched) {
        hasAutoFetched = true;
        captureText.textContent = '✅ 已捕获请求，自动获取表列表中...';
        // 延迟一点执行，让用户看到状态变化
        setTimeout(() => {
          autoFetchTableList();
        }, 500);
      } else {
        // 已经获取过，检查是否需要刷新
        // 先获取数据计算哈希，判断是否有变化
        checkTableListChanges(listTableRequest, currentWorkspace, currentAppId);
      }
    }
  } catch (error) {
    console.error('检查捕获请求失败:', error);
  }
}

// 检查表列表是否有变化
async function checkTableListChanges(listTableRequest, workspace, appId) {
  try {
    // 获取表列表数据（但不更新UI）
    const response = await chrome.runtime.sendMessage({
      action: 'fetchData',
      data: {
        url: listTableRequest.url,
        headers: listTableRequest.headers,
        method: 'GET'
      }
    });

    if (!response.success || response.data.status_code !== '0') {
      return;
    }

    const tables = response.data.data?.data?.table?.data || [];
    const newHash = calculateTablesHash(tables);
    
    // 检查是否需要刷新
    if (shouldRefreshTableList(workspace, appId, newHash)) {
      console.log('[妙搭导出助手] 检测到表列表变化，自动刷新');
      showToast('检测到数据表变化，正在刷新...', 'info');
      
      // 更新缓存
      cachedTableList.workspace = workspace;
      cachedTableList.appId = appId;
      cachedTableList.tablesHash = newHash;
      
      // 更新UI
      updateTableListUI(tables);
      
      const tableCount = tables.length;
      captureText.textContent = `✅ 已更新 ${tableCount} 个数据表，选择表后点击导出`;
      showToast(`✅ 已更新 ${tableCount} 个数据表`, 'success', true);
    }
    // 没有变化时，不更新文案，保持原有状态
  } catch (error) {
    console.error('检查表列表变化失败:', error);
  }
}

// 更新表列表UI
function updateTableListUI(tables) {
  if (tables.length === 0) {
    return;
  }

  // 保存当前选中的表
  const currentSelectedTable = tableSelect.value;
  
  // 清空并填充下拉框
  tableSelect.innerHTML = '';
  tableSchemas = {};

  tables.forEach(table => {
    const option = document.createElement('option');
    option.value = table.tableName;
    option.textContent = `${table.comment || table.tableName} (${table.tableName})`;
    tableSelect.appendChild(option);

    // 保存表结构信息
    tableSchemas[table.tableName] = {
      fields: table.fields,
      comment: table.comment
    };
  });

  tableSelect.disabled = false;
  exportDataBtn.disabled = false;
  
  // 尝试恢复之前选中的表，如果还存在的话
  if (currentSelectedTable && tableSchemas[currentSelectedTable]) {
    tableSelect.value = currentSelectedTable;
  }
  
  // 显示当前选中的表的字段预览
  const selectedTable = tableSelect.value;
  if (selectedTable) {
    showFieldPreview(selectedTable);
  } else if (tables.length > 0) {
    showFieldPreview(tables[0].tableName);
  }
}

// 自动获取表列表
async function autoFetchTableList() {
  const workspace = workspaceInput.value.trim();
  const appId = appIdInput.value.trim();
  
  if (!workspace || !appId || !capturedListTableRequest) {
    return;
  }
  
  showToast('正在自动获取表列表...', 'info');
  
  try {
    const count = await doFetchTableList(capturedListTableRequest.url, capturedListTableRequest.headers, true);
    
    if (count > 0) {
      captureText.textContent = `✅ 已获取 ${count} 个数据表，选择表后点击导出`;
      showToast(`✅ 成功获取 ${count} 个数据表`, 'success', true); // 2秒后自动消失
    }

  } catch (error) {
    console.error('自动获取表列表失败:', error);
    showToast(`自动获取失败: ${error.message}`, 'error');
    captureText.textContent = '✅ 已捕获请求，请刷新页面重试';
    // 重置标志位，允许重试
    hasAutoFetched = false;
  }
}

// 显示状态消息
function showStatus(message, type = 'info') {
  status.className = `status ${type}`;
  status.textContent = message;
}

// 清除状态
function clearStatus() {
  status.className = 'status';
  status.textContent = '';
}

// 显示 Toast 提示（获取表列表用，成功后 2 秒自动消失）
let toastTimeout = null;
function showToast(message, type = 'info', autoHide = false) {
  // 清除之前的定时器
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  
  toastStatus.className = `toast-status ${type}`;
  toastStatus.textContent = message;
  
  if (autoHide && type === 'success') {
    toastTimeout = setTimeout(() => {
      toastStatus.className = 'toast-status';
      toastStatus.textContent = '';
    }, 2000);
  }
}

// 更新进度条
function updateProgress(current, total, message) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = message || `正在处理 ${current}/${total}...`;
}

// 显示加载状态
function showLoading(button, loadingText) {
  button.disabled = true;
  button.innerHTML = `<span class="loading"></span>${loadingText}`;
}

// 隐藏加载状态
function hideLoading(button, originalText) {
  button.disabled = false;
  button.textContent = originalText;
}

// 通用的获取表列表函数
async function doFetchTableList(url, headers, isAuto = false) {
  const response = await chrome.runtime.sendMessage({
    action: 'fetchData',
    data: {
      url: url,
      headers: headers,
      method: 'GET'
    }
  });

  if (!response.success) {
    throw new Error(response.error || '请求失败');
  }

  const result = response.data;
  
  if (result.status_code !== '0') {
    throw new Error(`API 错误: ${result.status_code}`);
  }

  const tables = result.data?.data?.table?.data || [];
  
  if (tables.length === 0) {
    showStatus('未找到数据表', 'error');
    return 0;
  }

  // 更新缓存
  const workspace = workspaceInput.value.trim();
  const appId = appIdInput.value.trim();
  cachedTableList.workspace = workspace;
  cachedTableList.appId = appId;
  cachedTableList.tablesHash = calculateTablesHash(tables);

  // 更新UI
  updateTableListUI(tables);
  
  return tables.length;
}

// 页面可见性变化时检查是否需要刷新
// 当用户切换回妙搭页面操作后再回到插件时，检查表列表是否有变化
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && capturedListTableRequest) {
    // 检查是否有新的请求被捕获
    const requests = await chrome.runtime.sendMessage({ action: 'getRequests' });
    const listTableRequest = requests.find(r => 
      r.type === 'listTableView' && 
      r.headers &&
      (!capturedListTableRequest || r.requestId !== capturedListTableRequest.requestId)
    );
    
    if (listTableRequest) {
      // 有新的请求，更新引用
      capturedListTableRequest = listTableRequest;
      
      const urlMatch = listTableRequest.url.match(/\/app\/([^\/]+)\/workspaces\/([^\/]+)\/listTableView/);
      let currentAppId = '';
      let currentWorkspace = '';
      if (urlMatch) {
        [, currentAppId, currentWorkspace] = urlMatch;
        appIdInput.value = currentAppId;
        workspaceInput.value = currentWorkspace;
        saveConfig();
      }
      
      captureStatus.classList.add('ready');
      captureText.textContent = '✅ 检测到新请求，检查表列表变化...';
      
      // 检查是否有变化，有变化才刷新
      setTimeout(() => {
        checkTableListChanges(listTableRequest, currentWorkspace, currentAppId);
      }, 300);
    }
  }
});

// 表选择变化时更新字段预览
tableSelect.addEventListener('change', () => {
  const tableName = tableSelect.value;
  if (tableName) {
    showFieldPreview(tableName);
  }
  
  // 清除之前的导出提示
  clearExportHints();
});

// 清除导出相关提示
function clearExportHints() {
  // 清除状态消息
  clearStatus();
  
  // 隐藏 Toast 提示
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  toastStatus.className = 'toast-status';
  toastStatus.textContent = '';
  
  // 隐藏进度条
  progress.classList.remove('show');
  progressFill.style.width = '0%';
  progressText.textContent = '准备导出...';
  
  // 重置导出按钮状态
  hideLoading(exportDataBtn, '导出数据');
}

// 显示字段预览
function showFieldPreview(tableName) {
  const schema = tableSchemas[tableName];
  if (!schema) return;

  fieldList.innerHTML = '';
  
  // 统计字段数量
  const totalFields = schema.fields.length;
  const userFields = schema.fields.filter(f => f.type === 'user_profile').length;
  
  schema.fields.forEach(field => {
    const tag = document.createElement('span');
    tag.className = 'field-tag';
    
    // 人员字段特殊标记
    if (field.type === 'user_profile') {
      tag.classList.add('user');
    }
    
    tag.textContent = `${field.comment || field.fieldName}`;
    tag.title = `字段名: ${field.fieldName}\n类型: ${field.type}`;
    fieldList.appendChild(tag);
  });

  fieldPreview.style.display = 'block';
  
  // 显示表信息和字段统计
  let infoText = `表注释: ${schema.comment || '无'} | 共 ${totalFields} 个字段`;
  if (userFields > 0) {
    infoText += ` (含 ${userFields} 个人员字段)`;
  }
  tableInfo.textContent = infoText;
}

// 导出数据
exportDataBtn.addEventListener('click', async () => {
  const workspace = workspaceInput.value.trim();
  const appId = appIdInput.value.trim();
  const tableName = tableSelect.value;
  const expandUserFields = expandUserFieldsCheckbox.checked;

  if (!tableName) {
    showStatus('请选择要导出的数据表', 'error');
    return;
  }

  saveConfig();
  clearStatus();
  progress.classList.add('show');
  exportDataBtn.disabled = true;

  try {
    // 检查是否有捕获的表数据请求
    const requests = await chrome.runtime.sendMessage({ action: 'getRequests' });
    const tableDataRequest = requests.find(r => 
      r.type === 'tableData' && 
      r.tableName === tableName &&
      r.headers
    );

    let headers;
    if (tableDataRequest) {
      headers = tableDataRequest.headers;
    } else {
      const listTableRequest = requests.find(r => 
        r.type === 'listTableView' && 
        r.url.includes(workspace) && 
        r.headers
      );
      if (!listTableRequest) {
        throw new Error('未捕获到页面请求，请刷新妙搭页面后再试');
      }
      headers = listTableRequest.headers;
    }

    const schema = tableSchemas[tableName];
    
    // 首先查询总数
    updateProgress(0, 0, '正在查询记录总数...');
    const totalCount = await getTableCount(workspace, appId, tableName, headers);
    
    if (totalCount === 0) {
      showStatus('该表没有数据', 'info');
      progress.classList.remove('show');
      exportDataBtn.disabled = false;
      return;
    }

    // 根据数据量选择导出方式
    const LARGE_TABLE_THRESHOLD = 5000; // 5000条阈值
    
    if (totalCount !== null && totalCount > LARGE_TABLE_THRESHOLD) {
      // 大表：使用流式导出
      await exportLargeTable(workspace, appId, tableName, headers, schema, expandUserFields, totalCount);
    } else {
      // 小表：使用内存导出
      const allData = await fetchAllData(workspace, appId, tableName, headers, totalCount);
      
      if (allData.length === 0) {
        showStatus('该表没有数据', 'info');
        progress.classList.remove('show');
        exportDataBtn.disabled = false;
        return;
      }

      const csv = generateCSV(allData, schema, expandUserFields);
      downloadCSV(csv, `${tableName}_export_${new Date().toISOString().slice(0, 10)}.csv`);
      
      showStatus(`✅ 成功导出 ${allData.length} 条记录到 CSV 文件`, 'success');
    }
  } catch (error) {
    console.error('导出失败:', error);
    showStatus(`导出失败: ${error.message}`, 'error');
  } finally {
    progress.classList.remove('show');
    exportDataBtn.disabled = false;
  }
});

// 获取表的总记录数
async function getTableCount(workspace, appId, tableName, headers) {
  try {
    const sqlUrl = `https://miaoda.feishu.cn/play/api/v2/dataloom/app/${appId}/workspaces/${workspace}/sql?dbBranch=main`;
    
    const response = await chrome.runtime.sendMessage({
      action: 'executeSQL',
      data: {
        url: sqlUrl,
        headers: headers,
        query: `select count(*) from ${tableName}`
      }
    });

    if (!response.success) {
      console.warn('查询总数失败:', response.error);
      return null;
    }

    const result = response.data;
    if (result.status_code !== '0') {
      console.warn('查询总数 API 错误:', result.status_code);
      return null;
    }

    // 解析返回结果
    const results = result.data?.results;
    if (results && results.length > 0) {
      const countData = JSON.parse(results[0]);
      if (countData && countData.length > 0) {
        return parseInt(countData[0].count, 10);
      }
    }
    return null;
  } catch (error) {
    console.warn('获取总数失败:', error);
    return null;
  }
}

// 大表流式导出（> 5万条）
async function exportLargeTable(workspace, appId, tableName, headers, schema, expandUserFields, totalCount) {
  const limit = 500; // 每页 500 条
  const totalPages = Math.ceil(totalCount / limit);
  
  showStatus(`检测到大数据表（${totalCount.toLocaleString()} 条记录），使用流式导出`, 'info');
  await sleep(1000);

  // 让用户选择文件保存位置
  updateProgress(0, totalPages, '请选择文件保存位置...');
  
  let fileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName: `${tableName}_export_${new Date().toISOString().slice(0, 10)}.csv`,
      types: [
        {
          description: 'CSV Files',
          accept: { 'text/csv': ['.csv'] }
        }
      ]
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('用户取消了文件选择');
    }
    throw error;
  }

  // 获取文件写入流
  const writable = await fileHandle.createWritable();
  
  // 写入 UTF-8 BOM
  await writable.write('\ufeff');
  
  // 写入 CSV 表头
  const csvHeader = generateCSVHeader(schema, expandUserFields);
  await writable.write(csvHeader + '\n');

  let offset = 0;
  let currentPage = 0;
  let totalExported = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      currentPage++;
      
      // 更新进度（如果实际页数超过预估，显示为 ?）
      const displayTotalPages = currentPage > totalPages ? currentPage : totalPages;
      updateProgress(currentPage, displayTotalPages, `流式导出中，${currentPage}/${displayTotalPages} 页 (${totalExported.toLocaleString()}/${totalCount.toLocaleString()} 条)...`);

      const url = `https://miaoda.feishu.cn/play/api/v2/dataloom/app/${appId}/workspaces/${workspace}/admin/data/${tableName}?order=_created_at.desc,id.desc&offset=${offset}&limit=${limit}&dbBranch=main`;
      
      const response = await chrome.runtime.sendMessage({
        action: 'fetchData',
        data: {
          url: url,
          headers: headers,
          method: 'GET'
        }
      });

      if (!response.success) {
        throw new Error(response.error || '请求失败');
      }

      const result = response.data;

      if (result.status_code !== '0') {
        throw new Error(`API 错误: ${result.status_code}`);
      }

      const data = result.data || [];
      
      if (data.length === 0) {
        hasMore = false;
        break;
      }

      // 生成这一页的 CSV 数据（不含表头）
      const csvRows = generateCSVRows(data, schema, expandUserFields);
      await writable.write(csvRows + '\n');
      
      totalExported += data.length;

      // 判断是否还有更多数据
      if (data.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // 添加延迟避免请求过快
      if (hasMore) {
        await sleep(200);
      }
    }

    // 关闭文件
    await writable.close();
    
    showStatus(`✅ 成功导出 ${totalExported.toLocaleString()} 条记录到 CSV 文件`, 'success');
  } catch (error) {
    // 发生错误时关闭文件
    await writable.close();
    throw error;
  }
}

// 获取所有数据（处理分页）- 小表使用
async function fetchAllData(workspace, appId, tableName, headers, knownTotalCount) {
  const allData = [];
  const limit = 500; // 每页 500 条
  let offset = 0;
  let hasMore = true;
  let totalCount = knownTotalCount;
  let totalPages = null;

  if (totalCount !== null) {
    totalPages = Math.ceil(totalCount / limit);
    console.log(`表 ${tableName} 共 ${totalCount} 条记录，约 ${totalPages} 页`);
  }

  let currentPage = 0;

  while (hasMore) {
    currentPage++;
    
    // 更新进度显示：第 X/Y 页
    if (totalPages) {
      updateProgress(currentPage, totalPages, `自动翻页获取数据中，${currentPage}/${currentPage > totalPages ? currentPage : totalPages}...`);
    } else {
      updateProgress(allData.length, '?', `自动翻页获取数据中，第 ${currentPage} 页...`);
    }

    const url = `https://miaoda.feishu.cn/play/api/v2/dataloom/app/${appId}/workspaces/${workspace}/admin/data/${tableName}?order=_created_at.desc,id.desc&offset=${offset}&limit=${limit}&dbBranch=main`;
    
    const response = await chrome.runtime.sendMessage({
      action: 'fetchData',
      data: {
        url: url,
        headers: headers,
        method: 'GET'
      }
    });

    if (!response.success) {
      throw new Error(response.error || '请求失败');
    }

    const result = response.data;

    if (result.status_code !== '0') {
      throw new Error(`API 错误: ${result.status_code}`);
    }

    const data = result.data || [];
    allData.push(...data);

    // 判断是否还有更多数据
    if (data.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }

    // 添加延迟避免请求过快
    if (hasMore) {
      await sleep(200);
    }
  }

  return allData;
}

// 延迟函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 生成 CSV（小表使用）
function generateCSV(data, schema, expandUserFields) {
  if (data.length === 0) return '';
  
  const header = generateCSVHeader(schema, expandUserFields);
  const rows = generateCSVRows(data, schema, expandUserFields);
  
  return '\ufeff' + header + '\n' + rows; // 添加 BOM 以支持 Excel 中文
}

// 转义 CSV 特殊字符
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  value = String(value);
  
  // 如果包含逗号、引号或换行符，需要用引号包裹
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    // 将双引号替换为两个双引号
    value = value.replace(/"/g, '""');
    return `"${value}"`;
  }
  return value;
}

// 下载 CSV 文件
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

// 获取要导出的字段列表（用于流式导出）
function getExportFields(schema) {
  const fields = [];
  const fieldTypes = {};
  
  schema.fields.forEach(field => {
    if (field.fieldName.startsWith('_')) {
      // 系统字段可选导出
      if (['_created_at', '_updated_at'].includes(field.fieldName)) {
        fields.push(field.fieldName);
        fieldTypes[field.fieldName] = field.type;
      }
    } else {
      fields.push(field.fieldName);
      fieldTypes[field.fieldName] = field.type;
    }
  });
  
  return { fields, fieldTypes };
}

// 生成 CSV 表头（用于流式导出）
function generateCSVHeader(schema, expandUserFields) {
  const { fields, fieldTypes } = getExportFields(schema);
  
  const headers = [];
  fields.forEach(fieldName => {
    const fieldSchema = schema.fields.find(f => f.fieldName === fieldName);
    const comment = fieldSchema?.comment || fieldName;

    if (expandUserFields && fieldTypes[fieldName] === 'user_profile') {
      // 人员字段展开为三个列
      headers.push(`${comment}_ID`);
      headers.push(`${comment}_姓名`);
      headers.push(`${comment}_邮箱`);
    } else {
      headers.push(comment);
    }
  });

  return headers.join(',');
}

// 生成 CSV 数据行（用于流式导出）
function generateCSVRows(data, schema, expandUserFields) {
  const { fields, fieldTypes } = getExportFields(schema);
  
  const rows = data.map(record => {
    return fields.map(fieldName => {
      const value = record[fieldName];
      
      if (expandUserFields && fieldTypes[fieldName] === 'user_profile') {
        // 处理人员字段
        if (value && typeof value === 'object') {
          const id = value.user_id || '';
          const name = value.name || '';
          const email = value.email || '';
          return [id, name, email].map(escapeCSV).join(',');
        } else {
          return ',,'; // 空值
        }
      } else if (Array.isArray(value)) {
        // 处理数组字段（如爱好）
        return escapeCSV(value.join('; '));
      } else if (value === null || value === undefined) {
        return '';
      } else {
        return escapeCSV(String(value));
      }
    }).join(',');
  });

  return rows.join('\n');
}
