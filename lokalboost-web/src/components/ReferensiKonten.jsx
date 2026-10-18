import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '../api.js'
import { ribuan } from '../format.js'
import { EASE } from '../motion.js'
import { Close, Play, Plus, Sparkles } from './icons.jsx'

/**
 * Langkah 1 wizard kampanye: UMKM menempel 1-3 tautan video TikTok,
 * Instagram, atau YouTube yang gayanya ingin ditiru, lalu server membaca
 * isinya dan menyusun draf brief (POST /api/ai/brief-referensi).
 *
 * Brief yang dihasilkan masuk ke kolom "Poin yang Wajib Muncul" milik
 * halaman induk, jadi tetap bisa disunting sebelum kampanye dibayar. Kalau
 * kolom itu sudah berisi, hasilnya ditawarkan dulu (ganti atau tambahkan),
 * tidak menimpa tulisan pemilik usaha diam-diam.
 *
 * Pola tautan di sini sengaja longgar dan hanya untuk pesan cepat; yang
 * menentukan sah atau tidak tetap server (services/referensi-konten.js).
 */

export const MAKS_REFERENSI = 3

const NAMA_PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

function tebakPlatform(url) {
  const t = url.toLowerCase()
  if (/(^|\/\/|\.)((vt|vm)\.)?tiktok\.com\//.test(t)) {
    return /\/@[^/]+\/(video|photo)\/\d+|(vt|vm)\.tiktok\.com\/\w+/.test(t) ? 'tiktok' : 'profil'
  }
  if (/instagram\.com\//.test(t)) return /instagram\.com\/(p|reels?|tv)\/[\w-]+/.test(t) ? 'instagram' : 'profil'
  if (/youtu\.be\/[\w-]{11}|youtube\.com\/(watch\?.*v=|shorts\/|live\/)[\w-]{11}/.test(t)) return 'youtube'
  if (/youtube\.com\//.test(t)) return 'profil'
  return null
}

export default function ReferensiKonten({ draf, ubah }) {
  const [masukan, setMasukan] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [usulan, setUsulan] = useState(null) // brief yang menunggu keputusan ganti/tambah
  const [info, setInfo] = useState('')

  const daftar = draf.referensi || []

  const tambah = () => {
    const url = masukan.trim()
    if (!url) return
    const platform = tebakPlatform(url)
    if (platform === 'profil') {
      setGalat('Itu tautan profil. Tempel tautan satu video atau postingan (tombol Bagikan > Salin tautan).')
      return
    }
    if (!platform) {
      setGalat('Tautan harus dari TikTok, Instagram, atau YouTube.')
      return
    }
    if (daftar.length >= MAKS_REFERENSI) {
      setGalat(`Maksimal ${MAKS_REFERENSI} referensi.`)
      return
    }
    if (daftar.some((r) => r.url === url)) {
      setGalat('Tautan ini sudah ditambahkan.')
      return
    }
    setGalat('')
    setMasukan('')
    ubah({ referensi: [...daftar, { url, platform }] })
  }

  const hapus = (url) => ubah({ referensi: daftar.filter((r) => r.url !== url) })

  const susunBrief = (brief) =>
    [brief.gaya && `Gaya video: ${brief.gaya}`, ...brief.poin].filter(Boolean).join('\n')

  const buatBrief = async () => {
    setGalat('')
    setInfo('')
    setUsulan(null)
    setSibuk(true)
    try {
      const hasil = await api.briefReferensi({
        tautan: daftar.map((r) => r.url),
        nama: draf.nama,
        kategori: draf.kategori,
        lokasi: draf.lokasi,
        deskripsi: draf.deskripsi,
      })
      // Server mengembalikan url kanonik + judul; itulah yang disimpan.
      const teks = susunBrief(hasil.brief)
      // Referensi yang menyerang pihak lain dibuang: tidak ikut disimpan dan
      // tidak ikut dipakai menyusun brief.
      const layak = hasil.referensi.filter((r) => !r.ditolakEtika)
      const dibuang = hasil.referensi.length - layak.length
      ubah({ referensi: layak })
      const catatanBuang = dibuang
        ? ` ${dibuang} video referensi dibuang karena menyerang atau menjelekkan pihak lain.`
        : ''
      if (draf.brief.trim()) {
        setUsulan({ teks, sumber: hasil.brief.sumber })
        if (catatanBuang) setInfo(catatanBuang.trim())
      } else {
        ubah({ referensi: layak, brief: teks })
        setInfo(`Brief sudah diisi di bawah. Silakan ubah, hapus, atau tambah poinnya sesuai kebutuhan.${catatanBuang}`)
      }
    } catch (e) {
      // 422 dari gerbang etika: semua referensi menyerang pihak lain.
      if (e.rincian?.referensi) ubah({ referensi: [] })
      setGalat(e.message || 'Referensi gagal dibaca. Coba lagi sebentar lagi.')
    } finally {
      setSibuk(false)
    }
  }

  const terapkan = (cara) => {
    const baru = cara === 'ganti' ? usulan.teks : `${draf.brief.trimEnd()}\n${usulan.teks}`
    ubah({ brief: baru })
    setUsulan(null)
    setInfo('Brief diperbarui. Silakan sesuaikan lagi di bawah.')
  }

  return (
    <div>
      <label className="label" htmlFor="referensi">
        Referensi Konten <span className="font-normal text-ink-soft">(opsional)</span>
      </label>
      <p className="field-help -mt-1 mb-2">
        Tempel tautan video TikTok, Instagram, atau YouTube yang gayanya ingin Anda tiru. AI akan menyusun brief
        dari sana, dan kreator bisa melihat videonya.
      </p>

      <div className="flex gap-2">
        <input
          id="referensi"
          type="url"
          inputMode="url"
          value={masukan}
          onChange={(e) => setMasukan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              tambah()
            }
          }}
          placeholder="https://www.tiktok.com/@akun/video/..."
          className="input min-w-0 flex-1"
          disabled={daftar.length >= MAKS_REFERENSI}
        />
        <button
          type="button"
          onClick={tambah}
          className="btn-outline shrink-0 px-4"
          disabled={!masukan.trim() || daftar.length >= MAKS_REFERENSI}
        >
          <Plus size={16} /> Tambah
        </button>
      </div>

      {daftar.length > 0 && (
        <ul className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {daftar.map((r) => (
              <motion.li
                key={r.url}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: EASE.entrance }}
                className="flex items-start gap-3 rounded-xl bg-cream-100 px-3 py-2.5"
              >
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-navy text-white">
                  <Play size={14} />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-ink">
                    {NAMA_PLATFORM[r.platform] || 'Video'}
                    {r.penulis && <span className="font-normal text-ink-soft"> · {r.penulis}</span>}
                    {r.views != null && (
                      <span className="font-normal text-ink-soft"> · {ribuan(r.views)} tayangan</span>
                    )}
                  </p>
                  {r.judul ? (
                    <p className="line-clamp-2 text-ink-soft">{r.judul}</p>
                  ) : (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-ink-soft underline"
                    >
                      {r.url}
                    </a>
                  )}
                  {r.catatan && <p className="mt-1 text-xs text-warning">{r.catatan}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => hapus(r.url)}
                  className="shrink-0 rounded-md p-1 text-ink-soft hover:bg-cream-200"
                  aria-label="Hapus referensi"
                >
                  <Close size={16} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {daftar.length > 0 && (
        <button
          type="button"
          onClick={buatBrief}
          disabled={sibuk}
          className="btn-primary mt-3 w-full py-3"
        >
          <Sparkles size={16} />
          {sibuk ? 'Membaca video referensi...' : 'Buat Brief dari Referensi'}
        </button>
      )}

      {galat && (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      {info && <p className="mt-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{info}</p>}

      {usulan && (
        <div className="mt-3 rounded-xl border border-navy/20 bg-white p-4">
          <p className="text-sm font-semibold text-ink">
            Usulan brief dari referensi{usulan.sumber === 'template' ? ' (template)' : ''}
          </p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-soft">{usulan.teks}</pre>
          <p className="mt-2 text-xs text-ink-soft">Kolom brief Anda sudah berisi. Mau diapakan?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary px-4 py-2" onClick={() => terapkan('ganti')}>
              Ganti brief
            </button>
            <button type="button" className="btn-outline px-4 py-2" onClick={() => terapkan('tambah')}>
              Tambahkan di bawahnya
            </button>
            <button type="button" className="btn-ghost px-4 py-2" onClick={() => setUsulan(null)}>
              Abaikan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
