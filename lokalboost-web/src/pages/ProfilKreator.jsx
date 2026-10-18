import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { StatCard, HoverCard, Tekan, IsiFoto, ChipContoh } from '../components/ui.jsx'
import { DaftarSosial } from '../components/TautanSosial.jsx'
import { Kilau } from '../components/Ambient.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import Portofolio from '../components/Portofolio.jsx'
import { EASE, DUR } from '../motion.js'
import { ribuan, nilai, gradasi, pengikut, waktuLalu } from '../format.js'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'
import {
  Star, MapPin, Check, Sparkles, Eye, Users, Play, ArrowRight, Shield, Video,
} from '../components/icons.jsx'

/**
 * Profil publik kreator — tujuan tombol "Lihat Profil" di Marketplace.
 *
 * Portofolio dan ulasan datang dari kampanye yang benar-benar diselesaikan
 * kreator ini (GET /api/kreator/:id). Tidak ada satu pun angka pemanis:
 * kreator baru memang tampil dengan portofolio kosong, dan itu jujur.
 */
function Bintang({ nilai: n, ukuran = 14 }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((x) => (
        <Star key={x} size={ukuran} className={x <= n ? 'text-gold-text' : 'text-ink-muted/35'} />
      ))}
    </span>
  )
}

export default function ProfilKreator() {
  const { id } = useParams()
  const { adalahUmkm, pengguna } = useSesi()

  const { data, galat, memuat, muatUlang } = useApi(() => api.kreatorDetail(id), [id])

  const autoBuilder = useApi(() => api.portofolioKreator(id), [id])

  // Untuk UMKM: kampanye MILIKNYA yang sesuai niche kreator ini.
  // Untuk pembaca lain: kampanye terbuka di niche yang sama.
  const kampanyeCocok = useApi(
    () =>
      api.kampanye(
        adalahUmkm ? { umkmId: pengguna.id, kategori: data?.kreator?.niche } : { kategori: data?.kreator?.niche },
      ),
    [adalahUmkm, pengguna?.id, data?.kreator?.niche],
    { aktif: Boolean(data?.kreator) },
  )

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
        <GalatMuat galat={galat} onCoba={muatUlang} judul="Profil kreator tidak ditemukan" />
      </AppShell>
    )
  }

  const c = data.kreator
  const ulasan = data.ulasan || []
  const portofolio = data.portofolio || []

  const cocok = (kampanyeCocok.data?.kampanye || [])
    .filter((k) => !k.kreatorId)
    .slice(0, 3)

  const rerataViews = portofolio.length
    ? Math.round(portofolio.reduce((a, p) => a + p.views, 0) / portofolio.length)
    : 0

  return (
    <AppShell>
      <Link to="/marketplace" className="mb-5 inline-flex text-sm font-semibold text-ink-soft hover:text-navy">
        ← Kembali ke Marketplace
      </Link>

      <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
        {/* Kepala profil */}
        <motion.div variants={fadeUp} className="card overflow-hidden">
          <div className={`relative h-40 overflow-hidden bg-gradient-to-br ${gradasi(c)}`}>
            <Kilau tunda={0.8} />
          </div>
          <div className="flex flex-col gap-5 p-7 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-4">
              <motion.span
                initial={{ scale: 0.85, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: DUR.standard, delay: 0.15, ease: EASE.entrance }}
                className={`relative -mt-16 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-gradient-to-br ${gradasi(c)} shadow-card`}
              >
                <IsiFoto src={c.foto} alt={`Avatar ${c.nama}`} />
              </motion.span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="page-title">{c.nama}</h1>
                  <ChipContoh ada={c.contoh} />
                  {c.terverifikasi && (
                    <span className="chip gap-1 bg-gold text-gold-text">
                      <Check size={12} /> Terverifikasi
                    </span>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
                  <span className="flex items-center gap-1"><MapPin size={14} /> {c.lokasi || 'Lokasi belum diisi'}</span>
                  <span className="flex items-center gap-1"><Video size={14} /> {c.niche || 'Niche belum diisi'}</span>
                  <span className="flex items-center gap-1">
                    <Star size={14} className="text-gold-text" /> {c.rating ? nilai(c.rating) : 'Belum dinilai'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-3">
              <Tekan>
                {adalahUmkm && cocok.length > 0 ? (
                  <Link to={`/umkm/kampanye/${cocok[0].id}/kreator`} className="btn-primary px-5 py-2.5">
                    Undang Berkolaborasi <ArrowRight size={16} />
                  </Link>
                ) : adalahUmkm ? (
                  <Link to="/umkm/kampanye/baru" className="btn-primary px-5 py-2.5">
                    Buat Kampanye untuk Diundang <ArrowRight size={16} />
                  </Link>
                ) : (
                  <Link to="/marketplace" className="btn-outline px-5 py-2.5">
                    Lihat Kreator Lain <ArrowRight size={16} />
                  </Link>
                )}
              </Tekan>
            </div>
          </div>
        </motion.div>

        {/* Statistik */}
        <div className="grid gap-5 md:grid-cols-4">
          {/* Angka pengikut berasal dari profil yang diisi kreator sendiri, jadi
              sub-labelnya harus mengatakannya. Sebelumnya tertulis "Lintas
              platform", yang terbaca seperti hasil hitungan platform padahal
              bukan, tepat di sebelah angka yang memang terverifikasi. */}
          <StatCard
            label="Pengikut"
            value={c.pengikut ? pengikut(c.pengikut) : '—'}
            sub={c.contoh ? 'Angka contoh' : 'Lihat hasil Cek Profil di bawah'}
            icon={Users}
          />
          <StatCard
            label="Penilaian"
            value={c.rating ? nilai(c.rating) : '—'}
            sub={c.jumlahUlasan ? `dari ${c.jumlahUlasan} ulasan` : 'Belum ada ulasan'}
            subTone="text-success"
            icon={Star}
          />
          <StatCard
            label="Rata-rata Views"
            nilai={rerataViews}
            sub="per kampanye selesai"
            icon={Eye}
          />
          <StatCard
            label="Kampanye Selesai"
            nilai={c.kampanyeSelesai}
            sub="Tercatat di LokalBoost"
            subTone="text-success"
            icon={Shield}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Tentang & portofolio */}
          <div className="space-y-6 lg:col-span-3">
            <motion.div variants={fadeUp} className="card p-7">
              <h2 className="section-title">Tentang Kreator</h2>
              <p className="mt-3 leading-relaxed text-ink-soft">
                {c.bio || 'Kreator ini belum menulis deskripsi kontennya.'}
              </p>
              {/* Akun yang diisi kreator sendiri. Pengikut & views tetap dari Cek Profil. */}
              <DaftarSosial sosial={c.sosial} className="mt-4" />
              {!Object.values(c.sosial || {}).some(Boolean) && c.portofolioUrl && (
                <a
                  href={c.portofolioUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-sm font-semibold text-navy hover:underline"
                >
                  Lihat akun media sosialnya →
                </a>
              )}
            </motion.div>

            {/* AI Portfolio Auto-builder. Dimuat terpisah supaya profil tetap
                tampil walau endpoint portofolio gagal. */}
            {autoBuilder.data && <Portofolio data={autoBuilder.data} />}

            <motion.div variants={fadeUp} className="card p-7">
              <h2 className="section-title">Portofolio di LokalBoost</h2>
              <p className="mt-1 text-sm text-ink-soft">Kampanye yang sudah dituntaskan lengkap dengan hasilnya.</p>
              {portofolio.length === 0 ? (
                <p className="mt-5 rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
                  Belum ada kampanye yang selesai. Kreator ini masih menunggu kesempatan pertamanya.
                </p>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {portofolio.map((p) => (
                    <HoverCard key={p.id} className="overflow-hidden rounded-xl">
                      <Link to={`/kampanye/${p.id}`} className="block">
                        <div className={`relative grid h-32 place-items-center overflow-hidden bg-gradient-to-br ${gradasi(p)}`}>
                          <IsiFoto src={p.gambar} alt={p.nama} />
                          <motion.span
                            variants={{ animate: { scale: 1 }, hover: { scale: 1.12 } }}
                            transition={{ duration: DUR.hover, ease: EASE.signature }}
                            className="grid h-11 w-11 place-items-center rounded-full bg-white/85 text-navy"
                          >
                            <Play size={20} />
                          </motion.span>
                          <span className="absolute bottom-2 right-2 rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-white">
                            {ribuan(p.views)} views
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-medium text-navy">{p.nama}</p>
                      </Link>
                    </HoverCard>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div variants={fadeUp} className="card p-7">
              <h2 className="section-title">Ulasan dari Mitra</h2>
              {ulasan.length === 0 ? (
                <p className="mt-4 rounded-xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-soft">
                  Belum ada ulasan. Ulasan hanya bisa ditulis mitra yang benar-benar menyelesaikan
                  kampanye bersama kreator ini.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {ulasan.map((u, i) => (
                    <div key={i} className="rounded-xl bg-cream-100 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy">{u.penilai}</p>
                          <p className="text-xs text-ink-muted">{u.kampanye} · {waktuLalu(u.dibuat_pada)}</p>
                        </div>
                        <Bintang nilai={u.bintang} />
                      </div>
                      {u.komentar && (
                        <p className="mt-2 text-sm leading-relaxed text-ink-soft">“{u.komentar}”</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Sisi kanan */}
          <div className="space-y-5 lg:col-span-2">
            <motion.div variants={fadeUp} className="card p-6">
              <p className="flex items-center gap-2 text-sm font-bold text-navy">
                <Sparkles size={16} /> Kampanye yang Cocok
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {adalahUmkm
                  ? 'Kampanye Anda yang sesuai niche kreator ini.'
                  : 'Kampanye terbuka yang sesuai niche kreator ini.'}
              </p>
              {cocok.length === 0 ? (
                <p className="mt-3 rounded-lg bg-cream-100 px-3 py-4 text-center text-xs text-ink-soft">
                  Belum ada kampanye terbuka di niche {c.niche || 'ini'}.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {cocok.map((k) => (
                    <Link
                      key={k.id}
                      to={`/kampanye/${k.id}`}
                      className="flex items-center gap-3 rounded-xl bg-cream-100 p-3 transition-colors hover:bg-cream-200"
                    >
                      <span className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br ${gradasi(k)}`}>
                        <IsiFoto src={k.gambar} alt={k.nama} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy">{k.nama}</p>
                        <p className="text-xs text-ink-muted">Target {ribuan(k.targetViews)} views</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="flex items-start gap-3 rounded-xl border border-gold-border bg-gold px-4 py-3.5"
            >
              <Shield size={18} className="mt-0.5 shrink-0 text-navy" />
              <p className="text-sm text-gold-text">
                Pembayaran ke kreator ini tetap melalui Rekber — dana baru dilepas setelah
                target views tervalidasi tercapai.
              </p>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AppShell>
  )
}
