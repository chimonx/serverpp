const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { db, collection, addDoc } = require('./firebase');
const webhookRoutes = require('./webhook');
const Omise = require('omise')({
  publicKey: process.env.REACT_APP_PUBLIC_OMISE_KEY,
  secretKey: process.env.REACT_APP_SECRET_OMISE_KEY,
});

const app = express();

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS Configuration
app.use(cors({
  origin: 'https://order.smobu.cloud',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // For x-www-form-urlencoded

// Use webhook route
app.use('/webhook', webhookRoutes);

// Endpoint: Checkout
app.post('/checkout', async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    // Create Omise Source
    const source = await Omise.sources.create({
      type: 'promptpay',
      amount: amount,
      currency: 'THB',
    });

    console.log('Source created:', source);

    // Create Omise Charge
    const charge = await Omise.charges.create({
      amount: amount,
      source: source.id,
      currency: 'THB',
    });

    console.log('Charge created:', charge);

    // Retrieve QR Code URL
    const qrCodeUrl =
      charge.source?.scannable_code?.image?.download_uri || 
      source?.scannable_code?.image?.download_uri || 
      null;

    if (!qrCodeUrl) {
      console.error('QR Code URL not found in charge or source.');
      return res.status(500).json({ error: 'Failed to retrieve QR Code URL' });
    }

    const docRef = await addDoc(collection(db, 'orders'), newOrder);
    console.log(`Order created with ID: ${docRef.id}`);

    // Send Response
    return res.json({ charge, orderId: docRef.id, qrCodeUrl });
  } catch (error) {
    console.error('Error creating charge or saving to Firebase:', error);
    res.status(500).json({ error: 'Failed to create charge or save order', details: error.message });
  }
});

// Endpoint: Payment Status
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

// Start Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
