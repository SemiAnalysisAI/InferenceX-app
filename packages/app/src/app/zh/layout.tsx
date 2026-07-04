import { SetDocumentLang } from '@/components/set-document-lang';
import { ZH_LANG_TAG } from '@/lib/i18n';

/**
 * Simplified Chinese page tree. Every page under /zh is a hand-authored
 * Chinese sibling of an English page (see AGENTS.md "Chinese Website Pages").
 * The lang attribute on the wrapper scopes the content language for crawlers
 * and assistive tech before hydration; SetDocumentLang fixes up <html lang>
 * after hydration.
 */
export default function ZhLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang={ZH_LANG_TAG} className="contents">
      <SetDocumentLang lang={ZH_LANG_TAG} />
      {children}
    </div>
  );
}
