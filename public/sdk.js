/**
 * InkTrust 无感验证SDK
 * 版本: 2.0.0
 * 增强版 - 支持高级指纹识别和自动化工具检测
 */
(function(window) {
  'use strict';

  // 默认配置
  const DEFAULT_CONFIG = {
    apiUrl: 'https://your-vercel-deployment-url.vercel.app/api',
    autoVerify: true,
    eventSamplingRate: 0.1, // 只发送10%的鼠标移动事件以减少请求数量
    verifyDelay: 2000, // 2秒后自动验证
    fingerprintOptions: {
      enableCanvas: true,
      enableWebGL: true,
      enableAudio: true,
      enableFonts: true
    }
  };

  class InkTrust {
    constructor(config = {}) {
      // 合并配置
      this.config = { ...DEFAULT_CONFIG, ...config };

      // 如果提供了fingerprintOptions，合并它
      if (config.fingerprintOptions) {
        this.config.fingerprintOptions = {
          ...DEFAULT_CONFIG.fingerprintOptions,
          ...config.fingerprintOptions
        };
      }

      // 初始化状态
      this.state = {
        sessionId: null,
        events: [],
        verified: false,
        result: null,
        fingerprints: {},
        automationDetected: false
      };

      // 绑定方法
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onKeyPress = this._onKeyPress.bind(this);
      this._onScroll = this._onScroll.bind(this);
      this._onTouchStart = this._onTouchStart.bind(this);
      this._onTouchMove = this._onTouchMove.bind(this);
      this._onTouchEnd = this._onTouchEnd.bind(this);
      this._onVisibilityChange = this._onVisibilityChange.bind(this);

      // 初始化
      this._init();
    }

    /**
     * 初始化SDK
     */
    async _init() {
      try {
        // 检测自动化工具
        this._detectAutomation();

        // 生成指纹
        await this._generateFingerprints();

        // 收集设备和环境信息
        const clientInfo = this._collectClientInfo();

        // 初始化会话
        const response = await fetch(`${this.config.apiUrl}/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(clientInfo)
        });

        const data = await response.json();

        if (data.success) {
          this.state.sessionId = data.sessionId;

          // 如果会话已被拒绝，不添加事件监听器
          if (data.status === 'rejected') {
            this.state.verified = true;
            this.state.result = {
              isHuman: false,
              score: 0,
              reasons: [data.rejectionReason || '自动化工具检测']
            };

            // 触发验证完成回调
            this._triggerCallback('onVerified', this.state.result);
            return;
          }

          // 添加事件监听器
          this._addEventListeners();

          // 如果配置为自动验证，设置定时器
          if (this.config.autoVerify) {
            setTimeout(() => this.verify(), this.config.verifyDelay);
          }

          // 触发初始化完成事件
          this._triggerCallback('onInitialized', {
            sessionId: data.sessionId,
            fingerprints: this.state.fingerprints
          });
        } else {
          this._triggerCallback('onError', {
            message: data.message || '初始化失败'
          });
        }
      } catch (error) {
        console.error('InkTrust初始化错误:', error);
        this._triggerCallback('onError', { message: '初始化错误', error });
      }
    }

    /**
     * 检测自动化工具
     */
    _detectAutomation() {
      const automationFlags = {};

      // 检测WebDriver
      if (navigator.webdriver) {
        automationFlags.webdriver = true;
      }

      // 检测Selenium特有属性
      const seleniumProps = [
        '__webdriver_evaluate',
        '__selenium_evaluate',
        '__webdriver_script_function',
        '__webdriver_script_func',
        '__webdriver_script_fn',
        '__fxdriver_evaluate',
        '__driver_unwrapped',
        '__webdriver_unwrapped',
        '__driver_evaluate',
        '__selenium_unwrapped',
        '__fxdriver_unwrapped',
        '_Selenium_IDE_Recorder',
        '_selenium',
        'calledSelenium'
      ];

      for (const prop of seleniumProps) {
        if (prop in window || prop in document || prop in navigator) {
          automationFlags.selenium = true;
          break;
        }
      }

      // 检测Chrome Headless
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes('headless') || userAgent.includes('phantomjs')) {
        automationFlags.headless = true;
      }

      // 检测Puppeteer/Playwright特征
      if (window.chrome && (!window.chrome.app || !window.chrome.runtime)) {
        automationFlags.puppeteerOrPlaywright = true;
      }

      // 检测异常的navigator属性
      if (navigator.plugins && navigator.plugins.length === 0) {
        automationFlags.noPlugins = true;
      }

      if (navigator.languages && navigator.languages.length === 0) {
        automationFlags.noLanguages = true;
      }

      // 检测异常的屏幕尺寸
      if (window.screen.width < 100 || window.screen.height < 100) {
        automationFlags.abnormalScreenSize = true;
      }

      // 检测异常的性能计时
      if (window.performance && window.performance.timing) {
        const timing = window.performance.timing;
        if (timing.navigationStart === timing.fetchStart) {
          automationFlags.abnormalTiming = true;
        }
      }

      // 检测异常的错误处理
      try {
        // 一些自动化工具会修改错误处理
        const originalOnError = window.onerror;
        if (originalOnError && originalOnError.toString().includes('function')) {
          automationFlags.modifiedErrorHandler = true;
        }
      } catch (e) {
        // 忽略错误
      }

      // 检测document.$cdc_asdjflasutopfhvcZLmcfl_ (Chrome WebDriver特征)
      if (document.$cdc_asdjflasutopfhvcZLmcfl_ !== undefined) {
        automationFlags.chromeWebDriver = true;
      }

      // 保存检测结果
      this.state.automationFlags = automationFlags;
      this.state.automationDetected = Object.keys(automationFlags).length > 0;
    }

    /**
     * 生成各种指纹
     */
    async _generateFingerprints() {
      const fingerprints = {};

      // 基本指纹
      fingerprints.basic = this._generateBasicFingerprint();

      // Canvas指纹
      if (this.config.fingerprintOptions.enableCanvas) {
        fingerprints.canvas = await this._generateCanvasFingerprint();
      }

      // WebGL指纹
      if (this.config.fingerprintOptions.enableWebGL) {
        const webglResult = this._generateWebGLFingerprint();
        fingerprints.webgl = webglResult.fingerprint;
        fingerprints.webglVendor = webglResult.vendor;
        fingerprints.webglRenderer = webglResult.renderer;
      }

      // 音频指纹
      if (this.config.fingerprintOptions.enableAudio) {
        fingerprints.audio = await this._generateAudioFingerprint();
      }

      // 字体指纹
      if (this.config.fingerprintOptions.enableFonts) {
        fingerprints.fonts = await this._detectFonts();
      }

      // 保存指纹
      this.state.fingerprints = fingerprints;
    }

    /**
     * 生成基本指纹
     */
    _generateBasicFingerprint() {
      const components = [
        navigator.userAgent,
        navigator.language,
        new Date().getTimezoneOffset(),
        navigator.platform,
        navigator.cpuClass || '',
        navigator.hardwareConcurrency || '',
        window.screen.colorDepth,
        window.screen.width + 'x' + window.screen.height,
        navigator.deviceMemory || '',
        navigator.maxTouchPoints || '',
        navigator.doNotTrack || '',
        navigator.cookieEnabled,
        !!window.localStorage,
        !!window.sessionStorage,
        !!window.indexedDB,
        !!window.openDatabase,
        window.devicePixelRatio || ''
      ];

      return this._hashString(components.join('###'));
    }

    /**
     * 生成Canvas指纹
     */
    async _generateCanvasFingerprint() {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        // 设置画布大小
        canvas.width = 200;
        canvas.height = 50;

        // 填充背景
        ctx.fillStyle = 'rgb(255, 255, 255)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制文本
        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.font = '18px Arial';
        ctx.textBaseline = 'top';
        ctx.fillText('InkTrust Canvas Fingerprint', 2, 2);

        // 绘制彩色文本
        ctx.fillStyle = 'rgb(255, 0, 0)';
        ctx.font = '16px Georgia';
        ctx.fillText('Red Text', 2, 22);

        // 绘制渐变
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, 'blue');
        gradient.addColorStop(1, 'green');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 40, canvas.width, 10);

        // 获取图像数据
        const imageData = canvas.toDataURL('image/png');

        // 计算哈希
        return this._hashString(imageData);
      } catch (error) {
        console.error('Canvas指纹生成错误:', error);
        return null;
      }
    }

    /**
     * 生成WebGL指纹
     */
    _generateWebGLFingerprint() {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (!gl) {
          return {
            fingerprint: null,
            vendor: null,
            renderer: null
          };
        }

        // 获取WebGL参数
        const parameters = [
          'ALIASED_LINE_WIDTH_RANGE',
          'ALIASED_POINT_SIZE_RANGE',
          'ALPHA_BITS',
          'BLUE_BITS',
          'DEPTH_BITS',
          'GREEN_BITS',
          'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
          'MAX_CUBE_MAP_TEXTURE_SIZE',
          'MAX_FRAGMENT_UNIFORM_VECTORS',
          'MAX_RENDERBUFFER_SIZE',
          'MAX_TEXTURE_IMAGE_UNITS',
          'MAX_TEXTURE_SIZE',
          'MAX_VARYING_VECTORS',
          'MAX_VERTEX_ATTRIBS',
          'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
          'MAX_VERTEX_UNIFORM_VECTORS',
          'MAX_VIEWPORT_DIMS',
          'RED_BITS',
          'RENDERER',
          'SHADING_LANGUAGE_VERSION',
          'STENCIL_BITS',
          'VENDOR',
          'VERSION'
        ];

        // 收集参数值
        const paramValues = [];
        for (const param of parameters) {
          const value = gl.getParameter(gl[param]);
          paramValues.push(`${param}:${value}`);
        }

        // 获取支持的扩展
        const extensions = gl.getSupportedExtensions() || [];
        paramValues.push(`EXTENSIONS:${extensions.join(',')}`);

        // 获取供应商和渲染器
        const vendor = gl.getParameter(gl.VENDOR);
        const renderer = gl.getParameter(gl.RENDERER);

        // 计算哈希
        const fingerprint = this._hashString(paramValues.join('###'));

        return {
          fingerprint,
          vendor,
          renderer
        };
      } catch (error) {
        console.error('WebGL指纹生成错误:', error);
        return {
          fingerprint: null,
          vendor: null,
          renderer: null
        };
      }
    }

    /**
     * 生成音频指纹
     */
    async _generateAudioFingerprint() {
      try {
        if (!window.AudioContext && !window.webkitAudioContext) {
          return null;
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const analyser = audioContext.createAnalyser();
        const gain = audioContext.createGain();

        // 设置参数
        gain.gain.value = 0; // 静音
        analyser.fftSize = 1024;
        oscillator.type = 'triangle';
        oscillator.frequency.value = 440; // A4音符

        // 连接节点
        oscillator.connect(analyser);
        analyser.connect(gain);
        gain.connect(audioContext.destination);

        // 开始生成音频
        oscillator.start(0);

        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 100));

        // 获取频域数据
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        // 停止生成音频
        oscillator.stop();
        await audioContext.close();

        // 计算哈希
        return this._hashString(Array.from(dataArray).join(','));
      } catch (error) {
        console.error('音频指纹生成错误:', error);
        return null;
      }
    }

    /**
     * 检测可用字体
     */
    async _detectFonts() {
      try {
        // 常见字体列表
        const fontList = [
          'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria',
          'Cambria Math', 'Comic Sans MS', 'Consolas', 'Courier', 'Courier New',
          'Georgia', 'Helvetica', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
          'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
          'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana'
        ];

        // 创建测试元素
        const testString = 'mmmmmmmmmmlli';
        const testSize = '72px';
        const baseFont = 'monospace';
        const baseFontWidth = await this._getTextWidth(testString, `${testSize} ${baseFont}`);

        // 检测字体
        const detectedFonts = [];

        for (const font of fontList) {
          const width = await this._getTextWidth(testString, `${testSize} ${font}, ${baseFont}`);

          // 如果宽度与基准字体不同，说明字体可用
          if (width !== baseFontWidth) {
            detectedFonts.push(font);
          }
        }

        return detectedFonts;
      } catch (error) {
        console.error('字体检测错误:', error);
        return [];
      }
    }

    /**
     * 获取文本宽度
     */
    async _getTextWidth(text, font) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = font;
      return context.measureText(text).width;
    }

    /**
     * 计算字符串哈希值
     */
    _hashString(str) {
      let hash = 0;

      if (str.length === 0) return hash.toString(16);

      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
      }

      return Math.abs(hash).toString(16);
    }

    /**
     * 收集客户端信息
     */
    _collectClientInfo() {
      // 基本信息
      const clientInfo = {
        // 指纹信息
        fingerprint: this.state.fingerprints.basic,
        canvasFingerprint: this.state.fingerprints.canvas,
        webglFingerprint: this.state.fingerprints.webgl,
        webglVendor: this.state.fingerprints.webglVendor,
        webglRenderer: this.state.fingerprints.webglRenderer,
        audioFingerprint: this.state.fingerprints.audio,
        fonts: this.state.fingerprints.fonts,

        // 设备信息
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        colorDepth: window.screen.colorDepth,
        pixelRatio: window.devicePixelRatio || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        language: navigator.language || navigator.userLanguage,
        platform: navigator.platform,

        // 硬件信息
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemory: navigator.deviceMemory || null,

        // 浏览器特性
        plugins: this._getPlugins(),
        touchSupport: 'ontouchstart' in window,
        maxTouchPoints: navigator.maxTouchPoints || 0,

        // 浏览器行为
        cookiesEnabled: navigator.cookieEnabled,
        localStorage: !!window.localStorage,
        sessionStorage: !!window.sessionStorage,
        indexedDB: !!window.indexedDB,

        // 浏览器特征
        doNotTrack: navigator.doNotTrack || null,
        adBlocker: this._detectAdBlocker(),

        // 浏览器自动化特征
        webdriver: navigator.webdriver || false,
        automationFlags: this.state.automationFlags || null,

        // 网络信息
        connectionType: this._getConnectionType(),
        connectionSpeed: this._getConnectionSpeed()
      };

      return clientInfo;
    }

    /**
     * 获取浏览器插件信息
     */
    _getPlugins() {
      if (!navigator.plugins || navigator.plugins.length === 0) {
        return '';
      }

      const plugins = [];
      for (let i = 0; i < navigator.plugins.length; i++) {
        const plugin = navigator.plugins[i];
        plugins.push(plugin.name);
      }

      return plugins.join(',');
    }

    /**
     * 检测广告拦截器
     */
    _detectAdBlocker() {
      // 简单检测，实际应用中可以使用更复杂的方法
      const testDiv = document.createElement('div');
      testDiv.innerHTML = '&nbsp;';
      testDiv.className = 'adsbox';
      document.body.appendChild(testDiv);

      const isAdBlockerActive = testDiv.offsetHeight === 0;
      document.body.removeChild(testDiv);

      return isAdBlockerActive;
    }

    /**
     * 获取网络连接类型
     */
    _getConnectionType() {
      if (navigator.connection && navigator.connection.type) {
        return navigator.connection.type;
      }

      if (navigator.connection && navigator.connection.effectiveType) {
        return navigator.connection.effectiveType;
      }

      return null;
    }

    /**
     * 获取网络连接速度
     */
    _getConnectionSpeed() {
      if (navigator.connection && navigator.connection.downlink) {
        return navigator.connection.downlink; // Mbps
      }

      return null;
    }

    /**
     * 添加事件监听器
     */
    _addEventListeners() {
      document.addEventListener('mousemove', this._onMouseMove, { passive: true });
      document.addEventListener('click', this._onClick, { passive: true });
      document.addEventListener('keypress', this._onKeyPress, { passive: true });
      document.addEventListener('scroll', this._onScroll, { passive: true });
      document.addEventListener('touchstart', this._onTouchStart, { passive: true });
      document.addEventListener('touchmove', this._onTouchMove, { passive: true });
      document.addEventListener('touchend', this._onTouchEnd, { passive: true });
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    /**
     * 移除事件监听器
     */
    _removeEventListeners() {
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('click', this._onClick);
      document.removeEventListener('keypress', this._onKeyPress);
      document.removeEventListener('scroll', this._onScroll);
      document.removeEventListener('touchstart', this._onTouchStart);
      document.removeEventListener('touchmove', this._onTouchMove);
      document.removeEventListener('touchend', this._onTouchEnd);
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
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
    _onKeyPress(event) {
      this._recordEvent('keypress', {
        keyCode: event.keyCode,
        timestamp: Date.now()
      });
    }

    /**
     * 滚动事件处理
     */
    _onScroll() {
      this._recordEvent('scroll', {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        timestamp: Date.now()
      });
    }

    /**
     * 触摸开始事件处理
     */
    _onTouchStart(event) {
      if (event.touches.length > 0) {
        const touch = event.touches[0];
        this._recordEvent('touchstart', {
          x: touch.clientX,
          y: touch.clientY,
          touchCount: event.touches.length,
          timestamp: Date.now()
        });
      }
    }

    /**
     * 触摸移动事件处理
     */
    _onTouchMove(event) {
      // 使用采样率减少事件数量
      if (Math.random() > this.config.eventSamplingRate) return;

      if (event.touches.length > 0) {
        const touch = event.touches[0];
        this._recordEvent('touchmove', {
          x: touch.clientX,
          y: touch.clientY,
          touchCount: event.touches.length,
          timestamp: Date.now()
        });
      }
    }

    /**
     * 触摸结束事件处理
     */
    _onTouchEnd(event) {
      this._recordEvent('touchend', {
        touchCount: event.touches.length,
        timestamp: Date.now()
      });
    }

    /**
     * 页面可见性变化事件处理
     */
    _onVisibilityChange() {
      this._recordEvent('visibilitychange', {
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        timestamp: Date.now()
      });
    }

    /**
     * 记录事件
     */
    async _recordEvent(type, data) {
      if (!this.state.sessionId || this.state.verified) return;

      // 添加到本地事件队列
      this.state.events.push({ type, data });

      // 发送到服务器
      try {
        const response = await fetch(`${this.config.apiUrl}/event/${this.state.sessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ type, data })
        });

        const responseData = await response.json();

        // 如果会话被拒绝，停止收集事件并触发验证完成回调
        if (responseData.success === false && responseData.message === '会话已被拒绝') {
          this.state.verified = true;
          this.state.result = {
            isHuman: false,
            score: 0,
            reasons: [responseData.rejectionReason || '行为模式异常']
          };

          // 移除事件监听器
          this._removeEventListeners();

          // 触发验证完成回调
          this._triggerCallback('onVerified', this.state.result);
        }
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
          this._triggerCallback('onError', { message: data.message || '验证失败' });
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
     * 获取会话状态
     */
    async getStatus() {
      if (!this.state.sessionId) return null;

      try {
        const response = await fetch(`${this.config.apiUrl}/status/${this.state.sessionId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        return await response.json();
      } catch (error) {
        console.error('获取状态错误:', error);
        return null;
      }
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
        result: null,
        fingerprints: {},
        automationDetected: false
      };
    }
  }

  // 暴露给全局
  window.InkTrust = InkTrust;

})(window);
