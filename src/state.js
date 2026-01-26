// 应用状态管理

export let currentNetworkInfo = null;
export let viewMode = 'simple'; // 'simple' 或 'full'
export let scenes = [];
export let currentScene = null;
export let networkStatus = null;
export let lastTrayColor = null; // 保存上次的托盘颜色，用于网络恢复时恢复

// 设置网络信息
export function setCurrentNetworkInfo(info) {
  currentNetworkInfo = info;
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
