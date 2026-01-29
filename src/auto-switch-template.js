// 自动双向切换配置弹窗 HTML 模板
// 只负责根据当前配置和网卡列表生成弹窗内部的 HTML，不包含任何业务逻辑。

import { getNetworkTypeInfo } from './network.js';
import { t } from './i18n.js';

// 构建“主要网卡”下拉选项的 HTML
function buildAdapterOptions(mainAdapters) {
  return (mainAdapters || [])
    .map((adapter) => {
      const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
      return `<option value="${adapter.name}">${adapter.name} (${typeInfo.label})</option>`;
    })
    .join('');
}

// 构建自动双向切换配置弹窗的完整 HTML
export function buildAutoSwitchModalHtml(currentConfig, mainAdapters, fromCheckbox, checkboxStateBeforeOpen) {
  const adapterOptions = buildAdapterOptions(mainAdapters);

  const safeConfig = currentConfig || {
    enabled: false,
    adapterName: mainAdapters?.[0]?.name || '',
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

  return `
    <div class="modal-content auto-switch-modal" style="max-width: 600px;">
      <div class="modal-header">
        <h2>${t('autoSwitchConfigTitle')}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="auto-switch-enabled" ${safeConfig.enabled ? 'checked' : ''}>
            <span>${t('autoSwitchEnabled')}</span>
          </label>
        </div>
        
        <div class="form-group">
          <label for="auto-switch-adapter">${t('networkAdapter')}:</label>
          <select id="auto-switch-adapter" class="form-input">
            ${adapterOptions}
          </select>
        </div>
        
        <div class="form-group">
          <label>${t('network1Config')}:</label>
          <div class="form-group">
            <label for="network1-mode">${t('mode')}:</label>
            <select id="network1-mode" class="form-input">
              <option value="dhcp" ${safeConfig.network1?.mode === 'dhcp' ? 'selected' : ''}>DHCP</option>
              <option value="static" ${safeConfig.network1?.mode === 'static' ? 'selected' : ''}>${t('staticIp')}</option>
            </select>
          </div>
          <div class="form-group" id="network1-dhcp-fields" style="display: ${safeConfig.network1?.mode === 'dhcp' ? 'block' : 'none'};">
            <label for="network1-dhcp-dns">${t('dnsServersComma')}:</label>
            <input type="text" id="network1-dhcp-dns" class="form-input" 
                   value="${safeConfig.network1?.dhcp?.dns?.join(', ') || '192.168.1.250, 114.114.114.114'}">
          </div>
          <div class="form-group" id="network1-static-fields" style="display: ${safeConfig.network1?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <label for="network1-static-ip">${t('ipAddress')}</label>
              <input type="text" id="network1-static-ip" class="form-input" 
                     value="${safeConfig.network1?.staticConfig?.ip || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-subnet">${t('subnetMask')}</label>
              <input type="text" id="network1-static-subnet" class="form-input" 
                     value="${safeConfig.network1?.staticConfig?.subnet || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-gateway">${t('gateway')}</label>
              <input type="text" id="network1-static-gateway" class="form-input" 
                     value="${safeConfig.network1?.staticConfig?.gateway || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-dns">${t('dnsServersComma')}:</label>
              <input type="text" id="network1-static-dns" class="form-input" 
                     value="${safeConfig.network1?.staticConfig?.dns?.join(', ') || ''}">
            </div>
          </div>
          <div class="form-group">
            <label for="network1-ping">${t('pingTarget')}:</label>
            <input type="text" id="network1-ping" class="form-input" 
                   value="${safeConfig.network1?.pingTarget || 'baidu.com'}"
                   placeholder="${t('pingTargetPlaceholder1')}">
            <small class="form-hint">${t('pingHintToNetwork2')}</small>
          </div>
          <div class="form-group">
            <label for="network1-tray-color">${t('trayColorNetwork1')}:</label>
            <div class="color-picker-container">
              <input type="color" id="network1-tray-color-picker" 
                     value="${safeConfig.network1?.trayColor || '#00FF00'}">
              <input type="text" id="network1-tray-color" class="form-input" 
                     placeholder="#00FF00" 
                     value="${safeConfig.network1?.trayColor || '#00FF00'}"
                     pattern="^#[0-9A-Fa-f]{6}$"
                     onchange="window.updateTrayColorPreview('network1')">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>${t('network2Config')}:</label>
          <div class="form-group">
            <label for="network2-mode">${t('mode')}:</label>
            <select id="network2-mode" class="form-input">
              <option value="dhcp" ${safeConfig.network2?.mode === 'dhcp' ? 'selected' : ''}>DHCP</option>
              <option value="static" ${safeConfig.network2?.mode === 'static' ? 'selected' : ''}>${t('staticIp')}</option>
            </select>
          </div>
          <div class="form-group" id="network2-dhcp-fields" style="display: ${safeConfig.network2?.mode === 'dhcp' ? 'block' : 'none'};">
            <label for="network2-dhcp-dns">${t('dnsServersComma')}:</label>
            <input type="text" id="network2-dhcp-dns" class="form-input" 
                   value="${safeConfig.network2?.dhcp?.dns?.join(', ') || ''}">
          </div>
          <div class="form-group" id="network2-static-fields" style="display: ${safeConfig.network2?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <label for="network2-static-ip">${t('ipAddress')}</label>
              <input type="text" id="network2-static-ip" class="form-input" 
                     value="${safeConfig.network2?.staticConfig?.ip || '172.16.1.55'}">
            </div>
            <div class="form-group">
              <label for="network2-static-subnet">${t('subnetMask')}</label>
              <input type="text" id="network2-static-subnet" class="form-input" 
                     value="${safeConfig.network2?.staticConfig?.subnet || '255.255.255.0'}">
            </div>
            <div class="form-group">
              <label for="network2-static-gateway">${t('gateway')}</label>
              <input type="text" id="network2-static-gateway" class="form-input" 
                     value="${safeConfig.network2?.staticConfig?.gateway || '172.16.1.254'}">
            </div>
            <div class="form-group">
              <label for="network2-static-dns">${t('dnsServersComma')}:</label>
              <input type="text" id="network2-static-dns" class="form-input" 
                     value="${safeConfig.network2?.staticConfig?.dns?.join(', ') || '172.16.1.6'}">
            </div>
          </div>
          <div class="form-group">
            <label for="network2-ping">${t('pingTarget')}:</label>
            <input type="text" id="network2-ping" class="form-input" 
                   value="${safeConfig.network2?.pingTarget || '172.16.1.254'}"
                   placeholder="${t('pingTargetPlaceholder2')}">
            <small class="form-hint">${t('pingHintToNetwork1')}</small>
          </div>
          <div class="form-group">
            <label for="network2-tray-color">${t('trayColorNetwork2')}:</label>
            <div class="color-picker-container">
              <input type="color" id="network2-tray-color-picker" 
                     value="${safeConfig.network2?.trayColor || '#FFA500'}">
              <input type="text" id="network2-tray-color" class="form-input" 
                     placeholder="#FFA500" 
                     value="${safeConfig.network2?.trayColor || '#FFA500'}"
                     pattern="^#[0-9A-Fa-f]{6}$"
                     onchange="window.updateTrayColorPreview('network2')">
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="window.cancelAutoSwitchConfig(${fromCheckbox ? 'true' : 'false'}, ${checkboxStateBeforeOpen === false ? 'false' : 'null'})">${t('cancel')}</button>
        <button class="btn btn-primary" onclick="window.saveAutoSwitchConfig()">${t('save')}</button>
      </div>
    </div>
  `;
}

