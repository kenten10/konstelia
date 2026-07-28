class OrderService
  def initialize(catalog, repository)
    @catalog = catalog
    @repository = repository
  end

  def create(product_id, quantity)
    product = @catalog.find(product_id)
    if product.nil?
      raise ArgumentError, "Unknown product: #{product_id}"
    end

    order = {
      product_id: product_id,
      quantity: quantity,
      total: product.price * quantity
    }
    @repository.save(order)
    return order
  end
end
