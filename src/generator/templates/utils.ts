/**
 * Escape a description string for use in generated code
 */
export function escapeDescription(description: string): string {
  return description
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t'); // Escape tabs
}

const HIDE_FIELD_PATTERN = /@HideField\(\)|@TypeGraphQL\.omit\(output:\s*true\)/;

/**
 * Check if a field should be hidden from the GraphQL schema
 * based on its documentation containing @HideField() or @TypeGraphQL.omit(output: true)
 */
export function isHiddenField(documentation?: string): boolean {
  return documentation != null && HIDE_FIELD_PATTERN.test(documentation);
}
