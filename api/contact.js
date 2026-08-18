// Vercel serverless function: POST /api/contact
// Receives the contact form submission and sends it via the Resend API.
//
// Required environment variables (set in the hosting platform's dashboard,
// never committed to the repository):
//   RESEND_API_KEY   - secret API key from https://resend.com/api-keys
//   CONTACT_TO_EMAIL  - the mailbox that should receive inquiries
//
// The sending domain (4phat.com) must already be verified in Resend.

const FROM_ADDRESS = 'WHITE Phat Graphics <noreply@4phat.com>';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;

  if (!apiKey || !toEmail) {
    console.error('Missing RESEND_API_KEY or CONTACT_TO_EMAIL environment variable.');
    return res.status(500).json({ error: 'サーバー設定エラーが発生しました。' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: '不正なリクエストです。' });
    }
  }

  const company = (body?.company || '').toString().trim();
  const name = (body?.name || '').toString().trim();
  const email = (body?.email || '').toString().trim();
  const message = (body?.message || '').toString().trim();

  if (!company || !name || !email || !message) {
    return res.status(400).json({ error: '必須項目が入力されていません。' });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'メールアドレスの形式が正しくありません。' });
  }

  const escapeHtml = (str) =>
    str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const html = `
    <h2>無料デザイン診断フォームからのお問い合わせ</h2>
    <table>
      <tr><td><strong>会社名</strong></td><td>${escapeHtml(company)}</td></tr>
      <tr><td><strong>ご担当者様氏名</strong></td><td>${escapeHtml(name)}</td></tr>
      <tr><td><strong>メールアドレス</strong></td><td>${escapeHtml(email)}</td></tr>
    </table>
    <p><strong>現在のお悩み・ご要望</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
  `;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        reply_to: email,
        subject: `【無料デザイン診断】${company} 様よりお問い合わせ`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json().catch(() => ({}));
      console.error('Resend API error:', resendRes.status, errData);
      return res.status(502).json({ error: 'メール送信に失敗しました。' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Failed to send email via Resend:', err);
    return res.status(500).json({ error: 'メール送信中にエラーが発生しました。' });
  }
};
