/**
 * Tempat tinggal berkas video.
 *
 * Di laptop, video cukup duduk di folder `unggahan/` dan dilayani
 * `express.static`. Di Vercel tidak ada folder yang bertahan: satu-satunya
 * yang bisa ditulis adalah /tmp, dan isinya milik satu instance fungsi saja.
 * Artinya video yang baru diunggah juri bisa menjawab 404 pada permintaan
 * berikutnya, karena permintaan itu mendarat di instance lain.
 *
 * Maka bila `BLOB_READ_WRITE_TOKEN` ada, berkas dipindahkan ke Vercel Blob
 * dan yang tersimpan di kolom `video.berkas` adalah URL publiknya. Tanpa
 * token, semuanya berperilaku persis seperti sebelumnya - jadi tes lokal,
 * `npm run dev`, dan demo tunnel tidak berubah sedikit pun.
 */
import fs from 'node:fs'
import path from 'node:path'

export const blobAktif = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN)

/** Rujukan berkas yang sudah berupa URL, bukan path di disk. */
const berupaUrl = (rujukan) => typeof rujukan === 'string' && /^https?:\/\//i.test(rujukan)

/**
 * Pindahkan berkas hasil multer ke tempat tinggal permanennya.
 * Mengembalikan rujukan yang layak disimpan di basis data.
 */
export async function simpanVideo(berkas) {
  if (!berkas) return null
  if (!blobAktif()) return berkas.path

  // Diimpor saat dipakai, bukan di atas berkas: pemasangan tanpa Vercel Blob
  // (mis. server sendiri seperti di DEPLOY.md) tidak perlu paket ini ada.
  const { put } = await import('@vercel/blob')
  const isi = fs.readFileSync(berkas.path)
  const hasil = await put(`video/${path.basename(berkas.path)}`, isi, {
    access: 'public',
    contentType: berkas.mimetype || 'video/mp4',
    addRandomSuffix: false,
  })

  // Salinan /tmp sudah tidak berguna begitu Blob memegang aslinya, dan
  // instance serverless punya kuota /tmp yang kecil.
  try {
    fs.unlinkSync(berkas.path)
  } catch {
    // Berkas sementara yang gagal dihapus bukan alasan menggagalkan unggahan.
  }

  return hasil.url
}

/** Hapus berkas, di mana pun ia tinggal. Aman dipanggil untuk rujukan kosong. */
export async function hapusVideo(rujukan) {
  if (!rujukan) return
  if (berupaUrl(rujukan)) {
    if (!blobAktif()) return
    const { del } = await import('@vercel/blob')
    await del(rujukan)
    return
  }
  if (fs.existsSync(rujukan)) fs.unlinkSync(rujukan)
}

/**
 * Ambil isi berkas video sebagai Buffer, untuk dikirim ke AI transkripsi.
 * Ukuran diperiksa SEBELUM berkas dibaca utuh, supaya video 200 MB di laptop
 * tidak ikut dimuat ke memori hanya untuk ditolak.
 *
 * @returns {Promise<Buffer|null>} null bila rujukan kosong atau berkasnya hilang
 */
export async function bacaVideo(rujukan, maksByte = Infinity) {
  if (!rujukan) return null
  const terlaluBesar = (n) =>
    new Error(`Video ${(n / 1048576).toFixed(1)} MB melebihi batas transkripsi ${Math.round(maksByte / 1048576)} MB`)

  if (berupaUrl(rujukan)) {
    const respons = await fetch(rujukan, { signal: AbortSignal.timeout(8000) })
    if (!respons.ok) throw new Error(`Video tidak bisa diunduh dari penyimpanan (HTTP ${respons.status})`)
    const panjang = Number(respons.headers.get('content-length') || 0)
    if (panjang > maksByte) throw terlaluBesar(panjang)
    const isi = Buffer.from(await respons.arrayBuffer())
    if (isi.length > maksByte) throw terlaluBesar(isi.length)
    return isi
  }

  if (!fs.existsSync(rujukan)) return null
  const ukuran = fs.statSync(rujukan).size
  if (ukuran > maksByte) throw terlaluBesar(ukuran)
  return fs.readFileSync(rujukan)
}

/** Jenis MIME video dari ekstensinya, dalam ejaan yang diterima Gemini. */
export function jenisVideo(rujukan) {
  const ext = path.extname(String(rujukan || '').split('?')[0]).toLowerCase()
  return { '.mov': 'video/mov', '.webm': 'video/webm' }[ext] || 'video/mp4'
}

/** Ubah rujukan simpanan menjadi tautan yang bisa dibuka peramban. */
export function tautanVideo(rujukan) {
  if (!rujukan) return null
  return berupaUrl(rujukan) ? rujukan : `/unggahan/${path.basename(rujukan)}`
}

/**
 * Foto profil memakai tempat tinggal yang sama dengan video, tapi kolomnya
 * langsung menyimpan tautan publik (`/unggahan/...` atau URL Blob), bukan
 * path di disk: kolom `foto` juga memuat avatar bawaan seperti
 * `/gambar/kreator/krtr_sari.svg` yang dilayani dari folder web.
 */
export async function simpanFoto(berkas) {
  if (!berkas) return null
  if (!blobAktif()) return `/unggahan/${path.basename(berkas.path)}`

  const { put } = await import('@vercel/blob')
  const isi = fs.readFileSync(berkas.path)
  const hasil = await put(`foto/${path.basename(berkas.path)}`, isi, {
    access: 'public',
    contentType: berkas.mimetype,
    addRandomSuffix: false,
  })
  try {
    fs.unlinkSync(berkas.path)
  } catch {
    // Sama seperti video: sisa /tmp tidak menggagalkan unggahan.
  }
  return hasil.url
}

/** Hapus foto unggahan lama. Avatar bawaan (/gambar/...) tidak pernah disentuh. */
export async function hapusFoto(tautan, folderUnggahan) {
  if (!tautan) return
  if (berupaUrl(tautan)) return hapusVideo(tautan)
  if (!tautan.startsWith('/unggahan/')) return
  const berkas = path.join(folderUnggahan, path.basename(tautan))
  if (fs.existsSync(berkas)) fs.unlinkSync(berkas)
}
