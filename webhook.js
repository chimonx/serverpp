// webhook.js

const express = require('express');
const { db, collection, updateDoc, query, where, doc, getDocs } = require('./firebase');
const Omise = require('omise')({
  publicKey: process.env.REACT_APP_PUBLIC_OMISE_KEY,
  secretKey: process.env.REACT_APP_SECRET_OMISE_KEY,
});

const router = express.Router();

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
router.post('/', async (req, res) => {
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
      const chargeDetails = await Omise.charges.retrieve(chargeId);

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
  } else if (eventType === 'charge.create') {
    const charge = webhookData.data;
    const chargeId = charge.id;

    console.log(`Processing charge.create for chargeId: ${chargeId}`);

    // คุณสามารถเพิ่มการจัดการเพิ่มเติมได้ที่นี่ หากจำเป็น
    // เช่น การบันทึกข้อมูลเพิ่มเติมหรือการแจ้งเตือน

    res.status(200).send('Webhook processed');
  } else {
    console.log(`Unhandled event type: ${eventType}`);
    res.status(200).send('Webhook received');
  }
});

module.exports = router;
