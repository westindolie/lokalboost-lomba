import { Router } from 'express'
import { db } from '../lib/db.js'
import { wajibLogin } from '../lib/auth.js'
import { config } from '../config.js'
import { bungkus, galat400 } from '../lib/util.js'
import { AMBANG_2FA, identitasOtp, ringkasDompet, tarikDana } from '../services/escrow.js'
import { TUJUAN, terbitkanOtp } from '../services/otp.js'
import { surelAktif, tampakEmail } from '../services/surel.js'

export const rutaDompet = Router()

/**
 * GET /api/dompet — saldo, saldo tertahan, dan riwayat transaksi.
 * `ambang2fa` ikut dikirim supaya halaman Dompet tahu kapan harus menampilkan
 * kolom kode tanpa menyalin angkanya sendiri.
 */
rutaDompet.get(
  '/',
  wajibLogin,
  bungkus((req, res) => {
    res.json({ dompet: ringkasDompet(req.pengguna.id), ambang2fa: AMBANG_2FA, modeDemo: config.modeDemo })
  }),
)

/**
 * POST /api/dompet/tarik/kode
 * Kirim kode 2FA untuk penarikan besar ke email pemilik dompet.
 *
 * Tanpa endpoint ini, kolom "Kode Verifikasi Tambahan" di halaman Dompet
 * adalah jalan buntu: penggunanya diminta kode yang tidak punya cara didapat.
 */
rutaDompet.post(
  '/tarik/kode',
  wajibLogin,
  bungkus((req, res) => {
    const identitas = identitasOtp(req.pengguna.id)
    if (!identitas) throw galat400('Akun ini belum punya email untuk menerima kode verifikasi.')

    const kode = terbitkanOtp(identitas, { tujuan: TUJUAN.PENARIKAN })
    res.json({
      pesan:
        surelAktif() && tampakEmail(identitas)
          ? `Kode penarikan dikirim ke ${identitas}. Cek inbox (atau folder spam).`
          : `Kode penarikan dikirim ke ${identitas}.`,
      ambang2fa: AMBANG_2FA,
      ...(config.bocorkanOtp ? { kodeOtp: kode } : {}),
    })
  }),
)

/**
 * POST /api/dompet/tarik
 * Penarikan hanya boleh dari `saldo`, bukan `saldo_tertahan` — dana kampanye
 * yang masih berjalan tetap terkunci di Rekber sampai kampanyenya tuntas.
 * Nominal di atas AMBANG_2FA wajib menyertakan `kodeOtp` yang sah.
 */
rutaDompet.post(
  '/tarik',
  wajibLogin,
  bungkus((req, res) => {
    if (config.modeDemo) throw galat400('Saldo mode demo tidak dapat ditarik sebagai uang sungguhan.')
    const hasil = tarikDana({
      penggunaId: req.pengguna.id,
      jumlah: req.body?.jumlah,
      tujuan: req.body?.tujuan,
      kodeOtp: req.body?.kodeOtp,
    })
    res.json({
      pesan: 'Penarikan tercatat. Tahap uji coba: transfer ke rekening belum berjalan otomatis.',
      ...hasil,
    })
  }),
)

/** GET /api/dompet/transaksi — riwayat lengkap, bisa difilter per jenis. */
rutaDompet.get(
  '/transaksi',
  wajibLogin,
  bungkus((req, res) => {
    const { jenis } = req.query
    const syarat = jenis ? 'AND jenis = ?' : ''
    const nilai = jenis ? [req.pengguna.id, jenis] : [req.pengguna.id]

    const daftar = db
      .prepare(
        `SELECT * FROM transaksi WHERE pengguna_id = ? ${syarat}
         ORDER BY dibuat_pada DESC, rowid DESC LIMIT 200`,
      )
      .all(...nilai)

    res.json({
      transaksi: daftar.map((t) => ({
        id: t.id,
        label: t.label,
        jenis: t.jenis,
        arah: t.arah,
        nominal: t.nominal,
        kampanyeId: t.kampanye_id,
        tanggal: t.dibuat_pada,
      })),
    })
  }),
)
