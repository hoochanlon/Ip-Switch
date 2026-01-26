// 自动双向切换网络配置功能

import { invoke } from '@tauri-apps/api/core';
import * as state from './state.js';
import { refreshNetworkInfo } from './network.js';

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
      if (autoSwitchConfig.enabled) {
        startAutoSwitch();
      }
    } catch (error) {
      console.error('加载自动切换配置失败:', error);
    }
  }
  
  // 监听网络信息更新事件，检测以太网插拔
  window.addEventListener('networkInfoUpdated', checkEthernetStatusChange);
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

// 执行自动切换
async function performAutoSwitch() {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    return;
  }
  
  try {
    const result = await invoke('auto_switch_network', {
      adapterName: autoSwitchConfig.adapterName,
      dhcpConfig: autoSwitchConfig.dhcpConfig,
      staticConfig: autoSwitchConfig.staticConfig,
      dhcpPingTarget: autoSwitchConfig.dhcpPingTarget || 'baidu.com',
      staticPingTarget: autoSwitchConfig.staticPingTarget || autoSwitchConfig.staticConfig?.gateway || '172.16.1.254',
    });
    
    console.log('自动切换结果:', result);
    
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
  
  if (config.enabled) {
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
export function showAutoSwitchConfig() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  
  // 获取以太网适配器
  const ethernetAdapters = state.currentNetworkInfo?.filter(adapter => {
    const name = adapter.name.toLowerCase();
    const networkType = (adapter.network_type || '').toLowerCase();
    
    const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
    const isVirtual = virtualKeywords.some(keyword => name.includes(keyword));
    const isBluetooth = networkType === 'bluetooth' || name.includes('bluetooth');
    
    if (isVirtual || isBluetooth) {
      return false;
    }
    
    return networkType === 'ethernet' || (!adapter.is_wireless && (
      name.includes('ethernet') || 
      name.includes('以太网') ||
      (name.includes('lan') && !isVirtual && !name.includes('wlan'))
    ));
  }) || [];
  
  const adapterOptions = ethernetAdapters.map(adapter => 
    `<option value="${adapter.name}">${adapter.name}</option>`
  ).join('');
  
  const currentConfig = autoSwitchConfig || {
    enabled: false,
    adapterName: ethernetAdapters[0]?.name || '',
    dhcpConfig: {
      dns: ['192.168.1.250', '114.114.114.114']
    },
    staticConfig: {
      ip: '172.16.1.55',
      subnet: '255.255.255.0',
      gateway: '172.16.1.254',
      dns: ['172.16.1.6']
    },
    dhcpPingTarget: 'baidu.com',
    staticPingTarget: '172.16.1.254'
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
          <label for="auto-switch-adapter">以太网适配器:</label>
          <select id="auto-switch-adapter" class="form-input">
            ${adapterOptions}
          </select>
        </div>
        
        <div class="form-group">
          <label>DHCP配置（外网）:</label>
          <div class="form-group">
            <label for="dhcp-dns">DNS服务器（逗号分隔）:</label>
            <input type="text" id="dhcp-dns" class="form-input" 
                   value="${currentConfig.dhcpConfig?.dns?.join(', ') || '192.168.1.250, 114.114.114.114'}">
          </div>
          <div class="form-group">
            <label for="dhcp-ping">Ping测试目标:</label>
            <input type="text" id="dhcp-ping" class="form-input" 
                   value="${currentConfig.dhcpPingTarget || 'baidu.com'}"
                   placeholder="baidu.com">
            <small class="form-hint">如果无法ping通此目标，将切换到静态IP</small>
          </div>
        </div>
        
        <div class="form-group">
          <label>静态IP配置（内网）:</label>
          <div class="form-group">
            <label for="static-ip">IP地址:</label>
            <input type="text" id="static-ip" class="form-input" 
                   value="${currentConfig.staticConfig?.ip || '172.16.1.55'}">
          </div>
          <div class="form-group">
            <label for="static-subnet">子网掩码:</label>
            <input type="text" id="static-subnet" class="form-input" 
                   value="${currentConfig.staticConfig?.subnet || '255.255.255.0'}">
          </div>
          <div class="form-group">
            <label for="static-gateway">网关:</label>
            <input type="text" id="static-gateway" class="form-input" 
                   value="${currentConfig.staticConfig?.gateway || '172.16.1.254'}">
          </div>
          <div class="form-group">
            <label for="static-dns">DNS服务器（逗号分隔）:</label>
            <input type="text" id="static-dns" class="form-input" 
                   value="${currentConfig.staticConfig?.dns?.join(', ') || '172.16.1.6'}">
          </div>
          <div class="form-group">
            <label for="static-ping">Ping测试目标:</label>
            <input type="text" id="static-ping" class="form-input" 
                   value="${currentConfig.staticPingTarget || '172.16.1.254'}"
                   placeholder="172.16.1.254">
            <small class="form-hint">如果无法ping通此目标，将切换到DHCP</small>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="window.saveAutoSwitchConfig()">保存</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 设置默认选中
  if (currentConfig.adapterName) {
    document.getElementById('auto-switch-adapter').value = currentConfig.adapterName;
  }
}

// 保存自动切换配置
window.saveAutoSwitchConfig = function() {
  const enabled = document.getElementById('auto-switch-enabled').checked;
  const adapterName = document.getElementById('auto-switch-adapter').value;
  const dhcpDns = document.getElementById('dhcp-dns').value.trim();
  const dhcpPing = document.getElementById('dhcp-ping').value.trim();
  const staticIp = document.getElementById('static-ip').value.trim();
  const staticSubnet = document.getElementById('static-subnet').value.trim();
  const staticGateway = document.getElementById('static-gateway').value.trim();
  const staticDns = document.getElementById('static-dns').value.trim();
  const staticPing = document.getElementById('static-ping').value.trim();
  
  if (!adapterName) {
    alert('请选择以太网适配器');
    return;
  }
  
  if (!dhcpPing || !staticPing) {
    alert('请填写ping测试目标');
    return;
  }
  
  const config = {
    enabled,
    adapterName,
    dhcpConfig: {
      dns: dhcpDns ? dhcpDns.split(',').map(s => s.trim()).filter(s => s) : []
    },
    staticConfig: {
      ip: staticIp,
      subnet: staticSubnet,
      gateway: staticGateway,
      dns: staticDns ? staticDns.split(',').map(s => s.trim()).filter(s => s) : []
    },
    dhcpPingTarget: dhcpPing,
    staticPingTarget: staticPing
  };
  
  setAutoSwitchConfig(config);
  document.querySelector('.modal-overlay')?.remove();
  alert('自动切换配置已保存');
};
