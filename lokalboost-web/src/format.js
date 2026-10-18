/**
 * Pemformat dan penerjemah istilah backend → bahasa layar.
 *
 * Dulu tugas ini menempel di `data/mock.js` bersama datanya. Sekarang datanya
 * datang dari API, tapi aturan tampilannya tetap harus satu: satu status
 * kampanye tidak boleh disebut "Berjalan" di dashboard dan "berjalan" di
 * marketplace, dan satu nominal tidak boleh muncul dengan dua format.
 */

export const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID')
export const ribuan = (n) => (Number(n) || 0).toLocaleString('id-ID')

/** Penilaian selalu satu desimal dengan koma: 5 -> "5,0", 4.9 -> "4,9". */
export const nilai = (n) => (Number(n) || 0).toFixed(1).replace('.', ',')

/** Persentase gaya Indonesia: 12.5 -> "12,5". */
export const persen = (n) => (Number(n) || 0).toFixed(1).replace('.', ',')

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/**
 * Stempel waktu dari backend. `datetime('now')` SQLite dan `sekarang()` di
 * backend sama-sama UTC tanpa zona ("2026-10-17 01:00:00"). Dibaca apa adanya,
 * peramban menganggapnya waktu lokal dan semua "x lalu" meleset 7 jam di WIB.
 * Teks yang sudah membawa zona (Z atau +07:00) tidak disentuh.
 */
function bacaWaktu(teks) {
  const s = String(teks).replace(' ', 'T')
  return new Date(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}Z` : s)
}

/** "2026-08-02 14:31:00" -> "2 Agu 2026". */
export function tanggal(teks) {
  if (!teks) return '—'
  const d = bacaWaktu(teks)
  if (Number.isNaN(d.getTime())) return String(teks)
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

/** "12 menit lalu", "2 hari lalu" — dipakai daftar notifikasi. */
export function waktuLalu(teks) {
  if (!teks) return ''
  const d = bacaWaktu(teks)
  if (Number.isNaN(d.getTime())) return String(teks)

  const detik = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (detik < 60) return 'Baru saja'
  const menit = Math.floor(detik / 60)
  if (menit < 60) return `${menit} menit lalu`
  const jam = Math.floor(menit / 60)
  if (jam < 24) return `${jam} jam lalu`
  const hari = Math.floor(jam / 24)
  if (hari === 1) return 'Kemarin'
  if (hari < 30) return `${hari} hari lalu`
  return tanggal(teks)
}

/**
 * Status kampanye dari basis data → label dan warna chip.
 * `tone` memakai token yang sama dengan <StatusChip>.
 */
const STATUS = {
  draf: { label: 'Draf', tone: 'info' },
  menunggu_dana: { label: 'Menunggu Dana', tone: 'warning' },
  terbuka: { label: 'Berjalan', tone: 'success' },
  mencari_kreator: { label: 'Berjalan', tone: 'success' },
  berjalan: { label: 'Berjalan', tone: 'success' },
  selesai: { label: 'Selesai', tone: 'gold' },
  dibatalkan: { label: 'Dibatalkan', tone: 'danger' },
}

export const statusKampanye = (status, sisaHari) => {
  if (status === 'berjalan' && sisaHari != null && Number(sisaHari) <= 0) {
    return { label: 'Kedaluwarsa', tone: 'danger' }
  }
  if (status === 'berjalan' && Number(sisaHari) > 0 && Number(sisaHari) <= 3) {
    return { label: 'Segera Berakhir', tone: 'warning' }
  }
  return STATUS[status] || { label: status || '—', tone: 'info' }
}

/** Status lamaran kreator. */
const LAMARAN = {
  menunggu: { label: 'Menunggu', tone: 'warning' },
  disetujui: { label: 'Disetujui', tone: 'success' },
  ditolak: { label: 'Ditolak', tone: 'danger' },
  dibatalkan: { label: 'Dibatalkan', tone: 'info' },
}

export const statusLamaran = (status) => LAMARAN[status] || { label: status || '—', tone: 'info' }

/** Status sengketa. */
const SENGKETA = {
  terbuka: { label: 'Diajukan', tone: 'info', langkah: 1 },
  ditinjau: { label: 'Sedang Ditinjau', tone: 'warning', langkah: 2 },
  selesai: { label: 'Selesai', tone: 'success', langkah: 3 },
  ditolak: { label: 'Ditolak', tone: 'danger', langkah: 3 },
}

export const statusSengketa = (status) =>
  SENGKETA[status] || { label: status || '—', tone: 'info', langkah: 1 }

/** Status moderasi konten di ruang admin. */
const MODERASI = {
  menunggu: { label: 'Menunggu Tinjauan', tone: 'warning' },
  lolos: { label: 'Lolos', tone: 'success' },
  revisi: { label: 'Diminta Revisi', tone: 'danger' },
}

export const statusModerasi = (status) => MODERASI[status] || { label: status || '—', tone: 'info' }

/**
 * Gradasi kartu. Kampanye dan kreator hasil seed membawa gradasinya sendiri;
 * yang dibuat pengguna baru belum punya, jadi dipilihkan secara tetap dari
 * id-nya supaya kartunya tidak berganti warna setiap kali halaman dimuat.
 */
const GRADASI = [
  'from-amber-200 to-orange-300',
  'from-rose-200 to-fuchsia-200',
  'from-lime-200 to-emerald-300',
  'from-sky-200 to-indigo-200',
  'from-violet-200 to-fuchsia-200',
  'from-amber-100 to-yellow-200',
]

export function gradasi(objek) {
  if (objek?.gradasi) return objek.gradasi
  const kunci = String(objek?.id || '')
  let jumlah = 0
  for (let i = 0; i < kunci.length; i++) jumlah = (jumlah + kunci.charCodeAt(i)) % 997
  return GRADASI[jumlah % GRADASI.length]
}

/** Pengikut 120000 -> "120K", 1500 -> "1,5K". */
export function pengikut(n) {
  const angka = Number(n) || 0
  if (angka >= 1_000_000) return `${(angka / 1_000_000).toFixed(1).replace('.', ',')}JT`
  if (angka >= 1000) {
    const ribu = angka / 1000
    return `${(ribu % 1 === 0 ? ribu : ribu.toFixed(1)).toString().replace('.', ',')}K`
  }
  return String(angka)
}
