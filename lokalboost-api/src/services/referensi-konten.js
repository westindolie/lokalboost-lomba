/**
 * Referensi konten untuk kampanye: UMKM menempel tautan video TikTok,
 * Instagram, atau YouTube yang gayanya ingin ditiru, lalu brief disusun dari
 * isi video itu (lihat `buatBriefDariReferensi` di services/ai.js).
 *
 * Sumber data, dicoba berurutan:
 *   1. ScrapeCreators (bila SCRAPECREATORS_API_KEY ada): keterangan, tagar,
 *      views, durasi, dan transkrip TikTok. 1 kredit per tautan.
 *   2. oEmbed resmi TikTok dan YouTube: gratis, tapi hanya judul/keterangan
 *      dan nama akun. Instagram tidak punya oEmbed publik (butuh token Meta),
 *      jadi tanpa ScrapeCreators tautan Instagram disimpan tanpa isi.
 *
 * Bentuk respons diuji ke penyedia asli 17 Okt 2026:
 *   - TikTok `/v2/tiktok/video`: `aweme_detail.desc`, `.statistics.play_count`,
 *     `.video.duration` dalam MILIDETIK, `.text_extra[].hashtag_name`, dan
 *     `transcript` di akar (null bila video tanpa suara).
 *   - Instagram `/v1/instagram/post`: `data.xdt_shortcode_media`, views di
 *     `video_play_count` (BUKAN `video_view_count`), like di
 *     `edge_media_preview_like.count`, durasi dalam detik.
 *   - YouTube `/v1/youtube/video`: `title`, `description`, `viewCountInt`,
 *     `durationMs`, `keywords`, `channel.handle`.
 *
 * Satu tautan yang gagal dibaca tidak menggagalkan yang lain: hasilnya
 * ditandai `terbaca: false` dan tautannya tetap boleh disimpan.
 */
import { galat400 } from '../lib/util.js'
import { cekProfilAktif, panggilPenyedia } from './profil-sosial.js'

export const MAKS_REFERENSI = 3

const POLA_ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
const POLA_KODE_IG = /^[A-Za-z0-9_-]{5,40}$/
const JALUR_IG_KONTEN = new Set(['p', 'reel', 'reels', 'tv'])

const PESAN_BUKAN_KONTEN =
  'Tempel tautan satu video atau postingan, bukan tautan profil. Contoh: https://www.tiktok.com/@akun/video/123...'

/**
 * Tautan konten -> { platform, url } dengan url kanonik. Melempar 400 dengan
 * pesan yang bisa langsung dibaca pemilik usaha.
 */
export function uraiTautanKonten(masukan) {
  const teks = String(masukan || '').trim()
  if (teks.length > 500) throw galat400('Tautan referensi terlalu panjang.')
  let uri
  try {
    uri = new URL(/^https?:\/\//i.test(teks) ? teks : `https://${teks}`)
  } catch {
    throw galat400('Tautan referensi tidak sah. Salin tautan dari tombol Bagikan di aplikasinya.')
  }
  if (!['http:', 'https:'].includes(uri.protocol)) throw galat400('Tautan referensi harus http atau https.')

  const host = uri.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const segmen = uri.pathname.split('/').filter(Boolean)

  // Tautan pendek dari tombol Bagikan di aplikasi TikTok. Tidak dibuka di
  // sini (itu permintaan jaringan ke tujuan yang dipilih pengguna), penyedia
  // yang menguraikannya.
  if (host === 'vt.tiktok.com' || host === 'vm.tiktok.com') {
    if (!/^[A-Za-z0-9]{5,20}$/.test(segmen[0] || '')) throw galat400('Tautan pendek TikTok tidak lengkap.')
    return { platform: 'tiktok', url: `https://${host}/${segmen[0]}/` }
  }
  if (host === 'tiktok.com') {
    const akun = segmen[0] || ''
    const jenis = segmen[1]
    const id = segmen[2] || ''
    if (akun.startsWith('@') && (jenis === 'video' || jenis === 'photo') && /^\d{8,25}$/.test(id)) {
      return { platform: 'tiktok', url: `https://www.tiktok.com/${akun}/${jenis}/${id}` }
    }
    throw galat400(PESAN_BUKAN_KONTEN)
  }

  if (host === 'instagram.com') {
    const [jenis, kode] = segmen
    if (JALUR_IG_KONTEN.has(jenis) && POLA_KODE_IG.test(kode || '')) {
      return { platform: 'instagram', url: `https://www.instagram.com/${jenis === 'reels' ? 'reel' : jenis}/${kode}/` }
    }
    throw galat400(PESAN_BUKAN_KONTEN)
  }

  let idYoutube = ''
  if (host === 'youtu.be') idYoutube = segmen[0] || ''
  else if (host === 'youtube.com') {
    if (segmen[0] === 'watch') idYoutube = uri.searchParams.get('v') || ''
    else if (segmen[0] === 'shorts' || segmen[0] === 'live') idYoutube = segmen[1] || ''
  }
  if (host === 'youtu.be' || host === 'youtube.com') {
    if (!POLA_ID_YOUTUBE.test(idYoutube)) throw galat400(PESAN_BUKAN_KONTEN)
    return { platform: 'youtube', url: `https://www.youtube.com/watch?v=${idYoutube}` }
  }

  throw galat400('Referensi konten saat ini mendukung TikTok, Instagram, dan YouTube.')
}

// null tetap null: Number(null) = 0 akan mengubah "disembunyikan" jadi "nol".
const angka = (n) => (n != null && Number.isFinite(Number(n)) ? Number(n) : null)
const potong = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const tagarDari = (teks) => [...String(teks || '').matchAll(/#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[1].toLowerCase())
const unik = (daftar) => [...new Set(daftar.filter(Boolean))].slice(0, 10)

/** Bentuk seragam satu referensi. Semua field selain platform/url boleh kosong. */
function bentuk(dasar, isi = {}) {
  return {
    platform: dasar.platform,
    url: dasar.url,
    terbaca: Boolean(isi.terbaca),
    sumberData: isi.sumberData || null,
    judul: potong(isi.judul, 200) || null,
    penulis: potong(isi.penulis, 100) || null,
    keterangan: potong(isi.keterangan, 600) || null,
    tagar: unik(isi.tagar || []),
    views: angka(isi.views),
    suka: angka(isi.suka),
    komentar: angka(isi.komentar),
    durasiDetik: isi.durasiDetik ? Math.round(isi.durasiDetik) : null,
    transkrip: potong(isi.transkrip, 1500) || null,
    // Dipakai setor tautan video kreator (services/video-tautan.js): id unik
    // di platform (tautan pendek & panjang ke video yang sama) dan waktu unggah.
    idKonten: isi.idKonten ? String(isi.idKonten) : null,
    diunggahPada: Number(isi.diunggahPada) > 0 ? Number(isi.diunggahPada) : null,
    catatan: isi.catatan || null,
  }
}

async function lewatScrapeCreators({ platform, url }, { transkrip = true } = {}) {
  if (platform === 'tiktok') {
    const d = await panggilPenyedia('/v2/tiktok/video', transkrip ? { url, get_transcript: 'true' } : { url })
    const a = d?.aweme_detail
    if (!a) return null
    return {
      terbaca: true,
      sumberData: 'scrapecreators',
      judul: a.desc,
      penulis: a.author?.unique_id ? `@${a.author.unique_id}` : a.author?.nickname,
      keterangan: a.desc,
      tagar: [...(a.text_extra || []).map((t) => t.hashtag_name?.toLowerCase()), ...tagarDari(a.desc)],
      views: a.statistics?.play_count,
      suka: a.statistics?.digg_count,
      komentar: a.statistics?.comment_count,
      durasiDetik: a.video?.duration ? a.video.duration / 1000 : null,
      transkrip: typeof d.transcript === 'string' ? d.transcript.replace(/^WEBVTT\s*/i, '') : null,
      idKonten: a.aweme_id,
      diunggahPada: a.create_time,
    }
  }
  if (platform === 'instagram') {
    const d = await panggilPenyedia('/v1/instagram/post', { url })
    const m = d?.data?.xdt_shortcode_media
    if (!m) return null
    const keterangan = m.edge_media_to_caption?.edges?.[0]?.node?.text || ''
    return {
      terbaca: true,
      sumberData: 'scrapecreators',
      judul: keterangan,
      penulis: m.owner?.username ? `@${m.owner.username}` : null,
      keterangan,
      tagar: tagarDari(keterangan),
      views: m.is_video ? m.video_play_count ?? m.video_view_count : null,
      // Akun yang menyembunyikan like tetap melaporkan angka 0.
      suka: m.like_and_view_counts_disabled ? null : m.edge_media_preview_like?.count,
      komentar: m.edge_media_to_parent_comment?.count ?? m.comment_count,
      durasiDetik: m.video_duration,
      idKonten: m.shortcode,
      diunggahPada: m.taken_at_timestamp,
    }
  }
  const d = await panggilPenyedia('/v1/youtube/video', { url })
  if (!d?.title) return null
  return {
    terbaca: true,
    sumberData: 'scrapecreators',
    judul: d.title,
    penulis: d.channel?.handle ? `@${d.channel.handle}` : d.channel?.title,
    keterangan: d.description,
    tagar: [...tagarDari(`${d.title} ${d.description}`), ...(d.keywords || []).slice(0, 5).map((k) => String(k).toLowerCase())],
    views: d.viewCountInt,
    suka: d.likeCountInt,
    komentar: d.commentCountInt,
    durasiDetik: d.durationMs ? d.durationMs / 1000 : null,
    idKonten: d.id,
    diunggahPada: d.publishDate ? Math.floor(Date.parse(d.publishDate) / 1000) || null : null,
  }
}

/** oEmbed resmi: gratis, tanpa kunci, hanya TikTok dan YouTube. */
async function lewatOembed({ platform, url }) {
  if (platform === 'instagram') return null
  const titik =
    platform === 'tiktok'
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), 8000)
  try {
    const jawab = await fetch(titik, { signal: kendali.signal })
    if (!jawab.ok) return null
    const d = await jawab.json()
    if (!d?.title && !d?.author_name) return null
    return {
      terbaca: true,
      sumberData: 'oembed',
      judul: d.title,
      penulis: d.author_name,
      keterangan: d.title,
      tagar: tagarDari(d.title),
    }
  } catch {
    return null
  } finally {
    clearTimeout(jam)
  }
}

/** Baca satu tautan. Tidak pernah melempar karena penyedia; hanya karena tautan tidak sah. */
export async function ambilReferensi(tautan, opsi = {}) {
  const dasar = uraiTautanKonten(tautan)
  let isi = null
  if (cekProfilAktif()) {
    try {
      isi = await lewatScrapeCreators(dasar, opsi)
    } catch (e) {
      console.warn(`[referensi] ScrapeCreators gagal untuk ${dasar.platform}: ${e.message}`)
    }
  }
  if (!isi) isi = await lewatOembed(dasar)
  if (!isi) {
    return bentuk(dasar, {
      catatan:
        dasar.platform === 'instagram' && !cekProfilAktif()
          ? 'Isi postingan Instagram belum bisa dibaca di server ini. Tautannya tetap disimpan untuk kreator.'
          : 'Isi video tidak bisa dibaca (mungkin privat atau sudah dihapus). Tautannya tetap disimpan untuk kreator.',
    })
  }
  return bentuk(dasar, isi)
}

/** Baca beberapa tautan sekaligus; duplikat dibuang. */
export async function ambilBanyakReferensi(daftarTautan) {
  if (!Array.isArray(daftarTautan) || !daftarTautan.length) {
    throw galat400('Tempel minimal satu tautan referensi.')
  }
  if (daftarTautan.length > MAKS_REFERENSI) {
    throw galat400(`Maksimal ${MAKS_REFERENSI} tautan referensi per kampanye.`)
  }
  // Urai semua dulu, supaya tautan yang salah ditolak sebelum kredit terpakai.
  const terurai = daftarTautan.map((t) => uraiTautanKonten(t))
  const unikUrl = [...new Map(terurai.map((t) => [t.url, t])).values()]
  return Promise.all(unikUrl.map((t) => ambilReferensi(t.url)))
}

/**
 * Referensi yang disimpan bersama kampanye. Hanya tautan + judul + penulis:
 * angka dan gambar dari CDN cepat basi (tautan gambar TikTok kedaluwarsa),
 * dan isi dari klien tidak boleh dipercaya lebih dari itu.
 */
export function rapikanReferensiSimpan(daftar) {
  if (daftar == null) return []
  if (!Array.isArray(daftar)) throw galat400('Format referensi tidak sah.')
  if (daftar.length > MAKS_REFERENSI) throw galat400(`Maksimal ${MAKS_REFERENSI} tautan referensi per kampanye.`)
  const hasil = new Map()
  for (const r of daftar) {
    const { platform, url } = uraiTautanKonten(typeof r === 'string' ? r : r?.url)
    hasil.set(url, {
      platform,
      url,
      judul: typeof r === 'object' ? potong(r.judul, 200) || null : null,
      penulis: typeof r === 'object' ? potong(r.penulis, 100) || null : null,
    })
  }
  return [...hasil.values()]
}
