require('dotenv').config(); // โหลดค่าจากไฟล์ .env
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // สำหรับจัดการ CORS
const { db, collection, addDoc, updateDoc, query, where, doc, getDocs } = require('./firebase');

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
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

app.use(bodyParser.json());

// สร้าง PromptPay QR Code
app.post('/checkout', async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    // สร้าง Source
    const source = await omise.sources.create({
      type: 'promptpay',
      amount: amount,
      currency: 'THB',
    });

    console.log('Source created:', source);

    // สร้าง Charge
    const charge = await omise.charges.create({
      amount: amount,
      source: source.id,
      currency: 'THB',
    });

    console.log('Charge created:', charge);

    // ดึง URL ของ QR Code
    const qrCodeUrl = charge.source?.scannable_code?.image?.download_uri || null;

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
    const charge = await omise.charges.retrieve(chargeId);

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

    // ตรวจสอบสถานะอีกครั้ง
    try {
      const chargeDetails = await omise.charges.retrieve(chargeId);

      if (chargeDetails.status === 'successful') {
        console.log(`Charge ${chargeId} verified as successful`);

        // อัปเดตสถานะใน Firebase
        await updateFirebaseStatus(chargeId, 'paid', chargeDetails);
      } else {
        console.log(`Charge ${chargeId} is not successful. Status: ${chargeDetails.status}`);
      }

      res.status(200).send('Webhook processed and Firebase updated');
    } catch (error) {
      console.error(`Error verifying charge ${chargeId} status:`, error);
      res.status(500).send('Failed to process Webhook');
    }
  } else {
    console.log(`Unhandled event type: ${eventType}`);
    res.status(200).send('Webhook received');
  }
});

// เริ่มเซิร์ฟเวอร์
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
