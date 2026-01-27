// 应用状态管理

export let currentNetworkInfo = null;
export let viewMode = 'simple'; // 'simple' 或 'full'
export let scenes = [];
export let currentScene = null;
export let networkStatus = null;
export let lastTrayColor = null; // 保存上次的托盘颜色，用于网络恢复时恢复
export let selectedNetworkAdapters = null; // Set<string> | null（null 表示全选/不做勾选过滤）

// 设置网络信息
export function setCurrentNetworkInfo(info) {
  currentNetworkInfo = info;
}

// 初始化网卡勾选筛选（从本地存储恢复）
export function initSelectedNetworkAdapters() {
  try {
    const raw = localStorage.getItem('selectedNetworkAdapters');
    if (!raw) {
      selectedNetworkAdapters = null;
      return;
    }
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      selectedNetworkAdapters = new Set(arr.filter(Boolean));
    } else {
      selectedNetworkAdapters = null;
    }
  } catch {
    selectedNetworkAdapters = null;
  }
}

// 设置选中的网卡集合（传 null 表示全选）
export function setSelectedNetworkAdapters(value) {
  if (value === null) {
    selectedNetworkAdapters = null;
    localStorage.removeItem('selectedNetworkAdapters');
    return;
  }
  selectedNetworkAdapters = new Set(Array.from(value || []).filter(Boolean));
  localStorage.setItem('selectedNetworkAdapters', JSON.stringify(Array.from(selectedNetworkAdapters)));
}

export function isAdapterSelected(adapterName) {
  if (!adapterName) return false;
  if (selectedNetworkAdapters === null) return true; // 全选
  return selectedNetworkAdapters.has(adapterName);
}

// 设置视图模式
export function setViewMode(mode) {
  viewMode = mode;
  localStorage.setItem('viewMode', viewMode);
}

// 设置场景列表
export function setScenes(newScenes) {
  scenes = newScenes;
}

// 设置当前场景
export function setCurrentScene(sceneName) {
  currentScene = sceneName;
  if (sceneName) {
    localStorage.setItem('currentScene', sceneName);
  } else {
    localStorage.removeItem('currentScene');
  }
}

// 设置网络状态检测器
export function setNetworkStatus(status) {
  networkStatus = status;
}

// 设置最后使用的托盘颜色
export function setLastTrayColor(color) {
  lastTrayColor = color;
}

// 获取最后使用的托盘颜色
export function getLastTrayColor() {
  return lastTrayColor;
}
