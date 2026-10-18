import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import {
  PageHeader, RekberBadge, EmptyState, Tekan, HoverCard, TabGaris, AIPanel,
  AvatarKreator, ChipContoh,
} from '../components/ui.jsx'
import { CentangSukses } from '../components/Feedback.jsx'
import { MemuatHalaman, GalatMuat, MemuatBlok } from '../components/Muat.jsx'
import { tekan, EASE } from '../motion.js'
import { rupiah, ribuan, gradasi, pengikut, statusLamaran } from '../format.js'
import { api, useApi } from '../api.js'
import {
  Sparkles, Star, MapPin, Check, Close, Users, ArrowRight, Message, Shield,
} from '../components/icons.jsx'

/**
 * Pilih & Setujui Kreator — PRD §7.1 langkah 4–5.
 *
 * Dua tab, dua sumber data yang berbeda dan keduanya nyata:
 *   - Rekomendasi AI  → GET /api/kampanye/:id/rekomendasi-kreator
 *   - Undangan terkirim → GET /api/kampanye/:id/lamaran
 *
 * Daftar undangan memuat undangan yang pernah dikirim. Banyak kreator dapat
 * bergabung selama kampanye masih memiliki reward.
 */
export default function PilihKreator() {
  const { id } = useParams()
  const [tab, setTab] = useState('rekomendasi')
  const [sibuk, setSibuk] = useState(null)
  const [galatAksi, setGalatAksi] = useState('')
  const [diundang, setDiundang] = useState([])

  const kampanye = useApi(() => api.kampanyeDetail(id), [id])
  const rekomendasi = useApi(() => api.rekomendasiKreator(id), [id])
  const pelamar = useApi(() => api.lamaranKampanye(id), [id])

  if (kampanye.memuat) {
    return (
      <AppShell>
        <MemuatHalaman />
      </AppShell>
    )
  }
  if (kampanye.galat) {
    return (
      <AppShell>
        <GalatMuat galat={kampanye.galat} onCoba={kampanye.muatUlang} judul="Kampanye tidak bisa dibuka" />
      </AppShell>
    )
  }
  // Detail kampanye bersifat publik, jadi penjagaan di atas lolos untuk siapa
  // pun. Yang menandakan kampanye ini bukan milik pengguna adalah dua muatan
  // khusus pemilik yang dijawab 403 oleh API. Tanpa penjagaan ini, UMKM lain
  // melihat kerangka halaman persetujuan milik orang lain: judul kampanye,
  // anggaran, dan nama kreator yang sudah dipilih.
  const ditolak = [pelamar.galat, rekomendasi.galat].find((g) => g?.status === 403)
  if (ditolak) {
    return (
      <AppShell>
        <GalatMuat
          galat={ditolak}
          onCoba={() => {
            pelamar.muatUlang()
            rekomendasi.muatUlang()
          }}
          judul="Kampanye ini bukan milik Anda"
        />
      </AppShell>
    )
  }

  const k = kampanye.data.kampanye
  const daftarRekomendasi = rekomendasi.data?.rekomendasi || []
  const daftarPelamar = pelamar.data?.lamaran || []
  // Banyak kreator boleh bergabung sampai anggaran (atau kuota produk) habis.
  // Yang menutup pintu bukan "sudah ada kreator", tapi anggaran yang habis.
  const tutup = !k.menerimaKreator
  const sudahAdaKreator = k.jumlahKreator > 0

  const jalankan = async (kunci, aksi) => {
    setGalatAksi('')
    setSibuk(kunci)
    try {
      await aksi()
      pelamar.muatUlang()
      rekomendasi.muatUlang()
      kampanye.muatUlang()
    } catch (err) {
      setGalatAksi(err.message)
    } finally {
      setSibuk(null)
    }
  }

  const undang = (kreatorId) =>
    jalankan(`undang-${kreatorId}`, async () => {
      await api.undang(id, kreatorId, `Kami ingin mengajak Anda mengerjakan "${k.nama}".`)
      setDiundang((d) => [...d, kreatorId])
    })

  return (
    <AppShell>
      <Link to={`/kampanye/${k.id}`} className="mb-5 inline-flex text-sm font-semibold text-ink-soft hover:text-navy">
        ← Kembali ke {k.nama}
      </Link>

      <PageHeader
        title="Pilih & Setujui Kreator"
        subtitle={`Untuk kampanye "${k.nama}" · target ${ribuan(k.targetViews)} views · anggaran ${rupiah(k.anggaran)}`}
      >
        <RekberBadge text={`${rupiah(k.anggaran)} Tertahan`} />
      </PageHeader>

      {/* Panel AI */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-6">
        <AIPanel
          title="Rekomendasi Kreator"
          ikon={Users}
          aksi={
            sudahAdaKreator ? (
              <Link
                to={`/umkm/kampanye/${k.id}/laporan`}
                className="btn bg-white px-5 py-2.5 text-navy hover:bg-cream-200"
              >
                Lihat Laporan <ArrowRight size={16} />
              </Link>
            ) : null
          }
        >
          {tutup ? (
            <>
              Anggaran kampanye ini sudah habis, jadi tidak ada kreator baru yang bisa dibayar. {k.jumlahKreator} kreator
              sudah bergabung.
            </>
          ) : sudahAdaKreator ? (
            <>
              <b className="text-white">{k.jumlahKreator} kreator</b> sudah bergabung. Anda masih bisa mengundang kreator lain
              selama masa kampanye dan reward masih tersedia.
            </>
          ) : (
            <>
              Skor kecocokan dihitung dari kesamaan lokasi toko ({k.lokasi}), kategori produk
              ({k.kategori}), reputasi dari ulasan sebelumnya, dan ketersediaan kreator. Setiap
              skor bisa dibuka rinciannya, bukan angka yang muncul begitu saja.
            </>
          )}
        </AIPanel>
      </motion.div>

      {galatAksi && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {galatAksi}
        </p>
      )}

      {/* Tab */}
      <div className="mt-8">
        <TabGaris
          layoutId="tab-pilih-kreator"
          aktif={tab}
          onGanti={setTab}
          tabs={[
            { id: 'rekomendasi', label: `Rekomendasi AI (${daftarRekomendasi.length})` },
            { id: 'pelamar', label: `Undangan Terkirim (${daftarPelamar.length})` },
          ]}
        />
      </div>

      {tab === 'rekomendasi' ? (
        rekomendasi.memuat ? (
          <div className="mt-6"><MemuatBlok tinggi="h-64" jumlah={2} /></div>
        ) : (
          <motion.div
            key="rekomendasi"
            variants={stagger}
            initial="initial"
            animate="animate"
            className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            {daftarRekomendasi.map((c) => {
              const sudah = c.sudahDiundang || diundang.includes(c.kreatorId)
              return (
                <HoverCard key={c.kreatorId} className="card overflow-hidden">
                  <div className={`relative grid h-32 place-items-center overflow-hidden bg-gradient-to-br ${gradasi({ id: c.kreatorId, gradasi: c.gradasi })}`}>
                    <AvatarKreator c={c} className="h-20 w-20 rounded-full ring-4 ring-white/80" />
                    <span className="chip absolute left-3 top-3 gap-1 bg-navy text-white">
                      <Sparkles size={12} /> Cocok {c.kecocokan}%
                    </span>
                    {c.terverifikasi && (
                      <span className="chip absolute right-3 top-3 gap-1 bg-gold text-gold-text">
                        <Check size={12} /> Terverifikasi
                      </span>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold text-navy">{c.nama}</p>
                      <ChipContoh ada={c.contoh} />
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                      <MapPin size={12} /> {c.lokasi} · {c.niche}
                    </p>

                    <p className="mt-3 rounded-lg bg-cream-100 px-3 py-2 text-xs text-ink-soft">
                      <b className="text-navy">Alasan AI:</b> {c.alasan}
                    </p>

                    <div className="mt-4 grid grid-cols-2 border-t border-black/5 pt-4 text-sm">
                      <div>
                        <p className="font-bold text-navy">{pengikut(c.pengikut)}</p>
                        <p className="text-xs text-ink-muted">Pengikut</p>
                      </div>
                      <div className="border-l border-black/5 pl-4">
                        {/* Angka reputasi adalah komponen skor AI (maksimal 20),
                            bukan jumlah ulasan — penyebutnya ikut ditulis supaya
                            "20" tidak terbaca sebagai "20 ulasan". */}
                        <p className="flex items-center gap-1 font-bold text-navy">
                          <Star size={13} className="text-gold-text" /> {c.rincian?.rating ?? 0}
                          <span className="text-xs font-normal text-ink-muted">/20</span>
                        </p>
                        <p className="text-xs text-ink-muted">Skor reputasi AI</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <motion.button
                        {...tekan}
                        disabled={sudah || tutup || sibuk === `undang-${c.kreatorId}`}
                        onClick={() => undang(c.kreatorId)}
                        className={`w-full py-2.5 disabled:cursor-not-allowed ${
                          sudah ? 'btn-outline' : 'btn-primary disabled:opacity-50'
                        }`}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={sudah ? 'terkirim' : 'undang'}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16, ease: EASE.signature }}
                            className="flex items-center justify-center gap-2"
                          >
                            {sudah ? <><Check size={15} /> Sudah Diundang</> : 'Undang Kreator'}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>
                      <Link to={`/kreator/profil/${c.kreatorId}`} className="btn-ghost w-full py-2">
                        Lihat Profil
                      </Link>
                    </div>
                  </div>
                </HoverCard>
              )
            })}
          </motion.div>
        )
      ) : (
        <motion.div
          key="pelamar"
          variants={stagger}
          initial="initial"
          animate="animate"
          className="mt-6 space-y-4"
        >
          {pelamar.memuat ? (
            <MemuatBlok tinggi="h-32" jumlah={2} />
          ) : daftarPelamar.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Belum ada undangan terkirim"
              subtitle="Pilih kreator dari tab Rekomendasi AI untuk mengirim undangan kampanye."
            />
          ) : (
            daftarPelamar.map((p) => {
              const s = statusLamaran(p.status)
              return (
                <motion.div key={p.id} variants={fadeUp} className="card p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <AvatarKreator c={p} className="h-14 w-14 rounded-full" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-navy">{p.nama}</p>
                        {p.niche && (
                          <span className="chip bg-cream-200 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                            {p.niche}
                          </span>
                        )}
                        {p.kecocokan != null && (
                          <span className="chip gap-1 bg-navy text-[10px] text-white">
                            <Sparkles size={11} /> Cocok {p.kecocokan}%
                          </span>
                        )}
                        <ChipContoh ada={p.contoh} />
                        {p.jenis === 'undangan' && (
                          <span className="chip bg-cream-300 text-[10px] uppercase tracking-wide text-ink-soft">
                            Undangan Anda
                          </span>
                        )}
                      </div>

                      <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                        <span className="flex items-center gap-1"><MapPin size={12} /> {p.lokasi || '—'}</span>
                        <span>{pengikut(p.pengikut)} pengikut</span>
                        {p.terverifikasi && (
                          <span className="flex items-center gap-1 text-gold-text">
                            <Check size={12} /> Terverifikasi
                          </span>
                        )}
                      </p>

                      {p.pesan && (
                        <p className="mt-3 flex gap-2 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-soft">
                          <Message size={16} className="mt-0.5 shrink-0 text-ink-muted" />
                          “{p.pesan}”
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                      <AnimatePresence mode="wait" initial={false}>
                        {p.status === 'disetujui' ? (
                          <motion.span
                            key="disetujui"
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.22, ease: EASE.settle }}
                            className="chip-success justify-center px-4 py-2.5"
                          >
                            <CentangSukses size={16} /> Disetujui
                          </motion.span>
                        ) : p.status !== 'menunggu' ? (
                          <motion.span
                            key="selesai"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.22, ease: EASE.signature }}
                            className="chip-danger justify-center px-4 py-2.5"
                          >
                            <Close size={15} /> {s.label}
                          </motion.span>
                        ) : (
                          <motion.div
                            key="pilihan"
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.16, ease: EASE.exit }}
                            className="flex flex-wrap gap-2 sm:flex-col"
                          >
                            <motion.button
                              {...tekan}
                              disabled={tutup || sibuk === `setuju-${p.id}`}
                              onClick={() =>
                                jalankan(`setuju-${p.id}`, () => api.setujuiLamaran(id, p.id))
                              }
                              className="btn-primary px-5 py-2.5 disabled:opacity-50"
                            >
                              <Check size={15} /> Setujui
                            </motion.button>
                            <motion.button
                              {...tekan}
                              disabled={sibuk === `tolak-${p.id}`}
                              onClick={() => jalankan(`tolak-${p.id}`, () => api.tolakLamaran(id, p.id))}
                              className="btn-outline px-5 py-2.5 disabled:opacity-50"
                            >
                              Tolak
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <Link to={`/kreator/profil/${p.kreatorId}`} className="btn-ghost px-5 py-2.5">
                        Profil
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}

          <motion.div
            variants={fadeUp}
            className="flex items-start gap-3 rounded-xl border border-gold-border bg-gold px-4 py-3.5"
          >
            <Shield size={18} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-sm text-gold-text">
              Dana Anda tetap aman di Rekber sampai kreator menyelesaikan pekerjaannya.
              Bila terjadi masalah, Anda bisa{' '}
              <Link to="/dispute" className="font-semibold underline">mengajukan sengketa</Link>.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AppShell>
  )
}
