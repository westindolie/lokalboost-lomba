import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import Brand from './Brand.jsx'
import SiteFooter from './SiteFooter.jsx'
import SidebarRuang from './SidebarRuang.jsx'
import { Bell, ChevronRight, Menu, Close } from './icons.jsx'
import { tekan, EASE, DUR } from '../motion.js'
import { useSesi } from '../sesi.jsx'
import { api, useApi } from '../api.js'

/**
 * Satu-satunya shell aplikasi.
 *
 * Navbar selalu: tinggi 68px, sticky, bg-cream/85 + backdrop-blur, border
 * bawah black/5, container .shell (maks 1200px), memakai <Brand>.
 *
 * Peran TIDAK lagi diberikan halaman satu per satu. Shell membacanya dari
 * <SesiProvider>, sehingga navbar mustahil berubah hanya karena sebuah link
 * lupa membawa `?peran=`. Prop `variant` hanya dipakai halaman yang memang
 * berada di luar sesi: landing publik dan alur masuk/daftar.
 */

const NAV = {
  public: [
    { label: 'Fitur', to: '/#fitur' },
    { label: 'Cara Kerja', to: '/#cara-kerja' },
    { label: 'Marketplace', to: '/marketplace' },
  ],
  /* Ketiga menu UMKM kini sama-sama menuju alat kerja. Dulu slot terakhirnya
     diisi "Testimoni" — halaman pemasaran untuk calon pengguna — sementara
     kreator mendapat "Dompet" yang fungsional di posisi yang sama. */
  // Sidebar kreator dan UMKM dihapus (18 Okt 2026): semua pilihannya pindah ke
  // sini. Kreator bergabung sendiri ke kampanye yang masih menerima peserta.
  // Tujuan "Laporan Hasil" diisi belakangan (kampanye mana yang relevan baru
  // diketahui setelah datanya dimuat), lihat useLinkNav.
  umkm: [
    { label: 'Dashboard', to: '/umkm' },
    { label: 'Buat Kampanye', to: '/umkm/kampanye/baru' },
    { label: 'Laporan Hasil', to: null, cocok: /^\/umkm\/kampanye\/[^/]+\/laporan$/ },
    { label: 'Riwayat Dana', to: '/umkm/dana' },
  ],
  kreator: [
    { label: 'Dashboard', to: '/kreator' },
    { label: 'Cari Kampanye', to: '/marketplace' },
    { label: 'Portofolio', to: '/kreator/portofolio' },
    { label: 'Dompet', to: '/kreator/dompet' },
  ],
  admin: [
    { label: 'Ringkasan', to: '/admin' },
    { label: 'Sengketa', to: '/dispute' },
    { label: 'Marketplace', to: '/marketplace' },
  ],
}

/**
 * Halaman yang termasuk ruang kerja sebuah peran, dan karena itu memakai
 * sidebar. Halaman lintas peran (marketplace, detail kampanye, notifikasi,
 * sengketa, profil publik kreator) sengaja tidak masuk — sidebar sebuah peran
 * akan salah tampil bila yang membuka adalah peran lain.
 *
 * Ketiga langkah wizard kampanye juga tidak masuk: alur pembayaran sengaja
 * dibiarkan terfokus, tanpa jalan keluar di samping layar.
 */
const RUTE_RUANG = {
  admin: ['/admin'],
}

// AppShell dipasang ulang saat AnimatePresence mengganti halaman. Simpan tujuan
// laporan yang sudah diketahui supaya menu navbar tidak berkedip selama fetch
// dashboard berikutnya berjalan.
let tujuanLaporanUmkmTerakhir = null

function punyaSidebar(peran, pathname) {
  return Boolean(RUTE_RUANG[peran]?.includes(pathname))
}

/**
 * Menu atas untuk sebuah peran. Untuk UMKM, "Laporan Hasil" menuju kampanye
 * yang sedang berjalan (atau yang terbaru); selama belum ada kampanye, menu
 * itu disembunyikan, bukan diarahkan ke halaman lain yang ikut menyala.
 */
function useLinkNav(variant) {
  const { data } = useApi(() => api.dashboardUmkm(), [], { aktif: variant === 'umkm' })
  const kampanye = data?.kampanye || []
  const untukLaporan = kampanye.find((k) => k.status === 'berjalan') || kampanye[0]
  const tujuanLaporan = untukLaporan
    ? `/umkm/kampanye/${untukLaporan.id}/laporan`
    : tujuanLaporanUmkmTerakhir

  useEffect(() => {
    if (variant === 'umkm' && data && untukLaporan) {
      tujuanLaporanUmkmTerakhir = `/umkm/kampanye/${untukLaporan.id}/laporan`
    }
  }, [variant, data, untukLaporan])

  return (NAV[variant] || [])
    .map((l) => (l.to === null ? { ...l, to: tujuanLaporan } : l))
    .filter((l) => l.to)
}

/**
 * Apakah sebuah menu sedang aktif.
 *
 * NavLink tidak bisa dipakai untuk menu bertanda pagar. React Router
 * menyelesaikan `to="/#fitur"` menjadi path "/" saja — hash-nya dibuang
 * sebelum pencocokan. Akibatnya "Fitur AI" DAN "Cara Kerja" sama-sama
 * dianggap aktif begitu pengguna berada di halaman depan, menggambar dua
 * garis sekaligus dengan `layoutId` yang sama sehingga animasinya bentrok.
 *
 * Menu bertanda pagar hanya aktif kalau hash-nya memang cocok.
 */
function menuAktif(to, { pathname, hash }, cocok) {
  if (cocok) return cocok.test(pathname)
  const [path, bagian] = to.split('#')
  const rute = path || '/'
  if (bagian) return pathname === rute && hash === `#${bagian}`
  return pathname === rute
}

/** Menu akun: identitas yang sedang aktif + jalan keluar dari sesi. */
function MenuAkun({ variant }) {
  const { profil, keluar } = useSesi()
  const [buka, setBuka] = useState(false)
  const bungkus = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!buka) return
    const tutupBilaDiLuar = (e) => {
      if (bungkus.current && !bungkus.current.contains(e.target)) setBuka(false)
    }
    const tutupBilaEsc = (e) => e.key === 'Escape' && setBuka(false)
    document.addEventListener('mousedown', tutupBilaDiLuar)
    document.addEventListener('keydown', tutupBilaEsc)
    return () => {
      document.removeEventListener('mousedown', tutupBilaDiLuar)
      document.removeEventListener('keydown', tutupBilaEsc)
    }
  }, [buka])

  return (
    <div ref={bungkus} className="relative">
      <motion.button
        {...tekan}
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        aria-haspopup="menu"
        aria-label={`Akun ${profil.label}`}
        title={profil.label}
        className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-navy text-sm font-bold text-white ring-2 ring-white"
      >
        {profil.inisial}
        {profil.foto && (
          <img
            src={profil.foto}
            alt=""
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </motion.button>

      <AnimatePresence>
        {buka && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DUR.quick, ease: EASE.signature }}
            className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-xl border border-black/5 bg-white shadow-lg"
          >
            <div className="border-b border-black/5 bg-cream-100 px-4 py-3">
              <p className="truncate text-sm font-bold text-navy">{profil.nama}</p>
              {/* Dulu apa pun yang bukan UMKM disebut "Kreator konten" —
                  admin ikut kena label yang salah. */}
              <p className="text-xs text-ink-muted">
                {profil.usaha || 'Kreator konten'}
              </p>
            </div>

            <Link
              to={profil.beranda}
              role="menuitem"
              onClick={() => setBuka(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-cream-100 hover:text-navy"
            >
              Dashboard <ChevronRight size={15} />
            </Link>
            <Link
              to="/notifikasi"
              role="menuitem"
              onClick={() => setBuka(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-cream-100 hover:text-navy"
            >
              Notifikasi <ChevronRight size={15} />
            </Link>
            {/* Nama tujuan ini dulu berbeda di setiap pintu masuknya: menu akun
                dan sidebar menyebutnya "Pusat Bantuan", footer "Ajukan
                Sengketa", sedangkan halamannya sendiri berjudul "Pusat
                Sengketa". Sekarang satu nama di semua tempat. */}
            <Link
              to="/dispute"
              role="menuitem"
              onClick={() => setBuka(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-cream-100 hover:text-navy"
            >
              Pusat Sengketa <ChevronRight size={15} />
            </Link>
            {profil.peran !== 'admin' && (
              <Link
                to="/profil"
                role="menuitem"
                onClick={() => setBuka(false)}
                className="flex items-center justify-between px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-cream-100 hover:text-navy"
              >
                Profil Saya <ChevronRight size={15} />
              </Link>
            )}
            <Link
              to="/akun"
              role="menuitem"
              onClick={() => setBuka(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-cream-100 hover:text-navy"
            >
              Keamanan Akun <ChevronRight size={15} />
            </Link>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setBuka(false)
                keluar()
                navigate('/')
              }}
              className="w-full border-t border-black/5 px-4 py-2.5 text-left text-sm font-semibold text-danger transition-colors hover:bg-cream-100"
            >
              Keluar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Menu layar HP. Di bawah `md` menu atas disembunyikan dan sidebar baru muncul
 * di `lg`, jadi tanpa ini pengguna HP tidak punya jalan ke halaman lain selain
 * footer, dan tamu bahkan tidak melihat tombol Masuk.
 *
 * Peran yang punya ruang kerja memakai daftar sidebar (lebih lengkap dari menu
 * atas). "Laporan Hasil" dilewati karena tujuannya baru diketahui setelah
 * data kampanye dimuat; dashboard sudah menautkannya.
 */
function MenuSeluler({ variant }) {
  const [buka, setBuka] = useState(false)
  const lokasi = useLocation()

  // Tutup setiap kali pindah halaman.
  useEffect(() => setBuka(false), [lokasi.pathname, lokasi.hash])

  useEffect(() => {
    if (!buka) return
    const tutupBilaEsc = (e) => e.key === 'Escape' && setBuka(false)
    document.addEventListener('keydown', tutupBilaEsc)
    return () => document.removeEventListener('keydown', tutupBilaEsc)
  }, [buka])

  const isApp = variant === 'umkm' || variant === 'kreator' || variant === 'admin'
  const linkNav = useLinkNav(variant)
  const item = isApp ? linkNav : [...linkNav, { label: 'Masuk', to: '/masuk' }]

  // Halaman masuk/daftar sudah punya satu-satunya tautan yang perlu.
  if (variant === 'auth' || !item.length) return null

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        aria-controls="menu-seluler"
        aria-label={buka ? 'Tutup menu' : 'Buka menu'}
        className="grid h-10 w-10 place-items-center rounded-full text-navy transition-colors hover:bg-cream-200"
      >
        {buka ? <Close size={22} /> : <Menu size={22} />}
      </button>

      <AnimatePresence>
        {buka && (
          <motion.nav
            id="menu-seluler"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DUR.quick, ease: EASE.signature }}
            className="absolute inset-x-0 top-[68px] z-50 border-b border-black/5 bg-cream px-4 pb-4 pt-2 shadow-lg"
          >
            {item.map(({ label, to, cocok, icon: Icon }) => {
              const aktif = menuAktif(to, lokasi, cocok)
              return (
                <Link
                  key={label}
                  to={to}
                  onClick={() => setBuka(false)}
                  aria-current={aktif ? 'page' : undefined}
                  className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${
                    aktif ? 'bg-navy text-white' : 'text-ink-soft hover:bg-cream-200 hover:text-navy'
                  }`}
                >
                  {Icon && <Icon size={19} />}
                  {label}
                </Link>
              )
            })}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AppNav({ variant = 'public' }) {
  const links = useLinkNav(variant)
  const isApp = variant === 'umkm' || variant === 'kreator' || variant === 'admin'
  const { profil, sudahMasuk } = useSesi()
  const lokasi = useLocation()

  // Titik merah pada lonceng dulu selalu menyala. Sekarang ia menghitung
  // notifikasi yang benar-benar belum dibaca; kalau nol, titiknya hilang.
  const { data: notif, muatUlang } = useApi(
    () => api.notifikasi({ hanyaBaru: true, batas: 1 }),
    [sudahMasuk],
    { aktif: sudahMasuk },
  )
  const belumDibaca = notif?.belumDibaca || 0

  // Tanpa ini angkanya hanya berubah saat halaman dimuat ulang: pengguna yang
  // membuka satu layar lama tidak akan pernah tahu lamarannya sudah diputuskan.
  // Backend tidak punya kanal dorong, jadi menanyakannya berkala adalah cara
  // paling sederhana yang benar — satu permintaan kecil per menit.
  useEffect(() => {
    if (!sudahMasuk) return
    const jeda = setInterval(muatUlang, 60_000)
    return () => clearInterval(jeda)
  }, [sudahMasuk, muatUlang])

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-cream/85 backdrop-blur">
      <div className="shell flex h-[68px] items-center justify-between gap-4">
        <Brand to={isApp ? profil.beranda : '/'} />

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => {
            const aktif = menuAktif(l.to, lokasi, l.cocok)
            return (
              <Link
                key={l.label}
                to={l.to}
                aria-current={aktif ? 'page' : undefined}
                className={`relative text-sm font-medium transition-colors ${
                  aktif ? 'text-navy' : 'text-ink-soft hover:text-navy'
                }`}
              >
                {l.label}
                {/* Garis aktif meluncur antar menu, bukan berkedip pindah */}
                {aktif && (
                  <motion.span
                    layoutId={`nav-aktif-${variant}`}
                    className="absolute -bottom-1.5 left-0 h-0.5 w-full rounded bg-navy"
                    transition={{ duration: 0.25, ease: EASE.signature }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {isApp ? (
            <>
              <motion.div
                whileHover={{ scale: 1.08, rotate: -6 }}
                whileTap={{ scale: 0.94 }}
                transition={{ duration: DUR.hover, ease: EASE.signature }}
              >
                <Link
                  to="/notifikasi"
                  title={belumDibaca ? `${belumDibaca} notifikasi belum dibaca` : 'Notifikasi'}
                  aria-label={belumDibaca ? `Notifikasi, ${belumDibaca} belum dibaca` : 'Notifikasi'}
                  className="relative block text-ink-soft transition-colors hover:text-navy"
                >
                  <Bell size={22} />
                  {/* Titik notifikasi berdenyut pelan — lapis ambient */}
                  {belumDibaca > 0 && (
                    <motion.span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-cream"
                      animate={{ scale: [1, 1.18, 1] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: EASE.ambient }}
                    />
                  )}
                </Link>
              </motion.div>
              <MenuAkun variant={variant} />
            </>
          ) : variant === 'auth' ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-ink-soft sm:inline">Sudah punya akun?</span>
              <Link to="/masuk" className="font-semibold text-navy hover:opacity-70">
                Masuk
              </Link>
            </div>
          ) : (
            <>
              <Link
                to="/masuk"
                className="hidden text-sm font-semibold text-navy hover:opacity-70 sm:block"
              >
                Masuk
              </Link>
              <motion.div {...tekan}>
                <Link to="/daftar" className="btn-primary">
                  Daftar Sekarang
                </Link>
              </motion.div>
            </>
          )}
          <MenuSeluler variant={variant} />
        </div>
      </div>
    </header>
  )
}

/**
 * Dijawab sekali per muat halaman, bukan per pergantian rute: AppShell
 * dipasang ulang di setiap halaman, dan statusnya tidak berubah selama itu.
 */
let janjiModeDemo = null
const cekModeDemo = () =>
  (janjiModeDemo ??= api
    .kesehatan()
    .then((s) => Boolean(s.modeDemo))
    .catch(() => false))

/**
 * Pita tipis saat backend berjalan sebagai Vercel Function. Di sana basis
 * data kembali ke data contoh setiap kali server tidur, jadi akun yang baru
 * didaftarkan bisa hilang. Lebih baik penilai tahu dari awal daripada
 * mengira aplikasinya rusak.
 */
function PitaModeDemo() {
  const [aktif, setAktif] = useState(false)
  useEffect(() => {
    let batal = false
    cekModeDemo().then((v) => !batal && setAktif(v))
    return () => {
      batal = true
    }
  }, [])
  if (!aktif) return null
  return (
    <p className="bg-navy px-4 py-1.5 text-center text-xs text-white/85">
      MODE DEMO: pembayaran dan saldo hanya simulasi, tidak ada uang sungguhan dan saldo tidak bisa ditarik. Data dapat direset sewaktu-waktu.
    </p>
  )
}

export default function AppShell({ variant, wide = false, flush = false, children }) {
  const { pathname } = useLocation()
  const { peran } = useSesi()

  // Halaman auth memaksa varian sendiri; sisanya mengikuti sesi.
  const varian = variant || (peran === 'tamu' ? 'public' : peran)

  // Sidebar muncul di seluruh ruang kerja setiap peran, bukan hanya kreator.
  const pakaiSidebar = punyaSidebar(varian, pathname)
  const lebar = wide || pakaiSidebar

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <PitaModeDemo />
      <AppNav variant={varian} />

      <div className="flex flex-1">
        {pakaiSidebar && <SidebarRuang peran={varian} pathname={pathname} />}
        <main className="min-w-0 flex-1">
          {flush ? (
            children
          ) : (
            <div className={`${lebar ? 'w-full px-6' : 'shell'} py-10`}>{children}</div>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  )
}
