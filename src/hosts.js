// Hosts 编辑相关功能

import { invoke } from '@tauri-apps/api/core';
import { escapeHtml } from './utils.js';

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
        <button class="btn btn-primary" onclick="window.saveHosts()">保存</button>
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
