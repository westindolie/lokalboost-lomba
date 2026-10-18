import { buatApp } from './app.js'
import { config, periksaProduksi } from './config.js'
import { aiAktif, penyediaAi } from './services/ai.js'
import { periksaKoneksiSurel, surelAktif } from './services/surel.js'

// Lebih baik menolak menyala daripada berjalan diam-diam dengan lubang.
const { fatal, peringatan } = periksaProduksi()
for (const p of peringatan) console.warn(`\n  PERINGATAN: ${p}\n`)
if (fatal.length) {
  for (const p of fatal) console.error(`\n  ${p}\n`)
  process.exit(1)
}

const app = buatApp()

app.listen(config.port, async () => {
  console.log('')
  console.log('  LokalBoost API')
  console.log(`  Berjalan di      http://localhost:${config.port}`)
  console.log(`  Basis data       ${config.dbPath}`)
  console.log(`  Komisi platform  ${config.komisiPersen}%`)
  console.log(`  Model bahasa     ${aiAktif() ? `${penyediaAi().nama} (${penyediaAi().model})` : 'nonaktif (pakai template)'}`)
  console.log(`  Frontend         ${config.asalDiizinkan.join(', ')}`)
  if (!surelAktif()) {
    console.log('  Kode OTP         dicetak ke log (SMTP belum diatur)')
  } else {
    const siap = await periksaKoneksiSurel()
    console.log(
      `  Kode OTP         ${siap ? `dikirim lewat ${config.surel.host} sebagai ${config.surel.pengguna}` : 'SMTP DITOLAK — cek SMTP_PENGGUNA/SMTP_SANDI'}`,
    )
  }
  console.log('')
})
