import { db } from '../lib/db.js'

/**
 * AI Smart Matchmaker (PRD §8.2)
 * ------------------------------------------------------------------
 * Versi awal sesuai batasan MVP: "aturan pencocokan sederhana + model
 * rekomendasi dasar". Implementasinya adalah model skoring berbobot yang
 * seluruh komponennya bisa dijelaskan ke pengguna — penting karena UMKM
 * sasaran kami awam digital dan butuh tahu *kenapa* seorang kreator
 * direkomendasikan, bukan sekadar melihat angka.
 *
 * Total bobot = 100. Setiap komponen mengembalikan skornya sendiri plus
 * kalimat alasan berbahasa Indonesia sederhana.
 */

const BOBOT = {
  niche: 18,      // niche yang DIAKUI kreator di profilnya
  histori: 15,    // kategori yang BENAR-BENAR pernah ia terima
  lokasi: 22,     // kedekatan geografis dengan toko
  rating: 20,     // reputasi dari ulasan UMKM sebelumnya
  rekamJejak: 10, // jumlah kampanye yang pernah diselesaikan
  jangkauan: 10,  // apakah audiens cukup besar untuk target views
  ketersediaan: 5, // sedang tidak kelebihan kampanye berjalan
}

/**
 * Kota yang berada dalam satu wilayah aglomerasi dianggap "dekat".
 * Penonton di Cimahi praktis sama berharganya dengan penonton Bandung bagi
 * warung di Bandung, jadi jangan dihukum penuh seperti kota yang jauh.
 */
const WILAYAH = {
  'banda aceh raya': ['banda aceh', 'aceh besar', 'sabang'],
  'bandung raya': ['bandung', 'cimahi', 'soreang', 'padalarang', 'lembang'],
  jabodetabek: ['jakarta', 'bogor', 'depok', 'tangerang', 'bekasi'],
  'gerbangkertosusila': ['surabaya', 'sidoarjo', 'gresik', 'mojokerto'],
  kedungsepur: ['semarang', 'ungaran', 'demak', 'kendal'],
  'yogyakarta raya': ['yogyakarta', 'sleman', 'bantul'],
}

const normal = (s) => String(s || '').trim().toLowerCase()

function wilayahDari(kota) {
  const k = normal(kota)
  for (const [nama, daftar] of Object.entries(WILAYAH)) {
    if (daftar.includes(k)) return nama
  }
  return null
}

function nilaiLokasi(lokasiKampanye, lokasiKreator) {
  const a = normal(lokasiKampanye)
  const b = normal(lokasiKreator)
  if (!a || !b) return { skor: BOBOT.lokasi * 0.4, alasan: null }
  if (a === b) return { skor: BOBOT.lokasi, alasan: `Berdomisili di kota yang sama (${lokasiKreator})` }

  const wa = wilayahDari(a)
  if (wa && wa === wilayahDari(b)) {
    return { skor: BOBOT.lokasi * 0.6, alasan: `Masih satu wilayah ${wa} dengan lokasi usaha` }
  }
  return { skor: 0, alasan: `Berbeda kota dengan lokasi usaha (${lokasiKreator})` }
}

function nilaiNiche(kategoriKampanye, nicheKreator) {
  const a = normal(kategoriKampanye)
  const b = normal(nicheKreator)
  if (!a || !b) return { skor: BOBOT.niche * 0.4, alasan: null }
  if (a === b) return { skor: BOBOT.niche, alasan: `Niche kontennya persis ${nicheKreator}` }

  // Kategori bertetangga masih relevan: penonton fashion mudah tertarik
  // konten kecantikan, penonton kuliner tertarik konten ibu & anak, dst.
  const TETANGGA = {
    kuliner: ['ibu & anak'],
    fashion: ['kecantikan'],
    kecantikan: ['fashion'],
    'ibu & anak': ['kuliner', 'fashion'],
    'hobi & gadget': [],
  }
  if ((TETANGGA[a] || []).includes(b)) {
    return { skor: BOBOT.niche * 0.5, alasan: `Niche ${nicheKreator} berdekatan dengan kategori produk` }
  }
  return { skor: 0, alasan: `Niche ${nicheKreator} berbeda dari kategori produk` }
}

/**
 * Kategori yang benar-benar pernah diterima kreator, bukan yang ia tulis di
 * profil. Niche di profil diisi sekali saat mendaftar lalu hampir tidak pernah
 * diperbarui, sedangkan kampanye yang ia ambil adalah bukti perilaku. Karena
 * itu porsi terbesar sinyal kategori dipindahkan ke sini, dan `niche` turun
 * dari 30 ke 18.
 *
 * Kreator baru belum punya histori apa pun. Memberinya nol akan menghukum
 * pendatang baru dua kali (di sini dan di rekamJejak), jadi ia mendapat nilai
 * dasar netral 50% — pola yang sama dipakai nilaiRating untuk cold start.
 */
function nilaiHistori(kategoriKampanye, riwayatKategori) {
  const a = normal(kategoriKampanye)
  const total = Object.values(riwayatKategori).reduce((x, y) => x + y, 0)
  if (!a || !total) return { skor: BOBOT.histori * 0.5, alasan: null }

  const kali = riwayatKategori[a] || 0
  if (!kali) {
    return { skor: 0, alasan: 'Belum pernah mengambil kampanye di kategori ini' }
  }
  // Tiga kali dianggap sudah jadi pola, sama dengan ambang di nilaiRekamJejak.
  const skor = BOBOT.histori * Math.min(kali / 3, 1)
  return {
    skor,
    alasan: kali === 1
      ? `Pernah mengambil 1 kampanye ${kategoriKampanye}`
      : `Sudah ${kali} kali mengambil kampanye ${kategoriKampanye}`,
  }
}

function nilaiRating(rating, jumlahUlasan) {
  // Kreator pemula belum punya ulasan. Memberi mereka nol akan membuat
  // marketplace macet di sisi suplai — persis masalah "cold start" pada
  // PRD §12. Jadi mereka mendapat nilai dasar netral 70%.
  if (!jumlahUlasan) return { skor: BOBOT.rating * 0.7, alasan: 'Kreator baru, belum punya ulasan' }
  const skor = BOBOT.rating * (rating / 5)
  const teks = rating.toFixed(1).replace('.', ',')
  return { skor, alasan: `Penilaian ${teks} dari ${jumlahUlasan} ulasan` }
}

function nilaiRekamJejak(selesai) {
  const skor = BOBOT.rekamJejak * Math.min(selesai / 3, 1)
  if (!selesai) return { skor: 0, alasan: 'Belum pernah menyelesaikan kampanye di LokalBoost' }
  return { skor, alasan: `Sudah menuntaskan ${selesai} kampanye` }
}

function nilaiJangkauan(pengikut, targetViews, terukur = null) {
  /*
   * Kalau profilnya sudah diukur (services/profil-sosial.js), pakai median
   * tayangan yang sungguhan, bukan tebakan 20% pengikut. Median, bukan
   * rata-rata: satu video viral tidak menjanjikan video promosi ikut ramai.
   */
  if (terukur?.median) {
    const rasio = terukur.median / targetViews
    const skor = BOBOT.jangkauan * Math.min(rasio, 1)
    return {
      skor,
      alasan:
        rasio >= 1
          ? `Rata-rata ${ringkasAngka(terukur.median)} tayangan per video (diukur dari profil), cukup untuk target ini`
          : `Rata-rata ${ringkasAngka(terukur.median)} tayangan per video (diukur dari profil), target mungkin perlu beberapa video`,
    }
  }
  if (terukur?.pengikut) pengikut = terukur.pengikut
  if (!pengikut) return { skor: 0, alasan: 'Jumlah pengikut belum diisi' }
  // Asumsi konservatif: sekitar 20% pengikut menonton satu konten promosi.
  const perkiraanTayangan = pengikut * 0.2
  const rasio = perkiraanTayangan / targetViews
  const skor = BOBOT.jangkauan * Math.min(rasio, 1)
  if (rasio >= 1) {
    return { skor, alasan: `Jangkauan ${ringkasAngka(pengikut)} pengikut cukup untuk target ini` }
  }
  return {
    skor,
    alasan: `Jangkauan ${ringkasAngka(pengikut)} pengikut, target mungkin perlu waktu lebih lama`,
  }
}

function nilaiKetersediaan(kampanyeAktif) {
  if (kampanyeAktif === 0) return { skor: BOBOT.ketersediaan, alasan: 'Sedang tidak ada kampanye berjalan' }
  if (kampanyeAktif < 3) return { skor: BOBOT.ketersediaan * 0.5, alasan: null }
  return { skor: 0, alasan: `Sedang mengerjakan ${kampanyeAktif} kampanye lain` }
}

function ringkasAngka(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}JT`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

/** Statistik kreator yang dipakai penilaian, dihitung sekali per kreator. */
function statistikKreator(kreatorId) {
  const ulasan = db
    .prepare('SELECT AVG(bintang) AS rerata, COUNT(*) AS jumlah FROM ulasan WHERE dinilai_id = ?')
    .get(kreatorId)
  const selesai = db
    .prepare(`SELECT COUNT(*) AS n FROM kampanye k WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui') AND k.status = 'selesai'`)
    .get(kreatorId).n
  const aktif = db
    .prepare(`SELECT COUNT(*) AS n FROM kampanye k WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui') AND k.status = 'berjalan'`)
    .get(kreatorId).n

  // Kategori yang pernah ia terima. "berjalan" ikut dihitung karena menerima
  // kampanye sudah merupakan pilihan, tidak perlu menunggu sampai selesai.
  const riwayatKategori = {}
  for (const baris of db
    .prepare(
      `SELECT k.kategori, COUNT(*) AS n FROM kampanye k
       WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui') AND k.status IN ('berjalan', 'selesai')
       GROUP BY k.kategori`,
    )
    .all(kreatorId)) {
    const k = normal(baris.kategori)
    if (k) riwayatKategori[k] = baris.n
  }

  // Akun terukur terbesar. Hanya baris yang sudah dibuktikan lewat kode bio
  // yang ada di tabel ini, jadi aman dipakai tanpa saringan tambahan.
  const terukur = db
    .prepare(
      `SELECT pengikut, median_views AS median FROM statistik_terukur
       WHERE kreator_id = ? ORDER BY pengikut DESC LIMIT 1`,
    )
    .get(kreatorId)

  return {
    rating: ulasan.jumlah ? ulasan.rerata : 0,
    jumlahUlasan: ulasan.jumlah,
    selesai,
    aktif,
    riwayatKategori,
    terukur: terukur || null,
  }
}

/**
 * Hitung skor kecocokan satu kreator untuk satu kampanye.
 * @returns {{skor:number, rincian:object, alasan:string[]}}
 */
export function skorKecocokan(kampanye, kreator) {
  const stat = statistikKreator(kreator.pengguna_id ?? kreator.id)

  const komponen = {
    niche: nilaiNiche(kampanye.kategori, kreator.niche),
    histori: nilaiHistori(kampanye.kategori, stat.riwayatKategori),
    lokasi: nilaiLokasi(kampanye.lokasi, kreator.lokasi),
    rating: nilaiRating(stat.rating, stat.jumlahUlasan),
    rekamJejak: nilaiRekamJejak(stat.selesai),
    jangkauan: nilaiJangkauan(kreator.pengikut || 0, kampanye.target_views, stat.terukur),
    ketersediaan: nilaiKetersediaan(stat.aktif),
  }

  const total = Object.values(komponen).reduce((a, k) => a + k.skor, 0)
  const alasan = Object.values(komponen)
    .filter((k) => k.alasan)
    .sort((a, b) => b.skor - a.skor)
    .map((k) => k.alasan)

  return {
    skor: Math.round(total),
    rincian: Object.fromEntries(
      Object.entries(komponen).map(([nama, k]) => [nama, Math.round(k.skor * 10) / 10]),
    ),
    alasan,
    /** Satu kalimat ringkas untuk ditampilkan di kartu rekomendasi. */
    alasanUtama: alasan[0] || 'Profil kreator masih minim data',
  }
}

/**
 * Rekomendasikan kreator terbaik untuk sebuah kampanye.
 * Kreator yang sudah menerima undangan ditandai agar UMKM tidak mengundangnya lagi.
 */
export function rekomendasiKreator(kampanyeId, { batas = 10 } = {}) {
  const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
  if (!kampanye) return []

  const kandidat = db
    .prepare(
      `SELECT p.id, p.nama, p.contoh, pk.*
       FROM pengguna p
       JOIN profil_kreator pk ON pk.pengguna_id = p.id
       WHERE p.peran = 'kreator' AND p.terverifikasi = 1`,
    )
    .all()

  const sudahDiundang = new Set(
    db.prepare("SELECT kreator_id FROM lamaran WHERE kampanye_id = ? AND (status = 'disetujui' OR (jenis = 'undangan' AND status = 'menunggu'))")
      .all(kampanyeId).map((r) => r.kreator_id),
  )

  return kandidat
    .map((k) => {
      const hasil = skorKecocokan(kampanye, k)
      return {
        kreatorId: k.id,
        nama: k.nama,
        niche: k.niche,
        lokasi: k.lokasi,
        pengikut: k.pengikut,
        gradasi: k.gradasi,
        foto: k.foto || null,
        terverifikasi: Boolean(k.terverifikasi),
        contoh: Boolean(k.contoh),
        kecocokan: hasil.skor,
        alasan: hasil.alasanUtama,
        semuaAlasan: hasil.alasan,
        rincian: hasil.rincian,
        sudahDiundang: sudahDiundang.has(k.id),
      }
    })
    .sort((a, b) => b.kecocokan - a.kecocokan)
    .slice(0, batas)
}

/**
 * Kebalikannya: kampanye yang cocok untuk seorang kreator, dipakai di
 * dashboard kreator dan marketplace ("kampanye direkomendasikan untukmu").
 */
export function rekomendasiKampanye(kreatorId, { batas = 10 } = {}) {
  const kreator = db.prepare('SELECT * FROM profil_kreator WHERE pengguna_id = ?').get(kreatorId)
  if (!kreator) return []

  const terbuka = db
    .prepare("SELECT * FROM kampanye WHERE status = 'berjalan'")
    .all()

  return terbuka
    .map((kmp) => {
      const hasil = skorKecocokan(kmp, kreator)
      return { ...kmp, kecocokan: hasil.skor, alasan: hasil.alasanUtama, rincian: hasil.rincian }
    })
    .sort((a, b) => b.kecocokan - a.kecocokan)
    .slice(0, batas)
}

export const BOBOT_MATCHMAKER = BOBOT

/**
 * Catat keputusan sungguhan UMKM terhadap daftar rekomendasi.
 *
 * Dipanggil saat lamaran disetujui atau kreator diundang langsung. Peringkat
 * dihitung dari daftar rekomendasi pada detik itu juga — bukan belakangan —
 * karena bobot dan reputasi kreator berubah seiring waktu, dan menilai
 * keputusan lama dengan model baru tidak menjawab apa pun.
 *
 * Tidak pernah melempar: kegagalan mencatat umpan balik tidak boleh
 * membatalkan persetujuan kreator yang sudah sah.
 */
export function catatPilihan(kampanyeId, kreatorId, cara) {
  try {
    const peringkatSemua = rekomendasiKreator(kampanyeId, { batas: 1000 })
    const posisi = peringkatSemua.findIndex((k) => k.kreatorId === kreatorId)
    if (posisi === -1) return null

    return db
      .prepare(
        `INSERT INTO umpan_matchmaker (kampanye_id, kreator_id, skor, peringkat, jumlahKandidat, cara)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(kampanyeId, kreatorId, peringkatSemua[posisi].kecocokan, posisi + 1, peringkatSemua.length, cara)
      .lastInsertRowid
  } catch (galat) {
    console.warn(`[AI] Gagal mencatat umpan balik matchmaker: ${galat.message}`)
    return null
  }
}

/**
 * Seberapa sering rekomendasi teratas benar-benar yang dipilih.
 *
 * Tiga angka yang menjawab pertanyaan berbeda:
 *   - peringkat1 / peringkat3 : ketepatan di posisi teratas (precision@k)
 *   - rerataPeringkat         : kalau meleset, meleset sejauh apa
 *   - rerataSkor              : skor kecocokan yang nyatanya dipilih orang,
 *                               berguna untuk menentukan ambang "layak"
 */
export function laporanKetepatanRekomendasi() {
  const semua = db.prepare('SELECT * FROM umpan_matchmaker').all()
  if (!semua.length) {
    return { jumlahKeputusan: 0, catatan: 'Belum ada keputusan yang tercatat sejak umpan balik dinyalakan.' }
  }

  const diPeringkat = (n) => semua.filter((r) => r.peringkat <= n).length
  const rerata = (ambil) => Number((semua.reduce((a, r) => a + ambil(r), 0) / semua.length).toFixed(1))
  const persen = (n) => Number(((n / semua.length) * 100).toFixed(1))

  return {
    jumlahKeputusan: semua.length,
    persenPeringkat1: persen(diPeringkat(1)),
    persenPeringkat3: persen(diPeringkat(3)),
    rerataPeringkat: rerata((r) => r.peringkat),
    rerataSkor: rerata((r) => r.skor),
    perCara: ['disetujui', 'diundang'].map((cara) => ({
      cara,
      jumlah: semua.filter((r) => r.cara === cara).length,
    })),
  }
}
