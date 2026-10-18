import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, bacaToken, simpanToken } from './api.js'

/**
 * Sesi pengguna — satu-satunya sumber kebenaran tentang "siapa yang sedang
 * masuk".
 *
 * Dulu isinya cuma sebuah kata ("umkm"/"kreator") yang disimpan di
 * localStorage dan bisa ditebak dari alamat halaman: membuka /umkm cukup
 * untuk menjadi UMKM. Itu masuk akal selama seluruh data masih mock — tidak
 * ada apa pun yang perlu dilindungi.
 *
 * Sekarang peran datang dari token JWT yang diterbitkan backend, dan profil
 * datang dari GET /api/auth/saya. Konsekuensinya disengaja: alamat halaman
 * tidak lagi bisa mengubah peran, dan ruang kerja sebuah peran hanya terbuka
 * setelah benar-benar masuk (lihat components/Terproteksi.jsx).
 */

const KonteksSesi = createContext(null)

/** Inisial untuk avatar: "Sari Handayani" -> "SH". */
function inisialDari(nama = '') {
  const bagian = String(nama).trim().split(/\s+/).filter(Boolean)
  if (!bagian.length) return '?'
  return (bagian[0][0] + (bagian[1]?.[0] || '')).toUpperCase()
}

const BERANDA = { umkm: '/umkm', kreator: '/kreator', admin: '/admin' }

/** Bentuk profil yang dipakai navbar dan menu akun. */
function bentukProfil(pengguna) {
  if (!pengguna) {
    return { peran: 'tamu', nama: null, label: 'Tamu', inisial: null, usaha: null, beranda: '/' }
  }
  const usaha =
    pengguna.peran === 'umkm'
      ? pengguna.profil?.nama_usaha || null
      : pengguna.peran === 'admin'
        ? 'Admin Platform'
        : null

  const sebutan = { umkm: 'UMKM', kreator: 'Kreator', admin: 'Admin Platform' }[pengguna.peran]

  return {
    peran: pengguna.peran,
    nama: pengguna.nama,
    label: `${pengguna.nama} — ${sebutan}`,
    inisial: inisialDari(pengguna.nama),
    foto: pengguna.profil?.foto || null,
    usaha,
    beranda: BERANDA[pengguna.peran] || '/',
  }
}

export function SesiProvider({ children }) {
  const [pengguna, setPengguna] = useState(null)
  // `memuat` bermula true hanya bila ada token yang perlu diperiksa. Tanpa
  // token, tamu tidak perlu menunggu satu putaran jaringan pun.
  const [memuat, setMemuat] = useState(() => Boolean(bacaToken()))

  useEffect(() => {
    if (!bacaToken()) return
    let batal = false
    api
      .saya()
      .then((hasil) => {
        if (!batal) setPengguna(hasil.pengguna)
      })
      .catch(() => {
        // Token kedaluwarsa atau server berganti rahasia: buang tokennya,
        // jangan biarkan pengguna terjebak di layar yang selalu gagal.
        if (!batal) {
          simpanToken(null)
          setPengguna(null)
        }
      })
      .finally(() => {
        if (!batal) setMemuat(false)
      })
    return () => {
      batal = true
    }
  }, [])

  /** Dipakai setelah masuk dan setelah verifikasi OTP pendaftaran. */
  const terapkanSesi = useCallback((token, penggunaBaru) => {
    simpanToken(token)
    setPengguna(penggunaBaru)
  }, [])

  const masuk = useCallback(
    async (identitas, kataSandi) => {
      const hasil = await api.masuk(identitas, kataSandi)
      terapkanSesi(hasil.token, hasil.pengguna)
      return hasil.pengguna
    },
    [terapkanSesi],
  )

  const keluar = useCallback(() => {
    simpanToken(null)
    setPengguna(null)
  }, [])

  /** Muat ulang profil — dipakai setelah menyunting data usaha/konten. */
  const segarkan = useCallback(async () => {
    if (!bacaToken()) return null
    const hasil = await api.saya()
    setPengguna(hasil.pengguna)
    return hasil.pengguna
  }, [])

  const nilai = useMemo(() => {
    const peran = pengguna?.peran || 'tamu'
    return {
      pengguna,
      peran,
      profil: bentukProfil(pengguna),
      memuat,
      masuk,
      keluar,
      terapkanSesi,
      segarkan,
      sudahMasuk: Boolean(pengguna),
      adalahUmkm: peran === 'umkm',
      adalahKreator: peran === 'kreator',
      adalahAdmin: peran === 'admin',
    }
  }, [pengguna, memuat, masuk, keluar, terapkanSesi, segarkan])

  return <KonteksSesi.Provider value={nilai}>{children}</KonteksSesi.Provider>
}

export function useSesi() {
  const konteks = useContext(KonteksSesi)
  if (!konteks) throw new Error('useSesi harus dipakai di dalam <SesiProvider>.')
  return konteks
}
