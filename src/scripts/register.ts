import { config } from '../config.js';
import { registerByoa } from '../wassist.js';

/**
 * Register our Bring-Your-Own-Agent with Wassist, pointing it at our public
 * webhook URL. Run after starting the server + exposing it (e.g. via ngrok):
 *
 *   PUBLIC_WEBHOOK_URL=https://<ngrok>.ngrok-free.app/webhook npm run register
 *
 * Then, in the Wassist dashboard, assign the returned agent as the default for
 * your WhatsApp number so all inbound messages route to us.
 */
async function main(): Promise<void> {
  if (!config.wassist.apiKey) throw new Error('WASSIST_API_KEY is not set.');
  const url = config.wassist.publicWebhookUrl;
  if (!url) throw new Error('PUBLIC_WEBHOOK_URL is not set (your public https .../webhook).');

  console.log(`Registering BYOA -> ${url}`);
  const agent = await registerByoa(url);
  console.log('Registered agent:');
  console.log(JSON.stringify(agent, null, 2));
  console.log(
    '\nNext: in the Wassist dashboard, set this agent as the default for your number so inbound routes here.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
