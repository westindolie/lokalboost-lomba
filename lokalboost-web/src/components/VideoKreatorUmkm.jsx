import { useState } from 'react'
import { api, useApi } from '../api.js'
import { MemuatBlok } from './Muat.jsx'
import { StatusChip } from './ui.jsx'
import { ribuan } from '../format.js'
import { Video, Shield, Check, Sparkles } from './icons.jsx'

const KECOCOKAN = {
  cocok: { label: 'Sesuai kampanye', tone: 'success' },
  tinjau: { label: 'Perlu Anda tinjau', tone: 'warning' },
  tidak_cocok: { label: 'Tidak sesuai', tone: 'danger' },
}
const PLATFORM = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

/**
 * Video dari kreator untuk pemilik kampanye. Video yang ditahan otomatis
 * karena dianggap menjelekkan usaha lain bisa disetujui pemiliknya setelah
 * menontonnya sendiri; sejak itu tayangannya dihitung dan kreator dibayar
 * lewat Rekber. Putusan admin mengikat dan tidak bisa dibatalkan di sini.
 */
export default function VideoKreatorUmkm({ kampanyeId }) {
  const daftar = useApi(() => api.video({ kampanyeId }), [kampanyeId])
  const [alasan, setAlasan] = useState({})
  const [buka, setBuka] = useState(null)
  const [sibuk, setSibuk] = useState(null)
  const [galat, setGalat] = useState('')

  const setujui = async (id) => {
    setGalat('')
    setSibuk(id)
    try {
      await api.setujuiVideo(id, alasan[id] || '')
      setBuka(null)
      daftar.muatUlang()
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(null)
    }
  }

  // Keputusan atas video tautan yang AI ragukan (atau nilai tidak sesuai).
  const [catatan, setCatatan] = useState({})
  const putuskan = async (id, setujui) => {
    setGalat('')
    setSibuk(id)
    try {
      await api.putuskanKecocokanVideo(id, setujui, catatan[id]?.trim() || undefined)
      daftar.muatUlang()
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(null)
    }
  }

  const videos = daftar.data?.video || []
  if (!daftar.memuat && videos.length === 0) return null

  return (
    <div className="card p-7">
      <h2 className="flex items-center gap-2 section-title">
        <Video size={20} /> Video dari Kreator
      </h2>
      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {galat}
        </p>
      )}
      {daftar.memuat ? (
        <div className="mt-5"><MemuatBlok tinggi="h-24" jumlah={1} /></div>
      ) : (
        <div className="mt-5 space-y-4">
          {videos.map((v) => {
            const putusAdmin = v.etika?.keputusanAdmin
            const ditahanOtomatis = v.moderasi === 'revisi' && v.etika?.status === 'ditolak' && !putusAdmin
            const tautan = v.sumber === 'tautan'
            const cocok = tautan ? KECOCOKAN[v.kecocokan] : null
            const perluKeputusan = tautan && v.moderasi !== 'revisi' && ['tinjau', 'tidak_cocok'].includes(v.kecocokan) && !v.kecocokanHasil?.keputusanUmkm
            return (
              <div key={v.id} className="min-w-0 rounded-xl bg-cream-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-navy">{v.judul}</p>
                    <p className="text-xs text-ink-muted">
                      {v.kreator || 'Kreator'}
                      {tautan && <> · {PLATFORM[v.platform] || v.platform}{v.akunPenulis && <> @{v.akunPenulis}</>}</>}
                    </p>
                  </div>
                  {cocok && v.moderasi !== 'revisi' ? (
                    <StatusChip status={cocok.label} tone={cocok.tone} />
                  ) : ditahanOtomatis ? (
                    <StatusChip status="Ditahan otomatis" tone="warning" />
                  ) : v.moderasi === 'revisi' ? (
                    <StatusChip status="Revisi dari admin" tone="danger" />
                  ) : v.moderasi === 'lolos' ? (
                    <StatusChip status="Tayang" tone="success" />
                  ) : (
                    <StatusChip status="Menunggu tinjauan" tone="info" />
                  )}
                </div>

                {v.berkas && (
                  <video src={v.berkas} controls preload="metadata" className="mt-3 max-h-80 w-full rounded-lg bg-black" />
                )}

                {tautan && (
                  <div className="mt-3 space-y-3">
                    <a href={v.url} target="_blank" rel="noreferrer noopener" className="inline-flex text-xs font-semibold text-navy underline">
                      Tonton di {PLATFORM[v.platform] || 'platform'}
                    </a>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        ['Saat disetor', v.viewsAwal],
                        ['Dihitung', v.viewsDiakui],
                        ['Ditahan', v.viewsTertahan],
                      ].map(([l, n]) => (
                        <div key={l} className="rounded-lg bg-white px-2 py-2">
                          <p className="text-[11px] text-ink-muted">{l}</p>
                          <p className="text-sm font-bold text-navy">{n == null ? '–' : ribuan(n)}</p>
                        </div>
                      ))}
                    </div>
                    {v.kecocokanHasil?.alasan && (
                      <p className="flex gap-1.5 text-xs text-ink-soft">
                        <Sparkles size={13} className="mt-0.5 shrink-0" />
                        <span>
                          {v.kecocokanHasil.alasan}
                          {v.kecocokanHasil.catatanAkun && <> {v.kecocokanHasil.catatanAkun}</>}
                        </span>
                      </p>
                    )}
                    {perluKeputusan && (
                      <div className="rounded-lg border border-warning-border bg-warning-soft px-3 py-3 text-xs text-ink-soft">
                        <p className="font-semibold text-warning">Tonton videonya, lalu putuskan apakah sesuai kampanye.</p>
                        <p className="mt-1">Selama belum disetujui, views video ini tidak dihitung untuk reward.</p>
                        <textarea
                          rows={2}
                          maxLength={300}
                          value={catatan[v.id] || ''}
                          onChange={(e) => setCatatan((c) => ({ ...c, [v.id]: e.target.value }))}
                          className="input mt-2 text-xs"
                          placeholder="Catatan untuk kreator (wajib bila tidak sesuai)"
                          aria-label={`Catatan untuk ${v.judul}`}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" onClick={() => putuskan(v.id, true)} disabled={sibuk === v.id} className="btn-primary px-4 py-2 text-xs disabled:opacity-60">
                            <Check size={14} /> Sesuai, hitung views-nya
                          </button>
                          <button
                            type="button"
                            onClick={() => putuskan(v.id, false)}
                            disabled={sibuk === v.id || (catatan[v.id] || '').trim().length < 5}
                            className="btn-outline px-4 py-2 text-xs disabled:opacity-60"
                          >
                            Tidak sesuai
                          </button>
                        </div>
                      </div>
                    )}
                    {v.kecocokanHasil?.keputusanUmkm && (
                      <p className="text-xs text-ink-muted">
                        Anda menilai video ini {v.kecocokanHasil.keputusanUmkm.setujui ? 'sesuai' : 'tidak sesuai'}
                        {v.kecocokanHasil.keputusanUmkm.alasan && <>: {v.kecocokanHasil.keputusanUmkm.alasan}</>}.
                      </p>
                    )}
                  </div>
                )}

                {ditahanOtomatis && (
                  <div className="mt-3 rounded-lg border border-warning-border bg-warning-soft px-3 py-3 text-xs text-ink-soft">
                    <p className="flex items-center gap-1.5 font-semibold text-warning">
                      <Shield size={14} /> Sistem menduga video ini menjelekkan usaha lain
                    </p>
                    <p className="mt-1">{v.etika.alasan}</p>
                    {v.etika.temuan?.slice(0, 3).map((f, i) => (
                      <p key={i} className="mt-1 break-words italic">“{f.kutipan}” ({f.asal})</p>
                    ))}
                    <p className="mt-2">
                      Selama ditahan, tayangan tidak dihitung dan kreator tidak dibayar. Tonton videonya. Kalau
                      menurut Anda tidak menjelekkan siapa pun, Anda bisa menyetujuinya.
                    </p>

                    {buka === v.id ? (
                      <div className="mt-3">
                        <label htmlFor={`alasan-${v.id}`} className="font-semibold text-navy">
                          Kenapa video ini aman? (dicatat)
                        </label>
                        <textarea
                          id={`alasan-${v.id}`}
                          rows={2}
                          maxLength={500}
                          value={alasan[v.id] || ''}
                          onChange={(e) => setAlasan((a) => ({ ...a, [v.id]: e.target.value }))}
                          className="input mt-1 text-xs"
                          placeholder="Contoh: Sudah saya tonton, kedai sebelah yang disebut itu cabang kami sendiri."
                        />
                        <p className="mt-1 text-ink-muted">
                          Dengan menyetujui, Anda ikut bertanggung jawab atas isi video. Admin tetap bisa menurunkannya
                          bila ada laporan.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={sibuk === v.id || (alasan[v.id] || '').trim().length < 10}
                            onClick={() => setujui(v.id)}
                            className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
                          >
                            <Check size={14} /> {sibuk === v.id ? 'Menyimpan…' : 'Setujui & Bayar Kreator'}
                          </button>
                          <button type="button" onClick={() => setBuka(null)} className="btn-outline px-4 py-2 text-xs">
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setBuka(v.id)} className="btn-outline mt-3 px-4 py-2 text-xs">
                        Saya sudah menonton, video ini aman
                      </button>
                    )}
                  </div>
                )}

                {putusAdmin && v.moderasi === 'revisi' && (
                  <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-ink-soft">
                    Diputus admin LokalBoost: {putusAdmin.catatan}
                  </p>
                )}
                {v.etika?.keputusanUmkm && (
                  <p className="mt-3 text-xs text-ink-muted">Anda menyetujui video ini: {v.etika.keputusanUmkm.alasan}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
