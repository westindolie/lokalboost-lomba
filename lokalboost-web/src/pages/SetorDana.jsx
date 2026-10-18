import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { KepalaWizard } from '../components/CampaignStepper.jsx'
import { stagger, fadeUp } from '../components/PageTransition.jsx'
import { Tekan, AIPanel } from '../components/ui.jsx'
import { AngkaNaik } from '../components/Feedback.jsx'
import { EASE, DUR } from '../motion.js'
import { rupiah, ribuan } from '../format.js'
import { api, useApi } from '../api.js'
import { useDraf } from '../draf.jsx'
import { useSesi } from '../sesi.jsx'
import { bayarDenganSnap, pesanStatus } from '../midtrans.js'
import { Shield, ArrowRight, Wallet } from '../components/icons.jsx'
import PemeriksaanEtika from '../components/PemeriksaanEtika.jsx'
import { MODEL, hitungDraf, isianReward, tarifPerViewTeks } from '../reward.js'

/**
 * Langkah 3 wizard — di sinilah kampanye benar-benar lahir.
 *
 * Dua panggilan berurutan, sesuai alur PRD §7.1 langkah 2–3:
 *   1. POST /api/kampanye          → kampanye tersimpan berstatus menunggu_dana
 *   1b. POST /api/kampanye/:id/periksa → cek isi tidak menjelekkan usaha lain;
 *       belum lolos = berhenti di sini (server juga menolak tagihannya)
 *   2a. Midtrans aktif: tagihan Snap → popup → server cek status ke Midtrans
 *       → escrow terisi hanya bila lunas
 *   2b. Midtrans mati: POST /api/kampanye/:id/setor (simulasi, seperti dulu)
 *
 * Id kampanye yang sudah dibuat disimpan di draf. Tanpa itu, UMKM yang
 * menutup popup lalu menekan Bayar lagi menghasilkan kampanye kembar.
 *
 * Sebelum backend tersambung, tombol di halaman ini mendarat di kampanye
 * contoh yang sudah ada di berkas mock — pengguna mengisi wizard tiga langkah
 * lalu melihat kampanye milik orang lain.
 */
const flow = [
  { n: 1, label: 'Anda Bayar' },
  { n: 2, label: 'Dana Ditahan LokalBoost' },
  { n: 3, label: 'Dibayar per Views Tervalidasi' },
]
const methods = [
  { id: 'va', title: 'Transfer Virtual Account', sub: 'BCA, Mandiri, BNI, BRI' },
  { id: 'ewallet', title: 'E-Wallet & QRIS', sub: 'GoPay, OVO, Dana, LinkAja' },
]

export default function SetorDana() {
  const navigate = useNavigate()
  const { profil } = useSesi()
  const { draf, ubah, anggaran, kodeUnik, totalBayar, briefArray, reset, langkahSatuLengkap } = useDraf()
  const method = draf.metodeBayar
  // Setelah bayar, draf dikosongkan sementara halaman ini masih memudar
  // keluar. Tanpa penanda ini, penjaga di bawah ikut menyala dan membelokkan
  // pengguna ke langkah 1, bukan ke halaman pilih kreator.
  const sudahBayar = useRef(false)

  const [sibuk, setSibuk] = useState(false)
  const [tahap, setTahap] = useState('')
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [tagihanTerakhir, setTagihanTerakhir] = useState(null)
  const [moderasi, setModerasi] = useState(null)
  const [perluBiayaPasang, setPerluBiayaPasang] = useState(false)

  const { data: konfigBayar } = useApi(() => api.konfigurasiPembayaran(), [])
  const pakaiMidtrans = Boolean(konfigBayar?.aktif)

  const diterimaKreator = anggaran

  // Katalog hanya untuk menampilkan nama/nilai produk di ringkasan.
  const { data: katalogData } = useApi(() => api.produkSaya(), [])
  const h = hitungDraf(draf, katalogData?.produk || [])
  const produkSaja = h.model === 'produk'
  // Mode demo: tombol simulasi tambahan di samping Midtrans sandbox.
  const adaSimulasi = Boolean(pakaiMidtrans && konfigBayar?.modeDemo && !produkSaja)

  const selesai = (kampanyeId) => {
    sudahBayar.current = true
    reset()
    navigate(`/umkm/kampanye/${kampanyeId}/kreator`, { replace: true })
  }

  /** Simpan kampanye sekali; percobaan berikutnya memperbarui yang sama. */
  const simpanKampanye = async () => {
    const isi = {
      nama: draf.nama,
      kategori: draf.kategori,
      lokasi: draf.lokasi,
      deskripsi: draf.deskripsi || undefined,
      tenggatHari: draf.tenggatHari,
      brief: briefArray,
      referensi: (draf.referensi || []).map(({ url, judul, penulis }) => ({ url, judul, penulis })),
      // Target, model reward, tarif, anggaran, ambang views, produk (reward.js).
      ...isianReward(draf),
    }
    let kampanyeId = draf.kampanyeIdDibuat
    if (kampanyeId) {
      try {
        await api.ubahKampanye(kampanyeId, isi)
      } catch (err) {
        // sessionStorage bisa bertahan melewati deployment, sementara database
        // demo Vercel berganti. Pulihkan formulir dengan membuat ulang kampanye.
        if (err.status !== 404) throw err
        const dibuat = await api.buatKampanye(isi)
        kampanyeId = dibuat.kampanye.id
        ubah({ kampanyeIdDibuat: kampanyeId })
        setInfo('Draf kampanye lama sudah tidak ada setelah pembaruan. Kampanye dibuat ulang dari isian Anda.')
      }
    } else {
      const dibuat = await api.buatKampanye(isi)
      kampanyeId = dibuat.kampanye.id
      ubah({ kampanyeIdDibuat: kampanyeId })
    }
    if (draf.gambarProduk) {
      setTahap('Mengunggah foto produk…')
      const foto = await fetch(draf.gambarProduk).then((r) => r.blob())
      const form = new FormData()
      const ekstensi = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[foto.type] || 'webp'
      form.append('foto', foto, `produk.${ekstensi}`)
      await api.unggahGambarKampanye(kampanyeId, form)
    }
    return kampanyeId
  }

  const bayar = async (simulasi = false) => {
    setGalat('')
    setInfo('')
    setSibuk(true)
    try {
      setTahap('Menyimpan kampanye…')
      const kampanyeId = await simpanKampanye()

      setTahap('Memeriksa isi kampanye…')
      const periksa = await api.periksaKampanye(kampanyeId)
      setModerasi(periksa.moderasi)
      if (periksa.moderasi.status !== 'lolos') return

      // Reward produk saja: tidak ada uang yang ditagih, kampanye langsung terbit.
      if (produkSaja) {
        setTahap('Menerbitkan kampanye…')
        await api.terbitkanKampanye(kampanyeId)
        return selesai(kampanyeId)
      }

      if (pakaiMidtrans && !simulasi) {
        setTahap('Membuka pembayaran Midtrans…')
        const hasil = await bayarDenganSnap({ konfigurasi: konfigBayar, kampanyeId, metode: method })
        setTagihanTerakhir(hasil.tagihan)
        if (hasil.tagihan.status === 'lunas') return selesai(kampanyeId)
        setInfo(pesanStatus(hasil))
        return
      }

      setTahap(simulasi ? 'Menyimulasikan setoran…' : 'Menyetor dana ke Rekber…')
      await api.setorDana(kampanyeId, { jumlah: anggaran, metode: method })
      selesai(kampanyeId)
    } catch (err) {
      // Gerbang server (422) membawa hasil pemeriksaan: tampilkan rinciannya,
      // bukan hanya kalimat galat.
      if (err.rincian?.moderasi) setModerasi(err.rincian.moderasi)
      else setGalat(err.message)
      // 402 = biaya pasang belum lunas (mis. draf lama dari sebelum gerbang ada).
      setPerluBiayaPasang(err.status === 402)
    } finally {
      setSibuk(false)
      setTahap('')
    }
  }

  /** VA/transfer dibayar di luar popup: tanyakan statusnya lagi. */
  const cekStatus = async () => {
    if (!tagihanTerakhir) return
    setGalat('')
    setSibuk(true)
    setTahap('Mengecek pembayaran…')
    try {
      const hasil = await api.cekPembayaran(tagihanTerakhir.orderId)
      setTagihanTerakhir(hasil.tagihan)
      if (hasil.tagihan.status === 'lunas') return selesai(hasil.kampanye.id)
      setInfo(pesanStatus({ popup: 'pending', tagihan: hasil.tagihan }))
    } catch (err) {
      setGalat(err.message)
    } finally {
      setSibuk(false)
      setTahap('')
    }
  }

  // Dibuka langsung tanpa melewati langkah 1: tidak ada yang bisa ditagihkan.
  if (!langkahSatuLengkap && !sudahBayar.current) {
    return <Navigate to="/umkm/kampanye/baru" replace />
  }

  return (
    <AppShell>
      <motion.div variants={stagger} initial="initial" animate="animate" className="mx-auto max-w-4xl">
        <KepalaWizard
          langkah={3}
          judul={produkSaja ? 'Ringkasan & Terbitkan' : 'Setor Dana ke Rekber'}
          sub={
            produkSaja
              ? 'Periksa sekali lagi. Tidak ada uang yang ditagih; produk Anda yang menjadi reward.'
              : 'Satu langkah lagi. Dana ditahan sistem dan hanya dibayar untuk views yang tervalidasi.'
          }
        />

        {/* Catatan asisten */}
        <motion.div variants={fadeUp} className="mt-6">
          <AIPanel title="Ringkasan Kampanye" ikon={Wallet}>
            Halo {profil.nama}! Kampanye <b className="text-white">{draf.nama || 'Anda'}</b> menargetkan{' '}
            <b className="text-white">{ribuan(h.target)} views</b> dengan reward{' '}
            <b className="text-white">{MODEL[h.model].judul.toLowerCase()}</b>
            {h.pakaiTunai && <> sebesar {tarifPerViewTeks(h.cpm)} per view</>}. Kreator berhak atas reward setelah
            mencapai <b className="text-white">{ribuan(h.pakaiTunai ? h.ambangTunai : h.ambangProduk)} views</b> tervalidasi.
            {h.pakaiTunai && (
              <>
                {' '}Dana yang Anda setorkan diamankan di <b className="text-white">Rekber (Escrow)</b> dan hanya dibayar untuk
                views yang lolos pemeriksaan.
              </>
            )}
          </AIPanel>
        </motion.div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* Kiri */}
          <motion.div variants={fadeUp} className="lg:col-span-3">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-navy">
                <Shield size={18} />
                <p className="text-sm font-semibold">Alur Dana Aman (Rekber)</p>
              </div>
              <div className="mt-4 flex items-start justify-between">
                {flow.map((f, i) => (
                  <div key={f.n} className="contents">
                    <div className="flex w-24 flex-col items-center text-center">
                      <motion.span
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.28, delay: 0.15 + i * 0.1, ease: EASE.entrance }}
                        className="grid h-8 w-8 place-items-center rounded-full bg-navy text-xs font-bold text-white"
                      >
                        {f.n}
                      </motion.span>
                      <span className="mt-2 text-xs text-ink-soft">{f.label}</span>
                    </div>
                    {i < flow.length - 1 && (
                      <span className="mt-4 h-0.5 flex-1 overflow-hidden rounded bg-black/10">
                        <motion.span
                          className="block h-full rounded bg-navy/40"
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 0.5, delay: 0.25 + i * 0.1, ease: EASE.signature }}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {!produkSaja && <h2 className="mt-6 text-xl font-bold text-navy">Metode Pembayaran</h2>}
            <div className={`mt-3 space-y-3 ${produkSaja ? 'hidden' : ''}`}>
              {methods.map((m) => {
                const active = method === m.id
                return (
                  <motion.button
                    key={m.id}
                    type="button"
                    onClick={() => ubah({ metodeBayar: m.id })}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ duration: DUR.hover, ease: EASE.signature }}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 bg-white px-4 py-4 text-left transition-colors ${
                      active ? 'border-navy' : 'border-black/10 hover:border-navy/30'
                    }`}
                  >
                    <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${active ? 'border-navy' : 'border-black/25'}`}>
                      {active && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.18, ease: EASE.settle }}
                          className="h-2.5 w-2.5 rounded-full bg-navy"
                        />
                      )}
                    </span>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-cream-200 text-navy"><Wallet size={18} /></span>
                    <span>
                      <span className="block font-semibold text-navy">{m.title}</span>
                      <span className="block text-sm text-ink-soft">{m.sub}</span>
                    </span>
                  </motion.button>
                )
              })}
            </div>

            {/* Ringkasan brief supaya tidak ada kejutan setelah dibayar. */}
            {briefArray.length > 0 && (
              <div className="card mt-6 p-5">
                <p className="text-sm font-semibold text-navy">Brief untuk Kreator</p>
                <ol className="mt-3 space-y-2">
                  {briefArray.map((b, i) => (
                    <li key={b} className="flex gap-3 text-sm text-ink-soft">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      {b}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </motion.div>

          {/* Ringkasan */}
          <motion.div variants={fadeUp} className="lg:col-span-2">
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-navy">Ringkasan</h3>
                <span className="flex gap-1.5">
                  {pakaiMidtrans && !konfigBayar.produksi && (
                    <span className="chip bg-cream-200 text-ink-soft" title="Pembayaran uji, tidak menagih uang sungguhan">
                      SANDBOX
                    </span>
                  )}
                  <span className="chip bg-gold text-gold-text">REKBER AKTIF</span>
                </span>
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Target views', `${ribuan(h.target)} views`],
                  ['Model reward', MODEL[h.model].judul],
                  ...(h.pakaiTunai
                    ? [
                        ['Tarif', draf.skemaTarif === 'cpm' ? `${rupiah(h.cpm)} / 1.000 views` : `${rupiah(draf.tarifPerView)} / view`],
                        ['Minimal views pencairan', `${ribuan(h.ambangTunai)} views`],
                        ['Aturan pencairan', draf.modePencairan === 'sekali' ? 'Sekali saja' : 'Sekali tiap milestone'],
                        ['Estimasi reward', rupiah(h.biayaTarget)],
                      ]
                    : []),
                  ...(h.pakaiProduk
                    ? [
                        ['Minimal views klaim produk', `${ribuan(h.ambangProduk)} views`],
                        ...h.produk.map((p) => [p.nama, `${ribuan(p.kuota)} × ${rupiah(p.nilai)}`]),
                      ]
                    : []),
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-3">
                    <dt className="text-ink-soft">{l}</dt>
                    <dd className="text-right font-medium text-navy">{v}</dd>
                  </div>
                ))}
                {h.pakaiTunai && (
                  <div className="flex justify-between border-t border-black/5 pt-3">
                    <dt className="text-ink-soft">Anggaran maksimal (Rekber)</dt>
                    <dd className="font-medium text-navy">{rupiah(anggaran)}</dd>
                  </div>
                )}
                {!pakaiMidtrans && !produkSaja && (
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Kode Unik</dt>
                    <dd className="font-medium text-navy">{rupiah(kodeUnik)}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 flex items-end justify-between border-t border-black/5 pt-4">
                <span className="text-sm text-ink-soft">{produkSaja ? 'Total Bayar (tanpa uang)' : 'Total Bayar'}</span>
                <span className="text-right">
                  <span className="block text-xs text-ink-muted">IDR</span>
                  <span className="text-3xl font-extrabold text-navy">
                    <AngkaNaik nilai={pakaiMidtrans ? anggaran : totalBayar} />
                  </span>
                </span>
              </div>

              {/* Ke mana anggaran itu mengalir — tanpa menambah tagihan. */}
              <dl className={`mt-4 space-y-2 rounded-xl bg-cream-100 px-4 py-3 text-xs ${produkSaja ? 'hidden' : ''}`}>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Diterima kreator</dt>
                  <dd className="font-semibold text-navy">{rupiah(diterimaKreator)}</dd>
                </div>
                <p className="border-t border-black/5 pt-2 text-ink-muted">
                  Seluruh anggaran tunai menjadi pagu reward kreator. Reward dihitung dari tayangan
                  tervalidasi. Dana yang tidak terpakai kembali ke dompet Anda saat kampanye ditutup.
                </p>
              </dl>

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold-border bg-gold px-3 py-3">
                <Shield size={16} className="mt-0.5 shrink-0 text-navy" />
                <p className="text-xs text-gold-text">
                  Dana aman di Rekber LokalBoost. Sisa dana kembali bila target tidak tercapai.
                </p>
              </div>

              <PemeriksaanEtika
                kampanyeId={draf.kampanyeIdDibuat}
                moderasi={moderasi}
                onBerubah={setModerasi}
              />

              {galat && (
                <div role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
                  <p>{galat}</p>
                  {perluBiayaPasang && (
                    <Link to="/umkm/kampanye/baru" className="mt-2 inline-block font-semibold text-navy hover:underline">
                      Bayar biaya pasang →
                    </Link>
                  )}
                </div>
              )}

              {info && (
                <div role="status" className="mt-4 rounded-lg bg-cream-100 px-4 py-3 text-sm text-ink-soft">
                  <p>{info}</p>
                  {tagihanTerakhir?.status === 'menunggu' && (
                    <button
                      type="button"
                      onClick={cekStatus}
                      disabled={sibuk}
                      className="mt-2 font-semibold text-navy hover:underline disabled:opacity-60"
                    >
                      Cek Status Pembayaran
                    </button>
                  )}
                </div>
              )}

              <Tekan className="mt-4 block">
                <button
                  type="button"
                  onClick={() => bayar(false)}
                  disabled={sibuk || moderasi?.status === 'tinjau'}
                  className="btn-primary w-full py-3 disabled:opacity-60"
                >
                  {sibuk ? (
                    tahap || 'Memproses…'
                  ) : produkSaja ? (
                    <>Terbitkan Kampanye <ArrowRight size={18} /></>
                  ) : pakaiMidtrans ? (
                    <>Bayar via Midtrans <ArrowRight size={18} /></>
                  ) : (
                    <>Bayar &amp; Pilih Kreator <ArrowRight size={18} /></>
                  )}
                </button>
              </Tekan>
              {adaSimulasi && (
                <Tekan className="mt-3 block">
                  <button
                    type="button"
                    onClick={() => bayar(true)}
                    disabled={sibuk || moderasi?.status === 'tinjau'}
                    className="btn-outline w-full py-3 disabled:opacity-60"
                  >
                    Simulasi Demo: setor {rupiah(anggaran)} tanpa Midtrans
                  </button>
                </Tekan>
              )}
              <Tekan className="mt-3 block">
                <Link to="/umkm/kampanye/target" className="btn-outline w-full py-3">Kembali ke Langkah 2</Link>
              </Tekan>
              <p className="field-help text-center">
                {produkSaja
                  ? 'Kampanye terbit setelah lolos pemeriksaan isi. Stok produk dipotong sesuai jumlah reward.'
                  : 'Kampanye aktif hanya setelah pembayaran terkonfirmasi. Reward dibayar dari Rekber sesuai views tervalidasi.'}
              </p>
              <p className="field-help text-center">
                Sebelum dibayar, isi kampanye diperiksa supaya tidak menjelekkan UMKM lain.
              </p>
            </div>
          </motion.div>
        </div>

      </motion.div>
    </AppShell>
  )
}
