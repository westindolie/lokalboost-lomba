import { Router } from 'express'
import { db } from '../lib/db.js'
import { wajibLogin, wajibPeran } from '../lib/auth.js'
import { bungkus, galat400, galat403, galat404, hashIp, wajibAda } from '../lib/util.js'
import { periksaTayangan } from '../services/antifraud.js'
import { prosesPembayaran } from '../services/escrow.js'
import { terlibatKampanye } from '../services/reward.js'

export const rutaTayangan = Router()

/**
 * Titik masuk sistem tracking tayangan (PRD §10: "sistem tracking views
 * dengan validasi sumber — perangkat, lokasi, perilaku").
 *
 * Rute ini sengaja publik: yang memanggilnya adalah pemutar video di sisi
 * penonton, bukan pengguna yang login. Pertahanannya bukan otentikasi,
 * melainkan AI Anti-Fraud yang memeriksa setiap tayangan sebelum dihitung.
 */

function catatSatuTayangan({ videoId, ip, userAgent, kota, durasiTonton, perangkat }) {
  const video = db.prepare('SELECT * FROM video WHERE id = ?').get(videoId)
  if (!video) throw galat404('Video tidak ditemukan.')

  // Tayangan hanya bernilai uang selama videonya boleh tayang dan kampanyenya
  // masih berjalan. Dulu tidak diperiksa: video yang diminta revisi tetap
  // dibayar, dan tayangan ke kampanye yang sudah selesai memotong escrow yang
  // sisanya SUDAH dikembalikan ke UMKM (uang yang sama terpakai dua kali).
  // Tidak disimpan sebagai baris `valid = 0` karena ini bukan kecurangan;
  // mencampurnya akan menggelembungkan angka "disaring" anti-fraud.
  const kampanye = db.prepare('SELECT status FROM kampanye WHERE id = ?').get(video.kampanye_id)
  const alasanTolak =
    video.status === 'ditolak'
      ? 'Video sedang diminta revisi dan belum boleh tayang'
      : kampanye?.status !== 'berjalan'
        ? 'Kampanye tidak sedang berjalan, tayangan tidak lagi dibayar'
        : null
  if (alasanTolak) {
    return { kampanyeId: video.kampanye_id, valid: false, alasan: alasanTolak, skorRisiko: 0, disimpan: false }
  }

  const ipHash = hashIp(ip)
  const periksa = periksaTayangan({
    videoId,
    ipHash,
    userAgent,
    durasiTonton: Number(durasiTonton) || 0,
    durasiVideo: video.durasi_detik,
  })

  db.prepare(
    `INSERT INTO tayangan
       (video_id, kampanye_id, ip_hash, perangkat, user_agent, kota, durasi_tonton, valid, alasan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    videoId,
    video.kampanye_id,
    ipHash,
    perangkat || null,
    userAgent || null,
    kota || null,
    Number(durasiTonton) || 0,
    periksa.valid ? 1 : 0,
    periksa.alasan,
  )

  return { kampanyeId: video.kampanye_id, ...periksa, disimpan: true }
}

/**
 * POST /api/tayangan
 * Body: { videoId, durasiTonton, kota?, perangkat? }
 * IP dan user-agent diambil dari permintaan, bukan dari body, supaya klien
 * tidak bisa memalsukannya semudah mengganti satu field JSON.
 */
rutaTayangan.post(
  '/',
  bungkus((req, res) => {
    const b = wajibAda(req.body, ['videoId', 'durasiTonton'])
    const hasil = catatSatuTayangan({
      videoId: b.videoId,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
      userAgent: req.get('user-agent'),
      kota: b.kota,
      durasiTonton: b.durasiTonton,
      perangkat: b.perangkat,
    })

    // Setiap tayangan sah langsung memicu perhitungan Pay-Per-View. Kalau
    // target sudah tercapai, dana kreator ikut dilepaskan di sini juga —
    // inilah yang membuat janji "pencairan < 24 jam" (PRD §3.2) tercapai.
    const pembayaran = hasil.valid ? prosesPembayaran(hasil.kampanyeId) : null

    // 200, bukan 201, bila tayangan ditolak tanpa disimpan (video revisi /
    // kampanye tidak berjalan): tidak ada baris yang tercipta.
    res.status(hasil.disimpan ? 201 : 200).json({
      dihitung: hasil.valid,
      alasan: hasil.alasan,
      ...(pembayaran ? { pembayaran } : {}),
    })
  }),
)

/**
 * POST /api/tayangan/batch
 * Dipakai simulator demo dan integrasi platform yang mengirim laporan
 * tayangan secara berkala, bukan satu per satu.
 *
 * Wajib admin. Rute ini menerima `ip` dan `userAgent` dari body; selama ia
 * publik, siapa pun bisa mengirim 40 tayangan ber-IP karangan, semuanya
 * lolos lapis 1, dan escrow UMKM terkuras ke kreator tanpa login.
 */
rutaTayangan.post(
  '/batch',
  wajibPeran('admin'),
  bungkus((req, res) => {
    const { tayangan } = wajibAda(req.body, ['tayangan'])
    if (!Array.isArray(tayangan)) throw galat400('Field "tayangan" harus berupa array.')

    const ringkasan = { diterima: tayangan.length, dihitung: 0, disaring: 0, alasan: {} }
    const kampanyeTersentuh = new Set()

    for (const t of tayangan) {
      const hasil = catatSatuTayangan({
        videoId: t.videoId,
        ip: t.ip || req.ip,
        userAgent: t.userAgent || req.get('user-agent'),
        kota: t.kota,
        durasiTonton: t.durasiTonton,
        perangkat: t.perangkat,
      })
      if (hasil.disimpan) kampanyeTersentuh.add(hasil.kampanyeId)
      if (hasil.valid) ringkasan.dihitung++
      else {
        ringkasan.disaring++
        ringkasan.alasan[hasil.alasan] = (ringkasan.alasan[hasil.alasan] || 0) + 1
      }
    }

    const pembayaran = {}
    for (const id of kampanyeTersentuh) pembayaran[id] = prosesPembayaran(id)

    res.status(201).json({ ...ringkasan, pembayaran })
  }),
)

/**
 * GET /api/tayangan?kampanyeId=... — bukti mentah untuk halaman sengketa.
 *
 * Hanya untuk pihak kampanye itu (UMKM pemilik, kreatornya) dan admin. Dulu
 * publik, padahal halaman Laporan untuk data yang sama dijaga ketat: siapa pun
 * bisa membaca kota, perangkat, dan alasan penyaringan kampanye mana pun.
 * Tanpa filter kampanye/video, daftarnya lintas kampanye, jadi khusus admin.
 */
rutaTayangan.get(
  '/',
  wajibLogin,
  bungkus((req, res) => {
    const { kampanyeId, videoId, hanyaDisaring } = req.query
    const admin = req.pengguna.peran === 'admin'
    const idKampanye =
      kampanyeId || (videoId && db.prepare('SELECT kampanye_id FROM video WHERE id = ?').get(videoId)?.kampanye_id)
    if (!idKampanye && !admin) {
      throw galat400('Sertakan kampanyeId atau videoId.')
    }
    if (idKampanye && !admin) {
      const k = db.prepare('SELECT id, umkm_id FROM kampanye WHERE id = ?').get(idKampanye)
      if (!k) throw galat404('Kampanye tidak ditemukan.')
      if (!terlibatKampanye(k, req.pengguna.id)) {
        throw galat403('Bukti tayangan hanya bisa dilihat pemilik usaha dan kreator kampanye ini.')
      }
    }

    const syarat = []
    const nilai = []
    if (kampanyeId) {
      syarat.push('kampanye_id = ?')
      nilai.push(kampanyeId)
    }
    if (videoId) {
      syarat.push('video_id = ?')
      nilai.push(videoId)
    }
    if (hanyaDisaring === 'true') syarat.push('valid = 0')

    const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : ''
    const daftar = db
      .prepare(`SELECT * FROM tayangan ${where} ORDER BY waktu DESC LIMIT 200`)
      .all(...nilai)

    res.json({
      jumlah: daftar.length,
      tayangan: daftar.map((t) => ({
        id: t.id,
        videoId: t.video_id,
        kampanyeId: t.kampanye_id,
        kota: t.kota,
        perangkat: t.perangkat,
        durasiTonton: t.durasi_tonton,
        waktu: t.waktu,
        valid: Boolean(t.valid),
        alasan: t.alasan,
      })),
    })
  }),
)
