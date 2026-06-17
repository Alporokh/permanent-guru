export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      ok: true,
      hasBotToken: !!context.env.BOT_TOKEN,
      hasChatId: !!context.env.CHAT_ID,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
