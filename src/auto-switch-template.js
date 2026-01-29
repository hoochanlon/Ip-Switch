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
    <div class="modal-content auto-switch-modal" style="max-width: 1000px;">
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
            <label class="radio-group-label">${t('mode')}</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="network1-mode" value="dhcp" id="network1-mode-dhcp" ${safeConfig.network1?.mode === 'dhcp' ? 'checked' : ''} onchange="window.toggleNetwork1Mode()">
                <span>${t('dhcp')}</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="network1-mode" value="static" id="network1-mode-static" ${safeConfig.network1?.mode === 'static' ? 'checked' : ''} onchange="window.toggleNetwork1Mode()">
                <span>${t('staticIp')}</span>
              </label>
            </div>
          </div>
          <div class="form-group" id="network1-dhcp-fields" style="display: ${safeConfig.network1?.mode === 'dhcp' ? 'block' : 'none'};">
            <div class="form-floating">
              <input
                type="text"
                id="network1-dhcp-dns"
                class="form-input"
                placeholder=" "
                value="${safeConfig.network1?.dhcp?.dns?.join(', ') || '192.168.1.250, 114.114.114.114'}">
              <label for="network1-dhcp-dns" class="form-label">${t('dnsServersLabelShort')}</label>
            </div>
          </div>
          <div class="form-group" id="network1-static-fields" style="display: ${safeConfig.network1?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network1-static-ip"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network1?.staticConfig?.ip || ''}">
                <label for="network1-static-ip" class="form-label">${t('ipAddress')} (${t('ipExample')})</label>
              </div>
            </div>
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network1-static-subnet"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network1?.staticConfig?.subnet || ''}">
                <label for="network1-static-subnet" class="form-label">${t('subnetMask')} (${t('subnetExample')})</label>
              </div>
            </div>
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network1-static-gateway"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network1?.staticConfig?.gateway || ''}">
                <label for="network1-static-gateway" class="form-label">${t('gateway')} (${t('gatewayExample')})</label>
              </div>
            </div>
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network1-static-dns"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network1?.staticConfig?.dns?.join(', ') || ''}">
                <label for="network1-static-dns" class="form-label">${t('dnsServersLabelShort')}</label>
              </div>
            </div>
          </div>
          <div class="form-group">
            <div class="form-floating">
              <input
                type="text"
                id="network1-ping"
                class="form-input" 
                placeholder=" "
                value="${safeConfig.network1?.pingTarget || 'baidu.com'}">
              <label for="network1-ping" class="form-label">${t('pingTarget')} (${t('pingHintToNetwork2')})</label>
            </div>
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
            <label class="radio-group-label">${t('mode')}</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="network2-mode" value="dhcp" id="network2-mode-dhcp" ${safeConfig.network2?.mode === 'dhcp' ? 'checked' : ''} onchange="window.toggleNetwork2Mode()">
                <span>${t('dhcp')}</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="network2-mode" value="static" id="network2-mode-static" ${safeConfig.network2?.mode === 'static' ? 'checked' : ''} onchange="window.toggleNetwork2Mode()">
                <span>${t('staticIp')}</span>
              </label>
            </div>
          </div>
          <div class="form-group" id="network2-dhcp-fields" style="display: ${safeConfig.network2?.mode === 'dhcp' ? 'block' : 'none'};">
            <div class="form-floating">
              <input
                type="text"
                id="network2-dhcp-dns"
                class="form-input" 
                placeholder=" "
                value="${safeConfig.network2?.dhcp?.dns?.join(', ') || ''}">
              <label for="network2-dhcp-dns" class="form-label">${t('dnsServersLabelShort')}</label>
            </div>
          </div>
          <div class="form-group" id="network2-static-fields" style="display: ${safeConfig.network2?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network2-static-ip"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network2?.staticConfig?.ip || '172.16.1.55'}">
                <label for="network2-static-ip" class="form-label">${t('ipAddress')} (${t('ipExample')})</label>
              </div>
            </div>
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network2-static-subnet"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network2?.staticConfig?.subnet || '255.255.255.0'}">
                <label for="network2-static-subnet" class="form-label">${t('subnetMask')} (${t('subnetExample')})</label>
              </div>
            </div>
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network2-static-gateway"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network2?.staticConfig?.gateway || '172.16.1.254'}">
                <label for="network2-static-gateway" class="form-label">${t('gateway')} (${t('gatewayExample')})</label>
              </div>
            </div>
            <div class="form-group">
              <div class="form-floating">
                <input
                  type="text"
                  id="network2-static-dns"
                  class="form-input" 
                  placeholder=" "
                  value="${safeConfig.network2?.staticConfig?.dns?.join(', ') || '172.16.1.6'}">
                <label for="network2-static-dns" class="form-label">${t('dnsServersLabelShort')}</label>
              </div>
            </div>
          </div>
          <div class="form-group">
            <div class="form-floating">
              <input
                type="text"
                id="network2-ping"
                class="form-input" 
                placeholder=" "
                value="${safeConfig.network2?.pingTarget || '172.16.1.254'}">
              <label for="network2-ping" class="form-label">${t('pingTarget')} (${t('pingHintToNetwork1')})</label>
            </div>
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

