// 简单 i18n（中/英）支持
// - 静态文案：给元素加 data-i18n="key"，可选 data-i18n-attr="placeholder|title|aria-label"
// - 动态文案：使用 t('key', {var}) 插值

const STORAGE_KEY = 'lang';

const DICT = {
  zh: {
    appTitle: 'IP Switch',
    refresh: '刷新',
    editHosts: '编辑 Hosts',
    editProxy: '编辑代理',
    about: '关于',

    online: '在线',
    offline: '离线',
    sceneMode: '场景模式:',
    sceneNotApplied: '未应用',

    networkStatus: '网络状态',
    searchAdapters: '搜索网卡名称...',
    adapterFilter: '筛选',
    showAdapters: '显示网卡',
    selectAll: '全选',
    selectNone: '全不选',
    noAdaptersFound: '未检测到网络适配器，请确保以管理员权限运行',
    loadingNetworkInfo: '正在加载网络信息...',
    fetchNetworkInfoFailed: '获取网络信息失败: {error}',
    ensureAdmin: '请确保以管理员权限运行',

    sceneNameRequired: '请输入场景名称',
    sceneSelectAdapterRequired: '请至少选择一个网卡并配置',

    // 通用
    ok: '确定',
    cancel: '取消',
    save: '保存',
    config: '配置',
    enabled: '启用',

    // 侧边栏/场景
    sceneManager: '网卡场景管理',
    create: '新建',
    edit: '编辑',
    apply: '应用',
    restore: '解除',
    delete: '删除',
    clear: '清空',
    export: '导出',
    import: '导入',
    autoSwitch: '自动双向切换',
    noScenes: '暂无场景',
    clickNewToCreate: '点击"新建"创建',
    adapterCount: '{count} 个网卡',
    noAdaptersAvailable: '没有可用的网络适配器',
    sceneNotFound: '场景不存在',
    loadSceneFailed: '加载场景失败: {error}',
    confirmDeleteScene: '确定要删除场景 "{name}" 吗？',
    confirmClearScenes: '确定要清空所有场景吗？此操作不可恢复！',
    confirmRestoreScene: '确定要解除当前场景并恢复到应用场景前的配置吗？',

    // About
    aboutVersion: '版本: 1.0.0',
    aboutTagline: '一个便捷的 IP、Hosts、代理配置管理工具',
    aboutProjectUrlLabel: '项目地址：',
    aboutDescription: '本项目基于 Tauri 2.0 构建，提供了便捷的网络配置管理功能，包括静态 IP 配置、DHCP 设置、Hosts 文件编辑和代理配置等。',
    sceneName: '场景名称',
    trayColor: '托盘图标颜色',
    trayColorHint: '支持十六进制颜色格式，例如: #3366FF（蓝色）',
    sceneNamePlaceholder: '例如: 办公室网络',
    selectAdaptersToConfigure: '选择要配置的网卡',
    saveScene: '保存场景',

    // Hosts
    hostsEditorTitle: '编辑 Hosts 文件',
    remoteUrl: '远程URL:',
    update: '更新',
    scheduledUpdate: '定时更新（每天9:00、17:00）',
    loadHostsFailed: '加载Hosts文件失败: {error}',
    enterRemoteUrl: '请输入远程URL',

    // Proxy
    proxyEditorTitle: '编辑代理配置',
    proxyEnabled: '启用代理',
    proxyServer: '代理服务器:',
    proxyBypass: '绕过列表:',
    proxyAutoDetect: '自动检测设置',
    proxyUseScript: '使用设置脚本',
    proxyScriptAddress: '脚本地址:',
    proxyServerHint: '格式: IP:端口 或 域名:端口',
    proxyBypassHint: '多个地址用分号(;)分隔，例如: localhost;127.0.0.1;*.local',
    loadProxyFailed: '加载代理配置失败: {error}',
    proxyServerRequired: '启用代理时必须填写代理服务器地址',
    proxyUpdated: '代理配置已更新',
    updateProxyFailed: '更新代理失败: {error}',

    // 网络配置
    configureNetwork: '配置网络',
    disableAdapter: '禁用',
    enableAdapter: '启用',
    adapterDisabled: '网卡已禁用',
    adapterEnabled: '网卡已启用',
    disableAdapterFailed: '禁用网卡失败: {error}',
    enableAdapterFailed: '启用网卡失败: {error}',
    networkConfigTitle: '配置网络: {name}',
    ipConfigType: 'IP配置类型:',
    dhcp: '动态IP (DHCP)',
    staticIp: '静态IP',
    ipAddress: 'IP地址:',
    subnetMask: '子网掩码:',
    gateway: '网关:',
    dnsServers: 'DNS服务器:',
    dnsServersLabelShort: 'DNS服务器 (多个用逗号分隔，例：8.8.8.8,8.8.4.4)',
    dnsServersHint: '多个DNS服务器用逗号分隔，例如: 8.8.8.8,8.8.4.4。留空则使用系统/网关提供的DNS。',
    ipExample: '例如: 192.168.1.100',
    subnetExample: '例如: 255.255.255.0',
    gatewayExample: '例如: 192.168.1.1',
    switchToDhcpOk: '已切换到动态IP (DHCP){suffix}',
    dhcpDnsSuffix: '，并已设置自定义 DNS',
    configFailed: '配置失败: {error}',
    staticConfigIncomplete: '请填写完整的IP配置信息（IP地址、子网掩码、网关）',
    ipFormatInvalid: 'IP地址格式不正确，请使用正确的IPv4格式',
    staticConfigOk: '静态IP配置成功',

    // 网络卡片/适配器类型
    connected: '已连接',
    disconnected: '未连接',
    unknown: '未知',
    notConfigured: '未配置',
    noMatchingAdapters: '未找到匹配的网卡',
    ipStatus: 'IP状态',
    macAddress: 'MAC',
    ipAddressLabel: 'IP地址',
    subnetMaskLabel: '子网掩码',
    gatewayLabel: '网关',
    staticIpShort: '静态IP',
    ethernet: 'Ethernet',
    bluetooth: 'Bluetooth',
    other: 'Other',
    // 适配器统计 / 状态
    speedLabel: '速度',
    durationLabel: '持续时间',
    bytesSentLabel: '已发送',
    bytesReceivedLabel: '已接收',
    mediaStateLabel: '媒体状态',
    mediaStateEnabled: '已启用',
    mediaStateDisabled: '已禁用',
    mediaStateDisconnected: '网线被拔出',
    mediaStateUpMediaDisconnected: '网线被拔出',

    // 自动切换
    autoSwitchConfigTitle: '自动双向切换配置',
    autoSwitchEnabled: '启用自动切换',
    networkAdapter: '网络适配器',
    network1Config: '网络1配置',
    network2Config: '网络2配置',
    mode: '模式',
    dnsServersComma: 'DNS服务器（逗号分隔）',
    pingTarget: 'Ping测试目标',
    pingTargetPlaceholder1: '例如: baidu.com 或 1.1.1.1',
    pingTargetPlaceholder2: '例如: 172.16.1.254',
    pingHintToNetwork2: '无法ping通时将尝试切换到网络2',
    pingHintToNetwork1: '无法ping通时将尝试切换到网络1',
    trayColorNetwork1: '托盘图标颜色（网络1）',
    trayColorNetwork2: '托盘图标颜色（网络2）',
    selectAdapter: '请选择网络适配器',
    pingTargetsRequired: '请填写两个网络的ping测试目标',
    network1: '网络1',
    network2: '网络2',
    // 额外弹窗/提示
    sceneAutoApplyFailed: '场景已保存，但自动应用失败: {error}',
    sceneSaveFailed: '保存场景失败: {error}',
    requestAdminFailed: '请求管理员权限失败: {error}\n\n请手动右键点击应用程序，选择\"以管理员身份运行\"。',
    applySceneFailed: '应用场景失败: {error}',
    exportScenesOk: '场景配置已导出',
    exportScenesFailed: '导出场景配置失败: {error}',
    importScenesOk: '场景配置已导入',
    importScenesFailed: '导入场景配置失败: {error}',
    deleteSceneFailed: '删除场景失败: {error}',
    clearScenesOk: '所有场景已清空',
    clearScenesFailed: '清空场景失败: {error}',
    restoreSceneOk: '场景已解除，配置已恢复',
    restoreSceneFailed: '解除场景失败: {error}',
    urlFormatInvalid: 'URL格式不正确，请输入有效的URL',
    remoteContentEmpty: '远程内容为空',
    remoteUpdateFailed: '从远程更新hosts失败: {error}\n\n请检查：\n1. 网络连接是否正常\n2. URL是否正确\n3. 服务器是否可访问',
    hostsUpdatedOk: 'Hosts文件已更新',
    hostsUpdateFailed: '更新Hosts失败: {error}',
    updating: '更新中...',
  },
  en: {
    appTitle: 'IP Switch',
    refresh: 'Refresh',
    editHosts: 'Edit Hosts',
    editProxy: 'Edit Proxy',
    about: 'About',

    online: 'Online',
    offline: 'Offline',
    sceneMode: 'Scene:',
    sceneNotApplied: 'Not applied',

    networkStatus: 'Network',
    searchAdapters: 'Search adapters...',
    adapterFilter: 'Filter',
    showAdapters: 'Show adapters',
    selectAll: 'Select all',
    selectNone: 'Select none',
    noAdaptersFound: 'No network adapters detected. Please run as Administrator.',
    loadingNetworkInfo: 'Loading network info...',
    fetchNetworkInfoFailed: 'Failed to fetch network info: {error}',
    ensureAdmin: 'Please run as Administrator.',

    sceneNameRequired: 'Please enter a scene name.',
    sceneSelectAdapterRequired: 'Please select at least one adapter and configure it.',

    // Common
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    config: 'Config',
    enabled: 'Enable',

    // Sidebar / scenes
    sceneManager: 'Scene Manager',
    create: 'New',
    edit: 'Edit',
    apply: 'Apply',
    restore: 'Restore',
    delete: 'Delete',
    clear: 'Clear',
    export: 'Export',
    import: 'Import',
    autoSwitch: 'Auto Switch (2-way)',
    noScenes: 'No scenes',
    clickNewToCreate: 'Click "New" to create.',
    adapterCount: '{count} adapters',
    noAdaptersAvailable: 'No network adapters available.',
    sceneNotFound: 'Scene not found.',
    loadSceneFailed: 'Failed to load scene: {error}',
    confirmDeleteScene: 'Delete scene "{name}"?',
    confirmClearScenes: 'Clear all scenes? This cannot be undone.',
    confirmRestoreScene: 'Restore the previous configuration before applying the current scene?',

    // About
    aboutVersion: 'Version: 1.0.0',
    aboutTagline: 'A handy tool for managing IP, Hosts, and proxy settings.',
    aboutProjectUrlLabel: 'Project URL:',
    aboutDescription: 'Built with Tauri 2.0, providing convenient network configuration management including static IP, DHCP, Hosts file editing, and proxy settings.',
    sceneName: 'Scene name',
    trayColor: 'Tray icon color',
    trayColorHint: 'Supports hexadecimal color format, e.g. #3366FF (blue).',
    sceneNamePlaceholder: 'e.g. Office network',
    selectAdaptersToConfigure: 'Select adapters to configure',
    saveScene: 'Save scene',

    // Hosts
    hostsEditorTitle: 'Edit Hosts File',
    remoteUrl: 'Remote URL:',
    update: 'Update',
    scheduledUpdate: 'Scheduled update (daily 09:00, 17:00)',
    loadHostsFailed: 'Failed to load hosts file: {error}',
    enterRemoteUrl: 'Please enter a remote URL.',

    // Proxy
    proxyEditorTitle: 'Edit Proxy Settings',
    proxyEnabled: 'Enable proxy',
    proxyServer: 'Proxy server:',
    proxyBypass: 'Bypass list:',
    proxyAutoDetect: 'Automatically detect settings',
    proxyUseScript: 'Use setup script',
    proxyScriptAddress: 'Script address:',
    proxyServerHint: 'Format: IP:port or domain:port',
    proxyBypassHint: 'Separate entries with semicolons (;), e.g. localhost;127.0.0.1;*.local',
    loadProxyFailed: 'Failed to load proxy settings: {error}',
    proxyServerRequired: 'Proxy server is required when proxy is enabled.',
    proxyUpdated: 'Proxy settings updated.',
    updateProxyFailed: 'Failed to update proxy: {error}',

    // Network config
    configureNetwork: 'Configure',
    disableAdapter: 'Disable',
    enableAdapter: 'Enable',
    adapterDisabled: 'Adapter disabled',
    adapterEnabled: 'Adapter enabled',
    disableAdapterFailed: 'Failed to disable adapter: {error}',
    enableAdapterFailed: 'Failed to enable adapter: {error}',
    networkConfigTitle: 'Configure network: {name}',
    ipConfigType: 'IP mode:',
    dhcp: 'DHCP',
    staticIp: 'Static IP',
    ipAddress: 'IP address:',
    subnetMask: 'Subnet mask:',
    gateway: 'Gateway:',
    dnsServers: 'DNS servers:',
    dnsServersLabelShort: 'DNS servers (comma-separated, e.g. 8.8.8.8,8.8.4.4)',
    dnsServersHint: 'Separate DNS servers with commas, e.g. 8.8.8.8,8.8.4.4. Leave empty to use system/gateway DNS.',
    ipExample: 'e.g. 192.168.1.100',
    subnetExample: 'e.g. 255.255.255.0',
    gatewayExample: 'e.g. 192.168.1.1',
    switchToDhcpOk: 'Switched to DHCP{suffix}',
    dhcpDnsSuffix: ' (custom DNS applied)',
    configFailed: 'Configuration failed: {error}',
    staticConfigIncomplete: 'Please fill in IP address, subnet mask, and gateway.',
    ipFormatInvalid: 'Invalid IPv4 format.',
    staticConfigOk: 'Static IP configured successfully.',

    // Network cards / adapter types
    connected: 'Connected',
    disconnected: 'Disconnected',
    unknown: 'Unknown',
    notConfigured: 'Not configured',
    noMatchingAdapters: 'No matching adapters found.',
    ipStatus: 'IP status',
    macAddress: 'MAC',
    ipAddressLabel: 'IP address',
    subnetMaskLabel: 'Subnet mask',
    gatewayLabel: 'Gateway',
    staticIpShort: 'Static',
    ethernet: 'Ethernet',
    bluetooth: 'Bluetooth',
    other: 'Other',
    // Adapter statistics / state
    speedLabel: 'Speed',
    durationLabel: 'Duration',
    bytesSentLabel: 'Bytes sent',
    bytesReceivedLabel: 'Bytes received',
    mediaStateLabel: 'Media state',
    mediaStateEnabled: 'Enabled',
    mediaStateDisabled: 'Disabled',
    mediaStateDisconnected: 'Cable unplugged',
    mediaStateUpMediaDisconnected: 'Cable unplugged',

    // Auto switch
    autoSwitchConfigTitle: 'Auto Switch (2-way) Configuration',
    autoSwitchEnabled: 'Enable auto switch',
    networkAdapter: 'Network adapter',
    network1Config: 'Network 1 configuration',
    network2Config: 'Network 2 configuration',
    mode: 'Mode',
    dnsServersComma: 'DNS servers (comma-separated)',
    pingTarget: 'Ping target',
    pingTargetPlaceholder1: 'e.g. baidu.com or 1.1.1.1',
    pingTargetPlaceholder2: 'e.g. 172.16.1.254',
    pingHintToNetwork2: 'If ping fails, it will try switching to Network 2.',
    pingHintToNetwork1: 'If ping fails, it will try switching to Network 1.',
    trayColorNetwork1: 'Tray icon color (Network 1)',
    trayColorNetwork2: 'Tray icon color (Network 2)',
    selectAdapter: 'Please select a network adapter.',
    pingTargetsRequired: 'Please fill in ping targets for both networks.',
    network1: 'Network 1',
    network2: 'Network 2',
    // Extra dialogs / messages
    sceneAutoApplyFailed: 'Scene saved, but auto-apply failed: {error}',
    sceneSaveFailed: 'Failed to save scene: {error}',
    requestAdminFailed: 'Failed to request administrator privileges: {error}\n\nPlease manually right-click the app and choose "Run as administrator".',
    applySceneFailed: 'Failed to apply scene: {error}',
    exportScenesOk: 'Scene configuration exported.',
    exportScenesFailed: 'Failed to export scene configuration: {error}',
    importScenesOk: 'Scene configuration imported.',
    importScenesFailed: 'Failed to import scene configuration: {error}',
    deleteSceneFailed: 'Failed to delete scene: {error}',
    clearScenesOk: 'All scenes cleared.',
    clearScenesFailed: 'Failed to clear scenes: {error}',
    restoreSceneOk: 'Scene restored and configuration reverted.',
    restoreSceneFailed: 'Failed to restore scene: {error}',
    urlFormatInvalid: 'Invalid URL. Please enter a valid URL.',
    remoteContentEmpty: 'Remote content is empty.',
    remoteUpdateFailed: 'Failed to update hosts from remote: {error}\n\nPlease check:\n1. Network connection\n2. URL correctness\n3. Server availability',
    hostsUpdatedOk: 'Hosts file updated.',
    hostsUpdateFailed: 'Failed to update hosts file: {error}',
    updating: 'Updating...',
  }
};

function detectSystemLanguage() {
  const langs = (navigator.languages && navigator.languages.length > 0)
    ? navigator.languages
    : [navigator.language].filter(Boolean);
  const first = String(langs[0] || '').toLowerCase();
  // 跟随系统：只要是 zh-*（中国/香港/台湾/新加坡等）都显示中文，其它默认英文
  return first.startsWith('zh') ? 'zh' : 'en';
}

export function getLanguage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  // 允许三种模式：'zh' | 'en' | 'auto'
  // - auto（或未设置）：跟随系统语言
  // - zh/en：用户手动指定
  if (raw === 'en' || raw === 'zh') return raw;
  return detectSystemLanguage();
}

export function setLanguage(lang) {
  const next = lang === 'en' ? 'en' : lang === 'auto' ? 'auto' : 'zh';
  localStorage.setItem(STORAGE_KEY, next);
  applyTranslations(document);
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: next } }));
}

export function toggleLanguage() {
  // 基于“当前生效语言”切换（auto 模式下也能正常切）
  setLanguage(getLanguage() === 'zh' ? 'en' : 'zh');
}

export function t(key, vars = {}) {
  const lang = getLanguage();
  const table = DICT[lang] || DICT.zh;
  const fallback = DICT.zh;
  let text = (table[key] ?? fallback[key] ?? key);
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

export function applyTranslations(root = document) {
  const lang = getLanguage();
  // 同步 <html lang="...">
  try {
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
  } catch {
    // ignore
  }
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;

    const attr = el.getAttribute('data-i18n-attr');
    const value = t(key);
    if (attr) el.setAttribute(attr, value);
    else el.textContent = value;

    // 可选：在 UI 上显示当前语言
    if (el.hasAttribute('data-i18n-lang-badge')) {
      el.textContent = lang.toUpperCase();
    }
  });
}

export function initI18n() {
  applyTranslations(document);
}

