export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/inquiry" && request.method === "POST") {
      try {
        const { name, phone, email, service, message, website } =
          await request.json();

        // Honeypot: bots fill hidden "website" field → silently drop
        if (website) return json({ ok: true });

        if (!name || (!phone && !email && !message)) {
          return json({ ok: false, error: "Brak danych" }, 400);
        }

        const text =
          `🌸 <b>Nowe zapytanie — Permanent Guru</b>\n\n` +
          `<b>Imię:</b> ${esc(name)}\n` +
          `<b>Telefon:</b> ${esc(phone || "—")}\n` +
          `<b>E-mail:</b> ${esc(email || "—")}\n` +
          `<b>Zabieg:</b> ${esc(service || "—")}\n` +
          `<b>Wiadomość:</b> ${esc(message || "—")}`;

        const tg = await fetch(
          `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.CHAT_ID,
              text,
              parse_mode: "HTML",
            }),
          }
        );

        if (!tg.ok) return json({ ok: false, error: "Telegram error" }, 502);
        return json({ ok: true });
      } catch (e) {
        return json({ ok: false, error: "Server error" }, 500);
      }
    }

    // Everything else → serve the static site
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
