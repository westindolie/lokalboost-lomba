import { motion } from 'motion/react'
import { pageVariants } from '../motion.js'

// Token gerak dipusatkan di src/motion.js. Di-ekspor ulang di sini supaya
// halaman yang sudah mengimpor { stagger, fadeUp } dari file ini tetap jalan.
export { stagger, staggerRapat, fadeUp, fadeUpBerat, EASE, DUR } from '../motion.js'

/**
 * Transisi masuk/keluar antar halaman — pola Premium: fade + naik + skala 98%→100%.
 * Dipasangkan dengan <AnimatePresence mode="wait"> di App.jsx sehingga halaman
 * lama selesai memudar (300ms, accelerate) sebelum yang baru masuk (460ms, decelerate).
 * Masuk sengaja lebih lama dari keluar — pengguna lebih peduli pada apa yang muncul.
 */
export default function PageTransition({ children }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>
  )
}
