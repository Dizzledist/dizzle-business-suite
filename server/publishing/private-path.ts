import { isAbsolute, resolve, sep } from 'node:path';
export function privatePublishingPath(directory: string) {
  const root = resolve('.'), target = resolve(directory);
  if (!isAbsolute(directory) || target.toLowerCase() === root.toLowerCase() || target.toLowerCase().startsWith((root + sep).toLowerCase())) throw new Error('Publishing data must use an absolute private directory outside the checkout/web root.');
  return target;
}
