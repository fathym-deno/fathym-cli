/**
 * Normalize a branch name the same way our legacy CLI helpers did.
 */
export function NormalizeBranchInput(value?: string): string {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9/_\-.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .toLowerCase();
}
