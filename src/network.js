// 网络信息相关功能

import { invoke } from '@tauri-apps/api/core';
import * as state from './state.js';
import { escapeHtml } from './utils.js';

// 刷新网络信息
// showLoading: 是否显示加载提示（默认 false，静默刷新）
export async function refreshNetworkInfo(showLoading = false) {
  const container = document.getElementById('network-info');
  
  // 只在需要显示加载提示时才清空内容
  if (showLoading) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #718096;">正在加载网络信息...</div>';
  }
  
  try {
    state.setCurrentNetworkInfo(await invoke('get_network_info'));
    console.log('获取到的网络信息:', state.currentNetworkInfo);
    
    if (!state.currentNetworkInfo || state.currentNetworkInfo.length === 0) {
      // 只在显示加载提示或容器为空时才显示错误信息
      if (showLoading || container.innerHTML.trim() === '') {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #e53e3e;">未检测到网络适配器，请确保以管理员权限运行</div>';
      }
      return;
    }
    
    // 直接渲染，不显示加载提示
    renderNetworkInfo();
  } catch (error) {
    console.error('获取网络信息失败:', error);
    // 只在显示加载提示或容器为空时才显示错误信息
    if (showLoading || container.innerHTML.trim() === '') {
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e53e3e;">获取网络信息失败: ${error}<br><small>请确保以管理员权限运行</small></div>`;
    }
    
    // 即使获取失败，也检查网络状态（通过事件触发）
    window.dispatchEvent(new CustomEvent('networkInfoUpdated'));
  }
}

// 渲染网络信息
export function renderNetworkInfo() {
  if (!state.currentNetworkInfo) return;

  const container = document.getElementById('network-info');
  container.innerHTML = '';

  if (state.viewMode === 'simple') {
    renderSimpleMode(container);
  } else {
    renderFullMode(container);
  }
}

// 简约模式：只显示主要网卡（WiFi和真实以太网）
function renderSimpleMode(container) {
  // 过滤掉虚拟网卡和蓝牙，只保留主要网卡
  const mainAdapters = state.currentNetworkInfo.filter(adapter => {
    const name = adapter.name.toLowerCase();
    const networkType = (adapter.network_type || '').toLowerCase();
    
    // 明确排除蓝牙网络
    if (networkType === 'bluetooth' || name.includes('bluetooth')) {
      return false;
    }
    
    // 排除虚拟网卡
    const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
    const isVirtual = virtualKeywords.some(keyword => name.includes(keyword));
    
    // 只保留WiFi和以太网（包括以太网、以太网1、以太网2等）
    const isWifi = networkType === 'wifi' || (adapter.is_wireless && networkType !== 'bluetooth');
    const isEthernet = networkType === 'ethernet' || (!adapter.is_wireless && (
      name.includes('ethernet') || 
      name.includes('以太网') ||
      (name.includes('lan') && !isVirtual && !name.includes('wlan'))
    ));
    
    return (isWifi || isEthernet) && !isVirtual;
  });
  
  // 按类型分组
  const wifiAdapters = mainAdapters.filter(a => a.is_wireless);
  const ethernetAdapters = mainAdapters.filter(a => !a.is_wireless);
  
  // WiFi显示
  if (wifiAdapters.length > 0) {
    wifiAdapters.forEach(adapter => {
      const card = createSimpleCard(adapter);
      container.appendChild(card);
    });
  }
  
  // 以太网显示（包括以太网、以太网1、以太网2等）
  if (ethernetAdapters.length > 0) {
    ethernetAdapters.forEach(adapter => {
      const card = createSimpleCard(adapter);
      container.appendChild(card);
    });
  }
  
  if (wifiAdapters.length === 0 && ethernetAdapters.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #718096;">未检测到主要网络适配器</div>';
  }
}

// 获取网络类型图标和标签
export function getNetworkTypeInfo(networkType) {
  const types = {
    'wifi': { icon: 'imgs/svg/status/wifi.svg', label: 'WiFi', class: 'wifi' },
    'ethernet': { icon: 'imgs/svg/status/ethernet.svg', label: '以太网', class: 'ethernet' },
    'bluetooth': { icon: 'imgs/svg/status/bluetooth.svg', label: '蓝牙', class: 'bluetooth' },
    'vpn': { icon: 'imgs/svg/status/vpn.svg', label: 'VPN', class: 'vpn' },
    'other': { icon: 'imgs/svg/status/connect.svg', label: '其他', class: 'other' }
  };
  return types[networkType] || types['other'];
}

// 创建简约模式卡片（单个适配器）
function createSimpleCard(adapter) {
  const card = document.createElement('div');
  const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
  card.className = `network-card simple-card ${typeInfo.class}-card`;
  
  const ipType = adapter.is_dhcp ? '动态IP (DHCP)' : '静态IP';
  const status = adapter.is_enabled ? '已连接' : '未连接';
  
  card.innerHTML = `
    <div class="network-header">
      <div>
        <h3>${adapter.name}</h3>
        <span class="network-type-badge ${typeInfo.class}">
          <img src="${typeInfo.icon}" alt="${typeInfo.label}" class="network-icon">
          ${typeInfo.label}
        </span>
      </div>
      <span class="status-badge ${adapter.is_enabled ? 'enabled' : 'disabled'}">${status}</span>
    </div>
    <div class="network-details-simple">
      <div class="detail-row">
        <span class="label">IP类型:</span>
        <span class="value">${ipType}</span>
      </div>
      <div class="detail-row">
        <span class="label">IP地址:</span>
        <span class="value">${adapter.ip_address || '未配置'}</span>
      </div>
      <div class="detail-row">
        <span class="label">网关:</span>
        <span class="value">${adapter.gateway || '未配置'}</span>
      </div>
      <div class="detail-row">
        <span class="label">DNS:</span>
        <span class="value">${adapter.dns_servers?.join(', ') || '未配置'}</span>
      </div>
    </div>
    <button class="btn btn-primary" onclick="window.editNetworkConfig('${adapter.name}')">配置网络</button>
  `;
  
  return card;
}

// 完全模式：显示所有适配器详情
function renderFullMode(container) {
  // 按类型分组：WiFi 优先显示
  const sortedAdapters = [...state.currentNetworkInfo].sort((a, b) => {
    if (a.is_wireless && !b.is_wireless) return -1;
    if (!a.is_wireless && b.is_wireless) return 1;
    return 0;
  });

  sortedAdapters.forEach(adapter => {
    const card = document.createElement('div');
    const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
    card.className = `network-card ${typeInfo.class}-card`;
    
    const ipType = adapter.is_dhcp ? '动态IP (DHCP)' : '静态IP';
    const status = adapter.is_enabled ? '已连接' : '未连接';
    
    card.innerHTML = `
      <div class="network-header">
        <div>
          <h3>${adapter.name}</h3>
          <span class="network-type-badge ${typeInfo.class}">
            <img src="${typeInfo.icon}" alt="${typeInfo.label}" class="network-icon">
            ${typeInfo.label}
          </span>
        </div>
        <span class="status-badge ${adapter.is_enabled ? 'enabled' : 'disabled'}">${status}</span>
      </div>
      <div class="network-details">
        <div class="detail-row">
          <span class="label">IP类型:</span>
          <span class="value">${ipType}</span>
        </div>
        <div class="detail-row">
          <span class="label">IP地址:</span>
          <span class="value">${adapter.ip_address || '未配置'}</span>
        </div>
        <div class="detail-row">
          <span class="label">子网掩码:</span>
          <span class="value">${adapter.subnet_mask || '未配置'}</span>
        </div>
        <div class="detail-row">
          <span class="label">网关:</span>
          <span class="value">${adapter.gateway || '未配置'}</span>
        </div>
        <div class="detail-row">
          <span class="label">DNS:</span>
          <span class="value">${adapter.dns_servers?.join(', ') || '未配置'}</span>
        </div>
        <div class="detail-row">
          <span class="label">MAC地址:</span>
          <span class="value">${adapter.mac_address || '未知'}</span>
        </div>
      </div>
      <button class="btn btn-primary" onclick="window.editNetworkConfig('${adapter.name}')">配置网络</button>
    `;
    
    container.appendChild(card);
  });
}

// 编辑网络配置 - 使用表单界面
window.editNetworkConfig = async function(adapterName) {
  const adapter = state.currentNetworkInfo.find(a => a.name === adapterName);
  if (!adapter) return;

  showNetworkConfigEditor(adapter);
};

// 显示网络配置编辑器
function showNetworkConfigEditor(adapter) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content network-config-modal">
      <div class="modal-header">
        <h2>配置网络: ${escapeHtml(adapter.name)}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="radio-group-label">IP配置类型:</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="ip-type" value="dhcp" id="ip-type-dhcp" ${adapter.is_dhcp ? 'checked' : ''} onchange="window.toggleStaticIPFields()">
              <span>动态IP (DHCP)</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="ip-type" value="static" id="ip-type-static" ${!adapter.is_dhcp ? 'checked' : ''} onchange="window.toggleStaticIPFields()">
              <span>静态IP</span>
            </label>
          </div>
        </div>
        
        <div id="static-ip-fields" style="display: ${adapter.is_dhcp ? 'none' : 'block'};">
          <div class="form-group">
            <label for="ip-address">IP地址:</label>
            <input type="text" id="ip-address" class="form-input" 
                   placeholder="192.168.1.100" 
                   value="${adapter.ip_address || ''}"
                   pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$">
            <small class="form-hint">例如: 192.168.1.100</small>
          </div>
          
          <div class="form-group">
            <label for="subnet-mask">子网掩码:</label>
            <input type="text" id="subnet-mask" class="form-input" 
                   placeholder="255.255.255.0" 
                   value="${adapter.subnet_mask || ''}"
                   pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$">
            <small class="form-hint">例如: 255.255.255.0</small>
          </div>
          
          <div class="form-group">
            <label for="gateway">网关:</label>
            <input type="text" id="gateway" class="form-input" 
                   placeholder="192.168.1.1" 
                   value="${adapter.gateway || ''}"
                   pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$">
            <small class="form-hint">例如: 192.168.1.1</small>
          </div>
          
          <div class="form-group">
            <label for="dns-servers">DNS服务器:</label>
            <input type="text" id="dns-servers" class="form-input" 
                   placeholder="8.8.8.8,8.8.4.4" 
                   value="${adapter.dns_servers?.join(', ') || ''}">
            <small class="form-hint">多个DNS服务器用逗号分隔，例如: 8.8.8.8,8.8.4.4</small>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="window.saveNetworkConfig('${adapter.name}')">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // 初始化显示状态
  window.toggleStaticIPFields();
}

// 切换静态IP字段显示
window.toggleStaticIPFields = function() {
  const dhcpRadio = document.getElementById('ip-type-dhcp');
  const staticFields = document.getElementById('static-ip-fields');
  
  if (staticFields) {
    staticFields.style.display = dhcpRadio.checked ? 'none' : 'block';
  }
};

// 保存网络配置
window.saveNetworkConfig = async function(adapterName) {
  const dhcpRadio = document.getElementById('ip-type-dhcp');
  const useDHCP = dhcpRadio.checked;
  
  if (useDHCP) {
    try {
      await invoke('set_dhcp', { adapterName });
      alert('已切换到动态IP (DHCP)');
      await refreshNetworkInfo();
      document.querySelector('.modal-overlay')?.remove();
    } catch (error) {
      alert('配置失败: ' + error);
    }
  } else {
    // 验证静态IP配置
    const ip = document.getElementById('ip-address').value.trim();
    const subnet = document.getElementById('subnet-mask').value.trim();
    const gateway = document.getElementById('gateway').value.trim();
    const dnsText = document.getElementById('dns-servers').value.trim();
    
    if (!ip || !subnet || !gateway) {
      alert('请填写完整的IP配置信息（IP地址、子网掩码、网关）');
      return;
    }
    
    // 简单的IP格式验证
    const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipPattern.test(ip) || !ipPattern.test(subnet) || !ipPattern.test(gateway)) {
      alert('IP地址格式不正确，请使用正确的IPv4格式');
      return;
    }
    
    const dns = dnsText ? dnsText.split(',').map(s => s.trim()).filter(s => s) : [];
    
    try {
      await invoke('set_static_ip', {
        adapterName,
        ip,
        subnet,
        gateway,
        dns
      });
      alert('静态IP配置成功');
      await refreshNetworkInfo();
      document.querySelector('.modal-overlay')?.remove();
    } catch (error) {
      alert('配置失败: ' + error);
    }
  }
};
