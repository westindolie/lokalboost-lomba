import { db, transaksional } from '../lib/db.js'
import { config } from '../config.js'
import { angkaPositif, galat400, galat403, galat404, galat409, rupiah, sekarang } from '../lib/util.js'
import { pastikanTeks } from '../lib/validasi.js'
import { catatTransaksi, ubahSaldo } from './buku-kas.js'
import { kirimNotifikasi } from './notifikasi.js'

/**
 * Reward kampanye: tarif, ambang views, banyak kreator, dan produk.
 * ------------------------------------------------------------------
 * Tiga konsep yang sengaja dipisah (dan tidak boleh tercampur di kode):
 *
 *  1. Target views kampanye  — jangkauan TOTAL yang dicari UMKM, dari semua
 *     kreator. Tercapai = kampanye selesai.
 *  2. Ambang views reward    — KELAYAKAN satu kreator. Di bawah ambang, kreator
 *     belum berhak atas reward apa pun; ambang tidak menentukan nominal.
 *  3. Tarif reward           — nominal per views tervalidasi. Disimpan sebagai
 *     CPM (rupiah per 1.000 views) supaya tarif pecahan tetap tepat.
 *
 * Uang mengalir seperti sebelumnya: escrow -> saldo tertahan kreator (akrual,
 * setiap ada views baru) -> saldo siap tarik (pencairan). Yang baru: akrual
 * dihitung per kreator dari TOTAL views-nya (bukan per baris tayangan), dan
 * pencairan bisa dilakukan sebelum kampanye selesai begitu ambang tercapai.
 *
 * Kreator yang sampai kampanye selesai tidak mencapai ambang: reward-nya
 * hangus dan kembali ke UMKM. Itu arti "ambang = syarat kelayakan".
 */

export const MODEL_REWARD = ['tunai', 'produk', 'kombinasi']
export const SKEMA_TARIF = ['per_view', 'cpm']
export const MODE_PENCAIRAN = ['per_milestone', 'sekali']

/** Batas tarif. Di bawah Rp 10 per view tidak ada kreator yang mau; di atas Rp 5.000 hampir pasti salah ketik. */
export const BATAS_TARIF = { cpmMin: 10_000, cpmMaks: 5_000_000 }
const MAKS_KATEGORI_LAIN = 4

const pakaiTunai = (k) => k.model_reward !== 'produk'
const pakaiProduk = (k) => k.model_reward !== 'tunai'

/** Tarif kampanye dalam rupiah per 1.000 views. Kampanye lama hanya punya tarif per view. */
export const cpmDari = (k) => (k.tarif_cpm != null ? k.tarif_cpm : k.tarif_per_view * 1000)

/** Hak reward dari sejumlah views, dibulatkan ke bawah ke rupiah penuh. */
export const hakDariViews = (views, cpm) => Math.floor((views * cpm) / 1000)

/** Biaya mencapai sejumlah views, dibulatkan ke atas (dipakai saat memeriksa anggaran). */
export const biayaUntukViews = (views, cpm) => Math.ceil((views * cpm) / 1000)

const bilanganBulat = (n, label, { min = 0, maks = 100_000_000 } = {}) => {
  const v = Number(n ?? 0)
  if (!Number.isInteger(v) || v < min || v > maks) {
    throw galat400(`${label} harus bilangan bulat ${min.toLocaleString('id-ID')} sampai ${maks.toLocaleString('id-ID')}.`)
  }
  return v
}

/**
 * Pengaturan reward dari body POST/PATCH kampanye -> kolom basis data.
 * `lama` = baris kampanye saat PATCH; field yang tidak dikirim dipertahankan.
 * Body versi lama ({ targetViews, tarifPerView }) tetap sah: tunai, per view, tanpa ambang.
 */
export function rapikanPengaturanReward(b, lama = null) {
  const model = b.modelReward ?? lama?.model_reward ?? 'tunai'
  if (!MODEL_REWARD.includes(model)) throw galat400('Model reward harus tunai, produk, atau kombinasi.')
  const skema = b.skemaTarif ?? lama?.skema_tarif ?? 'per_view'
  if (!SKEMA_TARIF.includes(skema)) throw galat400('Skema tarif harus per view atau per 1.000 views.')
  const mode = b.modePencairan ?? lama?.mode_pencairan ?? 'per_milestone'
  if (!MODE_PENCAIRAN.includes(mode)) throw galat400('Aturan pencairan tidak dikenal.')

  const targetViews =
    b.targetViews != null ? angkaPositif(b.targetViews, 'Target tayangan') : lama?.target_views
  if (!targetViews) throw galat400('Target tayangan wajib diisi.')

  let cpm = 0
  if (model !== 'produk') {
    if (skema === 'cpm') {
      cpm = angkaPositif(b.tarifCpm ?? lama?.tarif_cpm, 'Tarif per 1.000 views')
    } else {
      const perView = b.tarifPerView ?? (lama ? Math.round(cpmDari(lama) / 1000) : undefined)
      cpm = angkaPositif(perView, 'Tarif per tayangan') * 1000
    }
    cpm = Math.round(cpm)
    if (cpm > BATAS_TARIF.cpmMaks) throw galat400('Tarif terlalu besar. Maksimal Rp 5.000 per view.')
  }

  const ambangTunai =
    model === 'produk' ? 0 : bilanganBulat(b.ambangViewsTunai ?? lama?.ambang_views_tunai, 'Target views minimal pencairan', { maks: targetViews })
  const ambangProduk =
    model === 'tunai'
      ? 0
      : bilanganBulat(b.ambangViewsProduk ?? lama?.ambang_views_produk, 'Target views minimal klaim produk', { min: 1, maks: targetViews })

  let kategoriLain = b.kategoriLain ?? (lama?.kategori_lain ? JSON.parse(lama.kategori_lain) : [])
  if (!Array.isArray(kategoriLain)) throw galat400('Format kategori tambahan tidak sah.')
  kategoriLain = [...new Set(kategoriLain.map((x) => String(x || '').trim()).filter(Boolean))]
  if (kategoriLain.length > MAKS_KATEGORI_LAIN) throw galat400(`Kategori tambahan maksimal ${MAKS_KATEGORI_LAIN}.`)
  if (kategoriLain.some((x) => x.length > 40)) throw galat400('Nama kategori terlalu panjang.')

  return {
    model,
    skema,
    mode,
    targetViews,
    cpm,
    tarifPerView: model === 'produk' ? 0 : Math.max(1, Math.round(cpm / 1000)),
    ambangTunai,
    ambangProduk,
    kategoriLain,
  }
}

/** Anggaran tunai minimal untuk membiayai target pada tarif tertentu. */
export function pastikanAnggaranCukup({ model, targetViews, cpm }, anggaran) {
  if (model === 'produk') return 0
  const perlu = biayaUntukViews(targetViews, cpm)
  if (anggaran < perlu) {
    throw galat400(`Anggaran tidak cukup untuk target ini. Perlu minimal Rp ${perlu.toLocaleString('id-ID')}.`)
  }
  return perlu
}

// ---------------------------------------------------------------------
//  Produk sebagai reward
// ---------------------------------------------------------------------

/** Daftar { produkId, kuota } dari body -> divalidasi terhadap katalog UMKM. */
export function rapikanProdukReward(daftar, umkmId, model) {
  if (model === 'tunai') return []
  if (!Array.isArray(daftar) || !daftar.length) {
    throw galat400('Pilih minimal satu produk dari katalog untuk reward produk.')
  }
  if (daftar.length > 5) throw galat400('Maksimal 5 jenis produk per kampanye.')
  const hasil = new Map()
  for (const r of daftar) {
    const produk = db.prepare('SELECT * FROM produk WHERE id = ?').get(String(r?.produkId || ''))
    if (!produk || produk.umkm_id !== umkmId) throw galat400('Produk reward tidak ditemukan di katalog Anda.')
    const kuota = bilanganBulat(r.kuota, `Jumlah reward ${produk.nama}`, { min: 1, maks: 10_000 })
    if (kuota > produk.stok) {
      throw galat400(`Stok ${produk.nama} tinggal ${produk.stok}. Kurangi jumlah reward atau tambah stok dulu.`)
    }
    hasil.set(produk.id, { produkId: produk.id, kuota })
  }
  return [...hasil.values()]
}

/** Ganti produk reward kampanye. Hanya selama kuota belum dipotong dari stok. */
export function simpanProdukReward(kampanyeId, daftar) {
  db.prepare('DELETE FROM kampanye_produk WHERE kampanye_id = ? AND dialokasikan = 0').run(kampanyeId)
  const stmt = db.prepare('INSERT INTO kampanye_produk (kampanye_id, produk_id, kuota) VALUES (?, ?, ?)')
  for (const r of daftar) stmt.run(kampanyeId, r.produkId, r.kuota)
}

export function produkKampanye(kampanyeId) {
  return db
    .prepare(
      `SELECT kp.produk_id, kp.kuota, kp.terklaim, kp.dialokasikan, p.nama, p.foto, p.nilai
       FROM kampanye_produk kp JOIN produk p ON p.id = kp.produk_id
       WHERE kp.kampanye_id = ? ORDER BY p.nama`,
    )
    .all(kampanyeId)
    .map((r) => ({
      produkId: r.produk_id,
      nama: r.nama,
      foto: r.foto,
      nilai: r.nilai,
      kuota: r.kuota,
      terklaim: r.terklaim,
      sisa: Math.max(0, r.kuota - r.terklaim),
    }))
}

/**
 * Potong kuota reward dari stok saat kampanye terbit. Dipanggil di dalam
 * transaksi setor dana / terbitkan. Tidak pernah melempar: pembayaran yang
 * sudah diterima tidak boleh gagal karena stok berubah sejak kampanye dibuat,
 * jadi kuota menyesuaikan stok yang benar-benar ada.
 */
export function alokasikanProduk(kampanyeId) {
  const baris = db.prepare('SELECT * FROM kampanye_produk WHERE kampanye_id = ? AND dialokasikan = 0').all(kampanyeId)
  for (const r of baris) {
    const stok = db.prepare('SELECT stok FROM produk WHERE id = ?').get(r.produk_id)?.stok ?? 0
    const kuota = Math.min(r.kuota, Math.max(0, stok))
    db.prepare('UPDATE produk SET stok = stok - ? WHERE id = ?').run(kuota, r.produk_id)
    db.prepare('UPDATE kampanye_produk SET kuota = ?, dialokasikan = 1 WHERE kampanye_id = ? AND produk_id = ?').run(
      kuota,
      kampanyeId,
      r.produk_id,
    )
  }
}

/** Kembalikan kuota yang tidak diklaim ke stok. Dipanggil saat kampanye selesai. */
export function kembalikanSisaProduk(kampanyeId) {
  const baris = db.prepare('SELECT * FROM kampanye_produk WHERE kampanye_id = ? AND dialokasikan = 1').all(kampanyeId)
  for (const r of baris) {
    const sisa = Math.max(0, r.kuota - r.terklaim)
    if (sisa > 0) db.prepare('UPDATE produk SET stok = stok + ? WHERE id = ?').run(sisa, r.produk_id)
    db.prepare('UPDATE kampanye_produk SET kuota = terklaim WHERE kampanye_id = ? AND produk_id = ?').run(kampanyeId, r.produk_id)
  }
}

// ---------------------------------------------------------------------
//  Peserta & views
// ---------------------------------------------------------------------

export const pesertaKampanye = (kampanyeId) =>
  db.prepare("SELECT * FROM lamaran WHERE kampanye_id = ? AND status = 'disetujui' ORDER BY id").all(kampanyeId)

export const ambilPeserta = (kampanyeId, kreatorId) =>
  db
    .prepare("SELECT * FROM lamaran WHERE kampanye_id = ? AND kreator_id = ? AND status = 'disetujui'")
    .get(kampanyeId, kreatorId)

export const adalahPeserta = (kampanyeId, kreatorId) => Boolean(kreatorId && ambilPeserta(kampanyeId, kreatorId))

/** Potongan SQL: kreator `?` adalah peserta kampanye beralias `alias`. */
export const sqlPeserta = (alias = 'k') =>
  `EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = ${alias}.id AND lp.kreator_id = ? AND lp.status = 'disetujui')`

/** Pihak yang terlibat: UMKM pemilik atau salah satu kreator peserta. */
export const terlibatKampanye = (k, penggunaId) => k.umkm_id === penggunaId || adalahPeserta(k.id, penggunaId)

/**
 * Views tervalidasi seorang kreator di satu kampanye. Dua sumber:
 *   - video unggahan lama: baris `tayangan` yang lolos anti-fraud;
 *   - video tautan: kenaikan views platform yang diakui (status tayang).
 */
export function viewsKreator(kampanyeId, kreatorId) {
  const unggah = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tayangan t JOIN video v ON v.id = t.video_id
       WHERE t.kampanye_id = ? AND t.valid = 1 AND v.kreator_id = ?`,
    )
    .get(kampanyeId, kreatorId).n
  const tautan = db
    .prepare(
      `SELECT COALESCE(SUM(views_diakui), 0) AS n FROM video
       WHERE kampanye_id = ? AND kreator_id = ? AND sumber = 'tautan' AND status = 'tayang'`,
    )
    .get(kampanyeId, kreatorId).n
  return unggah + tautan
}

/** Views tervalidasi + disaring seluruh kampanye. */
export function viewsKampanye(kampanyeId) {
  const t = db
    .prepare(
      `SELECT SUM(CASE WHEN valid = 1 THEN 1 ELSE 0 END) AS tervalidasi,
              SUM(CASE WHEN valid = 0 THEN 1 ELSE 0 END) AS disaring
       FROM tayangan WHERE kampanye_id = ?`,
    )
    .get(kampanyeId)
  const v = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'tayang' THEN views_diakui ELSE 0 END), 0) AS diakui,
              COALESCE(SUM(views_tertahan), 0) AS tertahan
       FROM video WHERE kampanye_id = ? AND sumber = 'tautan'`,
    )
    .get(kampanyeId)
  return {
    tervalidasi: (t.tervalidasi || 0) + v.diakui,
    disaring: t.disaring || 0,
    tertahan: v.tertahan,
  }
}

/** Yang membuat reward yang sudah layak belum boleh dicairkan. */
function hambatanVerifikasi(kampanyeId, kreatorId) {
  const tertahan = db
    .prepare('SELECT COALESCE(SUM(views_tertahan), 0) AS n FROM video WHERE kampanye_id = ? AND kreator_id = ?')
    .get(kampanyeId, kreatorId).n
  const sengketa = db
    .prepare("SELECT COUNT(*) AS n FROM sengketa WHERE kampanye_id = ? AND status IN ('terbuka','ditinjau')")
    .get(kampanyeId).n
  const alasan = []
  if (tertahan > 0) alasan.push(`${tertahan.toLocaleString('id-ID')} views naik tidak wajar dan sedang ditinjau admin`)
  if (sengketa > 0) alasan.push('ada sengketa yang belum diputus pada kampanye ini')
  return alasan
}

// ---------------------------------------------------------------------
//  Status reward
// ---------------------------------------------------------------------

export const LABEL_STATUS = {
  belum_ambang: 'Belum mencapai target minimal',
  menunggu_verifikasi: 'Menunggu verifikasi',
  memenuhi_syarat: 'Memenuhi syarat pencairan',
  dicairkan: 'Reward berhasil dicairkan',
  anggaran_habis: 'Anggaran kampanye sudah habis',
  cair_saat_selesai: 'Cair saat kampanye selesai',
  hangus: 'Tidak mencapai target minimal',
  kuota_habis: 'Kuota produk habis',
  klaim_diproses: 'Klaim produk sedang diproses',
  produk_dikirim: 'Produk telah dikirim',
  produk_diterima: 'Produk sudah diterima',
  tidak_diklaim: 'Produk tidak diklaim',
  memenuhi_syarat_produk: 'Memenuhi syarat klaim produk',
}

/**
 * Hak bersih dari views yang belum sempat diakrualkan (views naik, akrual
 * berikutnya belum jalan). Hanya untuk TAMPILAN: pencairan selalu menjalankan
 * akrual dulu dan memakai angka buku besar, bukan perkiraan ini.
 */
function hakTertunda(k, p, views) {
  if (!pakaiTunai(k) || k.status !== 'berjalan') return 0
  const kurang = Math.max(0, hakDariViews(views, cpmDari(k)) - p.bruto_akrual)
  const bayar = Math.min(kurang, sisaKampanye(k).sisaDana)
  if (bayar <= 0) return 0
  const komisi = Math.round(((p.bruto_akrual + bayar) * config.komisiPersen) / 100) - p.komisi_akrual
  return bayar - komisi
}

function statusTunai(k, p, views, hambatan, tertunda = 0) {
  if (!pakaiTunai(k)) return null
  const ambang = k.ambang_views_tunai
  const hakBersih = p.bruto_akrual - p.komisi_akrual + tertunda
  const siapCair = Math.max(0, hakBersih - p.bersih_dicairkan)
  const milestone = ambang > 0 ? Math.floor(views / ambang) : 0
  const bolehBaru = k.mode_pencairan === 'sekali' ? p.milestone_dicairkan === 0 : milestone > p.milestone_dicairkan
  const viewsBerikutnya =
    ambang <= 0
      ? null
      : k.mode_pencairan === 'sekali'
        ? p.milestone_dicairkan === 0 ? ambang : null
        : (Math.max(milestone, p.milestone_dicairkan) + (bolehBaru ? 0 : 1)) * ambang

  let kode
  if (p.hangus) kode = 'hangus'
  else if (k.status === 'selesai') kode = p.bersih_dicairkan > 0 ? 'dicairkan' : 'hangus'
  else if (ambang <= 0) kode = 'cair_saat_selesai'
  else if (milestone === 0) kode = 'belum_ambang'
  else if (!bolehBaru) kode = p.bersih_dicairkan > 0 ? 'dicairkan' : 'anggaran_habis'
  else if (siapCair <= 0) kode = p.bersih_dicairkan > 0 ? 'dicairkan' : 'anggaran_habis'
  else if (hambatan.length) kode = 'menunggu_verifikasi'
  else kode = 'memenuhi_syarat'

  return {
    kode,
    label: LABEL_STATUS[kode],
    ambang,
    milestone,
    milestoneDicairkan: p.milestone_dicairkan,
    viewsBerikutnya,
    hakBersih,
    sudahDicairkan: p.bersih_dicairkan,
    siapCair: kode === 'memenuhi_syarat' || kode === 'menunggu_verifikasi' ? siapCair : 0,
    tertahan: siapCair,
    hambatan,
  }
}

function statusProduk(k, p, views, hambatan) {
  if (!pakaiProduk(k)) return null
  const klaim = db.prepare('SELECT * FROM klaim_produk WHERE kampanye_id = ? AND kreator_id = ?').get(k.id, p.kreator_id)
  const sisaKuota = db
    .prepare('SELECT COALESCE(SUM(kuota - terklaim), 0) AS n FROM kampanye_produk WHERE kampanye_id = ?')
    .get(k.id).n
  let kode
  if (klaim) kode = { diproses: 'klaim_diproses', dikirim: 'produk_dikirim', diterima: 'produk_diterima' }[klaim.status]
  else if (k.status === 'selesai') kode = 'tidak_diklaim'
  else if (views < k.ambang_views_produk) kode = 'belum_ambang'
  else if (sisaKuota <= 0) kode = 'kuota_habis'
  else if (hambatan.length) kode = 'menunggu_verifikasi'
  else kode = 'memenuhi_syarat_produk'
  return {
    kode,
    label: LABEL_STATUS[kode],
    ambang: k.ambang_views_produk,
    sisaKuota,
    klaim: klaim
      ? {
          id: klaim.id,
          produkId: klaim.produk_id,
          produk: db.prepare('SELECT nama FROM produk WHERE id = ?').get(klaim.produk_id)?.nama || null,
          status: klaim.status,
          resi: klaim.resi,
          dibuatPada: klaim.dibuat_pada,
          dikirimPada: klaim.dikirim_pada,
        }
      : null,
    hambatan,
  }
}

/** Status reward seorang kreator di satu kampanye. null bila bukan peserta. */
export function statusReward(kampanyeId, kreatorId) {
  const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
  if (!k) throw galat404('Kampanye tidak ditemukan.')
  const p = ambilPeserta(kampanyeId, kreatorId)
  if (!p) return null
  const views = viewsKreator(kampanyeId, kreatorId)
  const hambatan = hambatanVerifikasi(kampanyeId, kreatorId)
  return {
    kampanyeId,
    views,
    tunai: statusTunai(k, p, views, hambatan, hakTertunda(k, p, views)),
    produk: statusProduk(k, p, views, hambatan),
    modePencairan: k.mode_pencairan,
  }
}

// ---------------------------------------------------------------------
//  Akrual, pencairan, penutupan (dipanggil dari dalam transaksi escrow.js)
// ---------------------------------------------------------------------

/**
 * Pindahkan hak reward yang belum dibayar dari escrow ke saldo tertahan
 * setiap kreator. Kumulatif dan idempoten: hak dihitung ulang dari total
 * views, lalu hanya selisihnya terhadap `bruto_akrual` yang dibayar. Bila
 * sisa pagu tidak cukup, kreator yang bergabung lebih dulu dibayar lebih dulu.
 */
export function akrualPeserta(k, sisaPagu) {
  const cpm = cpmDari(k)
  let biayaBaru = 0
  let komisiBaru = 0
  let viewsBaru = 0
  let sisa = Math.max(0, sisaPagu)

  for (const p of pesertaKampanye(k.id)) {
    const views = viewsKreator(k.id, p.kreator_id)
    viewsBaru += Math.max(0, views - p.views_terhitung)
    const kurang = Math.max(0, hakDariViews(views, cpm) - p.bruto_akrual)
    const bayar = Math.min(kurang, sisa)
    if (bayar > 0) {
      const bruto = p.bruto_akrual + bayar
      const komisi = Math.round((bruto * config.komisiPersen) / 100) - p.komisi_akrual
      db.prepare(
        'UPDATE lamaran SET bruto_akrual = ?, komisi_akrual = komisi_akrual + ?, views_terhitung = ? WHERE id = ?',
      ).run(bruto, komisi, views, p.id)
      ubahSaldo(p.kreator_id, { tertahan: bayar - komisi })
      sisa -= bayar
      biayaBaru += bayar
      komisiBaru += komisi
    } else if (views !== p.views_terhitung) {
      db.prepare('UPDATE lamaran SET views_terhitung = ? WHERE id = ?').run(views, p.id)
    }
  }
  return { biayaBaru, komisiBaru, viewsBaru }
}

/**
 * Pencairan reward yang sudah menjadi hak kreator, sebelum kampanye selesai.
 * Pemanggil menjalankan akrual (prosesPembayaran) lebih dulu supaya views
 * terbaru ikut dihitung. Satu kali per milestone: milestone yang sudah
 * dicairkan dicatat di baris yang sama di dalam transaksi ini, jadi dua klik
 * bersamaan tidak bisa mencairkan dua kali.
 */
export const cairkanReward = transaksional((kampanyeId, kreatorId) => {
  const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
  if (!k) throw galat404('Kampanye tidak ditemukan.')
  const p = ambilPeserta(kampanyeId, kreatorId)
  if (!p) throw galat403('Anda bukan kreator di kampanye ini.')
  const status = statusTunai(k, p, viewsKreator(kampanyeId, kreatorId), hambatanVerifikasi(kampanyeId, kreatorId))
  if (!status) throw galat409('Kampanye ini tidak memakai reward uang.')
  if (status.kode !== 'memenuhi_syarat') {
    const sebab =
      status.kode === 'menunggu_verifikasi'
        ? `Reward Anda belum bisa dicairkan: ${status.hambatan.join('; ')}.`
        : status.kode === 'belum_ambang'
          ? `Views tervalidasi Anda belum mencapai ${status.ambang.toLocaleString('id-ID')}.`
          : status.kode === 'cair_saat_selesai'
            ? 'Reward kampanye ini cair saat kampanye selesai.'
            : status.kode === 'dicairkan'
              ? 'Reward untuk milestone ini sudah dicairkan.'
              : status.label
    throw galat409(sebab)
  }

  const nominal = status.siapCair
  const milestoneBaru = k.mode_pencairan === 'sekali' ? 1 : status.milestone
  ubahSaldo(kreatorId, { saldo: nominal, tertahan: -nominal })
  db.prepare('UPDATE lamaran SET bersih_dicairkan = bersih_dicairkan + ?, milestone_dicairkan = ? WHERE id = ?').run(
    nominal,
    milestoneBaru,
    p.id,
  )
  catatTransaksi({
    penggunaId: kreatorId,
    kampanyeId,
    jenis: 'pencairan',
    arah: 'masuk',
    nominal,
    label: `Pencairan ${(milestoneBaru * status.ambang).toLocaleString('id-ID')} views — ${k.nama}`,
  })
  kirimNotifikasi(kreatorId, {
    jenis: 'dana',
    judul: 'Reward cair ke dompet Anda',
    isi: `${rupiah(nominal)} dari "${k.nama}" masuk ke saldo siap tarik.`,
    tautan: '/kreator/dompet',
  })
  return { nominal, milestone: milestoneBaru }
})

/**
 * Bagian kreator saat kampanye ditutup. Yang sudah mencapai ambang menerima
 * sisa hak bersihnya ke saldo siap tarik; yang belum, hangus dan bruto-nya
 * kembali ke escrow untuk dikembalikan ke UMKM. Dipanggil DI DALAM transaksi
 * selesaikanKampanye.
 */
export function selesaikanPeserta(k) {
  let dibayar = 0
  let hangusBruto = 0
  let hangusKomisi = 0
  for (const p of pesertaKampanye(k.id)) {
    const views = viewsKreator(k.id, p.kreator_id)
    const layak =
      !pakaiTunai(k) || k.ambang_views_tunai <= 0 || views >= k.ambang_views_tunai || p.bersih_dicairkan > 0
    const sisa = p.bruto_akrual - p.komisi_akrual - p.bersih_dicairkan
    if (layak) {
      if (sisa > 0) {
        ubahSaldo(p.kreator_id, { saldo: sisa, tertahan: -sisa })
        db.prepare('UPDATE lamaran SET bersih_dicairkan = bersih_dicairkan + ?, views_terhitung = ? WHERE id = ?').run(
          sisa,
          views,
          p.id,
        )
        catatTransaksi({
          penggunaId: p.kreator_id,
          kampanyeId: k.id,
          jenis: 'pencairan',
          arah: 'masuk',
          nominal: sisa,
          label: `Pencairan — ${k.nama}`,
        })
        kirimNotifikasi(p.kreator_id, {
          jenis: 'dana',
          judul: 'Dana cair ke dompet Anda',
          isi: `Kampanye "${k.nama}" tuntas. ${rupiah(sisa)} masuk ke dompet dan siap ditarik.`,
          tautan: '/kreator/dompet',
          email: true,
        })
        dibayar += sisa
      }
    } else {
      if (sisa > 0) ubahSaldo(p.kreator_id, { tertahan: -sisa })
      hangusBruto += p.bruto_akrual
      hangusKomisi += p.komisi_akrual
      db.prepare(
        'UPDATE lamaran SET hangus = 1, bruto_akrual = 0, komisi_akrual = 0, views_terhitung = ? WHERE id = ?',
      ).run(views, p.id)
      kirimNotifikasi(p.kreator_id, {
        jenis: 'dana',
        judul: 'Target minimal reward tidak tercapai',
        isi: `Kampanye "${k.nama}" selesai saat views tervalidasi Anda ${views.toLocaleString('id-ID')} dari minimal ${k.ambang_views_tunai.toLocaleString('id-ID')}. Reward uang tidak dibayarkan.`,
        tautan: `/kampanye/${k.id}`,
      })
    }
  }
  if (pakaiProduk(k)) kembalikanSisaProduk(k.id)
  return { dibayar, hangusBruto, hangusKomisi }
}

// ---------------------------------------------------------------------
//  Klaim produk
// ---------------------------------------------------------------------

export const klaimProduk = transaksional(({ kampanyeId, kreatorId, produkId, alamat }) => {
  const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
  if (!k) throw galat404('Kampanye tidak ditemukan.')
  if (!pakaiProduk(k)) throw galat409('Kampanye ini tidak memakai reward produk.')
  if (k.status !== 'berjalan') throw galat409('Klaim produk hanya bisa selama kampanye berjalan.')
  const p = ambilPeserta(kampanyeId, kreatorId)
  if (!p) throw galat403('Anda bukan kreator di kampanye ini.')
  const alamatRapi = pastikanTeks(alamat, 'Alamat pengiriman', { min: 15, maks: 300 })

  if (db.prepare('SELECT 1 FROM klaim_produk WHERE kampanye_id = ? AND kreator_id = ?').get(kampanyeId, kreatorId)) {
    throw galat409('Anda sudah mengklaim produk di kampanye ini.')
  }
  const views = viewsKreator(kampanyeId, kreatorId)
  if (views < k.ambang_views_produk) {
    throw galat409(
      `Views tervalidasi Anda ${views.toLocaleString('id-ID')}, minimal ${k.ambang_views_produk.toLocaleString('id-ID')} untuk klaim produk.`,
    )
  }
  const hambatan = hambatanVerifikasi(kampanyeId, kreatorId)
  if (hambatan.length) throw galat409(`Klaim belum bisa diproses: ${hambatan.join('; ')}.`)

  // Kuota dikurangi dengan syarat di WHERE, bukan baca-lalu-tulis, supaya dua
  // klaim bersamaan untuk unit terakhir tidak sama-sama lolos.
  const ambil = db
    .prepare('UPDATE kampanye_produk SET terklaim = terklaim + 1 WHERE kampanye_id = ? AND produk_id = ? AND terklaim < kuota')
    .run(kampanyeId, String(produkId || ''))
  if (ambil.changes !== 1) throw galat409('Kuota produk ini sudah habis. Pilih produk lain bila ada.')

  const simpan = db
    .prepare(
      `INSERT INTO klaim_produk (kampanye_id, produk_id, kreator_id, alamat, views_saat_klaim)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(kampanyeId, produkId, kreatorId, alamatRapi, views)

  const namaProduk = db.prepare('SELECT nama FROM produk WHERE id = ?').get(produkId)?.nama
  kirimNotifikasi(k.umkm_id, {
    jenis: 'kampanye',
    judul: 'Kreator mengklaim produk reward',
    isi: `Seorang kreator mencapai ${views.toLocaleString('id-ID')} views dan mengklaim ${namaProduk} dari "${k.nama}". Kirim produknya lalu isi nomor resi.`,
    tautan: `/umkm/kampanye/${k.id}/laporan`,
  })
  return { id: Number(simpan.lastInsertRowid), status: 'diproses' }
})

/** UMKM menandai produk sudah dikirim. */
export function tandaiProdukDikirim({ klaimId, umkmId, resi }) {
  const klaim = db.prepare('SELECT * FROM klaim_produk WHERE id = ?').get(klaimId)
  if (!klaim) throw galat404('Klaim tidak ditemukan.')
  const k = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(klaim.kampanye_id)
  if (!k || k.umkm_id !== umkmId) throw galat403()
  if (klaim.status !== 'diproses') throw galat409('Klaim ini sudah ditandai dikirim.')
  const resiRapi = resi ? pastikanTeks(resi, 'Nomor resi', { min: 4, maks: 60, wajibHuruf: false }) : null
  db.prepare("UPDATE klaim_produk SET status = 'dikirim', resi = ?, dikirim_pada = ? WHERE id = ?").run(
    resiRapi,
    sekarang(),
    klaim.id,
  )
  kirimNotifikasi(klaim.kreator_id, {
    jenis: 'kampanye',
    judul: 'Produk reward sudah dikirim',
    isi: `Produk dari "${k.nama}" sudah dikirim${resiRapi ? `, resi ${resiRapi}` : ''}.`,
    tautan: `/kampanye/${k.id}`,
  })
}

/** Kreator menandai produk sudah sampai. */
export function tandaiProdukDiterima({ klaimId, kreatorId }) {
  const klaim = db.prepare('SELECT * FROM klaim_produk WHERE id = ?').get(klaimId)
  if (!klaim) throw galat404('Klaim tidak ditemukan.')
  if (klaim.kreator_id !== kreatorId) throw galat403()
  if (klaim.status !== 'dikirim') throw galat409('Produk belum ditandai dikirim oleh pemilik usaha.')
  db.prepare("UPDATE klaim_produk SET status = 'diterima' WHERE id = ?").run(klaim.id)
}

/** Daftar klaim produk sebuah kampanye (untuk UMKM). */
export function klaimKampanye(kampanyeId) {
  return db
    .prepare(
      `SELECT kp.*, p.nama AS nama_produk, u.nama AS nama_kreator
       FROM klaim_produk kp JOIN produk p ON p.id = kp.produk_id JOIN pengguna u ON u.id = kp.kreator_id
       WHERE kp.kampanye_id = ? ORDER BY kp.dibuat_pada DESC`,
    )
    .all(kampanyeId)
    .map((r) => ({
      id: r.id,
      kreatorId: r.kreator_id,
      kreator: r.nama_kreator,
      produkId: r.produk_id,
      produk: r.nama_produk,
      status: r.status,
      label: LABEL_STATUS[{ diproses: 'klaim_diproses', dikirim: 'produk_dikirim', diterima: 'produk_diterima' }[r.status]],
      alamat: r.alamat,
      resi: r.resi,
      viewsSaatKlaim: r.views_saat_klaim,
      dibuatPada: r.dibuat_pada,
      dikirimPada: r.dikirim_pada,
    }))
}

// ---------------------------------------------------------------------
//  Kapasitas kampanye
// ---------------------------------------------------------------------

/**
 * Masih menerima kreator? Reward harus tersedia dan tenggat kampanye belum lewat.
 */
export function sisaKampanye(k) {
  const escrow = db.prepare('SELECT * FROM escrow WHERE kampanye_id = ?').get(k.id)
  const pagu = escrow ? Math.min(escrow.jumlah_disetor, k.batas_maks_biaya || escrow.jumlah_disetor) : 0
  const sisaDana = pakaiTunai(k) && escrow ? Math.max(0, pagu - escrow.jumlah_dicairkan) : 0
  const sisaKuota = pakaiProduk(k)
    ? db.prepare('SELECT COALESCE(SUM(kuota - terklaim), 0) AS n FROM kampanye_produk WHERE kampanye_id = ?').get(k.id).n
    : 0
  const mulai = k.diterbitkan_pada ? Date.parse(`${String(k.diterbitkan_pada).replace(' ', 'T')}Z`) : NaN
  const belumLewatTenggat = !Number.isFinite(mulai) || Date.now() < mulai + Number(k.tenggat_hari) * 86_400_000
  return { sisaDana, sisaKuota, menerima: k.status === 'berjalan' && belumLewatTenggat && (sisaDana > 0 || sisaKuota > 0) }
}

export const jumlahPeserta = (kampanyeId) =>
  db.prepare("SELECT COUNT(*) AS n FROM lamaran WHERE kampanye_id = ? AND status = 'disetujui'").get(kampanyeId).n

/** Ringkasan peserta untuk UMKM: views dan reward tiap kreator. */
export function ringkasPeserta(k) {
  return pesertaKampanye(k.id).map((p) => {
    const nama = db.prepare('SELECT nama FROM pengguna WHERE id = ?').get(p.kreator_id)?.nama
    const status = statusReward(k.id, p.kreator_id)
    return {
      kreatorId: p.kreator_id,
      nama,
      views: status.views,
      rewardBruto: p.bruto_akrual,
      dicairkan: p.bersih_dicairkan,
      tunai: status.tunai ? { kode: status.tunai.kode, label: status.tunai.label } : null,
      produk: status.produk ? { kode: status.produk.kode, label: status.produk.label } : null,
    }
  })
}
