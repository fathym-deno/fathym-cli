/**
 * Ensure the provided branch name starts with the desired prefix.
 */
export function EnsureBranchPrefix(name: string, prefix: string): string {
  if (!prefix) {
    return name;
  }

  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (name.startsWith(normalizedPrefix)) {
    return name;
  }

  return `${normalizedPrefix}${name}`;
}
