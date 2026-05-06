const kv = require('../store');

// Stripe Checkout セッション作成（Pro ¥980/月）
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(503).json({ error: 'Billing not configured yet' });

  const { api_key } = req.body || {};
  if (!api_key) return res.status(400).json({ error: 'api_key is required' });

  const record = await kv.get(`apikey:key:${api_key}`);
  if (!record) return res.status(404).json({ error: 'Invalid API key' });
  if (record.plan === 'pro') return res.status(400).json({ error: 'Already on Pro plan' });

  try {
    const stripe = require('stripe')(stripeKey);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: record.email,
      metadata: { email: record.email, api_key },
      line_items: [{
        price_data: {
          currency: 'jpy',
          recurring: { interval: 'month' },
          product_data: {
            name: 'Web Change Monitor Pro',
            description: '監視URL無制限 + メール通知 + 最短30分ごとチェック',
          },
          unit_amount: 980,
        },
        quantity: 1,
      }],
      success_url: `${process.env.APP_URL || 'https://web-change-monitor-one.vercel.app'}?upgraded=1`,
      cancel_url: `${process.env.APP_URL || 'https://web-change-monitor-one.vercel.app'}?cancelled=1`,
    });

    res.json({ checkout_url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
