// 主题管理模块

/**
 * 初始化主题
 */
export function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
}

/**
 * 设置主题
 * @param {string} theme - 'light' 或 'dark'
 */
export function setTheme(theme) {
  const root = document.documentElement;
  const themeIcon = document.getElementById('theme-icon');
  
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    if (themeIcon) {
      themeIcon.src = '/imgs/svg/common/moon.svg';
    }
  } else {
    root.setAttribute('data-theme', 'light');
    if (themeIcon) {
      themeIcon.src = '/imgs/svg/common/sun.svg';
    }
  }
  
  localStorage.setItem('theme', theme);
}

/**
 * 切换主题
 */
export function toggleTheme() {
  const currentTheme = localStorage.getItem('theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

/**
 * 获取当前主题
 * @returns {string} 'light' 或 'dark'
 */
export function getCurrentTheme() {
  return localStorage.getItem('theme') || 'light';
}
