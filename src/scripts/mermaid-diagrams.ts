// Renders the placeholders emitted by scripts/remark-mermaid.mjs.
// Mermaid is large, so it is only downloaded on pages that contain a diagram.

const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-mermaid]'));

if (blocks.length > 0) {
  const root = document.documentElement;
  let renderCount = 0;
  let generation = 0;

  // The base theme only understands hex colors, which is what the site tokens are.
  const buildConfig = () => {
    const css = getComputedStyle(root);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const fontFamily = token('--font-mono');

    return {
      startOnLoad: false,
      securityLevel: 'strict' as const,
      theme: 'base' as const,
      // Mermaid 12 defaults to the "neo" look (gradients + grey drop shadows),
      // which clashes with the flat site palette, especially in dark mode.
      look: 'classic' as const,
      flowchart: { wrappingWidth: 320 },
      fontFamily,
      themeVariables: {
        darkMode: root.dataset.theme === 'dark',
        fontFamily,
        fontSize: '14px',
        background: token('--bg'),
        primaryColor: token('--surface-elev'),
        primaryTextColor: token('--fg'),
        primaryBorderColor: token('--border-strong'),
        secondaryColor: token('--surface-soft'),
        tertiaryColor: token('--surface-note'),
        lineColor: token('--fg-muted'),
        textColor: token('--fg'),
        edgeLabelBackground: token('--bg'),
        clusterBkg: token('--surface-soft'),
        clusterBorder: token('--border-muted'),
        noteBkgColor: token('--surface-note'),
        noteTextColor: token('--fg'),
        noteBorderColor: token('--border-strong'),
      },
    };
  };

  const renderAll = async () => {
    const current = ++generation;
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize(buildConfig());

    for (const block of blocks) {
      // A newer theme change started while this pass was running.
      if (current !== generation) return;

      const source = block.querySelector('.mermaid-source')?.textContent ?? '';
      const output = block.querySelector<HTMLElement>('.mermaid-output');
      if (!output || !source.trim()) continue;

      const id = `mermaid-svg-${renderCount++}`;
      try {
        const { svg, bindFunctions } = await mermaid.render(id, source);
        if (current !== generation) return;
        output.innerHTML = svg;
        bindFunctions?.(output);
        block.classList.add('is-rendered');
      } catch (error) {
        // Leave the source visible so the post is still readable.
        console.error('Mermaid diagram failed to render', error);
        block.classList.remove('is-rendered');
        output.innerHTML = '';
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
      }
    }
  };

  renderAll();

  new MutationObserver(() => renderAll()).observe(root, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}
