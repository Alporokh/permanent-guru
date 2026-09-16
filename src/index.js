export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test") {
      return json({
        ok: true,
        hasBotToken: !!env.BOT_TOKEN,
        hasChatId: !!env.CHAT_ID,
      });
    }

    if (url.pathname === "/api/inquiry" && request.method === "POST") {
      // The site's JavaScript posts JSON. Without JavaScript the browser posts
      // the form itself, so that path gets an HTML page back instead of JSON.
      const isJson = (request.headers.get("Content-Type") || "").includes(
        "application/json"
      );

      try {
        const data = isJson
          ? await request.json()
          : Object.fromEntries(await request.formData());
        const { name, phone, email, service, message, website, rodo } = data;

        // Honeypot: bots fill hidden "website" field → silently drop
        if (website) return isJson ? json({ ok: true }) : formPage(true);

        if (!name || (!phone && !email && !message)) {
          return isJson
            ? json({ ok: false, error: "Brak danych" }, 400)
            : formPage(false, "Podaj imię oraz telefon, e-mail lub wiadomość.", 400);
        }

        // The JavaScript form checks consent before sending; a plain post must carry it
        if (!isJson && !rodo) {
          return formPage(
            false,
            "Zaznacz zgodę na przetwarzanie danych, aby wysłać formularz.",
            400
          );
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

        if (!tg.ok) {
          const detail = await tg.text();
          return isJson
            ? json({ ok: false, error: "Telegram error", detail }, 502)
            : formPage(false, SEND_FAILED, 502);
        }
        return isJson ? json({ ok: true }) : formPage(true);
      } catch (e) {
        return isJson
          ? json({ ok: false, error: "Server error" }, 500)
          : formPage(false, SEND_FAILED, 500);
      }
    }

    // Everything else → serve the static site
    return withCharset(await env.ASSETS.fetch(request));
  },
};

// Cloudflare's asset server sends "Content-Type: text/html" with no charset.
// Browsers fall back to the <meta charset> tag, but crawlers flag the missing
// header, so declare it here. Nothing else about the response changes.
function withCharset(response) {
  const type = response.headers.get("Content-Type") || "";
  if (response.status === 304) return response;
  if (!/^text\/html\b/i.test(type) || /charset=/i.test(type)) return response;
  const out = new Response(response.body, response);
  out.headers.set("Content-Type", "text/html; charset=utf-8");
  return out;
}

const SEND_FAILED =
  "Nie udało się wysłać wiadomości. Zadzwoń do nas: +48 452 370 369.";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formPage(ok, message = "", status = 200) {
  const title = ok ? "Dziękujemy za wiadomość" : "Wiadomość nie została wysłana";
  const body = ok ? "Odpiszemy w ciągu 24 godzin." : message;
  const html =
    `<!doctype html><html lang="pl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex">` +
    `<title>${title} · Permanent Guru Poznań</title>` +
    `<link rel="stylesheet" href="/assets/style.css"></head>` +
    `<body><main class="container" style="padding:96px 24px;max-width:640px">` +
    `<h1>${title}</h1><p>${esc(body)}</p>` +
    `<p><a class="btn btn-primary" href="/">Wróć na stronę główną</a></p>` +
    `</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
