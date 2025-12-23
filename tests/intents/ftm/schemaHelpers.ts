// deno-lint-ignore-file no-explicit-any
import { z } from "zod";

export interface ArgMeta {
  name: string;
  description?: string;
}

export interface FlagMeta {
  name: string;
  description?: string;
}

/**
 * Unwraps a Zod schema to find meta with argName.
 * Handles optional/nullable wrappers where meta is on the inner type.
 */
function findArgNameMeta(item: any): any {
  // Check outer meta first
  const outerMeta = typeof item.meta === "function"
    ? item.meta()
    : item._def?.meta;
  if (outerMeta?.argName) return outerMeta;

  // Check inner type (for optional/nullable wrappers)
  const inner = item._def?.innerType;
  if (inner) {
    const innerMeta = typeof inner.meta === "function"
      ? inner.meta()
      : inner._def?.meta;
    if (innerMeta?.argName) return innerMeta;

    // Go one level deeper if needed
    const innerInner = inner._def?.innerType;
    if (innerInner) {
      const deepMeta = typeof innerInner.meta === "function"
        ? innerInner.meta()
        : innerInner._def?.meta;
      if (deepMeta?.argName) return deepMeta;
    }
  }

  return outerMeta || {};
}

/**
 * Extracts argument metadata from a Zod tuple schema.
 * Handles both custom argName from .meta({ argName }) and default arg1, arg2, etc.
 * Supports Zod 4 (meta() method) and older versions (_def.meta property).
 */
export function extractArgMeta(schema: z.ZodTuple<any>): ArgMeta[] {
  return (schema as any)._def.items.map((item: any, i: number) => {
    // Find meta with argName, unwrapping optional/nullable wrappers
    const meta = findArgNameMeta(item);
    const argName = meta?.argName ?? `arg${i + 1}`;
    // Zod 4: description is a direct property, fallback to _def for older versions
    const desc = item.description ?? item._def?.description;
    return {
      name: argName,
      description: desc,
    };
  });
}

/**
 * Extracts flag metadata from a Zod object schema.
 * Handles both custom flagName from .meta({ flagName }) and default key names.
 * Supports Zod 4 (meta() method) and older versions (_def.meta property).
 */
export function extractFlagMeta(schema: z.ZodObject<any>): FlagMeta[] {
  const shape = schema.shape;
  return Object.entries(shape).map(([key, field]: [string, any]) => {
    // Zod 4: meta is accessed via .meta() method, fallback to _def.meta for older versions
    const meta = typeof field.meta === "function"
      ? field.meta()
      : field._def?.meta;
    const displayName = meta?.flagName ?? key;
    // Zod 4: description is a direct property, fallback to _def for older versions
    const desc = field.description ?? field._def?.description;
    return {
      name: displayName,
      description: desc,
    };
  });
}

/**
 * Formats an argument for help output display.
 * Example: "<name> - Name to greet"
 */
export function formatArgHelpLine(arg: ArgMeta): string {
  return `<${arg.name}>${arg.description ? ` - ${arg.description}` : ""}`;
}

/**
 * Formats a flag for help output display.
 * Example: "--loud - Shout the greeting"
 */
export function formatFlagHelpLine(flag: FlagMeta): string {
  return `--${flag.name}${flag.description ? ` - ${flag.description}` : ""}`;
}
