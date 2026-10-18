import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import AppShell from '../components/AppShell.jsx'
import { staggerRapat, fadeUp } from '../components/PageTransition.jsx'
import { PageHeader, HoverCard, StatusChip, EmptyState, Tekan, TabGaris, IsiFoto, AvatarKreator, ChipContoh } from '../components/ui.jsx'
import { MemuatBlok, GalatMuat } from '../components/Muat.jsx'
import { KATEGORI, LOKASI, RENTANG_ANGGARAN } from '../data/pilihan.js'
import { rupiah, ribuan, nilai, statusKampanye, gradasi, pengikut } from '../format.js'
import { api, useApi } from '../api.js'
import { useSesi } from '../sesi.jsx'
import { Sparkles, Check, Star, Search, MapPin, Store } from '../components/icons.jsx'

/**
 * Marketplace Kampanye Promosi (PRD §6.1) — listing dengan filter kategori,
 * lokasi, dan rentang anggaran.
 *
 * Penyaringan dikerjakan backend lewat query string, bukan di dalam memori
 * browser. Selain benar untuk data yang tumbuh, itu juga yang membuat skor
 * sistem rekomendasi kreator ikut terbawa: untuk kreator yang sedang masuk, API
 * mengurutkan kampanye menurut kecocokan.
 */

function KartuKreator({ k }) {
  return (
    <HoverCard className="card overflow-hidden">
      <div className={`relative grid h-36 place-items-center overflow-hidden bg-gradient-to-br ${gradasi(k)}`}>
        <AvatarKreator c={k} className="h-24 w-24 rounded-full ring-4 ring-white/80" />
        {k.terverifikasi && (
          <span className="chip absolute right-3 top-3 gap-1 bg-gold text-gold-text">
            <Check size={12} /> Terverifikasi
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-bold text-navy">{k.nama}</p>
          <ChipContoh ada={k.contoh} />
          {k.niche && (
            <span className="chip shrink-0 bg-cream-200 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
              {k.niche}
            </span>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
          <MapPin size={12} /> {k.lokasi || 'Lokasi belum diisi'}
        </p>
        <p className="mt-2 line-clamp-2 text-sm text-ink-soft">
          {k.bio || 'Kreator ini belum menulis deskripsi kontennya.'}
        </p>

        <div className="mt-4 grid grid-cols-2 border-t border-black/5 pt-4 text-sm">
          <div>
            <p className="font-bold text-navy">{pengikut(k.pengikut)}</p>
            <p className="text-xs text-ink-muted">Pengikut</p>
          </div>
          <div className="border-l border-black/5 pl-4">
            <p className="flex items-center gap-1 font-bold text-navy">
              <Star size={13} className="text-gold-text" />
              {k.rating ? nilai(k.rating) : 'Baru'}
            </p>
            <p className="text-xs text-ink-muted">
              {k.jumlahUlasan ? `${k.jumlahUlasan} ulasan` : 'Belum ada ulasan'}
            </p>
          </div>
        </div>

        <Tekan className="mt-4 block">
          <Link
            to={`/kreator/profil/${k.id}`}
            className="flex w-full items-center justify-center rounded-lg bg-cream-200 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-cream-300"
          >
            Lihat Profil
          </Link>
        </Tekan>
      </div>
    </HoverCard>
  )
}

function KartuKampanye({ k }) {
  const st = statusKampanye(k.status, k.sisaHari)
  const fotoUsaha = k.umkmGaleri || []
  return (
    <HoverCard className="card overflow-hidden">
      <div className={`relative h-36 overflow-hidden bg-gradient-to-br ${gradasi(k)}`}>
        <IsiFoto src={k.gambar || fotoUsaha[0]?.foto} alt={k.nama} />
        {k.kecocokan != null && (
          <span className="chip absolute left-3 top-3 gap-1 bg-navy text-white">
            <Sparkles size={12} /> Cocok {k.kecocokan}%
          </span>
        )}
      </div>
      {fotoUsaha.length > 0 && (
        <div className="flex gap-2 overflow-hidden border-b border-black/5 bg-white px-3 py-2" aria-label="Foto usaha UMKM">
          {fotoUsaha.slice(0, 5).map((foto) => (
            <img key={foto.id} src={foto.foto} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" />
          ))}
          {fotoUsaha.length > 5 && (
            <span className="grid h-10 min-w-10 place-items-center rounded-md bg-cream-200 px-2 text-xs font-semibold text-ink-soft">
              +{fotoUsaha.length - 5}
            </span>
          )}
        </div>
      )}
      <div className="p-5">
        {/* Judul dibiarkan turun ke baris kedua, bukan dipotong: nama kampanye
            sungguhan ("Review Hijab Lokal Nayala") lebih panjang dari contoh
            di berkas mock, dan judul yang terpenggal jadi "Review Ku…" tidak
            memberi tahu apa pun. */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 line-clamp-2 font-bold leading-snug text-navy">{k.nama}</p>
          <StatusChip status={st.label} tone={st.tone} />
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
          <Store size={12} /> {k.umkm} · {k.lokasi}
          <ChipContoh ada={k.contoh} />
        </p>
        <p className="mt-2 line-clamp-2 text-sm text-ink-soft">
          {k.deskripsi || `Kampanye ${k.kategori} dengan target ${ribuan(k.targetViews)} tayangan asli.`}
        </p>
        {k.alasanKecocokan && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
            <Sparkles size={12} className="mt-0.5 shrink-0 text-gold-text" /> {k.alasanKecocokan}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 border-t border-black/5 pt-4 text-sm">
          <div>
            <p className="font-bold text-navy">{rupiah(k.anggaran)}</p>
            <p className="text-xs text-ink-muted">Anggaran</p>
          </div>
          <div className="border-l border-black/5 pl-4">
            <p className="font-bold text-navy">{ribuan(k.targetViews)}</p>
            <p className="text-xs text-ink-muted">Target views</p>
          </div>
        </div>

        <Tekan className="mt-4 block">
          <Link to={`/kampanye/${k.id}`} className="btn-primary w-full py-2.5">
            Lihat Detail
          </Link>
        </Tekan>
      </div>
    </HoverCard>
  )
}

export default function Marketplace() {
  const { adalahUmkm, adalahKreator } = useSesi()

  /**
   * Peran menentukan apa yang dicari di sini: UMKM mencari kreator, kreator
   * mencari kampanye. Tab hanya ditampilkan untuk tamu yang memang sedang
   * melihat-lihat kedua sisi pasar.
   */
  const bolehGantiTab = !adalahUmkm && !adalahKreator
  const [tab, setTab] = useState(adalahUmkm ? 'kreator' : 'kampanye')
  const tabAktif = adalahUmkm ? 'kreator' : adalahKreator ? 'kampanye' : tab

  const [cari, setCari] = useState('')
  const [filterKategori, setFilterKategori] = useState('')
  const [filterLokasi, setFilterLokasi] = useState('')
  const [filterAnggaran, setFilterAnggaran] = useState('')

  const adaFilter = Boolean(cari || filterKategori || filterLokasi || filterAnggaran)
  const resetFilter = () => {
    setCari('')
    setFilterKategori('')
    setFilterLokasi('')
    setFilterAnggaran('')
  }

  const rentang = RENTANG_ANGGARAN.find((r) => r.id === filterAnggaran)

  const hasilKampanye = useApi(
    () =>
      api.kampanye({
        q: cari.trim(),
        kategori: filterKategori,
        lokasi: filterLokasi,
        anggaranMin: rentang?.min,
        anggaranMaks: rentang?.maks,
      }),
    [cari, filterKategori, filterLokasi, filterAnggaran],
    { aktif: tabAktif === 'kampanye' },
  )

  const hasilKreator = useApi(
    () => api.daftarKreator({ q: cari.trim(), niche: filterKategori, lokasi: filterLokasi }),
    [cari, filterKategori, filterLokasi],
    { aktif: tabAktif === 'kreator' },
  )

  const sumber = tabAktif === 'kreator' ? hasilKreator : hasilKampanye
  const daftar = tabAktif === 'kreator' ? sumber.data?.kreator : sumber.data?.kampanye

  return (
    <AppShell>
      <PageHeader
        title={adalahUmkm ? 'Cari Kreator' : adalahKreator ? 'Cari Kampanye' : 'Marketplace Kolaborasi'}
        subtitle={
          adalahUmkm
            ? 'Pilih kreator yang audiensnya paling dekat dengan calon pembeli Anda.'
            : adalahKreator
              ? 'Kampanye yang dananya sudah aman di Rekber dan siap dikerjakan.'
              : 'Temukan mitra terbaik untuk mengembangkan bisnis Anda, atau kampanye menarik untuk konten kreatif Anda.'
        }
      >
        <div className="flex max-w-xs items-start gap-3 rounded-2xl bg-navy p-4 text-white">
          <Sparkles size={20} className="mt-0.5 shrink-0 text-gold" />
          <div>
            <p className="text-sm font-bold">Rekomendasi Kreator</p>
            <p className="text-xs text-white/75">
              {adalahKreator
                ? 'Urutan kampanye disesuaikan dengan niche dan lokasimu.'
                : 'Skor kecocokan muncul begitu Anda membuka sebuah kampanye.'}
            </p>
          </div>
        </div>
      </PageHeader>

      {bolehGantiTab && (
        <div className="mt-8">
          <TabGaris
            layoutId="tab-marketplace"
            aktif={tabAktif}
            onGanti={setTab}
            tabs={[
              { id: 'kreator', label: 'Cari Kreator' },
              { id: 'kampanye', label: 'Cari Kampanye' },
            ]}
          />
        </div>
      )}

      {/* Pencarian & filter — semuanya menyaring seketika, tanpa tombol terapkan */}
      <div className="mt-6 rounded-2xl border border-black/5 bg-cream-100 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              aria-label="Kata kunci pencarian"
              placeholder={
                tabAktif === 'kreator'
                  ? 'Cari nama kreator, niche, atau lokasi...'
                  : 'Cari nama kampanye, kategori, atau kota...'
              }
              className="input py-3 pl-10"
            />
          </div>

          <select
            value={filterKategori}
            onChange={(e) => setFilterKategori(e.target.value)}
            aria-label={tabAktif === 'kreator' ? 'Niche kreator' : 'Kategori produk'}
            className="input lg:w-44"
          >
            <option value="">{tabAktif === 'kreator' ? 'Semua Niche' : 'Semua Kategori'}</option>
            {KATEGORI.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>

          <select
            value={filterLokasi}
            onChange={(e) => setFilterLokasi(e.target.value)}
            aria-label="Lokasi"
            className="input lg:w-40"
          >
            <option value="">Semua Lokasi</option>
            {LOKASI.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {tabAktif === 'kampanye' && (
            <select
              value={filterAnggaran}
              onChange={(e) => setFilterAnggaran(e.target.value)}
              aria-label="Rentang anggaran"
              className="input lg:w-48"
            >
              <option value="">Semua Anggaran</option>
              {RENTANG_ANGGARAN.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          )}

          {adaFilter && (
            <motion.button
              type="button"
              onClick={resetFilter}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98, opacity: 0.9 }}
              transition={{ duration: 0.09, ease: [0.4, 0, 0.2, 1] }}
              className="btn-ghost shrink-0 px-5 py-3"
            >
              Reset filter
            </motion.button>
          )}
        </div>
      </div>

      {sumber.galat ? (
        <div className="mt-6">
          <GalatMuat galat={sumber.galat} onCoba={sumber.muatUlang} judul="Marketplace gagal dimuat" />
        </div>
      ) : sumber.memuat ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MemuatBlok key={i} tinggi="h-72" jumlah={1} />
          ))}
        </div>
      ) : (
        <>
          <motion.p
            key={`${tabAktif}-${daftar?.length}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="mt-5 text-sm text-ink-soft"
          >
            Menampilkan <b className="text-navy">{daftar?.length || 0}</b>{' '}
            {tabAktif === 'kreator' ? 'kreator' : 'kampanye terbuka'}
            {cari && <> untuk “{cari}”</>}
          </motion.p>

          {!daftar?.length ? (
            <div className="mt-4">
              <EmptyState
                icon={Search}
                title="Belum ada yang cocok"
                subtitle="Coba kata kunci lain atau longgarkan filter pencarian Anda."
                action={adaFilter ? 'Reset filter' : undefined}
                onAction={adaFilter ? resetFilter : undefined}
              />
            </div>
          ) : (
            <motion.div
              key={tabAktif + cari + filterKategori + filterLokasi + filterAnggaran}
              variants={staggerRapat}
              initial="initial"
              animate="animate"
              className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
            >
              {tabAktif === 'kreator'
                ? daftar.map((k) => <KartuKreator key={k.id} k={k} />)
                : daftar.map((k) => <KartuKampanye key={k.id} k={k} />)}
            </motion.div>
          )}
        </>
      )}

      <motion.p variants={fadeUp} className="mt-8 text-center text-sm text-ink-soft">
        {adalahUmkm ? (
          <>Belum menemukan yang pas? <Link to="/umkm/kampanye/baru" className="font-semibold text-navy hover:underline">Buat kampanye</Link> dan biarkan kreator melamar ke Anda.</>
        ) : adalahKreator ? (
          <>Kampanye di atas sudah diurutkan menurut kecocokan dengan profilmu. <Link to="/kreator" className="font-semibold text-navy hover:underline">Lihat dasbor</Link> untuk rekomendasi teratas.</>
        ) : (
          <>Ingin ikut berkolaborasi? <Link to="/daftar" className="font-semibold text-navy hover:underline">Daftar gratis</Link> sebagai UMKM atau kreator.</>
        )}
      </motion.p>
    </AppShell>
  )
}
