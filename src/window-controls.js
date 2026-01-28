// 窗口控制功能

import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

let appWindow = null;
let syncMaximizeTimer = null;
let hasNativeWindowListener = false;

// 获取窗口实例
async function getWindow() {
  if (!appWindow) {
    appWindow = getCurrentWebviewWindow();
  }
  return appWindow;
}

function scheduleSyncMaximizeState(delay = 80) {
  if (syncMaximizeTimer) clearTimeout(syncMaximizeTimer);
  syncMaximizeTimer = setTimeout(() => {
    updateMaximizeButton();
  }, delay);
}

// 最小化窗口
window.handleMinimize = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  try {
    const window = await getWindow();
    await window.minimize();
  } catch (error) {
    console.error('最小化窗口失败:', error);
  }
  return false;
};

// 最大化/还原窗口
window.handleMaximize = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  try {
    const window = await getWindow();
    const isMaximized = await window.isMaximized();
    if (isMaximized) {
      await window.unmaximize();
    } else {
      await window.maximize();
    }
    await updateMaximizeButton();
  } catch (error) {
    console.error('最大化/还原窗口失败:', error);
  }
  return false;
};

// 关闭窗口
window.handleClose = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  try {
    const window = await getWindow();
    await window.hide();
  } catch (error) {
    console.error('关闭窗口失败:', error);
  }
  return false;
};

// 初始化窗口控制
export async function initWindowControls() {
  appWindow = getCurrentWebviewWindow();
  
  // 初始化最大化按钮状态
  await updateMaximizeButton();
  
  // 优先使用 Tauri 原生窗口事件（更稳定），其次再退回到浏览器 resize
  try {
    const w = await getWindow();
    if (typeof w.onResized === 'function') {
      hasNativeWindowListener = true;
      await w.onResized(() => scheduleSyncMaximizeState());
    }
    // 某些平台提供专门的最大化事件（存在则使用）
    if (typeof w.onMaximized === 'function') {
      hasNativeWindowListener = true;
      await w.onMaximized(() => scheduleSyncMaximizeState(0));
    }
    if (typeof w.onUnmaximized === 'function') {
      hasNativeWindowListener = true;
      await w.onUnmaximized(() => scheduleSyncMaximizeState(0));
    }
  } catch (error) {
    // ignore and fallback below
  }

  if (!hasNativeWindowListener) {
    try {
      window.addEventListener('resize', () => scheduleSyncMaximizeState());
    } catch (error) {
      console.warn('无法监听窗口大小变化:', error);
    }
  }
}

// 更新最大化按钮图标
async function updateMaximizeButton() {
  try {
    const window = await getWindow();
    const maximizeBtn = document.getElementById('window-maximize');
    const maximizeIcon = document.getElementById('window-maximize-icon');
    
    if (maximizeBtn && maximizeIcon) {
      const isMaximized = await window.isMaximized();
      // 给 CSS 一个可靠的开关（最大化时布局更宽）
      try {
        document.body?.classList?.toggle('is-maximized', !!isMaximized);
      } catch {
        // ignore
      }
      if (isMaximized) {
        // 还原图标（两个重叠的矩形）
        maximizeIcon.innerHTML = `
          <rect x="2" y="3" width="6" height="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <rect x="4" y="1" width="6" height="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
        `;
        maximizeBtn.setAttribute('aria-label', '还原');
      } else {
        // 最大化图标（单个矩形）
        maximizeIcon.innerHTML = `
          <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" fill="none"/>
        `;
        maximizeBtn.setAttribute('aria-label', '最大化');
      }
    }
  } catch (error) {
    console.error('更新最大化按钮失败:', error);
  }
}

// 初始化窗口拖拽
export async function initWindowDrag() {
  const dragArea = document.getElementById('window-titlebar');
  if (!dragArea) return;
  
  const window = await getWindow();
  const titlebarLeft = document.querySelector('.titlebar-left');

  // 双击标题栏空白区域：最大化/还原（符合原生窗口习惯）
  dragArea.addEventListener('dblclick', (e) => {
    if (e.target.closest('.titlebar-controls') || e.target.closest('button')) return;
    window.handleMaximize?.(e);
  });
  
  // 只在左侧标题区域启用拖拽
  if (titlebarLeft) {
    titlebarLeft.addEventListener('mousedown', async (e) => {
      // 如果点击的是按钮或可交互元素，不启动拖拽
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
        return;
      }
      
      // 使用Tauri的原生拖拽功能
      try {
        await window.startDragging();
      } catch (error) {
        console.error('启动拖拽失败:', error);
      }
    });
  }
  
  // 标题栏其他区域也可以拖拽（但排除按钮区域）
  dragArea.addEventListener('mousedown', async (e) => {
    // 如果点击的是按钮区域，不启动拖拽
    if (e.target.closest('.titlebar-controls') || e.target.closest('button')) {
      return;
    }
    
    // 使用Tauri的原生拖拽功能
    try {
      const window = await getWindow();
      await window.startDragging();
    } catch (error) {
      console.error('启动拖拽失败:', error);
    }
  });
}
