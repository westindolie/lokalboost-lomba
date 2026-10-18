/**
 * Brand Motion Identity — LokalBoost
 * Disusun dengan skill motion-design (LottieFiles).
 *
 * Arketipe: PREMIUM (90%) — elegan, tanpa overshoot, gerak halus.
 * Meminjam PLAYFUL hanya untuk state sukses (per panduan "mixing archetypes").
 *
 * Tiga konstanta identitas:
 *   1. Signature easing : cubic-bezier(0.4, 0, 0.2, 1) — dipakai 80% animasi
 *   2. Duration palette : quick 350ms · standard 500ms · slow 800ms
 *   3. Entrance pattern : fade + scale 98% → 100%
 *
 * Tiga lapis gerak (wajib, ini yang bikin animasi tidak terasa datar):
 *   - Primary   : aksi utama yang diikuti mata
 *   - Secondary : pendukung — bayangan, ikon bergeser, border
 *   - Ambient   : kehidupan latar — orb mengambang, gradien bergerak, shimmer
 */

/* ---------- Easing ---------- */
export const EASE = {
  /** Signature Premium — 80% animasi memakai ini */
  signature: [0.4, 0, 0.2, 1],
  /** Masuk: cepat di awal, mendarat lembut (MD3 emphasized) */
  entrance: [0.05, 0.7, 0.1, 1],
  /** Keluar: mulai lembut, pergi cepat */
  exit: [0.3, 0, 1, 1],
  /** Ambient looping — sinus, mulus di kedua ujung */
  ambient: [0.37, 0, 0.63, 1],
  /** Dipinjam dari Playful — HANYA untuk state sukses */
  settle: [0.175, 0.885, 0.32, 1.275],
}

/* ---------- Durasi (detik) ---------- */
export const DUR = {
  // Palet Premium
  quick: 0.35,
  standard: 0.5,
  slow: 0.8,
  // Umpan balik interaktif — mengikuti tabel tipe elemen, bukan palet arketipe,
  // karena responsivitas mengalahkan gaya (aturan HIGH #1 pada skill).
  hover: 0.09, // < 100ms
  hoverOut: 0.18, // keluar lebih lambat = terasa rapi
  press: 0.12, // < 150ms
  release: 0.26, // 200–300ms
  // Transisi halaman: 400–600ms
  pageIn: 0.46,
  pageOut: 0.3, // keluar 30–50% lebih pendek dari masuk
}

/* ---------- Anggaran stagger (total wajib < 500ms) ---------- */
export const STAGGER = {
  micro: 0.03, // item daftar rapat
  standard: 0.08, // kartu & panel (Premium)
  dramatic: 0.14, // seksi hero
}

/* ---------- Transisi halaman ---------- */
export const pageVariants = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: DUR.pageIn,
      ease: EASE.entrance,
      // Konten menyusul sedikit setelah halaman mulai masuk, bukan menunggu
      // halaman selesai — kalau menunggu, terasa lamban.
      delayChildren: 0.12,
      staggerChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.995,
    transition: { duration: DUR.pageOut, ease: EASE.exit },
  },
}

/* ---------- Kontainer stagger ---------- */
export const stagger = {
  initial: {},
  animate: {
    transition: { staggerChildren: STAGGER.standard, delayChildren: 0.05 },
  },
}

/** Stagger rapat untuk daftar panjang agar total tetap di bawah 500ms. */
export const staggerRapat = {
  initial: {},
  animate: { transition: { staggerChildren: STAGGER.micro, delayChildren: 0.04 } },
}

/* ---------- Entrance pattern (signature) ---------- */
export const fadeUp = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DUR.quick, ease: EASE.entrance },
  },
}

/** Varian untuk elemen berat (panel besar) — sedikit lebih lambat. */
export const fadeUpBerat = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DUR.standard, ease: EASE.entrance },
  },
}

/* ---------- Umpan balik tekan (Premium: tanpa overshoot) ---------- */
export const tekan = {
  whileHover: { scale: 1.02, transition: { duration: DUR.hover, ease: EASE.signature } },
  whileTap: { scale: 0.98, opacity: 0.9, transition: { duration: DUR.press, ease: EASE.signature } },
}

/**
 * Kartu yang bisa disentuh kursor.
 *
 * PENTING — nama varian harus memakai label yang sama dengan kontainer stagger
 * ("initial"/"animate"), karena hanya label itulah yang diturunkan induk. Dulu
 * kartu memakai label "rest" sehingga kartu tidak pernah ikut animasi masuk:
 * label "rest" tidak ada di `fadeUp`, dan menuliskannya di prop `animate`
 * memutus pewarisan dari kontainer. Keadaan diam sekarang = "animate".
 */
export const kartuMasuk = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DUR.quick, ease: EASE.entrance },
  },
  // Kartu luar tidak bergerak saat hover — cukup meneruskan label ke anaknya.
  hover: {},
}

/** Angkat kartu saat disentuh kursor — bayangan ikut naik (lapis sekunder). */
export const angkatKartu = {
  initial: { y: 0 },
  animate: { y: 0, transition: { duration: DUR.hoverOut, ease: EASE.signature } },
  hover: { y: -5, transition: { duration: DUR.hover, ease: EASE.signature } },
}

/**
 * Bayangan sebagai lapis SEKUNDER terpisah.
 * Panduan skill: "shadow arrives 50ms after card" dan "lifts up → shadow drops + softens".
 */
export const bayangan = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 0, scale: 0.94, transition: { duration: DUR.hoverOut, ease: EASE.signature } },
  hover: {
    opacity: 1,
    scale: 1,
    transition: { duration: DUR.hover + 0.05, delay: 0.05, ease: EASE.signature },
  },
}

/**
 * Versi berlabel dari `tekan`, untuk tombol yang anaknya ikut bereaksi.
 * `tekan` memakai objek, jadi labelnya tidak bisa diturunkan ke anak; kalau
 * dipaksa (`{...tekan} whileHover="siap"`) prop terakhir menimpa dan umpan
 * balik tekan tombolnya hilang.
 */
export const tekanVarian = {
  animate: { scale: 1, opacity: 1 },
  hover: { scale: 1.02, transition: { duration: DUR.hover, ease: EASE.signature } },
  tap: { scale: 0.98, opacity: 0.9, transition: { duration: DUR.press, ease: EASE.signature } },
}

/* ---------- Ambient (amplitudo 10–20% dari gerak utama) ---------- */
/**
 * Mengambang berlapis — periode sengaja dibuat berbeda supaya tidak pernah
 * sinkron, sesuai pola "layered floating" pada skill.
 */
export const mengambang = (indeks = 0) => {
  const preset = [
    { y: [0, -12, 0], durasi: 4, tunda: 0 },
    { y: [0, -9, 0], durasi: 5.5, tunda: 1.6 },
    { y: [0, -14, 0], durasi: 3.5, tunda: 2.1 },
  ][indeks % 3]
  return {
    animate: { y: preset.y },
    transition: {
      duration: preset.durasi,
      delay: preset.tunda,
      repeat: Infinity,
      ease: EASE.ambient,
    },
  }
}

/** Napas halus untuk indikator aktif — skala tidak melebihi ±5%. */
export const bernapas = {
  animate: { scale: [1, 1.03, 1], opacity: [0.85, 1, 0.85] },
  transition: { duration: 2.5, repeat: Infinity, ease: EASE.ambient },
}

/* ---------- Sukses (meminjam Playful) ---------- */
export const suksesWadah = {
  initial: { scale: 0.9, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0.2, ease: EASE.settle },
  },
}

export const suksesCentang = {
  initial: { pathLength: 0, opacity: 0 },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.15, delay: 0.1, ease: EASE.signature },
  },
}

/** Cahaya ambient yang mengembang setelah centang selesai. */
export const suksesCahaya = {
  initial: { scale: 0.6, opacity: 0.5 },
  animate: {
    scale: 1.8,
    opacity: 0,
    transition: { duration: 0.55, delay: 0.12, ease: EASE.exit },
    // Sudah tak terlihat, tapi skala 1,8x tetap melebarkan halaman di HP
    // (wadahnya selebar kontainer). Kecilkan lagi begitu animasi selesai.
    transitionEnd: { scale: 0 },
  },
}

/* ---------- Error (tegas, tanpa overshoot) ---------- */
export const goyang = {
  animate: { x: [0, -12, 10, -7, 4, 0] },
  transition: { duration: 0.36, ease: 'easeInOut' },
}
