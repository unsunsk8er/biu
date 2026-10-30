import type { Track } from '@/types'
import { toHttpsUrl, type VideoDetail } from '@/services/bilibiliApi'

/**
 * Turn every Bilibili video page into a normal Track. Multi-P IDs include the
 * page number so queue entries, likes, history and the audio cache never
 * collapse P1/P2/... into the same song.
 */
export function videoPageTracks(detail: VideoDetail): Track[] {
  const pages = detail.pages?.length
    ? detail.pages
    : [{ page: 1, cid: detail.cid, part: detail.title, duration: detail.duration }]
  const multiPage = pages.length > 1
  const coverUrl = toHttpsUrl(detail.pic)

  return pages.map(page => ({
    id: multiPage ? `${detail.bvid}:p${page.page}` : detail.bvid,
    title: multiPage ? `P${page.page} · ${page.part || detail.title}` : detail.title,
    artist: detail.owner.name,
    coverUrl,
    duration: page.duration || detail.duration,
    videoUrl: multiPage
      ? `https://www.bilibili.com/video/${detail.bvid}?p=${page.page}`
      : `https://www.bilibili.com/video/${detail.bvid}`,
    bvid: detail.bvid,
    aid: detail.aid,
    cid: page.cid,
    page: multiPage ? page.page : undefined,
    partTitle: page.part,
    videoTitle: detail.title,
    playCount: detail.stat?.view || 0,
    isLiked: false,
  }))
}
