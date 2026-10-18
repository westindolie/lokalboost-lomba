/**
 * Rumus & validasi langkah 2 wizard (src/reward.js). Jalankan: npm test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

const r = await import('../src/reward.js')
const dasar = {
  targetViews: 10000, modelReward: 'tunai', skemaTarif: 'per_view', tarifPerView: 250, tarifCpm: 25000,
  anggaranManual: false, anggaranMaks: 0, ambangViewsTunai: 1000, ambangViewsProduk: 1000, pisahAmbang: false,
  modePencairan: 'per_milestone', produkReward: [], kategoriLain: [], tenggatHari: 14,
}

test('per view: reward = views x tarif', () => {
  const h = r.hitungDraf(dasar)
  assert.equal(h.cpm, 250_000)
  assert.equal(h.biayaTarget, 2_500_000)
  assert.equal(h.anggaran, 2_500_000)
  assert.equal(h.rewardDiAmbang, 250_000)
  assert.deepEqual(r.galatDraf(dasar), {})
})

test('CPM: reward = (views / 1000) x CPM, pecahan per view tetap tepat', () => {
  const d = { ...dasar, skemaTarif: 'cpm', tarifCpm: 12_500, targetViews: 1003 }
  const h = r.hitungDraf(d)
  assert.equal(h.biayaTarget, Math.ceil((1003 * 12_500) / 1000))
  assert.equal(r.rewardDariViews(1003, 12_500), 12_537)
  assert.equal(r.tarifPerViewTeks(12_500), 'Rp 12,5')
})

test('anggaran manual kurang: peringatan dan views terbiayai', () => {
  const d = { ...dasar, anggaranManual: true, anggaranMaks: 1_000_000 }
  const h = r.hitungDraf(d)
  assert.equal(h.kurangAnggaran, 1_500_000)
  assert.equal(h.viewsTerbiayai, 4000)
  assert.match(r.galatDraf(d).anggaran, /kurang Rp 1\.500\.000/)
  const cukup = { ...d, anggaranMaks: 3_000_000 }
  assert.equal(r.hitungDraf(cukup).sisaAnggaran, 500_000)
  assert.equal(r.galatDraf(cukup).anggaran, undefined)
})

test('validasi batas target, tarif, ambang, lama', () => {
  assert.ok(r.galatDraf({ ...dasar, targetViews: 500 }).target)
  assert.ok(r.galatDraf({ ...dasar, tarifPerView: 5 }).tarif)
  assert.ok(r.galatDraf({ ...dasar, skemaTarif: 'cpm', tarifCpm: 5000 }).tarif)
  assert.ok(r.galatDraf({ ...dasar, ambangViewsTunai: 20000 }).ambangTunai, 'ambang > target ditolak')
  assert.ok(r.galatDraf({ ...dasar, ambangViewsTunai: 50 }).ambangTunai)
  assert.ok(r.galatDraf({ ...dasar, tenggatHari: 0 }).lama)
})

test('pergantian model: produk saja tanpa anggaran, wajib pilih produk', () => {
  const d = { ...dasar, modelReward: 'produk' }
  const h = r.hitungDraf(d)
  assert.equal(h.anggaran, 0)
  assert.equal(h.pakaiTunai, false)
  assert.ok(r.galatDraf(d).produk)
  const katalog = [{ id: 'p1', nama: 'Nastar', nilai: 85_000, stok: 3 }]
  const dp = { ...d, produkReward: [{ produkId: 'p1', kuota: 2 }] }
  assert.equal(r.hitungDraf(dp, katalog).nilaiProduk, 170_000)
  assert.deepEqual(r.galatDraf(dp, katalog), {})
  assert.match(r.galatDraf({ ...d, produkReward: [{ produkId: 'p1', kuota: 5 }] }, katalog).produk, /Stok Nastar tinggal 3/)
  const isi = r.isianReward(dp, [])
  assert.equal(isi.modelReward, 'produk')
  assert.deepEqual(isi.produkReward, [{ produkId: 'p1', kuota: 2 }])
  assert.equal(isi.anggaran, undefined)
})

test('kombinasi: ambang produk ikut ambang uang kecuali dipisah', () => {
  const katalog = [{ id: 'p1', nama: 'Nastar', nilai: 85_000, stok: 3 }]
  const d = { ...dasar, modelReward: 'kombinasi', ambangViewsTunai: 2000, ambangViewsProduk: 5000, produkReward: [{ produkId: 'p1', kuota: 1 }] }
  assert.equal(r.hitungDraf(d, katalog).ambangProduk, 2000)
  assert.equal(r.hitungDraf({ ...d, pisahAmbang: true }, katalog).ambangProduk, 5000)
  const isi = r.isianReward(d, katalog)
  assert.equal(isi.ambangViewsProduk, 2000)
  assert.equal(isi.ambangViewsTunai, 2000)
  assert.equal(isi.anggaran, 2_500_000)
})

test('jepit menjaga input angka di dalam batas slider', () => {
  assert.equal(r.jepit(2_000_000, 1000, 1_000_000), 1_000_000)
  assert.equal(r.jepit(10, 1000, 1_000_000), 1000)
})
