const axios = require('axios');
const nodemailer = require('nodemailer');

async function notifySlack(webhookUrl, urlRecord, diff) {
  const message = {
    text: `🔔 *${urlRecord.name}* に変更が検出されました`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔔 *${urlRecord.name}* に変更が検出されました\n<${urlRecord.url}|ページを確認する>`
        }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*変更内容:*\n\`\`\`${diff}\`\`\`` }
      }
    ]
  };

  await axios.post(webhookUrl, message);
}

async function notifyEmail(to, urlRecord, diff) {
  if (!process.env.SMTP_HOST) return;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: `[変更検出] ${urlRecord.name}`,
    html: `
      <h2>🔔 ${urlRecord.name} に変更が検出されました</h2>
      <p><a href="${urlRecord.url}">${urlRecord.url}</a></p>
      <h3>変更内容:</h3>
      <pre style="background:#f4f4f4;padding:12px;border-radius:4px">${diff}</pre>
    `
  });
}

async function sendNotifications(urlRecord, diff) {
  const tasks = [];

  const slackWebhook = urlRecord.notify_slack || process.env.SLACK_DEFAULT_WEBHOOK;
  if (slackWebhook) tasks.push(notifySlack(slackWebhook, urlRecord, diff).catch(console.error));

  if (urlRecord.notify_email) tasks.push(notifyEmail(urlRecord.notify_email, urlRecord, diff).catch(console.error));

  await Promise.all(tasks);
}

module.exports = { sendNotifications };
