import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Shield, Sparkles } from './icons.jsx'
import { fadeUp, kartuMasuk, angkatKartu, bayangan, tekan, EASE, DUR } from '../motion.js'
import { AngkaNaik } from './Feedback.jsx'
import { DenyutStatus } from './Ambient.jsx'
import { gradasi } from '../format.js'

/** Judul halaman + deskripsi + aksi di kanan. Dipakai semua halaman aplikasi. */
export function PageHeader({ title, subtitle, children }) {
  return (
    <motion.div
      variants={fadeUp}
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div>}
    </motion.div>
  )
}

/** Badge kepercayaan "Dana Aman di Rekber" — trust signal wajib PRD §11. */
export function RekberBadge({ text = 'Dana Aman di Rekber', className = '' }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.quick, ease: EASE.entrance, delay: 0.1 }}
      className={`chip shrink-0 gap-2 border border-gold-border bg-gold px-4 py-2.5 text-gold-text ${className}`}
    >
      <Shield size={16} /> {text}
    </motion.span>
  )
}

/**
 * Kartu statistik. Angka menghitung naik saat masuk viewport (lapis sekunder),
 * bukan sekadar muncul — inilah yang membuat dasbor terasa hidup.
 * `nilai` numerik mengaktifkan hitungan; `value` teks dipakai apa adanya.
 */
export function StatCard({ label, value, nilai, prefiks, sufiks, desimal, sub, subTone = 'text-ink-soft', icon: Icon }) {
  return (
    <motion.div variants={fadeUp} className="stat-card">
      <div className="flex items-center justify-between text-ink-muted">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        {Icon && <Icon size={20} />}
      </div>
      <p className="mt-3 text-3xl font-extrabold text-navy">
        {nilai != null ? (
          <AngkaNaik nilai={nilai} prefiks={prefiks} sufiks={sufiks} desimal={desimal} />
        ) : (
          value
        )}
      </p>
      {sub && <p className={`mt-2 text-sm font-medium ${subTone}`}>{sub}</p>}
    </motion.div>
  )
}

/**
 * Panel saran AI bergaya navy — kilau lembut pada ikon sebagai lapis ambient.
 *
 * Satu-satunya bentuk panel AI di seluruh aplikasi. Sebelumnya komponen ini
 * hanya dipakai Dashboard UMKM, sementara Marketplace, Pilih Kreator, Setor
 * Dana, dan Laporan Hasil masing-masing menulis ulang kartu navy-nya sendiri
 * dengan padding (p-4/p-5/p-6/p-7), ukuran ikon, dan berat judul yang
 * berbeda-beda — lima "panel AI" yang tak pernah terlihat sama.
 *
 * `ikon` bawaannya Sparkles (tanda AI). Panel yang isinya BUKAN keluaran AI
 * wajib memberi ikon lain, supaya tanda AI tidak dipakai untuk templat biasa.
 *
 * `badge` menampung label seperti "AI Auto-Report"; `aksi` menampung tombol
 * atau tautan bebas di kanan panel.
 */
export function AIPanel({ title, badge, children, action, to, aksi, footer, className = '', ikon: Ikon = Sparkles }) {
  const kurangGerak = useReducedMotion()
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-navy p-6 text-white sm:p-7 ${className}`}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 text-white/5"
        animate={kurangGerak ? {} : { rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      >
        <Ikon size={120} />
      </motion.div>

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <motion.span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10"
          animate={kurangGerak ? {} : { scale: [1, 1.04, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: EASE.ambient }}
        >
          <Ikon size={22} className="text-gold" />
        </motion.span>

        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
            {title}
            {badge && (
              <span className="chip bg-gold text-[10px] uppercase tracking-wide text-gold-text">
                {badge}
              </span>
            )}
          </h2>
          <div className="mt-2 text-sm leading-relaxed text-white/80">{children}</div>
          {action && to && (
            <motion.div {...tekan} className="mt-4 inline-block">
              <Link
                to={to}
                className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-navy"
              >
                {action}
              </Link>
            </motion.div>
          )}
          {footer && <div className="mt-3 text-xs text-white/60">{footer}</div>}
        </div>

        {aksi && <div className="shrink-0">{aksi}</div>}
      </div>
    </div>
  )
}

/**
 * Tips singkat dari asisten. Dulu muncul dalam dua rupa yang berbeda pada dua
 * langkah wizard yang berurutan: navy penuh dengan lingkaran emas di langkah 1,
 * lalu navy-light dengan ikon sebaris di langkah 2.
 */
export function TipAsisten({ children, judul = 'Tips Asisten LokalBoost' }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-navy p-5 text-white">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold text-navy">
        <Sparkles size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white/70">{judul}</p>
        <div className="mt-1 text-sm italic leading-relaxed text-white/90">{children}</div>
      </div>
    </div>
  )
}

/**
 * Tab bergaris bawah. Marketplace dan Pilih Kreator menuliskan pola ini
 * masing-masing, dengan easing yang ditulis sebagai angka mentah di satu
 * tempat dan sebagai token di tempat lain.
 *
 * `layoutId` wajib unik per halaman supaya garis tidak "meluncur" antar
 * halaman yang kebetulan sedang bertransisi.
 */
export function TabGaris({ layoutId, tabs, aktif, onGanti }) {
  return (
    <div className="flex gap-8 border-b border-black/10">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onGanti(id)}
          aria-pressed={aktif === id}
          className={`relative -mb-px pb-3 text-lg font-semibold transition-colors ${
            aktif === id ? 'text-navy' : 'text-ink-muted hover:text-navy'
          }`}
        >
          {label}
          {aktif === id && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-navy"
              transition={{ duration: 0.25, ease: EASE.signature }}
            />
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * Bar progres. Isi tumbuh dengan ease-in-out, ditimpa kilau tipis (lapis ambient)
 * hanya bila belum selesai — supaya terbaca "sedang berjalan".
 */
export function ProgressBar({ value, max, tone = 'bg-navy', tinggi = 'h-2' }) {
  const kurangGerak = useReducedMotion()
  const pct = Math.min(100, Math.round((value / max) * 100))
  const selesai = pct >= 100

  return (
    <div className={`${tinggi} w-full overflow-hidden rounded-full bg-black/10`}>
      {/* scaleX, bukan width: transform tidak memicu layout tiap frame. */}
      <motion.div
        className={`relative h-full origin-left overflow-hidden rounded-full ${tone}`}
        style={{ width: pct + '%' }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: DUR.slow, ease: 'easeInOut' }}
      >
        {!kurangGerak && !selesai && (
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
            initial={{ x: '-150%' }}
            animate={{ x: '350%' }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 2.5, ease: 'linear' }}
          />
        )}
      </motion.div>
    </div>
  )
}

/** Chip status — memakai token success/warning/danger. Status berjalan ikut berdenyut. */
/**
 * Penanda akun/kampanye contoh dari seed demo. Tanpa ini, kreator karangan
 * dengan angka pengikut ketikan terbaca sebagai pengguna sungguhan.
 */
export function ChipContoh({ ada }) {
  if (!ada) return null
  return (
    <span
      className="chip shrink-0 border border-black/10 bg-white text-[10px] font-bold uppercase tracking-wide text-ink-soft"
      title="Data contoh untuk demo, bukan pengguna sungguhan"
    >
      Contoh
    </span>
  )
}

export function StatusChip({ status, tone = 'info', denyut = false }) {
  const map = {
    success: 'chip-success',
    warning: 'chip-warning',
    danger: 'chip-danger',
    info: 'chip-info',
    gold: 'chip-gold',
  }
  const warnaDenyut = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-navy',
    gold: 'bg-gold-text',
  }
  return (
    <span className={map[tone] || map.info}>
      {denyut && <DenyutStatus className={warnaDenyut[tone] || 'bg-navy'} />}
      {status}
    </span>
  )
}

/**
 * Kondisi kosong yang ramah, bukan halaman putih.
 * Aksinya bisa berupa tautan (`to`) atau tombol (`onAction`) — misalnya
 * "Reset filter" yang tidak berpindah halaman.
 */
export function EmptyState({ icon: Icon, title, subtitle, action, to, onAction }) {
  const kurangGerak = useReducedMotion()
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="card grid place-items-center px-6 py-14 text-center"
    >
      {Icon && (
        <motion.span
          className="grid h-14 w-14 place-items-center rounded-full bg-cream-200 text-navy"
          animate={kurangGerak ? {} : { y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: EASE.ambient }}
        >
          <Icon size={26} />
        </motion.span>
      )}
      <p className="mt-4 text-lg font-bold text-navy">{title}</p>
      {subtitle && <p className="mt-1.5 max-w-sm text-sm text-ink-soft">{subtitle}</p>}
      {action && (to || onAction) && (
        <motion.div {...tekan} className="mt-5 inline-block">
          {to ? (
            <Link to={to} className="btn-primary px-5 py-2.5">{action}</Link>
          ) : (
            <button type="button" onClick={onAction} className="btn-primary px-5 py-2.5">
              {action}
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}

/**
 * Kartu yang terangkat saat disentuh kursor.
 *
 * LAPIS SEKUNDER: bayangan bukan bagian dari kartu, melainkan elemen terpisah
 * yang menyusul 50ms setelah kartu naik lalu melebar — sesuai kaidah
 * "lifts up → shadow drops and softens". Tanpa ini, hover terasa datar.
 *
 * Sengaja TIDAK menulis prop `initial`/`animate`: labelnya diwarisi dari
 * kontainer stagger di halaman, sehingga kartu ikut masuk berurutan. Bila
 * dipakai di luar kontainer stagger, kartu tampil apa adanya (tidak tersembunyi).
 */
export function HoverCard({ className = '', children, ...rest }) {
  return (
    <motion.div
      variants={kartuMasuk}
      whileHover="hover"
      className="relative"
      {...rest}
    >
      <motion.span
        aria-hidden
        variants={bayangan}
        className="pointer-events-none absolute inset-x-3 -bottom-1 -z-10 h-8 rounded-full bg-navy/12 opacity-0 blur-xl"
      />
      <motion.div variants={angkatKartu} className={className}>
        {children}
      </motion.div>
    </motion.div>
  )
}

/**
 * Pembungkus tekan Premium: hover +2%, tekan 98% + opasitas 90%,
 * lepas kembali ke 100% tanpa overshoot.
 */
export function Tekan({ children, className = '', ...rest }) {
  return (
    <motion.div className={className} {...tekan} {...rest}>
      {children}
    </motion.div>
  )
}

/** Pesan galat tepat di bawah kolomnya; `id` dirujuk aria-describedby kolom itu. */
export function GalatKolom({ id, pesan }) {
  if (!pesan) return null
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-danger">
      {pesan}
    </p>
  )
}

/**
 * Foto yang menutupi wadahnya. Wadahnya tetap memakai gradien, jadi kampanye
 * baru tanpa foto (atau foto yang gagal dimuat) tidak berubah jadi kotak putih.
 * Wadah wajib `relative overflow-hidden`.
 */
export function IsiFoto({ src, alt = '' }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={(e) => (e.currentTarget.style.display = 'none')}
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}

/** Avatar kreator: ilustrasi bila ada, gradien bila belum. */
export function AvatarKreator({ c, className = 'h-10 w-10 rounded-full' }) {
  const id = c?.kreatorId || c?.id
  return (
    <span
      className={`relative shrink-0 overflow-hidden bg-gradient-to-br ${gradasi({ id, gradasi: c?.gradasi })} ${className}`}
    >
      <IsiFoto src={c?.foto} alt={c?.nama ? `Avatar ${c.nama}` : ''} />
    </span>
  )
}
