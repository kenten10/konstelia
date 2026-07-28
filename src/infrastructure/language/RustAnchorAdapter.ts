import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";
import { parseRustDocument } from "./LezerStructuralParsers";

export class RustAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor() {
    super("Rust", parseRustDocument);
  }
}
