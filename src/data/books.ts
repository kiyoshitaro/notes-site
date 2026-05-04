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
  'hpc': {
    id: 'hpc',
    title: 'High-Performance Computing — Notes',
    description: 'Performance Engineering notes: complexity models, computer architecture, ILP, compilation, profiling, arithmetic, memory hierarchy, caches, and SIMD.',
    shortDescription: 'Performance Engineering notes',
    stages: [
      {
        title: 'Complexity Models',
        chapters: ['01-modern-hardware', '02-programming-languages'],
      },
      {
        title: 'Computer Architecture',
        chapters: ['03-instruction-set-architectures', '04-assembly-language', '05-loops-and-conditionals', '06-functions-va-recursion', '07-indirect-branching', '08-dynamic-dispatch', '09-machine-code-layout'],
      },
      {
        title: 'Instruction-Level Parallelism',
        chapters: ['10-pipeline-hazards', '11-the-cost-of-branching', '12-branchless-programming', '13-instruction-tables', '14-throughput-computing'],
      },
      {
        title: 'Compilation',
        chapters: ['15-stages-of-compilation', '16-flags-and-targets', '17-situational-optimizations', '18-contract-programming', '19-precomputation'],
      },
      {
        title: 'Profiling',
        chapters: ['20-instrumentation', '21-statistical-profiling'],
      },
      {
        title: 'Arithmetic',
        chapters: ['22-floating-point-numbers', '23-ieee-754-floats'],
      },
      {
        title: 'External Memory',
        chapters: ['24-memory-hierarchy', '25-virtual-memory', '26-external-sorting', '27-list-ranking', '28-eviction-policies', '29-cache-oblivious-algorithms', '30-spatial-and-temporal-locality'],
      },
      {
        title: 'RAM & CPU Caches',
        chapters: ['31-memory-bandwidth', '32-memory-latency', '33-cache-lines', '34-memory-sharing', '35-memory-level-parallelism', '36-alignment-and-packing', '37-cache-associativity', '38-memory-paging', '39-aos-and-soa'],
      },
      {
        title: 'SIMD Parallelism',
        chapters: ['40-intrinsics-and-vector-types'],
      },
    ],
  },
};

export const getBookConfig = (bookId: string) => BOOKS[bookId];

export const getBookConfigs = () => Object.values(BOOKS);

export const getOrderedChapterSlugs = (book: BookConfig) =>
  book.stages.flatMap((stage) => stage.chapters);
