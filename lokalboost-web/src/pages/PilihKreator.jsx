import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { AvatarKreator, ChipContoh, EmptyState, PageHeader, RekberBadge } from '../components/ui.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import { pengikut } from '../format.js'
import { api, useApi } from '../api.js'
import { MapPin, Users } from '../components/icons.jsx'

/** Daftar kreator yang bergabung sendiri tanpa persetujuan UMKM. */
export default function PilihKreator() {
  const { id } = useParams()
  const kampanye = useApi(() => api.kampanyeDetail(id), [id])
  const peserta = useApi(() => api.lamaranKampanye(id), [id])

  if (kampanye.memuat) return <AppShell><MemuatHalaman /></AppShell>
  if (kampanye.galat) return <AppShell><GalatMuat galat={kampanye.galat} onCoba={kampanye.muatUlang} judul="Kampanye tidak bisa dibuka" /></AppShell>
  if (peserta.galat) return <AppShell><GalatMuat galat={peserta.galat} onCoba={peserta.muatUlang} judul="Daftar kreator tidak bisa dibuka" /></AppShell>

  const k = kampanye.data.kampanye
  const daftar = peserta.data?.lamaran || []

  return (
    <AppShell>
      <Link to={`/umkm/kampanye/${id}`} className="mb-5 inline-flex text-sm font-semibold text-ink-soft hover:text-navy">← Kembali ke Kampanye</Link>
      <PageHeader title="Kreator Kampanye" subtitle={`${k.nama} · ${k.jumlahKreator} kreator sudah bergabung`}>
        <RekberBadge />
      </PageHeader>
      {peserta.memuat ? (
        <div className="mt-8"><MemuatHalaman /></div>
      ) : daftar.length === 0 ? (
        <div className="mt-8 card p-8">
          <EmptyState icon={Users} title="Belum ada kreator bergabung" subtitle="Kreator dapat mengikuti kampanye ini langsung dari marketplace selama anggaran masih tersedia." />
        </div>
      ) : (
        <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 space-y-4">
          {daftar.map((kreator) => (
            <motion.div key={kreator.id} variants={fadeUp} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <AvatarKreator c={kreator} className="h-14 w-14 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-navy">{kreator.nama}</p>
                  {kreator.niche && <span className="chip bg-cream-200 text-[10px] font-bold uppercase tracking-wide text-ink-soft">{kreator.niche}</span>}
                  <ChipContoh ada={kreator.contoh} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                  <span className="flex items-center gap-1"><MapPin size={12} /> {kreator.lokasi || '—'}</span>
                  <span>{pengikut(kreator.pengikut)} pengikut</span>
                </p>
              </div>
              <Link to={`/kreator/profil/${kreator.kreatorId}`} className="btn-outline px-5 py-2.5">Lihat Profil</Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </AppShell>
  )
}
