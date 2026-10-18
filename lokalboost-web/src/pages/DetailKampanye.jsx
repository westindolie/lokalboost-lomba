import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, StatusChip, ProgressBar, RekberBadge, Tekan, IsiFoto, AvatarKreator, ChipContoh } from '../components/ui.jsx'
import { DaftarSosial } from '../components/TautanSosial.jsx'
import { AngkaNaik, CentangSukses } from '../components/Feedback.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import { EASE, DUR } from '../motion.js'
import { rupiah, ribuan, statusKampanye, gradasi, statusLamaran } from '../format.js'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'
import StatusReward from '../components/StatusReward.jsx'
import { rewardDariViews, tarifPerViewTeks, MODEL } from '../reward.js'
import {
  Store, MapPin, Eye, Target, Wallet, Calendar, Shield, Sparkles,
  Check, Doc, Chart, ArrowRight, Star, Play, Users, Image,
} from '../components/icons.jsx'

const NAMA_PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

/**
 * Detail Kampanye — kreator melihat brief dan UMKM mengundang kreator pilihan.
 *
 * Kepemilikan tidak lagi ditebak dari daftar id di berkas mock: kampanye
 * membawa `umkmId` dan `kreatorId` sendiri, jadi mode halaman ditentukan
 * dengan membandingkannya terhadap pengguna yang sedang masuk.
 */
export default function DetailKampanye() {
  const { id } = useParams()
  const { pengguna, sudahMasuk, adalahUmkm, adalahKreator } = useSesi()

  const { data, galat, memuat, muatUlang } = useApi(() => api.kampanyeDetail(id), [id])

  const k = data?.kampanye
  const milikSaya = adalahUmkm && k?.umkmId === pengguna?.id

  // Rekomendasi AI hanya masuk akal bagi pemilik kampanye, dan endpoint-nya
  // memang menolak siapa pun selain dia.
  const { data: rekom } = useApi(() => api.rekomendasiKreator(id), [id], {
    aktif: Boolean(milikSaya),
  })

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
        <GalatMuat galat={galat} onCoba={muatUlang} judul="Kampanye tidak bisa dibuka" />
      </AppShell>
    )
  }

  // pemilik   → UMKM yang memang punya kampanye ini
  // pengamat  → UMKM lain yang kebetulan membukanya
  // kreator   → kreator atau tamu yang sedang menjelajah marketplace
  const mode = adalahUmkm ? (milikSaya ? 'pemilik' : 'pengamat') : 'kreator'

  const st = statusKampanye(k.status, k.sisaHari)
  const sudahJalan = k.status === 'berjalan'
  const pencapaian = k.targetViews ? Math.round((k.viewsTervalidasi / k.targetViews) * 100) : 0
  // Peserta bergabung setelah UMKM mengirimkan undangan.
  const lamaran = k.lamaranSaya
  const sayaKreatornya = lamaran?.status === 'disetujui'
  const kelayakan = k.kelayakanSaya
  // Kampanye menerima kreator selama dana atau kuota produknya belum habis, termasuk saat berjalan.
  const pakaiTunai = k.modelReward !== 'produk'
  const pakaiProduk = k.modelReward !== 'tunai'
  const ambang = pakaiTunai ? k.ambangViewsTunai : k.ambangViewsProduk

  const rincian = [
    { icon: Target, label: 'Target Views Kampanye', value: ribuan(k.targetViews) },
    pakaiTunai
      ? { icon: Eye, label: 'Tarif Reward', value: k.skemaTarif === 'cpm' ? `${rupiah(k.tarifCpm)}/1.000` : `${tarifPerViewTeks(k.tarifCpm)}/view` }
      : { icon: Eye, label: 'Model Reward', value: MODEL.produk.judul },
    { icon: Check, label: 'Minimal Views Reward', value: ambang > 0 ? ribuan(ambang) : 'Tanpa minimal' },
    pakaiTunai
      ? { icon: Wallet, label: 'Sisa Dana Reward', value: rupiah(k.sisaDana) }
      : { icon: Wallet, label: 'Sisa Kuota Produk', value: ribuan(k.sisaKuotaProduk) },
    { icon: Users, label: 'Kreator Bergabung', value: ribuan(k.jumlahKreator) },
    { icon: Calendar, label: 'Durasi Kampanye', value: `${k.tenggatHari} hari` },
  ]

  return (
    <AppShell>
      <Link
        to={mode === 'pemilik' ? '/umkm' : '/marketplace'}
        className="mb-5 inline-flex text-sm font-semibold text-ink-soft hover:text-navy"
      >
        ← Kembali {mode === 'pemilik' ? 'ke Dashboard' : 'ke Marketplace'}
      </Link>

      <PageHeader title={k.nama} subtitle={k.deskripsi}>
        <ChipContoh ada={k.contoh} />
        <StatusChip status={st.label} tone={st.tone} denyut={sudahJalan} />
        <RekberBadge />
      </PageHeader>

      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="mt-8 grid gap-6 lg:grid-cols-3"
      >
        {/* Kolom utama */}
        <div className="space-y-6 lg:col-span-2">
          <motion.figure variants={fadeUp}>
            <div className={`relative h-48 overflow-hidden rounded-2xl bg-gradient-to-br sm:h-64 ${gradasi(k)}`}>
              <IsiFoto src={k.gambar} alt={k.nama} />
            </div>
            {/* Atribusi wajib untuk foto berlisensi CC BY / BY-SA. */}
            {k.gambarKredit && (
              <figcaption className="mt-1.5 text-right text-[11px] text-ink-muted">
                Foto:{' '}
                <a href={k.gambarKredit.sumber} target="_blank" rel="noreferrer" className="underline hover:text-navy">
                  {k.gambarKredit.pembuat}
                </a>
                ,{' '}
                <a href={k.gambarKredit.lisensiUrl} target="_blank" rel="noreferrer" className="underline hover:text-navy">
                  {k.gambarKredit.lisensi}
                </a>
              </figcaption>
            )}
          </motion.figure>

          <motion.div variants={fadeUp} className="card p-7">
            <h2 className="section-title">Tentang Kampanye Ini</h2>
            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-cream-200 text-navy">
                  <Store size={18} />
                  <IsiFoto src={k.umkmFoto} alt={`Foto ${k.umkm}`} />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">Pemilik Usaha</dt>
                  <dd className="font-semibold text-navy">{k.umkm}</dd>
                  {k.umkmProfil?.nama && k.umkmProfil.nama !== k.umkm && (
                    <dd className="text-xs text-ink-soft">oleh {k.umkmProfil.nama}</dd>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cream-200 text-navy">
                  <MapPin size={18} />
                </span>
                <div>
                  <dt className="text-xs text-ink-muted">Lokasi &amp; Kategori</dt>
                  <dd className="font-semibold text-navy">{k.lokasi} · {k.kategori}</dd>
                </div>
              </div>
            </dl>
            <DaftarSosial sosial={k.umkmProfil?.sosial} className="mt-4" />

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-black/5 pt-6 sm:grid-cols-3">
              {rincian.map(({ icon: Icon, label, value }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.quick, delay: 0.2 + i * 0.06, ease: EASE.entrance }}
                  whileHover={{ y: -3 }}
                  className="rounded-xl bg-cream-100 p-4"
                >
                  <Icon size={18} className="text-ink-muted" />
                  <p className="mt-2 break-words text-lg font-extrabold text-navy">{value}</p>
                  <p className="text-xs text-ink-muted">{label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Aturan reward: uang, produk, ambang */}
          <motion.div variants={fadeUp} className="card p-7">
            <h2 className="section-title">Reward untuk Kreator</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {MODEL[k.modelReward]?.judul || 'Uang Tunai'}. Banyak kreator boleh ikut sampai anggaran
              {pakaiProduk && ' atau kuota produk'} habis.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-soft">
              {pakaiTunai && (
                <li className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-success" />
                  <span>
                    {k.skemaTarif === 'cpm' ? `${rupiah(k.tarifCpm)} per 1.000 views` : `${tarifPerViewTeks(k.tarifCpm)} per view`}{' '}
                    tervalidasi, dibayar dari dana Rekber.
                    {k.ambangViewsTunai > 0 && (
                      <>
                        {' '}Boleh dicairkan setelah views Anda mencapai <b className="text-navy">{ribuan(k.ambangViewsTunai)}</b>
                        {k.modePencairan === 'sekali' ? ' (sekali, sisanya saat kampanye selesai).' : ', lalu sekali di setiap kelipatannya.'}
                      </>
                    )}
                  </span>
                </li>
              )}
              {pakaiProduk && (
                <li className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-success" />
                  <span>
                    Klaim satu produk setelah views Anda mencapai <b className="text-navy">{ribuan(k.ambangViewsProduk)}</b>, selama
                    kuota masih ada.
                  </span>
                </li>
              )}
              <li className="flex gap-2">
                <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
                <span>Hanya views tervalidasi yang dihitung. Bila kampanye selesai sebelum target minimal tercapai, reward tidak dibayarkan.</span>
              </li>
            </ul>
            {pakaiProduk && k.produkReward?.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {k.produkReward.map((p) => (
                  <div key={p.produkId} className="flex items-center gap-3 rounded-xl bg-cream-100 p-3">
                    <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-ink-muted">
                      {p.foto ? <img src={p.foto} alt="" className="h-full w-full object-cover" /> : <Image size={20} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{p.nama}</p>
                      <p className="text-xs text-ink-soft">
                        Nilai {rupiah(p.nilai)} · sisa {ribuan(p.sisa)} dari {ribuan(p.kuota)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Brief */}
          {k.brief?.length > 0 && (
            <motion.div variants={fadeUp} className="card p-7">
              <h2 className="flex items-center gap-2 section-title">
                <Doc size={20} /> Brief dari UMKM
              </h2>
              <p className="mt-1 text-sm text-ink-soft">Poin yang wajib muncul di dalam video.</p>
              <ol className="mt-4 space-y-3">
                {k.brief.map((b, i) => (
                  <motion.li
                    key={b}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.7 }}
                    transition={{ duration: 0.3, delay: i * 0.07, ease: EASE.entrance }}
                    className="flex gap-3 rounded-xl bg-cream-100 px-4 py-3"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm text-ink-soft">{b}</span>
                  </motion.li>
                ))}
              </ol>

              {adalahKreator && (
                <Link to={`/kreator/ai-script?kampanye=${k.id}`} className="btn-outline mt-5 px-5 py-2.5">
                  <Sparkles size={16} /> Buatkan naskah dari brief ini
                </Link>
              )}
            </motion.div>
          )}

          {/* Video acuan gaya dari UMKM */}
          {k.referensi?.length > 0 && (
            <motion.div variants={fadeUp} className="card p-7">
              <h2 className="flex items-center gap-2 section-title">
                <Play size={20} /> Referensi Konten
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Video yang gayanya ingin ditiru pemilik usaha. Tiru gaya dan alurnya, bukan isinya.
              </p>
              <ul className="mt-4 space-y-3">
                {k.referensi.map((r) => (
                  <li key={r.url}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 rounded-xl bg-cream-100 px-4 py-3 transition-colors hover:bg-cream-200"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-navy text-white">
                        <Play size={14} />
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold text-ink">
                          {NAMA_PLATFORM[r.platform] || 'Video'}
                          {r.penulis && <span className="font-normal text-ink-soft"> · {r.penulis}</span>}
                        </span>
                        <span className="line-clamp-2 block text-ink-soft">{r.judul || r.url}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Progres bila kampanye sudah punya tayangan */}
          {(sudahJalan || k.viewsTervalidasi > 0) && (
            <motion.div variants={fadeUp} className="card p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 section-title">
                  <Chart size={20} /> Progres Kampanye
                </h2>
                <span className="text-sm font-bold text-navy">{pencapaian}% tercapai</span>
              </div>

              <div className="mt-4">
                <ProgressBar value={k.viewsTervalidasi} max={k.targetViews} />
                <div className="mt-2 flex justify-between text-sm text-ink-soft">
                  <span>{ribuan(k.viewsTervalidasi)} views tervalidasi</span>
                  <span>Target {ribuan(k.targetViews)}</span>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-xl border border-gold-border bg-gold px-4 py-3.5">
                <Shield size={18} className="mt-0.5 shrink-0 text-navy" />
                <p className="text-sm text-gold-text">
                  <b className="text-navy">{ribuan(k.viewsDisaring)} view</b> terindikasi tidak wajar
                  sudah disaring sistem anti-fraud dan tidak ditagihkan.
                </p>
              </div>

              {(milikSaya || sayaKreatornya) && (
                <Link to={`/umkm/kampanye/${k.id}/laporan`} className="btn-primary mt-5 px-5 py-2.5">
                  Lihat Laporan Lengkap <ArrowRight size={16} />
                </Link>
              )}
            </motion.div>
          )}
        </div>

        {/* Sisi kanan: aksi */}
        <div className="space-y-5">
          <motion.div variants={fadeUp} className="card sticky top-[88px] p-6">
            {mode === 'kreator' ? (
              <>
                {pakaiTunai ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Reward saat mencapai {ribuan(ambang || 1000)} views
                    </p>
                    <p className="mt-2 text-3xl font-extrabold text-navy">
                      <AngkaNaik nilai={rewardDariViews(ambang || 1000, k.tarifCpm)} prefiks="Rp " />
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {k.skemaTarif === 'cpm' ? `${rupiah(k.tarifCpm)} per 1.000 views` : `${tarifPerViewTeks(k.tarifCpm)} per view`}, terus
                      bertambah selama views naik dan dana masih ada
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reward produk</p>
                    <p className="mt-2 text-lg font-extrabold text-navy">
                      {(k.produkReward || []).map((p) => p.nama).join(', ') || 'Produk UMKM'}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">saat views Anda mencapai {ribuan(k.ambangViewsProduk)}</p>
                  </>
                )}

                <div className="mt-5 space-y-2 border-t border-black/5 pt-5 text-sm">
                  {[
                    pakaiTunai ? 'Dana sudah disetor UMKM ke Rekber' : 'Stok produk sudah disiapkan UMKM',
                    'Setor tautan video dari akun Anda sendiri',
                    `${ribuan(k.jumlahKreator)} kreator sudah bergabung`,
                  ].map((t) => (
                    <p key={t} className="flex gap-2 text-ink-soft">
                      <Check size={16} className="mt-0.5 shrink-0 text-success" /> {t}
                    </p>
                  ))}
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {sayaKreatornya ? (
                    <motion.div
                      key="terpilih"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-5 rounded-xl border border-success-border bg-success-soft px-4 py-4 text-center"
                    >
                      <CentangSukses size={26} className="mx-auto" />
                      <p className="mt-2 font-semibold text-success">Anda sudah bergabung</p>
                      <Tekan className="mt-4 block">
                        <Link to={`/kreator/video?kampanye=${k.id}`} className="btn-primary w-full py-2.5">
                          Setor Tautan Video
                        </Link>
                      </Tekan>
                    </motion.div>
                  ) : lamaran ? (
                    <motion.div
                      key="terkirim"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: DUR.quick, ease: EASE.entrance }}
                      className="mt-5 rounded-xl border border-success-border bg-success-soft px-4 py-4 text-center"
                    >
                      <CentangSukses size={26} className="mx-auto" />
                      <p className="mt-2 font-semibold text-success">
                        Anda Diundang
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        Status saat ini: {statusLamaran(lamaran.status).label}. Anda akan menerima
                        notifikasi begitu ada keputusan.
                      </p>
                      <Tekan className="mt-4 block">
                        <Link to="/notifikasi" className="btn-outline w-full py-2.5">Lihat Notifikasi</Link>
                      </Tekan>
                    </motion.div>
                  ) : adalahKreator && !kelayakan?.bolehIkut ? (
                    <motion.div
                      key="kelayakan"
                      className="mt-5 rounded-xl border border-gold/40 bg-cream-100 px-4 py-4 text-sm"
                    >
                      <p className="font-semibold text-navy">Lengkapi profil agar bisa menerima undangan kampanye</p>
                      {!kelayakan?.profilLengkap && (
                        <p className="mt-2 text-ink-soft">
                          Lengkapi nama, niche, lokasi, dan bio di <Link to="/profil" className="font-semibold text-navy underline">profilmu</Link>.
                        </p>
                      )}
                      {!kelayakan?.akunTerverifikasi && (
                        <p className="mt-2 text-ink-soft">
                          Verifikasi minimal satu akun TikTok, Instagram, atau YouTube lewat{' '}
                          <Link to="/kreator/portofolio" className="font-semibold text-navy underline">Cek Profil</Link>.
                        </p>
                      )}
                    </motion.div>
                  ) : k.menerimaKreator ? (
                    <motion.p key="undangan" className="mt-5 rounded-xl bg-cream-100 px-4 py-4 text-center text-sm text-ink-soft">
                      Kreator bergabung melalui undangan UMKM. Jika terpilih, undangan akan muncul di notifikasi.
                    </motion.p>
                  ) : (
                    <motion.p key="tutup" className="mt-5 rounded-xl bg-cream-100 px-4 py-4 text-center text-sm text-ink-soft">
                      Kampanye ini tidak menerima kreator baru.
                    </motion.p>
                  )}
                </AnimatePresence>

                {sayaKreatornya && k.rewardSaya && (
                  <div className="mt-5 border-t border-black/5 pt-5">
                    <StatusReward kampanye={k} reward={k.rewardSaya} onBerubah={() => muatUlang()} />
                  </div>
                )}

                {sudahMasuk && (
                  <Link to="/dispute" className="mt-3 block text-center text-xs text-ink-muted hover:text-navy">
                    Ada masalah dengan kampanye ini?
                  </Link>
                )}
              </>
            ) : mode === 'pemilik' ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {pakaiTunai ? 'Sisa dana reward di Rekber' : 'Sisa kuota produk'}
                </p>
                <p className="mt-2 text-3xl font-extrabold text-navy">
                  {pakaiTunai ? rupiah(k.sisaDana) : ribuan(k.sisaKuotaProduk)}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {pakaiTunai && <>dari {rupiah(k.anggaran)} · </>}
                  {k.jumlahKreator ? `${ribuan(k.jumlahKreator)} kreator bergabung` : 'Belum ada kreator bergabung'}
                </p>

                <div className="mt-5 space-y-3 border-t border-black/5 pt-5">
                  <Tekan className="block">
                    <Link to={`/umkm/kampanye/${k.id}/kreator`} className="btn-primary w-full py-3">
                      {k.jumlahKreator ? 'Kelola Kreator' : 'Pilih & Setujui Kreator'}
                    </Link>
                  </Tekan>
                  {(sudahJalan || k.status === 'selesai') && (
                    <>
                      <Tekan className="block">
                        <Link to={`/umkm/kampanye/${k.id}/laporan`} className="btn-outline w-full py-3">
                          Lihat Laporan Hasil
                        </Link>
                      </Tekan>
                      {k.status === 'selesai' && (
                        <Tekan className="block">
                          <Link to={`/kampanye/${k.id}/ulasan`} className="btn-ghost w-full py-3">
                            Beri Ulasan Kreator
                          </Link>
                        </Tekan>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              /* UMKM lain yang membuka kampanye bukan miliknya. */
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Kampanye Usaha Lain
                </p>
                <p className="mt-2 text-lg font-bold text-navy">{k.umkm}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Anda melihat kampanye milik usaha lain, jadi tidak ada aksi yang bisa dilakukan
                  di sini.
                </p>
                <Tekan className="mt-5 block">
                  <Link to="/umkm/kampanye/baru" className="btn-primary w-full py-3">
                    Buat Kampanye Serupa
                  </Link>
                </Tekan>
              </>
            )}
          </motion.div>

          {/* Kandidat kreator — hanya untuk pemilik kampanye ini */}
          {milikSaya && rekom?.rekomendasi?.length > 0 && (
            <motion.div variants={fadeUp} className="card p-6">
              <p className="flex items-center gap-2 text-sm font-bold text-navy">
                <Sparkles size={16} /> Rekomendasi Kreator
              </p>
              <div className="mt-4 space-y-3">
                {rekom.rekomendasi.slice(0, 3).map((c) => (
                  <Link
                    key={c.kreatorId}
                    to={`/kreator/profil/${c.kreatorId}`}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-cream-100"
                  >
                    <AvatarKreator c={c} className="h-10 w-10 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{c.nama}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                        <Star size={11} className="text-gold-text" /> {c.lokasi} · {c.niche}
                      </p>
                    </div>
                    <span className="chip shrink-0 bg-navy text-[10px] text-white">{c.kecocokan}%</span>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AppShell>
  )
}
