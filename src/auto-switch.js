// 自动双向切换网络配置功能

import { invoke } from '@tauri-apps/api/core';
import * as state from './state.js';
import { refreshNetworkInfo } from './network.js';
import { renderScenes } from './scenes.js';
import { t } from './i18n.js';
import { buildAutoSwitchModalHtml } from './auto-switch-template.js';

// 自动切换配置
let autoSwitchConfig = null;
let lastEthernetStatus = null;
let autoSwitchInFlight = false;
// 一次“拔插循环”中，只在成功选择 DHCP/静态后锁定，直到再次检测到网线被拔掉才解锁
let autoSwitchLocked = false;
let ethernetStatusDebounceTimer = null;
let pendingEthernetStatus = null;

// 记录启用自动切换前，该网卡原始的 IP/DHCP 配置，用于关闭自动切换时还原
// 结构示例：{ adapterName, isDhcp, ip, subnet, gateway, dns }
const AUTO_SWITCH_ORIGINAL_KEY = 'autoSwitchOriginalConfig';

async function pingWithRetries(host, timeoutSec = 2, attempts = 2, delayMs = 400) {
  const tries = Math.max(1, attempts);
  for (let i = 0; i < tries; i++) {
    try {
      // 后端 ping_test: 返回 bool
      const ok = await invoke('ping_test', { host, timeoutSec });
      if (ok) return true;
    } catch {
      // ignore and retry
    }
    if (i + 1 < tries) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

function getTargetAdapterSnapshot() {
  const name = autoSwitchConfig?.adapterName;
  if (!name) return null;
  const list = state.currentNetworkInfo;
  if (!Array.isArray(list)) return null;
  return list.find((a) => a?.name === name) || null;
}

function isValidDhcpLease(adapter) {
  if (!adapter) return false;
  // 后端字段：is_dhcp / ip_address / gateway
  if (!adapter.is_dhcp) return false;
  const ip = String(adapter.ip_address || '').trim();
  // DHCP 未拿到租约时常见：169.254.*（APIPA）+ 无网关
  if (!ip || ip.startsWith('169.254.')) return false;
  // 注意：某些环境下网关字段可能为空/延迟更新（或使用特殊路由策略），
  // 但 DHCP 已分配到有效 IP 仍应视为“稳定”，否则会被误判为失败进而切到静态配置。
  return true;
}

// 初始化自动切换功能
export function initAutoSwitch() {
  // 从localStorage加载配置
  const savedConfig = localStorage.getItem('autoSwitchConfig');
  if (savedConfig) {
    try {
      autoSwitchConfig = JSON.parse(savedConfig);
      // 兼容旧配置格式（外网=DHCP，内网=静态）
      if (!autoSwitchConfig.network1 || !autoSwitchConfig.network2) {
        autoSwitchConfig = {
          enabled: !!autoSwitchConfig.enabled,
          adapterName: autoSwitchConfig.adapterName,
          currentActive: 'network1',
          network1: {
            mode: 'dhcp',
            dhcp: { dns: autoSwitchConfig.dhcpConfig?.dns || ['192.168.1.250', '114.114.114.114'] },
            staticConfig: { ip: '', subnet: '', gateway: '', dns: [] },
            pingTarget: autoSwitchConfig.dhcpPingTarget || 'baidu.com',
            trayColor: autoSwitchConfig.dhcpTrayColor || '#00FF00'
          },
          network2: {
            mode: 'static',
            dhcp: { dns: [] },
            staticConfig: {
              ip: autoSwitchConfig.staticConfig?.ip || '172.16.1.55',
              subnet: autoSwitchConfig.staticConfig?.subnet || '255.255.255.0',
              gateway: autoSwitchConfig.staticConfig?.gateway || '172.16.1.254',
              dns: autoSwitchConfig.staticConfig?.dns || ['172.16.1.6']
            },
            pingTarget: autoSwitchConfig.staticPingTarget || autoSwitchConfig.staticConfig?.gateway || '172.16.1.254',
            trayColor: autoSwitchConfig.staticTrayColor || '#FFA500'
          }
        };
        localStorage.setItem('autoSwitchConfig', JSON.stringify(autoSwitchConfig));
      }
      // 初始化时更新指示样式
      updateAutoSwitchCheckbox();
      if (autoSwitchConfig.enabled) {
        startAutoSwitch();
        // 应用启动时，如果自动双向切换已启用，立即应用配置（不等待网线插拔）
        // 使用 force=true 强制应用，确保网卡配置优先使用双向切换配置
        performAutoSwitch(true).catch((err) => {
          console.warn('自动切换：启动时应用配置失败:', err);
        });
      }
    } catch (error) {
      console.error('加载自动切换配置失败:', error);
    }
  }
  
  // 监听网络信息更新事件，检测以太网插拔
  window.addEventListener('networkInfoUpdated', checkEthernetStatusChange);
  
  // 初始化复选框
  initAutoSwitchCheckbox();
}

// 初始化自动切换复选框
function initAutoSwitchCheckbox() {
  const checkbox = document.getElementById('auto-switch-checkbox');
  if (!checkbox) return;
  
  // 设置初始状态
  if (autoSwitchConfig && autoSwitchConfig.enabled) {
    checkbox.checked = true;
  }
  
  // 监听复选框变化
  checkbox.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    
    if (enabled) {
      // 如果启用自动切换，先检查是否有配置
      if (!autoSwitchConfig || !autoSwitchConfig.adapterName) {
        // 没有配置，先恢复复选框状态（因为还没有配置）
        e.target.checked = false;
        // 显示配置对话框（标记为从复选框打开，打开前状态为false）
        showAutoSwitchConfig(true);
        return;
      }
      
      // 有配置，直接启用
      // 清除当前场景（二者只能选其一）
      if (state.currentScene) {
        state.setCurrentScene(null);
        await renderScenes();
      }
      
      setAutoSwitchConfig({
        ...autoSwitchConfig,
        enabled: true
      });
    } else {
      // 禁用自动切换
      if (autoSwitchConfig) {
        setAutoSwitchConfig({
          ...autoSwitchConfig,
          enabled: false
        });
      }
    }
  });
  
  // 双击复选框显示配置对话框（不改变复选框状态）
  checkbox.addEventListener('dblclick', (e) => {
    e.preventDefault();
    showAutoSwitchConfig(false);
  });
}

// 更新自动切换外层指示样式
export function updateAutoSwitchCheckbox() {
  const container = document.querySelector('.auto-switch-control');
  if (container) {
    if (autoSwitchConfig && autoSwitchConfig.enabled) {
      container.classList.add('enabled');
    } else {
      container.classList.remove('enabled');
    }
  }
}

// 禁用自动切换（当应用场景时调用）
export function disableAutoSwitch() {
  if (autoSwitchConfig && autoSwitchConfig.enabled) {
    setAutoSwitchConfig({
      ...autoSwitchConfig,
      enabled: false
    });
  }
}

// 检查以太网状态变化
function checkEthernetStatusChange() {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    console.debug('[auto-switch] 跳过以太网状态检测：未启用或无配置');
    return;
  }
  
  // 只监控“自动切换目标网卡”的 Up/Down，避免其它以太网/虚拟网卡波动导致误解锁
  const target = getTargetAdapterSnapshot();
  if (!target) {
    console.debug('[auto-switch] 跳过以太网状态检测：找不到目标网卡快照', {
      adapterName: autoSwitchConfig?.adapterName,
      currentNetworkInfo: state.currentNetworkInfo?.map(a => a.name),
    });
    return;
  }

  const targetName = String(target.name || '').toLowerCase();
  const targetType = String(target.network_type || '').toLowerCase();
  const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
  const isVirtual = virtualKeywords.some((k) => targetName.includes(k));
  const isBluetooth = targetType === 'bluetooth' || targetName.includes('bluetooth');
  if (isVirtual || isBluetooth) {
    console.debug('[auto-switch] 目标网卡被视为虚拟/蓝牙，忽略自动切换监控', {
      name: target.name,
      type: target.network_type,
    });
    return;
  }

  const isTargetEthernet = targetType === 'ethernet' || (!target.is_wireless && (
    targetName.includes('ethernet') ||
    targetName.includes('以太网') ||
    (targetName.includes('lan') && !isVirtual && !targetName.includes('wlan'))
  ));
  if (!isTargetEthernet) {
    console.debug('[auto-switch] 目标网卡不是以太网，忽略自动切换监控', {
      name: target.name,
      type: target.network_type,
    });
    return;
  }
  
  {
    const currentStatus = !!target.is_enabled;

    // 检测到状态变化（从断开到连接，或从连接到断开）
    if (lastEthernetStatus !== null && lastEthernetStatus !== currentStatus) {
      console.debug('[auto-switch] 检测到以太网状态变化:', lastEthernetStatus, '->', currentStatus, {
        adapter: target.name,
      });

      const now = Date.now();
      // 切换过程中网卡可能短暂 Up/Down 抖动；这里直接忽略本次事件
      if (autoSwitchInFlight) {
        lastEthernetStatus = currentStatus;
        return;
      }

      // 当检测到“由连通变为断开”时，只解锁，不做任何网络配置变更
      if (!currentStatus) {
        console.debug('[auto-switch] 以太网断开，解锁自动切换；下次插入时允许重新判定 DHCP/静态。', {
          adapter: target.name,
        });
        autoSwitchLocked = false;
      }

      // 如果从断开变为连接，触发自动切换检查
      if (currentStatus) {
        // 简单防抖：等待一段时间后再确认状态仍为 Up，避免瞬时抖动造成重复触发
        pendingEthernetStatus = currentStatus;
        if (ethernetStatusDebounceTimer) clearTimeout(ethernetStatusDebounceTimer);
        ethernetStatusDebounceTimer = setTimeout(() => {
          const snap = getTargetAdapterSnapshot();
          const stillUp = !!snap?.is_enabled;
          if (stillUp && pendingEthernetStatus === true) {
            console.debug('[auto-switch] 以太网重新连上，触发一次自动切换决策');
            performAutoSwitch();
          }
          ethernetStatusDebounceTimer = null;
          pendingEthernetStatus = null;
        }, 3500); // 给 DHCP/路由/链路一点稳定时间
      }
    }
    
    lastEthernetStatus = currentStatus;
  }
}

// 规范化单侧配置，填充默认值
function normalizeNetworkConfig(cfg, defaults) {
  const base = cfg || {};
  return {
    mode: base.mode || defaults.mode,
    dhcp: base.dhcp || defaults.dhcp,
    staticConfig: base.staticConfig || defaults.staticConfig,
    pingTarget: base.pingTarget || defaults.pingTarget,
    trayColor: base.trayColor || defaults.trayColor
  };
}

// 执行自动切换
// force: 如果为 true，即使处于锁定状态也强制执行（用于启动时强制应用配置）
async function performAutoSwitch(force = false) {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    console.debug('[auto-switch] performAutoSwitch 跳过：未启用或无配置');
    return;
  }

  // 一次“拔插循环”内，一旦已经根据 ping -S 选定了 DHCP/静态，就不再重复判定，
  // 直到检测到网线被拔掉（上面的 checkEthernetStatusChange 会解锁）。
  // 但启动时（force=true）应该强制应用一次配置，确保网卡配置正确。
  if (!force && autoSwitchLocked) {
    console.debug('[auto-switch] performAutoSwitch 跳过：当前处于锁定状态（等待下一次拔插网线）');
    return;
  }

  if (autoSwitchInFlight) {
    console.debug('[auto-switch] performAutoSwitch 跳过：已有任务在执行中');
    return;
  }

  autoSwitchInFlight = true;
  
  const network1Defaults = {
    mode: 'dhcp',
    dhcp: { dns: ['192.168.1.250', '114.114.114.114'] },
    staticConfig: { ip: '', subnet: '', gateway: '', dns: [] },
    pingTarget: 'baidu.com',
    trayColor: '#00FF00'
  };
  const network2Defaults = {
    mode: 'static',
    dhcp: { dns: [] },
    staticConfig: { ip: '172.16.1.55', subnet: '255.255.255.0', gateway: '172.16.1.254', dns: ['172.16.1.6'] },
    pingTarget: '172.16.1.254',
    trayColor: '#FFA500'
  };

  const network1Config = normalizeNetworkConfig(autoSwitchConfig.network1, network1Defaults);
  const network2Config = normalizeNetworkConfig(autoSwitchConfig.network2, network2Defaults);

  try {
    const beforeActive = autoSwitchConfig.currentActive || 'network1';
    console.debug('[auto-switch] performAutoSwitch 开始决策', {
      adapter: autoSwitchConfig.adapterName,
      beforeActive,
      network1Mode: network1Config.mode,
      network2Mode: network2Config.mode,
    });

    // 简化策略：由后端基于 ping -Source（等价 ping -S）一次性决策当前/另一侧
    const result = await invoke('auto_switch_network', {
      adapterName: autoSwitchConfig.adapterName,
      currentActive: autoSwitchConfig.currentActive || 'network1',
      network1Config,
      network2Config
    });
    
    console.log('自动切换结果:', result);

    const activeNetwork = result?.active_network === 'network2' ? 'network2' : 'network1';
    // 持久化当前激活侧，避免依赖网卡状态推断
    autoSwitchConfig = {
      ...autoSwitchConfig,
      network1: network1Config,
      network2: network2Config,
      currentActive: activeNetwork
    };
    localStorage.setItem('autoSwitchConfig', JSON.stringify(autoSwitchConfig));

    // 只要后端给出的结果是“保持当前”或“已切换成功”，视为本次 DHCP/静态选择已完成，锁定到下次拔插网线。
    if (result?.result === 'stay' || result?.result === 'switched') {
      autoSwitchLocked = true;
    }

    let trayColor;
    if (result?.result === 'both_failed') {
      trayColor = '#FF0000';
      console.warn('网络异常：两侧都无法ping通，已回退到原侧');
    } else {
      // 优先按照“本次实际判定使用的 ping 目标”来映射托盘颜色，
      // 这样颜色就跟“场景/目标”绑定，而不是死绑 network1/network2 的序号。
      // 注意：后端通过 serde(rename_all = "camelCase") 导出为 activePingTarget。
      const activePing = result?.activePingTarget || null;
      if (activePing) {
        if (activePing === network1Config.pingTarget) {
          trayColor = network1Config.trayColor;
        } else if (activePing === network2Config.pingTarget) {
          trayColor = network2Config.trayColor;
        }
      }

      // 兜底：如果没匹配到（例如用户改过目标），仍然按 activeNetwork 侧取颜色
      if (!trayColor) {
        trayColor = activeNetwork === 'network2' ? network2Config.trayColor : network1Config.trayColor;
      }
    }

    if (trayColor) {
      try {
        await invoke('update_tray_icon_color', { hexColor: trayColor });
        state.setLastTrayColor(trayColor);
      } catch (error) {
        console.warn('更新托盘图标颜色失败:', error);
      }
    }
    
    // 刷新网络信息（只更新数据，不强制重绘，避免正在查看的网卡列表闪烁）
    await refreshNetworkInfo(false, { skipRender: true });
  } catch (error) {
    console.error('自动切换失败:', error);
  } finally {
    autoSwitchInFlight = false;
  }
}

// 按“当前是否为 DHCP”在两套配置之间切换（仅在拔插网线后调用一次）
async function toggleByDhcpStatusOnPlug() {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    return;
  }

  const adapterSnap = getTargetAdapterSnapshot();
  if (!adapterSnap) return;

  const adapterName = autoSwitchConfig.adapterName;

  const network1Defaults = {
    mode: 'dhcp',
    dhcp: { dns: ['192.168.1.250', '114.114.114.114'] },
    staticConfig: { ip: '', subnet: '', gateway: '', dns: [] },
    pingTarget: 'baidu.com',
    trayColor: '#00FF00'
  };
  const network2Defaults = {
    mode: 'static',
    dhcp: { dns: [] },
    staticConfig: { ip: '172.16.1.55', subnet: '255.255.255.0', gateway: '172.16.1.254', dns: ['172.16.1.6'] },
    pingTarget: '172.16.1.254',
    trayColor: '#FFA500'
  };

  const network1Config = normalizeNetworkConfig(autoSwitchConfig.network1, network1Defaults);
  const network2Config = normalizeNetworkConfig(autoSwitchConfig.network2, network2Defaults);

  // 根据配置自动识别“哪侧是 DHCP，哪侧是静态”
  const dhcpSide = network1Config.mode === 'dhcp' ? 'network1' : (network2Config.mode === 'dhcp' ? 'network2' : null);
  const staticSide = network1Config.mode === 'static' ? 'network1' : (network2Config.mode === 'static' ? 'network2' : null);

  if (!dhcpSide || !staticSide) {
    console.warn('自动切换：未检测到一侧 DHCP + 一侧静态 的配置，跳过本次拔插切换。', {
      network1Mode: network1Config.mode,
      network2Mode: network2Config.mode,
    });
    return;
  }

  const dhcpCfg = dhcpSide === 'network1' ? network1Config : network2Config;
  const staticCfg = staticSide === 'network1' ? network1Config : network2Config;

  try {
    if (adapterSnap.is_dhcp) {
      // 当前为 DHCP → 按配置切到静态侧
      if (!staticCfg.staticConfig) {
        console.warn('自动切换：静态侧缺少 staticConfig，无法切换到静态。', { staticSide });
        return;
      }

      console.log('自动切换：检测到当前为 DHCP，准备切换到静态侧。', {
        adapter: adapterName,
        from: dhcpSide,
        to: staticSide,
        staticCfg: staticCfg.staticConfig,
      });

      await invoke('set_static_ip', {
        adapterName,
        ip: staticCfg.staticConfig.ip,
        subnet: staticCfg.staticConfig.subnet,
        gateway: staticCfg.staticConfig.gateway,
        dns: staticCfg.staticConfig.dns || [],
      });

      autoSwitchConfig = {
        ...autoSwitchConfig,
        network1: network1Config,
        network2: network2Config,
        currentActive: staticSide,
      };
      localStorage.setItem('autoSwitchConfig', JSON.stringify(autoSwitchConfig));
    } else {
      // 当前为静态 → 按配置切到 DHCP 侧
      console.log('自动切换：检测到当前为静态，准备切换到 DHCP 侧。', {
        adapter: adapterName,
        from: staticSide,
        to: dhcpSide,
      });

      await invoke('set_dhcp', { adapterName });

      if (Array.isArray(dhcpCfg.dhcp?.dns) && dhcpCfg.dhcp.dns.length > 0) {
        await invoke('set_dns_servers', {
          adapterName,
          dns: dhcpCfg.dhcp.dns,
        });
      }

      autoSwitchConfig = {
        ...autoSwitchConfig,
        network1: network1Config,
        network2: network2Config,
        currentActive: dhcpSide,
      };
      localStorage.setItem('autoSwitchConfig', JSON.stringify(autoSwitchConfig));
    }

    // 根据当前激活侧更新托盘颜色
    await applyAutoSwitchTrayColor();

    // 切完后刷新一次网卡信息
    await refreshNetworkInfo(false, { skipRender: true });
  } catch (error) {
    console.error('自动切换（拔插网线）执行失败:', error);
  }
}

// 根据当前自动切换配置和激活侧，更新托盘图标颜色
async function applyAutoSwitchTrayColor() {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    return;
  }

  // 与 performAutoSwitch / toggleByDhcpStatusOnPlug 保持一致的默认值
  const network1Defaults = {
    mode: 'dhcp',
    dhcp: { dns: ['192.168.1.250', '114.114.114.114'] },
    staticConfig: { ip: '', subnet: '', gateway: '', dns: [] },
    pingTarget: 'baidu.com',
    trayColor: '#00FF00'
  };
  const network2Defaults = {
    mode: 'static',
    dhcp: { dns: [] },
    staticConfig: { ip: '172.16.1.55', subnet: '255.255.255.0', gateway: '172.16.1.254', dns: ['172.16.1.6'] },
    pingTarget: '172.16.1.254',
    trayColor: '#FFA500'
  };

  const network1Config = normalizeNetworkConfig(autoSwitchConfig.network1, network1Defaults);
  const network2Config = normalizeNetworkConfig(autoSwitchConfig.network2, network2Defaults);

  const activeSide = autoSwitchConfig.currentActive || 'network1';
  let trayColor =
    activeSide === 'network2' ? network2Config.trayColor : network1Config.trayColor;

  if (!trayColor) return;
  try {
    await invoke('update_tray_icon_color', { hexColor: trayColor });
    state.setLastTrayColor(trayColor);
  } catch (err) {
    console.warn('自动切换：更新托盘颜色失败:', err);
  }
}

// 启动自动切换（仅启用“拔插网线触发”，不做定时轮询和初始化切换）
export function startAutoSwitch() {
  // 逻辑已简化：不再做周期轮询，仅在网线插入和保存配置时触发检测
}

// 停止自动切换
export function stopAutoSwitch() {
  // 目前无周期任务，仅预留接口以便未来扩展
}

// 设置自动切换配置
export function setAutoSwitchConfig(config) {
  const prevConfig = autoSwitchConfig;
  autoSwitchConfig = config;
  localStorage.setItem('autoSwitchConfig', JSON.stringify(config));

  // 如果是从“未启用”切换到“启用”，在真正应用自动切换前，先备份一下当前网卡的原始配置，
  // 以便用户关闭自动切换时能恢复到之前的静态/DHCP 设置。
  const wasEnabled = !!prevConfig?.enabled;
  const nowEnabled = !!config.enabled;
  if (!wasEnabled && nowEnabled && config.adapterName) {
    const snap = getTargetAdapterSnapshot();
    if (snap) {
      const original = {
        adapterName: snap.name,
        isDhcp: !!snap.is_dhcp,
        ip: snap.ip_address || '',
        subnet: snap.subnet_mask || '',
        gateway: snap.gateway || '',
        dns: Array.isArray(snap.dns_servers) ? snap.dns_servers : []
      };
      localStorage.setItem(AUTO_SWITCH_ORIGINAL_KEY, JSON.stringify(original));
    }
  }

  // 如果是从“启用”切换到“禁用”，尝试恢复原始配置
  if (wasEnabled && !nowEnabled && prevConfig?.adapterName) {
    (async () => {
      try {
        const raw = localStorage.getItem(AUTO_SWITCH_ORIGINAL_KEY);
        if (!raw) return;
        let original;
        try {
          original = JSON.parse(raw);
        } catch {
          return;
        }
        if (!original || original.adapterName !== prevConfig.adapterName) return;

        if (original.isDhcp) {
          await invoke('set_dhcp', { adapterName: original.adapterName });
          if (Array.isArray(original.dns) && original.dns.length > 0) {
            await invoke('set_dns_servers', {
              adapterName: original.adapterName,
              dns: original.dns
            });
          }
        } else {
          if (!original.ip || !original.subnet || !original.gateway) {
            // 原始静态配置不完整就不强行还原
          } else {
            await invoke('set_static_ip', {
              adapterName: original.adapterName,
              ip: original.ip,
              subnet: original.subnet,
              gateway: original.gateway,
              dns: Array.isArray(original.dns) ? original.dns : []
            });
          }
        }

        // 还原后刷新一次网卡信息
        await refreshNetworkInfo(false, { skipRender: true });
      } catch (e) {
        console.error('自动切换：还原原始网络配置失败:', e);
      } finally {
        localStorage.removeItem(AUTO_SWITCH_ORIGINAL_KEY);
      }
    })();
  }

  // 更新复选框状态
  updateAutoSwitchCheckbox();

  if (config.enabled) {
    // 启用自动切换时，清除当前场景（二者只能选其一）
    if (state.currentScene) {
      state.setCurrentScene(null);
      renderScenes();
    }
    startAutoSwitch();
    // 保存/启用配置后，立即做一次基于 ping -S 的自动判定，选定 DHCP 或静态
    // 使用 force=true 强制应用，确保网卡配置优先使用双向切换配置（即使之前已锁定）
    performAutoSwitch(true).catch((err) => {
      console.warn('自动切换：保存配置后自动判定失败:', err);
      // 回退到仅更新托盘颜色
      applyAutoSwitchTrayColor().catch((err2) => {
        console.warn('自动切换：应用托盘颜色失败（保存配置后）:', err2);
      });
    });
  } else {
    stopAutoSwitch();
  }
}

// 获取自动切换配置
export function getAutoSwitchConfig() {
  return autoSwitchConfig;
}

// 显示自动切换配置对话框
export function showAutoSwitchConfig(fromCheckbox = false) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay auto-switch-modal-overlay';
  
  // 保存对话框打开前的复选框状态（如果是从复选框打开的）
  const checkboxStateBeforeOpen = fromCheckbox ? 
    (document.getElementById('auto-switch-checkbox')?.checked || false) : null;
  
  // 获取主要网卡（WiFi和以太网，排除虚拟网卡和蓝牙）
  const mainAdapters = state.currentNetworkInfo?.filter(adapter => {
    const name = adapter.name.toLowerCase();
    const networkType = (adapter.network_type || '').toLowerCase();
    
    if (networkType === 'bluetooth' || name.includes('bluetooth')) {
      return false;
    }
    
    const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
    const isVirtual = virtualKeywords.some(keyword => name.includes(keyword));
    
    if (isVirtual) {
      return false;
    }
    
    const isWifi = networkType === 'wifi' || (adapter.is_wireless && networkType !== 'bluetooth');
    const isEthernet = networkType === 'ethernet' || (!adapter.is_wireless && (
      name.includes('ethernet') || 
      name.includes('以太网') ||
      (name.includes('lan') && !isVirtual && !name.includes('wlan'))
    ));
    
    return (isWifi || isEthernet) && !isVirtual;
  }) || [];
  
  const currentConfig = autoSwitchConfig || {
    enabled: false,
    adapterName: mainAdapters[0]?.name || '',
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
  
  modal.innerHTML = buildAutoSwitchModalHtml(currentConfig, mainAdapters, fromCheckbox, checkboxStateBeforeOpen);
  
  // 监听关闭按钮
  modal.querySelector('.modal-close').addEventListener('click', () => {
    if (fromCheckbox && checkboxStateBeforeOpen === false) {
      // 如果是从未选中的复选框打开的，关闭时恢复为未选中
      const checkbox = document.getElementById('auto-switch-checkbox');
      if (checkbox) {
        checkbox.checked = false;
      }
    }
    modal.remove();
  });
  
  document.body.appendChild(modal);
  
  // 设置默认选中
  if (currentConfig.adapterName) {
    document.getElementById('auto-switch-adapter').value = currentConfig.adapterName;
  }

  // 绑定模式切换显示
  const bindModeToggle = (modeId, staticId, dhcpId) => {
    const modeSelect = document.getElementById(modeId);
    const staticFields = document.getElementById(staticId);
    const dhcpFields = document.getElementById(dhcpId);
    if (!modeSelect) return;
    const toggle = () => {
      const isStatic = modeSelect.value === 'static';
      if (staticFields) staticFields.style.display = isStatic ? 'block' : 'none';
      if (dhcpFields) dhcpFields.style.display = isStatic ? 'none' : 'block';
    };
    modeSelect.addEventListener('change', toggle);
    toggle();
  };

  bindModeToggle('network1-mode', 'network1-static-fields', 'network1-dhcp-fields');
  bindModeToggle('network2-mode', 'network2-static-fields', 'network2-dhcp-fields');
}

// 取消自动切换配置
window.cancelAutoSwitchConfig = function(fromCheckbox, checkboxStateBeforeOpen) {
  const modal = document.querySelector('.auto-switch-modal-overlay');
  if (modal) {
    if (fromCheckbox && checkboxStateBeforeOpen === false) {
      // 如果是从未选中的复选框打开的，关闭时恢复为未选中
      const checkbox = document.getElementById('auto-switch-checkbox');
      if (checkbox) {
        checkbox.checked = false;
      }
    }
    modal.remove();
  }
};

// 更新托盘颜色预览
window.updateTrayColorPreview = function(type) {
  const colorInput = document.getElementById(`${type}-tray-color`);
  const colorPicker = document.getElementById(`${type}-tray-color-picker`);
  if (colorInput && colorPicker) {
    const value = colorInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      colorPicker.value = value;
    }
  }
};

// 保存自动切换配置
window.saveAutoSwitchConfig = function() {
  const enabled = document.getElementById('auto-switch-enabled').checked;
  const adapterName = document.getElementById('auto-switch-adapter').value;
  
  const network1Mode = document.getElementById('network1-mode').value;
  const network1DhcpDns = document.getElementById('network1-dhcp-dns').value.trim();
  const network1StaticIp = document.getElementById('network1-static-ip').value.trim();
  const network1StaticSubnet = document.getElementById('network1-static-subnet').value.trim();
  const network1StaticGateway = document.getElementById('network1-static-gateway').value.trim();
  const network1StaticDns = document.getElementById('network1-static-dns').value.trim();
  const network1Ping = document.getElementById('network1-ping').value.trim();
  const network1TrayColorInput = document.getElementById('network1-tray-color');
  const network1TrayColor = network1TrayColorInput ? network1TrayColorInput.value.trim() : '';
  const validNetwork1TrayColor = network1TrayColor && /^#[0-9A-Fa-f]{6}$/.test(network1TrayColor) ? network1TrayColor : '#00FF00';

  const network2Mode = document.getElementById('network2-mode').value;
  const network2DhcpDns = document.getElementById('network2-dhcp-dns').value.trim();
  const network2StaticIp = document.getElementById('network2-static-ip').value.trim();
  const network2StaticSubnet = document.getElementById('network2-static-subnet').value.trim();
  const network2StaticGateway = document.getElementById('network2-static-gateway').value.trim();
  const network2StaticDns = document.getElementById('network2-static-dns').value.trim();
  const network2Ping = document.getElementById('network2-ping').value.trim();
  const network2TrayColorInput = document.getElementById('network2-tray-color');
  const network2TrayColor = network2TrayColorInput ? network2TrayColorInput.value.trim() : '';
  const validNetwork2TrayColor = network2TrayColor && /^#[0-9A-Fa-f]{6}$/.test(network2TrayColor) ? network2TrayColor : '#FFA500';
  
  if (!adapterName) {
    alert(t('selectAdapter'));
    return;
  }
  
  if (!network1Ping || !network2Ping) {
    alert(t('pingTargetsRequired'));
    return;
  }

  if (network1Mode === 'static') {
    if (!network1StaticIp || !network1StaticSubnet || !network1StaticGateway) {
      alert(`${t('network1')}${t('staticConfigIncomplete')}`);
      return;
    }
  }
  if (network2Mode === 'static') {
    if (!network2StaticIp || !network2StaticSubnet || !network2StaticGateway) {
      alert(`${t('network2')}${t('staticConfigIncomplete')}`);
      return;
    }
  }
  
  const config = {
    enabled,
    adapterName,
    currentActive: autoSwitchConfig?.currentActive || 'network1',
    network1: {
      mode: network1Mode,
      dhcp: {
        dns: network1DhcpDns ? network1DhcpDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      staticConfig: {
        ip: network1StaticIp,
        subnet: network1StaticSubnet,
        gateway: network1StaticGateway,
        dns: network1StaticDns ? network1StaticDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      pingTarget: network1Ping,
      trayColor: validNetwork1TrayColor
    },
    network2: {
      mode: network2Mode,
      dhcp: {
        dns: network2DhcpDns ? network2DhcpDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      staticConfig: {
        ip: network2StaticIp,
        subnet: network2StaticSubnet,
        gateway: network2StaticGateway,
        dns: network2StaticDns ? network2StaticDns.split(',').map(s => s.trim()).filter(s => s) : []
      },
      pingTarget: network2Ping,
      trayColor: validNetwork2TrayColor
    }
  };
  
  setAutoSwitchConfig(config);
  document.querySelector('.auto-switch-modal-overlay')?.remove();
  
  // 如果启用了自动切换，更新复选框状态
  if (config.enabled) {
    updateAutoSwitchCheckbox();
  }
};
