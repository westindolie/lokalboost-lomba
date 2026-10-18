import { useState } from 'react'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader } from '../components/ui.jsx'
import { tekan } from '../motion.js'
import { api } from '../api.js'
import { useSesi } from '../sesi.jsx'
import { Shield, Check, ArrowRight } from '../components/icons.jsx'

/**
 * Keamanan Akun.
 *
 * Sengaja satu halaman untuk KETIGA peran, bukan versi terpisah per peran:
 * mengganti kata sandi tidak ada hubungannya dengan UMKM, kreator, atau
 * admin. Halaman per-peran hanya akan menyalin isi yang sama tiga kali dan
 * membuat salah satunya ketinggalan saat kontraknya berubah.
 */
const SEBUTAN_PERAN = { umkm: 'UMKM', kreator: 'Kreator', admin: 'Admin Platform' }

export default function Akun() {
  const { profil } = useSesi()

  const [lama, setLama] = useState('')
  const [baru, setBaru] = useState('')
  const [ulang, setUlang] = useState('')
  const [pesan, setPesan] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const simpan = async (e) => {
    e.preventDefault()
    setPesan('')
    setGalat('')

    // Kolom "ulangi" tidak ada di API — ia murni penjaga salah ketik, jadi
    // diperiksa di sini dan tidak pernah dikirim.
    if (baru !== ulang) {
      setGalat('Kata sandi baru dan pengulangannya belum sama.')
      return
    }

    setSibuk(true)
    try {
      const jawab = await api.ubahSandi(lama, baru)
      setPesan(jawab.pesan)
      setLama('')
      setBaru('')
      setUlang('')
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <AppShell>
      <motion.div variants={stagger} initial="initial" animate="animate">
        <PageHeader
          title="Keamanan Akun"
          subtitle="Ganti kata sandi dan lihat status verifikasi akun Anda."
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <motion.form variants={fadeUp} onSubmit={simpan} className="card p-7 lg:col-span-2">
            <h2 className="text-lg font-extrabold text-navy">Ubah Kata Sandi</h2>
            <p className="mt-1.5 text-sm text-ink-soft">
              Kata sandi lama tetap diminta walau Anda sudah masuk — supaya perangkat yang
              tertinggal dalam keadaan login tidak bisa dipakai mengunci pemilik aslinya.
            </p>

            <div className="mt-6">
              <label className="label" htmlFor="sandi-lama">Kata Sandi Sekarang</label>
              <input
                id="sandi-lama"
                type="password"
                required
                value={lama}
                onChange={(e) => setLama(e.target.value)}
                className="input"
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sandi-baru">Kata Sandi Baru</label>
                <input
                  id="sandi-baru"
                  type="password"
                  required
                  value={baru}
                  onChange={(e) => setBaru(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="sandi-ulang">Ulangi Kata Sandi Baru</label>
                <input
                  id="sandi-ulang"
                  type="password"
                  required
                  value={ulang}
                  onChange={(e) => setUlang(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            {pesan && (
              <p className="mt-5 flex items-center gap-2 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
                <Check size={16} /> {pesan}
              </p>
            )}
            {galat && (
              <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                {galat}
              </p>
            )}

            <motion.button
              {...tekan}
              type="submit"
              disabled={sibuk}
              className="btn-primary mt-6 py-3 disabled:opacity-60"
            >
              {sibuk ? 'Menyimpan…' : <>Simpan Kata Sandi <ArrowRight size={18} /></>}
            </motion.button>
          </motion.form>

          <motion.div variants={fadeUp} className="card p-7">
            <h2 className="text-lg font-extrabold text-navy">Status Akun</h2>

            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-ink-muted">Nama</dt>
                <dd className="font-semibold text-navy">{profil.nama}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Peran</dt>
                {/* `profil.label` sudah memuat nama pengguna di depannya, jadi
                    memakainya di sini akan mengulang baris di atasnya. */}
                <dd className="font-semibold text-navy">{SEBUTAN_PERAN[profil.peran] || profil.peran}</dd>
              </div>
            </dl>

            <div className="mt-6 flex items-start gap-2 rounded-xl border border-gold-border bg-gold px-4 py-3">
              <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
              <p className="text-xs text-gold-text">
                Penarikan dana di atas ambang tertentu meminta kode sekali pakai yang dikirim
                ke email Anda — kata sandi saja tidak cukup untuk mencairkan dana.
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AppShell>
  )
}
