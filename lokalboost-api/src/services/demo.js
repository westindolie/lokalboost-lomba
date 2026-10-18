import { db, transaksional } from '../lib/db.js'
import { config } from '../config.js'
import { galat403, galat404, galat409, rupiah, sekarang } from '../lib/util.js'
import { catatTransaksi, ubahSaldo } from './buku-kas.js'
import { kirimNotifikasi } from './notifikasi.js'

/**
 * Tutup kampanye demo setelah kreator mengirim video yang lolos pemeriksaan.
 * Tidak membuat tayangan palsu. Anggaran simulasi dibagi rata kepada kreator
 * yang sudah bergabung dan videonya tayang, lalu ditandai jelas di buku kas.
 */
export const simulasiPencairanKampanye = transaksional((kampanyeId, kreatorId) => {
  if (!config.modeDemo) throw galat404('Fitur demo tidak aktif.')

  const kampanye = db.prepare('SELECT * FROM kampanye WHERE id = ?').get(kampanyeId)
  if (!kampanye) throw galat404('Kampanye tidak ditemukan.')
  if (kampanye.status !== 'berjalan') throw galat409('Kampanye demo harus berstatus berjalan.')
  if (kampanye.model_reward !== 'tunai') throw galat409('Simulasi saldo hanya untuk kampanye reward tunai.')

  const pendanaanDemo = db.prepare(
    "SELECT 1 FROM transaksi WHERE kampanye_id = ? AND jenis = 'setor' AND label LIKE 'DEMO:%' LIMIT 1",
  ).get(kampanyeId)
  if (!pendanaanDemo) throw galat409('Pencairan simulasi hanya tersedia untuk kampanye yang didanai dalam mode demo.')

  const dana = db.prepare('SELECT * FROM escrow WHERE kampanye_id = ?').get(kampanyeId)
  if (!dana || dana.jumlah_disetor <= 0) throw galat409('Anggaran demo belum tersedia.')
  if (dana.jumlah_dicairkan > 0) throw galat409('Simulasi instan harus dilakukan sebelum ada reward views yang terakru.')

  const peserta = db.prepare(
    `SELECT l.id, l.kreator_id, p.nama
     FROM lamaran l JOIN pengguna p ON p.id = l.kreator_id
     WHERE l.kampanye_id = ? AND l.status = 'disetujui'
       AND EXISTS (
         SELECT 1 FROM video v WHERE v.kampanye_id = l.kampanye_id
           AND v.kreator_id = l.kreator_id AND v.status = 'tayang'
       )
     ORDER BY l.dibuat_pada, l.kreator_id`,
  ).all(kampanyeId)
  if (!peserta.some((p) => p.kreator_id === kreatorId)) {
    throw galat403('Kirim tautan video dan pastikan videonya lolos pemeriksaan sebelum mencairkan saldo demo.')
  }

  const pagu = Math.min(dana.jumlah_disetor, kampanye.batas_maks_biaya || dana.jumlah_disetor)
  const total = Math.max(0, pagu - dana.jumlah_dicairkan)
  if (total <= 0) throw galat409('Tidak ada anggaran tunai tersisa untuk simulasi.')
  if (total < peserta.length) {
    throw galat409('Anggaran demo harus cukup untuk memberi minimal Rp1 kepada setiap kreator yang mengirim video.')
  }

  const bagianDasar = Math.floor(total / peserta.length)
  let sisaBagi = total - bagianDasar * peserta.length
  for (const p of peserta) {
    const nominal = bagianDasar + (sisaBagi > 0 ? 1 : 0)
    if (sisaBagi > 0) sisaBagi -= 1
    if (nominal <= 0) continue

    ubahSaldo(p.kreator_id, { saldo: nominal })
    db.prepare(
      `UPDATE lamaran SET bruto_akrual = bruto_akrual + ?, bersih_dicairkan = bersih_dicairkan + ?
       WHERE id = ?`,
    ).run(nominal, nominal, p.id)
    catatTransaksi({
      penggunaId: p.kreator_id,
      kampanyeId,
      jenis: 'pencairan',
      arah: 'masuk',
      nominal,
      label: `DEMO: Reward simulasi tanpa views — ${kampanye.nama}`,
    })
    kirimNotifikasi(p.kreator_id, {
      jenis: 'dana',
      judul: 'Saldo demo masuk ke dompet',
      isi: `${rupiah(nominal)} dari simulasi kampanye "${kampanye.nama}" masuk ke dompet. Tidak ada tayangan atau transfer uang sungguhan.`,
      tautan: '/kreator/dompet',
    })
  }

  db.prepare(
    "UPDATE lamaran SET hangus = 1 WHERE kampanye_id = ? AND status = 'disetujui' AND bersih_dicairkan = 0",
  ).run(kampanyeId)

  const dikembalikan = dana.jumlah_disetor - total
  if (dikembalikan > 0) {
    ubahSaldo(kampanye.umkm_id, { saldo: dikembalikan })
    catatTransaksi({
      penggunaId: kampanye.umkm_id,
      kampanyeId,
      jenis: 'refund',
      arah: 'masuk',
      nominal: dikembalikan,
      label: `DEMO: Sisa anggaran simulasi kembali — ${kampanye.nama}`,
    })
  }

  db.prepare(
    `UPDATE escrow SET jumlah_dicairkan = ?, jumlah_dikembalikan = ?, status = 'selesai', diperbarui_pada = ?
     WHERE kampanye_id = ?`,
  ).run(total, dikembalikan, sekarang(), kampanyeId)
  db.prepare("UPDATE kampanye SET status = 'selesai', selesai_pada = ? WHERE id = ?").run(sekarang(), kampanyeId)

  kirimNotifikasi(kampanye.umkm_id, {
    jenis: 'kampanye',
    judul: 'Simulasi kampanye selesai',
    isi: `Demo "${kampanye.nama}" selesai. Saldo dibagikan ke ${peserta.length} kreator tanpa menunggu views.`,
    tautan: `/umkm/kampanye/${kampanyeId}/laporan`,
  })

  return {
    pesan: 'Simulasi selesai. Saldo demo sudah masuk ke dompet kreator tanpa membuat tayangan.',
    kampanyeId,
    kreatorDibayar: peserta.length,
    totalDibayar: total,
    dikembalikan,
    demo: true,
  }
})
