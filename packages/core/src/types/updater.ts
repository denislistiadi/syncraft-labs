export type SyncListener<T> = (state: T) => void;
export type Unsubscribe = () => void;
export type DraftUpdater<T> = (draft: T) => void | T;
