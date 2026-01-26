// UI 状态指示器和对话框相关功能

import * as state from './state.js';

// 更新状态指示器（网络状态和场景模式）
export async function updateStatusIndicator() {
  // 更新网络状态
  const networkIndicator = document.getElementById('network-status-indicator');
  if (networkIndicator) {
    const isOnline = state.networkStatus ? state.networkStatus.getStatus().isOnline : navigator.onLine;
    networkIndicator.textContent = isOnline ? '在线' : '离线';
    networkIndicator.className = `status-badge ${isOnline ? 'status-online' : 'status-offline'}`;
  }
  
  // 更新场景模式
  const sceneIndicator = document.getElementById('scene-status-indicator');
  if (sceneIndicator) {
    if (state.currentScene) {
      sceneIndicator.textContent = state.currentScene;
      sceneIndicator.className = 'status-badge status-scene-active';
    } else {
      sceneIndicator.textContent = '未应用';
      sceneIndicator.className = 'status-badge status-scene-inactive';
    }
  }
}

// 更新网络状态 UI（保持向后兼容）
export async function updateNetworkStatusUI(isOnline) {
  await updateStatusIndicator();
}

// 显示关于对话框
export function showAboutModal() {
  const modal = document.getElementById('about-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

// 关闭关于对话框
export function closeAboutModal() {
  const modal = document.getElementById('about-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 将函数挂载到 window 对象以便全局访问
window.showAboutModal = showAboutModal;
window.closeAboutModal = closeAboutModal;
