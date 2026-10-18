/**
 * Pilihan tetap yang dipakai formulir dan filter.
 *
 * Ini bukan data — ini daftar pilihan produk yang memang ditentukan di muka
 * (PRD §6.1 menyebut filter kategori, lokasi, dan rentang anggaran). Data
 * kampanye, kreator, dan uang semuanya datang dari API.
 */

export const KATEGORI = ['Kuliner', 'Fashion', 'Kecantikan', 'Ibu & Anak', 'Hobi & Gadget']

/**
 * Wilayah layanan. LokalBoost dimulai di Banda Aceh, jadi formulir lokasi
 * memakai daftar ini (bawaan Banda Aceh) dan bukan isian bebas: ketikan
 * bebas seperti "bna" atau "Bnd Aceh" tidak akan cocok di Smart Matchmaker.
 */
export const LOKASI = ['Banda Aceh', 'Aceh Besar', 'Sabang', 'Lhokseumawe', 'Pidie']

export const LOKASI_BAWAAN = LOKASI[0]

export const RENTANG_ANGGARAN = [
  { id: 'kecil', label: 'Di bawah Rp 500rb', min: undefined, maks: 499_999 },
  { id: 'sedang', label: 'Rp 500rb – Rp 1jt', min: 500_000, maks: 1_000_000 },
  { id: 'besar', label: 'Di atas Rp 1jt', min: 1_000_001, maks: undefined },
]

/** Gaya penyampaian untuk AI Script Generator. */
export const GAYA_NASKAH = ['Ceria & Enerjik', 'Informatif & Santai', 'Bercerita (Emosional)']
