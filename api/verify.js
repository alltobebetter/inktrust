const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const UAParser = require('ua-parser-js');
const rateLimit = require('express-rate-limit');

// 导入分析模块
const automationDetector = require('../utils/automation-detector');
const behaviorAnalyzer = require('../utils/behavior-analyzer');
const networkAnalyzer = require('../utils/network-analyzer');
const fingerprintAnalyzer = require('../utils/fingerprint-analyzer');

// 存储验证会话的内存数据库（在实际生产环境中应使用持久化存储）
const sessions = {};

// 创建速率限制中间件
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP在windowMs内最多100个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试'
  }
});

// 应用速率限制
router.use(apiLimiter);

/**
 * 初始化验证会话
 */
router.post('/init', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const timestamp = Date.now();

    // 解析用户代理
    const parser = new UAParser(req.headers['user-agent']);
    const userAgent = parser.getResult();

    // 获取IP地址
    const ip = networkAnalyzer.getClientIp(req);

    // 收集客户端信息
    const clientInfo = {
      ip,
      userAgent: req.headers['user-agent'],
      parsedUserAgent: userAgent,
      headers: req.headers,
      // 指纹信息
      fingerprint: req.body.fingerprint || null,
      canvasFingerprint: req.body.canvasFingerprint || null,
      webglFingerprint: req.body.webglFingerprint || null,
      webglVendor: req.body.webglVendor || null,
      webglRenderer: req.body.webglRenderer || null,
      audioFingerprint: req.body.audioFingerprint || null,
      // 设备信息
      screenResolution: req.body.screenResolution || null,
      colorDepth: req.body.colorDepth || null,
      pixelRatio: req.body.pixelRatio || null,
      timezone: req.body.timezone || null,
      timezoneOffset: req.body.timezoneOffset || null,
      language: req.body.language || null,
      platform: req.body.platform || null,
      // 硬件信息
      hardwareConcurrency: req.body.hardwareConcurrency || null,
      deviceMemory: req.body.deviceMemory || null,
      // 浏览器特性
      plugins: req.body.plugins || null,
      fonts: req.body.fonts || null,
      touchSupport: req.body.touchSupport || false,
      maxTouchPoints: req.body.maxTouchPoints || 0,
      // 浏览器行为
      cookiesEnabled: req.body.cookiesEnabled || false,
      localStorage: req.body.localStorage || false,
      sessionStorage: req.body.sessionStorage || false,
      indexedDB: req.body.indexedDB || false,
      // 浏览器特征
      doNotTrack: req.body.doNotTrack || null,
      adBlocker: req.body.adBlocker || false,
      // 浏览器自动化特征
      webdriver: req.body.webdriver || false,
      automationFlags: req.body.automationFlags || null,
      // 网络信息
      connectionType: req.body.connectionType || null,
      connectionSpeed: req.body.connectionSpeed || null
    };

    // 创建新会话
    sessions[sessionId] = {
      id: sessionId,
      createdAt: timestamp,
      status: 'pending',
      clientInfo,
      events: [],
      analysis: {
        automation: null,
        behavior: null,
        network: null,
        fingerprint: null
      }
    };

    // 进行初步自动化检测
    const automationResult = automationDetector.detectAutomation(clientInfo);
    sessions[sessionId].analysis.automation = automationResult;

    // 进行初步指纹分析
    const fingerprintResult = fingerprintAnalyzer.analyzeFingerprint(clientInfo);
    sessions[sessionId].analysis.fingerprint = fingerprintResult;

    // 进行初步网络分析
    const networkResult = await networkAnalyzer.analyzeNetwork(clientInfo, req);
    sessions[sessionId].analysis.network = networkResult;

    // 如果检测到明显的自动化工具，直接标记为机器人
    if (automationResult.isAutomated && automationResult.automationScore > 80) {
      sessions[sessionId].status = 'rejected';
      sessions[sessionId].rejectionReason = `检测到自动化工具: ${automationResult.detectedTools.join(', ')}`;
    }

    res.json({
      success: true,
      sessionId,
      timestamp,
      // 如果已经被拒绝，返回状态
      status: sessions[sessionId].status,
      rejectionReason: sessions[sessionId].rejectionReason || null
    });
  } catch (error) {
    console.error('初始化验证会话错误:', error);
    res.status(500).json({
      success: false,
      message: '初始化验证会话时发生错误'
    });
  }
});

/**
 * 记录用户行为事件
 */
router.post('/event/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type, data } = req.body;

    if (!sessions[sessionId]) {
      return res.status(404).json({
        success: false,
        message: '会话不存在'
      });
    }

    // 如果会话已经被拒绝，不再接受事件
    if (sessions[sessionId].status === 'rejected') {
      return res.json({
        success: false,
        message: '会话已被拒绝',
        rejectionReason: sessions[sessionId].rejectionReason || null
      });
    }

    // 添加事件到会话
    const event = {
      type,
      data,
      timestamp: Date.now(),
      headers: req.headers
    };

    sessions[sessionId].events.push(event);

    // 如果事件数量足够，进行实时行为分析
    if (sessions[sessionId].events.length >= 10 && !sessions[sessionId].analysis.behavior) {
      const behaviorResult = behaviorAnalyzer.analyzeBehavior(sessions[sessionId].events);
      sessions[sessionId].analysis.behavior = behaviorResult;

      // 如果行为分析显示不是人类且分数很低，标记为机器人
      if (!behaviorResult.isHuman && behaviorResult.score < 30) {
        sessions[sessionId].status = 'rejected';
        sessions[sessionId].rejectionReason = '行为模式与机器人相似';

        return res.json({
          success: false,
          message: '会话已被拒绝',
          rejectionReason: sessions[sessionId].rejectionReason
        });
      }
    }

    res.json({
      success: true,
      eventsCount: sessions[sessionId].events.length
    });
  } catch (error) {
    console.error('记录用户行为事件错误:', error);
    res.status(500).json({
      success: false,
      message: '记录用户行为事件时发生错误'
    });
  }
});

/**
 * 验证会话
 */
router.post('/verify/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessions[sessionId]) {
      return res.status(404).json({
        success: false,
        message: '会话不存在'
      });
    }

    const session = sessions[sessionId];

    // 如果会话已经被验证过，直接返回结果
    if (session.status !== 'pending') {
      return res.json({
        success: true,
        result: {
          isHuman: session.status === 'verified',
          score: session.verificationScore || 0,
          reasons: session.rejectionReason ? [session.rejectionReason] : [],
          automationDetected: session.analysis.automation?.isAutomated || false,
          detectedTools: session.analysis.automation?.detectedTools || []
        }
      });
    }

    // 如果还没有行为分析，先进行分析
    if (!session.analysis.behavior && session.events.length > 0) {
      session.analysis.behavior = behaviorAnalyzer.analyzeBehavior(session.events);
    }

    // 执行完整验证逻辑
    const verificationResult = await verifySession(session, req);

    // 更新会话状态
    session.status = verificationResult.isHuman ? 'verified' : 'rejected';
    session.verifiedAt = Date.now();
    session.verificationScore = verificationResult.score;

    if (!verificationResult.isHuman) {
      session.rejectionReason = verificationResult.reasons.join(', ');
    }

    // 清理会话中的大型数据，减少内存占用
    if (session.events.length > 50) {
      // 只保留前50个事件
      session.events = session.events.slice(0, 50);
    }

    res.json({
      success: true,
      result: verificationResult
    });
  } catch (error) {
    console.error('验证会话错误:', error);
    res.status(500).json({
      success: false,
      message: '验证会话时发生错误'
    });
  }
});

/**
 * 获取会话状态
 */
router.get('/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessions[sessionId]) {
      return res.status(404).json({
        success: false,
        message: '会话不存在'
      });
    }

    const session = sessions[sessionId];

    res.json({
      success: true,
      status: session.status,
      createdAt: session.createdAt,
      verifiedAt: session.verifiedAt || null,
      eventsCount: session.events.length,
      rejectionReason: session.rejectionReason || null,
      automationDetected: session.analysis.automation?.isAutomated || false,
      detectedTools: session.analysis.automation?.detectedTools || []
    });
  } catch (error) {
    console.error('获取会话状态错误:', error);
    res.status(500).json({
      success: false,
      message: '获取会话状态时发生错误'
    });
  }
});

/**
 * 清理过期会话
 */
function cleanupSessions() {
  const now = Date.now();
  const sessionIds = Object.keys(sessions);

  for (const sessionId of sessionIds) {
    const session = sessions[sessionId];
    const sessionAge = now - session.createdAt;

    // 删除超过24小时的会话
    if (sessionAge > 24 * 60 * 60 * 1000) {
      delete sessions[sessionId];
    }
  }
}

// 每小时清理一次过期会话
setInterval(cleanupSessions, 60 * 60 * 1000);

/**
 * 验证会话的逻辑
 * 集成了多种高级验证技术
 */
async function verifySession(session, req) {
  // 初始化结果对象
  const result = {
    isHuman: false,
    score: 0,
    reasons: [],
    details: {}
  };

  // 1. 自动化工具检测
  const automationResult = session.analysis.automation;
  if (automationResult) {
    result.details.automation = {
      score: 100 - automationResult.automationScore, // 转换为人类分数
      isAutomated: automationResult.isAutomated,
      detectedTools: automationResult.detectedTools,
      reasons: automationResult.reasons
    };

    // 如果检测到自动化工具，大幅降低分数
    if (automationResult.isAutomated) {
      result.score -= 40;
      result.reasons.push(`检测到自动化工具: ${automationResult.detectedTools.join(', ')}`);
    } else {
      result.score += 20;
    }
  }

  // 2. 行为分析
  const behaviorResult = session.analysis.behavior;
  if (behaviorResult) {
    result.details.behavior = {
      score: behaviorResult.score,
      isHuman: behaviorResult.isHuman,
      reasons: behaviorResult.reasons,
      metrics: behaviorResult.metrics
    };

    // 根据行为分析结果调整分数
    result.score += behaviorResult.isHuman ? 30 : -30;

    if (!behaviorResult.isHuman) {
      result.reasons.push(`行为分析: ${behaviorResult.reasons.join(', ')}`);
    }
  } else if (session.events.length < 5) {
    // 如果事件太少，可能是机器人
    result.score -= 20;
    result.reasons.push('用户交互事件太少');
  }

  // 3. 指纹分析
  const fingerprintResult = session.analysis.fingerprint;
  if (fingerprintResult) {
    result.details.fingerprint = {
      score: fingerprintResult.score,
      fingerprint: fingerprintResult.fingerprint,
      anomalies: fingerprintResult.anomalies
    };

    // 根据指纹分析结果调整分数
    result.score += (fingerprintResult.score - 50) / 2; // 归一化影响

    if (fingerprintResult.anomalies.length > 0) {
      result.reasons.push(`指纹异常: ${fingerprintResult.anomalies.slice(0, 3).join(', ')}${fingerprintResult.anomalies.length > 3 ? '等' : ''}`);
    }
  }

  // 4. 网络分析
  const networkResult = session.analysis.network;
  if (networkResult) {
    result.details.network = {
      score: networkResult.score,
      proxied: networkResult.proxied,
      vpnDetected: networkResult.vpnDetected,
      datacenterIP: networkResult.datacenterIP,
      ipTimezoneMatch: networkResult.ipTimezoneMatch
    };

    // 根据网络分析结果调整分数
    result.score += (networkResult.score - 50) / 2; // 归一化影响

    if (networkResult.reasons.length > 0) {
      result.reasons.push(`网络分析: ${networkResult.reasons.slice(0, 2).join(', ')}${networkResult.reasons.length > 2 ? '等' : ''}`);
    }
  }

  // 5. 会话年龄检查
  const sessionAge = Date.now() - session.createdAt;
  if (sessionAge < 1000) {
    // 会话太短（小于1秒）
    result.score -= 30;
    result.reasons.push('会话时间异常短');
  } else if (sessionAge < 3000 && session.events.length > 10) {
    // 短时间内产生大量事件
    result.score -= 20;
    result.reasons.push('短时间内产生大量事件');
  }

  // 6. 事件数量检查
  if (session.events.length === 0) {
    result.score -= 30;
    result.reasons.push('没有用户交互事件');
  }

  // 7. 检查是否有屏幕分辨率和时区信息
  const hasDeviceInfo = session.clientInfo.screenResolution &&
    session.clientInfo.timezone;
  if (!hasDeviceInfo) {
    result.score -= 15;
    result.reasons.push('缺少关键设备信息');
  }

  // 8. 检查用户代理一致性
  if (!session.clientInfo.userAgent ||
      !session.clientInfo.parsedUserAgent ||
      !session.clientInfo.parsedUserAgent.browser ||
      !session.clientInfo.parsedUserAgent.os) {
    result.score -= 15;
    result.reasons.push('用户代理信息不完整');
  }

  // 9. 检查是否有可疑的请求头
  const suspiciousHeaders = checkSuspiciousHeaders(req.headers);
  if (suspiciousHeaders.length > 0) {
    result.score -= 15;
    result.reasons.push(`可疑的请求头: ${suspiciousHeaders.join(', ')}`);
  }

  // 10. 检查是否有异常的请求模式
  const requestPatternResult = analyzeRequestPattern(session);
  if (requestPatternResult.suspicious) {
    result.score -= 20;
    result.reasons.push(`异常的请求模式: ${requestPatternResult.reason}`);
  }

  // 计算最终分数（基础分数为50）
  result.score = Math.max(0, Math.min(100, result.score + 50));

  // 判断是否为人类用户（分数大于等于60分）
  result.isHuman = result.score >= 60;

  return result;
}

/**
 * 检查可疑的请求头
 */
function checkSuspiciousHeaders(headers) {
  const suspicious = [];

  // 检查常见的自动化工具请求头
  const automationHeaders = [
    'x-selenium',
    'x-selenium-ide-recorder',
    'x-requested-with',
    'selenium',
    'driver',
    'webdriver',
    'puppeteer',
    'playwright',
    'headless',
    'cypress'
  ];

  for (const header in headers) {
    const headerLower = header.toLowerCase();
    const value = headers[header];

    // 检查头名
    if (automationHeaders.some(h => headerLower.includes(h))) {
      suspicious.push(header);
      continue;
    }

    // 检查头值
    if (value && typeof value === 'string') {
      const valueLower = value.toLowerCase();
      if (automationHeaders.some(h => valueLower.includes(h))) {
        suspicious.push(header);
      }
    }
  }

  return suspicious;
}

/**
 * 分析请求模式
 */
function analyzeRequestPattern(session) {
  const result = {
    suspicious: false,
    reason: ''
  };

  // 检查事件时间间隔是否过于规律
  if (session.events.length >= 5) {
    const timestamps = session.events.map(e => e.timestamp);
    const intervals = [];

    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i-1]);
    }

    // 计算平均间隔和标准差
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length
    );

    // 计算变异系数（标准差/平均值）
    const variationCoefficient = stdDev / avgInterval;

    // 如果变异系数小于0.1，说明时间间隔非常规律，可能是自动化工具
    if (variationCoefficient < 0.1) {
      result.suspicious = true;
      result.reason = '事件时间间隔过于规律';
    }
  }

  // 检查是否有异常的事件顺序
  if (session.events.length >= 3) {
    // 正常用户通常是先有鼠标移动，然后才有点击
    // 如果有点击事件但之前没有鼠标移动，可能是自动化工具
    const hasClickWithoutMove = session.events.some((event, index) => {
      if (event.type === 'click' && index > 0) {
        // 检查当前点击事件之前是否有鼠标移动
        const hasPreviousMove = session.events.slice(0, index).some(e => e.type === 'mousemove');
        return !hasPreviousMove;
      }
      return false;
    });

    if (hasClickWithoutMove) {
      result.suspicious = true;
      result.reason = '在没有鼠标移动的情况下进行了点击';
    }
  }

  return result;
}

module.exports = router;
