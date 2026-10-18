import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { Shield, Check, Clock, Info } from './icons.jsx'

/**
 * Hasil pemeriksaan "apakah kampanye ini menjelekkan usaha lain" sebelum
 * dibayar (backend: services/moderasi-kampanye.js).
 *
 * Penolakan selalu memperlihatkan kalimat yang bermasalah dan cara
 * menulis ulangnya. Tanpa itu UMKM hanya melihat "ditolak" lalu menebak.
 */
const TAMPILAN = {
  lolos: {
    judul: 'Lolos pemeriksaan etika',
    kotak: 'border-success-border bg-success-soft',
    teks: 'text-success',
    Ikon: Check,
  },
  tinjau: {
    judul: 'Sedang ditinjau tim LokalBoost',
    kotak: 'border-warning-border bg-warning-soft',
    teks: 'text-warning',
    Ikon: Clock,
  },
  ditolak: {
    judul: 'Kampanye menjelekkan usaha lain',
    kotak: 'border-danger-border bg-danger-soft',
    teks: 'text-danger',
    Ikon: Shield,
  },
}

export default function PemeriksaanEtika({ kampanyeId, moderasi, onBerubah, tautanUbah = '/umkm/kampanye/baru' }) {
  const [alasan, setAlasan] = useState('')
  const [bukaBanding, setBukaBanding] = useState(false)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  if (!moderasi || moderasi.status === 'belum') return null
  const t = TAMPILAN[moderasi.status] || TAMPILAN.ditolak
  // Banding butuh kampanye tersimpan; pemeriksaan saat mengisi (langkah 1) belum punya id.
  const bolehBanding = Boolean(kampanyeId) && moderasi.status === 'ditolak' && !moderasi.keputusanAdmin

  const kirimBanding = async () => {
    setGalat('')
    setSibuk(true)
    try {
      const hasil = await api.bandingKampanye(kampanyeId, alasan)
      setBukaBanding(false)
      onBerubah?.(hasil.moderasi)
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
    }
  }

  return (
    <div role="status" className={`mt-4 rounded-xl border px-4 py-4 text-sm ${t.kotak}`}>
      <p className={`flex items-center gap-2 font-semibold ${t.teks}`}>
        <t.Ikon size={16} /> {t.judul}
      </p>
      <p className="mt-1.5 text-ink-soft">{moderasi.alasan}</p>

      {moderasi.temuan?.length > 0 && moderasi.status !== 'lolos' && (
        <ul className="mt-3 space-y-2">
          {moderasi.temuan.map((f, i) => (
            <li key={i} className="rounded-lg bg-white/70 px-3 py-2">
              <span className="block break-words italic text-ink">“{f.kutipan}”</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {f.asal} · {f.jenis}
              </span>
            </li>
          ))}
        </ul>
      )}

      {moderasi.saran && moderasi.status !== 'lolos' && (
        <p className="mt-3 flex gap-2 text-ink-soft">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            <b className="text-navy">Saran:</b> {moderasi.saran}
          </span>
        </p>
      )}

      {moderasi.banding && moderasi.status === 'tinjau' && (
        <p className="mt-3 text-xs text-ink-muted">Banding Anda: {moderasi.banding}</p>
      )}

      {moderasi.status === 'ditolak' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={tautanUbah} className="btn-primary px-4 py-2 text-xs">
            Ubah Isi Kampanye
          </Link>
          {bolehBanding && !bukaBanding && (
            <button type="button" onClick={() => setBukaBanding(true)} className="btn-outline px-4 py-2 text-xs">
              Ajukan Banding
            </button>
          )}
        </div>
      )}

      {bukaBanding && (
        <div className="mt-3">
          <label htmlFor="alasan-banding" className="text-xs font-semibold text-navy">
            Kenapa menurut Anda kampanye ini tidak menjelekkan usaha lain?
          </label>
          <textarea
            id="alasan-banding"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            rows={3}
            maxLength={500}
            className="input mt-1 text-xs"
            placeholder="Contoh: 'warung sebelah' yang saya maksud adalah cabang kami sendiri."
          />
          {galat && <p className="mt-1 text-xs text-danger">{galat}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={kirimBanding}
              disabled={sibuk || alasan.trim().length < 10}
              className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
            >
              {sibuk ? 'Mengirim…' : 'Kirim ke Admin'}
            </button>
            <button type="button" onClick={() => setBukaBanding(false)} className="btn-outline px-4 py-2 text-xs">
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
