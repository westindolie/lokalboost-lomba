import { useState } from 'react'
import { motion } from 'motion/react'
import { fadeUp } from './PageTransition.jsx'
import { Tekan } from './ui.jsx'
import { Check, Info, Search, Close, Target } from './icons.jsx'
import { api, useApi } from '../api.js'
import { ribuan, persen, pengikut, waktuLalu } from '../format.js'
import { cekTautanProfil } from '../validasi.js'

const LABEL_PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

/**
 * Cek Profil Otomatis: kreator menempel tautan profil TikTok, Instagram, atau
 * YouTube, server mengukur pengikut, views, dan engagement lewat
 * ScrapeCreators, lalu menilai. Ini SATU-SATUNYA sumber statistik media sosial
 * di portofolio: kreator tidak bisa mengetik angkanya sendiri.
 *
 * Alurnya dua langkah dan itu disengaja: hasil ukur baru masuk portofolio
 * setelah kode `LB-XXXXXX` ada di bio akun. Tanpa itu siapa saja bisa
 * menempel akun artis dan memajang 2 juta pengikut ke UMKM.
 */
export default function CekProfil({ onPortofolio }) {
  const { data: status, muatUlang } = useApi(() => api.statusCekProfil(), [])
  const [url, setUrl] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [pesan, setPesan] = useState(null)
  const [hasil, setHasil] = useState(null)
  const [tersalin, setTersalin] = useState(false)

  async function cek(e) {
    e.preventDefault()
    if (!url.trim() || sibuk) return
    const salah = cekTautanProfil(url, { wajib: true })
    if (salah) {
      setHasil(null)
      setPesan({ nada: 'buruk', teks: salah })
      return
    }
    setSibuk(true)
    setPesan(null)
    try {
      const r = await api.cekProfil(url.trim())
      setHasil(r)
      setPesan({ nada: r.terbukti ? 'baik' : 'info', teks: r.keterangan })
      if (r.terbukti) {
        onPortofolio?.(r.portofolio)
        muatUlang()
      }
    } catch (e) {
      setHasil(null)
      setPesan({ nada: 'buruk', teks: e.message })
    } finally {
      setSibuk(false)
    }
  }

  async function lepas(platform) {
    try {
      const r = await api.lepasProfil(platform)
      onPortofolio?.(r.portofolio)
      setHasil(null)
      muatUlang()
    } catch (e) {
      setPesan({ nada: 'buruk', teks: e.message })
    }
  }

  async function salin() {
    try {
      await navigator.clipboard.writeText(status.kode)
      setTersalin(true)
      setTimeout(() => setTersalin(false), 1800)
    } catch {
      // Clipboard bisa ditolak peramban; kodenya tetap terlihat untuk diketik.
    }
  }

  if (!status) return null

  return (
    <motion.div variants={fadeUp} className="card p-7">
      <h2 className="section-title flex items-center gap-2">
        <Search size={18} className="text-navy" /> Cek Profil Otomatis
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Tempel tautan profil TikTok, Instagram, atau YouTube Anda. LokalBoost mengukur pengikut,
        views, dan interaksi dari 12 konten terbaru, lalu memberi penilaian yang dilihat UMKM.
        Angkanya diambil dari profil asli, bukan diketik sendiri, jadi UMKM bisa mempercayainya.
      </p>

      {!status.aktif ? (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-soft">
          <Info size={15} /> Fitur ini belum diaktifkan di server. Untuk sementara, isi statistik
          manual di bagian bawah.
        </p>
      ) : (
        <>
          <div className="mt-5 rounded-xl border border-gold-border bg-gold/60 px-4 py-3 text-sm">
            <p className="font-semibold text-navy">
              Langkah 1: taruh kode ini di bio akun Anda (YouTube: di deskripsi channel)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="rounded-lg bg-white px-3 py-1.5 text-base font-bold tracking-wider text-navy">
                {status.kode}
              </code>
              <button type="button" onClick={salin} className="text-sm font-semibold text-navy hover:underline">
                {tersalin ? 'Tersalin' : 'Salin kode'}
              </button>
            </div>
            <p className="mt-2 text-gold-text">
              Ini bukti akun itu milik Anda. Setelah terbukti, kodenya boleh dihapus.
            </p>
          </div>

          <p className="mt-5 text-sm font-semibold text-navy">Langkah 2: tempel tautan profil</p>
          <form onSubmit={cek} className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="tiktok.com/@akunanda, instagram.com/akunanda, atau youtube.com/@akunanda"
              className="input flex-1"
            />
            <Tekan>
              <button type="submit" disabled={sibuk} className="btn-primary px-5 py-2.5">
                {sibuk ? 'Mengukur profil...' : 'Cek profil'}
              </button>
            </Tekan>
          </form>
        </>
      )}

      {pesan && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
            pesan.nada === 'baik'
              ? 'bg-success/12 text-success'
              : pesan.nada === 'buruk'
                ? 'bg-danger/12 text-danger'
                : 'bg-cream-100 text-ink-soft'
          }`}
        >
          {pesan.nada === 'baik' ? <Check size={15} /> : <Info size={15} />}
          {pesan.teks}
        </p>
      )}

      {hasil?.hasil && (
        <div className="mt-5">
          {!hasil.terbukti && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Pratinjau, belum masuk portofolio
            </p>
          )}
          <KartuPenilaian p={hasil.hasil} />
        </div>
      )}

      {status.profil.length > 0 && (
        <div className="mt-6 border-t border-ink-muted/12 pt-5">
          <p className="text-sm font-semibold text-navy">Akun terhubung</p>
          <ul className="mt-3 space-y-2">
            {status.profil.map((p) => (
              <li
                key={p.platform}
                className="flex items-center gap-3 rounded-xl border border-ink-muted/12 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-navy">
                    {LABEL_PLATFORM[p.platform] || p.platform} · @{p.akun}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {pengikut(p.pengikut)} pengikut · skor {p.skor} · diukur {waktuLalu(p.diukurPada)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => lepas(p.platform)}
                  aria-label="Lepas akun"
                  className="shrink-0 rounded-lg p-2 text-ink-soft hover:bg-cream-100 hover:text-danger"
                >
                  <Close size={16} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            Cek ulang kapan saja dengan tautan yang sama untuk memperbarui angkanya.
          </p>
        </div>
      )}
    </motion.div>
  )
}

/** Skor, angka utama, rincian komponen, dan peringatan. Dipakai juga di portofolio publik. */
export function KartuPenilaian({ p }) {
  const nadaSkor =
    p.skor >= 75 ? 'text-success' : p.skor >= 55 ? 'text-navy' : p.skor >= 35 ? 'text-warning' : 'text-danger'

  return (
    <div className="rounded-xl border border-ink-muted/12 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="text-center">
          <p className={`text-3xl font-bold ${nadaSkor}`}>{p.skor}</p>
          <p className="text-xs text-ink-soft">dari 100</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy">
            @{p.akun}
            {p.centangPlatform && <span className="ml-1 text-xs text-ink-soft">(centang biru)</span>}
          </p>
          <p className="text-sm text-ink-soft">{p.predikat}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Angka label="Pengikut" nilai={pengikut(p.pengikut)} />
        <Angka label="Median views" nilai={p.medianViews === null ? 'Tidak ada' : ribuan(p.medianViews)} />
        <Angka
          label="Engagement"
          nilai={p.engagement === null ? 'Tidak dihitung' : `${persen(p.engagement)}%`}
        />
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {p.engagement === null
          ? 'Akun ini menyembunyikan jumlah suka, jadi interaksi tidak dihitung dan skor dinilai dari jangkauan, tayangan, dan konsistensi. '
          : `Engagement = suka, komentar${p.dasarEngagement === 'views' ? (p.platform === 'youtube' ? ' dibagi tayangan' : ', dan bagikan dibagi tayangan') : ' dibagi pengikut'}. `}
        Median views = tayangan video &quot;biasa&quot;, tidak terangkat satu video viral.
      </p>

      <ul className="mt-4 space-y-2">
        {p.komponen.map((k) => (
          <li key={k.nama} className="text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>{k.nama}</span>
              <span>
                {Math.round(k.skor)} / {k.maks}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream-200">
              <div className="h-full rounded-full bg-navy" style={{ width: `${(k.skor / k.maks) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>

      {p.peringatan.length > 0 && (
        <ul className="mt-4 space-y-1">
          {p.peringatan.map((w) => (
            <li key={w} className="flex items-start gap-2 text-sm text-warning">
              <Target size={14} className="mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-ink-soft">
        Dihitung dari {p.kontenDiukur} konten terbaru, {p.konten30Hari} di antaranya dalam 30 hari
        terakhir.
      </p>
    </div>
  )
}

function Angka({ label, nilai }) {
  return (
    <div className="rounded-xl bg-cream-100 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 text-lg font-bold text-navy">{nilai}</p>
    </div>
  )
}
