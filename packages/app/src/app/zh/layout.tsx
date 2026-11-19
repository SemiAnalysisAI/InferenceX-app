import { SetDocumentLang } from '@/components/zh/set-document-lang';
import { ZH_LANG_TAG } from '@/lib/i18n/i18n';

export default function ZhLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang={ZH_LANG_TAG} className="contents">
      <SetDocumentLang lang={ZH_LANG_TAG} />
      {children}
    </div>
  );
}
