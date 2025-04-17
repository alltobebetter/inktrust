const express = require('express');
const cors = require('cors');
const path = require('path');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.get('/', (req, res) => {
  res.send('InkTrust 无感验证API服务正在运行');
});

// 导入API路由
const verifyRouter = require('./api/verify');
app.use('/api', verifyRouter);

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

module.exports = app;
