import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Satu-satunya pintu keluar aplikasi menuju backend.
 *
 * Semua halaman memanggil `api.*` dan tidak pernah menyusun URL sendiri.
 * Alasannya sama dengan alasan `data/mock.js` dulu dibuat: begitu dua layar
 * memanggil endpoint yang sama dengan cara berbeda, salah satunya pasti
 * ketinggalan saat kontraknya berubah.
 *
 * Pesan galat dari server sudah berbahasa Indonesia dan ramah pengguna
 * (lihat lib/util.js di backend), jadi diteruskan apa adanya ke antarmuka.
 */

/**
 * Alamat backend.
 *
 * Urutannya penting:
 *   1. `VITE_API_URL` kalau diisi — untuk penyebaran yang backend-nya memang
 *      terpisah dari frontend.
 *   2. Kosong (relatif) pada build produksi — backend melayani situs ini dari
 *      asal yang sama, jadi `/api/...` cukup. Ini yang membuat aplikasi bisa
 *      dibagikan lewat SATU alamat: alamatnya boleh berubah kapan saja tanpa
 *      membangun ulang, karena tidak ada alamat yang ditanam di dalam bundel.
 *   3. localhost:4000 saat `npm run dev`, di mana Vite jalan di port lain.
 *
 * Jebakan yang dihapus baris ini: Vite menanam `VITE_API_URL` ke dalam bundel
 * SAAT BUILD. Selama nilainya wajib, setiap ganti alamat berarti build ulang —
 * dan situs yang tayang pernah berjam-jam menunjuk backend yang salah karena
 * hal itu terlewat.
 */
export const DASAR = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000' : '')

const KUNCI_TOKEN = 'lokalboost:token'

export const bacaToken = () =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(KUNCI_TOKEN)

export function simpanToken(token) {
  if (typeof window === 'undefined') return
  if (token) window.localStorage.setItem(KUNCI_TOKEN, token)
  else window.localStorage.removeItem(KUNCI_TOKEN)
}

/** Galat yang membawa status HTTP, supaya halaman bisa membedakan 401 dari 500. */
export class GalatApi extends Error {
  constructor(pesan, status, rincian) {
    super(pesan)
    this.name = 'GalatApi'
    this.status = status
    this.rincian = rincian
  }
}

async function minta(metode, jalur, { body, berkas, tanpaToken = false } = {}) {
  const token = tanpaToken ? null : bacaToken()
  const kepala = {}
  if (token) kepala.authorization = `Bearer ${token}`
  if (body && !berkas) kepala['content-type'] = 'application/json'

  let respons
  try {
    respons = await fetch(`${DASAR}${jalur}`, {
      method: metode,
      headers: kepala,
      body: berkas || (body ? JSON.stringify(body) : undefined),
    })
  } catch {
    // Server mati atau jaringan putus. Pesannya harus memberi tahu apa yang
    // bisa dilakukan pengguna, bukan menyalin "Failed to fetch".
    throw new GalatApi(
      'Tidak bisa menghubungi server LokalBoost. Pastikan layanan API sedang berjalan.',
      0,
    )
  }

  const teks = await respons.text()
  let data = {}
  try {
    data = teks ? JSON.parse(teks) : {}
  } catch {
    // Biasanya hosting yang me-rewrite /api ke index.html: status 200 tapi
    // isinya HTML. Tanpa ini pengguna hanya melihat "Unexpected token <".
    throw new GalatApi(
      'Server LokalBoost membalas dengan format yang tidak dikenali. Layanan API mungkin belum aktif.',
      respons.status,
    )
  }

  if (!respons.ok) {
    throw new GalatApi(data.galat || 'Terjadi kesalahan yang tidak terduga.', respons.status, data.rincian)
  }
  return data
}

/** Ubah objek filter menjadi query string, melewati nilai kosong. */
function kueri(objek = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(objek)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  /** Status server + batas yang bergantung tempat ia berjalan (mis. ukuran unggah). */
  kesehatan: () => minta('GET', '/api/kesehatan', { tanpaToken: true }),

  // ---------------------------------------------------------------- Akun
  daftar: (data) => minta('POST', '/api/auth/daftar', { body: data, tanpaToken: true }),
  kirimUlangOtp: (identitas) => minta('POST', '/api/auth/otp/kirim', { body: { identitas }, tanpaToken: true }),
  verifikasiOtp: (identitas, kode) =>
    minta('POST', '/api/auth/otp/verifikasi', { body: { identitas, kode }, tanpaToken: true }),
  masuk: (identitas, kataSandi) =>
    minta('POST', '/api/auth/masuk', { body: { identitas, kataSandi }, tanpaToken: true }),
  saya: () => minta('GET', '/api/auth/saya'),
  simpanProfil: (data) => minta('PUT', '/api/auth/profil', { body: data }),
  unggahFoto: (formData) => minta('POST', '/api/auth/foto', { berkas: formData }),
  hapusFoto: () => minta('DELETE', '/api/auth/foto'),
  fotoGaleriUmkm: () => minta('GET', '/api/auth/galeri-foto'),
  unggahFotoGaleriUmkm: (formData) => minta('POST', '/api/auth/galeri-foto', { berkas: formData }),
  hapusFotoGaleriUmkm: (id) => minta('DELETE', `/api/auth/galeri-foto/${encodeURIComponent(id)}`),
  ubahSandi: (kataSandiLama, kataSandiBaru) =>
    minta('POST', '/api/auth/sandi/ubah', { body: { kataSandiLama, kataSandiBaru } }),
  lupaSandi: (identitas) =>
    minta('POST', '/api/auth/sandi/lupa', { body: { identitas }, tanpaToken: true }),
  aturSandi: (identitas, kode, kataSandiBaru) =>
    minta('POST', '/api/auth/sandi/atur', {
      body: { identitas, kode, kataSandiBaru },
      tanpaToken: true,
    }),

  // ----------------------------------------------------------- Kampanye
  kampanye: (filter) => minta('GET', `/api/kampanye${kueri(filter)}`),
  kampanyeDetail: (id) => minta('GET', `/api/kampanye/${id}`),
  buatKampanye: (data) => minta('POST', '/api/kampanye', { body: data }),
  ubahKampanye: (id, data) => minta('PATCH', `/api/kampanye/${id}`, { body: data }),
  unggahGambarKampanye: (id, formData) => minta('POST', `/api/kampanye/${id}/gambar`, { berkas: formData }),
  konfigurasiPembayaran: () => minta('GET', '/api/pembayaran/konfigurasi'),
  buatTagihan: (data) => minta('POST', '/api/pembayaran/tagihan', { body: data }),
  cekPembayaran: (orderId) => minta('POST', `/api/pembayaran/${encodeURIComponent(orderId)}/cek`),
  tagihanKampanye: (id) => minta('GET', `/api/pembayaran/kampanye/${id}`),
  // Biaya pasang kampanye: dibayar sebelum formulir kampanye terbuka.
  statusBiayaPasang: () => minta('GET', '/api/pembayaran/biaya-pasang'),
  tagihanBiayaPasang: (data) => minta('POST', '/api/pembayaran/biaya-pasang/tagihan', { body: data }),
  bayarBiayaPasangSimulasi: () => minta('POST', '/api/pembayaran/biaya-pasang/simulasi'),
  setorDana: (id, data) => minta('POST', `/api/kampanye/${id}/setor`, { body: data }),
  simulasiPencairanKampanye: (id) => minta('POST', `/api/kampanye/${id}/demo-selesaikan`),
  periksaKampanye: (id) => minta('POST', `/api/kampanye/${id}/periksa`),
  moderasiKampanye: (id) => minta('GET', `/api/kampanye/${id}/moderasi`),
  bandingKampanye: (id, alasan) => minta('POST', `/api/kampanye/${id}/banding`, { body: { alasan } }),
  ikutiKampanye: (id) => minta('POST', `/api/kampanye/${id}/lamaran`),
  lamaranKampanye: (id) => minta('GET', `/api/kampanye/${id}/lamaran`),
  rekomendasiKreator: (id) => minta('GET', `/api/kampanye/${id}/rekomendasi-kreator`),
  laporan: (id) => minta('GET', `/api/kampanye/${id}/laporan`),
  ringkasanAi: (id) => minta('GET', `/api/kampanye/${id}/ringkasan-ai`),
  antiFraud: (id) => minta('GET', `/api/kampanye/${id}/anti-fraud`),
  auditFraud: (id) => minta('POST', `/api/kampanye/${id}/audit-fraud`),
  selesaikanKampanye: (id, alasan) => minta('POST', `/api/kampanye/${id}/selesai`, { body: { alasan } }),
  terbitkanKampanye: (id) => minta('POST', `/api/kampanye/${id}/terbitkan`),

  // Reward: peserta, pencairan berbasis views, klaim produk
  pesertaKampanye: (id) => minta('GET', `/api/kampanye/${id}/peserta`),
  rewardSaya: (id) => minta('GET', `/api/kampanye/${id}/reward-saya`),
  cairkanReward: (id) => minta('POST', `/api/kampanye/${id}/cairkan`),
  klaimProduk: (id, data) => minta('POST', `/api/kampanye/${id}/klaim-produk`, { body: data }),
  kirimProdukKlaim: (id, klaimId, resi) => minta('POST', `/api/kampanye/${id}/klaim/${klaimId}/kirim`, { body: { resi } }),
  terimaProdukKlaim: (id, klaimId) => minta('POST', `/api/kampanye/${id}/klaim/${klaimId}/diterima`),

  // Katalog produk UMKM
  produkSaya: () => minta('GET', '/api/produk'),
  tambahProduk: (data) => minta('POST', '/api/produk', { body: data }),
  ubahProduk: (id, data) => minta('PATCH', `/api/produk/${id}`, { body: data }),
  unggahFotoProduk: (id, formData) => minta('POST', `/api/produk/${id}/foto`, { berkas: formData }),
  hapusProduk: (id) => minta('DELETE', `/api/produk/${id}`),

  // ------------------------------------------------------------ Kreator
  daftarKreator: (filter) => minta('GET', `/api/kreator${kueri(filter)}`),
  kreatorDetail: (id) => minta('GET', `/api/kreator/${id}`),
  kampanyeSaya: () => minta('GET', '/api/kreator/saya/kampanye'),
  lamaranSaya: () => minta('GET', '/api/kreator/saya/lamaran'),
  rekomendasiSaya: (batas) => minta('GET', `/api/kreator/saya/rekomendasi${kueri({ batas })}`),

  // -------------------------------------------- AI Portfolio Auto-builder
  portofolioKreator: (id) => minta('GET', `/api/kreator/${id}/portofolio`),
  portofolioSaya: () => minta('GET', '/api/kreator/saya/portofolio'),
  tambahTautanPortofolio: (url) =>
    minta('POST', '/api/kreator/saya/portofolio/tautan', { body: { url } }),
  hapusTautanPortofolio: (tautanId) =>
    minta('DELETE', `/api/kreator/saya/portofolio/tautan/${tautanId}`),
  statusCekProfil: () => minta('GET', '/api/kreator/saya/portofolio/profil'),
  cekProfil: (url) => minta('POST', '/api/kreator/saya/portofolio/profil', { body: { url } }),
  lepasProfil: (platform) => minta('DELETE', `/api/kreator/saya/portofolio/profil/${platform}`),

  // ------------------------------------------------------------- Dompet
  dompet: () => minta('GET', '/api/dompet'),
  kirimKodePenarikan: () => minta('POST', '/api/dompet/tarik/kode'),
  tarikDana: (data) => minta('POST', '/api/dompet/tarik', { body: data }),
  transaksi: (jenis) => minta('GET', `/api/dompet/transaksi${kueri({ jenis })}`),

  // -------------------------------------------------------------- Video
  video: (filter) => minta('GET', `/api/video${kueri(filter)}`),
  unggahVideo: (formData) => minta('POST', '/api/video', { berkas: formData }),
  prosesVideo: (id, naskah) => minta('POST', `/api/video/${id}/proses`, { body: { naskah } }),
  hapusVideo: (id) => minta('DELETE', `/api/video/${id}`),
  setujuiVideo: (id, alasan) => minta('POST', `/api/video/${id}/setujui-umkm`, { body: { alasan } }),
  setorTautanVideo: (data) => minta('POST', '/api/video/tautan', { body: data }),
  perbaruiViewsVideo: (id) => minta('POST', `/api/video/${id}/perbarui-views`),
  putuskanKecocokanVideo: (id, setujui, alasan) => minta('POST', `/api/video/${id}/kecocokan`, { body: { setujui, alasan } }),
  akuiViewsVideo: (id) => minta('POST', `/api/video/${id}/akui-views`),

  // ----------------------------------------------------------- Tayangan
  tayangan: (filter) => minta('GET', `/api/tayangan${kueri(filter)}`),
  catatTayangan: (data) => minta('POST', '/api/tayangan', { body: data, tanpaToken: true }),
  catatTayanganBatch: (tayangan) =>
    minta('POST', '/api/tayangan/batch', { body: { tayangan }, tanpaToken: true }),

  // ------------------------------------------------------- Ulasan & dsb.
  ulasan: (filter) => minta('GET', `/api/ulasan${kueri(filter)}`),
  kirimUlasan: (data) => minta('POST', '/api/ulasan', { body: data }),
  ulasanTertunda: () => minta('GET', '/api/ulasan/tertunda'),

  notifikasi: (filter) => minta('GET', `/api/notifikasi${kueri(filter)}`),
  bacaSemuaNotifikasi: () => minta('POST', '/api/notifikasi/baca'),
  bacaNotifikasi: (id) => minta('POST', `/api/notifikasi/${id}/baca`),

  sengketa: () => minta('GET', '/api/sengketa'),
  sengketaDetail: (id) => minta('GET', `/api/sengketa/${id}`),
  ajukanSengketa: (data) => minta('POST', '/api/sengketa', { body: data }),
  putuskanSengketa: (id, data) => minta('POST', `/api/sengketa/${id}/putuskan`, { body: data }),
  kategoriSengketa: () => minta('GET', '/api/sengketa/meta/kategori'),

  // ----------------------------------------------------------------- AI
  statusAi: () => minta('GET', '/api/ai/status'),
  ringkasanLaporan: (kampanyeId) => minta('POST', '/api/ai/ringkasan-laporan', { body: { kampanyeId } }),
  buatNaskah: (data) => minta('POST', '/api/ai/naskah', { body: data }),
  briefReferensi: (data) => minta('POST', '/api/ai/brief-referensi', { body: data }),
  riwayatNaskah: () => minta('GET', '/api/ai/naskah'),
  subtitle: (naskah, durasiDetik) => minta('POST', '/api/ai/subtitle', { body: { naskah, durasiDetik } }),

  // ---------------------------------------------------------- Dashboard
  dashboardUmkm: () => minta('GET', '/api/dashboard/umkm'),
  dashboardKreator: () => minta('GET', '/api/dashboard/kreator'),
  statistikPublik: () => minta('GET', '/api/dashboard/statistik-publik'),

  // -------------------------------------------------------------- Admin
  adminRingkasan: () => minta('GET', '/api/admin/ringkasan'),
  adminKampanye: () => minta('GET', '/api/admin/kampanye'),
  adminKonten: (moderasi) => minta('GET', `/api/admin/konten${kueri({ moderasi })}`),
  adminModerasi: (id, data) => minta('POST', `/api/admin/konten/${id}/moderasi`, { body: data }),
  adminPenandaan: () => minta('GET', '/api/admin/penandaan-etika'),
  adminPutusPenandaan: (id, tindakan) => minta('POST', `/api/admin/penandaan-etika/${id}`, { body: { tindakan } }),
  adminModerasiKampanye: (status) => minta('GET', `/api/admin/moderasi-kampanye${kueri({ status })}`),
  adminPutusKampanye: (id, data) => minta('POST', `/api/admin/moderasi-kampanye/${id}`, { body: data }),
  adminPengguna: (peran) => minta('GET', `/api/admin/pengguna${kueri({ peran })}`),
  adminVerifikasi: (id, data) => minta('POST', `/api/admin/pengguna/${id}/verifikasi`, { body: data }),
  adminTransaksi: (jenis) => minta('GET', `/api/admin/transaksi${kueri({ jenis })}`),
  adminPembelajaran: () => minta('GET', '/api/admin/pembelajaran'),
  adminUsulanPenyetelan: () => minta('GET', '/api/admin/pembelajaran/usulan'),
}

/**
 * Pemuat data untuk halaman.
 *
 * `ambil` harus berupa fungsi yang mengembalikan Promise; `kunci` adalah
 * daftar nilai yang bila berubah memicu pemuatan ulang (seperti dependensi
 * useEffect). Kembalian `muatUlang()` dipakai setelah aksi yang mengubah
 * data — misalnya menyetujui pelamar — supaya layar segar tanpa memuat
 * ulang seluruh aplikasi.
 *
 * `aktif: false` menahan permintaan sama sekali. Itu yang dipakai halaman
 * lintas peran: tamu tidak boleh memanggil endpoint yang butuh token, karena
 * jawabannya pasti 401 dan hanya akan menampilkan galat palsu.
 */
export function useApi(ambil, kunci = [], { aktif = true } = {}) {
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState(null)
  const [memuat, setMemuat] = useState(aktif)
  const [penanda, setPenanda] = useState(0)
  const terpasang = useRef(true)
  const ambilRef = useRef(ambil)
  ambilRef.current = ambil

  useEffect(() => {
    terpasang.current = true
    return () => {
      terpasang.current = false
    }
  }, [])

  useEffect(() => {
    if (!aktif) {
      setMemuat(false)
      setData(null)
      return
    }
    let batal = false
    setMemuat(true)
    setGalat(null)

    ambilRef
      .current()
      .then((hasil) => {
        if (!batal && terpasang.current) setData(hasil)
      })
      .catch((e) => {
        if (!batal && terpasang.current) setGalat(e)
      })
      .finally(() => {
        if (!batal && terpasang.current) setMemuat(false)
      })

    return () => {
      batal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...kunci, aktif, penanda])

  const muatUlang = useCallback(() => setPenanda((n) => n + 1), [])
  return { data, galat, memuat, muatUlang }
}
