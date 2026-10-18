import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LOKASI_BAWAAN } from './data/pilihan.js'
import { hitungDraf } from './reward.js'

/**
 * Draf kampanye yang sedang disusun di wizard tiga langkah.
 *
 * Sebelumnya setiap langkah berdiri sendiri: langkah 2 menghitung anggaran
 * dari slider, lalu langkah 3 menampilkan angka lain yang ditulis tetap di
 * dalam kode. Pengguna menggeser slider, menekan Lanjut, dan mendapati
 * tagihan yang berbeda tanpa penjelasan — cacat kepercayaan yang fatal di
 * halaman pembayaran.
 *
 * Draf ini murni keadaan formulir. Begitu langkah 3 selesai, isinya dikirim
 * ke POST /api/kampanye lalu POST /api/kampanye/:id/setor, dan kampanyenya
 * hidup di basis data — tidak ada lagi "kampanye demo" yang dituju wizard.
 *
 * Draf disalin ke sessionStorage. Tanpa itu, menyegarkan halaman di langkah
 * 2 atau 3 mengosongkan formulir diam-diam, lalu tombol bayar membalas
 * "Field berikut wajib diisi" tanpa jalan kembali yang jelas.
 */

const AWAL = {
  nama: '',
  kategori: '',
  lokasi: LOKASI_BAWAAN,
  deskripsi: '',
  brief: '',
  /** Foto produk utama (WebP/JPG data URL), diunggah saat kampanye disimpan. */
  gambarProduk: '',
  /** Video acuan gaya: [{ url, platform, judul?, penulis? }] (components/ReferensiKonten.jsx). */
  referensi: [],
  targetViews: 10000,
  // Reward (langkah 2). Hitungannya di reward.js, sama dengan rumus server.
  modelReward: 'tunai',
  skemaTarif: 'per_view',
  tarifPerView: 250,
  tarifCpm: 25000,
  /** false = anggaran mengikuti estimasi biaya target. */
  anggaranManual: false,
  anggaranMaks: 0,
  ambangViewsTunai: 1000,
  ambangViewsProduk: 1000,
  /** Kombinasi: ambang klaim produk diatur terpisah dari ambang pencairan uang. */
  pisahAmbang: false,
  modePencairan: 'per_milestone',
  /** [{ produkId, kuota }] dari katalog UMKM. */
  produkReward: [],
  kategoriLain: [],
  tenggatHari: 14,
  metodeBayar: 'va',
}

const KUNCI_DRAF = 'lokalboost:draf-kampanye'

function bacaDraf() {
  try {
    const simpanan = JSON.parse(window.sessionStorage.getItem(KUNCI_DRAF) || 'null')
    return simpanan ? { ...AWAL, ...simpanan } : AWAL
  } catch {
    return AWAL
  }
}

/** Kode unik pembayaran — tetap per draf supaya angkanya tidak berubah
 *  setiap kali komponen dirender ulang. */
const KODE_UNIK = 423

const KonteksDraf = createContext(null)

export function DrafKampanyeProvider({ children }) {
  const [draf, setDraf] = useState(bacaDraf)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(KUNCI_DRAF, JSON.stringify(draf))
    } catch {
      // Mode privat / penyimpanan diblokir: draf tetap hidup di memori.
    }
  }, [draf])

  const ubah = useCallback((bagian) => setDraf((d) => ({ ...d, ...bagian })), [])
  const reset = useCallback(() => setDraf(AWAL), [])

  const nilai = useMemo(() => {
    // Anggaran tunai yang ditagih. Reward produk saja = 0 (tidak ada setoran).
    const { anggaran } = hitungDraf(draf)
    return {
      draf,
      ubah,
      reset,
      anggaran,
      /** Langkah 1 sudah diisi — syarat untuk membuka langkah 2 dan 3. */
      langkahSatuLengkap: Boolean(draf.nama.trim() && draf.kategori && draf.lokasi.trim()),
      kodeUnik: KODE_UNIK,
      /* UMKM membayar anggaran apa adanya. Komisi platform dipotong dari
         bagian kreator, jadi ia tidak boleh menambah tagihan di sini. */
      totalBayar: anggaran > 0 ? anggaran + KODE_UNIK : 0,
      /** Poin brief satu per baris → array, siap dikirim ke API. */
      briefArray: draf.brief
        .split('\n')
        .map((b) => b.replace(/^\s*\d+[.)]\s*/, '').trim())
        .filter(Boolean),
    }
  }, [draf, ubah, reset])

  return <KonteksDraf.Provider value={nilai}>{children}</KonteksDraf.Provider>
}

export function useDraf() {
  const konteks = useContext(KonteksDraf)
  if (!konteks) throw new Error('useDraf harus dipakai di dalam <DrafKampanyeProvider>.')
  return konteks
}
