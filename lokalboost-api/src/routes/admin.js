import { Router } from 'express'
import { db } from '../lib/db.js'
import { config } from '../config.js'
import { wajibPeran } from '../lib/auth.js'
import { bungkus, galat400, galat404, wajibAda } from '../lib/util.js'
import { kirimNotifikasi } from '../services/notifikasi.js'
import { laporanKetepatanPenyaringan } from '../services/antifraud.js'
import { BOBOT_MATCHMAKER, laporanKetepatanRekomendasi } from '../services/matchmaker.js'
import { usulanPenyetelan } from '../services/penyetel.js'
import { bacaModerasi, bagianKampanye } from '../services/moderasi-kampanye.js'
import { sekarang } from '../lib/util.js'

/**
 * Ruang Admin Platform — PRD §4.3 Persona 3:
 * "Mengawasi transaksi, sengketa (dispute), dan kualitas konten di platform."
 *
 * Sengketa sudah punya rutenya sendiri (routes/sengketa.js), jadi di sini
 * yang dilayani adalah dua tugas sisanya: pengawasan transaksi lintas
 * kampanye dan antrean moderasi konten. Ditambah verifikasi akun, karena
 * PRD §9 meminta "verifikasi identitas UMKM" dan §6.1 menyebut verifikasi
 * tingkat dasar — keduanya butuh seseorang yang berwenang menekan tombolnya.
 *
 * Seluruh rute di berkas ini hanya untuk peran admin.
 */

export const rutaAdmin = Router()

rutaAdmin.use(wajibPeran('admin'))

const angka = (sql, ...args) => db.prepare(sql).get(...args).n

/**
 * GET /api/admin/ringkasan
 * Satu panggilan untuk seluruh kartu di halaman Ringkasan Platform.
 */
rutaAdmin.get(
  '/ringkasan',
  bungkus((_req, res) => {
    const total = angka('SELECT COUNT(*) AS n FROM tayangan')
    const tervalidasi = angka('SELECT COUNT(*) AS n FROM tayangan WHERE valid = 1')
    const disaring = total - tervalidasi

    res.json({
      pengguna: {
        umkm: angka("SELECT COUNT(*) AS n FROM pengguna WHERE peran = 'umkm'"),
        kreator: angka("SELECT COUNT(*) AS n FROM pengguna WHERE peran = 'kreator'"),
        belumTerverifikasi: angka('SELECT COUNT(*) AS n FROM pengguna WHERE terverifikasi = 0'),
      },
      kampanye: {
        total: angka('SELECT COUNT(*) AS n FROM kampanye'),
        berjalan: angka("SELECT COUNT(*) AS n FROM kampanye WHERE status = 'berjalan'"),
        berjalanTanpaKreator: angka("SELECT COUNT(*) AS n FROM kampanye k WHERE status = 'berjalan' AND NOT EXISTS (SELECT 1 FROM lamaran l WHERE l.kampanye_id = k.id AND l.status = 'disetujui')"),
        selesai: angka("SELECT COUNT(*) AS n FROM kampanye WHERE status = 'selesai'"),
      },
      keuangan: {
        // Dana di Rekber = yang disetor tapi belum dicairkan pada kampanye
        // yang belum ditutup. Kampanye selesai sudah tidak menahan apa pun.
        danaDiRekber: angka(
          `SELECT COALESCE(SUM(e.jumlah_disetor - e.jumlah_dicairkan), 0) AS n
           FROM escrow e JOIN kampanye k ON k.id = e.kampanye_id
           WHERE k.status != 'selesai'`,
        ),
        totalDisetor: angka('SELECT COALESCE(SUM(jumlah_disetor), 0) AS n FROM escrow'),
        komisiTerkumpul: angka('SELECT COALESCE(SUM(komisi_platform), 0) AS n FROM escrow'),
        // Pendapatan LokalBoost di luar Rekber (services/biaya-pasang.js).
        biayaPasangTerkumpul: angka(
          "SELECT COALESCE(SUM(jumlah), 0) AS n FROM pembayaran WHERE jenis = 'biaya_pasang' AND status = 'lunas'",
        ),
        biayaPasangTarif: config.biayaPasang,
        dicairkanKeKreator: angka(
          "SELECT COALESCE(SUM(nominal), 0) AS n FROM transaksi WHERE jenis = 'pencairan'",
        ),
        dikembalikanKeUmkm: angka(
          "SELECT COALESCE(SUM(nominal), 0) AS n FROM transaksi WHERE jenis = 'refund'",
        ),
        komisiPersen: config.komisiPersen,
      },
      antiFraud: {
        totalTayangan: total,
        tervalidasi,
        disaring,
        persenDisaring: total ? Number(((disaring / total) * 100).toFixed(1)) : 0,
        rincian: db
          .prepare(
            `SELECT alasan, COUNT(*) AS jumlah FROM tayangan
             WHERE valid = 0 AND alasan IS NOT NULL
             GROUP BY alasan ORDER BY jumlah DESC`,
          )
          .all(),
      },
      sengketa: {
        total: angka('SELECT COUNT(*) AS n FROM sengketa'),
        terbuka: angka("SELECT COUNT(*) AS n FROM sengketa WHERE status IN ('terbuka','ditinjau')"),
      },
      konten: {
        menungguModerasi: angka("SELECT COUNT(*) AS n FROM video WHERE moderasi = 'menunggu'"),
      },
    })
  }),
)

/**
 * GET /api/admin/kampanye
 * Neraca dana per kampanye. Kolom-kolomnya sengaja mengikuti aturan yang
 * dipegang escrow.js: bagian kreator + komisi + sisa = dana disetor. Kalau
 * suatu hari selisihnya tidak nol, halaman ini yang akan menunjukkannya.
 */
rutaAdmin.get(
  '/kampanye',
  bungkus((_req, res) => {
    const daftar = db
      .prepare(
        `SELECT k.id, k.nama, k.status, k.anggaran, k.tarif_per_view, k.target_views,
                p.nama AS nama_umkm, pu.nama_usaha,
                kr.nama AS nama_kreator,
                COALESCE(e.jumlah_disetor, 0) AS disetor,
                COALESCE(e.jumlah_dicairkan, 0) AS terpakai,
                COALESCE(e.komisi_platform, 0) AS komisi,
                COALESCE(e.jumlah_dikembalikan, 0) AS dikembalikan,
                (SELECT COUNT(*) FROM tayangan t WHERE t.kampanye_id = k.id AND t.valid = 1)
                  + (SELECT COALESCE(SUM(v.views_diakui), 0) FROM video v
                     WHERE v.kampanye_id = k.id AND v.sumber = 'tautan' AND v.status = 'tayang') AS tervalidasi,
                (SELECT COUNT(*) FROM tayangan t WHERE t.kampanye_id = k.id AND t.valid = 0) AS disaring,
                (SELECT COUNT(*) FROM lamaran l WHERE l.kampanye_id = k.id AND l.status = 'disetujui') AS jumlah_kreator
         FROM kampanye k
         JOIN pengguna p ON p.id = k.umkm_id
         LEFT JOIN profil_umkm pu ON pu.pengguna_id = k.umkm_id
         LEFT JOIN pengguna kr ON kr.id = k.kreator_id
         LEFT JOIN escrow e ON e.kampanye_id = k.id
         ORDER BY k.dibuat_pada DESC`,
      )
      .all()

    res.json({
      kampanye: daftar.map((k) => {
        const diterimaKreator = k.terpakai - k.komisi
        const sisaDitahan = k.disetor - k.terpakai
        // Kampanye yang sudah ditutup mengembalikan sisanya ke UMKM; yang
        // masih berjalan menahannya di Rekber. Keduanya harus menutup neraca
        // terhadap dana yang disetor.
        const keluar =
          diterimaKreator + k.komisi + (k.status === 'selesai' ? k.dikembalikan : sisaDitahan)

        return {
          id: k.id,
          nama: k.nama,
          status: k.status,
          umkm: k.nama_usaha || k.nama_umkm,
          kreator: k.nama_kreator,
          jumlahKreator: k.jumlah_kreator,
          anggaran: k.anggaran,
          targetViews: k.target_views,
          tarifPerView: k.tarif_per_view,
          tervalidasi: k.tervalidasi,
          disaring: k.disaring,
          disetor: k.disetor,
          terpakai: k.terpakai,
          komisi: k.komisi,
          diterimaKreator,
          sisaDitahan,
          dikembalikan: k.dikembalikan,
          // Ditampilkan apa adanya supaya admin tidak perlu percaya begitu
          // saja bahwa neraca escrow tertutup. Harus selalu nol.
          selisihNeraca: k.disetor - keluar,
        }
      }),
    })
  }),
)

/**
 * GET /api/admin/konten
 * Antrean kualitas konten. Video yang belum diputus muncul lebih dulu.
 */
rutaAdmin.get(
  '/konten',
  bungkus((req, res) => {
    const syarat = req.query.moderasi ? 'WHERE v.moderasi = ?' : ''
    const nilai = req.query.moderasi ? [req.query.moderasi] : []

    const daftar = db
      .prepare(
        `SELECT v.*, k.nama AS nama_kampanye, p.nama AS nama_kreator,
                (SELECT COUNT(*) FROM tayangan t WHERE t.video_id = v.id AND t.valid = 1) AS views
         FROM video v
         JOIN kampanye k ON k.id = v.kampanye_id
         JOIN pengguna p ON p.id = v.kreator_id
         ${syarat}
         ORDER BY CASE WHEN v.views_tertahan > 0 THEN 0 WHEN v.moderasi = 'menunggu' THEN 1 ELSE 2 END,
                  v.dibuat_pada DESC`,
      )
      .all(...nilai)

    res.json({
      konten: daftar.map((v) => ({
        id: v.id,
        judul: v.judul,
        kampanyeId: v.kampanye_id,
        kampanye: v.nama_kampanye,
        kreatorId: v.kreator_id,
        kreator: v.nama_kreator,
        durasiDetik: v.durasi_detik,
        status: v.status,
        moderasi: v.moderasi,
        catatanModerasi: v.catatan_moderasi,
        etika: v.etika_hasil ? JSON.parse(v.etika_hasil) : null,
        // Video tautan: views dari platform, bukan dari pemutar LokalBoost.
        sumber: v.sumber || 'unggah',
        url: v.url || null,
        akunPenulis: v.akun_penulis || null,
        kecocokan: v.kecocokan || null,
        views: v.sumber === 'tautan' ? v.views_diakui : v.views,
        viewsTertahan: v.views_tertahan || 0,
        dibuatPada: v.dibuat_pada,
      })),
    })
  }),
)

/**
 * POST /api/admin/konten/:id/moderasi
 * Body: { keputusan: "lolos" | "revisi", catatan? }
 *
 * "revisi", bukan "tolak": video yang bermasalah dikembalikan ke kreator
 * untuk diperbaiki, bukan dihapus. Kreator selalu diberi tahu alasannya —
 * keputusan tanpa alasan adalah cacat kepercayaan yang sama seperti
 * penyaringan anti-fraud tanpa rincian.
 */
rutaAdmin.post(
  '/konten/:id/moderasi',
  bungkus((req, res) => {
    const { keputusan } = wajibAda(req.body, ['keputusan'])
    if (!['lolos', 'revisi'].includes(keputusan)) {
      throw galat400('Keputusan moderasi harus "lolos" atau "revisi".')
    }

    const video = db.prepare('SELECT * FROM video WHERE id = ?').get(req.params.id)
    if (!video) throw galat404('Video tidak ditemukan.')

    const catatan = req.body?.catatan || null
    if (keputusan === 'revisi' && !catatan) {
      throw galat400('Permintaan revisi wajib disertai catatan untuk kreator.')
    }

    // Putusan admin mengikat: tandanya mencegah pemilik usaha membatalkan
    // penahanan lewat /api/video/:id/setujui-umkm.
    const etika = {
      ...(video.etika_hasil ? JSON.parse(video.etika_hasil) : {}),
      keputusanAdmin: { keputusan, catatan, oleh: req.pengguna.id, pada: sekarang() },
    }
    db.prepare(
      'UPDATE video SET moderasi = ?, catatan_moderasi = ?, status = ?, etika_hasil = ? WHERE id = ?',
    ).run(keputusan, catatan, keputusan === 'lolos' ? 'tayang' : 'ditolak', JSON.stringify(etika), video.id)

    const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(video.kampanye_id)
    kirimNotifikasi(video.kreator_id, {
      jenis: 'kampanye',
      judul: keputusan === 'lolos' ? 'Video Anda lolos tinjauan' : 'Video Anda perlu direvisi',
      isi:
        keputusan === 'lolos'
          ? `"${video.judul}" sudah lolos tinjauan kualitas dan boleh tayang.`
          : `"${video.judul}" perlu diperbaiki. Catatan tim: ${catatan}`,
      tautan: `/kampanye/${kampanye.id}`,
      // Revisi menahan pekerjaan kreator, jadi ia perlu tahu tanpa harus
      // kebetulan membuka situs. Kabar "lolos" cukup menunggu di lonceng.
      email: keputusan !== 'lolos',
    })

    res.json({
      pesan: keputusan === 'lolos' ? 'Video diloloskan.' : 'Permintaan revisi dikirim ke kreator.',
      konten: { id: video.id, moderasi: keputusan, catatanModerasi: catatan },
    })
  }),
)

/**
 * GET /api/admin/moderasi-kampanye?status=tinjau
 * Antrean pemeriksaan etika kampanye (services/moderasi-kampanye.js).
 * Tanpa filter: semua yang belum lolos, yang menunggu tinjauan lebih dulu.
 */
rutaAdmin.get(
  '/moderasi-kampanye',
  bungkus((req, res) => {
    const status = req.query.status
    const daftar = db
      .prepare(
        `SELECT k.*, COALESCE(pu.nama_usaha, p.nama) AS nama_umkm
         FROM kampanye k
         JOIN pengguna p ON p.id = k.umkm_id
         LEFT JOIN profil_umkm pu ON pu.pengguna_id = k.umkm_id
         WHERE ${status ? 'k.moderasi_status = ?' : "k.moderasi_status IN ('tinjau','ditolak')"}
         ORDER BY CASE k.moderasi_status WHEN 'tinjau' THEN 0 ELSE 1 END, k.moderasi_pada DESC`,
      )
      .all(...(status ? [status] : []))

    res.json({
      kampanye: daftar.map((k) => ({
        id: k.id,
        nama: k.nama,
        umkm: k.nama_umkm,
        status: k.status,
        isi: bagianKampanye(
          k,
          db.prepare('SELECT isi FROM kampanye_brief WHERE kampanye_id = ? ORDER BY urutan, id').all(k.id).map((b) => b.isi),
        ),
        moderasi: bacaModerasi(k),
        diperiksaPada: k.moderasi_pada,
      })),
    })
  }),
)

/**
 * POST /api/admin/moderasi-kampanye/:id
 * Body: { keputusan: "lolos" | "ditolak", catatan? }
 * Penolakan wajib beralasan: UMKM perlu tahu kalimat mana yang harus diubah.
 */
rutaAdmin.post(
  '/moderasi-kampanye/:id',
  bungkus((req, res) => {
    const { keputusan } = wajibAda(req.body, ['keputusan'])
    if (!['lolos', 'ditolak'].includes(keputusan)) {
      throw galat400('Keputusan harus "lolos" atau "ditolak".')
    }
    const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(req.params.id)
    if (!k) throw galat404('Kampanye tidak ditemukan.')
    const catatan = String(req.body?.catatan || '').trim() || null
    if (keputusan === 'ditolak' && !catatan) throw galat400('Penolakan wajib disertai catatan untuk UMKM.')

    const { status: _s, ...lama } = bacaModerasi(k)
    const hasil = {
      ...lama,
      alasan:
        keputusan === 'lolos'
          ? 'Ditinjau tim LokalBoost: kampanye boleh ditayangkan.'
          : `Ditinjau tim LokalBoost: ${catatan}`,
      keputusanAdmin: { keputusan, catatan, oleh: req.pengguna.id, pada: sekarang() },
    }
    db.prepare('UPDATE kampanye SET moderasi_status = ?, moderasi_hasil = ?, moderasi_pada = ? WHERE id = ?').run(
      keputusan,
      JSON.stringify(hasil),
      sekarang(),
      k.id,
    )

    kirimNotifikasi(k.umkm_id, {
      jenis: 'kampanye',
      judul: keputusan === 'lolos' ? 'Kampanye lolos tinjauan' : 'Kampanye perlu diubah',
      isi:
        keputusan === 'lolos'
          ? `"${k.nama}" lolos tinjauan dan siap dibayar.`
          : `"${k.nama}" tidak bisa ditayangkan. Catatan tim: ${catatan}`,
      tautan: '/umkm',
      email: true,
    })

    res.json({ pesan: keputusan === 'lolos' ? 'Kampanye diloloskan.' : 'Kampanye ditolak, UMKM sudah diberi tahu.' })
  }),
)

/**
 * GET /api/admin/penandaan-etika
 * Bio, deskripsi usaha, dan komentar ulasan yang lolos tapi samar.
 */
rutaAdmin.get(
  '/penandaan-etika',
  bungkus((req, res) => {
    const daftar = db
      .prepare(
        `SELECT t.*, p.nama AS nama_pengguna FROM penandaan_etika t
         JOIN pengguna p ON p.id = t.pengguna_id
         WHERE t.status = 'terbuka' ORDER BY t.dibuat_pada DESC LIMIT 100`,
      )
      .all()
    res.json({
      penandaan: daftar.map((t) => ({
        id: t.id,
        jenis: t.jenis,
        pengguna: t.nama_pengguna,
        teks: t.teks,
        hasil: JSON.parse(t.hasil),
        dibuatPada: t.dibuat_pada,
      })),
    })
  }),
)

/**
 * POST /api/admin/penandaan-etika/:id  Body: { tindakan: "biarkan" | "hapus" }
 * "hapus" mengosongkan teksnya (bio/deskripsi/komentar); barisnya tetap ada,
 * jadi bintang ulasan tetap dihitung.
 */
rutaAdmin.post(
  '/penandaan-etika/:id',
  bungkus((req, res) => {
    const { tindakan } = wajibAda(req.body, ['tindakan'])
    if (!['biarkan', 'hapus'].includes(tindakan)) throw galat400('Tindakan harus "biarkan" atau "hapus".')
    const t = db.prepare("SELECT * FROM penandaan_etika WHERE id = ? AND status = 'terbuka'").get(req.params.id)
    if (!t) throw galat404('Penandaan tidak ditemukan atau sudah diputus.')

    if (tindakan === 'hapus') {
      if (t.jenis === 'bio_kreator') db.prepare('UPDATE profil_kreator SET bio = NULL WHERE pengguna_id = ?').run(t.rujukan)
      else if (t.jenis === 'deskripsi_umkm') db.prepare('UPDATE profil_umkm SET deskripsi = NULL WHERE pengguna_id = ?').run(t.rujukan)
      else db.prepare('UPDATE ulasan SET komentar = NULL WHERE id = ?').run(t.rujukan)
      kirimNotifikasi(t.pengguna_id, {
        jenis: 'kampanye',
        judul: 'Teks Anda dihapus tim LokalBoost',
        isi: 'Sebagian tulisan Anda dihapus karena menyinggung pihak lain. Anda bisa menulis ulang tanpa menyebut atau menuduh pihak lain.',
        tautan: '/profil',
      })
    }
    db.prepare('UPDATE penandaan_etika SET status = ? WHERE id = ?').run(tindakan === 'hapus' ? 'dihapus' : 'dibiarkan', t.id)
    res.json({ pesan: tindakan === 'hapus' ? 'Teks dihapus.' : 'Dibiarkan.' })
  }),
)

/**
 * GET /api/admin/pengguna?peran=kreator
 * Daftar akun beserta status verifikasi dan reputasinya.
 */
rutaAdmin.get(
  '/pengguna',
  bungkus((req, res) => {
    const syarat = ['1 = 1']
    const nilai = []
    if (req.query.peran) {
      syarat.push('p.peran = ?')
      nilai.push(req.query.peran)
    }

    const daftar = db
      .prepare(
        `SELECT p.id, p.peran, p.nama, p.email, p.telepon, p.terverifikasi, p.dibuat_pada,
                pu.nama_usaha, pu.kategori, pu.lokasi AS lokasi_umkm, pu.nib,
                pu.terverifikasi AS usaha_terverifikasi,
                pk.niche, pk.lokasi AS lokasi_kreator, pk.pengikut, pk.gradasi, pk.foto,
                pk.terverifikasi AS kreator_terverifikasi,
                (SELECT AVG(bintang) FROM ulasan u WHERE u.dinilai_id = p.id) AS rating,
                (SELECT COUNT(*) FROM ulasan u WHERE u.dinilai_id = p.id) AS jumlah_ulasan
         FROM pengguna p
         LEFT JOIN profil_umkm pu ON pu.pengguna_id = p.id
         LEFT JOIN profil_kreator pk ON pk.pengguna_id = p.id
         WHERE ${syarat.join(' AND ')}
         ORDER BY p.dibuat_pada DESC`,
      )
      .all(...nilai)

    res.json({
      pengguna: daftar.map((p) => ({
        id: p.id,
        peran: p.peran,
        nama: p.nama,
        email: p.email,
        telepon: p.telepon,
        akunTerverifikasi: Boolean(p.terverifikasi),
        profilTerverifikasi: Boolean(
          p.peran === 'umkm' ? p.usaha_terverifikasi : p.kreator_terverifikasi,
        ),
        namaUsaha: p.nama_usaha,
        kategori: p.kategori,
        niche: p.niche,
        lokasi: p.lokasi_umkm || p.lokasi_kreator,
        pengikut: p.pengikut,
        gradasi: p.gradasi,
        foto: p.foto || null,
        nib: p.nib,
        rating: p.jumlah_ulasan ? Number(p.rating.toFixed(2)) : null,
        jumlahUlasan: p.jumlah_ulasan,
        bergabungPada: p.dibuat_pada,
      })),
    })
  }),
)

/**
 * POST /api/admin/pengguna/:id/verifikasi
 * Body: { terverifikasi: true|false, nib? }
 *
 * Yang diubah adalah verifikasi PROFIL (badge "Terverifikasi" yang dilihat
 * pengguna lain), bukan verifikasi akun lewat OTP — itu urusan pemilik akun
 * sendiri dan tidak boleh bisa dipalsukan dari sini.
 */
rutaAdmin.post(
  '/pengguna/:id/verifikasi',
  bungkus((req, res) => {
    const pengguna = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(req.params.id)
    if (!pengguna) throw galat404('Pengguna tidak ditemukan.')
    if (pengguna.peran === 'admin') throw galat400('Akun admin tidak perlu diverifikasi.')

    const nilai = req.body?.terverifikasi === false ? 0 : 1
    const tabel = pengguna.peran === 'umkm' ? 'profil_umkm' : 'profil_kreator'
    db.prepare(`UPDATE ${tabel} SET terverifikasi = ? WHERE pengguna_id = ?`).run(nilai, pengguna.id)

    if (pengguna.peran === 'umkm' && req.body?.nib) {
      db.prepare('UPDATE profil_umkm SET nib = ? WHERE pengguna_id = ?').run(req.body.nib, pengguna.id)
    }

    kirimNotifikasi(pengguna.id, {
      jenis: 'kampanye',
      judul: nilai ? 'Akun Anda terverifikasi' : 'Status verifikasi dicabut',
      isi: nilai
        ? 'Profil Anda sudah diverifikasi tim LokalBoost. Badge terverifikasi kini tampil di marketplace.'
        : 'Badge terverifikasi pada profil Anda dicabut sementara. Hubungi tim kami untuk peninjauan ulang.',
      tautan: pengguna.peran === 'umkm' ? '/umkm' : '/kreator',
    })

    res.json({
      pesan: nilai ? 'Profil diverifikasi.' : 'Verifikasi profil dicabut.',
      penggunaId: pengguna.id,
      terverifikasi: Boolean(nilai),
    })
  }),
)

/** GET /api/admin/transaksi — seluruh pergerakan uang di platform. */
rutaAdmin.get(
  '/transaksi',
  bungkus((req, res) => {
    const syarat = req.query.jenis ? 'WHERE t.jenis = ?' : ''
    const nilai = req.query.jenis ? [req.query.jenis] : []

    const daftar = db
      .prepare(
        `SELECT t.*, p.nama AS nama_pengguna, p.peran
         FROM transaksi t JOIN pengguna p ON p.id = t.pengguna_id
         ${syarat}
         ORDER BY t.dibuat_pada DESC, t.rowid DESC LIMIT 200`,
      )
      .all(...nilai)

    res.json({
      transaksi: daftar.map((t) => ({
        id: t.id,
        pengguna: t.nama_pengguna,
        peran: t.peran,
        kampanyeId: t.kampanye_id,
        jenis: t.jenis,
        arah: t.arah,
        nominal: t.nominal,
        label: t.label,
        tanggal: t.dibuat_pada,
      })),
    })
  }),
)

/**
 * GET /api/admin/pembelajaran
 * Bagaimana kedua AI algoritmik ini bekerja menurut keputusan manusia.
 *
 * Halaman ini bukan dasbor pemantauan biasa — ia alat setel. Dua angka di
 * dalamnya menjawab pertanyaan yang selama ini tidak bisa dijawab siapa pun:
 * apakah aturan anti-fraud terlalu galak, dan apakah rekomendasi matchmaker
 * memang yang dipilih orang. Keduanya bersandar pada keputusan manusia yang
 * sudah tercatat (putusan sengketa dan persetujuan kreator), bukan pada
 * penilaian sistem terhadap dirinya sendiri.
 */
rutaAdmin.get(
  '/pembelajaran',
  bungkus((_req, res) => {
    const penyaringan = laporanKetepatanPenyaringan()
    const totalDisaring = penyaringan.reduce((a, r) => a + r.totalDisaring, 0)
    const totalDipulihkan = penyaringan.reduce((a, r) => a + r.dipulihkan, 0)

    res.json({
      antiFraud: {
        ambangBerlaku: config.antiFraud,
        totalDisaring,
        totalDipulihkan,
        persenSalahKeseluruhan: totalDisaring
          ? Number(((totalDipulihkan / totalDisaring) * 100).toFixed(1))
          : 0,
        perAlasan: penyaringan,
        // Aturan yang salahnya di atas 10% layak ditinjau ambangnya. Angka
        // ini ambang perhatian, bukan vonis — keputusannya tetap manusia.
        perluDitinjau: penyaringan.filter((r) => r.persenSalah > 10).map((r) => r.alasan),
      },
      matchmaker: {
        bobotBerlaku: BOBOT_MATCHMAKER,
        ...laporanKetepatanRekomendasi(),
      },
    })
  }),
)

/**
 * GET /api/admin/pembelajaran/usulan
 * Langkah berikutnya sesudah halaman di atas: bukan hanya "aturan mana yang
 * salah", tapi "jadi angkanya sebaiknya berapa".
 *
 * Sengaja dipisah dari /pembelajaran karena jauh lebih mahal — usulan
 * matchmaker memperingkat ulang seluruh kandidat untuk setiap keputusan yang
 * pernah tercatat. Halaman admin memuatnya sesudah ringkasan tampil, bukan
 * bersamaan.
 */
rutaAdmin.get(
  '/pembelajaran/usulan',
  bungkus((_req, res) => {
    res.json(usulanPenyetelan())
  }),
)
