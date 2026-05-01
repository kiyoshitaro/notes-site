<div align="center">

# notes-site

**A fast, opinionated, content-first Astro site for long-form technical writing — books, blog posts, and reverse-engineering notes.**

[![Astro](https://img.shields.io/badge/Astro-6.x-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![MDX](https://img.shields.io/badge/MDX-5.x-1B1F24?logo=mdx&logoColor=white)](https://mdxjs.com)
[![Expressive Code](https://img.shields.io/badge/Expressive%20Code-0.41-7257FA)](https://expressive-code.com)
[![Pagefind](https://img.shields.io/badge/Pagefind-1.5-2A2A2A)](https://pagefind.app)
[![KaTeX](https://img.shields.io/badge/KaTeX-0.16-329F3F)](https://katex.org)
[![Giscus](https://img.shields.io/badge/Giscus-comments-181717?logo=github&logoColor=white)](https://giscus.app)
[![License](https://img.shields.io/badge/license-MIT-black)](#license)

[**Live demo**](https://kiyoshitaro.github.io/notes-site) · [**Quick start**](#-quick-start) · [**Components**](#-mdx-component-library) · [**Configuration**](#-configuration)

</div>

---

## ✨ Why this exists

A static-site stack tuned for **technical content**: math, code, multi-chapter books, and quiet reading. Markdown stays simple; MDX adds power where you need it.

```
┌─────────────────────────────────────────────────────────────┐
│  Astro 6  ──  MDX  ──  Expressive Code  ──  Pagefind        │
│      │           │            │                 │           │
│   routing     content     code blocks       client search   │
│   SSR/SSG    + remark     + copy + diff      Cmd+K modal    │
│              plugins      + line marks                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick start

```bash
# 1. Install (Node ≥ 22.12, pnpm recommended)
pnpm install

# 2. Dev server → http://localhost:4321
pnpm dev

# 3. Production build (also generates /pagefind index)
pnpm build

# 4. Preview the built site locally
pnpm preview
```

> [!NOTE]
> Search (Pagefind) only works against the **built** site. In dev, the magnifier opens but returns empty results until you run `pnpm build` once.

---

## 📚 Content model

Two collections, both schema-validated via Zod (`src/content.config.ts`):

| Collection | Path                      | Format    | Purpose                              |
| :--------- | :------------------------ | :-------- | :----------------------------------- |
| `blog`     | `src/content/blog/*.md`   | Markdown  | Standalone posts                     |
| `books`    | `src/content/books/<book>/<chapter>.{md,mdx}` | Markdown + MDX | Multi-chapter long-form |

Frontmatter (shared):

```yaml
---
title: "Chapter 2: Advanced Features"
pubDate: "2025-04-27"     # YYYY-MM-DD, validated
updatedDate: "2025-05-01" # optional
published: true           # drafts hidden when false
description: "..."        # required when published (SEO)
useKatex: true            # opt-in math rendering
cat: "ml"                 # blog only — color-coded category
---
```

---

## 🧩 MDX component library

Drop-in components in `src/components/ui/`. All themed via project CSS variables — no Tailwind, no runtime cost beyond what each example needs.

<table>
<tr>
<td width="50%">

**`<Callout />`** — note / tip / warning / danger
```mdx
<Callout type="warning" title="Breaking Change">
After v3→v5, update `content.config.ts`.
</Callout>
```

</td>
<td width="50%">

**`<Tabs>` + `<TabItem>`** — interactive code switcher
```mdx
<Tabs tabs={['npm','pnpm','yarn']}>
  <TabItem>npm install x</TabItem>
  <TabItem>pnpm add x</TabItem>
  <TabItem>yarn add x</TabItem>
</Tabs>
```

</td>
</tr>
<tr>
<td>

**`<Steps>`** — numbered vertical timeline
```mdx
<Steps>
  <div>### Initialize</div>
  <div>### Add MDX</div>
  <div>### Ship</div>
</Steps>
```

</td>
<td>

**`<Quote>`** — attributed pull-quote
```mdx
<Quote author="Linus Torvalds" title="LKML">
Talk is cheap. Show me the code.
</Quote>
```

</td>
</tr>
<tr>
<td>

**`<ProsCons>`** — 2-column comparison
```mdx
<ProsCons
  pros={['fast','typed','SSG']}
  cons={['young ecosystem']}
/>
```

</td>
<td>

**`<LinkCard>`** — rich external link
```mdx
<LinkCard
  href="https://astro.build"
  title="Astro docs"
/>
```

</td>
</tr>
<tr>
<td>

**`<YouTube>`** — lazy 16:9 embed
```mdx
<YouTube id="dQw4w9WgXcQ" />
```

</td>
<td>

**`<Figure>` + `<Divider>`** — framed images, gradient rules
```mdx
<Figure src="/x.png" caption="..." />
<Divider />
```

</td>
</tr>
</table>

Live showcase: [`02-advanced.mdx`](src/content/books/getting-started/02-advanced.mdx).

---

## 💻 Code blocks (Expressive Code)

Markdown code fences get **copy button**, **frame titles**, **line highlights**, **diff markers**, and **dual light/dark themes** synced to `data-theme`.

````md
```ts title="src/server.ts" {3-5} ins={6} del={7}
import { handler } from './route';

export default {
  fetch: handler,
}
+ console.log('shipped');
- console.log('debug');
```
````

Configured in `astro.config.mjs` — themes `github-light` / `github-dark-dimmed`, font `var(--font-mono)`, no shadow.

---

## 🔍 Site search (Pagefind)

Cmd/Ctrl+K (or `/`) opens a modal:

- Static, **zero-runtime-API** index built from compiled HTML.
- Theme-aware UI styled via project CSS vars.
- Excerpts, sub-results, deep-link to result.
- Header marked `data-pagefind-ignore` to keep nav out of results.

Source: [`src/components/Search.astro`](src/components/Search.astro). Trigger button lives in [`src/layouts/Layout.astro`](src/layouts/Layout.astro).

---

## 💬 Comments + reactions (Giscus)

GitHub-Discussions-backed comments mounted on every blog post and book chapter. Theme syncs with site via `MutationObserver` + `postMessage` to the giscus iframe.

Setup:

```bash
# 1. Enable Discussions on your repo + install the giscus app
# 2. Run https://giscus.app to mint repo/category IDs
# 3. cp .env.example .env  → fill in:

PUBLIC_GISCUS_REPO=kiyoshitaro/notes-site
PUBLIC_GISCUS_REPO_ID=R_kg...
PUBLIC_GISCUS_CATEGORY=Comments
PUBLIC_GISCUS_CATEGORY_ID=DIC_kw...
```

If unconfigured, a friendly inline warning renders in place of the widget. Component: [`src/components/Comments.astro`](src/components/Comments.astro).

---

## 🧪 Custom remark plugins

Extra markdown syntax bolted on via remark transforms in `scripts/`:

| Plugin                                              | Syntax / Purpose                                          |
| :-------------------------------------------------- | :-------------------------------------------------------- |
| [`remark-callout.mjs`](scripts/remark-callout.mjs) | GitHub-style `> [!NOTE]` blocks compile to `<Callout />` |
| [`remark-gallery.mjs`](scripts/remark-gallery.mjs) | Image galleries from special markdown blocks              |
| [`remark-sidenote.mjs`](scripts/remark-sidenote.mjs) | Tufte-style margin notes                                  |
| [`remark-table-wrap.mjs`](scripts/remark-table-wrap.mjs) | Wraps tables for horizontal scroll on mobile         |

Plus `rehype-katex` + `remark-math` for `$inline$` and `$$display$$` math (chapters opt in via `useKatex: true`).

---

## 🎨 Theming

Single source of truth: CSS variables in `src/layouts/Layout.astro`. No Tailwind, no CSS-in-JS.

| Token              | Light       | Dark        |
| :----------------- | :---------- | :---------- |
| `--bg`             | `#faf9f7`   | `#181818`   |
| `--fg`             | `#37352f`   | `#c8c4be`   |
| `--accent`         | `#4a7c96`   | `#8ab4cc`   |
| `--surface-soft`   | `#f5f3ef`   | `#1e1e1c`   |
| `--cat-gpu`        | `#3a8a6e`   | `#6dba98`   |
| `--cat-ml`         | `#c06a20`   | `#daa86a`   |
| `--cat-bio`        | `#7c6ab8`   | `#a89cd6`   |

Theme toggle persists to `localStorage`, applies via `data-theme` on `<html>`.

---

## 📁 Project structure

```
.
├── astro.config.mjs          # integrations, sitemap, remark/rehype
├── public/
│   ├── markdown.css          # prose styles (scoped to skip EC frames)
│   ├── katex.min.css         # math, lazy-loaded
│   └── fonts/                # Google Sans Code (variable woff2)
├── scripts/                  # custom remark plugins
└── src/
    ├── components/
    │   ├── ui/               # MDX building blocks (Callout, Tabs, …)
    │   ├── Search.astro      # Pagefind modal
    │   ├── Comments.astro    # Giscus widget
    │   └── Home.astro        # landing page renderer
    ├── content/
    │   ├── blog/             # *.md posts
    │   └── books/<book>/     # multi-chapter *.md / *.mdx
    ├── content.config.ts     # Zod schemas
    ├── layouts/Layout.astro  # global shell + theme tokens + head
    └── pages/
        ├── index.astro       # home
        ├── blog/[slug].astro
        └── book/[book]/[chapter].astro
```

---

## 🛠️ Commands

| Command         | Action                                                 |
| :-------------- | :----------------------------------------------------- |
| `pnpm dev`      | Dev server at `localhost:4321` (no Pagefind index)     |
| `pnpm build`    | Build to `dist/` and generate `dist/pagefind/` index   |
| `pnpm preview`  | Serve built site locally — search works here           |
| `pnpm astro …`  | Pass-through to Astro CLI (`add`, `check`, `info`, …)  |

---

## 🚢 Deploy

Anywhere static. The build output in `dist/` is fully self-contained.

- **GitHub Pages**: build → push `dist/` to `gh-pages`, or use `actions/deploy-pages`.
- **Vercel / Netlify / Cloudflare Pages**: build command `pnpm build`, output `dist/`.
- **Self-hosted**: `nginx` / `caddy` serving `dist/`. No Node runtime needed.

Set `SITE_URL` env var so canonical/sitemap URLs resolve (defaults to `http://localhost:4321`).

---

## 📜 License

MIT. See [`LICENSE`](LICENSE) if present, otherwise: do what you like, attribution appreciated.

---

<div align="center">

Built on the shoulders of [Astro](https://astro.build), [MDX](https://mdxjs.com), [Expressive Code](https://expressive-code.com), [Pagefind](https://pagefind.app), [KaTeX](https://katex.org), and [Giscus](https://giscus.app).

</div>
