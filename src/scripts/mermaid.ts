// Renders <pre class="mermaid"> blocks (produced by scripts/remark-mermaid.mjs)
// with mermaid.js on the client.
//
// - Lazy: mermaid is only downloaded when a page actually contains a diagram.
// - Theme-aware: diagrams re-render when the site theme (data-theme on <html>)
//   toggles, so colours follow light/dark.

(async () => {
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>('pre.mermaid[data-mermaid]'),
  );
  if (blocks.length === 0) return;

  // Code-split: this import becomes its own chunk, loaded only here.
  const { default: mermaid } = await import('mermaid');

  // mermaid replaces each element's content with an <svg>, so stash the original
  // source to allow re-rendering when the theme changes.
  const sources = new Map<HTMLElement, string>();
  for (const el of blocks) sources.set(el, el.textContent ?? '');

  const themeName = (): 'dark' | 'default' =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';

  let running = false;
  const render = async () => {
    if (running) return;
    running = true;
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: themeName(),
        securityLevel: 'strict',
        fontFamily: 'var(--font-mono)',
      });
      for (const el of blocks) {
        el.removeAttribute('data-processed');
        el.textContent = sources.get(el) ?? '';
      }
      await mermaid.run({ nodes: blocks });
    } catch (error) {
      console.error('[mermaid] render failed', error);
    } finally {
      running = false;
    }
  };

  await render();

  // Re-render on theme toggle.
  let current = themeName();
  const observer = new MutationObserver(() => {
    const next = themeName();
    if (next !== current) {
      current = next;
      void render();
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
})();
