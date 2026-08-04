import nodemailer from 'nodemailer';

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function mailFrom() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@example.com';
}

export async function sendEmail({ to, subject, body, replyTo }) {
  if (!to) {
    const err = new Error('Lead has no email address');
    err.code = 'NO_EMAIL';
    throw err;
  }

  if (!smtpConfigured()) {
    // Simulated send for demos without SMTP
    return {
      simulated: true,
      messageId: `sim-${Date.now()}`,
      accepted: [to],
    };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: mailFrom(),
    to,
    subject,
    text: body,
    replyTo: replyTo || mailFrom(),
  });

  return {
    simulated: false,
    messageId: info.messageId,
    accepted: info.accepted,
  };
}
