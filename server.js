const jsonServer = require('json-server');
const path = require('path');
const express = require('express');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const PORT = process.env.PORT || 3000;

// أولاً: تقديم الملفات الثابتة (HTML, CSS, JS)
server.use(express.static(path.join(__dirname)));

// ثانياً: تمكين تحليل JSON (ضروري لـ POST)
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// ثالثاً: ميدلوير JSON Server (CORS, logging, etc.)
server.use(jsonServer.defaults());

// رابعاً: إضافة created_at تلقائياً لأي عملية POST
server.use((req, res, next) => {
  if (req.method === 'POST') {
    req.body.created_at = new Date().toISOString();
  }
  next();
});

// خامساً: ربط الراوتر بالمسار /api
server.use('/api', router);

// تشغيل الخادم
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Static files served from ${__dirname}`);
  console.log(`✅ API available at /api`);
});
