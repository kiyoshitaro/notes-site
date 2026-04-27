---
title: "Chapter 3: Conclusion"
pubDate: "2025-04-27"
published: true
description: "Wrap-up and checklist for creating your own books using this boilerplate template."
useKatex: false
---

# Chapter 3: Conclusion

Welcome to the final chapter! Let's wrap things up.

## Summary

In this book, you've learned:

1. How to structure book content
2. Frontmatter requirements
3. Available markdown features
4. How to configure reading order

## What's next?

To create your own book:

1. Add a new entry in `src/data/books.ts`
2. Create a folder in `src/content/books/your-book-id/`
3. Add markdown files (01-chapter-name.md, 02-chapter-name.md, etc.)
4. Make sure each file has proper frontmatter

## Template frontmatter

Every chapter needs this frontmatter:

```yaml
---
title: "Chapter Title"
pubDate: 2025-04-27
published: true
description: "Brief description of this chapter"
---
```

## Additional resources

- Check the [project README](../README.md) for more details
- Review existing books for patterns
- See `src/data/books.ts` for configuration examples

---

**The end!** 🎉
