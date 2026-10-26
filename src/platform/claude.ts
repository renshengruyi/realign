// The slice of the claude.ai runtime this app uses. Capabilities arrive through
// `window.claude.use(name)`, which resolves null wherever a view cannot run them.

export type Unsub = () => void;

export interface DbError {
  code: string;
  message: string;
}

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata?: { fromCache: boolean; hasPendingWrites: boolean };
}

export interface QuerySnap {
  docs: DocSnap[];
  size: number;
  empty: boolean;
}

export interface DocRef {
  id: string;
  path: string;
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (s: DocSnap) => void, error?: (e: DbError) => void): Unsub;
}

export interface QueryRef {
  where(field: string, op: string, value: unknown): QueryRef;
  orderBy(field: string, dir?: 'asc' | 'desc'): QueryRef;
  limit(n: number): QueryRef;
  get(): Promise<QuerySnap>;
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: DbError) => void): Unsub;
}

export interface CollRef extends QueryRef {
  path: string;
  doc(id?: string): DocRef;
  add(data: Record<string, unknown>): Promise<DocRef>;
}

export interface DbLike {
  doc(path: string): DocRef;
  collection(path: string): CollRef;
}

export type ModelTier = 'default' | 'complex' | 'quick';

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>, ctx: { signal: AbortSignal }): unknown;
}

export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  tools?: SampleTool[];
  images?: Blob | Blob[];
  modelTier?: ModelTier;
  cache?: boolean | { gcTime?: number; refresh?: boolean };
}

export type SampleInput = string | { role: 'user' | 'assistant'; content: string }[];

export interface SampleLimits {
  maxPromptBytes: number;
  images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] };
  tools?: { maxCount: number };
}

export interface SampleFn {
  (input: SampleInput, opts?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: SampleInput, opts?: SampleOptions): Promise<T>;
  limits(): Promise<SampleLimits>;
}

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

export interface Assets {
  upload(blob: Blob, opts?: { type?: string }): Promise<{ id: string; url: string; sizeBytes: number; contentType: string }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
}

export interface Downloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

function runtime(): ClaudeRuntime | undefined {
  const c = (globalThis as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : undefined;
}

export async function useCapability<T>(name: string): Promise<T | null> {
  const rt = runtime();
  if (!rt) return null;
  try {
    return ((await rt.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}

export function hasRuntime(): boolean {
  return !!runtime();
}

export function errorCode(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
    return (e as { code: string }).code;
  }
  return 'unknown';
}
