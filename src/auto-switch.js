// 自动双向切换网络配置功能

import { invoke } from '@tauri-apps/api/core';
import * as state from './state.js';
import { refreshNetworkInfo, getNetworkTypeInfo } from './network.js';
import { renderScenes } from './scenes.js';

// 自动切换配置
let autoSwitchConfig = null;
let autoSwitchInterval = null;
let lastEthernetStatus = null;

// 初始化自动切换功能
export function initAutoSwitch() {
  // 从localStorage加载配置
  const savedConfig = localStorage.getItem('autoSwitchConfig');
  if (savedConfig) {
    try {
      autoSwitchConfig = JSON.parse(savedConfig);
      // 兼容旧配置格式（外网=DHCP，内网=静态）
      if (!autoSwitchConfig.network1 || !autoSwitchConfig.network2) {
        autoSwitchConfig = {
          enabled: !!autoSwitchConfig.enabled,
          adapterName: autoSwitchConfig.adapterName,
          currentActive: 'network1',
          network1: {
            mode: 'dhcp',
            dhcp: { dns: autoSwitchConfig.dhcpConfig?.dns || ['192.168.1.250', '114.114.114.114'] },
            staticConfig: { ip: '', subnet: '', gateway: '', dns: [] },
            pingTarget: autoSwitchConfig.dhcpPingTarget || 'baidu.com',
            trayColor: autoSwitchConfig.dhcpTrayColor || '#00FF00'
          },
          network2: {
            mode: 'static',
            dhcp: { dns: [] },
            staticConfig: {
              ip: autoSwitchConfig.staticConfig?.ip || '172.16.1.55',
              subnet: autoSwitchConfig.staticConfig?.subnet || '255.255.255.0',
              gateway: autoSwitchConfig.staticConfig?.gateway || '172.16.1.254',
              dns: autoSwitchConfig.staticConfig?.dns || ['172.16.1.6']
            },
            pingTarget: autoSwitchConfig.staticPingTarget || autoSwitchConfig.staticConfig?.gateway || '172.16.1.254',
            trayColor: autoSwitchConfig.staticTrayColor || '#FFA500'
          }
        };
        localStorage.setItem('autoSwitchConfig', JSON.stringify(autoSwitchConfig));
      }
      if (autoSwitchConfig.enabled) {
        startAutoSwitch();
      }
    } catch (error) {
      console.error('加载自动切换配置失败:', error);
    }
  }
  
  // 监听网络信息更新事件，检测以太网插拔
  window.addEventListener('networkInfoUpdated', checkEthernetStatusChange);
  
  // 初始化复选框
  initAutoSwitchCheckbox();
}

// 初始化自动切换复选框
function initAutoSwitchCheckbox() {
  const checkbox = document.getElementById('auto-switch-checkbox');
  if (!checkbox) return;
  
  // 设置初始状态
  if (autoSwitchConfig && autoSwitchConfig.enabled) {
    checkbox.checked = true;
  }
  
  // 监听复选框变化
  checkbox.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    
    if (enabled) {
      // 如果启用自动切换，先检查是否有配置
      if (!autoSwitchConfig || !autoSwitchConfig.adapterName) {
        // 没有配置，先恢复复选框状态（因为还没有配置）
        e.target.checked = false;
        // 显示配置对话框（标记为从复选框打开，打开前状态为false）
        showAutoSwitchConfig(true);
        return;
      }
      
      // 有配置，直接启用
      // 清除当前场景（二者只能选其一）
      if (state.currentScene) {
        state.setCurrentScene(null);
        await renderScenes();
      }
      
      setAutoSwitchConfig({
        ...autoSwitchConfig,
        enabled: true
      });
    } else {
      // 禁用自动切换
      if (autoSwitchConfig) {
        setAutoSwitchConfig({
          ...autoSwitchConfig,
          enabled: false
        });
      }
    }
  });
  
  // 双击复选框显示配置对话框（不改变复选框状态）
  checkbox.addEventListener('dblclick', (e) => {
    e.preventDefault();
    showAutoSwitchConfig(false);
  });
}

// 更新复选框状态
export function updateAutoSwitchCheckbox() {
  const checkbox = document.getElementById('auto-switch-checkbox');
  if (checkbox) {
    checkbox.checked = autoSwitchConfig && autoSwitchConfig.enabled || false;
  }
}

// 禁用自动切换（当应用场景时调用）
export function disableAutoSwitch() {
  if (autoSwitchConfig && autoSwitchConfig.enabled) {
    setAutoSwitchConfig({
      ...autoSwitchConfig,
      enabled: false
    });
  }
}

// 检查以太网状态变化
function checkEthernetStatusChange() {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    return;
  }
  
  const ethernetAdapter = state.currentNetworkInfo?.find(adapter => {
    const name = adapter.name.toLowerCase();
    const networkType = (adapter.network_type || '').toLowerCase();
    
    // 排除虚拟网卡和蓝牙
    const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
    const isVirtual = virtualKeywords.some(keyword => name.includes(keyword));
    const isBluetooth = networkType === 'bluetooth' || name.includes('bluetooth');
    
    if (isVirtual || isBluetooth) {
      return false;
    }
    
    // 检查以太网
    return networkType === 'ethernet' || (!adapter.is_wireless && (
      name.includes('ethernet') || 
      name.includes('以太网') ||
      (name.includes('lan') && !isVirtual && !name.includes('wlan'))
    ));
  });
  
  if (ethernetAdapter) {
    const currentStatus = ethernetAdapter.is_enabled;
    
    // 检测到状态变化（从断开到连接，或从连接到断开）
    if (lastEthernetStatus !== null && lastEthernetStatus !== currentStatus) {
      console.log('检测到以太网状态变化:', lastEthernetStatus, '->', currentStatus);
      
      // 如果从断开变为连接，触发自动切换检查
      if (currentStatus) {
        setTimeout(() => {
          performAutoSwitch();
        }, 2000); // 等待2秒让网络稳定
      }
    }
    
    lastEthernetStatus = currentStatus;
  } else {
    lastEthernetStatus = null;
  }
}

// 规范化单侧配置，填充默认值
function normalizeNetworkConfig(cfg, defaults) {
  const base = cfg || {};
  return {
    mode: base.mode || defaults.mode,
    dhcp: base.dhcp || defaults.dhcp,
    staticConfig: base.staticConfig || defaults.staticConfig,
    pingTarget: base.pingTarget || defaults.pingTarget,
    trayColor: base.trayColor || defaults.trayColor
  };
}

// 执行自动切换
async function performAutoSwitch() {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    return;
  }
  
  const network1Defaults = {
    mode: 'dhcp',
    dhcp: { dns: ['192.168.1.250', '114.114.114.114'] },
    staticConfig: { ip: '', subnet: '', gateway: '', dns: [] },
    pingTarget: 'baidu.com',
    trayColor: '#00FF00'
  };
  const network2Defaults = {
    mode: 'static',
    dhcp: { dns: [] },
    staticConfig: { ip: '172.16.1.55', subnet: '255.255.255.0', gateway: '172.16.1.254', dns: ['172.16.1.6'] },
    pingTarget: '172.16.1.254',
    trayColor: '#FFA500'
  };

  const network1Config = normalizeNetworkConfig(autoSwitchConfig.network1, network1Defaults);
  const network2Config = normalizeNetworkConfig(autoSwitchConfig.network2, network2Defaults);

  try {
    const result = await invoke('auto_switch_network', {
      adapterName: autoSwitchConfig.adapterName,
      currentActive: autoSwitchConfig.currentActive || 'network1',
      network1Config,
      network2Config
    });
    
    console.log('自动切换结果:', result);

    const activeNetwork = result?.active_network === 'network2' ? 'network2' : 'network1';
    // 持久化当前激活侧，避免依赖网卡状态推断
    autoSwitchConfig = {
      ...autoSwitchConfig,
      network1: network1Config,
      network2: network2Config,
      currentActive: activeNetwork
    };
    localStorage.setItem('autoSwitchConfig', JSON.stringify(autoSwitchConfig));
    
    let trayColor = activeNetwork === 'network2' ? network2Config.trayColor : network1Config.trayColor;
    if (result?.result === 'both_failed') {
      trayColor = '#FF0000';
      console.warn('网络异常：两侧都无法ping通，已回退到原侧');
    }

    if (trayColor) {
      try {
        await invoke('update_tray_icon_color', { hexColor: trayColor });
        state.setLastTrayColor(trayColor);
      } catch (error) {
        console.warn('更新托盘图标颜色失败:', error);
      }
    }
    
    // 刷新网络信息
    await refreshNetworkInfo();
  } catch (error) {
    console.error('自动切换失败:', error);
  }
}

// 启动自动切换
export function startAutoSwitch() {
  if (autoSwitchInterval) {
    clearInterval(autoSwitchInterval);
  }
  
  // 立即执行一次
  performAutoSwitch();
  
  // 每30秒检查一次（作为保险机制）
  autoSwitchInterval = setInterval(() => {
    performAutoSwitch();
  }, 30000);
}

// 停止自动切换
export function stopAutoSwitch() {
  if (autoSwitchInterval) {
    clearInterval(autoSwitchInterval);
    autoSwitchInterval = null;
  }
}

// 设置自动切换配置
export function setAutoSwitchConfig(config) {
  autoSwitchConfig = config;
  localStorage.setItem('autoSwitchConfig', JSON.stringify(config));
  
  // 更新复选框状态
  updateAutoSwitchCheckbox();
  
  if (config.enabled) {
    // 启用自动切换时，清除当前场景（二者只能选其一）
    if (state.currentScene) {
      state.setCurrentScene(null);
      renderScenes();
    }
    startAutoSwitch();
  } else {
    stopAutoSwitch();
  }
}

// 获取自动切换配置
export function getAutoSwitchConfig() {
  return autoSwitchConfig;
}

// 显示自动切换配置对话框
export function showAutoSwitchConfig(fromCheckbox = false) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  
  // 保存对话框打开前的复选框状态（如果是从复选框打开的）
  const checkboxStateBeforeOpen = fromCheckbox ? 
    (document.getElementById('auto-switch-checkbox')?.checked || false) : null;
  
  // 获取主要网卡（WiFi和以太网，排除虚拟网卡和蓝牙）
  const mainAdapters = state.currentNetworkInfo?.filter(adapter => {
    const name = adapter.name.toLowerCase();
    const networkType = (adapter.network_type || '').toLowerCase();
    
    if (networkType === 'bluetooth' || name.includes('bluetooth')) {
      return false;
    }
    
    const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
    const isVirtual = virtualKeywords.some(keyword => name.includes(keyword));
    
    if (isVirtual) {
      return false;
    }
    
    const isWifi = networkType === 'wifi' || (adapter.is_wireless && networkType !== 'bluetooth');
    const isEthernet = networkType === 'ethernet' || (!adapter.is_wireless && (
      name.includes('ethernet') || 
      name.includes('以太网') ||
      (name.includes('lan') && !isVirtual && !name.includes('wlan'))
    ));
    
    return (isWifi || isEthernet) && !isVirtual;
  }) || [];
  
  const adapterOptions = mainAdapters.map(adapter => {
    const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
    return `<option value="${adapter.name}">${adapter.name} (${typeInfo.label})</option>`;
  }).join('');
  
  const currentConfig = autoSwitchConfig || {
    enabled: false,
    adapterName: mainAdapters[0]?.name || '',
    currentActive: 'network1',
    network1: {
      mode: 'dhcp',
      dhcp: { dns: ['192.168.1.250', '114.114.114.114'] },
      staticConfig: { ip: '', subnet: '', gateway: '', dns: [] },
      pingTarget: 'baidu.com',
      trayColor: '#00FF00'
    },
    network2: {
      mode: 'static',
      dhcp: { dns: [] },
      staticConfig: { ip: '172.16.1.55', subnet: '255.255.255.0', gateway: '172.16.1.254', dns: ['172.16.1.6'] },
      pingTarget: '172.16.1.254',
      trayColor: '#FFA500'
    }
  };
  
  modal.innerHTML = `
    <div class="modal-content auto-switch-modal" style="max-width: 600px;">
      <div class="modal-header">
        <h2>自动双向切换配置</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="auto-switch-enabled" ${currentConfig.enabled ? 'checked' : ''}>
            <span>启用自动切换</span>
          </label>
        </div>
        
        <div class="form-group">
          <label for="auto-switch-adapter">网络适配器:</label>
          <select id="auto-switch-adapter" class="form-input">
            ${adapterOptions}
          </select>
        </div>
        
        <div class="form-group">
          <label>网络1配置:</label>
          <div class="form-group">
            <label for="network1-mode">模式:</label>
            <select id="network1-mode" class="form-input">
              <option value="dhcp" ${currentConfig.network1?.mode === 'dhcp' ? 'selected' : ''}>DHCP</option>
              <option value="static" ${currentConfig.network1?.mode === 'static' ? 'selected' : ''}>静态IP</option>
            </select>
          </div>
          <div class="form-group" id="network1-dhcp-fields" style="display: ${currentConfig.network1?.mode === 'dhcp' ? 'block' : 'none'};">
            <label for="network1-dhcp-dns">DNS服务器（逗号分隔）:</label>
            <input type="text" id="network1-dhcp-dns" class="form-input" 
                   value="${currentConfig.network1?.dhcp?.dns?.join(', ') || '192.168.1.250, 114.114.114.114'}">
          </div>
          <div class="form-group" id="network1-static-fields" style="display: ${currentConfig.network1?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <label for="network1-static-ip">IP地址:</label>
              <input type="text" id="network1-static-ip" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.ip || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-subnet">子网掩码:</label>
              <input type="text" id="network1-static-subnet" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.subnet || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-gateway">网关:</label>
              <input type="text" id="network1-static-gateway" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.gateway || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-dns">DNS服务器（逗号分隔）:</label>
              <input type="text" id="network1-static-dns" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.dns?.join(', ') || ''}">
            </div>
          </div>
          <div class="form-group">
            <label for="network1-ping">Ping测试目标:</label>
            <input type="text" id="network1-ping" class="form-input" 
                   value="${currentConfig.network1?.pingTarget || 'baidu.com'}"
                   placeholder="例如: baidu.com 或 1.1.1.1">
            <small class="form-hint">无法ping通时将尝试切换到网络2</small>
          </div>
          <div class="form-group">
            <label for="network1-tray-color">托盘图标颜色（网络1）:</label>
            <div class="color-picker-container">
              <input type="color" id="network1-tray-color-picker" 
                     value="${currentConfig.network1?.trayColor || '#00FF00'}">
              <input type="text" id="network1-tray-color" class="form-input" 
                     placeholder="#00FF00" 
                     value="${currentConfig.network1?.trayColor || '#00FF00'}"
                     pattern="^#[0-9A-Fa-f]{6}$"
                     onchange="window.updateTrayColorPreview('network1')">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>网络2配置:</label>
          <div class="form-group">
            <label for="network2-mode">模式:</label>
            <select id="network2-mode" class="form-input">
              <option value="dhcp" ${currentConfig.network2?.mode === 'dhcp' ? 'selected' : ''}>DHCP</option>
              <option value="static" ${currentConfig.network2?.mode === 'static' ? 'selected' : ''}>静态IP</option>
            </select>
          </div>
          <div class="form-group" id="network2-dhcp-fields" style="display: ${currentConfig.network2?.mode === 'dhcp' ? 'block' : 'none'};">
            <label for="network2-dhcp-dns">DNS服务器（逗号分隔）:</label>
            <input type="text" id="network2-dhcp-dns" class="form-input" 
                   value="${currentConfig.network2?.dhcp?.dns?.join(', ') || ''}">
          </div>
          <div class="form-group" id="network2-static-fields" style="display: ${currentConfig.network2?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <label for="network2-static-ip">IP地址:</label>
              <input type="text" id="network2-static-ip" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.ip || '172.16.1.55'}">
            </div>
            <div class="form-group">
              <label for="network2-static-subnet">子网掩码:</label>
              <input type="text" id="network2-static-subnet" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.subnet || '255.255.255.0'}">
            </div>
            <div class="form-group">
              <label for="network2-static-gateway">网关:</label>
              <input type="text" id="network2-static-gateway" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.gateway || '172.16.1.254'}">
            </div>
            <div class="form-group">
              <label for="network2-static-dns">DNS服务器（逗号分隔）:</label>
              <input type="text" id="network2-static-dns" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.dns?.join(', ') || '172.16.1.6'}">
            </div>
          </div>
          <div class="form-group">
            <label for="network2-ping">Ping测试目标:</label>
            <input type="text" id="network2-ping" class="form-input" 
                   value="${currentConfig.network2?.pingTarget || '172.16.1.254'}"
                   placeholder="例如: 172.16.1.254">
            <small class="form-hint">无法ping通时将尝试切换到网络1</small>
          </div>
          <div class="form-group">
            <label for="network2-tray-color">托盘图标颜色（网络2）:</label>
            <div class="color-picker-container">
              <input type="color" id="network2-tray-color-picker" 
                     value="${currentConfig.network2?.trayColor || '#FFA500'}">
              <input type="text" id="network2-tray-color" class="form-input" 
                     placeholder="#FFA500" 
                     value="${currentConfig.network2?.trayColor || '#FFA500'}"
                     pattern="^#[0-9A-Fa-f]{6}$"
                     onchange="window.updateTrayColorPreview('network2')">
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="window.cancelAutoSwitchConfig(${fromCheckbox ? 'true' : 'false'}, ${checkboxStateBeforeOpen === false ? 'false' : 'null'})">取消</button>
        <button class="btn btn-primary" onclick="window.saveAutoSwitchConfig()">保存</button>
      </div>
    </div>
  `;
  
  // 监听关闭按钮
  modal.querySelector('.modal-close').addEventListener('click', () => {
    if (fromCheckbox && checkboxStateBeforeOpen === false) {
      // 如果是从未选中的复选框打开的，关闭时恢复为未选中
      const checkbox = document.getElementById('auto-switch-checkbox');
      if (checkbox) {
        checkbox.checked = false;
      }
    }
    modal.remove();
  });
  
  // 监听遮罩层点击
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (fromCheckbox && checkboxStateBeforeOpen === false) {
        // 如果是从未选中的复选框打开的，关闭时恢复为未选中
        const checkbox = document.getElementById('auto-switch-checkbox');
        if (checkbox) {
          checkbox.checked = false;
        }
      }
      modal.remove();
    }
  });
  
  document.body.appendChild(modal);
  
  // 设置默认选中
  if (currentConfig.adapterName) {
    document.getElementById('auto-switch-adapter').value = currentConfig.adapterName;
  }

  // 绑定模式切换显示
  const bindModeToggle = (modeId, staticId, dhcpId) => {
    const modeSelect = document.getElementById(modeId);
    const staticFields = document.getElementById(staticId);
    const dhcpFields = document.getElementById(dhcpId);
    if (!modeSelect) return;
    const toggle = () => {
      const isStatic = modeSelect.value === 'static';
      if (staticFields) staticFields.style.display = isStatic ? 'block' : 'none';
      if (dhcpFields) dhcpFields.style.display = isStatic ? 'none' : 'block';
    };
    modeSelect.addEventListener('change', toggle);
    toggle();
  };

  bindModeToggle('network1-mode', 'network1-static-fields', 'network1-dhcp-fields');
  bindModeToggle('network2-mode', 'network2-static-fields', 'network2-dhcp-fields');
}

// 取消自动切换配置
window.cancelAutoSwitchConfig = function(fromCheckbox, checkboxStateBeforeOpen) {
  const modal = document.querySelector('.modal-overlay');
  if (modal) {
    if (fromCheckbox && checkboxStateBeforeOpen === false) {
      // 如果是从未选中的复选框打开的，关闭时恢复为未选中
      const checkbox = document.getElementById('auto-switch-checkbox');
      if (checkbox) {
        checkbox.checked = false;
      }
    }
    modal.remove();
  }
};

// 更新托盘颜色预览
window.updateTrayColorPreview = function(type) {
  const colorInput = document.getElementById(`${type}-tray-color`);
  const colorPicker = document.getElementById(`${type}-tray-color-picker`);
  if (colorInput && colorPicker) {
    const value = colorInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      colorPicker.value = value;
    }
  }
};

// 保存自动切换配置
window.saveAutoSwitchConfig = function() {
  const enabled = document.getElementById('auto-switch-enabled').checked;
  const adapterName = document.getElementById('auto-switch-adapter').value;
  
  const network1Mode = document.getElementById('network1-mode').value;
  const network1DhcpDns = document.getElementById('network1-dhcp-dns').value.trim();
  const network1StaticIp = document.getElementById('network1-static-ip').value.trim();
  const network1StaticSubnet = document.getElementById('network1-static-subnet').value.trim();
  const network1StaticGateway = document.getElementById('network1-static-gateway').value.trim();
  const network1StaticDns = document.getElementById('network1-static-dns').value.trim();
  const network1Ping = document.getElementById('network1-ping').value.trim();
  const network1TrayColorInput = document.getElementById('network1-tray-color');
  const network1TrayColor = network1TrayColorInput ? network1TrayColorInput.value.trim() : '';
  const validNetwork1TrayColor = network1TrayColor && /^#[0-9A-Fa-f]{6}$/.test(network1TrayColor) ? network1TrayColor : '#00FF00';

  const network2Mode = document.getElementById('network2-mode').value;
  const network2DhcpDns = document.getElementById('network2-dhcp-dns').value.trim();
  const network2StaticIp = document.getElementById('network2-static-ip').value.trim();
  const network2StaticSubnet = document.getElementById('network2-static-subnet').value.trim();
  const network2StaticGateway = document.getElementById('network2-static-gateway').value.trim();
  const network2StaticDns = document.getElementById('network2-static-dns').value.trim();
  const network2Ping = document.getElementById('network2-ping').value.trim();
  const network2TrayColorInput = document.getElementById('network2-tray-color');
  const network2TrayColor = network2TrayColorInput ? network2TrayColorInput.value.trim() : '';
  const validNetwork2TrayColor = network2TrayColor && /^#[0-9A-Fa-f]{6}$/.test(network2TrayColor) ? network2TrayColor : '#FFA500';
  
  if (!adapterName) {
    alert('请选择网络适配器');
    return;
  }
  
  if (!network1Ping || !network2Ping) {
    alert('请填写两个网络的ping测试目标');
    return;
  }

  if (network1Mode === 'static') {
    if (!network1StaticIp || !network1StaticSubnet || !network1StaticGateway) {
      alert('网络1静态配置请填写IP/子网/网关');
      return;
    }
  }
  if (network2Mode === 'static') {
    if (!network2StaticIp || !network2StaticSubnet || !network2StaticGateway) {
      alert('网络2静态配置请填写IP/子网/网关');
      return;
    }
  }
  
  const config = {
    enabled,
    adapterName,
    currentActive: autoSwitchConfig?.currentActive || 'network1',
    network1: {
      mode: network1Mode,
      dhcp: {
        dns: network1DhcpDns ? network1DhcpDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      staticConfig: {
        ip: network1StaticIp,
        subnet: network1StaticSubnet,
        gateway: network1StaticGateway,
        dns: network1StaticDns ? network1StaticDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      pingTarget: network1Ping,
      trayColor: validNetwork1TrayColor
    },
    network2: {
      mode: network2Mode,
      dhcp: {
        dns: network2DhcpDns ? network2DhcpDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      staticConfig: {
        ip: network2StaticIp,
        subnet: network2StaticSubnet,
        gateway: network2StaticGateway,
        dns: network2StaticDns ? network2StaticDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      pingTarget: network2Ping,
      trayColor: validNetwork2TrayColor
    }
  };
  
  setAutoSwitchConfig(config);
  document.querySelector('.modal-overlay')?.remove();
  alert('自动切换配置已保存');
  
  // 如果启用了自动切换，更新复选框状态
  if (config.enabled) {
    updateAutoSwitchCheckbox();
  }
};
