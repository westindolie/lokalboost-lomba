import { db } from '../lib/db.js'
import { config } from '../config.js'
import { ALASAN_ANTIFRAUD, laporanKetepatanPenyaringan } from './antifraud.js'
import { BOBOT_MATCHMAKER, laporanKetepatanRekomendasi, rekomendasiKreator } from './matchmaker.js'

/**
 * Penyetel — menerjemahkan pengukuran jadi usulan angka.
 * ------------------------------------------------------------------
 * Sistem ini sudah bisa MENGUKUR sejak ada `tayangan.dipulihkan` dan tabel
 * `umpan_matchmaker`: kita tahu aturan mana yang salah menurut manusia, dan
 * seberapa sering rekomendasi teratas benar-benar yang dipilih. Yang belum
 * ada sampai berkas ini: menerjemahkan angka itu jadi ambang baru.
 *
 * Dua hal yang sengaja TIDAK dilakukan modul ini:
 *
 *  1. Ia tidak pernah menulis apa pun. Keluarannya usulan; yang menyetujui
 *     tetap manusia. Sistem yang menyetel ambang keuangannya sendiri
 *     berdasarkan data yang bisa dipengaruhi penggunanya adalah sistem yang
 *     bisa dibujuk pelaku kecurangan untuk melonggarkan dirinya sendiri.
 *
 *  2. Ia tidak pernah mengusulkan PENGETATAN. Kita punya data berlabel untuk
 *     satu arah saja: tayangan yang disaring lalu dipulihkan admin = bukti
 *     aturannya terlalu galak. Kecurangan yang LOLOS tidak pernah ditandai
 *     siapa pun, jadi tidak ada bukti yang bisa menyuruh kita memperketat.
 *     Mengarang usulan ke arah itu berarti menebak sambil berpura-pura
 *     mengukur. Yang dibutuhkan untuk melengkapinya dicatat di MELATIH-AI.md.
 */

/** Sampel di bawah ini bukan bukti, cuma derau. */
const MIN_SAMPEL_TAYANGAN = 20
const MIN_SAMPEL_KEPUTUSAN = 20
/** Tingkat salah-saring yang dianggap layak ditinjau. */
const AMBANG_SALAH_PERSEN = 10

/**
 * Peta dari alasan penyaringan ke tombol yang mengendalikannya.
 * `longgarkan` mengembalikan nilai yang menyaring LEBIH SEDIKIT.
 */
const TOMBOL = {
  [ALASAN_ANTIFRAUD.IP_BERULANG]: {
    env: 'AF_MAKS_VIEW_IP',
    kunci: 'maksViewPerIp',
    satuan: 'tayangan per IP',
    longgarkan: (n) => n + 2,
    arah: 'menaikkan batas tayangan yang boleh datang dari satu jaringan',
    catatan: 'Satu warnet, satu kantor, atau satu kos-kosan berbagi satu IP publik.',
  },
  [ALASAN_ANTIFRAUD.SINGKAT]: {
    env: 'AF_DURASI_MIN',
    kunci: 'durasiMinimalDetik',
    satuan: 'detik',
    longgarkan: (n) => Math.max(1, n - 1),
    arah: 'menurunkan durasi minimal sebuah tontonan dianggap sah',
    catatan: 'Koneksi lambat membuat video mulai terlambat, bukan penontonnya yang palsu.',
  },
  [ALASAN_ANTIFRAUD.DUPLIKAT]: {
    env: 'AF_JENDELA_ULANG',
    kunci: 'jendelaUlangMenit',
    satuan: 'menit',
    longgarkan: (n) => Math.max(5, n - 15),
    arah: 'mempersempit jendela waktu yang menganggap tontonan berulang sebagai duplikat',
    catatan: 'Orang memang menonton ulang video yang disukainya.',
  },
  [ALASAN_ANTIFRAUD.LONJAKAN]: {
    env: 'AF_AMBANG_Z',
    kunci: 'ambangZScore',
    satuan: 'z-score',
    longgarkan: (n) => n + 1,
    arah: 'menaikkan ambang sebuah jam disebut lonjakan tak wajar',
    catatan: 'Konten yang benar-benar viral juga terlihat seperti lonjakan.',
  },
}

// ---------------------------------------------------------------------
//  Anti-fraud
// ---------------------------------------------------------------------

function usulanAntiFraud() {
  const penyaringan = laporanKetepatanPenyaringan()

  const usulan = []
  const diabaikan = []

  for (const baris of penyaringan) {
    const tombol = TOMBOL[baris.alasan]

    if (!tombol) {
      // BOT dan TANPA_UA dikendalikan daftar pola user-agent, bukan angka.
      if (baris.persenSalah > AMBANG_SALAH_PERSEN && baris.totalDisaring >= MIN_SAMPEL_TAYANGAN) {
        diabaikan.push({
          alasan: baris.alasan,
          sebab: 'Aturan ini tidak punya ambang angka — ia memakai daftar pola user-agent di services/antifraud.js. Tinjau daftarnya secara manual.',
          ...baris,
        })
      }
      continue
    }

    if (baris.totalDisaring < MIN_SAMPEL_TAYANGAN) {
      diabaikan.push({
        alasan: baris.alasan,
        sebab: `Baru ${baris.totalDisaring} tayangan tersaring; butuh minimal ${MIN_SAMPEL_TAYANGAN} sebelum angkanya berarti.`,
        ...baris,
      })
      continue
    }

    if (baris.persenSalah <= AMBANG_SALAH_PERSEN) continue

    const sekarang = config.antiFraud[tombol.kunci]
    const disarankan = tombol.longgarkan(sekarang)
    if (disarankan === sekarang) continue

    usulan.push({
      alasan: baris.alasan,
      env: tombol.env,
      kunci: tombol.kunci,
      satuan: tombol.satuan,
      sekarang,
      disarankan,
      arah: tombol.arah,
      catatan: tombol.catatan,
      bukti: {
        totalDisaring: baris.totalDisaring,
        dipulihkan: baris.dipulihkan,
        persenSalah: baris.persenSalah,
      },
      baris_env: `${tombol.env}=${disarankan}`,
    })
  }

  const totalDisaring = penyaringan.reduce((a, r) => a + r.totalDisaring, 0)
  const totalDipulihkan = penyaringan.reduce((a, r) => a + r.dipulihkan, 0)

  return {
    ambangBerlaku: config.antiFraud,
    totalDisaring,
    totalDipulihkan,
    persenSalahKeseluruhan: totalDisaring
      ? Number(((totalDipulihkan / totalDisaring) * 100).toFixed(1))
      : 0,
    usulan,
    diabaikan,
  }
}

// ---------------------------------------------------------------------
//  Matchmaker
// ---------------------------------------------------------------------

/**
 * Skor tiap komponen bersifat linear terhadap bobotnya (skor = bobot × fraksi),
 * jadi `rincian` yang sudah dikembalikan rekomendasiKreator() cukup untuk
 * menghitung ulang peringkat dengan bobot apa pun — tanpa menyalin logika
 * penilaian ke berkas ini, yang pasti akan lekas menyimpang dari aslinya.
 */
function fraksiKandidat(kampanyeId) {
  return rekomendasiKreator(kampanyeId, { batas: 1000 }).map((k) => {
    const fraksi = {}
    for (const [nama, bobot] of Object.entries(BOBOT_MATCHMAKER)) {
      fraksi[nama] = bobot ? (k.rincian[nama] ?? 0) / bobot : 0
    }
    return { kreatorId: k.kreatorId, fraksi }
  })
}

const skorDenganBobot = (fraksi, bobot) =>
  Object.entries(bobot).reduce((total, [nama, nilai]) => total + nilai * (fraksi[nama] ?? 0), 0)

/** Peringkat kreator terpilih di bawah satu susunan bobot. Null bila hilang. */
function peringkatDenganBobot(kandidat, kreatorId, bobot) {
  const urut = kandidat
    .map((k) => ({ kreatorId: k.kreatorId, skor: skorDenganBobot(k.fraksi, bobot) }))
    .sort((a, b) => b.skor - a.skor)
  const posisi = urut.findIndex((k) => k.kreatorId === kreatorId)
  return posisi === -1 ? null : posisi + 1
}

/** Susunan bobot kandidat: pindahkan 5 dan 10 poin antar tiap pasang komponen. */
function calonBobot() {
  const nama = Object.keys(BOBOT_MATCHMAKER)
  const daftar = [{ label: 'berlaku sekarang', bobot: { ...BOBOT_MATCHMAKER } }]

  for (const dari of nama) {
    for (const ke of nama) {
      if (dari === ke) continue
      for (const poin of [5, 10]) {
        if (BOBOT_MATCHMAKER[dari] - poin < 0) continue
        daftar.push({
          label: `${dari} −${poin} → ${ke} +${poin}`,
          bobot: {
            ...BOBOT_MATCHMAKER,
            [dari]: BOBOT_MATCHMAKER[dari] - poin,
            [ke]: BOBOT_MATCHMAKER[ke] + poin,
          },
        })
      }
    }
  }
  return daftar
}

function usulanMatchmaker() {
  const ketepatan = laporanKetepatanRekomendasi()
  const keputusan = db.prepare('SELECT kampanye_id, kreator_id FROM umpan_matchmaker').all()

  const dasar = {
    bobotBerlaku: BOBOT_MATCHMAKER,
    ...ketepatan,
  }

  if (keputusan.length < MIN_SAMPEL_KEPUTUSAN) {
    return {
      ...dasar,
      usulan: [],
      catatanUsulan: `Baru ${keputusan.length} keputusan tercatat; butuh minimal ${MIN_SAMPEL_KEPUTUSAN} sebelum bobot layak digeser.`,
    }
  }

  // Peringkat dihitung ulang dengan data hari ini, sementara skor aslinya
  // dibekukan saat keputusan diambil. Reputasi kreator berubah di antaranya,
  // jadi hasil di bawah adalah PERKIRAAN — cukup untuk mengurutkan pilihan,
  // tidak cukup untuk diklaim sebagai ukuran pasti.
  const cache = new Map()
  const berpasangan = []
  for (const { kampanye_id: kampanyeId, kreator_id: kreatorId } of keputusan) {
    if (!cache.has(kampanyeId)) cache.set(kampanyeId, fraksiKandidat(kampanyeId))
    const kandidat = cache.get(kampanyeId)
    if (kandidat.some((k) => k.kreatorId === kreatorId)) berpasangan.push({ kandidat, kreatorId })
  }

  if (berpasangan.length < MIN_SAMPEL_KEPUTUSAN) {
    return {
      ...dasar,
      usulan: [],
      catatanUsulan: `Hanya ${berpasangan.length} keputusan yang kreator dan kampanyenya masih bisa diperingkat ulang hari ini; butuh ${MIN_SAMPEL_KEPUTUSAN}.`,
    }
  }

  const hasil = calonBobot()
    .map(({ label, bobot }) => {
      let diPuncak = 0
      let jumlahPeringkat = 0
      for (const { kandidat, kreatorId } of berpasangan) {
        const peringkat = peringkatDenganBobot(kandidat, kreatorId, bobot)
        if (peringkat === 1) diPuncak += 1
        jumlahPeringkat += peringkat
      }
      return {
        label,
        bobot,
        persenPeringkat1: Number(((diPuncak / berpasangan.length) * 100).toFixed(1)),
        rerataPeringkat: Number((jumlahPeringkat / berpasangan.length).toFixed(2)),
      }
    })
    .sort((a, b) => b.persenPeringkat1 - a.persenPeringkat1 || a.rerataPeringkat - b.rerataPeringkat)

  const sekarang = hasil.find((h) => h.label === 'berlaku sekarang')
  const terbaik = hasil.filter((h) => h.label !== 'berlaku sekarang' && h.persenPeringkat1 > sekarang.persenPeringkat1)

  return {
    ...dasar,
    perkiraan: true,
    jumlahDireplay: berpasangan.length,
    ketepatanSekarangHasilReplay: sekarang,
    usulan: terbaik.slice(0, 3),
    catatanUsulan: terbaik.length
      ? 'Angka di bawah hasil replay dengan data hari ini, bukan skor asli saat keputusan diambil. Pakai untuk mengurutkan pilihan, bukan sebagai ukuran pasti.'
      : 'Tidak ada susunan bobot yang mengalahkan yang berlaku sekarang. Biarkan apa adanya.',
  }
}

// ---------------------------------------------------------------------

/** Satu objek berisi seluruh usulan; dipakai CLI dan ruang admin. */
export function usulanPenyetelan() {
  const antiFraud = usulanAntiFraud()
  const matchmaker = usulanMatchmaker()

  return {
    dibuatPada: new Date().toISOString(),
    antiFraud,
    matchmaker,
    barisEnv: antiFraud.usulan.map((u) => u.baris_env),
    adaUsulan: antiFraud.usulan.length > 0 || matchmaker.usulan.length > 0,
  }
}
