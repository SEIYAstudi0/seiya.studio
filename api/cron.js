export default async function handler(req, res) {
  // Lindungi endpoint cron jika CRON_SECRET dipasang di Vercel (opsional)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized cron request' });
    }
  }

  const now = new Date();
  const wibFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const timeWIB = now.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit'
  });
  const dateWIB = wibFormatter.format(now);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = process.env.OWNER_TELEGRAM_USER_ID;

  // Deteksi apakah waktu saat ini berada di jendela siklus pagi (sekitar 08.30 WIB)
  const [hhStr, mmStr] = timeWIB.split(':');
  const hh = Number(hhStr || 0);
  const mm = Number(mmStr || 0);
  const isResetWindow = hh === 8 && mm >= 25 && mm <= 40;

  let telegramNotified = false;
  if (botToken && ownerId && isResetWindow) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ownerId,
          parse_mode: 'Markdown',
          text:
            `🌅 *SEIYA DAILY QUOTA CYCLE (08.30 WIB)*\n` +
            `• Tanggal: ${dateWIB}\n` +
            `• Waktu Server WIB: ${timeWIB}\n` +
            `• Kuota Produksi Harian: *0/5* (Siap menerima kandidat baru)\n` +
            `• Pekerjaan yang sedang berjalan: *Tetap aman & tidak dibatalkan*`
        })
      });
      telegramNotified = true;
    } catch (e) {
      telegramNotified = false;
    }
  }

  return res.status(200).json({
    ok: true,
    service: 'SEIYA Vercel Cron Watchdog',
    date_wib: dateWIB,
    time_wib: `${timeWIB} WIB`,
    daily_quota_limit: 5,
    reset_schedule_wib: '08:30',
    is_reset_window: isResetWindow,
    telegram_notified: telegramNotified
  });
}
