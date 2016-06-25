export interface ReadonlyCollection<T> extends ReadonlyArray<T>, Iterable<T> {
}

export interface ReadonlySet<T> extends Iterable<T> {
    readonly size: number;
    has(value: T): boolean;
    keys(): IterableIterator<T>;
    values(): IterableIterator<T>;
    entries(): IterableIterator<[T, T]>;
}

export interface ReadonlyMap<K, V> extends Iterable<[K, V]> {
    readonly size: number;
    has(key: K): boolean;
    get(key: K): V | undefined;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[K, V]>;
}