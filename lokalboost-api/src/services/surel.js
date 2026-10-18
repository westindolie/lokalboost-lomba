import nodemailer from 'nodemailer'
import { config } from '../config.js'

/**
 * Pengiriman surel (email) — dipakai untuk kode verifikasi OTP.
 * ------------------------------------------------------------------
 * Sama seperti services/ai.js, modul ini sengaja punya dua mode:
 *
 *   - SMTP terisi  → kode benar-benar dikirim ke inbox pengguna.
 *   - SMTP kosong  → kode hanya dicetak ke log server (perilaku lama).
 *
 * Backend tidak boleh gagal mendaftarkan pengguna hanya karena server surel
 * sedang rewel, jadi kegagalan kirim dicatat sebagai peringatan, bukan galat
 * yang membatalkan pendaftaran.
 */

const { host, port, aman, pengguna, sandi, dari } = config.surel

/**
 * Berkas tes memakai basis data sementara, tapi SMTP-nya nyata — sampai
 * pemeriksaan ini ditambahkan, `npm test` benar-benar mengirim puluhan email
 * ke alamat karangan seperti "tebakan@tes.id", membakar kuota kirim akun
 * Gmail pemiliknya dan memanen bounce. Tes tidak boleh menyentuh dunia luar.
 */
const dalamTes = process.env.NODE_ENV === 'test'

const pengangkut =
  host && pengguna && sandi && !dalamTes
    ? nodemailer.createTransport({
        host,
        port,
        secure: aman,
        auth: { user: pengguna, pass: sandi },
      })
    : null

export const surelAktif = () => Boolean(pengangkut)

/** Alamat pengirim; default memakai akun SMTP itu sendiri. */
const alamatDari = dari || (pengguna ? `LokalBoost <${pengguna}>` : '')

/** Tebakan sederhana: identitas yang mengandung "@" diperlakukan sebagai email. */
export const tampakEmail = (identitas) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(identitas || ''))

/**
 * Domain yang dicadangkan untuk contoh & pengujian (RFC 2606 / 6761) tidak
 * pernah punya inbox. Mengirim ke sana hanya memantul kembali ke akun Gmail
 * pengirim sebagai "Address not found" — tiap uji asap di server sungguhan
 * menambah satu pantulan dan menurunkan reputasi alamat pengirimnya.
 */
const DOMAIN_CADANGAN = /\.(test|example|invalid|localhost)$|(^|\.)example\.(com|net|org)$/i
const bolehDikirimi = (alamat) =>
  tampakEmail(alamat) && !DOMAIN_CADANGAN.test(String(alamat).split('@')[1])

/**
 * Cek koneksi SMTP sekali saat server menyala supaya salah sandi ketahuan
 * di terminal, bukan saat pengguna pertama menunggu kodenya.
 */
export async function periksaKoneksiSurel() {
  if (!pengangkut) return false
  try {
    await pengangkut.verify()
    return true
  } catch (galat) {
    console.warn(`[SUREL] Koneksi SMTP gagal: ${galat.message}`)
    return false
  }
}

/**
 * Satu kerangka untuk semua surel keluar. Kode OTP dan notifikasi memakai
 * kerangka yang sama supaya inbox penerima mengenali pengirimnya tanpa perlu
 * membaca — konsistensi rupa itu bagian dari identitas merek, bukan hiasan.
 */
function kerangkaHtml({ judul, isi, penutup = '' }) {
  return `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#F5F3EF;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1C1A17">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8A8375">LokalBoost</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600">${judul}</h1>
    ${isi}
    ${penutup}
  </div>
</body></html>`
}

/**
 * Kata-kata per tujuan kode.
 *
 * Satu email berbunyi "verifikasi akun" untuk kode yang sebenarnya menyetujui
 * pencairan dana adalah kebohongan kecil dengan akibat besar: penerima tidak
 * bisa mengenali kalau ada orang lain yang sedang mencoba menarik uangnya.
 * Sebutkan tindakannya apa adanya.
 */
const KATA_TUJUAN = {
  verifikasi: {
    subjek: 'kode verifikasi LokalBoost kamu',
    judul: 'Kode verifikasi kamu',
    ajakan: 'Masukkan kode di bawah ini untuk menyelesaikan verifikasi akun LokalBoost.',
  },
  penarikan: {
    subjek: 'kode penarikan dana LokalBoost kamu',
    judul: 'Kode penarikan dana',
    ajakan:
      'Ada permintaan penarikan dana dari dompet LokalBoost kamu. Masukkan kode di bawah ini untuk menyetujuinya.',
  },
  reset: {
    subjek: 'kode ganti kata sandi LokalBoost kamu',
    judul: 'Kode ganti kata sandi',
    ajakan: 'Masukkan kode di bawah ini untuk membuat kata sandi baru akun LokalBoost kamu.',
  },
}

const kataUntuk = (tujuan) => KATA_TUJUAN[tujuan] || KATA_TUJUAN.verifikasi

function badanHtml(kode, menit, tujuan) {
  const kata = kataUntuk(tujuan)
  return kerangkaHtml({
    judul: kata.judul,
    isi: `
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4A453D">
      ${kata.ajakan}
    </p>
    <div style="text-align:center;background:#F5F3EF;border-radius:12px;padding:20px 0;margin-bottom:24px">
      <span style="font-size:34px;font-weight:700;letter-spacing:.32em;color:#1C1A17">${kode}</span>
    </div>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4A453D">
      Kode berlaku ${menit} menit dan hanya bisa dipakai sekali.
    </p>`,
    penutup: `
    <p style="margin:0;font-size:13px;line-height:1.6;color:#8A8375">
      Bukan kamu yang meminta? Abaikan email ini — tidak ada yang berubah pada akunmu.
    </p>`,
  })
}

/**
 * Kirim kode OTP. Mengembalikan true kalau surel benar-benar terkirim.
 * Tidak pernah melempar: pemanggil di rute auth berjalan sinkron.
 */
export async function kirimKodeOtp(alamat, kode, menit, tujuan = 'verifikasi') {
  if (!pengangkut || !bolehDikirimi(alamat)) return false
  const kata = kataUntuk(tujuan)
  try {
    await pengangkut.sendMail({
      from: alamatDari,
      to: alamat,
      subject: `${kode} adalah ${kata.subjek}`,
      text: `${kata.judul}: ${kode}\n${kata.ajakan}\nBerlaku ${menit} menit dan hanya bisa dipakai sekali.\n\nBukan kamu yang meminta? Abaikan email ini.`,
      html: badanHtml(kode, menit, tujuan),
    })
    console.log(`[SUREL] Kode OTP (${tujuan}) terkirim ke ${alamat}`)
    return true
  } catch (galat) {
    console.warn(`[SUREL] Gagal mengirim ke ${alamat}: ${galat.message}`)
    return false
  }
}

/** Lolos dari HTML — isi notifikasi datang dari nama kampanye dan alasan sengketa. */
const lolosHtml = (teks) =>
  String(teks ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * Kirim notifikasi penting ke inbox. Dipakai services/notifikasi.js untuk
 * kejadian yang tidak boleh menunggu pengguna kebetulan membuka situs —
 * lamaran diputuskan, dana cair, sengketa selesai.
 *
 * Sama seperti OTP: tidak pernah melempar, dan pemanggilnya tidak menunggu.
 * Surel yang gagal terkirim tidak boleh membatalkan aksi bisnis yang sudah
 * tercatat di basis data.
 */
export async function kirimSurelNotifikasi({ tujuan, judul, isi, tautan }) {
  if (!pengangkut || !bolehDikirimi(tujuan)) return false

  const alamatPenuh = tautan ? `${config.alamatSitus}${tautan}` : null
  const tombol = alamatPenuh
    ? `<p style="margin:24px 0 0">
         <a href="${alamatPenuh}" style="display:inline-block;background:#1C1A17;color:#FFFFFF;text-decoration:none;border-radius:10px;padding:12px 22px;font-size:14px;font-weight:600">Buka LokalBoost</a>
       </p>`
    : ''

  try {
    await pengangkut.sendMail({
      from: alamatDari,
      to: tujuan,
      subject: `${judul} — LokalBoost`,
      text: `${judul}\n\n${isi}${alamatPenuh ? `\n\n${alamatPenuh}` : ''}`,
      html: kerangkaHtml({
        judul: lolosHtml(judul),
        isi: `<p style="margin:0;font-size:15px;line-height:1.6;color:#4A453D">${lolosHtml(isi)}</p>${tombol}`,
        penutup: `
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8A8375">
          Kamu menerima email ini karena ada kejadian penting di akun LokalBoost-mu.
        </p>`,
      }),
    })
    return true
  } catch (galat) {
    console.warn(`[SUREL] Gagal mengirim notifikasi ke ${tujuan}: ${galat.message}`)
    return false
  }
}
