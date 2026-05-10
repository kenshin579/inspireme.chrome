import { buildQuoteActionUrl, type QuoteAction } from '../lib/constants';
import { trackQuoteAction } from '../lib/analytics';

interface QuoteActionsProps {
  quoteId: string;
  lang: 'ko' | 'en';
}

const LABELS: Record<'ko' | 'en', Record<QuoteAction, string>> = {
  ko: { like: '좋아요', save: '저장' },
  en: { like: 'Like', save: 'Save' },
};

const HeartIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
    />
  </svg>
);

const BookmarkIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
    />
  </svg>
);

export function QuoteActions({ quoteId, lang }: QuoteActionsProps) {
  const labels = LABELS[lang];

  const renderButton = (action: QuoteAction, Icon: () => React.ReactElement) => (
    <a
      href={buildQuoteActionUrl(quoteId, action, lang)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        trackQuoteAction(action, quoteId);
      }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white/70 bg-white/10 hover:bg-white/20 hover:text-white transition-colors text-sm"
      aria-label={labels[action]}
    >
      <Icon />
      {labels[action]}
    </a>
  );

  return (
    <div className="flex items-center justify-center gap-3">
      {renderButton('like', HeartIcon)}
      {renderButton('save', BookmarkIcon)}
    </div>
  );
}
