# InkTrust 无感验证API

这是一个基于Node.js的无感验证API服务，可以嵌入到网站中进行用户验证，无需用户主动操作。

## 功能特点

- 无感知验证：用户无需主动操作即可完成验证
- 行为分析：通过分析用户行为判断是否为真实用户
- 设备指纹：收集设备信息辅助验证
- 易于集成：简单的JavaScript SDK可快速集成到任何网站

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
- `onInitialized`: 初始化完成回调
- `onVerified`: 验证完成回调
- `onError`: 错误回调

### API端点

- `POST /api/init` - 初始化验证会话
- `POST /api/event/:sessionId` - 记录用户行为事件
- `POST /api/verify/:sessionId` - 验证会话
- `GET /api/status/:sessionId` - 获取会话状态

## 验证原理

InkTrust通过以下方式判断用户是否为真实用户:

1. 分析用户行为模式（鼠标移动、点击等）
2. 检查会话时长（机器人通常会过快完成操作）
3. 验证设备信息的一致性
4. 分析用户代理和浏览器特征

## 自定义验证逻辑

您可以通过修改 `api/verify.js` 文件中的 `verifySession` 函数来自定义验证逻辑。

## 许可证

MIT
