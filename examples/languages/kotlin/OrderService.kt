data class Product(val price: Int)

data class Order(
    val productId: String,
    val quantity: Int,
    val total: Int,
)

interface Catalog {
    fun find(productId: String): Product?
}

interface OrderRepository {
    fun save(order: Order)
}

class OrderService(private val catalog: Catalog, private val repository: OrderRepository) {
    fun create(productId: String, quantity: Int): Order {
        val product = catalog.find(productId)
        if (product == null) {
            error("Unknown product: $productId")
        }

        val order = Order(productId, quantity, product.price * quantity)
        repository.save(order)
        return order
    }
}
