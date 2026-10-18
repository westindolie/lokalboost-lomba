/**
 * AI Portfolio Auto-builder.
 *
 * Merakit portofolio kreator dari lapis yang derajat kepercayaannya
 * berbeda, dan yang perbedaannya DITAMPILKAN, bukan disembunyikan:
 *
 *   1. terverifikasi — dihitung dari basis data LokalBoost sendiri. Kampanye
 *      yang benar-benar selesai, tayangan yang lolos anti-fraud, ulasan yang
 *      ditulis UMKM sungguhan. Kreator tidak bisa mengarang angka ini.
 *   2. terukur       — statistik TikTok/Instagram/YouTube yang diambil dari
 *      profil publik lewat penyedia berbayar (ScrapeCreators), dan baru
 *      dipajang setelah kreator membuktikan akunnya dengan kode di bio.
 *      Lihat services/profil-sosial.js.
 *
 * Angka yang diketik kreator sendiri TIDAK diterima sama sekali (dihapus 17 Okt
 * 2026): views dan pengikut ketikan membuka pintu penipuan ke UMKM.
 *
 * `dikonfirmasi` (tautan karya + oEmbed TikTok) masih ada di API tapi tidak
 * lagi ditampilkan di antarmuka. Yang dikonfirmasi hanya kepemilikan karya,
 * bukan performanya.
 *
 * Seluruh berkas ini deterministik. Tidak ada panggilan model bahasa, jadi
 * portofolio tetap terbit di produksi tempat AI generatif dimatikan.
 */
import { db } from '../lib/db.js'

/** Label yang dibaca pengguna. Satu sumber kebenaran untuk API dan antarmuka. */
export const LABEL_SUMBER = {
  terverifikasi: 'Terverifikasi LokalBoost',
  terukur: 'Diukur dari profil',
  dikonfirmasi: 'Dikonfirmasi TikTok',
}

/** Platform yang boleh ditempel. `lainnya` menampung blog/portofolio pribadi. */
export const PLATFORM = ['tiktok', 'instagram', 'youtube', 'lainnya']

/** Hanya TikTok yang punya oEmbed terbuka; sisanya disimpan tanpa konfirmasi. */
const OEMBED_TIKTOK = 'https://www.tiktok.com/oembed'
const BATAS_OEMBED_MS = 6000

/**
 * Skema yang boleh disimpan. Daftar-izin, bukan daftar-larang.
 *
 * Tautan portofolio berakhir sebagai `href` di profil kreator yang BISA
 * DIBUKA SIAPA SAJA tanpa login. Tanpa penjagaan ini, `new URL()` menerima
 * `javascript:...` dengan senang hati (hostname-nya kosong, jadi lolos sebagai
 * platform "lainnya"), dan kreator mana pun bisa menanam skrip yang berjalan
 * di peramban UMKM yang mengklik karyanya. Token sesi disimpan di
 * localStorage, jadi taruhannya bukan sekadar pop-up.
 *
 * Diuji: javascript:, data:, vbscript:, dan file: semuanya ditolak.
 */
const SKEMA_DIIZINKAN = ['http:', 'https:']

/**
 * Tebak platform dari host tautan. Dipakai supaya kreator tidak perlu memilih
 * dari dropdown yang gampang salah pilih. Mengembalikan null untuk tautan yang
 * tidak boleh disimpan sama sekali.
 */
export function tebakPlatform(url) {
  let host = ''
  try {
    const uri = new URL(url)
    if (!SKEMA_DIIZINKAN.includes(uri.protocol.toLowerCase())) return null
    host = uri.hostname.toLowerCase()
    if (!host) return null
  } catch {
    return null
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok'
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube'
  return 'lainnya'
}

/**
 * Tanya oEmbed TikTok. Mengembalikan null untuk SEMUA kegagalan, termasuk
 * tautan mati dan jaringan putus, karena gagal konfirmasi bukan galat yang
 * pantas menghentikan penyimpanan tautan: tautannya tetap tersimpan, hanya
 * tanpa centang.
 */
export async function konfirmasiTikTok(url) {
  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), BATAS_OEMBED_MS)
  try {
    const jawab = await fetch(`${OEMBED_TIKTOK}?url=${encodeURIComponent(url)}`, {
      signal: kendali.signal,
      headers: { accept: 'application/json' },
    })
    if (!jawab.ok) return null
    const data = await jawab.json()
    // Judul boleh kosong (video tanpa caption), tapi tanpa nama akun tidak ada
    // yang benar-benar terkonfirmasi.
    if (!data?.author_name && !data?.author_unique_id) return null
    return {
      judul: data.title || null,
      penulis: data.author_name || null,
      penulisAkun: data.author_unique_id || null,
      /*
       * PERHATIAN: thumbnail TikTok adalah URL BERTANDA TANGAN dan
       * kedaluwarsa. Contoh yang diambil 20 Sep 2026 memuat
       * `x-expires=1790092800`, yaitu sekitar 22 Sep 2026 — umurnya cuma dua
       * hari. Jadi kolom ini boleh kosong sewaktu-waktu dan antarmuka WAJIB
       * tetap terbaca tanpa gambar. Yang berumur panjang adalah judul dan
       * nama akun, dan itulah bukti kepemilikan yang sebenarnya.
       */
      thumbnail: data.thumbnail_url || null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(jam)
  }
}

/** Lapis 1: angka yang dihitung sendiri oleh platform. */
function lapisTerverifikasi(kreatorId) {
  const kampanye = db
    .prepare(
      `SELECT k.id, k.nama, k.kategori, k.lokasi, k.gradasi, k.gambar, k.selesai_pada,
              ((SELECT COUNT(*) FROM tayangan t JOIN video v ON v.id = t.video_id
                  WHERE t.kampanye_id = k.id AND t.valid = 1 AND v.kreator_id = k_kr.id)
               + (SELECT COALESCE(SUM(v.views_diakui), 0) FROM video v
                  WHERE v.kampanye_id = k.id AND v.kreator_id = k_kr.id AND v.sumber = 'tautan' AND v.status = 'tayang')) AS views
       FROM kampanye k JOIN pengguna k_kr ON k_kr.id = ?
       WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = k_kr.id AND lp.status = 'disetujui') AND k.status = 'selesai'
       ORDER BY k.selesai_pada DESC`,
    )
    .all(kreatorId)

  const berjalan = db
    .prepare(`SELECT COUNT(*) AS n FROM kampanye k WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui') AND k.status = 'berjalan'`)
    .get(kreatorId).n

  const ulasan = db
    .prepare('SELECT AVG(bintang) AS rerata, COUNT(*) AS jumlah FROM ulasan WHERE dinilai_id = ?')
    .get(kreatorId)

  const totalViews = kampanye.reduce((a, k) => a + k.views, 0)

  // Spesialisasi dibaca dari kategori kampanye yang BENAR-BENAR dikerjakan,
  // bukan dari field niche yang diisi sekali saat mendaftar. Alasan yang sama
  // dipakai komponen `histori` di matchmaker.
  const perKategori = {}
  for (const k of kampanye) {
    if (!k.kategori) continue
    perKategori[k.kategori] = (perKategori[k.kategori] || 0) + 1
  }
  const spesialisasi = Object.entries(perKategori)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kategori, jumlah]) => ({ kategori, jumlah }))

  return {
    sumber: 'terverifikasi',
    label: LABEL_SUMBER.terverifikasi,
    kampanyeSelesai: kampanye.length,
    kampanyeBerjalan: berjalan,
    totalViews,
    rerataViews: kampanye.length ? Math.round(totalViews / kampanye.length) : 0,
    rating: ulasan.jumlah ? Number(ulasan.rerata.toFixed(2)) : null,
    jumlahUlasan: ulasan.jumlah,
    spesialisasi,
    karya: kampanye.slice(0, 10).map((k) => ({
      kampanyeId: k.id,
      nama: k.nama,
      kategori: k.kategori,
      lokasi: k.lokasi,
      gradasi: k.gradasi,
      gambar: k.gambar || null,
      views: k.views,
      selesaiPada: k.selesai_pada,
    })),
  }
}

/** Lapis 2: tautan karya luar yang kepemilikannya dikonfirmasi TikTok. */
function lapisDikonfirmasi(kreatorId) {
  const baris = db
    .prepare('SELECT * FROM portofolio_tautan WHERE kreator_id = ? ORDER BY dibuat_pada DESC')
    .all(kreatorId)

  return {
    sumber: 'dikonfirmasi',
    label: LABEL_SUMBER.dikonfirmasi,
    /* Tautan tanpa centang tetap ditampilkan, tapi antarmuka tidak boleh
       memajangnya seolah sudah diperiksa. */
    tautan: baris.map((t) => ({
      id: t.id,
      platform: t.platform,
      url: t.url,
      judul: t.judul,
      penulis: t.penulis,
      penulisAkun: t.penulis_akun,
      thumbnail: t.thumbnail,
      terkonfirmasi: Boolean(t.terkonfirmasi),
      dibuatPada: t.dibuat_pada,
    })),
    jumlahTerkonfirmasi: baris.filter((t) => t.terkonfirmasi).length,
  }
}

/** Baris `statistik_terukur` -> bentuk API. Dipakai juga routes/kreator.js. */
export function bentukTerukur(s) {
  const penilaian = JSON.parse(s.penilaian || '{}')
  return {
    platform: s.platform,
    akun: s.akun,
    namaTampilan: s.nama_tampilan,
    centangPlatform: Boolean(s.centang_platform),
    pengikut: s.pengikut,
    rerataViews: s.rerata_views,
    medianViews: s.median_views,
    engagement: s.engagement,
    dasarEngagement: s.dasar_engagement,
    kontenDiukur: s.konten_diukur,
    konten30Hari: s.konten_30_hari,
    skor: s.skor,
    predikat: penilaian.predikat || null,
    komponen: penilaian.komponen || [],
    peringatan: penilaian.peringatan || [],
    diukurPada: s.diukur_pada,
  }
}

/**
 * Lapis "terukur": angka dari profil publik yang kepemilikannya dibuktikan
 * lewat kode di bio. Lebih kuat dari ketikan sendiri, tapi tetap bukan
 * hitungan LokalBoost, jadi labelnya sendiri dan tanggal ukurnya ikut tampil.
 */
function lapisTerukur(kreatorId) {
  const baris = db
    .prepare('SELECT * FROM statistik_terukur WHERE kreator_id = ? ORDER BY platform')
    .all(kreatorId)
  return {
    sumber: 'terukur',
    label: LABEL_SUMBER.terukur,
    keterangan:
      'Diambil otomatis dari profil publik kreator. Akun dibuktikan milik kreator lewat kode di bio.',
    profil: baris.map(bentukTerukur),
  }
}

const ribu = (n) => Number(n).toLocaleString('id-ID')

/**
 * Ringkasan naratif deterministik.
 *
 * Dirakit dari angka, bukan ditulis model bahasa. Konsekuensinya disengaja:
 * kalimatnya tidak pernah mengarang, tidak pernah 504, dan sama persis setiap
 * kali dimuat sehingga UMKM bisa membandingkan dua kreator dengan adil.
 * Hanya menyebut lapis 1, karena hanya lapis 1 yang bisa dipertanggungjawabkan
 * platform.
 */
export function ringkasanPortofolio(nama, lapis1) {
  const kalimat = []

  if (!lapis1.kampanyeSelesai) {
    kalimat.push(`${nama} belum menyelesaikan kampanye di LokalBoost.`)
    if (lapis1.kampanyeBerjalan) {
      kalimat.push(
        `Saat ini ${lapis1.kampanyeBerjalan} kampanye sedang berjalan, jadi rekam jejaknya belum bisa dinilai.`,
      )
    } else {
      kalimat.push('Portofolionya akan terisi sendiri begitu kampanye pertamanya selesai.')
    }
    // Ulasan bisa sudah masuk walau kampanyenya belum ditutup. Tanpa kalimat
    // ini, ringkasan berbunyi "belum menyelesaikan kampanye" sementara kartu
    // di sebelahnya memajang bintang 5, dan pembaca menyimpulkan salah satunya
    // bohong.
    if (lapis1.rating !== null) {
      kalimat.push(
        `Ia sudah menerima ${lapis1.jumlahUlasan} ulasan dengan rata-rata ${lapis1.rating} dari 5 untuk kampanye yang sedang berjalan.`,
      )
    }
    return kalimat.join(' ')
  }

  const utama = lapis1.spesialisasi[0]
  const fokus =
    utama && utama.jumlah > 1
      ? `${nama} paling sering mengerjakan kampanye ${utama.kategori}`
      : `${nama} sudah mengerjakan kampanye ${utama ? utama.kategori : 'promosi'}`
  kalimat.push(
    `${fokus}, dengan ${lapis1.kampanyeSelesai} kampanye selesai dan ${ribu(lapis1.totalViews)} tayangan valid.`,
  )

  kalimat.push(`Rata-rata ${ribu(lapis1.rerataViews)} tayangan per kampanye.`)

  if (lapis1.rating !== null) {
    kalimat.push(
      `UMKM menilainya ${lapis1.rating} dari 5 berdasarkan ${lapis1.jumlahUlasan} ulasan.`,
    )
  } else {
    kalimat.push('Belum ada UMKM yang menulis ulasan untuknya.')
  }

  if (lapis1.spesialisasi.length > 1) {
    const lain = lapis1.spesialisasi.slice(1).map((s) => s.kategori)
    kalimat.push(`Ia juga pernah menggarap kategori ${lain.join(' dan ')}.`)
  }

  return kalimat.join(' ')
}

/** Rakit portofolio lengkap satu kreator. Null kalau kreatornya tidak ada. */
export function bangunPortofolio(kreatorId) {
  const kreator = db
    .prepare(
      `SELECT p.id, p.nama, pk.niche, pk.lokasi, pk.bio, pk.terverifikasi
       FROM pengguna p JOIN profil_kreator pk ON pk.pengguna_id = p.id
       WHERE p.id = ?`,
    )
    .get(kreatorId)
  if (!kreator) return null

  const terverifikasi = lapisTerverifikasi(kreatorId)

  return {
    kreator: {
      id: kreator.id,
      nama: kreator.nama,
      niche: kreator.niche,
      lokasi: kreator.lokasi,
      bio: kreator.bio,
      akunTerverifikasi: Boolean(kreator.terverifikasi),
    },
    ringkasan: ringkasanPortofolio(kreator.nama, terverifikasi),
    // Jujur ke antarmuka: kalimat di atas dirakit aturan, bukan model bahasa.
    sumberRingkasan: 'template',
    lapis: {
      terverifikasi,
      terukur: lapisTerukur(kreatorId),
      dikonfirmasi: lapisDikonfirmasi(kreatorId),
    },
  }
}
