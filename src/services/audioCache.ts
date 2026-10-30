/**
 * Android/WebView offline audio store.
 *
 * The auto-cache path fetches the resolved audio stream once and stores the
 * Blob in IndexedDB. Later plays use a blob: URL, so a long pause / expired
 * Bilibili signature cannot prevent playback. Manual downloads share this
 * store and are exposed by the Downloads page.
 */
import type { Track } from '@/types'

const DB_NAME = 'biu_audio_cache_v1'
const DB_VERSION = 1
const META_STORE = 'meta'
const BLOB_STORE = 'blobs'
export const AUDIO_CACHE_CHANGED_EVENT = 'biu-audio-cache-changed'

export interface CachedAudioItem {
  /** Storage key. Single-P tracks use bvid; multi-P tracks use bvid:pN. */
  bvid: string
  /** Original video bvid (kept for rebuilding a playable Track). */
  videoBvid?: string
  page?: number
  cid?: string | number
  partTitle?: string
  videoTitle?: string
  title: string
  artist: string
  coverUrl: string
  size: number
  cachedAt: number
}

/** Cache key shared by playback, auto-cache and downloads. */
export function audioCacheKey(track: Pick<Track, 'bvid' | 'id' | 'page'>): string {
  const base = String(track.bvid || track.id || '').trim()
  return track.page ? `${base}:p${track.page}` : base
}

interface CachedAudioRecord extends CachedAudioItem {
  blob: Blob
}

let dbPromise: Promise<IDBDatabase> | null = null
const pending = new Map<string, Promise<CachedAudioItem>>()

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'bvid' })
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开音频缓存'))
  })
  return dbPromise
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('音频缓存写入失败'))
    transaction.onabort = () => reject(transaction.error || new Error('音频缓存写入被取消'))
  })
}

function getStore(db: IDBDatabase, store: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store)
}

async function readItem(bvid: string): Promise<CachedAudioItem | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = getStore(db, META_STORE, 'readonly').get(bvid)
    request.onsuccess = () => resolve((request.result as CachedAudioItem | undefined) || null)
    request.onerror = () => reject(request.error)
  })
}

async function readBlob(bvid: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = getStore(db, BLOB_STORE, 'readonly').get(bvid)
    request.onsuccess = () => resolve((request.result as Blob | undefined) || null)
    request.onerror = () => reject(request.error)
  })
}

export async function getCachedAudioItem(bvid: string): Promise<CachedAudioItem | null> {
  if (!bvid) return null
  try { return await readItem(bvid) } catch { return null }
}

export async function getCachedAudioBlob(bvid: string): Promise<Blob | null> {
  if (!bvid) return null
  try {
    const meta = await readItem(bvid)
    if (!meta) return null
    return await readBlob(bvid)
  } catch {
    return null
  }
}

export async function listCachedAudio(): Promise<CachedAudioItem[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = getStore(db, META_STORE, 'readonly').getAll()
    request.onsuccess = () => resolve(
      (request.result as CachedAudioItem[]).sort((a, b) => b.cachedAt - a.cachedAt),
    )
    request.onerror = () => reject(request.error)
  })
}

export async function deleteCachedAudios(bvids: string[]): Promise<void> {
  const unique = Array.from(new Set(bvids.filter(Boolean)))
  if (unique.length === 0) return
  const db = await openDb()
  const transaction = db.transaction([META_STORE, BLOB_STORE], 'readwrite')
  const metaStore = transaction.objectStore(META_STORE)
  const blobStore = transaction.objectStore(BLOB_STORE)
  for (const bvid of unique) {
    metaStore.delete(bvid)
    blobStore.delete(bvid)
  }
  await transactionDone(transaction)
  window.dispatchEvent(new CustomEvent(AUDIO_CACHE_CHANGED_EVENT))
}

export async function deleteCachedAudio(bvid: string): Promise<void> {
  await deleteCachedAudios([bvid])
}

export function cacheAudioForTrack(track: Track, url: string): Promise<CachedAudioItem> {
  const videoBvid = String(track.bvid || track.id || '').trim()
  const cacheKey = audioCacheKey(track)
  if (!videoBvid || !cacheKey) return Promise.reject(new Error('歌曲缺少 bvid'))
  if (!url || url.startsWith('blob:')) return Promise.reject(new Error('音频地址不可缓存'))
  const running = pending.get(cacheKey)
  if (running) return running

  const task = (async (): Promise<CachedAudioItem> => {
    const existing = await readItem(cacheKey)
    if (existing) return existing
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error(`音频下载失败（${response.status}）`)
    const blob = await response.blob()
    if (!blob.size) throw new Error('音频文件为空')
    const record: CachedAudioRecord = {
      bvid: cacheKey,
      videoBvid,
      page: track.page,
      cid: track.cid,
      partTitle: track.partTitle,
      videoTitle: track.videoTitle,
      title: track.title || '未命名歌曲',
      artist: track.artist || 'Bilibili 用户',
      coverUrl: track.coverUrl || '',
      size: blob.size,
      cachedAt: Date.now(),
      blob,
    }
    const db = await openDb()
    const transaction = db.transaction([META_STORE, BLOB_STORE], 'readwrite')
    const { blob: _blob, ...meta } = record
    transaction.objectStore(META_STORE).put(meta)
    transaction.objectStore(BLOB_STORE).put(blob, cacheKey)
    await transactionDone(transaction)
    window.dispatchEvent(new CustomEvent(AUDIO_CACHE_CHANGED_EVENT, { detail: meta }))
    return meta
  })().finally(() => pending.delete(cacheKey))

  pending.set(cacheKey, task)
  return task
}

export function formatAudioSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
