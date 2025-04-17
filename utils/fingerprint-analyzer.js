/**
 * 高级指纹分析模块
 * 用于生成和分析设备指纹
 */
const CryptoJS = require('crypto-js');

/**
 * 分析设备指纹
 * @param {Object} clientInfo 客户端信息
 * @returns {Object} 分析结果
 */
function analyzeFingerprint(clientInfo) {
  const result = {
    score: 0, // 0-100，越高越可能是真实用户
    reasons: [],
    fingerprint: null,
    fingerprintComponents: {},
    anomalies: []
  };
  
  if (!clientInfo) {
    result.reasons.push('缺少客户端信息');
    return result;
  }
  
  // 提取指纹组件
  const components = extractFingerprintComponents(clientInfo);
  result.fingerprintComponents = components;
  
  // 生成指纹哈希
  result.fingerprint = generateFingerprintHash(components);
  
  // 检查Canvas指纹
  if (components.canvasFingerprint) {
    const canvasResult = analyzeCanvasFingerprint(components.canvasFingerprint);
    result.score += canvasResult.score;
    
    if (canvasResult.anomalies.length > 0) {
      result.anomalies.push(...canvasResult.anomalies);
      result.reasons.push('Canvas指纹异常');
    }
  } else {
    result.anomalies.push('缺少Canvas指纹');
    result.reasons.push('缺少Canvas指纹');
    result.score -= 15;
  }
  
  // 检查WebGL指纹
  if (components.webglFingerprint) {
    const webglResult = analyzeWebGLFingerprint(components.webglFingerprint, components.webglVendor, components.webglRenderer);
    result.score += webglResult.score;
    
    if (webglResult.anomalies.length > 0) {
      result.anomalies.push(...webglResult.anomalies);
      result.reasons.push('WebGL指纹异常');
    }
  } else {
    result.anomalies.push('缺少WebGL指纹');
    result.reasons.push('缺少WebGL指纹');
    result.score -= 15;
  }
  
  // 检查音频指纹
  if (components.audioFingerprint) {
    const audioResult = analyzeAudioFingerprint(components.audioFingerprint);
    result.score += audioResult.score;
    
    if (audioResult.anomalies.length > 0) {
      result.anomalies.push(...audioResult.anomalies);
      result.reasons.push('音频指纹异常');
    }
  }
  
  // 检查字体列表
  if (components.fonts && components.fonts.length > 0) {
    const fontsResult = analyzeFonts(components.fonts);
    result.score += fontsResult.score;
    
    if (fontsResult.anomalies.length > 0) {
      result.anomalies.push(...fontsResult.anomalies);
      result.reasons.push('字体列表异常');
    }
  } else {
    result.anomalies.push('缺少字体信息');
    result.score -= 10;
  }
  
  // 检查插件列表
  if (components.plugins) {
    const pluginsResult = analyzePlugins(components.plugins);
    result.score += pluginsResult.score;
    
    if (pluginsResult.anomalies.length > 0) {
      result.anomalies.push(...pluginsResult.anomalies);
      result.reasons.push('插件列表异常');
    }
  } else {
    result.anomalies.push('缺少插件信息');
    result.score -= 10;
  }
  
  // 检查屏幕信息
  if (components.screenResolution) {
    const screenResult = analyzeScreenInfo(
      components.screenResolution,
      components.colorDepth,
      components.pixelRatio
    );
    result.score += screenResult.score;
    
    if (screenResult.anomalies.length > 0) {
      result.anomalies.push(...screenResult.anomalies);
      result.reasons.push('屏幕信息异常');
    }
  }
  
  // 检查硬件信息
  if (components.hardwareConcurrency || components.deviceMemory) {
    const hardwareResult = analyzeHardwareInfo(
      components.hardwareConcurrency,
      components.deviceMemory
    );
    result.score += hardwareResult.score;
    
    if (hardwareResult.anomalies.length > 0) {
      result.anomalies.push(...hardwareResult.anomalies);
      result.reasons.push('硬件信息异常');
    }
  }
  
  // 检查时区信息
  if (components.timezone) {
    const timezoneResult = analyzeTimezone(components.timezone, components.timezoneOffset);
    result.score += timezoneResult.score;
    
    if (timezoneResult.anomalies.length > 0) {
      result.anomalies.push(...timezoneResult.anomalies);
      result.reasons.push('时区信息异常');
    }
  }
  
  // 检查触摸支持
  if (typeof components.touchSupport !== 'undefined') {
    const touchResult = analyzeTouchSupport(
      components.touchSupport,
      components.maxTouchPoints
    );
    result.score += touchResult.score;
    
    if (touchResult.anomalies.length > 0) {
      result.anomalies.push(...touchResult.anomalies);
      result.reasons.push('触摸支持信息异常');
    }
  }
  
  // 确保分数在0-100范围内
  result.score = Math.max(0, Math.min(100, result.score + 50)); // 基础分50
  
  return result;
}

/**
 * 提取指纹组件
 */
function extractFingerprintComponents(clientInfo) {
  return {
    userAgent: clientInfo.userAgent || '',
    language: clientInfo.language || '',
    colorDepth: clientInfo.colorDepth || '',
    screenResolution: clientInfo.screenResolution || '',
    timezone: clientInfo.timezone || '',
    timezoneOffset: clientInfo.timezoneOffset || null,
    platform: clientInfo.platform || '',
    plugins: clientInfo.plugins || '',
    canvasFingerprint: clientInfo.canvasFingerprint || null,
    webglFingerprint: clientInfo.webglFingerprint || null,
    webglVendor: clientInfo.webglVendor || '',
    webglRenderer: clientInfo.webglRenderer || '',
    audioFingerprint: clientInfo.audioFingerprint || null,
    fonts: clientInfo.fonts || [],
    touchSupport: clientInfo.touchSupport || false,
    maxTouchPoints: clientInfo.maxTouchPoints || 0,
    hardwareConcurrency: clientInfo.hardwareConcurrency || null,
    deviceMemory: clientInfo.deviceMemory || null,
    pixelRatio: clientInfo.pixelRatio || null
  };
}

/**
 * 生成指纹哈希
 */
function generateFingerprintHash(components) {
  // 将组件转换为字符串
  const componentsStr = JSON.stringify(components);
  
  // 使用SHA-256生成哈希
  return CryptoJS.SHA256(componentsStr).toString();
}

/**
 * 分析Canvas指纹
 */
function analyzeCanvasFingerprint(canvasFingerprint) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (!canvasFingerprint) {
    result.anomalies.push('缺少Canvas指纹');
    return result;
  }
  
  // 检查Canvas指纹长度
  if (canvasFingerprint.length < 50) {
    result.anomalies.push('Canvas指纹长度异常');
    result.score -= 10;
  } else {
    result.score += 10;
  }
  
  // 检查是否为已知的自动化工具Canvas指纹
  const knownAutomatedCanvasFingerprints = [
    // 这里可以添加已知的自动化工具Canvas指纹
    '0000000000000000000000000000000000000000',
    'f995d7d9444e4ee6a1f4063baae68d9d1a12b5f0'
  ];
  
  if (knownAutomatedCanvasFingerprints.includes(canvasFingerprint)) {
    result.anomalies.push('检测到已知的自动化工具Canvas指纹');
    result.score -= 20;
  }
  
  return result;
}

/**
 * 分析WebGL指纹
 */
function analyzeWebGLFingerprint(webglFingerprint, webglVendor, webglRenderer) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (!webglFingerprint) {
    result.anomalies.push('缺少WebGL指纹');
    return result;
  }
  
  // 检查WebGL指纹长度
  if (webglFingerprint.length < 50) {
    result.anomalies.push('WebGL指纹长度异常');
    result.score -= 10;
  } else {
    result.score += 10;
  }
  
  // 检查WebGL供应商和渲染器
  if (webglVendor && webglRenderer) {
    // 检查是否为已知的自动化工具WebGL信息
    const automatedWebGLVendors = [
      'Brian Paul',
      'Mesa',
      'Google Inc.',
      'Google SwiftShader'
    ];
    
    const automatedWebGLRenderers = [
      'Mesa OffScreen',
      'Google SwiftShader',
      'llvmpipe',
      'Software Rasterizer',
      'ANGLE'
    ];
    
    if (automatedWebGLVendors.some(v => webglVendor.includes(v))) {
      result.anomalies.push(`检测到可疑的WebGL供应商: ${webglVendor}`);
      result.score -= 15;
    }
    
    if (automatedWebGLRenderers.some(r => webglRenderer.includes(r))) {
      result.anomalies.push(`检测到可疑的WebGL渲染器: ${webglRenderer}`);
      result.score -= 15;
    }
  } else {
    result.anomalies.push('缺少WebGL供应商或渲染器信息');
    result.score -= 10;
  }
  
  return result;
}

/**
 * 分析音频指纹
 */
function analyzeAudioFingerprint(audioFingerprint) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (!audioFingerprint) {
    result.anomalies.push('缺少音频指纹');
    return result;
  }
  
  // 检查音频指纹长度
  if (audioFingerprint.length < 10) {
    result.anomalies.push('音频指纹长度异常');
    result.score -= 5;
  } else {
    result.score += 5;
  }
  
  // 检查是否为已知的自动化工具音频指纹
  const knownAutomatedAudioFingerprints = [
    // 这里可以添加已知的自动化工具音频指纹
    '0000000000',
    '1234567890'
  ];
  
  if (knownAutomatedAudioFingerprints.includes(audioFingerprint)) {
    result.anomalies.push('检测到已知的自动化工具音频指纹');
    result.score -= 10;
  }
  
  return result;
}

/**
 * 分析字体列表
 */
function analyzeFonts(fonts) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (!fonts || fonts.length === 0) {
    result.anomalies.push('缺少字体信息');
    return result;
  }
  
  // 检查字体数量
  if (fonts.length < 5) {
    result.anomalies.push('字体数量异常少');
    result.score -= 10;
  } else if (fonts.length > 5 && fonts.length < 20) {
    result.score += 5;
  } else if (fonts.length >= 20) {
    result.score += 10;
  }
  
  // 检查是否包含常见字体
  const commonFonts = [
    'Arial',
    'Times New Roman',
    'Courier New',
    'Verdana',
    'Georgia'
  ];
  
  const hasCommonFonts = commonFonts.some(font => 
    fonts.some(f => f.toLowerCase().includes(font.toLowerCase()))
  );
  
  if (!hasCommonFonts) {
    result.anomalies.push('缺少常见字体');
    result.score -= 5;
  } else {
    result.score += 5;
  }
  
  return result;
}

/**
 * 分析插件列表
 */
function analyzePlugins(plugins) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (!plugins) {
    result.anomalies.push('缺少插件信息');
    return result;
  }
  
  // 将插件字符串转换为数组（如果是字符串）
  let pluginArray = plugins;
  if (typeof plugins === 'string') {
    pluginArray = plugins.split(',').map(p => p.trim()).filter(p => p);
  }
  
  // 检查插件数量
  if (pluginArray.length === 0) {
    result.anomalies.push('没有浏览器插件');
    result.score -= 10;
  } else if (pluginArray.length < 3) {
    result.anomalies.push('插件数量异常少');
    result.score -= 5;
  } else {
    result.score += 5;
  }
  
  return result;
}

/**
 * 分析屏幕信息
 */
function analyzeScreenInfo(screenResolution, colorDepth, pixelRatio) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (!screenResolution) {
    result.anomalies.push('缺少屏幕分辨率信息');
    return result;
  }
  
  // 解析屏幕分辨率
  const [width, height] = screenResolution.split('x').map(Number);
  
  // 检查屏幕尺寸
  if (width < 320 || height < 240) {
    result.anomalies.push('屏幕尺寸异常小');
    result.score -= 10;
  } else if (width >= 320 && height >= 240) {
    result.score += 5;
  }
  
  // 检查色彩深度
  if (!colorDepth) {
    result.anomalies.push('缺少色彩深度信息');
  } else if (colorDepth < 24) {
    result.anomalies.push('色彩深度异常低');
    result.score -= 5;
  } else {
    result.score += 5;
  }
  
  // 检查像素比
  if (!pixelRatio) {
    result.anomalies.push('缺少像素比信息');
  } else if (pixelRatio < 1 || pixelRatio > 5) {
    result.anomalies.push('像素比异常');
    result.score -= 5;
  } else {
    result.score += 5;
  }
  
  return result;
}

/**
 * 分析硬件信息
 */
function analyzeHardwareInfo(hardwareConcurrency, deviceMemory) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  // 检查硬件并发数
  if (typeof hardwareConcurrency === 'undefined' || hardwareConcurrency === null) {
    result.anomalies.push('缺少硬件并发数信息');
  } else if (hardwareConcurrency < 2) {
    result.anomalies.push('硬件并发数异常低');
    result.score -= 5;
  } else if (hardwareConcurrency >= 2 && hardwareConcurrency <= 16) {
    result.score += 5;
  } else if (hardwareConcurrency > 16) {
    result.anomalies.push('硬件并发数异常高');
    result.score -= 5;
  }
  
  // 检查设备内存
  if (typeof deviceMemory === 'undefined' || deviceMemory === null) {
    result.anomalies.push('缺少设备内存信息');
  } else if (deviceMemory < 2) {
    result.anomalies.push('设备内存异常低');
    result.score -= 5;
  } else if (deviceMemory >= 2 && deviceMemory <= 32) {
    result.score += 5;
  } else if (deviceMemory > 32) {
    result.anomalies.push('设备内存异常高');
    result.score -= 5;
  }
  
  return result;
}

/**
 * 分析时区信息
 */
function analyzeTimezone(timezone, timezoneOffset) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (!timezone) {
    result.anomalies.push('缺少时区信息');
    return result;
  }
  
  // 检查时区是否为UTC或GMT
  if (timezone === 'UTC' || timezone === 'GMT' || timezone.startsWith('Etc/GMT')) {
    result.anomalies.push('使用通用时区');
    result.score -= 5;
  } else {
    result.score += 5;
  }
  
  // 检查时区偏移量
  if (typeof timezoneOffset === 'undefined' || timezoneOffset === null) {
    result.anomalies.push('缺少时区偏移量信息');
  } else {
    // 检查时区与偏移量是否匹配
    const expectedOffset = getExpectedTimezoneOffset(timezone);
    
    if (expectedOffset !== null && Math.abs(timezoneOffset - expectedOffset) > 60) {
      result.anomalies.push('时区与偏移量不匹配');
      result.score -= 10;
    } else {
      result.score += 5;
    }
  }
  
  return result;
}

/**
 * 获取预期的时区偏移量（分钟）
 */
function getExpectedTimezoneOffset(timezone) {
  // 简化的时区偏移量映射
  const timezoneOffsets = {
    'America/New_York': -300, // UTC-5
    'America/Chicago': -360, // UTC-6
    'America/Denver': -420, // UTC-7
    'America/Los_Angeles': -480, // UTC-8
    'Europe/London': 0, // UTC+0
    'Europe/Berlin': 60, // UTC+1
    'Europe/Moscow': 180, // UTC+3
    'Asia/Tokyo': 540, // UTC+9
    'Asia/Shanghai': 480, // UTC+8
    'Australia/Sydney': 600 // UTC+10
  };
  
  return timezoneOffsets[timezone] !== undefined ? timezoneOffsets[timezone] : null;
}

/**
 * 分析触摸支持
 */
function analyzeTouchSupport(touchSupport, maxTouchPoints) {
  const result = {
    score: 0,
    anomalies: []
  };
  
  if (typeof touchSupport === 'undefined') {
    result.anomalies.push('缺少触摸支持信息');
    return result;
  }
  
  // 检查触摸支持与最大触摸点数是否一致
  if (touchSupport && (typeof maxTouchPoints === 'undefined' || maxTouchPoints === 0)) {
    result.anomalies.push('触摸支持与最大触摸点数不一致');
    result.score -= 5;
  } else if (!touchSupport && maxTouchPoints > 0) {
    result.anomalies.push('触摸支持与最大触摸点数不一致');
    result.score -= 5;
  } else {
    result.score += 5;
  }
  
  return result;
}

module.exports = {
  analyzeFingerprint,
  generateFingerprintHash
};
