import { galat429 } from './util.js'

/**
 * Pembatas laju sederhana, disimpan di memori proses.
 *
 * Tidak memakai pustaka luar karena tidak perlu: `railway.json` mengunci
 * numReplicas ke 1, jadi hanya ada satu proses yang menghitung — persis alasan
 * yang sama membuat SQLite cukup untuk aplikasi ini. Kalau suatu hari ada dua
 * replika, hitungan ini ikut pecah bersama basis datanya, dan keduanya harus
 * diselesaikan sekaligus (Redis + Postgres), bukan sendiri-sendiri.
 *
 * Ini pertahanan lapis kasar terhadap penyalahgunaan otomatis. Pagar yang
 * benar-benar mengikat alur OTP ada di routes/auth.js dan bersandar pada tabel
 * `otp` — kalau proses ini restart, jeda kirim ulang tetap berlaku.
 */

const jendela = new Map() // kunci -> daftar cap waktu (ms)

/** Buang catatan yang sudah lewat jendela waktunya. */
function bersihkan(cap, batasWaktu) {
  let i = 0
  while (i < cap.length && cap[i] <= batasWaktu) i += 1
  return i ? cap.slice(i) : cap
}

/**
 * batasLaju({ maks, detik, kunci }) -> middleware Express.
 *
 * `kunci` menentukan siapa yang dihitung; bawaannya alamat IP. Rute yang
 * menyasar satu identitas (mis. kirim ulang OTP) sebaiknya menghitung
 * identitasnya juga, supaya berpindah IP tidak membuka kunci.
 */
export function batasLaju({ maks, detik, kunci = (req) => req.ip, pesan } = {}) {
  const rentang = detik * 1000

  return (req, _res, next) => {
    const k = kunci(req)
    if (!k) return next()

    const kini = Date.now()
    const cap = bersihkan(jendela.get(k) || [], kini - rentang)

    if (cap.length >= maks) {
      const tunggu = Math.ceil((cap[0] + rentang - kini) / 1000)
      return next(galat429(pesan || `Terlalu banyak percobaan. Coba lagi dalam ${tunggu} detik.`))
    }

    cap.push(kini)
    jendela.set(k, cap)
    next()
  }
}

/**
 * Buang kunci yang sudah lama tidak dipakai. Tanpa ini Map-nya tumbuh
 * selamanya di server yang hidup berbulan-bulan.
 */
const SAPU_MENIT = 10
const penyapu = setInterval(
  () => {
    const batasWaktu = Date.now() - 60 * 60 * 1000
    for (const [k, cap] of jendela) {
      const sisa = bersihkan(cap, batasWaktu)
      if (sisa.length) jendela.set(k, sisa)
      else jendela.delete(k)
    }
  },
  SAPU_MENIT * 60 * 1000,
)
// Jangan menahan proses tetap hidup hanya demi penyapu ini (penting untuk `node --test`).
penyapu.unref?.()

/** Dipakai berkas tes untuk memulai dari keadaan bersih. */
export const kosongkanBatas = () => jendela.clear()
