import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, StatCard, StatusChip, AIPanel, Tekan, EmptyState, AvatarKreator } from '../components/ui.jsx'
import { MemuatHalaman, GalatMuat, MemuatBlok } from '../components/Muat.jsx'
import { EASE, DUR } from '../motion.js'
import { rupiah, ribuan, nilai, persen, tanggal, statusKampanye, statusModerasi, statusSengketa } from '../format.js'
import { api, useApi } from '../api.js'
import {
  Shield, Scale, Eye, Wallet, Store, Users, Video, ArrowRight, Check, Clock, Star, Sparkles,
} from '../components/icons.jsx'

/**
 * Ruang Admin Platform — PRD §4.3 Persona 3:
 * "Mengawasi transaksi, sengketa (dispute), dan kualitas konten di platform."
 *
 * Tiga tugas itu kini punya tombolnya masing-masing dan semuanya bekerja:
 * moderasi konten (loloskan / minta revisi), verifikasi profil pengguna, dan
 * neraca dana per kampanye yang memperlihatkan selisihnya apa adanya —
 * kalau escrow bocor, halaman inilah yang menunjukkannya lebih dulu.
 */
export default function Admin() {
  const ringkasan = useApi(() => api.adminRingkasan(), [])
  const konten = useApi(() => api.adminKonten(), [])
  const kampanye = useApi(() => api.adminKampanye(), [])
  const kreator = useApi(() => api.adminPengguna('kreator'), [])
  const sengketa = useApi(() => api.sengketa(), [])
  const pembelajaran = useApi(() => api.adminPembelajaran(), [])
  const usulan = useApi(() => api.adminUsulanPenyetelan(), [])

  const [sibuk, setSibuk] = useState(null)
  const [galatAksi, setGalatAksi] = useState('')
  const [catatan, setCatatan] = useState({})

  if (ringkasan.memuat) {
    return (
      <AppShell>
        <MemuatHalaman />
      </AppShell>
    )
  }
  if (ringkasan.galat) {
    return (
      <AppShell>
        <GalatMuat galat={ringkasan.galat} onCoba={ringkasan.muatUlang} judul="Ruang admin gagal dimuat" />
      </AppShell>
    )
  }

  const r = ringkasan.data

  const moderasi = async (id, keputusan) => {
    setGalatAksi('')
    if (keputusan === 'revisi' && !catatan[id]?.trim()) {
      setGalatAksi('Permintaan revisi wajib disertai catatan untuk kreator.')
      return
    }
    setSibuk(`${keputusan}-${id}`)
    try {
      await api.adminModerasi(id, { keputusan, catatan: catatan[id]?.trim() || undefined })
      konten.muatUlang()
      ringkasan.muatUlang()
    } catch (err) {
      setGalatAksi(err.message)
    } finally {
      setSibuk(null)
    }
  }

  /** Video tautan: kenaikan views di atas batas wajar ditahan sampai admin mengakuinya. */
  const akuiViews = async (id) => {
    setGalatAksi('')
    setSibuk(`akui-${id}`)
    try {
      await api.akuiViewsVideo(id)
      konten.muatUlang()
    } catch (err) {
      setGalatAksi(err.message)
    } finally {
      setSibuk(null)
    }
  }

  const verifikasi = async (id, terverifikasi) => {
    setGalatAksi('')
    setSibuk(`verif-${id}`)
    try {
      await api.adminVerifikasi(id, { terverifikasi })
      kreator.muatUlang()
      ringkasan.muatUlang()
    } catch (err) {
      setGalatAksi(err.message)
    } finally {
      setSibuk(null)
    }
  }

  const sengketaTerbuka = (sengketa.data?.sengketa || []).filter((s) =>
    ['terbuka', 'ditinjau'].includes(s.status),
  )

  return (
    <AppShell>
      <PageHeader
        title="Ringkasan Platform"
        subtitle="Pengawasan transaksi, sengketa, dan kualitas konten di seluruh LokalBoost."
      >
        <span className="chip gap-2 border border-gold-border bg-gold px-4 py-2.5 text-gold-text">
          <Shield size={16} /> Akses Terbatas — Admin
        </span>
      </PageHeader>

      {galatAksi && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {galatAksi}
        </p>
      )}

      <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 space-y-6">
        {/* Metrik keberhasilan PRD §3.2 */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <StatCard
            label="Kampanye Berjalan"
            nilai={r.kampanye.berjalan}
            sub={`dari ${r.kampanye.total} kampanye total`}
            icon={Store}
          />
          <StatCard
            label="Dana di Rekber"
            nilai={r.keuangan.danaDiRekber}
            prefiks="Rp "
            sub={`${rupiah(r.keuangan.totalDisetor)} pernah disetor`}
            icon={Shield}
          />
          <StatCard
            label="View Disaring"
            nilai={r.antiFraud.disaring}
            sub={`${persen(r.antiFraud.persenDisaring)}% dari total tayangan`}
            subTone="text-danger"
            icon={Eye}
          />
          <StatCard
            label={`Komisi ${r.keuangan.komisiPersen}%`}
            nilai={r.keuangan.komisiTerkumpul}
            prefiks="Rp "
            sub="Dipotong dari bagian kreator"
            icon={Wallet}
          />
          <StatCard
            label="Biaya Pasang Kampanye"
            nilai={r.keuangan.biayaPasangTerkumpul ?? 0}
            prefiks="Rp "
            sub={`${rupiah(r.keuangan.biayaPasangTarif ?? 0)} per kampanye, di luar Rekber`}
            icon={Wallet}
          />
        </div>

        {/* Audit sampling — PRD §12 */}
        <motion.div variants={fadeUp}>
          <AIPanel
            title="Audit Sampling Anti-Fraud"
            ikon={Shield}
            badge="PRD §12"
            action="Buka Antrean Sengketa"
            to="/dispute"
          >
            Target PRD: kurang dari 3% view palsu lolos deteksi. Sejauh ini sistem menyaring{' '}
            <b className="text-white">{ribuan(r.antiFraud.disaring)} tayangan</b> (
            {persen(r.antiFraud.persenDisaring)}% dari total) dan{' '}
            <b className="text-white">{r.sengketa.terbuka} sengketa</b> masih menunggu keputusan.
            {r.antiFraud.rincian.length > 0 && (
              <span className="mt-3 block text-white/70">
                Alasan terbanyak: {r.antiFraud.rincian[0].alasan} ({ribuan(r.antiFraud.rincian[0].jumlah)}).
              </span>
            )}
          </AIPanel>
        </motion.div>

        {/* Kampanye yang menyinggung usaha lain, sebelum bisa dibayar. */}
        <motion.div variants={fadeUp}>
          <ModerasiKampanye />
        </motion.div>

        {/* Bio, deskripsi, dan ulasan yang lolos tapi samar. */}
        <motion.div variants={fadeUp}>
          <PenandaanEtika />
        </motion.div>

        {/* Ketepatan AI menurut keputusan manusia — dasar penyetelan ambang. */}
        <motion.div variants={fadeUp}>
          <KetepatanAI keadaan={pembelajaran} />
        </motion.div>

        {/* Langkah berikutnya: angka barunya sebaiknya berapa. */}
        <motion.div variants={fadeUp}>
          <UsulanPenyetelan keadaan={usulan} />
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Antrean sengketa */}
          <motion.div variants={fadeUp} className="card p-7 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 section-title">
                <Scale size={20} /> Antrean Sengketa
              </h2>
              <span className="chip-warning">{sengketaTerbuka.length} menunggu</span>
            </div>

            {sengketa.memuat ? (
              <div className="mt-5"><MemuatBlok tinggi="h-24" jumlah={2} /></div>
            ) : (sengketa.data?.sengketa || []).length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  icon={Scale}
                  title="Belum ada sengketa"
                  subtitle="Semua kampanye berjalan tanpa keberatan dari pihak mana pun."
                />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {sengketa.data.sengketa.map((s, i) => {
                  const st = statusSengketa(s.status)
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: DUR.quick, delay: 0.1 + Math.min(i, 6) * 0.06, ease: EASE.entrance }}
                      className="rounded-xl border border-black/5 bg-cream-100 px-4 py-4"
                    >
                      <div className="flex gap-4">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-navy shadow-card">
                          <Scale size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-navy">{s.kategori.replace(/_/g, ' ')}</p>
                          <p className="text-sm text-ink-soft">SNG-{s.id} · {s.namaKampanye}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                            <Clock size={12} /> Diajukan {s.pengaju} · {tanggal(s.dibuatPada)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
                        <StatusChip status={st.label} tone={st.tone} denyut={st.langkah < 3} />
                        <Tekan>
                          <Link to="/dispute" className="btn-outline px-4 py-2">Tinjau</Link>
                        </Tekan>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* Kualitas konten */}
          <motion.div variants={fadeUp} className="card p-7 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 section-title">
                <Video size={20} /> Kualitas Konten
              </h2>
              <span className="chip-warning">{r.konten.menungguModerasi} baru</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Video dari kreator. Video tautan dengan kenaikan views tidak wajar ada di urutan teratas.
            </p>

            {konten.memuat ? (
              <div className="mt-5"><MemuatBlok tinggi="h-24" jumlah={2} /></div>
            ) : (konten.data?.konten || []).length === 0 ? (
              <div className="mt-5">
                <EmptyState icon={Video} title="Antrean kosong" subtitle="Belum ada video yang perlu ditinjau." />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {konten.data.konten.map((k) => {
                  const m = statusModerasi(k.moderasi)
                  return (
                    <div key={k.id} className="rounded-xl bg-cream-100 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-bold text-navy">{k.judul}</p>
                        <StatusChip status={m.label} tone={m.tone} />
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {k.kreator} · {k.kampanye} · {ribuan(k.views)} views
                        {k.sumber === 'tautan' && (
                          <>
                            {' '}·{' '}
                            <a href={k.url} target="_blank" rel="noreferrer noopener" className="font-semibold text-navy underline">
                              buka video{k.akunPenulis ? ` @${k.akunPenulis}` : ''}
                            </a>
                          </>
                        )}
                      </p>
                      {k.viewsTertahan > 0 && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs">
                          <span className="text-warning">
                            {ribuan(k.viewsTertahan)} views ditahan: kenaikan di atas batas wajar. Pencairan kreator menunggu keputusan ini.
                          </span>
                          <button
                            type="button"
                            disabled={sibuk === `akui-${k.id}`}
                            onClick={() => akuiViews(k.id)}
                            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
                          >
                            Akui views
                          </button>
                        </div>
                      )}
                      {k.etika && k.etika.status !== 'lolos' && (
                        <div className="mt-2 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning">
                          <p className="font-semibold">
                            {k.etika.status === 'ditolak' ? 'Ditahan otomatis' : 'Perlu dicek'}: menyinggung usaha lain?
                          </p>
                          {k.etika.temuan?.slice(0, 3).map((f, i) => (
                            <p key={i} className="mt-1 break-words italic text-ink-soft">“{f.kutipan}” ({f.asal})</p>
                          ))}
                        </div>
                      )}
                      {k.etika && k.etika.ucapanTerperiksa === false && (
                        <p className="mt-2 text-xs text-ink-muted">
                          Ucapan di video belum didengar AI (hanya judul dan naskah yang diperiksa). Tonton sebelum meloloskan.
                        </p>
                      )}
                      {k.catatanModerasi && (
                        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
                          Catatan: {k.catatanModerasi}
                        </p>
                      )}

                      {k.moderasi === 'menunggu' && (
                        <>
                          <input
                            value={catatan[k.id] || ''}
                            onChange={(e) => setCatatan((c) => ({ ...c, [k.id]: e.target.value }))}
                            placeholder="Catatan untuk kreator (wajib bila minta revisi)"
                            className="input mt-3 py-2 text-xs"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={sibuk === `lolos-${k.id}`}
                              onClick={() => moderasi(k.id, 'lolos')}
                              className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
                            >
                              <Check size={14} /> Loloskan
                            </button>
                            <button
                              type="button"
                              disabled={sibuk === `revisi-${k.id}`}
                              onClick={() => moderasi(k.id, 'revisi')}
                              className="btn-outline px-4 py-2 text-xs disabled:opacity-60"
                            >
                              Minta Revisi
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Pengawasan pengguna */}
        <motion.div variants={fadeUp} className="card p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 section-title">
              <Users size={20} /> Kreator Terdaftar ({r.pengguna.kreator})
            </h2>
            <Link to="/marketplace" className="text-sm font-semibold text-navy hover:opacity-70">
              Lihat di Marketplace
            </Link>
          </div>

          {kreator.memuat ? (
            <div className="mt-5"><MemuatBlok tinggi="h-16" jumlah={3} /></div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(kreator.data?.pengguna || []).map((c) => (
                <div
                  key={c.id}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-black/5 bg-cream-100 p-4"
                >
                  <Link to={`/kreator/profil/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <AvatarKreator c={c} className="h-11 w-11 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-navy">
                        <span className="truncate">{c.nama}</span>
                        {c.profilTerverifikasi && (
                          <span className="chip shrink-0 gap-1 bg-gold px-2 text-[10px] text-gold-text">
                            <Check size={10} /> Terverifikasi
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-ink-muted">
                        <Star size={11} className="text-gold-text" />
                        {c.rating ? nilai(c.rating) : 'Belum dinilai'} · {c.niche || '—'} · {c.lokasi || '—'}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    disabled={sibuk === `verif-${c.id}`}
                    onClick={() => verifikasi(c.id, !c.profilTerverifikasi)}
                    className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-navy/40 hover:text-navy disabled:opacity-60"
                  >
                    {c.profilTerverifikasi ? 'Cabut' : 'Verifikasi'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-gold-border bg-gold px-4 py-3.5">
            <Shield size={18} className="mt-0.5 shrink-0 text-navy" />
            <p className="text-sm text-gold-text">
              Alamat IP penonton tidak pernah disimpan mentah — hanya sidik jari terenkripsi,
              sesuai UU Perlindungan Data Pribadi (PRD §9).
            </p>
          </div>
        </motion.div>

        {/* Neraca kampanye */}
        <motion.div variants={fadeUp} className="card p-7">
          <h2 className="flex items-center gap-2 section-title">
            <Wallet size={20} /> Neraca Dana per Kampanye
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Bagian kreator + komisi platform + sisa (tertahan atau dikembalikan) harus selalu sama
            dengan dana disetor. Kolom selisih memperlihatkannya apa adanya.
          </p>

          {kampanye.memuat ? (
            <div className="mt-5"><MemuatBlok tinggi="h-40" jumlah={1} /></div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-ink-muted">
                    <th className="pb-3 font-semibold">Kampanye</th>
                    <th className="pb-3 font-semibold">Disetor</th>
                    <th className="pb-3 font-semibold">Kreator</th>
                    <th className="pb-3 font-semibold">Komisi</th>
                    <th className="pb-3 font-semibold">Sisa</th>
                    <th className="pb-3 font-semibold">Selisih</th>
                    <th className="pb-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {(kampanye.data?.kampanye || []).map((k) => {
                    const st = statusKampanye(k.status)
                    return (
                      <tr key={k.id}>
                        <td className="py-3 font-medium text-navy">
                          <Link to={`/kampanye/${k.id}`} className="hover:underline">{k.nama}</Link>
                          <span className="block text-xs font-normal text-ink-muted">{k.umkm}</span>
                        </td>
                        <td className="py-3 text-ink-soft">{rupiah(k.disetor)}</td>
                        <td className="py-3 text-ink-soft">{rupiah(k.diterimaKreator)}</td>
                        <td className="py-3 text-ink-soft">{rupiah(k.komisi)}</td>
                        <td className="py-3 text-ink-soft">
                          {rupiah(k.status === 'selesai' ? k.dikembalikan : k.sisaDitahan)}
                        </td>
                        <td className={`py-3 font-semibold ${k.selisihNeraca === 0 ? 'text-success' : 'text-danger'}`}>
                          {k.selisihNeraca === 0 ? 'Nol' : rupiah(k.selisihNeraca)}
                        </td>
                        <td className="py-3">
                          <StatusChip status={st.label} tone={st.tone} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Tekan className="mt-5 inline-block">
            <Link to="/dispute" className="btn-outline px-5 py-2.5">
              Buka Pusat Sengketa <ArrowRight size={16} />
            </Link>
          </Tekan>
        </motion.div>
      </motion.div>
    </AppShell>
  )
}

/**
 * Ketepatan AI menurut keputusan manusia.
 *
 * Bukan dasbor pemantauan — ini alat setel. Dua angka di dalamnya menjawab
 * pertanyaan yang tidak bisa dijawab sistem tentang dirinya sendiri: apakah
 * aturan anti-fraud terlalu galak, dan apakah rekomendasi matchmaker memang
 * yang dipilih orang. Sumbernya keputusan manusia yang sudah tercatat —
 * putusan sengketa dan persetujuan kreator.
 *
 * Angka nol di sini bukan kegagalan, melainkan keadaan wajar di awal:
 * belum ada keputusan yang bisa dipelajari. Layar harus mengatakannya
 * apa adanya, bukan menampilkan grafik kosong yang seolah-olah bermakna.
 */
function KetepatanAI({ keadaan }) {
  const { data, memuat, galat, muatUlang } = keadaan

  if (memuat) return <MemuatBlok tinggi="h-56" jumlah={1} />
  if (galat) return <GalatMuat galat={galat} onCoba={muatUlang} judul="Ketepatan AI gagal dimuat" />
  if (!data) return null

  const { antiFraud: af, matchmaker: mm } = data
  const belumAdaSengketa = af.totalDisaring === 0

  return (
    <div className="card p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 section-title">
          <Star size={20} /> Ketepatan AI
        </h2>
        <span className="chip">Dasar penyetelan ambang</span>
      </div>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
        Diukur dari keputusan manusia, bukan dari penilaian sistem terhadap dirinya sendiri.
        Angka di sini yang menentukan apakah ambang anti-fraud dan bobot matchmaker perlu digeser.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Anti-fraud: seberapa sering menyaring orang yang tidak bersalah */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            Anti-Fraud — tingkat salah saring
          </h3>

          {belumAdaSengketa ? (
            <p className="mt-3 text-sm text-ink-soft">
              Belum ada tayangan yang disaring, jadi belum ada yang bisa dinilai.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-navy">
                  {persen(af.persenSalahKeseluruhan)}%
                </span>
                <span className="text-sm text-ink-soft">
                  dipulihkan admin ({ribuan(af.totalDipulihkan)} dari {ribuan(af.totalDisaring)})
                </span>
              </div>

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="pb-2 font-semibold">Alasan penyaringan</th>
                    <th className="pb-2 text-right font-semibold">Disaring</th>
                    <th className="pb-2 text-right font-semibold">Keliru</th>
                  </tr>
                </thead>
                <tbody>
                  {af.perAlasan.map((a) => {
                    const perlu = af.perluDitinjau.includes(a.alasan)
                    return (
                      <tr key={a.alasan} className="border-b border-black/5 last:border-0">
                        <td className="py-2.5 pr-3 text-ink">{a.alasan}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-soft">
                          {ribuan(a.totalDisaring)}
                        </td>
                        <td
                          className={`py-2.5 text-right font-semibold tabular-nums ${
                            perlu ? 'text-danger' : 'text-ink-soft'
                          }`}
                        >
                          {persen(a.persenSalah)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {af.perluDitinjau.length > 0 && (
                <p className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-xs leading-relaxed text-danger">
                  Aturan bertanda merah salah lebih dari 10% — ambangnya terlalu ketat dan
                  menghukum penonton sungguhan. Setel lewat variabel <code>AF_*</code> di server.
                </p>
              )}
            </>
          )}
        </div>

        {/* Matchmaker: apakah yang direkomendasikan memang yang dipilih */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">
            Matchmaker — ketepatan rekomendasi
          </h3>

          {!mm.jumlahKeputusan ? (
            <p className="mt-3 text-sm text-ink-soft">
              {mm.catatan} Angkanya mulai terisi begitu UMKM menyetujui atau mengundang kreator.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  ['Pilihan = peringkat 1', `${persen(mm.persenPeringkat1)}%`],
                  ['Pilihan ada di 3 besar', `${persen(mm.persenPeringkat3)}%`],
                  ['Rata-rata peringkat dipilih', mm.rerataPeringkat],
                  ['Rata-rata skor dipilih', mm.rerataSkor],
                ].map(([label, angka]) => (
                  <div key={label} className="rounded-xl bg-cream-200 px-4 py-3">
                    <p className="text-xl font-extrabold text-navy">{angka}</p>
                    <p className="mt-0.5 text-xs leading-snug text-ink-soft">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                Dihitung dari {mm.jumlahKeputusan} keputusan sungguhan. Kalau pilihan orang jarang
                berada di peringkat teratas, bobot komponen yang perlu digeser — bukan daftarnya
                yang perlu diperpanjang.
              </p>
            </>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(mm.bobotBerlaku).map(([nama, bobot]) => (
              <span key={nama} className="chip text-xs">
                {nama} {bobot}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Usulan Penyetelan.
 *
 * Panel di atas menjawab "aturan mana yang salah". Panel ini menjawab
 * pertanyaan berikutnya — "jadi angkanya sebaiknya berapa" — dan berhenti di
 * situ. Ia tidak punya tombol "terapkan, dan itu disengaja: ambang yang
 * menjaga uang orang tidak boleh berubah tanpa seseorang yang bertanggung
 * jawab menekan enter di servernya sendiri.
 *
 * Yang sama pentingnya: alat ini HANYA bisa mengusulkan pelonggaran. Bukti
 * yang dimilikinya cuma penyaringan yang dinyatakan keliru admin; kecurangan
 * yang lolos tidak pernah ditandai siapa pun. Kalimat penutup panel ini
 * mengatakannya apa adanya alih-alih membiarkan orang menyangka daftar kosong
 * berarti "sistemnya sudah sempurna".
 */
function UsulanPenyetelan({ keadaan }) {
  const { data, memuat, galat, muatUlang } = keadaan

  if (memuat) return <MemuatBlok tinggi="h-40" jumlah={1} />
  if (galat) return <GalatMuat galat={galat} onCoba={muatUlang} judul="Usulan penyetelan gagal dimuat" />
  if (!data) return null

  const { antiFraud: af, matchmaker: mm, barisEnv } = data

  return (
    <div className="card p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 section-title">
          <Sparkles size={20} /> Usulan Penyetelan
        </h2>
        <span className="chip">Perlu persetujuan manusia</span>
      </div>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
        Terjemahan angka di panel atas menjadi ambang baru. Sama persis dengan keluaran{' '}
        <code>npm run setel</code> di server.
      </p>

      {af.usulan.length === 0 && mm.usulan.length === 0 ? (
        <p className="mt-5 rounded-xl bg-cream-200 px-4 py-3 text-sm text-ink-soft">
          Belum ada angka yang perlu digeser. Usulan baru muncul setelah sebuah aturan
          terbukti salah lebih dari 10% dari minimal 20 penyaringan — di bawah itu, angkanya
          derau, bukan bukti.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {af.usulan.map((u) => (
            <div key={u.env} className="rounded-xl border border-gold-border bg-gold px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <code className="text-sm font-bold text-navy">{u.env}</code>
                <span className="text-sm text-gold-text">
                  {u.sekarang} → <strong className="text-navy">{u.disarankan}</strong> {u.satuan}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gold-text">
                <strong>{u.bukti.dipulihkan}</strong> dari{' '}
                <strong>{u.bukti.totalDisaring}</strong> penyaringan dengan alasan “{u.alasan}”
                dinyatakan keliru oleh admin ({persen(u.bukti.persenSalah)}%). Artinya: {u.arah}.
              </p>
              <p className="mt-1.5 text-xs italic text-gold-text/80">{u.catatan}</p>
            </div>
          ))}

          {mm.usulan.map((u) => (
            <div key={u.label} className="rounded-xl border border-black/10 bg-cream-200 px-5 py-4">
              <p className="text-sm font-bold text-navy">Bobot matchmaker: {u.label}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                Ketepatan peringkat-1 naik ke <strong>{persen(u.persenPeringkat1)}%</strong>{' '}
                (dari {persen(mm.ketepatanSekarangHasilReplay?.persenPeringkat1 ?? 0)}%) pada
                replay {mm.jumlahDireplay} keputusan. Ubah objek <code>BOBOT</code> di{' '}
                <code>services/matchmaker.js</code>.
              </p>
              <p className="mt-1.5 text-xs italic text-ink-muted">
                Angka ini perkiraan — replay memakai reputasi kreator hari ini, sementara skor
                aslinya dibekukan saat keputusan diambil.
              </p>
            </div>
          ))}
        </div>
      )}

      {barisEnv.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Salin ke .env lalu nyalakan ulang server
          </p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-navy px-4 py-3 text-sm text-cream">
            {barisEnv.join('\n')}
          </pre>
        </div>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-muted">
        Alat ini hanya bisa mengusulkan <strong>pelonggaran</strong>. Satu-satunya data berlabel
        yang dimiliki sistem adalah penyaringan yang dinyatakan keliru oleh admin — kecurangan
        yang berhasil lolos tidak pernah ditandai siapa pun, jadi tidak ada bukti yang bisa
        menyuruh kita memperketat.
      </p>
    </div>
  )
}

/**
 * Antrean pemeriksaan etika kampanye (services/moderasi-kampanye.js):
 * kampanye yang dicurigai menjelekkan usaha lain, atau yang penolakan
 * otomatisnya dibanding UMKM. Selama di sini, kampanye tidak bisa dibayar.
 */
function ModerasiKampanye() {
  const antrean = useApi(() => api.adminModerasiKampanye(), [])
  const [catatan, setCatatan] = useState({})
  const [sibuk, setSibuk] = useState(null)
  const [galat, setGalat] = useState('')

  const putus = async (id, keputusan) => {
    setGalat('')
    if (keputusan === 'ditolak' && !catatan[id]?.trim()) {
      setGalat('Penolakan wajib disertai catatan untuk UMKM.')
      return
    }
    setSibuk(`${keputusan}-${id}`)
    try {
      await api.adminPutusKampanye(id, { keputusan, catatan: catatan[id]?.trim() || undefined })
      antrean.muatUlang()
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(null)
    }
  }

  const daftar = antrean.data?.kampanye || []
  const menunggu = daftar.filter((k) => k.moderasi.status === 'tinjau').length

  return (
    <div className="card p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 section-title">
          <Shield size={20} /> Pemeriksaan Etika Kampanye
        </h2>
        <span className="chip-warning">{menunggu} menunggu</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Kampanye yang diduga menjelekkan UMKM lain. Belum bisa dibayar sampai diloloskan.
      </p>
      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {galat}
        </p>
      )}

      {antrean.memuat ? (
        <div className="mt-5"><MemuatBlok tinggi="h-24" jumlah={2} /></div>
      ) : antrean.galat ? (
        <p className="mt-5 text-sm text-danger">{antrean.galat.message}</p>
      ) : daftar.length === 0 ? (
        <div className="mt-5">
          <EmptyState icon={Shield} title="Antrean kosong" subtitle="Tidak ada kampanye yang menyinggung usaha lain." />
        </div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {daftar.map((k) => {
            const m = k.moderasi
            return (
              <div key={k.id} className="min-w-0 rounded-xl bg-cream-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-words text-sm font-bold text-navy">{k.nama}</p>
                  <StatusChip
                    status={m.status === 'tinjau' ? 'Perlu ditinjau' : 'Ditolak'}
                    tone={m.status === 'tinjau' ? 'warning' : 'danger'}
                  />
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {k.umkm} · diperiksa {m.sumber === 'aturan' ? 'aturan kata kunci' : 'AI + aturan'}
                  {k.diperiksaPada ? ` · ${tanggal(k.diperiksaPada)}` : ''}
                </p>
                <p className="mt-2 text-xs text-ink-soft">{m.alasan}</p>
                {m.temuan?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {m.temuan.map((f, i) => (
                      <li key={i} className="break-words rounded-lg bg-white px-3 py-1.5 text-xs italic text-ink">
                        “{f.kutipan}” <span className="not-italic text-ink-muted">({f.asal})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {m.banding && (
                  <p className="mt-2 rounded-lg border border-gold-border bg-gold px-3 py-2 text-xs text-gold-text">
                    Banding UMKM: {m.banding}
                  </p>
                )}
                <details className="mt-2 text-xs text-ink-soft">
                  <summary className="cursor-pointer font-semibold text-navy">Isi lengkap kampanye</summary>
                  <ul className="mt-1 space-y-1">
                    {k.isi.map((b, i) => (
                      <li key={i} className="break-words"><b>{b.asal}:</b> {b.teks}</li>
                    ))}
                  </ul>
                </details>

                {m.status === 'tinjau' && (
                  <>
                    <input
                      value={catatan[k.id] || ''}
                      onChange={(e) => setCatatan((c) => ({ ...c, [k.id]: e.target.value }))}
                      placeholder="Catatan untuk UMKM (wajib bila ditolak)"
                      className="input mt-3 py-2 text-xs"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={sibuk === `lolos-${k.id}`}
                        onClick={() => putus(k.id, 'lolos')}
                        className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
                      >
                        <Check size={14} /> Loloskan
                      </button>
                      <button
                        type="button"
                        disabled={sibuk === `ditolak-${k.id}`}
                        onClick={() => putus(k.id, 'ditolak')}
                        className="btn-outline px-4 py-2 text-xs disabled:opacity-60"
                      >
                        Tolak
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Bio, deskripsi usaha, dan komentar ulasan yang lolos pemeriksaan tapi
 * samar (services/moderasi-kampanye.js, periksaTeksPublik). Sudah tayang;
 * admin memutuskan dibiarkan atau dihapus.
 */
const NAMA_JENIS = { bio_kreator: 'Bio kreator', deskripsi_umkm: 'Deskripsi usaha', ulasan: 'Komentar ulasan' }

function PenandaanEtika() {
  const antrean = useApi(() => api.adminPenandaan(), [])
  const [sibuk, setSibuk] = useState(null)
  const [galat, setGalat] = useState('')

  const putus = async (id, tindakan) => {
    setGalat('')
    setSibuk(`${tindakan}-${id}`)
    try {
      await api.adminPutusPenandaan(id, tindakan)
      antrean.muatUlang()
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(null)
    }
  }

  const daftar = antrean.data?.penandaan || []
  if (!antrean.memuat && !antrean.galat && daftar.length === 0) return null

  return (
    <div className="card p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 section-title">
          <Eye size={20} /> Teks Publik yang Ditandai
        </h2>
        <span className="chip-warning">{daftar.length} menunggu</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Bio, deskripsi usaha, dan ulasan yang sudah tayang tapi dicurigai menyinggung pihak lain.
      </p>
      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {galat}
        </p>
      )}
      {antrean.memuat ? (
        <div className="mt-5"><MemuatBlok tinggi="h-20" jumlah={1} /></div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {daftar.map((t) => (
            <div key={t.id} className="min-w-0 rounded-xl bg-cream-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-bold text-navy">{NAMA_JENIS[t.jenis] || t.jenis}</p>
                <span className="text-xs text-ink-muted">{t.pengguna} · {tanggal(t.dibuatPada)}</span>
              </div>
              <p className="mt-2 break-words rounded-lg bg-white px-3 py-2 text-xs italic text-ink">“{t.teks}”</p>
              <p className="mt-2 text-xs text-ink-soft">{t.hasil.alasan}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={sibuk === `hapus-${t.id}`}
                  onClick={() => putus(t.id, 'hapus')}
                  className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
                >
                  Hapus Teks
                </button>
                <button
                  type="button"
                  disabled={sibuk === `biarkan-${t.id}`}
                  onClick={() => putus(t.id, 'biarkan')}
                  className="btn-outline px-4 py-2 text-xs disabled:opacity-60"
                >
                  Biarkan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
