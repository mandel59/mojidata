export type SqlRow = Record<string, unknown>;
export type SqlParams = unknown[] | Record<string, unknown>;
export interface SqlExecutor {
    query<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T[]>;
    queryOne<T extends SqlRow>(sql: string, params?: SqlParams): Promise<T | null>;
}
