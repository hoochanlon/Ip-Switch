/**
 * 网络在线/离线状态检测
 * 不仅检测网络接口连接，还实际测试网络连接
 */

class NetworkStatus {
  constructor(callback, options = {}) {
    this.callback = callback;
    this.checkInterval = options.checkInterval || 5000; // 默认5秒检查一次
    this.timeout = options.timeout || 3000; // 请求超时时间
    // 避免外部站点资源（如 google favicon）触发 WebView2 Tracking Prevention 噪声日志。
    // 这里用无跨域依赖的“轻量请求”目标（纯 HTTPS endpoint），并加 no-cors/超时控制。
    this.testUrls = options.testUrls || [
      'https://1.1.1.1/',
      'https://www.cloudflare.com/',
      'https://www.microsoft.com/'
    ];
    this.isOnline = navigator.onLine;
    this.isChecking = false;
    this.intervalId = null;
    this.init();
  }

  init() {
    // 监听浏览器在线事件（作为快速响应）
    window.addEventListener('online', () => {
      // 立即检查实际连接
      this.checkConnection();
    });

    // 监听浏览器离线事件（立即标记为离线）
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notify(false);
    });

    // 立即进行一次连接检查
    this.checkConnection();
    
    // 定期检查网络连接
    this.startPeriodicCheck();
  }

  async checkConnection() {
    // 如果正在检查，跳过
    if (this.isChecking) return;
    
    // 如果 navigator.onLine 为 false，直接标记为离线
    if (!navigator.onLine) {
      if (this.isOnline) {
        this.isOnline = false;
        this.notify(false);
      }
      return;
    }

    this.isChecking = true;
    
    try {
      // 使用图片加载来检测网络连接（不会被 CORS 阻止）
      const connected = await this.testImageLoad();
      
      // 更新状态
      if (this.isOnline !== connected) {
        this.isOnline = connected;
        this.notify(connected);
      }
    } catch (error) {
      // 网络请求失败，标记为离线
      if (this.isOnline) {
        this.isOnline = false;
        this.notify(false);
      }
    } finally {
      this.isChecking = false;
    }
  }

  testImageLoad() {
    return new Promise((resolve) => {
      const testUrls = this.testUrls;
      
      let completed = 0;
      let hasSuccess = false;
      
      const checkComplete = () => {
        completed++;
        if (hasSuccess || completed >= testUrls.length) {
          resolve(hasSuccess);
        }
      };
      
      // 使用 fetch(no-cors) 来做“能否建立 HTTPS 连接”的探测，避免加载第三方图片造成追踪防护提示。
      testUrls.forEach((url) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        fetch(`${url}?t=${Date.now()}`, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        })
          .then(() => {
            clearTimeout(timeoutId);
            if (!hasSuccess) {
              hasSuccess = true;
              resolve(true);
            }
          })
          .catch(() => {
            clearTimeout(timeoutId);
            checkComplete();
          });
      });
    });
  }

  startPeriodicCheck() {
    // 定期检查网络连接
    this.intervalId = setInterval(() => {
      this.checkConnection();
    }, this.checkInterval);
  }

  notify(isOnline) {
    if (this.callback) {
      this.callback({
        isOnline,
        timestamp: new Date()
      });
    }
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      timestamp: new Date()
    };
  }

  destroy() {
    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export default NetworkStatus;
