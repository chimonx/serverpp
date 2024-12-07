require('dotenv').config(); // โหลดค่าจากไฟล์ .env
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // นำเข้า CORS
const { db, collection, addDoc, updateDoc, query, where, doc, getDocs } = require('./firebase');

// กำหนด Public และ Secret Key โดยดึงค่าจาก .env
const omise = require('omise')({
  publicKey: process.env.REACT_APP_PUBLIC_OMISE_KEY,
  secretKey: process.env.REACT_APP_SECRET_OMISE_KEY,
});

const app = express();

// ตั้งค่า CORS ให้อนุญาตเฉพาะ https://order.smobu.cloud
app.use(cors({
  origin: 'https://order.smobu.cloud',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(bodyParser.json());

// สร้าง PromptPay QR Code
app.post('/checkout', async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).send({ error: 'Invalid amount' });
  }

  try {
    // สร้าง Source
    const source = await omise.sources.create({
      type: 'promptpay',
      amount: amount,
      currency: 'THB',
    });

    // สร้าง Charge
    const charge = await omise.charges.create({
      amount: amount,
      source: source.id,
      currency: 'THB',
    });

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

    res.send({ charge, orderId: docRef.id });
  } catch (error) {
    console.error('Error creating charge or saving to Firebase:', error);
    res.status(500).send({ error: 'Failed to create charge or save order' });
  }
});

// ตรวจสอบสถานะการชำระเงิน
app.get('/payment-status/:chargeId', async (req, res) => {
  const chargeId = req.params.chargeId;

  try {
    const charge = await omise.charges.retrieve(chargeId);

    res.send({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      paid: charge.paid,
      currency: charge.currency,
      source: charge.source,
    });

    // หากสถานะสำเร็จ (successful) อัปเดต Firebase
    if (charge.status === 'successful') {
      await updateFirebaseStatus(charge.id, 'paid', charge);
    }
  } catch (error) {
    console.error('Error retrieving charge:', error);
    res.status(500).send({ error: 'Failed to retrieve charge' });
  }
});

// ฟังก์ชันอัปเดตสถานะใน Firebase
async function updateFirebaseStatus(chargeId, status, charge) {
  const ordersQuery = query(
    collection(db, 'orders'),
    where('paymentChargeId', '==', chargeId)
  );

  const snapshot = await getDocs(ordersQuery);

  if (!snapshot.empty) {
    snapshot.forEach(async (docSnapshot) => {
      const orderRef = doc(db, 'orders', docSnapshot.id);
      await updateDoc(orderRef, {
        status: status,
        paymentDetails: {
          chargeId: charge.id,
          amount: charge.amount,
          currency: charge.currency,
          paid: charge.paid,
        },
      });

      console.log(`Order ${docSnapshot.id} status updated to: ${status}`);
    });
  } else {
    console.error('No orders found with the given chargeId:', chargeId);
  }
}

// รับ Webhook จาก Omise
app.post('/webhook', async (req, res) => {
  const webhookData = req.body;

  // ตรวจสอบว่า Webhook เป็นของจริง
  if (!webhookData || !webhookData.object || webhookData.object !== 'event') {
    console.error('Invalid webhook data:', webhookData);
    return res.status(400).send('Invalid Webhook');
  }

  const eventType = webhookData.key;
  console.log('Received webhook event:', eventType);

  if (eventType === 'charge.complete') {
    const charge = webhookData.data;
    const chargeId = charge.id;

    console.log(`Processing charge.complete for chargeId: ${chargeId}`);

    // ตรวจสอบสถานะและอัปเดต Firebase
    if (charge.status === 'successful') {
      await updateFirebaseStatus(chargeId, 'paid', charge);
    } else {
      console.log(`Charge ${chargeId} is not successful. Current status: ${charge.status}`);
    }
  }

  res.status(200).send('Webhook received and processed');
});

// เริ่มเซิร์ฟเวอร์
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
