import { config } from '../config.js';
import { registerByoa } from '../wassist.js';

/**
 * Register our Bring-Your-Own-Agent with Wassist, pointing it at OUR public
 * webhook URL (not WASSIST_BASE_URL — that is Wassist's API host).
 *
 * Railway:
 *   PUBLIC_WEBHOOK_URL=https://<service>.up.railway.app/webhook npm run register
 *
 * Local (expose :8787 first):
 *   ngrok http 8787
 *   PUBLIC_WEBHOOK_URL=https://<subdomain>.ngrok-free.app/webhook npm run register
 *
 * Then in the Wassist dashboard, deploy/assign the returned agent to your WhatsApp number.
 */
async function main(): Promise<void> {
  if (!config.wassist.apiKey) throw new Error('WASSIST_API_KEY is not set.');
  const url = config.wassist.publicWebhookUrl;
  if (!url) {
    throw new Error(
      'PUBLIC_WEBHOOK_URL is not set (your public https .../webhook on Railway or ngrok).',
    );
  }

  console.log(`Registering BYOA -> ${url}`);
  console.log(`Wassist API host: ${config.wassist.baseUrl}`);
  const agent = await registerByoa(url);
  console.log('Registered agent:');
  console.log(JSON.stringify(agent, null, 2));
  console.log(
    '\nNext: in the Wassist dashboard, deploy this agent to your WhatsApp number so inbound routes here.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
