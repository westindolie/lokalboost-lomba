/**
 * Bagikan LokalBoost ke internet lewat satu tautan — jalankan: npm run bagikan
 * ------------------------------------------------------------------
 * Menyalakan aplikasi UTUH (frontend + API) di satu alamat, lalu membuka
 * Cloudflare Quick Tunnel sehingga teman mana pun bisa membukanya dari
 * ponsel atau laptop mereka. Gratis, tanpa akun, tanpa kartu.
 *
 * Syaratnya jujur: tautannya hidup selama skrip ini berjalan. Tutup
 * terminalnya, tautannya mati. Ini memang cara berbagi cepat, bukan
 * penyebaran (deployment).
 *
 * Tiga hal disetel khusus untuk sesi berbagi, dan tidak menyentuh .env:
 *   - JWT_SECRET diacak baru. Nilai bawaan ada di dalam repositori; siapa pun
 *     yang membacanya bisa memalsukan token, dan tautan ini publik.
 *   - SMTP dimatikan. Kode OTP muncul di layar teman, jadi tidak ada email
 *     keluar dari akun Gmail pribadi pemilik dan kuota kirimnya tidak
 *     terpakai.
 *   - BOCORKAN_OTP dinyalakan, sebagai konsekuensi dari poin di atas.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const dirIni = path.dirname(fileURLToPath(import.meta.url))
const AKAR_API = path.resolve(dirIni, '..')
const AKAR_WEB = path.resolve(AKAR_API, '..', 'lokalboost-web')
const FOLDER_DIST = path.join(AKAR_WEB, 'dist')

const PORT = Number(process.env.PORT || 4000)

const hijau = (t) => `\x1b[32m${t}\x1b[0m`
const kuning = (t) => `\x1b[33m${t}\x1b[0m`
const merah = (t) => `\x1b[31m${t}\x1b[0m`
const tebal = (t) => `\x1b[1m${t}\x1b[0m`
const redup = (t) => `\x1b[90m${t}\x1b[0m`

/** Lokasi cloudflared: dari env, dari PATH, atau tempat pemasangan biasa. */
function cariCloudflared() {
  if (process.env.CLOUDFLARED && fs.existsSync(process.env.CLOUDFLARED)) {
    return process.env.CLOUDFLARED
  }
  const kandidat = [
    path.join(process.env.USERPROFILE || '', 'cloudflared', 'cloudflared.exe'),
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ]
  for (const c of kandidat) {
    if (c && fs.existsSync(c)) return c
  }
  return 'cloudflared' // semoga ada di PATH
}

function jalankan(perintah, argumen, opsi = {}) {
  return new Promise((selesai, gagal) => {
    const anak = spawn(perintah, argumen, { stdio: 'inherit', shell: true, ...opsi })
    anak.on('error', gagal)
    anak.on('close', (kode) =>
      kode === 0 ? selesai() : gagal(new Error(`${perintah} keluar dengan kode ${kode}`)),
    )
  })
}

// ---------------------------------------------------------------------
//  1. Bangun frontend
// ---------------------------------------------------------------------
console.log(`\n${tebal('BAGIKAN LOKALBOOST')}`)
console.log(redup('─'.repeat(64)))

if (!fs.existsSync(path.join(AKAR_WEB, 'package.json'))) {
  console.error(merah(`\nFolder frontend tidak ditemukan di ${AKAR_WEB}`))
  process.exit(1)
}

console.log(`\n${kuning('1/3')} Membangun frontend…`)
try {
  await jalankan('npm', ['run', 'build'], { cwd: AKAR_WEB })
} catch (galat) {
  console.error(merah(`\nBuild frontend gagal: ${galat.message}`))
  process.exit(1)
}

if (!fs.existsSync(path.join(FOLDER_DIST, 'index.html'))) {
  console.error(merah(`\nBuild selesai tapi ${FOLDER_DIST}/index.html tidak ada.`))
  process.exit(1)
}

// ---------------------------------------------------------------------
//  2. Nyalakan server (frontend + API, satu asal)
// ---------------------------------------------------------------------
console.log(`\n${kuning('2/3')} Menyalakan server di port ${PORT}…`)

// Disetel SEBELUM config.js diimpor — config membaca process.env sekali,
// saat modulnya dimuat.
process.env.FOLDER_WEB = FOLDER_DIST
process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64url')
process.env.SMTP_HOST = ''
process.env.SMTP_PENGGUNA = ''
process.env.SMTP_SANDI = ''
process.env.BOCORKAN_OTP = 'true'

await import('./seed-bila-kosong.js')
const { buatApp } = await import('./app.js')

const server = buatApp().listen(PORT)
await new Promise((r) => server.once('listening', r))
console.log(redup(`      http://localhost:${PORT} (lokal)`))

// ---------------------------------------------------------------------
//  3. Buka terowongan
// ---------------------------------------------------------------------
console.log(`\n${kuning('3/3')} Membuka terowongan Cloudflare…`)

const cloudflared = cariCloudflared()
const terowongan = spawn(
  cloudflared,
  ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

terowongan.on('error', (galat) => {
  console.error(merah(`\nGagal menjalankan cloudflared (${cloudflared}): ${galat.message}`))
  console.error(redup('Unduh dari https://github.com/cloudflare/cloudflared/releases'))
  console.error(redup('lalu arahkan lewat variabel CLOUDFLARED=<path ke cloudflared.exe>'))
  process.exit(1)
})

let alamatTampil = false

function bacaKeluaran(potongan) {
  const teks = potongan.toString()
  const cocok = teks.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
  if (cocok && !alamatTampil) {
    alamatTampil = true
    const alamat = cocok[0]
    console.log(`\n${redup('─'.repeat(64))}`)
    console.log(`\n  ${tebal('Kirim tautan ini ke teman kamu:')}\n`)
    console.log(`      ${hijau(tebal(alamat))}\n`)
    console.log(`  ${redup('Akun untuk mereka coba (ada tombolnya di halaman Masuk):')}`)
    console.log(`  ${redup('    UMKM     busari@warungsunda.id / lokalboost123')}`)
    console.log(`  ${redup('    Kreator  rafi@kreator.id        / lokalboost123')}`)
    console.log(`  ${redup('    Admin    admin@lokalboost.id    / lokalboost123  (ketik manual)')}`)
    console.log(`\n  ${redup('Kalau mereka mendaftar akun baru, kode verifikasinya muncul')}`)
    console.log(`  ${redup('langsung di layar mereka — tidak perlu buka email.')}`)
    console.log(`\n  ${kuning('Tautan hidup selama jendela ini terbuka. Tekan Ctrl+C untuk menutup.')}`)
    console.log(`\n${redup('─'.repeat(64))}\n`)
  }
}

terowongan.stdout.on('data', bacaKeluaran)
terowongan.stderr.on('data', bacaKeluaran) // cloudflared menulis alamatnya ke stderr

// ---------------------------------------------------------------------

let menutup = false
function tutup() {
  if (menutup) return
  menutup = true
  console.log(`\n${redup('Menutup terowongan dan server…')}`)
  terowongan.kill()
  server.close(() => process.exit(0))
  // Jangan menggantung kalau masih ada koneksi terbuka dari sisi teman.
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGINT', tutup)
process.on('SIGTERM', tutup)
terowongan.on('close', () => {
  if (!menutup) {
    console.error(merah('\nTerowongan tertutup dari sisi Cloudflare. Jalankan ulang skrip ini.'))
    tutup()
  }
})
