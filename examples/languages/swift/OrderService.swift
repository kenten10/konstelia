struct Product {
    let price: Int
}

struct Order {
    let productId: String
    let quantity: Int
    let total: Int
}

protocol Catalog {
    func find(productId: String) -> Product?
}

protocol OrderRepository {
    func save(order: Order)
}

enum OrderError: Error {
    case unknownProduct
}

final class OrderService {
    private let catalog: Catalog
    private let repository: OrderRepository

    init(catalog: Catalog, repository: OrderRepository) {
        self.catalog = catalog
        self.repository = repository
    }

    func create(productId: String, quantity: Int) throws -> Order {
        let product = catalog.find(productId: productId)
        if product == nil {
            throw OrderError.unknownProduct
        }

        let order = Order(
            productId: productId,
            quantity: quantity,
            total: product!.price * quantity
        )
        repository.save(order: order)
        return order
    }
}
