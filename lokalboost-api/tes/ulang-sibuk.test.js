/**
 * Tes percobaan ulang saat Turso sibuk.
 *
 * Dua setoran Rekber bersamaan pernah membuat yang kalah jadi galat 500.
 * Yang dijaga di sini: galat SIBUK diulang sampai berhasil, galat lain
 * (misalnya "dana sudah disetor") TIDAK pernah diulang, dan transaksi yang
 * gagal tidak meninggalkan tulisan setengah jadi.
 *
 * Jalankan: npm test
 */
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dbSementara = path.join(os.tmpdir(), `lokalboost-sibuk-${Date.now()}.db`)
process.env.DB_PATH = dbSementara
process.env.NODE_ENV = 'test'
process.env.TURSO_DATABASE_URL = ''
// Setor dana simulasi. Midtrans diuji terpisah di midtrans.test.js.
process.env.MIDTRANS_SERVER_KEY = ''

const { db, transaksional, ulangiBilaSibuk } = await import('../src/lib/db.js')

after(() => {
  db.close()
  for (const akhiran of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbSementara + akhiran, { force: true })
    } catch {
      // Berkas sementara di %TEMP%; biarkan OS yang membersihkan.
    }
  }
})

const tanpaTidur = { tidur: () => {} }

describe('ulangiBilaSibuk', () => {
  it('mengulang galat SQLITE_BUSY sampai berhasil', () => {
    let ke = 0
    const hasil = ulangiBilaSibuk(() => {
      ke++
      if (ke < 3) throw new Error('Hrana(StreamError(Error { message: "SQLite error: database is locked", code: "SQLITE_BUSY" }))')
      return 'beres'
    }, tanpaTidur)
    assert.equal(hasil, 'beres')
    assert.equal(ke, 3)
  })

  it('tidak mengulang galat bisnis', () => {
    let ke = 0
    assert.throws(
      () => ulangiBilaSibuk(() => { ke++; throw new Error('Dana kampanye ini sudah disetor.') }, tanpaTidur),
      /sudah disetor/,
    )
    assert.equal(ke, 1)
  })

  it('menyerah setelah batas percobaan dengan galat 503 yang ramah', () => {
    let ke = 0
    assert.throws(
      () => ulangiBilaSibuk(() => { ke++; throw new Error('SQLITE_BUSY') }, { ...tanpaTidur, percobaan: 4 }),
      (err) => err.status === 503 && /Coba lagi/.test(err.message),
    )
    assert.equal(ke, 4)
  })

  it('berhenti saat anggaran waktu habis, bukan menunggu timeout Vercel', () => {
    let ke = 0
    const mulai = Date.now()
    assert.throws(
      () => ulangiBilaSibuk(() => { ke++; throw new Error('database is locked') }, { percobaan: 100, anggaranMs: 300 }),
      (err) => err.status === 503,
    )
    assert.ok(Date.now() - mulai < 1000, 'harus menyerah jauh sebelum 1 detik')
    assert.ok(ke < 100)
  })
})

describe('transaksional', () => {
  db.exec('CREATE TABLE IF NOT EXISTS uji_sibuk (n INTEGER)')

  it('tulisan dari percobaan yang sibuk di-rollback, hanya percobaan sukses yang tersimpan', () => {
    let ke = 0
    const tulis = transaksional(() => {
      ke++
      db.prepare('INSERT INTO uji_sibuk (n) VALUES (?)').run(ke)
      if (ke === 1) throw new Error('database is locked')
      return ke
    })
    assert.equal(tulis(), 2)
    assert.deepEqual(db.prepare('SELECT n FROM uji_sibuk').all().map((b) => b.n), [2])
  })

  it('meneruskan argumen dan membatalkan tulisan saat galat bisnis', () => {
    const gagal = transaksional((n) => {
      db.prepare('INSERT INTO uji_sibuk (n) VALUES (?)').run(n)
      throw new Error('Saldo tidak cukup.')
    })
    assert.throws(() => gagal(99), /Saldo tidak cukup/)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM uji_sibuk WHERE n = 99').get().c, 0)
    assert.equal(db.inTransaction, false)
  })
})
