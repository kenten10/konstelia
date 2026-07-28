from dataclasses import dataclass
from decimal import Decimal

from repositories import OrderRepository, ProductCatalog


@dataclass(frozen=True)
class OrderRequest:
    product_id: str
    quantity: int


@dataclass(frozen=True)
class Order:
    id: str
    product_id: str
    quantity: int
    total: Decimal
    payment_id: str


class PaymentGateway:
    def charge(self, amount: Decimal) -> str:
        return f"payment-{amount}"


class OrderService:
    def __init__(
        self,
        catalog: ProductCatalog,
        orders: OrderRepository,
        payments: PaymentGateway,
    ) -> None:
        self.catalog = catalog
        self.orders = orders
        self.payments = payments

    def create_order(self, request: OrderRequest) -> Order:
        product = self.catalog.find_by_id(request.product_id)
        if product is None:
            raise ValueError(f"Unknown product: {request.product_id}")

        total = product.price * request.quantity
        payment_id = self.payments.charge(total)
        order = Order(
            id=f"order-{payment_id}",
            product_id=product.id,
            quantity=request.quantity,
            total=total,
            payment_id=payment_id,
        )
        self.orders.save(order)
        return order
