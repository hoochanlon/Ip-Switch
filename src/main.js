import './style.css';
import { invoke } from '@tauri-apps/api/core';
import NetworkStatus from './network-status.js';

// 应用状态
let currentNetworkInfo = null;
let viewMode = 'simple'; // 'simple' 或 'full'
let scenes = [];
let currentScene = null;
let networkStatus = null;

// 初始化
async function init() {
  // 从本地存储读取视图模式
  const savedMode = localStorage.getItem('viewMode');
  if (savedMode) {
    viewMode = savedMode;
    document.getElementById(`view-mode-${savedMode}`).checked = true;
  }
  
  // 从本地存储读取当前场景
  const savedScene = localStorage.getItem('currentScene');
  if (savedScene) {
    currentScene = savedScene;
  }
  
  // 初始化网络状态检测
  initNetworkStatus();
  
  await loadScenes();
  await refreshNetworkInfo(true); // 初始化时显示加载提示
  setupEventListeners();
  
  // 初始化状态指示器
  await updateStatusIndicator();
  
  // 网络信息加载后，再次检查网络状态
  checkNetworkStatusWithBackend();
}

// 初始化网络状态检测
function initNetworkStatus() {
  networkStatus = new NetworkStatus((status) => {
    console.log('网络状态:', status.isOnline ? '在线' : '离线');
    
    // 结合后端网络信息进行更准确的判断
    checkNetworkStatusWithBackend();
  });
}

// 结合后端网络信息检查网络状态
async function checkNetworkStatusWithBackend() {
  try {
    // 检查是否有启用的网络接口
    const hasEnabledAdapter = currentNetworkInfo && 
      currentNetworkInfo.some(adapter => adapter.is_enabled);
    
    // 获取前端检测的网络状态
    const frontendStatus = networkStatus ? networkStatus.getStatus().isOnline : navigator.onLine;
    
    // 如果前端检测为离线，或者没有启用的网络接口，标记为离线
    const isOnline = frontendStatus && hasEnabledAdapter;
    
    // 更新 UI
    await updateNetworkStatusUI(isOnline);
    
    // 如果网络恢复，自动刷新网络信息
    if (isOnline && currentNetworkInfo) {
      // 延迟刷新，避免频繁请求
      setTimeout(() => {
        refreshNetworkInfo();
      }, 1000);
    }
  } catch (error) {
    console.error('检查网络状态失败:', error);
    // 如果检查失败，使用前端检测的结果
    const frontendStatus = networkStatus ? networkStatus.getStatus().isOnline : navigator.onLine;
    await updateNetworkStatusUI(frontendStatus);
  }
}

// 更新状态指示器（网络状态和场景模式）
async function updateStatusIndicator() {
  // 更新网络状态
  const networkIndicator = document.getElementById('network-status-indicator');
  if (networkIndicator) {
    const isOnline = networkStatus ? networkStatus.getStatus().isOnline : navigator.onLine;
    networkIndicator.textContent = isOnline ? '在线' : '离线';
    networkIndicator.className = `status-badge ${isOnline ? 'status-online' : 'status-offline'}`;
  }
  
  // 更新场景模式
  const sceneIndicator = document.getElementById('scene-status-indicator');
  if (sceneIndicator) {
    if (currentScene) {
      sceneIndicator.textContent = currentScene;
      sceneIndicator.className = 'status-badge status-scene-active';
    } else {
      sceneIndicator.textContent = '未应用';
      sceneIndicator.className = 'status-badge status-scene-inactive';
    }
  }
  
  // 检查是否有备份，显示/隐藏解除场景按钮
  const restoreItem = document.getElementById('restore-scene-item');
  if (restoreItem) {
    try {
      const hasBackup = await invoke('has_backup');
      restoreItem.style.display = hasBackup ? 'flex' : 'none';
    } catch (error) {
      console.error('检查备份状态失败:', error);
      restoreItem.style.display = 'none';
    }
  }
}

// 更新网络状态 UI（保持向后兼容）
async function updateNetworkStatusUI(isOnline) {
  await updateStatusIndicator();
}

// 加载场景列表
async function loadScenes() {
  try {
    scenes = await invoke('get_scenes');
    
    // 验证保存的场景是否仍然存在
    if (currentScene) {
      const sceneExists = scenes.some(s => s.name === currentScene);
      if (!sceneExists) {
        // 如果保存的场景不存在，清除状态
        currentScene = null;
        localStorage.removeItem('currentScene');
      }
    }
    
    renderScenes();
  } catch (error) {
    console.error('加载场景失败:', error);
  }
}

// 渲染场景列表
function renderScenes() {
  const container = document.getElementById('scenes-list');
  container.innerHTML = '';
  
  if (scenes.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #718096; font-size: 12px;">暂无场景<br>点击"新建场景"创建</div>';
    return;
  }
  
  scenes.forEach((scene) => {
    const item = document.createElement('div');
    item.className = `scene-item ${currentScene === scene.name ? 'active' : ''}`;
    
    const networkCount = scene.network_configs ? Object.keys(scene.network_configs).length : 0;
    
    item.innerHTML = `
      <div class="scene-info">
        <span class="scene-name">${scene.name}</span>
        <span class="scene-details">${networkCount} 个网卡</span>
      </div>
      <div class="scene-actions">
        <button class="btn btn-sm" onclick="applyScene('${scene.name}')">应用</button>
        <button class="btn btn-sm" onclick="editScene('${scene.name}')">编辑</button>
        <button class="btn btn-sm" onclick="deleteScene('${scene.name}')">删除</button>
      </div>
    `;
    container.appendChild(item);
  });
}

// 切换视图模式
window.switchViewMode = function() {
  const simpleRadio = document.getElementById('view-mode-simple');
  viewMode = simpleRadio.checked ? 'simple' : 'full';
  localStorage.setItem('viewMode', viewMode);
  renderNetworkInfo();
};

// 刷新网络信息
// showLoading: 是否显示加载提示（默认 false，静默刷新）
async function refreshNetworkInfo(showLoading = false) {
  const container = document.getElementById('network-info');
  
  // 只在需要显示加载提示时才清空内容
  if (showLoading) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #718096;">正在加载网络信息...</div>';
  }
  
  try {
    currentNetworkInfo = await invoke('get_network_info');
    console.log('获取到的网络信息:', currentNetworkInfo);
    
    if (!currentNetworkInfo || currentNetworkInfo.length === 0) {
      // 只在显示加载提示或容器为空时才显示错误信息
      if (showLoading || container.innerHTML.trim() === '') {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #e53e3e;">未检测到网络适配器，请确保以管理员权限运行</div>';
      }
      return;
    }
    
    // 直接渲染，不显示加载提示
    renderNetworkInfo();
    
    // 网络信息更新后，重新检查网络状态
    checkNetworkStatusWithBackend();
  } catch (error) {
    console.error('获取网络信息失败:', error);
    // 只在显示加载提示或容器为空时才显示错误信息
    if (showLoading || container.innerHTML.trim() === '') {
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e53e3e;">获取网络信息失败: ${error}<br><small>请确保以管理员权限运行</small></div>`;
    }
    
    // 即使获取失败，也检查网络状态
    checkNetworkStatusWithBackend();
  }
}

// 渲染网络信息
function renderNetworkInfo() {
  if (!currentNetworkInfo) return;

  const container = document.getElementById('network-info');
  container.innerHTML = '';

  if (viewMode === 'simple') {
    renderSimpleMode(container);
  } else {
    renderFullMode(container);
  }
}

// 简约模式：只显示主要网卡（WiFi和真实以太网）
function renderSimpleMode(container) {
  // 过滤掉虚拟网卡和蓝牙，只保留主要网卡
  const mainAdapters = currentNetworkInfo.filter(adapter => {
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
function getNetworkTypeInfo(networkType) {
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
    <button class="btn btn-primary" onclick="editNetworkConfig('${adapter.name}')">配置网络</button>
  `;
  
  return card;
}

// 完全模式：显示所有适配器详情
function renderFullMode(container) {
  // 按类型分组：WiFi 优先显示
  const sortedAdapters = [...currentNetworkInfo].sort((a, b) => {
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
      <button class="btn btn-primary" onclick="editNetworkConfig('${adapter.name}')">配置网络</button>
    `;
    
    container.appendChild(card);
  });
}

// 编辑网络配置 - 使用表单界面
window.editNetworkConfig = async function(adapterName) {
  const adapter = currentNetworkInfo.find(a => a.name === adapterName);
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
              <input type="radio" name="ip-type" value="dhcp" id="ip-type-dhcp" ${adapter.is_dhcp ? 'checked' : ''} onchange="toggleStaticIPFields()">
              <span>动态IP (DHCP)</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="ip-type" value="static" id="ip-type-static" ${!adapter.is_dhcp ? 'checked' : ''} onchange="toggleStaticIPFields()">
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
        <button class="btn btn-primary" onclick="saveNetworkConfig('${adapter.name}')">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // 初始化显示状态
  toggleStaticIPFields();
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


// 编辑Hosts - 使用文本编辑器界面
window.editHosts = async function() {
  try {
    const content = await invoke('get_hosts');
    showHostsEditor(content);
  } catch (error) {
    alert('加载Hosts文件失败: ' + error);
  }
};

// 显示Hosts编辑器
function showHostsEditor(content) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content hosts-modal">
      <div class="modal-header">
        <h2>编辑 Hosts 文件</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <textarea id="hosts-editor" class="hosts-editor" spellcheck="false">${escapeHtml(content)}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="saveHosts()">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // 聚焦到编辑器
  setTimeout(() => {
    const editor = document.getElementById('hosts-editor');
    if (editor) {
      editor.focus();
      editor.setSelectionRange(0, 0);
    }
  }, 100);
}

// 保存Hosts
window.saveHosts = async function() {
  const editor = document.getElementById('hosts-editor');
  if (!editor) return;
  
  try {
    await invoke('set_hosts', { content: editor.value });
    alert('Hosts文件已更新');
    document.querySelector('.modal-overlay')?.remove();
  } catch (error) {
    alert('更新Hosts失败: ' + error);
  }
};

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 编辑代理 - 使用表单界面
window.editProxy = async function() {
  try {
    const proxy = await invoke('get_proxy');
    showProxyEditor(proxy);
  } catch (error) {
    alert('加载代理配置失败: ' + error);
  }
};

// 显示代理编辑器
function showProxyEditor(proxy) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content proxy-modal">
      <div class="modal-header">
        <h2>编辑代理配置</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="proxy-enabled" ${proxy.enabled ? 'checked' : ''}>
            <span>启用代理</span>
          </label>
        </div>
        <div class="form-group">
          <label for="proxy-server">代理服务器:</label>
          <input type="text" id="proxy-server" class="form-input" 
                 placeholder="127.0.0.1:8080" 
                 value="${proxy.server || ''}">
          <small class="form-hint">格式: IP:端口 或 域名:端口</small>
        </div>
        <div class="form-group">
          <label for="proxy-bypass">绕过列表:</label>
          <textarea id="proxy-bypass" class="form-textarea" 
                    placeholder="localhost;127.0.0.1;*.local">${proxy.bypass?.join(';') || ''}</textarea>
          <small class="form-hint">多个地址用分号(;)分隔，例如: localhost;127.0.0.1;*.local</small>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="saveProxy()">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// 保存代理配置
window.saveProxy = async function() {
  const enabled = document.getElementById('proxy-enabled').checked;
  const server = document.getElementById('proxy-server').value.trim();
  const bypassText = document.getElementById('proxy-bypass').value.trim();
  
  if (enabled && !server) {
    alert('启用代理时必须填写代理服务器地址');
    return;
  }
  
  const bypass = bypassText ? bypassText.split(';').map(s => s.trim()).filter(s => s) : [];
  
  try {
    await invoke('set_proxy', {
      enabled,
      server: enabled ? server : '',
      bypass
    });
    alert('代理配置已更新');
    document.querySelector('.modal-overlay')?.remove();
  } catch (error) {
    alert('更新代理失败: ' + error);
  }
};

// 新建场景
window.createScene = async function() {
  if (!currentNetworkInfo || currentNetworkInfo.length === 0) {
    alert('没有可用的网络适配器');
    return;
  }
  
  showSceneEditor();
};

// 编辑场景
window.editScene = async function(sceneName) {
  try {
    const scene = scenes.find(s => s.name === sceneName);
    if (!scene) {
      alert('场景不存在');
      return;
    }
    showSceneEditor(scene);
  } catch (error) {
    alert('加载场景失败: ' + error);
  }
};

// 显示场景编辑器
function showSceneEditor(existingScene = null) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  
  // 获取主要网卡（简约模式下显示的网卡）
  const mainAdapters = currentNetworkInfo.filter(adapter => {
    const name = adapter.name.toLowerCase();
    const networkType = (adapter.network_type || '').toLowerCase();
    
    if (networkType === 'bluetooth' || name.includes('bluetooth')) {
      return false;
    }
    
    const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
    const isVirtual = virtualKeywords.some(keyword => name.includes(keyword));
    
    const isWifi = networkType === 'wifi' || (adapter.is_wireless && networkType !== 'bluetooth');
    const isEthernet = networkType === 'ethernet' || (!adapter.is_wireless && (
      name.includes('ethernet') || 
      name.includes('以太网') ||
      (name.includes('lan') && !isVirtual && !name.includes('wlan'))
    ));
    
    return (isWifi || isEthernet) && !isVirtual;
  });
  
  // 生成网卡配置列表
  const adapterConfigs = mainAdapters.map(adapter => {
    const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
    const existingConfig = existingScene?.network_configs?.[adapter.name];
    const isSelected = !!existingConfig;
    
    return {
      adapter,
      typeInfo,
      config: existingConfig || {
        is_dhcp: adapter.is_dhcp,
        ip: adapter.ip_address,
        subnet: adapter.subnet_mask,
        gateway: adapter.gateway,
        dns: adapter.dns_servers
      },
      isSelected
    };
  });
  
  const sceneName = existingScene ? existingScene.name : '';
  const adapterListHtml = adapterConfigs.map(({ adapter, typeInfo, config, isSelected }) => `
    <div class="scene-adapter-config" data-adapter="${adapter.name}">
      <div class="scene-adapter-header">
        <label class="checkbox-label">
          <input type="checkbox" class="adapter-select" ${isSelected ? 'checked' : ''} 
                 onchange="toggleAdapterConfig('${adapter.name}', this.checked)">
          <div class="adapter-info">
            <img src="${typeInfo.icon}" alt="${typeInfo.label}" class="network-icon-small">
            <span class="adapter-name">${adapter.name}</span>
          </div>
        </label>
      </div>
      <div class="scene-adapter-fields" style="display: ${isSelected ? 'block' : 'none'};">
        <div class="form-group">
          <label class="radio-label">
            <input type="radio" name="ip-type-${adapter.name}" value="dhcp" 
                   ${config.is_dhcp ? 'checked' : ''} 
                   onchange="updateAdapterConfigType('${adapter.name}', true)">
            <span>动态IP (DHCP)</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="ip-type-${adapter.name}" value="static" 
                   ${!config.is_dhcp ? 'checked' : ''} 
                   onchange="updateAdapterConfigType('${adapter.name}', false)">
            <span>静态IP</span>
          </label>
        </div>
        <div class="static-ip-config" style="display: ${config.is_dhcp ? 'none' : 'block'};">
          <div class="form-group">
            <input type="text" class="form-input" placeholder="IP地址" 
                   value="${config.ip || ''}" 
                   onchange="updateAdapterConfig('${adapter.name}', 'ip', this.value)">
          </div>
          <div class="form-group">
            <input type="text" class="form-input" placeholder="子网掩码" 
                   value="${config.subnet || ''}" 
                   onchange="updateAdapterConfig('${adapter.name}', 'subnet', this.value)">
          </div>
          <div class="form-group">
            <input type="text" class="form-input" placeholder="网关" 
                   value="${config.gateway || ''}" 
                   onchange="updateAdapterConfig('${adapter.name}', 'gateway', this.value)">
          </div>
          <div class="form-group">
            <input type="text" class="form-input" placeholder="DNS (逗号分隔)" 
                   value="${config.dns?.join(', ') || ''}" 
                   onchange="updateAdapterConfig('${adapter.name}', 'dns', this.value)">
          </div>
        </div>
      </div>
    </div>
  `).join('');
  
  modal.innerHTML = `
    <div class="modal-content scene-editor-modal">
      <div class="modal-header">
        <h2>${existingScene ? '编辑场景' : '新建场景'}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="scene-name">场景名称:</label>
          <input type="text" id="scene-name" class="form-input" 
                 placeholder="例如: 办公室网络" 
                 value="${sceneName}">
        </div>
        <div class="form-group">
          <label for="tray-color">托盘图标颜色:</label>
          <div class="color-picker-container">
            <input type="color" id="tray-color-picker" 
                   value="${existingScene?.tray_color || '#3366FF'}">
            <input type="text" id="tray-color" class="form-input" 
                   placeholder="#3366FF" 
                   value="${existingScene?.tray_color || ''}"
                   pattern="^#[0-9A-Fa-f]{6}$"
                   onchange="updateTrayColorPreview()">
          </div>
          <small class="form-hint">支持十六进制颜色格式，例如: #3366FF（蓝色）</small>
        </div>
        <div class="form-group">
          <label>选择要配置的网卡:</label>
          <div class="scene-adapters-list">
            ${adapterListHtml}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="saveSceneConfig()">保存场景</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // 存储适配器配置数据
  window.sceneAdapterConfigs = {};
  adapterConfigs.forEach(({ adapter, config, isSelected }) => {
    if (isSelected) {
      window.sceneAdapterConfigs[adapter.name] = { ...config };
    }
  });
  
  // 设置颜色选择器的同步
  const colorPicker = document.getElementById('tray-color-picker');
  const colorInput = document.getElementById('tray-color');
  if (colorPicker && colorInput) {
    colorPicker.addEventListener('input', function() {
      colorInput.value = this.value.toUpperCase();
    });
    colorInput.addEventListener('input', function() {
      const value = this.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        colorPicker.value = value;
      }
    });
  }
}

// 更新托盘颜色预览
window.updateTrayColorPreview = function() {
  const colorInput = document.getElementById('tray-color');
  const colorPicker = document.getElementById('tray-color-picker');
  if (colorInput && colorPicker) {
    const value = colorInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      colorPicker.value = value;
    }
  }
};

// 切换适配器配置显示
window.toggleAdapterConfig = function(adapterName, enabled) {
  const configDiv = document.querySelector(`[data-adapter="${adapterName}"] .scene-adapter-fields`);
  if (configDiv) {
    configDiv.style.display = enabled ? 'block' : 'none';
  }
  
  if (!enabled) {
    delete window.sceneAdapterConfigs[adapterName];
  } else if (!window.sceneAdapterConfigs[adapterName]) {
    const adapter = currentNetworkInfo.find(a => a.name === adapterName);
    if (adapter) {
      window.sceneAdapterConfigs[adapterName] = {
        is_dhcp: adapter.is_dhcp,
        ip: adapter.ip_address || '',
        subnet: adapter.subnet_mask || '',
        gateway: adapter.gateway || '',
        dns: adapter.dns_servers || []
      };
    }
  }
};

// 更新适配器配置类型
window.updateAdapterConfigType = function(adapterName, isDhcp) {
  if (!window.sceneAdapterConfigs[adapterName]) return;
  
  window.sceneAdapterConfigs[adapterName].is_dhcp = isDhcp;
  const staticConfig = document.querySelector(`[data-adapter="${adapterName}"] .static-ip-config`);
  if (staticConfig) {
    staticConfig.style.display = isDhcp ? 'none' : 'block';
  }
};

// 更新适配器配置
window.updateAdapterConfig = function(adapterName, field, value) {
  if (!window.sceneAdapterConfigs[adapterName]) return;
  
  if (field === 'dns') {
    window.sceneAdapterConfigs[adapterName].dns = value ? value.split(',').map(s => s.trim()).filter(s => s) : [];
  } else {
    window.sceneAdapterConfigs[adapterName][field] = value;
  }
};

// 保存场景配置
window.saveSceneConfig = async function() {
  const sceneName = document.getElementById('scene-name').value.trim();
  if (!sceneName) {
    alert('请输入场景名称');
    return;
  }
  
  const selectedAdapters = Object.keys(window.sceneAdapterConfigs || {});
  if (selectedAdapters.length === 0) {
    alert('请至少选择一个网卡并配置');
    return;
  }
  
  try {
    const networkConfigs = {};
    for (const adapterName of selectedAdapters) {
      const config = window.sceneAdapterConfigs[adapterName];
      networkConfigs[adapterName] = {
        is_dhcp: config.is_dhcp,
        ip: config.is_dhcp ? null : (config.ip || null),
        subnet: config.is_dhcp ? null : (config.subnet || null),
        gateway: config.is_dhcp ? null : (config.gateway || null),
        dns: config.is_dhcp ? null : (config.dns || null)
      };
    }
    
    // 获取托盘颜色
    const trayColorInput = document.getElementById('tray-color');
    const trayColor = trayColorInput ? trayColorInput.value.trim() : '';
    const validTrayColor = trayColor && /^#[0-9A-Fa-f]{6}$/.test(trayColor) ? trayColor : null;
    
    await invoke('update_scene', {
      sceneName,
      networkConfigs,
      hostsContent: null,
      proxyConfig: null,
      trayColor: validTrayColor
    });
    
    alert('场景已保存');
    await loadScenes();
    document.querySelector('.modal-overlay')?.remove();
  } catch (error) {
    alert('保存场景失败: ' + error);
  }
};

// 应用场景
window.applyScene = async function(sceneName) {
  if (!confirm(`确定要应用场景 "${sceneName}" 吗？\n这将修改所选网卡的IP配置。`)) {
    return;
  }
  
  try {
    await invoke('apply_scene', { sceneName });
    
    // 应用托盘颜色（如果场景中有设置）
    const scene = scenes.find(s => s.name === sceneName);
    if (scene && scene.tray_color) {
      try {
        await invoke('update_tray_icon_color', { hexColor: scene.tray_color });
      } catch (error) {
        console.warn('更新托盘图标颜色失败:', error);
        // 不阻止场景应用，只记录警告
      }
    }
    
    currentScene = sceneName;
    // 持久化当前场景到本地存储
    localStorage.setItem('currentScene', sceneName);
    renderScenes();
    await updateStatusIndicator(); // 更新状态指示器（异步检查备份）
    await refreshNetworkInfo();
    alert('场景已应用');
  } catch (error) {
    alert('应用场景失败: ' + error);
  }
};

// 导出场景配置到 JSON 文件（前端下载）
window.exportScenesConfig = async function() {
  try {
    const content = await invoke('export_scenes_json');
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `ip-switch-scenes-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('场景配置已导出');
  } catch (error) {
    alert('导出场景配置失败: ' + error);
  }
};

// 从 JSON 文件导入场景配置（前端上传）
window.importScenesConfig = async function() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target.result;
          await invoke('import_scenes_json', { json: text });
          await loadScenes();
          alert('场景配置已导入');
        } catch (error) {
          alert('导入场景配置失败: ' + error);
        }
      };
      reader.readAsText(file, 'utf-8');
    };

    input.click();
  } catch (error) {
    alert('导入场景配置失败: ' + error);
  }
};

// 删除场景
window.deleteScene = async function(sceneName) {
  if (!confirm(`确定要删除场景 "${sceneName}" 吗？`)) {
    return;
  }
  
  try {
    await invoke('delete_scene', { sceneName });
    if (currentScene === sceneName) {
      currentScene = null;
      // 清除本地存储的场景状态
      localStorage.removeItem('currentScene');
    }
    await loadScenes();
    await updateStatusIndicator(); // 更新状态指示器（异步检查备份）
  } catch (error) {
    alert('删除场景失败: ' + error);
  }
};

// 解除场景（恢复备份）
window.restoreScene = async function() {
  if (!confirm('确定要解除当前场景并恢复到应用场景前的配置吗？')) {
    return;
  }
  
  try {
    await invoke('restore_backup');
    
    // 清除当前场景状态
    currentScene = null;
    localStorage.removeItem('currentScene');
    
    // 恢复托盘颜色（如果有默认颜色，可以在这里设置）
    // 暂时不处理，保持当前托盘颜色
    
    renderScenes();
    await updateStatusIndicator(); // 更新状态指示器（异步检查备份）
    await refreshNetworkInfo();
    alert('场景已解除，配置已恢复');
  } catch (error) {
    alert('解除场景失败: ' + error);
  }
};

// 设置事件监听
function setupEventListeners() {
  document.getElementById('refresh-btn').addEventListener('click', () => {
    refreshNetworkInfo(true); // 手动刷新时显示加载提示
  });
  document.getElementById('about-btn').addEventListener('click', showAboutModal);
  document.getElementById('create-scene-btn').addEventListener('click', window.createScene);
  document.getElementById('edit-hosts-btn').addEventListener('click', window.editHosts);
  document.getElementById('edit-proxy-btn').addEventListener('click', window.editProxy);
  
  const restoreBtn = document.getElementById('restore-scene-btn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', window.restoreScene);
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

// 显示关于对话框
function showAboutModal() {
  const modal = document.getElementById('about-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

// 关闭关于对话框
window.closeAboutModal = function() {
  const modal = document.getElementById('about-modal');
  if (modal) {
    modal.style.display = 'none';
  }
};

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
