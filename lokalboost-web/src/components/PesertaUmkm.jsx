import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, useApi } from '../api.js'
import { MemuatBlok } from './Muat.jsx'
import { StatusChip } from './ui.jsx'
import { rupiah, ribuan, tanggal } from '../format.js'
import { Users } from './icons.jsx'

/**
 * Kreator yang bergabung di kampanye (pemilik usaha). Satu kampanye boleh
 * diikuti banyak kreator sampai anggarannya habis, jadi pemilik usaha perlu
 * melihat views dan reward tiap kreator, dan mengirim produk yang diklaim.
 */
const NADA = {
  belum_ambang: 'info',
  menunggu_verifikasi: 'warning',
  memenuhi_syarat: 'success',
  dicairkan: 'success',
  anggaran_habis: 'warning',
  cair_saat_selesai: 'info',
  hangus: 'danger',
  klaim_diproses: 'warning',
  produk_dikirim: 'info',
  produk_diterima: 'success',
  memenuhi_syarat_produk: 'success',
  kuota_habis: 'warning',
  tidak_diklaim: 'info',
}

export default function PesertaUmkm({ kampanyeId }) {
  const data = useApi(() => api.pesertaKampanye(kampanyeId), [kampanyeId])
  const [resi, setResi] = useState({})
  const [sibuk, setSibuk] = useState(null)
  const [galat, setGalat] = useState('')

  const kirim = async (klaimId) => {
    setSibuk(klaimId)
    setGalat('')
    try {
      await api.kirimProdukKlaim(kampanyeId, klaimId, resi[klaimId]?.trim() || undefined)
      data.muatUlang()
    } catch (e) {
      setGalat(e.message)
    } finally {
      setSibuk(null)
    }
  }

  const peserta = data.data?.peserta || []
  const klaim = data.data?.klaim || []
  const sisa = data.data?.sisa

  return (
    <div className="card p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 section-title">
          <Users size={20} /> Kreator di Kampanye Ini
        </h2>
        {sisa && (
          <p className="text-xs text-ink-soft">
            {sisa.menerima ? 'Masih menerima kreator' : 'Tidak menerima kreator baru'}
            {sisa.sisaDana > 0 && <> · sisa dana {rupiah(sisa.sisaDana)}</>}
            {sisa.sisaKuota > 0 && <> · sisa produk {ribuan(sisa.sisaKuota)}</>}
          </p>
        )}
      </div>

      {data.memuat ? (
        <div className="mt-5"><MemuatBlok tinggi="h-14" jumlah={2} /></div>
      ) : !peserta.length ? (
        <p className="mt-5 rounded-xl bg-cream-100 px-4 py-5 text-center text-sm text-ink-soft">
          Belum ada kreator yang bergabung.{' '}
          <Link to={`/umkm/kampanye/${kampanyeId}/kreator`} className="font-semibold text-navy underline">
            Pilih kreator
          </Link>
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs text-ink-muted">
                <th className="py-2 pr-3 font-medium">Kreator</th>
                <th className="py-2 pr-3 text-right font-medium">Views tervalidasi</th>
                <th className="py-2 pr-3 text-right font-medium">Reward terpakai</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {peserta.map((p) => (
                <tr key={p.kreatorId} className="border-b border-black/5 last:border-0">
                  <td className="py-3 pr-3">
                    <Link to={`/kreator/profil/${p.kreatorId}`} className="font-semibold text-navy hover:underline">
                      {p.nama}
                    </Link>
                  </td>
                  <td className="py-3 pr-3 text-right font-semibold text-navy">{ribuan(p.views)}</td>
                  <td className="py-3 pr-3 text-right">{rupiah(p.rewardBruto)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {p.tunai && <StatusChip status={p.tunai.label} tone={NADA[p.tunai.kode]} />}
                      {p.produk && <StatusChip status={p.produk.label} tone={NADA[p.produk.kode]} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {klaim.length > 0 && (
        <div className="mt-6 border-t border-black/5 pt-5">
          <h3 className="text-sm font-bold text-navy">Klaim Produk</h3>
          {galat && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{galat}</p>}
          <div className="mt-3 space-y-3">
            {klaim.map((c) => (
              <div key={c.id} className="rounded-xl bg-cream-100 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-navy">
                    {c.produk} untuk {c.kreator}
                  </p>
                  <StatusChip status={c.label} tone={NADA[{ diproses: 'klaim_diproses', dikirim: 'produk_dikirim', diterima: 'produk_diterima' }[c.status]]} />
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Diklaim {tanggal(c.dibuatPada)} saat {ribuan(c.viewsSaatKlaim)} views
                </p>
                <p className="mt-2 whitespace-pre-line break-words rounded-lg bg-white px-3 py-2 text-xs text-ink">{c.alamat}</p>
                {c.status === 'diproses' ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={resi[c.id] || ''}
                      onChange={(e) => setResi((r) => ({ ...r, [c.id]: e.target.value }))}
                      placeholder="Nomor resi (opsional)"
                      aria-label={`Nomor resi untuk ${c.kreator}`}
                      className="input w-48 py-2 text-xs"
                    />
                    <button type="button" onClick={() => kirim(c.id)} disabled={sibuk === c.id} className="btn-primary px-4 py-2 text-xs disabled:opacity-60">
                      {sibuk === c.id ? 'Menyimpan…' : 'Tandai sudah dikirim'}
                    </button>
                  </div>
                ) : (
                  c.resi && <p className="mt-2 text-xs text-ink-soft">Resi: {c.resi}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
