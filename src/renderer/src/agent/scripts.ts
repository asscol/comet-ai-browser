// JS source executed inside a <webview> via webview.executeJavaScript().
// Each export is a string of JavaScript that returns a JSON-serialisable value.

export const SNAPSHOT_SCRIPT = `(() => {
  const SELECTOR = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  document.querySelectorAll('[data-devin-id]').forEach((el) => el.removeAttribute('data-devin-id'));

  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (parseFloat(style.opacity || '1') === 0) return false;
    return true;
  };

  const trim = (s, n) => {
    if (!s) return '';
    const out = String(s).replace(/\\s+/g, ' ').trim();
    return out.length > n ? out.slice(0, n) + '…' : out;
  };

  const elements = [];
  let id = 0;
  document.querySelectorAll(SELECTOR).forEach((el) => {
    if (!isVisible(el)) return;
    el.setAttribute('data-devin-id', String(id));
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type') || '';
    const text = trim(el.textContent, 120);
    const placeholder = trim(el.getAttribute('placeholder'), 80);
    let value = '';
    if ('value' in el) value = trim(el.value, 80);
    const href = trim(el.getAttribute('href'), 200);
    const ariaLabel = trim(el.getAttribute('aria-label'), 80);
    elements.push({ id, tag, type, text, placeholder, value, href, ariaLabel });
    id++;
  });

  const fullText = (document.body && document.body.innerText) || '';
  return {
    url: location.href,
    title: document.title,
    elements,
    textPreview: fullText.slice(0, 2000),
    scrollY: Math.round(window.scrollY),
    scrollHeight: Math.round(document.documentElement.scrollHeight),
    innerHeight: Math.round(window.innerHeight)
  };
})()`

export function clickScript(id: number): string {
  return `(() => {
    const el = document.querySelector('[data-devin-id="${id}"]');
    if (!el) return { ok: false, error: 'Element with id ${id} not found in current snapshot' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    try { el.focus(); } catch (_) {}
    el.click();
    return { ok: true, tag: el.tagName.toLowerCase() };
  })()`
}

export function typeScript(id: number, text: string, submit: boolean): string {
  const t = JSON.stringify(text)
  return `(() => {
    const el = document.querySelector('[data-devin-id="${id}"]');
    if (!el) return { ok: false, error: 'Element with id ${id} not found' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    try { el.focus(); } catch (_) {}
    const value = ${t};
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      return { ok: false, error: 'Element is not editable' };
    }
    if (${submit ? 'true' : 'false'}) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      if (el.form) {
        try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); } catch (_) {}
      }
    }
    return { ok: true };
  })()`
}

export function scrollScript(direction: 'up' | 'down', amount: number): string {
  const dy = direction === 'up' ? -amount : amount
  return `(() => { window.scrollBy(0, ${dy}); return { ok: true, scrollY: Math.round(window.scrollY) }; })()`
}
