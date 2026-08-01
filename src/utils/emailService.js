import nodemailer from 'nodemailer';

let transporter;

/**
 * Creates a reusable Nodemailer transporter from environment variables.
 * Supports Gmail, Outlook, or any custom SMTP host.
 */
const createTransporter = () => {
  const requiredVariables = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name]?.trim()
  );
  if (missingVariables.length > 0) {
    const error = new Error(
      `Email service is not configured. Missing: ${missingVariables.join(', ')}`
    );
    error.statusCode = 503;
    throw error;
  }

  const port = parseInt(process.env.EMAIL_PORT || '587');
  if (!Number.isInteger(port) || port <= 0) {
    const error = new Error('Email service has an invalid EMAIL_PORT.');
    error.statusCode = 503;
    throw error;
  }

  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
    port:   port,
    secure: port === 465, // true for port 465 (SSL), false for 587 (TLS/STARTTLS)
    connectionTimeout: 30000,  // increased for Render cold-start latency
    greetingTimeout:  20000,
    socketTimeout:    45000,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Returns a verified transporter. Resets the cached instance on any failure
 * so broken connections are never reused across requests.
 */
const getTransporter = async () => {
  if (!transporter) {
    transporter = createTransporter();
  }
  try {
    await transporter.verify();
  } catch (verifyError) {
    // Destroy the broken transporter so the next call gets a fresh one
    transporter = null;
    console.error(`[EMAIL OTP] SMTP verify failed (${verifyError.code || verifyError.message})`);
    const error = new Error('Email service is temporarily unavailable. Please try again in a moment.');
    error.statusCode = 503;
    error.cause = verifyError;
    throw error;
  }
  return transporter;
};

/**
 * Sends a branded OTP email to the recipient.
 * @param {string} toEmail - The recipient's email address
 * @param {string} otp     - The 6-digit OTP code
 */
export const sendOtpEmail = async (toEmail, otp) => {
  // getTransporter() verifies the SMTP connection and resets on failure
  const t = await getTransporter();

  const mailOptions = {
    from:    `"SmartGalli" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: '🔐 Your SmartGalli Verification Code',
    text: `Your SmartGalli verification code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>SmartGalli OTP</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f7f6;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="520" cellpadding="0" cellspacing="0"
                     style="background:#ffffff;border-radius:16px;overflow:hidden;
                            box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#FF6B00 0%,#10B981 100%);
                              padding:28px 40px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;
                                letter-spacing:-0.5px;">Smart<span style="color:#fff;">Galli</span></h1>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;">
                      Your Digital Neighborhood
                    </p>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:36px 40px;text-align:center;">
                    <div style="font-size:40px;margin-bottom:16px;">🔐</div>
                    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
                      Verification Code
                    </h2>
                    <p style="margin:0 0 28px;color:#6B7280;font-size:14px;line-height:1.6;">
                      Use the code below to complete your login.<br/>
                      It expires in <strong>5 minutes</strong>.
                    </p>
                    <!-- OTP Box -->
                    <div style="display:inline-block;background:#f0fdf8;border:2px dashed #10B981;
                                border-radius:12px;padding:18px 40px;margin-bottom:28px;">
                      <span style="font-size:40px;font-weight:800;letter-spacing:10px;
                                   color:#10B981;font-family:'Courier New',monospace;">
                        ${otp}
                      </span>
                    </div>
                    <p style="margin:0 0 8px;color:#9CA3AF;font-size:12px;">
                      If you did not request this, please ignore this email.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#f9fafb;padding:20px 40px;text-align:center;
                              border-top:1px solid #e5e7eb;">
                    <p style="margin:0;color:#9CA3AF;font-size:12px;">
                      © ${new Date().getFullYear()} SmartGalli · Secure · Fast · Reliable
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  let info;
  try {
    info = await t.sendMail(mailOptions);
  } catch (sendError) {
    // Reset the cached transporter so the next request gets a fresh connection
    transporter = null;
    console.error(`[EMAIL OTP] sendMail failed (${sendError.code || sendError.message})`);
    const error = new Error('Failed to send OTP email. Please try again in a moment.');
    error.statusCode = 503;
    error.cause = sendError;
    throw error;
  }

  const normalizedRecipient = toEmail.toLowerCase();
  const accepted = (info.accepted || []).some(
    (recipient) => String(recipient).toLowerCase() === normalizedRecipient
  );

  if (!accepted) {
    const error = new Error('The email provider rejected the OTP recipient.');
    error.statusCode = 503;
    throw error;
  }

  console.log(`[EMAIL OTP] Provider accepted message ${info.messageId}`);
  return info;
};
