require('dotenv').config(); // โหลดค่าจากไฟล์ .env
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// กำหนด Public และ Secret Key โดยดึงค่าจาก .env
const omise = require('omise')({
  publicKey: process.env.REACT_APP_PUBLIC_OMISE_KEY,
  secretKey: process.env.REACT_APP_SECRET_OMISE_KEY,
});

const app = express();

// ตั้งค่า CORS
app.use(cors({
  origin: 'https://order.smobu.cloud',
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(bodyParser.json());

// สร้าง PromptPay QR Code
app.post('/checkout', (req, res) => {
  const { amount } = req.body;

  omise.sources.create({
    type: 'promptpay',
    amount: amount,
    currency: 'THB',
  }, (error, source) => {
    if (error) {
      console.error('Error creating source:', error);
      res.status(400).send(error);
    } else {
      omise.charges.create({
        amount: amount,
        source: source.id,
        currency: 'THB',
      }, (error, charge) => {
        if (error) {
          console.error('Error creating charge:', error);
          res.status(400).send(error);
        } else {
          res.send(charge);
        }
      });
    }
  });
});

// ตรวจสอบสถานะการชำระเงิน
app.get('/payment-status/:chargeId', (req, res) => {
  const chargeId = req.params.chargeId;

  omise.charges.retrieve(chargeId, (error, charge) => {
    if (error) {
      console.error('Error retrieving charge:', error);
      res.status(400).send(error);
    } else {
      res.send({
        id: charge.id,
        status: charge.status,
        amount: charge.amount,
        paid: charge.paid,
        currency: charge.currency,
        source: charge.source,
      });
    }
  });
});

// เริ่มเซิร์ฟเวอร์
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
