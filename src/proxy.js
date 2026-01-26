// 代理编辑相关功能

import { invoke } from '@tauri-apps/api/core';

// 编辑代理 - 使用表单界面
export async function editProxy() {
  try {
    const proxy = await invoke('get_proxy');
    showProxyEditor(proxy);
  } catch (error) {
    alert('加载代理配置失败: ' + error);
  }
}

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
        <button class="btn btn-primary" onclick="window.saveProxy()">保存</button>
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
