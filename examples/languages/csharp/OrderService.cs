public sealed record Product(int Price);

public sealed record Order(string ProductId, int Quantity, int Total);

public interface ICatalog
{
    Product? Find(string productId);
}

public interface IOrderRepository
{
    void Save(Order order);
}

public sealed class OrderService
{
    private readonly ICatalog catalog;
    private readonly IOrderRepository repository;

    public OrderService(ICatalog catalog, IOrderRepository repository)
    {
        this.catalog = catalog;
        this.repository = repository;
    }

    public Order Create(string productId, int quantity)
    {
        Product? product = catalog.Find(productId);
        if (product is null)
        {
            throw new ArgumentException($"Unknown product: {productId}");
        }

        var order = new Order(productId, quantity, product.Price * quantity);
        repository.Save(order);
        return order;
    }
}
