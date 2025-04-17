/**
 * 行为分析模块
 * 使用机器学习分析用户行为模式
 */
const { Matrix } = require('ml-matrix');
const { PCA } = require('ml-pca');
const KMeans = require('ml-kmeans');

/**
 * 分析用户行为
 * @param {Array} events 用户事件数组
 * @returns {Object} 分析结果
 */
function analyzeBehavior(events) {
  if (!events || events.length === 0) {
    return {
      isHuman: false,
      score: 0,
      reasons: ['没有足够的行为数据进行分析']
    };
  }
  
  // 初始化结果
  const result = {
    isHuman: false,
    score: 0,
    reasons: [],
    metrics: {}
  };
  
  // 提取鼠标移动事件
  const mouseEvents = events.filter(e => e.type === 'mousemove');
  
  // 如果鼠标事件太少，可能是自动化工具
  if (mouseEvents.length < 5) {
    result.reasons.push('鼠标移动事件太少');
    result.metrics.mouseEventCount = mouseEvents.length;
    return result;
  }
  
  // 分析鼠标移动轨迹
  const mouseTrajectoryResult = analyzeMouseTrajectory(mouseEvents);
  result.metrics = { ...result.metrics, ...mouseTrajectoryResult.metrics };
  
  if (!mouseTrajectoryResult.isNatural) {
    result.reasons.push('鼠标移动轨迹不自然');
  } else {
    result.score += 30;
  }
  
  // 分析点击事件
  const clickEvents = events.filter(e => e.type === 'click');
  const clickPatternResult = analyzeClickPattern(clickEvents, events);
  result.metrics = { ...result.metrics, ...clickPatternResult.metrics };
  
  if (!clickPatternResult.isNatural) {
    result.reasons.push('点击模式不自然');
  } else {
    result.score += 25;
  }
  
  // 分析事件时间间隔
  const timeIntervalResult = analyzeEventTimeIntervals(events);
  result.metrics = { ...result.metrics, ...timeIntervalResult.metrics };
  
  if (!timeIntervalResult.isNatural) {
    result.reasons.push('事件时间间隔不自然');
  } else {
    result.score += 25;
  }
  
  // 分析键盘输入模式（如果有）
  const keypressEvents = events.filter(e => e.type === 'keypress');
  if (keypressEvents.length > 0) {
    const keyPressResult = analyzeKeyPressPattern(keypressEvents);
    result.metrics = { ...result.metrics, ...keyPressResult.metrics };
    
    if (!keyPressResult.isNatural) {
      result.reasons.push('键盘输入模式不自然');
    } else {
      result.score += 20;
    }
  }
  
  // 根据总分判断是否为人类
  result.isHuman = result.score >= 50;
  
  return result;
}

/**
 * 分析鼠标移动轨迹
 */
function analyzeMouseTrajectory(mouseEvents) {
  const result = {
    isNatural: false,
    metrics: {
      trajectoryComplexity: 0,
      speedVariation: 0,
      accelerationChanges: 0,
      directionChanges: 0,
      straightLineRatio: 0
    }
  };
  
  if (mouseEvents.length < 5) {
    return result;
  }
  
  // 提取坐标和时间戳
  const coordinates = [];
  const timestamps = [];
  
  for (const event of mouseEvents) {
    if (event.data && typeof event.data.x === 'number' && typeof event.data.y === 'number') {
      coordinates.push([event.data.x, event.data.y]);
      timestamps.push(event.data.timestamp || event.timestamp || Date.now());
    }
  }
  
  if (coordinates.length < 5) {
    return result;
  }
  
  // 计算速度变化
  const speeds = [];
  for (let i = 1; i < coordinates.length; i++) {
    const dx = coordinates[i][0] - coordinates[i-1][0];
    const dy = coordinates[i][1] - coordinates[i-1][1];
    const dt = (timestamps[i] - timestamps[i-1]) / 1000; // 转换为秒
    
    if (dt > 0) {
      const distance = Math.sqrt(dx*dx + dy*dy);
      const speed = distance / dt;
      speeds.push(speed);
    }
  }
  
  // 计算速度变化的标准差（自然鼠标移动应该有变化）
  const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  const speedVariation = Math.sqrt(
    speeds.reduce((sum, speed) => sum + Math.pow(speed - avgSpeed, 2), 0) / speeds.length
  );
  
  result.metrics.speedVariation = speedVariation;
  
  // 计算加速度变化
  const accelerations = [];
  for (let i = 1; i < speeds.length; i++) {
    const acceleration = speeds[i] - speeds[i-1];
    accelerations.push(acceleration);
  }
  
  // 计算加速度变化次数（加速度从正变负或从负变正）
  let accelerationChanges = 0;
  for (let i = 1; i < accelerations.length; i++) {
    if ((accelerations[i] > 0 && accelerations[i-1] < 0) || 
        (accelerations[i] < 0 && accelerations[i-1] > 0)) {
      accelerationChanges++;
    }
  }
  
  result.metrics.accelerationChanges = accelerationChanges;
  
  // 计算方向变化
  let directionChanges = 0;
  for (let i = 2; i < coordinates.length; i++) {
    const vector1 = [
      coordinates[i-1][0] - coordinates[i-2][0],
      coordinates[i-1][1] - coordinates[i-2][1]
    ];
    
    const vector2 = [
      coordinates[i][0] - coordinates[i-1][0],
      coordinates[i][1] - coordinates[i-1][1]
    ];
    
    // 计算两个向量的点积
    const dotProduct = vector1[0] * vector2[0] + vector1[1] * vector2[1];
    
    // 计算两个向量的模
    const magnitude1 = Math.sqrt(vector1[0] * vector1[0] + vector1[1] * vector1[1]);
    const magnitude2 = Math.sqrt(vector2[0] * vector2[0] + vector2[1] * vector2[1]);
    
    // 计算夹角的余弦值
    if (magnitude1 > 0 && magnitude2 > 0) {
      const cosAngle = dotProduct / (magnitude1 * magnitude2);
      
      // 如果余弦值小于0.9，认为方向发生了显著变化
      if (cosAngle < 0.9) {
        directionChanges++;
      }
    }
  }
  
  result.metrics.directionChanges = directionChanges;
  
  // 计算直线比例（使用PCA）
  try {
    const matrix = new Matrix(coordinates);
    const pca = new PCA(matrix, { scale: true });
    const explained = pca.getExplainedVariance();
    
    // 如果第一主成分解释了大部分变异（>0.95），说明轨迹接近直线
    if (explained.length > 0) {
      result.metrics.straightLineRatio = explained[0];
    }
  } catch (error) {
    // PCA计算错误，使用默认值
    result.metrics.straightLineRatio = 0.5;
  }
  
  // 计算轨迹复杂度（基于方向变化和速度变化）
  result.metrics.trajectoryComplexity = 
    (directionChanges / coordinates.length) * 
    (speedVariation / (avgSpeed > 0 ? avgSpeed : 1));
  
  // 判断是否为自然轨迹
  // 1. 速度变化应该明显（人类不会以恒定速度移动鼠标）
  // 2. 应该有一定数量的加速度变化
  // 3. 应该有一定数量的方向变化
  // 4. 轨迹不应该太直（straightLineRatio不应该太高）
  result.isNatural = 
    speedVariation > 50 && 
    accelerationChanges >= 2 && 
    directionChanges >= 3 && 
    result.metrics.straightLineRatio < 0.98;
  
  return result;
}

/**
 * 分析点击模式
 */
function analyzeClickPattern(clickEvents, allEvents) {
  const result = {
    isNatural: false,
    metrics: {
      clickCount: clickEvents.length,
      avgTimeBetweenClicks: 0,
      clickPrecision: 0,
      clicksWithoutMovement: 0
    }
  };
  
  if (clickEvents.length < 2) {
    return result;
  }
  
  // 计算点击之间的平均时间
  const clickTimes = [];
  for (let i = 0; i < clickEvents.length; i++) {
    clickTimes.push(clickEvents[i].data.timestamp || clickEvents[i].timestamp || Date.now());
  }
  
  let totalTimeBetweenClicks = 0;
  for (let i = 1; i < clickTimes.length; i++) {
    totalTimeBetweenClicks += clickTimes[i] - clickTimes[i-1];
  }
  
  const avgTimeBetweenClicks = totalTimeBetweenClicks / (clickTimes.length - 1);
  result.metrics.avgTimeBetweenClicks = avgTimeBetweenClicks;
  
  // 计算点击精度（点击前是否有鼠标移动到目标位置）
  let clicksWithoutMovement = 0;
  
  for (let i = 0; i < clickEvents.length; i++) {
    const clickEvent = clickEvents[i];
    const clickTime = clickEvent.data.timestamp || clickEvent.timestamp || Date.now();
    
    // 查找点击前的最后一次鼠标移动
    let foundMovement = false;
    
    for (let j = allEvents.length - 1; j >= 0; j--) {
      const event = allEvents[j];
      if (event.type === 'mousemove') {
        const eventTime = event.data.timestamp || event.timestamp || Date.now();
        
        // 如果鼠标移动事件在点击之前且时间差小于1秒
        if (eventTime < clickTime && clickTime - eventTime < 1000) {
          foundMovement = true;
          break;
        }
      }
    }
    
    if (!foundMovement) {
      clicksWithoutMovement++;
    }
  }
  
  result.metrics.clicksWithoutMovement = clicksWithoutMovement;
  
  // 计算点击精度（如果大多数点击前没有鼠标移动，可能是自动化工具）
  result.metrics.clickPrecision = 1 - (clicksWithoutMovement / clickEvents.length);
  
  // 判断是否为自然点击模式
  // 1. 点击之间的时间应该不会太短（人类反应时间有限）
  // 2. 大多数点击前应该有鼠标移动
  result.isNatural = 
    avgTimeBetweenClicks > 500 && // 平均点击间隔大于500毫秒
    result.metrics.clickPrecision > 0.7; // 至少70%的点击前有鼠标移动
  
  return result;
}

/**
 * 分析事件时间间隔
 */
function analyzeEventTimeIntervals(events) {
  const result = {
    isNatural: false,
    metrics: {
      avgInterval: 0,
      intervalVariation: 0,
      suspiciouslyRegularIntervals: false
    }
  };
  
  if (events.length < 5) {
    return result;
  }
  
  // 提取时间戳
  const timestamps = [];
  for (const event of events) {
    timestamps.push(event.data?.timestamp || event.timestamp || Date.now());
  }
  
  // 计算时间间隔
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i-1]);
  }
  
  // 计算平均间隔
  const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  result.metrics.avgInterval = avgInterval;
  
  // 计算间隔变异
  const intervalVariation = Math.sqrt(
    intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length
  );
  result.metrics.intervalVariation = intervalVariation;
  
  // 检查是否有可疑的规律性间隔（自动化工具通常有非常规律的时间间隔）
  // 计算变异系数（标准差/平均值）
  const variationCoefficient = intervalVariation / avgInterval;
  
  // 如果变异系数小于0.1，说明时间间隔非常规律，可能是自动化工具
  result.metrics.suspiciouslyRegularIntervals = variationCoefficient < 0.1;
  
  // 判断是否为自然时间间隔
  // 人类操作的时间间隔应该有一定的变异性
  result.isNatural = !result.metrics.suspiciouslyRegularIntervals && variationCoefficient > 0.2;
  
  return result;
}

/**
 * 分析键盘输入模式
 */
function analyzeKeyPressPattern(keypressEvents) {
  const result = {
    isNatural: false,
    metrics: {
      keypressCount: keypressEvents.length,
      avgTimeBetweenKeypress: 0,
      keypressVariation: 0,
      suspiciouslyFastTyping: false
    }
  };
  
  if (keypressEvents.length < 5) {
    return result;
  }
  
  // 提取时间戳
  const timestamps = [];
  for (const event of keypressEvents) {
    timestamps.push(event.data?.timestamp || event.timestamp || Date.now());
  }
  
  // 计算时间间隔
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i-1]);
  }
  
  // 计算平均间隔
  const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  result.metrics.avgTimeBetweenKeypress = avgInterval;
  
  // 计算间隔变异
  const intervalVariation = Math.sqrt(
    intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length
  );
  result.metrics.keypressVariation = intervalVariation;
  
  // 检查是否有可疑的快速输入（自动化工具通常输入速度非常快）
  result.metrics.suspiciouslyFastTyping = avgInterval < 50; // 小于50毫秒可能是自动化
  
  // 判断是否为自然键盘输入
  // 1. 输入间隔不应该太短
  // 2. 应该有一定的变异性
  result.isNatural = 
    avgInterval > 100 && // 平均间隔大于100毫秒
    intervalVariation > 50; // 有一定的变异性
  
  return result;
}

/**
 * 使用K-means聚类分析事件模式
 * 可以用于识别异常的行为模式
 */
function clusterEventPatterns(events, k = 2) {
  if (events.length < 10) {
    return {
      anomalyDetected: false,
      clusters: []
    };
  }
  
  try {
    // 提取特征（这里简化为时间间隔和鼠标移动距离）
    const features = [];
    
    for (let i = 1; i < events.length; i++) {
      const currentEvent = events[i];
      const prevEvent = events[i-1];
      
      const timeInterval = (currentEvent.data?.timestamp || currentEvent.timestamp || 0) - 
                          (prevEvent.data?.timestamp || prevEvent.timestamp || 0);
      
      let distance = 0;
      if (currentEvent.type === 'mousemove' && prevEvent.type === 'mousemove' &&
          currentEvent.data && prevEvent.data) {
        const dx = (currentEvent.data.x || 0) - (prevEvent.data.x || 0);
        const dy = (currentEvent.data.y || 0) - (prevEvent.data.y || 0);
        distance = Math.sqrt(dx*dx + dy*dy);
      }
      
      features.push([timeInterval, distance]);
    }
    
    // 使用K-means聚类
    const kmeans = new KMeans(features, k);
    
    // 分析聚类结果
    const clusters = kmeans.clusters;
    const centroids = kmeans.centroids;
    
    // 计算每个聚类的大小
    const clusterSizes = Array(k).fill(0);
    for (const cluster of clusters) {
      clusterSizes[cluster]++;
    }
    
    // 如果某个聚类的大小特别小（<10%），可能是异常行为
    const anomalyDetected = clusterSizes.some(size => size < 0.1 * events.length);
    
    return {
      anomalyDetected,
      clusters: clusters,
      centroids: centroids,
      clusterSizes: clusterSizes
    };
  } catch (error) {
    return {
      anomalyDetected: false,
      error: error.message
    };
  }
}

module.exports = {
  analyzeBehavior,
  analyzeMouseTrajectory,
  analyzeClickPattern,
  analyzeEventTimeIntervals,
  analyzeKeyPressPattern,
  clusterEventPatterns
};
