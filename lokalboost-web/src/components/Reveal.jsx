import { motion } from 'motion/react'
import { DUR, EASE } from '../motion.js'

/**
 * Muncul halus saat elemen masuk viewport — dipakai untuk section panjang
 * (Landing, Testimoni). `once: true` supaya tidak berkedip saat scroll balik.
 */
export default function Reveal({ children, delay = 0, y = 16, className = '', as = 'div' }) {
  const Tag = motion[as] || motion.div
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: DUR.standard, delay, ease: EASE.entrance }}
    >
      {children}
    </Tag>
  )
}
