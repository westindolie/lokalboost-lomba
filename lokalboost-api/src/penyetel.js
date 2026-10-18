/**
 * Usulan penyetelan AI — jalankan: npm run setel
 *
 * Membaca keputusan manusia yang sudah tercatat (sengketa yang dimenangkan
 * kreator, kreator yang benar-benar dipilih UMKM), lalu mengusulkan angka
 * baru untuk sepuluh angka yang menyusun "kecerdasan" LokalBoost.
 *
 * Skrip ini tidak mengubah apa pun. Ia mencetak baris .env yang tinggal
 * disalin — keputusannya tetap milik manusia. Penjelasan lengkap alasannya
 * ada di MELATIH-AI.md.
 */
import { usulanPenyetelan } from './services/penyetel.js'

const tebal = (t) => `\x1b[1m${t}\x1b[0m`
const hijau = (t) => `\x1b[32m${t}\x1b[0m`
const kuning = (t) => `\x1b[33m${t}\x1b[0m`
const redup = (t) => `\x1b[90m${t}\x1b[0m`

const garis = () => console.log(redup('─'.repeat(72)))

const hasil = usulanPenyetelan()
const { antiFraud, matchmaker } = hasil

console.log(`\n${tebal('PENYETEL AI LOKALBOOST')}`)
garis()

// ---------------------------------------------------------------------
console.log(`\n${tebal('1. Anti-Fraud')} ${redup('— ambang penyaringan tayangan')}\n`)

if (!antiFraud.totalDisaring) {
  console.log(redup('  Belum ada tayangan yang tersaring. Tidak ada yang bisa diukur.'))
} else {
  console.log(
    `  ${antiFraud.totalDisaring} tayangan disaring, ${antiFraud.totalDipulihkan} di antaranya ` +
      `dipulihkan admin lewat sengketa (${antiFraud.persenSalahKeseluruhan}% salah-saring).`,
  )

  if (antiFraud.usulan.length === 0) {
    console.log(`\n  ${hijau('Tidak ada ambang yang perlu digeser.')}`)
  }

  for (const u of antiFraud.usulan) {
    console.log(`\n  ${kuning('USULAN')} ${u.env}: ${u.sekarang} → ${tebal(String(u.disarankan))} ${u.satuan}`)
    console.log(`         aturan  : ${u.alasan}`)
    console.log(
      `         bukti   : ${u.bukti.dipulihkan} dari ${u.bukti.totalDisaring} penyaringan ` +
        `dinyatakan keliru oleh admin (${u.bukti.persenSalah}%)`,
    )
    console.log(`         artinya : ${u.arah}`)
    console.log(redup(`         ${u.catatan}`))
  }

  for (const d of antiFraud.diabaikan) {
    console.log(`\n  ${redup('DILEWATI')} ${d.alasan}`)
    console.log(redup(`         ${d.sebab}`))
  }
}

// ---------------------------------------------------------------------
console.log(`\n${tebal('2. Smart Matchmaker')} ${redup('— bobot rekomendasi kreator')}\n`)

if (!matchmaker.jumlahKeputusan) {
  console.log(redup(`  ${matchmaker.catatan || 'Belum ada keputusan yang tercatat.'}`))
} else {
  console.log(
    `  ${matchmaker.jumlahKeputusan} keputusan tercatat. Rekomendasi teratas dipilih ` +
      `${matchmaker.persenPeringkat1}% kali; rerata peringkat yang dipilih ${matchmaker.rerataPeringkat}.`,
  )

  if (matchmaker.usulan.length === 0) {
    if (matchmaker.perkiraan) console.log(`\n  ${hijau('Bobot sekarang sudah yang terbaik dari yang dicoba.')}`)
    console.log(redup(`  ${matchmaker.catatanUsulan}`))
  } else {
    console.log(redup(`\n  ${matchmaker.catatanUsulan}`))
    console.log(
      redup(
        `  Direplay atas ${matchmaker.jumlahDireplay} keputusan; bobot sekarang mencapai ` +
          `${matchmaker.ketepatanSekarangHasilReplay.persenPeringkat1}% di replay yang sama.`,
      ),
    )
    for (const u of matchmaker.usulan) {
      console.log(`\n  ${kuning('USULAN')} ${u.label}`)
      console.log(`         ketepatan peringkat-1: ${tebal(`${u.persenPeringkat1}%`)} (rerata peringkat ${u.rerataPeringkat})`)
      console.log(redup(`         bobot: ${JSON.stringify(u.bobot)}`))
      console.log(redup('         Ubah di services/matchmaker.js pada objek BOBOT.'))
    }
  }
}

// ---------------------------------------------------------------------
console.log('')
garis()

if (hasil.barisEnv.length) {
  console.log(`\n${tebal('Salin ke .env lalu nyalakan ulang server:')}\n`)
  for (const baris of hasil.barisEnv) console.log(`  ${hijau(baris)}`)
} else {
  console.log(`\n  ${hijau('Tidak ada yang perlu diubah di .env.')}`)
}

console.log(`
${redup('Catatan penting:')}
${redup('Alat ini hanya bisa mengusulkan PELONGGARAN, karena satu-satunya data')}
${redup('berlabel yang dimiliki sistem adalah penyaringan yang dinyatakan keliru')}
${redup('oleh admin. Kecurangan yang LOLOS tidak pernah ditandai siapa pun, jadi')}
${redup('tidak ada bukti yang bisa menyuruh kita memperketat. Baca MELATIH-AI.md.')}
`)
