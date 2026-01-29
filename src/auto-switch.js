// 自动双向切换网络配置功能

import { invoke } from '@tauri-apps/api/core';
import * as state from './state.js';
import { refreshNetworkInfo, getNetworkTypeInfo } from './network.js';
import { renderScenes } from './scenes.js';
import { t } from './i18n.js';

// 自动切换配置
let autoSwitchConfig = null;
let autoSwitchInterval = null;
let lastEthernetStatus = null;
let autoSwitchInFlight = false;
let lastAutoSwitchAt = 0;
let lastSwitchedAt = 0;
let lastEthernetUpTriggerAt = 0;
let lastFailureCooldownAt = 0;
let consecutiveCurrentFailures = 0;
let lastCurrentOkAt = 0;
let isEthernetConnected = null;
let autoSwitchLocked = false;
let autoSwitchLockedAt = 0;
let ethernetStatusDebounceTimer = null;
let pendingEthernetStatus = null;

// 稳定性策略：避免网络抖动/切换生效延迟导致“来回切”
const AUTO_SWITCH_MIN_INTERVAL_MS = 8000; // 最短触发间隔（避免事件风暴）
const AUTO_SWITCH_COOLDOWN_AFTER_SWITCH_MS = 60000; // 切换成功后冷却时间
const AUTO_SWITCH_COOLDOWN_AFTER_ETHERNET_UP_MS = 90000; // 插网线后只触发一次，避免网卡状态抖动反复触发
const AUTO_SWITCH_COOLDOWN_AFTER_FAILURE_MS = 30000; // 两侧都失败/异常时，退避一段时间再重试
const AUTO_SWITCH_FAILS_BEFORE_SWITCH = 2; // 连续失败达到阈值才允许切换（避免“先对后错”的误切）

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
    return;
  }
  
  // 只监控“自动切换目标网卡”的 Up/Down，避免其它以太网/虚拟网卡波动导致误解锁
  const target = getTargetAdapterSnapshot();
  if (!target) return;

  const targetName = String(target.name || '').toLowerCase();
  const targetType = String(target.network_type || '').toLowerCase();
  const virtualKeywords = ['virtualbox', 'vmware', 'npcap', 'loopback', 'tunnel', 'vpn', 'tap', 'wintun'];
  const isVirtual = virtualKeywords.some((k) => targetName.includes(k));
  const isBluetooth = targetType === 'bluetooth' || targetName.includes('bluetooth');
  if (isVirtual || isBluetooth) return;

  const isTargetEthernet = targetType === 'ethernet' || (!target.is_wireless && (
    targetName.includes('ethernet') ||
    targetName.includes('以太网') ||
    (targetName.includes('lan') && !isVirtual && !targetName.includes('wlan'))
  ));
  if (!isTargetEthernet) return;
  
  {
    const currentStatus = !!target.is_enabled;
    isEthernetConnected = !!currentStatus;
    
    // 检测到状态变化（从断开到连接，或从连接到断开）
    if (lastEthernetStatus !== null && lastEthernetStatus !== currentStatus) {
      console.log('检测到以太网状态变化:', lastEthernetStatus, '->', currentStatus);

      const now = Date.now();
      // 切换过程中/切换刚完成时，网卡可能短暂 Up/Down 抖动；这里直接忽略，避免“解锁→二次切换”
      if (autoSwitchInFlight || (lastSwitchedAt && now - lastSwitchedAt < 15000)) {
        lastEthernetStatus = currentStatus;
        return;
      }

      // 网线状态变化：解锁，允许重新判断一次
      autoSwitchLocked = false;
      consecutiveCurrentFailures = 0;
      
      // 如果从断开变为连接，触发自动切换检查
      if (currentStatus) {
        // 插网线过程中，网卡可能 Up/Down 抖动；这里做一次“事件冷却”，避免重复触发
        if (now - lastEthernetUpTriggerAt < AUTO_SWITCH_COOLDOWN_AFTER_ETHERNET_UP_MS) {
          lastEthernetStatus = currentStatus;
          return;
        }
        lastEthernetUpTriggerAt = now;

        // 防抖：等待一段时间后再确认状态仍为 Up，避免瞬时抖动造成重复触发
        pendingEthernetStatus = currentStatus;
        if (ethernetStatusDebounceTimer) clearTimeout(ethernetStatusDebounceTimer);
        ethernetStatusDebounceTimer = setTimeout(() => {
          const snap = getTargetAdapterSnapshot();
          const stillUp = !!snap?.is_enabled;
          if (stillUp && pendingEthernetStatus === true) {
            toggleByDhcpStatusOnPlug();
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
async function performAutoSwitch() {
  if (!autoSwitchConfig || !autoSwitchConfig.enabled) {
    return;
  }

  const now = Date.now();
  if (autoSwitchInFlight) return;
  // 一旦锁定（ping/连通性验证有效），除非再次拔插网线（以太网状态变化），否则不再做任何切换动作
  if (autoSwitchLocked) return;
  if (now - lastAutoSwitchAt < AUTO_SWITCH_MIN_INTERVAL_MS) return;
  if (lastSwitchedAt && now - lastSwitchedAt < AUTO_SWITCH_COOLDOWN_AFTER_SWITCH_MS) return;
  if (lastFailureCooldownAt && now - lastFailureCooldownAt < AUTO_SWITCH_COOLDOWN_AFTER_FAILURE_MS) return;

  autoSwitchInFlight = true;
  lastAutoSwitchAt = now;
  
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
    const adapterSnap = getTargetAdapterSnapshot();
    const hasDhcp1 = network1Config.mode === 'dhcp';
    const hasDhcp2 = network2Config.mode === 'dhcp';

    // 优先级更高的一层保护：
    // 只要目标网卡当前拿到了有效 DHCP IP（非 169.254.*），并且两侧配置中至少有一侧是 DHCP，
    // 就直接将 currentActive 对齐到 DHCP 这一侧并锁定，完全禁止自动切到静态。
    if (adapterSnap && isValidDhcpLease(adapterSnap) && (hasDhcp1 || hasDhcp2)) {
      const preferSide = hasDhcp2 ? 'network2' : 'network1';
      console.log('自动切换：检测到网卡当前为 DHCP 有效 IP，强制对齐到 DHCP 侧并锁定，禁止切到静态。', {
        adapter: adapterSnap?.name,
        ip: adapterSnap?.ip_address,
        isDhcp: adapterSnap?.is_dhcp,
        preferSide,
      });

      autoSwitchConfig = {
        ...autoSwitchConfig,
        network1: network1Config,
        network2: network2Config,
        currentActive: preferSide,
      };
      localStorage.setItem('autoSwitchConfig', JSON.stringify(autoSwitchConfig));

      consecutiveCurrentFailures = 0;
      lastCurrentOkAt = Date.now();
      autoSwitchLocked = true;
      autoSwitchLockedAt = Date.now();
      return;
    }

    const beforeActive = autoSwitchConfig.currentActive || 'network1';

    // 策略约束：如果当前激活侧是 DHCP，且另一侧是静态，则永远不从当前侧自动切到静态。
    // 典型场景：network1 = DHCP（外网），network2 = 静态 192.168.1.100（内网调试），
    // 你希望“只要当前有正常 DHCP IP，就永远不切到静态”。
    const currentIsNetwork2 = beforeActive === 'network2';
    const currentCfgHard = currentIsNetwork2 ? network2Config : network1Config;
    const otherCfgHard = currentIsNetwork2 ? network1Config : network2Config;
    if (currentCfgHard.mode === 'dhcp' && otherCfgHard.mode === 'static') {
      console.log('自动切换：命中策略保护，当前为 DHCP 且另一侧为静态，禁止自动切换到静态。', {
        beforeActive,
        currentMode: currentCfgHard.mode,
        otherMode: otherCfgHard.mode,
      });
      consecutiveCurrentFailures = 0;
      lastCurrentOkAt = Date.now();
      autoSwitchLocked = true;
      autoSwitchLockedAt = Date.now();
      return;
    }

    // 先只检测“当前侧”是否真的连续失败，避免短暂抖动导致误切
    const currentCfg = beforeActive === 'network2' ? network2Config : network1Config;

    const currentOk = await pingWithRetries(currentCfg.pingTarget, 2, 2, 400);
    if (currentOk) {
      consecutiveCurrentFailures = 0;
      lastCurrentOkAt = Date.now();
      return;
    }

    consecutiveCurrentFailures += 1;
    // 还没达到阈值：不触发切换（下一轮再确认一次）
    if (consecutiveCurrentFailures < AUTO_SWITCH_FAILS_BEFORE_SWITCH) {
      return;
    }

    // 达到阈值后才允许调用后端执行“切换尝试”
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

    // 切换成功后进入冷却期，避免网络恢复/抖动导致马上切回
    // 注意：beforeActive 可能因为用户手动切换/重启等原因不准，因此只要后端判定 switched 就冷却
    if (result?.result === 'switched') {
      lastSwitchedAt = Date.now();
    }
    // 两侧都失败：不要每 30s/事件触发就疯狂重试，退避一段时间
    if (result?.result === 'both_failed') {
      lastFailureCooldownAt = Date.now();
    }
    // 一旦走到这里（已尝试切换/保持），重置连续失败计数，避免下一轮直接再次触发
    consecutiveCurrentFailures = 0;

    // 你希望的策略：一旦验证有效就锁定，直到下一次拔插网线
    if (result?.result === 'stay' || result?.result === 'switched') {
      autoSwitchLocked = true;
      autoSwitchLockedAt = Date.now();
    }
    
    let trayColor = activeNetwork === 'network2' ? network2Config.trayColor : network1Config.trayColor;
    if (result?.result === 'both_failed') {
      trayColor = '#FF0000';
      console.warn('网络异常：两侧都无法ping通，已回退到原侧');
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

    // 切完后刷新一次网卡信息
    await refreshNetworkInfo(false, { skipRender: true });
  } catch (error) {
    console.error('自动切换（拔插网线）执行失败:', error);
  }
}

// 启动自动切换（仅启用“拔插网线触发”，不做定时轮询和初始化切换）
export function startAutoSwitch() {
  if (autoSwitchInterval) {
    clearInterval(autoSwitchInterval);
  }
}

// 停止自动切换
export function stopAutoSwitch() {
  if (autoSwitchInterval) {
    clearInterval(autoSwitchInterval);
    autoSwitchInterval = null;
  }
}

// 设置自动切换配置
export function setAutoSwitchConfig(config) {
  autoSwitchConfig = config;
  localStorage.setItem('autoSwitchConfig', JSON.stringify(config));
  
  // 更新复选框状态
  updateAutoSwitchCheckbox();
  
  if (config.enabled) {
    // 启用自动切换时，清除当前场景（二者只能选其一）
    if (state.currentScene) {
      state.setCurrentScene(null);
      renderScenes();
    }
    startAutoSwitch();
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
  
  const adapterOptions = mainAdapters.map(adapter => {
    const typeInfo = getNetworkTypeInfo(adapter.network_type || (adapter.is_wireless ? 'wifi' : 'ethernet'));
    return `<option value="${adapter.name}">${adapter.name} (${typeInfo.label})</option>`;
  }).join('');
  
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
  
  modal.innerHTML = `
    <div class="modal-content auto-switch-modal" style="max-width: 600px;">
      <div class="modal-header">
        <h2>${t('autoSwitchConfigTitle')}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="auto-switch-enabled" ${currentConfig.enabled ? 'checked' : ''}>
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
            <label for="network1-mode">${t('mode')}:</label>
            <select id="network1-mode" class="form-input">
              <option value="dhcp" ${currentConfig.network1?.mode === 'dhcp' ? 'selected' : ''}>DHCP</option>
              <option value="static" ${currentConfig.network1?.mode === 'static' ? 'selected' : ''}>${t('staticIp')}</option>
            </select>
          </div>
          <div class="form-group" id="network1-dhcp-fields" style="display: ${currentConfig.network1?.mode === 'dhcp' ? 'block' : 'none'};">
            <label for="network1-dhcp-dns">${t('dnsServersComma')}:</label>
            <input type="text" id="network1-dhcp-dns" class="form-input" 
                   value="${currentConfig.network1?.dhcp?.dns?.join(', ') || '192.168.1.250, 114.114.114.114'}">
          </div>
          <div class="form-group" id="network1-static-fields" style="display: ${currentConfig.network1?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <label for="network1-static-ip">${t('ipAddress')}</label>
              <input type="text" id="network1-static-ip" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.ip || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-subnet">${t('subnetMask')}</label>
              <input type="text" id="network1-static-subnet" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.subnet || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-gateway">${t('gateway')}</label>
              <input type="text" id="network1-static-gateway" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.gateway || ''}">
            </div>
            <div class="form-group">
              <label for="network1-static-dns">${t('dnsServersComma')}:</label>
              <input type="text" id="network1-static-dns" class="form-input" 
                     value="${currentConfig.network1?.staticConfig?.dns?.join(', ') || ''}">
            </div>
          </div>
          <div class="form-group">
            <label for="network1-ping">${t('pingTarget')}:</label>
            <input type="text" id="network1-ping" class="form-input" 
                   value="${currentConfig.network1?.pingTarget || 'baidu.com'}"
                   placeholder="${t('pingTargetPlaceholder1')}">
            <small class="form-hint">${t('pingHintToNetwork2')}</small>
          </div>
          <div class="form-group">
            <label for="network1-tray-color">${t('trayColorNetwork1')}:</label>
            <div class="color-picker-container">
              <input type="color" id="network1-tray-color-picker" 
                     value="${currentConfig.network1?.trayColor || '#00FF00'}">
              <input type="text" id="network1-tray-color" class="form-input" 
                     placeholder="#00FF00" 
                     value="${currentConfig.network1?.trayColor || '#00FF00'}"
                     pattern="^#[0-9A-Fa-f]{6}$"
                     onchange="window.updateTrayColorPreview('network1')">
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>${t('network2Config')}:</label>
          <div class="form-group">
            <label for="network2-mode">${t('mode')}:</label>
            <select id="network2-mode" class="form-input">
              <option value="dhcp" ${currentConfig.network2?.mode === 'dhcp' ? 'selected' : ''}>DHCP</option>
              <option value="static" ${currentConfig.network2?.mode === 'static' ? 'selected' : ''}>${t('staticIp')}</option>
            </select>
          </div>
          <div class="form-group" id="network2-dhcp-fields" style="display: ${currentConfig.network2?.mode === 'dhcp' ? 'block' : 'none'};">
            <label for="network2-dhcp-dns">${t('dnsServersComma')}:</label>
            <input type="text" id="network2-dhcp-dns" class="form-input" 
                   value="${currentConfig.network2?.dhcp?.dns?.join(', ') || ''}">
          </div>
          <div class="form-group" id="network2-static-fields" style="display: ${currentConfig.network2?.mode === 'static' ? 'block' : 'none'};">
            <div class="form-group">
              <label for="network2-static-ip">${t('ipAddress')}</label>
              <input type="text" id="network2-static-ip" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.ip || '172.16.1.55'}">
            </div>
            <div class="form-group">
              <label for="network2-static-subnet">${t('subnetMask')}</label>
              <input type="text" id="network2-static-subnet" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.subnet || '255.255.255.0'}">
            </div>
            <div class="form-group">
              <label for="network2-static-gateway">${t('gateway')}</label>
              <input type="text" id="network2-static-gateway" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.gateway || '172.16.1.254'}">
            </div>
            <div class="form-group">
              <label for="network2-static-dns">${t('dnsServersComma')}:</label>
              <input type="text" id="network2-static-dns" class="form-input" 
                     value="${currentConfig.network2?.staticConfig?.dns?.join(', ') || '172.16.1.6'}">
            </div>
          </div>
          <div class="form-group">
            <label for="network2-ping">${t('pingTarget')}:</label>
            <input type="text" id="network2-ping" class="form-input" 
                   value="${currentConfig.network2?.pingTarget || '172.16.1.254'}"
                   placeholder="${t('pingTargetPlaceholder2')}">
            <small class="form-hint">${t('pingHintToNetwork1')}</small>
          </div>
          <div class="form-group">
            <label for="network2-tray-color">${t('trayColorNetwork2')}:</label>
            <div class="color-picker-container">
              <input type="color" id="network2-tray-color-picker" 
                     value="${currentConfig.network2?.trayColor || '#FFA500'}">
              <input type="text" id="network2-tray-color" class="form-input" 
                     placeholder="#FFA500" 
                     value="${currentConfig.network2?.trayColor || '#FFA500'}"
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
