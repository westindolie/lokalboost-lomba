/**
 * Perhitungan & validasi pengaturan reward kampanye (langkah 2 wizard).
 *
 * Murni fungsi, tanpa React, supaya bisa diuji langsung dengan Node dan
 * supaya angka yang dilihat UMKM di layar dihitung dengan rumus yang sama
 * persis dengan server (lokalboost-api/src/services/reward.js):
 *
 *   per view : reward = views x tarif
 *   CPM      : reward = (views / 1.000) x tarif CPM
 *
 * Keduanya disimpan sebagai CPM (rupiah per 1.000 views). Reward dibulatkan
 * ke bawah ke rupiah penuh; biaya target dibulatkan ke atas, supaya anggaran
 * yang lolos di sini tidak pernah ditolak server karena selisih pembulatan.
 */

export const BATAS = {
  targetMin: 1_000,
  targetMaks: 1_000_000,
  sliderTargetMaks: 100_000,
  tarifMin: 10,
  tarifMaks: 5_000,
  cpmMin: 10_000,
  cpmMaks: 5_000_000,
  ambangMin: 100,
  anggaranMaks: 1_000_000_000,
  lamaMin: 1,
  lamaMaks: 90,
}

export const PILIHAN_TARGET = [5_000, 10_000, 25_000, 50_000]
export const PILIHAN_AMBANG = [1_000, 5_000, 10_000, 25_000, 50_000]
export const PILIHAN_TARIF_VIEW = [100, 250, 500]
export const PILIHAN_TARIF_CPM = [10_000, 25_000, 50_000]

export const MODEL = {
  tunai: { judul: 'Uang Tunai', sub: 'Reward uang dari views tervalidasi' },
  produk: { judul: 'Produk UMKM', sub: 'Kreator mendapat produk Anda' },
  kombinasi: { judul: 'Uang + Produk', sub: 'Uang per views, produk sebagai bonus' },
}

const angka = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/** Tarif dalam rupiah per 1.000 views. */
export const cpmDraf = (d) => (d.skemaTarif === 'cpm' ? Math.round(angka(d.tarifCpm)) : Math.round(angka(d.tarifPerView) * 1000))

/** Reward untuk sejumlah views (dibulatkan ke bawah). */
export const rewardDariViews = (views, cpm) => Math.floor((angka(views) * angka(cpm)) / 1000)

/** Biaya mencapai sejumlah views (dibulatkan ke atas). */
export const biayaUntukViews = (views, cpm) => Math.ceil((angka(views) * angka(cpm)) / 1000)

/** Tarif per view untuk ditampilkan, mis. CPM 12.500 -> "Rp 12,5". */
export function tarifPerViewTeks(cpm) {
  const v = angka(cpm) / 1000
  return `Rp ${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`
}

/** Batasi angka ke rentang, dipakai input yang tersambung ke slider. */
export const jepit = (n, min, maks) => Math.min(maks, Math.max(min, Math.round(angka(n))))

/**
 * Semua angka turunan dari draf. `katalog` = produk UMKM (untuk nilai produk).
 */
export function hitungDraf(d, katalog = []) {
  const model = d.modelReward || 'tunai'
  const pakaiTunai = model !== 'produk'
  const pakaiProduk = model !== 'tunai'
  const target = angka(d.targetViews)
  const cpm = pakaiTunai ? cpmDraf(d) : 0
  const biayaTarget = pakaiTunai ? biayaUntukViews(target, cpm) : 0
  const anggaran = pakaiTunai ? (d.anggaranManual ? Math.round(angka(d.anggaranMaks)) : biayaTarget) : 0
  const viewsTerbiayai = cpm > 0 ? Math.floor((anggaran * 1000) / cpm) : 0
  const ambangTunai = pakaiTunai ? angka(d.ambangViewsTunai) : 0
  const ambangProduk = pakaiProduk
    ? model === 'kombinasi' && !d.pisahAmbang
      ? angka(d.ambangViewsTunai)
      : angka(d.ambangViewsProduk)
    : 0

  const produk = pakaiProduk
    ? (d.produkReward || [])
        .map((r) => {
          const p = katalog.find((x) => x.id === r.produkId)
          return p ? { ...r, nama: p.nama, nilai: p.nilai, foto: p.foto, stok: p.stok, subtotal: p.nilai * angka(r.kuota) } : null
        })
        .filter(Boolean)
    : []

  return {
    model,
    pakaiTunai,
    pakaiProduk,
    target,
    cpm,
    biayaTarget,
    anggaran,
    viewsTerbiayai,
    sisaAnggaran: Math.max(0, anggaran - biayaTarget),
    kurangAnggaran: Math.max(0, biayaTarget - anggaran),
    ambangTunai,
    ambangProduk,
    /** Reward seorang kreator tepat saat mencapai ambang. */
    rewardDiAmbang: rewardDariViews(ambangTunai, cpm),
    /** Paling banyak kreator yang bisa mencapai ambang dengan anggaran ini. */
    kreatorMaksDiAmbang: ambangTunai > 0 && cpm > 0 ? Math.floor(viewsTerbiayai / ambangTunai) : null,
    produk,
    jumlahProduk: produk.reduce((a, p) => a + angka(p.kuota), 0),
    nilaiProduk: produk.reduce((a, p) => a + p.subtotal, 0),
  }
}

/**
 * Pesan galat per kolom. Kosong = boleh lanjut ke pembayaran.
 * Pesannya ditulis untuk pemilik usaha, bukan programmer.
 */
export function galatDraf(d, katalog = []) {
  const h = hitungDraf(d, katalog)
  const g = {}
  const ribu = (n) => angka(n).toLocaleString('id-ID')

  if (!Number.isInteger(h.target) || h.target < BATAS.targetMin || h.target > BATAS.targetMaks) {
    g.target = `Target views harus ${ribu(BATAS.targetMin)} sampai ${ribu(BATAS.targetMaks)}.`
  }

  if (h.pakaiTunai) {
    if (d.skemaTarif === 'cpm') {
      if (h.cpm < BATAS.cpmMin || h.cpm > BATAS.cpmMaks) {
        g.tarif = `Tarif per 1.000 views harus Rp ${ribu(BATAS.cpmMin)} sampai Rp ${ribu(BATAS.cpmMaks)}.`
      }
    } else if (angka(d.tarifPerView) < BATAS.tarifMin || angka(d.tarifPerView) > BATAS.tarifMaks) {
      g.tarif = `Tarif per view harus Rp ${BATAS.tarifMin} sampai Rp ${ribu(BATAS.tarifMaks)}.`
    }
    if (!g.tarif && !g.target) {
      if (h.anggaran > BATAS.anggaranMaks) g.anggaran = `Anggaran maksimal Rp ${ribu(BATAS.anggaranMaks)}.`
      else if (h.kurangAnggaran > 0) {
        g.anggaran =
          `Anggaran kurang Rp ${ribu(h.kurangAnggaran)} untuk membiayai ${ribu(h.target)} views. ` +
          `Naikkan anggaran, turunkan tarif, atau kecilkan target (anggaran ini cukup untuk ${ribu(h.viewsTerbiayai)} views).`
      }
    }
    if (!Number.isInteger(h.ambangTunai) || h.ambangTunai < BATAS.ambangMin) {
      g.ambangTunai = `Target views minimal paling sedikit ${ribu(BATAS.ambangMin)}.`
    } else if (h.ambangTunai > h.target) {
      g.ambangTunai = 'Target views minimal tidak boleh lebih besar dari target views kampanye.'
    }
  }

  if (h.pakaiProduk) {
    if (!h.produk.length) g.produk = 'Pilih minimal satu produk dari katalog sebagai reward.'
    for (const p of h.produk) {
      if (!Number.isInteger(angka(p.kuota)) || angka(p.kuota) < 1) g.produk = `Jumlah reward ${p.nama} minimal 1.`
      else if (angka(p.kuota) > p.stok) g.produk = `Stok ${p.nama} tinggal ${p.stok}.`
    }
    if (h.model === 'produk' || d.pisahAmbang) {
      if (!Number.isInteger(h.ambangProduk) || h.ambangProduk < BATAS.ambangMin) {
        g.ambangProduk = `Target views minimal klaim produk paling sedikit ${ribu(BATAS.ambangMin)}.`
      } else if (h.ambangProduk > h.target) {
        g.ambangProduk = 'Target views minimal klaim produk tidak boleh lebih besar dari target kampanye.'
      }
    }
  }

  const lama = angka(d.tenggatHari)
  if (!Number.isInteger(lama) || lama < BATAS.lamaMin || lama > BATAS.lamaMaks) {
    g.lama = `Lama kampanye harus ${BATAS.lamaMin} sampai ${BATAS.lamaMaks} hari.`
  }
  return g
}

/** Isi kampanye untuk POST/PATCH /api/kampanye dari draf langkah 2. */
export function isianReward(d, katalog = []) {
  const h = hitungDraf(d, katalog)
  return {
    targetViews: h.target,
    modelReward: h.model,
    ...(h.pakaiTunai
      ? {
          skemaTarif: d.skemaTarif === 'cpm' ? 'cpm' : 'per_view',
          ...(d.skemaTarif === 'cpm' ? { tarifCpm: h.cpm } : { tarifPerView: angka(d.tarifPerView) }),
          anggaran: h.anggaran,
          ambangViewsTunai: h.ambangTunai,
          modePencairan: d.modePencairan === 'sekali' ? 'sekali' : 'per_milestone',
        }
      : {}),
    ...(h.pakaiProduk
      ? {
          ambangViewsProduk: h.ambangProduk,
          // Dari draf langsung, bukan dari katalog: katalog bisa belum termuat,
          // dan server yang memeriksa kepemilikan + stoknya.
          produkReward: (d.produkReward || []).map((p) => ({ produkId: p.produkId, kuota: angka(p.kuota) })),
        }
      : {}),
    kategoriLain: d.kategoriLain || [],
  }
}
