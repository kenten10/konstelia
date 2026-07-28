export class OrderService {
  constructor(catalog, repository) {
    this.catalog = catalog;
    this.repository = repository;
  }

  create(productId, quantity) {
    const product = this.catalog.find(productId);
    if (!product) {
      throw new Error(`Unknown product: ${productId}`);
    }

    const order = {
      productId,
      quantity,
      total: product.price * quantity,
    };
    this.repository.save(order);
    return order;
  }
}
