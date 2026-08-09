export type StoredImageAsset = {
  filename: string;
  blob: Blob;
  width: number;
  height: number;
};

export type StoredBodyImageAsset = StoredImageAsset & {
  alt: string;
};

export type StoredDraftAssets = {
  draftId: string;
  cover: StoredImageAsset[];
  body: StoredBodyImageAsset[];
};

const databaseName = "omniblog-studio";
const databaseVersion = 1;
const workspaceStore = "workspace";
const assetsStore = "assets";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(workspaceStore)) database.createObjectStore(workspaceStore);
      if (!database.objectStoreNames.contains(assetsStore)) database.createObjectStore(assetsStore, { keyPath: "draftId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开写作台存储。"));
    request.onblocked = () => reject(new Error("写作台存储正在被其他标签页占用。"));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("浏览器存储操作失败。"));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("浏览器存储事务失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("浏览器存储事务已取消。"));
  });
}

export async function readStudioState<T>() {
  const database = await openDatabase();
  const transaction = database.transaction(workspaceStore, "readonly");
  return requestResult(transaction.objectStore(workspaceStore).get("state")) as Promise<T | undefined>;
}

export async function writeStudioState<T>(state: T) {
  const database = await openDatabase();
  const transaction = database.transaction(workspaceStore, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(workspaceStore).put(state, "state");
  await completion;
}

export async function readStudioAssets(draftId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(assetsStore, "readonly");
  return requestResult(transaction.objectStore(assetsStore).get(draftId)) as Promise<StoredDraftAssets | undefined>;
}

export async function readAllStudioAssets() {
  const database = await openDatabase();
  const transaction = database.transaction(assetsStore, "readonly");
  return requestResult(transaction.objectStore(assetsStore).getAll()) as Promise<StoredDraftAssets[]>;
}

export async function writeStudioAssets(assets: StoredDraftAssets) {
  const database = await openDatabase();
  const transaction = database.transaction(assetsStore, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(assetsStore).put(assets);
  await completion;
}

export async function deleteStudioAssets(draftId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(assetsStore, "readwrite");
  const completion = transactionComplete(transaction);
  transaction.objectStore(assetsStore).delete(draftId);
  await completion;
}

export async function replaceStudioWorkspace<T>(state: T, assets: StoredDraftAssets[]) {
  const database = await openDatabase();
  const transaction = database.transaction([workspaceStore, assetsStore], "readwrite");
  const completion = transactionComplete(transaction);
  const workspace = transaction.objectStore(workspaceStore);
  const storedAssets = transaction.objectStore(assetsStore);
  workspace.clear();
  storedAssets.clear();
  workspace.put(state, "state");
  assets.forEach((record) => storedAssets.put(record));
  await completion;
}
