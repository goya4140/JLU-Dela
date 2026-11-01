import DOMPurify from 'dompurify';

export function prepareLocalHtml(text: string, entryId: string) {
  const source = new DOMParser().parseFromString(text, 'text/html');
  const needsScripts = source.querySelector('script') !== null;
  const clean = DOMPurify.sanitize(text, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'frame', 'object', 'embed', 'form', 'base', 'meta'],
    ADD_TAGS: ['link'],
    ADD_ATTR: ['rel'],
  });
  const document = new DOMParser().parseFromString(clean, 'text/html');
  const base = `dela-resource://html-asset/${encodeURIComponent(entryId)}/`;
  for (const element of document.querySelectorAll(
    'img[src], source[src], link[href], image[href]',
  )) {
    const attribute =
      element.localName === 'link' || element.localName === 'image' ? 'href' : 'src';
    const value = element.getAttribute(attribute) ?? '';
    if (element.localName === 'link' && element.getAttribute('rel') !== 'stylesheet') {
      element.remove();
      continue;
    }
    if (/^data:image\//i.test(value)) continue;
    try {
      const url = new URL(value, base);
      if (
        url.protocol === 'dela-resource:' &&
        url.hostname === 'html-asset' &&
        url.pathname.startsWith('/' + encodeURIComponent(entryId) + '/')
      )
        element.setAttribute(attribute, url.href);
      else element.removeAttribute(attribute);
    } catch {
      element.removeAttribute(attribute);
    }
  }
  for (const element of document.querySelectorAll('[srcset], [poster]')) {
    element.removeAttribute('srcset');
    element.removeAttribute('poster');
  }
  for (const element of document.querySelectorAll('a[href]')) {
    const href = element.getAttribute('href') ?? '';
    if (!href.startsWith('#') && !/^https?:\/\//i.test(href)) element.removeAttribute('href');
  }
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content =
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' dela-resource:; img-src data: dela-resource:; font-src data: dela-resource:; connect-src 'none'; form-action 'none'; base-uri dela-resource:";
  const baseElement = document.createElement('base');
  baseElement.href = base;
  document.head.prepend(policy, baseElement);
  return { html: '<!doctype html>\n' + document.documentElement.outerHTML, needsScripts };
}
