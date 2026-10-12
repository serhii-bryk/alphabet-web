export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export function hasErrorCode(body: unknown, code: string): boolean {
  return (
    isRecord(body) &&
    isRecord(body.error) &&
    body.error.code === code &&
    typeof body.error.message === 'string'
  );
}
