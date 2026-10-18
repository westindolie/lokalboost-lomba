import { Link } from 'react-router-dom'
import Brand from './Brand.jsx'

const kolom = [
  {
    judul: 'Platform',
    tautan: [
      { label: 'Marketplace', to: '/marketplace' },
      { label: 'Cara Kerja', to: '/#cara-kerja' },
      { label: 'Fitur', to: '/#fitur' },
    ],
  },
  {
    judul: 'Untuk UMKM',
    tautan: [
      { label: 'Buat Kampanye', to: '/umkm/kampanye/baru' },
      { label: 'Dashboard UMKM', to: '/umkm' },
      // Laporan selalu milik sebuah kampanye tertentu, dan footer tidak tahu
      // kampanye siapa yang sedang membaca — jadi slot ini diisi alat kerja
      // yang berlaku untuk semua UMKM.
      { label: 'Cari Kreator', to: '/marketplace' },
      { label: 'Riwayat Dana', to: '/umkm/dana' },
    ],
  },
  {
    judul: 'Untuk Kreator',
    tautan: [
      { label: 'Dashboard Kreator', to: '/kreator' },
      { label: 'Setor Video', to: '/kreator/video' },
      { label: 'Portofolio Otomatis', to: '/kreator/portofolio' },
      { label: 'Dompet & Penarikan', to: '/kreator/dompet' },
    ],
  },
  {
    judul: 'Bantuan',
    tautan: [
      // Nama yang sama dengan menu akun dan sidebar.
      { label: 'Pusat Sengketa', to: '/dispute' },
      { label: 'Notifikasi', to: '/notifikasi' },
      { label: 'Admin Platform', to: '/admin' },
      { label: 'Masuk', to: '/masuk' },
    ],
  },
]

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-black/5 bg-cream-200">
      <div className="shell grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Brand />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
            Menghubungkan UMKM lokal dengan kreator pemula. Bayar sesuai penonton asli,
            dana aman di Rekber.
          </p>
        </div>

        {kolom.map((k) => (
          <nav key={k.judul}>
            <p className="text-xs font-bold uppercase tracking-wide text-navy">{k.judul}</p>
            <ul className="mt-3 space-y-2">
              {k.tautan.map((t) => (
                <li key={t.label}>
                  <Link to={t.to} className="text-sm text-ink-soft transition-colors hover:text-navy">
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="shell flex flex-col gap-2 border-t border-black/5 py-5 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 LokalBoost. Asisten Profesional UMKM &amp; Kreator.</p>
        <p>Prototype lomba — seluruh angka dihitung langsung oleh API LokalBoost.</p>
      </div>
      <div className="h-1.5 w-full bg-skyfoot" />
    </footer>
  )
}
