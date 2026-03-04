// 妙搭数据导出助手 - Background Service Worker
// 使用 webRequest API 自动捕获请求

// 设置侧边栏行为
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// 存储捕获到的请求
let capturedRequests = [];
const MAX_REQUESTS = 20;

// 监听请求发送前的回调，捕获请求体
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    if (!url || !url.includes('miaoda.feishu.cn')) {
      return;
    }

    // 捕获 listTableView 请求（获取表列表）
    if (url.includes('/listTableView')) {
      addCapturedRequest({
        requestId: details.requestId,
        url: url,
        type: 'listTableView',
        method: details.method,
        timestamp: details.timeStamp
      });
    }
    // 捕获 admin/data 请求（获取表数据）
    else if (url.includes('/admin/data/')) {
      // 提取表名
      const tableMatch = url.match(/\/admin\/data\/([^?]+)/);
      const tableName = tableMatch ? tableMatch[1] : 'unknown';
      
      addCapturedRequest({
        requestId: details.requestId,
        url: url,
        type: 'tableData',
        tableName: tableName,
        method: details.method,
        timestamp: details.timeStamp
      });
    }
  },
  { urls: ["https://miaoda.feishu.cn/*"] },
  ["extraHeaders"]
);

// 监听发送请求前的回调，捕获请求头
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const request = capturedRequests.find(r => r.requestId === details.requestId);
    if (request) {
      // 保存完整的请求头
      const headers = {};
      for (const h of details.requestHeaders) {
        headers[h.name] = h.value;
      }
      request.headers = headers;
      console.log(`[妙搭导出助手] 捕获请求: ${request.type} - ${request.url.substring(0, 100)}...`);
    }
  },
  { urls: ["https://miaoda.feishu.cn/*"] },
  ["extraHeaders", "requestHeaders"]
);

// 添加捕获的请求
function addCapturedRequest(request) {
  // 限制存储数量
  if (capturedRequests.length >= MAX_REQUESTS) {
    capturedRequests.shift();
  }
  
  // 检查是否已存在相同类型的请求，如果存在则更新
  const existingIndex = capturedRequests.findIndex(
    r => r.type === request.type && r.url === request.url
  );
  if (existingIndex !== -1) {
    capturedRequests[existingIndex] = request;
  } else {
    capturedRequests.push(request);
  }
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getRequests') {
    // 获取所有捕获的请求
    sendResponse(capturedRequests);
    return true;
  }
  else if (request.action === 'clearRequests') {
    // 清除所有请求
    capturedRequests = [];
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === 'fetchData') {
    // 执行数据获取请求
    handleFetchData(request.data)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  else if (request.action === 'executeSQL') {
    // 执行 SQL 查询
    handleExecuteSQL(request.data)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 处理数据获取请求
async function handleFetchData({ url, headers, method = 'GET', body = null }) {
  const options = {
    method: method,
    headers: headers
  };
  
  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
}

// 执行 SQL 查询
async function handleExecuteSQL({ url, headers, query }) {
  // 确保 headers 包含 content-type
  const sqlHeaders = { ...headers };
  sqlHeaders['content-type'] = 'application/json';
  
  return await handleFetchData({
    url: url,
    headers: sqlHeaders,
    method: 'POST',
    body: {
      query: query,
      scene: 'sql_editor'
    }
  });
}

// 监听插件图标点击 - 打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[妙搭导出助手] 插件已激活');
  // 切换侧边栏
  await chrome.sidePanel.open({ tabId: tab.id });
});
