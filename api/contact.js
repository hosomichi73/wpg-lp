// Vercel serverless function: POST /api/contact
// Receives the contact form submission and sends it via the Resend API.
//
// Required environment variables (set in the hosting platform's dashboard,
// never committed to the repository):
//   RESEND_API_KEY   - secret API key from https://resend.com/api-keys
//   CONTACT_TO_EMAIL - the mailbox(es) that should receive inquiries.
//                      複数の宛先に同じメールを送る場合は、カンマ区切りで指定する。
//                      例) whitephat7@gmail.com,qtsue5299@gmail.com
//                      (読みやすさのための半角スペース、セミコロン、改行区切りも受け付ける)
//
// The sending domain (4phat.com) must already be verified in Resend.

const FROM_ADDRESS = 'WHITE Phat Graphics <noreply@4phat.com>';

const MAX_IMAGES = 3;
// 送信経路(サーバーの受け取り上限 4.5MB)に余裕を持たせた、添付合計の上限
const MAX_ATTACHMENT_BYTES = 3.5 * 1024 * 1024;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 「選択なし」も含めて、チェック項目を箇条書きにする
const renderChoices = (items) => {
  if (!items.length) return '<p style="margin:4px 0 0;color:#64748b;">選択なし</p>';
  return `<ul style="margin:4px 0 0;padding-left:20px;">${items
    .map((item) => `<li style="margin-bottom:4px;">${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
};

const renderText = (text) =>
  text
    ? `<p style="margin:4px 0 0;white-space:pre-wrap;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`
    : '<p style="margin:4px 0 0;color:#64748b;">記入なし</p>';

const heading = (text) =>
  `<h3 style="margin:24px 0 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0;font-size:15px;">${text}</h3>`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;

  // 宛先は複数指定できる。カンマ / セミコロン / 改行のいずれでも区切れる。
  const recipients = (process.env.CONTACT_TO_EMAIL || '')
    .split(/[,;\n]/)
    .map((addr) => addr.trim())
    .filter(Boolean);
  const invalidRecipients = recipients.filter((addr) => !EMAIL_PATTERN.test(addr));

  if (!apiKey || !recipients.length || invalidRecipients.length) {
    console.error('Environment variable problem.', {
      hasApiKey: Boolean(apiKey),
      recipientCount: recipients.length,
      invalidRecipientCount: invalidRecipients.length,
    });
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

  // 必須はこの3項目のみ。以下はすべて任意。
  const detail = (body?.detail || '').toString().trim();
  const request = (body?.request || '').toString().trim();
  const toList = (value) =>
    (Array.isArray(value) ? value : [])
      .map((item) => item.toString().trim())
      .filter(Boolean)
      .slice(0, 20);
  const past = toList(body?.past);
  const future = toList(body?.future);

  if (!company || !name || !email) {
    return res.status(400).json({ error: '必須項目が入力されていません。' });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'メールアドレスの形式が正しくありません。' });
  }

  // 添付画像(任意)
  const rawImages = Array.isArray(body?.images) ? body.images.slice(0, MAX_IMAGES) : [];
  const attachments = [];
  let attachmentBytes = 0;

  for (const image of rawImages) {
    const content = (image?.content || '').toString();
    if (!content) continue;
    const filename = (image?.filename || 'image.jpg').toString().replace(/[\r\n"]/g, '').slice(0, 80);
    attachmentBytes += Math.ceil(content.length * 3 / 4);
    attachments.push({ filename, content });
  }

  if (attachmentBytes > MAX_ATTACHMENT_BYTES) {
    return res.status(413).json({ error: '画像の容量が大きすぎます。枚数を減らしてお試しください。' });
  }

  const attachmentSummary = attachments.length
    ? `<p style="margin:4px 0 0;">${attachments.length}枚（このメールの添付ファイルをご確認ください）</p>`
    : '<p style="margin:4px 0 0;color:#64748b;">添付なし</p>';

  const html = `
    <div style="font-family:sans-serif;line-height:1.7;color:#1e293b;">
      <h2 style="font-size:17px;">無料デザイン診断フォームからのお問い合わせ</h2>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:2px 12px 2px 0;"><strong>会社名</strong></td><td>${escapeHtml(company)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;"><strong>ご担当者様氏名</strong></td><td>${escapeHtml(name)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;"><strong>メールアドレス</strong></td><td>${escapeHtml(email)}</td></tr>
      </table>

      ${heading('① 過去の制作物で困っていたこと')}
      ${renderChoices(past)}

      ${heading('過去の制作物の画像')}
      ${attachmentSummary}

      ${heading('その他・詳しく教えてください')}
      ${renderText(detail)}

      ${heading('② 今後の案件で悩んでいること')}
      ${renderChoices(future)}

      ${heading('イベント時期・ご予算感・その他ご要望')}
      ${renderText(request)}
    </div>
  `;

  try {
    const payload = {
      from: FROM_ADDRESS,
      to: recipients,
      reply_to: email,
      subject: `【無料デザイン診断】${company} 様よりお問い合わせ`,
      html,
    };
    if (attachments.length) payload.attachments = attachments;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
