import { storage } from './storage';

const GA_MEASUREMENT_ID = 'G-6G6FHKMQGB';
const GA_API_SECRET = import.meta.env.WXT_GA_API_SECRET || '';

async function getOrCreateClientId(): Promise<string> {
  let clientId = await storage.get<string>('ga_client_id');
  if (!clientId) {
    clientId = crypto.randomUUID();
    await storage.set('ga_client_id', clientId);
  }
  return clientId;
}

export async function trackEvent(name: string, params?: Record<string, string>) {
  if (!GA_API_SECRET) return;

  try {
    const clientId = await getOrCreateClientId();
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          events: [{ name, params }],
        }),
      },
    );
  } catch {
    // GA 실패는 무시
  }
}

export async function trackPageView() {
  await trackEvent('page_view', { page_title: 'newtab' });
}

export async function trackQuoteAction(
  action: 'like' | 'save',
  quoteId: string,
) {
  await trackEvent('quote_action_click', {
    action,
    quote_id: quoteId,
  });
}
