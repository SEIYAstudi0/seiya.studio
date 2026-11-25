export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY belum dikonfigurasi di Vercel Environment Variables.'
    });
  }

  try {
    const { roleTitle, roomCode, prompt, contextNotes } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt perintah wajib diisi.' });
    }

    const systemInstructionText = [
      `Anda adalah ${roleTitle || 'AI Specialist Engineer'} di perusahaan konsultan teknologi & konstruksi SEIYA Studio (Divisi: ${roomCode || 'Engineering'}) dengan pengalaman profesional 20 tahun.`,
      `Berikan jawaban teknis yang akurat, terstruktur, ringkas dalam Bahasa Indonesia (maksimal 3 kalimat padat atau poin teknis terukur sesuai jabatan Anda).`,
      `Jangan mengaku sebagai Owner, Komisaris, atau Rekan Bisnis.`
    ].join(' ');

    const userContentText = contextNotes
      ? `Instruksi Eksekutif: ${prompt}\nKonteks Koordinasi Tim: ${contextNotes}`
      : `Instruksi Eksekutif: ${prompt}`;

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstructionText }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userContentText }]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 450
          }
        })
      }
    );

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || 'Gagal memanggil Gemini API'
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
