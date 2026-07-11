import express from 'express'
import cors from 'cors'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const mensData = JSON.parse(readFileSync(join(__dirname, 'src/data/mens-unisex.json'), 'utf-8'))
const womensData = JSON.parse(readFileSync(join(__dirname, 'src/data/womens.json'), 'utf-8'))

const app = express()
app.use(cors())

// All products
app.get('/api/products', (req, res) => {
  const { collection, sort, limit, offset } = req.query
  let results = [...mensData, ...womensData]

  if (collection === 'mens-unisex') results = [...mensData]
  if (collection === 'womens') results = [...womensData]

  if (sort === 'price-asc') results.sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') results.sort((a, b) => b.price - a.price)
  if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name))

  const total = results.length
  const off = parseInt(offset) || 0
  const lim = parseInt(limit) || results.length

  results = results.slice(off, off + lim)

  res.json({ total, offset: off, limit: lim, data: results })
})

// Men's collection
app.get('/api/products/mens-unisex', (req, res) => {
  const { sort, limit, offset } = req.query
  let results = [...mensData]

  if (sort === 'price-asc') results.sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') results.sort((a, b) => b.price - a.price)
  if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name))

  const total = results.length
  const off = parseInt(offset) || 0
  const lim = parseInt(limit) || results.length

  results = results.slice(off, off + lim)

  res.json({ total, offset: off, limit: lim, data: results })
})

// Women's collection
app.get('/api/products/womens', (req, res) => {
  const { sort, limit, offset } = req.query
  let results = [...womensData]

  if (sort === 'price-asc') results.sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') results.sort((a, b) => b.price - a.price)
  if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name))

  const total = results.length
  const off = parseInt(offset) || 0
  const lim = parseInt(limit) || results.length

  results = results.slice(off, off + lim)

  res.json({ total, offset: off, limit: lim, data: results })
})

// Single product by id and collection
app.get('/api/products/:collection/:id', (req, res) => {
  const { collection, id } = req.params
  const source = collection === 'womens' ? womensData : mensData
  const product = source.find((p) => p.id === parseInt(id))

  if (!product) return res.status(404).json({ error: 'Product not found' })
  res.json(product)
})

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`)
})
