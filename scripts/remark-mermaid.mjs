// Converts ```mermaid fenced code blocks into <pre class="mermaid"> elements.
// This runs on the mdast before Expressive Code touches the tree, so EC leaves
// the diagram alone (it only processes real code nodes). The client script at
// src/scripts/mermaid.ts then renders these blocks with mermaid.js, theme-aware.

function walk(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  if (Array.isArray(node.children))
    for (const child of node.children) walk(child, visitor, node);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default function remarkMermaid() {
  return (tree) => {
    walk(tree, (node) => {
      if (node.type !== 'code' || node.lang !== 'mermaid') return;

      const source = escapeHtml(node.value ?? '');
      // Mutate the code node in place into a raw HTML node. Browsers un-escape
      // the entities back to the original diagram text via textContent, so
      // mermaid receives the exact source it expects.
      node.type = 'html';
      node.value = `<pre class="mermaid" data-mermaid>${source}</pre>`;
      delete node.lang;
      delete node.meta;
    });
  };
}
