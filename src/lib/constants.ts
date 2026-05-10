import packageJson from '../../package.json';

export const STORAGE_PREFIX = 'IM';

export const INSPIREME_BASE_URL = 'https://inspire-me.advenoh.pe.kr';
export const INSPIREME_API_URL = `${INSPIREME_BASE_URL}/api/widget`;

export const UNSPLASH_BASE_URL = 'https://api.unsplash.com';
export const UNSPLASH_CLIENT_ID =
  '4469e676a2a92f3481a1546533824178cbf5eed9d773394924d93a70e77c6ab8';
export const UNSPLASH_COLLECTION_ID = '1065861';

export type QuoteAction = 'like' | 'save';

/**
 * 사이트 명언 상세 페이지 + 자동 액션 트리거 URL.
 * utm 파라미터로 GA 측정 분리.
 */
export function buildQuoteActionUrl(
  quoteId: string,
  action: QuoteAction,
  lang: 'ko' | 'en',
): string {
  const url = new URL(`${INSPIREME_BASE_URL}/quotes/${quoteId}`);
  url.searchParams.set('action', action);
  url.searchParams.set('lang', lang);
  url.searchParams.set('utm_source', 'chrome_ext');
  url.searchParams.set('utm_medium', 'quote_action');
  url.searchParams.set('utm_campaign', `ext_v${packageJson.version}`);
  return url.toString();
}
