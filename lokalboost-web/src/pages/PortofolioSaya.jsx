import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { Tekan } from '../components/ui.jsx'
import { MemuatHalaman, GalatMuat } from '../components/Muat.jsx'
import Portofolio from '../components/Portofolio.jsx'
import CekProfil from '../components/CekProfil.jsx'
import { ArrowRight } from '../components/icons.jsx'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'

/**
 * Halaman kelola portofolio untuk kreator.
 *
 * Lapis 1 dihitung platform dan tidak bisa disentuh dari sini. Satu-satunya
 * yang diisi kreator adalah tautan profil di kartu Cek Profil: pengikut,
 * views, dan engagement diukur otomatis, jadi form tautan karya dan statistik
 * ketikan dihapus. Endpoint-nya masih ada di API, hanya antarmukanya yang pergi.
 */
export default function PortofolioSaya() {
  const { pengguna } = useSesi()
  const { data: dimuat, galat, memuat, muatUlang } = useApi(() => api.portofolioSaya(), [])

  // Cek Profil membalas portofolio terbarunya sekalian, jadi ditimpa di atas
  // data hasil muat supaya halaman tidak memuat ulang dari nol.
  const [terbaru, setTerbaru] = useState(null)
  const data = terbaru || dimuat

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
        <GalatMuat galat={galat} onCoba={muatUlang} judul="Portofolio gagal dimuat" />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title">Portofolio Saya</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Begini portofolio Anda dilihat UMKM. Angka LokalBoost terisi sendiri, Anda tinggal
              menghubungkan profil TikTok atau Instagram.
            </p>
          </div>
          <Tekan>
            <Link to={`/kreator/profil/${pengguna.id}`} className="btn-outline px-5 py-2.5">
              Lihat sebagai UMKM <ArrowRight size={16} />
            </Link>
          </Tekan>
        </motion.div>

        <CekProfil onPortofolio={(p) => (p ? setTerbaru(p) : muatUlang())} />

        {/* Pratinjau persis seperti yang dilihat UMKM. */}
        <Portofolio data={data} />
      </motion.div>
    </AppShell>
  )
}
