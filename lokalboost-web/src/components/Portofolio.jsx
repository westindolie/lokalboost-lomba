import { motion } from 'motion/react'
import { fadeUp } from './PageTransition.jsx'
import { Shield, Eye, Users, Sparkles, Search } from './icons.jsx'
import { KartuPenilaian } from './CekProfil.jsx'
import { ribuan, waktuLalu } from '../format.js'

/**
 * Tampilan Portofolio Otomatis.
 *
 * Dua lapis, dan keduanya harus terlihat BERBEDA asal-usulnya: lapis 1 hijau
 * bercentang perisai (dihitung LokalBoost dari kampanye sungguhan), lapis
 * terukur emas bercentang kaca pembesar (diambil dari profil publik dan
 * dibuktikan milik kreator lewat kode di bio). Menyeragamkan gayanya akan
 * membuat angka media sosial terlihat sama sahihnya dengan angka hasil hitungan
 * platform.
 *
 * Tautan karya dan statistik ketikan sendiri dihapus dari tampilan karena
 * pengikut, views, dan engagement sekarang diukur otomatis dari tautan profil.
 */

const NADA = {
  terverifikasi: {
    chip: 'bg-success/12 text-success',
    ikon: Shield,
  },
  terukur: {
    chip: 'bg-gold text-gold-text',
    ikon: Search,
  },
}

/** Lencana asal-usul data. Satu-satunya tempat label ini digambar. */
export function LencanaSumber({ sumber, label }) {
  const nada = NADA[sumber] || NADA.terukur
  const Ikon = nada.ikon
  return (
    <span className={`chip gap-1 ${nada.chip}`}>
      <Ikon size={12} /> {label}
    </span>
  )
}

const LABEL_PLATFORM = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

export default function Portofolio({ data, aksi = null }) {
  if (!data) return null
  const { terverifikasi: v, terukur: t } = data.lapis

  return (
    <motion.div variants={fadeUp} className="card p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Sparkles size={18} className="text-navy" /> Portofolio Otomatis
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Dirakit sendiri oleh LokalBoost dari dua sumber yang dibedakan asal-usulnya.
          </p>
        </div>
        {aksi}
      </div>

      {/* Ringkasan naratif. Dirakit aturan, bukan model bahasa. */}
      <p className="mt-5 rounded-xl bg-cream-100 px-5 py-4 leading-relaxed text-ink-soft">
        {data.ringkasan}
      </p>

      {/* ---------------------------------------------- Lapis 1 */}
      <div className="mt-7">
        <LencanaSumber sumber="terverifikasi" label={v.label} />
        <p className="mt-2 text-sm text-ink-soft">
          Dihitung LokalBoost dari kampanye dan tayangan yang lolos anti-fraud. Kreator tidak bisa
          mengubah angka ini.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <AngkaKecil label="Kampanye selesai" nilai={ribuan(v.kampanyeSelesai)} ikon={Shield} />
          <AngkaKecil label="Tayangan valid" nilai={ribuan(v.totalViews)} ikon={Eye} />
          <AngkaKecil label="Rata-rata / kampanye" nilai={ribuan(v.rerataViews)} ikon={Eye} />
          <AngkaKecil
            label="Penilaian UMKM"
            nilai={v.rating === null ? '—' : `${v.rating} / 5`}
            ikon={Users}
          />
        </div>

        {v.spesialisasi.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-soft">Spesialisasi:</span>
            {v.spesialisasi.map((s) => (
              <span key={s.kategori} className="chip bg-cream-100 text-ink-soft">
                {s.kategori} · {s.jumlah}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------- Lapis terukur */}
      {/* `t` bisa kosong kalau API-nya versi lama; bagian ini cukup dilewati. */}
      {t && (
        <div className="mt-8 border-t border-ink-muted/12 pt-6">
          <LencanaSumber sumber="terukur" label={t.label} />
          <p className="mt-2 text-sm text-ink-soft">{t.keterangan}</p>

          {t.profil.length === 0 ? (
            <p className="mt-4 rounded-xl bg-cream-100 px-4 py-5 text-center text-sm text-ink-soft">
              Kreator ini belum menghubungkan profil media sosialnya.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {t.profil.map((p) => (
                <div key={p.platform}>
                  <p className="mb-1 text-xs text-ink-soft">
                    {LABEL_PLATFORM[p.platform]} · diukur {waktuLalu(p.diukurPada)}
                  </p>
                  <KartuPenilaian p={p} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

function AngkaKecil({ label, nilai: n, ikon: Ikon }) {
  return (
    <div className="rounded-xl bg-cream-100 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <Ikon size={13} /> {label}
      </p>
      <p className="mt-1 text-lg font-bold text-navy">{n}</p>
    </div>
  )
}
