package orders

type Product struct {
	Price int
}

type Order struct {
	ProductID string
	Quantity  int
	Total     int
}

type Catalog interface {
	Find(productID string) *Product
}

type OrderRepository interface {
	Save(order Order)
}

type OrderService struct {
	catalog    Catalog
	repository OrderRepository
}

func (service *OrderService) Create(productID string, quantity int) Order {
	product := service.catalog.Find(productID)
	if product == nil {
		panic("unknown product")
	}

	order := Order{
		ProductID: productID,
		Quantity:  quantity,
		Total:     product.Price * quantity,
	}
	service.repository.Save(order)
	return order
}
