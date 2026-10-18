/**
 * Kamus slang + rumus hook untuk penyusun brief.
 *
 * Yang dijaga: datanya utuh, yang tidak aman untuk brand UMKM (sensitif,
 * kasar, basi, nada menjelekkan) tidak pernah ikut terpilih, pemilihan
 * mengikuti kategori produk dan stabil untuk produk yang sama, serta brief
 * cadangan (tanpa model bahasa) tetap memuat poin hook.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

process.env.GEMINI_API_KEY = ''
process.env.WAY_API_KEY = ''
process.env.NARA_API_KEY = ''
process.env.NVIDIA_API_KEY = ''
process.env.OPENROUTER_API_KEY = ''
process.env.ANTHROPIC_API_KEY = ''
process.env.TURSO_DATABASE_URL = ''
process.env.DB_PATH = `${process.env.TEMP || '/tmp'}/lokalboost-kamus-${Date.now()}.db`

const { SLANG, TEMPLATE_HOOK } = await import('../src/data/kamus-hook.js')
const { slangAman, pilihBahanHook, bahanHookUntukPrompt, poinHookCadangan } = await import('../src/services/kamus-hook.js')
const { buatBriefDariReferensi } = await import('../src/services/ai.js')

describe('Data kamus', () => {
  it('terbaca utuh dari xlsx', () => {
    assert.ok(SLANG.length >= 100)
    assert.ok(TEMPLATE_HOOK.length >= 10)
    for (const s of SLANG) {
      assert.ok(s.id && s.kata && s.arti && s.fungsi && s.contoh, `baris ${s.id} tidak lengkap`)
      assert.ok(Array.isArray(s.niche) && s.niche.length > 0)
    }
    assert.equal(new Set(SLANG.map((s) => s.id)).size, SLANG.length, 'id harus unik')
  })
})

describe('Penyaring keamanan brand', () => {
  it('membuang yang sensitif, kasar, basi, dan bernada menjelekkan', () => {
    const aman = slangAman()
    assert.ok(aman.length > 50)
    for (const s of aman) {
      assert.equal(s.keamanan, 'Aman', s.kata)
      assert.notEqual(s.tren, 'Mulai Basi', s.kata)
      assert.notEqual(s.kategori, 'Kritik & Negatif', s.kata)
      assert.notEqual(s.fungsi, 'Kontroversi/Opini', s.kata)
    }
    const kata = aman.map((s) => s.kata.toLowerCase())
    for (const dilarang of ['gacor', 'anjay', 'bjir', 'pick me', 'toxic', 'ampas']) {
      assert.ok(!kata.includes(dilarang), `"${dilarang}" tidak boleh lolos`)
    }
  })

  it('tidak pernah memilih template bertipe opini', () => {
    for (const kategori of ['Kuliner', 'Fashion', 'Kecantikan', 'Ibu & Anak', 'Hobi & Gadget', undefined]) {
      const { template } = pilihBahanHook({ nama: 'Uji', kategori }, { jumlahTemplate: 20 })
      assert.ok(template.every((t) => t.tipe !== 'Opini'))
    }
  })
})

describe('Pemilihan bahan', () => {
  it('stabil untuk produk yang sama, berbeda antarproduk', () => {
    const a = pilihBahanHook({ nama: 'Bakso Aci', kategori: 'Kuliner' }).slang.map((s) => s.id)
    const b = pilihBahanHook({ nama: 'Bakso Aci', kategori: 'Kuliner' }).slang.map((s) => s.id)
    const c = pilihBahanHook({ nama: 'Mie Aceh Bang Joni', kategori: 'Kuliner' }).slang.map((s) => s.id)
    assert.deepEqual(a, b)
    assert.notDeepEqual(a, c)
  })

  it('mengutamakan slang yang cocok dengan kategori dan beragam fungsinya', () => {
    const { slang } = pilihBahanHook({ nama: 'Bakso Aci', kategori: 'Kuliner' })
    assert.equal(slang.length, 10)
    const cocok = slang.filter((s) => s.niche.some((n) => /kuliner|review|umkm|bisnis|travel|semua/i.test(n)))
    assert.ok(cocok.length >= 7, `hanya ${cocok.length} yang cocok dengan kuliner`)
    assert.ok(new Set(slang.map((s) => s.fungsi)).size >= 5, 'fungsi hook harus beragam')
  })

  it('kategori tak dikenal tetap menghasilkan bahan', () => {
    assert.equal(pilihBahanHook({ nama: 'X', kategori: 'Lainnya' }).slang.length, 10)
    assert.equal(pilihBahanHook({}).slang.length, 10)
  })

  it('prompt memuat kamus dan aturan pakai, dan melarang menyindir usaha lain', () => {
    const teks = bahanHookUntukPrompt({ nama: 'Bakso Aci', kategori: 'Kuliner' })
    assert.match(teks, /KAMUS HOOK/)
    assert.match(teks, /JANGAN disalin/)
    assert.match(teks, /merendahkan usaha lain/)
  })
})

describe('Brief cadangan', () => {
  it('memuat poin hook sebagai poin pertama', async () => {
    const hasil = await buatBriefDariReferensi(
      { nama: 'Bakso Aci Bu Sari', kategori: 'Kuliner', lokasi: 'Banda Aceh' },
      [{ platform: 'tiktok', url: 'https://www.tiktok.com/@a/video/1', terbaca: true, judul: 'Bakso pedas', tagar: ['bakso'], durasiDetik: 30 }],
    )
    assert.equal(hasil.sumber, 'template')
    assert.match(hasil.poin[0], /hook/i)
    assert.ok(hasil.poin.some((p) => p.includes('Banda Aceh')))
  })

  it('poin hook cadangan menyebut slang tanpa mengarang kalimat jadi', () => {
    const poin = poinHookCadangan({ nama: 'Bakso Aci', kategori: 'Kuliner' })
    assert.match(poin, /slang "/)
    assert.match(poin, /Rumus:/)
  })
})
