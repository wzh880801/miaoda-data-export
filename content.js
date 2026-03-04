// 妙搭数据导出助手 - Content Script
// 用于辅助触发请求捕获

(function() {
  'use strict';

  console.log('[妙搭导出助手] 内容脚本已加载');

  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'refreshTable') {
      // 尝试触发页面刷新数据
      triggerPageRefresh();
      sendResponse({ success: true });
    }
    return true;
  });

  // 尝试触发页面刷新以捕获请求
  function triggerPageRefresh() {
    // 查找可能的刷新按钮
    const refreshBtn = document.querySelector(
      '[data-testid="refresh-btn"], .refresh-btn, .reload-btn, button[title*="刷新"], button[title*="reload"]'
    );
    
    if (refreshBtn) {
      console.log('[妙搭导出助手] 点击刷新按钮');
      refreshBtn.click();
      return true;
    }

    // 如果没有找到刷新按钮，尝试触发页面自己的刷新逻辑
    // 通过触发 visibilitychange 事件可能会触发一些页面重新加载数据
    window.dispatchEvent(new Event('focus'));
    
    return false;
  }

  // 页面加载完成后，尝试自动触发一次数据刷新
  // 这样用户打开插件时，请求已经被捕获了
  setTimeout(() => {
    console.log('[妙搭导出助手] 尝试自动触发数据刷新');
    triggerPageRefresh();
  }, 2000);
})();
