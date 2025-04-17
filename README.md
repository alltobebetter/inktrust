# InkTrust 无感验证API 2.0

这是一个基于Node.js的高级无感验证API服务，可以嵌入到网站中进行用户验证，无需用户主动操作，并且能够准确识别自动化工具和机器人。

## 功能特点

- **无感知验证**：用户无需主动操作即可完成验证
- **自动化工具检测**：准确识别Selenium、Puppeteer、Playwright等自动化工具
- **高级行为分析**：使用机器学习分析用户行为模式
- **多维度指纹**：收集Canvas、WebGL、音频等多维度指纹
- **网络特征分析**：检测代理、VPN和数据中心IP
- **易于集成**：简单的JavaScript SDK可快速集成到任何网站

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地运行

```bash
npm run dev
```

### 部署到Vercel

1. 安装Vercel CLI:

```bash
npm install -g vercel
```

2. 登录Vercel:

```bash
vercel login
```

3. 部署:

```bash
vercel
```

## 使用方法

### 在网站中集成SDK

1. 在HTML中引入SDK:

```html
<script src="https://your-vercel-deployment-url.vercel.app/sdk.js"></script>
```

2. 初始化SDK:

```javascript
const inkTrust = new InkTrust({
  apiUrl: 'https://your-vercel-deployment-url.vercel.app/api',
  fingerprintOptions: {
    enableCanvas: true,
    enableWebGL: true,
    enableAudio: true,
    enableFonts: true
  },
  onInitialized: function(data) {
    console.log('初始化完成:', data);
  },
  onVerified: function(result) {
    console.log('验证结果:', result);
    // 根据结果执行操作
    if (result.isHuman) {
      // 用户是真人
    } else {
      // 可能是机器人
    }
  }
});
```

### SDK配置选项

- `apiUrl`: API服务器地址
- `autoVerify`: 是否自动验证 (默认: true)
- `verifyDelay`: 自动验证延迟时间 (默认: 2000ms)
- `eventSamplingRate`: 事件采样率 (默认: 0.1)
- `fingerprintOptions`: 指纹选项
  - `enableCanvas`: 启用Canvas指纹 (默认: true)
  - `enableWebGL`: 启用WebGL指纹 (默认: true)
  - `enableAudio`: 启用音频指纹 (默认: true)
  - `enableFonts`: 启用字体检测 (默认: true)
- `onInitialized`: 初始化完成回调
- `onVerified`: 验证完成回调
- `onError`: 错误回调

### API端点

- `POST /api/init` - 初始化验证会话，返回会话ID
- `POST /api/event/:sessionId` - 记录用户行为事件，支持多种事件类型
- `POST /api/verify/:sessionId` - 验证会话，返回详细的验证结果
- `GET /api/status/:sessionId` - 获取会话状态和分析信息

### 返回结果说明

验证结果包含以下信息：

```json
{
  "success": true,
  "result": {
    "isHuman": true,
    "score": 85,
    "reasons": [],
    "details": {
      "automation": {
        "score": 90,
        "isAutomated": false,
        "detectedTools": []
      },
      "behavior": {
        "score": 80,
        "isHuman": true,
        "metrics": {...}
      },
      "fingerprint": {
        "score": 85,
        "anomalies": []
      },
      "network": {
        "score": 75,
        "proxied": false,
        "vpnDetected": false
      }
    }
  }
}
```

## 验证原理

InkTrust 2.0通过多维度分析判断用户是否为真实用户:

### 1. 自动化工具检测

- 检测WebDriver API存在性
- 识别Selenium、Puppeteer、Playwright等工具特有属性
- 检测Chrome Headless和其他无头浏览器
- 检测浏览器环境不一致性

### 2. 高级行为分析

- 使用机器学习分析鼠标移动轨迹
- 检测不自然的点击模式
- 分析输入速度和节奏
- 使用K-means聚类分析事件模式

### 3. 多维度指纹

- Canvas指纹生成与分析
- WebGL渲染器和供应商检测
- 音频上下文指纹
- 字体检测与分析

### 4. 网络特征分析

- 检测代理和VPN使用
- 识别数据中心IP地址
- 检查IP与时区的一致性
- 分析请求头特征

## 自定义验证逻辑

您可以通过修改以下文件来自定义验证逻辑:

- `api/verify.js` - 主要验证逻辑
- `utils/automation-detector.js` - 自动化工具检测
- `utils/behavior-analyzer.js` - 行为分析
- `utils/fingerprint-analyzer.js` - 指纹分析
- `utils/network-analyzer.js` - 网络特征分析

## 许可证

MIT
