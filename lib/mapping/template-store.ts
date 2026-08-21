/**
 * Remembering the template between sessions.
 *
 * The template is the same every time, so re-picking it every session is
 * friction with no benefit. Two things make it safe to keep:
 *
 * 1. **Keep a blank copy, not the original.** The office form arrives with a
 *    real person's real data in it. `sanitise.ts` produces a copy with the
 *    values replaced by field names and nothing else changed; that is what
 *    belongs on the device. Remembering is offered, never automatic, and the
 *    UI says which document it is holding.
 *
 * 2. **IndexedDB, not local storage.** Local storage holds strings, so a 5 MB
 *    docx would have to be base64'd to about 7 MB and would not fit in the
 *    quota. IndexedDB stores the bytes as bytes.
 *
 * Still nothing leaves the device: this is the same machine, the same browser,
 * one page load later.
 *
 * The cost, which the UI states rather than hides: a remembered template never
 * changes. If the office reissues the form you would keep filling last year's
 * one, and the drift check cannot save you because the remembered document is
 * exactly what it was fingerprinted against. So the date it was remembered is
 * always on screen, and replacing it is one click.
 */

const DB_NAME = 'isi-surat'
const DB_VERSION = 1
const STORE = 'templates'
const KEY = 'current'

export type RememberedTemplate = {
  readonly fileName: string
  readonly bytes: Uint8Array
  /** ISO timestamp, supplied by the caller — this module has no clock. */
  readonly rememberedAt: string
}

/** Null whenever IndexedDB is unavailable: a private window, or storage denied. */
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    // Denied, or blocked by another tab mid-upgrade. Not remembering is a
    // working state, so this resolves rather than rejects.
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (db === null) {
          resolve(null)
          return
        }
        try {
          const request = run(db.transaction(STORE, mode).objectStore(STORE))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

export async function loadRememberedTemplate(): Promise<RememberedTemplate | null> {
  const stored = await transact<unknown>('readonly', (store) => store.get(KEY))
  return asRemembered(stored)
}

export async function rememberTemplate(template: RememberedTemplate): Promise<void> {
  await transact('readwrite', (store) =>
    store.put(
      {
        fileName: template.fileName,
        // Copied out of any larger buffer it may be a view onto, so what is
        // stored is this document and nothing adjacent to it.
        bytes: template.bytes.slice(),
        rememberedAt: template.rememberedAt,
      },
      KEY,
    ),
  )
}

export async function forgetTemplate(): Promise<void> {
  await transact('readwrite', (store) => store.delete(KEY))
}

/**
 * What comes back out is untrusted, exactly as it is in `storage.ts`. A
 * half-believed template is a document nobody chose.
 */
function asRemembered(value: unknown): RememberedTemplate | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const fileName = record['fileName']
  const bytes = record['bytes']
  const rememberedAt = record['rememberedAt']
  if (typeof fileName !== 'string') return null
  if (typeof rememberedAt !== 'string') return null
  if (bytes instanceof Uint8Array) return { fileName, bytes, rememberedAt }
  if (bytes instanceof ArrayBuffer) return { fileName, bytes: new Uint8Array(bytes), rememberedAt }
  return null
}
