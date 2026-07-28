#include <stddef.h>

typedef struct {
    int price;
} Product;

typedef struct {
    const char *product_id;
    int quantity;
    int total;
} Order;

typedef Product *(*CatalogFind)(const char *product_id);
typedef void (*OrderSave)(const Order *order);

Order *create_order(
    CatalogFind catalog_find,
    OrderSave repository_save,
    const char *product_id,
    int quantity,
    Order *output
) {
    Product *product = catalog_find(product_id);
    if (product == NULL) {
        return NULL;
    }

    output->product_id = product_id;
    output->quantity = quantity;
    output->total = product->price * quantity;
    repository_save(output);
    return output;
}
