import { INSPIREME_BASE_URL } from '../lib/constants';
import type { Quote as QuoteType } from '../types/quote';
import { QuoteActions } from './QuoteActions';
import { useSettings } from '../hooks/useSettings';

interface QuoteProps {
  quote: QuoteType | null;
  loading: boolean;
  fontFamily?: string;
  fontSize?: number;
}

export function Quote({ quote, loading, fontFamily, fontSize = 36 }: QuoteProps) {
  const { settings } = useSettings();
  const lang = settings.language;

  if (loading) {
    return (
      <div className="text-center text-white/50 animate-pulse">
        <div className="mx-auto h-8 w-80 rounded bg-white/10 mb-4" />
        <div className="mx-auto h-8 w-64 rounded bg-white/10 mb-4" />
        <div className="mx-auto h-5 w-40 rounded bg-white/10" />
      </div>
    );
  }

  if (!quote) return null;

  const hasLink = quote.id && quote.id.length > 0;
  const quoteUrl = `${INSPIREME_BASE_URL}/quotes/${quote.id}`;
  const authorUrl = quote.authorSlug
    ? `${INSPIREME_BASE_URL}/authors/${quote.authorSlug}`
    : undefined;

  const quoteStyle: React.CSSProperties = {
    fontFamily: fontFamily || undefined,
    fontSize: `${fontSize}px`,
    lineHeight: 1.6,
  };

  const quoteContent = (
    <p className="font-light drop-shadow-lg max-w-3xl break-keep" style={quoteStyle}>
      &ldquo;{quote.content}&rdquo;
    </p>
  );

  return (
    <div key={quote.id || quote.content} className="text-center animate-fade-in">
      {hasLink ? (
        <a href={quoteUrl} className="cursor-pointer hover:opacity-80 transition-opacity">
          {quoteContent}
        </a>
      ) : (
        quoteContent
      )}

      <p className="mt-4 text-xl text-white/80 drop-shadow-md break-keep" style={{ fontFamily: fontFamily || undefined }}>
        —{' '}
        {authorUrl ? (
          <a href={authorUrl} className="hover:underline">{quote.author}</a>
        ) : (
          quote.author
        )}
      </p>

      {hasLink && (
        <div className="mt-6 animate-fade-in-delayed">
          <QuoteActions quoteId={quote.id} lang={lang} />
        </div>
      )}
    </div>
  );
}
