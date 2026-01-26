/**
 * 网络在线/离线状态检测
 * 不仅检测网络接口连接，还实际测试网络连接
 */

class NetworkStatus {
  constructor(callback, options = {}) {
    this.callback = callback;
    this.checkInterval = options.checkInterval || 5000; // 默认5秒检查一次
    this.timeout = options.timeout || 3000; // 请求超时时间
    this.testUrls = options.testUrls || [
      'https://www.google.com/favicon.ico',
      'https://www.baidu.com/favicon.ico',
      'https://1.1.1.1/favicon.ico' // Cloudflare DNS
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
      // 尝试多个测试 URL
      const testUrls = [
        'https://www.google.com/favicon.ico',
        'https://www.baidu.com/favicon.ico',
        'https://1.1.1.1/favicon.ico'
      ];
      
      let completed = 0;
      let hasSuccess = false;
      
      const checkComplete = () => {
        completed++;
        if (hasSuccess || completed >= testUrls.length) {
          resolve(hasSuccess);
        }
      };
      
      // 尝试每个 URL
      testUrls.forEach(url => {
        const img = new Image();
        const timeoutId = setTimeout(() => {
          img.onload = null;
          img.onerror = null;
          checkComplete();
        }, this.timeout);
        
        img.onload = () => {
          clearTimeout(timeoutId);
          if (!hasSuccess) {
            hasSuccess = true;
            resolve(true);
          }
        };
        
        img.onerror = () => {
          clearTimeout(timeoutId);
          checkComplete();
        };
        
        // 添加时间戳避免缓存
        img.src = url + '?t=' + Date.now();
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
