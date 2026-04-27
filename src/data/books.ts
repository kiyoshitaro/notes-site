export interface BookStageConfig {
  title: string;
  chapters: string[];
}

export interface BookConfig {
  id: string;
  title: string;
  description: string;
  shortDescription?: string;
  stages: BookStageConfig[];
}

export const BOOKS: Record<string, BookConfig> = {
  'getting-started': {
    id: 'getting-started',
    title: 'Getting Started with Books',
    description: 'A comprehensive guide on how to use the book feature, including markdown syntax, frontmatter structure, and best practices for organizing content.',
    shortDescription: 'Learn how to create and organize books in this Astro blog.',
    stages: [
      {
        title: 'Part 1 — Basics',
        chapters: ['01-introduction'],
      },
      {
        title: 'Part 2 — Advanced Features',
        chapters: ['02-advanced'],
      },
      {
        title: 'Part 3 — Wrapping Up',
        chapters: ['03-conclusion'],
      },
    ],
  },
};

export const getBookConfig = (bookId: string) => BOOKS[bookId];

export const getBookConfigs = () => Object.values(BOOKS);

export const getOrderedChapterSlugs = (book: BookConfig) =>
  book.stages.flatMap((stage) => stage.chapters);
