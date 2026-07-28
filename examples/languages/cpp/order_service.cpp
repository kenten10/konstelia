#include <optional>
#include <stdexcept>
#include <string>

struct Product {
    int price;
};

struct Order {
    std::string productId;
    int quantity;
    int total;
};

class Catalog {
public:
    virtual std::optional<Product> find(const std::string &productId) const = 0;
};

class OrderRepository {
public:
    virtual void save(const Order &order) = 0;
};

class OrderService {
public:
    OrderService(const Catalog &catalog, OrderRepository &repository)
        : catalog(catalog), repository(repository) {}

    Order create(const std::string &productId, int quantity) {
        auto product = catalog.find(productId);
        if (!product) {
            throw std::invalid_argument("unknown product");
        }

        Order order{productId, quantity, product->price * quantity};
        repository.save(order);
        return order;
    }

private:
    const Catalog &catalog;
    OrderRepository &repository;
};
