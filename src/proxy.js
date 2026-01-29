// 代理编辑相关功能

import { invoke } from '@tauri-apps/api/core';
import { t } from './i18n.js';

// 编辑代理 - 使用表单界面
export async function editProxy() {
  try {
    const proxy = await invoke('get_proxy');
    showProxyEditor(proxy);
  } catch (error) {
    alert(t('loadProxyFailed', { error }));
  }
}

// 显示代理编辑器
function showProxyEditor(proxy) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content proxy-modal">
      <div class="modal-header">
        <h2>${t('proxyEditorTitle')}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group proxy-checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="proxy-enabled" ${proxy.enabled ? 'checked' : ''}>
            <span>${t('proxyEnabled')}</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="proxy-auto-detect" ${proxy.auto_detect ? 'checked' : ''}>
            <span>${t('proxyAutoDetect')}</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="proxy-use-script" ${proxy.auto_config_url ? 'checked' : ''}>
            <span>${t('proxyUseScript')}</span>
          </label>
        </div>
        <div class="form-group">
          <label for="proxy-script-url">${t('proxyScriptAddress')}</label>
          <input type="text" id="proxy-script-url" class="form-input"
                 placeholder="http://127.0.0.1:8080/proxy.pac"
                 value="${proxy.auto_config_url || ''}">
        </div>
        <div class="form-group">
          <label for="proxy-server">${t('proxyServer')}</label>
          <input type="text" id="proxy-server" class="form-input" 
                 placeholder="127.0.0.1:8080" 
                 value="${proxy.server || ''}">
          <small class="form-hint">${t('proxyServerHint')}</small>
        </div>
        <div class="form-group">
          <label for="proxy-bypass">${t('proxyBypass')}</label>
          <textarea id="proxy-bypass" class="form-textarea" 
                    placeholder="localhost;127.0.0.1;*.local">${proxy.bypass?.join(';') || ''}</textarea>
          <small class="form-hint">${t('proxyBypassHint')}</small>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">${t('cancel')}</button>
        <button class="btn btn-primary" onclick="window.saveProxy()">${t('save')}</button>
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
  const autoDetect = document.getElementById('proxy-auto-detect').checked;
  const useScript = document.getElementById('proxy-use-script').checked;
  const scriptUrl = document.getElementById('proxy-script-url').value.trim();
  
  if (enabled && !server) {
    alert(t('proxyServerRequired'));
    return;
  }
  
  const bypass = bypassText ? bypassText.split(';').map(s => s.trim()).filter(s => s) : [];
  
  try {
    await invoke('set_proxy', {
      enabled,
      server: enabled ? server : '',
      bypass,
      auto_detect: autoDetect,
      auto_config_url: useScript ? scriptUrl : ''
    });
    alert(t('proxyUpdated'));
    document.querySelector('.modal-overlay')?.remove();
  } catch (error) {
    alert(t('updateProxyFailed', { error }));
  }
};
