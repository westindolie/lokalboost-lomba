import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, RekberBadge, Tekan, StatusChip, EmptyState } from '../components/ui.jsx'
import StatusReward from '../components/StatusReward.jsx'
import { MemuatBlok, GalatMuat } from '../components/Muat.jsx'
import { tekan } from '../motion.js'
import { ribuan, rupiah, tanggal, waktuLalu } from '../format.js'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'
import { Play, Sparkles, Info, Check, Eye, Shield } from '../components/icons.jsx'

/**
 * Setor Video & Reward (pengganti Unggah Video, 18 Okt 2026).
 *
 * Kreator mengunggah konten di akun TikTok/Instagram/YouTube miliknya sendiri,
 * lalu menempel tautannya di sini setelah diterima di kampanye. Server membaca
 * videonya, memastikan akunnya milik kreator, dan AI mencocokkan keterangan
 * serta ucapan video dengan brief. Mode normal menghitung kenaikan setelah
 * tautan disetor; mode demo menghitung views aktual yang sudah terbaca.
 */

const KECOCOKAN = {
  cocok: { label: 'Sesuai kampanye', tone: 'success' },
  tinjau: { label: 'Ditinjau pemilik usaha', tone: 'warning' },
  tidak_cocok: { label: 'Tidak sesuai', tone: 'danger' },
}
const PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

function HasilKecocokan({ video, modeDemo }) {
  const h = video.kecocokanHasil || {}
  const k = modeDemo && video.kecocokan === 'tinjau'
    ? { label: 'Belum terverifikasi otomatis', tone: 'danger' }
    : KECOCOKAN[video.kecocokan] || KECOCOKAN.tinjau
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles size={15} className="text-gold" /> Hasil pemeriksaan
        </p>
        <StatusChip status={video.moderasi === 'revisi' ? 'Ditahan: menyinggung usaha lain' : k.label} tone={video.moderasi === 'revisi' ? 'danger' : k.tone} />
      </div>
      <p className="text-sm text-white/80">{video.moderasi === 'revisi' ? video.catatanModerasi : h.alasan}</p>
      {h.catatanAkun && <p className="text-xs text-gold">{h.catatanAkun}</p>}
      {h.deskripsiVisual && <p className="text-sm text-white/80"><b>Yang terlihat di video:</b> {h.deskripsiVisual}</p>}
      {h.produkTerlihat?.length > 0 && <p className="text-xs text-white/70"><b>Produk/objek terdeteksi:</b> {h.produkTerlihat.join(', ')}</p>}
      {h.poinTerpenuhi?.length > 0 && (
        <ul className="space-y-1 text-xs text-white/75">
          {h.poinTerpenuhi.map((p) => (
            <li key={p} className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-gold" /> {p}</li>
          ))}
        </ul>
      )}
      {h.poinKurang?.length > 0 && (
        <div className="text-xs text-white/60">
          <p className="font-semibold text-white/75">Belum terlihat dari keterangan/ucapan:</p>
          <ul className="mt-1 list-disc pl-5">{h.poinKurang.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <p className="border-t border-white/15 pt-3 text-[11px] leading-relaxed text-white/55">
        {modeDemo && h.sumber === 'gemini_video'
          ? 'Gemini menilai frame visual dan audio video serta membandingkannya dengan produk dan brief kampanye. Video yang lolos tidak memerlukan persetujuan UMKM.'
          : modeDemo
            ? 'Pemeriksaan visual belum memberi hasil yang cukup, jadi video ini tidak diverifikasi otomatis. Coba lagi saat layanan tersedia.'
            : h.sumber === 'ai'
          ? 'AI membaca keterangan, tagar, dan ucapan video (bila ada), bukan gambarnya. Pemilik usaha tetap bisa meninjau.'
          : 'Pemeriksa AI tidak tersedia saat ini, jadi pemilik usaha yang memutuskan setelah menonton.'}
      </p>
    </div>
  )
}

function KartuVideo({ v, onBerubah }) {
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const k = v.status === 'ditolak' && v.kecocokan === 'tinjau'
    ? { label: 'Belum terverifikasi otomatis', tone: 'danger' }
    : KECOCOKAN[v.kecocokan] || null

  const perbarui = async () => {
    setSibuk(true)
    setGalat('')
    try {
      await api.perbaruiViewsVideo(v.id)
      onBerubah()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <div className="rounded-xl bg-cream-100 px-4 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-navy shadow-card">
          <Play size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-navy">{v.judul}</p>
          <p className="text-xs text-ink-muted">
            {v.sumber === 'tautan' ? (
              <>
                {PLATFORM[v.platform] || v.platform}
                {v.akunPenulis && <> · @{v.akunPenulis}</>} · disetor {tanggal(v.dibuatPada)}
              </>
            ) : (
              <>Unggahan lama · {tanggal(v.dibuatPada)}</>
            )}
          </p>
          {v.url && (
            <a href={v.url} target="_blank" rel="noreferrer noopener" className="text-xs font-semibold text-navy underline">
              Buka video
            </a>
          )}
        </div>
        {v.moderasi === 'revisi' ? (
          <StatusChip status="Ditahan" tone="danger" />
        ) : k ? (
          <StatusChip status={k.label} tone={k.tone} />
        ) : null}
      </div>

      {v.sumber === 'tautan' && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Views saat disetor', nilai: v.viewsAwal },
            { label: 'Views di platform', nilai: v.viewsPlatform },
            { label: 'Dihitung', nilai: v.viewsDiakui },
            { label: 'Ditahan', nilai: v.viewsTertahan },
          ].map((x) => (
            <div key={x.label} className="rounded-lg bg-white px-3 py-2">
              <p className="text-[11px] text-ink-muted">{x.label}</p>
              <p className="text-sm font-bold text-navy">{x.nilai == null ? '–' : ribuan(x.nilai)}</p>
            </div>
          ))}
        </div>
      )}
      {v.viewsTertahan > 0 && (
        <p className="mt-2 text-xs text-warning">
          Kenaikan di atas {ribuan(v.batasWajar)} views ditahan sampai ditinjau admin LokalBoost.
        </p>
      )}
      {v.sumber === 'tautan' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span>{v.viewsDiukurPada ? `Diukur ${waktuLalu(v.viewsDiukurPada)}` : 'Views belum pernah diukur'}</span>
          <button type="button" onClick={perbarui} disabled={sibuk} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-60">
            <Eye size={13} /> {sibuk ? 'Mengambil views…' : 'Perbarui views'}
          </button>
        </div>
      )}
      {galat && <p role="alert" className="mt-2 text-xs text-danger">{galat}</p>}
    </div>
  )
}

export default function SetorVideo() {
  const [cari, setCari] = useSearchParams()
  const kampanyeSaya = useApi(() => api.kampanyeSaya(), [])
  const daftar = kampanyeSaya.data?.kampanye || []
  const pilihanAwal = cari.get('kampanye')
  const [kampanyeId, setKampanyeIdLokal] = useState(pilihanAwal || '')

  // Pilih otomatis kampanye berjalan pertama supaya halaman tidak kosong.
  useEffect(() => {
    if (kampanyeId || !daftar.length) return
    setKampanyeIdLokal((daftar.find((k) => k.status === 'berjalan') || daftar[0]).id)
  }, [daftar, kampanyeId])

  const pilih = (id) => {
    setKampanyeIdLokal(id)
    setCari({ kampanye: id }, { replace: true })
    setHasil(null)
    setGalat('')
  }

  const detail = useApi(() => api.kampanyeDetail(kampanyeId), [kampanyeId], { aktif: Boolean(kampanyeId) })
  const kampanye = detail.data?.kampanye
  const [reward, setReward] = useState(null)
  useEffect(() => setReward(kampanye?.rewardSaya || null), [kampanye])

  const videoKampanye = useApi(() => api.video({ kampanyeId }), [kampanyeId], { aktif: Boolean(kampanyeId) })
  const { pengguna } = useSesi()
  const videoSaya = (videoKampanye.data?.video || []).filter((v) => v.kreatorId === pengguna?.id)

  const [url, setUrl] = useState('')
  const [judul, setJudul] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [hasil, setHasil] = useState(null)

  const muatUlang = () => {
    detail.muatUlang()
    videoKampanye.muatUlang()
  }

  const setor = async (e) => {
    e.preventDefault()
    if (!url.trim()) {
      setGalat('Tempel tautan video Anda dulu.')
      return
    }
    setSibuk(true)
    setGalat('')
    setHasil(null)
    try {
      const r = await api.setorTautanVideo({ kampanyeId, url: url.trim(), judul: judul.trim() || undefined })
      setHasil(r)
      setUrl('')
      setJudul('')
      muatUlang()
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  const berjalan = kampanye?.status === 'berjalan'

  return (
    <AppShell>
      <PageHeader
        title="Setor Video & Reward"
        subtitle="Unggah konten di akun Anda sendiri, lalu tempel tautannya. AI mencocokkan videonya dengan brief kampanye."
      >
        <RekberBadge />
      </PageHeader>

      {kampanyeSaya.memuat ? (
        <div className="mt-8"><MemuatBlok tinggi="h-24" jumlah={2} /></div>
      ) : kampanyeSaya.galat ? (
        <div className="mt-8"><GalatMuat galat={kampanyeSaya.galat} onCoba={kampanyeSaya.muatUlang} /></div>
      ) : !daftar.length ? (
        <div className="mt-8 card p-8">
          <EmptyState
            icon={Play}
            title="Belum ada kampanye yang menerima Anda"
            subtitle="Ikuti kampanye dari marketplace terlebih dahulu, lalu setor tautan videomu di sini."
            action="Cari Kampanye"
            to="/marketplace"
          />
        </div>
      ) : (
        <>
          {/* Pilih kampanye */}
          <div className="mt-8 flex gap-2 overflow-x-auto pb-1">
            {daftar.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => pilih(k.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  k.id === kampanyeId ? 'bg-navy text-white' : 'bg-cream-200 text-ink-soft hover:bg-cream-300'
                }`}
              >
                {k.nama}
                {k.status !== 'berjalan' && <span className="ml-1.5 text-xs opacity-70">({k.status === 'selesai' ? 'selesai' : k.status})</span>}
              </button>
            ))}
          </div>

          <motion.div variants={stagger} initial="initial" animate="animate" className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Kiri: setor tautan */}
            <div className="min-w-0 space-y-6 lg:col-span-3">
              <motion.form variants={fadeUp} onSubmit={setor} className="card p-6">
                <h2 className="section-title">Tempel Tautan Video</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {kampanyeSaya.data?.modeDemo
                    ? 'Tempel tautan TikTok publik. Tautan tidak harus dari akun profil Anda, tetapi video dan jumlah views harus terbaca serta AI harus menyatakan isinya sesuai kampanye.'
                    : <>TikTok, Instagram Reels, atau YouTube. Video harus diunggah dari akun yang terhubung di{' '}
                      <Link to="/profil" className="font-semibold text-navy underline">Profil Saya</Link>.</>}
                </p>

                <label className="label mt-5" htmlFor="url-video">Tautan video</label>
                <input
                  id="url-video"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@akunanda/video/..."
                  inputMode="url"
                  className="input"
                  disabled={!berjalan}
                />
                <label className="label mt-4" htmlFor="judul-video">Judul (opsional)</label>
                <input
                  id="judul-video"
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  placeholder="Kosongkan untuk memakai keterangan videonya"
                  className="input"
                  disabled={!berjalan}
                />

                {!berjalan && kampanye && (
                  <p className="mt-4 rounded-lg bg-cream-100 px-4 py-3 text-sm text-ink-soft">
                    Kampanye ini sudah tidak berjalan, jadi tidak menerima video baru.
                  </p>
                )}
                {galat && (
                  <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{galat}</p>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <Link to={`/kreator/ai-script?kampanye=${kampanyeId}`} className="text-sm font-semibold text-navy hover:underline">
                    Belum punya naskah? Buat dari brief →
                  </Link>
                  <motion.button {...tekan} type="submit" disabled={sibuk || !berjalan} className="btn-primary px-5 py-2.5 disabled:opacity-60">
                    {sibuk ? 'Membaca video & memeriksa…' : 'Setor Video'}
                  </motion.button>
                </div>

                <ul className="mt-5 space-y-1.5 border-t border-black/5 pt-4 text-xs text-ink-soft">
                  <li className="flex gap-1.5"><Info size={13} className="mt-0.5 shrink-0" /> {kampanyeSaya.data?.modeDemo ? 'Views aktual yang terbaca dihitung dan reward demo diproses otomatis saat target tercapai.' : 'Views yang dihitung hanya kenaikan setelah tautan disetor.'}</li>
                  <li className="flex gap-1.5"><Info size={13} className="mt-0.5 shrink-0" /> {kampanyeSaya.data?.modeDemo ? 'Video dari akun lain boleh untuk demo. Konten yang tidak cocok dengan brief tidak mendapat reward.' : 'Video yang diunggah sebelum Anda bergabung, atau dari akun orang lain, ditolak.'}</li>
                  {!kampanyeSaya.data?.modeDemo && <li className="flex gap-1.5"><Shield size={13} className="mt-0.5 shrink-0" /> Kenaikan views yang tidak wajar ditahan sampai ditinjau admin.</li>}
                </ul>
              </motion.form>

              <AnimatePresence>
                {hasil && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-2xl bg-navy p-6"
                  >
                    <p className="mb-4 text-sm font-semibold text-gold">{hasil.pesan}</p>
                    {hasil.pembayaran?.penutupan?.dibayarKeKreator > 0 && (
                      <p className="mb-4 rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold text-white">
                        Reward masuk ke saldo demo: {rupiah(hasil.pembayaran.penutupan.dibayarKeKreator)}
                      </p>
                    )}
                    <HasilKecocokan video={hasil.video} modeDemo={hasil.modeDemo} />
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div variants={fadeUp} className="card p-6">
                <h2 className="section-title">Video Saya di Kampanye Ini</h2>
                {videoKampanye.memuat ? (
                  <div className="mt-4"><MemuatBlok tinggi="h-20" jumlah={2} /></div>
                ) : !videoSaya.length ? (
                  <p className="mt-4 rounded-xl bg-cream-100 px-4 py-5 text-center text-sm text-ink-soft">
                    Belum ada video yang Anda setor untuk kampanye ini.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {videoSaya.map((v) => <KartuVideo key={v.id} v={v} onBerubah={muatUlang} />)}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Kanan: reward */}
            <motion.div variants={fadeUp} className="min-w-0 lg:col-span-2">
              <div className="card p-6 lg:sticky lg:top-24">
                <h2 className="section-title">Reward Anda</h2>
                {detail.memuat ? (
                  <div className="mt-4"><MemuatBlok tinggi="h-24" jumlah={2} /></div>
                ) : !reward ? (
                  <p className="mt-4 text-sm text-ink-soft">Status reward belum tersedia.</p>
                ) : (
                  <div className="mt-4">
                    <StatusReward kampanye={kampanye} reward={reward} onBerubah={(r) => (r ? setReward(r) : detail.muatUlang())} />
                  </div>
                )}
                {kampanye && (
                  <Tekan className="mt-5 block">
                    <Link to={`/kampanye/${kampanye.id}`} className="btn-outline w-full py-2.5">Lihat brief kampanye</Link>
                  </Tekan>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AppShell>
  )
}
