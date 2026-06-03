const jsonServer = require('json-server');
const path = require('path');
const express = require('express');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const middlewares = jsonServer.defaults();

// إعداد المنفذ من بيئة Render أو افتراضي 3000
const PORT = process.env.PORT || 3000;

// استخدام الـ middlewares الافتراضية (CORS, logging, static)
server.use(middlewares);

// تمكين تحليل JSON
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// تخصيص نقاط النهاية (Endpoints) لضبط التاريخ عند الإضافة
server.use((req, res, next) => {
  if (req.method === 'POST') {
    req.body.created_at = new Date().toISOString();
  }
  next();
});

// استخدام نفس الخادم لتقديم الملفات الثابتة (HTML, CSS, JS)
server.use(express.static(path.join(__dirname)));

// توجيه طلبات API إلى json-server
server.use('/api', router);

// تشغيل الخادم
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`✅ Static files served from ${__dirname}`);
  console.log(`✅ API available at http://localhost:${PORT}/api`);
});
