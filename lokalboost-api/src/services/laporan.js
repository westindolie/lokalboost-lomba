import { db } from '../lib/db.js'
import { galat404 } from '../lib/util.js'
import { laporanAntiFraud } from './antifraud.js'
import { ringkasEscrow } from './escrow.js'
import { jumlahPeserta, viewsKampanye, viewsKreator } from './reward.js'

const HARI_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

/**
 * Dasbor Laporan Hasil (PRD §8.1) — sumber angka tunggal untuk halaman
 * laporan UMKM, dashboard kreator, dan bahan masukan AI Auto-Report Summary.
 * Semua turunan dihitung dari tabel `tayangan`, jadi tidak ada angka yang
 * disimpan ganda dan berisiko tidak sinkron.
 */
export function statistikKampanye(kampanyeId) {
  const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
  if (!kampanye) throw galat404('Kampanye tidak ditemukan.')

  const fraud = laporanAntiFraud(kampanyeId)
  const keuangan = ringkasEscrow(kampanyeId)
  // Video tautan menambah views dari platform di atas tayangan pemutar LokalBoost.
  const semua = viewsKampanye(kampanyeId)
  const viewsTautan = semua.tervalidasi - fraud.tervalidasi

  const persenTarget = kampanye.target_views
    ? Number(((semua.tervalidasi / kampanye.target_views) * 100).toFixed(1))
    : 0

  // Tujuh hari terakhir, termasuk hari yang nol tayangan supaya grafiknya
  // tidak "melompat" dan salah dibaca sebagai naik terus.
  const perHari = db
    .prepare(
      `SELECT date(waktu) AS tanggal, COUNT(*) AS jumlah
       FROM tayangan
       WHERE kampanye_id = ? AND valid = 1
       GROUP BY tanggal`,
    )
    .all(kampanyeId)
  const petaHari = new Map(perHari.map((r) => [r.tanggal, r.jumlah]))

  const viewsHarian = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    const kunci = d.toISOString().slice(0, 10)
    viewsHarian.push({
      tanggal: kunci,
      hari: HARI_ID[d.getDay()],
      views: petaHari.get(kunci) || 0,
    })
  }

  const perKota = db
    .prepare(
      `SELECT COALESCE(kota, 'Lainnya') AS kota, COUNT(*) AS jumlah
       FROM tayangan
       WHERE kampanye_id = ? AND valid = 1
       GROUP BY kota ORDER BY jumlah DESC`,
    )
    .all(kampanyeId)

  const totalKota = perKota.reduce((a, r) => a + r.jumlah, 0)
  const sebaranLokasi = perKota.slice(0, 5).map((r) => ({
    kota: r.kota,
    jumlah: r.jumlah,
    persen: totalKota ? Number(((r.jumlah / totalKota) * 100).toFixed(1)) : 0,
  }))

  const rerataDurasi = db
    .prepare('SELECT AVG(durasi_tonton) AS d FROM tayangan WHERE kampanye_id = ? AND valid = 1')
    .get(kampanyeId).d

  return {
    kampanyeId,
    nama: kampanye.nama,
    status: kampanye.status,
    targetViews: kampanye.target_views,
    tervalidasi: semua.tervalidasi,
    viewsTautan,
    viewsTertahan: semua.tertahan,
    disaring: fraud.disaring,
    // Tayangan pemutar LokalBoost + kenaikan views video tautan (diakui + ditahan).
    totalTayangan: fraud.totalTayangan + viewsTautan + semua.tertahan,
    persenTarget,
    rerataDurasiTonton: rerataDurasi ? Number(rerataDurasi.toFixed(1)) : 0,
    kotaTeratas: sebaranLokasi[0]?.kota || null,
    viewsHarian,
    sebaranLokasi,
    antiFraud: fraud,
    keuangan,
    biayaTerpakai: keuangan.terpakai,
    sisaDikembalikan: keuangan.dikembalikan,
  }
}

/** Angka ringkas untuk kartu di dashboard UMKM. */
export function ringkasanUmkm(umkmId) {
  const kampanye = db.prepare('SELECT * FROM kampanye WHERE umkm_id = ?').all(umkmId)
  const ids = kampanye.map((k) => k.id)

  const hitungViews = (daftarId, valid) => {
    if (!daftarId.length) return 0
    const tanda = daftarId.map(() => '?').join(',')
    return db
      .prepare(`SELECT COUNT(*) AS n FROM tayangan WHERE kampanye_id IN (${tanda}) AND valid = ?`)
      .get(...daftarId, valid ? 1 : 0).n
  }

  const dompet = db.prepare('SELECT * FROM dompet WHERE pengguna_id = ?').get(umkmId) || { saldo: 0 }
  const totalDitahan = db
    .prepare(
      `SELECT COALESCE(SUM(e.jumlah_disetor - e.jumlah_dicairkan), 0) AS n
       FROM escrow e JOIN kampanye k ON k.id = e.kampanye_id
       WHERE k.umkm_id = ? AND k.status != 'selesai'`,
    )
    .get(umkmId).n

  return {
    totalKampanye: kampanye.length,
    berjalan: kampanye.filter((k) => k.status === 'berjalan').length,
    berjalanTanpaKreator: kampanye.filter((k) => k.status === 'berjalan' && jumlahPeserta(k.id) === 0).length,
    selesai: kampanye.filter((k) => k.status === 'selesai').length,
    totalViewsTervalidasi: hitungViews(ids, true),
    totalViewsDisaring: hitungViews(ids, false),
    danaDiRekber: totalDitahan,
    saldoDompet: dompet.saldo,
  }
}

/** Angka ringkas untuk dashboard kreator. */
export function ringkasanKreator(kreatorId) {
  const kampanye = db.prepare(`SELECT * FROM kampanye k WHERE EXISTS (SELECT 1 FROM lamaran lp WHERE lp.kampanye_id = k.id AND lp.kreator_id = ? AND lp.status = 'disetujui')`).all(kreatorId)
  const dompet = db.prepare('SELECT * FROM dompet WHERE pengguna_id = ?').get(kreatorId) || {
    saldo: 0,
    saldo_tertahan: 0,
  }
  const ulasan = db
    .prepare('SELECT AVG(bintang) AS rerata, COUNT(*) AS jumlah FROM ulasan WHERE dinilai_id = ?')
    .get(kreatorId)

  // Views milik kreator ini saja: satu kampanye bisa diikuti banyak kreator.
  const totalViews = kampanye.reduce((jumlah, k) => jumlah + viewsKreator(k.id, kreatorId), 0)

  return {
    kampanyeBerjalan: kampanye.filter((k) => k.status === 'berjalan').length,
    kampanyeSelesai: kampanye.filter((k) => k.status === 'selesai').length,
    totalViewsTervalidasi: totalViews,
    saldo: dompet.saldo,
    saldoTertahan: dompet.saldo_tertahan,
    rating: ulasan.jumlah ? Number(ulasan.rerata.toFixed(2)) : null,
    jumlahUlasan: ulasan.jumlah,
  }
}
