from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class Product:
    id: str
    name: str
    price: Decimal


class ProductCatalog(Protocol):
    def find_by_id(self, product_id: str) -> Product | None:
        ...


class OrderRepository(Protocol):
    def save(self, order: object) -> None:
        ...


class InMemoryProductCatalog:
    def __init__(self, products: list[Product]) -> None:
        self.products = {product.id: product for product in products}

    def find_by_id(self, product_id: str) -> Product | None:
        return self.products.get(product_id)


class InMemoryOrderRepository:
    def __init__(self) -> None:
        self.orders: dict[str, object] = {}

    def save(self, order: object) -> None:
        order_id = getattr(order, "id")
        self.orders[order_id] = order
