import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { useSesi } from '../sesi.jsx'
import { api, useApi } from '../api.js'
import Reveal from '../components/Reveal.jsx'
import ShaderBackground from '../components/ShaderBackground.jsx'
import HeroKarakter from '../components/HeroKarakter.jsx'
import { AngkaNaik } from '../components/Feedback.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { HoverCard, Tekan } from '../components/ui.jsx'
import { tekan } from '../motion.js'
import { Shield, Store, Video, Chart, Doc, Users, Eye, ArrowRight, Sparkles } from '../components/icons.jsx'

const langkahUMKM = [
  { t: 'Buat Kampanye', d: 'Tentukan anggaran dan target penonton.' },
  { t: 'Pilih Kreator', d: 'Sistem merekomendasikan kreator yang cocok, lengkap dengan alasannya.' },
  { t: 'Pantau Views', d: 'Bayar sesuai hasil yang divalidasi sistem.' },
]
const langkahKreator = [
  { t: 'Cari Kampanye', d: 'Temukan merek lokal yang sesuai gayamu.' },
  { t: 'Buat Konten', d: 'Berkreasi dengan kebebasan penuh.' },
  { t: 'Terima Pendapatan', d: 'Pendapatan dihitung per view tervalidasi dan masuk dompet saat kampanye selesai.' },
]
/**
 * Label "AI" hanya untuk fitur yang benar-benar memanggil model bahasa
 * (Gemini, services/ai.js). Rekomendasi kreator, penyaring view palsu, dan
 * portofolio bekerja dengan aturan dan hitungan yang bisa dijelaskan; dulu
 * ketiganya ikut berlabel "AI", dan itu klaim yang tidak benar.
 */
const fitur = [
  { icon: Doc, ai: true, t: 'Asisten Naskah', d: 'Mengubah brief UMKM menjadi naskah video 30-45 detik: pembuka, adegan, dan ajakan penutup.' },
  { icon: Video, ai: true, t: 'Brief dari Video Referensi', d: 'Tempel video TikTok, Reels, atau Shorts yang gayanya Anda suka. AI menyusun brief dan kalimat hook pembuka.' },
  { icon: Shield, ai: true, t: 'Pemeriksaan Etika Konten', d: 'Kampanye, video, profil, dan ulasan diperiksa supaya LokalBoost tidak dipakai menjelekkan usaha lain.' },
  { icon: Users, ai: false, t: 'Rekomendasi Kreator', d: 'Skor kecocokan dari lokasi, niche, rating, dan rekam jejak, lengkap dengan alasan tiap skor.' },
  { icon: Eye, ai: false, t: 'Penyaring View Palsu', d: 'Aturan dan deteksi lonjakan trafik menyaring bot dan spam, jadi Anda hanya membayar penonton asli.' },
  { icon: Sparkles, ai: false, t: 'Portofolio Otomatis', d: 'Portofolio kreator dirakit dari kampanye yang selesai, dan asal-usul tiap angka ditandai apa adanya.' },
  { icon: Chart, ai: false, t: 'Dasbor Laporan Hasil', d: 'Pantau jumlah views, sebaran lokasi penonton, dan progres kampanye.' },
]
/**
 * Angka di halaman depan dihitung dari basis data lewat
 * GET /api/dashboard/statistik-publik. Sebelumnya keempatnya adalah target
 * enam bulan dari PRD §3.2 yang ditulis seolah sudah tercapai — angka
 * pemasaran yang tidak bisa dipertanggungjawabkan di depan juri.
 */
function angkaDari(s) {
  return [
    { nilai: s?.umkmTerdaftar ?? 0, l: 'UMKM terdaftar' },
    { nilai: s?.kreatorTerdaftar ?? 0, l: 'Kreator pemula' },
    { nilai: s?.kampanyeSelesai ?? 0, l: 'Kampanye selesai' },
    { nilai: s?.totalTayanganAsli ?? 0, l: 'Tayangan asli terverifikasi' },
  ]
}

function DaftarLangkah({ items }) {
  return (
    <ol className="mt-5 space-y-5">
      {items.map((s, i) => (
        <li key={s.t} className="flex gap-4">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cream-300 text-xs font-bold text-navy">
            {i + 1}
          </span>
          <div>
            <p className="font-semibold text-navy">{s.t}</p>
            <p className="text-sm text-ink-soft">{s.d}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function Landing() {
  const { sudahMasuk, profil } = useSesi()
  const { data: statistik } = useApi(() => api.statistikPublik(), [])
  const angka = angkaDari(statistik)

  return (
    // Tanpa `variant`: halaman depan pun mengikuti sesi, sehingga pengguna
    // yang sudah masuk tidak tiba-tiba melihat navbar tamu di sini.
    <AppShell flush>
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Latar shader menggantikan orb Ambient KHUSUS di hero halaman depan —
            dua-duanya sekaligus terlalu ramai. Halaman lain tetap memakai orb. */}
        {/* Tanpa -z-10: nilai z negatif menaruh kanvas di belakang latar
            bg-cream milik AppShell, jadi shader-nya tertutup dan tak terlihat.
            Cukup andalkan urutan DOM — konten hero di bawahnya sudah relative. */}
        <div className="pointer-events-none absolute inset-0">
          <ShaderBackground className="h-full w-full" />
          {/* Menyatukan tepi shader dengan warna cream halaman di bawahnya
              sekaligus menjaga kontras teks navy tetap aman. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cream/10 to-cream" />
        </div>

        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="shell relative grid items-center gap-6 py-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12 lg:py-16"
        >
          {/* Karakter ditulis lebih dulu di DOM supaya di layar lebar ia jatuh
              ke kolom kiri tanpa utak-atik `order`. Elemennya aria-hidden, jadi
              pembaca layar tetap mendarat langsung di judul. */}
          {/* Ukuran ponsel ditahan kecil dengan sengaja: bingkai videonya tinggi
              (rasio 0,7), jadi pada 300px ia setinggi 426px dan mendorong judul
              beserta tombol keluar dari layar pertama. */}
          <HeroKarakter className="mx-auto w-full max-w-[185px] sm:max-w-[230px] lg:max-w-none" />

          <div className="text-center lg:text-left">
          <motion.span variants={fadeUp} className="chip gap-2 border border-gold-border bg-gold px-4 py-2 text-gold-text">
            <Shield size={15} /> Bayar sesuai penonton asli
          </motion.span>

          <motion.h1
            variants={fadeUp}
            className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-navy sm:text-5xl"
          >
            Boost Usaha Lokal Lewat Video Kreatif
          </motion.h1>

          <motion.p variants={fadeUp} className="mx-auto mt-5 max-w-xl text-base text-ink-soft lg:mx-0">
            Marketplace aman yang menghubungkan UMKM dengan kreator konten pemula.
            Bayar per penonton, dana aman di Rekber.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            {sudahMasuk ? (
              /* Mengajak orang yang sudah punya akun untuk "Daftar" hanya
                 membuat bingung — antar saja ke ruang kerjanya. */
              <Tekan>
                <Link to={profil.beranda} className="btn-primary px-6 py-3">
                  Buka Dashboard Saya <ArrowRight size={18} />
                </Link>
              </Tekan>
            ) : (
              <>
                <Tekan>
                  <Link to="/daftar?peran=umkm" className="btn-primary px-6 py-3">
                    Saya UMKM <ArrowRight size={18} />
                  </Link>
                </Tekan>
                <Tekan>
                  <Link to="/daftar?peran=kreator" className="btn-outline px-6 py-3">
                    Saya Kreator
                  </Link>
                </Tekan>
              </>
            )}
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mx-auto mt-10 flex max-w-md items-center gap-3 rounded-xl border border-gold-border bg-gold px-5 py-4 text-left lg:mx-0"
          >
            <Shield size={22} className="shrink-0 text-navy" />
            <div>
              <p className="font-semibold text-navy">Dana Aman di Rekber</p>
              <p className="text-sm text-gold-text">Dana Anda baru dicairkan setelah views tervalidasi.</p>
            </div>
          </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ANGKA — menghitung naik saat masuk layar. Akun contoh tidak dihitung,
          jadi selama belum ada pengguna sungguhan semuanya nol; deretan nol
          tidak memberi informasi apa pun, maka disembunyikan. */}
      {angka.some((a) => a.nilai > 0) && (
      <Reveal className="shell">
        <div className="grid gap-4 rounded-2xl border border-black/5 bg-white p-8 shadow-card sm:grid-cols-4">
          {angka.map((a) => (
            <div key={a.l} className="text-center">
              <p className="text-2xl font-extrabold text-navy sm:text-3xl">
                <AngkaNaik nilai={a.nilai} />
              </p>
              <p className="mt-1 text-sm text-ink-soft">{a.l}</p>
            </div>
          ))}
        </div>
      </Reveal>
      )}

      {/* CARA KERJA */}
      <section id="cara-kerja" className="shell scroll-mt-24 py-16">
        <Reveal>
          <h2 className="text-center text-2xl font-bold text-navy sm:text-3xl">Cara Kerja Sederhana</h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Reveal delay={0.05} className="card p-7">
            <div className="flex items-center gap-2.5 text-navy">
              <Store size={22} />
              <h3 className="text-lg font-bold">Untuk UMKM</h3>
            </div>
            <DaftarLangkah items={langkahUMKM} />
          </Reveal>
          <Reveal delay={0.12} className="card p-7">
            <div className="flex items-center gap-2.5 text-navy">
              <Video size={22} />
              <h3 className="text-lg font-bold">Untuk Kreator</h3>
            </div>
            <DaftarLangkah items={langkahKreator} />
          </Reveal>
        </div>
      </section>

      {/* FITUR AI */}
      <section id="fitur" className="shell scroll-mt-24 py-16">
        <Reveal>
          <h2 className="text-center text-2xl font-bold text-navy sm:text-3xl">Fitur LokalBoost</h2>
        </Reveal>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, amount: 0.1 }}
          className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {fitur.map(({ icon: Icon, t, d, ai }) => (
            <HoverCard key={t} className="card relative h-full p-8 text-center">
              <span
                className={`chip absolute right-4 top-4 text-[10px] uppercase tracking-wide ${
                  ai ? 'border border-gold-border bg-gold text-gold-text' : 'bg-cream-200 text-ink-soft'
                }`}
              >
                {ai ? 'AI' : 'Otomatis'}
              </span>
              {/* Ikon ikut membesar sedikit saat kartu diangkat — lapis sekunder */}
              <motion.span
                variants={{ animate: { scale: 1 }, hover: { scale: 1.08 } }}
                transition={{ duration: 0.09 }}
                className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-cream-300 text-navy"
              >
                <Icon size={22} />
              </motion.span>
              <h3 className="mt-4 text-lg font-bold text-navy">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d}</p>
            </HoverCard>
          ))}
        </motion.div>
      </section>

      {/* CTA PENUTUP */}
      <section className="shell py-16">
        <Reveal className="relative overflow-hidden rounded-2xl bg-navy px-8 py-12 text-center text-white">
          {/* Ambient: cahaya emas bernapas pelan di sudut */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/20 blur-3xl"
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 6, repeat: Infinity, ease: [0.37, 0, 0.63, 1] }}
          />
          <h2 className="relative text-2xl font-extrabold sm:text-3xl">Siap mulai promosi?</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-white/75">
            Daftar gratis. Dana kampanye ditahan di Rekber dan hanya terpakai untuk penonton asli;
            sisanya kembali ke Anda.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <motion.div {...tekan}>
              <Link to="/daftar" className="btn bg-white px-6 py-3 text-navy hover:bg-cream-200">
                Daftar Sekarang <ArrowRight size={18} />
              </Link>
            </motion.div>
            <motion.div {...tekan}>
              <Link to="/marketplace" className="btn border border-white/30 px-6 py-3 text-white hover:bg-white/10">
                Lihat Marketplace
              </Link>
            </motion.div>
          </div>
        </Reveal>
      </section>
    </AppShell>
  )
}
