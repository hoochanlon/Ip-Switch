// 场景管理相关功能

import { invoke } from '@tauri-apps/api/core';
import * as state from './state.js';
import { getNetworkTypeInfo } from './network.js';
import { renderNetworkInfo, refreshNetworkInfo } from './network.js';
import { updateStatusIndicator } from './ui.js';

// 加载场景列表
export async function loadScenes() {
  try {
    state.setScenes(await invoke('get_scenes'));
    
    // 验证保存的场景是否仍然存在
    if (state.currentScene) {
      const sceneExists = state.scenes.some(s => s.name === state.currentScene);
      if (!sceneExists) {
        // 如果保存的场景不存在，清除状态
        state.setCurrentScene(null);
      }
    }
    
    await renderScenes();
  } catch (error) {
    console.error('加载场景失败:', error);
  }
}

// 渲染场景列表
export async function renderScenes() {
  const container = document.getElementById('scenes-list');
  container.innerHTML = '';
  
  if (state.scenes.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #718096; font-size: 12px;">暂无场景<br>点击"新建场景"创建</div>';
    return;
  }
  
  // 检查是否有备份（仅当有当前场景时）
  let hasBackup = false;
  if (state.currentScene) {
    try {
      hasBackup = await invoke('has_backup');
    } catch (error) {
      console.error('检查备份状态失败:', error);
    }
  }
  
  for (const scene of state.scenes) {
    const item = document.createElement('div');
    item.className = `scene-item ${state.currentScene === scene.name ? 'active' : ''}`;
    
    const networkCount = scene.network_configs ? Object.keys(scene.network_configs).length : 0;
    const isCurrentScene = state.currentScene === scene.name;
    
    // 构建操作按钮
    let actionButtons = '';
    if (isCurrentScene && hasBackup) {
      // 如果是当前应用场景且有备份，同时显示"应用"和"解除"按钮
      actionButtons = `
        <button class="btn btn-sm" onclick="window.applyScene('${scene.name}')">应用</button>
        <button class="btn btn-sm" onclick="window.restoreScene()">解除</button>
        <button class="btn btn-sm" onclick="window.editScene('${scene.name}')">编辑</button>
        <button class="btn btn-sm" onclick="window.deleteScene('${scene.name}')">删除</button>
      `;
    } else {
      // 普通场景，显示"应用"按钮
      actionButtons = `
        <button class="btn btn-sm" onclick="window.applyScene('${scene.name}')">应用</button>
        <button class="btn btn-sm" onclick="window.editScene('${scene.name}')">编辑</button>
        <button class="btn btn-sm" onclick="window.deleteScene('${scene.name}')">删除</button>
      `;
    }
    
    item.innerHTML = `
      <div class="scene-info">
        <span class="scene-name">${scene.name}</span>
        <span class="scene-details">${networkCount} 个网卡</span>
      </div>
      <div class="scene-actions">
        ${actionButtons}
      </div>
    `;
    container.appendChild(item);
  }
}

// 新建场景
window.createScene = async function() {
  if (!state.currentNetworkInfo || state.currentNetworkInfo.length === 0) {
    alert('没有可用的网络适配器');
    return;
  }
  
  showSceneEditor();
};

// 编辑场景
window.editScene = async function(sceneName) {
  try {
    const scene = state.scenes.find(s => s.name === sceneName);
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
                 onchange="window.toggleAdapterConfig('${adapter.name}', this.checked)">
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
                   onchange="window.updateAdapterConfigType('${adapter.name}', true)">
            <span>动态IP (DHCP)</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="ip-type-${adapter.name}" value="static" 
                   ${!config.is_dhcp ? 'checked' : ''} 
                   onchange="window.updateAdapterConfigType('${adapter.name}', false)">
            <span>静态IP</span>
          </label>
        </div>
        <div class="static-ip-config" style="display: ${config.is_dhcp ? 'none' : 'block'};">
          <div class="form-group">
            <input type="text" class="form-input" placeholder="IP地址" 
                   value="${config.ip || ''}" 
                   onchange="window.updateAdapterConfig('${adapter.name}', 'ip', this.value)">
          </div>
          <div class="form-group">
            <input type="text" class="form-input" placeholder="子网掩码" 
                   value="${config.subnet || ''}" 
                   onchange="window.updateAdapterConfig('${adapter.name}', 'subnet', this.value)">
          </div>
          <div class="form-group">
            <input type="text" class="form-input" placeholder="网关" 
                   value="${config.gateway || ''}" 
                   onchange="window.updateAdapterConfig('${adapter.name}', 'gateway', this.value)">
          </div>
          <div class="form-group">
            <input type="text" class="form-input" placeholder="DNS (逗号分隔)" 
                   value="${config.dns?.join(', ') || ''}" 
                   onchange="window.updateAdapterConfig('${adapter.name}', 'dns', this.value)">
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
                   onchange="window.updateTrayColorPreview()">
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
        <button class="btn btn-primary" onclick="window.saveSceneConfig()">保存场景</button>
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
    const adapter = state.currentNetworkInfo.find(a => a.name === adapterName);
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
    
    // 关闭编辑器
    document.querySelector('.modal-overlay')?.remove();
    
    // 重新加载场景列表
    await loadScenes();
    
    // 如果这个场景是当前已应用的场景，自动应用新配置
    const isCurrentScene = state.currentScene === sceneName;
    
    if (isCurrentScene) {
      // 自动应用更新后的场景配置
      try {
        await window.applyScene(sceneName);
      } catch (error) {
        alert('场景已保存，但自动应用失败: ' + error);
      }
    }
  } catch (error) {
    alert('保存场景失败: ' + error);
  }
};

// 应用场景
window.applyScene = async function(sceneName) {
  // 立即更新UI状态，让用户看到即时反馈
  state.setCurrentScene(sceneName);
  renderScenes(); // 不等待，立即更新场景列表
  
  try {
    // 后台执行场景应用，不阻塞UI
    const applyPromise = invoke('apply_scene', { sceneName });
    
    // 应用托盘颜色（如果场景中有设置）
    const scene = state.scenes.find(s => s.name === sceneName);
    if (scene && scene.tray_color) {
      // 托盘颜色更新也异步执行，不阻塞
      invoke('update_tray_icon_color', { hexColor: scene.tray_color }).then(() => {
        // 保存当前托盘颜色，用于网络恢复时恢复
        state.setLastTrayColor(scene.tray_color);
      }).catch(error => {
        console.warn('更新托盘图标颜色失败:', error);
      });
    } else {
      // 如果没有场景颜色，使用默认颜色（蓝色）并保存
      const defaultColor = '#3366FF';
      invoke('update_tray_icon_color', { hexColor: defaultColor }).then(() => {
        state.setLastTrayColor(defaultColor);
      }).catch(error => {
        console.warn('更新托盘图标颜色失败:', error);
      });
    }
    
    // 等待场景应用完成
    await applyPromise;
    
    // 等待一下，让Windows系统有时间应用网络配置
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 等待UI刷新完成，确保显示最新的网络信息
    await updateStatusIndicator();
    await refreshNetworkInfo();
  } catch (error) {
    const errorMsg = String(error);
    // 检查是否是权限错误
    if (errorMsg.includes('权限不足') || errorMsg.includes('Access is denied') || errorMsg.includes('权限被拒绝')) {
      const userChoice = confirm(
        '应用场景失败: ' + errorMsg + '\n\n是否要以管理员权限重新启动程序？\n\n点击"确定"将以管理员权限重启，点击"取消"则取消操作。'
      );
      if (userChoice) {
        try {
          await invoke('request_admin_privileges');
          // 如果成功，程序会重启，这里不会执行
        } catch (restartError) {
          alert('请求管理员权限失败: ' + restartError + '\n\n请手动右键点击应用程序，选择"以管理员身份运行"。');
        }
      }
    } else {
      alert('应用场景失败: ' + error);
    }
    // 如果失败，重新渲染以恢复状态
    await renderScenes();
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
    if (state.currentScene === sceneName) {
      state.setCurrentScene(null);
    }
    await loadScenes();
    await updateStatusIndicator(); // 更新状态指示器
  } catch (error) {
    alert('删除场景失败: ' + error);
  }
};

// 清空所有场景
window.clearScenes = async function() {
  if (!confirm('确定要清空所有场景吗？此操作不可恢复！')) {
    return;
  }
  
  try {
    // 删除所有场景
    for (const scene of state.scenes) {
      await invoke('delete_scene', { sceneName: scene.name });
    }
    
    // 清除当前场景状态
    state.setCurrentScene(null);
    
    await loadScenes();
    await updateStatusIndicator();
    alert('所有场景已清空');
  } catch (error) {
    alert('清空场景失败: ' + error);
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
    state.setCurrentScene(null);
    
    // 恢复托盘颜色为默认蓝色
    const defaultColor = '#3366FF';
    try {
      await invoke('update_tray_icon_color', { hexColor: defaultColor });
      state.setLastTrayColor(defaultColor);
    } catch (error) {
      console.warn('恢复托盘图标颜色失败:', error);
    }
    
    await renderScenes();
    await updateStatusIndicator(); // 更新状态指示器
    await refreshNetworkInfo();
    alert('场景已解除，配置已恢复');
  } catch (error) {
    alert('解除场景失败: ' + error);
  }
};
