/**
 * Client-Side Key Storage & Draft Encryption Engine
 *
 * Implements non-exportable browser key persistence via IndexedDB.
 * Modern browsers support structured cloning of CryptoKey objects in IndexedDB,
 * allowing private keys to persist across reloads without requiring key export.
 *
 * Also provides client-side local draft answer encryption (Level 4 DraftKey).
 */

const DB_NAME = "cns_exam_keystore";
const DB_VERSION = 1;
const STORE_DEVICE_KEYS = "device_keys";
const STORE_DRAFTS = "encrypted_drafts";
const DEVICE_KEY_ID = "active_device_keys";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_DEVICE_KEYS)) {
        db.createObjectStore(STORE_DEVICE_KEYS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "examId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface ClientDeviceKeys {
  ed25519Private: CryptoKey;
  ed25519Public: CryptoKey;
  ecdsaPrivate: CryptoKey;
  ecdsaPublic: CryptoKey;
}

/**
 * Persist WebCrypto device keys to IndexedDB using structured cloning.
 * Keys remain non-exportable.
 */
export async function saveDeviceKeys(keys: ClientDeviceKeys): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DEVICE_KEYS, "readwrite");
    const store = tx.objectStore(STORE_DEVICE_KEYS);
    const req = store.put({ id: DEVICE_KEY_ID, ...keys });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Load persisted device keys from IndexedDB.
 */
export async function loadDeviceKeys(): Promise<ClientDeviceKeys | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DEVICE_KEYS, "readonly");
      const store = tx.objectStore(STORE_DEVICE_KEYS);
      const req = store.get(DEVICE_KEY_ID);
      req.onsuccess = () => {
        const val = req.result;
        if (!val || !val.ed25519Private || !val.ecdsaPrivate) {
          resolve(null);
        } else {
          resolve({
            ed25519Private: val.ed25519Private,
            ed25519Public: val.ed25519Public,
            ecdsaPrivate: val.ecdsaPrivate,
            ecdsaPublic: val.ecdsaPublic,
          });
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to load keys from IndexedDB:", err);
    return null;
  }
}

/** Check if device keys are registered in this browser */
export async function hasDeviceKeys(): Promise<boolean> {
  const keys = await loadDeviceKeys();
  return keys !== null;
}

// ── Level 4: Client Draft Encryption ────────────────────────────────────────

const DRAFT_KEY_STORE_NAME = "cns_draft_kek";

async function getOrCreateDraftKey(examId: string): Promise<CryptoKey> {
  // Use a deterministic/session key or generate local non-exportable AES-GCM
  const keyName = `${DRAFT_KEY_STORE_NAME}_${examId}`;
  const rawKeyMaterial = sessionStorage.getItem(keyName);

  if (rawKeyMaterial) {
    const rawBuf = Uint8Array.from(atob(rawKeyMaterial), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
      "raw",
      rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // Generate fresh random 256-bit draft key
  const randomKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", randomKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  sessionStorage.setItem(keyName, b64);
  return randomKey;
}

/**
 * Encrypt and store local in-flight exam answers in IndexedDB.
 */
export async function saveEncryptedDraft(
  examId: string,
  answers: Record<string | number, string>
): Promise<void> {
  try {
    const draftKey = await getOrCreateDraftKey(examId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(answers));

    const ciphertextWithTag = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(examId) },
      draftKey,
      plaintext
    );

    const record = {
      examId,
      ivB64: btoa(String.fromCharCode(...iv)),
      dataB64: btoa(String.fromCharCode(...new Uint8Array(ciphertextWithTag))),
      savedAt: new Date().toISOString(),
    };

    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Failed to save encrypted draft:", err);
  }
}

/**
 * Retrieve and decrypt local draft answers from IndexedDB.
 */
export async function loadEncryptedDraft(
  examId: string
): Promise<Record<string, string> | null> {
  try {
    const db = await openDB();
    const record = await new Promise<{ examId: string; ivB64: string; dataB64: string } | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_DRAFTS, "readonly");
        const store = tx.objectStore(STORE_DRAFTS);
        const req = store.get(examId);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      }
    );

    if (!record) return null;

    const draftKey = await getOrCreateDraftKey(examId);
    const iv = Uint8Array.from(atob(record.ivB64), c => c.charCodeAt(0));
    const dataBuf = Uint8Array.from(atob(record.dataB64), c => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(examId) },
      draftKey,
      dataBuf.buffer.slice(dataBuf.byteOffset, dataBuf.byteOffset + dataBuf.byteLength)
    );

    const jsonStr = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn("Failed to load or decrypt draft:", err);
    return null;
  }
}

/** Remove draft after confirmed submission */
export async function clearEncryptedDraft(examId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.delete(examId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    sessionStorage.removeItem(`${DRAFT_KEY_STORE_NAME}_${examId}`);
  } catch (err) {
    console.warn("Failed to clear draft:", err);
  }
}
