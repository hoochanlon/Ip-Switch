// 应用状态管理

export let currentNetworkInfo = null;
export let viewMode = 'full'; // 仅保留完全模式
export let scenes = [];
export let currentScene = null;
export let networkStatus = null;
export let lastTrayColor = null; // 保存上次的托盘颜色，用于网络恢复时恢复
export let selectedNetworkAdapters = null; // Set<string> | null（null 表示全选/不做勾选过滤）
export let selectedNetworkAdaptersInitialized = false; // 是否已经做过“默认初始化”
export let isNetworkChanging = false; // 网络配置切换中（用于暂停前端探测/后台轮询，减少噪声日志）

// 设置网络信息
export function setCurrentNetworkInfo(info) {
  currentNetworkInfo = info;
}

// 初始化网卡勾选筛选（从本地存储恢复）
export function initSelectedNetworkAdapters() {
  try {
    const raw = localStorage.getItem('selectedNetworkAdapters');
    if (!raw) {
      // 默认按“主要网卡”初始化（WiFi + 以太网），实际列表在第一次刷新网络信息后由 network.js 设置
      selectedNetworkAdapters = null;
      selectedNetworkAdaptersInitialized = false;
      return;
    }
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      selectedNetworkAdapters = new Set(arr.filter(Boolean));
      selectedNetworkAdaptersInitialized = true;
    } else {
      selectedNetworkAdapters = null;
      selectedNetworkAdaptersInitialized = false;
    }
  } catch {
    selectedNetworkAdapters = null;
    selectedNetworkAdaptersInitialized = false;
  }
}

// 单独设置“是否已完成网卡筛选初始化”的标记
export function setSelectedNetworkAdaptersInitialized(value) {
  selectedNetworkAdaptersInitialized = !!value;
}

// 设置选中的网卡集合（传 null 表示全选）
export function setSelectedNetworkAdapters(value) {
  if (value === null) {
    selectedNetworkAdapters = null;
    selectedNetworkAdaptersInitialized = true; // 用户主动选择“全选”
    localStorage.removeItem('selectedNetworkAdapters');
    return;
  }
  selectedNetworkAdapters = new Set(Array.from(value || []).filter(Boolean));
  selectedNetworkAdaptersInitialized = true;
  localStorage.setItem('selectedNetworkAdapters', JSON.stringify(Array.from(selectedNetworkAdapters)));
}

export function isAdapterSelected(adapterName) {
  if (!adapterName) return false;
  if (selectedNetworkAdapters === null) return true; // 全选
  return selectedNetworkAdapters.has(adapterName);
}

// 视图模式固定为完全模式，保留函数以避免调用报错
export function setViewMode(mode) {
  viewMode = 'full';
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

export function setIsNetworkChanging(value) {
  isNetworkChanging = !!value;
}

// 设置最后使用的托盘颜色
export function setLastTrayColor(color) {
  lastTrayColor = color;
}

// 获取最后使用的托盘颜色
export function getLastTrayColor() {
  return lastTrayColor;
}
