/**
 * 自动化工具检测模块
 * 用于检测Selenium、Puppeteer、Playwright等自动化工具
 */
const DeviceDetector = require('device-detector-js');
const Bowser = require('bowser');
const CryptoJS = require('crypto-js');

// 设备检测器实例
const deviceDetector = new DeviceDetector();

/**
 * 检测自动化工具的特征
 * @param {Object} clientInfo 客户端信息
 * @returns {Object} 检测结果
 */
function detectAutomation(clientInfo) {
  const { userAgent, headers = {}, navigator = {}, window = {} } = clientInfo;
  
  // 初始化结果对象
  const result = {
    isAutomated: false,
    automationScore: 0, // 0-100分，越高越可能是自动化工具
    detectedTools: [],
    reasons: []
  };
  
  // 检测WebDriver
  if (detectWebDriver(navigator)) {
    result.isAutomated = true;
    result.automationScore += 30;
    result.detectedTools.push('WebDriver');
    result.reasons.push('检测到WebDriver API');
  }
  
  // 检测Selenium特征
  const seleniumResult = detectSelenium(userAgent, navigator, window);
  if (seleniumResult.detected) {
    result.isAutomated = true;
    result.automationScore += seleniumResult.score;
    result.detectedTools.push('Selenium');
    result.reasons.push(...seleniumResult.reasons);
  }
  
  // 检测Puppeteer特征
  const puppeteerResult = detectPuppeteer(userAgent, navigator, window);
  if (puppeteerResult.detected) {
    result.isAutomated = true;
    result.automationScore += puppeteerResult.score;
    result.detectedTools.push('Puppeteer');
    result.reasons.push(...puppeteerResult.reasons);
  }
  
  // 检测Playwright特征
  const playwrightResult = detectPlaywright(userAgent, navigator, window);
  if (playwrightResult.detected) {
    result.isAutomated = true;
    result.automationScore += playwrightResult.score;
    result.detectedTools.push('Playwright');
    result.reasons.push(...playwrightResult.reasons);
  }
  
  // 检测浏览器不一致性
  const browserInconsistencyResult = detectBrowserInconsistency(userAgent, headers, navigator);
  if (browserInconsistencyResult.detected) {
    result.automationScore += browserInconsistencyResult.score;
    result.reasons.push(...browserInconsistencyResult.reasons);
  }
  
  // 检测异常的屏幕尺寸
  if (detectAbnormalScreenSize(clientInfo)) {
    result.automationScore += 10;
    result.reasons.push('异常的屏幕尺寸');
  }
  
  // 检测异常的时区设置
  if (detectAbnormalTimezone(clientInfo)) {
    result.automationScore += 10;
    result.reasons.push('异常的时区设置');
  }
  
  // 检测插件数量异常
  if (detectAbnormalPluginCount(navigator)) {
    result.automationScore += 15;
    result.reasons.push('浏览器插件数量异常');
  }
  
  // 检测硬件并发异常
  if (detectAbnormalHardwareConcurrency(navigator)) {
    result.automationScore += 10;
    result.reasons.push('硬件并发数异常');
  }
  
  // 检测语言设置异常
  if (detectAbnormalLanguage(navigator, headers)) {
    result.automationScore += 5;
    result.reasons.push('语言设置异常');
  }
  
  // 检测用户代理一致性
  const uaConsistencyResult = checkUserAgentConsistency(userAgent, headers);
  if (!uaConsistencyResult.consistent) {
    result.automationScore += 20;
    result.reasons.push('用户代理不一致');
  }
  
  // 如果自动化分数超过50，认为是自动化工具
  if (result.automationScore >= 50 && !result.isAutomated) {
    result.isAutomated = true;
    result.detectedTools.push('Unknown Automation');
  }
  
  // 限制分数最大值为100
  result.automationScore = Math.min(result.automationScore, 100);
  
  return result;
}

/**
 * 检测WebDriver API
 */
function detectWebDriver(navigator) {
  if (!navigator) return false;
  
  // 检查是否存在webdriver属性
  if (navigator.webdriver === true) return true;
  
  // 检查是否存在__webdriver_evaluate、__selenium_evaluate等属性
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
    'calledSelenium',
    '_WEBDRIVER_ELEM_CACHE'
  ];
  
  for (const prop of seleniumProps) {
    if (prop in navigator) return true;
  }
  
  return false;
}

/**
 * 检测Selenium特征
 */
function detectSelenium(userAgent, navigator, window) {
  const result = {
    detected: false,
    score: 0,
    reasons: []
  };
  
  if (!userAgent || !navigator || !window) return result;
  
  // 检查用户代理中的Selenium关键词
  if (userAgent.includes('Selenium') || userAgent.includes('selenium')) {
    result.detected = true;
    result.score += 25;
    result.reasons.push('用户代理中包含Selenium关键词');
  }
  
  // 检查window对象中的Selenium特征
  const seleniumWindowProps = [
    'SeleniumWebDriverRequest',
    '_selenium',
    'selenium',
    'Selenium',
    '_Selenium_IDE_Recorder',
    'callSelenium'
  ];
  
  for (const prop of seleniumWindowProps) {
    if (prop in window) {
      result.detected = true;
      result.score += 20;
      result.reasons.push(`检测到Selenium窗口属性: ${prop}`);
      break;
    }
  }
  
  // 检查document对象中的Selenium特征
  if (window.document && window.document.$cdc_asdjflasutopfhvcZLmcfl_ !== undefined) {
    result.detected = true;
    result.score += 25;
    result.reasons.push('检测到Chrome WebDriver特征');
  }
  
  return result;
}

/**
 * 检测Puppeteer特征
 */
function detectPuppeteer(userAgent, navigator, window) {
  const result = {
    detected: false,
    score: 0,
    reasons: []
  };
  
  if (!userAgent || !navigator || !window) return result;
  
  // 检查Chrome Headless特征
  if (userAgent.includes('HeadlessChrome')) {
    result.detected = true;
    result.score += 30;
    result.reasons.push('用户代理中包含HeadlessChrome');
  }
  
  // 检查Puppeteer特有的navigator属性
  if (navigator.plugins && navigator.plugins.length === 0) {
    result.score += 10;
    result.reasons.push('浏览器插件数量为0');
  }
  
  // 检查Puppeteer特有的window属性
  if (window.chrome && (!window.chrome.app || !window.chrome.runtime)) {
    result.score += 15;
    result.reasons.push('Chrome对象不完整');
  }
  
  // 检查语言设置
  if (navigator.languages && navigator.languages.length === 0) {
    result.score += 10;
    result.reasons.push('语言列表为空');
  }
  
  if (result.score >= 30) {
    result.detected = true;
  }
  
  return result;
}

/**
 * 检测Playwright特征
 */
function detectPlaywright(userAgent, navigator, window) {
  const result = {
    detected: false,
    score: 0,
    reasons: []
  };
  
  if (!userAgent || !navigator || !window) return result;
  
  // Playwright通常会修改navigator.permissions
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    // 在实际环境中，我们可以尝试检测permissions.query的行为是否被修改
    result.score += 10;
  }
  
  // 检查Playwright特有的用户代理特征
  if (userAgent.includes('Playwright')) {
    result.detected = true;
    result.score += 30;
    result.reasons.push('用户代理中包含Playwright');
  }
  
  // 检查Playwright修改的WebGL渲染器信息
  if (window.WebGLRenderingContext) {
    // 在实际环境中，我们可以检查WebGL信息是否被修改
    result.score += 5;
  }
  
  if (result.score >= 30) {
    result.detected = true;
  }
  
  return result;
}

/**
 * 检测浏览器不一致性
 */
function detectBrowserInconsistency(userAgent, headers, navigator) {
  const result = {
    detected: false,
    score: 0,
    reasons: []
  };
  
  if (!userAgent || !navigator) return result;
  
  try {
    // 使用Bowser解析用户代理
    const parsedUA = Bowser.parse(userAgent);
    
    // 使用device-detector-js解析用户代理
    const deviceInfo = deviceDetector.parse(userAgent);
    
    // 检查浏览器名称一致性
    if (parsedUA.browser && deviceInfo.client && parsedUA.browser.name !== deviceInfo.client.name) {
      result.detected = true;
      result.score += 15;
      result.reasons.push('浏览器名称不一致');
    }
    
    // 检查操作系统一致性
    if (parsedUA.os && deviceInfo.os && parsedUA.os.name !== deviceInfo.os.name) {
      result.detected = true;
      result.score += 15;
      result.reasons.push('操作系统信息不一致');
    }
    
    // 检查平台一致性
    if (navigator.platform) {
      const platformOS = getPlatformOS(navigator.platform);
      if (parsedUA.os && platformOS && parsedUA.os.name.toLowerCase() !== platformOS.toLowerCase()) {
        result.detected = true;
        result.score += 20;
        result.reasons.push('平台与用户代理操作系统不一致');
      }
    }
    
    // 检查Accept-Language头与navigator.language一致性
    if (headers['accept-language'] && navigator.language) {
      const headerLang = headers['accept-language'].split(',')[0].trim().split('-')[0];
      const navLang = navigator.language.split('-')[0];
      
      if (headerLang !== navLang) {
        result.detected = true;
        result.score += 10;
        result.reasons.push('Accept-Language与navigator.language不一致');
      }
    }
  } catch (error) {
    // 解析错误可能也是一个信号
    result.score += 5;
    result.reasons.push('用户代理解析错误');
  }
  
  return result;
}

/**
 * 从平台字符串获取操作系统
 */
function getPlatformOS(platform) {
  platform = platform.toLowerCase();
  
  if (platform.includes('win')) return 'Windows';
  if (platform.includes('mac')) return 'macOS';
  if (platform.includes('linux') || platform.includes('x11')) return 'Linux';
  if (platform.includes('android')) return 'Android';
  if (platform.includes('iphone') || platform.includes('ipad')) return 'iOS';
  
  return null;
}

/**
 * 检测异常的屏幕尺寸
 */
function detectAbnormalScreenSize(clientInfo) {
  if (!clientInfo.screenResolution) return false;
  
  // 解析屏幕分辨率
  const [width, height] = clientInfo.screenResolution.split('x').map(Number);
  
  // 检查是否为常见的自动化工具默认尺寸
  const commonAutomatedSizes = [
    '800x600',
    '1024x768',
    '1280x800',
    '1366x768',
    '1920x1080'
  ];
  
  if (commonAutomatedSizes.includes(clientInfo.screenResolution)) {
    return true;
  }
  
  // 检查异常的宽高比
  const ratio = width / height;
  if (ratio < 1 || ratio > 3) {
    return true;
  }
  
  // 检查异常的小尺寸
  if (width < 500 || height < 500) {
    return true;
  }
  
  return false;
}

/**
 * 检测异常的时区设置
 */
function detectAbnormalTimezone(clientInfo) {
  if (!clientInfo.timezone) return false;
  
  // 检查时区是否为常见的自动化工具默认时区
  const commonAutomatedTimezones = [
    'UTC',
    'GMT',
    'Etc/GMT',
    'Etc/UTC'
  ];
  
  if (commonAutomatedTimezones.includes(clientInfo.timezone)) {
    return true;
  }
  
  return false;
}

/**
 * 检测异常的插件数量
 */
function detectAbnormalPluginCount(navigator) {
  if (!navigator || !navigator.plugins) return false;
  
  // 大多数自动化浏览器插件数量为0或非常少
  return navigator.plugins.length === 0 || navigator.plugins.length < 2;
}

/**
 * 检测异常的硬件并发数
 */
function detectAbnormalHardwareConcurrency(navigator) {
  if (!navigator || typeof navigator.hardwareConcurrency === 'undefined') return false;
  
  // 大多数自动化浏览器硬件并发数为2或4
  return navigator.hardwareConcurrency <= 2;
}

/**
 * 检测异常的语言设置
 */
function detectAbnormalLanguage(navigator, headers) {
  if (!navigator) return false;
  
  // 检查语言列表是否为空
  if (navigator.languages && navigator.languages.length === 0) {
    return true;
  }
  
  // 检查Accept-Language头是否存在
  if (headers && !headers['accept-language']) {
    return true;
  }
  
  return false;
}

/**
 * 检查用户代理一致性
 */
function checkUserAgentConsistency(userAgent, headers) {
  const result = {
    consistent: true,
    inconsistencies: []
  };
  
  if (!userAgent || !headers) return result;
  
  // 检查请求头中的User-Agent与传递的userAgent是否一致
  if (headers['user-agent'] && headers['user-agent'] !== userAgent) {
    result.consistent = false;
    result.inconsistencies.push('请求头User-Agent与客户端报告的不一致');
  }
  
  return result;
}

/**
 * 生成客户端指纹
 */
function generateClientFingerprint(clientInfo) {
  if (!clientInfo) return null;
  
  // 收集指纹组件
  const components = [
    clientInfo.userAgent || '',
    clientInfo.language || '',
    clientInfo.timezone || '',
    clientInfo.screenResolution || '',
    clientInfo.colorDepth || '',
    clientInfo.platform || '',
    clientInfo.touchSupport ? '1' : '0',
    clientInfo.webglVendor || '',
    clientInfo.webglRenderer || '',
    clientInfo.hardwareConcurrency || '',
    clientInfo.deviceMemory || '',
    clientInfo.plugins || ''
  ];
  
  // 使用SHA-256哈希生成指纹
  return CryptoJS.SHA256(components.join('###')).toString();
}

module.exports = {
  detectAutomation,
  generateClientFingerprint
};
