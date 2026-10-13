/** Pure: the chapter document stored for a saved reader-mode page. */
import { escapeHtml } from '../export/html';
import type { ExtractedArticle } from './extract';

export const buildSavedPageHtml = (
  article: Pick<
    ExtractedArticle,
    'direction' | 'siteName' | 'byline' | 'url' | 'html'
  >,
): string => {
  const lang = article.direction === 'rtl' ? 'ar' : 'en';
  const byline = article.byline ? ` · ${escapeHtml(article.byline)}` : '';
  return `<div dir="${article.direction}" lang="${lang}">
<p style="opacity:.7;font-size:.85em">${escapeHtml(
    article.siteName ?? '',
  )}${byline}<br/><a href="${escapeHtml(article.url)}">${escapeHtml(
    article.url,
  )}</a></p>
${article.html}
</div>`;
};
