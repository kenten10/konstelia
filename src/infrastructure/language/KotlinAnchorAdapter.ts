import { StructuralSemanticAnchorAdapter } from "./StructuralSemanticAnchorAdapter";
import { parseKotlinDocument } from "./TextStructuralParsers";

export class KotlinAnchorAdapter extends StructuralSemanticAnchorAdapter {
  public constructor() {
    super("Kotlin", parseKotlinDocument);
  }
}
