export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, userAgentSet: !!(process.env.SEC_USER_AGENT || '').trim() });
}
