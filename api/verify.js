const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const UAParser = require('ua-parser-js');

// 存储验证会话的内存数据库（在实际生产环境中应使用持久化存储）
const sessions = {};

/**
 * 初始化验证会话
 */
router.post('/init', (req, res) => {
  const sessionId = uuidv4();
  const timestamp = Date.now();
  
  // 解析用户代理
  const parser = new UAParser(req.headers['user-agent']);
  const userAgent = parser.getResult();
  
  // 获取IP地址
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  // 创建新会话
  sessions[sessionId] = {
    id: sessionId,
    createdAt: timestamp,
    status: 'pending',
    clientInfo: {
      ip,
      userAgent,
      fingerprint: req.body.fingerprint || null,
      screenResolution: req.body.screenResolution || null,
      timezone: req.body.timezone || null,
      language: req.body.language || null
    },
    events: []
  };
  
  res.json({
    success: true,
    sessionId,
    timestamp
  });
});

/**
 * 记录用户行为事件
 */
router.post('/event/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { type, data } = req.body;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({
      success: false,
      message: '会话不存在'
    });
  }
  
  // 添加事件到会话
  sessions[sessionId].events.push({
    type,
    data,
    timestamp: Date.now()
  });
  
  res.json({
    success: true
  });
});

/**
 * 验证会话
 */
router.post('/verify/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({
      success: false,
      message: '会话不存在'
    });
  }
  
  const session = sessions[sessionId];
  
  // 执行验证逻辑
  const verificationResult = verifySession(session);
  
  // 更新会话状态
  session.status = verificationResult.isHuman ? 'verified' : 'rejected';
  session.verifiedAt = Date.now();
  
  res.json({
    success: true,
    result: verificationResult
  });
});

/**
 * 获取会话状态
 */
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({
      success: false,
      message: '会话不存在'
    });
  }
  
  res.json({
    success: true,
    status: sessions[sessionId].status
  });
});

/**
 * 验证会话的逻辑
 * 这里实现了一些基本的验证规则，实际应用中可以更复杂
 */
function verifySession(session) {
  // 检查会话年龄（太短的会话可能是机器人）
  const sessionAge = Date.now() - session.createdAt;
  const isTooQuick = sessionAge < 1000; // 小于1秒
  
  // 检查用户事件（真实用户通常会有鼠标移动、点击等事件）
  const hasMouseEvents = session.events.some(e => 
    e.type === 'mousemove' || e.type === 'click'
  );
  
  // 检查设备信息
  const hasValidUserAgent = session.clientInfo.userAgent && 
    session.clientInfo.userAgent.browser && 
    session.clientInfo.userAgent.os;
  
  // 检查是否有屏幕分辨率和时区信息
  const hasDeviceInfo = session.clientInfo.screenResolution && 
    session.clientInfo.timezone;
  
  // 计算可信度分数
  let score = 0;
  if (!isTooQuick) score += 25;
  if (hasMouseEvents) score += 25;
  if (hasValidUserAgent) score += 25;
  if (hasDeviceInfo) score += 25;
  
  // 判断是否为人类用户（分数大于等于75分）
  const isHuman = score >= 75;
  
  return {
    isHuman,
    score,
    reasons: {
      isTooQuick,
      hasMouseEvents,
      hasValidUserAgent,
      hasDeviceInfo
    }
  };
}

module.exports = router;
