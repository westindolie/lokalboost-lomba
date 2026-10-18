import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AnimatePresence } from 'motion/react'

import PageTransition from './components/PageTransition.jsx'
import { Terproteksi, TidakDitemukan } from './components/Muat.jsx'

// Publik
import Landing from './pages/Landing.jsx'
import Marketplace from './pages/Marketplace.jsx'
// Onboarding
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import LengkapiProfil from './pages/LengkapiProfil.jsx'
import VerifikasiOtp from './pages/VerifikasiOtp.jsx'
import LupaSandi from './pages/LupaSandi.jsx'
import Akun from './pages/Akun.jsx'
import Profil from './pages/Profil.jsx'
// UMKM
import DashboardUMKM from './pages/DashboardUMKM.jsx'
import BuatKampanye from './pages/BuatKampanye.jsx'
import TargetBudgeting from './pages/TargetBudgeting.jsx'
import SetorDana from './pages/SetorDana.jsx'
import PilihKreator from './pages/PilihKreator.jsx'
import LaporanHasil from './pages/LaporanHasil.jsx'
import AIScript from './pages/AIScript.jsx'
import DanaUmkm from './pages/DanaUmkm.jsx'
// Kreator
import DashboardKreator from './pages/DashboardKreator.jsx'
import SetorVideo from './pages/SetorVideo.jsx'
import PortofolioSaya from './pages/PortofolioSaya.jsx'
import Dompet from './pages/Dompet.jsx'
import ProfilKreator from './pages/ProfilKreator.jsx'
// Lintas peran
import DetailKampanye from './pages/DetailKampanye.jsx'
import Notifikasi from './pages/Notifikasi.jsx'
import Ulasan from './pages/Ulasan.jsx'
import Dispute from './pages/Dispute.jsx'
// Admin — Persona 3 pada PRD §4.3
import Admin from './pages/Admin.jsx'

function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    // Menu "Fitur AI" dan "Cara Kerja" menunjuk ke bagian di halaman depan.
    // Tanpa penanganan ini, React Router berpindah rute tanpa menggulir, dan
    // menggantinya dengan <a href> biasa akan memuat ulang seluruh aplikasi.
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }

    /*
      Bagian tujuan BELUM TENTU ADA saat efek ini berjalan. <AnimatePresence
      mode="wait"> menahan halaman baru sampai halaman lama selesai memudar
      (~300ms), jadi ketika pengguna menekan "Fitur AI" dari Marketplace,
      #fitur belum terpasang. Versi lama langsung menyerah dan jatuh ke
      scrollTo(0,0) — sehingga menu itu selalu mendarat di puncak halaman
      depan, tidak pernah di bagian yang dituju. Jadi coba ulang tiap frame
      sampai halamannya muncul.

      getElementById, bukan querySelector: hash sembarang seperti "#123"
      bukan selektor CSS yang sah dan akan melempar galat.
    */
    let batal = false
    const batas = performance.now() + 2000

    const coba = () => {
      if (batal) return
      const target = document.getElementById(hash.slice(1))
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (performance.now() < batas) {
        requestAnimationFrame(coba)
      } else {
        window.scrollTo(0, 0)
      }
    }
    requestAnimationFrame(coba)

    return () => {
      batal = true
    }
  }, [pathname, hash])

  return null
}

export default function App() {
  const location = useLocation()

  return (
    <>
      <ScrollToTop />
      {/* mode="wait": halaman lama selesai memudar sebelum yang baru masuk */}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          {/* Publik */}
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          {/* Halaman testimoni dihapus 18 Okt 2026: seluruh isinya karangan
              (nama, kutipan, angka omzet). Tautan lama diarahkan ke beranda. */}
          <Route path="/testimoni" element={<Navigate to="/" replace />} />
          <Route path="/marketplace" element={<PageTransition><Marketplace /></PageTransition>} />

          {/* Onboarding */}
          <Route path="/masuk" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/daftar" element={<PageTransition><Register /></PageTransition>} />
          <Route path="/daftar/profil" element={<PageTransition><LengkapiProfil /></PageTransition>} />
          <Route path="/daftar/verifikasi" element={<PageTransition><VerifikasiOtp /></PageTransition>} />
          <Route path="/lupa-sandi" element={<PageTransition><LupaSandi /></PageTransition>} />

          {/* UMKM — seluruh ruang kerja dijaga peran, bukan lagi ditebak
              dari alamat halaman. Laporan kampanye sengaja membolehkan
              kreator kampanye itu juga; pemeriksaan pemiliknya ada di API. */}
          <Route path="/umkm" element={<Terproteksi peran="umkm"><PageTransition><DashboardUMKM /></PageTransition></Terproteksi>} />
          <Route path="/umkm/kampanye/baru" element={<Terproteksi peran="umkm"><PageTransition><BuatKampanye /></PageTransition></Terproteksi>} />
          <Route path="/umkm/kampanye/target" element={<Terproteksi peran="umkm"><PageTransition><TargetBudgeting /></PageTransition></Terproteksi>} />
          <Route path="/umkm/kampanye/setor" element={<Terproteksi peran="umkm"><PageTransition><SetorDana /></PageTransition></Terproteksi>} />
          <Route path="/umkm/kampanye/:id/kreator" element={<Terproteksi peran="umkm"><PageTransition><PilihKreator /></PageTransition></Terproteksi>} />
          <Route path="/umkm/kampanye/:id/laporan" element={<Terproteksi peran={['umkm', 'kreator', 'admin']}><PageTransition><LaporanHasil /></PageTransition></Terproteksi>} />
          <Route path="/umkm/dana" element={<Terproteksi peran="umkm"><PageTransition><DanaUmkm /></PageTransition></Terproteksi>} />

          {/* Kreator */}
          <Route path="/kreator" element={<Terproteksi peran="kreator"><PageTransition><DashboardKreator /></PageTransition></Terproteksi>} />
          <Route path="/kreator/ai-script" element={<Terproteksi peran="kreator"><PageTransition><AIScript /></PageTransition></Terproteksi>} />
          <Route path="/kreator/video" element={<Terproteksi peran="kreator"><PageTransition><SetorVideo /></PageTransition></Terproteksi>} />
          {/* Unggah berkas diganti setor tautan (18 Okt 2026); tautan lama diarahkan ke halaman baru. */}
          <Route path="/kreator/upload" element={<Navigate to="/kreator/video" replace />} />
          <Route path="/kreator/portofolio" element={<Terproteksi peran="kreator"><PageTransition><PortofolioSaya /></PageTransition></Terproteksi>} />
          <Route path="/kreator/dompet" element={<Terproteksi peran="kreator"><PageTransition><Dompet /></PageTransition></Terproteksi>} />
          {/* Profil publik kreator sengaja TIDAK dijaga: justru UMKM dan tamu
              yang paling sering membukanya saat memilih mitra. */}
          <Route path="/kreator/profil/:id" element={<PageTransition><ProfilKreator /></PageTransition>} />

          {/* Lintas peran */}
          <Route path="/kampanye/:id" element={<PageTransition><DetailKampanye /></PageTransition>} />
          <Route path="/kampanye/:id/ulasan" element={<Terproteksi peran={['umkm', 'kreator']}><PageTransition><Ulasan /></PageTransition></Terproteksi>} />
          <Route path="/notifikasi" element={<Terproteksi peran={['umkm', 'kreator', 'admin']}><PageTransition><Notifikasi /></PageTransition></Terproteksi>} />
          <Route path="/profil" element={<Terproteksi peran={['umkm', 'kreator']}><PageTransition><Profil /></PageTransition></Terproteksi>} />
          <Route path="/akun" element={<Terproteksi peran={['umkm', 'kreator', 'admin']}><PageTransition><Akun /></PageTransition></Terproteksi>} />
          <Route path="/dispute" element={<PageTransition><Dispute /></PageTransition>} />

          {/* Admin */}
          <Route path="/admin" element={<Terproteksi peran="admin"><PageTransition><Admin /></PageTransition></Terproteksi>} />

          <Route path="*" element={<PageTransition><TidakDitemukan /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </>
  )
}
