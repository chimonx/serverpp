// index.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // สำหรับจัดการ CORS
const rateLimit = require('express-rate-limit');
const webhookRoutes = require('./webhook'); // นำเข้า Webhook Routes
const { db, collection, addDoc, updateDoc, query, where, doc, getDocs } = require('./firebase');
const Omise = require('omise')({
  publicKey: process.env.REACT_APP_PUBLIC_OMISE_KEY, 
  secretKey: process.env.REACT_APP_SECRET_OMISE_KEY,
});

const app = express();

// ตั้งค่า Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100, // จำกัดแต่ละ IP ไม่เกิน 100 ครั้งต่อหน้าต่างเวลา
});
app.use(limiter);

// ตั้งค่า CORS ให้อนุญาตเฉพาะ https://order.smobu.cloud
app.use(cors({
  origin: 'https://order.smobu.cloud',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

app.use(bodyParser.json());

// ใช้ Webhook Routes
app.use('/webhook', webhookRoutes);

// สร้าง PromptPay QR Code
app.post('/checkout', async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    // สร้าง Source
    const source = await Omise.sources.create({
      type: 'promptpay',
      amount: amount,
      currency: 'THB',
    });

    console.log('Source created:', source);

    // สร้าง Charge
    const charge = await Omise.charges.create({
      amount: amount,
      source: source.id,
      currency: 'THB',
    });

    console.log('Charge created:', charge);

    // ดึง URL ของ QR Code จาก Source แทน Charge
    const qrCodeUrl = source.scannable_code?.image?.download_uri || null;

    if (!qrCodeUrl) {
      console.error('QR Code URL not found in source.');
      return res.status(500).json({ error: 'Failed to retrieve QR Code URL' });
    }

    // บันทึก Charge ลง Firebase
    const newOrder = {
      paymentChargeId: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      status: 'pending',
      createdAt: new Date(),
    };

    const docRef = await addDoc(collection(db, 'orders'), newOrder);
    console.log(`Order created with ID: ${docRef.id}`);

    // ส่งข้อมูลกลับไปในรูปแบบ JSON
    return res.json({ charge, orderId: docRef.id, qrCodeUrl });
  } catch (error) {
    console.error('Error creating charge or saving to Firebase:', error);
    res.status(500).json({ error: 'Failed to create charge or save order', details: error.message });
  }
});

// ตรวจสอบสถานะการชำระเงิน
app.get('/payment-status/:chargeId', async (req, res) => {
  const chargeId = req.params.chargeId;

  try {
    const charge = await Omise.charges.retrieve(chargeId);

    res.json({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      paid: charge.paid,
      currency: charge.currency,
      source: charge.source,
    });

    console.log(`Charge ${chargeId} retrieved successfully`);
  } catch (error) {
    console.error('Error retrieving charge:', error);
    res.status(500).json({ error: 'Failed to retrieve charge', details: error.message });
  }
});

// เริ่มเซิร์ฟเวอร์
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
