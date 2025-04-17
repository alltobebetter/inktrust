/**
 * InkTrust 无感验证SDK
 * 版本: 1.0.0
 */
(function(window) {
  'use strict';
  
  // 默认配置
  const DEFAULT_CONFIG = {
    apiUrl: 'https://your-vercel-deployment-url.vercel.app/api',
    autoVerify: true,
    eventSamplingRate: 0.1, // 只发送10%的鼠标移动事件以减少请求数量
    verifyDelay: 2000 // 2秒后自动验证
  };
  
  class InkTrust {
    constructor(config = {}) {
      // 合并配置
      this.config = { ...DEFAULT_CONFIG, ...config };
      
      // 初始化状态
      this.state = {
        sessionId: null,
        events: [],
        verified: false,
        result: null
      };
      
      // 绑定方法
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onKeyPress = this._onKeyPress.bind(this);
      
      // 初始化
      this._init();
    }
    
    /**
     * 初始化SDK
     */
    async _init() {
      try {
        // 收集设备信息
        const deviceInfo = this._collectDeviceInfo();
        
        // 初始化会话
        const response = await fetch(`${this.config.apiUrl}/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(deviceInfo)
        });
        
        const data = await response.json();
        
        if (data.success) {
          this.state.sessionId = data.sessionId;
          
          // 添加事件监听器
          this._addEventListeners();
          
          // 如果配置为自动验证，设置定时器
          if (this.config.autoVerify) {
            setTimeout(() => this.verify(), this.config.verifyDelay);
          }
          
          // 触发初始化完成事件
          this._triggerCallback('onInitialized', { sessionId: data.sessionId });
        } else {
          this._triggerCallback('onError', { message: '初始化失败' });
        }
      } catch (error) {
        console.error('InkTrust初始化错误:', error);
        this._triggerCallback('onError', { message: '初始化错误', error });
      }
    }
    
    /**
     * 收集设备信息
     */
    _collectDeviceInfo() {
      return {
        fingerprint: this._generateFingerprint(),
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language || navigator.userLanguage,
        platform: navigator.platform,
        colorDepth: window.screen.colorDepth
      };
    }
    
    /**
     * 生成简单的设备指纹
     */
    _generateFingerprint() {
      const components = [
        navigator.userAgent,
        navigator.language,
        new Date().getTimezoneOffset(),
        navigator.platform,
        navigator.cpuClass || '',
        navigator.hardwareConcurrency || '',
        window.screen.colorDepth,
        window.screen.width + 'x' + window.screen.height
      ];
      
      return components.join('###');
    }
    
    /**
     * 添加事件监听器
     */
    _addEventListeners() {
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('click', this._onClick);
      document.addEventListener('keypress', this._onKeyPress);
    }
    
    /**
     * 移除事件监听器
     */
    _removeEventListeners() {
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('click', this._onClick);
      document.removeEventListener('keypress', this._onKeyPress);
    }
    
    /**
     * 鼠标移动事件处理
     */
    _onMouseMove(event) {
      // 使用采样率减少事件数量
      if (Math.random() > this.config.eventSamplingRate) return;
      
      this._recordEvent('mousemove', {
        x: event.clientX,
        y: event.clientY,
        timestamp: Date.now()
      });
    }
    
    /**
     * 点击事件处理
     */
    _onClick(event) {
      this._recordEvent('click', {
        x: event.clientX,
        y: event.clientY,
        target: event.target.tagName,
        timestamp: Date.now()
      });
    }
    
    /**
     * 按键事件处理
     */
    _onKeyPress() {
      this._recordEvent('keypress', {
        timestamp: Date.now()
      });
    }
    
    /**
     * 记录事件
     */
    async _recordEvent(type, data) {
      if (!this.state.sessionId) return;
      
      // 添加到本地事件队列
      this.state.events.push({ type, data });
      
      // 发送到服务器
      try {
        await fetch(`${this.config.apiUrl}/event/${this.state.sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ type, data })
        });
      } catch (error) {
        console.error('发送事件错误:', error);
      }
    }
    
    /**
     * 验证会话
     */
    async verify() {
      if (!this.state.sessionId || this.state.verified) return;
      
      try {
        const response = await fetch(`${this.config.apiUrl}/verify/${this.state.sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          this.state.verified = true;
          this.state.result = data.result;
          
          // 移除事件监听器，不再需要收集事件
          this._removeEventListeners();
          
          // 触发验证完成回调
          this._triggerCallback('onVerified', data.result);
          
          return data.result;
        } else {
          this._triggerCallback('onError', { message: '验证失败' });
          return null;
        }
      } catch (error) {
        console.error('验证错误:', error);
        this._triggerCallback('onError', { message: '验证错误', error });
        return null;
      }
    }
    
    /**
     * 获取验证结果
     */
    getResult() {
      return this.state.result;
    }
    
    /**
     * 触发回调函数
     */
    _triggerCallback(callbackName, data) {
      if (typeof this.config[callbackName] === 'function') {
        this.config[callbackName](data);
      }
    }
    
    /**
     * 销毁实例
     */
    destroy() {
      this._removeEventListeners();
      this.state = {
        sessionId: null,
        events: [],
        verified: false,
        result: null
      };
    }
  }
  
  // 暴露给全局
  window.InkTrust = InkTrust;
  
})(window);
