import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, StatCard, RekberBadge, Tekan, EmptyState } from '../components/ui.jsx'
import { AngkaNaik, CentangSukses } from '../components/Feedback.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { rupiah, tanggal } from '../format.js'
import { hanyaAngka } from '../validasi.js'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'
import {
  Wallet, Bank, Shield, Clock, ArrowRight, Sparkles,
} from '../components/icons.jsx'

/**
 * Dompet & Penarikan Dana — PRD §6.1 "penarikan dana (withdrawal) sederhana
 * ke rekening bank/e-wallet".
 *
 * Dua saldo dibedakan dengan sengaja, karena inilah inti janji Rekber:
 *   - saldo         : sudah lepas dari Rekber, boleh ditarik
 *   - saldoTertahan : hasil tayangan kampanye yang masih berjalan
 * Penarikan hanya boleh dari yang pertama, dan backend menolak sisanya.
 */
const nominalCepat = [100_000, 250_000, 500_000]

export default function Dompet() {
  const { profil } = useSesi()
  const { data, galat, memuat, muatUlang } = useApi(() => api.dompet(), [])

  const [tujuan, setTujuan] = useState('bca')
  const [jumlah, setJumlah] = useState('')
  const [kodeOtp, setKodeOtp] = useState('')
  const [hasil, setHasil] = useState(null)
  const [galatTarik, setGalatTarik] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [kirimKode, setKirimKode] = useState({ sibuk: false, pesan: '', galat: '' })

  if (memuat) {
    return (
      <AppShell>
        <MemuatHalaman />
      </AppShell>
    )
  }
  if (galat) {
    return (
      <AppShell>
        <GalatMuat galat={galat} onCoba={muatUlang} judul="Dompet gagal dimuat" />
      </AppShell>
    )
  }

  const d = data.dompet
  const rekening = [
    { id: 'bca', nama: 'BCA', nomor: '•••• 4471', atas: profil.nama },
    { id: 'gopay', nama: 'GoPay', nomor: '•••• 8890', atas: profil.nama },
  ]
  const pilihan = rekening.find((r) => r.id === tujuan)

  // Ambangnya datang dari backend (escrow.js), tidak disalin ke layar —
  // dua angka yang harus cocok tapi hidup di dua tempat pasti akan menyimpang.
  const AMBANG_2FA = data.ambang2fa
  const perlu2fa = Number(jumlah) >= AMBANG_2FA

  const mintaKode = async () => {
    setKirimKode({ sibuk: true, pesan: '', galat: '' })
    try {
      const jawab = await api.kirimKodePenarikan()
      setKirimKode({ sibuk: false, pesan: jawab.pesan, galat: '' })
      // Mode demo (BOCORKAN_OTP=true) mengembalikan kodenya sekalian supaya
      // presentasi tidak perlu berpindah ke inbox di tengah alur.
      if (jawab.kodeOtp) setKodeOtp(jawab.kodeOtp)
    } catch (err) {
      setKirimKode({ sibuk: false, pesan: '', galat: err.message })
    }
  }

  const ajukan = async (e) => {
    e.preventDefault()
    setGalatTarik('')
    setSibuk(true)
    try {
      const jawab = await api.tarikDana({
        jumlah: Number(jumlah),
        tujuan: `${pilihan.nama} ${pilihan.nomor}`,
        kodeOtp: kodeOtp || undefined,
      })
      setHasil(jawab)
      setJumlah('')
      setKodeOtp('')
      muatUlang()
    } catch (err) {
      setGalatTarik(err.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Dompet Saya"
        subtitle="Pantau pendapatan dari kampanye dan tarik dana ke rekening atau e-wallet Anda."
      >
        <RekberBadge text="Terhubung Rekber" />
      </PageHeader>

      <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 space-y-6">
        {/* Saldo */}
        <div className="grid gap-5 md:grid-cols-3">
          <motion.div
            variants={fadeUp}
            className="relative overflow-hidden rounded-2xl bg-navy p-7 text-white md:col-span-2"
          >
            <Wallet size={140} className="pointer-events-none absolute -right-8 -top-6 text-white/5" />
            <p className="relative text-xs font-semibold uppercase tracking-wide text-white/60">
              Saldo Siap Ditarik
            </p>
            <p className="relative mt-2 text-4xl font-extrabold sm:text-5xl">
              <AngkaNaik nilai={d.saldo} prefiks="Rp " />
            </p>
            <p className="relative mt-2 text-sm text-white/70">
              Sudah lolos verifikasi sistem anti-fraud dan dilepas dari Rekber.
            </p>
            <div className="relative mt-5 flex flex-wrap gap-3">
              <motion.a {...tekan} href="#tarik" className="btn bg-white px-5 py-2.5 text-navy hover:bg-cream-200">
                Tarik Dana <ArrowRight size={16} />
              </motion.a>
            </div>
          </motion.div>

          <div className="space-y-5">
            <StatCard
              label="Dana Dalam Proses"
              nilai={d.saldoTertahan}
              prefiks="Rp "
              sub="Menunggu kampanye ditutup"
              subTone="text-warning"
              icon={Clock}
            />
            <StatCard
              label="Total Pendapatan"
              nilai={d.totalMasuk}
              prefiks="Rp "
              sub="Seluruh dana masuk sejak bergabung"
              icon={Sparkles}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Form penarikan */}
          <motion.div variants={fadeUp} id="tarik" className="card scroll-mt-24 p-7 lg:col-span-2">
            <h2 className="section-title">Tarik Dana</h2>
            <p className="mt-1 text-sm text-ink-soft">Tahap uji coba: penarikan tercatat, tapi transfer ke rekening belum berjalan otomatis.</p>

            <AnimatePresence mode="wait" initial={false}>
              {hasil ? (
                <motion.div
                  key="sukses"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: DUR.quick, ease: EASE.entrance }}
                  className="mt-6 rounded-xl border border-success-border bg-success-soft px-5 py-8 text-center"
                >
                  <CentangSukses size={32} className="mx-auto" />
                  <p className="mt-3 font-bold text-success">Penarikan Diajukan</p>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    {rupiah(hasil.nominal)} sedang diproses ke {hasil.tujuan}. Sisa saldo Anda{' '}
                    {rupiah(hasil.saldoTersisa)}.
                  </p>
                  <motion.button
                    {...tekan}
                    onClick={() => setHasil(null)}
                    className="btn-outline mt-5 px-5 py-2.5"
                  >
                    Ajukan Penarikan Lain
                  </motion.button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: DUR.quick, ease: EASE.signature }}
                  onSubmit={ajukan}
                  className="mt-6"
                >
                  <label className="label">Tujuan Penarikan</label>
                  <div className="space-y-3">
                    {rekening.map((r) => {
                      const aktif = tujuan === r.id
                      return (
                        <motion.button
                          key={r.id}
                          type="button"
                          onClick={() => setTujuan(r.id)}
                          aria-pressed={aktif}
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.99 }}
                          transition={{ duration: DUR.hover, ease: EASE.signature }}
                          className={`flex w-full items-center gap-3 rounded-xl border-2 bg-white px-4 py-3.5 text-left transition-colors ${
                            aktif ? 'border-navy' : 'border-black/10 hover:border-navy/30'
                          }`}
                        >
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${aktif ? 'border-navy' : 'border-black/25'}`}>
                            {aktif && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.18, ease: EASE.settle }}
                                className="h-2.5 w-2.5 rounded-full bg-navy"
                              />
                            )}
                          </span>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cream-200 text-navy">
                            <Bank size={18} />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-navy">{r.nama} {r.nomor}</span>
                            <span className="block text-xs text-ink-muted">a.n. {r.atas}</span>
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>

                  <div className="mt-5">
                    <label className="label" htmlFor="jumlah">Jumlah Penarikan</label>
                    <input
                      id="jumlah"
                      type="number"
                      required
                      min={1}
                      max={d.saldo || undefined}
                      value={jumlah}
                      onChange={(e) => setJumlah(e.target.value)}
                      placeholder={d.saldo > 0 ? `Maksimal ${rupiah(d.saldo)}` : 'Saldo masih kosong'}
                      className="input"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {nominalCepat
                        .filter((n) => n <= d.saldo)
                        .map((n) => (
                          <motion.button
                            key={n}
                            type="button"
                            whileTap={{ scale: 0.95 }}
                            transition={{ duration: DUR.press, ease: EASE.signature }}
                            onClick={() => setJumlah(String(n))}
                            className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-navy/40 hover:text-navy"
                          >
                            {rupiah(n)}
                          </motion.button>
                        ))}
                      {d.saldo > 0 && (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          transition={{ duration: DUR.press, ease: EASE.signature }}
                          onClick={() => setJumlah(String(d.saldo))}
                          className="rounded-full border border-navy/30 px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-navy/5"
                        >
                          Semua
                        </motion.button>
                      )}
                    </div>
                    <p className="field-help">
                      {d.saldoTertahan > 0
                        ? `${rupiah(d.saldoTertahan)} masih tertahan sampai kampanyenya ditutup.`
                        : 'Tanpa biaya admin untuk penarikan pertama tiap bulan.'}
                    </p>
                  </div>

                  {/* PRD §9: otentikasi dua faktor untuk transaksi besar. */}
                  {perlu2fa && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-5 overflow-hidden"
                    >
                      <label className="label" htmlFor="otp-tarik">Kode Verifikasi Tambahan</label>
                      <div className="flex gap-2">
                        <input
                          id="otp-tarik"
                          inputMode="numeric"
                          value={kodeOtp}
                          onChange={(e) => setKodeOtp(hanyaAngka(e.target.value))}
                          maxLength={6}
                          placeholder="6 digit dari email"
                          className="input flex-1"
                        />
                        <motion.button
                          {...tekan}
                          type="button"
                          onClick={mintaKode}
                          disabled={kirimKode.sibuk}
                          className="btn shrink-0 border border-black/10 bg-white px-4 text-sm text-navy hover:bg-cream-200 disabled:opacity-60"
                        >
                          {kirimKode.sibuk ? 'Mengirim…' : 'Kirim Kode'}
                        </motion.button>
                      </div>
                      <p className="field-help">
                        Penarikan di atas {rupiah(AMBANG_2FA)} membutuhkan verifikasi kedua.
                      </p>
                      {kirimKode.pesan && (
                        <p className="mt-2 rounded-lg bg-success-soft px-4 py-2.5 text-sm text-success">
                          {kirimKode.pesan}
                        </p>
                      )}
                      {kirimKode.galat && (
                        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">
                          {kirimKode.galat}
                        </p>
                      )}
                    </motion.div>
                  )}

                  {galatTarik && (
                    <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                      {galatTarik}
                    </p>
                  )}

                  <motion.button
                    {...tekan}
                    type="submit"
                    disabled={sibuk || d.saldo <= 0}
                    className="btn-primary mt-6 w-full py-3 disabled:opacity-60"
                  >
                    {sibuk ? 'Memproses…' : <>Ajukan Penarikan <ArrowRight size={18} /></>}
                  </motion.button>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="mt-5 flex items-start gap-2 rounded-xl border border-gold-border bg-gold px-4 py-3">
              <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
              <p className="text-xs text-gold-text">
                Penarikan hanya bisa ke rekening atas nama Anda sendiri.
              </p>
            </div>
          </motion.div>

          {/* Riwayat transaksi */}
          <motion.div variants={fadeUp} className="card p-7 lg:col-span-3">
            <h2 className="section-title">Riwayat Transaksi</h2>
            <p className="mt-1 text-sm text-ink-soft">Semua dana masuk dan keluar dari dompet Anda.</p>

            {d.riwayat.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  icon={Wallet}
                  title="Belum ada transaksi"
                  subtitle="Pendapatan pertama Anda akan muncul di sini begitu kampanye menghasilkan tayangan tervalidasi."
                  action="Cari Kampanye"
                  to="/marketplace"
                />
              </div>
            ) : (
              <div className="mt-5 divide-y divide-black/5">
                {d.riwayat.map((t, i) => {
                  const masuk = t.arah === 'masuk'
                  return (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.05, ease: EASE.entrance }}
                      className="flex items-center gap-4 py-4"
                    >
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                          masuk ? 'bg-success-soft text-success' : 'bg-cream-200 text-ink-soft'
                        }`}
                      >
                        {masuk ? <Wallet size={18} /> : <Bank size={18} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy">{t.label}</p>
                        <p className="text-xs text-ink-muted">{tanggal(t.tanggal)}</p>
                      </div>
                      <span className={`shrink-0 font-bold ${masuk ? 'text-success' : 'text-ink'}`}>
                        {masuk ? '+' : '−'} {rupiah(t.nominal)}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            )}

            <div className="mt-5 border-t border-black/5 pt-5">
              <p className="text-sm text-ink-soft">
                Ingin menambah pemasukan?{' '}
                <Link to="/marketplace" className="font-semibold text-navy hover:underline">
                  Cari kampanye baru
                </Link>{' '}
                yang cocok dengan niche kontenmu.
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AppShell>
  )
}
