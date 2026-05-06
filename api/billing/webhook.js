const kv = require('../store');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeSecret) return res.status(500).json({ error: 'Stripe not configured' });

  // Read raw body from stream before any parsing occurs
  const rawBody = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email || session.metadata?.email;
    if (email) {
      const apiKeyVal = await kv.get(`apikey:email:${email}`);
      if (apiKeyVal) {
        const record = await kv.get(`apikey:key:${apiKeyVal}`);
        if (record) {
          await kv.set(`apikey:key:${apiKeyVal}`, {
            ...record,
            plan: 'pro',
            stripe_customer_id: session.customer,
            upgraded_at: Math.floor(Date.now() / 1000),
          });
          console.log(`Upgraded to Pro: ${email}`);
        }
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer;
    const keys = await kv.smembers('apikeys:all') || [];
    for (const key of keys) {
      const record = await kv.get(`apikey:key:${key}`);
      if (record?.stripe_customer_id === customerId) {
        await kv.set(`apikey:key:${key}`, { ...record, plan: 'free' });
        console.log(`Downgraded to Free: customer ${customerId}`);
        break;
      }
    }
  }

  res.json({ received: true });
};
