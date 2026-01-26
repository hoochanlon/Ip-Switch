// Hosts 编辑相关功能

import { invoke } from '@tauri-apps/api/core';
import { escapeHtml } from './utils.js';

// 默认远程hosts URL
const DEFAULT_HOSTS_URL = 'https://gitlab.com/ineo6/hosts/-/raw/master/next-hosts';

// 编辑Hosts - 使用文本编辑器界面
export async function editHosts() {
  try {
    const content = await invoke('get_hosts');
    showHostsEditor(content);
  } catch (error) {
    alert('加载Hosts文件失败: ' + error);
  }
}

// 显示Hosts编辑器
function showHostsEditor(content) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  
  // 从localStorage获取保存的远程URL，如果没有则使用默认值
  const savedUrl = localStorage.getItem('hostsRemoteUrl') || DEFAULT_HOSTS_URL;
  
  modal.innerHTML = `
    <div class="modal-content hosts-modal">
      <div class="modal-header">
        <h2>编辑 Hosts 文件</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="hosts-toolbar">
          <div class="hosts-url-input-group">
            <label for="hosts-url-input" style="font-size: 12px; color: var(--text-secondary); margin-right: 8px;">远程URL:</label>
            <input type="text" id="hosts-url-input" class="form-input" 
                   value="${escapeHtml(savedUrl)}" 
                   placeholder="${escapeHtml(DEFAULT_HOSTS_URL)}"
                   style="flex: 1; min-width: 300px;">
            <button id="hosts-update-btn" class="btn btn-sm btn-ghost" onclick="window.updateHostsFromRemote()" 
                    title="从远程URL更新hosts内容（追加到当前内容末尾）">
              <img class="btn-icon" src="/imgs/svg/common/refresh.svg" alt="" />
              更新
            </button>
          </div>
        </div>
        <textarea id="hosts-editor" class="hosts-editor" spellcheck="false">${escapeHtml(content)}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="window.saveHosts()">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // 保存URL到localStorage（当用户修改时）
  const urlInput = document.getElementById('hosts-url-input');
  if (urlInput) {
    urlInput.addEventListener('blur', () => {
      const url = urlInput.value.trim();
      if (url) {
        localStorage.setItem('hostsRemoteUrl', url);
      }
    });
  }
  
  // 聚焦到编辑器
  setTimeout(() => {
    const editor = document.getElementById('hosts-editor');
    if (editor) {
      editor.focus();
      editor.setSelectionRange(0, 0);
    }
  }, 100);
}

// 从远程URL更新Hosts
window.updateHostsFromRemote = async function() {
  const urlInput = document.getElementById('hosts-url-input');
  const editor = document.getElementById('hosts-editor');
  
  if (!urlInput || !editor) return;
  
  const url = urlInput.value.trim();
  if (!url) {
    alert('请输入远程URL');
    return;
  }
  
  // 验证URL格式
  try {
    new URL(url);
  } catch (e) {
    alert('URL格式不正确，请输入有效的URL');
    return;
  }
  
  // 保存URL到localStorage
  localStorage.setItem('hostsRemoteUrl', url);
  
  // 显示加载提示
  const updateBtn = document.getElementById('hosts-update-btn');
  if (!updateBtn) return;
  
  const originalText = updateBtn.innerHTML;
  updateBtn.disabled = true;
  updateBtn.innerHTML = '<span>更新中...</span>';
  
  try {
    // 从远程获取hosts内容（通过后端）
    const remoteContent = await invoke('fetch_remote_hosts', { url });
    
    if (!remoteContent || !remoteContent.trim()) {
      alert('远程内容为空');
      updateBtn.disabled = false;
      updateBtn.innerHTML = originalText;
      return;
    }
    
    // 获取当前编辑器内容
    const currentContent = editor.value;
    
    // 统计远程内容中的有效记录数（非注释行）
    const remoteLines = remoteContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });
    
    // 追加远程内容到编辑器（如果不存在）
    let newContent = currentContent;
    if (currentContent && !currentContent.endsWith('\n')) {
      newContent += '\n';
    }
    
    // 添加分隔注释和远程内容
    const separator = `\n# ===== 远程更新内容 (${new Date().toLocaleString('zh-CN')}) =====\n`;
    newContent += separator;
    newContent += remoteContent;
    newContent += '\n# ===== 远程更新内容结束 =====\n';
    
    // 更新编辑器内容
    editor.value = newContent;
    
    // 滚动到底部显示新添加的内容
    editor.scrollTop = editor.scrollHeight;
    
    alert(`已从远程更新hosts内容\n\n新增 ${remoteLines.length} 条记录`);
  } catch (error) {
    console.error('从远程更新hosts失败:', error);
    const errorMsg = typeof error === 'string' ? error : error.message || String(error);
    alert('从远程更新hosts失败: ' + errorMsg + '\n\n请检查：\n1. 网络连接是否正常\n2. URL是否正确\n3. 服务器是否可访问');
  } finally {
    updateBtn.disabled = false;
    updateBtn.innerHTML = originalText;
  }
};

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
