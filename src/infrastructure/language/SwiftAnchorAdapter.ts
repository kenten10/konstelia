import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";
import { parseSwiftDocument } from "./TextStructuralParsers";

export class SwiftAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor() {
    super("Swift", parseSwiftDocument);
  }
}
