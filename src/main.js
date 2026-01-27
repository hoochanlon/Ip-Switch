import './style.css';
import { invoke } from '@tauri-apps/api/core';
import NetworkStatus from './network-status.js';
import { initTheme, toggleTheme } from './theme.js';
import * as state from './state.js';
import { refreshNetworkInfo, renderNetworkInfo, initNetworkFilter } from './network.js';
import { loadScenes, renderScenes } from './scenes.js';
import { editHosts } from './hosts.js';
import { editProxy } from './proxy.js';
import { updateStatusIndicator, updateNetworkStatusUI, showAboutModal, closeAboutModal } from './ui.js';
import { initAutoSwitch, showAutoSwitchConfig } from './auto-switch.js';
import { initHostsScheduledUpdate } from './hosts.js';
import { initWindowControls, initWindowDrag } from './window-controls.js';

// 初始化
async function init() {
  // 初始化主题
  initTheme();

  // 初始化网卡筛选勾选状态
  state.initSelectedNetworkAdapters();
  
  // 从本地存储读取视图模式
  const savedMode = localStorage.getItem('viewMode');
  if (savedMode) {
    state.setViewMode(savedMode);
    document.getElementById(`view-mode-${savedMode}`).checked = true;
  }
  
  // 从本地存储读取当前场景
  const savedScene = localStorage.getItem('currentScene');
  if (savedScene) {
    state.setCurrentScene(savedScene);
  }
  
  // 初始化网络状态检测
  initNetworkStatus();
  
  await loadScenes();
  await refreshNetworkInfo(true); // 初始化时显示加载提示
  setupEventListeners();
  
  // 初始化状态指示器
  await updateStatusIndicator();
  
  // 初始化默认托盘颜色（如果没有场景颜色）
  if (!state.getLastTrayColor()) {
    if (state.currentScene) {
      const scene = state.scenes.find(s => s.name === state.currentScene);
      if (scene && scene.tray_color) {
        state.setLastTrayColor(scene.tray_color);
      } else {
        state.setLastTrayColor('#3366FF'); // 默认蓝色
      }
    } else {
      state.setLastTrayColor('#3366FF'); // 默认蓝色
    }
  }
  
  // 网络信息加载后，再次检查网络状态
  checkNetworkStatusWithBackend();
  
  // 监听网络信息更新事件
  window.addEventListener('networkInfoUpdated', checkNetworkStatusWithBackend);
  
  // 初始化自动切换功能
  initAutoSwitch();
  
  // 初始化hosts定时更新功能
  initHostsScheduledUpdate();
  
  // 初始化窗口控制功能
  await initWindowControls();
  await initWindowDrag();
  
  // 初始化网络筛选功能
  initNetworkFilter();
}

// 初始化网络状态检测
function initNetworkStatus() {
  state.setNetworkStatus(new NetworkStatus((status) => {
    console.log('网络状态:', status.isOnline ? '在线' : '离线');
    
    // 结合后端网络信息进行更准确的判断
    checkNetworkStatusWithBackend();
  }));
}

// 结合后端网络信息检查网络状态
export async function checkNetworkStatusWithBackend() {
  try {
    // 检查以太网和WiFi的状态
    let hasEnabledEthernet = false;
    let hasEnabledWifi = false;
    
    if (state.currentNetworkInfo) {
      for (const adapter of state.currentNetworkInfo) {
        const name = adapter.name.toLowerCase();
        const networkType = (adapter.network_type || '').toLowerCase();
        
        // 排除虚拟网卡和蓝牙
        const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
        const isVirtual = virtualKeywords.some(keyword => name.includes(keyword));
        const isBluetooth = networkType === 'bluetooth' || name.includes('bluetooth');
        
        if (isVirtual || isBluetooth) {
          continue;
        }
        
        // 检查以太网
        const isEthernet = networkType === 'ethernet' || (!adapter.is_wireless && (
          name.includes('ethernet') || 
          name.includes('以太网') ||
          (name.includes('lan') && !isVirtual && !name.includes('wlan'))
        ));
        
        // 检查WiFi
        const isWifi = networkType === 'wifi' || (adapter.is_wireless && networkType !== 'bluetooth');
        
        if (isEthernet && adapter.is_enabled) {
          hasEnabledEthernet = true;
        }
        if (isWifi && adapter.is_enabled) {
          hasEnabledWifi = true;
        }
      }
    }
    
    // 检查是否有启用的网络接口
    const hasEnabledAdapter = state.currentNetworkInfo && 
      state.currentNetworkInfo.some(adapter => adapter.is_enabled);
    
    // 获取前端检测的网络状态
    const frontendStatus = state.networkStatus ? state.networkStatus.getStatus().isOnline : navigator.onLine;
    
    // 如果前端检测为离线，或者没有启用的网络接口，标记为离线
    const isOnline = frontendStatus && hasEnabledAdapter;
    
    // 检查以太网和WiFi是否都断开
    const allMainAdaptersDisconnected = !hasEnabledEthernet && !hasEnabledWifi;
    
    // 更新托盘图标颜色
    if (allMainAdaptersDisconnected) {
      // 以太网和WiFi都断开，设置为红色
      try {
        await invoke('update_tray_icon_color', { hexColor: '#FF0000' });
      } catch (error) {
        console.warn('更新托盘图标为红色失败:', error);
      }
    } else {
      // 网络恢复，恢复场景颜色或原色调
      const lastColor = state.getLastTrayColor();
      if (lastColor) {
        try {
          await invoke('update_tray_icon_color', { hexColor: lastColor });
        } catch (error) {
          console.warn('恢复托盘图标颜色失败:', error);
        }
      } else {
        // 如果没有保存的颜色，检查当前场景是否有颜色设置
        if (state.currentScene) {
          const scene = state.scenes.find(s => s.name === state.currentScene);
          if (scene && scene.tray_color) {
            try {
              await invoke('update_tray_icon_color', { hexColor: scene.tray_color });
              state.setLastTrayColor(scene.tray_color);
            } catch (error) {
              console.warn('应用场景托盘颜色失败:', error);
            }
          }
        }
      }
    }
    
    // 更新 UI
    await updateNetworkStatusUI(isOnline);
    
    // 如果网络恢复，自动刷新网络信息
    if (isOnline && state.currentNetworkInfo) {
      // 延迟刷新，避免频繁请求
      setTimeout(() => {
        refreshNetworkInfo();
      }, 1000);
    }
  } catch (error) {
    console.error('检查网络状态失败:', error);
    // 如果检查失败，使用前端检测的结果
    const frontendStatus = state.networkStatus ? state.networkStatus.getStatus().isOnline : navigator.onLine;
    await updateNetworkStatusUI(frontendStatus);
  }
}

// 切换视图模式
window.switchViewMode = function() {
  const simpleRadio = document.getElementById('view-mode-simple');
  state.setViewMode(simpleRadio.checked ? 'simple' : 'full');
  renderNetworkInfo();
};

// 将函数挂载到 window 对象以便全局访问
window.editHosts = editHosts;
window.editProxy = editProxy;
window.showAboutModal = showAboutModal;
window.closeAboutModal = closeAboutModal;
window.showAutoSwitchConfig = showAutoSwitchConfig;

// 设置事件监听
function setupEventListeners() {
  document.getElementById('refresh-btn').addEventListener('click', () => {
    refreshNetworkInfo(true); // 手动刷新时显示加载提示
  });
  document.getElementById('about-btn').addEventListener('click', showAboutModal);
  document.getElementById('create-scene-btn').addEventListener('click', window.createScene);
  document.getElementById('edit-hosts-btn').addEventListener('click', editHosts);
  document.getElementById('edit-proxy-btn').addEventListener('click', editProxy);
  
  // 主题切换按钮
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
  
  const clearBtn = document.getElementById('clear-scenes-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', window.clearScenes);
  }
  
  const exportBtn = document.getElementById('export-scenes-btn');
  const importBtn = document.getElementById('import-scenes-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', window.exportScenesConfig);
  }
  if (importBtn) {
    importBtn.addEventListener('click', window.importScenesConfig);
  }
}

// 点击遮罩层关闭对话框
document.addEventListener('DOMContentLoaded', () => {
  const aboutModal = document.getElementById('about-modal');
  if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) {
        closeAboutModal();
      }
    });
  }
});

// 启动应用
init();
