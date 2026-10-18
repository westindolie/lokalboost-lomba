/**
 * Tes balapan model AI (`balapanModel` di services/ai.js).
 *
 * Kenapa ini ada: endpoint gratis NVIDIA sering menolak dengan 503 "penuh".
 * Mencoba model bergiliran membayar penuh batas waktu tiap model yang gagal,
 * dan hanya dua yang muat di bawah `maxDuration` Vercel yang 30 detik. Yang
 * dijaga di sini: jawaban tercepat yang menang, model pertama tetap yang
 * diutamakan (pesaing baru dilepas setelah jeda), kegagalan cepat langsung
 * memanggil pesaing tanpa menunggu jeda, dan yang kalah DIBATALKAN supaya
 * tidak diam-diam memakan kuota.
 *
 * Klien di sini palsu semua — tidak ada jaringan, jadi tes tetap cepat dan
 * tidak bergantung kuota.
 *
 * Jalankan: npm test
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''
// Jeda dipendekkan supaya tes tidak ikut menunggu 4 detik sungguhan.
process.env.AI_JEDA_BALAPAN_MS = '80'

const { balapanModel } = await import('../src/services/ai.js')

const tidur = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Klien palsu berbentuk sama dengan SDK OpenAI: `chat.completions.create`.
 * `skenario` memetakan nama model ke perilakunya.
 */
function klienPalsu(skenario, jejak = []) {
  return {
    chat: {
      completions: {
        create: async (badan, opsi) => {
          const aturan = skenario[badan.model]
          jejak.push(badan.model)
          const batal = new Promise((_, tolak) => {
            opsi?.signal?.addEventListener('abort', () => {
              aturan.dibatalkan = true
              tolak(Object.assign(new Error('dibatalkan'), { name: 'AbortError' }))
            })
          })
          const kerja = (async () => {
            await tidur(aturan.ms)
            if (aturan.galat) throw Object.assign(new Error(aturan.galat.pesan), aturan.galat)
            return { choices: [{ message: { content: JSON.stringify(aturan.isi) } }] }
          })()
          return Promise.race([kerja, batal])
        },
      },
    },
  }
}

const argumen = {
  sistem: 's',
  permintaan: 'p',
  skema: { type: 'object' },
  maksToken: 100,
  namaSkema: 'uji',
}

const buatPenyedia = (models, skenario, jejak) => ({
  nama: 'uji',
  klien: klienPalsu(skenario, jejak),
  cfg: { models, penalaran: 'off' },
})

describe('balapan model AI', () => {
  it('memakai model pertama kalau ia menjawab, tanpa menyentuh cadangan', async () => {
    const jejak = []
    const skenario = {
      cepat: { ms: 10, isi: { hasil: 'utama' } },
      cadangan: { ms: 10, isi: { hasil: 'cadangan' } },
    }
    const hasil = await balapanModel(buatPenyedia(['cepat', 'cadangan'], skenario, jejak), argumen)

    assert.equal(hasil.model, 'cepat')
    assert.deepEqual(hasil.isi, { hasil: 'utama' })
    // Inti hemat kuota: cadangan tidak pernah dipanggil.
    assert.deepEqual(jejak, ['cepat'])
  })

  it('melepas cadangan setelah jeda kalau model pertama menggantung, dan membatalkannya', async () => {
    const skenario = {
      lambat: { ms: 5000, isi: { hasil: 'lambat' } },
      cadangan: { ms: 20, isi: { hasil: 'cadangan' } },
    }
    const mulai = Date.now()
    const hasil = await balapanModel(buatPenyedia(['lambat', 'cadangan'], skenario), argumen)

    assert.equal(hasil.model, 'cadangan')
    // Jauh di bawah 5 detik milik model pertama: yang lambat tidak ditunggu.
    assert.ok(Date.now() - mulai < 1000, 'balapan tidak boleh menunggu model lambat selesai')
    await tidur(20)
    assert.equal(skenario.lambat.dibatalkan, true, 'model yang kalah harus dibatalkan')
  })

  it('langsung memanggil cadangan saat model pertama gagal cepat (503 penuh)', async () => {
    const skenario = {
      penuh: { ms: 5, galat: { status: 503, pesan: 'Worker local total request limit reached' } },
      cadangan: { ms: 10, isi: { hasil: 'cadangan' } },
    }
    const mulai = Date.now()
    const hasil = await balapanModel(buatPenyedia(['penuh', 'cadangan'], skenario), argumen)

    assert.equal(hasil.model, 'cadangan')
    // Tidak menunggu sisa jeda: kegagalan cepat harus mempercepat giliran.
    assert.ok(Date.now() - mulai < 80, 'kegagalan cepat tidak boleh menunggu jeda penuh')
  })

  it('melempar dengan sebab tiap model kalau semuanya gagal', async () => {
    const skenario = {
      a: { ms: 5, galat: { status: 503, pesan: 'penuh' } },
      b: { ms: 5, galat: { status: 429, pesan: 'kuota habis' } },
    }
    await assert.rejects(
      () => balapanModel(buatPenyedia(['a', 'b'], skenario), argumen),
      (e) => e.message.includes('a:') && e.message.includes('b:') && e.message.includes('429'),
    )
  })

  it('satu model tetap jalan seperti sebelumnya', async () => {
    const jejak = []
    const skenario = { tunggal: { ms: 5, isi: { hasil: 'ok' } } }
    const hasil = await balapanModel(buatPenyedia(['tunggal'], skenario, jejak), argumen)

    assert.equal(hasil.model, 'tunggal')
    assert.deepEqual(jejak, ['tunggal'])
  })
})
