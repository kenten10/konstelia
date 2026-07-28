record Product(int price) {}

record Order(String productId, int quantity, int total) {}

interface Catalog {
    Product find(String productId);
}

interface OrderRepository {
    void save(Order order);
}

class OrderService {
    private final Catalog catalog;
    private final OrderRepository repository;

    OrderService(Catalog catalog, OrderRepository repository) {
        this.catalog = catalog;
        this.repository = repository;
    }

    Order create(String productId, int quantity) {
        Product product = catalog.find(productId);
        if (product == null) {
            throw new IllegalArgumentException("Unknown product: " + productId);
        }

        Order order = new Order(productId, quantity, product.price() * quantity);
        repository.save(order);
        return order;
    }
}
