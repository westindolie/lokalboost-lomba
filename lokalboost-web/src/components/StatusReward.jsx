import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ProgressBar, StatusChip, Tekan } from './ui.jsx'
import { rupiah, ribuan } from '../format.js'
import { api } from '../api.js'
import { Coins, Check, Info, Shield } from './icons.jsx'

/**
 * Status reward seorang kreator di satu kampanye (GET /api/kampanye/:id/reward-saya).
 *
 * Tiga angka yang sengaja ditampilkan terpisah, karena itulah yang paling
 * sering tertukar: views tervalidasi (kemajuan), target views minimal
 * (syarat kelayakan), dan nominal reward (tarif x views). Ambang hanya
 * membuka hak; nominalnya tetap dihitung dari tarif.
 */

const NADA = {
  belum_ambang: 'info',
  menunggu_verifikasi: 'warning',
  memenuhi_syarat: 'success',
  dicairkan: 'success',
  anggaran_habis: 'warning',
  cair_saat_selesai: 'info',
  hangus: 'danger',
  kuota_habis: 'warning',
  klaim_diproses: 'warning',
  produk_dikirim: 'info',
  produk_diterima: 'success',
  tidak_diklaim: 'info',
  memenuhi_syarat_produk: 'success',
}

/** Urutan status yang dilalui reward uang, untuk penanda "di mana posisi saya". */
const ALUR_TUNAI = [
  { kode: 'belum_ambang', label: 'Belum mencapai target minimal' },
  { kode: 'menunggu_verifikasi', label: 'Target tercapai, menunggu verifikasi' },
  { kode: 'memenuhi_syarat', label: 'Memenuhi syarat pencairan' },
  { kode: 'dicairkan', label: 'Reward berhasil dicairkan' },
]
const ALUR_PRODUK = [
  { kode: 'belum_ambang', label: 'Belum mencapai target minimal' },
  { kode: 'memenuhi_syarat_produk', label: 'Memenuhi syarat klaim' },
  { kode: 'klaim_diproses', label: 'Klaim produk sedang diproses' },
  { kode: 'produk_dikirim', label: 'Produk telah dikirim' },
  { kode: 'produk_diterima', label: 'Produk sudah diterima' },
]

function Alur({ langkah, kode }) {
  const posisi = langkah.findIndex((l) => l.kode === kode)
  return (
    <ol className="mt-4 space-y-2">
      {langkah.map((l, i) => {
        const lewat = posisi >= 0 && i < posisi
        const kini = i === posisi
        return (
          <li key={l.kode} className="flex items-center gap-2.5 text-xs">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                kini ? 'border-navy bg-navy text-white' : lewat ? 'border-success bg-success text-white' : 'border-black/15 bg-white text-transparent'
              }`}
            >
              <Check size={11} />
            </span>
            <span className={kini ? 'font-semibold text-navy' : lewat ? 'text-ink-soft' : 'text-ink-muted'}>{l.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Hambatan({ daftar }) {
  if (!daftar?.length) return null
  return (
    <div className="mt-3 rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-xs text-ink-soft">
      <p className="flex items-center gap-1.5 font-semibold text-navy">
        <Shield size={13} /> Sedang diverifikasi
      </p>
      <ul className="mt-1 list-disc pl-5">
        {daftar.map((h) => <li key={h}>{h}</li>)}
      </ul>
    </div>
  )
}

function BlokTunai({ kampanyeId, tunai, views, mode, onBerubah }) {
  const [sibuk, setSibuk] = useState(false)
  const [pesan, setPesan] = useState('')
  const [galat, setGalat] = useState('')

  const cairkan = async () => {
    setSibuk(true)
    setGalat('')
    setPesan('')
    try {
      const hasil = await api.cairkanReward(kampanyeId)
      setPesan(`${rupiah(hasil.nominal)} masuk ke saldo siap tarik di Dompet.`)
      onBerubah?.(hasil.reward)
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  const tujuan = tunai.viewsBerikutnya || tunai.ambang || 0
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-navy">
          <Coins size={16} /> Reward Uang
        </p>
        <StatusChip status={tunai.label} tone={NADA[tunai.kode]} denyut={tunai.kode === 'memenuhi_syarat'} />
      </div>

      {tunai.ambang > 0 && tujuan > 0 && tunai.kode !== 'hangus' && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-ink-soft">
            <span>{ribuan(views)} views tervalidasi</span>
            <span>
              {tunai.kode === 'belum_ambang'
                ? 'Target minimal'
                : ['memenuhi_syarat', 'menunggu_verifikasi'].includes(tunai.kode)
                  ? 'Milestone tercapai'
                  : 'Milestone berikutnya'}{' '}
              {ribuan(tujuan)}
            </span>
          </div>
          <ProgressBar value={Math.min(views, tujuan)} max={tujuan} tone="bg-success" />
        </div>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Hak bersih', nilai: tunai.hakBersih },
          { label: 'Sudah cair', nilai: tunai.sudahDicairkan },
          { label: 'Siap cair', nilai: tunai.siapCair },
        ].map((x) => (
          <div key={x.label} className="rounded-lg bg-cream-100 px-2 py-2">
            <dt className="text-[11px] text-ink-muted">{x.label}</dt>
            <dd className="text-sm font-bold text-navy">{rupiah(x.nilai)}</dd>
          </div>
        ))}
      </dl>

      <Hambatan daftar={tunai.kode === 'menunggu_verifikasi' ? tunai.hambatan : null} />

      {tunai.kode === 'memenuhi_syarat' && (
        <Tekan className="mt-4 block">
          <button type="button" onClick={cairkan} disabled={sibuk} className="btn-primary w-full py-2.5 disabled:opacity-60">
            {sibuk ? 'Pencairan sedang diproses…' : `Cairkan ${rupiah(tunai.siapCair)}`}
          </button>
        </Tekan>
      )}
      {pesan && <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">{pesan}</p>}
      {galat && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{galat}</p>}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted">
        <Info size={12} className="mt-0.5 shrink-0" />
        {tunai.ambang <= 0
          ? 'Kampanye ini tidak memakai target minimal: reward cair saat kampanye selesai.'
          : mode === 'sekali'
            ? `Cair sekali begitu ${ribuan(tunai.ambang)} views tercapai; sisanya cair saat kampanye selesai. Bila kampanye selesai sebelum target minimal tercapai, reward uang tidak dibayarkan.`
            : `Bisa dicairkan sekali di setiap kelipatan ${ribuan(tunai.ambang)} views. Bila kampanye selesai sebelum target minimal tercapai, reward uang tidak dibayarkan.`}
      </p>
      {tunai.ambang > 0 && <Alur langkah={ALUR_TUNAI} kode={tunai.kode} />}
    </div>
  )
}

function BlokProduk({ kampanye, produk, views, onBerubah }) {
  const tersedia = (kampanye.produkReward || []).filter((p) => p.sisa > 0)
  const [produkId, setProdukId] = useState(tersedia[0]?.produkId || '')
  const [alamat, setAlamat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  const klaim = async (e) => {
    e.preventDefault()
    setSibuk(true)
    setGalat('')
    try {
      const hasil = await api.klaimProduk(kampanye.id, { produkId, alamat })
      onBerubah?.(hasil.reward)
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  const terima = async () => {
    setSibuk(true)
    setGalat('')
    try {
      const hasil = await api.terimaProdukKlaim(kampanye.id, produk.klaim.id)
      onBerubah?.(hasil.reward)
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-navy">🎁 Reward Produk</p>
        <StatusChip status={produk.label} tone={NADA[produk.kode]} />
      </div>

      {produk.kode === 'belum_ambang' && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-ink-soft">
            <span>{ribuan(views)} views tervalidasi</span>
            <span>Target minimal {ribuan(produk.ambang)}</span>
          </div>
          <ProgressBar value={Math.min(views, produk.ambang)} max={produk.ambang || 1} tone="bg-success" />
        </div>
      )}

      <Hambatan daftar={produk.kode === 'menunggu_verifikasi' ? produk.hambatan : null} />

      {produk.klaim && (
        <div className="mt-3 rounded-lg bg-cream-100 px-3 py-2.5 text-xs text-ink-soft">
          <p className="font-semibold text-navy">{produk.klaim.produk}</p>
          <p className="mt-0.5">
            {produk.klaim.status === 'diproses' && 'Pemilik usaha sedang menyiapkan pengiriman.'}
            {produk.klaim.status === 'dikirim' && `Dikirim${produk.klaim.resi ? `, resi ${produk.klaim.resi}` : ''}.`}
            {produk.klaim.status === 'diterima' && 'Sudah Anda terima. Terima kasih!'}
          </p>
          {produk.klaim.status === 'dikirim' && (
            <button type="button" onClick={terima} disabled={sibuk} className="btn-outline mt-2 px-3 py-1.5 text-xs">
              Produk sudah saya terima
            </button>
          )}
        </div>
      )}

      {produk.kode === 'memenuhi_syarat_produk' && (
        <form onSubmit={klaim} className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="pilih-produk">Pilih produk</label>
            <select id="pilih-produk" className="input" value={produkId} onChange={(e) => setProdukId(e.target.value)}>
              {tersedia.map((p) => (
                <option key={p.produkId} value={p.produkId}>
                  {p.nama} · nilai {rupiah(p.nilai)} · sisa {p.sisa}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="alamat-kirim">Alamat pengiriman</label>
            <textarea
              id="alamat-kirim"
              rows={3}
              className="input resize-none"
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              placeholder="Nama penerima, jalan, kecamatan, kota, kode pos"
            />
            <p className="field-help">Alamat hanya terlihat oleh pemilik usaha kampanye ini.</p>
          </div>
          <Tekan className="block">
            <button type="submit" disabled={sibuk || !produkId || alamat.trim().length < 15} className="btn-primary w-full py-2.5 disabled:opacity-60">
              {sibuk ? 'Mengirim klaim…' : 'Klaim Produk'}
            </button>
          </Tekan>
        </form>
      )}
      {galat && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{galat}</p>}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted">
        <Info size={12} className="mt-0.5 shrink-0" />
        Satu kreator satu produk per kampanye, selama kuota masih ada (sisa {ribuan(produk.sisaKuota)}).
      </p>
      <Alur langkah={ALUR_PRODUK} kode={produk.kode} />
    </div>
  )
}

export default function StatusReward({ kampanye, reward, onBerubah }) {
  if (!reward) return null
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Views tervalidasi Anda</p>
          <AnimatePresence mode="popLayout">
            <motion.p
              key={reward.views}
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-3xl font-extrabold text-navy"
            >
              {ribuan(reward.views)}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="text-right text-xs text-ink-soft">
          Hanya views yang lolos
          <br />
          pemeriksaan yang dihitung
        </p>
      </div>
      {reward.tunai && (
        <BlokTunai kampanyeId={kampanye.id} tunai={reward.tunai} views={reward.views} mode={reward.modePencairan} onBerubah={onBerubah} />
      )}
      {reward.produk && <BlokProduk kampanye={kampanye} produk={reward.produk} views={reward.views} onBerubah={onBerubah} />}
    </div>
  )
}
