// Turns ```mermaid fenced blocks into a placeholder that the client script in
// Layout.astro renders to SVG. Runs before Expressive Code, so these blocks
// never get code-frame treatment. The source stays in the page as a <pre>, which
// is what the reader sees if JavaScript is off or the diagram fails to parse.

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  if (Array.isArray(node.children)) for (const child of node.children) walk(child, visitor);
}

export default function remarkMermaid() {
  return (tree) => {
    walk(tree, (node) => {
      if (node.type !== 'code' || node.lang !== 'mermaid') return;

      const source = escapeHtml(node.value);
      node.type = 'html';
      node.value =
        `<div class="mermaid-diagram" data-mermaid>` +
        `<pre class="mermaid-source" data-pagefind-ignore>${source}</pre>` +
        `<div class="mermaid-output"></div>` +
        `</div>`;
      delete node.lang;
      delete node.meta;
    });
  };
}
