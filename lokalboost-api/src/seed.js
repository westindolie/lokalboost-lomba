/**
 * Seed basis data LokalBoost.
 *
 * Data inilah yang dilihat frontend — sejak antarmuka disambungkan ke API,
 * tidak ada lagi berkas data contoh di sisi web. Karena itu isinya dijaga
 * tetap masuk akal sebagai cerita: dua kampanye Bu Sari (satu berjalan, satu
 * mencari kreator), satu kampanye yang sudah selesai lengkap dengan ulasannya,
 * dan satu video yang menunggu moderasi admin.
 *
 * Jalankan: npm run seed
 */
import crypto from 'node:crypto'
import { db, kosongkanSemua, transaksional } from './lib/db.js'
import { config } from './config.js'
import { hashSandi } from './lib/auth.js'
import { buatId, hariLalu, hashIp } from './lib/util.js'
import { akrualKampanye, selesaikanKampanye, setorDana } from './services/escrow.js'
import { ALASAN_ANTIFRAUD } from './services/antifraud.js'
import { kirimNotifikasi } from './services/notifikasi.js'

const SANDI = 'lokalboost123'

const UMKM = [
  { id: 'umkm_baksoaci', nama: 'Oleh Sudrajat', usaha: 'Bakso Aci Mang Oleh', email: 'oleh@baksoaci.id', kategori: 'Kuliner', lokasi: 'Banda Aceh' },
  { id: 'umkm_nayala', nama: 'Nayla Rahmawati', usaha: 'Nayala Hijab', email: 'nayla@nayalahijab.id', kategori: 'Fashion', lokasi: 'Banda Aceh' },
  { id: 'umkm_busari', nama: 'Sari Handayani', usaha: 'Warung Nasi Khas Sunda Bu Sari', email: 'busari@warungsunda.id', kategori: 'Kuliner', lokasi: 'Banda Aceh' },
  { id: 'umkm_makicih', nama: 'Icih Kurniasih', usaha: 'Mak Icih Snack', email: 'icih@makicih.id', kategori: 'Kuliner', lokasi: 'Banda Aceh' },
  { id: 'umkm_bucucu', nama: 'Cucu Suminar', usaha: 'Warung Bu Cucu', email: 'cucu@warungbucucu.id', kategori: 'Kuliner', lokasi: 'Banda Aceh' },
  { id: 'umkm_kopihar', nama: 'Harun Setiawan', usaha: 'Kopi Tubruk Pak Har', email: 'har@kopitubruk.id', kategori: 'Kuliner', lokasi: 'Banda Aceh' },
]

const KREATOR = [
  { id: 'krtr_sari', nama: 'Sari Maharani', email: 'sari@kreator.id', niche: 'Kuliner', lokasi: 'Banda Aceh', pengikut: 120_000, terverifikasi: 1, bio: 'Ulasan makanan autentik dan edukasi resep nusantara.', gradasi: 'from-rose-200 to-amber-200' },
  { id: 'krtr_budi', nama: 'Budi Santoso', email: 'budi@kreator.id', niche: 'Fashion', lokasi: 'Aceh Besar', pengikut: 85_000, terverifikasi: 0, bio: 'Inspirasi busana harian dan kurator merek lokal.', gradasi: 'from-sky-200 to-indigo-200' },
  { id: 'krtr_anita', nama: 'Anita Wijaya', email: 'anita@kreator.id', niche: 'Hobi & Gadget', lokasi: 'Banda Aceh', pengikut: 240_000, terverifikasi: 1, bio: 'Ulasan gawai dan tips produktivitas untuk usaha kecil.', gradasi: 'from-violet-200 to-fuchsia-200' },
  { id: 'krtr_raka', nama: 'Raka Adi', email: 'raka@kreator.id', niche: 'Kuliner', lokasi: 'Banda Aceh', pengikut: 45_000, terverifikasi: 0, bio: 'Petualangan kuliner lokal dan ulasan tempat makan ramah kantong.', gradasi: 'from-lime-200 to-emerald-200' },
  { id: 'krtr_rafi', nama: 'Rafi Pratama', email: 'rafi@kreator.id', niche: 'Kuliner', lokasi: 'Banda Aceh', pengikut: 62_000, terverifikasi: 1, bio: 'Mahasiswa yang doyan berburu jajanan kaki lima.', gradasi: 'from-amber-200 to-orange-300' },
]

const KAMPANYE = [
  {
    id: 'bakso-aci', umkmId: 'umkm_baksoaci', nama: 'Promo Bakso Aci Mang Oleh',
    kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 10_000, tarifPerView: 85, anggaran: 850_000,
    tenggatHari: 2, kreatorId: 'krtr_rafi', gradasi: 'from-amber-200 to-orange-300',
    tervalidasi: 7240, disaring: 318,
    deskripsi: 'Bakso aci kuah gurih khas Garut dengan cuanki dan siomay. Kami ingin memperkenalkan varian pedas level 5 yang baru diluncurkan bulan ini kepada anak muda Banda Aceh.',
    brief: ['Tunjukkan momen kuah panas dituang ke mangkuk.', 'Sebutkan varian pedas level 5 sebagai menu baru.', 'Cantumkan lokasi warung di Jalan Teuku Nyak Arief, Darussalam.'],
    sebaran: [['Banda Aceh', 48], ['Aceh Besar', 19], ['Lhokseumawe', 14], ['Sabang', 11], ['Lainnya', 8]],
  },
  {
    id: 'hijab-nayala', umkmId: 'umkm_nayala', nama: 'Review Hijab Lokal "Nayala"',
    kategori: 'Fashion', lokasi: 'Banda Aceh', targetViews: 25_000, tarifPerView: 96, anggaran: 2_400_000,
    tenggatHari: 5, kreatorId: 'krtr_rafi', gradasi: 'from-rose-200 to-fuchsia-200',
    tervalidasi: 12_800, disaring: 542,
    deskripsi: 'Hijab voal premium yang adem dipakai seharian. Cocok untuk pekerja kantoran yang aktif dari pagi sampai malam.',
    brief: ['Bahan voal premium yang tidak panas seharian.', 'Cocok untuk ngantor atau hangout bareng teman.', 'Sebutkan promo diskon 100 pembeli pertama.'],
    sebaran: [['Banda Aceh', 41], ['Aceh Besar', 22], ['Lhokseumawe', 16], ['Pidie', 12], ['Lainnya', 9]],
  },
  {
    id: 'nasi-kotak', umkmId: 'umkm_busari', nama: 'Promo Paket Nasi Kotak',
    kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 5000, tarifPerView: 90, anggaran: 450_000,
    tenggatHari: 3, kreatorId: 'krtr_rafi', gradasi: 'from-lime-200 to-emerald-300',
    tervalidasi: 4650, disaring: 120,
    deskripsi: 'Paket nasi kotak untuk acara kantor dan arisan, lengkap dengan lauk khas Sunda dan sambal dadak.',
    brief: ['Perlihatkan isi lengkap satu kotak.', 'Sebutkan harga mulai Rp 18.000 per kotak.', 'Tekankan bisa pesan H-1.'],
    sebaran: [['Banda Aceh', 52], ['Aceh Besar', 18], ['Sabang', 15], ['Pidie', 9], ['Lainnya', 6]],
  },
  {
    id: 'kopi-tubruk', umkmId: 'umkm_kopihar', nama: 'Promo Kopi Tubruk Pak Har',
    // Cukup besar supaya saldo siap tarik Sari cukup untuk demo.
    // melewati ambang 2FA Rp 2 juta: alur "penarikan besar minta kode kedua"
    // bisa diperagakan langsung, tanpa harus menutup kampanye lain dulu.
    kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 12_000, tarifPerView: 250, anggaran: 3_100_000,
    tenggatHari: 0, kreatorId: 'krtr_sari', gradasi: 'from-amber-100 to-yellow-200',
    tervalidasi: 12_000, disaring: 384, selesai: true,
    deskripsi: 'Kopi tubruk robusta Gayo yang diseduh manual tiap pagi. Warungnya buka dari jam 5 subuh untuk pekerja pagi.',
    brief: ['Rekam proses seduh manual dari dekat.', 'Sebutkan harga Rp 8.000 per gelas.', 'Tunjukkan suasana warung saat subuh.'],
    sebaran: [['Banda Aceh', 61], ['Aceh Besar', 21], ['Lhokseumawe', 10], ['Lainnya', 8]],
  },
  {
    id: 'kue-lebaran', umkmId: 'umkm_busari', nama: 'Review Kue Kering Lebaran',
    kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 6000, tarifPerView: 83, anggaran: 500_000,
    tenggatHari: 12, kreatorId: null, gradasi: 'from-amber-100 to-yellow-200',
    tervalidasi: 0, disaring: 0,
    deskripsi: 'Kue kering rumahan untuk Lebaran: nastar, kastengel, dan putri salju. Diproduksi harian tanpa pengawet.',
    brief: ['Perlihatkan tekstur nastar saat dibelah.', 'Sebutkan tanpa pengawet, tahan 3 minggu.', 'Ajak pesan sebelum H-14 Lebaran.'],
    sebaran: [],
  },
  {
    id: 'kripik-icih', umkmId: 'umkm_makicih', nama: 'Kripik Pedas Mak Icih',
    kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 15_000, tarifPerView: 33, anggaran: 500_000,
    tenggatHari: 9, kreatorId: null, gradasi: 'from-amber-200 to-red-300',
    tervalidasi: 0, disaring: 0,
    deskripsi: 'Kripik singkong pedas level 1-10 dengan bumbu balado rumahan. Target anak muda pencinta pedas.',
    brief: ['Tantangan makan level 10 di depan kamera.', 'Sebutkan varian rasa selain balado.', 'Cantumkan link pemesanan di bio.'],
    sebaran: [],
  },
  {
    id: 'nasi-sunda', umkmId: 'umkm_bucucu', nama: 'Warung Nasi Sunda Bu Cucu',
    kategori: 'Kuliner', lokasi: 'Banda Aceh', targetViews: 20_000, tarifPerView: 43, anggaran: 850_000,
    tenggatHari: 14, kreatorId: null, gradasi: 'from-lime-200 to-emerald-300',
    tervalidasi: 0, disaring: 0,
    deskripsi: 'Warung nasi Sunda prasmanan dengan lebih dari 20 pilihan lauk. Buka dari subuh sampai malam.',
    brief: ['Sorot deretan lauk prasmanan.', 'Sebutkan harga rata-rata sekali makan.', 'Tunjukkan suasana warung saat ramai.'],
    sebaran: [],
  },
]

/**
 * Foto produk kampanye: foto asli berlisensi Creative Commons (Wikimedia
 * Commons & Flickr lewat Openverse), dipotong 4:3 dan disimpan sebagai WebP di
 * lokalboost-web/public/gambar/kampanye/. Lisensi BY/BY-SA mewajibkan atribusi,
 * jadi kreditnya ikut disimpan dan ditampilkan di halaman detail kampanye.
 */
const KREDIT_FOTO = {
  'bakso-aci': { pembuat: 'Nssdfdsfds (Wikipedia bahasa Inggris)', lisensi: 'CC BY-SA 2.0', lisensiUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', sumber: 'https://commons.wikimedia.org/w/index.php?curid=6420515' },
  'hijab-nayala': { pembuat: 'cakersandco', lisensi: 'CC BY 2.0', lisensiUrl: 'https://creativecommons.org/licenses/by/2.0/', sumber: 'https://www.flickr.com/photos/31512796@N00/4249801312' },
  'nasi-kotak': { pembuat: 'Midori', lisensi: 'CC BY 3.0', lisensiUrl: 'https://creativecommons.org/licenses/by/3.0/', sumber: 'https://commons.wikimedia.org/w/index.php?curid=13300443' },
  'kopi-tubruk': { pembuat: 'modomatic', lisensi: 'CC BY 2.0', lisensiUrl: 'https://creativecommons.org/licenses/by/2.0/', sumber: 'https://www.flickr.com/photos/8550448@N07/3547098737' },
  'kue-lebaran': { pembuat: 'Taman Renyah', lisensi: 'CC BY-SA 3.0', lisensiUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', sumber: 'https://commons.wikimedia.org/w/index.php?curid=16260635' },
  'kripik-icih': { pembuat: 'Sakurai Midori', lisensi: 'CC BY-SA 3.0', lisensiUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', sumber: 'https://commons.wikimedia.org/w/index.php?curid=4724967' },
  'nasi-sunda': { pembuat: 'Astari28', lisensi: 'CC BY-SA 4.0', lisensiUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', sumber: 'https://commons.wikimedia.org/w/index.php?curid=127975721' },
}

const PERANGKAT = ['Android', 'iOS', 'Android', 'Android', 'Desktop']
const UA_ASLI = [
  'Mozilla/5.0 (Linux; Android 13; SM-A martin) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
]
const UA_BOT = ['python-requests/2.31.0', 'HeadlessChrome/120.0.0.0', 'curl/8.4.0', 'Scrapy/2.11']

const acak = (daftar) => daftar[Math.floor(Math.random() * daftar.length)]

/** Pilih kota berdasarkan bobot sebaran agar grafik laporan realistis. */
function kotaBerbobot(sebaran) {
  if (!sebaran.length) return 'Lainnya'
  const total = sebaran.reduce((a, [, p]) => a + p, 0)
  let r = Math.random() * total
  for (const [kota, p] of sebaran) {
    r -= p
    if (r <= 0) return kota
  }
  return sebaran[0][0]
}

/**
 * Buat tayangan langsung ke tabel dengan flag `valid` yang sudah ditentukan.
 * Sengaja tidak lewat periksaTayangan() — di sini kami ingin komposisi
 * valid/disaring yang persis, bukan hasil pemeriksaan ulang.
 */
function buatTayangan(kampanye, videoId, jumlahValid, jumlahDisaring) {
  const stmt = db.prepare(
    `INSERT INTO tayangan
       (video_id, kampanye_id, ip_hash, perangkat, user_agent, kota, durasi_tonton, waktu, valid, alasan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const alasanDisaring = [
    ALASAN_ANTIFRAUD.BOT,
    ALASAN_ANTIFRAUD.SINGKAT,
    ALASAN_ANTIFRAUD.IP_BERULANG,
    ALASAN_ANTIFRAUD.DUPLIKAT,
    ALASAN_ANTIFRAUD.LONJAKAN,
  ]

  // Bobot hari: makin dekat hari ini makin ramai, meniru kurva kampanye nyata.
  const bobotHari = [0.08, 0.11, 0.14, 0.13, 0.19, 0.20, 0.15]
  const hariUntuk = () => {
    let r = Math.random()
    for (let i = 0; i < bobotHari.length; i++) {
      r -= bobotHari[i]
      if (r <= 0) return 6 - i
    }
    return 0
  }

  const waktuAcak = () => {
    const h = hariUntuk()
    const dasar = new Date(Date.now() - h * 86_400_000)
    dasar.setHours(6 + Math.floor(Math.random() * 17), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60))
    return dasar.toISOString().slice(0, 19).replace('T', ' ')
  }

  for (let i = 0; i < jumlahValid; i++) {
    stmt.run(
      videoId, kampanye.id, hashIp(`asli-${kampanye.id}-${i}-${crypto.randomInt(1e6)}`),
      acak(PERANGKAT), acak(UA_ASLI), kotaBerbobot(kampanye.sebaran),
      12 + Math.floor(Math.random() * 25), waktuAcak(), 1, null,
    )
  }

  for (let i = 0; i < jumlahDisaring; i++) {
    const alasan = acak(alasanDisaring)
    const bot = alasan === ALASAN_ANTIFRAUD.BOT
    stmt.run(
      videoId, kampanye.id,
      // Tayangan curang biasanya berasal dari kumpulan IP yang kecil dan berulang.
      hashIp(`palsu-${kampanye.id}-${i % 12}`),
      bot ? 'Tidak dikenal' : acak(PERANGKAT),
      bot ? acak(UA_BOT) : acak(UA_ASLI),
      kotaBerbobot(kampanye.sebaran),
      alasan === ALASAN_ANTIFRAUD.SINGKAT ? 1 + Math.floor(Math.random() * 2) : 8 + Math.floor(Math.random() * 10),
      waktuAcak(), 0, alasan,
    )
  }
}

// =====================================================================

console.log('Mengosongkan basis data...')
kosongkanSemua()

const sandiHash = hashSandi(SANDI)

console.log('Membuat akun...')
transaksional(() => {
  const tambahPengguna = db.prepare(
    `INSERT INTO pengguna (id, peran, nama, email, kata_sandi_hash, terverifikasi, dibuat_pada)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  )
  const tambahDompet = db.prepare('INSERT INTO dompet (pengguna_id) VALUES (?)')

  tambahPengguna.run('admin_lokalboost', 'admin', 'Admin LokalBoost', 'admin@lokalboost.id', sandiHash, hariLalu(90))
  tambahDompet.run('admin_lokalboost')

  for (const u of UMKM) {
    tambahPengguna.run(u.id, 'umkm', u.nama, u.email, sandiHash, hariLalu(60))
    tambahDompet.run(u.id)
    db.prepare(
      `INSERT INTO profil_umkm (pengguna_id, nama_usaha, kategori, lokasi, deskripsi, target_audiens, terverifikasi)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run(u.id, u.usaha, u.kategori, u.lokasi, `${u.usaha} di ${u.lokasi}.`, 'Anak muda 18-35 tahun di sekitar kota')
  }

  for (const k of KREATOR) {
    tambahPengguna.run(k.id, 'kreator', k.nama, k.email, sandiHash, hariLalu(45))
    tambahDompet.run(k.id)
    db.prepare(
      // Avatar: Open Peeps (Pablo Stanley, CC0) lewat DiceBear, disimpan sebagai SVG.
      `INSERT INTO profil_kreator (pengguna_id, niche, lokasi, pengikut, bio, terverifikasi, gradasi, foto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(k.id, k.niche, k.lokasi, k.pengikut, k.bio, k.terverifikasi, k.gradasi, `/gambar/kreator/${k.id}.svg`)
  }
})()

console.log('Mengisi katalog produk...')
// Katalog contoh supaya pilihan "Reward Produk" di halaman Target & Anggaran
// punya isi saat demo. Foto dikosongkan: tidak ada foto produk asli.
transaksional(() => {
  const produk = [
    { id: 'prd_nasi_kotak', umkmId: 'umkm_busari', nama: 'Paket Nasi Kotak Ayam Bakar', nilai: 25_000, stok: 40 },
    { id: 'prd_kue_kering', umkmId: 'umkm_busari', nama: 'Kue Kering Nastar 500 gr', nilai: 85_000, stok: 15 },
  ]
  const stmt = db.prepare('INSERT INTO produk (id, umkm_id, nama, nilai, stok) VALUES (?, ?, ?, ?, ?)')
  for (const p of produk) stmt.run(p.id, p.umkmId, p.nama, p.nilai, p.stok)
})()

console.log('Membuat kampanye...')
transaksional(() => {
  for (const k of KAMPANYE) {
    db.prepare(
      `INSERT INTO kampanye
         (id, umkm_id, nama, kategori, lokasi, deskripsi, target_views, tarif_per_view,
          anggaran, batas_maks_biaya, tenggat_hari, status, gradasi, gambar, gambar_kredit, dibuat_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'menunggu_dana', ?, ?, ?, ?)`,
    ).run(
      k.id, k.umkmId, k.nama, k.kategori, k.lokasi, k.deskripsi, k.targetViews, k.tarifPerView,
      k.anggaran, k.anggaran, k.tenggatHari, k.gradasi,
      KREDIT_FOTO[k.id] ? `/gambar/kampanye/${k.id}.webp` : null,
      KREDIT_FOTO[k.id] ? JSON.stringify(KREDIT_FOTO[k.id]) : null,
      hariLalu(14),
    )
    const stmt = db.prepare('INSERT INTO kampanye_brief (kampanye_id, isi, urutan) VALUES (?, ?, ?)')
    k.brief.forEach((isi, i) => stmt.run(k.id, isi, i))
    db.prepare("INSERT INTO escrow (kampanye_id, status) VALUES (?, 'kosong')").run(k.id)
  }
})()

console.log('Menyetor dana ke Rekber...')
for (const k of KAMPANYE) setorDana({ kampanyeId: k.id, umkmId: k.umkmId, jumlah: k.anggaran })

console.log('Menugaskan kreator & membuat video...')
transaksional(() => {
  for (const k of KAMPANYE) {
    if (!k.kreatorId) {
      db.prepare("UPDATE kampanye SET status = 'berjalan', diterbitkan_pada = ? WHERE id = ?")
        .run(hariLalu(4), k.id)
      continue
    }

    db.prepare(
      `INSERT INTO lamaran (kampanye_id, kreator_id, jenis, pesan, status, dibuat_pada)
       VALUES (?, ?, 'lamaran', ?, 'disetujui', ?)`,
    ).run(k.id, k.kreatorId, 'Saya tertarik dan sudah punya konsep videonya.', hariLalu(10))

    db.prepare("UPDATE kampanye SET kreator_id = ?, status = 'berjalan', diterbitkan_pada = ? WHERE id = ?")
      .run(k.kreatorId, hariLalu(10), k.id)

    const videoId = buatId('vid')
    db.prepare(
      `INSERT INTO video (id, kampanye_id, kreator_id, judul, durasi_detik, status, moderasi, dibuat_pada)
       VALUES (?, ?, ?, ?, ?, 'tayang', 'lolos', ?)`,
    ).run(videoId, k.id, k.kreatorId, `${k.nama} — versi 30 detik`, 32, hariLalu(8))

    if (k.tervalidasi || k.disaring) {
      buatTayangan(k, videoId, k.tervalidasi, k.disaring)
    }
  }
})()

// Satu video yang belum ditinjau, supaya antrean moderasi Admin Platform
// (PRD §4.3) ada isinya sejak awal dan tombolnya bisa didemokan.
db.prepare(
  `INSERT INTO video (id, kampanye_id, kreator_id, judul, durasi_detik, status, moderasi, dibuat_pada)
   VALUES (?, 'bakso-aci', 'krtr_rafi', ?, 41, 'diproses', 'menunggu', ?)`,
).run(buatId('vid'), 'Tantangan Pedas Level 5 — versi panjang', hariLalu(1))

console.log('Menghitung Pay-Per-View...')
for (const k of KAMPANYE) {
  if (!k.kreatorId) continue
  akrualKampanye(k.id)
  if (k.selesai) selesaikanKampanye(k.id, { alasan: 'Target tayangan tercapai' })
}

console.log('Menulis ulasan & notifikasi...')
transaksional(() => {
  const selesai = KAMPANYE.filter((k) => k.selesai)
  for (const k of selesai) {
    const kmp = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(k.id)
    db.prepare(
      `INSERT INTO ulasan (kampanye_id, penilai_id, dinilai_id, peran_penilai, bintang, komentar, dibuat_pada)
       VALUES (?, ?, ?, 'umkm', 5, ?, ?)`,
    ).run(k.id, kmp.umkm_id, kmp.kreator_id, 'Videonya rapi dan sesuai brief. Warung jadi ramai sejak videonya tayang.', hariLalu(1))
    db.prepare(
      `INSERT INTO ulasan (kampanye_id, penilai_id, dinilai_id, peran_penilai, bintang, komentar, dibuat_pada)
       VALUES (?, ?, ?, 'kreator', 5, ?, ?)`,
    ).run(k.id, kmp.kreator_id, kmp.umkm_id, 'Briefnya jelas dan pembayaran lancar. Senang kerja sama lagi.', hariLalu(1))
  }

  // Ulasan tambahan agar skor Matchmaker punya sejarah yang bervariasi.
  const kmpBakso = db.prepare("SELECT * FROM kampanye WHERE id = 'bakso-aci'").get()
  db.prepare(
    `INSERT INTO ulasan (kampanye_id, penilai_id, dinilai_id, peran_penilai, bintang, komentar, dibuat_pada)
     VALUES (?, ?, ?, 'umkm', 5, ?, ?)`,
  ).run('bakso-aci', kmpBakso.umkm_id, kmpBakso.kreator_id, 'Cepat tanggap dan hasilnya bagus.', hariLalu(3))
})()

console.log('Mengisi portofolio kreator...')
transaksional(() => {
  /*
   * Lapis 2 & 3 dari AI Portfolio Auto-builder.
   *
   * PENTING: baris `terkonfirmasi = 1` di bawah adalah DATA CONTOH, bukan
   * hasil panggilan oEmbed sungguhan. Seed tidak boleh menyentuh jaringan:
   * ia ikut berjalan di dalam build Vercel, dan satu kedutan jaringan akan
   * menggagalkan seluruh deploy. Konfirmasi asli terjadi saat kreator
   * menempel tautan lewat POST /api/kreator/saya/portofolio/tautan.
   */
  const tambahTautan = db.prepare(
    `INSERT INTO portofolio_tautan
       (kreator_id, platform, url, judul, penulis, penulis_akun, thumbnail, terkonfirmasi, dibuat_pada)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  )

  tambahTautan.run('krtr_rafi', 'tiktok', 'https://www.tiktok.com/@rafijajan/video/7301234567890123456',
    'Bakso aci kuah pedas Rp10.000 di Banda Aceh', 'Rafi Pratama', 'rafijajan', 1, hariLalu(12))
  tambahTautan.run('krtr_rafi', 'tiktok', 'https://www.tiktok.com/@rafijajan/video/7298765432109876543',
    'Seblak paling nagih dekat kampus', 'Rafi Pratama', 'rafijajan', 1, hariLalu(25))
  // Tautan non-TikTok memang tidak bisa dikonfirmasi otomatis. Sengaja
  // diikutkan supaya antarmuka yang membedakan centang benar-benar teruji.
  tambahTautan.run('krtr_rafi', 'instagram', 'https://www.instagram.com/reel/CxyzAbc1234/',
    null, null, null, 0, hariLalu(30))
  tambahTautan.run('krtr_sari', 'tiktok', 'https://www.tiktok.com/@sarimaharani/video/7305555555555555555',
    'Resep sambal cibiuk rumahan', 'Sari Maharani', 'sarimaharani', 1, hariLalu(8))

})()

kirimNotifikasi('krtr_rafi', {
  jenis: 'kampanye',
  judul: 'Kampanye baru cocok untukmu',
  isi: '"Kripik Pedas Mak Icih" cocok dengan niche dan lokasimu.',
  tautan: '/kampanye/kripik-icih',
})

// ---------------------------------------------------------------------

// Seluruh isi seed adalah karangan untuk demo. seed.js mengosongkan basis
// data lebih dulu, jadi semua akun yang ada sekarang adalah akun contoh.
db.prepare('UPDATE pengguna SET contoh = 1').run()

// Snapshot demo hanya menyiapkan akun untuk login. Kampanye, saldo, transaksi,
// tayangan contoh, dan tautan portofolio palsu tidak boleh tampak seperti hasil
// yang sudah diperoleh kreator atau UMKM.
if (config.modeDemo) {
  transaksional(() => {
    db.prepare('DELETE FROM kampanye').run()
    db.prepare('DELETE FROM transaksi').run()
    db.prepare('DELETE FROM pembayaran').run()
    db.prepare('DELETE FROM notifikasi').run()
    db.prepare('DELETE FROM portofolio_tautan').run()
    db.prepare('DELETE FROM produk').run()
    db.prepare('UPDATE dompet SET saldo = 0, saldo_tertahan = 0').run()
  })()
}

const hitung = (sql) => db.prepare(sql).get().n

console.log('')
console.log('  Seed selesai.')
console.log(`  Pengguna        ${hitung('SELECT COUNT(*) AS n FROM pengguna')}`)
console.log(`  Kampanye        ${hitung('SELECT COUNT(*) AS n FROM kampanye')}`)
console.log(`  Tayangan asli   ${hitung('SELECT COUNT(*) AS n FROM tayangan WHERE valid = 1')}`)
console.log(`  Tayangan saring ${hitung('SELECT COUNT(*) AS n FROM tayangan WHERE valid = 0')}`)
console.log(`  Transaksi       ${hitung('SELECT COUNT(*) AS n FROM transaksi')}`)
console.log('')
console.log(`  Semua akun memakai kata sandi: ${SANDI}`)
console.log('  UMKM     oleh@baksoaci.id, busari@warungsunda.id, ...')
console.log('  Kreator  rafi@kreator.id, sari@kreator.id, ...')
console.log('  Admin    admin@lokalboost.id')
console.log('')
