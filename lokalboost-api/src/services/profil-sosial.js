/**
 * Cek Profil Kreator: ukur pengikut, views, dan engagement dari tautan profil.
 *
 * Kenapa lewat pihak ketiga: diuji 20 Sep 2026, statistik TIDAK bisa diambil
 * langsung dari tautan publik (profil TikTok dijaga anti-bot, Instagram
 * memasang dinding login). ScrapeCreators (api.scrapecreators.com) yang
 * mengurus itu, kita cukup memanggil REST-nya. Biayanya 1 kredit per panggilan,
 * jadi satu cek TikTok atau YouTube = 2 kredit (profil + daftar video),
 * Instagram = 1.
 *
 * Mengukur akun BELUM membuktikan akun itu milik kreator. Siapa saja bisa
 * menempel tautan akun artis 2 juta pengikut. Karena itu hasil baru disimpan
 * dan dipajang ke UMKM setelah kreator menaruh kode verifikasi (`LB-XXXXXX`)
 * di bio akunnya. Kode diturunkan dari id pengguna, jadi tidak perlu tabel
 * dan tidak bisa dipakai kreator lain.
 *
 * Penilaian dihitung aturan, bukan model bahasa, dengan alasan yang sama
 * seperti ringkasan portofolio: tidak mengarang, tidak 504, dan adil saat
 * dua kreator dibandingkan.
 *
 * Kreator TIDAK bisa mengetik statistiknya sendiri (dihapus 17 Okt 2026).
 * Semua angka yang dipajang ke UMKM berasal dari sini.
 */
import crypto from 'node:crypto'
import { config } from '../config.js'
import { GalatHttp, galat400, galat503 } from '../lib/util.js'

export const PLATFORM_PROFIL = ['tiktok', 'instagram', 'youtube']

/** Jumlah konten terbaru yang dipakai menghitung rata-rata. */
const KONTEN_DIUKUR = 12

/** Segmen pertama URL Instagram yang BUKAN nama akun. */
const JALUR_IG_BUKAN_AKUN = new Set([
  'p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'about', 'developer', 'legal',
])

const POLA_AKUN = {
  tiktok: /^[a-z0-9_.]{2,24}$/i,
  instagram: /^[a-z0-9_.]{1,30}$/i,
  youtube: /^[a-z0-9_.\-]{3,30}$/i,
}

/** ID channel YouTube: "UC" + 22 karakter. Dipakai kalau tautannya /channel/UC... */
const POLA_ID_CHANNEL = /^UC[A-Za-z0-9_-]{22}$/

/**
 * Tautan profil -> { platform, akun }. Melempar 400 dengan pesan yang bisa
 * langsung dibaca kreator, karena salah tempel tautan adalah kasus paling umum.
 */
export function uraiTautanProfil(masukan) {
  const teks = String(masukan || '').trim()
  let uri
  try {
    uri = new URL(/^https?:\/\//i.test(teks) ? teks : `https://${teks}`)
  } catch {
    throw galat400('Tautan profil tidak sah. Contoh: https://www.tiktok.com/@akunanda')
  }
  if (!['http:', 'https:'].includes(uri.protocol)) throw galat400('Tautan profil harus http atau https.')

  const host = uri.hostname.toLowerCase()
  const segmen = uri.pathname.split('/').filter(Boolean)

  if (host === 'vt.tiktok.com' || host === 'vm.tiktok.com') {
    throw galat400(
      'Tautan pendek TikTok tidak bisa dibaca. Buka profil Anda di TikTok, lalu salin tautan lengkap tiktok.com/@akunanda.',
    )
  }

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const akun = (segmen[0] || '').startsWith('@') ? segmen[0].slice(1) : ''
    if (!POLA_AKUN.tiktok.test(akun)) {
      throw galat400('Tautan TikTok harus berisi nama akun, contoh: https://www.tiktok.com/@akunanda')
    }
    return { platform: 'tiktok', akun: akun.toLowerCase() }
  }

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    let akun = segmen[0] || ''
    if (akun === 'stories') akun = segmen[1] || ''
    if (!akun || JALUR_IG_BUKAN_AKUN.has(akun.toLowerCase())) {
      throw galat400(
        'Itu tautan postingan, bukan profil. Salin tautan profil, contoh: https://www.instagram.com/akunanda',
      )
    }
    if (!POLA_AKUN.instagram.test(akun)) throw galat400('Nama akun Instagram di tautan tidak sah.')
    return { platform: 'instagram', akun: akun.toLowerCase() }
  }

  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const pertama = segmen[0] || ''
    if (pertama.startsWith('@')) {
      const akun = pertama.slice(1)
      if (!POLA_AKUN.youtube.test(akun)) throw galat400('Nama channel YouTube di tautan tidak sah.')
      return { platform: 'youtube', akun: akun.toLowerCase() }
    }
    if (pertama === 'channel' && POLA_ID_CHANNEL.test(segmen[1] || '')) {
      // ID channel peka huruf besar-kecil, jadi tidak diturunkan.
      return { platform: 'youtube', akun: segmen[1] }
    }
    throw galat400(
      'Tautan YouTube harus berupa tautan channel, contoh: https://www.youtube.com/@namachannel. Tautan video tidak bisa dibaca.',
    )
  }
  if (host === 'youtu.be') {
    throw galat400('Itu tautan video. Salin tautan channel, contoh: https://www.youtube.com/@namachannel')
  }

  throw galat400('Saat ini cek profil mendukung TikTok, Instagram, dan YouTube.')
}

/**
 * Kode yang ditaruh kreator di bio untuk membuktikan akun miliknya.
 * Deterministik: sama setiap kali diminta, beda untuk setiap kreator.
 */
export function kodeVerifikasi(kreatorId) {
  const hex = crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`profil-sosial:${kreatorId}`)
    .digest('hex')
  return `LB-${hex.slice(0, 6).toUpperCase()}`
}

/** Bio memuat kode? Spasi dan huruf kecil dimaafkan, kreator mengetik di HP. */
export function bioMemuatKode(bio, kode) {
  const rapat = (s) => String(s || '').toUpperCase().replace(/[\s\-_]/g, '')
  return rapat(bio).includes(rapat(kode))
}

export const cekProfilAktif = () => Boolean(config.scrapeCreators.apiKey)


/** Dipakai juga oleh services/referensi-konten.js (tautan konten tunggal). */
export async function panggilPenyedia(jalur, params, { batasDetik = config.scrapeCreators.batasDetik } = {}) {
  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), batasDetik * 1000)
  try {
    const jawab = await fetch(
      `${config.scrapeCreators.baseUrl}${jalur}?${new URLSearchParams(params)}`,
      { headers: { 'x-api-key': config.scrapeCreators.apiKey }, signal: kendali.signal },
    )
    const data = await jawab.json().catch(() => null)
    if (jawab.status === 401 || jawab.status === 402) {
      // Kunci salah atau kredit habis. Bukan salah kreator, jadi 503.
      console.error(`[profil-sosial] penyedia menolak kunci (${jawab.status}):`, data?.message)
      throw galat503('Layanan cek profil sedang tidak tersedia. Coba lagi nanti.')
    }
    if (jawab.status === 404) throw new GalatHttp(404, 'Akun tidak ditemukan. Periksa lagi ejaan nama akunnya.')
    if (jawab.status === 403) {
      throw new GalatHttp(422, 'Akun ini dibatasi (privat atau dibatasi usia), jadi statistiknya tidak bisa dibaca.')
    }
    if (!jawab.ok || !data) {
      console.error(`[profil-sosial] ${jalur} membalas ${jawab.status}`)
      throw galat503('Layanan cek profil tidak menjawab. Coba beberapa menit lagi.')
    }
    return data
  } catch (e) {
    if (e instanceof GalatHttp) throw e
    console.error(`[profil-sosial] ${jalur} gagal:`, e.message)
    throw galat503(
      e.name === 'AbortError'
        ? 'Layanan cek profil terlalu lama menjawab. Coba lagi sebentar lagi.'
        : 'Layanan cek profil tidak bisa dihubungi. Coba lagi sebentar lagi.',
    )
  } finally {
    clearTimeout(jam)
  }
}

const angka = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/** Bentuk seragam dari dua penyedia data yang bentuknya jauh berbeda. */
async function ambilTikTok(akun) {
  // Daftar video boleh gagal: profil saja masih memberi pengikut dan centang.
  const [profil, video] = await Promise.allSettled([
    panggilPenyedia('/v1/tiktok/profile', { handle: akun }),
    panggilPenyedia('/v3/tiktok/profile/videos', { handle: akun, sort_by: 'latest' }),
  ])
  if (profil.status === 'rejected') throw profil.reason

  const { user, stats } = profil.value || {}
  if (!user?.uniqueId) throw new GalatHttp(404, 'Akun TikTok tidak ditemukan. Periksa lagi ejaan nama akunnya.')
  if (user.privateAccount || user.secret) {
    throw new GalatHttp(422, 'Akun TikTok ini privat. Ubah ke publik dulu supaya bisa diukur.')
  }

  const daftar = video.status === 'fulfilled' ? video.value?.aweme_list || [] : []
  const konten = daftar
    // Video yang disematkan biasanya video lama yang pernah viral. Ikut
    // dihitung = rata-rata terlihat jauh lebih bagus dari kenyataannya.
    .filter((v) => !v.is_top)
    .map((v) => ({
      views: angka(v.statistics?.play_count),
      suka: angka(v.statistics?.digg_count),
      komentar: angka(v.statistics?.comment_count),
      bagikan: angka(v.statistics?.share_count),
      waktu: angka(v.create_time),
    }))

  return {
    platform: 'tiktok',
    akun: user.uniqueId.toLowerCase(),
    namaTampilan: user.nickname || user.uniqueId,
    bio: user.signature || '',
    centangPlatform: Boolean(user.verified),
    pengikut: angka(stats?.followerCount),
    konten,
    daftarVideoGagal: video.status === 'rejected',
  }
}

async function ambilInstagram(akun) {
  const data = await panggilPenyedia('/v1/instagram/profile', { handle: akun })
  const user = data?.data?.user
  if (!user?.username) throw new GalatHttp(404, 'Akun Instagram tidak ditemukan. Periksa lagi ejaan nama akunnya.')
  if (user.is_private) {
    throw new GalatHttp(422, 'Akun Instagram ini privat. Ubah ke publik dulu supaya bisa diukur.')
  }

  const konten = (user.edge_owner_to_timeline_media?.edges || []).map(({ node: n }) => ({
    // Hanya video yang punya angka tayangan. Foto dicatat null, bukan 0,
    // supaya tidak menyeret rata-rata views ke bawah.
    views: n?.is_video ? angka(n.video_view_count) : null,
    suka: angka(n?.edge_liked_by?.count),
    komentar: angka(n?.edge_media_to_comment?.count),
    bagikan: 0,
    waktu: angka(n?.taken_at_timestamp),
  }))

  // Akun yang menyembunyikan like dilaporkan 0 di semua posting. Itu "tidak
  // diketahui", bukan "tidak ada yang menyukai" (diuji ke akun resmi Instagram
  // 17 Okt 2026: 686 juta pengikut, like 0 di semua posting).
  const adaInteraksi = konten.some((k) => k.suka > 0)

  return {
    platform: 'instagram',
    tanpaInteraksi: !adaInteraksi,
    akun: user.username.toLowerCase(),
    namaTampilan: user.full_name || user.username,
    bio: user.biography || '',
    centangPlatform: Boolean(user.is_verified),
    pengikut: angka(user.edge_followed_by?.count),
    konten,
    daftarVideoGagal: false,
  }
}

/**
 * Diuji ke penyedia asli 17 Okt 2026, dan hasilnya berbeda dari dokumentasi:
 * tanggal ada di `publishDate` (`publishedTime` kosong), sedangkan
 * `likeCountInt` dan `commentCountInt` ada di semua video tanpa `includeExtras`.
 *
 * Kreator bisa menyembunyikan hitungan like. Kalau tidak satu pun video
 * membawa angkanya, interaksi ditandai `tanpaInteraksi` dan skornya dibobot
 * ulang di `nilaiProfil`, bukan diisi 0 yang menghukum channel itu.
 */
async function ambilYouTube(akun) {
  const param = POLA_ID_CHANNEL.test(akun) ? { channelId: akun } : { handle: akun }
  const [kanal, video] = await Promise.allSettled([
    panggilPenyedia('/v1/youtube/channel', param),
    panggilPenyedia('/v1/youtube/channel-videos', { ...param, sort: 'latest' }),
  ])
  if (kanal.status === 'rejected') throw kanal.reason

  const k = kanal.value || {}
  if (!k.channelId && !k.name) throw new GalatHttp(404, 'Channel YouTube tidak ditemukan. Periksa lagi tautannya.')

  const daftar = video.status === 'fulfilled' ? video.value?.videos || [] : []
  const adaInteraksi = daftar.some((v) => v.likeCountInt != null)
  const konten = daftar.map((v) => ({
    views: angka(v.viewCountInt),
    suka: angka(v.likeCountInt),
    komentar: angka(v.commentCountInt),
    bagikan: 0,
    waktu: Math.floor(Date.parse(v.publishDate || v.publishedTime) / 1000) || 0,
  }))

  const handle = /@([^/?#]+)/.exec(String(k.channel || ''))?.[1]
  return {
    platform: 'youtube',
    // Bentuk kanonik: @handle bila ada, kalau tidak ID channel. Dipakai untuk
    // mencegah satu channel diklaim dua kreator lewat dua bentuk tautan.
    akun: handle ? decodeURIComponent(handle).toLowerCase() : k.channelId || akun,
    namaTampilan: k.name || akun,
    bio: k.description || '',
    centangPlatform: false,
    pengikut: angka(k.subscriberCount),
    konten,
    tanpaInteraksi: !adaInteraksi,
    daftarVideoGagal: video.status === 'rejected',
  }
}

export async function ambilProfil(platform, akun) {
  if (!cekProfilAktif()) {
    throw galat503('Fitur cek profil belum diaktifkan di server ini. Coba lagi nanti.')
  }
  if (platform === 'tiktok') return ambilTikTok(akun)
  if (platform === 'youtube') return ambilYouTube(akun)
  return ambilInstagram(akun)
}

function median(daftar) {
  if (!daftar.length) return null
  const urut = [...daftar].sort((a, b) => a - b)
  const t = Math.floor(urut.length / 2)
  return urut.length % 2 ? urut[t] : Math.round((urut[t - 1] + urut[t]) / 2)
}

const satuDesimal = (n) => Math.round(n * 10) / 10

/**
 * Angka mentah -> metrik. Murni, tanpa jaringan, supaya bisa diuji.
 *
 * Engagement dihitung berbeda per platform, mengikuti kebiasaan industri:
 * TikTok terhadap VIEWS (konten tersebar lewat FYP ke bukan-pengikut),
 * Instagram terhadap PENGIKUT (views hanya ada di video).
 */
export function hitungMetrik(profil, kini = Date.now()) {
  const konten = [...profil.konten].sort((a, b) => b.waktu - a.waktu).slice(0, KONTEN_DIUKUR)
  const views = konten.map((k) => k.views).filter((v) => v !== null)

  let engagement = null
  if (profil.tanpaInteraksi) {
    // Like disembunyikan. Lebih jujur kosong daripada 0%.
  } else if (profil.platform === 'tiktok' || profil.platform === 'youtube') {
    const totalViews = views.reduce((a, b) => a + b, 0)
    const interaksi = konten.reduce((a, k) => a + k.suka + k.komentar + k.bagikan, 0)
    if (totalViews > 0) engagement = satuDesimal((interaksi / totalViews) * 100)
  } else if (konten.length && profil.pengikut > 0) {
    const rerataInteraksi = konten.reduce((a, k) => a + k.suka + k.komentar, 0) / konten.length
    engagement = satuDesimal((rerataInteraksi / profil.pengikut) * 100)
  }

  const batas30Hari = kini / 1000 - 30 * 24 * 3600
  return {
    pengikut: profil.pengikut,
    rerataViews: views.length ? Math.round(views.reduce((a, b) => a + b, 0) / views.length) : null,
    medianViews: median(views),
    engagement,
    dasarEngagement:
      profil.tanpaInteraksi
        ? null
        : profil.platform === 'instagram'
          ? 'pengikut'
          : 'views',
    kontenDiukur: konten.length,
    konten30Hari: konten.filter((k) => k.waktu >= batas30Hari).length,
  }
}

const jepit = (n) => Math.max(0, Math.min(1, n))

/**
 * Skor 0-100 dari empat komponen yang semuanya bisa dijelaskan ke UMKM.
 * Median dipakai untuk performa, bukan rata-rata: satu video viral membuat
 * rata-rata melonjak padahal video berikutnya belum tentu ikut ramai.
 */
export function nilaiProfil(platform, m) {
  const peringatan = []
  const komponen = []

  // Akun yang menyembunyikan like tidak punya data interaksi, jadi bobotnya
  // dialihkan ke tiga komponen lain. Memberi 0 akan menghukum akun itu atas
  // sesuatu yang tidak bisa kita ukur.
  const tanpaInteraksi = m.engagement === null
  const bobot = tanpaInteraksi
    ? { jangkauan: 30, performa: 40, interaksi: 0, konsisten: 30 }
    : { jangkauan: 20, performa: 30, interaksi: 30, konsisten: 20 }

  // Jangkauan: skala log, 500 pengikut = 0, 100 ribu = penuh. Untuk UMKM
  // lokal, kreator mikro sudah berguna, jadi bobotnya tidak dominan.
  const sJangkauan =
    bobot.jangkauan * jepit(Math.log10(Math.max(m.pengikut, 1) / 500) / Math.log10(200))
  komponen.push({ nama: 'Jangkauan', skor: sJangkauan, maks: bobot.jangkauan })

  // Performa: median views dibanding pengikut. TikTok/Instagram 30% sudah
  // sehat (FYP sering melewati 100%); YouTube video panjang cukup 10%.
  const sehat = platform === 'youtube' ? 0.1 : 0.3
  let sPerforma = 0
  if (m.medianViews !== null && m.pengikut > 0) {
    sPerforma = bobot.performa * jepit(m.medianViews / m.pengikut / sehat)
  } else if (m.medianViews !== null) {
    sPerforma = bobot.performa * jepit(m.medianViews / 1000)
  }
  komponen.push({ nama: 'Performa tayangan', skor: sPerforma, maks: bobot.performa })

  // Engagement: patokan beda per dasar hitungnya.
  if (!tanpaInteraksi) {
    const target = platform === 'tiktok' ? 6 : platform === 'youtube' ? 4 : 3
    const sEngagement = m.engagement === null ? 0 : bobot.interaksi * jepit(m.engagement / target)
    komponen.push({ nama: 'Interaksi penonton', skor: sEngagement, maks: bobot.interaksi })
  }

  // Konsistensi: 8 konten sebulan (2 per minggu) dianggap aktif penuh. Video
  // panjang YouTube lebih jarang, jadi 4 sebulan sudah penuh.
  const penuh = platform === 'youtube' ? 4 : 8
  const sKonsisten = bobot.konsisten * jepit(m.konten30Hari / penuh)
  komponen.push({ nama: 'Konsistensi posting', skor: sKonsisten, maks: bobot.konsisten })

  if (m.kontenDiukur < 3) {
    peringatan.push('Konten publik terlalu sedikit, jadi penilaian ini belum bisa diandalkan.')
  }
  if (m.medianViews !== null && m.pengikut >= 10_000 && m.medianViews / m.pengikut < 0.02) {
    peringatan.push(
      'Tayangan jauh lebih kecil dari jumlah pengikut. Bisa jadi banyak pengikut yang tidak aktif.',
    )
  }
  if (m.engagement !== null && m.engagement < 1) {
    peringatan.push('Interaksi (suka, komentar, bagikan) sangat rendah dibanding tayangan.')
  }
  if (m.konten30Hari === 0 && m.kontenDiukur > 0) {
    peringatan.push('Tidak ada konten baru dalam 30 hari terakhir.')
  }

  const skor = Math.round(komponen.reduce((a, k) => a + k.skor, 0))
  const predikat =
    skor >= 75 ? 'Sangat baik' : skor >= 55 ? 'Baik' : skor >= 35 ? 'Cukup' : 'Masih berkembang'

  return {
    skor,
    predikat,
    komponen: komponen.map((k) => ({ ...k, skor: satuDesimal(k.skor) })),
    peringatan,
  }
}
