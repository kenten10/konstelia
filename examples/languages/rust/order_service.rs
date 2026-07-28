pub struct Product {
    pub price: u64,
}

pub struct Order {
    pub product_id: String,
    pub quantity: u32,
    pub total: u64,
}

pub trait Catalog {
    fn find(&self, product_id: &str) -> Option<Product>;
}

pub trait OrderRepository {
    fn save(&self, order: &Order);
}

pub struct OrderService {
    catalog: Box<dyn Catalog>,
    repository: Box<dyn OrderRepository>,
}

impl OrderService {
    pub fn create(&self, product_id: &str, quantity: u32) -> Order {
        let product = self.catalog.find(product_id);
        if product.is_none() {
            panic!("unknown product");
        }

        let product = product.unwrap();
        let order = Order {
            product_id: product_id.to_owned(),
            quantity,
            total: product.price * quantity as u64,
        };
        self.repository.save(&order);
        return order;
    }
}
