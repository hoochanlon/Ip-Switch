// 网络信息相关功能

import { invoke } from '@tauri-apps/api/core';
import * as state from './state.js';
import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

// 刷新网络信息
// showLoading: 是否显示加载提示（默认 false，静默刷新）
// options:
//   - skipRender: 仅更新状态，不重新渲染 DOM，避免界面“闪一下”
export async function refreshNetworkInfo(showLoading = false, options = {}) {
  const { skipRender = false } = options;
  const container = document.getElementById('network-info');
  
  // 只在需要显示加载提示时才清空内容
  if (showLoading) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: #718096;">${t('loadingNetworkInfo')}</div>`;
  }
  
  try {
    state.setCurrentNetworkInfo(await invoke('get_network_info'));
    console.log('获取到的网络信息:', state.currentNetworkInfo);
    
    if (!state.currentNetworkInfo || state.currentNetworkInfo.length === 0) {
      // 只在显示加载提示或容器为空时才显示错误信息
      if (showLoading || container.innerHTML.trim() === '') {
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e53e3e;">${t('noAdaptersFound')}</div>`;
      }
      return;
    }
    
    // 默认初始化筛选：仅在“尚未初始化过”时，按主要网卡（WiFi + 以太网）做一次勾选
    // 之后用户的任何选择（包含“全选”）都不会被刷新逻辑覆盖
    if (!state.selectedNetworkAdaptersInitialized && Array.isArray(state.currentNetworkInfo)) {
      const mainAdapters = state.currentNetworkInfo.filter(adapter => {
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

      if (mainAdapters.length > 0) {
        const names = new Set(mainAdapters.map(a => a.name));
        state.setSelectedNetworkAdapters(names);
      } else {
        // 如果没有检测到主要网卡，也认为初始化完成，避免反复尝试
        state.setSelectedNetworkAdaptersInitialized(true);
      }
    }

    // 渲染列表（允许调用方选择跳过渲染，避免自动刷新导致选中卡片闪烁）
    if (!skipRender) {
      renderNetworkInfo();
    } else if (container && container.children.length > 0) {
      // 已经有列表时，做一次“就地更新”而非整体重绘，让统计数据仍然实时变化
      updateNetworkInfoStatsView();
    }

    // 通知依赖网络信息的逻辑（托盘图标/自动切换等）立即重新计算
    window.dispatchEvent(new CustomEvent('networkInfoUpdated'));
  } catch (error) {
    console.error('获取网络信息失败:', error);
    // 只在显示加载提示或容器为空时才显示错误信息
    if (showLoading || container.innerHTML.trim() === '') {
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: #e53e3e;">${t('fetchNetworkInfoFailed', { error })}<br><small>${t('ensureAdmin')}</small></div>`;
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

  // 让网络卡片列表区域单独可滚动（标题/筛选栏固定）
  const networkSection = container.closest('.network-section');
  if (networkSection) {
    networkSection.classList.add('full-mode');
  }

  // 显示筛选控件
  const filterContainer = document.getElementById('network-filter-container');
  if (filterContainer) {
    filterContainer.style.display = 'flex';
  }

  renderFullMode(container);
}

// 初始化网络筛选功能
export function initNetworkFilter() {
  const filterInput = document.getElementById('network-filter-input');
  const filterBtn = document.getElementById('network-filter-btn');
  const filterContainer = document.getElementById('network-filter-container');

  if (filterContainer) {
    // 允许在筛选区域内交互，不触发“点击外部关闭”
    filterContainer.addEventListener('click', (e) => e.stopPropagation());
  }

  // 创建“Excel 风格”的筛选下拉面板
  const ensureDropdown = () => {
    if (!filterContainer) return null;
    let dropdown = document.getElementById('network-filter-dropdown');
    if (dropdown) return dropdown;

    dropdown = document.createElement('div');
    dropdown.id = 'network-filter-dropdown';
    dropdown.className = 'network-filter-dropdown';
    dropdown.style.display = 'none';
    dropdown.innerHTML = `
      <div class="network-filter-dropdown-header">
        <div class="network-filter-dropdown-title">${t('showAdapters')}</div>
        <div class="network-filter-dropdown-actions">
          <button type="button" class="btn btn-sm btn-ghost" id="network-filter-select-all">${t('selectAll')}</button>
          <button type="button" class="btn btn-sm btn-ghost" id="network-filter-select-none">${t('selectNone')}</button>
        </div>
      </div>
      <div class="network-filter-dropdown-body">
        <div class="network-filter-dropdown-list" id="network-filter-adapter-list"></div>
      </div>
    `;

    filterContainer.style.position = 'relative';
    filterContainer.appendChild(dropdown);

    // 点击面板内不关闭
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    // 全选/全不选
    dropdown.querySelector('#network-filter-select-all')?.addEventListener('click', () => {
      // null 表示全选
      state.setSelectedNetworkAdapters(null);
      updateAdapterChecklistUI();
      renderNetworkInfo();
    });
    dropdown.querySelector('#network-filter-select-none')?.addEventListener('click', () => {
      state.setSelectedNetworkAdapters(new Set());
      updateAdapterChecklistUI();
      renderNetworkInfo();
    });

    return dropdown;
  };

  const openDropdown = () => {
    const dropdown = ensureDropdown();
    if (!dropdown) return;
    dropdown.style.display = 'block';
    updateAdapterChecklistUI();
  };

  const closeDropdown = () => {
    const dropdown = document.getElementById('network-filter-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  };

  const toggleDropdown = () => {
    const dropdown = ensureDropdown();
    if (!dropdown) return;
    const isOpen = dropdown.style.display !== 'none';
    if (isOpen) closeDropdown();
    else openDropdown();
  };

  // 根据 currentNetworkInfo 更新复选框列表
  const updateAdapterChecklistUI = () => {
    const dropdown = ensureDropdown();
    if (!dropdown) return;
    const listEl = dropdown.querySelector('#network-filter-adapter-list');
    if (!listEl) return;

    const adapters = Array.isArray(state.currentNetworkInfo) ? state.currentNetworkInfo : [];
    const names = adapters.map(a => a?.name).filter(Boolean);
    // 去重并排序（WiFi 优先）
    const unique = Array.from(new Set(names));
    const byName = new Map(adapters.map(a => [a.name, a]));
    unique.sort((a, b) => {
      const aa = byName.get(a);
      const bb = byName.get(b);
      const aw = aa?.is_wireless ? 0 : 1;
      const bw = bb?.is_wireless ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return String(a).localeCompare(String(b), 'zh-CN');
    });

    // 渲染列表
    listEl.innerHTML = unique.map((name) => {
      const adapter = byName.get(name);
      const typeInfo = getNetworkTypeInfo(adapter?.network_type || (adapter?.is_wireless ? 'wifi' : 'ethernet'));
      const checked = state.isAdapterSelected(name);
      return `
        <label class="network-filter-item">
          <input type="checkbox" class="network-filter-checkbox" data-adapter-name="${escapeHtml(name)}" ${checked ? 'checked' : ''} />
          <span class="network-filter-item-main">
            <span class="network-filter-item-name">${escapeHtml(name)}</span>
            <span class="network-filter-item-meta">
              <span class="network-type-badge ${typeInfo.class}">
                <img src="${typeInfo.icon}" alt="${typeInfo.label}" class="network-icon">
                ${typeInfo.label}
              </span>
            </span>
          </span>
        </label>
      `;
    }).join('');

    // 绑定 change 事件
    listEl.querySelectorAll('input.network-filter-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const el = e.currentTarget;
        const adapterName = el.getAttribute('data-adapter-name');
        if (!adapterName) return;

        // 当前为全选模式时，先把“所有可见网卡”写入集合再变更单项
        let next = state.selectedNetworkAdapters === null ? new Set(unique) : new Set(state.selectedNetworkAdapters);
        if (el.checked) next.add(adapterName);
        else next.delete(adapterName);
        state.setSelectedNetworkAdapters(next);
        renderNetworkInfo();
      });
    });
  };
  
  if (filterInput) {
    filterInput.addEventListener('input', () => {
      renderNetworkInfo();
    });
    
    filterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        filterInput.value = '';
        renderNetworkInfo();
        filterInput.blur();
      }
    });
  }
  
  if (filterBtn) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
  }

  // 点击外部关闭
  document.addEventListener('click', () => closeDropdown());
  // ESC 关闭下拉 + 清空搜索框（保留原有行为）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });
}

// 获取网络类型图标和标签
export function getNetworkTypeInfo(networkType) {
  const types = {
    // 统一使用绝对路径，避免在 Tauri/Vite 下相对路径解析导致“部分 svg 不显示”
    'wifi': { icon: '/imgs/svg/status/wifi.svg', label: 'WiFi', class: 'wifi' },
    'ethernet': { icon: '/imgs/svg/status/ethernet.svg', label: t('ethernet'), class: 'ethernet' },
    'bluetooth': { icon: '/imgs/svg/status/bluetooth.svg', label: t('bluetooth'), class: 'bluetooth' },
    'vpn': { icon: '/imgs/svg/status/vpn.svg', label: 'VPN', class: 'vpn' },
    'other': { icon: '/imgs/svg/status/connect.svg', label: t('other'), class: 'other' }
  };
  return types[networkType] || types['other'];
}

// 简约模式已移除，仅保留完全模式显示

// 辅助：格式化字节数
function formatBytes(value) {
  if (value == null || isNaN(value)) return t('unknown');
  const num = Number(value);
  if (num < 1024) return `${num} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = num;
  let unitIndex = -1;
  do {
    size /= 1024;
    unitIndex++;
  } while (size >= 1024 && unitIndex < units.length - 1);
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// 完全模式：显示所有适配器详情
function renderFullMode(container) {
  // 获取筛选关键词
  const filterInput = document.getElementById('network-filter-input');
  const filterKeyword = filterInput ? filterInput.value.toLowerCase().trim() : '';
  
  // 筛选适配器
  let filteredAdapters = [...state.currentNetworkInfo];

  // 先按“勾选显示网卡”过滤（null 表示全选/不做过滤）
  if (state.selectedNetworkAdapters !== null) {
    filteredAdapters = filteredAdapters.filter(adapter => state.selectedNetworkAdapters.has(adapter.name));
  }

  if (filterKeyword) {
    filteredAdapters = filteredAdapters.filter(adapter => {
      const name = adapter.name.toLowerCase();
      const networkType = (adapter.network_type || '').toLowerCase();
      const ipAddress = (adapter.ip_address || '').toLowerCase();
      const macAddress = (adapter.mac_address || '').toLowerCase();
      
      return name.includes(filterKeyword) || 
             networkType.includes(filterKeyword) ||
             ipAddress.includes(filterKeyword) ||
             macAddress.includes(filterKeyword);
    });
  }
  
  // 如果没有匹配的结果
  if (filteredAdapters.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: #718096;">${t('noMatchingAdapters')}</div>`;
    return;
  }
  
  // 按类型分组：WiFi 优先显示
  const sortedAdapters = filteredAdapters.sort((a, b) => {
    if (a.is_wireless && !b.is_wireless) return -1;
    if (!a.is_wireless && b.is_wireless) return 1;
    return 0;
  });

  sortedAdapters.forEach(adapter => {
    const card = document.createElement('div');
    const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
    card.className = `network-card ${typeInfo.class}-card`;
    card.setAttribute('data-adapter-name', adapter.name);
    
    const ipType = adapter.is_dhcp ? 'DHCP' : t('staticIpShort');
    const status = adapter.is_enabled ? t('connected') : t('disconnected');
    
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
          <span class="label">${t('ipStatus')}:</span>
          <span class="value value-ip-type">${ipType}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('macAddress')}:</span>
          <span class="value value-mac-address">${adapter.mac_address || t('unknown')}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('ipAddressLabel')}:</span>
          <span class="value value-ip-address">${adapter.ip_address || t('notConfigured')}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('subnetMaskLabel')}:</span>
          <span class="value value-subnet-mask">${adapter.subnet_mask || t('notConfigured')}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('gatewayLabel')}:</span>
          <span class="value value-gateway">${adapter.gateway || t('notConfigured')}</span>
        </div>
        <div class="detail-row dns-row">
          <span class="label">${t('dnsServers')}</span>
          <span class="value value-dns-servers">${adapter.dns_servers?.join(', ') || t('notConfigured')}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('mediaStateLabel')}:</span>
          <span class="value value-media-state">${adapter.is_enabled ? t('mediaStateEnabled') : t('mediaStateDisabled')}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('speedLabel')}:</span>
          <span class="value value-speed">${adapter.link_speed || t('unknown')}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('bytesReceivedLabel')}:</span>
          <span class="value value-bytes-received">${formatBytes(adapter.bytes_received)}</span>
        </div>
        <div class="detail-row">
          <span class="label">${t('bytesSentLabel')}:</span>
          <span class="value value-bytes-sent">${formatBytes(adapter.bytes_sent)}</span>
        </div>
      </div>
      <button class="btn btn-primary" onclick="window.editNetworkConfig('${adapter.name}')">${t('configureNetwork')}</button>
    `;
    
    container.appendChild(card);
  });
}

// 仅根据最新 state.currentNetworkInfo，就地更新卡片里的动态字段，避免整体重绘导致闪烁
export function updateNetworkInfoStatsView() {
  if (!state.currentNetworkInfo) return;
  const container = document.getElementById('network-info');
  if (!container) return;

  const cards = Array.from(container.querySelectorAll('.network-card'));
  if (cards.length === 0) return;

  const cardMap = new Map();
  cards.forEach(card => {
    const name = card.getAttribute('data-adapter-name');
    if (name) {
      cardMap.set(name, card);
    }
  });

  state.currentNetworkInfo.forEach(adapter => {
    const card = cardMap.get(adapter.name);
    if (!card) return;

    const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
    const ipType = adapter.is_dhcp ? 'DHCP' : t('staticIpShort');
    const status = adapter.is_enabled ? t('connected') : t('disconnected');

    // 状态徽章
    const statusBadge = card.querySelector('.status-badge');
    if (statusBadge) {
      statusBadge.textContent = status;
      statusBadge.classList.toggle('enabled', !!adapter.is_enabled);
      statusBadge.classList.toggle('disabled', !adapter.is_enabled);
    }

    // 顶部类型徽章（图标和文字）
    const typeBadge = card.querySelector('.network-type-badge');
    if (typeBadge) {
      typeBadge.className = `network-type-badge ${typeInfo.class}`;
      const iconEl = typeBadge.querySelector('.network-icon');
      if (iconEl) {
        iconEl.src = typeInfo.icon;
        iconEl.alt = typeInfo.label;
      }
      // 文本在模板里直接跟在 img 后面，保持不变或按需更新
    }

    const setText = (selector, text) => {
      const el = card.querySelector(selector);
      if (el) el.textContent = text;
    };

    setText('.value-ip-type', ipType);
    setText('.value-mac-address', adapter.mac_address || t('unknown'));
    setText('.value-ip-address', adapter.ip_address || t('notConfigured'));
    setText('.value-subnet-mask', adapter.subnet_mask || t('notConfigured'));
    setText('.value-gateway', adapter.gateway || t('notConfigured'));
    setText('.value-dns-servers', adapter.dns_servers?.join(', ') || t('notConfigured'));
    setText('.value-media-state', adapter.is_enabled ? t('mediaStateEnabled') : t('mediaStateDisabled'));
    setText('.value-speed', adapter.link_speed || t('unknown'));
    setText('.value-bytes-received', formatBytes(adapter.bytes_received));
    setText('.value-bytes-sent', formatBytes(adapter.bytes_sent));
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
        <h2>${t('networkConfigTitle', { name: escapeHtml(adapter.name) })}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="radio-group-label">${t('ipConfigType')}</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="ip-type" value="dhcp" id="ip-type-dhcp" ${adapter.is_dhcp ? 'checked' : ''} onchange="window.toggleStaticIPFields()">
              <span>${t('dhcp')}</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="ip-type" value="static" id="ip-type-static" ${!adapter.is_dhcp ? 'checked' : ''} onchange="window.toggleStaticIPFields()">
              <span>${t('staticIp')}</span>
            </label>
          </div>
        </div>
        
        <div id="static-ip-fields" style="display: ${adapter.is_dhcp ? 'none' : 'block'};">
          <div class="form-group">
            <label for="ip-address">${t('ipAddress')}</label>
            <input type="text" id="ip-address" class="form-input" 
                   placeholder="192.168.1.100" 
                   value="${adapter.ip_address || ''}"
                   pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$">
            <small class="form-hint">${t('ipExample')}</small>
          </div>
          
          <div class="form-group">
            <label for="subnet-mask">${t('subnetMask')}</label>
            <input type="text" id="subnet-mask" class="form-input" 
                   placeholder="255.255.255.0" 
                   value="${adapter.subnet_mask || ''}"
                   pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$">
            <small class="form-hint">${t('subnetExample')}</small>
          </div>
          
          <div class="form-group">
            <label for="gateway">${t('gateway')}</label>
            <input type="text" id="gateway" class="form-input" 
                   placeholder="192.168.1.1" 
                   value="${adapter.gateway || ''}"
                   pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$">
            <small class="form-hint">${t('gatewayExample')}</small>
          </div>
        </div>
        
        <div class="form-group">
          <label for="dns-servers">${t('dnsServers')}</label>
          <input type="text" id="dns-servers" class="form-input" 
                 placeholder="8.8.8.8,8.8.4.4" 
                 value="${adapter.dns_servers?.join(', ') || ''}">
          <small class="form-hint">${t('dnsServersHint')}</small>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">${t('cancel')}</button>
        <button class="btn btn-primary" onclick="window.saveNetworkConfig(this, '${adapter.name}')">${t('save')}</button>
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
// 优化：表单校验在前，通过后立刻关闭对应弹窗，再在后台异步执行配置，避免界面长时间卡住
window.saveNetworkConfig = function(buttonEl, adapterName) {
  const dhcpRadio = document.getElementById('ip-type-dhcp');
  if (!dhcpRadio) {
    console.error('找不到 DHCP/静态IP 单选框');
    return;
  }

  const useDHCP = dhcpRadio.checked;
  const dnsInput = document.getElementById('dns-servers');
  const dnsText = dnsInput ? dnsInput.value.trim() : '';
  const dns = dnsText ? dnsText.split(',').map(s => s.trim()).filter(s => s) : [];

  // 静态 IP 模式下，先在弹窗仍存在时完成所有表单读取与校验
  let staticPayload = null;
  if (!useDHCP) {
    const ipInput = document.getElementById('ip-address');
    const subnetInput = document.getElementById('subnet-mask');
    const gatewayInput = document.getElementById('gateway');

    const ip = ipInput ? ipInput.value.trim() : '';
    const subnet = subnetInput ? subnetInput.value.trim() : '';
    const gateway = gatewayInput ? gatewayInput.value.trim() : '';
    
    if (!ip || !subnet || !gateway) {
      alert(t('staticConfigIncomplete'));
      return;
    }
    
    // 简单的IP格式验证
    const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipPattern.test(ip) || !ipPattern.test(subnet) || !ipPattern.test(gateway)) {
      alert(t('ipFormatInvalid'));
      return;
    }

    staticPayload = { ip, subnet, gateway, dns };
  }

  // 表单校验通过后，再立刻关闭当前配置窗口，提升交互响应速度
  if (buttonEl && buttonEl.closest) {
    const overlay = buttonEl.closest('.modal-overlay');
    if (overlay) {
      overlay.remove();
    }
  } else {
    // 兜底：没有拿到按钮节点时，仍然尝试移除任意配置弹窗
    document.querySelector('.network-config-modal')?.closest('.modal-overlay')?.remove();
  }

  if (useDHCP) {
    // 在后台异步执行 DHCP 配置和 DNS 设置
    invoke('set_dhcp', { adapterName })
      .then(() => {
        if (dns.length > 0) {
          return invoke('set_dns_servers', { adapterName, dns });
        }
      })
      .catch((error) => {
        const raw = String(error || '');
        console.error('配置网络(DHCP)失败:', raw);
        const short = raw.split('\n')[0] || raw;
        alert(t('configFailed', { error: short }));
      })
      .finally(() => {
        // 静默刷新网络信息，不阻塞界面
        refreshNetworkInfo().catch((err) => {
          console.error('刷新网络信息失败:', err);
        });
      });
  } else {
    // 在后台异步执行静态 IP 配置
    invoke('set_static_ip', {
      adapterName,
      ip: staticPayload.ip,
      subnet: staticPayload.subnet,
      gateway: staticPayload.gateway,
      dns: staticPayload.dns
    })
      .catch((error) => {
        const raw = String(error || '');
        console.error('配置网络(静态IP)失败:', raw);
        const short = raw.split('\n')[0] || raw;
        alert(t('configFailed', { error: short }));
      })
      .finally(() => {
        // 静默刷新网络信息，不阻塞界面
        refreshNetworkInfo().catch((err) => {
          console.error('刷新网络信息失败:', err);
        });
      });
  }
};
