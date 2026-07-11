import { useState, useEffect } from 'react'
import ProductCard from './ProductCard'
import Sidebar from './Sidebar'
import './CollectionPage.css'

export default function CollectionPage({ title, collection }) {
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('default')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (sortBy !== 'default') params.set('sort', sortBy)

    fetch(`/api/products/${collection}?${params}`)
      .then((res) => res.json())
      .then((json) => {
        setProducts(json.data)
        setTotal(json.total)
        setLoading(false)
      })
  }, [collection, sortBy])

  const description = collection === 'mens-unisex'
    ? 'Upgrade your menswear offerings with a unique selection of handpicked vintage clothing. Discover wholesale quantities of classic styles for men, retro sportswear, graphic tees, and much more.'
    : 'Discover wholesale quantities of vintage womenswear. From Y2K tops to denim shorts, designer pieces and more — handpicked for resellers.'

  return (
    <div className="collection-page">
      <div className="breadcrumb">
        <a href="/">Home</a> &gt; <a href="/">Collections</a> &gt; <span>{title}</span>
      </div>

      <h1 className="collection-title">{title}</h1>
      <p className="collection-desc">{description}</p>
      <p className="collection-count">{total} products</p>

      <div className="collection-layout">
        <Sidebar sortBy={sortBy} onSortChange={setSortBy} />
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
