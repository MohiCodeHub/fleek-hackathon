import './ProductCard.css'

export default function ProductCard({ product }) {
  const colorHash = (str) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const h = Math.abs(hash) % 360
    return `hsl(${h}, 25%, 85%)`
  }

  return (
    <div className="product-card">
      <div className="product-image" style={{ background: colorHash(product.name) }}>
        <div className="product-placeholder">
          {product.name.charAt(0)}
        </div>
        <button className="wishlist-btn">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 17.5s-7-4.5-7-9.5c0-2.5 2-4.5 4.5-4.5 1.5 0 2.5.7 2.5.7S11.5 3.5 13 3.5c2.5 0 4.5 2 4.5 4.5 0 5-7 9.5-7 9.5z" stroke="#f5a623" strokeWidth="1.5" fill="none"/>
          </svg>
        </button>
      </div>
      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        <div className="product-pricing">
          <span className="product-price">£{product.price}</span>
          {product.original_price && (
            <span className="product-original-price">£{product.original_price.toFixed(2)}</span>
          )}
        </div>
        <span className="product-per-item">£{product.price_per_piece.toFixed(2)} per item</span>
        <span className="shipping-badge">Shipping Inc.</span>
      </div>
    </div>
  )
}
