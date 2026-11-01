import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { CodeViewer } from './CodeViewer';
import { prepareLocalHtml } from './local-html';
import { useContentLoader } from './loader';
import { showToast } from '../../app/toasts';
import { errorText } from '../../workspace/store';

export function LocalHtmlPreview({
  text,
  entryId,
  title,
  truncated,
}: {
  text: string;
  entryId: string;
  title: string;
  truncated?: boolean;
}) {
  const [source, setSource] = useState(false);
  const document = useMemo(() => prepareLocalHtml(text, entryId), [text, entryId]);
  const loader = useContentLoader();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
        <Button size="sm" variant={source ? 'ghost' : 'secondary'} onClick={() => setSource(false)}>
          预览
        </Button>
        <Button size="sm" variant={source ? 'secondary' : 'ghost'} onClick={() => setSource(true)}>
          源码
        </Button>
        {window.dela && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void window
                .dela!.workspace.openFile(entryId)
                .catch((cause) =>
                  showToast({ variant: 'error', title: '打开失败', description: errorText(cause) }),
                )
            }
          >
            在外部打开
          </Button>
        )}
        <span className="text-xs text-ink-3">静态 HTML{truncated ? ' · 仅显示开头部分' : ''}</span>
      </div>
      {document.needsScripts && (
        <p role="status" className="px-3 py-2 text-xs text-ink-3">
          此页面包含脚本，静态预览可能缺少内容；需要交互时可在外部打开。
        </p>
      )}
      {source ? (
        <CodeViewer value={text} filename={title} scroll={0} onScroll={() => {}} />
      ) : (
        <iframe
          title={title}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          srcDoc={document.html}
          onLoad={(event) => {
            event.currentTarget.contentDocument?.addEventListener('click', (e) => {
              const link = (e.target as Element).closest?.('a[href]');
              const href = link?.getAttribute('href') ?? '';
              if (href.startsWith('#')) {
                e.preventDefault();
                link?.ownerDocument
                  .getElementById(decodeURIComponent(href.slice(1)))
                  ?.scrollIntoView();
              } else if (/^https?:/i.test(href)) {
                e.preventDefault();
                loader.openLink(href);
              }
            });
          }}
        />
      )}
    </div>
  );
}
