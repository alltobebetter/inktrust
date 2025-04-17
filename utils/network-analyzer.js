/**
 * 网络分析模块
 * 用于分析网络特征和环境一致性
 */
const geoip = require('geoip-lite');
const ipaddr = require('ipaddr.js');
const axios = require('axios');

/**
 * 分析网络特征
 * @param {Object} clientInfo 客户端信息
 * @param {Object} req Express请求对象
 * @returns {Object} 分析结果
 */
async function analyzeNetwork(clientInfo, req) {
  const result = {
    score: 0, // 0-100，越高越可能是真实用户
    reasons: [],
    ipInfo: null,
    proxied: false,
    vpnDetected: false,
    datacenterIP: false,
    ipTimezoneMatch: true
  };
  
  // 获取IP地址
  const ip = getClientIp(req);
  
  if (!ip) {
    result.reasons.push('无法获取IP地址');
    return result;
  }
  
  // 检查是否为私有IP
  if (isPrivateIP(ip)) {
    result.reasons.push('使用私有IP地址');
    result.score += 10; // 私有IP通常是本地测试，不扣分
    return result;
  }
  
  // 获取IP地理位置信息
  const geoData = geoip.lookup(ip);
  result.ipInfo = geoData;
  
  if (!geoData) {
    result.reasons.push('无法获取IP地理位置信息');
    result.score -= 10;
  } else {
    // 检查IP地址与时区是否匹配
    if (clientInfo.timezone) {
      const ipTimezoneMatch = checkIpTimezoneMatch(geoData, clientInfo.timezone);
      result.ipTimezoneMatch = ipTimezoneMatch;
      
      if (!ipTimezoneMatch) {
        result.reasons.push('IP地址与时区不匹配');
        result.score -= 20;
      } else {
        result.score += 20;
      }
    }
    
    // 检查IP地址与语言是否匹配
    if (clientInfo.language) {
      const ipLanguageMatch = checkIpLanguageMatch(geoData, clientInfo.language);
      
      if (!ipLanguageMatch) {
        result.reasons.push('IP地址与语言不匹配');
        result.score -= 10;
      } else {
        result.score += 10;
      }
    }
  }
  
  // 检查是否为代理IP
  const proxyHeaders = checkProxyHeaders(req.headers);
  if (proxyHeaders.detected) {
    result.proxied = true;
    result.reasons.push(`检测到代理特征: ${proxyHeaders.reasons.join(', ')}`);
    result.score -= 30;
  }
  
  // 检查是否为数据中心IP
  try {
    const isDatacenter = await checkDatacenterIP(ip);
    result.datacenterIP = isDatacenter;
    
    if (isDatacenter) {
      result.reasons.push('检测到数据中心IP地址');
      result.score -= 40;
    }
  } catch (error) {
    // 数据中心检查失败，不影响结果
  }
  
  // 检查是否为VPN
  try {
    const vpnDetected = await checkVPN(ip);
    result.vpnDetected = vpnDetected;
    
    if (vpnDetected) {
      result.reasons.push('检测到VPN使用');
      result.score -= 20;
    }
  } catch (error) {
    // VPN检查失败，不影响结果
  }
  
  // 检查请求头一致性
  const headerConsistency = checkHeaderConsistency(req.headers);
  if (!headerConsistency.consistent) {
    result.reasons.push(`请求头不一致: ${headerConsistency.reasons.join(', ')}`);
    result.score -= 15;
  } else {
    result.score += 15;
  }
  
  // 检查TLS指纹（如果有）
  if (req.connection && req.connection.getCipher) {
    const cipher = req.connection.getCipher();
    if (cipher) {
      const tlsAnomalies = checkTLSFingerprint(cipher);
      if (tlsAnomalies.length > 0) {
        result.reasons.push(`TLS指纹异常: ${tlsAnomalies.join(', ')}`);
        result.score -= 10;
      } else {
        result.score += 10;
      }
    }
  }
  
  // 确保分数在0-100范围内
  result.score = Math.max(0, Math.min(100, result.score + 50)); // 基础分50
  
  return result;
}

/**
 * 获取客户端IP地址
 */
function getClientIp(req) {
  // 尝试从各种请求头获取IP
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // 取第一个IP（最原始的客户端IP）
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }
  
  // 尝试其他常见的IP请求头
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  
  // 尝试从连接对象获取
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  
  // 尝试从套接字获取
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  
  return null;
}

/**
 * 检查是否为私有IP
 */
function isPrivateIP(ip) {
  try {
    const addr = ipaddr.parse(ip);
    return addr.range() === 'private' || 
           addr.range() === 'loopback' || 
           ip === '::1' || 
           ip === '127.0.0.1';
  } catch (error) {
    return false;
  }
}

/**
 * 检查IP地址与时区是否匹配
 */
function checkIpTimezoneMatch(geoData, timezone) {
  if (!geoData || !timezone) return true; // 无法检查，默认匹配
  
  // 获取国家/地区的预期时区
  const expectedTimezones = getExpectedTimezones(geoData.country);
  
  // 如果没有预期时区，无法检查
  if (!expectedTimezones || expectedTimezones.length === 0) return true;
  
  // 检查用户时区是否在预期时区列表中
  return expectedTimezones.some(tz => timezone.includes(tz));
}

/**
 * 获取国家/地区的预期时区
 */
function getExpectedTimezones(countryCode) {
  // 简化的国家与时区映射
  const countryTimezones = {
    'US': ['America/'],
    'CA': ['America/'],
    'GB': ['Europe/London'],
    'DE': ['Europe/Berlin'],
    'FR': ['Europe/Paris'],
    'JP': ['Asia/Tokyo'],
    'CN': ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi'],
    'IN': ['Asia/Kolkata'],
    'AU': ['Australia/'],
    'RU': ['Europe/Moscow', 'Asia/']
    // 可以添加更多国家
  };
  
  return countryTimezones[countryCode] || [];
}

/**
 * 检查IP地址与语言是否匹配
 */
function checkIpLanguageMatch(geoData, language) {
  if (!geoData || !language) return true; // 无法检查，默认匹配
  
  // 获取国家/地区的预期语言
  const expectedLanguages = getExpectedLanguages(geoData.country);
  
  // 如果没有预期语言，无法检查
  if (!expectedLanguages || expectedLanguages.length === 0) return true;
  
  // 提取语言代码（例如从"en-US"中提取"en"）
  const langCode = language.split('-')[0].toLowerCase();
  
  // 检查用户语言是否在预期语言列表中
  return expectedLanguages.includes(langCode);
}

/**
 * 获取国家/地区的预期语言
 */
function getExpectedLanguages(countryCode) {
  // 简化的国家与语言映射
  const countryLanguages = {
    'US': ['en'],
    'CA': ['en', 'fr'],
    'GB': ['en'],
    'DE': ['de'],
    'FR': ['fr'],
    'JP': ['ja'],
    'CN': ['zh'],
    'IN': ['hi', 'en'],
    'AU': ['en'],
    'RU': ['ru']
    // 可以添加更多国家
  };
  
  return countryLanguages[countryCode] || [];
}

/**
 * 检查代理请求头
 */
function checkProxyHeaders(headers) {
  const result = {
    detected: false,
    reasons: []
  };
  
  // 检查常见的代理请求头
  const proxyHeaders = [
    'via',
    'forwarded',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-real-ip',
    'proxy-connection',
    'proxy-authenticate',
    'x-proxy-id',
    'proxy-authorization'
  ];
  
  for (const header of proxyHeaders) {
    if (headers[header]) {
      result.detected = true;
      result.reasons.push(`存在${header}请求头`);
    }
  }
  
  // 检查Cloudflare特有的请求头
  if (headers['cf-connecting-ip'] || headers['cf-ipcountry']) {
    result.detected = true;
    result.reasons.push('检测到Cloudflare代理');
  }
  
  return result;
}

/**
 * 检查是否为数据中心IP
 * 注意：实际实现中，你可能需要使用第三方API或本地数据库
 */
async function checkDatacenterIP(ip) {
  // 这里是一个简化的实现，实际应用中应使用更完善的服务
  // 例如IPinfo、MaxMind等提供的API
  
  // 检查常见数据中心IP范围
  const dataCenterRanges = [
    // AWS
    ['3.0.0.0', '3.255.255.255'],
    ['13.32.0.0', '13.35.255.255'],
    ['13.224.0.0', '13.255.255.255'],
    ['52.0.0.0', '52.255.255.255'],
    ['54.0.0.0', '54.255.255.255'],
    
    // Google Cloud
    ['34.64.0.0', '34.127.255.255'],
    ['35.184.0.0', '35.239.255.255'],
    
    // Microsoft Azure
    ['13.64.0.0', '13.107.255.255'],
    ['40.64.0.0', '40.127.255.255'],
    
    // DigitalOcean
    ['45.55.0.0', '45.55.255.255'],
    ['104.131.0.0', '104.131.255.255'],
    ['138.197.0.0', '138.197.255.255'],
    
    // Linode
    ['45.33.0.0', '45.33.255.255'],
    ['96.126.96.0', '96.126.127.255'],
    ['173.255.192.0', '173.255.255.255']
  ];
  
  try {
    const ipObj = ipaddr.parse(ip);
    
    for (const [start, end] of dataCenterRanges) {
      const startObj = ipaddr.parse(start);
      const endObj = ipaddr.parse(end);
      
      if (ipObj.kind() === startObj.kind() && 
          ipObj.compare(startObj) >= 0 && 
          ipObj.compare(endObj) <= 0) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 检查是否为VPN
 * 注意：实际实现中，你可能需要使用第三方API
 */
async function checkVPN(ip) {
  // 这里是一个简化的实现，实际应用中应使用更完善的服务
  // 例如IPinfo、IPQualityScore等提供的API
  
  // 检查常见VPN提供商的IP范围
  const vpnRanges = [
    // NordVPN
    ['5.254.0.0', '5.254.255.255'],
    ['31.13.191.0', '31.13.191.255'],
    
    // ExpressVPN
    ['172.241.131.0', '172.241.131.255'],
    
    // Private Internet Access
    ['185.159.157.0', '185.159.157.255']
  ];
  
  try {
    const ipObj = ipaddr.parse(ip);
    
    for (const [start, end] of vpnRanges) {
      const startObj = ipaddr.parse(start);
      const endObj = ipaddr.parse(end);
      
      if (ipObj.kind() === startObj.kind() && 
          ipObj.compare(startObj) >= 0 && 
          ipObj.compare(endObj) <= 0) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 检查请求头一致性
 */
function checkHeaderConsistency(headers) {
  const result = {
    consistent: true,
    reasons: []
  };
  
  // 检查Accept与Accept-Language的一致性
  if (headers['accept'] && headers['accept-language']) {
    // 如果Accept包含application/json但没有text/html，可能是API请求而非浏览器
    if (headers['accept'].includes('application/json') && 
        !headers['accept'].includes('text/html')) {
      result.consistent = false;
      result.reasons.push('Accept头与浏览器不一致');
    }
  }
  
  // 检查User-Agent与Accept的一致性
  if (headers['user-agent'] && headers['accept']) {
    const ua = headers['user-agent'].toLowerCase();
    
    // 如果User-Agent声明是浏览器，但Accept不包含text/html
    if ((ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari')) && 
        !headers['accept'].includes('text/html')) {
      result.consistent = false;
      result.reasons.push('User-Agent与Accept头不一致');
    }
  }
  
  // 检查User-Agent与Accept-Language的一致性
  if (headers['user-agent'] && headers['accept-language']) {
    const ua = headers['user-agent'].toLowerCase();
    
    // 如果User-Agent声明是浏览器，但没有Accept-Language
    if ((ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari')) && 
        !headers['accept-language']) {
      result.consistent = false;
      result.reasons.push('User-Agent与Accept-Language头不一致');
    }
  }
  
  return result;
}

/**
 * 检查TLS指纹
 */
function checkTLSFingerprint(cipher) {
  const anomalies = [];
  
  // 检查是否使用过时或不安全的加密套件
  const insecureCiphers = [
    'TLS_RSA_WITH_RC4_128_SHA',
    'TLS_RSA_WITH_RC4_128_MD5',
    'TLS_RSA_WITH_DES_CBC_SHA',
    'TLS_RSA_EXPORT_WITH_RC4_40_MD5',
    'TLS_RSA_EXPORT_WITH_DES40_CBC_SHA'
  ];
  
  if (insecureCiphers.includes(cipher.name)) {
    anomalies.push('使用不安全的加密套件');
  }
  
  // 检查是否使用过时的TLS版本
  if (cipher.version === 'TLSv1' || cipher.version === 'SSLv3') {
    anomalies.push('使用过时的TLS/SSL版本');
  }
  
  return anomalies;
}

module.exports = {
  analyzeNetwork,
  getClientIp,
  isPrivateIP,
  checkIpTimezoneMatch,
  checkProxyHeaders,
  checkDatacenterIP,
  checkVPN,
  checkHeaderConsistency
};
