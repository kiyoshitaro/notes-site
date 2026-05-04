const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function withBase(path: string): string {
  if (!path) return base || '/';
  if (/^[a-z]+:\/\//i.test(path) || path.startsWith('//') || path.startsWith('mailto:')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
