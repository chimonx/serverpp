require('dotenv').config(); // โหลดค่าจากไฟล์ .env
const express = require('express');
const bodyParser = require('body-parser');
const db = require('./firebase'); // นำเข้า Firebase SDK

// กำหนด Public และ Secret Key โดยดึงค่าจาก .env
const omise = require('omise')({
  publicKey: process.env.REACT_APP_PUBLIC_OMISE_KEY,
  secretKey: process.env.REACT_APP_SECRET_OMISE_KEY,
});

const app = express();

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
      }, async (error, charge) => {
        if (error) {
          console.error('Error creating charge:', error);
          res.status(400).send(error);
        } else {
          // บันทึก Charge ID ลงใน Firebase
          const newOrder = {
            paymentChargeId: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: 'pending',
            createdAt: new Date(),
          };

          try {
            const docRef = await db.collection('orders').add(newOrder);
            console.log(`Order created with ID: ${docRef.id}`);
            res.send({ charge, orderId: docRef.id });
          } catch (firebaseError) {
            console.error('Error saving order to Firebase:', firebaseError);
            res.status(500).send(firebaseError);
          }
        }
      });
    }
  });
});

// ตรวจสอบสถานะการชำระเงิน
app.get('/payment-status/:chargeId', async (req, res) => {
  const chargeId = req.params.chargeId;

  omise.charges.retrieve(chargeId, async (error, charge) => {
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

      // หากสถานะสำเร็จ (successful) อัปเดต Firebase
      if (charge.status === 'successful') {
        await updateFirebaseStatus(charge.id, 'paid', charge);
      }
    }
  });
});

// ฟังก์ชันอัปเดตสถานะใน Firebase
async function updateFirebaseStatus(chargeId, status, charge) {
  const ordersRef = db.collection('orders');
  const snapshot = await ordersRef.where('paymentChargeId', '==', chargeId).get();

  if (!snapshot.empty) {
    snapshot.forEach(async (doc) => {
      await doc.ref.update({
        status: status,
        paymentDetails: {
          chargeId: charge.id,
          amount: charge.amount,
          currency: charge.currency,
          paid: charge.paid,
        },
      });

      console.log(`Order ${doc.id} status updated to: ${status}`);
    });
  } else {
    console.error('No orders found with the given chargeId:', chargeId);
  }
}

// รับ Webhook จาก Omise (ไม่ใช้ CORS)
app.post('/webhook', bodyParser.json(), (req, res) => {
  const webhookData = req.body;

  // ตรวจสอบว่า Webhook เป็นของจริง
  if (!webhookData || !webhookData.object || webhookData.object !== 'event') {
    console.error('Invalid webhook data:', webhookData);
    return res.status(400).send('Invalid Webhook');
  }

  // ตรวจสอบประเภทของ Event
  const eventType = webhookData.key;
  console.log('Received webhook event:', eventType);

  if (eventType === 'charge.complete') {
    const charge = webhookData.data;
    const chargeId = charge.id;

    // เรียก /payment-status/:chargeId เพื่อตรวจสอบสถานะ
    console.log(`Processing charge.complete for chargeId: ${chargeId}`);
  }

  res.status(200).send('Webhook received and processed');
});

// เริ่มเซิร์ฟเวอร์
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
