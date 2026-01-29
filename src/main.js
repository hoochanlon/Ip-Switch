import './style.css';
import { invoke } from '@tauri-apps/api/core';
// NOTE: DevTools 打开通过后端命令实现（需要 tauri `devtools` feature）
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
import { initI18n, toggleLanguage, getLanguage, t } from './i18n.js';

// 初始化
async function init() {
  // 初始化 i18n
  initI18n();

  // 同步托盘提示文本（支持后续语言切换）
  try {
    await invoke('set_tray_tooltip', { tooltip: t('appTitle') });
  } catch {
    // ignore
  }

  // 初始化主题
  initTheme();

  // 初始化网卡筛选勾选状态
  state.initSelectedNetworkAdapters();
  
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

  // 后台定期刷新网卡信息：确保插拔网线/切换 Wi‑Fi 后能“实时反馈”
  // - smartRender: 只有关键字段变化才触发重绘，避免界面闪烁
  startNetworkInfoAutoRefresh();
}

let networkInfoAutoRefreshTimer = null;
function startNetworkInfoAutoRefresh() {
  if (networkInfoAutoRefreshTimer) clearInterval(networkInfoAutoRefreshTimer);

  const tick = () => {
    if (state.isNetworkChanging) return;
    // 静默刷新：不打断用户操作，但如果网卡状态变化会 smart render
    refreshNetworkInfo(false, { skipRender: true, smartRender: true });
  };

  // 启动后先来一次
  setTimeout(tick, 1200);
  // 之后每 3 秒刷新一次（足够实时，但不会过度占用）
  networkInfoAutoRefreshTimer = setInterval(tick, 3000);

  // 浏览器 online/offline 事件也来一把“立即刷新”，提高感知速度
  try {
    window.addEventListener('online', () => tick());
    window.addEventListener('offline', () => tick());
  } catch {
    // ignore
  }
}

// 初始化网络状态检测
function initNetworkStatus() {
  // 轻量节流：避免网络抖动/定时检测导致频繁拉取后端网卡信息
  let lastBackendRefreshAt = 0;
  let pendingBackendRefresh = null;

  const maybeRefreshBackendNetworkInfo = async () => {
    if (state.isNetworkChanging) return null;
    const now = Date.now();
    if (pendingBackendRefresh) return pendingBackendRefresh;
    if (now - lastBackendRefreshAt < 1000) return null;

    lastBackendRefreshAt = now;
    // 后台静默刷新：仅更新状态，不重绘界面，避免网卡列表闪烁
    pendingBackendRefresh = refreshNetworkInfo(false, { skipRender: true }).finally(() => {
      pendingBackendRefresh = null;
    });
    return pendingBackendRefresh;
  };

  state.setNetworkStatus(new NetworkStatus((status) => {
    console.log('网络状态:', status.isOnline ? '在线' : '离线');
    
    // 结合后端网络信息进行更准确的判断
    // 优先刷新一次网卡状态（节流），确保托盘颜色不会卡在旧状态
    maybeRefreshBackendNetworkInfo().finally(() => {
      checkNetworkStatusWithBackend();
    });
  }, { checkInterval: 1500, timeout: 1500 }));
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
    // 不仅要检查 is_enabled，还要检查是否有实际连接（有IP地址）
    let hasConnectedEthernet = false;
    let hasConnectedWifi = false;
    
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
        
        // 检查是否有实际连接（启用且有IP地址）
        const hasConnection = adapter.is_enabled && adapter.ip_address;
        
        if (isEthernet && hasConnection) {
          hasConnectedEthernet = true;
        }
        if (isWifi && hasConnection) {
          hasConnectedWifi = true;
        }
      }
    }
    
    // 检查以太网和WiFi是否都断开（没有实际连接）
    const allMainAdaptersDisconnected = !hasConnectedEthernet && !hasConnectedWifi;
    
    // 更新托盘图标颜色
    // 如果前端检测为在线，或者有实际连接的网卡，就不显示红色
    if (allMainAdaptersDisconnected && !frontendStatus) {
      // 以太网和WiFi都断开，且前端检测也为离线，设置为红色
      // 在设置为红色之前，先保存当前颜色（如果还没有保存的话）
      if (!state.getLastTrayColor()) {
        // 优先检查当前场景的颜色
        if (state.currentScene) {
          const scene = state.scenes.find(s => s.name === state.currentScene);
          if (scene && scene.tray_color) {
            state.setLastTrayColor(scene.tray_color);
          } else {
            // 如果没有场景颜色，使用默认蓝色
            state.setLastTrayColor('#3366FF');
          }
        } else {
          // 没有场景，使用默认蓝色
          state.setLastTrayColor('#3366FF');
        }
      }
      try {
        await invoke('update_tray_icon_color', { hexColor: '#FF0000' });
      } catch (error) {
        console.warn('更新托盘图标为红色失败:', error);
      }
    } else {
      // 网络恢复，优先使用场景颜色，其次使用保存的颜色
      let colorToRestore = null;
      
      // 优先检查当前场景的颜色
      if (state.currentScene) {
        const scene = state.scenes.find(s => s.name === state.currentScene);
        if (scene && scene.tray_color) {
          colorToRestore = scene.tray_color;
          // 更新保存的颜色，确保下次恢复时使用场景颜色
          state.setLastTrayColor(scene.tray_color);
        }
      }
      
      // 如果没有场景颜色，使用保存的颜色
      if (!colorToRestore) {
        colorToRestore = state.getLastTrayColor();
      }
      
      // 如果还是没有颜色，使用默认蓝色
      if (!colorToRestore) {
        colorToRestore = '#3366FF';
        state.setLastTrayColor(colorToRestore);
      }
      
      try {
        await invoke('update_tray_icon_color', { hexColor: colorToRestore });
      } catch (error) {
        console.warn('恢复托盘图标颜色失败:', error);
      }
    }
    
    // 更新 UI
    await updateNetworkStatusUI(isOnline);
    
    // 如果网络恢复，自动刷新网络信息（仅更新状态，避免界面闪烁）
    if (isOnline && state.currentNetworkInfo) {
      // 延迟刷新，避免频繁请求
      setTimeout(() => {
        refreshNetworkInfo(false, { skipRender: true });
      }, 1000);
    }
  } catch (error) {
    console.error('检查网络状态失败:', error);
    // 如果检查失败，使用前端检测的结果
    const frontendStatus = state.networkStatus ? state.networkStatus.getStatus().isOnline : navigator.onLine;
    await updateNetworkStatusUI(frontendStatus);
  }
}

// 将函数挂载到 window 对象以便全局访问
window.editHosts = editHosts;
window.editProxy = editProxy;
window.showAboutModal = showAboutModal;
window.closeAboutModal = closeAboutModal;
window.showAutoSwitchConfig = showAutoSwitchConfig;
window.openDevtools = async () => {
  try {
    await invoke('open_devtools');
  } catch (error) {
    console.error('打开开发者工具失败:', error);
    // 给用户一个可见反馈，避免“点了没反应”
    alert(`打开开发者工具失败：${String(error || '').split('\n')[0] || error}`);
  }
};

// 设置事件监听
function setupEventListeners() {
  document.getElementById('refresh-btn').addEventListener('click', () => {
    refreshNetworkInfo(true); // 手动刷新时显示加载提示
  });

  // 打开 Windows “网络连接”控制面板
  const openNetConnBtn = document.getElementById('open-network-connections-btn');
  if (openNetConnBtn) {
    openNetConnBtn.addEventListener('click', async () => {
      try {
        await invoke('open_network_connections');
      } catch (error) {
        console.error('打开网络连接控制面板失败:', error);
        alert(`无法打开“网络连接”控制面板：${String(error || '').split('\n')[0] || error}`);
      }
    });
  }
  document.getElementById('about-btn').addEventListener('click', showAboutModal);
  document.getElementById('create-scene-btn').addEventListener('click', window.createScene);
  document.getElementById('edit-hosts-btn').addEventListener('click', editHosts);
  document.getElementById('edit-proxy-btn').addEventListener('click', editProxy);
  const devtoolsBtn = document.getElementById('open-devtools-btn');
  if (devtoolsBtn) {
    devtoolsBtn.addEventListener('click', () => {
      window.openDevtools();
    });
  }

  // 语言切换按钮
  const langToggleBtn = document.getElementById('lang-toggle-btn');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      toggleLanguage();
      // 根据当前语言切换图标
      try {
        const langIcon = document.getElementById('lang-icon');
        if (langIcon) {
          const currentLang = getLanguage();
          langIcon.src = currentLang === 'zh'
            ? '/imgs/svg/common/translation.svg'
            : '/imgs/svg/common/translation-1.svg';
        }
      } catch {
        // 忽略图标更新错误
      }
    });
  }

  // 语言变化时同步托盘提示文字
  window.addEventListener('languageChanged', async () => {
    try {
      await invoke('set_tray_tooltip', { tooltip: t('appTitle') });
    } catch {
      // ignore
    }

    // 语言切换后：立即刷新 UI 文案（无需用户手动点刷新）
    // - 网络状态标签（在线/离线、场景状态等）
    // - 网络信息卡片/空态文案
    // - 筛选下拉（创建时写死了文案，直接移除让下次打开时按新语言重建）
    try {
      await updateStatusIndicator();
    } catch {
      // ignore
    }
    try {
      renderNetworkInfo();
    } catch {
      // ignore
    }
    try {
      document.getElementById('network-filter-dropdown')?.remove();
    } catch {
      // ignore
    }
  });
  
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

  const autoSwitchConfigBtn = document.getElementById('auto-switch-config-btn');
  if (autoSwitchConfigBtn) {
    autoSwitchConfigBtn.addEventListener('click', () => showAutoSwitchConfig(false));
  }
}

// 启动应用
init();
