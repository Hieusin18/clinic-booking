/** Địa chỉ của màn hình hiện tại: đường dẫn + tham số không nằm trong đường dẫn (vd. ?day=2). */
export function currentPath(pathname: string, params: Record<string, string | string[] | undefined>): string {
  const segments = new Set(pathname.split('/').filter(Boolean));
  const query = Object.entries(params)
    .filter(([, v]) => typeof v === 'string' && !segments.has(v))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');
  return query ? `${pathname}?${query}` : pathname;
}
